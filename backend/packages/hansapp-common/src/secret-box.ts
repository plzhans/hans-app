import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 되돌릴 수 있게 비밀을 잠그는 상자.
 *
 * **해시가 아니다.** 우리 서비스 키처럼 "맞는지만 대조" 하면 되는 값은 SHA-256 으로 충분하지만,
 * 남의 업체 키처럼 **우리가 그 값을 들고 업체를 불러야 하는** 비밀은 원문을 되찾아야 한다.
 *
 * AES-256-GCM 을 쓴다. 인증된 암호화(AEAD)라 암호화와 변조 탐지가 한 함수에 들어 있어,
 * HMAC 을 따로 붙이다 순서를 틀리는 자리가 없다. Node 내장이라 의존성도 늘지 않는다.
 *
 * ## 저장 형식
 *
 * ```
 * v1:{iv}:{tag}:{암호문}      각 조각 base64
 * ```
 *
 * 한 문자열로 붙인다 — 컬럼을 넷으로 펼쳐 봐야 DB 에서 볼 일은 "잠긴 값 하나" 뿐이다.
 *  - `iv`  암호화할 때마다 새로 뽑는 난수 12바이트. **비밀이 아니다** — 비밀번호 해시의
 *          salt 와 같은 몫이라 값 옆에 같이 둔다. 다만 **재사용하면 안 된다**:
 *          같은 키로 같은 iv 를 두 번 쓰면 두 암호문을 XOR 하는 것만으로 평문이 드러난다.
 *          그래서 상수·시간·카운터로 만들지 말고 반드시 randomBytes 로 뽑는다.
 *  - `tag` 인증 태그 16바이트. 복호화 때 대조해 값이 바뀌었으면 예외로 터뜨린다.
 *  - `v1`  어느 마스터 키로 잠갔나. **키를 갈 때 아직 옛 키인 값을 가른다** —
 *          없으면 교체하는 순간 기존 값을 하나도 못 연다.
 */

/** GCM 권장 nonce 길이(바이트). */
const IV_BYTES = 12;
/** AES-256 키 길이(바이트). */
const KEY_BYTES = 32;

/** 잠긴 문자열의 조각. */
interface Sealed {
  readonly version: number;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly ciphertext: Buffer;
}

/** 형식이 깨졌거나 마스터 키가 안 맞을 때. **원문 관련 정보는 담지 않는다.** */
export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/**
 * 마스터 키 꾸러미. 버전 하나가 곧 키 하나다.
 *
 * **교체는 새 버전을 추가하는 것이지 바꿔치기가 아니다.** 옛 키를 지우려면 그 버전으로
 * 잠긴 값이 하나도 안 남았는지 먼저 확인해야 한다 — 남은 채로 지우면 영영 못 연다.
 */
export interface SecretBoxKeys {
  /** 새로 잠글 때 쓸 버전. 반드시 keys 에 있어야 한다. */
  readonly current: number;
  /** 버전 → 32바이트 키. 복호화는 값에 적힌 버전으로 고른다. */
  readonly keys: ReadonlyMap<number, Buffer>;
}

/**
 * `{ v1: 'base64…', v2: 'base64…' }` 모양의 설정 섹션을 키 꾸러미로 만든다.
 *
 * 값은 **32바이트 난수를 base64 로** 넣는다. 사람이 외울 문자열이 아니므로 PBKDF2 같은
 * 유도 함수를 끼우지 않는다 — 그건 약한 비밀번호를 보강하는 장치이고, 여기 값은 이미
 * 완전 난수라 보강할 것이 없다. 만들 때는 이렇게 뽑는다:
 *
 * ```
 * node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * ```
 *
 * 빈 값은 **없는 것으로 본다** — yaml 의 `${...}` 자리표시자는 env 가 비어 있으면 빈 문자열이
 * 되므로, 그걸 키로 받으면 "설정 안 함" 이 형식 오류로 둔갑한다.
 *
 * @param section 설정 트리에서 꺼낸 값. 객체가 아니면 미설정으로 본다.
 * @param path 오류 메시지에 찍을 yaml 경로. 어느 줄을 고쳐야 하는지가 메시지에 있어야 한다.
 */
