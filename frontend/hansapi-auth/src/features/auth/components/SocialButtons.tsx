import { socialLoginUrl, type SocialProvider } from '@/shared/api/auth';

const PROVIDERS: { key: SocialProvider; label: string; className: string }[] = [
  { key: 'google', label: 'Google', className: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50' },
  { key: 'kakao', label: '카카오', className: 'bg-[#FEE500] text-[#191600] hover:brightness-95' },
  { key: 'naver', label: '네이버', className: 'bg-[#03C75A] text-white hover:brightness-95' },
  { key: 'line', label: 'LINE', className: 'bg-[#06C755] text-white hover:brightness-95' },
];

/** 소셜 로그인 버튼들. 클릭 시 백엔드 시작 URL 로 전체 페이지 리다이렉트한다. */
export function SocialButtons() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROVIDERS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            window.location.href = socialLoginUrl(p.key);
          }}
          className={`inline-flex h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold transition ${p.className}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
