import { Outlet } from 'react-router-dom';
import { Header } from '@/shared/components/layout/Header';
import { Footer } from '@/shared/components/layout/Footer';

export function MainLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-0 sm:px-4">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