export function parseSecretBoxKeys(section: unknown, path: string): SecretBoxKeys | undefined {
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return undefined;
  }

  const keys = new Map<number, Buffer>();
  let highest = 0;

  for (const [name, raw] of Object.entries(section)) {
    if (typeof raw !== 'string' || raw === '') continue;

    const matched = /^v(\d+)$/.exec(name);
    if (!matched) {
      throw new SecretBoxError(`${path}.${name} is not a key version (expected "v1", "v2", …).`);
    }

    const version = Number(matched[1]);
    const key = Buffer.from(raw, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new SecretBoxError(
        `${path}.${name} must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
          `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    keys.set(version, key);
    highest = Math.max(highest, version);
  }

  // 하나도 없으면 기능이 꺼진 것이다 — 여기서 던지지 않고 부르는 쪽이 판단한다.
  if (keys.size === 0) return undefined;
  return { current: highest, keys };
}

/**
 * 잠근다. 결과는 `v1:iv:tag:암호문` 한 문자열이다.
 *
 * 같은 평문을 두 번 잠가도 **매번 다른 결과**가 나온다(iv 가 매번 새 난수라서).
 * 그래서 암호문끼리 비교해 "같은 값인가" 를 알 수 없다 — 그게 맞는 성질이다.
 */
export function seal(plain: string, keyring: SecretBoxKeys): string {
  const key = keyring.keys.get(keyring.current);
  if (!key) {
    throw new SecretBoxError(`No key for current version v${keyring.current}.`);
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    `v${keyring.current}`,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * 연다. 형식이 깨졌거나, 그 버전의 키가 없거나, 값이 변조됐으면 던진다.
 *
 * **예외 메시지에 원문 조각을 담지 않는다.** 이 값을 다루는 코드의 예외는 로그로 흘러가는데,
 * 거기 남의 업체 키가 섞이면 DB 를 암호화한 의미가 사라진다.
 */
export function open(sealed: string, keyring: SecretBoxKeys): string {
  const { version, iv, tag, ciphertext } = parse(sealed);

  const key = keyring.keys.get(version);
  if (!key) {
    throw new SecretBoxError(
      `Sealed with key v${version}, which is not configured. ` +
        `Do not remove a key version while values sealed with it still exist.`,
    );
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // final() 이 태그 대조 실패로 던진다. 값이 바뀌었거나 다른 키로 잠긴 것이다.
    throw new SecretBoxError(
      `Authentication failed for a value sealed with key v${version}. ` +
        `The stored value was modified, or the key does not match.`,
    );
  }
}

/** 잠긴 값이 어느 키 버전으로 만들어졌나. 키 교체 진행률을 셀 때 쓴다. */
export function sealedVersion(sealed: string): number {
  return parse(sealed).version;
}

/**
 * 표시용 뒤 4자. 사용자가 업체 콘솔의 키 목록과 대조할 유일한 단서다.
 * 4자보다 짧은 값은 통째로 가린다 — 짧다는 사실 자체가 힌트가 될 이유가 없다.
 */
export function suffixOf(plain: string): string {
  return plain.length > 4 ? plain.slice(-4) : '';
}

function parse(sealed: string): Sealed {
  const parts = sealed.split(':');
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new SecretBoxError('Malformed sealed value (expected "v<n>:<iv>:<tag>:<ciphertext>").');
  }

  const version = Number(parts[0].slice(1));
  if (!Number.isInteger(version) || version < 1) {
    throw new SecretBoxError('Malformed sealed value (bad key version).');
  }

  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  if (iv.length !== IV_BYTES) {
    throw new SecretBoxError('Malformed sealed value (bad iv length).');
  }
  if (tag.length !== 16) {
    throw new SecretBoxError('Malformed sealed value (bad tag length).');
  }

  return {
    version,
    iv,
    tag,
    ciphertext: Buffer.from(parts[3], 'base64'),
  };
}

/**
 * 길이가 같은 두 비밀을 상수 시간으로 비교한다.
 *
 * `===` 는 앞에서부터 보다 다른 글자를 만나면 멈춰서, 응답 시간 차이로 한 글자씩 맞춰진다.
 * 이 모듈에서 직접 쓰지는 않지만, 잠긴 값을 다루는 코드가 같이 필요로 하는 짝이라 여기 둔다.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // 길이가 다르면 timingSafeEqual 이 던진다. 길이 자체는 비밀이 아니라 먼저 걸러도 된다.
  return left.length === right.length && timingSafeEqual(left, right);
}
