import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  useSpecialties,
  useSpecials,
  useEquipments,
  useAssessmentGroups,
  type MetaAssessmentGroup,
  useSidoRegions,
  useSgguRegions,
} from '@/features/clinic/api';
import { cn } from '@/shared/lib/utils';
import {
  BedDouble,
  Brain,
  ChevronDown,
  HelpCircle,
  Moon,
  Search as SearchIcon,
  Siren,
  SlidersHorizontal,
  Stethoscope,
  X,
} from 'lucide-react';
import { HospitalCard } from '@/features/clinic/components/HospitalCard';
import * as Popover from '@radix-ui/react-popover';

const PAGE_SIZE = 20;

/**
 * 전문분야 중 **자주 찾는 것**. 상세검색에서 기본으로 이것만 보이고 나머지는 +N 으로 펼친다.
 * 코드는 /healthcare/meta/specialties 참조 (OBGY=산부인과, PED=소아청소년과 …).
 */
const FEATURED_SPECIALTIES = ['OBGY', 'PED', 'OPH', 'ENT', 'JOINT', 'SPINE'];

/**
 * 보유장비 중 **자주 찾는 것**. 기본으로 이것만 보이고 나머지는 +N 으로 펼친다.
 * 일반엑스선(XRAY)·CT·MRI·초음파(US) — 일반인이 "이 검사 되나" 물을 때의 장비다.
 * (코드는 /healthcare/meta/equipments 의 우리 코드다. hira 원본 코드 B101 등이 아니다.)
 */
const FEATURED_EQUIPMENTS = ['XRAY', 'CT', 'MRI', 'US'];

/**
 * 우수 병원(적정성평가) 중 **자주 찾는 항목**(원본 asmGrd 번호). 기본으로 이것만 보이고 나머지는
 * +N 으로 펼친다. 주사제(08)·고혈압당뇨(24)·천식(16)·대장암(12)·위암(13)·유방암(14)·폐암(15).
 */
const FEATURED_ASSESSMENTS = ['08', '24', '16', '12', '13', '14', '15'];

/**
 * 라벨 옆 ? 아이콘. 누르면 설명이 뜬다.
 *
 * Radix Popover 는 **portal 로 렌더**돼서 상세검색 패널의 overflow-hidden 에 안 잘린다.
 * 트리거는 button 이 아니라 span 이다 — 접힌 FilterRow 는 행 전체가 button 이라, 그 안에
 * button 을 또 넣으면 HTML 이 깨진다. 클릭 전파만 막아 행이 같이 펴지지 않게 한다.
 */
