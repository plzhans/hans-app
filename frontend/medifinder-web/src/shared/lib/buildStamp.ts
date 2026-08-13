/** 산출물 시각을 펴는 시간대. **보는 사람의 시간대를 따르지 않는다**(아래 참고). */
const BUILD_TIME_ZONE = 'Asia/Seoul';

/**
 * 빌드 시각을 `20260813_2324` 로. **KST 고정이다.**
 *
 * 다른 시각(로그인 기록·로그)과 달리 이 값은 **산출물의 속성**이지 보는 사람이 겪은 사건이
 * 아니다. 배포를 이야기할 때 쓰는 시각도 한국 시간 하나뿐이라(CI 로그·공지·릴리스 노트),
 * 보는 사람마다 다르게 펴지면 "몇 시 배포본이냐" 를 맞춰 볼 수가 없다.
 *
 * **화면에 시간대는 적지 않는다.** 쓰는 시간대가 하나뿐이라 `KST` 를 달아 두면 구별할 것이
 * 있는 것처럼 읽히고, 짧게 보려고 만든 값만 길어진다. 원본(ISO·UTC)은 title 로 남긴다.
 */
export function formatBuildStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  // en-CA 는 `2026-08-13, 23:24` 로 준다 — 어느 브라우저에서도 ISO 순서라 자르기만 하면 된다.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUILD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  const [date, time] = formatted.split(', ');
  if (!date || !time) return '—';
  // 자정을 24시로 주는 런타임이 있다.
  return `${date.replace(/-/g, '')}_${time.replace(/^24:/, '00:').replace(':', '')}`;
}
