import { ApiError } from '@/shared/api/client';
import { ErrorCode } from '@hansapp/api-error';

/**
 * 번호별 한국어 안내. 여기 없는 번호는 아래 status 단계로 떨어진다.
 *
 * **운영자가 할 일이 갈리는 것만 옮긴다.** 관리자 화면은 개발·운영하는 사람이 보는 곳이라
 * 영어 원문이 그대로 보여도 못 읽지는 않는다 — 전부 옮기면 서버 문구가 바뀔 때마다 여기도
 * 따라 고쳐야 하고, 그럴 값어치가 없는 문장이 대부분이다.
 *
 * **사유만 적지 않고 다음에 할 일까지 적는다.** "지울 수 없습니다" 로 끝나면 운영자는
 * 무엇을 먼저 해야 하는지 모른 채 화면을 다시 누른다.
 */
const MESSAGES: Record<number, string> = {
  // ── 로그인·세션 ──────────────────────────────────────────────────────────────
  [ErrorCode.ADMIN_INVALID_CREDENTIALS]: '이메일 또는 비밀번호가 올바르지 않습니다.',
  [ErrorCode.ADMIN_ACCOUNT_INACTIVE]:
    '사용할 수 없는 계정입니다. 다른 관리자에게 활성화를 요청해 주세요.',
  [ErrorCode.ADMIN_CURRENT_PASSWORD_MISMATCH]: '현재 비밀번호가 올바르지 않습니다.',
  [ErrorCode.ADMIN_PASSWORD_UNCHANGED]: '새 비밀번호는 지금 쓰는 것과 달라야 합니다.',
  [ErrorCode.ADMIN_TOKEN_INVALID]: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
  [ErrorCode.ADMIN_SESSION_INVALID]:
    '이 기기의 로그인이 해제되었습니다. 다시 로그인해 주세요.',
  [ErrorCode.ADMIN_SESSION_EXPIRED]: '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.',
  [ErrorCode.ADMIN_PASSWORD_CHANGE_REQUIRED]:
    '비밀번호를 먼저 변경해야 합니다. 변경 화면에서 새 비밀번호를 설정해 주세요.',
  /*
    **서버 설정 문제라 운영자가 화면에서 고칠 수 없다.** 그걸 알려 주지 않으면 값을 바꿔
    가며 계속 저장을 시도하게 된다.
  */
  [ErrorCode.ADMIN_SECRET_STORAGE_UNAVAILABLE]:
    '서버에 암호화 키(appSecretEncryption)가 없어 비밀값을 저장할 수 없습니다. 서버 설정을 확인해 주세요.',
  [ErrorCode.ADMIN_PASSWORD_RESET_LINK_INVALID]:
    '비밀번호 재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.',

  // ── 관리자 계정 ──────────────────────────────────────────────────────────────
  [ErrorCode.ADMIN_NOT_FOUND]: '관리자 계정을 찾을 수 없습니다.',
  [ErrorCode.ADMIN_EMAIL_INVALID]: '이메일 형식이 올바르지 않습니다.',
  [ErrorCode.ADMIN_EMAIL_ALREADY_REGISTERED]: '이미 등록된 이메일입니다.',
  [ErrorCode.ADMIN_ROLE_TOO_HIGH]: '자신보다 높은 등급은 다루거나 부여할 수 없습니다.',
  /*
    **되돌릴 사람이 없어지는 것을 막는 자리다.** 그래서 "왜 막았는지" 를 반드시 적는다 —
    이유를 모르면 권한 버그로 오해하고 다른 경로를 찾아 헤맨다.
  */
  [ErrorCode.ADMIN_LAST_SYSTEM_ADMIN]:
    '마지막 시스템 관리자입니다. 내리면 그 등급을 되돌릴 사람이 없어져 막았습니다.',
  [ErrorCode.ADMIN_LAST_ACCOUNT]:
    '마지막 관리자 계정입니다. 지우면 아무도 로그인할 수 없어 막았습니다.',
  [ErrorCode.ADMIN_SELF_DELETE]: '본인 계정은 삭제할 수 없습니다.',
  [ErrorCode.ADMIN_SELF_PASSWORD_FLOW]:
    '본인 비밀번호는 비밀번호 변경 화면에서 바꿔 주세요.',
  [ErrorCode.ADMIN_CACHE_PARTIALLY_CLEARED]:
    '처리했지만 캐시 일부가 지워지지 않았습니다. 그 기기가 잠시 더 접근될 수 있습니다.',

  // ── 관리자 소셜 로그인 ───────────────────────────────────────────────────────
  [ErrorCode.ADMIN_GOOGLE_SIGN_IN_FAILED]:
    '구글 로그인에 실패했습니다. 등록된 관리자 계정의 구글 이메일인지 확인해 주세요.',
  [ErrorCode.ADMIN_GOOGLE_NOT_CONFIGURED]:
    '구글 로그인이 설정되지 않았습니다. 설정에서 구글 자격증명을 등록해 주세요.',
  [ErrorCode.ADMIN_SOCIAL_FLOW_INVALID]:
    '로그인 진행 정보가 만료되었습니다. 처음부터 다시 시도해 주세요.',

  // ── 앱 심사 ──────────────────────────────────────────────────────────────────
  [ErrorCode.ADMIN_APP_STATUS_INVALID]:
    '지금 상태에서는 할 수 없는 처리입니다. 목록을 새로고침해 현재 상태를 확인해 주세요.',

  // ── 게시판 ───────────────────────────────────────────────────────────────────
  [ErrorCode.ADMIN_BOARD_NAME_IN_USE]: '이미 쓰이고 있는 게시판 이름입니다.',
  [ErrorCode.ADMIN_BOARD_NAME_INVALID]:
    '게시판 이름은 소문자·숫자·하이픈으로 2~50자여야 합니다.',
  [ErrorCode.ADMIN_BOARD_SECRET_NOT_ALLOWED]:
    '이 게시판은 비밀글을 받지 않습니다. 게시판 설정에서 먼저 켜 주세요.',

  // ── LLM 키·모델 ──────────────────────────────────────────────────────────────
  [ErrorCode.ADMIN_LLM_KEY_DEFAULT_LOCKED]:
    '기본 키입니다. 다른 키를 기본으로 지정한 뒤에 다시 시도해 주세요.',
  [ErrorCode.ADMIN_LLM_MODEL_DEFAULT_LOCKED]:
    '기본 모델입니다. 다른 모델을 기본으로 지정한 뒤에 다시 시도해 주세요.',
  /** 우리 설정이 아니라 저쪽 사정일 수 있어 "다시" 를 권한다. */
  [ErrorCode.ADMIN_LLM_PROVIDER_UNREACHABLE]:
    '업체에서 모델 목록을 받지 못했습니다. 키와 주소를 확인하고 잠시 뒤 다시 시도해 주세요.',

  // ── 설정·로그 ────────────────────────────────────────────────────────────────
  [ErrorCode.ADMIN_SETTING_READ_ONLY]: '읽기 전용 설정이라 바꿀 수 없습니다.',
  [ErrorCode.ADMIN_SETTING_VALUE_INVALID]: '이 설정에 넣을 수 없는 값입니다.',
  [ErrorCode.ADMIN_LOG_RANGE_REQUIRED]:
    '조회 기간(시작 시각)을 지정해 주세요. 전체를 훑으면 로그 표를 통째로 읽습니다.',

  // ── 회원 관리 ────────────────────────────────────────────────────────────────
  [ErrorCode.ADMIN_USER_NOT_FOUND]: '회원을 찾을 수 없습니다.',
  [ErrorCode.ADMIN_USER_CACHE_PARTIALLY_CLEARED]:
    '세션은 지웠지만 캐시 일부가 남았습니다. 그 기기가 잠시 더 접근될 수 있습니다.',
};

