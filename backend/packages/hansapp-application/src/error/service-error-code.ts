import { message, registerErrorCodes } from '@hansapp/common';

/**
 * 서비스 계층이 내보내는 오류 번호(16000~18000).
 *
 * **번호는 계층이 아니라 API 계약의 일부다.** 이 계층이 공개 API(hansapp-api)로 내보내는
 * 사유들이라 여기 있다 — 관리자 API 는 자기 표를 따로 들고 있어서 이 번호를 보지 않는다.
 * 대역 배정은 `@hansapp/common` 의 CommonErrorCode 주석에 있다.
 *
 * ── 새 번호를 다는 법 ─────────────────────────────────────────────────────────
 * 한 줄이면 된다. 문구를 안 적으면 **이름이 그대로 문구가 된다** — 급할 때 번호만 따고
 * 나중에 문장을 다듬어도 응답이 비지 않는다.
 *
 * ── 번호는 대외 계약이다 ──────────────────────────────────────────────────────
 * 한 번 내보낸 번호는 뜻을 바꾸지도, 다른 사유에 다시 쓰지도 않는다 — 사유가 달라지면
 * 새 번호를 딴다. **쓰지 않게 된 번호도 지우지 않고 비워 둔다**(재사용 금지).
 *
 * 반대로 **문구는 바뀔 수 있다.** 그래서 부르는 쪽은 문장이 아니라 번호로 분기해야 한다.
 */
export class ServiceErrorCode {
  // ── 의료 ─────────────────────────────────────────────────────────────────────
  @message('Hospital not found.')
  static readonly HOSPITAL_NOT_FOUND = 16000;
  /** 조회 조건 조합이 성립하지 않는다(거리순인데 기준 좌표가 없는 등). */
  @message('The query conditions are not valid.')
  static readonly HOSPITAL_QUERY_INVALID = 16001;
  @message('Hospital search is temporarily unavailable.')
  static readonly HEALTHCARE_SEARCH_UNAVAILABLE = 16002;
  @message('The question could not be processed.')
  static readonly AI_SEARCH_QUERY_INVALID = 16003;
  /** 앱 예산이나 개인 잔액이 찼다. 언제 풀리는지는 던지는 쪽이 문장으로 덮어 준다. */
  @message('AI search is not available.')
  static readonly AI_SEARCH_QUOTA_EXCEEDED = 16004;
  /** 허용 목록에 없는 모델을 지정했다. */
  @message('The requested model is not allowed.')
  static readonly AI_SEARCH_MODEL_NOT_ALLOWED = 16005;
  /** LLM 설정(키·엔드포인트)이 빠졌다. 사람이 고쳐야 풀린다 — 기다려도 안 된다. */
  @message('AI search is not configured.')
  static readonly AI_SEARCH_NOT_CONFIGURED = 16006;
  @message('AI provider did not respond in time.')
  static readonly AI_SEARCH_PROVIDER_TIMEOUT = 16007;
  @message('AI provider rate limit exceeded.')
  static readonly AI_SEARCH_PROVIDER_RATE_LIMITED = 16008;
  @message('AI search is not available.')
  static readonly AI_SEARCH_UNAVAILABLE = 16009;

  // ── 지역·주소·사업자 ─────────────────────────────────────────────────────────
  @message('No region found for the given coordinates.')
  static readonly REGION_NOT_FOUND = 17000;
  @message('Invalid search keyword.')
  static readonly ADDRESS_QUERY_INVALID = 17001;
  @message('The address search service is temporarily unavailable.')
  static readonly ADDRESS_PROVIDER_UNAVAILABLE = 17002;
  @message('Invalid business lookup request.')
  static readonly BUSINESS_QUERY_INVALID = 17003;
  @message('The NTS business registration service is temporarily unavailable.')
  static readonly BUSINESS_PROVIDER_UNAVAILABLE = 17004;

  // ── 커뮤니티 ─────────────────────────────────────────────────────────────────
  @message('Board not found.')
  static readonly BOARD_NOT_FOUND = 18000;
  @message('Post not found.')
  static readonly BOARD_POST_NOT_FOUND = 18001;
}

// **클래스 바로 밑에서 등록한다.** 자동화할 수 없는 이유는 registerErrorCodes 주석에 있다.
registerErrorCodes('ServiceErrorCode', ServiceErrorCode);
