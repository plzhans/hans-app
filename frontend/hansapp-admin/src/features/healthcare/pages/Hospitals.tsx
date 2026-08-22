import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';

import {
  getHospitalMeta,
  listHospitals,
  type HospitalEngine,
  type HospitalMeta,
} from '@/shared/api/hospitals';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import type { MultiSelectOption } from '@/shared/ui/MultiSelect';
import { Pagination } from '@/shared/ui/Pagination';
import { SelectField } from '@/shared/ui/SelectField';
import { Table } from '@/shared/ui/Table';
import { Tabs } from '@/shared/ui/Tabs';
import { TextField } from '@/shared/ui/TextField';

const PAGE_SIZE = 20;

const ENGINE_TABS = [
  { value: 'db' as HospitalEngine, label: 'DB' },
  { value: 'es' as HospitalEngine, label: '검색색인(ES)' },
];

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'active', label: 'active' },
  { value: 'closed', label: 'closed' },
];

/**
 * 병원 등급. healthcare_hospital.tier 는 코드표가 아니라 고정된 5값이라(스키마 주석 참고)
 * 여기서 직접 한글 이름을 붙인다 — 서버에 물어볼 코드표가 없다.
 */
const TIER_ITEMS = [
  { code: 'TIER1', name: '의원급' },
  { code: 'TIER2', name: '병원급' },
  { code: 'TIER3', name: '상급종합' },
  { code: 'NURSING', name: '요양병원' },
  { code: 'MENTAL', name: '정신병원' },
];
const TIER_LABEL: Record<string, string> = Object.fromEntries(
  TIER_ITEMS.map((t) => [t.code, t.name]),
);

type MultiField =
  | 'tier'
  | 'subjectCds'
  | 'specialistCds'
  | 'equipmentCds'
  | 'specialtyCds'
  | 'specialCds'
  | 'asmExcellentCds';

interface FilterDraft {
  engine: HospitalEngine;
  keyword: string;
  status: string;
  classCd: string;
  sido: string;
  sggu: string;
  emergency: boolean;
  baby: boolean;
  tier: string[];
  subjectCds: string[];
  specialistCds: string[];
  equipmentCds: string[];
  specialtyCds: string[];
  specialCds: string[];
  asmExcellentCds: string[];
}

/** 상세검색 조건을 원래대로 되돌린다. medifinder 의 "전체 해제" 와 같은 값이다. */
const EMPTY_DETAIL: Pick<FilterDraft, 'emergency' | 'baby' | MultiField> = {
  emergency: false,
  baby: false,
  tier: [],
  subjectCds: [],
  specialistCds: [],
  equipmentCds: [],
  specialtyCds: [],
  specialCds: [],
  asmExcellentCds: [],
};

/** 시군구 코드(5자리)의 앞 2자리가 시도 코드다(법정동코드 관행) — region_cd 로 시도를 되돌린다. */
function sidoOfRegionCd(regionCd: string): string {
  return regionCd.length >= 2 ? regionCd.slice(0, 2) : regionCd;
}

/** URL 쿼리 → 조건. 검색결과(applied)와 입력 중인 값(draft) 양쪽의 초기값으로 쓴다. */
function readFilter(params: URLSearchParams): FilterDraft {
  const regionCd = params.get('regionCd') ?? '';
  return {
    engine: (params.get('engine') as HospitalEngine) || 'db',
    keyword: params.get('keyword') ?? '',
    status: params.get('status') ?? '',
    classCd: params.get('classCd') ?? '',
    sido: regionCd ? sidoOfRegionCd(regionCd) : '',
    sggu: regionCd.length === 5 ? regionCd : '',
    emergency: params.get('emergency') === 'true',
    baby: params.get('baby') === 'true',
    tier: splitCsv(params.get('tier')),
    subjectCds: splitCsv(params.get('subjectCds')),
    specialistCds: splitCsv(params.get('specialistCds')),
    equipmentCds: splitCsv(params.get('equipmentCds')),
    specialtyCds: splitCsv(params.get('specialtyCds')),
    specialCds: splitCsv(params.get('specialCds')),
    asmExcellentCds: splitCsv(params.get('asmExcellentCds')),
  };
}

