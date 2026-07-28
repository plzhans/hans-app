# 병원 검색 인덱스 설계 (`healthcare_hospital`)

현재 MySQL(`healthcare_hospital` + 자식 테이블) 기반 검색을 Elasticsearch 로 옮기기 위한
색인 설계다. 한 병원 = 한 문서. 원천은 `HealthcareHospitalRepository.buildWhere()` 의
필터 축과 `HospitalSummary`/`HospitalDetail` 응답 모양이다.

> **정본(source of truth)은 코드로 옮겼다.** 실제로 ES 에 적용되는 두 템플릿 JSON 은
> **`packages/hansapp-search/elasticsearch/`** 에 있고, CLI `hansapp-cli es schema import` 가 그걸 올린다.
> 이 폴더는 이제 **설계 문서 + 샘플**이다(아래 설명·구조 근거는 유효하나, 파일 수정은 패키지 쪽에서).

- (정본) `packages/hansapp-search/elasticsearch/component-template.hansapp-analysis.json` — **공유 settings(분석기)**
- (정본) `packages/hansapp-search/elasticsearch/index-template.healthcare_hospital.json` — **병원 인덱스 매핑 + 샤드/레플리카**
- `hospital.sample-document.json` — 실제 데이터 한 건 예시(강북삼성병원)
- `hospital.search-example.json` — 다국어 이름 + 필터 + 거리순 정렬 쿼리 예시

색인/매핑은 Docker 이미지(`../Dockerfile`)에 넣지 않는다(이미지는 ES 버전 + 형태소 플러그인만).
정본 템플릿은 `@hansapp/search` 가 소유하고 CLI 가 ES 에 올린다.

## CLI 로 적용·관리

```sh
hansapp-cli es schema import        # 정본 템플릿 + healthcare_hospital-v1 + alias 적용(멱등)
hansapp-cli es schema status        # alias→인덱스·템플릿·문서 수
hansapp-cli es hospital sync        # 활성 병원 전량 색인(alias 인덱스에 in-place)
hansapp-cli es hospital sync-one 22306
hansapp-cli es schema export /tmp/es-dump   # 살아있는 ES 상태 덤프
```

## settings 는 공유, mapping 은 인덱스별 — 왜 파일을 둘로 나눴나

ES 는 `settings`·`mappings` 를 **둘 다 인덱스마다** 저장한다(전역 공유 객체는 없다). 대신 재사용은
**템플릿**으로 한다:

- **컴포넌트 템플릿** `hansapp-analysis` — 여러 인덱스가 공유하는 `settings.analysis`(nori/kuromoji/
  smartcn/icu 분석기)만 담는다. 병원 말고 약국·의사 인덱스가 생겨도 이 한 벌을 물려 쓴다.
- **인덱스 템플릿** `healthcare_hospital` — `composed_of: ["hansapp-analysis"]` 로 분석기를 끌어오고, **이 인덱스에만
  해당하는 매핑과 샤드/레플리카**만 얹는다. `healthcare_hospital-v*` 패턴이라 버전 인덱스(`healthcare_hospital-v1`,
  `healthcare_hospital-v2` …)에 자동 적용된다.

### alias 로 버전을 감춘다 — 앱은 `healthcare_hospital` 만 본다

**앱은 실제 인덱스 이름을 절대 모른다.** 항상 alias `healthcare_hospital` 로만 읽고, 뒤에서 `healthcare_hospital-v1` →
`healthcare_hospital-v2` 로 갈아끼운다. 매핑을 바꿔야 하면 v1 을 **그대로 둔 채** v2 를 새로 만들어 채우고,
alias 만 원자적으로 옮긴다. 문제가 생기면 alias 를 v1 로 되돌리면 끝(v1 이 살아 있으니 즉시 롤백).

