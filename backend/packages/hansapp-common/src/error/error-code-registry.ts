/**
 * 오류 번호표를 만드는 장치. **표 자체는 여기 없다** — 번호는 API 계약이고, 계약은 그 API 를
 * 내보내는 계층이 들고 있어야 한다(공개 API 는 application·auth-application, 관리자 API 는
 * admin-application). 여기 있는 것은 그 표들이 공통으로 쓰는 도구와, 계층을 가릴 수 없는
 * 공통 번호뿐이다.
 */

/** 데코레이터가 이름별로 담아 둔다. 값(번호)은 데코레이터가 볼 수 없다. */
const messageByName = new Map<string, string>();

/** 번호 → 문구. 등록된 표들을 합친 것이다. */
const messageByCode = new Map<number, string>();

/** 번호 → 누가 들고 있나(`AuthErrorCode.AUTH_TOKEN_INVALID`). 중복을 알릴 때 쓴다. */
const ownerByCode = new Map<number, string>();

/**
 * 오류 번호에 기본 문구를 달아 둔다.
 *
 * **두 데코레이터 규격을 모두 견딘다.**
 *   legacy(experimentalDecorators): (target, propertyKey: string)
 *   표준(TC39):                     (value, context: { name })
 *
 * 이 패키지는 표준으로 빌드되는데, 앱들은 `experimentalDecorators: true` 로 **이 소스를
 * 직접** 컴파일한다(customConditions: src). 개발 모드의 SWC 도 legacy 로 돈다. 한쪽 규격으로만
 * 쓰면 다른 쪽에서 컴파일이 깨지거나, 더 나쁘게는 컴파일은 되고 이름만 조용히 못 읽는다.
 *
 * **초기화 함수를 반환하지 않는다(void).** 반환하면 TS 가 번호를 `number` 로 넓혀 버린다.
 */
export function message(text: string) {
  return function (_first: unknown, second: unknown): void {
    const name = typeof second === 'string' ? second : String((second as { name: unknown }).name);
    /*
      **같은 이름을 두 번 쓰면 죽인다.** 이름은 표를 넘나들며 전역으로 유일해야 한다 —
      아래 등록이 이름으로 문구를 찾기 때문에, 겹치면 한쪽이 다른 쪽 문구를 물고 나간다.
    */
    const already = messageByName.get(name);
    if (already !== undefined && already !== text) {
      throw new Error(`Duplicate error code name: ${name}`);
    }
    messageByName.set(name, text);
  };
}

/**
 * 번호표를 등록한다. **클래스 바로 밑에서 부른다.**
 *
 * 클래스 데코레이터로 자동화할 수 없다 — 표준(TC39) 규격에서는 클래스 데코레이터가 static
 * 필드 초기화보다 **먼저** 돌아서 번호를 하나도 못 본다(legacy 는 뒤에 돈다). 두 규격에서
 * 같게 동작해야 하므로 호출을 손으로 둔다.
 *
 * 빠뜨리면 그 표의 번호들이 문구 대신 숫자로 나가고, 중복 검사도 건너뛴다. 그래서 표를
 * 선언하는 파일 안에서, 클래스 바로 아래에 붙여 둔다 — 떨어뜨리지 않는 것이 유일한 방어다.
 *
 * @param owner 표 이름(`AuthErrorCode`). 중복을 알릴 때 어느 표와 부딪혔는지 보여준다.
 * @param codes 번호표 클래스.
 */
export function registerErrorCodes(owner: string, codes: object): void {
  for (const [name, value] of Object.entries(codes)) {
    // 번호 아닌 것이 섞여 들어오면 건너뛴다(표에는 번호만 두기로 했다).
    if (typeof value !== 'number') continue;

    /*
      **번호가 겹치면 부팅에서 죽인다.** 표를 계층별로 나눈 뒤에도 번호는 겹치지 않게 둔다 —
      두 API 는 계약이 달라 겹쳐도 사고는 안 나지만, 로그에 15000 하나만 찍혔을 때 어느
      API 얘기인지 되짚지 않으려면 대역이 갈려 있어야 한다.
    */
    const holder = ownerByCode.get(value);
    if (holder !== undefined) {
      throw new Error(`Duplicate error code ${value}: ${holder} vs ${owner}.${name}`);
    }
    ownerByCode.set(value, `${owner}.${name}`);

    // 문구를 안 달았으면 이름이 대신 나간다 — 응답이 비는 것보다 낫다.
    messageByCode.set(value, messageByName.get(name) ?? name);
  }
}

/**
 * 오류 번호.
 *
 * **유니온이 아니라 그냥 number 다.** 표가 계층별로 흩어져 있어 어느 한 곳도 전부를 볼 수
 * 없기 때문이다(common 은 제일 아래라 위 패키지의 표를 모른다). 그래서 "표에 없는 숫자"
 * 를 컴파일이 막아 주지는 못한다 — 대신 던지는 자리에서 항상 표의 상수를 집으므로
 * (`AuthErrorCode.AUTH_TOKEN_INVALID`) 날숫자를 적을 일 자체가 없다.
 */
export type AppErrorCode = number;

/** 번호의 기본 문구. 던지는 쪽이 문장을 생략하면 이것이 나간다. */
export function errorMessageOf(code: AppErrorCode): string {
  return messageByCode.get(code) ?? String(code);
}

/** 번호를 들고 있는 표와 상수 이름(`AuthErrorCode.AUTH_TOKEN_INVALID`). 로그·문서가 쓴다. */
export function errorCodeOwner(code: AppErrorCode): string | undefined {
  return ownerByCode.get(code);
}

/** 지금까지 등록된 번호 전부. **로딩된 표만 보인다** — 문서를 뽑을 땐 표를 다 import 해야 한다. */
export function registeredErrorCodes(): AppErrorCode[] {
  return [...ownerByCode.keys()];
}
