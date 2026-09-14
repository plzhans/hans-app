import type { Env } from './env';
import { langPath, matchRoute, type Lang } from './routing';
import { fetchHospital, fetchNearby, type Hospital, type Nearby } from './hospital';
import { fetchHomeSections, type HomeSection } from './home';
import { hospitalJsonLd } from './hospital-schema';
import { siteJsonLd } from './site-schema';
import { NEARBY_SIZE } from '../../dist-server/entry-server.js';

export type Meta = {
  title: string;
  description: string;
  /** 검색 결과에 내보내지 않을 화면. robots 메타로 나간다. */
  noindex?: boolean;
  /** 없는 문서. main.ts 가 이걸 보고 404 상태로 내보낸다. */
  notFound?: boolean;
  /** 병원 상세에서만 실린다. 항목 이름이 번역 파일에 있어 여기서 만든다. */
  jsonLd?: string;
  /**
   * 본문까지 그릴 화면이면 그 재료. 여기서 받아 실어 보내면 렌더가 다시 부르지 않는다.
   * 일부가 null 이어도 나머지는 그대로 그린다.
   */
  render?:
    | { kind: 'hospital'; id: number; hospital: Hospital; nearby: Nearby | null }
    | { kind: 'home'; sections: (HomeSection | null)[] };
};

/**
 * 경로 → 이 화면의 제목·설명.
 *
 * 번역 파일은 화면과 같은 것을 쓴다. 문장을 여기 따로 적으면 화면이 보여주는 제목과
 * 크롤러가 읽는 제목이 갈린다.
 */
