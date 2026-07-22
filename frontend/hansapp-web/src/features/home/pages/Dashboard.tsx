import { Gnb } from '@/shared/components/Gnb';

/**
 * HansApp 포털 대시보드(첫 페이지). 상단 배너 + 공지사항.
 * 서비스 바로가기는 상단 GNB 메뉴로 이동했다.
 */
export default function Dashboard() {
  return (
    <div className="min-h-full">
      <Gnb />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {/* 배너 영역 */}
        <section className="flex min-h-[200px] flex-col justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 p-8 text-white shadow-sm">
          <h1 className="text-2xl font-extrabold sm:text-3xl">HansApp</h1>
          <p className="mt-2 max-w-lg text-sm text-white/80 sm:text-base">
            하나의 계정으로 연결되는 서비스 포털. 상단 메뉴에서 각 서비스로 이동하세요.
          </p>
        </section>

        {/* 공지사항 */}
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-900">공지사항</h2>
          </div>
          <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm text-gray-400">
            준비중입니다.
          </div>
        </section>
      </main>
    </div>
  );
}