/**
 * 백엔드 오류를 화면에 보여줄 한 줄로 바꾼다.
 *
 * **좁은 것부터 본다** — errorCode(사유) → status(계열) → 서버 문구. status 를 먼저 가르면
 * 케이스마다 번호 검사를 또 넣게 되고 같은 문구가 여러 갈래에 복사된다.
 *
 * status 와 errorCode 는 정하는 것이 다르다. **status 는 동작**(재시도할까·다시 로그인할까),
 * **errorCode 는 문구**(사용자에게 뭐라고 말할까)다. 여기는 문구를 정하는 자리라 번호가 먼저다.
 *
 * 백엔드 예외 문구는 영어다(백엔드 규칙). 번호로 못 가린 것은 그대로 보여준다 —
 * 관리자 화면이라 영문이 보여도 무엇이 잘못됐는지는 읽힌다.
 */
export function errorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }

  const body = err.body as { errorCode?: number; message?: string | string[] } | undefined;

  // 1. 번호로 아는 문구
  const known = body?.errorCode !== undefined ? MESSAGES[body.errorCode] : undefined;
  if (known) return known;

  // 2. class-validator 는 필드마다 한 줄씩 배열로 준다. 합치면 어느 항목인지 잃는다.
  const msg = body?.message;
  if (Array.isArray(msg)) return msg.join('\n');

  // 3. 번호를 아직 안 옮긴 것들 — status 로 뭉뚱그려 안내한다.
  if (err.status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (err.status === 401) return '이메일 또는 비밀번호가 올바르지 않습니다.';

  // 4. 그래도 없으면 서버 문구 그대로. 감추는 것보다 낯선 문장이 낫다.
  if (typeof msg === 'string') return msg;
  return `${fallback} (HTTP ${err.status})`;
}
