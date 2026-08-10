import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from '@/app/App';
import './globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 401 은 apiFetch 가 갱신+재시도로 이미 처리한다. 여기 재시도는 일시적 네트워크
      // 오류용이라 한 번이면 족하다.
      retry: 1,
      // 관리 화면은 창을 오래 띄워 두는 일이 많다. 탭을 옮길 때마다 다시 부르면 낭비다.
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