```sh
# 1) 공유 분석기(컴포넌트 템플릿)
curl -XPUT localhost:9200/_component_template/hansapp-analysis \
  -H 'Content-Type: application/json' --data-binary @component-template.hansapp-analysis.json

# 2) 병원 인덱스 템플릿(위 컴포넌트를 조합)
curl -XPUT localhost:9200/_index_template/healthcare_hospital \
  -H 'Content-Type: application/json' --data-binary @index-template.healthcare_hospital.json

# 3) 최초: v1 생성(패턴에 걸려 템플릿 자동 적용) → 데이터 색인 → alias 연결
curl -XPUT localhost:9200/healthcare_hospital-v1
#    (여기서 healthcare_hospital-v1 에 bulk 색인)
curl -XPOST localhost:9200/_aliases -H 'Content-Type: application/json' -d \
  '{"actions":[{"add":{"index":"healthcare_hospital-v1","alias":"healthcare_hospital"}}]}'
```

매핑을 바꿀 때(v1 → v2 무중단 교체):

```sh
# a) v2 생성(바뀐 템플릿이 자동 적용) → v2 에 전량 재색인. v1 은 그대로 서비스 중.
curl -XPUT localhost:9200/healthcare_hospital-v2
#    (healthcare_hospital-v2 에 bulk 색인 — reindex API 를 써도 되지만, 소스가 DB 라 보통 앱이 다시 밀어 넣는다)

# b) 준비되면 alias 를 한 번의 호출로 원자 교체 — 끊기는 순간이 없다.
curl -XPOST localhost:9200/_aliases -H 'Content-Type: application/json' -d '{
  "actions": [
    { "remove": { "index": "healthcare_hospital-v1", "alias": "healthcare_hospital" } },
    { "add":    { "index": "healthcare_hospital-v2", "alias": "healthcare_hospital" } }
  ]
}'

# c) 문제 발견 시 롤백 — v1 이 그대로 있으니 반대로 한 번 더.
#    안정화된 뒤에야 v1 을 지운다:  curl -XDELETE localhost:9200/healthcare_hospital-v1
```

> `healthcare_hospital` 은 **항상 alias 로만** 존재한다 — 그 이름으로 인덱스를 만들지 않는다(그래서 템플릿 패턴을
> `healthcare_hospital-v*` 로 좁혀 alias 이름과 안 겹치게 했다). 데이터만 새로 굽는 정기 재빌드까지 버전을 올리기
> 싫으면 `healthcare_hospital-v2`, `healthcare_hospital-v3` 대신 `healthcare_hospital-v1-20260721` 처럼 접미사를 붙여도 패턴에 걸린다.

---

## 큰 그림 — 세 가지 결정

1. **상세까지 전부 담는다.** 요약(목록)뿐 아니라 진료시간·인력·병상·평가·소개글까지 한 문서에
   넣는다. 상세 조회도 ES 한 번으로 끝낼 수 있어 DB+Redis 경로를 대체할 수 있다.
   대신 검색 축이 아닌 상세 필드는 `enabled:false` / `index:false` 로 **역인덱스에서 빼고 `_source` 로만**
   내보내 색인을 가볍게 유지한다.

2. **코드값은 코드만 저장하고, 이름은 붙이지 않는다.** 종별·진료과목·지역 등의 표시 이름은
   지금처럼 인메모리 캐시(`HealthcareCodeCache`·`RegionCache`)가 붙인다. 코드 번역은 잠정값이라
   자주 고쳐지는데, 이름을 문서에 박으면 번역 한 줄 고칠 때마다 8만 건 재색인이 필요하다.
   ES 엔 안정적인 코드(keyword)만 넣는다.

3. **지오(위경도) 검색을 넣는다.** `lat`/`lon` 을 `geo_point` 로 색인해 "내 근처 병원"·거리순 정렬을
   지원한다. 지금 DB 검색엔 없는 기능이고, ES 도입의 핵심 이점이다.

---

## 다국어 텍스트 — 이름은 모든 언어, 주소는 한/영

지원 언어는 `ko / en / ja / zh` (앱 `SUPPORTED_LANGS`). 한국어는 본체, en/ja/zh 는
`healthcare_hospital_i18n` 에서 온다.

### 검색 텍스트를 **가중치 계층별로 `search` 오브젝트에 모은다**

