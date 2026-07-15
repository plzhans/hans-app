---
layout: home
hero:
  name: Hans API
  text: 전국 병원 정보 API
  tagline: 기관마다 흩어진 정부 병원 데이터를 하나로 합쳐, 검색 가능한 형태로 제공합니다.
  actions:
    - theme: brand
      text: 병원 검색 API
      link: /apis/healthcare
    - theme: alt
      text: 시작하기 (인증·다국어)
      link: /common
features:
  - title: 병원 검색
    details: 지역·진료과목·종별·응급실 여부로 병원을 찾고, 진료시간·교통편·병상까지 상세로 받습니다.
    link: /apis/healthcare
  - title: 참조 데이터
    details: 검색 조건에 넣을 코드 목록입니다. 진료과목·종별·등급·장비·중증질환.
    link: /apis/healthcare-meta
  - title: 다국어
    details: Accept-Language 헤더 하나로 한국어·영어·일본어 응답을 받습니다.
    link: /common#다국어
---

## 무엇을 하는 API 인가

병원 정보는 정부 기관마다 흩어져 있습니다. **건강보험심사평가원(HIRA)** 은 병상·장비·진료과목 같은
기관 제원을 갖고 있고, **국립중앙의료원(NMC)** 은 진료시간과 응급실 운영 여부를 갖고 있습니다.
그런데 **두 기관은 코드 체계도 기관 식별자도 다릅니다.** 원본만으로는 "우리 동네에서 지금 문 연
소아과"를 찾을 수 없습니다.

Hans API 는 이 둘을 **병원 단위로 매칭해 하나로 합친 것**입니다. 원본을 주기적으로 동기화하고,
코드 체계를 통일하고, 검색할 수 있게 인덱싱합니다. 쓰는 쪽은 병원 하나를 가리키는 **id 하나**만
알면 됩니다.

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
| [**참조 데이터**](/apis/healthcare-meta) | 검색 조건에 넣을 코드. 드롭다운을 채울 때 씁니다. |
| [**주소**](/apis/region) · [**교통정보**](/apis/transport) | 지역 코드, 지하철역 목록. 도메인 무관이라 병원 밖에서도 씁니다. |

## 정부데이터 원본은 언제 쓰나

**대부분의 경우 쓸 일이 없습니다.** HIRA·NMC 원본을 캐싱해 그대로 내주는 API 가 따로 있지만,
그건 원본의 코드 체계와 필드를 손대지 않고 노출합니다. 두 기관을 직접 매칭해 보고 싶거나,
통합 API 가 아직 내주지 않는 원본 필드가 필요할 때만 씁니다.

::: warning
원본 API 는 **현재 공개돼 있으나 추후 허가받은 사용자로 제한될 예정**입니다.
새로 붙이는 코드는 통합 API(`/healthcare/*`)를 쓰세요.
:::