function splitCsv(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

function toOptions(list: { code: string; name: string }[]): MultiSelectOption[] {
  return list.map((o) => ({ value: o.code, label: o.name }));
}

/** {value,label} 목록 앞에 "전체" 를 붙인다. SelectField 는 빈 값도 항목으로 있어야 한다. */
function withAll(options: { value: string; label: string }[]): { value: string; label: string }[] {
  return [{ value: '', label: '전체' }, ...options];
}

/** 목록 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다. */
const COLUMNS = 'grid-cols-[64px_minmax(0,1fr)_90px_110px_130px_100px_130px_32px] gap-4 px-6';

/**
 * healthcare_hospital 관리자 목록.
 *
 * **필터 구성은 medifinder-web(공개 검색)을 참고했다.** 지역(시도·시군구) + 이름이 맨 위
 * 한 줄, 그 아래 "상세검색" 을 접었다 펴는 패널(한 조건 = 한 줄), 지금 걸어 둔 조건을
 * 칩으로 늘어놓고 하나씩 떼거나 한 번에 지우는 요약 줄까지 같은 얼개다. **medifinder 가
 * 셀렉트박스가 아닌 자리(등급·진료과목·전문의·전문병원·병원평가·장비·특수진료)는 여기도
 * 셀렉트가 아니라 체크박스 목록이다** — 실제로 medifinder 의 FilterRow 가 체크박스로
 * 그린다. 셀렉트(드롭다운)로 남긴 것은 medifinder 도 드롭다운(Combobox)을 쓰는 시도·
 * 시군구뿐이고, 종별·상태는 병원 하나가 값 하나만 갖는 성질이라 admin 이 그대로 따랐다.
 *
 * **조건은 검색 버튼을 눌러야만 적용된다.** 글자를 칠 때마다, 체크박스를 누를 때마다
 * 다시 조회하면 관리자가 여러 조건을 맞추는 중에도 매번 서버를 때린다 — 입력은
 * draft 로만 쌓아 두고, 실제 조회(applied = URL 쿼리)는 검색 버튼 하나로만 바뀐다.
 * **그 버튼은 필터 카드 밖으로 나가지 않는다** — medifinder 는 이름칸 옆에 버튼을 두지만,
 * 여기는 상세검색을 펼치면 조건이 몇 줄씩 늘어나므로 카드 맨 아래 고정된 자리가 낫다.
 * 페이지 이동(Pagination)만 예외다 — 그건 조건이 아니라 같은 조건의 다음 페이지다.
 *
 * **저장소(DB/검색색인)는 필터 카드 밖, 별도 탭이다.** 조건이 아니라 "어느 저장소를
 * 볼까" 라는 더 상위의 선택이라 필터들과 한 줄에 섞어 두지 않는다. db(기본)는
 * keyword·status·classCd·regionCd 만 — 대신 전체 상태(비활성 포함)를 본다. es 는
 * 상세검색 패널을 더 쓸 수 있지만 검색색인엔 활성 병원만 있다. 서버가 engine 과 안 맞는
 * 필터 조합을 400 으로 막는다.
 *
 * 코드 값은 화면에 그대로 노출하지 않는다 — meta(GET .../hospitals/meta)로 받은 한글
 * 이름을 필터 선택지·선택 칩·결과 표에 모두 붙인다.
 */
export default function Hospitals() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  // 실제로 조회에 쓰는 조건. URL 이 정본이라 뒤로가기·새로고침·공유가 그대로 재현된다.
  const applied = readFilter(params);

  // 입력 중인 값은 URL 과 분리한다 — 검색을 누르기 전에는 조회가 바뀌지 않는다.
  const [draft, setDraft] = useState<FilterDraft>(applied);
  // 상세검색 패널. 기본은 접힘 — medifinder 와 같다(대부분 위 한 줄로 끝난다).
  const [detailOpen, setDetailOpen] = useState(false);

  // 필터 선택지 이름표. 코드는 잘 안 바뀌어 5분 정도는 다시 안 받아도 된다.
  const metaQuery = useQuery({
    queryKey: ['hospital-meta'],
    queryFn: getHospitalMeta,
    staleTime: 5 * 60 * 1000,
  });
  const meta: HospitalMeta =
    metaQuery.data ?? {
      classes: [],
      subjects: [],
      equipments: [],
      specialties: [],
      specials: [],
      assessments: [],
      regions: [],
    };

  const classMap = useMemo(
    () => new Map(meta.classes.map((c) => [c.code, c.name])),
    [meta.classes],
  );
  const regionMap = useMemo(
    () => new Map(meta.regions.map((r) => [r.code, r.shortName || r.name])),
    [meta.regions],
  );
  const sidoOptions = useMemo(
    () => withAll(toOptions(meta.regions.filter((r) => r.level === 'sido'))),
    [meta.regions],
  );
  const sgguOptions = useMemo(
    () =>
      withAll(
        toOptions(meta.regions.filter((r) => r.level === 'sggu' && r.parentCode === draft.sido)),
      ),
    [meta.regions, draft.sido],
  );
  const classOptions = useMemo(() => withAll(toOptions(meta.classes)), [meta.classes]);
  const tierOptions = useMemo(() => toOptions(TIER_ITEMS), []);
  const subjectOptions = useMemo(() => toOptions(meta.subjects), [meta.subjects]);
  const specialistOptions = subjectOptions;
  const equipmentOptions = useMemo(() => toOptions(meta.equipments), [meta.equipments]);
  const specialtyOptions = useMemo(() => toOptions(meta.specialties), [meta.specialties]);
  const specialOptions = useMemo(() => toOptions(meta.specials), [meta.specials]);
  const assessmentOptions = useMemo(() => toOptions(meta.assessments), [meta.assessments]);

  const setMulti = (field: MultiField, next: string[]) =>
    setDraft((d) => ({ ...d, [field]: next }));
  const removeFromMulti = (field: MultiField, code: string) =>
    setDraft((d) => ({ ...d, [field]: d[field].filter((c) => c !== code) }));

  /**
   * 지금 걸려 있는 상세조건 전부를 칩으로. **medifinder 의 "선택한 것들" 요약 줄과 같다** —
   * 패널을 접어도 이 줄은 남아서, 무엇을 걸어 뒀는지 다시 펼치지 않고도 보고 뗄 수 있다.
   */
  const selectedChips = useMemo(() => {
    const chips: { key: string; label: string; remove: () => void }[] = [];
    const addMulti = (field: MultiField, options: MultiSelectOption[]) => {
      for (const code of draft[field]) {
        chips.push({
          key: `${field}:${code}`,
          label: options.find((o) => o.value === code)?.label ?? code,
          remove: () => removeFromMulti(field, code),
        });
      }
    };
    addMulti('tier', tierOptions);
    addMulti('subjectCds', subjectOptions);
    addMulti('specialistCds', specialistOptions);
    addMulti('specialtyCds', specialtyOptions);
    addMulti('asmExcellentCds', assessmentOptions);
    addMulti('equipmentCds', equipmentOptions);
    addMulti('specialCds', specialOptions);
    if (draft.emergency) {
      chips.push({ key: 'emergency', label: '응급실', remove: () => setDraft((d) => ({ ...d, emergency: false })) });
    }
    if (draft.baby) {
      chips.push({
        key: 'baby',
        label: '달빛어린이병원',
        remove: () => setDraft((d) => ({ ...d, baby: false })),
      });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.tier,
    draft.subjectCds,
    draft.specialistCds,
    draft.specialtyCds,
    draft.asmExcellentCds,
    draft.equipmentCds,
    draft.specialCds,
    draft.emergency,
    draft.baby,
    tierOptions,
    subjectOptions,
    specialistOptions,
    specialtyOptions,
    assessmentOptions,
    equipmentOptions,
    specialOptions,
  ]);

  const query = useQuery({
    queryKey: ['hospitals', page, applied],
    queryFn: () =>
      listHospitals({
        engine: applied.engine,
        page,
        size: PAGE_SIZE,
        keyword: applied.keyword || undefined,
        status: applied.status || undefined,
        classCd: applied.classCd || undefined,
        regionCd: applied.sggu || applied.sido || undefined,
        tier: applied.engine === 'es' ? applied.tier : undefined,
        emergency: applied.engine === 'es' ? applied.emergency : undefined,
        baby: applied.engine === 'es' ? applied.baby : undefined,
        subjectCds: applied.engine === 'es' ? applied.subjectCds : undefined,
        specialistCds: applied.engine === 'es' ? applied.specialistCds : undefined,
        equipmentCds: applied.engine === 'es' ? applied.equipmentCds : undefined,
        specialtyCds: applied.engine === 'es' ? applied.specialtyCds : undefined,
        specialCds: applied.engine === 'es' ? applied.specialCds : undefined,
        asmExcellentCds: applied.engine === 'es' ? applied.asmExcellentCds : undefined,
      }),
    // 페이지를 넘길 때 표가 빈 화면으로 깜빡이지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  });

  /** draft 를 그대로 조회 조건으로 확정한다. **여기서만 서버를 부른다.** */
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    const set = (key: string, value: string | undefined) => {
      if (value) next.set(key, value);
    };
    set('engine', draft.engine !== 'db' ? draft.engine : undefined);
    set('keyword', draft.keyword.trim());
    set('classCd', draft.classCd);
    set('regionCd', draft.sggu || draft.sido);
    if (draft.engine === 'db') {
      set('status', draft.status);
    } else {
      // es 는 활성만 색인돼 있다 — 'active' 가 아닌 상태를 실으면 서버가 400 을 준다.
      if (draft.status === 'active') set('status', 'active');
      if (draft.emergency) next.set('emergency', 'true');
      if (draft.baby) next.set('baby', 'true');
      set('tier', draft.tier.join(','));
      set('subjectCds', draft.subjectCds.join(','));
      set('specialistCds', draft.specialistCds.join(','));
      set('equipmentCds', draft.equipmentCds.join(','));
      set('specialtyCds', draft.specialtyCds.join(','));
      set('specialCds', draft.specialCds.join(','));
      set('asmExcellentCds', draft.asmExcellentCds.join(','));
    }
    setParams(next);
  };

  const goPage = (next: number) => {
    const merged = new URLSearchParams(params);
    merged.set('page', String(next));
    setParams(merged);
    window.scrollTo({ top: 0 });
  };

  const data = query.data;

  return (
    <AdminLayout
      title="병원"
      description="healthcare_hospital 을 조회합니다. DB(전체 상태)와 검색색인(상세조건) 중 골라 검색을 누르세요."
      breadcrumbs={[{ label: '헬스케어' }, { label: '병원' }]}
    >
      {/*
        **폭만 제한하고 가운데로 모으지 않는다.** 표 열은 내용 기준 폭(grid-cols-[…])이라
        화면이 넓어져도 안 늘어나는데, 감싸는 카드만 화면 끝까지 펼쳐지면 글자 없는 여백만
        넓어진다 — 큰 PC 화면에서 그게 두드러진다. 사이드바 바로 옆(왼쪽)에 붙여 두는 게
        다른 관리 화면(표 목록)과 같은 자리라, mx-auto 로 가운데에 띄우지 않는다.
      */}
      <div className="max-w-7xl">
        {/*
          **저장소는 필터가 아니라 탭이다.** "무슨 조건으로 좁힐까" 가 아니라 "어느 저장소를
          볼까" 라는 더 상위의 선택이라, 필터 카드 안에 한 줄로 섞지 않고 그 위에 따로 둔다.
        */}
        <Tabs
          items={ENGINE_TABS}
          value={draft.engine}
          onChange={(next) => setDraft((d) => ({ ...d, engine: next }))}
          className="mb-3"
        />
        <p className="mb-4 text-sm text-gray-400">
          {draft.engine === 'db'
            ? 'DB — 전체 상태(비활성 포함)를 최소 조건으로 봅니다.'
            : '검색색인(ES) — 활성 병원만, 상세 조건으로 좁힙니다.'}
        </p>

        <form
          onSubmit={handleSearch}
          className="mb-4 space-y-3 rounded-2xl border border-gray-200 bg-white p-4"
        >
          {/* 한 줄: 지역 · 종별 · 이름 · (db 면 상태). medifinder 의 [시도|시군구|이름] 줄과 같은 자리다. */}
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="시도"
              options={sidoOptions}
              value={draft.sido}
              onChange={(e) => setDraft((d) => ({ ...d, sido: e.target.value, sggu: '' }))}
              className="w-28"
            />
            <SelectField
              label="시군구"
              options={sgguOptions}
              value={draft.sggu}
              onChange={(e) => setDraft((d) => ({ ...d, sggu: e.target.value }))}
              disabled={!draft.sido}
              className="w-32"
            />
            <SelectField
              label="종별"
              options={classOptions}
              value={draft.classCd}
              onChange={(e) => setDraft((d) => ({ ...d, classCd: e.target.value }))}
              className="w-32"
            />

            {/* 이름칸. medifinder 처럼 돋보기를 칸 안에 둔다 — 무엇을 치는 칸인지 먼저 읽힌다. */}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">병원명</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <TextField
                  placeholder="병원명 · 법인명 · 요양기호 · 기관ID"
                  value={draft.keyword}
                  onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
                  className="w-64 pl-9"
                />
              </span>
            </label>

            {draft.engine === 'db' && (
              <SelectField
                label="상태"
                options={STATUS_OPTIONS}
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                className="w-28"
              />
            )}
          </div>

          {/* 상세검색. es 에서만 뜻이 있다 — db 는 이 조건들을 서버가 아예 안 받는다. */}
          {draft.engine === 'es' && (
            <div className="rounded-2xl border border-gray-200">
              <button
                type="button"
                onClick={() => setDetailOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-gray-600 transition hover:text-gray-900"
              >
                <SlidersHorizontal className="h-4 w-4" />
                상세검색
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', detailOpen && 'rotate-180')}
                />
                {selectedChips.length > 0 && (
                  <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">
                    {selectedChips.length}
                  </span>
                )}
              </button>

              {detailOpen && (
                <div className="border-t border-gray-100">
                  {/*
                    **셀렉트가 아니라 체크박스다.** medifinder 의 이 자리(FilterRow)가
                    체크박스 목록이라 그대로 따른다 — 등급도 하나만 고르는 게 아니라
                    "의원급이거나 병원급" 처럼 여러 개를 함께 볼 수 있어야 해서다.
                  */}
                  <FilterRow label="등급">
                    <CheckboxGroup
                      options={tierOptions}
                      value={draft.tier}
                      onChange={(next) => setMulti('tier', next)}
                    />
                  </FilterRow>
                  <FilterRow label="진료과목">
                    <CheckboxGroup
                      options={subjectOptions}
                      value={draft.subjectCds}
                      onChange={(next) => setMulti('subjectCds', next)}
                    />
                  </FilterRow>
                  <FilterRow label="전문의 보유">
                    <CheckboxGroup
                      options={specialistOptions}
                      value={draft.specialistCds}
                      onChange={(next) => setMulti('specialistCds', next)}
                    />
                  </FilterRow>
                  <FilterRow label="전문병원 지정">
                    <CheckboxGroup
                      options={specialtyOptions}
                      value={draft.specialtyCds}
                      onChange={(next) => setMulti('specialtyCds', next)}
                    />
                  </FilterRow>
                  <FilterRow label="병원평가 우수">
                    <CheckboxGroup
                      options={assessmentOptions}
                      value={draft.asmExcellentCds}
                      onChange={(next) => setMulti('asmExcellentCds', next)}
                    />
                  </FilterRow>
                  <FilterRow label="보유장비">
                    <CheckboxGroup
                      options={equipmentOptions}
                      value={draft.equipmentCds}
                      onChange={(next) => setMulti('equipmentCds', next)}
                    />
                  </FilterRow>
                  <FilterRow label="특수진료">
                    <CheckboxGroup
                      options={specialOptions}
                      value={draft.specialCds}
                      onChange={(next) => setMulti('specialCds', next)}
                    />
                  </FilterRow>
                  <FilterRow label="추가조건">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={draft.emergency}
                          onChange={(e) => setDraft((d) => ({ ...d, emergency: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary-100"
                        />
                        응급실
                      </label>
                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={draft.baby}
                          onChange={(e) => setDraft((d) => ({ ...d, baby: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary-100"
                        />
                        달빛어린이병원
                      </label>
                    </div>
                  </FilterRow>
                </div>
              )}

              {/*
                **선택 칩은 패널을 접어도 남는다.** 무엇을 걸어 뒀는지 확인하려고 매번
                다시 펼칠 필요가 없게 하려는 것이다(medifinder 와 같은 이유).
              */}
              {selectedChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 bg-gray-50 px-3 py-2.5">
                  {selectedChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={chip.remove}
                      className="flex items-center gap-1 rounded-full border border-gray-200 bg-white py-1 pl-2.5 pr-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300"
                    >
                      {chip.label}
                      <X className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, ...EMPTY_DETAIL }))}
                    className="ml-1 text-xs font-semibold text-gray-400 transition hover:text-gray-700"
                  >
                    전체 해제
                  </button>
                </div>
              )}
            </div>
          )}

          {/*
            **필터 카드 안에 그대로 둔다** — 상세검색을 펼치든 접든 검색 버튼은 항상
            맨 끝이지만, 카드 밖으로 떨어뜨리지 않는다. 위 선(border-t)으로만 필드
            영역과 갈라 "이 필터들의 실행 버튼" 임을 보여준다.
          */}
          <div className="flex justify-end border-t border-gray-100 pt-3">
            <Button type="submit" variant="outline" className="w-auto shrink-0">
              <Search className="h-4 w-4" />
              검색
            </Button>
          </div>
        </form>

        {query.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
            {errorMessage(query.error, '병원 목록을 불러오지 못했습니다.')}
          </div>
        ) : query.isLoading ? (
          <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            조건에 맞는 병원이 없습니다.
          </div>
        ) : (
          <>
            <Table
              columns={COLUMNS}
              head={['id', '병원명', '상태', '종별', '지역', '등급', '연락처', '']}
            >
              {data.items.map((hospital) => (
                <Link
                  key={hospital.id}
                  to={`/healthcare/hospitals/${hospital.id}`}
                  className={cn(
                    'grid items-center border-b border-gray-100 py-3.5 transition last:border-0 hover:bg-gray-50',
                    COLUMNS,
                  )}
                >
                  <span className="font-mono text-sm text-gray-400">{hospital.id}</span>
                  <span className="truncate">
                    <span className="font-medium text-gray-900">{hospital.name}</span>
                    {hospital.legalName !== hospital.name && (
                      <span className="ml-1.5 truncate text-sm text-gray-400">
                        {hospital.legalName}
                      </span>
                    )}
                  </span>
                  <span>
                    <Badge tone={hospital.status === 'active' ? 'green' : 'gray'}>
                      {hospital.status}
                    </Badge>
                  </span>
                  <span className="truncate text-sm text-gray-500">
                    {(hospital.classCd && classMap.get(hospital.classCd)) ?? hospital.classCd ?? '—'}
                  </span>
                  <span className="truncate text-sm text-gray-500">
                    {(hospital.regionCd && regionMap.get(hospital.regionCd)) ??
                      hospital.regionCd ??
                      '—'}
                  </span>
                  <span className="text-sm text-gray-500">
                    {(hospital.tier && TIER_LABEL[hospital.tier]) ?? hospital.tier ?? '—'}
                  </span>
                  <span className="truncate text-sm text-gray-500">{hospital.tel ?? '—'}</span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </Link>
              ))}
            </Table>

            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              totalCount={data.totalCount}
              onChange={goPage}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}

/**
 * 상세검색 패널의 한 줄 — 라벨(왼쪽 고정폭) + 선택지(오른쪽). medifinder 의 FilterRow 와
 * 같은 얼개다: 조건을 옆으로 늘어놓지 않고 한 줄에 하나씩 쌓아, 나열식 flex-wrap보다
 * "이 조건에 뭘 걸었나" 를 위아래로 훑기 쉽게 한다.
 */
function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-0">
      <span className="w-28 shrink-0 text-sm font-medium text-gray-600">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * 체크박스 목록. **medifinder 의 FilterCheckbox 를 그대로 옮긴 것이다** — 드롭다운을
 * 열어야 보이는 MultiSelect 대신, 옵션을 펼쳐 놓고 바로 체크한다. 항목이 많으면(진료과목
 * 40여 개) 처음엔 12개까지만 보이고 "N개 더보기" 로 펼친다 — medifinder 의 COLLAPSED_COUNT
 * 와 같은 이유(다 쏟아내면 아무것도 안 읽힌다).
 */
function CheckboxGroup({
  options,
  value,
  onChange,
  limit = 12,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (options.length === 0) {
    return <span className="text-sm text-gray-400">선택지가 없습니다.</span>;
  }

  const shown = expanded ? options : options.slice(0, limit);
  const hiddenCount = options.length - shown.length;

  const toggle = (code: string) => {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {shown.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 text-sm',
                checked ? 'font-semibold text-primary-700' : 'text-gray-600',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(option.value)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary-100"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {options.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-200"
        >
          {expanded ? '접기' : `${hiddenCount}개 더보기`}
        </button>
      )}
    </div>
  );
}
