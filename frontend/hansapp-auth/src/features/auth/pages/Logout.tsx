import { useEffect, useState } from 'react';
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
 *
 * 그래서 로그아웃도 로그인처럼 **한 곳을 지난다.** 여기서 서버 세션을 폐기하면 서버가 도메인
 * 쿠키(refresh·힌트)를 지우고, 각 앱은 부팅 때 "힌트 없음 = 내 토큰도 무효" 로 스스로 정리한다.
 * 다른 오리진의 저장소를 직접 지울 방법은 없으므로, 쿠키를 유일한 진실로 삼는 이 방식이 답이다.
 */
export default function Logout() {
  const [params] = useSearchParams();
  const signOut = useAuthStore((s) => s.signOut);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // 돌아갈 곳. 자사 오리진만 따른다(open-redirect 방지). 없으면 포털 홈.
    const back = params.get('return');
    const target =
      back && isFirstPartyReturn(back) ? back : PORTAL_WEB_URL || '/login';

    void signOut()
      .then(() => {
        window.location.href = target;
      })
      .catch(() => setFailed(true));
    // signOut 은 한 번만. params 가 바뀌는 경우는 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-gray-400">
      {failed ? (
        <>
          <p className="font-semibold text-gray-700">로그아웃하지 못했습니다.</p>
          <p className="text-sm">잠시 후 다시 시도해 주세요.</p>
        </>
      ) : (
        <p>로그아웃 중…</p>
      )}
    </div>
  );
}
