/**
 * nmc-hospital 마스터 모델 + LangText 사용 예시 (설계 참고용).
 * 실제 패키지 코드가 아니라 구조/사용 흐름을 보여주기 위한 스케치다.
 */
import { LangText, langText, withLang, mergeLangs } from '@hansapi/common';

// ── 주소 블록 (언어별로 통째 담는 구조) ──
interface AddressParts {
  sido: string; // 시도
  sigungu: string; // 시군구
  dong: string; // 읍면동
  detail: string; // 상세주소
}

// ── 마스터 모델 ──
// 다국어 필드는 LangText 로, 코드/좌표/전화는 원시값으로.
interface NmcHospital {
  id: string; // hpid
  name: LangText; // duty_name
  category: string; // duty_div (코드) — 분류명은 코드북

  texts: {
    description: LangText; // duty_inf
    notice: LangText; // duty_etc
  };

  contact: {
    tel: string; // duty_tel1
    emergencyTel: string; // duty_tel3
  };

  location: {
    address: LangText<AddressParts>; // duty_addr (언어별 주소 블록)
    zipcode: string; // post_cdn1 + post_cdn2 (문자열, 앞자리 0 보존)
    lat: number; // wgs84_lat
    lon: number; // wgs84_lon
  };

  emergency: {
    available: boolean; // duty_eryn
    class: string; // duty_emcls (코드) — 코드명은 코드북
  };
}

// ─────────────────────────────────────────────
// 1) DB 원본 행 (기본 테이블: 한국어 데이터)
// ─────────────────────────────────────────────
const row = {
  hpid: 'A1100001',
  dutyName: '미소의원',
  dutyDiv: 'C',
  dutyInf: '내과 전문 의원입니다.',
  dutyEtc: '점심시간 12:30~13:30 휴진',
  dutyTel1: '02-1234-5678',
  dutyTel3: '',
  dutyAddr: {
    sido: '서울특별시',
    sigungu: '강남구',
    dong: '역삼동',
    detail: '테헤란로 1',
  },
  postCdn1: '06',
  postCdn2: '168',
  wgs84Lat: 37.5009,
  wgs84Lon: 127.0364,
  dutyEryn: '2',
  dutyEmcls: '',
};

// ─────────────────────────────────────────────
// 2) 번역 테이블 행 (별도 i18n 테이블에서 로드)
//    - 어떤 언어가 올지 미리 정하지 않음. 있는 만큼만.
// ─────────────────────────────────────────────
const nameI18n = [
  { lang: 'en', value: 'Miso Clinic' },
  { lang: 'ja', value: 'ミソ医院' },
];
const addrI18n = [
  {
    lang: 'en',
    value: {
      sido: 'Seoul',
      sigungu: 'Gangnam-gu',
      dong: 'Yeoksam-dong',
      detail: '1 Teheran-ro',
    },
  },
];

// ─────────────────────────────────────────────
// 3) 조립 — langText 로 시작, withLang/mergeLangs 로 번역을 얹음
// ─────────────────────────────────────────────
let name = langText('ko', row.dutyName); // { ko: "미소의원" }
for (const t of nameI18n) name = withLang(name, t.lang, t.value); // + en, ja

let address = langText('ko', row.dutyAddr); // { ko: {...} }
for (const t of addrI18n) address = withLang(address, t.lang, t.value); // + en

const hospital: NmcHospital = {
  id: row.hpid,
  name,
  category: row.dutyDiv,
  texts: {
    description: langText('ko', row.dutyInf), // 번역 없으면 ko 만
    notice: langText('ko', row.dutyEtc),
  },
  contact: {
    tel: row.dutyTel1,
    emergencyTel: row.dutyTel3,
  },
  location: {
    address,
    zipcode: `${row.postCdn1}${row.postCdn2}`, // "06168"
    lat: row.wgs84Lat,
    lon: row.wgs84Lon,
  },
  emergency: {
    available: row.dutyEryn === '1',
    class: row.dutyEmcls,
  },
};

// ─────────────────────────────────────────────
// 4) 직렬화 결과 (API 응답 / 캐시) — 있는 언어만 flat 하게
// ─────────────────────────────────────────────
JSON.stringify(hospital);
/*
{
  "id": "A1100001",
  "name": { "ko": "미소의원", "en": "Miso Clinic", "ja": "ミソ医院" },
  "category": "C",
  "texts": {
    "description": { "ko": "내과 전문 의원입니다." },
    "notice": { "ko": "점심시간 12:30~13:30 휴진" }
  },
  "contact": { "tel": "02-1234-5678", "emergencyTel": "" },
  "location": {
    "address": {
      "ko": { "sido": "서울특별시", "sigungu": "강남구", "dong": "역삼동", "detail": "테헤란로 1" },
      "en": { "sido": "Seoul", "sigungu": "Gangnam-gu", "dong": "Yeoksam-dong", "detail": "1 Teheran-ro" }
    },
    "zipcode": "06168",
    "lat": 37.5009,
    "lon": 127.0364
  },
  "emergency": { "available": false, "class": "" }
}
*/

// 한 번에 병합하는 축약형
const name2 = mergeLangs(langText('ko', '미소의원'), {
  en: 'Miso Clinic',
  ja: 'ミソ医院',
});

export { NmcHospital, AddressParts, hospital, name2 };
