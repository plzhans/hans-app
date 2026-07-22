import {
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import {
  useHealthcareHospitalControllerSearch,
  healthcareHospitalControllerScroll,
  useHealthcareHospitalControllerGet,
  useHealthcareHospitalControllerNonPayments,
  getHealthcareHospitalControllerNonPaymentsQueryOptions,
  getHealthcareHospitalControllerNonPaymentsQueryKey,
  healthcareHospitalControllerRequestNonPayments,
} from '@/shared/api/generated/react/healthcare/healthcare';
import {
  useHealthcareMetaControllerSubjects,
  useHealthcareMetaControllerSubjectGroups,
  useHealthcareMetaControllerTiers,
  useHealthcareMetaControllerClasses,
  useHealthcareMetaControllerSpecialties,
  useHealthcareMetaControllerSpecials,
  useHealthcareMetaControllerEquipments,
  useHealthcareMetaControllerAssessments,
} from '@/shared/api/generated/react/healthcare-meta/healthcare-meta';
// 지역은 /healthcare/meta/regions 가 아니라 /address/regions 다(영문 주소 변환과 같은 주소 그룹).
// region_code 는 도메인 무관이라(병원·학교·약국이 같이 쓴다) 헬스케어 밑에서 빠졌다.
import { useRegionControllerList } from '@/shared/api/generated/react/address/address';
import type {
  HospitalNonPaymentDto,
  NonPaymentCategoryDto,
  NonPaymentItemDto,
  NonPaymentPriceDto,
  HospitalSummaryDto,
  HospitalDetailDto,
  MetaCodeDto,
  MetaSubjectDto,
  MetaHospitalTierDto,
  MetaSubjectGroupDto,
  MetaAssessmentGroupDto,
  RegionDto,
} from '@/shared/api/generated/model';

/**
 * orval 이 생성한 react-query 훅(generated/react)에 대한 얇은 어댑터.
 *
 * 화면단은 이 파일의 안정적인 이름(useHospitalSearch 등)만 쓴다.
 * 백엔드 스펙이 바뀌면 `pnpm api:sync` 로 generated 를 다시 만들고 여기서만 맞춘다.
 *
 * [2026-07 변경]
 * 예전에는 `?source=hira|nmc` 로 어느 원본을 볼지 골랐다. 그러면 같은 병원이 두 번 나오고
 * 반쪽 데이터만 보였다(HIRA 는 진료시간·응급실이 없고, NMC 는 병상·장비가 없다).
 * 이제 백엔드가 둘을 매칭해 합친 통합 병원 하나를 준다. source 파라미터가 사라졌다.
 */
export type Hospital = HospitalSummaryDto;
export type HospitalDetail = HospitalDetailDto;
export type MetaCode = MetaCodeDto;
export type MetaRegion = RegionDto;

export interface HospitalSearchParams {
  page: number;
  size: number;

  /** 시군구 코드. /address/regions 참조 */
  region?: string;

  /** 종별 코드 (TERTIARY, GENERAL, CLINIC …) */
  category?: string;

  /** 병원 등급. TIER1(의원급) | TIER2(병원급) | TIER3(상급종합) | NURSING | MENTAL. 쉼표로 여러 개. */
  tier?: string;

  /** 진료과목 코드 (IM, PED …) — 신고만 하면 걸린다. */
  subject?: string;

  /** 전문의 있는 과목 코드. subject 와 같은 코드지만 그 과목 전문의를 실제로 보유한 병원만. 쉼표 OR. */
  specialist?: string;

  /** 병원명 부분 일치 */
  name?: string;

  /** 응급실 운영 병원만 */
  emergency?: boolean;

  /** 달빛어린이병원만 (야간·휴일 소아진료) */
  baby?: boolean;

  /**
   * 적정성평가 1등급 분야. cancer(암) · cardio(심뇌혈관) · nicu(신생아중환자실). 쉼표로 여러 개(OR).
   * 병원급 이상만 의미가 있어 전국 목록으로 쓸 땐 tier=TIER2,TIER3 를 함께 건다.
   */
  assessment?: string;

  /** 전문병원 지정분야 코드. 쉼표로 여러 개(OR). /healthcare/meta/specialties 참조. */
  specialty?: string;

  /** 특수진료 코드. 쉼표로 여러 개(OR). /healthcare/meta/specials 참조. */
  special?: string;

  /** 보유장비 코드. 쉼표로 여러 개(OR). /healthcare/meta/equipments 참조. */
  equipment?: string;
}

/** GET /healthcare/hospitals — 통합 병원 검색 */
export function useHospitalSearch(params: HospitalSearchParams) {
  return useHealthcareHospitalControllerSearch(
    {
      page: params.page,
      size: params.size,
      region: params.region || undefined,
      category: params.category || undefined,
      tier: params.tier || undefined,
      subject: params.subject || undefined,
      specialist: params.specialist || undefined,
      name: params.name || undefined,
      emergency: params.emergency ? 'true' : undefined,
      baby: params.baby ? 'true' : undefined,
      assessment: params.assessment || undefined,
      specialty: params.specialty || undefined,
      special: params.special || undefined,
      equipment: params.equipment || undefined,
    },
    {
      query: {
        placeholderData: (prev) => prev,
        // PageResponseDto.items 가 제네릭이라 스키마상 unknown[] 으로 떨어진다.
        // 이 엔드포인트의 실제 요소 타입으로 좁힌다.
        select: (data) => ({
          ...data,
          items: (data.items ?? []) as unknown as Hospital[],
        }),
      },
    },
  );
}

/** 무한스크롤 필터. 검색과 같지만 page 가 없다 — nextToken 커서로 이어 받는다. */
export type HospitalScrollParams = Omit<HospitalSearchParams, 'page'>;

/**
 * GET /healthcare/hospitals/scroll — 무한스크롤(Elasticsearch 기본).
 *
 * page/size(offset) 대신 nextToken 커서로 다음 묶음을 이어 받는다. db 를 넘기지 않으므로 **ES** 로
 * 조회한다. getNextPageParam 이 nextToken 을 반환하면 다음 페이지가 있는 것이고, undefined 면 끝이다
 * (hasNextPage=false). 필터가 바뀌면 queryKey 가 바뀌어 스크롤이 처음부터 다시 시작한다.
 */
export function useHospitalScroll(params: HospitalScrollParams) {
  const query = {
    size: params.size,
    region: params.region || undefined,
    category: params.category || undefined,
    tier: params.tier || undefined,
    subject: params.subject || undefined,
    specialist: params.specialist || undefined,
    name: params.name || undefined,
    emergency: params.emergency ? 'true' : undefined,
    baby: params.baby ? 'true' : undefined,
    assessment: params.assessment || undefined,
    specialty: params.specialty || undefined,
    special: params.special || undefined,
    equipment: params.equipment || undefined,
  };
  return useInfiniteQuery({
    queryKey: ['hospital-scroll', query],
    queryFn: ({ pageParam }) =>
      healthcareHospitalControllerScroll({
        ...query,
        nextToken: pageParam || undefined,
      }),
    initialPageParam: '' as string,
    // nextToken 이 있으면 다음 커서, 없으면 undefined → 다음 페이지 없음.
    getNextPageParam: (last) => last.nextToken || undefined,
  });
}

/** GET /healthcare/hospitals/{id} — 통합 병원 상세 */
export function useHospitalDetail(id: string | undefined) {
  return useHealthcareHospitalControllerGet(Number(id ?? 0), {
    query: { enabled: !!id },
  });
}

export type NonPayment = HospitalNonPaymentDto;
export type NonPaymentCategory = NonPaymentCategoryDto;
export type NonPaymentItem = NonPaymentItemDto;
export type NonPaymentPrice = NonPaymentPriceDto;

/**
 * GET /healthcare/hospitals/{id}/hira-npay — 비급여 진료비.
 *
 * **통합 상세(useHospitalDetail)와 별개 호출이다.** 상세 응답에 끼워 넣지 않은 이유는 두 가지다 —
 * 비급여가 있는 기관이 3,511곳(전체의 4.4%)뿐이라 95% 에게는 헛짐이고, 한 기관에 수백 행이라
 * 보지도 않을 사람에게 실어 보낼 이유가 없다.
 *
 * **페이지가 없다. 기관 전건이 한 번에 온다.** 예전에는 미러(/data-go-kr/hira/…/npay)를 직접
 * 불러서 원본 봉투를 풀고(0건이면 items 가 빈 문자열, 1건이면 item 이 객체), 이름을 잘라
 * 대분류를 만들고, 100건씩 받아 누적한 뒤 그룹핑했다. 그걸 전부 서버가 한다 — 여기는 받기만 한다.
 */
export function useHospitalNonPayments(id: string | undefined) {
  return useHealthcareHospitalControllerNonPayments(Number(id ?? 0), {
    query: { enabled: !!id },
  });
}

/**
 * 비급여를 미리 받아 둔다. 링크에 마우스가 올라가거나 손이 닿을 때 부른다.
 *
 * react-query 의 캐시에 미리 채워 두면, 눌렀을 때 useHospitalNonPayments 가 같은 queryKey 로
 * 캐시를 맞고 로딩 없이 그린다. queryKey 가 어긋나면 조용히 두 번 부르게 되므로, 키를 손으로
 * 만들지 않고 생성된 queryOptions 를 그대로 쓴다.
 *
 * prefetchQuery 는 이미 캐시에 있으면 아무것도 하지 않으므로 중복 호출 걱정이 없다.
 */
export function useNonPaymentPrefetch(id: string | undefined) {
  const queryClient = useQueryClient();

  return () => {
    if (!id) return;
    void queryClient.prefetchQuery(
      getHealthcareHospitalControllerNonPaymentsQueryOptions(Number(id)),
    );
  };
}

/**
 * POST /healthcare/hospitals/{id}/hira-npay/request — 비급여 갱신 요청.
 *
 * **크롤을 트리거하지 않는다.** 서버는 큐에 넣고 끝이고, 배치(지금은 CLI)가 처리한다.
 * 그래서 성공해도 데이터가 바로 오지 않는다 — source 가 pending 으로 바뀔 뿐이다.
 *
 * 성공하면 이 병원의 비급여 캐시를 무효화해서 조회를 다시 시킨다. 그래야 requestStatus 가
 * pending 으로 갱신돼 화면이 "요청됨" 으로 바뀐다.
 */
export function useNonPaymentRequest(id: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      healthcareHospitalControllerRequestNonPayments(Number(id ?? 0)),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: getHealthcareHospitalControllerNonPaymentsQueryKey(
          Number(id ?? 0),
        ),
      }),
  });
}

