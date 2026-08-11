import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { PORTAL_WEB_URL } from '@/shared/config/env';
import {
  BottomAd,
  SHOW_AD_SLOTS,
  SideAd,
  useAdPlacement,
} from '@/shared/ui/AdSlot';

/**
 * 로그인/가입 화면 공통 카드 레이아웃.
 *
 * **PC 에서는 모바일 카드를 늘리지 않는다.** 폭이 넓어지면 카드도 넓어지고(lg:max-w-xl),
 * 그 안의 입력들은 레이블을 왼쪽에 두는 두 칸 짜리 줄로 바뀐다(→ FieldRow). 좁은 화면용
 * 세로 폼을 그대로 키우면 넓은 화면에서 눈이 위아래로만 오르내린다.
 *
 * **광고를 켜면 PC 카드가 두 배(lg:max-w-6xl)가 되고 반으로 갈린다** — 왼쪽이 폼,
 * 오른쪽이 광고다. 폼 쪽 반은 광고가 없을 때의 카드와 같은 폭이라, 광고가 붙어도 입력
 * 줄의 생김새는 달라지지 않는다. 제목도 그 반쪽 위에 맞춰 선다.
 *
 * 모바일은 카드가 한 단이고, 광고는 그 안 맨 아래(내용 끝)에 붙는다.
 */
export function AuthCard({
  title,
  subtitle,
  ads = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /**
   * 광고를 붙일 화면인지. **기본은 안 붙인다** — 로그인처럼 들르는 사람이 많은 화면만
   * 켠다. 로그인한 뒤의 화면(내 계정·정보 수정)까지 켜면 광고가 서비스 안쪽으로 들어온다.
   */
  ads?: boolean;
  children: ReactNode;
}) {
  const withAds = ads && SHOW_AD_SLOTS;
  const placement = useAdPlacement();
  // 제목은 카드 전체가 아니라 **폼이 있는 반쪽** 위에 선다.
  const alignedToForm = withAds && 'lg:w-1/2';

  return (
    <div className="flex min-h-full items-center justify-center p-4 lg:p-10">
      <div
        className={cn(
          'w-full max-w-sm animate-fade-in',
          withAds ? 'lg:max-w-6xl' : 'lg:max-w-xl',
        )}
      >
        {/*
          제목은 **카드 밖**이다. 안에 두면 카드가 "입력하는 곳" 과 "무슨 화면인지" 를 한
          덩어리로 묶어 버리는데, 흰 판은 손댈 것들만 담는 편이 어디를 봐야 하는지 분명하다.
        */}
        <div className={cn('mb-5 text-center lg:mb-6', alignedToForm)}>
          <Logo />
          <h1 className="mt-3 text-xl font-bold text-gray-900 lg:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 lg:text-base">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            'rounded-2xl bg-white shadow-sm ring-1 ring-gray-100',
            withAds && 'lg:flex',
          )}
        >
          <div className={cn('p-6 lg:p-10', alignedToForm)}>
            {children}
            {/* 모바일 광고. 카드 내용을 다 지나온 자리다(마지막은 비밀번호 찾기 링크). */}
            {withAds && placement === 'bottom' && <BottomAd />}
          </div>
          {withAds && placement === 'side' && <SideAd />}
        </div>
      </div>
    </div>
  );
}

/**
 * 로고. **누르면 포털 홈으로 나간다.**
 *
 * 인증웹은 로그인 하나만 하는 화면이라, 여기까지 왔다가 그만두려는 사람에게 나갈 길이
 * 없었다. 로고를 누르면 홈으로 가는 것은 어느 사이트나 같아서 따로 안내하지 않아도 통한다.
 *
 * 포털은 다른 오리진이라 라우터가 아니라 전체 페이지 이동이다. 주소가 비면(로컬에서 포털을
 * 안 띄운 경우) 링크를 걸지 않는다 — 죽은 링크보다 낫다.
 */
export function Logo() {
  const className = 'text-lg font-extrabold text-primary lg:text-xl';
  if (!PORTAL_WEB_URL) return <div className={className}>HansApp</div>;
  return (
    <a
      href={PORTAL_WEB_URL}
      className={`${className} inline-block transition hover:opacity-80`}
    >
      HansApp
    </a>
  );
}
