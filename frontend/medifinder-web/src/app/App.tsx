import { lazy, Suspense, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import {
  createBrowserRouter,
  RouterProvider,
  ScrollRestoration,
  Outlet,
  Navigate,
  useLocation,
  type RouteObject,
} from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { DetailLayout } from './layouts/DetailLayout';
import { LangLayout } from './LangLayout';
import { Spinner } from '@/shared/ui/Spinner';
import { AiSearchProvider } from '@/features/ai-search/model/AiSearchPanel';
import { trackPageView } from '@/shared/analytics/gtag';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@/shared/i18n';
import { stripLang } from '@/shared/i18n/routing';

const Home = lazy(() => import('@/features/home/pages/Home'));
const Search = lazy(() => import('@/features/search/pages/Search'));
const HospitalDetail = lazy(() => import('@/features/clinic/pages/HospitalDetail'));
const HospitalNonPayment = lazy(
  () => import('@/features/clinic/pages/HospitalNonPayment'),
);
const Terms = lazy(() => import('@/features/legal/pages/Terms'));
const LocationTerms = lazy(() => import('@/features/legal/pages/LocationTerms'));
const Privacy = lazy(() => import('@/features/legal/pages/Privacy'));
const NotFound = lazy(() => import('@/features/home/pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

/**
 * 라우트 이동을 GA page_view 로 보낸다. 마운트 때도 한 번 돌아 첫 진입이 함께 잡힌다.
 * 라우터 안에서만 useLocation 을 쓸 수 있어 컴포넌트로 둔다(그리지는 않는다).
 *
 * **기본 언어 접두사(`/ko/...`)는 건너뛴다.** StripKoPrefix 가 곧바로 접두사를 뗀 정식 URL 로
 * 갈아치우므로, 그대로 보내면 한 번의 방문이 `/ko/search` 와 `/search` 두 줄로 집계된다.
 * 버리는 쪽이 중간 URL 이라 잃는 정보도 없다.
 */
function RouteTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const isRedirectingPrefix =
      pathname === `/${DEFAULT_LANGUAGE}` || pathname.startsWith(`/${DEFAULT_LANGUAGE}/`);
    if (isRedirectingPrefix) return;
    trackPageView();
  }, [pathname, search]);
  return null;
}

function Root() {
  return (
    /*
      AI 문의 채팅창은 **라우터 최상단에서 산다.** 레이아웃 안에 두면 화면을 옮길 때마다
      언마운트돼 묻던 것이 사라진다 — 병원 상세를 열어 보고 돌아오는 건 이 기능에서
      가장 흔한 동작이라, 그때 대화가 날아가면 다시 물어야 한다.

      여는 버튼(FAB)은 여전히 MainLayout 에만 있다. 상세에는 하단 전화 바가 그 자리를
      쓰기 때문인데, 그건 **여는 자리**의 문제이지 **떠 있는 창**의 문제가 아니다.
    */
    <AiSearchProvider>
      <RouteTracker />
      <ScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </AiSearchProvider>
  );
}

/**
 * `/ko/...` 로 들어오면 접두사를 떼어 보낸다.
 *
 * 기본 언어는 접두사가 없다(`/search`). 그런데 `/ko/search` 도 같은 내용을 주면 **같은 페이지가
 * 두 URL 에 존재**하게 되고, 검색엔진은 그걸 중복 콘텐츠로 보고 한쪽을 버린다(어느 쪽을
 * 버릴지는 우리가 못 정한다). 그래서 정식 URL 하나로 모은다.
 */
function StripKoPrefix() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${stripLang(pathname)}${search}${hash}`} replace />;
}

/**
 * 언어와 무관한 페이지 트리. 언어마다 이 트리를 그대로 붙인다.
 *
 * **껍데기가 둘이다.** 목록 계열(첫 화면·검색)은 로고와 언어 전환이 있는 전역 헤더를 쓰고,
 * 상세 계열은 그 자리를 뒤로가기 내비바가 대신한다 — 이유는 DetailLayout 주석 참고.
 * 라우터가 껍데기를 갈아 끼우므로 화면 안에서 헤더를 숨기는 분기를 둘 필요가 없다.
 */
const pages: RouteObject[] = [
  {
    element: <MainLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'search', element: <Search /> },
      // 약관·방침은 푸터에서만 들어오는 읽기 화면이라 목록 껍데기를 그대로 쓴다.
      //
      // 셋 다 /terms 아래 한 단계로 둔다. 포털(plzhans.com)도 같은 규칙이라 두 서비스의
      // 약관 주소를 한 자리에 적어 놓고 볼 수 있고, 스토어 등록 폼처럼 URL 을 하나씩
      // 옮겨 적는 곳에서 접두사가 갈리지 않는다.
      { path: 'terms/service', element: <Terms /> },
      { path: 'terms/location', element: <LocationTerms /> },
      { path: 'terms/privacy', element: <Privacy /> },
      // 옛 주소. 이미 나간 링크가 있을 수 있어 남겨 둔다.
      { path: 'terms', element: <Navigate to="service" replace /> },
      { path: 'privacy', element: <Navigate to="../terms/privacy" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <DetailLayout />,
    children: [
      { path: 'hospitals/:id', element: <HospitalDetail /> },
      // 비급여는 상세의 탭이 아니라 페이지다. 가격표가 수백 줄이라(최다 1,048행) 상세에 이어
      // 붙이면 위치·평가가 저 아래로 밀린다. HospitalNonPayment 주석 참고.
      { path: 'hospitals/:id/npay', element: <HospitalNonPayment /> },
    ],
  },
];

/**
 * 언어별 트리를 **명시적으로** 만든다.
 *
 * `/:lang` 같은 동적 세그먼트를 쓰면 `/search` 가 lang='search' 로 잡힌다 — 리액트 라우터에는
 * 경로 제약(정규식)이 없어서 그걸 막을 방법이 없다. 언어 목록으로 트리를 펼치면 그런 모호함이
 * 아예 생기지 않고, 언어를 추가할 때 SUPPORTED_LANGUAGES 에 한 줄 넣으면 끝난다.
 */
const langRoutes: RouteObject[] = SUPPORTED_LANGUAGES.map((lang) => ({
  // 기본 언어는 접두사가 없다.
  path: lang === DEFAULT_LANGUAGE ? '/' : `/${lang}`,
  element: <LangLayout lang={lang} />,
  children: pages,
}));

/**
 * Sentry 계측을 입힌 createBrowserRouter. 데이터 라우터는 훅 밖에서 매칭이 일어나서
 * 이렇게 감싸야 트랜잭션 이름이 실제 URL 이 아니라 라우트 패턴으로 묶인다
 * (`/en/hospital/123` 이 아니라 `/:lang/hospital/:id`). Sentry 가 꺼져 있으면 그냥 통과한다.
 */
const createRouter = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter);

const router = createRouter([
  {
    element: <Root />,
    children: [
      // 기본 언어의 접두사 URL 은 정식 URL 로 되돌린다. 언어 트리보다 먼저 매칭돼야 한다.
      { path: `/${DEFAULT_LANGUAGE}/*`, element: <StripKoPrefix /> },
      { path: `/${DEFAULT_LANGUAGE}`, element: <StripKoPrefix /> },
      ...langRoutes,
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
