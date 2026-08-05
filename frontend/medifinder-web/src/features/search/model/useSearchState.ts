import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useHospitalScroll,
  type HospitalSortBy,
  useSubjects,
  useSubjectGroups,
  useHospitalTiers,
  useSpecialties,
  useSpecials,
  useEquipments,
  useAssessmentGroups,
  useSidoRegions,
  useSgguRegions,
} from '@/features/clinic/api';
import { useIsWide } from '@/shared/hooks/useIsWide';
import { useMyRegion } from '@/shared/hooks/useMyRegion';
import { useMyCoords } from '@/shared/hooks/useMyCoords';
import type { MapBounds } from '@/shared/components/map/mapAdapters';
import {
  BedDouble,
  Brain,
  Moon,
  Siren,
  Stethoscope,
} from 'lucide-react';

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
export const PRIMARY_TABS = TABS.slice(0, 3);
export const MORE_TABS = TABS.slice(3);

/**
 * 병원 검색.
 *
 * **검색은 서버가 한다.** 예전에는 원본(hira/nmc)을 골라 한 페이지를 받아 온 뒤
 * 그 안에서 이름으로 클라이언트 필터링했다 — 8만 건 중 20건만 보고 거르니 사실상 무용지물이었다.
 * 이제 지역·종별·진료과목·이름을 서버에 넘긴다 (인덱스를 탄다).
 */

/**
 * 검색 화면의 상태 전부.
 *
 * **그리는 코드와 갈라 둔다.** 조건은 URL 과 초안(draft) 두 겹이고, 거기에 탭·서랍·보기 모드·
 * 무한스크롤·메타 목록이 얹힌다 — 그 400 줄이 JSX 500 줄과 한 함수에 있으니 무엇을 고치는지
 * 찾는 데만 시간이 걸렸다.
 *
 * 반환값을 통째로 넘긴다(props 를 59 개 늘어놓지 않는다). 이 화면 전용이라 재사용할 일이 없고,
 * 조각이 늘 때마다 중간에서 props 를 다시 엮는 일이 없어진다. 타입은 추론에 맡긴다 —
 * 손으로 적으면 반드시 실제와 어긋난다.
 */
/**
 * 두 영역이 사실상 같은가.
 *
 * **정확히 같은지 묻지 않는다.** 지도는 손을 뗄 때마다 소수점 끝자리가 미세하게 달라져서,
 * 엄밀히 비교하면 아무것도 안 건드려도 "이 지역에서 검색" 이 계속 떠 있게 된다.
 * 0.0001° 는 약 11m — 그보다 적게 움직인 것은 안 움직인 것으로 본다.
 */
const BOUNDS_EPSILON = 0.0001;

function sameBounds(a: MapBounds, b: MapBounds | undefined): boolean {
  if (!b) return false;
  return (
    Math.abs(a.minLat - b.minLat) < BOUNDS_EPSILON &&
    Math.abs(a.minLon - b.minLon) < BOUNDS_EPSILON &&
    Math.abs(a.maxLat - b.maxLat) < BOUNDS_EPSILON &&
    Math.abs(a.maxLon - b.maxLon) < BOUNDS_EPSILON
  );
}