검색 대상 텍스트를 **하나의 바구니**가 아니라 **가중치 계층별 바구니 3개**로 나눠 `search` 오브젝트에
`copy_to` 한다. 검색은 이 계층들만 훑고, 계층 사이에 boost 로 순위를 준다 —
**이름 매칭이 위치·그외 매칭보다 위로 온다.**

```
search.name.<lang>   ← name.<lang>                         boost ^5  (이름)
search.place.<lang>  ← subway.stations + addr + emdong_nm   boost ^3  (위치)
search.etc.<lang>    ← intro + notice + directions          boost ^1  (그외)
```

검색 쿼리는 `search.*` 계층 × 언어만 나열한다(개별 필드 수십 개를 안 적는다):

```
multi_match(best_fields):
  search.name.ko^5  search.place.ko^3  search.etc.ko^1   (+ en·ja·zh)
```

- **왜 한 바구니가 아니라 계층인가.** 이름+역명을 한 필드에 다 `copy_to` 하면 쿼리는 간단하지만,
  바구니 안에서 이름/역명 구분이 사라져 **가중치를 못 준다** — "서대문병원"(이름 매칭)과 "서대문역 근처
  딴 병원"(위치 매칭)이 같은 점수가 된다. 계층으로 나누면 **계층 간 가중치**를 주면서도 쿼리는
  `search.*` 몇 개로 단순하다. 계층 **안**에서는 무게가 같다(이름끼리 동등 — 보통 이게 맞다).
- 언어별로 **맞는 형태소 분석기**를 쓴다 — ko=nori, ja=kuromoji, zh=smartcn, en/로마자=icu.
  각 계층 leaf 가 자기 언어 analyzer 를 갖는다. "峨山" 은 `search.name.ja`·`search.name.zh` 에서,
  "서울성모" 는 `search.name.ko`(nori 복합어 분해)에서 걸린다.
- `search.name` 에 `index_prefixes` 로 **접두어(타이핑 중 자동완성)** 를 만들어 둔다.
- **진료과목은 검색 텍스트에 넣지 않는다.** subject 는 코드(`subject_cds`) 필터로 거른다 —
  프론트가 메타에서 과목명→코드로 펴서 넘긴다. 검색창 자유입력 대상이 아니라 필터칩이라, 텍스트로
  넣어 재색인 부담(코드 번역 잠정값)을 질 이유가 없다.

### 개별 필드는 그대로 독립적으로 쓴다

`copy_to` 는 값을 **옮기는 게 아니라 색인 때 복사**한다. 원본 필드는 그대로 남아 각자 독립적으로 쓴다:

| 용도                           | 대상                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| 통합 관련도 검색(검색창)       | `search.*` (계층 boost)                                         |
| 정확 일치 · 필터 · 정렬 · 집계 | 개별 keyword (`name.ko`, `location.region_cd`, `subject_cds` …) |
| 표시(`_source`)                | 개별 필드 (`search.*` 는 색인 전용이라 `_source` 에 안 나옴)    |

`intro`·`notice`·`directions` 는 개별 필드로는 `index:false`(표시 전용)지만, `copy_to` 로 값이
`search.etc` 에 담겨 **낮은 가중치로만 검색된다** — 긴 본문이 이름 검색을 오염시키지 않는다.

### 홈페이지는 도메인으로 정규화해 검색한다

`homepage` 는 `domain` analyzer 가 걸린 `text` 다. 색인·검색 양쪽에서 **스킴(`http://`)과 앞의
`www.` 를 떼고 소문자화**해, 원본이 `http://www.kbsmc.co.kr` 여도 다음이 모두 매칭된다:

```
match homepage:
  "www.kbsmc.co.kr"  |  "kbsmc.co.kr"  |  "http://www.kbsmc.co.kr"  →  모두 hit
```

