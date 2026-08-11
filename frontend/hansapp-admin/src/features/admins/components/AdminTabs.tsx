import { useNavigate } from 'react-router-dom';

import { Tabs } from '@/shared/ui/Tabs';

export type AdminTab = 'overview' | 'actionLog';

/**
 * **"인증 기록" 이 아니라 "기록" 이다.** 회원 탭은 로그인·비밀번호 같은 인증 이벤트만
 * 보여 주지만, 관리자 쪽에는 남의 계정을 만들고 지운 조치가 같이 쌓인다 —
 * "인증" 이라고 부르면 그 절반이 이름에서 빠진다.
 */
const ITEMS = [
  { value: 'overview' as const, label: '개요' },
  { value: 'actionLog' as const, label: '기록' },
];

/**
 * 관리자 상세의 탭.
 *
 * **탭을 URL 로 가른다**(`/admins/:id`, `/admins/:id/action-logs`) — 회원 상세와 같은 규칙이다.
 * 컴포넌트 state 로만 들고 있으면 "이 계정 기록 좀 보세요" 를 링크로 못 주고, 새로고침하면
 * 개요로 돌아간다.
 */
export function AdminTabs({
  adminId,
  current,
}: {
  adminId: number;
  current: AdminTab;
}) {
  const navigate = useNavigate();

  return (
    <Tabs
      className="mb-5"
      items={ITEMS}
      value={current}
      onChange={(next) =>
        navigate(
          next === 'actionLog'
            ? `/admins/${adminId}/action-logs`
            : `/admins/${adminId}`,
        )
      }
    />
  );
}
