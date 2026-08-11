import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface Tab {
  key: string;
  label: string;
  content: ReactNode;
}

/**
 * 한 자리에서 갈아 끼우는 화면들.
 *
 * **탭이 하나여도 쓴다.** 지금은 기기 정보뿐이지만 여기 붙을 것이 더 있고(마이페이지의 오른쪽
 * 단), 그때 탭을 새로 도입하면 이미 있던 화면의 제목 자리가 통째로 바뀐다 — 하나일 때부터
 * 탭 모양으로 두면 늘어나도 자리가 그대로다.
 *
 * 고른 탭은 **주소에 남기지 않는다.** 마이페이지 안에서 잠깐 갈아 보는 것이라 링크로 공유하거나
 * 뒤로가기로 돌아올 일이 없다. 공유해야 하는 화면이 생기면 그때 URL 로 올린다.
 */
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!current) return null;

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const on = tab.key === current.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(tab.key)}
              className={cn(
                // -mb-px 로 아래 테두리를 목록의 테두리 위에 겹쳐 올린다.
                '-mb-px border-b-2 px-3 py-2 text-sm font-bold transition',
                on
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-4">
        {current.content}
      </div>
    </div>
  );
}
