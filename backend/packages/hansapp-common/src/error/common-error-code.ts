import { message, registerErrorCodes } from './error-code-registry';

/**
 * 계층을 가릴 수 없는 **공통 오류 번호**(10000대).
 *
 * **거의 전역 필터 전용이다.** 응용 계층이 안 던진 오류가 필터까지 올라올 때(ValidationPipe 가
 * 거른 입력값, 프레임워크·라이브러리가 던진 것, 아직 이관 안 된 계층의 Nest 예외) 상태 코드만
 * 보고 채우는 값이다. `new BadRequestError()` 처럼 번호 없이 던졌을 때의 기본값이기도 하다.
 *
 * 여기 있는 것은 도메인 사유를 붙일 수 없는 자리에서만 쓴다 — 프레임워크가 던진 것,
 * ValidationPipe 가 거른 것, 전역 필터가 상태 코드만 보고 채우는 fallback 이 그렇다.
 * **붙일 수 있으면 그 계층의 표에 도메인 번호를 딴다.**
 *
 * ── 도메인 번호는 여기 없다 ───────────────────────────────────────────────────
 * 번호는 계층의 소유물이 아니라 **API 계약의 일부다.** 그래서 어느 API 로 나가느냐로 가른다.
 *
 *   10000  공통 (여기)                        common — CommonErrorCode
 *   11000~15000  인증·소셜·OAuth·사용자·앱     auth-application — AuthErrorCode
 *   16000~18000  의료·지역·주소·사업자·커뮤니티  application — ServiceErrorCode
 *   20000~       관리자                        admin-application — AdminErrorCode(예정)
 *
 * 공개 API(hansapp-api)와 관리자 API(hansapp-admin-api)는 소비자가 달라 계약이 둘이다.
 * 한 표에 몰아 두면 관리자 계층이 공개 API 번호까지 들고 다니게 된다.
 *
 * ── 번호는 대외 계약이다 ──────────────────────────────────────────────────────
 * 클라이언트가 이 값으로 분기하고, 지원 문의는 이 값으로 들어온다. 그래서 한 번 내보낸
 * 번호는 뜻을 바꾸지도, 다른 사유에 다시 쓰지도 않는다 — 사유가 달라지면 새 번호를 딴다.
 * **쓰지 않게 된 번호도 지우지 않고 비워 둔다**(재사용 금지).
 *
 * **문구는 바뀔 수 있다.** 문장을 다듬는 것은 계약을 깨는 일이 아니다 — 그래서 부르는
 * 쪽은 문장이 아니라 번호로 분기해야 한다.
 *
 * ── 새 번호를 다는 법 ─────────────────────────────────────────────────────────
 * 한 줄이면 된다. 문구를 안 적으면 **이름이 그대로 문구가 된다** — 급할 때 번호만 따고
 * 나중에 문장을 다듬어도 응답이 비지 않는다.
 */
export class CommonErrorCode {
  /** 서버가 깨졌다. 클라이언트가 고칠 수 있는 것이 없다. */
  @message('The request could not be processed.')
  static readonly INTERNAL_ERROR = 10000;
  /** 요청 형식·값이 규격을 벗어났다(ValidationPipe 가 거른 것 포함). */
  @message('The request is not valid.')
  static readonly VALIDATION_FAILED = 10001;
  @message('The request is not valid.')
  static readonly BAD_REQUEST = 10002;
  @message('Authentication is required.')
  static readonly UNAUTHORIZED = 10003;
  @message('You do not have permission to do this.')
  static readonly FORBIDDEN = 10004;
  @message('Not found.')
  static readonly NOT_FOUND = 10005;
  @message('The request conflicts with the current state.')
  static readonly CONFLICT = 10006;
  @message('Too many requests. Please try again later.')
  static readonly RATE_LIMITED = 10007;
  /** 우리가 의존하는 바깥(공공데이터 API·검색엔진 등)이 지금 응답하지 않는다. */
  @message('The service is temporarily unavailable.')
  static readonly SERVICE_UNAVAILABLE = 10008;
  @message('The upstream service did not respond in time.')
  static readonly UPSTREAM_TIMEOUT = 10009;
  @message('Not implemented.')
  static readonly NOT_IMPLEMENTED = 10010;
}

// **클래스 바로 밑에서 등록한다.** 자동화할 수 없는 이유는 registerErrorCodes 주석에 있다.
registerErrorCodes('CommonErrorCode', CommonErrorCode);
