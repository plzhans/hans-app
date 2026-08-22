import { useNavigate } from 'react-router-dom';

import { Tabs } from '@/shared/ui/Tabs';

export type HospitalTab = 'overview' | 'cache';

const ITEMS = [
  { value: 'overview' as const, label: '개요' },
  // 캐시가 맨 뒤다 — 회원 상세와 같은 이유로, 병원을 이해하는 값이 아니라
  // "공개 화면에 왜 반영이 안 되지" 를 가릴 때만 여는 정비용 화면이다.
  { value: 'cache' as const, label: '캐시' },
];

const PATH: Record<HospitalTab, (id: number) => string> = {
  overview: (id) => `/healthcare/hospitals/${id}`,
  cache: (id) => `/healthcare/hospitals/${id}/cache`,
};

/**
 * 병원 상세의 탭. **URL 로 가른다**(`/healthcare/hospitals/:id`,
 * `/healthcare/hospitals/:id/cache`) — 회원 상세(UserTabs)와 같은 이유다.
 */
export function HospitalTabs({ hospitalId, current }: { hospitalId: number; current: HospitalTab }) {
  const navigate = useNavigate();

  return (
    <Tabs
      className="mb-5"
      items={ITEMS}
      value={current}
      onChange={(next) => navigate(PATH[next](hospitalId))}
    />
  );
}
