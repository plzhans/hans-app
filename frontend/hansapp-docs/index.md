---
layout: home
hero:
  name: Hans API
  text: 공공데이터를 하나의 API 로
  tagline: 기관마다 흩어진 국내 공공데이터를 정리해 제공합니다. 어느 도메인을 쓰든 인증과 규칙은 같습니다.
  actions:
    - theme: brand
      text: 시작하기 (인증·다국어)
      link: /common
    - theme: alt
      text: 병원 검색 API
      link: /apis/healthcare
features:
  - title: 병원
    details: 지역·진료과목·종별·응급실 여부로 전국 병원을 찾고, 진료시간·교통편·병상까지 상세로 받습니다.
    link: /apis/healthcare
  - title: 주소
    details: 시도·시군구 지역 코드와, 한글 주소를 국가 공식 영문 표기로 바꾸는 검색.
    link: /apis/address
  - title: 사업자
    details: 국세청 사업자등록번호 상태조회(계속·휴업·폐업)와 등록정보 진위확인.
    link: /apis/business
  - title: 다국어
    details: Accept-Language 헤더 하나로 한국어·영어·일본어 응답을 받습니다.
    link: /common#다국어
---

## 무엇을 하는 곳인가

공공데이터는 기관마다 흩어져 있고, 기관마다 코드 체계도 응답 형식도 다릅니다.
Hans API 는 그걸 **주기적으로 동기화하고, 코드를 통일하고, 쓸 수 있는 형태로 다듬어**
하나의 API 로 내줍니다. 어느 도메인을 쓰든 인증(`Authorization`)과
다국어(`Accept-Language`)는 똑같습니다.

지금 제공하는 도메인은 **병원**, **주소**, **사업자** 이고,
여기에 화면을 만들 때 쓰는 참조 데이터(지역 코드·지하철역)가 딸려 있습니다.

### 병원 — 주력 API

병원 정보는 특히 심하게 흩어져 있습니다. **건강보험심사평가원(HIRA)** 은 병상·장비·진료과목 같은
기관 제원을 갖고 있고, **국립중앙의료원(NMC)** 은 진료시간과 응급실 운영 여부를 갖고 있습니다.
그런데 **두 기관은 코드 체계도 기관 식별자도 다릅니다.** 원본만으로는 "우리 동네에서 지금 문 연
소아과"를 찾을 수 없습니다.

Hans API 는 이 둘을 **병원 단위로 매칭해 하나로 합친 것**입니다. 쓰는 쪽은 병원 하나를 가리키는
**id 하나**만 알면 됩니다.

```bash
# 강남구의 응급실 운영 병원을 영어로
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Accept-Language: en" \
     "https://api.plzhans.com/healthcare/hospitals?region=11680&emergency=true"
```

## 어디서부터 볼까

| | |
| --- | --- |
| [**공통**](/common) | 인증(`Authorization`)과 다국어(`Accept-Language`). **모든 요청에 필요합니다.** |
| [**병원 검색**](/apis/healthcare) | 주력 API. 검색과 상세. |
| [**참조 데이터**](/apis/healthcare-meta) | 병원 검색 조건에 넣을 코드. 드롭다운을 채울 때 씁니다. |
| [**사업자**](/apis/business) | 국세청 사업자등록번호 상태조회·진위확인. 병원과 무관하게 단독으로 씁니다. |
| [**주소**](/apis/address) · [**교통정보**](/apis/transport) | 지역 코드, 영문 주소, 지하철역 목록. 도메인 무관이라 병원 밖에서도 씁니다. |
