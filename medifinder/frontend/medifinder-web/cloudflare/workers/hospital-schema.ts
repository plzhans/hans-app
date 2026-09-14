/**
 * 병원 하나를 설명하는 구조화 데이터. 상세에서만 내보낸다.
 * 서비스 자체를 설명하는 것은 site-schema.ts 다.
 */
import { script } from './jsonld';
import type { Hospital, TransportRoute } from './hospital';

/**
 * 항목 이름. 값은 서버가 번역해 주지만 이름은 화면이 붙인다.
 * 상세 화면이 쓰는 clinic.* 키를 그대로 받는다. 여기서 따로 만들면 같은 뜻의 라벨이
 * 두 벌이 되어 화면과 검색 결과의 용어가 갈린다.
 */
export type SchemaLabels = {
  /** clinic.beds — 병상 */
  beds: string;
  /** clinic.bedField.total — 허가 병상 */
  bedsTotal: string;
  /** clinic.bedField.icu — 중환자실 */
  bedsIcu: string;
  /** clinic.staffField.specialist — 전문의 */
  specialists: string;
  /** clinic.equipments — 보유 장비 */
  equipment: string;
  /** clinic.specialCare — 특수진료 */
  specialCare: string;
  /** clinic.assessment.title — 심평원 병원평가 */
  assessment: string;
  /** clinic.tabs.location — 위치 */
  location: string;
  /** clinic.transport.publicTransit — 대중교통 */
  transit: string;
  /** home.sections.emergency.title — 응급실 */
  emergency: string;
};

/** 종별 → schema.org 타입. 코드는 /healthcare/meta/classes 의 값이다. */
const TYPE_BY_CATEGORY: Record<string, string> = {
  TERTIARY: 'Hospital',
  GENERAL: 'Hospital',
  HOSPITAL: 'Hospital',
  SPECIALTY: 'Hospital',
  NURSING: 'Hospital',
  MENTAL: 'Hospital',
  TB_HOSP: 'Hospital',
  LEPROSY_HOSP: 'Hospital',
  GERIATRIC: 'Hospital',
  DEMENTIA: 'Hospital',
  KM_GENERAL: 'Hospital',
  KM_HOSPITAL: 'Hospital',
  DENTAL_HOSP: 'Dentist',
  DENTAL_CLINIC: 'Dentist',
  PHARMACY: 'Pharmacy',
  CLINIC: 'MedicalClinic',
  KM_CLINIC: 'MedicalClinic',
  MIDWIFE: 'MedicalClinic',
  HEALTH_CENTER: 'MedicalClinic',
  HEALTH_SUB: 'MedicalClinic',
  HEALTH_MED: 'MedicalClinic',
  HEALTH_POST: 'MedicalClinic',
};

/** 서버는 월요일을 1 로 센다. 8 은 공휴일인데 schema.org 에 대응이 없어 버린다. */
const DAY_OF_WEEK = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** '0900' → '09:00'. 형식이 어긋나면 그 줄을 버린다(틀린 시간을 내보내는 것보다 낫다). */
function toTime(value: string | undefined): string | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  return `${value.slice(0, 2)}:${value.slice(2)}`;
}

/** '20031219' → '2003-12-19' */
function toDate(value: string | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
}

/**
 * 교통편 한 줄. `9호선 샛강역 2번출구 (150M · kbs별관방향)` 처럼 만든다.
 * 지하철·버스·기타가 필드 구성이 같아 하나로 처리한다. 빈 칸은 알아서 빠진다.
 */
function transportLine(t: TransportRoute): string | null {
  const head = [t.line, t.arrival].filter(Boolean).join(' ').trim();
  if (!head) return null;
  const tail = [t.distance, t.dir, t.note].filter(Boolean).join(' · ').trim();
  return tail ? `${head} (${tail})` : head;
}

function prop(name: string, value: string | number) {
  return { '@type': 'PropertyValue', name, value };
}

/**
 * 병원 상세의 구조화 데이터(JSON-LD). <head> 에 실린다.
 *
 * 본문을 서버에서 그리게 된 뒤에도 남겨 둔다. 검색엔진에 "이 페이지의 사실"을 형식으로
 * 넘기는 통로라, 본문을 파싱하는 것보다 정확하고 화면에 영향이 없다.
 *
 * schema.org 에 대응이 있는 것만 고유 속성으로 쓴다. 없는 것(병상 수·전문의 수·장비·
 * 심평원 평가)은 additionalProperty 로 낸다. 비슷한 속성에 밀어 넣으면 형식은 통과해도
 * 뜻이 틀린 데이터가 된다.
 *
 * 수량에 unitText 를 붙이지 않는다. 그 자리는 cm·kg 같은 물리 단위용이고 '대'·'명' 은
 * 한국어 수량사다. 이름에 이미 '병상'·'전문의' 가 있어 숫자만으로 통한다.
 */
