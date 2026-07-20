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
} from 'lucide-react';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { LangLink } from '@/shared/i18n/LangLink';
import { useLangPath } from '@/shared/i18n/routing';
import { useHospitalSearch, type HospitalSearchParams } from '@/features/clinic/api';
import { HospitalCard } from '@/features/clinic/components/HospitalCard';
import { cn } from '@/shared/lib/utils';

/** 섹션당 노출 카드 수. */
const FEATURED_SIZE = 5;

/**
 * 첫 페이지 추천 섹션.
 *
 * **필터가 아니라 진입점이다** — 검색 페이지의 탭과 같은 성격이라 아이콘·색을 그대로 빌려온다.
 * 지금은 서버 플래그가 이미 있는 둘(emergency·baby)만 건다. 분야별 평가 우수는 뒤에 붙인다.
 *
 * **정렬은 아직 id 순이다.** 검색 API 가 위치·평가 정렬을 안 줘서 "추천 5" 가 사실은 "앞의 5" 다.
 * 가까운 순/평가순은 백엔드가 정렬을 지원하면 그때 붙인다.
 */
const SECTIONS = [
  {
    key: 'emergency',
    to: '/search?emergency=1',
    icon: Siren,
    iconBox: 'bg-rose-50 text-rose-600',
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
    iconBox: 'bg-sky-50 text-sky-600',
    params: { tier: 'TIER3' } as Partial<HospitalSearchParams>,
  },
  // 적정성평가 1등급(전국·2차 이상). tier=TIER2,TIER3 로 의원급을 뺀다 —
  // 이 항목들은 병원급+ 일이라 의원엔 등급이 안 붙지만, "더보기" 검색까지 결이 맞게 명시한다.
  {
    key: 'cancer',
    to: '/search?assessment=cancer&tier=TIER2,TIER3',
    icon: Ribbon,
    iconBox: 'bg-violet-50 text-violet-600',
    params: {
      assessment: 'cancer',
      tier: 'TIER2,TIER3',
    } as Partial<HospitalSearchParams>,
  },
  {
    key: 'cardio',
    to: '/search?assessment=cardio&tier=TIER2,TIER3',
    icon: HeartPulse,
    iconBox: 'bg-red-50 text-red-600',
    params: {
      assessment: 'cardio',
      tier: 'TIER2,TIER3',
    } as Partial<HospitalSearchParams>,
  },
  {
    key: 'nicu',
    to: '/search?assessment=nicu&tier=TIER2,TIER3',
    icon: Baby,
    iconBox: 'bg-teal-50 text-teal-600',
    params: {
      assessment: 'nicu',
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
    const q = keyword.trim();
    // 접두사를 붙여 보낸다. 안 붙이면 영어 페이지에서 검색했는데 한국어 검색으로 튕긴다.
    navigate(path(q ? `/search?q=${encodeURIComponent(q)}` : '/search'));
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6">
      <section className="flex flex-col items-center py-14 text-center">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          {t('home.heroTitle')}
        </h1>
        <p className="mt-3 max-w-md text-slate-500">{t('home.heroSubtitle')}</p>

        <form onSubmit={onSubmit} className="mt-8 flex w-full max-w-lg gap-3">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            aria-label={t('home.searchPlaceholder')}
          />
          <Button type="submit" className="shrink-0">
            <Search className="h-4 w-4" />
            {t('home.searchButton')}
          </Button>
        </form>
      </section>

      <div className="space-y-10 pb-16">
        {SECTIONS.map((section) => (
          <FeaturedSection key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}

/**
 * 추천 섹션 하나. 스켈레톤을 먼저 그리고 API 는 클라이언트에서 로드한다 —
 * 첫 페이지가 데이터를 기다리지 않고 바로 열린다.
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
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              iconBox,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="text-left">
            <h2 className="font-semibold text-slate-900">
              {t(`home.sections.${section.key}.title`)}
            </h2>
            <p className="text-sm text-slate-500">
              {t(`home.sections.${section.key}.subtitle`)}
            </p>
          </div>
        </div>
        {!isEmpty && (
          <LangLink
            to={section.to}
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            {t('home.sections.more')}
            <ChevronRight className="h-4 w-4" />
          </LangLink>
        )}
      </div>

      {isEmpty ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
          {t('home.sections.empty')}
        </p>
      ) : (
        /*
          반응형 열거. 모바일은 한 줄에 하나씩 세로로 쌓이고, 화면이 넓어질수록 열을 늘려
          PC(lg)에선 5장이 한 줄에 꽉 찬다.
        */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {isPending
            ? Array.from({ length: FEATURED_SIZE }).map((_, i) => (
                <HospitalCardSkeleton key={i} />
              ))
            : hospitals.map((hospital) => (
                <HospitalCard key={hospital.id} hospital={hospital} compact />
              ))}
        </div>
      )}
    </section>
  );
}

/** HospitalCard 의 껍데기. 로딩 중 자리를 잡아 첫 페이지가 흔들리지 않게 한다. */
function HospitalCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="h-4 w-16 animate-pulse rounded-full bg-slate-100" />
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" />
      <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-slate-100" />
    </div>
  );
}
