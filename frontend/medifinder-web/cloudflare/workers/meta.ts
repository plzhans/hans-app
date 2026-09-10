import type { Env } from './env';
import { langPath, type Lang } from './routing';
import { fetchHospital } from './hospital';
import { hospitalJsonLd, siteJsonLd } from './schema';

export type Meta = {
  title: string;
  description: string;
  /** 검색 결과에 내보내지 않을 화면. robots 메타로 나간다. */
  noindex?: boolean;
  /** 병원 상세에서만 실린다. 항목 이름이 번역 파일에 있어 여기서 만든다. */
  jsonLd?: string;
};

/**
 * 경로 → 이 화면의 제목·설명.
 *
 * **번역 파일은 화면과 같은 것을 쓴다.** 문장을 여기 따로 적으면 화면이 보여주는 제목과
 * 크롤러가 읽는 제목이 갈린다. 같은 파일을 읽고 같은 자리표시자를 채운다.
 */
export async function metaFor(
  lang: Lang,
  path: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Meta | null> {
  const dict = await loadDict(lang);
  const suffix = dict.seo.titleSuffix;

  // 병원 상세·비급여. 여기만 API 를 부른다.
  const hospitalMatch = /^\/hospitals\/(\d+)(\/npay)?\/?$/.exec(path);
  if (hospitalMatch) {
    const hospital = await fetchHospital(hospitalMatch[1], lang, env, ctx);
    // 못 받으면 손대지 않는다. 껍데기의 기본 제목이 그대로 나가는 편이,
    // 병원 이름 자리가 빈 제목보다 낫다.
    if (!hospital) return null;

    const region = [
      hospital.location?.region?.sido?.name,
      hospital.location?.region?.name,
    ]
      .filter(Boolean)
      .join(' ');
    const npay = !!hospitalMatch[2];

    return {
      // 비급여는 가격표 화면이라 병원 자체의 구조화 데이터를 싣지 않는다 —
      // 같은 병원이 서로 다른 URL 로 두 번 선언되면 어느 쪽이 정본인지 흐려진다.
      jsonLd: npay
        ? undefined
        : (hospitalJsonLd(hospital, `${env.VITE_SITE_URL}${langPath(path, lang)}`, {
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
      title:
        (npay ? fill(dict.seo.npay.title, { name: hospital.name }) : hospital.name) +
        suffix,
      description: fill(
        npay ? dict.seo.npay.description : dict.seo.hospital.description,
        { name: hospital.name, region },
      ),
    };
  }

  if (path === '/') {
    return {
      title: dict.seo.home.title + suffix,
      description: dict.seo.home.description,
      jsonLd: siteJsonLd(env.VITE_SITE_URL, `${env.VITE_SITE_URL}${langPath(path, lang)}`, lang),
    };
  }

  if (path === '/search') {
    // 조건별 제목(지역·진료과)은 화면이 만든다 — 그건 URL 쿼리를 읽고 코드표를 조회해야
    // 나오는 값이다. 크롤러에게는 조건 없는 기본형이면 충분하다.
    return {
      title: fill(dict.search.heading, { type: dict.search.tabs.hospital }) + suffix,
      description: dict.seo.search.description,
    };
  }

  if (path.startsWith('/terms/')) {
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

  return { title: dict.seo.default.title + suffix, description: dict.seo.default.description };
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
 * 동적 import 지만 **런타임에 받아오는 게 아니다** — esbuild 가 정적 분석해서 네 로케일을
 * 전부 번들에 넣는다. 이미 안에 있는 것을 고르는 것이라 지연이 없다.
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
