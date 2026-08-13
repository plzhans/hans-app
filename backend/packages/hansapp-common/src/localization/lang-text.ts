/**
 * 다국어 텍스트(LangText).
 *
 * 이 백엔드는 다국어 데이터를 **생산/제공**하는 쪽이라, 특정 언어를 고르거나
 * 폴백하는 소비 로직은 두지 않는다(그건 프론트의 몫). 값을 언어별 맵으로 담고,
 * 직렬화 시 flat 한 언어맵(`{ ko: "...", en: "..." }`)으로 출력한다.
 *
 * 지원 언어를 미리 고정하지 않는다 — 필요한 언어만 넣으면 된다.
 *
 * @example
 *   const name = LangText.build('사과');           // { ko: "사과" }
 *   name.set('apple', 'en');                        // { ko: "사과", en: "apple" }
 *   JSON.stringify(name);                           // {"ko":"사과","en":"apple"}
 */

/** 언어 코드. 지원 언어를 미리 고정하지 않으므로 열린 문자열이다. */
export type Lang = string;

/** 직렬화된 다국어 값의 형태(언어 키 → 값). */
export type LangTextMap<T = string> = Record<Lang, T>;

/** 값을 만들 때 쓰는 기본 언어. 단일값 축약(`build(value)`)이 감길 키. */
export const DEFAULT_LANG: Lang = 'ko';

export class LangText<T = string> {
  private readonly values: LangTextMap<T> = {};
  private defaultLang: Lang;

  private constructor(defaultLang: Lang) {
    this.defaultLang = defaultLang;
  }

  /**
   * 단일값으로 생성한다. `lang` 생략 시 {@link DEFAULT_LANG}(ko) 키에 담는다.
   *
   * @example LangText.build('사과')        → { ko: "사과" }
   * @example LangText.build('apple', 'en') → { en: "apple" }
   */
  static build<T>(value: T, lang: Lang = DEFAULT_LANG): LangText<T> {
    const text = new LangText<T>(lang);
    text.values[lang] = value;
    return text;
  }

  /**
   * 평범한 언어맵 객체(역직렬화/DB 결과)로부터 인스턴스를 복원한다.
   *
   * @example LangText.from({ ko: "사과", en: "apple" })
   */
  static from<T>(map: LangTextMap<T>, defaultLang: Lang = DEFAULT_LANG): LangText<T> {
    const text = new LangText<T>(defaultLang);
    Object.assign(text.values, map);
    return text;
  }

  /**
   * 값을 설정한다. `lang` 생략 시 기본 언어(생성 시 언어)를 덮어쓴다.
   * 이미 있는 언어면 덮어쓴다.
   *
   * @example a.set('바나나')        // 기본 언어 값 교체
   * @example a.set('apple', 'en')   // en 추가/교체
   */
  set(value: T, lang: Lang = this.defaultLang): this {
    this.values[lang] = value;
    return this;
  }

  /** 값을 조회한다. `lang` 생략 시 기본 언어. 없으면 undefined. */
  get(lang: Lang = this.defaultLang): T | undefined {
    return this.values[lang];
  }

  /** 해당 언어 값이 있는지. */
  has(lang: Lang): boolean {
    return lang in this.values;
  }

  /**
   * 한 언어 값으로 접는다(소비/응답용). 우선순위:
   * 요청 언어 → 기본 언어 → 아무 언어. 아무것도 없으면 undefined.
   *
   * @example a.resolve('en')  // en 없으면 기본 언어로 폴백
   */
  resolve(lang?: Lang): T | undefined {
    if (lang !== undefined && lang in this.values) return this.values[lang];
    if (this.defaultLang in this.values) return this.values[this.defaultLang];
    const first = Object.keys(this.values)[0];
    return first === undefined ? undefined : this.values[first];
  }

  /** 담긴 언어 코드 목록. */
  langs(): Lang[] {
    return Object.keys(this.values);
  }

  /**
   * 직렬화 형태 — flat 언어맵. `JSON.stringify` 가 이 값을 사용하므로
   * 메서드/내부 필드는 응답에 실리지 않는다.
   */
  toJSON(): LangTextMap<T> {
    return this.values;
  }
}

/**
 * 마스터 타입에서 flat(단일 언어) 응답 타입을 파생한다.
 * 모든 `LangText<U>` 자리를 `U` 로 접고, 나머지 구조는 그대로 둔다.
 *
 * @example Localized<{ name: LangText; lat: number }> → { name: string; lat: number }
 */
export type Localized<T> =
  T extends LangText<infer U>
    ? Localized<U>
    : T extends readonly (infer E)[]
      ? Localized<E>[]
      : T extends object
        ? { [K in keyof T]: Localized<T[K]> }
        : T;

/**
 * 마스터 객체를 재귀적으로 순회하며 {@link LangText} 인스턴스를 만나면 해당
 * 언어 값으로 접는다(소비/응답용). `lang` 생략 시 각 값의 기본 언어를 쓴다.
 *
 * 접기는 값이 아직 `LangText` **인스턴스**일 때 동작한다. 캐시 등에서 plain
 * 언어맵으로 복원했다면 {@link LangText.from} 으로 재수화(rehydrate) 후 호출한다.
 *
 * @example localize(hospital, 'en')  // { name: "Miso Clinic", ... }
 */
export function localize<T>(node: T, lang?: Lang): Localized<T> {
  if (node instanceof LangText) {
    return localize(node.resolve(lang), lang) as Localized<T>;
  }
  if (Array.isArray(node)) {
    // Array.isArray 는 제네릭 T 를 any[] 로 좁힌다. 그대로 두면 원소가 any 가 되어
    // 반환값까지 any 로 새어 나가므로 unknown[] 으로 받는다.
    // (아래 as 캐스팅은 남는다. 재귀 조건부 타입이라 컴파일러가 결과 타입을 증명하지 못한다.)
    return (node as unknown[]).map((item) => localize(item, lang)) as Localized<T>;
  }
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, localize(value, lang)]),
    ) as Localized<T>;
  }
  return node as Localized<T>;
}
