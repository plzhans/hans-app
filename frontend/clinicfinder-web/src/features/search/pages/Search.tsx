import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTranslation } from 'react-i18next';
import { Input } from '@/shared/ui/Input';
import { Combobox } from '@/shared/ui/Combobox';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import {
  useHospitalSearch,
  useSubjects,
  useSubjectGroups,
  useHospitalTiers,
  useSidoRegions,
  useSgguRegions,
} from '@/features/clinic/api';
import { cn } from '@/shared/lib/utils';
import {
  BedDouble,
  Brain,
  ChevronDown,
  Moon,
  Search as SearchIcon,
  Siren,
  SlidersHorizontal,
  Stethoscope,
  X,
} from 'lucide-react';
import { HospitalCard } from '@/features/clinic/components/HospitalCard';

const PAGE_SIZE = 20;

/**
 * 진입점 탭. 서로 배타적이다 — 하나만 켜진다.
 *
 * **필터가 아니라 진입점이다.** 찾는 사람이 서로 다르다 —
 * 병원은 진료를 계획하는 사람, 응급실은 지금 당장 아픈 사람, 달빛은 밤에 아이가 열나는 부모,
 * 요양은 어르신을 모실 곳을 찾는 가족, 정신은 입원 치료를 알아보는 사람이다.
 *
 * 요양·정신은 tier 로 거른다. 나머지 탭에서는 서버가 기본으로 빼 준다.
 *
 * **이름은 끝까지 쓴다.** "요양병원"·"정신병원" 처럼 끝까지 써야 무엇을 찾는 곳인지 읽힌다.
 *
 * 색은 **켜졌을 때만** 쓴다 — 응급은 빨강, 달빛은 밤(남색)처럼 탭의 성격을 그대로 빌려온다.
 * 다섯 개를 전부 물들이면 그건 색이 아니라 소음이다.
 */
const TABS = [
  {
    key: 'hospital',
    icon: Stethoscope,
    on: 'border-primary-600 text-primary-700',
    dot: 'text-primary-600',
    emergency: false,
    baby: false,
    tier: '',
  },
  {
    key: 'emergency',
    icon: Siren,
    on: 'border-rose-600 text-rose-700',
    dot: 'text-rose-600',
    emergency: true,
    baby: false,
    tier: '',
  },
  {
    key: 'baby',
    icon: Moon,
    on: 'border-indigo-600 text-indigo-700',
    dot: 'text-indigo-600',
    emergency: false,
    baby: true,
    tier: '',
  },
  {
    key: 'nursing',
    icon: BedDouble,
    on: 'border-emerald-600 text-emerald-700',
    dot: 'text-emerald-600',
    emergency: false,
    baby: false,
    tier: 'NURSING',
  },
  {
    key: 'mental',
    icon: Brain,
    on: 'border-violet-600 text-violet-700',
    dot: 'text-violet-600',
    emergency: false,
    baby: false,
    tier: 'MENTAL',
  },
];

/**
 * 병원 검색.
 *
 * **검색은 서버가 한다.** 예전에는 원본(hira/nmc)을 골라 한 페이지를 받아 온 뒤
 * 그 안에서 이름으로 클라이언트 필터링했다 — 8만 건 중 20건만 보고 거르니 사실상 무용지물이었다.
 * 이제 지역·종별·진료과목·이름을 서버에 넘긴다 (인덱스를 탄다).
 */
