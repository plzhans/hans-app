/**
 * 서버(Cloudflare 워커)에서 화면을 그리는 진입점. entry-client.tsx 의 짝이다.
 *
 * 병원 상세와 홈만 그린다. 검색은 결과가 사용자 입력에 달렸고 약관은 색인 대상이 아니다.
 * 그 경로들은 워커가 <head> 만 채우고 지나간다.
 *
 * 브라우저 전역(window·document)에 손대는 코드는 전부 이펙트 안에 있어 여기서는 돌지 않는다.
 */
import type { QueryClient } from '@tanstack/react-query';
import { renderToReadableStream } from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router-dom';
import { dehydrate } from '@tanstack/react-query';
import i18n from '@/shared/i18n';
import type { SupportedLanguage } from '@/shared/i18n';
import { Providers, createQueryClient } from '@/app/Providers';
import { routes } from '@/app/routes';
import {
  getHealthcareHospitalControllerGetQueryKey,
  getHealthcareHospitalControllerNearbyQueryKey,
  getHealthcareHospitalControllerSearchQueryKey,
  getHealthcareHospitalControllerSearchUrl,
} from '@/shared/api/generated/react/healthcare/healthcare';
import { NEARBY_SIZE } from '@/features/clinic/api';
import { HOME_SECTION_PARAMS } from '@/features/home/pages/Home';
import type {
  RenderHomeInput,
  RenderHospitalInput,
  RenderResult,
  SsrLang,
} from '@/shared/ssr/contract';

/*
  계약의 언어 코드(SsrLang)가 화면의 것과 갈리면 여기서 컴파일이 깨진다.
  계약 파일은 워커 설정에서도 읽혀야 해서 shared/i18n 을 import 할 수 없고,
  그래서 목록을 두 번 적는다. 이 줄이 둘을 묶어 둔다.
*/
const _sameLang: SsrLang extends SupportedLanguage
  ? SupportedLanguage extends SsrLang
    ? true
    : never
  : never = true;
void _sameLang;

/**
 * 워커가 nearby 를 받아 올 때 쓸 개수. 화면(useHospitalNearby)이 정한 값을 그대로 내보낸다.
 * 어긋나면 react-query 키가 달라져서 브라우저가 같은 것을 다시 부른다.
 */
export { NEARBY_SIZE };

/**
 * 홈이 그리는 여섯 섹션의 조회 경로. 워커가 이 순서대로 받아 renderHome 에 그대로 돌려준다.
 * 조건은 화면(Home.tsx 의 SECTIONS)이 정한 것이고 여기서는 URL 로 옮기기만 한다.
 */
export const HOME_QUERY_PATHS: string[] = HOME_SECTION_PARAMS.map((params) =>
  getHealthcareHospitalControllerSearchUrl(params),
);

export type { RenderResult };

/**
 * 병원 상세 한 페이지.
 *
 * hospital·nearby 는 워커가 이미 받아 둔 응답이다. 여기서 다시 부르지 않고 캐시에 직접
 * 심어서 화면이 로딩 없이 그린다. 그 밖의 쿼리(비급여·지도)는 이펙트에서 시작하므로
 * 서버에서는 비어 있고, 브라우저도 같은 상태에서 첫 렌더를 시작한다.
 */
export function renderHospital(opts: RenderHospitalInput): Promise<RenderResult> {
  return render(opts.url, opts.lang, (queryClient) => {
    queryClient.setQueryData(
      getHealthcareHospitalControllerGetQueryKey(opts.id),
      opts.hospital,
    );
    if (opts.nearby) {
      queryClient.setQueryData(
        getHealthcareHospitalControllerNearbyQueryKey(opts.id, { size: NEARBY_SIZE }),
        opts.nearby,
      );
    }
  });
}

/**
 * 홈.
 *
 * sections 는 HOME_QUERY_PATHS 와 같은 순서다. 개별 섹션이 null 이면 그 자리만 브라우저가
 * 채운다. 홈은 조회 조건이 고정이라 방문자·언어가 같으면 언제나 같은 페이지이고,
 * 그래서 캐시할 URL 이 언어당 하나뿐이다.
 */
export function renderHome(opts: RenderHomeInput): Promise<RenderResult> {
  return render(opts.url, opts.lang, (queryClient) => {
    HOME_SECTION_PARAMS.forEach((params, i) => {
      const data = opts.sections[i];
      if (!data) return;
      queryClient.setQueryData(getHealthcareHospitalControllerSearchQueryKey(params), data);
    });
  });
}

/**
 * 한 요청을 그린다.
 *
 * i18n 은 요청마다 복제한다. 전역 인스턴스의 언어를 바꾸면 같은 아이솔레이트에서 동시에
 * 처리 중인 다른 언어 요청이 그 값을 같이 본다.
 */
async function render(
  url: string,
  lang: SsrLang,
  seed: (queryClient: QueryClient) => void,
): Promise<RenderResult> {
  const requestI18n = i18n.cloneInstance({ lng: lang, initAsync: false });

  const queryClient = createQueryClient();
  seed(queryClient);

  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(url));
  // 라우트가 Response 를 던지는 경우(리다이렉트 등). 로더를 쓰지 않아 오지 않지만,
  // 오면 그릴 것이 없다.
  if (context instanceof Response) {
    throw new Error(`unexpected Response from static handler: ${context.status}`);
  }

  const router = createStaticRouter(handler.dataRoutes, context);

  const stream = await renderToReadableStream(
    <Providers queryClient={queryClient} i18n={requestI18n}>
      {/*
        hydrate={false} — 기본값은 loaderData 를 담은 <script> 를 트리 안에 같이 그리는
        것인데, 브라우저의 createBrowserRouter 는 그 자리에 아무것도 그리지 않아 hydration 이
        어긋난다. 로더를 쓰지 않아(데이터는 react-query 가 나른다) 담을 것도 없다.
      */}
      <StaticRouterProvider router={router} context={context} hydrate={false} />
    </Providers>,
  );
  // 지연 로드(lazy)된 라우트가 붙을 때까지 기다린다. 스트리밍으로 흘려보내면 껍데기(Suspense
  // fallback)만 나가는데, 우리가 만들려는 건 크롤러가 한 번에 읽을 완성된 HTML 이다.
  await stream.allReady;

  return {
    html: await new Response(stream).text(),
    state: JSON.stringify(dehydrate(queryClient)),
  };
}
