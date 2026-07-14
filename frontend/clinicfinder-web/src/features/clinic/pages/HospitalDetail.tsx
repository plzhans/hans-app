import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LangLink } from '@/shared/i18n/LangLink';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Globe,
  Ambulance,
  Baby,
  Stethoscope,
  Building2,
  Clock,
  ChevronDown,
} from 'lucide-react';
import type { TransportRouteDto } from '@/shared/api/generated/model';
import { cn } from '@/shared/lib/utils';
import { Spinner } from '@/shared/ui/Spinner';
import { NaverMap } from '@/shared/components/map/NaverMap';
import {
  useHospitalDetail,
  stationName,
  DAY_LABELS,
  formatTime,
  todayDay,
  tomorrowDay,
} from '../api';

/**
 * 값이 없는 것과 마찬가지인 표기를 걸러낸다.
 *
 * 병원이 빈 칸에 "-", "없음", "." 을 적어 넣는다. 강북삼성병원은 방향 칸이 "-" 다.
 * 그대로 출력하면 "정류장 - → 50m" 처럼 하이픈이 덩그러니 남는다.
 */
function clean(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' || /^[-.·]+$/.test(trimmed) || trimmed === '없음'
    ? undefined
    : trimmed;
}

/**
 * 노선 문자열을 개별 번호로 쪼갠다.
 *
 * **원본이 여러 노선을 한 칸에 몰아 넣는다** — "36,39 번", "1, 1-1, 58".
 * 그대로 배지 하나에 넣으면 번호가 뭉쳐 읽히지 않는다. 쉼표·가운뎃점·슬래시로 자르고
 * 뒤에 붙은 "번" 을 떼어 낸다. "21A" "31-1" "용인경전철" 처럼 숫자가 아닌 것도 그대로 살린다.
 */
function splitLines(line: string): string[] {
  return line
    .split(/[,·/]+/)
    .map((part) => part.trim().replace(/\s*번$/, '').trim())
    .filter(Boolean);
}

/** 교통편 하나의 화면 표현. 같은 하차지점의 노선들을 모은 것이다. */
interface TransportStop {
  kindName?: string;
  arrival?: string;
  dir?: string;
  distance?: string;
  note?: string;

  /**
   * 노선. **교통편(kindName)을 노선마다 따로 든다.**
   * 같은 정류장에 시내버스와 마을버스가 함께 서는 경우가 실측 330건(8%)이다.
   * 정류장 단위로 색을 정하면 그 330건이 전부 틀린 색이 된다 — 색은 노선의 속성이다.
   */
  lines: { no: string; kindName?: string }[];
}

/**
 * 버스 하차지점에 "정류장" 을 붙인다.
 *
 * 원본이 정류장 이름을 그냥 "강일병원" 이라고 준다. 그대로 두면 병원 이름인지 정류장인지
 * 구분이 안 된다 — 지하철은 "○○역" 이라 저절로 구분되지만 버스는 아니다.
 * 이미 "정류장"/"정류소" 가 붙어 있으면 그대로 둔다.
 */
function stopLabel(kind: string, arrival?: string): string | undefined {
  if (!arrival) {
    return undefined;
  }
  if (kind !== 'bus' || /정류장|정류소/.test(arrival)) {
    return arrival;
  }
  return `${arrival} 정류장`;
}

/**
 * 같은 하차지점(+안내문)끼리 묶고 노선만 모은다.
 *
 * 원본은 "노선 1개 = 1행" 이라 정류장이 반복된다. 사람은 정류장 단위로 읽는다 —
 * "어디서 내리나" 가 먼저고 "몇 번을 타나" 는 그 다음이다. 그래서 정류장을 키로 뒤집는다.
 */
function groupByStop(routes: TransportRouteDto[]): TransportStop[] {
  const stops = new Map<string, TransportStop>();

  for (const route of routes) {
    // 안내문이 다르면 다른 정류장으로 본다. 합치면 어느 노선의 안내인지 알 수 없다.
    const key = [route.arrival, route.dir, route.distance, route.note].join('|');

    const stop = stops.get(key) ?? {
      kindName: clean(route.kindName),
      arrival: clean(route.arrival),
      dir: clean(route.dir),
      distance: clean(route.distance),
      note: clean(route.note),
      lines: [],
    };

    for (const no of route.line ? splitLines(route.line) : []) {
      if (!stop.lines.some((l) => l.no === no)) {
        stop.lines.push({ no, kindName: route.kindName });
      }
    }
    stops.set(key, stop);
  }

  return [...stops.values()];
}

