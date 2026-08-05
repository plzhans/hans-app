import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Baby,
  Building2,
  ChevronRight,
  HeartPulse,
  Moon,
  Ribbon,
  Search,
  Siren,
  SlidersHorizontal,
} from 'lucide-react';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { MyLocationButton } from '@/shared/components/MyLocationButton';
import { LangLink } from '@/shared/i18n/LangLink';
import { useLangPath } from '@/shared/i18n/routing';
import {
  useHospitalSearch,
  type HospitalSearchParams,
} from '@/features/clinic/api';
import { HospitalCard } from '@/features/clinic/components/HospitalCard';
import { cn } from '@/shared/lib/utils';

/** 섹션당 노출 카드 수. */
const FEATURED_SIZE = 5;

/**
 * 첫 페이지 추천 섹션.
 *
 * **필터가 아니라 진입점이다** — 검색 페이지의 탭과 같은 성격이라 아이콘·색을 그대로 빌려온다.
 *
 * **정렬은 아직 id 순이다.** 검색 API 가 위치·평가 정렬을 안 줘서 "추천 5" 가 사실은 "앞의 5" 다.
 * 가까운 순/평가순은 백엔드가 정렬을 지원하면 그때 붙인다.
 */
const SECTIONS = [
  {
    key: 'emergency',
    to: '/search?emergency=1',
    icon: Siren,
    iconBox: 'bg-danger-tint text-danger',
    params: { emergency: true } as Partial<HospitalSearchParams>,
  },
  {
    key: 'baby',
    to: '/search?baby=1',
    icon: Moon,
    iconBox: 'bg-indigo-50 text-indigo-600',
    params: { baby: true } as Partial<HospitalSearchParams>,
  },
  {
    key: 'tertiary',
    to: '/search?tier=TIER3',
    icon: Building2,
    iconBox: 'bg-brand-tint text-brand',
    params: { tier: 'TIER3' } as Partial<HospitalSearchParams>,
  },
  // 적정성평가 1등급(전국·2차 이상). assessment 는 평가 항목 코드(원본 asmGrd 번호)의 묶음이다.
  //   암 = 대장암(12)·위암(13)·유방암(14)·폐암(15) / 심뇌혈관 = 급성기뇌졸중(01)·관상동맥우회술(06)
  //   NICU = 신생아중환자실(20). 하나라도 1등급이면 걸린다(OR).
  // tier=TIER2,TIER3 로 의원급을 뺀다 — 이 항목들은 병원급+ 일이라 의원엔 등급이 안 붙는다.
  {
    key: 'cancer',
    to: '/search?assessment=12,13,14,15&tier=TIER2,TIER3',
    icon: Ribbon,
    iconBox: 'bg-violet-50 text-violet-600',
    params: {
      assessment: '12,13,14,15',
      tier: 'TIER2,TIER3',
    } as Partial<HospitalSearchParams>,
  },
  {
    key: 'cardio',
    to: '/search?assessment=01,06&tier=TIER2,TIER3',
    icon: HeartPulse,
    iconBox: 'bg-rose-50 text-rose-600',
    params: {
      assessment: '01,06',
      tier: 'TIER2,TIER3',
    } as Partial<HospitalSearchParams>,
  },
  {
    key: 'nicu',
    to: '/search?assessment=20&tier=TIER2,TIER3',
    icon: Baby,
    iconBox: 'bg-ok-tint text-ok',
    params: {
      assessment: '20',
      tier: 'TIER2,TIER3',
    } as Partial<HospitalSearchParams>,
  },
] as const;

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const path = useLangPath();
  const [keyword, setKeyword] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();

    const q = keyword.trim();
    if (q) params.set('q', q);

    const query = params.toString();
    // 접두사를 붙여 보낸다. 안 붙이면 영어 페이지에서 검색했는데 한국어 검색으로 튕긴다.
    navigate(path(query ? `/search?${query}` : '/search'));
  }

  return (
    <>
      {/*
        히어로. **상세와 같은 파란 그라데이션이다** — 두 화면이 같은 앱으로 읽히게 하는
        가장 큰 단서다. 상세에서는 병원 이름이 오는 자리에 여기서는 서비스 이름이 온다.

        전역 헤더 밑으로 파고들지 않는다. 상세는 앱바가 "이 병원" 을 말하느라 히어로와 한
        덩어리여야 했지만, 여기 헤더는 로고·검색·언어라 성격이 다르다 — 겹치면 로고 위에
        또 서비스 이름이 얹혀 같은 말이 두 번 나온다.
      */}
      <section
        className="relative overflow-hidden px-5 pb-16 pt-10 text-white"
        style={{ backgroundImage: 'var(--gradient-hero)' }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,.18), rgba(255,255,255,0) 70%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight sm:text-4xl">
            {t('home.heroTitle')}
          </h1>
          <p className="mx-auto mt-2.5 max-w-md text-[0.85rem] text-white/85">
            {t('home.heroSubtitle')}
          </p>
        </div>
      </section>

      {/*
        검색. **히어로에 걸쳐 뜨는 흰 카드다** — 상세의 빠른 실행 4칸과 같은 장치로,
        파란 면과 회색 본문을 꿰매면서 "이 화면에서 할 일은 이것" 을 맨 앞에 세운다.
      */}
      <div className="relative z-10 mx-auto -mt-10 max-w-3xl px-4">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-2 rounded-card border border-line-subtle bg-surface p-3 shadow-raised"
        >
          {/*
            내 위치. **여기서 권한을 받는다** — 화면이 열릴 때 미리 묻지 않는다.
            누르면 지역만 잡아두고(버튼에 "하남시" 가 뜬다) 이동은 검색 버튼이 한다.
            한 번 더 누르면 해제된다 — 잡아둔 지역을 무르는 다른 수단이 이 화면엔 없다.

            **위치와 검색어를 다른 줄에 둔다.** 한 줄에 넣으면 지역이 잡히는 순간 버튼이
            "내 위치"에서 "하남시"로 넓어지면서 입력칸을 그만큼 먹는다 — 390px 화면에서는
            무엇을 치는 칸인지 안 보일 만큼 쪼그라든다. 줄을 나누면 폭을 다툴 일이 없다.
          */}
          <div className="flex gap-2">
            {/* min-w-0 이 없으면 flex 항목이 콘텐츠 폭 밑으로 안 줄어 버튼을 밀어낸다. */}
            {/*
              내 위치. **입력칸 밖 왼쪽**이다. 한때 칸 안에 넣어 봤는데, 안에 있으면 검색어를
              고치는 도구처럼 읽힌다 — 이건 입력과 상관없이 켜고 끄는 별개의 스위치다.
              칸 앞에 세우면 "위치를 켜고 · 무엇을 찾을지 치고 · 검색" 이 왼쪽부터 차례로 읽힌다.

              **위치로 검색 조건을 바꾸지 않는다.** 예전엔 누르면 그 시군구가 조건으로 박혔는데,
              "내 위치" 는 어디를 검색할지가 아니라 **가까운 것을 위로 올릴지** 를 정하는 값이다 —
              경계에 서 있는 사람에게 길 건너 병원을 지우는 건 위치를 알려준 대가로는 이상하다.
              좌표를 실제로 쓰려면 서버가 거리 가중치 정렬을 지원해야 한다(아직 없다).
            */}
            <MyLocationButton
              onResolved={() => undefined}
              className="h-11 w-11 shrink-0 px-0"
            />

            {/* min-w-0 이 없으면 flex 항목이 콘텐츠 폭 밑으로 안 줄어 버튼을 밀어낸다. */}
            <div className="min-w-0 flex-1">
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('home.searchPlaceholder')}
                aria-label={t('home.searchPlaceholder')}
              />
            </div>

            <Button type="submit" className="shrink-0">
              <Search className="h-4 w-4" />
              {t('home.searchButton')}
            </Button>
          </div>

          {/*
            잡힌 지역과 상세검색 입구. **검색 상자 바로 아래**다 — 위치를 잡았는지 확인하고,
            더 좁혀 찾고 싶으면 그 자리에서 바로 넘어간다.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 상세검색으로 바로. advanced=1 이면 검색 화면이 조건을 펼친 채로 연다. */}
            <LangLink
              to="/search?advanced=1"
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.72rem] font-bold text-ink-muted no-underline transition-colors active:text-brand"
            >
              <SlidersHorizontal className="h-3 w-3" />
              {t('home.advancedSearch')}
            </LangLink>
          </div>
        </form>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5">
        {SECTIONS.map((section) => (
          <FeaturedSection key={section.key} section={section} />
        ))}
      </div>
    </>
  );
}

