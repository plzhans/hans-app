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
 * 짧게 잡은 이유는 화면에서 바꾼 값이 재배포 없이 먹혀야 하기 때문이다. 반대로 0 으로 두면
 * 설정을 읽는 모든 호출이 DB 를 때린다 — 메일 한 통 보내는 데 일곱 번이다.
 */
const CACHE_TTL_MS = 5 * 60_000;

/**
 * 서비스 설정을 읽는다. **DB 가 유일한 원천이다.**
 *
 * **이름이 Cache 인 것은 원본이 여기가 아니기 때문이다.** 값은 DB(env_setting)에 있고
 * 이 클래스는 그 사본을 TTL 동안 들고 있을 뿐이다 — AccessCache·RegionCache 와 같은 결이다.
 *
 * **설정 파일로 폴백하지 않는다.** 관리자 계층의 같은 이름 클래스는 폴백을 갖는데, 그쪽은
 * 아직 파일에 남은 값(krdata·OAuth 등)을 화면에 "설정 파일" 로 보여 주고 DB 로 옮겨야 해서다.
 * 업무 쪽은 그 과정이 끝난 값만 읽으므로 두 곳을 볼 이유가 없다 — 둘 다 지원하면 `.env` 의
 * 주석 한 줄이 풀리는 것만으로 DB 값이 조용히 무시된다.
 *
 * 그래서 **ConfigSource 를 아예 받지 않는다.** 폴백이 실수로 되살아날 자리 자체를 없앤다.
 *
 * [실패 방향]
 * 갱신에 실패하면 **직전 값을 그대로 쓴다.** DB 가 순간 흔들릴 때마다 메일 설정이
 * 사라져 발송이 멎는 편이 더 나쁘다.
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
   * 문자열 설정.
   *
   * **`null` 은 "설정 안 됨", `''` 는 "빈 값으로 설정함" 이다.** 저장소가 지울 때 행을
   * 없애고 빈 문자열로 덮지 않는 것이 이 구분을 위해서다. 기본값을 쓸지는 부르는 쪽이 정한다.
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

  /** 저장 직후 캐시를 버린다. */
  invalidate(): void {
    this.expiresAt = 0;
  }

  private async getStored(key: string): Promise<string | undefined> {
    return (await this.load()).get(key);
  }

  private async load(): Promise<Map<string, string>> {
    if (this.values && Date.now() < this.expiresAt) {
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
          **어떻게 저장했는지는 행이 기억한다.** 카탈로그를 보고 판단하면 분류를 바꾸는
          순간 기존 행을 잘못 읽는다(암호문을 평문으로 쓰거나 그 반대).
        */
        if (!row.encrypted) {
          next.set(row.key, row.value);
          continue;
        }
        if (!this.keyring) {
          this.logger.error(
            `${row.key}: appSecretEncryption 키가 없어 복호화하지 못했다.`,
          );
          continue;
        }
        next.set(row.key, open(row.value, this.keyring));
      }
      this.values = next;
      this.expiresAt = Date.now() + CACHE_TTL_MS;
    } catch (error) {
      // 직전 값을 그대로 쓴다. 한 번도 못 읽었으면 비어 있는 채로 둔다.
      this.logger.error(
        `설정을 읽지 못했다. 직전 값을 유지한다: ${String(error)}`,
      );
      this.expiresAt = Date.now() + 10_000;
    }
  }
}
