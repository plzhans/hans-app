import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLangPath } from '@/shared/i18n/routing';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Globe,
  Baby,
  Bus,
  Stethoscope,
  Building2,
  ClipboardCheck,
  Clock,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import type { TransportRouteDto } from '@/shared/api/generated/model';
import { useCopyToClipboard } from '@/shared/hooks/useCopyToClipboard';
import { cn } from '@/shared/lib/utils';
import { Spinner } from '@/shared/ui/Spinner';
import { MapView } from '@/shared/components/map/MapView';
import {
  metroCityOf,
  resolveLine,
  splitLines,
  type MetroCity,
} from '../lib/subwayLine';
import { LineBadge } from '../components/LineBadge';
import { Section } from '../components/Section';
import {
  HospitalHeader,
  DETAIL_TABS,
  type DetailTab,
} from '../components/HospitalHeader';
import {
  useHospitalDetail,
  useNonPaymentPrefetch,
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
function stopLabel(
  kind: string,
  arrival: string | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | undefined {
  if (!arrival) {
    return undefined;
  }
  if (kind !== 'bus' || /정류장|정류소/.test(arrival)) {
    return arrival;
  }
  return t('clinic.transport.busStop', { name: arrival });
}

/**
 * 버스 종류별 색. **한국 버스는 색이 곧 종류다** — 파랑은 시내를 가로지르고, 초록은
 * 동네를 돌고, 빨강은 도시를 넘는다. 정류장 앞 아이콘에 그 색을 그대로 쓴다.
 *
 * 원본 kindName 은 이 셋뿐이다(실측 8,674건: 시내 7,466 / 마을 980 / 시외·고속 228).
 * 모르는 값이 오면 회색으로 둔다 — 아이콘은 뜨되 색으로 거짓말하지 않는다.
 */
const BUS_TONE: Record<string, string> = {
  시내버스: 'text-[#3D5BAB]',
  마을버스: 'text-[#53B332]',
  '시외/고속버스': 'text-[#E60012]',
};

/**
 * 이 정류장에 서는 버스 종류. **정류장이 아니라 노선의 속성이라 여러 개일 수 있다** —
 * 같은 정류장에 시내버스와 마을버스가 함께 서는 곳이 실측 330건(8%)이다.
 * 첫 노선의 종류로 정류장을 물들이면 그 330건이 틀린 색이 된다.
 */
function busKinds(stop: TransportStop): string[] {
  return [...new Set(stop.lines.map((l) => l.kindName).filter(Boolean))] as string[];
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

/**
 * 교통편 한 줄 = 하차지점 하나.
 *
 *   [4][6] 동묘앞역 3번출구 → 100M (동문)
 *   🚌 혜화역 서울대학교병원 정류장 → 100M
 *      143, 149, 150, …
 *
 * 하차지점이 본문이고 거리는 화살표 뒤다. 예전엔 노선을 칩으로 쌓고 안내문을 줄마다 따로
 * 뒀더니 정류장 하나가 네 줄을 먹었다 — 노선 아홉 개짜리 병원은 교통만으로 화면이 날아갔다.
 */
function TransportRow({
  kind,
  stop,
  city,
}: {
  /** subway | bus | etc. 표기가 수단마다 다르다. */
  kind: string;
  stop: TransportStop;
  city?: MetroCity;
}) {
  const { t } = useTranslation();

  const name =
    stopLabel(kind, stop.arrival, t) ??
    stop.kindName ??
    t('clinic.transport.unknownStop');

  // 지하철역 이름을 노선색으로 물들인다 — 배지 색과 같은 색을 이름에 얹으면 "어느 역이
  // 어느 색" 인지가 눈에 바로 붙는다. 환승역은 색이 여럿이라 첫 배지(가장 왼쪽 노선)의
  // 색을 따른다. 색을 못 찾은 노선뿐이거나 지하철이 아니면 undefined — 기본 먹색으로 둔다.
  const subwayColor =
    kind === 'subway'
      ? stop.lines
          .map((line) => resolveLine(line.no, city)?.bg)
          .find(Boolean)
      : undefined;

  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {/*
          지하철은 노선마다 **고유색**이 있고 승객은 그 색으로 갈아탄다. 노선을 배지로 떼고
          색을 입힌다 — 환승역이면 배지가 여러 개 붙어 "[4][6] 동묘앞역" 이 된다.
          색을 못 찾은 노선(자유 입력 오타·미상)은 원문 그대로 회색으로 둔다.
        */}
        {kind === 'subway' &&
          stop.lines.map((line) => (
            <LineBadge key={line.no} line={line.no} city={city} full />
          ))}

        {/*
          버스는 아이콘이 레이블을 대신한다. 색이 종류다(파랑 시내·초록 마을·빨강 시외).
          한 정류장에 종류가 섞이면(실측 397곳) 아이콘도 그만큼 붙는다 —
          하나로 뭉뚱그리면 둘 중 하나는 틀린 색이 된다.
        */}
        {kind === 'bus' &&
          busKinds(stop).map((busKind) => (
            <span
              key={busKind}
              title={busKind}
              aria-label={busKind}
              className="inline-flex shrink-0"
            >
              <Bus
                aria-hidden="true"
                className={cn('h-4 w-4', BUS_TONE[busKind] ?? 'text-slate-400')}
              />
            </span>
          ))}

        <span
          className={cn('text-slate-900', subwayColor && 'font-bold')}
          style={subwayColor ? { color: subwayColor } : undefined}
        >
          {name}
        </span>

        {stop.dir && <span className="text-slate-900">{stop.dir}</span>}

        {stop.distance && (
          <span className="text-slate-500">
            <span className="mx-0.5 text-slate-300">→</span>
            {stop.distance}
          </span>
        )}

        {stop.note && (
          <span className="text-xs text-slate-400">({stop.note})</span>
        )}
      </div>

      {/*
        버스 노선 번호. 한 정류장에 수십 개가 붙는 곳이 있어 배지로 깔면 배지밭이 된다 —
        쉼표로 이어 붙이고 살짝 들여쓴다. 지하철은 위에서 이미 배지로 나갔다.
      */}
      {kind !== 'subway' && stop.lines.length > 0 && (
        <div className="mt-1 pl-3 text-sm text-slate-700">
          {stop.lines.map((line) => line.no).join(', ')}
        </div>
      )}
    </li>
  );
}

/** 오늘·내일 표시. 공휴일(8)은 날짜와 무관해서 붙이지 않는다. */
function DayBadge({ day }: { day: number }) {
  const { t } = useTranslation();

  if (day === todayDay()) {
    return (
      <span className="ml-2 rounded bg-primary-100 px-1.5 py-0.5 text-xs font-medium text-primary-700">
        {t('clinic.today')}
      </span>
    );
  }
  if (day === tomorrowDay()) {
    return (
      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
        {t('clinic.tomorrow')}
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

/**
 * 평가등급 배지.
 *
 * **grade 가 아니라 normalized 를 쓴다.** 원본 grade 는 항목마다 인코딩이 달라서 그대로 쓰면 틀린다 —
 * 천식은 1등급을 '양호' 로, 등급제외를 '0' 으로 준다. grade 를 그냥 찍으면 등급제외인 병원에
 * "0등급" 이라는 없는 등급이 뜨고, 숫자로 정렬하면 그 0 이 1등급보다 위로 올라간다.
 * normalized 가 그 예외를 이미 흡수해 1~5 또는 'X'(등급제외)로만 온다.
 *
 * **색은 절제한다.** 1등급만 강조하고 나머지는 짙기로만 구분한다 — 빨강을 쓰면 우리가
 * "나쁜 병원" 이라고 낙인찍는 것처럼 읽힌다. 등급은 심평원의 항목별 판정이지 병원 전체의 평점이 아니다.
 */
function GradeBadge({ normalized }: { normalized: number | string }) {
  const { t } = useTranslation();

  // 등급대상 제외. 숫자가 아닌 값은 전부 여기로 온다(원본이 새 값을 줘도 등급 행세를 못 한다).
  if (typeof normalized !== 'number') {
    return (
      <span
        title={t('clinic.assessment.excludedHint')}
        className="shrink-0 rounded bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-400"
      >
        {t('clinic.assessment.excluded')}
      </span>
    );
  }

  const tone =
    normalized === 1
      ? 'bg-emerald-50 text-emerald-700'
      : normalized === 2
        ? 'bg-slate-100 text-slate-700'
        : 'bg-slate-50 text-slate-500';

  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold',
        tone,
      )}
    >
      {t('clinic.assessment.grade', { grade: normalized })}
    </span>
  );
}

export default function HospitalDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: hospital, isLoading, isError } = useHospitalDetail(id);
  const { copy, copied } = useCopyToClipboard();
  const navigate = useNavigate();
  const langPath = useLangPath();

  /**
   * 검색으로 돌아가기.
   *
   * **앱 안에서 넘어왔으면 직전 기록으로 되돌아간다** — 그래야 검색 조건(q·지역·과목…)과
   * 스크롤 위치가 그대로 살아난다. `/search` 로 새로 이동하면 조건이 다 날아간다.
   * 상세를 새 탭·외부 링크로 바로 연 경우(history.state.idx 가 0)는 돌아갈 기록이 없어
   * 검색 페이지로 보낸다.
   */
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate(langPath('/search'));
    }
  };

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

  /** 비급여를 미리 받아 둔다. 링크에 손이 닿는 순간 부른다. */
  const prefetchNpay = useNonPaymentPrefetch(id);

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

    /*
      보통은 손대지 않는다 — `<a href="#care">` 가 해시도 스크롤도 알아서 한다.
      아래 하나만 예외라 직접 처리하고, 그때도 **해시는 반드시 남긴다**(주소 복사용).
      pushState 는 스크롤도 hashchange 도 일으키지 않아서, 우리가 원하는 것만 골라 할 수 있다.
    */
    if (key === DETAIL_TABS[0].key) {
      /**
       * **첫 탭은 페이지 맨 위로 간다.**
       * 소개 섹션 위에는 헤더(배지·이름·지역)가 있는데, 섹션 앵커로 이동하면 그 헤더가
       * 화면 밖으로 밀려나 잘린다. 첫 탭을 누르는 건 "처음으로 돌아가자" 는 뜻이다.
       */
      event.preventDefault();
      window.history.pushState(null, '', `#${key}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.setTimeout(() => {
      lockRef.current = false;
    }, 500);
  };

  /**
   * 해시를 달고 들어온 경우의 첫 스크롤.
   *
   * **브라우저 기본 동작에 맡길 수 없다.** 주소창에 #care 를 넣고 열면 브라우저는 문서가
   * 그려지자마자 그 id 를 찾는데, 그때 우리는 아직 병원을 불러오는 중이라 섹션이 없다.
   * 데이터가 온 뒤 한 번 직접 맞춰준다.
   */
  useEffect(() => {
    if (!hospital) return;

    const key = window.location.hash.slice(1);
    if (!key) return;

    // 첫 탭(#subject)은 맨 위가 맞다 — lockSpy 주석 참고.
    if (key === DETAIL_TABS[0].key) {
      window.scrollTo({ top: 0 });
      return;
    }

    requestAnimationFrame(() => {
      document.getElementById(key)?.scrollIntoView();
    });
  }, [hospital?.id]);

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
      <p className="py-16 text-center text-rose-600">{t('common.loadError')}</p>
    );
  }

  /**
   * 진료과목과 표시과목은 다르다.
   *   진료과목  declared          신고한 과목. 의사가 0명이어도 등재된다.
   *   표시과목  specialistCount>0 전문의가 실제로 있는 과목.
   */

  /**
   * 교통편을 수단별로 나누고, 그 안에서 **같은 하차지점끼리 묶는다.**
   *
   * 원본은 노선마다 한 행이라 정류장이 그대로 반복된다 —
   * 강일병원은 "강일병원 정문"이 아홉 줄 찍힌다. 정류장 하나에 노선을 모아 한 줄로 만든다.
   */
  /**
   * 노선색을 고르려면 도시를 알아야 한다. 노선 칸은 "1호선" 까지만 적고 지역을 안 적는데
   * 부산 1호선(주황)과 서울 1호선(남색)은 다른 노선이다 — 주소가 유일한 단서다.
   */
  const metroCity = metroCityOf(hospital.location?.address);

  /**
   * 교통편. **지하철과 버스를 "대중교통" 하나로 묶는다.**
   *
   * 예전엔 수단마다 레이블을 달았는데, 노선색과 버스 아이콘이 이미 무엇인지 말하고 있어
   * "지하철" 이라고 또 쓰는 꼴이었다. 레이블을 떼고 나니 나눠 둘 이유도 없다 —
   * 사람은 "여기 어떻게 가지" 를 한 번 묻지 지하철과 버스를 따로 묻지 않는다.
   * 지하철을 먼저 둔다. 노선이 정해져 있어 버스보다 빨리 위치를 알려준다.
   *
   * **기타는 합치지 않는다.** 자가용·기차·기타가 섞여 있어 대중교통이 아닌 것이 들어 있고,
   * 붙일 표지도 없어 레이블이 유일한 단서다.
   */
  const transitStops = (
    [
      { key: 'subway', routes: hospital.transport?.subway ?? [] },
      { key: 'bus', routes: hospital.transport?.bus ?? [] },
    ] as const
  ).flatMap((g) => groupByStop(g.routes).map((stop) => ({ key: g.key, stop })));

  const etcStops = groupByStop(hospital.transport?.etc ?? []);

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

  // 역량(capability)은 type 으로 갈린다. 특수진료는 진료 섹션, 전문병원 지정은 규모 섹션에 붙인다.
  const capabilities = hospital.capabilities ?? [];
  const specialCare = capabilities.filter((c) => c.type === 'special');
  const specialtyFields = capabilities.filter((c) => c.type === 'specialty');

  return (
    // 카드를 걷어냈으므로 **페이지가 곧 한 장의 흰 종이**다.
    // 섹션마다 흰 카드를 두르면 탭이 하는 구역 나누기를 두 번 하게 되어 화면이 조각난다.
    // 배경은 흰색으로 채우고, 구역은 선으로만 가른다.
    <div className="mx-auto max-w-3xl space-y-5 rounded-2xl bg-white px-4 py-6">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> {t('clinic.backToSearch')}
      </button>

      {/*
        병원 이름과 탭 바는 상세·비급여 페이지가 공유한다(HospitalHeader). 함께 고정돼서,
        탭을 눌러 구역을 옮겨도 "어느 병원을 보고 있나" 가 사라지지 않는다.
      */}
      <HospitalHeader
        hospital={hospital}
        mode="detail"
        stickyRef={stickyRef}
        activeTab={tab}
        onTabClick={lockSpy}
        onRegionClick={(event) => lockSpy(event, 'location')}
        prefetchNpay={prefetchNpay}
      />

      <Section
        first
        id="subject"
        title={t('clinic.tabs.subject')}
        icon={<Stethoscope className="h-4 w-4 text-primary-600" />}
      >
        {/*
          연락처. **규모 섹션의 "의료진 / 병상 / 장비" 와 같은 소제목 체계다.**
          섹션 제목(소개)은 탭과 짝을 이루고, 그 안의 덩어리마다 소제목을 단다.
          전화·홈페이지는 각각 한 줄씩 — 한 줄에 붙이면 긴 URL 이 전화번호를 밀어낸다.
        */}
        <p className="text-xs font-medium text-slate-500">{t('clinic.contact')}</p>
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
            <p className="text-xs font-medium text-slate-500">{t('clinic.intro')}</p>
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
        title={t('clinic.tabs.care')}
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
              {t('clinic.hours')}
            </p>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-sm text-slate-500">
                {t('clinic.hoursEmpty')}
              </p>
              {/*
                진료시간 "없음"은 중요도가 낮은 상태다. 채움 버튼으로 강조하면
                과한 시선을 뺏는다. 전화는 **보조 행동**이니 텍스트 링크 톤으로 낮춘다.
              */}
              {hospital.tel && (
                <a
                  href={`tel:${hospital.tel}`}
                  className="mt-1.5 inline-flex items-center gap-1 text-sm text-slate-500 no-underline hover:text-primary-600"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t('clinic.hoursConfirm', { tel: hospital.tel })}
                </a>
              )}
            </div>
          </div>
        )}

        {(general.length > 0 || baby.length > 0) && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">
              {t('clinic.hours')}
            </p>
          {/* 소개·안내와 같은 회색 박스. 강조가 아니라 **덩어리로 묶어주는** 역할이다. */}
          {general.length > 0 && (
            <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
              {general.map((h) => (
                <div key={h.day} className="flex flex-wrap items-center gap-x-2.5">
                  <dt className="w-10 shrink-0 text-slate-500">
                    {t(`common.days.${h.day}`)}
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
                        {t('clinic.lunch', { start: formatTime(h.breakStart), end: formatTime(h.breakEnd) })}
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
                <Baby className="h-3 w-3" /> {t('clinic.babyHours')}
              </p>
              <dl className="mt-1.5 space-y-1 text-sm">
                {baby.map((h) => (
                  <div key={h.day} className="flex gap-3">
                    <dt className="w-12 shrink-0 text-amber-700">
                      {t(`common.days.${h.day}`)}
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
                <p className="mb-1.5 text-xs font-medium text-slate-500">{t('clinic.notice')}</p>
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
          <p className="mb-1.5 text-xs font-medium text-slate-500">{t('clinic.subjects')}</p>
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
                {t('clinic.specialist')}{' '}
                <span className="font-normal text-slate-400">{t('clinic.displaySubject')}</span>
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
                      <span className="ml-0.5 text-xs text-slate-500">{t('clinic.peopleSuffix')}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}

        {/*
          특수진료(진료가능분야). 방문진료·재택의료·응급의료기관 등 "이 병원이 참여/제공하는 제도"다.
          이름이 길어(문장에 가깝다) 칩으로 흘리면 읽기 어렵다. **한 줄에 하나씩** 세로로 쌓는다 —
          장비·표시과목과 같은 회색 박스 행 스타일이다.
        */}
        {specialCare.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-slate-500">{t('clinic.specialCare')}</p>
            {/*
              항목이 많아 1열로 쌓으면 세로로 늘어진다. 넓어지면(sm~) 2열로 접는다.

              **구분선을 위(border-t)에 긋는다.** 아래(border-b + last:border-b-0)로 하면
              2열에서 마지막 행의 오른쪽 칸만 선이 지워지고 왼쪽엔 남아 어긋난다
              (last: 는 DOM 의 마지막 하나만 잡는데, 2열의 마지막 행은 칸이 둘이라서다).
              위로 뒤집으면 **첫 행만** 지우면 되고, 첫 행은 1열일 땐 1개·2열일 땐 2개라
              first: 와 sm:nth-child(2) 로 정확히 잡힌다. 홀수·짝수 둘 다 맞는다.
            */}
            <div className="grid grid-cols-1 gap-x-8 rounded-xl bg-slate-50 px-3 py-1 sm:grid-cols-2">
              {specialCare.map((c) => (
                <div
                  key={c.code}
                  className="border-t border-slate-200/60 py-1.5 text-xs text-slate-700 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                >
                  {c.name ?? c.code}
                </div>
              ))}
            </div>
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
          title={t('clinic.tabs.scale')}
          icon={<Building2 className="h-4 w-4 text-primary-600" />}
        >
          {/*
            종별 + 차수. "치과의원 (1차)" 처럼 붙여 쓴다.
            **같은 차수를 부르는 이름이 종별마다 다르다** — 의원·치과의원·한의원이 전부 1차다.
            종별만 보면 그게 어느 급인지 모르고, 차수만 보면 무슨 병원인지 모른다. 둘을 붙여야 읽힌다.
            care(요양·정신)는 차수 체계 밖이라 종별만 쓴다.
          */}
          {(hospital.category || specialtyFields.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {/*
                예전엔 여기에 "(1차)" 를 붙였다. 뺐다 — tier 는 **우리가 매긴 등급**이지
                의료전달체계의 1·2·3차가 아니다. 그 이름을 빌려 쓰면 공식 차수와 같다고 오해한다.
                등급은 이름 위 배지(의원급·병원급·상급종합)가 이미 말한다.
              */}
              {hospital.category && (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  {hospital.category.name}
                </span>
              )}
              {/* 종별 옆에 전문병원 지정분야도 함께 — "종합병원 · 심장 전문병원" 처럼 성격을 붙여 읽힌다. */}
              {specialtyFields.map((c) => (
                <span
                  key={c.code}
                  className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                >
                  {c.name
                    ? `${c.name} ${t('clinic.specialtyHospital')}`
                    : t('clinic.specialtyHospital')}
                </span>
              ))}
            </div>
          )}

          {/*
            대표 숫자를 **라벨 줄에 올린다.** "의료진 · 총 의사 23" 이 먼저 읽히고,
            내역(전문의·치과의사…)은 그 아래 배지로 따라온다.
            라벨만 있는 줄은 자리만 먹는다 — 어차피 총원이 그 섹션의 요약이다.
          */}
          {staff?.doctorTotal ? (
            <>
              <p className="mt-3 text-xs font-medium text-slate-500">{t('clinic.staff')}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Stat label={t('clinic.staffField.total')} value={staff.doctorTotal} primary />

                {/* 총원과 내역 사이에 선을 둔다. 내역을 더해도 총원이 안 된다(겸직 중복). */}
                <span className="mx-0.5 h-5 w-px bg-slate-200" />

                <Stat label={t('clinic.staffField.specialist')} value={staff.specialist} />
                <Stat label={t('clinic.staffField.resident')} value={staff.resident} />
                <Stat label={t('clinic.staffField.intern')} value={staff.intern} />
                <Stat label={t('clinic.staffField.general')} value={staff.generalDoctor} />
                <Stat label={t('clinic.staffField.dentist')} value={staff.dentist} />
                <Stat label={t('clinic.staffField.oriental')} value={staff.oriental} />
              </div>
            </>
          ) : null}

          {beds?.total ? (
            <>
              <p className="mt-3 text-xs font-medium text-slate-500">{t('clinic.beds')}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Stat label={t('clinic.bedField.total')} value={beds.total} primary />
                <span className="mx-0.5 h-5 w-px bg-slate-200" />
                <Stat label={t('clinic.bedField.standard')} value={beds.standard} />
                <Stat label={t('clinic.bedField.higher')} value={beds.higher} />
                <Stat label={t('clinic.bedField.icu')} value={beds.icu} />
                <Stat label={t('clinic.bedField.emergency')} value={beds.emergency} />
                <Stat label={t('clinic.bedField.operatingRoom')} value={beds.operatingRoom} />
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
              <p className="mt-3 text-xs font-medium text-slate-500">{t('clinic.equipments')}</p>
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
              {t('clinic.staffNote')}
            </p>
          ) : null}
        </Section>
      )}

      {/*
        평가. **다른 섹션과 성격이 다르다** — 진료과목·병상·장비는 병원의 속성이지만
        이건 **심평원이 이 병원을 어떻게 평가했는지**다. 우리 판단도 병원 신고값도 아니라서
        출처를 반드시 밝힌다. 그래서 제목이 "평가" 가 아니라 "심평원 병원평가" 다.

        평가대상이 아닌 병원엔 섹션 자체가 없다(assessment 가 undefined). 탭도 같이 숨는다.
      */}
      {hospital.assessment && (
        <Section
          id="assessment"
          title={t('clinic.assessment.title')}
          icon={<ClipboardCheck className="h-4 w-4 text-primary-600" />}
        >
          {/* 출처와 읽는 법을 먼저. 숫자만 보면 5등급이 나쁜 건지 좋은 건지 모른다. */}
          <p className="text-xs text-slate-500">{t('clinic.assessment.source')}</p>

          <div className="mt-3 space-y-4">
            {hospital.assessment.groups.map((group) => (
              <div key={group.code}>
                <h3 className="text-sm font-semibold text-slate-700">
                  {group.name}
                </h3>

                {/*
                  전문의수 표와 같은 회색 박스·2열 그리드다. 평가항목이 최대 22개인데 1열로 쌓으면
                  세로로 한없이 늘어진다. 넓어지면(sm~) 2열로 접는다.
                  구분선을 위(border-t)에 긋는 이유는 특수진료 쪽 주석 참고.
                */}
                <div className="mt-1.5 grid grid-cols-1 gap-x-8 rounded-xl bg-slate-50 px-3 py-1 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div
                      key={item.code}
                      className="flex items-baseline justify-between gap-3 border-t border-slate-200/60 py-1.5 text-sm first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                    >
                      {/* 항목명이 길다("급성상기도 감염 항생제 처방률"). 등급이 밀리지 않게 자른다. */}
                      <span className="truncate text-sm text-slate-600">
                        {item.name}
                      </span>
                      <GradeBadge normalized={item.normalized} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/*
            평가대상이 아닌 항목은 목록에 아예 없다. 그걸 안 밝히면 "우리 병원 천식 평가가 왜 없지" 가 된다.
            NULL(평가대상 아님)과 등급제외(평가했으나 등급 미부여)는 다르다 — 후자는 목록에 뜬다.
          */}
          <p className="mt-3 text-xs text-slate-400">{t('clinic.assessment.note')}</p>
        </Section>
      )}

      {/*
        위치. **"어떻게 가나" 에 답하는 것을 전부 모은다** — 교통편·주소·지도·주차.
        예전엔 교통 안내와 위치가 따로였는데, 사용자는 그 둘을 한 번에 본다.
        "지하철로 갈까 차로 갈까" 를 한 화면에서 판단해야 한다.
      */}
      <Section
        id="location"
        title={t('clinic.tabs.location')}
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

        {(transitStops.length > 0 || etcStops.length > 0) && (
          <div className="space-y-3">
            {/*
              지하철과 버스가 **한 목록**이다. 노선색과 버스 아이콘이 이미 수단을 말하므로
              레이블로 갈라 둘 이유가 없다 — 사람은 "여기 어떻게 가지" 를 한 번 묻는다.
            */}
            {transitStops.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  {t('clinic.transport.publicTransit')}
                </p>
                <ul className="mt-1 divide-y divide-slate-100 pl-3">
                  {transitStops.map(({ key, stop }, index) => (
                    <TransportRow
                      key={index}
                      kind={key}
                      stop={stop}
                      city={metroCity}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* 기타는 자가용·기차·기타가 섞여 대중교통이 아닌 것도 있다. 따로 둔다. */}
            {etcStops.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {t('clinic.transport.etc')}
                </p>
                <ul className="mt-1 divide-y divide-slate-100 pl-3">
                  {etcStops.map((stop, index) => (
                    <TransportRow key={index} kind="etc" stop={stop} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}


        {/*
          주차. **교통수단의 하나다** — 지하철·버스 다음에 "차로 오면" 이 온다.
          주소 아래 두면 "여기가 어디인가" 와 "어떻게 가나" 가 섞인다.
          안내문은 대개 요금표라 박스로 묶는다.
        */}
        {hospital.parking?.capacity ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-slate-600">{t('clinic.parking')}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Stat label={t('clinic.parkingCapacity')} value={hospital.parking.capacity} />
              {hospital.parking.paid !== undefined && (
                <span className="inline-flex items-center rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100">
                  {hospital.parking.paid ? t('clinic.paid') : t('clinic.free')}
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
          <p className="text-xs font-medium text-slate-500">{t('clinic.address')}</p>
        {hospital.location?.address && (
          <div className="mt-1.5 flex items-start gap-2">
            {hospital.location.postNo && (
              <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                {hospital.location.postNo}
              </span>
            )}
            <p className="min-w-0 flex-1 break-keep text-sm text-slate-700">
              {hospital.location.address}{' '}
              <span className="text-slate-800">{hospital.name}</span>
            </p>
            {(() => {
              const copyText = `${hospital.location.address} ${hospital.name}`;
              const isCopied = copied === copyText;
              return (
                <button
                  type="button"
                  onClick={() => void copy(copyText)}
                  aria-label={t('clinic.copyAddress')}
                  title={t('clinic.copyAddress')}
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
                    isCopied
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                  )}
                >
                  {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              );
            })()}
          </div>
        )}
        {hospital.location?.lat && hospital.location?.lon ? (
          mapOpen ? (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                {t('clinic.map')}
              </p>
              <MapView
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
              <MapPin className="h-4 w-4" /> {t('clinic.showMap')}
              <ChevronDown className="h-4 w-4" />
            </button>
          )
        ) : null}
        </div>
      </Section>
    </div>
  );
}
