import { Outlet } from 'react-router-dom';
import { Header } from '@/shared/components/layout/Header';
import { Footer } from '@/shared/components/layout/Footer';

export function MainLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      {/*
        바깥 폭은 넉넉하게 연다(첫 페이지가 PC 에서 카드 5장을 한 줄로 편다). 검색·상세·비급여는
        각자 max-w-3xl 로 자기 폭을 잡으므로 여기 폭을 넓혀도 그 페이지들은 그대로 768px 다.
      */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-0 sm:px-4">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
