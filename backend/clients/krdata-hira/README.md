# @krdata/hira

공공데이터포털(data.go.kr) **건강보험심사평가원(HIRA) API** 클라이언트.

OpenAPI 스펙(`openapi/B551182/*.json`)을 [orval](https://orval.dev)로 변환해 타입 안전한
fetch 클라이언트를 생성한다. 인증키 주입·재시도·XML 에러 처리·응답 정규화는
[`src/mutator.ts`](src/mutator.ts)가 담당한다.

```
codegen:  openapi/B551182/*.json  ──orval──▶  src/generated/**  ──▶  src/hira-client.ts (HiraClient)
```

---

## 디렉토리 구조

```
openapi/
  B551182/                          # 제공기관 코드 B551182 (심평원)
    hospInfoServicev2.json          # 병원정보서비스        (1 op)  ← 정제본(OpenAPI 3.0), orval 입력
    codeInfoService.json            # 코드정보서비스        (6 ops) ← 정제본
    hospDiagInfoService1.json       # 병원별질병정보서비스   (1 op)  ← 정제본
    exclInstHospAsmInfoService1.json# 우수기관병원평가정보서비스(1 op)← 정제본
    spclMdlrtHospInfoService1.json  # 특수진료병원정보서비스 (4 ops) ← 정제본, 전부 목록형
    hospAsmInfoService1.json        # 병원평가정보서비스     (1 op)  ← 정제본, 목록형
    mdfeeCrtrInfoService.json       # 수가기준정보서비스     (3 ops) ← 정제본, 검색형(필터 필수)
    msupCmpnMeftInfoService.json    # 의약품성분약효정보서비스(1 op)  ← 정제본, 검색형(필터 필수)
    nonPaymentDamtInfoService.json  # 비급여진료비정보서비스 (2 ops) ← 정제본, 목록형 / 병원급 이상만
    MadmDtlInfoService2.json        # 의료기관별상세정보서비스(11 ops)← 정제본
    orgin/
      MadmDtlInfoService2.8.json    # 정부포털 원본(Swagger 2.0). 손대지 않는 스냅샷.
      exclInstHospAsmInfoService1.json # 정부포털 원본(Swagger 2.0).
      spclMdlrtHospInfoService1.json   # 정부포털 원본(Swagger 2.0).
      hospAsmInfoService1.json         # 정부포털 원본(Swagger 2.0).
src/
  generated/                        # orval 산출물 (직접 수정 금지)
    hosp-info/  code-info/  hosp-diag/  excl-asm/  spcl-mdlrt/  hosp-asm/  madm-dtl/
    mdfee-crtr/  msup-cmpn/  npay-damt/
  hira-client.ts                    # 공개 파사드(HiraClient). 소비처는 이것만 쓴다.
  mutator.ts                        # ServiceKey 주입 · 버전 스왑 · 정규화
  index.ts                          # 패키지 공개 엔트리
```

**정부포털은 서비스 그룹 단위로 스펙을 개정·배포**한다. 그래서 스펙도 그룹별 파일로
나눠 두고, 한 서비스만 독립적으로 재동기화할 수 있게 한다. (예: MadmDtl 하나가 바뀌어도
hospInfo/codeInfo 파일은 건드리지 않는다.)

각 정제본은 **self-contained**다. 공유 스키마(`ResultHeader`·`PageInfo`)와 공용
파라미터는 세 파일에 복제돼 있다 — 약간 중복되지만, 그래야 파일 하나만 교체하는
독립 패치가 진짜로 성립한다.

---

## 왜 `orgin/`(원본 Swagger 2.0)을 그대로 쓰지 않는가

원본을 orval에 직접 물려도 **클라이언트는 만들어진다.** orval이 내부에서 2.0→3.0으로
변환한다. 그런데도 정제본을 따로 두는 이유는, 스펙 → 클라이언트가 거의 1:1이라
**스펙이 지저분하면 생성 코드도 그대로 지저분해지기** 때문이다. 원본을 그대로 넣고
생성해 본 실측 결과:

| 문제                 | 원본 그대로 생성                                                            | 정제본 생성                       |
| -------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| 스펙 버전            | Swagger **2.0**                                                             | OpenAPI **3.0.3**                 |
| 함수/타입 이름       | `getDtlInfo28`, `GetDtlInfo28ResponseBodyItemsItem` — `2.8`이 `28`로 뭉개짐 | `getDetailInfo`, `DetailInfoItem` |
| `serviceKey`·`_type` | 파라미터로 **노출** → 호출마다 인증키·포맷을 손으로 넘겨야 함               | 제거. mutator가 자동 주입         |
| 서비스 단위          | 파일당 서비스 1개                                                           | 그룹별로 정리                     |
| 스펙 정합성          | 원본이 깨끗한 2.0도 아님 → 변환 시 validation 경고 발생                     | 통과                              |

원본 변환 시 실제로 나오는 경고(원본에 정부포털 커스텀 필드가 섞여 있음):

```
#/ must NOT have additional properties          (swaggerOprtinVOs)
#/host must match pattern ...
#/paths/.../responses must NOT have additional properties
```

지금은 orval이 관대하게 넘어가지만 언제 에러로 바뀔지 모르는 지뢰다.

> **요약:** 원본은 "필드/데이터의 정답지"로는 정확하다. 다만 클라이언트 입력으로
> 그대로 쓰면 이름·인증키·검증에서 손해다. 정제본은 그 지저분함을 걷어낸 **정제 계층**이고,
> 그래서 존재한다.

---

## 최종 스펙(정제본)이 만들어지는 방법

정제본 `openapi/B551182/*.json`은 자동 생성물이 아니라, 두 소스를 근거로 **손으로 완성한**
OpenAPI 3.0 문서다.

1. **공공데이터포털 API 메뉴얼** — 필드 설명, 필수 여부, 예시값, 응답 구조의 근거.
2. **`orgin/`의 원본 Swagger** — 응답 **필드 목록의 정답지**. (필드가 다 들어갔는지 대조용)

원본 대비 정제 시 적용하는 것:

- OpenAPI 3.0.3로 재작성, `operationId`·스키마명을 의미 있는 이름으로 부여
- `serviceKey`·`_type` 파라미터 제거 → mutator가 주입 (`_type`은 JSON 응답으로 고정)
- `ResultHeader`·`PageInfo` 공용 스키마로 정리
- 응답 `item`은 단일 객체로 올 때가 있어 배열로 정규화(mutator) — 스키마에 명시
- 서비스 그룹별 파일 분리, 파일명은 **버전 중립**(아래 참조)

### 가이드는 틀린다 — 실측이 정답지다

가이드만 보고 스펙을 쓰면 **필드명부터 틀린다.** 수가기준정보·의약품성분약효 두 서비스를
가이드로 먼저 쓴 뒤 실응답과 대조한 결과(2026-07 실측), 가이드가 틀린 곳이 이만큼 나왔다:

| 가이드                                | 실제                            | 서비스 |
| ------------------------------------- | ------------------------------- | ------ |
| `adtstaDd` (약국만 소문자 s)          | `adtStaDd` — 셋 다 동일         | 수가   |
| 적용시작일자·수가코드가 문자열        | JSON **number** (`20260101`)    | 수가   |
| `numOfRow` (약국만 s 없음)            | **무시됨.** `numOfRows` 가 먹음 | 수가   |
| `fomnTpNm`                            | `fomnTpCdNm`                    | 성분   |
| `injcPthNm`                           | `injcPthCdNm`                   | 성분   |
| `meftDivNo` 문자열                    | JSON **number**                 | 성분   |
| `iqtyTxt` 문자열                      | number/string **혼재**          | 성분   |
| 진료수가 `unprc3`~`unprc6` = 요청변수 | 응답 필드 (표가 밀려 찍힘)      | 수가   |
| `ykiho`·`itemCd` **필수**             | **옵션** (생략하면 전건)        | 비급여 |
| 분류코드 예시 `A` · `A01`             | 실제 `1010A` · `1010A010`       | 비급여 |

같은 전력이 병원별질병정보에도 있었다(`mfrnIntrsIlnsNm1` → 실제 `mfrnIntrsIlnsCdNm1`,
`crtrYm` 이 문자열이 아니라 숫자). **새 서비스를 붙일 땐 반드시 실응답을 찍어 대조하라.**

프로브 팁: data.go.kr 은 **python-urllib 기본 User-Agent 요청을 응답 없이 물고 있다**(read timeout).
`curl` 로 찍거나 UA 헤더를 갈아 끼워라 — API 가 느린 게 아니라 UA 때문이다(1,000행도 2초).

### 이 두 서비스는 '검색형'이다 — 필터 없으면 0건

수가기준정보·의약품성분약효는 병원목록과 달리 **검색 파라미터를 하나도 안 주면 `totalCount: 0`**
이다(2026-07 실측). 에러가 아니라 조용한 0건이라 빈 결과와 구별이 안 된다. 전량은 와일드카드
`%` 로 받는다:

| 서비스   | 전건        | numOfRows=1000 기준 |
| -------- | ----------- | ------------------- |
| 약국수가 | 287         | 1콜                 |
| 한방수가 | 10,320      | 11콜                |
| 진료수가 | **423,910** | 424콜               |
| 주성분   | 60,424      | 61콜                |

`HiraClient` 의 `paginate*` 는 필터가 없으면 `%` 를 채워 넣는다([`MDFEE_ALL`](src/hira-client.ts)) —
'끝까지 훑는다'는 이름이 조용히 0건으로 끝나면 안 되기 때문이다. 단건 조회(`get*`)는 파사드가
응답을 그대로 넘기는 원칙대로 **채우지 않는다.**

> 비급여진료비(`nonPaymentDamtInfoService`)는 반대다 — 필터 없이도 전건이 나오는 목록형이라
> `%` 를 채우지 않는다. 같은 심평원이라도 서비스마다 규칙이 다르니 새로 붙일 땐 실측해라.

### 비급여진료비 — 병원급 이상만이라는 함정

비급여 자료는 의료법상 **병원급 이상만 공개 대상**이라 **의원(clCd=31)은 0건**이다(2026-07 실측:
의원 ykiho 로 조회 → 0건). 표본에 나온 종별은 01·11·21·28·29·41·92 뿐이다. 병원 79,739개 중
대부분이 의원이므로 **병원 상세에 이 가격을 붙이면 대다수 기관은 빈 화면이 된다** — 없는 게
아니라 제도상 대상이 아닌 것이므로, UI 문구를 '정보 없음'과 구분하는 편이 낫다.

두 오퍼레이션의 성격이 반대라 용도가 갈린다:

|             | 상세(`getNonPaymentDetails`)          | 요약(`getNonPaymentSummaries`)          |
| ----------- | ------------------------------------- | --------------------------------------- |
| 한 행       | 그 기관의 **실제 청구금액**(`curAmt`) | 항목별 **가격 범위**(`minPrc`~`maxPrc`) |
| 병원별 조회 | **`ykiho` 로 된다** (1콜)             | **`ykiho` 무시됨**                      |
| 항목별 조회 | **안 됨**(`npayCd`·`itemCd` 무시)     | `itemCd` 로 됨                          |
| 분류 코드   | 없음                                  | 중/소/상세분류                          |
| 전건        | 259,353                               | 187,627                                 |

**병원 상세 화면용은 상세(Dtl) + `ykiho`** 다 — 병원당 1콜로 끝난다(중앙대학교병원 666건).

### 원본과의 정합성 (drift 주의)

손으로 옮기다 보면 필드가 누락될 수 있다. 실제로 원본 대비 대조에서 아래가 빠져 있어 보완했다:

- `DetailInfoItem` → `trmtSunStart`, `trmtSunEnd` (일요일 진료시간)
- `FoodAddcInfoItem` → `trmealGrd` (등급)

새 필드/서비스를 추가할 땐 **`orgin/`의 원본과 필드 단위로 대조**하는 것을 권장한다.

---

## 버전 정책 — 마이너 버전 격리

심평원의 상세정보서비스는 마이너 버전이 오른다(`2.7` → `2.8` → …). **버전이 올라도
파일명·orval 설정·생성 디렉토리·소비 코드 같은 구조는 건드리지 않는다.** 마이너 버전은
아래 **두 곳에만** 존재한다:

- 스펙 **내부** 경로/오퍼레이션: `/MadmDtlInfoService2.8/getDtlInfo2.8`
- [`src/mutator.ts`](src/mutator.ts)의 `SPEC_DETAIL_VERSION = '2.8'` (기준값)

그래서 파일명은 **메이저까지만** 쓴다 → `MadmDtlInfoService2.json`. (원본 스냅샷은
버전 이력 보존을 위해 `orgin/MadmDtlInfoService2.8.json`처럼 실제 버전명을 유지.)

**키마다 승인된 버전이 다르다.** 포털은 서비스 버전이 오르면 기존 신청자에겐 옛 버전을
유지시키므로, `2.7`만 승인된 키로 `2.8`을 부르면 403이다(키가 아니라 경로가 틀린 것).
스펙을 다시 생성하지 않고 런타임에 경로만 맞추려면:

```ts
new HiraClient({ serviceKey, detailVersion: '2.7' }); // mutator가 경로의 2.8 → 2.7 스왑
```

---

## 사용 (소비 측)

소비처는 생성 코드를 직접 부르지 말고 **파사드([`HiraClient`](src/hira-client.ts))만** 쓴다.
그래야 스펙을 분할·재생성해도 소비처가 안 깨진다.

```ts
import { HiraClient } from '@krdata/hira';

const hira = new HiraClient({ serviceKey: process.env.DATA_GO_KR_KEY });
const detail = await hira.getDetailInfo(ykiho); // (ykiho, params?)
```

---

## 재생성 / 서비스 추가·동기화

```bash
pnpm --filter @krdata/hira codegen   # openapi/B551182/*.json → src/generated/**
pnpm --filter @krdata/hira build     # 타입 검사 + dist
```

- **필드/스펙 수정:** `openapi/B551182/<service>.json`을 고치고 codegen. (생성물은 직접 수정 금지)
- **새 서비스 추가:** ① 정부포털 원본을 `openapi/B551182/orgin/`에 받아 두고 ② 메뉴얼+원본을
  근거로 정제본 `openapi/B551182/<service>.json`을 작성 ③ [`orval.config.ts`](orval.config.ts)에
  타깃 추가 ④ [`src/hira-client.ts`](src/hira-client.ts)에 파사드 메서드 추가 ⑤ **실응답을 찍어
  필드명·타입을 대조하고 스펙을 고친 뒤 재생성**(위 '가이드는 틀린다' 참조 — ⑤를 건너뛰면
  가이드의 오타가 그대로 타입이 된다).
- **버전 업(마이너):** 대부분 `detailVersion` 설정으로 끝난다. 스펙 자체를 새 버전으로
  갱신하려면 정제본 내부 버전 문자열과 `SPEC_DETAIL_VERSION`만 교체 후 codegen.

> 서버 문서(Swagger)에도 이 스펙의 `components.schemas`가 `Hira` 접두사로 병합된다.
> 스펙 파일 경로를 바꾸면 [`apps/hansapp-api/src/krdata-schemas.ts`](../../apps/hansapp-api/src/krdata-schemas.ts)의
> `SPECS` 목록도 함께 갱신할 것.