export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  /**
   * **상태가 두 겹이다.**
   *   URL    지금 **검색된** 조건. 이게 바뀔 때만 API 가 나간다.
   *   draft  사용자가 **고르고 있는** 조건. 화면은 이걸 그린다.
   *
   * 예전엔 URL 하나였다 — 체크박스를 누를 때마다 검색이 나갔다. 진료과목 47개를 훑으며
   * 다섯 개만 켜도 요청이 다섯 번이다. 8만 건 테이블에 그 부하를 그대로 얹을 이유가 없다.
   * 이제 고르는 동안은 draft 에만 쌓이고, **검색 버튼을 눌러야** URL 로 넘어간다.
   *
   * 탭(병원·응급실·달빛·요양·정신)만 예외다 — 그건 필터가 아니라 진입점이라 즉시 반영한다.
   */
  const applied = {
    q: searchParams.get('q') ?? '',
    sido: searchParams.get('sido') ?? '',
    region: searchParams.get('region') ?? '',
    subject: searchParams.get('subject') ?? '',
    tier: searchParams.get('tier') ?? '',
  };

  const emergency = searchParams.get('emergency') === '1';
  const baby = searchParams.get('baby') === '1';

  const [draft, setDraft] = useState(applied);

  /** 뒤로가기·링크로 URL 이 바뀌면 초안도 따라간다. 그래야 화면과 URL 이 어긋나지 않는다. */
  const appliedKey = JSON.stringify(applied);
  useEffect(() => {
    setDraft(JSON.parse(appliedKey));
  }, [appliedKey]);

  const keyword = draft.q;
  const sido = draft.sido;
  const region = draft.region;
  const subject = draft.subject;
  const tier = draft.tier;

  /** 고르는 중. URL 은 아직 안 건드린다. */
  const update = (patch: Record<string, string>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  /** 검색 실행. 초안을 URL 로 넘긴다 — 이때 비로소 API 가 나간다. */
  const search = () => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(draft)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  /** 탭은 진입점이라 즉시 검색한다. 초안도 함께 갱신해 화면이 어긋나지 않게 한다. */
  const switchTab = (patch: Record<string, string>) => {
    const merged = { ...draft, ...patch };
    setDraft(merged);

    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries({ ...merged, ...patch })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  /** 고르는 중인 조건이 검색된 것과 다른가. 다르면 검색 버튼을 강조한다. */
  const dirty = JSON.stringify(draft) !== appliedKey;

  const subjectCds = subject ? subject.split(',') : [];
  const tierCds = tier ? tier.split(',') : [];

  /**
   * 상세 검색은 **기본으로 펼친다.** 접어두면 규모·과목 필터가 있다는 걸 아무도 모른다 —
   * 접기 버튼은 남겨두되(화면이 길다고 느끼는 사람을 위해) 처음엔 보이게 둔다.
   */
  const [detailOpen, setDetailOpen] = useState(true);

  /** 지금 요양·정신 탭인가. 그러면 상세검색의 병원 규모는 의미가 없다. */
  const inpatient =
    tierCds.includes('NURSING') || tierCds.includes('MENTAL');

  /** 켜진 탭. 어느 것도 안 맞으면 병원이다 — 탭은 하나가 반드시 켜져 있어야 한다. */
  const activeTab =
    TABS.find(
      (tab) =>
        tab.emergency === emergency &&
        tab.baby === baby &&
        (tab.tier ? tierCds.includes(tab.tier) : !inpatient),
    ) ?? TABS[0];

  const { data: subjects } = useSubjects();
  const { data: groups } = useSubjectGroups();
  const { data: tiers } = useHospitalTiers();
  const { data: sidos } = useSidoRegions();
  const { data: sggus } = useSgguRegions(sido || undefined);

  const { data, isLoading, isError, isFetching } = useHospitalSearch({
    page,
    size: PAGE_SIZE,
    // **URL(applied)로만 검색한다.** draft 를 쓰면 고르는 족족 요청이 나간다.
    name: applied.q,
    // 시군구를 골랐으면 그것으로, 아니면 시도로 검색한다.
    // 서버가 시도 코드를 받으면 그 시도의 시군구 전체로 확장해 준다.
    region: applied.region || applied.sido,
    subject: applied.subject,
    tier: applied.tier,
    emergency,
    baby,
  });

  const items = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /**
   * 선택된 필터를 배지로 펼친다. 진료과목·종별을 한 줄에 모은다.
   * 코드→이름은 메타에서 찾는다 — 이름을 URL 에 담지 않는다(코드가 유일한 상태다).
   */
  const selected = [
    ...subjectCds.map((code) => ({
      code,
      name: subjects?.find((s) => s.code === code)?.name ?? code,
      remove: () =>
        update({ subject: subjectCds.filter((c) => c !== code).join(',') }),
    })),
    ...tierCds.map((code) => ({
      code,
      name: tiers?.find((t) => t.code === code)?.name ?? t('search.inpatient'),
      remove: () =>
        update({ tier: tierCds.filter((c) => c !== code).join(',') }),
    })),
  ];

  /**
   * 코드 목록을 셀렉트 옵션 모양으로.
   * 지역은 **짧은 이름이 있으면 그걸 보여준다** — "서울특별시" 는 좁은 셀렉트에서 잘린다.
   * 검색에 쓰는 값(code)은 그대로라 서버는 정식 명칭으로 매칭한다.
   */
  const toOptions = (
    list?: { code: string; name: string; shortName?: string }[],
  ) =>
    (list ?? []).map((item) => ({
      value: item.code,
      label: item.shortName ?? item.name,
    }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/*
        탭. **필터가 아니라 진입점이다.**
        찾는 사람이 서로 다르다 — 병원은 진료를 계획하는 사람, 응급실은 지금 당장 아픈 사람,
        달빛어린이는 밤에 아이가 열나는 부모다. 셋을 동시에 켜는 경우가 없어서 체크박스로 두면
        오히려 헷갈린다. 하나만 고르는 탭이 맞다.
      */}
      {/*
        탭. **폴더 탭이다** — 회색 트랙 위에 켜진 탭만 흰색으로 얹히고, 그 흰색이 아래
        검색 조건 패널로 그대로 이어진다. 탭과 패널이 한 상자로 읽혀야 "이 탭의 조건" 이 된다.

        배경으로 구분하려면 **트랙이 있어야 한다.** 예전엔 흰 페이지 위에 흰 탭이라 배경 대비가
        안 나와서 밑줄로만 구분했다. 트랙(slate-100)을 깔아 흰 탭이 떠 보이게 만들었다.
      */}
      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto rounded-t-2xl border border-b-0 border-slate-200 bg-slate-100 px-1.5 pt-1.5 [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const active = tab === activeTab;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() =>
                switchTab({
                  emergency: tab.emergency ? '1' : '',
                  baby: tab.baby ? '1' : '',
                  tier: tab.tier,
                  // 달빛은 소아 진료만 한다. 남아 있던 과목 선택을 지운다 —
                  // 화면에서 안 보이는 필터가 살아 있으면 결과가 이유 없이 줄어든다.
                  ...(tab.baby ? { subject: '' } : {}),
                })
              }
              /*
                켜진 탭은 **패널과 같은 흰색**으로 띄운다 — 회색 트랙 위에 흰 탭이 얹히고
                그대로 아래 패널로 이어져, 폴더 탭처럼 "이 탭의 내용" 이라는 게 형태로 읽힌다.
                (예전엔 흰 배경 위에 흰 탭이라 배경으로는 구분이 안 됐다. 트랙을 깔아 해결.)
              */
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-t-xl px-3 py-2.5 text-sm transition-colors sm:px-4',
                active
                  ? cn('bg-white font-bold', tab.on)
                  : 'font-medium text-slate-500 hover:bg-slate-200/60 hover:text-slate-800',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? tab.dot : 'text-slate-400',
                )}
              />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* 켜진 탭의 검색 조건 패널. 탭과 하나의 상자로 이어진다. */}
      <div className="space-y-3 rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4">
        {/* 시도 | 시군구 | 병원명. 한 줄이다 — 지역을 좁히고 이름을 치는 게 한 동작이다. */}
        {/*
          좁은 화면에서는 **두 줄로 접는다.** 셀렉트 둘 + 입력 + 버튼을 390px 에 한 줄로 밀어 넣으면
          병원명 칸이 글자 몇 개 폭으로 쪼그라들어 무엇을 치는 칸인지도 안 보인다.
        */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex gap-2">
            {/* 시도는 17개지만 목록으로 훑는 것보다 "부산" 이라고 치는 게 빠르다. */}
            <Combobox
              value={sido}
              onChange={(value) => update({ sido: value, region: '' })}
              options={toOptions(sidos)}
              placeholder={t('search.sido')}
              searchPlaceholder={t('search.sidoSearch')}
              className="w-1/2 shrink-0 sm:w-28"
            />

            {/* 시군구는 250개다. 스크롤로는 못 찾으니 타이핑해서 거른다. */}
            <Combobox
              value={region}
              onChange={(value) => update({ region: value })}
              options={toOptions(sggus)}
              placeholder={t('search.sggu')}
              searchPlaceholder={t('search.sgguSearch')}
              disabled={!sido}
              className="w-1/2 shrink-0 sm:w-32"
            />
          </div>

          <div className="flex flex-1 gap-2">
            {/* 돋보기를 칸 안에 둔다 — 버튼을 보기 전에 "여기가 검색어" 라는 게 먼저 읽힌다. */}
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={t('search.hospitalName')}
                value={keyword}
                onChange={(e) => update({ q: e.target.value })}
                onKeyDown={(e) => {
                  // 엔터로도 검색한다. 입력하고 버튼을 찾아 마우스를 옮기는 건 번거롭다.
                  if (e.key === 'Enter') search();
                }}
                className="pl-9"
              />
            </div>

            <Button onClick={search} className="shrink-0">
              {t('search.submit')}
            </Button>
          </div>
        </div>

        {/*
          진료 분야 칩. 47개 진료과목을 환자가 아는 이름으로 묶은 것이다.
          칩이 켜졌는지는 **계산한다** — 선택된 과목이 그 그룹의 과목과 정확히 같으면 켜진 것.
          그래서 상세 검색에서 과목 하나를 빼면 칩이 저절로 풀리고, 다시 넣으면 저절로 켜진다.
          그룹을 별도 상태로 들면 이 동기화를 우리가 해야 하고, 반드시 어긋난다.
        */}
        {/*
          달빛어린이 탭에서는 진료 분야를 안 보여준다.
          달빛어린이병원은 **야간·휴일에 소아 진료만** 한다 — 153곳 전부 소아청소년과가 있고,
          내과·피부과가 붙어 있는 건 낮에 하는 진료지 밤에 하는 진료가 아니다.
          "달빛 + 피부과" 를 고를 수 있게 두면 사용자는 그게 의미 있다고 믿는다.
        */}
        {!baby && (
        <div className="flex flex-wrap gap-1.5">
          {groups?.map((group) => {
            const codes = group.subjects.map((s) => s.code);

            // 이 그룹의 과목이 **전부** 선택돼 있으면 켜진 것이다.
            // 상세 검색에서 하나만 빼도 저절로 꺼지고, 다시 넣으면 저절로 켜진다.
            const active = codes.every((code) => subjectCds.includes(code));

            // 복수 선택. 켜면 이 그룹의 과목을 더하고, 끄면 뺀다 — 다른 그룹은 건드리지 않는다.
            const next = active
              ? subjectCds.filter((code) => !codes.includes(code))
              : [...new Set([...subjectCds, ...codes])];

            return (
              <Chip
                key={group.code}
                active={active}
                onClick={() => update({ subject: next.join(',') })}
              >
                {group.name}
              </Chip>
            );
          })}
        </div>
        )}

        {/*
          상세 검색. 칩으로 안 되는 것만 여기 둔다 —
          개별 과목(지원과 포함 47개) · 병원 규모.
        */}
        <button
          type="button"
          onClick={() => setDetailOpen(!detailOpen)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t('search.advanced')}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', detailOpen && 'rotate-180')}
          />
        </button>

        {detailOpen && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/*
              병원 규모가 맨 위다. **"동네 의원이냐 큰 병원이냐" 가 과목보다 먼저 정해진다** —
              감기면 의원, 수술이면 종합병원. 그걸 고르고 나서 과를 고른다.
              tier 컬럼 하나로 거른다 (종별 8개를 IN 절로 나열하지 않는다).
            */}
            {/* 요양·정신 탭에서는 규모를 안 보여준다 — 그 탭 자체가 이미 규모를 정한다. */}
            {!inpatient && (
              <FilterRow
                label={t('search.tier')}
                options={(tiers ?? []).map((t) => ({
                  code: t.code,
                  name: t.name,
                  description: t.description,
                }))}
                selected={tierCds}
                onChange={(codes) => update({ tier: codes.join(',') })}
              />
            )}

            {/*
              진료과목 47개. **기본으로 접어 둔다** — 위의 진료 분야 칩으로 대부분 해결되고,
              여기까지 오는 사람은 지원과(영상의학·병리)처럼 칩에 없는 것을 찾는 소수다.
              달빛 탭에서는 아예 감춘다(소아 진료만 하므로 과목 선택이 의미 없다).
            */}
            {!baby && (
              <FilterRow
                label={t('search.subject')}
                options={subjects ?? []}
                selected={subjectCds}
                onChange={(codes) => update({ subject: codes.join(',') })}
                collapsible
              />
            )}

          </div>
        )}

        {/*
          선택한 것들. 칩·체크박스는 접히거나 스크롤 밖으로 나가서, 켜둔 걸 잊은 채
          "왜 결과가 이것뿐이지" 하게 된다. 여기서 x 로 바로 지운다.
            */}
        {/* 흰 바탕에 흰 칩이면 안 보인다 — 옅은 회색 판을 깔아 "지금 켜둔 것" 이 따로 읽히게 한다. */}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2">
            {selected.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={item.remove}
                className="flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:text-primary-700"
              >
                {item.name}
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ))}

            <button
              type="button"
              onClick={() => update({ subject: '', tier: '' })}
              className="ml-1 text-xs font-medium text-slate-500 hover:text-primary-600"
            >
              {t('search.clearAll')}
            </button>
          </div>
            )}

        {/*
          **조건을 바꿨을 때만** 나타난다. 이미 검색된 상태와 같으면 누를 이유가 없다.
          위 검색 버튼과 같은 동작이지만, 상세검색을 펼쳐 놓으면 위 버튼이 화면 밖으로 밀린다.
        */}
        {dirty && (
          <Button onClick={search} className="w-full">
            <SearchIcon className="h-4 w-4" />
            {t('search.applyFilters')}
          </Button>
        )}
      </div>

      <p className="mt-4 text-sm text-slate-500">
        {isLoading ? t('common.loading') : t('search.count', { count: total })}
        {isFetching && !isLoading && }
      </p>

      {isLoading && (
        <div className="py-12 text-center">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="py-12 text-center text-rose-600">{t('common.loadError')}</p>
      )}

      <div className="mt-3 space-y-3">
        {items.map((h) => (
          <HospitalCard key={h.id} hospital={h} />
        ))}
      </div>

      {items.length === 0 && !isLoading && (
        <p className="py-12 text-center text-slate-500">{t('search.empty')}</p>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('search.prev')}
          </Button>
          <span className="text-sm text-slate-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('search.next')}
          </Button>
        </div>
      )}

    </div>
  );
}