/**
 * 목록 응답을 배열로 푼다.
 *
 * 서버는 목록을 `{ items: [...] }` 로 감싸 준다 — 최상위가 배열이면 나중에 필드를 하나라도
 * 덧붙이는 순간 응답 모양이 바뀌어 클라이언트가 전부 깨지기 때문이다.
 *
 * 그 사정을 화면단까지 끌고 갈 이유는 없다. 여기서 풀어서 배열로 넘긴다.
 * (이 파일이 어댑터인 이유가 그거다 — 스펙이 바뀌면 여기서만 맞춘다)
 */
const unwrap = <T>(data: { items?: T[] }): T[] => data.items ?? [];

/** 참조 데이터. 검색 조건 드롭다운을 채운다. */
/** 진료과목. 각 과목에 계열(field: 의/치/한)과 전문과목 여부(specialist)가 붙는다. */
export function useSubjects() {
  return useHealthcareMetaControllerSubjects({
    query: { select: unwrap<MetaSubjectDto> },
  });
}

/**
 * 진료 분야 그룹. 기본 검색의 칩이다.
 *
 * 그룹은 **선택 상태로 저장하지 않는다.** 칩을 누르면 하위 과목 코드들이 선택될 뿐이고,
 * 칩이 켜졌는지는 "선택된 과목 = 그룹의 과목" 인지 계산해서 안다.
 * 상태를 두 벌(그룹 / 과목) 들면 반드시 어긋난다.
 */