`_source` 에는 **원본 URL 이 그대로** 남고(표시용), 정규화된 토큰(`kbsmc.co.kr`)은 역인덱스에만 있다.
`homepage.kw` 로 원본 전체를 정확 일치·집계(중복 홈페이지로 병원 dedup 등)할 수 있다.
정규화는 스킴·`www`·대소문자·앞뒤 공백·끝 슬래시까지 잡지만, **경로(`/main`)는 남긴다** — 도메인만으로
검색하려면 색인 파이프라인에서 경로를 떼고 넣으면 된다(대부분 홈페이지가 도메인뿐이라 지금은 안 뗌).

### 지하철은 역이름(검색)과 호선(필터)을 나눈다

`subway` 오브젝트가 둘을 나눠 담는다:

- `subway.stations.<lang>` — **역이름**. `search.place` 로 흘려 "서대문" 텍스트 검색에 걸린다.
- `subway.lines` — **호선**(`"2호선"`·`"5호선"` …) keyword 배열. **"2호선 병원 찾기"** 같은 정확
  필터용이라 관련도 검색이 아니라 `term`/`terms` 로 건다: `{ "term": { "subway.lines": "2호선" } }`.

호선은 병원당 여러 개일 수 있고(여러 역·환승), 어느 역이 어느 호선인지의 상관관계는 이 용도에
필요 없어 **평탄한 배열**로 둔다(역↔호선 짝을 화면에 묶어 보여줘야 하면 상세는 `transport` JSON 에
그대로 있다). 색인 때 표기를 정규화(`"5호선"` 형태)해 넣어야 필터가 맞는다.

### 주소는 한국어·영어만

주소지는 공식적으로 한/영만 지원하므로 `location.addr.ko`(nori) + `location.addr.en`(icu) 두 필드다.
주소는 지금 검색 대상이 아니지만(지역은 코드 필터), 넣어 두면 주소 full-text 가 나중에 공짜다.

### 위치 정보는 `location` 오브젝트로 묶는다

시도(`sido_cd`)·시군구(`region_cd`)·읍면동·우편번호·주소·좌표(`point`)를 `location` 오브젝트
하나에 모은다. **object 는 ES 내부에서 점 표기(`location.sido_cd`)로 평탄화**되므로 term/sort/agg
비용이 최상위 필드와 완전히 동일하다 — 묶는 데 성능 손해가 없다(비용이 붙는 건 배열 상관관계를
보존하는 `nested` 뿐인데, 이 필드들은 단일값이라 해당 없음). 응답 DTO(`HospitalLocation`)의 모양과도
정렬된다. `class_cd`·`tier` 는 위치가 아니라 병원 분류라 최상위에 둔다.

---

## 필터 축 — EXISTS 를 keyword 배열로

지금 자식 테이블을 `EXISTS` 서브쿼리로 거는 조건들을, 문서에 **평탄화한 keyword 배열**로 미리
펼쳐 넣는다. 조회는 `term`/`terms` 필터 한 방이 된다.

| 현재 SQL 조건                                 | ES 필드                                   | 비고                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `region_cd IN (시도→시군구 확장)`             | `location.region_cd` + `location.sido_cd` | **시도를 색인 시점에 미리 계산해 넣는다.** 조회 때 시도면 `location.sido_cd` term, 시군구면 `location.region_cd` term — 확장 로직이 사라진다 |
| `class_cd IN …`                               | `class_cd`                                |                                                                                                                                              |
| `tier IN …` (미지정 시 NURSING·MENTAL 제외)   | `tier`                                    | 제외는 쿼리의 `must_not: terms tier [NURSING,MENTAL]`                                                                                        |
| `EXISTS subject_cd IN …`                      | `subject_cds[]`                           |                                                                                                                                              |
| `EXISTS subject_cd IN … AND specialist_cnt>0` | `specialist_subject_cds[]`                | 전문의 실제 보유 과목만 미리 걸러 별도 배열                                                                                                  |
| `EXISTS equipment_cd IN …`                    | `equipment_cds[]`                         |                                                                                                                                              |
| `EXISTS capability tp='specialty'`            | `specialty_cds[]`                         | tp 별로 배열을 쪼갬                                                                                                                          |
| `EXISTS capability tp='special'`              | `special_cds[]`                           |                                                                                                                                              |
| (미필터, 상세용) capability tp='severe'       | `severe_cds[]`                            | 중증처치. 지금 필터엔 없지만 축으로 확보                                                                                                     |
| `EXISTS hira_hospital_asm asm_NN='1'`         | `asm_excellent_cds[]`                     | **핵심 단순화 아래 참조**                                                                                                                    |
| `emergency_yn=1` / `baby_yn=1`                | `emergency` / `baby` (boolean)            |                                                                                                                                              |

