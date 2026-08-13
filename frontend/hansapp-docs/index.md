---
# **`layout: home` 을 쓰지 않는다.** 그 레이아웃은 사이드바를 하드코딩으로 빼기 때문에
# (VitePress: `frontmatter.layout !== 'home'`) 첫 페이지에서만 목차가 사라진다.
# 대신 문서 레이아웃에 홈 조각(VPHomeHero·VPHomeFeatures)을 얹어 디자인은 그대로 둔다.
# 아래 hero·features 는 그 컴포넌트들이 읽는 값이다.
title: Hans API
description: 전국 병원 검색, 지역 코드·영문 주소, 사업자등록 조회를 하나의 REST API 로 제공합니다. 인증과 응답 규칙은 도메인과 무관하게 같습니다.
pageClass: home-page
aside: false
outline: false
hero:
  name: Hans API
  text: API 문서
  tagline: 여러 도메인의 정보와 기능을 하나의 REST API 로 제공합니다. 무엇을 쓰든 인증과 응답 규칙은 같습니다.
  actions:
    - theme: brand
      text: 시작하기 (인증·다국어)
      link: /common
    - theme: alt
      text: 병원 검색 API
      link: /apis/healthcare
features:
  - title: 헬스케어
    details: 전국 병원 검색 · 진료시간 · 응급실 · 병상 · 장비 · 평가등급
    link: /apis/healthcare
  - title: AI · MCP
    details: 자연어 → 검색 조건 · AI 도구에 물리는 MCP 엔드포인트
    link: /apis/ai
  - title: 주소
    details: 시도 · 시군구 지역 코드 · 공식 영문 주소 표기
    link: /apis/address
  - title: 사업자
    details: 사업자등록번호 상태조회(계속·휴업·폐업) · 진위확인
    link: /apis/business
  - title: 다국어
    details: Accept-Language 헤더 하나로 한국어 · 영어 · 일본어 · 중국어
    link: /common#다국어
---

<VPHomeHero />
<VPHomeFeatures />

## 시작하기

모든 요청은 `https://api.plzhans.com` 으로 보냅니다.
인증(`Authorization`)과 응답 언어(`Accept-Language`)는 **도메인과 무관하게 같습니다** —
[공통](/common) 을 먼저 읽으세요. 키는 [앱 관리 콘솔](https://plzhans.com)에서 발급합니다.

```bash
# 강남구의 응급실 운영 병원을 영어로
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Accept-Language: en" \
     "https://api.plzhans.com/healthcare/hospitals?region=11680&emergency=true"
```

## 제공 도메인

| 도메인 | 내용 |
| --- | --- |
| [**헬스케어**](/apis/healthcare) | 전국 병원 검색·상세. 검색 조건 코드는 [참조 데이터](/apis/healthcare-meta) 에서 받습니다 |
| [**AI · MCP**](/apis/ai) | 자연어 질문을 검색 조건으로. AI 도구에 물리는 MCP 엔드포인트 |
| [**주소**](/apis/address) | 시도·시군구 지역 코드, 한글 주소의 공식 영문 표기 |
| [**사업자**](/apis/business) | 국세청 사업자등록번호 상태조회·진위확인 |
| [**교통정보**](/apis/transport) | 지하철역 목록(한/영/일) |
| [**계정**](/apis/oauth) | OAuth 토큰 발급·갱신과 사용자 계정 API |

## 공통 규칙

| | |
| --- | --- |
| [**인증**](/common#인증) | 서비스 키(`Authorization`) 또는 클라이언트 ID(`X-Client-Id`) |
| [**로그인 연동**](/common#login-integration) | OAuth 2.0 Authorization Code + PKCE |
| [**다국어**](/common#다국어) | `Accept-Language` 하나로 한국어·영어·일본어·중국어 |
