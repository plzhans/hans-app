import {
  ArrowRight,
  ExternalLink,
  Hospital,
  Newspaper,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Gnb } from '@/shared/components/Gnb';
import { LINKS } from '@/shared/config/links';

/** 직접 만든 서비스들. 포털의 주인공이라 맨 위에 카드로 크게 노출한다. */
const SERVICES: {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
}[] = [
  {
    icon: Hospital,
    title: 'MediFinder',
    desc: '전국 병원을 쉽고 빠르게. 지역·진료과목·응급실·달빛어린이병원으로 찾고, 지도·비급여 진료비·교통편까지 봅니다.',
    href: LINKS.medifinder,
  },
  {
    icon: Send,
    title: 'Telegram Exporter',
    desc: '텔레그램 대화를 브라우저에서 바로 내 컴퓨터로. 서버를 거치지 않아 대화 내용이 밖으로 나가지 않습니다. 설치·가입 없이 무료.',
    href: LINKS.telegramExporter,
  },
  {
    icon: Newspaper,
    title: 'Blog',
    desc: '만들면서 남긴 개발 기록과 노트.',
    href: LINKS.blog,
  },
];

/** 개발자용 Hans API 의 데이터 도메인. 칩으로만 가볍게 훑어 준다. */
const API_DOMAINS = [
  '병원 검색',
  '참조 데이터',
  '주소',
  '교통정보',
  '국세청 사업자',
  '다국어',
];

/**
 * HansApp 포털 대시보드(첫 페이지). 직접 만든 서비스를 보여주는 홈.
 * 서비스 → 개발자(Hans API) → 공지사항 순으로 보여준다.
 * 하나의 계정(HansApp)으로 모든 서비스가 연결된다.
 */
export default function Dashboard() {
  return (
    <div className="min-h-full">
      <Gnb />

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-8">
        {/* 히어로 */}
        <section className="flex min-h-[200px] flex-col justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 p-8 text-white shadow-sm sm:p-10">
          <h1 className="text-2xl font-extrabold sm:text-4xl">HansApp</h1>
          <p className="mt-3 max-w-xl text-sm text-white/90 sm:text-lg">
            직접 만든 서비스들을 한 곳에서. 하나의 계정으로 연결됩니다.
          </p>
        </section>

        {/* 서비스 */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">서비스</h2>
            <p className="mt-1 text-sm text-gray-500">
              지금 바로 써볼 수 있는 서비스들입니다.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <a
                key={s.title}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-primary-300 hover:shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <ExternalLink className="h-4 w-4 text-gray-300 transition group-hover:text-primary-500" />
                </div>
                <h3 className="font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
                  {s.desc}
                </p>
              </a>
            ))}
          </div>
        </section>

        {/* 개발자 — Hans API */}
        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                개발자
              </span>
              <h2 className="mt-1.5 text-lg font-bold text-gray-900">Hans API</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                이 서비스들이 쓰는 공공 데이터 API 를 직접 붙일 수 있습니다.
                기관마다 흩어진 데이터를 하나로 합쳐, 키 하나로 호출합니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {API_DOMAINS.map((d) => (
                  <span
                    key={d}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                to="/apps"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
              >
                앱 등록하기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={LINKS.docs}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                API 문서
              </a>
            </div>
          </div>
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
