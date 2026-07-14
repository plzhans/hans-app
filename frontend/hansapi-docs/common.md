# 공통

모든 API 에 똑같이 적용되는 규칙입니다. **요청 하나에 두 헤더가 필요합니다.**

```http
GET /healthcare/hospitals?region=11680
Authorization: Bearer <API_KEY>     # 인증   — 없으면 401
Accept-Language: en                 # 다국어 — 없으면 한국어
```

## 인증

모든 API 요청에는 발급받은 **API 키**가 필요합니다. API 키를 HTTP `Authorization` 헤더에
**Bearer 토큰**으로 담아 보냅니다.

```
Authorization: Bearer <API_KEY>
```

- `<API_KEY>` 자리에 발급받은 키를 넣습니다.
- 모든 엔드포인트에 공통으로 적용됩니다.
- 헤더가 없거나 키가 유효하지 않으면 **401** 이 옵니다.

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.plzhans.com/data-go-kr/hira/hospitals?name=서울"
```

```js
await fetch('https://api.plzhans.com/data-go-kr/hira/hospitals?name=서울', {
  headers: { Authorization: 'Bearer YOUR_API_KEY' },
});
```

::: warning
API 키는 외부에 노출되지 않도록 주의하세요. 클라이언트(브라우저)에 직접 넣기보다 서버에서
프록시하는 것을 권장합니다.
:::

::: tip
문서의 각 API 페이지에서 **Try it** 을 사용할 때도 상단/요청 패널의 토큰 입력란에 API 키를 넣으면
인증된 요청으로 테스트할 수 있습니다.
:::

## 다국어

응답 언어는 **`Accept-Language` 헤더**로 정합니다. 쿼리 파라미터(`?lang=en`)나 경로(`/en/...`)는
쓰지 않습니다.

```http
GET /healthcare/hospitals?region=11680
Accept-Language: en
Authorization: Bearer <token>
```

### 지원 언어

| 값 | 언어 |
| --- | --- |
| `ko` | 한국어 **(기본값)** |
| `en` | 영어 |
| `ja` | 일본어 |

헤더를 안 보내거나 지원하지 않는 언어를 보내면 **한국어**로 응답합니다.

### 헤더를 읽는 규칙

관대하게 읽습니다. 브라우저마다 보내는 모양이 제각각이기 때문입니다.

- 쉼표로 나눈 뒤 **앞에서부터 지원하는 첫 언어**를 택합니다.
- 지역 태그는 무시합니다. `en-US` → `en`
- **`q` 가중치는 보지 않습니다.** 브라우저가 주는 순서가 곧 선호 순서라, 가중치까지 구현해 얻는
  것이 복잡도에 비해 적습니다.

```
Accept-Language: ja,en;q=0.9,ko;q=0.8   →  ja
Accept-Language: fr-FR,fr;q=0.9         →  ko   (지원하지 않는 언어 → 기본값)
Accept-Language: en-GB                  →  en
```

### 번역이 없으면 한국어가 옵니다

::: tip 빈 값은 오지 않습니다
번역이 채워지지 않은 항목은 `null` 이나 빈 문자열이 아니라 **한국어 원문**이 옵니다.
원본 데이터가 한국어라 한국어는 언제나 있습니다 — 화면이 비는 것보다 한국어라도 보이는 편이 낫습니다.
:::

그래서 `Accept-Language: ja` 로 요청해도 항목에 따라 한국어가 섞여 올 수 있습니다.
**이건 오류가 아닙니다.**

번역은 점진적으로 채워집니다. 어제 한국어로 오던 값이 오늘 번역되어 올 수 있습니다.

### 예외 — 지하철역 목록

[지하철역 목록](/apis/transport)만 `Accept-Language` 를 보지 않고 **세 언어를 한 번에 다 내립니다**
(`ko` / `en` / `ja`). 화면에 나온 역명을 **찾아 바꾸는** 용도라, 클라이언트가 통째로 받아 맵으로
들고 쓰기 때문입니다 — 언어를 바꿀 때마다 다시 받게 만들 이유가 없습니다.

번역이 없는 칸은 필드가 **생략**됩니다. 없으면 `ko` 를 대신 쓰세요.

### 왜 헤더인가 (`?lang=en` 이 아니라)

언어는 **요청의 성격**이지 조회 조건이 아닙니다. 같은 병원을 찾는 요청인데 표기만 다를 뿐,
다른 자원을 찾는 게 아닙니다.

쿼리 파라미터로 두면 이런 일이 생깁니다.

- **URL 이 언어를 알아야 합니다.** 모든 링크·북마크·API 호출에 `lang` 을 붙여야 하고,
  한 군데라도 빠뜨리면 **조용히 한국어가 나옵니다.** 에러가 아니라서 알아채기 어렵습니다.
- 캐시 키·로그·문서가 전부 언어를 신경 써야 합니다.
- 헤더는 **브라우저가 알아서 보냅니다.** 아무것도 안 해도 사용자의 언어로 옵니다.

::: warning 트레이드오프 — CDN 캐싱
헤더 방식의 대가는 캐싱입니다. 응답이 언어마다 다르므로 `Vary: Accept-Language` 가 필요한데,
브라우저가 실제로 보내는 값은 `ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7` 처럼 **사용자마다 다릅니다.**
공유 캐시(CDN)에 두면 캐시 항목이 사용자 수만큼 쪼개져 히트율이 무너집니다.

그래서 캐시가 걸린 응답은 **`Cache-Control: private`** 로 브라우저 캐시만 씁니다.
같은 브라우저는 같은 `Accept-Language` 를 보내므로 여기서는 문제가 되지 않습니다.

만약 어떤 응답을 CDN 에 올려야 한다면, 그때는 언어를 URL 로 올리는 편이 낫습니다
(`/v1/en/...`). 지금은 그럴 만큼 트래픽이 크지 않아 헤더 방식의 단순함을 택했습니다.
:::

### 자주 하는 실수

::: danger `Accept-Language` 를 안 보내면 한국어입니다
서버는 절대 실패하지 않고 **조용히 한국어를 줍니다.** "번역이 안 된다"고 느낄 때 헤더부터
확인하세요. `fetch()` 는 이 헤더를 자동으로 붙이지 않습니다 — 직접 넣어야 합니다.
:::

```js
// ❌ 한국어가 온다
await fetch('/healthcare/hospitals?region=11680', {
  headers: { Authorization: `Bearer ${token}` },
});

// ✅
await fetch('/healthcare/hospitals?region=11680', {
  headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'en' },
});
```