/** 선택 칩. 켜진 상태는 **저장하지 않고 계산한다** — 호출부가 active 를 넘긴다. */
function Chip({
  children,
  active,
  onClick,
  title,
}: {
  children: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-primary-600 bg-primary-600 font-medium text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  );
}

const COLLAPSED_COUNT = 10;

interface FilterOption {
  code: string;
  name: string;
  description?: string;
}

/**
 * 상세검색 한 줄. 왼쪽에 항목명, 오른쪽에 체크박스 그리드.
 *
 * 항목이 많으면(진료과목 47개) 접어두고 "N개 +" 로 펼친다 — 처음부터 47개를 쏟아내면
 * 아무것도 안 읽힌다.
 *
 * `group` 은 code 에 쉼표가 들어간 묶음이다(병원 규모 = 종별 여러 개). 체크 여부는
 * **저장하지 않고 계산한다** — 묶음의 코드가 전부 선택돼 있으면 켜진 것이다.
 */
function FilterRow({
  label,
  options,
  selected,
  onChange,
  group,
  collapsible,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
  group?: boolean;

  /** 행 전체를 접어 둔다. 항목이 많고(47개) 대부분의 사용자가 안 쓰는 행에 준다. */
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  /** 접힌 행은 라벨만 보인다. 고른 게 있으면 펴서 보여준다 — 숨긴 필터가 살아 있으면 안 된다. */
  const [open, setOpen] = useState(!collapsible);
  const visible = open || selected.length > 0;

  /**
   * 접히는 행(진료과목)은 **펴면 전부 보여준다.** 폈는데 또 "37개 +" 가 나오면
   * 같은 것을 두 번 열게 된다 — 열었다는 감각만 주고 정작 원하는 항목은 여전히 숨어 있다.
   * 항상 펴져 있는 행만 10개까지 접는다.
   */
  const hidden = collapsible ? 0 : options.length - COLLAPSED_COUNT;
  const shown = collapsible || expanded ? options : options.slice(0, COLLAPSED_COUNT);

  if (collapsible && !visible) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center border-b border-slate-100 text-left last:border-b-0 hover:bg-slate-50"
      >
        <span className="w-24 shrink-0 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
          {label}
        </span>
        <span className="flex flex-1 items-center gap-1 px-3 py-3 text-sm text-slate-400">
          {options.length}개 <ChevronDown className="h-4 w-4" />
        </span>
      </button>
    );
  }

  const toggle = (option: FilterOption) => {
    const codes = group ? option.code.split(',') : [option.code];
    const on = codes.every((code) => selected.includes(code));

    onChange(
      on
        ? selected.filter((code) => !codes.includes(code))
        : [...new Set([...selected, ...codes])],
    );
  };

  return (
    <div className="flex border-b border-slate-100 last:border-b-0">
      <div className="w-24 shrink-0 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
        {label}
      </div>

      <div className="flex-1 px-3 py-2.5">
        {/*
          **flex 다.** grid 로 열을 고정하면 항목이 3개뿐인 행(병원 규모)에서
          체크박스가 화면 폭만큼 벌어져 서로 멀어진다. flex 는 내용 폭만 차지한다.
        */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {shown.map((option) => {
            const codes = group ? option.code.split(',') : [option.code];
            const checked = codes.every((code) => selected.includes(code));

            return (
              <label
                key={option.code}
                title={option.description}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className={cn('truncate', checked && 'font-medium text-primary-700')}>
                  {option.name}
                </span>
              </label>
            );
          })}
        </div>

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1.5 text-xs font-medium text-slate-500 hover:text-primary-600"
          >
            {expanded ? '접기' : `${hidden}개 +`}
          </button>
        )}
      </div>
    </div>
  );
}
