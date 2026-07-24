import type { ReactNode } from 'react';
import { socialLoginUrl, type SocialProvider } from '@/shared/api/auth';
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
}: {
  returnTo?: string;
  clientId?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROVIDERS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            window.location.href = socialLoginUrl(p.key, returnTo, clientId);
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
