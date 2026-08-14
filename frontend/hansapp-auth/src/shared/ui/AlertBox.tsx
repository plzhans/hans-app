import type { ReactNode } from 'react';

/**
 * 폼 위에 띄우는 알림 상자.
 *
 * **한 줄짜리 빨간 글씨로는 부족한 자리가 있다.** 입력칸 사이에 같은 크기로 끼어 있으면
 * 사용자는 그것을 읽지 않고 다시 제출한다 — 이미 가입된 이메일처럼 **입력을 고쳐야만**
 * 넘어갈 수 있는 사유가 그렇다. 배경과 테두리로 글의 영역을 만들어 놓으면 눈이 먼저 간다.
 *
 * 문장은 줄바꿈을 살린다(`whitespace-pre-line`) — 사유와 다음 행동을 두 줄로 나눠 적는다.
 */
export function AlertBox({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info';
  children: ReactNode;
}) {
  const palette =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-gray-200 bg-gray-50 text-gray-700';

  return (
    <div
      // role="alert": 스크린 리더가 이 문장을 즉시 읽는다. 제출 직후에 나타나는 값이라
      // 포커스를 옮기지 않으면 화면을 못 보는 사용자에게는 아무 일도 안 일어난 것과 같다.
      role="alert"
      className={`w-full rounded-lg border px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${palette}`}
    >
      {children}
    </div>
  );
}
