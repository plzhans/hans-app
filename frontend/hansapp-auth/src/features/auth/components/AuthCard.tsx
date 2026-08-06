import type { ReactNode } from 'react';
import { PORTAL_WEB_URL } from '@/shared/config/env';

/** 로그인/가입 화면 공통 카드 레이아웃. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
        <div className="mb-6 text-center">
          <Logo />
          <h1 className="mt-3 text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {children}
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
function Logo() {
  const className = 'text-lg font-extrabold text-primary';
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