function Section({
  title,
  icon,
  children,
  id,
  first,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  /** 책갈피 대상. 헤더의 지역 줄에서 여기로 스크롤한다. */
  id?: string;

  /** 첫 섹션. 위쪽 구분선을 그리지 않는다 — 바로 위 탭의 밑줄과 겹쳐 이중선이 된다. */
  first?: boolean;
}) {
  return (
    <section
      id={id}
      /*
        **카드가 아니다.** 예전엔 섹션마다 흰 카드(테두리+그림자)를 둘렀는데,
        탭이 이미 구역을 나누고 있어 카드가 그 일을 두 번 한다 — 화면이 조각조각 끊긴다.
        선 하나로 나누고 한 장의 흐름으로 읽히게 한다.
        scroll-mt: sticky 바(56 + 44px)에 제목이 가리지 않도록 위를 비운다.
      */
      className={cn(first ? 'pt-1' : 'border-t border-slate-200 pt-5')}
      style={{ scrollMarginTop: 'var(--detail-anchor-offset, 112px)' }}
    >
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** 오늘·내일 표시. 공휴일(8)은 날짜와 무관해서 붙이지 않는다. */
function DayBadge({ day }: { day: number }) {
  if (day === todayDay()) {
    return (
      <span className="ml-2 rounded bg-primary-100 px-1.5 py-0.5 text-xs font-medium text-primary-700">
        오늘
      </span>
    );
  }
  if (day === tomorrowDay()) {
    return (
      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
        내일
      </span>
    );
  }
  return null;
}

/**
 * 통계 배지. 라벨과 숫자를 **한 덩어리로** 묶는다.
 *
 * 표로 늘어놓으면 라벨 열과 숫자 열을 눈이 왕복해야 한다. 붙여 두면 "전문의 22" 가
 * 한 단어처럼 읽힌다. 값이 0이거나 없으면 아예 안 그린다 — 0이 늘어서면 정보가 아니라 잡음이다.
 */
function Stat({
  label,
  value,
  primary,
}: {
  label: string;
  value?: number | null;
  /** 총원. 내역과 성격이 달라 색으로 갈라 놓는다 — 합산하면 안 되는 값이라서다. */
  primary?: boolean;
}) {
  if (!value) return null;
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1.5 ring-1',
        primary
          ? 'bg-primary-50 ring-primary-100'
          : 'bg-slate-50 ring-slate-100',
      )}
    >
      <span
        className={cn(
          'text-xs',
          primary ? 'font-medium text-primary-700' : 'text-slate-500',
        )}
      >
        {label}
      </span>
      <span className={cn('text-sm', primary ? 'text-primary-800' : 'text-slate-800')}>
        {value.toLocaleString()}
      </span>
    </span>
  );
}

type DetailTab = 'subject' | 'care' | 'scale' | 'location';

/**
 * 탭. **각각이 하나의 질문에 답한다.**
 *   소개  어떤 병원이고 어떻게 연락하나 (연락처·소개글)
 *   진료  언제 가고 무슨 진료를 받나 (진료시간·안내·진료과목·전문의)
 *   규모  얼마나 갖췄나 (종별·의료진·병상·장비)
 *   위치  어떻게 가나 (교통·주차·주소·지도)
 */
const DETAIL_TABS: { key: DetailTab; name: string }[] = [
  { key: 'subject', name: '소개' },
  { key: 'care', name: '진료' },
  { key: 'scale', name: '규모' },
  { key: 'location', name: '위치' },
];