/**
 * 추천 섹션 하나. 스켈레톤을 먼저 그리고 API 는 클라이언트에서 로드한다 —
 * 첫 페이지가 데이터를 기다리지 않고 바로 열린다.
 *
 * **섹션을 카드로 두르지 않는다.** 한때 상세의 Section 처럼 흰 카드를 씌웠는데, 이 구역은
 * 안에 든 것이 이미 카드(병원 카드)라서 사각형 안에 사각형이 됐다 — 흰 바탕에 흰 카드라
 * 어느 쪽이 덩어리인지도 안 읽힌다. 제목은 회색 바닥에 그냥 얹고 카드들만 띄운다.
 * 상세 하단의 '근처의 비슷한 병원' 도 같은 이유로 Section 의 bare 를 쓴다.
 */
function FeaturedSection({ section }: { section: (typeof SECTIONS)[number] }) {
  const { t } = useTranslation();
  const { icon: Icon, iconBox } = section;

  const { data, isPending } = useHospitalSearch({
    page: 1,
    size: FEATURED_SIZE,
    ...section.params,
  });

  const hospitals = data?.items ?? [];

  // 로딩이 끝났는데 한 곳도 없는 상태. 섹션을 지우면(스켈레톤 → 사라짐) 깜빡여 이상하니,
  // 자리는 유지하고 "없음"을 그린다. 이럴 땐 갈 곳이 없어 "더보기"도 숨긴다.
  const isEmpty = !isPending && hospitals.length === 0;

  return (
    <section className="mt-6 px-1 first:mt-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex h-[2.1rem] w-[2.1rem] shrink-0 items-center justify-center rounded-box',
              iconBox,
            )}
          >
            <Icon className="h-[1.1rem] w-[1.1rem]" />
          </span>
          <div className="min-w-0 text-left">
            <h2 className="truncate text-[0.92rem] font-extrabold tracking-tight text-ink">
              {t(`home.sections.${section.key}.title`)}
            </h2>
            <p className="truncate text-[0.72rem] text-ink-subtle">
              {t(`home.sections.${section.key}.subtitle`)}
            </p>
          </div>
        </div>
        {!isEmpty && (
          <LangLink
            to={section.to}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-surface px-2.5 py-1 text-[0.72rem] font-bold text-ink-muted no-underline shadow-card transition-transform duration-100 ease-native active:scale-95"
          >
            {t('home.sections.more')}
            <ChevronRight className="h-3.5 w-3.5" />
          </LangLink>
        )}
      </div>

      {isEmpty ? (
        <p className="rounded-tile border border-line-subtle bg-surface px-4 py-6 text-center text-sm text-ink-subtle shadow-card">
          {t('home.sections.empty')}
        </p>
      ) : (
        /*
          반응형 열거. 모바일은 한 줄에 하나씩 세로로 쌓이고, 화면이 넓어질수록 열을 늘려
          PC(lg)에선 5장이 한 줄에 꽉 찬다.
        */
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {isPending
            ? Array.from({ length: FEATURED_SIZE }).map((_, i) => (
                <HospitalCardSkeleton key={i} />
              ))
            : hospitals.map((hospital) => (
                <HospitalCard
                  key={hospital.id}
                  hospital={hospital}
                  variant="brief"
                />
              ))}
        </div>
      )}
    </section>
  );
}

/** HospitalCard 의 껍데기. 로딩 중 자리를 잡아 첫 페이지가 흔들리지 않게 한다. */
function HospitalCardSkeleton() {
  return (
    <div className="rounded-tile border border-line-subtle bg-surface p-3.5">
      <div className="h-4 w-16 animate-pulse rounded-full bg-surface-subtle" />
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-subtle" />
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-surface-subtle" />
      <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-surface-subtle" />
    </div>
  );
}
