/** 소셜 provider 브랜드 아이콘(인라인 SVG). 색상은 버튼 배경에 맞춰 currentColor/브랜드컬러 사용. */

const cls = 'h-[18px] w-[18px] shrink-0';

/** 구글 4색 G 로고. */
export function GoogleIcon() {
  return (
    <svg className={cls} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** 카카오 말풍선. currentColor(버튼 텍스트색=검정)로 그린다. */
export function KakaoIcon() {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 4.318 0 9.643c0 3.44 2.245 6.458 5.617 8.156-.246.827-.887 2.98-.995 3.443-.134.575.211.567.444.412.183-.122 2.913-1.977 4.093-2.782.6.09 1.216.138 1.841.138 6.627 0 12-4.318 12-9.643C24 4.318 18.627 0 12 0" />
    </svg>
  );
}

/**
 * 네이버 N. currentColor(흰색).
 *
 * 글자가 상자를 꽉 채우는 것이 원래 로고지만, viewBox 에 여백을 조금 준다 — 원형 배지
 * 안에서는 모서리가 잘려 보인다.
 */
export function NaverIcon() {
  return (
    <svg
      className={cls}
      viewBox="-3 -3 30 30"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727z" />
    </svg>
  );
}

/**
 * LINE 말풍선. currentColor(흰색).
 *
 * **글자(LINE)는 넣지 않는다.** 18px 에서 획이 뭉개져 얼룩처럼 보였다 — 알아볼 수 없는
 * 글자보다 형태만 또렷한 말풍선이 낫다.
 */
export function LineIcon() {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.75c-5.376 0-9.75 3.53-9.75 7.87 0 3.888 3.468 7.145 8.153 7.762.317.068.75.209.859.48.098.246.064.63.031.879l-.138.83c-.042.246-.196.962.845.525 1.042-.437 5.62-3.31 7.666-5.667C21.077 13.88 21.75 12.31 21.75 10.62c0-4.34-4.374-7.87-9.75-7.87Z" />
    </svg>
  );
}

/** 목록에서 쓰는 브랜드 배지의 색과 글리프. 버튼(SocialButtons)의 배색과 같게 둔다. */
const BRAND = {
  // 구글만 흰 바탕이라 테두리를 준다. 없으면 흰 배지가 흰 카드에 묻힌다.
  google: { bg: '#FFFFFF', fg: '#000000', bordered: true, Icon: GoogleIcon },
  kakao: { bg: '#FEE500', fg: '#191600', bordered: false, Icon: KakaoIcon },
  naver: { bg: '#03C75A', fg: '#FFFFFF', bordered: false, Icon: NaverIcon },
  line: { bg: '#06C755', fg: '#FFFFFF', bordered: false, Icon: LineIcon },
} as const;

/**
 * 목록용 브랜드 배지.
 *
 * **아이콘만 놓으면 안 된다.** 위 글리프들은 브랜드 색 버튼 위에 얹히는 전제로 그려져 있어
 * (네이버·라인은 흰색, 카카오는 검정) 회색 목록에 그대로 두면 넷 다 검은 실루엣이 된다.
 * 색을 배지가 들고, 글리프는 그 위에서 currentColor 로 제 색을 찾는다.
 */
export function SocialBadge({ provider }: { provider: keyof typeof BRAND }) {
  const { bg, fg, bordered, Icon } = BRAND[provider];
  return (
    <span
      aria-hidden
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        bordered ? 'border border-gray-200' : ''
      }`}
      style={{ backgroundColor: bg, color: fg }}
    >
      <Icon />
    </span>
  );
}
