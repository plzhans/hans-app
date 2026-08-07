import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  open,
  SETTING_KEYRING,
  type ConfigSource,
  type SecretBoxKeys,
  type SettingReader,
} from '@hansapp/common';
import { SettingReadRepository } from '@hansapp/data';

/**
 * 캐시 수명. **5분.**
 *
 * 짧게 잡은 이유는 화면에서 바꾼 값이 재배포 없이 먹혀야 하기 때문이다 — 부팅 때 한 번
 * 올리고 끝내면 "DB 에 넣었는데 그대로다" 가 되고, 그때 할 수 있는 게 재시작뿐이다.
 * (env_swagger_allowed_ip 캐시와 같은 이유이고, 그쪽은 1분이다.)
 *
 * 반대로 0 으로 두면 설정을 읽는 모든 호출이 DB 를 때린다 — 메일 한 통 보내는 데
 * 일곱 번이다.
 */
const CACHE_TTL_MS = 5 * 60_000;

/**
 * 서비스 설정을 읽는다. **DB 가 먼저, 없으면 설정 파일이다.**
 *
 * 이 폴백이 이 클래스의 핵심이다. DB 로 옮기는 일이 한 번에 끝나지 않기 때문이다 —
 * 어떤 값은 이미 화면에서 넣었고 어떤 값은 아직 yaml 에만 있는 기간이 반드시 생긴다.
 * 그동안 부르는 쪽은 이 서비스 하나만 보면 되고, 값이 어디서 왔는지 몰라도 된다.
 *
 * [실패 방향]
 * 갱신에 실패하면 **직전 값을 그대로 쓴다.** DB 가 순간 흔들릴 때마다 메일 설정이
 * 사라져 발송이 멎는 편이 더 나쁘다. 한 번도 못 읽었으면 설정 파일 값만 쓴다.
 */
@Injectable()
export class SettingService implements SettingReader {
  private readonly logger = new Logger(SettingService.name);

  private values: Map<string, string> | undefined;
  private expiresAt = 0;
  /** 진행 중인 갱신. 동시 호출이 DB 를 N번 때리지 않게 묶는다. */
  private refreshing: Promise<void> | undefined;

  constructor(
    private readonly repository: SettingReadRepository,
    @Inject(SETTING_KEYRING)
    private readonly keyring: SecretBoxKeys | undefined,
    private readonly config: ConfigSource,
  ) {}

  /** 문자열 설정. DB → 설정 파일 순. 둘 다 없으면 빈 문자열. */
  async getString(key: string): Promise<string> {
    const stored = await this.getStored(key);
    return stored ?? this.config.getStringOrDefault(key);
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const stored = await this.getStored(key);
    if (stored === undefined)
      return this.config.getNumberOrDefault(key, fallback);
    const n = Number(stored);
    return Number.isFinite(n) ? n : fallback;
  }

  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const stored = await this.getStored(key);
    if (stored === undefined)
      return this.config.getBoolOrDefault(key, fallback);
    return stored === 'true' || stored === '1';
  }

  /**
   * 여러 키를 한 번에. 설정 뭉치(메일 한 벌)를 읽을 때 캐시를 한 번만 확인한다.
   * 값이 없는 키는 결과에서 빠진다 — 부르는 쪽이 폴백을 정한다.
   */
  async getMany(keys: readonly string[]): Promise<Map<string, string>> {
    const stored = await this.load();
    const result = new Map<string, string>();
    for (const key of keys) {
      const value = stored.get(key) ?? this.config.getStringOrDefault(key);
      if (value) result.set(key, value);
    }
    return result;
  }

  /** DB 에 값이 들어 있는 키 목록. 관리 화면이 "어디서 온 값인가" 를 표시하는 데 쓴다. */
  async storedKeys(): Promise<Set<string>> {
    return new Set((await this.load()).keys());
  }

  /** 저장 직후 캐시를 버린다. 방금 바꾼 값이 5분간 안 먹으면 화면이 거짓말을 한다. */
  invalidate(): void {
    this.expiresAt = 0;
  }

  /** DB 에 담긴 값. 없으면 undefined(설정 파일로 폴백하라는 뜻). */
  private async getStored(key: string): Promise<string | undefined> {
    return (await this.load()).get(key);
  }

  private async load(): Promise<Map<string, string>> {
    if (this.values !== undefined && Date.now() < this.expiresAt) {
      return this.values;
    }
    await (this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = undefined;
    }));
    return this.values ?? new Map();
  }

  private async refresh(): Promise<void> {
    try {
      const rows = await this.repository.findAll();
      const next = new Map<string, string>();

      for (const row of rows) {
        /*
          **행에 적힌 대로 읽는다.** 카탈로그를 다시 보고 "이 키는 secret 이니 열자" 로
          판단하면, 누가 분류를 바꾼 순간 이미 저장된 값을 잘못 읽는다.
        */
        if (!row.encrypted) {
          next.set(row.key, row.value);
          continue;
        }
        if (!this.keyring) {
          // 잠긴 값인데 열 키가 없다. 이 키만 설정 파일로 폴백된다.
          this.logger.error(
            `appSecretEncryption 키링이 없어 열 수 없다(설정 파일 값으로 폴백): ${row.key}`,
          );
          continue;
        }
        try {
          next.set(row.key, open(row.value, this.keyring));
        } catch (error) {
          /*
            한 줄이 안 열려도 나머지는 살린다. 키를 교체하다 옛 버전으로 잠긴 값이 남았을 때
            설정 전체가 죽으면 손 쓸 방법이 없다 — 그 키만 설정 파일로 폴백된다.
          */
          this.logger.error(
            `설정 값을 열지 못했다(설정 파일 값으로 폴백): ${row.key} — ${String(error)}`,
          );
        }
      }
      this.values = next;
      this.expiresAt = Date.now() + CACHE_TTL_MS;
    } catch (error) {
      // 직전 값을 그대로 둔다. 다음 호출에서 다시 시도한다.
      this.logger.warn(`설정을 다시 읽지 못했다: ${String(error)}`);
    }
  }
}