export function hospitalJsonLd(
  h: Hospital,
  url: string,
  L: SchemaLabels,
  site: { url: string; lang: string },
): string | null {
  if (!h.name) return null;

  const type = TYPE_BY_CATEGORY[h.category?.code ?? ''] ?? 'MedicalClinic';
  const region = h.location?.region;

  /*
    진료과목은 department 로 낸다. medicalSpecialty 는 값이 MedicalSpecialty 열거형이라
    '내과' 같은 한국어 문자열을 넣으면 형식상 틀린 데이터가 된다.
    department 는 Organization 을 받으므로 이름을 그대로 실을 수 있다.
  */
  const departments = (h.subjects ?? [])
    .filter((s) => s.name)
    .map((s) => ({ '@type': 'MedicalClinic', name: s.name }));

  /*
    진료시간은 일반 진료(general)만 낸다. 달빛어린이 같은 다른 종류를 같은 목록에 섞으면
    "이 시간에 모든 진료를 한다" 는 뜻이 되어 사실과 달라진다.
  */
  const hours = (h.hours ?? [])
    .filter((x) => x.kind === 'general' && x.day >= 1 && x.day <= 7)
    .map((x) => {
      const opens = toTime(x.open);
      const closes = toTime(x.close);
      if (!opens || !closes) return null;
      return {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAY_OF_WEEK[x.day]}`,
        opens,
        closes,
      };
    })
    .filter(Boolean);

  // schema.org 에 고유 속성이 없는 것들.
  // 심평원 평가등급을 AggregateRating 으로 매핑하지 말 것. 그건 이용자 리뷰의 평균이고
  // 이건 규제기관 평가라, 리뷰 별점으로 둔갑한다.
  const extra: ReturnType<typeof prop>[] = [];

  // 찾아오는 길과 교통편. 상가 몇 동 몇 호처럼 주소만으로는 못 찾는 정보가 여기 있고,
  // "샛강역 병원" 같은 역 이름 검색에도 이 줄이 닿는다.
  if (h.directions) extra.push(prop(L.location, h.directions.replace(/\s+/g, ' ').trim()));
  const routes = [
    ...(h.transport?.subway ?? []),
    ...(h.transport?.bus ?? []),
    ...(h.transport?.etc ?? []),
  ];
  for (const route of routes) {
    const line = transportLine(route);
    if (line) extra.push(prop(route.kindName ? `${L.transit} · ${route.kindName}` : L.transit, line));
  }

  if (h.beds?.total) extra.push(prop(L.bedsTotal, h.beds.total));
  if (h.beds?.icu) extra.push(prop(`${L.beds} · ${L.bedsIcu}`, h.beds.icu));
  if (h.staff?.specialist) extra.push(prop(L.specialists, h.staff.specialist));
  for (const e of h.equipments ?? []) {
    if (e.name) extra.push(prop(`${L.equipment} · ${e.name}`, e.count ?? 1));
  }
  for (const c of h.capabilities ?? []) {
    if (c.name) extra.push(prop(L.specialCare, c.name));
  }
  for (const g of h.assessment?.groups ?? []) {
    for (const item of g.items ?? []) {
      if (item.name && item.grade) {
        extra.push(prop(`${L.assessment} · ${item.name}`, item.grade));
      }
    }
  }

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type,
    /*
      @id 가 없으면 이 노드를 가리킬 방법이 없다. 언어마다 다른 문서이므로 canonical 을
      기준으로 잡는다 — 네 언어가 같은 @id 를 쓰면 inLanguage 가 서로 모순된다
      (site-schema.ts 의 WebSite·WebPage 가 같은 이유로 갈라져 있다).
    */
    '@id': `${url}#hospital`,
    name: h.name,
    url,
    inLanguage: site.lang,
    // 이 병원 문서가 어느 사이트의 것인지. 없으면 그래프에서 떠 있는 노드가 된다.
    isPartOf: { '@id': `${site.url}/#website` },
  };

  if (h.intro) data.description = h.intro.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (h.tel) data.telephone = h.tel;

  if (h.location?.address) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: h.location.address,
      addressLocality: region?.name,
      addressRegion: region?.sido?.name,
      postalCode: h.location.postNo,
      addressCountry: 'KR',
    };
  }
  /*
    좌표(geo)는 넣지 않는다. 빠뜨린 게 아니라 빼기로 한 것이다.

    값 자체는 공개 데이터지만, 모든 상세의 <head> 에 박아 두면 페이지를 긁는 것만으로
    전국 병원 좌표 데이터셋이 통째로 복사된다. 지역 검색에서 좌표는 보조 신호이고
    주소(address)가 있으면 검색엔진이 지오코딩하므로 잃는 것은 크지 않다.
  */

  const founded = toDate(h.establishedAt);
  if (founded) data.foundingDate = founded;
  if (departments.length) data.department = departments;
  if (hours.length) data.openingHoursSpecification = hours;
  if (h.emergency) data.availableService = { '@type': 'MedicalProcedure', name: L.emergency };
  if (extra.length) data.additionalProperty = extra;

  return script(data);
}

