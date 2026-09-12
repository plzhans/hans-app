# 앱 출시 준비

MediFinder 를 iOS·Android 스토어에 올리기 위해 필요한 것들.
**아직 아무것도 시작하지 않았다** — 이 문서는 착수 전에 무엇이 걸리는지 미리 적어 둔 것이다.

일반적인 출시 체크리스트를 이 프로젝트 상태에 맞춰 걷어낸 결과다.
해당 없는 항목은 지우지 않고 **왜 해당 없는지**와 **언제 되살아나는지**를 같이 적었다 —
지워 버리면 로그인을 붙이는 시점에 그게 필요했다는 사실 자체를 잃는다.

---

## 지금 상태

| | |
| --- | --- |
| 방식 | **Capacitor**. [capacitor.config.ts](../capacitor.config.ts) 에 `appId: kr.medifinder.app` 까지 확정 |
| 네이티브 플랫폼 | **아직 없다.** `npx cap add ios` / `npx cap add android` 안 함 |
| 화면 | `/`, `/search`, `/hospitals/:id`, `/hospitals/:id/npay`, 404 |
| 로그인 | **1 단계에는 없다.** 코드(`shared/auth/`)는 있으나 어느 화면에도 안 붙었고 `/auth/callback` 라우트도 없다 |
| 언어 | ko · en-us · ja · zh-hans (4 개) |
| 결제 | 없음 |
| 리뷰·후기·즐겨찾기 | 없음 |
| 네이티브 플러그인 | core · geolocation · preferences · native-settings |