export default function HospitalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: hospital, isLoading, isError } = useHospitalDetail(id);

  /**
   * 지도는 클릭할 때만 로드한다.
   * 네이버 지도는 호출량에 과금이 붙어서, 상세를 열기만 해도 지도가 뜨면 콜이 낭비된다.
   * 실제로 길을 찾는 사용자만 지도를 펼친다.
   */
  const [mapOpen, setMapOpen] = useState(false);

  /**
   * 지금 화면에 보이는 구역. 탭 표시를 여기에 맞춘다.
   *
   * **IntersectionObserver 를 쓴다.** scroll 이벤트로 매번 위치를 재면 스크롤이 버벅인다.
   * rootMargin 으로 판정선을 화면 위쪽(헤더 아래)에 그어, 그 선을 지나는 구역을 "지금 보는 것"
   * 으로 삼는다. 그래야 구역 제목이 상단에 닿는 순간 탭이 바뀐다.
   */
  const [tab, setTab] = useState<DetailTab>('subject');

  /**
   * 탭을 눌러 이동하는 **동안에는 스파이를 끈다.**
   * 부드러운 스크롤이 중간 구역들을 스쳐 지나가면서 탭 표시가 깜빡이기 때문이다.
   * 브라우저 기본 앵커 이동이 끝날 시간(500ms)만 잠근다.
   */
  const lockRef = useRef(false);

  /**
   * sticky 헤더의 실제 높이를 재서 앵커 이동 여백에 쓴다.
   *
   * **고정값(scroll-mt-28)으로 두면 어긋난다.** 헤더 높이가 병원마다 다르기 때문이다 —
   * 배지가 없으면 한 줄 짧고, 이름이 길면 두 줄이 된다. 여백이 모자라면 섹션 제목이
   * 헤더 뒤에 숨고, 남으면 엉뚱하게 아래에 멈춘다. 그래서 잰다.
   */
  const stickyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;

    /**
     * 앵커로 이동했을 때 섹션 제목이 sticky 헤더 바로 아래에 오게 하는 여백.
     *
     * 섹션 박스의 맨 위는 **구분선**이고, 제목은 그보다 20px(pt-5) 아래에 있다.
     * scroll-margin 은 박스 맨 위를 기준으로 잡히므로, 헤더 높이만큼만 주면 선과 여백이
     * 헤더 아래에 드러나고 제목은 그만큼 밀려난다. **선 위까지 스크롤**해야 제목이 딱 붙는다.
     *
     *   여백 = 전역헤더(56) + sticky 높이 − 섹션 위 여백(20)
     *
     * ResizeObserver 로 재는 이유: 첫 렌더에는 높이가 0이고, 병원 이름이 두 줄이 되거나
     * 배지가 늘면 높이가 바뀐다. 한 번만 재면 그때부터 어긋난다.
     */
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty(
        '--detail-anchor-offset',
        `${56 + el.offsetHeight - 20}px`,
      );
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [hospital?.id]);

  const lockSpy = (event: React.MouseEvent, key: DetailTab) => {
    lockRef.current = true;
    setTab(key);

    /**
     * **첫 탭은 페이지 맨 위로 간다.**
     * 소개 섹션 위에는 헤더(배지·이름·지역)가 있는데, 섹션 앵커로 이동하면 그 헤더가
     * 화면 밖으로 밀려나 잘린다. 첫 탭을 누르는 건 "처음으로 돌아가자" 는 뜻이다.
     */
    if (key === DETAIL_TABS[0].key) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.setTimeout(() => {
      lockRef.current = false;
    }, 500);
  };

  useEffect(() => {
    const offset = 56 + (stickyRef.current?.offsetHeight ?? 56);

    const observer = new IntersectionObserver(
      (entries) => {
        if (lockRef.current) return;

        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visible) {
          setTab(visible.target.id as DetailTab);
        }
      },
      // 판정선을 sticky 헤더 바로 아래에 긋는다. 그 선을 지나는 구역이 "지금 보는 것" 이다.
      {
        rootMargin: `-${offset}px 0px -55% 0px`,
        threshold: [0, 0.25, 0.5],
      },
    );

    for (const t of DETAIL_TABS) {
      const el = document.getElementById(t.key);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [hospital?.id]);

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner />
      </div>
    );
  }
  if (isError || !hospital) {
    return (
      <p className="py-16 text-center text-rose-600">불러오지 못했습니다.</p>
    );
  }

  /**
   * 진료과목과 표시과목은 다르다.
   *   진료과목  declared          신고한 과목. 의사가 0명이어도 등재된다.
   *   표시과목  specialistCount>0 전문의가 실제로 있는 과목.
   */
  /** 대표 지하철역. 여러 개면 첫 번째. 위치 섹션에는 출구·거리까지 그대로 보여준다. */
  const subway = hospital.transport?.subway?.[0];

  /**
   * 헤더에 띄울 역 이름. **거리를 따지지 않는다 — 있으면 보여준다.**
   *
   * 원래는 "1km 이내로 확인된 것만" 이라는 규칙을 뒀는데, 원본이 거리와 소요시간을 같은 칸에
   * 섞어 쓰고(20%가 "도보 5분" 식) 아예 비워두기도 해서 **멀쩡한 역세권 병원이 대거 탈락**했다.
   * 강북삼성병원(서대문역 도보 5분)이 그랬다.
   *
   * 한국에서 지하철역은 위치를 가늠하는 1차 기준이다. 거리를 몰라 안 보여주는 손해가,
   * 조금 먼 역을 보여주는 손해보다 크다. 정확한 거리는 교통 안내 섹션에 그대로 있다.
   *
   * 역 이름을 못 뽑는 하차지점("2번출구")만 뺀다 — 그건 어느 역인지 알 수 없어 쓸모가 없다.
   */
  const nearestStation = stationName(subway?.arrival);

  /**
   * 교통편을 수단별로 나누고, 그 안에서 **같은 하차지점끼리 묶는다.**
   *
   * 원본은 노선마다 한 행이라 정류장이 그대로 반복된다 —
   * 강일병원은 "강일병원 정문"이 아홉 줄 찍힌다. 정류장 하나에 노선을 모아 한 줄로 만든다.
   */
  const transportGroups = [
    { key: 'subway', label: '지하철', routes: hospital.transport?.subway ?? [] },
    { key: 'bus', label: '버스', routes: hospital.transport?.bus ?? [] },
    { key: 'etc', label: '그 밖에', routes: hospital.transport?.etc ?? [] },
  ]
    .filter((g) => g.routes.length > 0)
    .map((g) => ({ ...g, stops: groupByStop(g.routes) }));

  const subjects = hospital.subjects ?? [];
  const display = subjects.filter((s) => (s.specialistCount ?? 0) > 0);
  const declared = subjects.filter((s) => s.declared);

  /** 진료시간은 kind 로 갈린다. 달빛은 야간에 소아만 받으므로 시간대가 다르다. */
  const hours = hospital.hours ?? [];
  const general = hours.filter((h) => h.kind === 'general');
  const baby = hours.filter((h) => h.kind === 'baby');

  const staff = hospital.staff;
  const beds = hospital.beds;
  const equipments = hospital.equipments ?? [];
  const region = hospital.location?.region;

  return (
    // 카드를 걷어냈으므로 **페이지가 곧 한 장의 흰 종이**다.
    // 섹션마다 흰 카드를 두르면 탭이 하는 구역 나누기를 두 번 하게 되어 화면이 조각난다.
    // 배경은 흰색으로 채우고, 구역은 선으로만 가른다.
    <div className="mx-auto max-w-3xl space-y-5 rounded-2xl bg-white px-4 py-6">
      <LangLink
        to="/search"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> 검색으로
      </LangLink>

      {/*
        병원 이름과 탭은 **함께 고정된다.** 탭을 눌러 구역을 옮겨도 "어느 병원을 보고 있나" 가
        사라지면 안 된다 — 긴 페이지를 내려가다 보면 무슨 병원이었는지 잊는다.
      */}
      <div
        ref={stickyRef}
        className="sticky top-14 z-20 -mx-4 !mt-0 bg-white/95 px-4 backdrop-blur"
      >
      {/* 배지 · 이름 · 규모 · 지역 */}
      <header className="!mb-0 pb-3 pt-3">
        {/*
          응급실·달빛은 **이름보다 먼저 읽혀야 한다.**
          "지금 갈 수 있나" 를 가르는 정보라, 이름 아래에 두면 스캔하다 놓친다.
          병원 이름은 어차피 크고 굵어서 늦게 봐도 눈에 들어온다.
        */}
        {/*
          배지 줄. **규모가 맨 앞이다** — "상급병원이냐 동네 의원이냐" 가 이 병원의 기본 성격이고,
          응급실·달빛은 그 위에 얹히는 특성이다. 이름 옆에 따로 두면 배지가 두 곳에 흩어진다.
        */}
        {(hospital.tier || hospital.emergency || hospital.baby) && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {hospital.tier && (
              <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                {hospital.tier.name}
              </span>
            )}
            {hospital.emergency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                <Ambulance className="h-3 w-3" /> 응급실 운영
              </span>
            )}
            {hospital.baby && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Baby className="h-3 w-3" /> 달빛어린이병원
              </span>
            )}
          </div>
        )}

        <h1 className="text-xl font-bold text-slate-900">{hospital.name}</h1>

        {/*
          지하철역 | 시도 | 시군구.
          "거기 어떻게 가지" 에 가장 빨리 답하는 것이 지하철역이라 맨 앞에 둔다.
          누르면 맨 아래 위치 섹션으로 이동한다 — 주소·지도를 찾아 스크롤하지 않아도 된다.
        */}
        {(region || nearestStation) && (
          <a
            href="#location"
            /*
              탭과 **같은 경로로 보낸다.** 그냥 앵커로 두면 스파이가 켜진 채 부드럽게 스크롤되고,
              바로 앞 구역인 규모를 지나면서 탭이 규모로 바뀐 채 멈춘다. 잠그고 위치로 못 박는다.
            */
            onClick={(event) => lockSpy(event, 'location')}
            className="mt-1 flex items-center gap-1 text-sm text-slate-500 no-underline transition-colors hover:text-primary-600"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>
              {[nearestStation, region?.sido?.name, region?.name]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </a>
        )}

      </header>


      {/*
        탭이 아니라 **책갈피**다. 내용을 감추지 않는다 — 전부 한 페이지에 있고,
        탭은 그 위치로 데려다줄 뿐이다. 스크롤하면 지금 보고 있는 구역으로 표시가 따라온다.
        (탭으로 구역을 감추면 "규모를 보려면 탭을 눌러야 한다"는 걸 사용자가 알아야 하는데,
         대부분 모른 채 스크롤만 하다 나간다.)
      */}
      {/* 병원 이름은 위 헤더에 이미 있다. 여기서 또 쓰면 두 번 나온다. 탭만 남긴다. */}
      <nav
        role="tablist"
        className="-mx-4 !mt-0 flex border-b border-slate-200 px-4"
      >
        {DETAIL_TABS.map((t) => (
          <a
            key={t.key}
            href={`#${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            onClick={(event) => lockSpy(event, t.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm no-underline transition-colors',
              tab === t.key
                ? 'border-primary-600 font-bold text-primary-700'
                : 'border-transparent font-medium text-slate-500 hover:text-slate-800',
            )}
          >
            {t.name}
          </a>
        ))}
      </nav>
      </div>

      <Section
        first
        id="subject"
        title="소개"
        icon={<Stethoscope className="h-4 w-4 text-primary-600" />}
      >
        {/*
          연락처. **규모 섹션의 "의료진 / 병상 / 장비" 와 같은 소제목 체계다.**
          섹션 제목(소개)은 탭과 짝을 이루고, 그 안의 덩어리마다 소제목을 단다.
          전화·홈페이지는 각각 한 줄씩 — 한 줄에 붙이면 긴 URL 이 전화번호를 밀어낸다.
        */}
        <p className="text-xs font-medium text-slate-500">연락처</p>
        <dl className="mt-1.5 space-y-1.5 text-sm text-slate-600">
          {hospital.tel && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-slate-400" />
              <a href={`tel:${hospital.tel}`} className="hover:underline">
                {hospital.tel}
              </a>
            </div>
          )}
          {hospital.homepage && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-slate-400" />
              <a
                href={hospital.homepage}
                target="_blank"
                rel="noreferrer"
                className="truncate hover:underline"
              >
                {hospital.homepage}
              </a>
            </div>
          )}
        </dl>

        {/*
          소개(intro)와 안내(notice)는 성격이 다르다.
            소개  병원이 스스로 밝힌 진료 특징·중점 분야
            안내  진료시간이 못 담는 예외 (접수마감·휴진일)
          라벨을 붙여 구분한다. 안 그러면 사용자가 무슨 문장인지 모른다.
        */}
        {hospital.intro && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">소개</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {hospital.intro.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim()}
            </p>
          </div>
        )}

      </Section>

      {/*
        진료. **"언제 가고, 무슨 진료를 받나"** 에 답한다.
        소개(연락처·병원 소개글)와는 성격이 다르다 — 이건 실제로 병원에 가기 위한 정보다.
      */}
      <Section
        id="care"
        title="진료"
        icon={<Clock className="h-4 w-4 text-primary-600" />}
      >
        {/*
          진료시간이 없는 병원이 있다. **비워두면 안 된다** — 사용자는 확인할 방법을 못 찾고
          목록으로 돌아간다. 없다고 말하고, **할 수 있는 행동(전화)** 을 준다.
          추측해서 채우지 않는다("의원은 보통 9시~6시") — 헛걸음을 만든다.
        */}
        {general.length === 0 && baby.length === 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">
              진료시간
            </p>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-sm text-slate-600">
                진료시간 정보가 없습니다.
              </p>
              {hospital.tel && (
                <a
                  href={`tel:${hospital.tel}`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-primary-700"
                >
                  <Phone className="h-4 w-4" />
                  {hospital.tel} 전화로 확인
                </a>
              )}
            </div>
          </div>
        )}

        {(general.length > 0 || baby.length > 0) && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">
              진료시간
            </p>
          {/* 소개·안내와 같은 회색 박스. 강조가 아니라 **덩어리로 묶어주는** 역할이다. */}
          {general.length > 0 && (
            <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
              {general.map((h) => (
                <div key={h.day} className="flex flex-wrap items-center gap-x-2.5">
                  <dt className="w-10 shrink-0 text-slate-500">
                    {DAY_LABELS[h.day]}
                  </dt>
                  <dd className="flex flex-wrap items-center gap-x-2 text-slate-900">
                    <span>
                      {formatTime(h.open)} ~ {formatTime(h.close)}
                    </span>

                    {/*
                      점심시간은 닫혀 있는 시간이다. 흐린 회색(slate-400)으로 두면 눈에 안 들어와
                      그 시간에 헛걸음한다. 강조까지 할 필요는 없고, **읽히기만 하면 된다.**
                    */}
                    {h.breakStart && (
                      <span className="text-sm text-slate-500">
                        점심 {formatTime(h.breakStart)}~{formatTime(h.breakEnd)}
                      </span>
                    )}

                    <DayBadge day={h.day} />
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/* 달빛 시간은 일반 진료와 다르다. 뭉치면 성인이 야간에 헛걸음한다. */}
          {baby.length > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3">
              <p className="flex items-center gap-1 text-xs font-medium text-amber-800">
                <Baby className="h-3 w-3" /> 달빛어린이 진료 (만 18세 이하)
              </p>
              <dl className="mt-1.5 space-y-1 text-sm">
                {baby.map((h) => (
                  <div key={h.day} className="flex gap-3">
                    <dt className="w-12 shrink-0 text-amber-700">
                      {DAY_LABELS[h.day]}
                    </dt>
                    <dd className="text-amber-900">
                      {formatTime(h.open)} ~ {formatTime(h.close)}
                      <DayBadge day={h.day} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

            {/*
              진료시간의 부가 설명. **실측 30,725건(97%)이 점심·휴진·접수시간 얘기다.**
                "점심 13:00-14:30" · "매주 수요일 정기 휴무" · "토일 문의"
              구조화된 시간표가 못 담는 예외라 **시간표 바로 아래**에 붙인다.
              위쪽 소개(intro)와는 다르다 — 그건 "무슨 진료를 잘하나"(72%가 진료 특징)다.
            */}
            {/*
              라벨은 그냥 "안내" 다. 실측상 97% 가 점심·휴진 얘기지만 나머지 3%(932건)에는
              "토일 문의", "예약제" 처럼 시간과 무관한 것도 온다 — 라벨을 좁게 달면 그때 거짓말이 된다.
              **소제목 위계를 연락처·진료시간·진료과목과 똑같이 맞춘다** — 박스 안에 흐리게 넣으면
              부가정보로 읽혀서 휴진일을 놓친다.
            */}
            {hospital.notice && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-slate-500">안내</p>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {hospital.notice.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim()}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {(display.length > 0 || declared.length > 0) && (
          <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-slate-500">진료과목</p>
          {/*
            진료과목이 먼저다. **병원이 무슨 진료를 하는지**가 이 섹션의 본론이고,
            전문의가 몇 명인지는 그 다음 관심사다.
          */}
          {declared.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {declared.map((s) => (
                <span
                  key={s.code}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-sm text-slate-700"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}

          {/*
            표시과목 = 전문의가 실제로 있는 과목. **진료과목과 다르다** —
            진료과목은 신고만 하면 되고 의사가 0명이어도 등재된다.
            인원이 붙는 값이라 칩이 아니라 표로 낸다. 숫자끼리 비교돼야 의미가 산다.
          */}
          {display.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-500">
                전문의{' '}
                <span className="font-normal text-slate-400">(표시과목)</span>
              </p>

              {/* 진료시간·안내와 같은 회색 박스. 덩어리로 묶어 표가 떠 보이지 않게 한다. */}
              <div className="mt-1.5 grid grid-cols-1 gap-x-8 rounded-xl bg-slate-50 px-3 py-1 sm:grid-cols-2">
                {display.map((s) => (
                  <div
                    key={s.code}
                    className="flex items-baseline justify-between gap-3 border-b border-slate-200/60 py-1.5 text-sm last:border-b-0"
                  >
                    {/*
                      과목명은 위 진료과목 칩과 겹치는 정보다. 이 표에서 봐야 할 값은 인원이다.
                      **크기가 아니라 색으로 낮춘다** — 12px 로 줄이면 읽기 불편해지는데,
                      색을 흐리게 하면 읽기는 편한 채로 눈에 덜 띈다.
                    */}
                    <span className="truncate text-sm text-slate-500">
                      {s.name}
                    </span>
                    <span className="shrink-0 text-slate-800">
                      {s.specialistCount}
                      <span className="ml-0.5 text-xs text-slate-500">명</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}
      </Section>

      {/*
        규모. 종별·차수·의료진·병상을 한 섹션에 모은다.
        **환자가 직접 쓰는 정보는 아니다.** 하지만 "허가 병상 290 · 전문의 22" 같은 숫자가
        보이면 이 서비스가 실제 데이터를 갖고 있다는 신호가 된다 — 신뢰의 근거다.
        따로 흩어놓으면 그 효과가 사라진다.
      */}
      {(hospital.category ||
        staff?.doctorTotal ||
        beds?.total ||
        equipments.length > 0 ||
        hospital.parking?.capacity) && (
        <Section
          id="scale"
          title="규모"
          icon={<Building2 className="h-4 w-4 text-primary-600" />}
        >
          {/*
            종별 + 차수. "치과의원 (1차)" 처럼 붙여 쓴다.
            **같은 차수를 부르는 이름이 종별마다 다르다** — 의원·치과의원·한의원이 전부 1차다.
            종별만 보면 그게 어느 급인지 모르고, 차수만 보면 무슨 병원인지 모른다. 둘을 붙여야 읽힌다.
            care(요양·정신)는 차수 체계 밖이라 종별만 쓴다.
          */}
          {hospital.category && (
            <div className="flex flex-wrap gap-1.5">
              {/*
                예전엔 여기에 "(1차)" 를 붙였다. 뺐다 — tier 는 **우리가 매긴 등급**이지
                의료전달체계의 1·2·3차가 아니다. 그 이름을 빌려 쓰면 공식 차수와 같다고 오해한다.
                등급은 이름 위 배지(의원급·병원급·상급종합)가 이미 말한다.
              */}
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {hospital.category.name}
              </span>
            </div>
          )}

          {/*
            대표 숫자를 **라벨 줄에 올린다.** "의료진 · 총 의사 23" 이 먼저 읽히고,
            내역(전문의·치과의사…)은 그 아래 배지로 따라온다.
            라벨만 있는 줄은 자리만 먹는다 — 어차피 총원이 그 섹션의 요약이다.
          */}
          {staff?.doctorTotal ? (
            <>
              <p className="mt-3 text-xs font-medium text-slate-500">의료진</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Stat label="전체" value={staff.doctorTotal} primary />

                {/* 총원과 내역 사이에 선을 둔다. 내역을 더해도 총원이 안 된다(겸직 중복). */}
                <span className="mx-0.5 h-5 w-px bg-slate-200" />

                <Stat label="전문의" value={staff.specialist} />
                <Stat label="레지던트" value={staff.resident} />
                <Stat label="인턴" value={staff.intern} />
                <Stat label="일반의" value={staff.generalDoctor} />
                <Stat label="치과의사" value={staff.dentist} />
                <Stat label="한의사" value={staff.oriental} />
              </div>
            </>
          ) : null}

          {beds?.total ? (
            <>
              <p className="mt-3 text-xs font-medium text-slate-500">병상</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Stat label="허가 병상" value={beds.total} primary />
                <span className="mx-0.5 h-5 w-px bg-slate-200" />
                <Stat label="일반" value={beds.standard} />
                <Stat label="상급" value={beds.higher} />
                <Stat label="중환자실" value={beds.icu} />
                <Stat label="응급실" value={beds.emergency} />
                <Stat label="수술실" value={beds.operatingRoom} />
              </div>
            </>
          ) : null}

          {/*
            보유 장비도 규모다. **MRI 2대와 1대는 다른 병원이다** —
            의료진·병상과 같은 질문("이 병원이 얼마나 갖췄나")에 답하므로 한 섹션에 모은다.
            장비 하나 = 한 줄, 숫자는 이름 바로 옆. 2열로 나눠 세로 길이를 절반으로 줄인다.
          */}
          {equipments.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-slate-500">보유 장비</p>
              <div className="mt-1.5 grid grid-cols-1 gap-x-8 rounded-xl bg-slate-50 px-3 py-1 sm:grid-cols-2">
                {equipments.map((e) => (
                  <div
                    key={e.code}
                    className="flex items-baseline justify-between gap-3 border-b border-slate-200/60 py-1.5 text-sm last:border-b-0"
                  >
                    <span className="truncate text-slate-500">{e.name}</span>
                    <span className="shrink-0 text-slate-800">
                      {e.count?.toLocaleString() ?? '-'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {staff?.doctorTotal ? (
            <p className="mt-3 text-xs text-slate-400">
              과목별 인원은 겸직이 중복 계산되어 총원과 다를 수 있습니다.
            </p>
          ) : null}
        </Section>
      )}

      {/*
        위치. **"어떻게 가나" 에 답하는 것을 전부 모은다** — 교통편·주소·지도·주차.
        예전엔 교통 안내와 위치가 따로였는데, 사용자는 그 둘을 한 번에 본다.
        "지하철로 갈까 차로 갈까" 를 한 화면에서 판단해야 한다.
      */}
      <Section
        id="location"
        title="위치"
        icon={<MapPin className="h-4 w-4 text-primary-600" />}
      >
        {/*
          [1] 찾아오는 길 — 병원이 직접 쓴 문장. "혜화역 3번 출구" 처럼 요약이라 맨 위다.
          [2] 대중교통 — 심평원이 준 노선표.
          둘은 같은 질문("어떻게 가나")에 답하므로 한 구역이고, 아래 주소와는 선으로 가른다.
        */}
        {hospital.directions && (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {hospital.directions}
          </p>
        )}

        {transportGroups.length > 0 && (
          <div className="space-y-3">
            {transportGroups.map((group) => (
              <div key={group.key}>
                <p className="text-xs font-medium text-slate-500">
                  {group.label}
                </p>

                {/*
                  정류장 하나 = **한 줄**.
                    장신대역 2번 출구  500m  도보 5분 거리
                    강일병원 정류장  1 · 1-1 · 58 · 59  강일병원 정문
                  예전엔 노선을 칩으로 쌓고 안내문을 줄마다 따로 뒀더니 정류장 하나가 네 줄을 먹었다.
                  버스 노선이 아홉 개인 병원은 교통만으로 화면 한 판이 날아간다.
                */}
                <ul className="mt-1 divide-y divide-slate-100 pl-3">
                  {group.stops.map((stop, index) => {
                    /*
                      지하철  [4호선] 혜화역 3번출구 → 100M (동문)
                      버스    혜화역 서울대학교병원 정류장 → 100M (동문)
                             [143] [149] [150] …

                      노선은 배지, 하차지점은 본문, 거리는 화살표 뒤. 원본이 노선을 한 칸에
                      몰아 넣으므로(splitLines) 지하철도 환승역이면 배지가 여러 개 붙는다.
                    */
                    const inline = group.key === 'subway';

                    return (
                      <li key={index} className="py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          {/*
                            지하철은 **노선 + 역 이름이 한 덩어리**다. "5호선" 만 배지로 떼면
                            어느 역의 5호선인지 흐려진다 — 사람은 "5호선 서대문역" 을 한 단어로 읽는다.
                            환승역이면 노선이 여럿이라 "4호선·6호선 동묘앞역" 이 된다.
                            버스는 정류장이 하나에 노선이 여럿이라 반대로 나눠야 한다.
                          */}
                          {inline ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-800">
                              {[
                                stop.lines.map((l) => l.no).join('·'),
                                stopLabel(group.key, stop.arrival) ?? stop.kindName,
                              ]
                                .filter(Boolean)
                                .join(' ') || '하차지점 미상'}
                            </span>
                          ) : (
                            <span className="text-slate-900">
                              {stopLabel(group.key, stop.arrival) ??
                                stop.kindName ??
                                '하차지점 미상'}
                            </span>
                          )}

                          {stop.dir && (
                            <span className="text-slate-900">{stop.dir}</span>
                          )}

                          {stop.distance && (
                            <span className="text-slate-500">
                              <span className="mx-0.5 text-slate-300">→</span>
                              {stop.distance}
                            </span>
                          )}

                          {stop.note && (
                            <span className="text-xs text-slate-400">
                              ({stop.note})
                            </span>
                          )}
                        </div>

                        {!inline && stop.lines.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {stop.lines.map((line) => (
                              <span
                                key={line.no}
                                className="rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-700"
                              >
                                {line.no}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}


        {/*
          주차. **교통수단의 하나다** — 지하철·버스 다음에 "차로 오면" 이 온다.
          주소 아래 두면 "여기가 어디인가" 와 "어떻게 가나" 가 섞인다.
          안내문은 대개 요금표라 박스로 묶는다.
        */}
        {hospital.parking?.capacity ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">주차</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Stat label="주차 가능" value={hospital.parking.capacity} />
              {hospital.parking.paid !== undefined && (
                <span className="inline-flex items-center rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100">
                  {hospital.parking.paid ? '유료' : '무료'}
                </span>
              )}
            </div>

            {/* 배지(유료/무료, text-xs)와 같은 크기다. 옆에 붙는 부가 설명이니 위계가 같아야 한다. */}
            {hospital.parking.note && (
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">
                  {hospital.parking.note}
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* 주소·지도. 지도는 클릭할 때만 로드해 API 콜을 아낀다. */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500">주소</p>
        {hospital.location?.address && (
          <p className="mt-1.5 text-sm text-slate-700">
            {hospital.location.postNo && (
              <span className="mr-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                {hospital.location.postNo}
              </span>
            )}
            {hospital.location.address}{' '}
            <span className="text-slate-800">{hospital.name}</span>
          </p>
        )}
        {hospital.location?.lat && hospital.location?.lon ? (
          mapOpen ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <NaverMap
                lat={hospital.location.lat}
                lng={hospital.location.lon}
                name={hospital.name}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <MapPin className="h-4 w-4" /> 지도 보기
              <ChevronDown className="h-4 w-4" />
            </button>
          )
        ) : null}
        </div>
      </Section>
    </div>
  );
}
