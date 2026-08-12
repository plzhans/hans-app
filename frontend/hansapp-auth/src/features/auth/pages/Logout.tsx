import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PORTAL_WEB_URL } from '@/shared/config/env';
import { useAuthStore } from '@/shared/auth/authStore';
import { isFirstPartyReturn } from '@/shared/auth/returnTo';

/**
 * **로그아웃이 끝나는 자리.** 자사 앱은 자기가 처리하지 않고 여기로 보낸다.
 *
 * 세션은 `.plzhans.com` 공유 쿠키 하나인데, 각 앱이 알아서 로그아웃하면 서버 폐기는 되지만
 * 자기 오리진의 localStorage 만 지워진다. 다른 앱에는 만료 전 access token 이 그대로 남아
 * "나는 로그인 상태" 라고 우기고, 로그아웃한 앱은 그 앱으로 보내고, 서로 떠넘기며 왕복한다.
 * 다른 오리진의 저장소를 직접 지울 방법은 없으므로, 쿠키를 유일한 진실로 삼는다 — 서버가
 * 도메인 쿠키를 지우면 각 앱이 부팅 때 "힌트 없음 = 내 토큰도 무효" 로 스스로 정리한다.
 *
 * **여기서는 아무것도 따지지 않는다.** 로그인 상태인지, 토큰이 있는지, 만료됐는지 보지 않고
 * 지우고 알리고 보낸다. 조건을 달면 그 조건이 어긋났을 때 로그아웃이 조용히 실패한다 —
 * 실제로 access token 을 요구하다가 만료된 사용자가 로그아웃되지 않는 일이 있었다.
 */
export default function Logout() {
  const [params] = useSearchParams();
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    // 돌아갈 곳. 자사 오리진만 따른다(open-redirect 방지). 없으면 포털 홈.
    const back = params.get('return');
    const target =
      back && isFirstPartyReturn(back) ? back : PORTAL_WEB_URL || '/login';

    // signOut 은 서버 폐기 + 로컬 정리 + 다른 탭 통지를 모두 하고, 실패해도 던지지 않는다.
    void signOut().finally(() => {
      window.location.replace(target);
    });
    // 마운트에 한 번만. 재실행되면 이미 떠난 페이지에서 또 지운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center text-gray-400">
      로그아웃 중…
    </div>
  );
}
