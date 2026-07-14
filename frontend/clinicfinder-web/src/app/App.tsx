import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, ScrollRestoration, Outlet } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Spinner } from '@/shared/ui/Spinner';

const Home = lazy(() => import('@/features/home/pages/Home'));
const Search = lazy(() => import('@/features/search/pages/Search'));
const HospitalDetail = lazy(() => import('@/features/clinic/pages/HospitalDetail'));
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

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/search', element: <Search /> },
          { path: '/hospitals/:id', element: <HospitalDetail /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