export function useSubjectGroups() {
  return useHealthcareMetaControllerSubjectGroups({
    query: { select: unwrap<MetaSubjectGroupDto> },
  });
}

/** 병원 등급 (TIER1~3). 종별을 묶은 것이다. */
export function useHospitalTiers() {
  return useHealthcareMetaControllerTiers({
    query: { select: unwrap<MetaHospitalTierDto> },
  });
}

/** 전문병원 지정분야 (관절·척추·심장 …). 상세 검색의 specialty 필터에 쓴다. */
export function useSpecialties() {
  return useHealthcareMetaControllerSpecialties({
    query: { select: unwrap<MetaCodeDto> },
  });
}

/** 특수진료 (방문진료·치매주치의 등). 상세 검색의 special 필터에 쓴다. */
export function useSpecials() {
  return useHealthcareMetaControllerSpecials({
    query: { select: unwrap<MetaCodeDto> },
  });
}

/** 보유장비 (CT·MRI·PET …). 상세 검색의 equipment 필터에 쓴다. */
export function useEquipments() {
  return useHealthcareMetaControllerEquipments({
    query: { select: unwrap<MetaCodeDto> },
  });
}

export type MetaAssessmentGroup = MetaAssessmentGroupDto;

/**
 * 심평원 적정성평가 분야·항목 (급성질환 > 급성기뇌졸중 …). 상세 검색 "우수 병원" 필터에 쓴다.
 * 항목 code(원본 asmGrd 번호)를 assessment 파라미터로 넘긴다.
 */
