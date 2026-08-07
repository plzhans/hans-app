/**
 * ISO 문자열을 `2026-08-07 21:32:33` 로.
 *
 * **초까지 보여 준다.** 관리 화면에서 시각을 보는 이유는 "언제쯤" 이 아니라 "정확히 언제" 다 —
 * 로그를 대조하거나, 두 사건의 선후를 가리거나, 문의받은 시각과 맞춰 보는 데 쓴다.
 * 분까지만 있으면 같은 분 안의 순서를 못 가린다.
 *
 * **표시는 브라우저 시간대다.** 서버는 UTC(ISO)로 주고 여기서 로컬로 편다 —
 * 운영자가 보는 시계와 같아야 "지금으로부터 몇 분 전" 을 머리로 셀 수 있다.
 *
 * 값이 없을 때 `—` 를 돌려주는 것까지가 규칙이다. 화면마다 빈 표시를 다르게 쓰면
 * 같은 표 안에서 `—` 와 `-` 와 빈칸이 섞인다.
 *
 * **undefined 도 받는다.** 서버의 StripNullInterceptor 가 null 필드를 응답에서 지우기
 * 때문에 없는 값은 null 이 아니라 undefined 로 온다.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * 목록의 좁은 칸용. 날짜와 시각을 두 줄로 나눈다.
 *
 * 한 줄로 두면 `2026-08-07 21:32:33` 이 20자라 열이 그만큼 넓어지고, 표에서 정작 봐야 할
 * 이름·이메일 칸이 밀린다. 나눠 쓰면 폭은 날짜만큼만 쓰면서 초까지 남는다.
 */
export function splitDateTime(
  iso: string | null | undefined,
): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}
