import type { AiSearchResponse } from '../api';

/**
 * 화면에 띄우는 대화 한 줄.
 *
 * **서버는 대화를 기억하지 않는다**(요청 하나가 자족적이다). 여기 쌓이는 것은 순전히
 * 사용자가 방금 뭘 물었는지 보여주기 위한 화면 상태다.
 */
export type Turn =
  | { role: 'user'; id: number; text: string }
  // 요청을 **보낸** 시각(epoch ms). 응답이 온 시각이 아니다 — 사용자가 "언제 물었나" 를
  // 찾는 자리라 그쪽이 맞고, 소요 시간(elapsedMs)과 더하면 도착 시각도 나온다.
  | { role: 'assistant'; id: number; result: AiSearchResponse; at: number }
  // 실패한 turn 은 **질문을 들고 있는다** — 다시 시도 버튼이 같은 것을 재발송한다.
  | { role: 'error'; id: number; question: string };

/**
 * **sessionStorage 다. localStorage 가 아니다.**
 *
 * 남는 것이 "무릎 인공관절", "정신과" 같은 건강 질문이라 공용 PC 에 영구히 남으면 안 된다.
 * sessionStorage 는 탭을 닫으면 사라지고 탭끼리 섞이지도 않는다 — 새로고침만 견디면
 * 되는 이 자리에 딱 맞는 수명이다(좌표를 URL·로그에 안 싣는 것과 같은 결).
 *
 * **서버(Redis)에 두지 않는 이유**도 같다. 서버는 대화를 쓰지 않으므로 저장하면 보관
 * 책임만 생기고, 지금은 로그인이 없어 누구 것인지 묶을 키도 없다.
 */
/*
  **끝에 판을 붙인다.** 담긴 것이 서버 응답 통째라, 응답 모양이 바뀌면 예전 판이 그대로
  남아 새 화면에 들어온다 — 실제로 `quota` 가 `{used,limit}` 에서 `{windows:[...]}` 로
  바뀌었을 때 옛 값이 렌더러를 터뜨렸다. 판을 올리면 못 읽는 키가 되어 저절로 버려진다.

  **응답 모양을 바꿀 때마다 올린다.** 읽는 쪽에 방어 코드를 늘리는 것보다 싸다 —
  대화는 새로고침만 견디면 되는 물건이라 버려도 잃는 것이 거의 없다.
*/
const KEY = 'ai-search:turns:v5';

/**
 * 담아 둘 turn 수. 넘으면 **오래된 것부터 버린다.**
 *
 * sessionStorage 는 탭당 5MB 안팎이고 답변 하나가 수 KB 라 금방 차지는 않지만, 무한히
 * 쌓이면 열 때마다 파싱이 길어지고 스크롤도 끝없이 늘어난다. 지난 대화를 거슬러 읽는
 * 자리가 아니라 방금 것을 확인하는 자리라, 짝수로 30(질문 15개쯤)이면 충분하다.
 */
const MAX_TURNS = 30;

/** 저장된 대화. 없거나 깨졌으면 빈 배열이다. */
export function loadTurns(): Turn[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    // 모양을 신뢰하지 않는다 — 배포로 Turn 이 바뀌면 옛 값이 그대로 남아 있다.
    return Array.isArray(parsed) ? (parsed as Turn[]) : [];
  } catch {
    // 사파리 프라이빗 모드는 저장소 접근 자체가 던지기도 한다. 대화가 없는 것으로 본다.
    return [];
  }
}

/** 대화를 담는다. 실패는 삼킨다 — 저장이 안 된다고 채팅을 막을 이유는 없다. */
export function saveTurns(turns: Turn[]): void {
  try {
    if (turns.length === 0) {
      sessionStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-MAX_TURNS)));
  } catch {
    // 용량 초과·프라이빗 모드. 화면 상태는 그대로 살아 있다.
  }
}
