import { lazy, Suspense } from 'react';
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
import { LangLayout } from './LangLayout';
import { Spinner } from '@/shared/ui/Spinner';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@/shared/i18n';
import { stripLang } from '@/shared/i18n/routing';

const Home = lazy(() => import('@/features/home/pages/Home'));
const Search = lazy(() => import('@/features/search/pages/Search'));
const HospitalDetail = lazy(() => import('@/features/clinic/pages/HospitalDetail'));
const HospitalNonPayment = lazy(
  () => import('@/features/clinic/pages/HospitalNonPayment'),
);
const NotFound = lazy(() => import('@/features/home/pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </>
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

/** 언어와 무관한 페이지 트리. 언어마다 이 트리를 그대로 붙인다. */
const pages: RouteObject[] = [
  { index: true, element: <Home /> },
  { path: 'search', element: <Search /> },
  { path: 'hospitals/:id', element: <HospitalDetail /> },
  // 비급여는 상세의 탭이 아니라 페이지다. 가격표가 수백 줄이라(최다 1,048행) 상세에 이어
  // 붙이면 위치·평가가 저 아래로 밀린다. HospitalNonPayment 주석 참고.
  { path: 'hospitals/:id/npay', element: <HospitalNonPayment /> },
  { path: '*', element: <NotFound /> },
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
  children: [{ element: <MainLayout />, children: pages }],
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