export function useAssessmentGroups() {
  return useHealthcareMetaControllerAssessments({
    query: { select: unwrap<MetaAssessmentGroupDto> },
  });
}

export function useClasses() {
  return useHealthcareMetaControllerClasses({
    query: { select: unwrap<MetaCodeDto> },
  });
}

export function useSidoRegions() {
  return useRegionControllerList(
    { level: 'sido' },
    { query: { select: unwrap<RegionDto> } },
  );
}

export function useSgguRegions(sidoCode: string | undefined) {
  return useRegionControllerList(
    { level: 'sggu', parent: sidoCode ?? '' },
    { query: { enabled: !!sidoCode, select: unwrap<RegionDto> } },
  );
}

/** 요일 라벨. 1~7 = 월~일, 8 = 공휴일 */
export const DAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일', '공휴일'];

/**
 * 오늘의 요일 번호 (1~7 = 월~일).
 *
 * 백엔드는 월요일을 1로 세는데(원본 API 가 그렇다) JS Date.getDay() 는 일요일이 0이다.
 * 그대로 쓰면 하루씩 밀린다.
 */
export function todayDay(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

/** 내일의 요일 번호. 일요일(7) 다음은 월요일(1)이다. */
export function tomorrowDay(): number {
  return (todayDay() % 7) + 1;
}

/** 'HHMM' → 'HH:MM' */
export function formatTime(value?: string): string {
  if (!value || value.length !== 4) return '';
  return `${value.slice(0, 2)}:${value.slice(2)}`;
}

/**
 * 거리 텍스트를 미터로 바꾼다. 못 읽으면 undefined.
 *
 * 원본이 제각각이다 — "100m", "100M", "200미터", "1km", 그리고 20% 는 아예 비어 있다.
 * 소요시간("도보 5분")이 거리 칸에 오기도 하는데, 그건 거리로 치지 않는다.
 */
export function distanceMeters(text?: string): number | undefined {
  if (!text) return undefined;

  const km = /([\d.]+)\s*(?:km|KM|킬로)/.exec(text);
  if (km) return Number(km[1]) * 1000;

  const m = /([\d.]+)\s*(?:m|M|미터)/.exec(text);
  if (m) return Number(m[1]);

  return undefined;
}

/** "전철역", "지하철역" 은 역 이름이 아니다. 앞 단어가 진짜 이름이다. */
const GENERIC_STATION = ['전철역', '지하철역', '역'];

/**
 * 하차지점에서 역 이름만 뽑는다. "망미역4번출구" → "망미역"
 *
 * 두 가지 함정이 있다.
 *   "동래 전철역 1번 출구"  → 그냥 뽑으면 "전철역" 이 나온다. 앞 단어를 붙여 "동래역" 으로 만든다.
 *   "2번출구", "지하상가11번출구" → 역 이름이 아예 없다. 출구 번호만 띄우면 아무 도움이 안 되므로 버린다.
 */
export function stationName(arrival?: string): string | undefined {
  if (!arrival) return undefined;

  const match = /([가-힣A-Za-z0-9]+역)/.exec(arrival);
  if (!match) return undefined;

  const name = match[1];
  if (!GENERIC_STATION.includes(name)) {
    return name;
  }

  // "동래 전철역" — 일반명사 앞의 단어가 진짜 역 이름이다.
  const before = arrival.slice(0, match.index).trim().split(/\s+/).pop();
  return before ? `${before}역` : undefined;
}

/**
 * 노선 배지 옆에 붙일 역 이름. 끝의 "역" 을 뗀다 — "④ 혜화" 는 승강장 표지판의 표기다.
 *
 * **배지가 있을 때만 뗀다.** 노선색을 못 찾아 배지가 없으면 "혜화" 만 남아 그게 역인지
 * 동네인지 알 수 없다. "역" 은 배지가 대신 말해 줄 때만 군더더기다.
 *
 * 이름 자체가 "역" 으로 끝나는 역(역곡역)은 한 글자만 떼므로 "역곡" 이 되어 문제없다.
 */
export function stationLabel(name: string, hasBadge: boolean): string {
  return hasBadge ? name.replace(/역$/, '') : name;
}

/** 헤더에 띄울 지하철역. 1km 이내(또는 도보 15분 이내)로 확인된 것만 쓴다. */
export const NEAR_STATION_METERS = 1000;

/** 도보 몇 분까지 "역 근처"로 볼 것인가. 성인 도보 15분 ≈ 1km 이다. */
const NEAR_STATION_MINUTES = 15;

/**
 * 이 역이 걸어갈 만한 거리인가.
 *
 * **거리와 소요시간이 같은 칸에 섞여 온다.** "500m" 이기도 하고 "도보 5분" 이기도 하다.
 * 미터만 보면 소요시간으로 적은 병원(원본의 20%)이 전부 탈락한다 — 강북삼성병원은
 * 서대문역 도보 5분인데도 역 이름이 안 나왔다. 명백한 역세권을 우리가 가린 셈이다.
 *
 * 둘 다 못 읽으면 false 다. 5km 떨어진 역을 헤더에 박아 "역세권" 으로 오해하게 두느니
 * 안 보여주는 게 낫다.
 */
export function isNearStation(text?: string): boolean {
  const meters = distanceMeters(text);
  if (meters !== undefined) {
    return meters <= NEAR_STATION_METERS;
  }

  const minutes = walkMinutes(text);
  return minutes !== undefined && minutes <= NEAR_STATION_MINUTES;
}

/** "도보 5분", "5분~10분 소요" → 5. 범위면 **긴 쪽**을 쓴다 — 낙관적으로 판단하지 않는다. */
export function walkMinutes(text?: string): number | undefined {
  if (!text) return undefined;

  const numbers = [...text.matchAll(/(\d+)\s*분/g)].map((m) => Number(m[1]));
  return numbers.length > 0 ? Math.max(...numbers) : undefined;
}
