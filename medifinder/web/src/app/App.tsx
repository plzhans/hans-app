import * as Sentry from '@sentry/react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes';

/**
 * Sentry 계측을 입힌 createBrowserRouter. 데이터 라우터는 훅 밖에서 매칭이 일어나서
 * 이렇게 감싸야 트랜잭션 이름이 실제 URL 이 아니라 라우트 패턴으로 묶인다
 * (`/en/hospital/123` 이 아니라 `/:lang/hospital/:id`). Sentry 가 꺼져 있으면 그냥 통과한다.
 */
const createRouter = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter);

const router = createRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
