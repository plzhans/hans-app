/**
 * 병원 매칭용 문자열·좌표 유틸.
 *
 * 이름 유사도는 SQL 로 못 한다(MySQL 에 bigram Jaccard 가 없다). 그래서 매칭은 DB 조인이 아니라
 * 메모리에서 계산한다. 데이터가 작아서 가능하다 — 양쪽 8만 행 × 4필드면 약 15MB 다.
 */

/** 법인격 표기. 같은 병원인데 한쪽에만 붙어 있는 경우가 많다. */
const LEGAL_PREFIXES =
  /의료법인|재단법인|사회복지법인|학교법인|의료재단|주식회사|사단법인|특수법인|지방공사|\(의\)|\(재\)|\(사\)|\(주\)/g;

/**
 * 병원명 정규화.
 *
 * 실측한 표기 차이:
 *   "가톨릭대학교여의도성모병원" vs "가톨릭대학교 여의도성모병원"   ← 공백
 *   "의료법인우리아이들의료재단우리아이들병원" vs "우리아이들병원"   ← 법인격
 *   "로앤산부인과의원 건대입구역" vs "로앤산부인과의원"             ← 지점 표기 (이건 못 지운다)
 */
export function normalizeName(name: string | null | undefined): string {
  return String(name ?? '')
    .replace(LEGAL_PREFIXES, '')
    .replace(/[\s()[\]\-.,'"·]/g, '')
    .toLowerCase();
}

/** 전화번호는 숫자만 남긴다. 하이픈 유무가 기관마다 다르다. */
export function normalizeTel(tel: string | null | undefined): string {
  return String(tel ?? '').replace(/[^0-9]/g, '');
}

/**
 * 문자 bigram Jaccard 유사도. 0~1.
 *
 * 한글에는 편집거리(Levenshtein)보다 이쪽이 낫다. 한 글자가 곧 한 형태소에 가까워서
 * 삽입·삭제 한 번의 비용이 과대평가되기 때문이다.
 *
 *   강북제일의원 vs 강북제일외과의원
 *     {강북,북제,제일,일의,의원} ∩ {강북,북제,제일,일외,외과,과의,의원} = 4
 *     합집합 8 → 0.50   ← 같은 병원인데 진료과목이 이름에 붙은 경우
 *   더본병원 vs 올센병원
 *     {더본,본병,병원} ∩ {올센,센병,병원} = 1, 합집합 5 → 0.20   ← 다른 병원
 */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  // 한 글자짜리 이름은 bigram 이 안 나온다. 그때는 완전일치만 인정한다.
  if (a.length === 1 || b.length === 1) {
    return 0;
  }

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const setA = bigrams(a);
  const setB = bigrams(b);

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 두 좌표 사이 거리 (m). Haversine. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}
