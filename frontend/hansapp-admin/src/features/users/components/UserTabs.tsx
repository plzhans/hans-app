import { useNavigate } from 'react-router-dom';

import { Tabs } from '@/shared/ui/Tabs';

export type UserTab = 'overview' | 'app' | 'session' | 'authLog' | 'cache';

/**
 * **"활동" 이 아니라 "인증" 이다.** 이 탭이 보여 주는 것은 로그인·비밀번호·소셜연동·탈퇴,
 * 곧 계정에 일어난 일이다. 좋아요·조회 같은 서비스 행위는 별도 표로 가고 탭도 따로 생긴다 —
 * 지금 "활동" 이라고 부르면 그때 이름이 정면으로 충돌한다.
 *
 * **앱이 개요 바로 다음이다.** 이 회원이 무엇을 들고 있는지는 계정 정보의 연장이고,
 * 개발자 문의는 대개 그 앱 이야기라 여기서 앱 상세로 건너간다.
 *
 * **기기가 기록보다 앞이다.** 지금 어디에서 로그인돼 있는지는 "현재 상태" 라 개요의
 * 연장이고, 기록은 지나간 일이다. 문의를 받아 들여다볼 때도 대개 지금부터 본다.
 *
 * **캐시가 맨 뒤다.** 회원을 이해하는 데 쓰는 값이 아니라 "왜 반영이 안 되지" 를 가릴 때
 * 여는 정비용 화면이라, 앞에 두면 늘 보는 탭들을 밀어낸다.
 */
const ITEMS = [
  { value: 'overview' as const, label: '개요' },
  { value: 'app' as const, label: '앱' },
  { value: 'session' as const, label: '로그인 기기' },
  { value: 'authLog' as const, label: '인증 기록' },
  { value: 'cache' as const, label: '캐시' },
];

const PATH: Record<UserTab, (userId: number) => string> = {
  overview: (id) => `/users/${id}`,
  app: (id) => `/users/${id}/apps`,
  session: (id) => `/users/${id}/sessions`,
  authLog: (id) => `/users/${id}/auth-logs`,
  cache: (id) => `/users/${id}/cache`,
};

/**
 * 회원 상세의 탭.
 *
 * **탭을 URL 로 가른다**(`/users/:id`, `/users/:id/apps`, `/users/:id/sessions`,
 * `/users/:id/auth-logs`, `/users/:id/cache`).
 * 컴포넌트 state 로만 들고 있으면 "이 회원 기록 좀 보세요" 를 링크로 못 주고,
 * 새로고침하면 개요로 돌아간다.
 *
 * 기록을 개요 아래 섹션으로 쌓지 않은 이유는 성격이 달라서다 — 개요의 항목들은 몇 줄로
 * 끝나는데 기록은 기간·종류 필터와 페이저가 붙는 목록이다. 한 페이지에 두면 계정 정보를
 * 보려고 매번 스크롤을 올려야 한다. 조회도 이 탭에 들어올 때만 나간다.
 */
export function UserTabs({
  userId,
  current,
}: {
  userId: number;
  current: UserTab;
}) {
  const navigate = useNavigate();

  return (
    <Tabs
      className="mb-5"
      items={ITEMS}
      value={current}
      onChange={(next) => navigate(PATH[next](userId))}
    />
  );
}