function InfoHint({ text }: { text: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={text}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex cursor-help text-slate-400 hover:text-slate-600"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-xs rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg"
        >
          {text}
          <Popover.Arrow className="fill-slate-800" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * "우수 병원" 필터. 심평원 적정성평가 항목을 분야(그룹)별로 나열하고, 고른 항목에서
 * 1등급인 병원을 찾는다. 항목·이름은 서버 메타(/healthcare/meta/assessments)가 준다.
 *
 * FilterRow(라벨|항목 한 줄)와 달리 **그룹 헤더 밑에 항목을 펼친다** — 22개를 8분야로 묶어야
 * 읽힌다. selected 는 assessment 파라미터의 항목 코드 목록이다.
 */
function AssessmentFilter({
  label,
  hint,
  groups,
  selected,
  onChange,
  featured,
}: {
  label: string;
  hint: string;
  groups: MetaAssessmentGroup[];
  selected: string[];
  onChange: (codes: string[]) => void;

  /** 자주 찾는 항목 코드. 기본은 이것들(+선택된 것)만, +N 으로 전부 펼친다. */
  featured?: string[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggle = (code: string) =>
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code],
    );

  // 이 스코프에 featured 가 하나도 없으면(요양 탭 등) 접지 않고 전부 보여준다.
  // selected 는 featured 가 아니어도 유지한다(숨은 필터 방지).
  const featuredSet = new Set(featured ?? []);
  const allItems = groups.flatMap((g) => g.items);
  const featuredItems = allItems.filter(
    (i) => featuredSet.has(i.code) || selected.includes(i.code),
  );
  const collapsible =
    !!featured &&
    featuredItems.length > 0 &&
    featuredItems.length < allItems.length;
  // 즐겨찾기 접힘: **그룹 레이블 없이 한 줄로.** 전부 펼치면(닫기) 그룹으로 나눠 보여준다.
  const showFlat = collapsible && !expanded;
  const hidden = allItems.length - featuredItems.length;

  const checkbox = (item: { code: string; name: string }) => {
    const checked = selected.includes(item.code);
    return (
      <label
        key={item.code}
        className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(item.code)}
          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        <span className={cn(checked && 'font-medium text-primary-700')}>
          {item.name}
        </span>
      </label>
    );
  };

  return (
    // FilterRow 와 같은 좌우 구조: 왼쪽 라벨 고정(w-28), 오른쪽에 분야들을 세로로.
    <div className="flex border-b border-slate-100 last:border-b-0">
      <div className="w-28 shrink-0 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
        <span className="inline-flex items-center gap-1">
          {label}
          <InfoHint text={hint} />
        </span>
      </div>

      <div className="flex-1 px-3 py-3">
        {/* items-start: 항목이 여러 줄이어도 +N/닫기 가 오른쪽 위 끝에 고정된다. */}
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-3">
            {showFlat ? (
              // 즐겨찾기: 그룹 없이 한 줄에 모아 보여준다.
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {featuredItems.map((item) => checkbox(item))}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.code}>
                  <div className="mb-1 text-xs font-semibold text-slate-500">
                    {g.name}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {g.items.map((item) => checkbox(item))}
                  </div>
                </div>
              ))
            )}
          </div>

          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 self-start text-xs font-medium text-slate-500 hover:text-primary-600"
            >
              {expanded ? t('search.close') : `+${hidden}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
 * 화면에 늘 보이는 탭과 "더보기" 로 접는 탭을 가른다.
 *
 * 병원·응급실·달빛은 대부분이 찾는 입구라 항상 편다. 요양·정신은 찾는 사람이 적어
 * (게다가 이름이 길어 모바일에서 탭줄이 잘렸다) "더보기" 안으로 접는다 —
 * 필요한 사람만 펼쳐서 고른다.
 */
const PRIMARY_TABS = TABS.slice(0, 3);
const MORE_TABS = TABS.slice(3);

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
    specialist: searchParams.get('specialist') ?? '',
    tier: searchParams.get('tier') ?? '',
    // 전문분야·심평원 평가는 상세 검색 필터다. 첫 페이지 섹션의 "더보기"(?assessment=cancer)로도 들어온다.
    specialty: searchParams.get('specialty') ?? '',
    assessment: searchParams.get('assessment') ?? '',
    special: searchParams.get('special') ?? '',
    equipment: searchParams.get('equipment') ?? '',
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
  const specialist = draft.specialist;
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

  const specialty = draft.specialty;
  const assessment = draft.assessment;
  const special = draft.special;
  const equipment = draft.equipment;

  const subjectCds = subject ? subject.split(',') : [];
  const specialistCds = specialist ? specialist.split(',') : [];
  const tierCds = tier ? tier.split(',') : [];
  const specialtyCds = specialty ? specialty.split(',') : [];
  const assessmentCds = assessment ? assessment.split(',') : [];
  const specialCds = special ? special.split(',') : [];
  const equipmentCds = equipment ? equipment.split(',') : [];

  /**
   * 상세 검색은 **기본으로 펼친다.** 접어두면 규모·과목 필터가 있다는 걸 아무도 모른다 —
   * 접기 버튼은 남겨두되(화면이 길다고 느끼는 사람을 위해) 처음엔 보이게 둔다.
   */
  const [detailOpen, setDetailOpen] = useState(true);

  /** "더보기" 로 접어둔 탭(요양·정신)을 펼쳤는가. 바깥을 누르면 닫는다. */
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

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

  /** 켜진 탭이 "더보기" 안(요양·정신)에 있는가. 그러면 더보기 버튼 자체를 켠 것처럼 보인다. */
  const moreActive = MORE_TABS.includes(activeTab);

  /** 탭 선택. 진입점이라 즉시 검색하고, 열려 있던 더보기는 닫는다. */
  const selectTab = (tab: (typeof TABS)[number]) => {
    switchTab({
      emergency: tab.emergency ? '1' : '',
      baby: tab.baby ? '1' : '',
      tier: tab.tier,
      // 달빛은 소아 진료만 한다. 남아 있던 과목 선택을 지운다 —
      // 화면에서 안 보이는 필터가 살아 있으면 결과가 이유 없이 줄어든다.
      ...(tab.baby ? { subject: '' } : {}),
    });
    setMoreOpen(false);
  };

  const { data: subjects } = useSubjects();
  const { data: groups } = useSubjectGroups();
  const { data: tiers } = useHospitalTiers();
  const { data: specialties } = useSpecialties();
  const { data: specials } = useSpecials();
  const { data: equipments } = useEquipments();
  const { data: assessmentGroups } = useAssessmentGroups();
  const { data: sidos } = useSidoRegions();
  const { data: sggus } = useSgguRegions(sido || undefined);

  // 평가 항목 코드 → 이름. 선택 배지에 항목명을 붙이는 데 쓴다(전체 항목 기준 — 탭을 바꿔도 배지가 유지되게).
  const assessmentNames = new Map<string, string>();
  for (const g of assessmentGroups ?? []) {
    for (const item of g.items) assessmentNames.set(item.code, item.name);
  }

  /**
   * 탭에 맞는 평가항목만. 요양 탭은 요양병원이 실제로 받는 4개만, 나머지 탭은 요양병원 항목을 뺀 전부.
   * scope 판정은 서버(시드 ASM_ITEM_SCOPE)가 항목마다 준다 — 여기선 현재 탭이 요양이냐만 본다.
   * 항목이 하나도 없는 분야는 접는다.
   */
  const asmScope = tierCds.includes('NURSING') ? 'nursing' : 'general';
  const scopedAssessmentGroups = (assessmentGroups ?? [])
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.scopes.includes(asmScope)),
    }))
    .filter((g) => g.items.length > 0);

  const { data, isLoading, isError, isFetching } = useHospitalSearch({
    page,
    size: PAGE_SIZE,
    // **URL(applied)로만 검색한다.** draft 를 쓰면 고르는 족족 요청이 나간다.
    name: applied.q,
    // 시군구를 골랐으면 그것으로, 아니면 시도로 검색한다.
    // 서버가 시도 코드를 받으면 그 시도의 시군구 전체로 확장해 준다.
    region: applied.region || applied.sido,
    subject: applied.subject,
    specialist: applied.specialist,
    tier: applied.tier,
    emergency,
    baby,
    specialty: applied.specialty,
    assessment: applied.assessment,
    special: applied.special,
    equipment: applied.equipment,
  });

  const items = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /**
   * 선택된 필터를 배지로 펼친다. 진료과목·종별·전문분야·평가를 한 줄에 모은다.
   * 코드→이름은 메타에서 찾는다 — 이름을 URL 에 담지 않는다(코드가 유일한 상태다).
   * 전부 draft 를 고쳐 x 로 지운다 — 다른 필터와 같은 방식이라 검색 버튼으로 함께 적용된다.
   */
  const selected = [
    ...assessmentCds.map((code) => ({
      code: `assessment:${code}`,
      name: assessmentNames.get(code) ?? code,
      remove: () =>
        update({ assessment: assessmentCds.filter((c) => c !== code).join(',') }),
    })),
    ...specialtyCds.map((code) => ({
      code: `specialty:${code}`,
      name: specialties?.find((s) => s.code === code)?.name ?? code,
      remove: () =>
        update({ specialty: specialtyCds.filter((c) => c !== code).join(',') }),
    })),
    ...specialCds.map((code) => ({
      code: `special:${code}`,
      name: specials?.find((s) => s.code === code)?.name ?? code,
      remove: () =>
        update({ special: specialCds.filter((c) => c !== code).join(',') }),
    })),
    ...equipmentCds.map((code) => ({
      code: `equipment:${code}`,
      name: equipments?.find((e) => e.code === code)?.name ?? code,
      remove: () =>
        update({ equipment: equipmentCds.filter((c) => c !== code).join(',') }),
    })),
    ...subjectCds.map((code) => ({
      code,
      name: subjects?.find((s) => s.code === code)?.name ?? code,
      remove: () =>
        update({ subject: subjectCds.filter((c) => c !== code).join(',') }),
    })),
    // 전문의 칩. 진료과목과 코드가 같아 접두어로 구분하고, 이름 뒤에 '전문의'를 붙여 표기한다.
    ...specialistCds.map((code) => ({
      code: `specialist:${code}`,
      name: `${subjects?.find((s) => s.code === code)?.name ?? code} ${t('search.specialist')}`,
      remove: () =>
        update({
          specialist: specialistCds.filter((c) => c !== code).join(','),
        }),
    })),
    ...tierCds.map((code) => ({
      code,
      // find 콜백 인자를 t 로 두면 번역 함수 t 를 가린다. 이름을 겹치지 않게 둔다.
      name: tiers?.find((item) => item.code === code)?.name ?? t('search.inpatient'),
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
    <div className="mx-auto max-w-3xl px-0 py-4 sm:px-4 sm:py-6">
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
      {/*
        relative 래퍼. 더보기 드롭다운은 이 래퍼 기준으로 띄운다 —
        탭줄(overflow-x-auto)에 넣으면 세로로 잘리기 때문이다.
      */}
      <div className="relative" ref={moreRef}>
        <div
          role="tablist"
          className="mx-3 flex gap-1 overflow-x-auto rounded-t-2xl border border-b-0 border-slate-200 bg-slate-100 px-1.5 pt-1.5 sm:mx-0 [&::-webkit-scrollbar]:hidden"
        >
          {PRIMARY_TABS.map((tab) => {
            const active = tab === activeTab;
            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(tab)}
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
                {t(`search.tabs.${tab.key}`)}
              </button>
            );
          })}

          {/*
            더보기. 요양·정신을 접어둔 입구다. 그 안의 탭이 켜져 있으면(moreActive)
            버튼 자체를 그 탭인 것처럼 — 아이콘·이름·색을 그대로 빌려 — 흰 탭으로 띄운다.
          */}
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              'ml-auto flex shrink-0 items-center gap-1.5 rounded-t-xl px-3 py-2.5 text-sm transition-colors sm:px-4',
              moreActive
                ? cn('bg-white font-bold', activeTab.on)
                : 'font-medium text-slate-500 hover:bg-slate-200/60 hover:text-slate-800',
            )}
          >
            {moreActive &&
              (() => {
                const Icon = activeTab.icon;
                return <Icon className={cn('h-4 w-4 shrink-0', activeTab.dot)} />;
              })()}
            {moreActive ? t(`search.tabs.${activeTab.key}`) : t('search.tabs.more')}
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 transition-transform',
                moreOpen && 'rotate-180',
              )}
            />
          </button>
        </div>

        {/* 더보기 목록. overflow 밖에 둬야 세로로 안 잘린다. 오른쪽 정렬로 버튼 아래에 편다. */}
        {moreOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {MORE_TABS.map((tab) => {
              const active = tab === activeTab;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectTab(tab)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
                    active
                      ? cn('bg-slate-50 font-bold', tab.on)
                      : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      active ? tab.dot : 'text-slate-400',
                    )}
                  />
                  {t(`search.tabs.${tab.key}`)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 켜진 탭의 검색 조건 패널. 탭과 하나의 상자로 이어진다. */}
      <div className="mx-3 space-y-3 rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4 sm:mx-0">
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

          <div className="flex flex-1 gap-3">
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
                groupByField
              />
            )}

            {/*
              전문의. 진료과목과 같은 코드지만 그 과목 전문의를 실제로 보유한 병원만 건다
              (진료과목은 신고만 하면 걸림). 옵션은 전문과목(specialist)만 — 치과·한방응급은 빠진다.
              달빛 탭에서는 진료과목처럼 감춘다.
            */}
            {!baby && (
              <FilterRow
                label={t('search.specialist')}
                hint={t('search.specialistHint')}
                options={(subjects ?? []).filter((s) => s.specialist)}
                selected={specialistCds}
                onChange={(codes) => update({ specialist: codes.join(',') })}
                collapsible
                groupByField
              />
            )}

            {/* 전문병원 지정분야 (관절·척추·심장 …). 보건복지부 지정, 심평원 위탁 심사.
                자주 찾는 6개만 기본 노출, 나머지는 +N 으로 펼친다. */}
            <FilterRow
              label={t('search.specialty')}
              hint={t('search.specialtyHint')}
              options={specialties ?? []}
              selected={specialtyCds}
              onChange={(codes) => update({ specialty: codes.join(',') })}
              featured={FEATURED_SPECIALTIES}
            />

            {/*
              우수 병원(심평원 적정성평가). 22개 항목을 8분야로 묶어 보여주고, 고른 항목에서
              1등급인 병원을 찾는다. 긴 정식명(건강보험심사평가원 평가)은 ? 툴팁으로 뺐다.
              병원급 이상만 등급이 붙어서(의원은 이 항목을 평가받지 않음) tier 를 따로 강제하진 않는다.
            */}
            {scopedAssessmentGroups.length > 0 && (
              <AssessmentFilter
                label={t('search.assessmentLabel')}
                hint={t('search.assessmentHint')}
                groups={scopedAssessmentGroups}
                selected={assessmentCds}
                onChange={(codes) => update({ assessment: codes.join(',') })}
                featured={FEATURED_ASSESSMENTS}
              />
            )}

            {/* 보유장비 (CT·MRI·PET …). */}
            <FilterRow
              label={t('search.equipment')}
              options={equipments ?? []}
              selected={equipmentCds}
              onChange={(codes) => update({ equipment: codes.join(',') })}
              featured={FEATURED_EQUIPMENTS}
            />

            {/*
              특수진료 (방문진료·치매주치의 등 시범사업). **일반인이 가장 덜 찾는 필터라 맨 아래.**
              시범사업 대상이라 대상 병원도 적고 용어도 낯설다.
            */}
            <FilterRow
              label={t('search.special')}
              options={specials ?? []}
              selected={specialCds}
              onChange={(codes) => update({ special: codes.join(',') })}
              collapsible
            />

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
              onClick={() =>
                update({
                  subject: '',
                  specialist: '',
                  tier: '',
                  specialty: '',
                  assessment: '',
                  special: '',
                  equipment: '',
                })
              }
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

      {/* 결과 목록의 제목 줄. 카드 바로 위에 붙여 "이 아래가 결과" 임을 잇는다. */}
      <p className="mb-2 mt-5 pl-1 text-sm font-medium text-slate-700">
        {isLoading ? t('common.loading') : t('search.count', { count: total })}
        {isFetching && !isLoading && (
          <span className="ml-1 font-normal text-slate-400">
            {t('search.refreshing')}
          </span>
        )}
      </p>

      {isLoading && (
        <div className="py-12 text-center">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="py-12 text-center text-rose-600">{t('common.loadError')}</p>
      )}

      <div className="space-y-2">
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

  /** 면허 계열 (의/치/한). groupByField 일 때 이걸로 묶는다. 없으면 그룹 안 함. */
  field?: 'med' | 'dent' | 'km';
}

/** 계열 소제목 순서. 의과 → 치과 → 한방. */
const FIELD_ORDER: Array<'med' | 'dent' | 'km'> = ['med', 'dent', 'km'];

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
  hint,
  options,
  selected,
  onChange,
  group,
  collapsible,
  featured,
  groupByField,
}: {
  label: string;

  /** 라벨 옆 ? 아이콘에 붙는 설명. 마우스를 올리면 뜬다(native title — 패널이 overflow-hidden 이라 안 잘린다). */
  hint?: string;
  options: FilterOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
  group?: boolean;

  /** 행 전체를 접어 둔다. 항목이 많고(47개) 대부분의 사용자가 안 쓰는 행에 준다. */
  collapsible?: boolean;

  /**
   * 자주 찾는 항목 코드. 주면 **기본은 이것들만**(+이미 선택된 것) 보이고, 나머지는 줄 끝의
   * `+N` 을 눌러 펼친다. featured 순서대로 앞에 온다. collapsible 과는 같이 쓰지 않는다.
   */
  featured?: string[];

  /**
   * 옵션을 계열(의/치/한) 소제목으로 나눠 보여준다. option.field 로 묶는다.
   * 진료과목·전문의처럼 계열이 있는 필터에 쓴다. collapsible 과 같이 쓴다(접었다 펴는 긴 목록).
   */
  groupByField?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // +N·닫기·접기 버튼 공통 모양. 밋밋한 텍스트가 아니라 **살짝 버튼 느낌**(옅은 테두리·배경·pill).
  const pill =
    'rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700';

  // 라벨 + (있으면) ? 아이콘. 접힌 상태·펼친 상태 두 곳에서 같은 걸 쓴다.
  const labelNode = hint ? (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoHint text={hint} />
    </span>
  ) : (
    label
  );

  /** 접힌 행은 라벨만 보인다. 고른 게 있으면 펴서 보여준다 — 숨긴 필터가 살아 있으면 안 된다. */
  const [open, setOpen] = useState(!collapsible);
  const visible = open || selected.length > 0;

  /**
   * 무엇을 보여줄지 + 몇 개가 숨었는지. 세 모드다:
   *   featured    자주 찾는 것(+선택된 것)만. 펼치면 전부.
   *   collapsible 행 자체를 접었다 펴는 것(위 early-return). 펴면 전부.
   *   기본        10개까지 보이고 나머지는 아래 "N개 +".
   */
  let shown: FilterOption[];
  let hidden: number;
  if (featured) {
    if (expanded) {
      shown = options;
      hidden = 0;
    } else {
      const featuredSet = new Set(featured);
      // featured 순서대로 앞에, 그다음 선택됐지만 featured 아닌 것(숨기면 안 되는 필터).
      const feat = featured
        .map((code) => options.find((o) => o.code === code))
        .filter((o): o is FilterOption => !!o);
      const extra = options.filter(
        (o) => selected.includes(o.code) && !featuredSet.has(o.code),
      );
      shown = [...feat, ...extra];
      hidden = options.length - shown.length;
    }
  } else if (collapsible || expanded) {
    shown = options;
    hidden = 0;
  } else {
    shown = options.slice(0, COLLAPSED_COUNT);
    hidden = options.length - COLLAPSED_COUNT;
  }

  if (collapsible && !visible) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center border-b border-slate-100 text-left last:border-b-0 hover:bg-slate-50"
      >
        <span className="w-28 shrink-0 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
          {labelNode}
        </span>
        <span className="flex flex-1 items-center gap-1 px-3 py-3 text-sm text-slate-400">
          {t('search.optionCount', { count: options.length })}{' '}
          <ChevronDown className="h-4 w-4" />
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
      <div className="w-28 shrink-0 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
        {labelNode}
      </div>

      <div className="flex-1 px-3 py-2.5">
        {/*
          featured·collapsible 는 체크박스 영역과 접기/펼치기 버튼을 나란히 둔다(items-start) —
          항목이 여러 줄로 펼쳐져도 버튼이 **오른쪽 위 끝에 고정**된다.
        */}
        <div className={cn((featured || collapsible) && 'flex items-start gap-3')}>
          {/*
            **flex 다.** grid 로 열을 고정하면 항목이 3개뿐인 행(병원 규모)에서
            체크박스가 화면 폭만큼 벌어져 서로 멀어진다. flex 는 내용 폭만 차지한다.
          */}
          {groupByField ? (
            // 계열(의/치/한) 소제목으로 나눠 그린다. 해당 계열이 있는 것만.
            <div className="flex-1 space-y-2">
              {FIELD_ORDER.filter((f) =>
                shown.some((o) => o.field === f),
              ).map((f) => (
                <div key={f}>
                  <p className="!my-0 mb-1 text-xs font-semibold text-slate-400">
                    {t(`search.field.${f}`)}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {shown
                      .filter((o) => o.field === f)
                      .map((option) => (
                        <FilterCheckbox
                          key={option.code}
                          option={option}
                          group={group}
                          selected={selected}
                          onToggle={() => toggle(option)}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1.5">
              {shown.map((option) => (
                <FilterCheckbox
                  key={option.code}
                  option={option}
                  group={group}
                  selected={selected}
                  onToggle={() => toggle(option)}
                />
              ))}
            </div>
          )}

          {/* featured: 오른쪽 위 끝에 고정된 +N / 닫기. self-start 라 여러 줄이어도 맨 위에 붙는다. */}
          {featured && (hidden > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn('shrink-0 self-start', pill)}
            >
              {expanded ? t('search.close') : `+${hidden}`}
            </button>
          )}

          {/*
            collapsible 행은 펼치면 hidden 이 0 이라 아래 "N개 +" 접기가 안 뜬다 — 여기서 접기를
            준다. featured 와 같은 자리(오른쪽 위 고정)다. 고른 게 있으면 접지 않는다(숨긴 필터가
            살아 있으면 안 된다).
          */}
          {collapsible && open && selected.length === 0 && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn('shrink-0 self-start', pill)}
            >
              {t('search.close')}
            </button>
          )}
        </div>

        {/* 기본 모드(진료과목 등): 체크박스 아래에 "N개 +" */}
        {!featured && !collapsible && hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn('mt-1.5', pill)}
          >
            {expanded ? t('search.collapse') : t('search.more', { count: hidden })}
          </button>
        )}
      </div>
    </div>
  );
}

/** 체크박스 하나. 평평/계열그룹 두 렌더가 공유한다. */
function FilterCheckbox({
  option,
  group,
  selected,
  onToggle,
}: {
  option: FilterOption;
  group?: boolean;
  selected: string[];
  onToggle: () => void;
}) {
  const codes = group ? option.code.split(',') : [option.code];
  const checked = codes.every((code) => selected.includes(code));

  return (
    <label
      title={option.description}
      className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
      />
      <span className={cn('truncate', checked && 'font-medium text-primary-700')}>
        {option.name}
      </span>
    </label>
  );
}
