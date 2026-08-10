import { useNavigate } from 'react-router-dom';

import { Tabs } from '@/shared/ui/Tabs';

export type UserTab = 'overview' | 'authLog';

/**
 * **"활동" 이 아니라 "인증" 이다.** 이 탭이 보여 주는 것은 로그인·비밀번호·소셜연동·탈퇴,
 * 곧 계정에 일어난 일이다. 좋아요·조회 같은 서비스 행위는 별도 표로 가고 탭도 따로 생긴다 —
 * 지금 "활동" 이라고 부르면 그때 이름이 정면으로 충돌한다.
 */
const ITEMS = [
  { value: 'overview' as const, label: '개요' },
  { value: 'authLog' as const, label: '인증 기록' },
];

/**
 * 회원 상세의 탭.
 *
 * **탭을 URL 로 가른다**(`/users/:id`, `/users/:id/auth-logs`). 컴포넌트 state 로만 들고
 * 있으면 "이 회원 기록 좀 보세요" 를 링크로 못 주고, 새로고침하면 개요로 돌아간다.
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
      onChange={(next) =>
        navigate(
          next === 'authLog'
            ? `/users/${userId}/auth-logs`
            : `/users/${userId}`,
        )
      }
    />
  );
}
