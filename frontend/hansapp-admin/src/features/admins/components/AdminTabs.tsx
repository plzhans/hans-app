import { useNavigate } from 'react-router-dom';

import { Tabs } from '@/shared/ui/Tabs';

export type AdminTab = 'overview' | 'session' | 'cache' | 'actionLog';

/**
 * **"인증 기록" 이 아니라 "기록" 이다.** 회원 탭은 로그인·비밀번호 같은 인증 이벤트만
 * 보여 주지만, 관리자 쪽에는 남의 계정을 만들고 지운 조치가 같이 쌓인다 —
 * "인증" 이라고 부르면 그 절반이 이름에서 빠진다.
 *
 * **차례는 회원 상세와 같다.** 기기(지금 어디에서 들어와 있나)가 개요의 연장이고, 기록은
 * 지나간 일이다. 캐시는 계정을 이해하는 값이 아니라 "왜 안 막히지" 를 가릴 때 여는
 * 정비용 화면이라 뒤에 둔다 — 앞에 두면 늘 보는 탭들을 밀어낸다.
 */
const ITEMS = [
  { value: 'overview' as const, label: '개요' },
  { value: 'session' as const, label: '로그인 기기' },
  { value: 'cache' as const, label: '캐시' },
  { value: 'actionLog' as const, label: '기록' },
];

const PATH: Record<AdminTab, (adminId: number) => string> = {
  overview: (id) => `/admins/${id}`,
  session: (id) => `/admins/${id}/sessions`,
  cache: (id) => `/admins/${id}/cache`,
  actionLog: (id) => `/admins/${id}/action-logs`,
};

/**
 * 관리자 상세의 탭.
 *
 * **탭을 URL 로 가른다**(`/admins/:id`, `/admins/:id/sessions`, `/admins/:id/cache`,
 * `/admins/:id/action-logs`) — 회원 상세와 같은 규칙이다. 컴포넌트 state 로만 들고 있으면
 * "이 계정 기록 좀 보세요" 를 링크로 못 주고, 새로고침하면 개요로 돌아간다.
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
      onChange={(next) => navigate(PATH[next](adminId))}
    />
  );
}
