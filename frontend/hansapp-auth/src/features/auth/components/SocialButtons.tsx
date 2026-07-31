import type { ReactNode } from 'react';
import { socialLoginUrl, type SocialProvider } from '@/shared/api/auth';
import { createPkceRequest } from '@/shared/auth/pkce';
import { GoogleIcon, KakaoIcon, LineIcon, NaverIcon } from './socialIcons';

type Item = {
  key: SocialProvider;
  label: string;
  className: string;
  icon: ReactNode;
};

const PROVIDERS: Item[] = [
  {
    key: 'google',
    label: 'Google',
    className: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    icon: <GoogleIcon />,
  },
  {
    key: 'kakao',
    label: '카카오',
    className: 'bg-[#FEE500] text-[#191600] hover:brightness-95',
    icon: <KakaoIcon />,
  },
  {
    key: 'naver',
    label: '네이버',
    className: 'bg-[#03C75A] text-white hover:brightness-95',
    icon: <NaverIcon />,
  },
  {
    key: 'line',
    label: 'LINE',
    className: 'bg-[#06C755] text-white hover:brightness-95',
    icon: <LineIcon />,
  },
];

/**
 * 소셜 로그인 버튼들. 클릭 시 백엔드 시작 URL 로 전체 페이지 리다이렉트한다.
 * returnTo 가 있으면(외부 클라이언트 SSO) 그 앱으로 code 를 실어 복귀시킨다.
 * clientId 는 그 복귀 대상을 서버가 검증·귀속하는 데 쓴다(없으면 1st-party).
 */
export function SocialButtons({
  returnTo,
  clientId,
  codeChallenge,
  clientState,
  appReturn,
}: {
  returnTo?: string;
  clientId?: string;
  /** 외부 앱이 만든 challenge. 있으면 그대로 전달하고, 없으면 인증웹이 자기 것을 만든다. */
  codeChallenge?: string;
  /** 외부 앱의 state. 해석하지 않고 왕복시켜 최종 복귀 URL 에 돌려준다. */
  clientState?: string;
  /** 1st-party 복귀 URL(자사 앱). 콜백 URL 에 ret= 로 실려 서명 state 로 왕복한다. */
  appReturn?: string;
}) {
  /**
   * 소셜 시작 URL 로 이동한다. 로그인 끝에 인가코드가 나오므로 PKCE challenge 가 필요하다.
   *
   * 외부 SSO 면 그 앱이 만든 걸 그대로 넘긴다 — 인증웹이 새로 만들면 verifier 를 가진 쪽과
   * 짝이 어긋난다. 인증웹 자체 로그인이면 인증웹이 당사자이므로 직접 만들어 보관한다.
   */
  const start = async (provider: SocialProvider) => {
    const challenge =
      codeChallenge ?? (await createPkceRequest()).codeChallenge;
    window.location.href = socialLoginUrl(
      provider,
      returnTo,
      clientId,
      challenge,
      clientState,
      appReturn,
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {PROVIDERS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            void start(p.key);
          }}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${p.className}`}
        >
          {p.icon}
          {p.label}
        </button>
      ))}
    </div>
  );
}
