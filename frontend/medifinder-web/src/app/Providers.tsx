import { StrictMode, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/shared/i18n';

/**
 * 앱을 감싸는 껍데기. **브라우저와 서버(워커)가 같은 것을 써야** hydration 이 맞는다.
 * 하나라도 빠지거나 순서가 다르면 서버가 그린 트리와 첫 렌더가 어긋난다.
 */
export function Providers({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nextProvider>
    </StrictMode>
  );
}

/**
 * **함수다(모듈 상수가 아니다).** 워커는 여러 요청을 같은 아이솔레이트에서 처리하므로,
 * 하나를 만들어 두고 나눠 쓰면 A 병원 데이터가 B 병원 요청의 응답에 섞인다.
 * 서버에서는 요청마다 새로 만들고, 끝나면 버린다.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
