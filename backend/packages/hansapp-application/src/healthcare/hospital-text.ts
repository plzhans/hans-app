/**
 * 병원 자유 텍스트(이름·소개·안내·주차·교통)의 언어를 고른다.
 *
 * 코드 이름을 고르는 pickName 의 짝이다. 다만 규칙이 하나 더 있다 —
 * **원문이 없으면 번역도 버린다.**
 *
 * `COALESCE(i.park_note, h.park_note)` 로 끝내면 안 되는 이유:
 *
 *   1. 병원이 "진료 시 2시간 무료 주차" 를 올린다  → 번역: "2 hours free parking"
 *   2. 병원이 무료 주차를 폐지한다                 → 원문이 NULL 이 된다
 *   3. COALESCE 는 번역이 살아 있으니 그걸 내놓는다 → **폐지된 무료 주차가 영어로 계속 나온다**
 *
 * 재번역 대상 조회는 `h.park_note IS NOT NULL` 로 거르므로 이 병원을 아예 안 잡는다.
 * 즉 **영원히 안 고쳐진다.** 게다가 한국어 화면에서는 정상으로 보여서(원문이 없으니 안 나온다)
 * 아무도 신고하지 않는다. 외국어 사용자만 조용히 틀린 정보를 본다.
 *
 * 번역은 원문의 그림자다. 원문이 사라지면 그림자도 사라져야 한다.
 *
 * (DB 에 좀비 번역이 남는 건 별도 정리 잡이 민다. 하지만 그 잡이 한 번도 안 돌아도
 *  화면은 여기서 이미 맞는다 — 정리 잡을 신뢰하지 않는다.)
 */
export function pickText<T>(source: T | null, translated: T | null): T | null {
  if (source == null) {
    return null;
  }
  return translated ?? source;
}

/**
 * 번역된 이름 옆에 붙일 한국어 원문.
 *
 * **왜 필요한가.** 외국인이 영문 상세 페이지 링크를 한국인 지인에게 보낸다. 받은 사람이
 * 언어를 바꾸지 않고도 어느 병원인지 바로 알아야 한다. 병원명은 고유명사라 번역만으로는
 * 현실 세계와 연결되지 않는다 — 간판도 한국어고, 지도 검색도 한국어로 걸린다.
 *
 * **번역이 실제로 있을 때만 준다.** 없으면 name 이 이미 한국어로 폴백되므로, 여기까지 주면
 * 같은 이름이 화면에 두 번 나온다. 이 필드가 있다 = 병기할 값이 있다 —
 * 프론트는 `{nameKo && …}` 한 줄이면 된다.
 *
 * 주소도 같은 이유로 병기해야 하지만, 주소 번역 자체가 아직 없다(좌표·주소 API 로 풀어야 함).
 * 그때 addrKo 를 같은 규칙으로 붙이면 된다.
 */
export function annotateKo(source: string, translated: string | null): string | undefined {
  return translated && translated !== source ? source : undefined;
}
