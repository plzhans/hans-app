import { Injectable } from '@nestjs/common';
import { HOSPITAL_TIERS, SUBJECT_GROUPS, TIER_NAMES } from '@hansapi/data/seed';
import {
  SUBWAY_STATIONS,
  SUBWAY_STATION_SOURCE,
} from '@hansapi/data/reference';
import {
  FALLBACK_LANG,
  pickLangName,
  type SupportedLang,
} from '@hansapi/common';

import { HealthcareCodeCache, codeName } from './healthcare-code.cache';

/** 코드 항목 */
export interface MetaCode {
  code: string;
  name: string;
  description?: string;
}

/**
 * 진료 분야 그룹. 기본 검색의 칩이다.
 *
 * 원본에는 없는 **우리 분류**다. 47개 진료과목은 행정·수가 체계라 환자가 읽는 언어가 아니다.
 * 클라이언트는 그룹을 고른 뒤 subjects 를 펼쳐서 검색의 subject 파라미터로 넘긴다 —
 * 그래서 검색 API 는 그룹이라는 개념을 몰라도 된다. 분류가 바뀌어도 검색은 안 바뀐다.
 */
export interface MetaSubjectGroup {
  code: string;
  name: string;
  subjects: MetaCode[];
}

/** 병원 등급(TIER1~3). 종별의 상위 묶음이다. */
export interface MetaHospitalTier {
  code: string;
  name: string;
  description: string;
  classes: MetaCode[];
}

/**
 * 지하철역 한 건.
 *
 * **언어를 골라 주지 않고 다 담는다.** 다른 meta 항목과 다른 점이다 —
 * 이건 목록이 아니라 **사전**이라, 클라이언트가 통째로 받아 맵으로 들고 화면에 역이 나올 때마다
 * 조회한다. 언어별로 내려주면 언어를 바꿀 때마다 사전을 다시 받아야 한다.
 *
 * **code 도 없다.** 원본의 역코드는 노선마다 달라(환승역은 코드가 여러 개다) 역을 식별하지
 * 못한다. 병원 교통정보(`transport.subway[].arrival`)도 역을 코드가 아니라 **한국어 이름**으로만
 * 가리킨다. 그래서 이름이 곧 키다.
 */
export interface MetaSubwayStation {
  /**
   * 한국어 역명. **이게 키다.**
   *
   * '역' 접미사와 부역명 괄호는 이미 떼어져 있다 ('총신대입구(이수)' → '총신대입구').
   */
  ko: string;

  /** 영문 역명. 원본이 전 역에 주므로 사실상 항상 있다. */
  en?: string;

  /**
   * 일문 역명. **대구·대전·인천공항 역들은 비어 있다** — 원본이 주지 않는다.
   *
   * 빈 값은 내려보내지 않는다(필드가 생략된다). 화면은 ko 로 폴백하면 된다.
   */
  ja?: string;

  /** 이 역을 지나는 노선. '1호선', '신분당선' */
  lines: string[];
}

/**
 * 지하철역 응답의 포맷 버전. **응답 모양을 바꾸면 이 숫자를 올려라.**
 *
 * ETag 에 들어간다. 안 올리면, 이미 캐시를 들고 있는 클라이언트가 재검증에서 304 를 받아
 * 옛 모양을 계속 쓴다 — 원본 엑셀이 갱신될 때까지(연 1~2회) 아무도 못 고친다.
 */
const SUBWAY_RESPONSE_FORMAT = 1;

/** 코드 종류. 원본 코드가 아니라 **우리 코드**다. */
export const META_CODE_TYPES = [
  'subject',
  'class',
  'equipment',
  'severe',
  'specialty',
  'special',
] as const;

export type MetaCodeType = (typeof META_CODE_TYPES)[number];

/**
 * 참조 데이터(meta) 조회.
 *
 * 저장은 healthcare_code 한 테이블에 tp 로 구분해 담지만, **API 는 종류별로 나눠서 낸다** —
 * 대외 사용자가 `?tp=subject` 같은 우리 내부 사정을 알 필요가 없다.
 * 나중에 종류별로 테이블을 떼어내도 이 서비스 안쪽만 바뀌고 API 는 그대로다.
 *
 * 원본 매핑(hira_cd/nmc_cd)은 응답에 내지 않는다. 우리 내부 사정이다.
 */
@Injectable()
export class HealthcareMetaService {
  constructor(private readonly codes: HealthcareCodeCache) {}

