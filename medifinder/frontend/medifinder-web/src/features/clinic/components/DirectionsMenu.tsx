import * as Popover from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  directionsProviders,
  type DirectionsPoint,
} from '@/shared/lib/directions';

/**
 * 길찾기 — 어느 지도로 갈지 고르는 메뉴.
 *
 * **바로 열지 않고 한 번 묻는다.** 한 지도로 몰면 그 앱이 안 깔린 사람은 웹으로 떨어져
 * 로그인·설치 안내를 만난다. 한국에서 쓰는 지도가 갈려 있어서(네이버·카카오) 우리가 대신
 * 정할 근거가 없다 — 고르는 수고 한 번이 헛걸음보다 싸다.
 *
 * 여는 방식은 Radix Popover 에 맡긴다. 바깥 누르면 닫기·ESC·초점 되돌리기를 직접 짜면
 * 반드시 하나를 빠뜨리고, 그게 키보드로 쓰는 사람에게는 갇히는 경험이 된다.
 */
export function DirectionsMenu({
  point,
  children,
  align = 'center',
}: {
  point: DirectionsPoint;
  /** 메뉴를 여는 것. 버튼이든 타일이든 그대로 방아쇠가 된다. */
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const { t } = useTranslation();

  return (
    <Popover.Root>
      {/* asChild: 넘겨받은 요소를 그대로 방아쇠로 쓴다 — 버튼 안에 버튼이 생기지 않게. */}
      <Popover.Trigger asChild>{children}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-50 w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop',
            'data-[state=open]:animate-fade-in',
          )}
        >
          {directionsProviders(point).map((provider) => (
            <a
              key={provider.id}
              href={provider.url}
              /*
                새 탭으로 연다. 지도 앱이 깔려 있으면 **이 탭이 앱으로 바뀌므로**,
                같은 탭에서 열면 돌아왔을 때 병원 상세가 사라져 있다.
              */
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-ink-body no-underline transition-colors hover:bg-surface-subtle active:bg-brand-tint active:text-brand-strong"
            >
              {t(`clinic.actions.mapProvider.${provider.id}`)}
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
            </a>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