### 적정성평가 — 미러 조인이 사라진다

지금은 검색이 유일하게 원본 미러(`hira_hospital_asm`)를 조인해 `asm_01~asm_24` 컬럼을 본다.
색인 시점에 **1등급(우수)인 항목 코드만 배열로 미리 뽑아** `asm_excellent_cds` 에 넣으면,
필터는 `terms(asm_excellent_cds, [고른 항목])` 한 줄이 된다. 미러 조인도, 천식(16)의 `'양호'`
예외 인코딩 처리도 색인 파이프라인 안으로 흡수된다.

전체 등급표(상세 화면용)는 별도로 `assessment.grades`(`enabled:false`)에 원본 그대로 담는다.
`NULL`(평가대상 아님)·`'등급제외'`·`'1'~'5'`·천식 `'양호'/'0'` 의 구분은 원본을 보존하고,
정렬·비교가 필요할 때 앱의 `normalizeGrade()` 를 태운다.

---

## 정렬·페이징

- **관련도(`_score`)** — 지금 검색엔 없던 것. 이름 질의가 있으면 기본 정렬로 쓸 수 있다.
- **거리(`_geo_distance`)** — `location` 기준. "내 근처" 검색.
- **이름(`name.<lang>` keyword)** — 가나다/사전순. 필요하면 `icu_collation_keyword` 로 언어별
  정렬 규칙을 정확히 줄 수 있다(지금은 keyword+normalizer).
- 페이징: 현재 offset(`from`/`size`)을 그대로 쓸 수 있다. 깊은 페이지는 `search_after` 권장.

---

## 분석기 요약 (`hospital.index.json`)

| 분석기         | 토크나이저                      | 필터                                             | 대상                    |
| -------------- | ------------------------------- | ------------------------------------------------ | ----------------------- |
| `ko_text`      | nori (`decompound_mode: mixed`) | 품사 제거·lowercase·icu_folding                  | 한국어 이름/역명/주소   |
| `ja_text`      | kuromoji (`mode: search`)       | baseform·품사·stop·stemmer·lowercase·icu_folding | 일본어 이름/역명        |
| `zh_text`      | smartcn                         | lowercase·icu_folding                            | 중국어(간체) 이름/역명  |
| `generic_text` | icu                             | lowercase·icu_folding                            | 영어·로마자·다국어 폴백 |

`icu_folding` 이 다국어 공통 정규화(악센트·전각/반각·대소문자)를 잡아, 어느 언어든 표기 흔들림에
관대해진다.

---

## 열려 있는 결정 (구현 전 확인 필요)

1. **역명·주소 다국어 소스.** 지하철역명 번역과 영문 주소를 어디서 채우나. 역명은
   `healthcare_hospital_i18n.transport` JSON(사전 기반)에 있고, 지역/주소 다국어는 시드에 거의 없다
   (region_code 는 한국어만, zh 컬럼 없음). 색인 파이프라인이 무엇을 소스로 삼을지 확정 필요.
2. **`get(id)` 도 ES 로 옮길지.** 상세를 전부 담았으니 가능하다. 옮기면 Redis 상세 캐시가 불필요해진다.
   그대로 DB 를 상세의 정본으로 둘 수도 있다.
3. **중간 부분일치 강도.** 접두어(`index_prefixes`)로 충분한지, ngram 서브필드까지 필요한지.
4. **색인 파이프라인.** admin 배치가 재빌드할 때 ES 로 bulk 색인하는 잡(전체/증분)과 별칭(alias)
   기반 무중단 재색인 전략.