export async function metaFor(
  lang: Lang,
  path: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Meta | null> {
  const dict = await loadDict(lang);
  const suffix = dict.seo.titleSuffix;
  const route = matchRoute(path);

  // 라우트 테이블에 없는 주소. 예전에는 여기서도 기본 제목을 붙여 200 으로 내보냈는데,
  // 그게 오타 난 주소까지 색인 대상으로 만들었다.
  if (route.kind === 'unknown') {
    return { notFound: true, title: dict.seo.notFound.title + suffix, description: dict.seo.notFound.description };
  }

  if (route.kind === 'hospital') {
    const { id, npay } = route;
    // 병렬로 부른다. 순서대로 부르면 두 응답 시간이 더해지는데, 서로 필요 없는 값이다.
    // 비급여는 본문을 그리지 않으므로 nearby 도 받지 않는다.
    const [hospital, nearby] = await Promise.all([
      fetchHospital(id, lang, env, ctx),
      npay ? null : fetchNearby(id, NEARBY_SIZE, lang, env, ctx),
    ]);

    // 없는 병원이면 404 다. 폐업·통합으로 사라진 ID 가 사이트맵에 남아 있어도
    // 여기서 걸러진다.
    if (hospital.status === 'missing') {
      return { notFound: true, title: dict.seo.notFound.title + suffix, description: dict.seo.notFound.description };
    }
    // API 장애. 손대지 않는다 — 껍데기의 기본 제목이 그대로 나가는 편이, 병원 이름
    // 자리가 빈 제목보다 낫다. 여기서 404 를 주면 서버가 흔들릴 때마다 멀쩡한 상세가
    // 색인에서 빠진다.
    if (hospital.status === 'error') return null;

    const detail = hospital.data;
    const region = [detail.location?.region?.sido?.name, detail.location?.region?.name]
      .filter(Boolean)
      .join(' ');

    return {
      // 비급여 화면은 그리지 않는다. 가격표가 최다 1,048행이라 렌더 비용이 상세와 다른
      // 급이고, 크롤러에게 보여줄 값도 병원 자체의 정보가 아니다.
      render: npay ? undefined : { kind: 'hospital', id: Number(id), hospital: detail, nearby },
      // 비급여는 가격표 화면이라 병원 자체의 구조화 데이터를 싣지 않는다 —
      // 같은 병원이 서로 다른 URL 로 두 번 선언되면 어느 쪽이 정본인지 흐려진다.
      jsonLd: npay
        ? undefined
        : (hospitalJsonLd(detail, `${env.VITE_SITE_URL}${langPath(path, lang)}`, {
            beds: dict.clinic.beds,
            bedsTotal: dict.clinic.bedField.total,
            bedsIcu: dict.clinic.bedField.icu,
            specialists: dict.clinic.staffField.specialist,
            equipment: dict.clinic.equipments,
            specialCare: dict.clinic.specialCare,
            assessment: dict.clinic.assessment.title,
            location: dict.clinic.tabs.location,
            transit: dict.clinic.transport.publicTransit,
          }) ?? undefined),
      title: (npay ? fill(dict.seo.npay.title, { name: detail.name }) : detail.name) + suffix,
      description: fill(npay ? dict.seo.npay.description : dict.seo.hospital.description, {
        name: detail.name,
        region,
      }),
    };
  }

  if (route.kind === 'home') {
    const sections = await fetchHomeSections(lang, env, ctx);
    return {
      // 하나도 못 받았으면 그릴 것이 없다. 껍데기를 그대로 내보낸다.
      render: sections.some(Boolean) ? { kind: 'home', sections } : undefined,
      title: dict.seo.home.title + suffix,
      description: dict.seo.home.description,
      jsonLd: siteJsonLd(env.VITE_SITE_URL, `${env.VITE_SITE_URL}${langPath(path, lang)}`, lang),
    };
  }

  if (route.kind === 'search') {
    /*
      조건별 제목(지역·진료과)은 화면이 만든다 — 그건 URL 쿼리를 읽고 코드표를 조회해야
      나오는 값이다. 크롤러에게는 조건 없는 기본형이면 충분하다.

      색인하지 않는다. 본문을 그리지 않아서 크롤러가 받는 것은 빈 껍데기뿐이고,
      내용 없는 문서가 8만 개 상세와 같은 사이트에 섞이면 전체 평가만 깎는다.
      본문을 서버에서 그리게 되면 그때 푼다.
    */
    return {
      noindex: true,
      title: fill(dict.search.heading, { type: dict.search.tabs.hospital }) + suffix,
      description: dict.seo.search.description,
    };
  }

  if (route.kind === 'terms') {
    /*
      약관·방침은 색인하지 않는다. 검색해서 들어올 문서가 아니고, 로케일마다 같은
      한국어 원문이라(문서 자체가 한국어 전용) 중복 신호만 만든다.
      크롤은 막지 않는다 — noindex 를 보려면 크롤은 돼야 한다.
    */
    return {
      noindex: true,
      title: dict.seo.default.title + suffix,
      description: dict.seo.legal.description,
    };
  }

  // 마이페이지·로그인 콜백. 로그인해야 내용이 있거나 화면이랄 것이 없다.
  return {
    noindex: true,
    title: dict.seo.default.title + suffix,
    description: dict.seo.default.description,
  };
}

/** i18next 와 같은 `{{name}}` 자리표시자. 비는 자리 때문에 생긴 빈칸도 정리한다. */
function fill(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 화면이 쓰는 번역 파일 그대로.
 *
 * 동적 import 지만 런타임에 받아오지 않는다. esbuild 가 정적 분석해서 네 로케일을 전부
 * 번들에 넣으므로, 이미 안에 있는 것을 고르는 셈이라 지연이 없다.
 */
async function loadDict(lang: Lang) {
  switch (lang) {
    case 'en-us':
      return (await import('../../src/shared/i18n/locales/en-us.json')).default;
    case 'ja':
      return (await import('../../src/shared/i18n/locales/ja.json')).default;
    case 'zh-hans':
      return (await import('../../src/shared/i18n/locales/zh-hans.json')).default;
    default:
      return (await import('../../src/shared/i18n/locales/ko.json')).default;
  }
}