  // 아래 조회들은 **동기다.** 부팅 때 올려둔 코드표 캐시에서 읽어 DB 왕복이 없다.
  listCodes(tp: MetaCodeType, lang: SupportedLang = FALLBACK_LANG): MetaCode[] {
    // 표시명은 title 계열이다.
    return this.codes.list(tp).map((entry) => ({
      code: entry.code,
      name: codeName(entry, lang),
      description: entry.cmt ?? undefined,
    }));
  }

  /**
   * 진료 분야 그룹. 시드의 코드 목록에 **이름을 붙여** 내려준다.
   *
   * 시드에는 코드만 있다(['OS','NS',…]). 이름은 healthcare_code 가 갖는다 —
   * 이름을 두 곳에 두면 반드시 어긋난다.
   */
  listSubjectGroups(lang: SupportedLang = FALLBACK_LANG): MetaSubjectGroup[] {
    const names = this.codeNames('subject', lang);

    return SUBJECT_GROUPS.map((group) => ({
      code: group.code,
      name: pickLangName(group.name, lang),
      subjects: group.subjects.map((cd) => ({
        code: cd,
        name: names.get(cd) ?? cd,
      })),
    }));
  }

  /**
   * 병원 등급. 종별을 TIER1~3 으로 묶은 것이다.
   *
   * 이름은 TIER_NAMES 가 유일한 출처다 — HOSPITAL_TIERS 에는 이름을 두지 않는다.
   * 요양·정신은 등급이 아니라 성격이라 HOSPITAL_TIERS 에 없는데, 이름은 다섯 개 다 필요해서다.
   */
  listHospitalTiers(lang: SupportedLang = FALLBACK_LANG): MetaHospitalTier[] {
    const names = this.codeNames('class', lang);

    return HOSPITAL_TIERS.map((tier) => ({
      code: tier.code,
      name: pickLangName(TIER_NAMES[tier.code], lang),
      description: pickLangName(tier.cmt, lang),
      classes: tier.classes.map((cd) => ({
        code: cd,
        name: names.get(cd) ?? cd,
      })),
    }));
  }

  /**
   * 지하철역 목록 전량.
   *
   * **DB 를 타지 않는다. 그래서 async 가 아니다.** 목록은 코드가 들고 있다
   * (`@hansapi/data/reference`). 원본 코드와의 매핑도, 병원 테이블의 FK 도 없어서 테이블로
   * 둘 이유가 없고, 메모리 조회(17ns)가 DB 왕복(수 ms)보다 빠르다.
   *
   * **lang 을 받지 않는다.** 세 언어를 다 담아 내린다 — 클라이언트가 통째로 받아 맵으로 들고
   * 찾아 바꾸는 데 쓰기 때문이다. 응답이 언어에 따르지 않으니 캐시도 언어별로 쪼개지지 않는다.
   *
   * 원본 버전은 subwayStationVersion 으로 따로 준다 — 본문과 ETag 양쪽에 쓴다.
   *
   * 번역이 없는 칸은 필드를 아예 빼서 내린다(빈 문자열이 아니다). 호출부가 ko 로 폴백한다.
   */
  listSubwayStations(): MetaSubwayStation[] {
    return SUBWAY_STATIONS.map((station) => ({
      ko: station.ko,
      ...(station.en ? { en: station.en } : {}),
      ...(station.ja ? { ja: station.ja } : {}),
      lines: station.lines,
    }));
  }

  /** 원본 데이터셋의 배포일자. 'YYYYMMDD' — 이 값이 그대로면 역 목록도 그대로다. */
  subwayStationVersion(): string {
    return SUBWAY_STATION_SOURCE.version;
  }

  /**
   * 지하철역 목록의 ETag.
   *
   * **원본 데이터 버전만으로 만들면 안 된다.** 응답의 *모양*을 바꿔도(필드 추가·이름 변경)
   * 엑셀은 그대로라 ETag 가 안 바뀌고, 그러면 이미 캐시를 들고 있는 클라이언트는 재검증에서
   * 304 를 받아 **옛 모양을 영원히 쓰게 된다.** 원본이 갱신될 때까지 — 연 1~2회다.
   *
   * 그래서 응답 포맷 버전을 함께 넣는다. **응답 모양을 바꾸면 SUBWAY_RESPONSE_FORMAT 을 올려라.**
   */
  subwayStationEtag(): string {
    return `"${SUBWAY_RESPONSE_FORMAT}-${SUBWAY_STATION_SOURCE.version}"`;
  }

  private codeNames(
    tp: MetaCodeType,
    lang: SupportedLang,
  ): Map<string, string> {
    return new Map(
      this.codes.list(tp).map((entry) => [entry.code, codeName(entry, lang)]),
    );
  }
}
