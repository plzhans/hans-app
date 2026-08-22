import { useNavigate } from 'react-router-dom';

import { Tabs } from '@/shared/ui/Tabs';

export type BatchTab = 'overview' | 'settings';

const ITEMS = [
  { value: 'overview' as const, label: '현황' },
  { value: 'settings' as const, label: '설정' },
];

const PATH: Record<BatchTab, string> = {
  overview: '/batch',
  settings: '/batch/stages',
};

/**
 * 배치 화면의 탭. **URL 로 가른다**(`/batch`, `/batch/stages`) — 병원 상세(HospitalTabs)와
 * 같은 이유다. 현황(보기)과 설정(단계 on/off, 고치기)은 같이 관리하지만 성격이 갈려
 * 사이드바 항목을 늘리는 대신 탭으로 묶는다(Tabs 컴포넌트 설명 참고).
 */
export function BatchTabs({ current }: { current: BatchTab }) {
  const navigate = useNavigate();

  return (
    <Tabs className="mb-5" items={ITEMS} value={current} onChange={(next) => navigate(PATH[next])} />
  );
}
