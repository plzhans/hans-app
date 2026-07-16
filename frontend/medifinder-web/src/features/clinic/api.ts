import {
  useHealthcareHospitalControllerSearch,
  useHealthcareHospitalControllerGet,
} from '@/shared/api/generated/react/healthcare/healthcare';
import {
  useHealthcareMetaControllerSubjects,
  useHealthcareMetaControllerSubjectGroups,
  useHealthcareMetaControllerTiers,
  useHealthcareMetaControllerClasses,
} from '@/shared/api/generated/react/healthcare-meta/healthcare-meta';
// 지역은 /healthcare/meta/regions 가 아니라 /address/regions 다(영문 주소 변환과 같은 주소 그룹).
// region_code 는 도메인 무관이라(병원·학교·약국이 같이 쓴다) 헬스케어 밑에서 빠졌다.
import { useRegionControllerList } from '@/shared/api/generated/react/address/address';
import type {
  HospitalSummaryDto,
  HospitalDetailDto,
  MetaCodeDto,
  MetaHospitalTierDto,
  MetaSubjectGroupDto,
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

  /** 진료과목 코드 (IM, PED …) */
  subject?: string;

  /** 병원명 부분 일치 */
  name?: string;

  /** 응급실 운영 병원만 */
  emergency?: boolean;

  /** 달빛어린이병원만 (야간·휴일 소아진료) */
  baby?: boolean;
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
      name: params.name || undefined,
      emergency: params.emergency ? 'true' : undefined,
      baby: params.baby ? 'true' : undefined,
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

/** GET /healthcare/hospitals/{id} — 통합 병원 상세 */
export function useHospitalDetail(id: string | undefined) {
  return useHealthcareHospitalControllerGet(Number(id ?? 0), {
    query: { enabled: !!id },
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
export function useSubjects() {
  return useHealthcareMetaControllerSubjects({
    query: { select: unwrap<MetaCodeDto> },
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
