import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface Crumb {
  label: string;
  /** 없으면 링크가 아니라 현재 위치다(마지막 조각). */
  to?: string;
}

/**
 * 사이트맵(브레드크럼). 페이지 제목 옆에 붙는다 — AdminLTE 의 content-header 배치다.
 *
 * **맨 앞의 "홈" 은 자동으로 붙인다.** 화면마다 적으면 하나만 빠져도 줄이 어긋나 보인다.
 * 마지막 조각은 링크로 만들지 않는다 — 지금 보고 있는 화면이라 눌러 갈 곳이 없다.
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="현재 위치" className="flex items-center gap-1.5 text-sm">
      <Link
        to="/users"
        className="text-gray-400 transition hover:text-primary"
        aria-label="홈"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((crumb, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
            {crumb.to && !last ? (
              <Link
                to={crumb.to}
                className="text-gray-500 transition hover:text-primary"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className="truncate font-medium text-gray-700"
                aria-current={last ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
