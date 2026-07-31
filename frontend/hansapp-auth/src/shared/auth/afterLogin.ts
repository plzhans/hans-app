import { relayCodeIfNeeded } from '@/shared/api/auth';
import { isFirstPartyReturn } from '@/shared/auth/returnTo';

/** 로그인이 성립한 뒤 어디로 보낼지 정하는 데 필요한 값들(로그인 URL 의 쿼리 그대로). */
export interface AfterLoginParams {
  /** 외부 SSO 의 복귀 URL(redirect_uri). client_id 와 짝이다. */
  returnTo?: string;
  /** 외부 클라이언트의 공개 ID. 있으면 인가코드를 발급해 돌려보낸다. */
  clientId?: string;
  /** 그 앱이 만든 PKCE challenge. 우리는 전달만 한다. */
  codeChallenge?: string;
  /** 그 앱의 state. 해석하지 않고 그대로 돌려준다. */
  clientState?: string;
  /** 자사 앱의 복귀 URL(`?return=`). 쿠키 SSO 라 코드가 필요 없다. */
  appReturn?: string;
}

/**
 * 인증 화면에 들어온 요청이 **끝까지 갈 수 있는 요청인지** 미리 본다.
 *
 * 백엔드는 인가코드 발급에 PKCE challenge 를 무조건 요구한다. 그런데 프론트가 이걸 안 보면
 * 잘못된 요청에도 로그인 폼을 띄우고, 사용자가 비밀번호까지 다 입력한 **뒤에야** 실패한다.
 * 이미 로그인돼 있으면 더 나쁘다 — 조용히 /me 로 가버려서 보낸 앱은 영영 코드를 기다린다.
 * 어차피 실패할 요청이면 처음부터 거절하는 게 사용자에게도 그 앱 개발자에게도 낫다.
 *
 * @returns 문제가 있으면 사용자에게 보일 사유, 없으면 null.
 */
export function validateAfterLoginParams(p: AfterLoginParams): string | null {
  // 코드를 받을 곳 없이 client_id 만 오면 발급해도 보낼 데가 없다.
  if (p.clientId && !p.returnTo) {
    return 'redirect_uri 가 없습니다.';
  }
  // redirect_uri 가 있으면 인가코드 경로다 = PKCE 필수. challenge 는 **그 앱이** 만든다.
  if (p.returnTo && !p.codeChallenge) {
    return 'code_challenge 가 없습니다. (PKCE, S256)';
  }
  return null;
}

/**
 * **로그인이 끝난 뒤 갈 곳을 정한다.** 세 갈래이고 순서가 곧 우선순위다.
 *
 *   ① 외부 SSO(client_id)  인가코드를 실어 그 앱으로. 이걸 건너뛰면 그 앱은 코드를 못 받는다
 *   ② 자사 return          쿠키를 공유하므로 코드 없이 바로 보낸다
 *   ③ 둘 다 없음           인증웹 자체 로그인 → 내 정보
 *
 * **로그인 직후와 "이미 로그인된 채로 로그인 페이지에 온 경우"가 같은 규칙이어야 한다.**
 * 후자를 `/me` 로만 보내면, 포털이 `?return=` 을 달아 보냈는데 그 값을 잃어버려 사용자가
 * 원래 자리로 못 돌아간다. 외부 SSO 면 더 나쁘다 — 그 앱은 영영 인가코드를 못 받는다.
 *
 * @returns 이동을 시작했으면 true. false 면 호출측이 기본 경로(/me)로 보낸다.
 */
export async function goAfterLogin(p: AfterLoginParams): Promise<boolean> {
  if (await relayCodeIfNeeded(p.returnTo, p.clientId, p.codeChallenge, p.clientState)) {
    return true;
  }
  // 허용 오리진만 따른다(open-redirect 방지). 백엔드도 같은 기준으로 검증한다.
  if (p.appReturn && isFirstPartyReturn(p.appReturn) && !isSelf(p.appReturn)) {
    window.location.href = p.appReturn;
    return true;
  }
  return false;
}

/**
 * 돌아갈 곳이 **이 인증웹의 인증 화면**인지 본다.
 *
 * `?return=` 에 로그인 페이지가 들어오면 무한 왕복이 된다 — 로그인된 사용자가 /login 에
 * 오고, 그 값으로 다시 /login 으로 가고, 또 로그인된 상태로 도착한다. 도메인만 보는
 * isFirstPartyReturn 은 자기 자신도 자사로 인정하므로 여기서 따로 걸러야 한다.
 *
 * 경로만 보고 오리진은 안 본다. 같은 도메인의 다른 앱(포털웹)이 우연히 /login 을 갖고
 * 있어도 그건 우리 화면이 아니므로, 오리진이 같을 때만 자기 자신으로 친다.
 */
const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/callback'];

function isSelf(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    // vite base(/auth/) 아래에 마운트될 수 있으므로 접두사를 떼고 비교한다.
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const path = u.pathname.startsWith(base)
      ? u.pathname.slice(base.length)
      : u.pathname;
    return AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  } catch {
    return true; // 파싱 실패면 보내지 않는다(안전한 쪽).
  }
}

/** 현재 URL 의 쿼리에서 복귀 관련 값을 읽는다. 로그인 페이지와 라우트 가드가 같이 쓴다. */
export function readAfterLoginParams(
  params: URLSearchParams,
): AfterLoginParams {
  return {
    returnTo: params.get('redirect_uri') ?? undefined,
    clientId: params.get('client_id') ?? undefined,
    codeChallenge: params.get('code_challenge') ?? undefined,
    clientState: params.get('state') ?? undefined,
    // **자기 자신은 여기서 버린다.** 소셜 로그인은 이 값을 그대로 redirect_uri 로 쓰므로
    // (socialLoginUrl), 걸러내지 않으면 백엔드가 로그인 화면으로 되돌려보낸다.
    appReturn: selfStripped(params.get('return')),
  };
}

function selfStripped(url: string | null): string | undefined {
  if (!url) return undefined;
  return isSelf(url) ? undefined : url;
}