export function useSearchState() {
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

  /** 시도 셀렉트 안의 "내 위치로 찾기". 좌표는 훅 안에서만 살고 지역 코드만 나온다. */
  const { locate, status: locateStatus } = useMyRegion();
  const locating = locateStatus === 'locating';


  const mapView = searchParams.get('view') === 'map';

  /**
   * 정렬 기준. **URL 에 두되 좌표는 안 둔다.**
   *
   * "가까운 순" 이라는 **선택**은 공유·뒤로가기로 복원돼야 한다(?sort=distance).
   * 하지만 **좌표는 URL 에 절대 싣지 않는다** — 링크를 주고받는 순간 내가 어디 있었는지가
   * 같이 건너간다. 좌표는 useMyCoords 안에서만 살고 API 요청 파라미터로만 나간다.
   *
   * 그래서 링크를 받은 사람은 "가까운 순" 상태로 들어오되 **자기 위치로** 정렬된다 —
   * 보낸 사람의 위치가 아니라. 위치 기반 정렬에서는 그게 맞는 동작이기도 하다.
   */
  const sortBy: HospitalSortBy =
    searchParams.get('sort') === 'distance' ? 'distance' : 'default';

  const { coords, locate: locateCoords, status: coordsStatus } = useMyCoords();

  /**
   * 정렬을 바꾼다. 거리순은 **좌표를 받고 나서** URL 에 넣는다.
   *
   * 순서가 중요하다 — 먼저 URL 을 바꾸면 좌표 없는 거리순 상태가 잠깐 생기고, 그 사이
   * 기본 정렬 결과가 "가까운 순" 이라는 이름표를 달고 화면에 남는다. 거부당하면 아무 일도
   * 일어나지 않는다(정렬이 그대로다) — 눌렀는데 안 바뀌는 게 틀린 순서로 바뀌는 것보다 낫다.
   */
  const changeSort = async (next: HospitalSortBy) => {
    if (next === 'distance' && !(await locateCoords())) return;

    const params = new URLSearchParams(searchParams);
    if (next === 'distance') params.set('sort', 'distance');
    else params.delete('sort');
    setSearchParams(params, { replace: true });
  };

  /**
   * 거리순인데 아직 좌표가 없는 상태. **요청을 보내지 않는다**(서버가 400 을 준다).
   *
   * 링크로 ?sort=distance 를 받고 들어온 경우다 — 그 사람의 좌표는 아직 없다.
   * 화면이 이 값을 보고 "위치 허용" 안내를 띄운다.
   */
  const needsCoords = sortBy === 'distance' && !coords;

  /** 링크로 들어온 거리순이면 좌표를 한 번 물어본다. 누른 적 없는 사람에겐 안 묻는다. */
  useEffect(() => {
    if (sortBy === 'distance') void locateCoords();
  }, [sortBy, locateCoords]);

  /**
   * 지도 영역 검색.
   *
   * **URL 에 넣지 않는다.** 정렬(?sort=distance)과 다른 판단이다 — 지도 영역은 좌표 그 자체라,
   * 링크로 건네는 순간 내가 어디를 보고 있었는지가 같이 건너간다. 특히 "내 위치" 로 지도를
   * 옮긴 직후의 영역은 사실상 내 위치다. 그래서 이 화면 안에서만 산다.
   *
   * 대가는 지도 영역이 공유·뒤로가기로 복원되지 않는다는 것이다. 그 편을 택했다 —
   * 링크를 받은 사람은 조건만 같은 전국 검색을 보게 되고, 지도는 다시 옮기면 된다.
   */
  const [searchedBounds, setSearchedBounds] = useState<MapBounds>();

  /** 지금 지도에 보이는 영역. 아직 검색에 쓰지 않은 값이다. */
  const [visibleBounds, setVisibleBounds] = useState<MapBounds>();

  /**
   * "이 지역에서 검색" 을 띄울까. **사용자가 지도를 옮겼고, 그 영역으로 아직 검색하지 않았을 때**다.
   *
   * 지도 어댑터가 이미 우리가 옮긴 이동은 걸러서 알린다(watchBounds) — 여기서는 "알려온 영역이
   * 마지막으로 검색한 영역과 다른가" 만 본다.
   */
  const canSearchArea =
    !!visibleBounds && !sameBounds(visibleBounds, searchedBounds);

  /** 지도가 멈출 때마다 온다. 검색은 아직 안 나간다 — 버튼을 눌러야 나간다. */
  const handleBoundsChange = useCallback((next: MapBounds) => {
    setVisibleBounds(next);
  }, []);

  /**
   * 보이는 영역으로 검색한다.
   *
   * **지역 조건을 지운다.** "서울" 을 고른 채 부산 앞바다를 비추고 이 버튼을 누르면 결과가
   * 0 건이다(교집합이라서다) — 사용자가 방금 한 행동은 "여기를 보겠다" 인데 화면은 아무것도
   * 못 찾은 것처럼 보인다. 지도로 자리를 정했으면 그게 지역 조건을 대신한다.
   */
  const searchArea = () => {
    if (!visibleBounds) return;
    setSearchedBounds(visibleBounds);

    const next = new URLSearchParams(searchParams);
    next.delete('sido');
    next.delete('region');
    setSearchParams(next, { replace: true });
    setDraft((prev) => ({ ...prev, sido: '', region: '' }));
  };

  /** 지도 모드를 나가면 영역 검색을 푼다 — 목록 모드에는 그 영역을 보여줄 지도가 없다. */
  useEffect(() => {
    if (!mapView) {
      setSearchedBounds(undefined);
      setVisibleBounds(undefined);
    }
  }, [mapView]);

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
    // advanced=1 은 첫 화면의 '상세검색' 입구로 들어온 것이다 — 조건을 만지러 온 사람이라 편다.
    setDetailOpen(mapView || isWide || searchParams.get('advanced') === '1');
  }, [mapView, isWide, searchParams]);

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
    sort: sortBy,
    origin: coords,
    bbox: searchedBounds,
    // 거리순인데 좌표가 아직 없으면 요청을 멈춘다 — 보내봐야 400 이라 목록이 통째로 빈다.
    enabled: !needsCoords,
  });

  // 모든 페이지의 항목을 이어 붙인다. 필터가 바뀌면 useInfiniteQuery 가 새 키로 처음부터 다시 쌓는다.
  const items = data?.pages.flatMap((p) => p.items ?? []) ?? [];

  /**
   * 지도에 찍을 결과. **좌표가 있는 것만** — 없는 병원이 실제로 있다(원본에 안 들어온다).
   *
   * 번호는 **목록에서 몇 번째인가**로 매긴다(index+1). 좌표 없는 병원을 걸러낸 뒤의 순서로
   * 매기면 목록의 3번이 지도의 2번이 되어 서로 못 알아본다 — 카드와 핀이 같은 글자를 달아야
   * "지도의 B가 어느 카드인지" 를 찾을 수 있다(HospitalCard 의 rankMark 주석과 같은 규칙).
   *
   * **배열 정체성을 묶는다.** 렌더마다 새 배열을 넘기면 그때마다 핀을 다시 만든다.
   */
  /**
   * 지도에서 고른 병원. **목록의 그 카드를 잠깐 칠한다.**
   *
   * 핀을 눌러 상세로 바로 보내지 않는 이유는 지도가 **비교하는 화면**이라서다 — 한 곳을
   * 열고 뒤로 돌아오면 지도가 다시 만들어지고(SDK 호출 = 과금) 확대율과 쌓아둔 결과가
   * 처음으로 돌아간다. 여기서는 "그게 목록의 어느 것인지" 만 알려주고, 들어갈지는
   * 카드를 눌러 사용자가 정한다.
   */
  const [focusedId, setFocusedId] = useState<string>();
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  const focusResult = (id: string) => {
    setFocusedId(id);
    document
      .getElementById(`search-result-${id}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });

    // 칠한 채로 두지 않는다 — 다음에 다른 핀을 누르면 어느 쪽이 방금 것인지 헷갈린다.
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocusedId(undefined), 2400);
  };

  const mapPoints = useMemo(
    () =>
      items
        .map((h, index) => ({ h, rank: index + 1 }))
        .filter(({ h }) => h.location?.lat != null && h.location?.lon != null)
        .map(({ h, rank }) => ({
          lat: h.location!.lat!,
          lng: h.location!.lon!,
          name: h.name,
          rank,
          // 말풍선을 누르면 이 id 로 아래 목록의 카드를 찾는다.
          // 문자열인 이유: 지도 쪽에서는 DOM 속성(data-map-select)으로 오간다.
          id: String(h.id),
        })),
    // 좌표·이름이 바뀌는 건 결국 목록이 바뀔 때뿐이라 길이와 첫 항목으로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length, items[0]?.id],
  );

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

  return {
    activeTab,
    assessment,
    assessmentCds,
    baby,
    detailOpen,
    dirty,
    draft,
    equipment,
    equipmentCds,
    equipments,
    filterDrawer,
    focusResult,
    focusedId,
    groups,
    inpatient,
    isError,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isWide,
    items,
    keyword,
    locate,
    locating,
    mapPoints,
    mapView,
    moreActive,
    moreOpen,
    moreRef,
    region,
    scopedAssessmentGroups,
    search,
    // 정렬. 좌표는 내주지 않는다 — 화면이 쥐고 있을 이유가 없고, 쥐면 URL 로 샐 길이 생긴다.
    sortBy,
    changeSort,
    needsCoords,
    locatingCoords: coordsStatus === 'locating',
    // 지도 영역 검색. 좌표는 화면 밖으로 안 나간다(URL·링크에 안 실린다).
    canSearchArea,
    searchArea,
    searchedBounds,
    handleBoundsChange,
    selectTab,
    selected,
    sentinelRef,
    setDetailOpen,
    setFilterDrawer,
    setMoreOpen,
    setView,
    sggus,
    sido,
    sidos,
    special,
    specialCds,
    specialist,
    specialistCds,
    specials,
    specialties,
    specialty,
    specialtyCds,
    subject,
    subjectCds,
    subjects,
    t,
    tier,
    tierCds,
    tiers,
    toOptions,
    update,
  };
}

/** 화면 조각들이 통째로 받는 상태. */
export type SearchState = ReturnType<typeof useSearchState>;