**출시를 두 단계로 나눈다.** 1 단계는 지금 화면 그대로 로그인 없이 낸다.
2 단계에서 로그인을 붙이는데, 그때 심사 요건이 한 뭉치 되살아난다([2 단계](#2-단계--로그인) 참고).

---

## 0. 방식은 정해졌다

Capacitor 로 간다. PWA·TWA·React Native 재작성은 검토 대상이 아니다 —
웹 자산이 이미 있고 [native.ts](../src/shared/lib/native.ts) · [geolocation.ts](../src/shared/lib/geolocation.ts) 로 브리지가 깔려 있다.

`ios/` · `android/` 는 **이 디렉터리 안에** 만든다(`frontend/medifinder-web/ios`).
`cap sync` 가 `webDir`(= `dist`)를 `ios/App/App/public` 으로 복사하고
플러그인은 `capacitor.config.ts` 와 같은 package.json 의 `node_modules` 에서 찾기 때문이다.
최상위로 빼면 한 프로젝트가 두 경로로 갈려 CI paths 필터·release-please 가 둘 다 물어야 한다.

---

## 1. Apple Guideline 4.2 — 가장 큰 리스크

웹사이트를 감싸기만 한 앱은 *"웹사이트를 보세요"* 로 거절당한다.
이게 이 프로젝트의 성격상 **1 순위 리스크**다.

### 이미 가진 것

| 기능 | 어디 | 4.2 방어력 |
| --- | --- | --- |
| 네이티브 위치 | `@capacitor/geolocation` ([geolocation.ts](../src/shared/lib/geolocation.ts)) | 약함 — 모바일 브라우저도 된다 |
| OS 공유 시트 | `navigator.share` ([share.ts](../src/shared/lib/share.ts)) | 약함 — 같은 이유 |
| 지도앱 길찾기 호출 | 카카오 link ([directions.ts](../src/shared/lib/directions.ts)) | 약함 — 같은 이유 |
| 앱 설정 화면 열기 | `capacitor-native-settings` | 앱에서만 되지만 부차적 |

셋 다 **모바일 사파리에서도 되는 것들**이라 그대로는 근거가 약하다.
`@capacitor/geolocation` 을 쓴 건 4.2 대비가 아니라 iOS WKWebView 가 HTML5 Geolocation 을
지원하지 않아 앱에서 조용히 실패하기 때문이었다.

### 우리 쪽 논거 — 4 개 국어

`ko` 외에 `en-us` · `ja` · `zh-hans` 를 갖췄다는 게 **"왜 앱이어야 하는가"의 축**이다.
방한 외국인이 로밍·데이터 불안정한 상태에서 병원을 찾는 시나리오는
브라우저 북마크로 대체되지 않는다. 심사 노트에 이 맥락을 적는다.

### 그래서 붙일 것 (우선순위)

1. **오프라인 캐시** — `@capacitor/preferences` 가 이미 깔려 있다. 최근 본 병원을 오프라인에서 열게 한다.
   위 논거와 직결되고 공수가 가장 낮다. **최소한 이건 하고 제출한다.**
2. **푸시 알림** — 플러그인 미설치. 붙이면 APNs 키·FCM 설정이 따라온다.
3. **홈 화면 위젯 (iOS)** — 공수 대비 효과가 크지만 네이티브 코드가 필요하다.

---

## 2. 계정 준비 — 리드타임이 병목

| 항목 | 비용 | 리드타임 |
| --- | --- | --- |
| Apple Developer Program | 연 $99 | D-U-N-S 발급 1~2 주 (조직 명의일 때) |
| Google Play Console | 최초 1 회 $25 | 신원 확인 |

**조직(사업자) 계정으로 만든다.** 개인 계정은 Google Play 가
*테스터 12 명 이상 · 14 일 연속 클로즈드 테스트*를 통과해야 프로덕션이 열린다 — 조직은 면제다.
개인 명의면 개발자 표시명에 실명이 노출되는 문제도 있다.

**지금 정해야 할 것**

- 명의를 어디로 할지 (D-U-N-S 발급이 여기서 시작된다)
- 개발자 표시명 — 스토어에 그대로 뜬다
- 지원 URL · 마케팅 URL — `medifinder.kr` 하위로 낼지

---

## 3. 한국 법령

일반 앱과 가장 다른 지점이다. 실측해 보니 **대부분 리스크가 낮은데 두 개가 남는다.**

### 위치기반서비스사업 신고 — 해당한다

단말 GPS 로 개인위치정보를 이용하므로 방송통신위원회 신고 대상으로 보아야 한다.
확정 판단은 받아야 하지만, 미신고 영업은 처벌 대상이라 **사전 확인이 필수**다.

신고서와 개인정보처리방침에 쓸 유리한 사실이 하나 있다 —
[geolocation.ts](../src/shared/lib/geolocation.ts) 는 좌표를 **저장하지도 검색에 싣지도 않는다.**
역지오코딩(`/address/regions/reverse`)으로 시도·시군구 코드만 받아 지역 필터를 채우고 버린다.
좌표를 URL·로그에 남기지 않는 것도 기존 방침이다. 이 설계를 그대로 문서화한다.

### 의료법 — 리스크 낮음. 단 조건부

| 흔한 위험 요소 | 우리 | 판단 |
| --- | --- | --- |
| 환자 치료경험담·후기 (의료법 56조) | 리뷰 기능 없음 | 해당 없음 |
| 병원 순위·추천 | 없음. 검색 기본 정렬은 id 순 | 해당 없음 |
| 비급여 진료비 **비교** | **비교하지 않는다** | 아래 참고 |

[HospitalNonPayment](../src/features/clinic/pages/HospitalNonPayment.tsx) 는
**한 병원의 가격표를 심평원 중분류로 묶어 보여줄 뿐**이다
([npayGroup.ts](../src/features/clinic/lib/npayGroup.ts)).
병원 간 최저가·평균·순위를 내지 않는다. 그래서 의료광고 심의 대상으로 보기 어렵다.

> **되살아나는 조건.** 병원 간 가격 비교·최저가·추천·순위를 붙이는 순간 재검토해야 한다.
> 그때는 의료광고 심의(대한의사협회 등) 대상이 될 수 있다.

### 데이터 출처 라이선스 — 미결. 실질적 블로커

심평원(HIRA)·공공데이터포털 데이터를 쓴다.
**의원급 비급여는 data.go.kr 에 없어 심평원 홈페이지에서만 얻을 수 있고,
그쪽 이용약관을 아직 확인하지 않아 적재를 보류한 상태다.**

앱으로 배포하는 것은 웹보다 재배포 성격이 강하다.
**출시 전에 약관 확인을 끝내야 한다.** 확인 결과에 따라 비급여 화면을 빼고 낼 수도 있다.
출처 표기 의무가 있으면 앱 안에도 표기 자리를 만든다.

### 개인정보처리방침 · 이용약관 — 만들었다

스토어 등록 시 **공개 URL 입력이 필수**인데, `/terms/service` · `/terms/location` · `/terms/privacy` 를 그대로 쓴다.
조문은 [legal/content](../src/features/legal/content/) 의 JSON 이 정본이고,
한국어본이 원본 · 영어본이 번역이며 일본어 · 중국어 화면에는 영어본을 보여준다.

**수집 주체를 늘릴 때 방침을 같이 고친다.** [5 절](#5-개인정보-공시)의 실측 표와
방침 조문이 같은 내용이어야 하고, 어긋나면 그 자체가 정지 사유다.

### 통신판매업 신고 — 해당 없음

앱 내 결제가 없다.

---

## 4. 심사 리젝 단골

| 항목 | 1 단계 | 비고 |
| --- | --- | --- |
| 계정 삭제 기능 | 해당 없음 | 계정이 없다. **2 단계에 되살아난다** |
| Sign in with Apple | 해당 없음 | 소셜 로그인 없음. **2 단계에 되살아난다** |
| 심사용 데모 계정 | 해당 없음 | 로그인 벽이 없다. **2 단계에 되살아난다** |
| IAP 강제 | 해당 없음 | 결제 없음 |
| 권한 사용 설명 문구 | **해당** | 아래 |
| 연령 등급 설문 | **해당** | 의료 정보 관련 문항 정확히 |

### 권한 문구 — 4 개 국어로

iOS `NSLocationWhenInUseUsageDescription` 에 **왜** 필요한지 구체적으로 적는다.
*"위치가 필요합니다"* 같은 문구는 그 자체로 리젝 사유다.

일반 가이드에 없는 우리 특수 사항이 하나 있다 —
서비스가 4 개 국어인데 **권한 문구는 `Info.plist` 에 있어서 앱의 i18n 이 닿지 않는다.**
`InfoPlist.strings` 를 언어별로 만들어야 한다.
Android 는 런타임 권한이라 다이얼로그 문구를 우리가 못 바꾸지만,
권한을 요청하기 전에 앱 안에서 이유를 먼저 설명하는 화면은 필요하다.

문구 초안 — *"가까운 병원을 찾기 위해 현재 위치를 사용합니다. 위치는 저장하지 않습니다."*
(뒷문장은 사실이고, 그래서 적을 가치가 있다.)

---

## 5. 개인정보 공시

Apple **Privacy Nutrition Label** 과 Google **Data Safety Form** 양쪽에 같은 내용을 낸다.
**실제 앱 동작과 어긋나면 정지 사유**이므로 실측값으로 적는다.

| 수집 주체 | 무엇을 | 신고 |
| --- | --- | --- |
| Google Analytics 4 | 사용 데이터 · 대략적 위치 | 필요. 광고 기능은 꺼 둔다 — [google-analytics.md](google-analytics.md) |
| Sentry | 진단 데이터 · 크래시 | 필요 |
| 위치 (`@capacitor/geolocation`) | 정확한 위치 | 필요. **저장하지 않음**을 함께 표기 |

**서드파티 SDK 가 수집하는 것도 우리 책임이다.**

- **ATT (App Tracking Transparency)** — 광고 식별자나 크로스앱 추적을 쓰지 않으므로 **지금은 불필요**.
  GA 의 구글 신호 데이터 · 광고 개인 최적화를 꺼 둔 것이 그 전제다 — 켜면 이 항목이 되살아난다.
  광고를 붙일 때도 같다.
- **PrivacyInfo.xcprivacy** — iOS 필수. 필수 사유 API 사용 선언과 서드파티 SDK 서명 확인.

---

## 6. 기술 체크리스트

### 공통

- [ ] **앱 아이콘** — 원본이 [docs/icon_medifinder_.png](icon_medifinder_.png) 에 있다.
      iOS 1024×1024, Android 512×512 + adaptive icon(전경·배경 분리) 파생 필요
- [ ] **스플래시 스크린**, safe-area 대응
      상세의 앱바([DetailAppBar](../src/features/clinic/components/DetailAppBar.tsx))는 이미
      `pt-safe-top` 으로 노치를 피한다. `env(safe-area-inset-top)` 은 가운데만 뚫린 구멍이 아니라
      **전체 폭 띠**라, 다이나믹 아일랜드가 가운데 있어도 가운데 정렬한 병원 이름은 그 아래에 온다.
      **가로 모드는 아직 안 봤다** — 그때 생기는 `safe-area-inset-left/right` 를 앱바가 안 쓴다.
- [ ] **상태바 글자색** — `@capacitor/status-bar` 필요(아직 미설치). **상세 히어로를 파란
      그라데이션으로 바꾸면서 생긴 일이다.** 그 파란 면이 상태바 띠 뒤까지 채우는데 iOS 기본
      상태바 글자는 검은색이라 안 읽힌다. 게다가 스크롤하면 앱바가 흰색으로 바뀌므로
      (`DetailAppBar` 의 `solid`) **light ↔ dark 를 그 상태에 맞춰 전환**해야 한다.
      `index.html` 의 `<meta name="theme-color" content="#FFFFFF">` 도 같이 봐야 한다 —
      상단이 파란 화면에서는 안 맞는다.
      웹에서는 플러그인이 no-op 이고 `ios/` 없이는 검증도 안 되므로 `cap add` 시점에 함께 한다.
- [ ] **딥링크 / 유니버설 링크** — `medifinder.kr` → 앱.
      **언어 접두사 라우팅과 맞물린다** — `/ko/*` 는 접두사를 떼는 리다이렉트라(`StripKoPrefix`)
      딥링크로 들어올 때 한 번 더 튀지 않는지 확인
- [ ] **Android 하드웨어 뒤로가기** — react-router history 와 연결. 안 하면 앱이 그냥 종료된다
- [ ] **외부 링크는 시스템 브라우저로** — 카카오 길찾기가 웹으로 떨어질 때
      앱 웹뷰 안에서 열리면 돌아올 길이 없다
- [ ] **강제 업데이트 로직** — 웹앱과 가장 다른 지점이다.
      `dist` 가 앱 안에 구워지므로 **서버만 고쳐서는 사용자 화면이 안 바뀐다.**
      최소 지원 버전을 서버가 내려주고 앱이 스토어로 보내는 경로가 필요하다
- [ ] **네트워크 끊김 화면**
- [ ] **크래시 리포팅** — `@sentry/react` 는 이미 있다.
      **네이티브 크래시는 안 잡힌다** — `@sentry/capacitor` 추가 필요

### Android

- [ ] AAB(App Bundle) 빌드, Play App Signing 등록
- [ ] Target API level — Play 가 매년 8 월경 요구 레벨을 올린다. **등록 시점 기준으로 확인**
- [ ] 광고 ID 권한 — 쓰지 않으므로 선언하지 않는다(선언하면 Data Safety 와 어긋난다)

### iOS

- [ ] 최신 Xcode SDK 로 빌드 (Apple 요구 최소 SDK 확인)
- [ ] `PrivacyInfo.xcprivacy`
- [ ] 푸시를 붙이면 APNs 키 · Provisioning Profile

---

## 7. 스토어 등록 자산

- 앱 이름(iOS 30 자) · 부제 · 프로모션 텍스트 · 설명 · 키워드
- **4 개 국어 등록 정보** — 앱이 다국어인데 스토어 페이지가 한국어뿐이면
  일본·중국·영어권 검색에 걸리지 않는다. 4.2 논거와도 어긋난다
- 스크린샷 — iOS 6.9" / 6.5" (+ iPad 지원 시), Android 폰 최소 2 장 + 피처 그래픽 1024×500
- 지원 URL · 마케팅 URL · 개인정보처리방침 URL
- **상표 확인** — "MediFinder" 를 키프리스에서 조회. 도메인·appId 가 이미 이 이름이라
  충돌이 있으면 되돌리는 비용이 크다. **계정 준비와 같이 시작한다**

---

## 8. 저장소 · CI

- **`ios/` · `android/` 는 커밋한다.** 생성물이지만 손으로 고친 설정이 섞인다 —
  `Info.plist` 권한 문구(4 개 국어), `AndroidManifest.xml` 위치 권한, 서명 설정.
  커밋하지 않으면 `cap add` 를 다시 할 때마다 날아간다
- **`.gitignore` 추가** — `cap sync` 산출물(`ios/App/App/public/`, `android/app/src/main/assets/public/`),
  `Pods/`, `.gradle/`, `local.properties`, `xcuserdata/`.
  `Podfile.lock` 은 재현성 때문에 **커밋한다**
- **서명 키는 절대 커밋 금지** — `*.keystore` `*.jks` `*.p12` `*.p8` `*.mobileprovision`.
  [frontend/.gitignore](../../.gitignore) 의 정책이 *"프론트 env 는 전부 커밋한다"* 라
  정면으로 부딪힌다. 이름으로 막는다
- **`app-medifinder.yml` 을 따로 둔다** — iOS 빌드는 macOS runner 라 분당 단가가 다르다.
  [fe.yml](../../../.github/workflows/fe.yml) 에 얹으면 웹 푸시가 맥 러너를 깨운다.
  `paths: frontend/medifinder-web/**` + 태그 트리거
- **release-please 컴포넌트 분리** — 지금은 `frontend` 하나가 4 개 package.json 을 같이 올려서,
  hansapp-web 을 배포할 때마다 앱 버전이 뛴다. 스토어 버전은 독립해야 한다

---

## 2 단계 — 로그인

로그인을 붙이면 [4 절](#4-심사-리젝-단골)의 "해당 없음" 셋이 전부 살아난다.
그보다 먼저, **지금 auth-sdk 구조는 네이티브 셸에서 그대로 돌지 않는다.**
셋 다 medifinder 혼자 못 고치고 `auth-sdk` · `hansapp-auth` · 백엔드가 같이 움직여야 한다.

### (1) redirect_uri 가 앱에서 돌아올 데가 없다

[auth-sdk/src/client.ts](../../auth-sdk/src/client.ts) 의 `callbackUrl` 이
`window.location.origin + '/auth/callback'` 인데,
Capacitor 에서 origin 은 `capacitor://localhost`(iOS) · `http://localhost`(Android) 다.
그 값이 `redirect_uri` 로 나가면 외부 브라우저가 돌아올 곳이 없다.

→ 커스텀 스킴(`kr.medifinder.app://auth/callback`) 또는 유니버설 링크로 받고,
그 값을 백엔드 클라이언트(`cl_fixed_medifinder`)의 허용 redirect_uri 에 등록해야 한다.

### (2) 구글 로그인이 임베디드 웹뷰에서 차단된다

`login()` 이 `window.location.href` 로 메인 웹뷰를 `auth.plzhans.com` 으로 보낸다.
소셜 제공자가 **google · kakao · naver** 인데,
구글은 임베디드 웹뷰 OAuth 를 `disallowed_useragent` 로 막는다.
Apple·Google 심사도 앱 웹뷰 안의 로그인 페이지를 싫어한다.

→ iOS `ASWebAuthenticationSession` · Android Chrome Custom Tabs 로 띄운다
(`@capacitor/browser` 또는 OAuth 전용 플러그인).
`auth-sdk` 에 웹/네이티브 분기가 들어가야 한다 — 지금 SDK 는 브라우저만 가정한다.

### (3) Sign in with Apple 병기가 필수다

제3자 소셜 로그인(google·kakao·naver)만 제공하면 iOS 는 Guideline 4.8 로 리젝한다.
**Apple 로그인을 추가하는 건 hansapp-auth 와 백엔드 작업이다** — medifinder 쪽 일이 아니다.
리드타임이 있으므로 2 단계를 계획할 때 제일 먼저 잡는다.

### 그 밖에 따라오는 것

- **계정 삭제** — 앱 안에서 완결되어야 한다. 웹으로 보내면 리젝(Apple 5.1.1(v), Google 모두).
  백엔드에 탈퇴 API 가 필요하다
- **심사용 데모 계정** — 소셜 로그인만 있으면 심사자가 카카오 계정을 만들어야 한다.
  이메일/비밀번호 경로를 열든지, **로그인 없이도 핵심 기능이 되게 유지**한다.
  1 단계가 그 상태이므로 그 성질을 지키는 편이 심사에 유리하다
- **Privacy Label 갱신** — 계정 식별자 수집이 추가된다

---

## 진행 순서

리드타임이 긴 것부터 건다. **1·2 는 코드와 무관하니 지금 바로 시작할 수 있다.**

1. **D-U-N-S 발급 · 스토어 계정 결제** — 1~2 주 걸리는 병목. 명의부터 정한다
2. **심평원 데이터 약관 확인** — 결과에 따라 비급여 화면 포함 여부가 갈린다. 늦게 알수록 손해다
3. **위치기반서비스사업 신고 준비** + **개인정보처리방침 · 이용약관 작성**
4. **상표 조회** (키프리스)
5. `npx cap add ios` / `android`, 아이콘·스플래시, 딥링크, 뒤로가기, 강제 업데이트
6. **오프라인 캐시** — 4.2 방어의 최소선
7. `app-medifinder.yml`, release-please 분리, 서명 키 설정
8. 스토어 자산 4 개 국어 제작, Privacy 설문
9. TestFlight · Play 내부 테스트 → 제출

**첫 제출은 리젝을 기본 전제로 잡는다.** 특히 4.2 가 걸리면 기능을 더해야 해서 왕복이 길어진다.

> 심사 소요는 Apple 이 보통 24 시간 내, Google 은 1~3 일(신규 계정 첫 제출은 최대 7 일)이다.
> 참고한 초안에 적혀 있던 *"Apple 13 일 · Google 17 일"* 은 근거를 찾지 못했다 — 그 숫자로 일정을 잡지 말 것.
