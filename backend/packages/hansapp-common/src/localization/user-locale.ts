/**
 * 회원·관리자의 지역 설정(국가·언어·타임존) 정규화.
 *
 * **클라이언트가 보내는 값을 그대로 믿지 않는다.** 브라우저에서 뽑아 오는 값이라
 * 손댈 수 있고, 그대로 넣으면 지원하지 않는 언어나 존재하지 않는 타임존이 DB 에 남는다.
 * 여기서 한 번 좁힌 뒤에 저장한다 — 못 알아들은 값은 버리고 null 로 둔다.
 *
 * 공개 인증과 admin 이 같은 규칙을 써야 해서 common 에 둔다.
 */

import { resolveLang, SUPPORTED_LANGS, type SupportedLang } from './accept-language';
import { countryOfTimeZone, isValidTimeZone } from './time-zone';

/** 브라우저에서 뽑아 보내는 원본. 둘 다 없을 수 있다(구형 브라우저·비브라우저 클라이언트). */
export interface ClientLocaleInput {
  /** `navigator.language`. `ko-KR` 처럼 지역 서브태그가 붙어 온다. */
  language?: string | null;
  /** `Intl.DateTimeFormat().resolvedOptions().timeZone`. IANA 존 ID. */
  timeZone?: string | null;
}

/** 저장할 모양. 모르는 값은 null 이다 — 기본값으로 메우지 않는다. */
export interface ResolvedUserLocale {
  /** ISO 3166-1 alpha-2 대문자. 타임존에서 되짚는다. */
  countryCode: string | null;
  language: SupportedLang | null;
  /** IANA 존 ID */
  timeZone: string | null;
}

/** 지원 언어인지 본다. 이미 좁혀진 값(DB 에서 읽은 값)을 검사할 때 쓴다. */
export function isSupportedLang(value: string): value is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(value);
}

/**
 * 브라우저가 준 값을 저장 가능한 모양으로 좁힌다.
 *
 * 언어는 `resolveLang` 에 맡긴다 — `ko-KR` 도 `ja,en;q=0.9` 도 같은 규칙으로 읽는다.
 * **다만 안 보냈을 때는 null 로 둔다.** `resolveLang` 은 못 고르면 한국어를 주는데,
 * 그건 "이번 응답을 무슨 언어로 낼까" 의 답이지 "이 사람의 언어가 한국어다" 는 아니다.
 *
 * 국가는 타임존에서만 되짚는다. `navigator.language` 의 지역 서브태그(`ko-KR` 의 KR)를
 * 쓰지 않는 것은 그게 위치가 아니라 **언어 설정**이기 때문이다 — 해외에서 한국어를 쓰는
 * 사람이 전부 KR 로 잡힌다.
 */
export function resolveUserLocale(input: ClientLocaleInput): ResolvedUserLocale {
  const timeZone = input.timeZone && isValidTimeZone(input.timeZone) ? input.timeZone : null;

  return {
    countryCode: timeZone ? countryOfTimeZone(timeZone) : null,
    language: input.language ? resolveLang(input.language) : null,
    timeZone,
  };
}

/**
 * 이용자가 화면에서 고르는 값의 검증. 가입 때와 달리 **잘못된 값은 조용히 버리지 않는다** —
 * 목록에서 고른 값이라 틀렸다면 화면이 잘못된 것이고, 그건 드러나야 한다.
 * 통과하면 저장할 값을, 아니면 null 을 준다.
 */
export function normalizeLanguageChoice(value: string): SupportedLang | null {
  const lower = value.trim().toLowerCase();
  return isSupportedLang(lower) ? lower : null;
}

/** 이용자가 고른 타임존의 검증. 런타임이 아는 존만 통과시킨다. */
export function normalizeTimeZoneChoice(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && isValidTimeZone(trimmed) ? trimmed : null;
}
