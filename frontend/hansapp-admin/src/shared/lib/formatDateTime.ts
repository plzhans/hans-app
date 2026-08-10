/**
 * 시각 표시.
 *
 * **초까지 보여 준다.** 관리 화면에서 시각을 보는 이유는 "언제쯤" 이 아니라 "정확히 언제" 다 —
 * 로그를 대조하거나, 두 사건의 선후를 가리거나, 문의받은 시각과 맞춰 보는 데 쓴다.
 * 분까지만 있으면 같은 분 안의 순서를 못 가린다.
 *
 * **어느 시간대로 펴는지는 관리자가 정한다.** 서버는 UTC(ISO)로 주고, 여기서 계정에 저장된
 * 타임존으로 편다(setDisplayTimeZone). 고른 적이 없거나 아직 못 읽었으면 브라우저 시간대다.
 *
 * 값이 없을 때 `—` 를 돌려주는 것까지가 규칙이다. 화면마다 빈 표시를 다르게 쓰면
 * 같은 표 안에서 `—` 와 `-` 와 빈칸이 섞인다.
 *
 * **undefined 도 받는다.** 서버의 StripNullInterceptor 가 null 필드를 응답에서 지우기
 * 때문에 없는 값은 null 이 아니라 undefined 로 온다.
 */

/*
  **모듈 변수에 둔다.** 시각을 찍는 자리가 표·목록·상세에 흩어져 있어서, 인자로 나르면
  중간 컴포넌트가 전부 이 값을 알아야 한다 — 화면과 상관없는 값을 화면 계약에 넣는 셈이다.
  값을 정하는 곳은 로그인 직후 한 곳(authStore)뿐이라 흐름이 꼬일 여지도 없다.
*/
let displayTimeZone: string | undefined;

/** 표시 시간대를 정한다. 로그인·부팅 때 /auth/me 를 읽고 authStore 가 한 번 부른다. */
export function setDisplayTimeZone(timeZone: string | null | undefined): void {
  displayTimeZone = timeZone ?? undefined;
}

/**
 * 지금 쓰는 표시 시간대. 아직 못 읽었으면 브라우저 시간대다.
 *
 * **기간 필터가 이 값을 쓴다.** 화면은 계정 시간대로 시각을 찍는데 "8월 1일부터" 를
 * 브라우저 시간대로 계산하면, 표에 보이는 날짜와 걸러지는 경계가 어긋난다.
 */
export function getDisplayTimeZone(): string {
  return displayTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface Parts {
  date: string;
  time: string;
}

function toParts(iso: string | null | undefined): Parts | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  try {
    /*
      en-CA 로 뽑으면 `2026-08-07, 21:32:33` 이라 자르기만 하면 된다.
      로케일 이름을 값의 모양에 쓰는 게 께름칙하지만, formatToParts 로 조각을 모으는
      것보다 짧고 결과는 같다 — 어느 브라우저에서도 ISO 순서로 나온다.
    */
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: displayTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(at);
    const [date, time] = formatted.split(', ');
    if (date && time) {
      // 자정을 24시로 주는 런타임이 있다(hour12:false 의 오래된 처리).
      return { date, time: time.replace(/^24:/, '00:') };
    }
  } catch {
    // 저장된 타임존을 런타임이 모르면 아래 브라우저 시간대로 떨어진다.
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`,
  };
}

/** ISO 문자열을 `2026-08-07 21:32:33` 로. */
export function formatDateTime(iso: string | null | undefined): string {
  const parts = toParts(iso);
  return parts ? `${parts.date} ${parts.time}` : '—';
}

/**
 * 목록의 좁은 칸용. 날짜와 시각을 두 줄로 나눈다.
 *
 * 한 줄로 두면 `2026-08-07 21:32:33` 이 20자라 열이 그만큼 넓어지고, 표에서 정작 봐야 할
 * 이름·이메일 칸이 밀린다. 나눠 쓰면 폭은 날짜만큼만 쓰면서 초까지 남는다.
 */
export function splitDateTime(iso: string | null | undefined): Parts | null {
  return toParts(iso);
}
