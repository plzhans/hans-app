import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Hospital,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listPosts } from '@/shared/api/boards';
import { Gnb } from '@/shared/components/Gnb';
import { Hero } from '@/shared/components/Hero';
import { Footer } from '@/shared/components/Footer';
import { LINKS } from '@/shared/config/links';
import { cn } from '@/shared/lib/cn';
import { PAGE_CONTAINER } from '@/shared/ui/layout';

/** 직접 만든 서비스들. 포털웹의 주인공이라 맨 위에 카드로 크게 노출한다. */
const SERVICES: {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
}[] = [
  /*
    **문서가 맨 앞이다.** 처음 온 사람이 무엇부터 볼지 정해 주는 자리라, 개별 서비스보다
    "여기서 무엇을 할 수 있나" 를 먼저 보여 준다.
  */
  {
    icon: BookOpen,
    title: 'Docs',
    desc: 'API 사용법과 서비스 안내를 한곳에. 처음이라면 여기부터 보세요.',
    href: LINKS.docs,
  },
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
 * HansApp 포털웹 대시보드(첫 페이지). 직접 만든 서비스를 보여주는 홈.
 * 서비스 → 개발자(Hans API) → 공지사항 순으로 보여준다.
 * 하나의 계정(HansApp)으로 모든 서비스가 연결된다.
 */
export default function Dashboard() {
  return (
    <div className="flex min-h-full flex-col">
      <Gnb />

      <main className="flex-1">
        <Hero />

        {/* 서비스 */}
        <section className={cn(PAGE_CONTAINER, 'py-14')}>
          <SectionHead
            title="지금 바로 써볼 수 있는 서비스를 모았습니다"
          />
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

        {/* 개발자 — Hans API. **옅은 판을 화면 끝까지 깔아 앞뒤 구역과 가른다.** */}
        <section className="bg-gray-50">
          <div className={cn(PAGE_CONTAINER, 'flex flex-col gap-6 py-14 lg:flex-row lg:items-center lg:justify-between')}>
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
        <Notices />
      </main>
      <Footer />
    </div>
  );
}


/**
 * 섹션 머리. **제목을 크게, 오른쪽에 `+more`.**
 *
 * 같은 모양을 섹션마다 손으로 쓰면 글자 크기와 여백이 조금씩 어긋난다 — 한 벌로 둔다.
 *
 * **더 보러 가는 것은 제목보다 약하게 둔다.** 이 구역에서 먼저 읽혀야 하는 것은 제목과
 * 그 아래 목록이지 링크가 아닌데, 채운 알약은 "여기를 누르시오" 처럼 보인다.
 * 글자가 `+more` 인 것은 옮길 말이 아니어서다 — 다국어를 켜도 이 자리는 그대로 둔다.
 */
function SectionHead({
  title,
  to,
  label = '+more',
}: {
  title: string;
  to?: string;
  label?: string;
}) {
  return (
    /*
      **글줄끼리 맞춘다.** items-end 는 상자의 아래끝을 맞추는데, 제목은 크고 링크는 작아서
      글자가 서로 다른 높이에 앉는다 — baseline 이면 두 글줄이 같은 선 위에 놓인다.
    */
    <div className="mb-4 flex items-baseline justify-between gap-4">
      {/* 줄바꿈은 화면 폭이 정한다 — 짧은 문장에 <br> 을 박으면 넓은 화면에서 어색해진다. */}
      <h2 className="text-xl font-extrabold leading-snug text-balance text-gray-900 sm:text-2xl">
        {title}
      </h2>
      {to && (
        <Link
          to={to}
          className="shrink-0 text-sm font-semibold text-gray-400 transition hover:text-gray-900"
        >
          {label}
        </Link>
      )}
    </div>
  );
}

/** 공지사항 게시판의 이름(board.name). 이 게시판이 없으면 구역 자체를 안 그린다. */
const NOTICE_BOARD = 'notice';

/**
 * 공지사항 최근 몇 건.
 *
 * **없으면 구역을 통째로 감춘다.** 게시판을 아직 안 만들었거나 글이 없을 때 "준비중입니다"
 * 같은 빈 상자를 남기면, 그것 자체가 관리되지 않는 화면처럼 보인다.
 */
function Notices() {
  const query = useQuery({
    queryKey: ['notices'],
    queryFn: () => listPosts(NOTICE_BOARD, 1, 5),
    // 게시판이 없으면 404 다. 첫 화면이라 조용히 접는다 — 다시 시도할 것도 없다.
    retry: false,
  });
  const rows = query.data?.items ?? [];
  if (rows.length === 0) return null;

  return (
    <section className={cn(PAGE_CONTAINER, 'py-14')}>
      <SectionHead
        title="새로 올라온 소식을 확인하세요"
        to={`/board/${NOTICE_BOARD}`}
      />
      <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
        {rows.map((post) => (
          <li key={post.id}>
            <Link
              to={`/board/${NOTICE_BOARD}/${post.id}`}
              className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-gray-50"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                {post.title}
              </span>
              <span className="shrink-0 text-xs text-gray-400">
                {post.publishedAt?.slice(0, 10)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
