import { resolveLine, type MetroCity } from '../lib/subwayLine';

/**
 * 노선 배지. 노선도의 그 표기다 — **색이 식별자고 글자는 확인용이다.**
 * 숫자 노선은 "4" 한 글자라 동그라미가 되고, "경의중앙" 처럼 이름이 붙으면 알약으로 늘어난다.
 * 공식 노선도가 그렇게 한다 — min-w 와 rounded-full 이 그 두 모양을 같은 규칙으로 만든다.
 *
 * 정식 이름은 title 로 남겨 둔다 — "경의중앙" 이 경의중앙선인 건 알겠지만 "인천1" 을 보고
 * 인천1호선을 떠올리지 못할 사람이 확인할 데가 있어야 한다.
 *
 * full=true 면 약칭 대신 정식 이름("1호선"·"경의중앙선")을 그대로 박는다. 헤더·목록 카드처럼
 * 위치를 한 줄로 압축하는 자리는 약칭(동그라미)이 맞지만, 교통 안내처럼 자리가 넉넉하고
 * 정확한 노선명이 정보인 자리에선 이름을 다 보여주는 게 낫다.
 */
export function LineBadge({
  line,
  city,
  full = false,
}: {
  line: string;
  city?: MetroCity;
  full?: boolean;
}) {
  const resolved = resolveLine(line, city);

  // 색을 못 찾으면("1번출구" 같은 자유 입력 쓰레기값) 원문을 회색 알약에 담는다 —
  // 원본에 뭐가 적혀 있는지가 정보다. 그게 방해가 되는 자리(헤더·목록 카드)는
  // stationLines() 로 걸러 넣으므로 여기까지 오지 않는다.
  if (!resolved) {
    return (
      <span className="rounded bg-surface-subtle px-2 py-0.5 text-sm text-ink">
        {line}
      </span>
    );
  }

  return (
    <span
      title={resolved.label}
      aria-label={resolved.label}
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold leading-none text-white"
      style={{ backgroundColor: resolved.bg }}
    >
      {full ? resolved.label : resolved.short}
    </span>
  );
}
