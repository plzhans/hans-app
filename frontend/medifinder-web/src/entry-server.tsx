/**
 * 서버(Cloudflare 워커)에서 화면을 그리는 진입점. entry-client.tsx 의 짝이다.
 *
 * 병원 상세만 그린다. 홈·검색은 크롤러가 읽을 본문이 사실상 없고, 약관은 색인 대상이
 * 아니다 — 그 경로들은 워커가 <head> 만 채우고 지나간다.
 *
 * 브라우저 전역(window·document)에 손대는 코드는 전부 이펙트 안에 있어 여기서는 돌지 않는다.
 */
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
import { getHealthcareHospitalControllerGetQueryKey } from '@/shared/api/generated/react/healthcare/healthcare';
import type { HospitalDetailDto } from '@/shared/api/generated/model';

export type RenderResult = {
  /** <div id="root"> 안에 넣을 마크업. */
  html: string;
  /** 브라우저가 같은 데이터로 다시 부르지 않도록 넘겨주는 react-query 캐시. */
  state: string;
};

/**
 * 병원 상세 한 페이지를 그린다.
 *
 * hospital 은 **워커가 이미 받아 둔 상세 응답**이다. 여기서 다시 부르지 않는다 —
 * 캐시에 직접 심어서, 화면이 그걸 로딩 없이 그대로 그린다.
 * 그 밖의 쿼리(근처 병원·비급여)는 이펙트에서 시작하므로 서버에서는 비어 있고,
 * 브라우저도 같은 상태에서 첫 렌더를 시작한다.
 */
export async function renderHospital(opts: {
  url: string;
  lang: SupportedLanguage;
  id: number;
  hospital: HospitalDetailDto;
}): Promise<RenderResult> {
  // 요청마다 새 인스턴스다. 전역 i18n 의 언어를 바꾸면 같은 아이솔레이트에서 동시에 처리 중인
  // 다른 언어 요청이 그 값을 같이 본다.
  const requestI18n = i18n.cloneInstance({ lng: opts.lang, initAsync: false });

  const queryClient = createQueryClient();
  queryClient.setQueryData(
    getHealthcareHospitalControllerGetQueryKey(opts.id),
    opts.hospital,
  );

  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(opts.url));
  // 라우트가 Response 를 던지는 경우(리다이렉트 등). 상세에는 로더가 없어 오지 않지만,
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
