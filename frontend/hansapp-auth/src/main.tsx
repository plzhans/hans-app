import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/app/App';
import { initSentry } from '@/shared/monitoring/sentry';
import './globals.css';

// 에러 추적 부팅(VITE_SENTRY_DSN 이 있을 때만). **가장 먼저** 붙여야 그 뒤에 난 에러가 잡힌다.
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
