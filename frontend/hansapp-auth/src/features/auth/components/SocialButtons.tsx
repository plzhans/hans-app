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
    label: 'Kakao',
    className: 'bg-[#FEE500] text-[#191600] hover:brightness-95',
    icon: <KakaoIcon />,
  },
  {
    key: 'naver',
    label: 'Naver',
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
  remember,
}: {
  returnTo?: string;
  clientId?: string;
  /** 외부 앱이 만든 challenge. 있으면 그대로 전달하고, 없으면 인증웹이 자기 것을 만든다. */
  codeChallenge?: string;
  /** 외부 앱의 state. 해석하지 않고 왕복시켜 최종 복귀 URL 에 돌려준다. */
  clientState?: string;
  /** 1st-party 복귀 URL(자사 앱). 콜백 URL 에 ret= 로 실려 서명 state 로 왕복한다. */
  appReturn?: string;
  /**
   * "로그인 상태 유지" 체크 여부. **누를 때의 값이어야 한다** — 체크박스를 만지고 바로
   * 소셜을 누르는 흐름이라, 렌더 시점에 굳은 값이면 방금 한 선택이 반영되지 않는다.
   */
  remember?: boolean;
}) {
  /**
   * 소셜 시작 URL 로 이동한다.
   *
   * **PKCE 는 외부 SSO 일 때만 필요하다.** 그때만 끝에 인가코드가 나오고, 그 앱은
   * client_secret 을 숨길 수 없어 verifier 로 대신 증명해야 한다. challenge 는 **그 앱이
   * 만든 것**을 그대로 넘긴다 — 인증웹이 새로 만들면 verifier 를 가진 쪽과 짝이 어긋난다.
   *
   * 자사 로그인(clientId 없음)은 백엔드가 콜백에서 쿠키를 심고 끝낸다. 코드가 없으니
   * challenge 도 만들지 않는다 — 만들면 verifier 만 브라우저에 남아 쓰이지 않는다.
   */
  const start = async (provider: SocialProvider) => {
    const challenge = clientId
      ? (codeChallenge ?? (await createPkceRequest()).codeChallenge)
      : undefined;
    window.location.href = socialLoginUrl(
      provider,
      returnTo,
      clientId,
      challenge,
      clientState,
      appReturn,
      remember,
    );
  };

  return (
    // PC 는 카드가 넓어 네 개가 한 줄에 들어간다. 모바일은 2×2 그대로.
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {PROVIDERS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            void start(p.key);
          }}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition lg:h-12 lg:text-base ${p.className}`}
        >
          {p.icon}
          {p.label}
        </button>
      ))}
    </div>
  );
}
