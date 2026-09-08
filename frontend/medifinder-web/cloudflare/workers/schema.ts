import type { Hospital, TransportRoute } from './hospital';

/**
 * 항목 이름. 값은 서버가 Accept-Language 로 번역해 주지만 **이름은 화면이 붙인다.**
 * 그래서 상세 화면이 쓰는 clinic.* 키를 그대로 받는다 — 여기서 따로 만들면
 * 같은 뜻의 라벨이 두 벌이 되고, 화면과 검색 결과의 용어가 갈린다.
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
};

/**
 * 병원 상세의 구조화 데이터(JSON-LD).
 *
 * **왜 head 에 넣나.** 이 앱은 CSR 이라 크롤러가 본문을 못 읽는다. JSON-LD 는 검색엔진에
 * "이 페이지의 사실"을 넘기려고 만들어진 형식이라, 본문 없이도 이름·주소·전화·진료시간·
 * 진료과를 정확히 전달한다. 화면에 아무 영향이 없어 레이아웃 이동 위험도 없다.
 *
 * **이미 부르고 있는 단일 조회 응답만 쓴다.** 상세 화면은 주변 병원을 따로 부르지만
 * 여기서는 부르지 않는다 — 메타 하나 붙이자고 왕복을 늘리지 않는다.
 *
 * **schema.org 에 대응이 있는 것만 고유 속성으로 쓴다.** 없는 것(병상 수·전문의 수·장비·
 * 심평원 평가)은 additionalProperty 로 내보낸다. 억지로 비슷한 속성에 밀어 넣으면
 * 형식은 통과해도 뜻이 틀린 데이터가 된다.
 */

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
 * **단위(unitText)는 쓰지 않는다.** schema.org 의 unitText 는 cm·kg 처럼 물리 단위를
 * 적는 자리인데, '대'·'개'·'명' 은 한국어 수량사라 성격이 다르다. 이름에 이미
 * '병상 수'·'의사 수' 라고 적혀 있어 숫자만으로 뜻이 통한다.
 */
/**
 * 교통편 한 줄. `9호선 샛강역 2번출구 (150M · kbs별관방향)` 처럼 만든다.
 * 지하철·버스·기타가 필드 구성이 같아 하나로 처리한다 — 빈 칸은 알아서 빠진다.
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
 * 홈에만 붙는다. 서비스 자체가 무엇인지 알리는 자리다.
 *
 * WebSite 의 SearchAction 은 검색 결과에 **사이트 내 검색창**을 띄우는 신호다. 붙인다고
 * 반드시 뜨지는 않지만(구글이 정한다) 이게 없으면 후보에도 안 오른다.
 *
 * 두 덩어리를 @graph 로 묶어 한 블록에 낸다 — script 를 둘로 나눌 이유가 없다.
 */
export function siteJsonLd(siteUrl: string, canonical: string, lang: string): string {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'MediFinder',
        url: siteUrl,
        // 정사각 아이콘이다. 구글은 로고에 112x112 이상을 요구한다.
        logo: `${siteUrl}/apple-touch-icon.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'MediFinder',
        url: canonical,
        inLanguage: lang,
        publisher: { '@id': `${siteUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          // 검색 화면이 읽는 쿼리 이름과 같아야 한다(useSearchState 의 `q`).
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${canonical.replace(/\/$/, '')}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
  return script(data);
}

export function hospitalJsonLd(
  h: Hospital,
  url: string,
  L: SchemaLabels,
): string | null {
  if (!h.name) return null;

  const type = TYPE_BY_CATEGORY[h.category?.code ?? ''] ?? 'MedicalClinic';
  const region = h.location?.region;

  /*
    진료과목은 department 로 낸다. **medicalSpecialty 를 쓰지 않는 이유**가 있다 —
    그 속성의 값은 MedicalSpecialty 열거형(Cardiovascular 같은 정해진 값)이라
    '내과' 같은 한국어 문자열을 넣으면 형식상 틀린 데이터가 된다.
    department 는 Organization 을 받으므로 이름을 그대로 실을 수 있다.
  */
  const departments = (h.subjects ?? [])
    .filter((s) => s.name)
    .map((s) => ({ '@type': 'MedicalClinic', name: s.name }));

  /*
    진료시간. 일반 진료(general)만 낸다 — 달빛어린이 같은 다른 종류를 같은 목록에 섞으면
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

  /*
    schema.org 에 고유 속성이 없는 것들. **심평원 평가등급이 여기 있는 게 핵심이다** —
    AggregateRating 으로 매핑하면 안 된다. 그건 이용자 리뷰의 평균을 뜻하는데, 이건
    규제기관이 매긴 평가라 뜻이 완전히 다르다. 리뷰 별점으로 둔갑시키는 셈이 된다.
  */
  const extra: ReturnType<typeof prop>[] = [];
  /*
    찾아오는 길과 교통편. **주소만으로는 못 찾는 병원이 많다** — 상가 몇 동 몇 호,
    무슨 건물 몇 층 같은 정보가 여기 들어 있고, 상세 화면도 그대로 보여준다.
    "샛강역 병원" 처럼 역 이름으로 찾는 검색에도 이 줄이 닿는다.
  */
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
    name: h.name,
    url,
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
    **좌표(geo)는 일부러 넣지 않는다.**

    값 자체가 비밀은 아니다 — 화면이 지도를 그리려고 이미 받아 쓰고, 원본도 공개 데이터다.
    문제는 **모아 놓은 것**이다. 모든 상세 페이지의 <head> 에 좌표를 박아 두면 페이지를
    긁는 것만으로 전국 병원 좌표 데이터셋이 통째로 복사된다. 우리가 들인 품은 개별 값이
    아니라 그 묶음에 있다.

    잃는 것은 크지 않다. 지역 검색에서 좌표는 보조 신호이고, 주소(address)가 있으면
    검색엔진이 알아서 지오코딩한다.

    **되돌리고 싶어지면 그때 의도해서 넣을 것.** 없어서 빠진 게 아니라 빼기로 한 것이다.
  */

  const founded = toDate(h.establishedAt);
  if (founded) data.foundingDate = founded;
  if (departments.length) data.department = departments;
  if (hours.length) data.openingHoursSpecification = hours;
  if (h.emergency) data.availableService = { '@type': 'MedicalProcedure', name: '응급실' };
  if (extra.length) data.additionalProperty = extra;

  return script(data);
}

/*
  **줄바꿈해서 낸다.** 한 줄로 뽑으면 소스 보기에서 수 KB 가 가로로 이어져 사람이 못 읽는다.
  늘어나는 바이트는 전송 시 압축돼 사실상 사라진다.

  `</script>` 가 문자열 안에 들어가면 브라우저가 스크립트를 거기서 끊는다.
  병원 소개는 사람이 쓴 자유 텍스트라 무엇이든 들어올 수 있다.
*/
function script(data: unknown): string {
  const json = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  const indented = json.split('\n').join('\n    ');
  return `<script type="application/ld+json">\n    ${indented}\n    </script>`;
}
