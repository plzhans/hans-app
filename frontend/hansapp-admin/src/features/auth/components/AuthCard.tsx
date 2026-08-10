import type { ReactNode } from 'react';

/**
 * 로그인·비밀번호 변경 화면 공통 카드 레이아웃.
 *
 * 인증웹(hansapp-auth)의 AuthCard 와 같은 모양이다 — 두 로그인 화면이 다르게 생기면
 * 같은 서비스로 안 읽힌다.
 *
 * **로고에 링크를 걸지 않는다.** 인증웹은 로고를 누르면 포털 홈으로 나가는데, 관리자는
 * 로그인 화면 밖에 갈 곳이 없다. 눌러도 아무 일이 없는 링크보다 그냥 글자가 낫다.
 */
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
          <div className="text-lg font-extrabold text-primary">
            HansApp
            {/* 관리자 화면이라는 것을 로고 옆에서 바로 알 수 있게 한다. */}
            <span className="ml-1.5 align-middle text-xs font-semibold text-gray-400">
              ADMIN
            </span>
          </div>
          <h1 className="mt-3 text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
