import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  open,
  SETTING_KEYRING,
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
 * 서비스 설정을 읽는다. **DB 가 유일한 원천이다.**
 *
 * **이름이 Cache 인 것은 원본이 여기가 아니기 때문이다.** 값은 DB(env_setting)에 있고
 * 이 클래스는 그 사본을 TTL 동안 들고 있을 뿐이다 — AccessCache·RegionCache 와 같은 결이다.
 *
 * **설정 파일로 폴백하지 않는다.** 이관 중에는 폴백이 다리 역할을 했지만, 카탈로그의 모든 값이
 * DB 로 넘어간 지금은 두 곳을 볼 이유가 없다 — 남겨 두면 `.env` 의 주석 한 줄이 풀리는 것만으로
 * 화면이 파일 값을 다시 집는다. **ConfigSource 를 아예 받지 않아** 되살아날 자리를 없앤다.
 *
 * [실패 방향]
 * 갱신에 실패하면 **직전 값을 그대로 쓴다.** DB 가 순간 흔들릴 때마다 메일 설정이
 * 사라져 발송이 멎는 편이 더 나쁘다. 한 번도 못 읽었으면 설정 파일 값만 쓴다.
 */
@Injectable()
export class SettingCache implements SettingReader {
  private readonly logger = new Logger(SettingCache.name);

  private values: Map<string, string> | undefined;
  private expiresAt = 0;
  /** 진행 중인 갱신. 동시 호출이 DB 를 N번 때리지 않게 묶는다. */
  private refreshing: Promise<void> | undefined;

  constructor(
    private readonly repository: SettingReadRepository,
    @Inject(SETTING_KEYRING)
    private readonly keyring: SecretBoxKeys | undefined,
  ) {}

  /**
   * 문자열 설정. DB → 설정 파일 순.
   *
   * **`null` 은 "어디에도 없음", `''` 는 "빈 값으로 설정함" 이다.** 화면이 "미설정" 과
   * "빈 값" 을 갈라 보여 주려면 이 구분이 필요하다.
   */
  async getString(key: string): Promise<string | null> {
    return (await this.getStored(key)) ?? null;
  }

  /** 설정이 없거나 숫자로 못 읽으면 fallback. */
  async getNumber(key: string, fallback: number): Promise<number> {
    const stored = await this.getStored(key);
    if (stored === undefined) return fallback;
    const n = Number(stored);
    // 빈 문자열은 Number('') === 0 이라 그냥 두면 0 이 된다. 설정으로는 뜻이 없는 값이다.
    return stored !== '' && Number.isFinite(n) ? n : fallback;
  }

  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const stored = await this.getStored(key);
    if (stored === undefined) return fallback;
    return stored === 'true' || stored === '1';
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
