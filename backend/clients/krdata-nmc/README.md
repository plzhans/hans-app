# @krdata/nmc

공공데이터포털(data.go.kr) **국립중앙의료원(NMC) 전국 병·의원 찾기 서비스** 클라이언트.

OpenAPI 스펙(`openapi/nmc.json`)을 [orval](https://orval.dev)로 변환해 타입 안전한
fetch 클라이언트를 생성한다. 인증키 주입·재시도·XML 에러 처리·응답 정규화는
[`src/mutator.ts`](src/mutator.ts) + `@krdata/core`가 담당한다.

```
codegen:  openapi/nmc.json  ──orval──▶  src/generated/**  ──▶  src/nmc-client.ts (NmcClient)
```

- 제공기관 코드: **B552657**
- 서비스: `HsptlAsembySearchService`(병·의원 찾기, 6개) + `CodeMast`(코드마스터, 1개)
- 출처: NIA OpenAPI 활용 가이드 (SC-IFT-01-02, 서비스 버전 1.1, 2017-02-01) —
  [data.go.kr/15000736](https://www.data.go.kr/data/15000736/openapi.do)

---

## 디렉토리 구조

```
openapi/
  nmc.json                # 정제본(OpenAPI 3.0.3), orval 입력. 스펙의 출처·규칙은 info.description 에 기록.
src/
  generated/              # orval 산출물 (직접 수정 금지)
    nmc.ts  model/
  nmc-client.ts           # 공개 파사드(NmcClient). 소비처는 이것만 쓴다.
  address.ts              # NMC 전용: 주소 문자열 → 시도·시군구 파싱 (아래 참조)
  mutator.ts              # ServiceKey 주입 · 정규화
  index.ts                # 패키지 공개 엔트리
```

> **hira(`@krdata/hira`)와 다른 점**
>
> - NMC는 서비스가 적어(사실상 한 덩어리) **그룹별 파일 분할을 하지 않는다** — 단일 `nmc.json`.
> - 마이너 버전 갱신 이슈가 없어 **버전 스왑 장치(detailVersion)가 없다.**
> - 대신 NMC만의 **지역 파싱(address.ts)** 이 있다. (HIRA는 지역을 코드로 준다)

---

## 스펙(정제본)은 어떻게 만들어졌나

`openapi/nmc.json`은 자동 생성물이 아니라, **NIA 활용 가이드(메뉴얼) + 실제 응답 관찰**을
근거로 손으로 완성한 OpenAPI 3.0 문서다. 출처·운영제약·설계규칙은 스펙의 `info.description`에
그대로 적어 두었다. 핵심 규칙:

- **`ServiceKey`·`_type`을 스펙에 정의하지 않는다.** mutator가 모든 요청에 주입한다.
  - `ServiceKey`를 스펙에 넣으면 생성 코드가 `URLSearchParams`로 재인코딩 → 이미 인코딩된
    발급키가 **이중 인코딩되어 401**이 난다. (그래서 반드시 뺀다)
  - 가이드는 XML 기준이지만 `_type=json`을 주면 JSON으로 응답한다. mutator가 항상 주입.
- **응답 스키마는 '이상적인' 형태로 정의**한다. 실제 응답에서 `items`가 빈 문자열로 오거나
  `item`이 단일 객체로 오는 경우는 `@krdata/core`의 `normalizeKrDataResponse`가 배열로 보정한다.
- 가이드 명세에 없지만 **실제 응답에 나오는 필드(`dutyLvkl` 등)도 포함**한다.

> data.go.kr 원본은 Swagger 2.0으로 내려오지만, 그대로 쓰면 이름이 뭉개지고(`getXxx28` 등)
> `ServiceKey`/`_type`가 파라미터로 새며 validation 경고가 난다. 그래서 OpenAPI 3.0으로
> 정제한다. (원본 2.0을 그대로 쓰면 안 되는 배경은 [`@krdata/hira`의 README](../krdata-hira/README.md) 참조)
> NMC는 현재 원본 스냅샷을 따로 보관하지 않는다 — 가이드(위 출처 링크)가 기준이다.

---

## NMC 전용 — 지역 파싱 (`src/address.ts`)

NMC는 **지역을 코드로 주지 않는다.** 병원 item의 지역 정보는 `dutyAddr`(전체 주소 문자열)과
우편번호뿐이고, 검색 파라미터(`Q0`/`Q1`)도 코드가 아니라 주소 문자열의 부분 일치다. 그래서
지역으로 검색·집계하려면 주소에서 뽑아내는 수밖에 없다.

`NmcClient`는 주소를 가진 item에 시도·시군구(`sidoNm`/`sgguNm`)를 **계산해 채워서** 반환한다
(`fillRegion` → `parseNmcRegion`). 축약 표기(`서울` → `서울특별시`)도 정식 명칭으로 정규화한다.

> 실측(2026-07, 78,631건): 시도 24종 → 정규화 후 17종(미추출 0), 시군구 237종(미추출은
> 세종 등 시군구가 없는 정상 케이스). 주소 규칙은 기관마다 달라 공용(`@krdata/core`)에
> 올리지 않고 NMC 안에 둔다.

---

## 운영 제약

- **초당 최대 30 TPS.** 병렬 호출은 호출부에서 제어할 것.
- **데이터 갱신주기 일 1회** — 배치는 하루 한 번이면 충분.
- 가이드상 최대 메시지 4000 bytes로 적혀 있으나 실제로는 지켜지지 않는다. `numOfRows`를
  크게 주면 수십 MB 응답도 그대로 내려온다.

---

## 사용 (소비 측)

소비처는 생성 코드를 직접 부르지 말고 **파사드([`NmcClient`](src/nmc-client.ts))만** 쓴다.

```ts
import { NmcClient } from '@krdata/nmc';

const nmc = new NmcClient({ serviceKey: process.env.DATA_GO_KR_KEY });

const list = await nmc.getHospitalList({ Q0: '서울특별시', numOfRows: 100 });
const basis = await nmc.getHospitalBasisInfo(hpid); // (hpid, params?)
// list.response.body.items.item 의 각 원소에는 sidoNm/sgguNm 이 계산돼 채워져 있다.
```

제공 메서드: `getHospitalList` · `getHospitalLocations` · `getHospitalBasisInfo` ·
`getBabyHospitalList` · `getBabyHospitalLocations` · `getHospitalFullDown` · `getCodeList`.

---

## 재생성 / 스펙 수정

```bash
pnpm --filter @krdata/nmc codegen   # openapi/nmc.json → src/generated/**
pnpm --filter @krdata/nmc build     # 타입 검사 + dist
```

- **필드/스펙 수정:** `openapi/nmc.json`을 고치고 codegen. (생성물은 직접 수정 금지)
- 실제 응답에만 있고 가이드에 없는 필드를 발견하면 스펙에 추가하고 근거를 `description`에 남긴다.

> 서버 문서(Swagger)에도 이 스펙의 `components.schemas`가 `Nmc` 접두사로 병합된다.
> 스펙 파일 경로를 바꾸면 [`apps/hansapi-server/src/krdata-schemas.ts`](../../apps/hansapi-server/src/krdata-schemas.ts)의
> `SPECS` 목록도 함께 갱신할 것.
