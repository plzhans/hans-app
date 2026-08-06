/**
 * 도메인 이벤트가 지나는 큐 이름.
 *
 * **발행자와 같은 값이어야 한다.** 두 패키지가 서로를 참조하지 않는 대신, 이 한 문자열은
 * 양쪽에 같이 적혀 있다 — 계약(@hansapp/event-contract)이 "무엇을" 이라면 이것은 "어디로" 다.
 * 바꿀 일이 생기면 반드시 함께 바꾼다.
 */
export const EVENT_QUEUE_NAME = 'domain-events';
