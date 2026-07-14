import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/shared/i18n';
import App from '@/app/App';
import './globals.css';

console.log('[app] VITE_API_BASE_URL =', import.meta.env.VITE_API_BASE_URL ?? '(not set)');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// 언어를 바꾸면 서버 응답(Lang 헤더 기준)이 달라지는 쿼리들을 모두 다시 가져온다.
i18n.on('languageChanged', () => {
  void queryClient.invalidateQueries();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
