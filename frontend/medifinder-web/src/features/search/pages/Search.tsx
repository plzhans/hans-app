import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '@/shared/ui/Input';
import { Combobox } from '@/shared/ui/Combobox';
import { MyLocationButton } from '@/shared/components/MyLocationButton';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import {
  useHospitalScroll,
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
import { useIsWide } from '@/shared/hooks/useIsWide';
import {
  BedDouble,
  Brain,
  ChevronDown,
  HelpCircle,
  Moon,
  List as ListIcon,
  Map as MapIcon,
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
          className="inline-flex cursor-help text-ink-subtle hover:text-ink-body"
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
          className="z-50 max-w-xs rounded-xl bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-pop"
        >
          {text}
          <Popover.Arrow className="fill-ink" />
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
  stacked,
}: {
  label: string;
  hint: string;
  groups: MetaAssessmentGroup[];
  selected: string[];
  onChange: (codes: string[]) => void;

  /** 자주 찾는 항목 코드. 기본은 이것들(+선택된 것)만, +N 으로 전부 펼친다. */
  featured?: string[];

  /** 라벨을 내용 위로. 좁은 사이드바용 — FilterRow 의 같은 이름 주석 참고. */
  stacked?: boolean;
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
        className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-body"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(item.code)}
          className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
        />
        <span className={cn(checked && 'font-medium text-brand-strong')}>
          {item.name}
        </span>
      </label>
    );
  };

  return (
    // FilterRow 와 같은 규칙: 기본은 라벨이 윗줄, 넓어지면(sm~) 왼쪽 칸으로. stacked 면 늘 윗줄.
    <div
      className={cn(
        'border-b border-line px-3 py-3 last:border-b-0',
        !stacked && 'sm:flex sm:p-0',
      )}
    >
      <div
        className={cn(
          'mb-2 block text-[0.8rem] font-extrabold text-ink',
          !stacked &&
            'sm:mb-0 sm:w-28 sm:shrink-0 sm:bg-surface-subtle sm:px-3 sm:py-3 sm:text-sm sm:font-bold sm:text-ink-body',
        )}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <InfoHint text={hint} />
        </span>
      </div>

      <div className={cn(!stacked && 'sm:flex-1 sm:px-3 sm:py-3')}>
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
                  <div className="mb-1 text-xs font-semibold text-ink-muted">
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
              className="shrink-0 self-start text-xs font-medium text-ink-muted hover:text-brand"
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
    tone: 'text-brand',
    emergency: false,
    baby: false,
    tier: '',
  },
  {
    key: 'emergency',
    icon: Siren,
    tone: 'text-danger',
    emergency: true,
    baby: false,
    tier: '',
  },
  {
    key: 'baby',
    icon: Moon,
    tone: 'text-indigo-600',
    emergency: false,
    baby: true,
    tier: '',
  },
  {
    key: 'nursing',
    icon: BedDouble,
    tone: 'text-ok',
    emergency: false,
    baby: false,
    tier: 'NURSING',
  },
  {
    key: 'mental',
    icon: Brain,
    tone: 'text-violet-600',
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

  /**
   * 보기 모드. **URL 에 둔다** — 목록으로 보다가 지도로 넘어간 상태를 그대로 공유·즐겨찾기할 수
   * 있고, 뒤로가기로 되돌아온다. 나중에 지도 영역 검색(bbox)이 붙으면 중심·줌도 여기 같이 실린다.
   *
   * **모드가 레이아웃을 정한다.** 목록에서는 조건이 위에 한 줄로 눕고(익숙한 검색 화면),
   * 지도에서는 왼쪽 사이드바로 선다 — 지도가 오른쪽 폭을 다 써야 해서다.
   */
  const isWide = useIsWide();

  const mapView = searchParams.get('view') === 'map';

  /**
   * 조건 서랍이 열렸는가. **지도 모드의 좁은 화면에서만 쓴다.**
   *
   * 지도는 가로·세로를 다 써야 쓸모가 있어서, 좁은 화면에서 조건을 위에 얹어 두면 지도가
   * 손바닥만 해진다. 조건을 화면 밖으로 밀어두고 필요할 때만 왼쪽에서 꺼낸다.
   */
  const [filterDrawer, setFilterDrawer] = useState(false);

  /**
   * 상세 검색이 펼쳐져 있는가. **모드가 기본값을 정한다.**
   *
   *   좁은 목록  접는다. 조건이 결과 위에 눕는 자리라, 펼쳐 두면 결과가 화면 밖으로 밀려서
   *              검색하러 온 사람이 정작 결과를 못 본다.
   *   지도       편다. 조건이 서랍·사이드바로 빠져 결과와 자리를 다투지 않고, 거기까지
   *              일부러 연 사람은 조건을 만지러 온 것이다.
   *   넓은 화면  편다. 조건이 가로로 펼쳐져도 결과가 아래로 얼마 안 밀리고, 애초에 상세검색이
   *              있다는 것조차 모른 채 지나가는 게 더 큰 손해다.
   */
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    setDetailOpen(mapView || isWide);
  }, [mapView, isWide]);

  /** 지도 모드를 나가면 서랍도 닫는다 — 목록 모드에서는 조건이 본문에 그대로 있다. */
  useEffect(() => {
    if (!mapView) setFilterDrawer(false);
  }, [mapView]);

  /**
   * 서랍이 열린 동안 **뒤 페이지가 안 움직이게** 잠근다. 안 잠그면 서랍 위에서 손가락을
   * 굴렸을 때 뒤 목록이 따라 흘러서, 닫고 나면 엉뚱한 자리에 와 있다.
   */
  useEffect(() => {
    if (!filterDrawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [filterDrawer]);
  const setView = (next: 'list' | 'map') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'map') params.set('view', 'map');
    else params.delete('view');
    // replace 가 아니다 — 뒤로가기로 이전 보기로 돌아갈 수 있어야 한다.
    setSearchParams(params);
  };

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

  /**
   * 검색 실행. 초안을 URL 로 넘긴다 — 이때 비로소 API 가 나간다.
   *
   * **누르고 나면 조건을 치운다.** 검색 버튼을 누른 사람이 다음으로 보려는 것은 조건이
   * 아니라 결과다. 다만 치우는 방법이 모드마다 다르다:
   *
   *   목록  상세검색을 접는다. 조건이 결과 위에 그대로 누워 있어서, 펼친 채로 두면
   *         결과가 그 아래 묻혀 방금 누른 것이 먹혔는지조차 확인하러 스크롤해야 한다.
   *   지도  **접지 않는다.** 서랍이 통째로 닫히면서 조건이 이미 화면 밖으로 나간다.
   *         여기서 또 접으면 다음에 서랍을 열었을 때 접힌 채로 나와 한 번 더 눌러야 한다.
   */
  const search = () => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(draft)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
    if (!mapView) setDetailOpen(false);
    setFilterDrawer(false);
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

  const {
    data,
    isLoading,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useHospitalScroll({
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

  // 모든 페이지의 항목을 이어 붙인다. 필터가 바뀌면 useInfiniteQuery 가 새 키로 처음부터 다시 쌓는다.
  const items = data?.pages.flatMap((p) => p.items ?? []) ?? [];

  // 무한스크롤: 리스트 끝 센티넬이 화면에 들어오면(바닥 근처) 다음 페이지를 당긴다.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '200px' }, // 바닥 200px 전에 미리 로드해 끊김을 줄인다
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    /*
      **보기 모드가 배치를 정한다.**
        목록  조건이 위에 눕고 결과가 그 아래 — 여느 검색 화면과 같은 순서다.
        지도  조건이 왼쪽 사이드바로 서고 오른쪽을 지도가 쓴다.

      지도에서만 사이드바인 이유는, 지도가 가로 폭을 다 써야 쓸모가 있어서다. 목록만 볼 때까지
      조건을 옆으로 밀어두면 좁아진 사이드바에서 체크박스가 줄줄이 줄바꿈된다.
    */
    <div
      className={cn(
        /*
          모바일에서도 좌우를 띄우되 **최소치만** 준다(3px). 예전엔 px-0 이라 결과 카드가
          화면 끝에 붙어 잘린 것처럼 읽혔다. 그렇다고 넉넉히 주면 그러잖아도 좁은 폭에서
          카드가 한 번 더 안으로 밀려 병원 이름·주소가 일찍 줄바꿈된다. 목록은 훑는 자리라
          **내용 폭이 우선**이고, 여백은 "화면에 붙어 있지 않다" 는 것만 보이면 된다.

          rem 이 아니라 px 인 이유: 기준 글자 크기가 17px 이라 px-1 조차 4.25px 이 된다.
          이 값은 글자와 함께 커질 이유가 없는 물리적 여백이다.
        */
        'mx-auto px-[3px] py-4 sm:py-6',
        mapView
          ? 'max-w-[100rem] lg:grid lg:grid-cols-[21rem_1fr] lg:items-start lg:gap-5'
          : // 목록만 볼 때는 아주 넓은 화면(xl~)에서 폭을 연다. 그 아래는 읽기 좋은 768px.
            'max-w-3xl xl:max-w-6xl',
      )}
    >
      {/*
        필터.

        **사이드바 안에서 따로 스크롤되지 않는다.** 한때 화면에 붙여 두고(sticky) 넘치는 만큼
        안쪽에서 스크롤하게 했는데, 그러면 스크롤 영역이 두 겹이 된다 — 트랙패드나 손가락을
        굴렸을 때 페이지가 움직일지 사이드바가 움직일지 예측이 안 되고, 경계에서 스크롤이
        걸린다. 조건이 길어지면(상세검색을 펼치면) 사이드바 안에서 또 헤매야 한다.

        지금은 **자기 높이를 그대로 차지하고 페이지와 함께 움직인다.** 스크롤은 하나뿐이다.
        (지도가 실제로 붙으면 붙박이가 될 쪽은 이 조건이 아니라 지도다 — 목록을 내리는 동안
        지도가 남아 있어야 하고, 그건 오른쪽 칸에서 따로 잡는다.)
      */}
      {/*
        서랍 뒤 가림막. 눌러서 닫는다. lg 이상에서는 조건이 서랍이 아니라 그냥 칸이라 없다.
      */}
      {mapView && filterDrawer && (
        <button
          type="button"
          aria-label={t('search.closeFilters')}
          onClick={() => setFilterDrawer(false)}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      )}

      <aside
        className={cn(
          mapView && [
            /*
              좁은 화면: 왼쪽에서 밀려 나오는 서랍. **여기서는 안쪽 스크롤이 맞다** —
              화면을 덮고 있어서 뒤 페이지는 잠겨 있고, 스크롤할 대상이 이것 하나다.
              (본문에 눕혀 둘 때 안쪽 스크롤을 주면 스크롤이 두 겹이 되어 안 된다.)
            */
            'fixed inset-y-0 left-0 z-50 w-[86vw] max-w-sm overflow-y-auto overscroll-contain bg-surface-sunken pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-pop',
            'transition-transform duration-200 ease-native',
            filterDrawer ? 'translate-x-0' : '-translate-x-full',
            /*
              넓은 화면: 서랍을 풀고 평범한 칸으로 되돌린다.
              **PC 동작은 아직 정하지 않았다** — 조건을 붙박이로 둘지 지도를 붙박이로 둘지는
              PC 화면을 통째로 설계할 때 함께 정한다. 지금은 페이지와 함께 흐른다.
            */
            'lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none',
          ],
        )}
      >
        {/* 서랍 머리. 닫기는 좁은 화면에서만 — 넓은 화면에서는 서랍이 아니다. */}
        {mapView && (
          <div className="mb-3 flex items-center justify-between px-4 lg:hidden">
            <span className="text-[0.95rem] font-extrabold text-ink">
              {t('search.openFilters')}
            </span>
            <button
              type="button"
              onClick={() => setFilterDrawer(false)}
              aria-label={t('search.closeFilters')}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-body transition-transform duration-100 ease-native active:scale-90 active:bg-surface-subtle"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      {/*
        탭. **필터가 아니라 진입점이다.**
        찾는 사람이 서로 다르다 — 병원은 진료를 계획하는 사람, 응급실은 지금 당장 아픈 사람,
        달빛어린이는 밤에 아이가 열나는 부모다. 셋을 동시에 켜는 경우가 없어서 체크박스로 두면
        오히려 헷갈린다. 하나만 고르는 탭이 맞다.
      */}
      {/*
        탭. **알약 세그먼트다** — 회색 바닥 위에 켜진 탭만 흰색으로 떠오르고, 그 탭의 색
        (응급은 빨강·달빛은 남보라)을 글자와 아이콘이 그대로 쓴다.

        예전엔 폴더 탭이었다 — 회색 트랙 위에 흰 탭이 얹혀 아래 조건 패널로 이어지는 모양.
        페이지 바닥이 흰색에서 회색으로 바뀌면서 **트랙과 바닥이 같은 색**이 되어 탭이 떠
        보이지 않게 됐다. 상세 화면이 쓰는 알약과 같은 모양으로 맞춰 그 문제를 없앴다.
      */}
      {/*
        relative 래퍼. 더보기 드롭다운은 이 래퍼 기준으로 띄운다 —
        탭줄(overflow-x-auto)에 넣으면 세로로 잘리기 때문이다.
      */}
      <div className="relative" ref={moreRef}>
        <div
          role="tablist"
          className={cn(
            'flex gap-1 pb-2.5',
            mapView
              ? /*
                  좁은 자리(서랍·사이드바)에서는 **줄을 바꾼다.** 가로로 밀면 뒤쪽 탭
                  (달빛어린이·더보기)이 화면 밖에 숨는데, 밀 수 있다는 표시가 없어서
                  아예 없는 것처럼 보인다. 서랍은 자기 여백이 이미 있어 좌우도 안 띄운다.
                */
                'mx-0 flex-wrap px-4 lg:px-0'
              : // 본문에 누울 때는 한 줄을 지키고 넘치면 가로로 민다(줄이 늘면 결과가 밀린다).
                'overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
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
                  'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-2 text-sm transition-all duration-100 ease-native active:scale-95',
                  active
                    ? cn('bg-surface font-extrabold shadow-card', tab.tone)
                    : 'font-bold text-ink-muted',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? tab.tone : 'text-ink-subtle',
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
              'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-2 text-sm transition-all duration-100 ease-native active:scale-95',
              // 한 줄로 밀 때만 오른쪽 끝으로 보낸다. 줄바꿈 모드에서는 탭 뒤에 그대로 붙는다.
              !mapView && 'ml-auto',
              moreActive
                ? cn('bg-surface font-extrabold shadow-card', activeTab.tone)
                : 'font-bold text-ink-muted',
            )}
          >
            {moreActive &&
              (() => {
                const Icon = activeTab.icon;
                return <Icon className={cn('h-4 w-4 shrink-0', activeTab.tone)} />;
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
          <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop">
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
                      ? cn('bg-brand-tint font-extrabold', tab.tone)
                      : 'font-medium text-ink-body hover:bg-surface-subtle hover:text-ink',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      active ? tab.tone : 'text-ink-subtle',
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
      <div
        className={cn(
          'space-y-3 border border-line-subtle bg-surface p-4',
          /*
            서랍(모바일 지도 모드)에서는 **벽까지 닿는다.** 모바일은 그러잖아도 폭이 좁은데
            서랍 여백과 카드 여백이 겹치면 양쪽에서 28px 을 먹는다 — 그래서 서랍은 좌우 여백을
            아예 안 두고, 패널이 모서리·좌우 테두리·그림자를 뗀 채 벽에 붙는다.
            넓어지면(lg) 다시 홀로 서는 카드로 돌아온다.
          */
          mapView
            ? 'mx-0 border-x-0 lg:rounded-card lg:border-x lg:shadow-card'
            : 'rounded-card shadow-card',
        )}
      >
        {/* 시도 | 시군구 | 병원명. 한 줄이다 — 지역을 좁히고 이름을 치는 게 한 동작이다. */}
        {/*
          좁은 화면에서는 **두 줄로 접는다.** 셀렉트 둘 + 입력 + 버튼을 390px 에 한 줄로 밀어 넣으면
          병원명 칸이 글자 몇 개 폭으로 쪼그라들어 무엇을 치는 칸인지도 안 보인다.
        */}
        {/*
          **`sm:` 는 뷰포트를 본다 — 이 칸의 폭이 아니다.** 서랍(86vw·최대 24rem)이나
          사이드바(21rem)는 창이 아무리 넓어도 좁은데, 창 기준으로 가로 배치가 켜지면
          시도·시군구·병원명·버튼이 그 폭에 밀려 들어가 잘린다. 그래서 폭이 아니라
          **모드**로 가른다 — 지도 모드면 어떤 창에서든 세로로 쌓는다.
        */}
        <div className={cn('flex flex-col gap-2', !mapView && 'sm:flex-row')}>
          <div className="flex flex-wrap gap-2">
            {/*
              내 위치. **좌표로 검색하는 게 아니라 시도·시군구를 채운다** — 결과가 콤보박스에
              그대로 보여서 틀렸으면 사용자가 바로 고칠 수 있다. 지역 선택 왼쪽에 두는 것도
              "어디서" 를 정하는 같은 무리이기 때문이다.

              **검색까지 하지는 않는다.** 과목·장비를 고르는 중일 수 있어서, 다른 필터와 똑같이
              초안(draft)에만 얹고 검색 버튼을 누를 때 함께 나간다.
            */}
            <MyLocationButton
              onResolved={(point) =>
                update({
                  sido: point.sido.code,
                  // 세종처럼 시군구가 없는 시도면 비운다 — 시도만으로도 검색은 된다.
                  region: point.region?.code ?? '',
                })
              }
            />

            {/* 시도는 17개지만 목록으로 훑는 것보다 "부산" 이라고 치는 게 빠르다. */}
            <Combobox
              value={sido}
              onChange={(value) => update({ sido: value, region: '' })}
              options={toOptions(sidos)}
              placeholder={t('search.sido')}
              searchPlaceholder={t('search.sidoSearch')}
              allLabel={t('common.all')}
              className={cn('min-w-0 flex-1', !mapView && 'sm:w-28 sm:flex-none')}
            />

            {/* 시군구는 250개다. 스크롤로는 못 찾으니 타이핑해서 거른다. */}
            <Combobox
              value={region}
              onChange={(value) => update({ region: value })}
              options={toOptions(sggus)}
              placeholder={t('search.sggu')}
              searchPlaceholder={t('search.sgguSearch')}
              allLabel={t('common.all')}
              disabled={!sido}
              className={cn('min-w-0 flex-1', !mapView && 'sm:w-32 sm:flex-none')}
            />
          </div>

          <div className={cn('flex flex-1', mapView ? 'gap-2' : 'gap-3')}>
            {/* 돋보기를 칸 안에 둔다 — 버튼을 보기 전에 "여기가 검색어" 라는 게 먼저 읽힌다. */}
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
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
          className="flex items-center gap-1.5 text-[0.8rem] font-bold text-ink-muted transition-colors hover:text-ink"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t('search.advanced')}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', detailOpen && 'rotate-180')}
          />
        </button>

        {detailOpen && (
          <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface">
            {/*
              병원 규모가 맨 위다. **"동네 의원이냐 큰 병원이냐" 가 과목보다 먼저 정해진다** —
              감기면 의원, 수술이면 종합병원. 그걸 고르고 나서 과를 고른다.
              tier 컬럼 하나로 거른다 (종별 8개를 IN 절로 나열하지 않는다).
            */}
            {/* 요양·정신 탭에서는 규모를 안 보여준다 — 그 탭 자체가 이미 규모를 정한다. */}
            {!inpatient && (
              <FilterRow
                stacked={mapView}
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
                stacked={mapView}
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
                stacked={mapView}
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
              stacked={mapView}
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
                stacked={mapView}
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
              stacked={mapView}
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
              stacked={mapView}
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
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-brand-wash px-2.5 py-2">
            {selected.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={item.remove}
                className="flex items-center gap-1 rounded-full bg-surface py-1 pl-2.5 pr-1.5 text-xs font-bold text-ink-body ring-1 ring-inset ring-line transition-transform duration-100 ease-native active:scale-95"
              >
                {item.name}
                <X className="h-3.5 w-3.5 text-ink-subtle" />
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
              className="ml-1 text-[0.72rem] font-bold text-ink-muted transition-colors hover:text-brand"
            >
              {t('search.clearAll')}
            </button>
          </div>
            )}

        {/*
          검색 버튼. **늘 자리에 있다.**

          예전엔 조건이 바뀌었을 때만(dirty) 나타났다. 누를 이유가 없을 땐 감춘다는 뜻이었는데,
          정작 사용자는 조건을 고르는 내내 "그래서 검색은 어디서 하지" 를 찾게 된다 —
          버튼이 있다 없다 하면 그게 어디 있었는지조차 기억에 안 남는다.

          **패널 바닥에 붙어 따라온다**(sticky). 상세검색을 펼치면 조건이 화면 몇 개 길이가
          되는데, 그때 버튼이 맨 아래에만 있으면 끝까지 내려가야 누른다.
        */}
        <div className="sticky bottom-0 -mx-4 -mb-4 bg-surface px-4 pb-4 pt-3">
          <Button onClick={search} className="w-full">
            <SearchIcon className="h-4 w-4" />
            {dirty ? t('search.applyFilters') : t('search.submit')}
          </Button>
        </div>
      </div>
      </aside>

      {/* 결과. min-w-0 이 없으면 grid 칸이 콘텐츠 폭 밑으로 안 줄어 사이드바를 밀어낸다. */}
      <section className={cn('mt-5 min-w-0', mapView && 'lg:mt-0')}>

      {/* 결과 목록의 제목 줄. 카드 바로 위에 붙여 "이 아래가 결과" 임을 잇는다. */}
      <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
        <p className="min-w-0 truncate text-[0.85rem] font-extrabold text-ink">
          {isLoading
            ? t('common.loading')
            : t('search.count', { count: items.length })}
          {isFetching && !isLoading && !isFetchingNextPage && (
            <span className="ml-1.5 text-[0.75rem] font-medium text-ink-subtle">
              {t('search.refreshing')}
            </span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
        {/* 조건 서랍 열기. 지도 모드의 좁은 화면에서만 — 그때만 조건이 화면 밖에 있다. */}
        {mapView && (
          <button
            type="button"
            onClick={() => setFilterDrawer(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[0.75rem] font-bold text-ink-body shadow-card ring-1 ring-inset ring-line transition-transform duration-100 ease-native active:scale-95 lg:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t('search.openFilters')}
          </button>
        )}

        {/*
          보기 전환. **결과 줄에 둔다** — 무엇을 보고 있는지(N건) 바로 옆이 "그걸 어떻게
          볼까" 를 정하는 자리다. 조건 패널에 넣으면 필터의 하나처럼 읽힌다.
        */}
        <button
          type="button"
          onClick={() => setView(mapView ? 'list' : 'map')}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[0.75rem] font-bold text-ink-body shadow-card ring-1 ring-inset ring-line transition-transform duration-100 ease-native active:scale-95"
        >
          {mapView ? (
            <ListIcon className="h-3.5 w-3.5" />
          ) : (
            <MapIcon className="h-3.5 w-3.5" />
          )}
          {mapView ? t('search.viewList') : t('search.viewMap')}
        </button>
        </div>
      </div>

      {/*
        지도 자리. **아직 지도를 띄우지 않는다.**
        지금 검색 API 는 지역 코드(region)로만 거를 수 있고 좌표·영역(bbox) 파라미터가 없다 —
        지도를 움직여 그 영역을 다시 검색하는, 이 화면의 핵심 동작을 못 만든다. 결과에 좌표는
        이미 들어 있으므로(LocationDto.lat/lon) 서버가 영역 검색을 주면 여기에 핀부터 붙인다.
      */}
      {mapView && (
        <div className="mb-3 flex h-64 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface px-6 text-center lg:h-[26rem]">
          <MapIcon className="h-6 w-6 text-ink-subtle" />
          <p className="!my-0 text-sm font-bold text-ink-body">
            {t('search.mapSoon')}
          </p>
          <p className="!my-0 max-w-xs text-xs leading-relaxed text-ink-subtle">
            {t('search.mapSoonHint')}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="py-12 text-center">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="py-12 text-center text-danger">{t('common.loadError')}</p>
      )}

      {/*
        **목록 모드에서만 2열로 편다.** 1920px 화면에서 768px 한 줄만 쓰면 좌우가 텅 빈다.

        지도 모드는 1열 그대로다 — 거기서는 오른쪽 칸을 결과와 지도가 나눠 쓰기 때문에,
        결과가 2열로 벌어지면 지도가 설 자리가 없다. 두 모드가 애초에 다른 갈래라
        나중에 지도가 실제로 붙어도 이쪽은 손댈 일이 없다.
      */}
      <div className={cn('grid gap-2.5', !mapView && 'xl:grid-cols-2')}>
        {items.map((h) => (
          <HospitalCard key={h.id} hospital={h} />
        ))}
      </div>

      {items.length === 0 && !isLoading && (
        <p className="py-12 text-center text-ink-muted">{t('search.empty')}</p>
      )}

      {/* 무한스크롤 센티넬 — 화면에 들어오면(바닥 근처) 다음 페이지를 부른다 */}
      <div ref={sentinelRef} className="h-1" aria-hidden />
      {isFetchingNextPage && (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      )}
      </section>
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
        'rounded-full px-3 py-1.5 text-sm transition-all duration-100 ease-native active:scale-95',
        active
          ? 'bg-brand font-bold text-white shadow-brand-sm'
          : 'bg-surface font-semibold text-ink-body ring-1 ring-inset ring-line',
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
  stacked,
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

  /**
   * 라벨을 **내용 위로 올린다.** 사이드바(지도 모드)처럼 좁은 자리를 위한 것이다.
   *
   * 넓은 자리에서는 [라벨 | 체크박스] 가로 배치가 낫다 — 라벨이 왼쪽에 줄지어 서서 무엇을
   * 고르는 행인지 훑기 좋다. 그런데 그 라벨 칸이 112px 고정이라, 21rem 사이드바에서는
   * 그것만으로 폭의 3분의 1을 먹고 체크박스가 두세 개마다 줄바꿈된다.
   */
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  /*
    행 껍데기. **기본은 세로(라벨이 위)이고, 넓어지면 가로로 편다.**

    가로 배치는 라벨이 왼쪽에 줄지어 서서 무엇을 고르는 행인지 훑기 좋다. 그런데 그 라벨 칸이
    112px 고정이라 좁은 화면에서는 폭의 3분의 1을 먹고, 체크박스가 두세 개마다 줄바꿈된다.
    그래서 **좁으면 라벨을 위로 올린다.**

    좁다는 판정이 둘이다:
      stacked  서랍·사이드바처럼 **창과 무관하게** 칸이 좁은 자리. 창이 아무리 넓어도 세로다.
      sm 미만  본문에 누웠을 때의 화면 폭. 이때는 칸 폭이 곧 화면 폭이라 미디어쿼리로 충분하다.
  */
  const inline = !stacked;
  const rowClass = cn(
    'border-b border-line px-3 py-3 last:border-b-0',
    inline && 'sm:flex sm:p-0',
  );
  const labelClass = cn(
    'mb-2 block text-[0.8rem] font-extrabold text-ink',
    inline &&
      'sm:mb-0 sm:w-28 sm:shrink-0 sm:bg-surface-subtle sm:px-3 sm:py-3 sm:text-sm sm:font-bold sm:text-ink-body',
  );
  const bodyClass = cn(inline && 'sm:flex-1 sm:px-3 sm:py-2.5');

  // +N·닫기·접기 버튼 공통 모양. 밋밋한 텍스트가 아니라 **살짝 버튼 느낌**(옅은 테두리·배경·pill).
  const pill =
    'rounded-full bg-surface-subtle px-2.5 py-1 text-[0.68rem] font-bold text-ink-muted transition-all duration-100 ease-native hover:bg-brand-tint hover:text-brand-strong active:scale-95';

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
      /*
        **접힌 행은 좁아도 한 줄이다.** 펼친 행과 달리 라벨 밑에 놓일 내용이 없다 —
        "47개 ▾" 하나뿐이라, 라벨을 윗줄로 올려봐야 자리만 한 줄 더 먹는다.
        그래서 여기서는 stacked 여부와 무관하게 라벨과 개수를 나란히 둔다.
      */
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center border-b border-line px-3 py-3 text-left last:border-b-0',
          inline && 'sm:p-0',
        )}
      >
        <span
          className={cn(
            'text-[0.8rem] font-extrabold text-ink',
            inline &&
              'sm:w-28 sm:shrink-0 sm:bg-surface-subtle sm:px-3 sm:py-3 sm:text-sm sm:font-bold sm:text-ink-body',
          )}
        >
          {labelNode}
        </span>
        <span
          className={cn(
            // 좁을 때는 개수를 오른쪽 끝으로 밀어 목록 행처럼 읽히게 한다.
            'ml-auto flex items-center gap-1 text-sm text-ink-subtle',
            inline && 'sm:ml-0 sm:flex-1 sm:px-3 sm:py-3',
          )}
        >
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
    <div className={rowClass}>
      <div className={labelClass}>{labelNode}</div>

      <div className={bodyClass}>
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
                  <p className="!my-0 mb-1.5 text-[0.68rem] font-bold text-ink-subtle">
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
      className={cn(
        'flex cursor-pointer items-center gap-1.5 text-[0.82rem] transition-colors',
        checked ? 'font-bold text-brand-strong' : 'font-medium text-ink-body',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-[0.95rem] w-[0.95rem] rounded border-line-strong text-brand focus:ring-brand focus:ring-offset-0"
      />
      <span className="truncate">{option.name}</span>
    </label>
  );
}
