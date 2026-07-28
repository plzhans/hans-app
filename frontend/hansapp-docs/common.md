# 공통

모든 API 에 똑같이 적용되는 규칙입니다. **요청에 인증 헤더가 필요합니다**(언어 헤더는 선택).

```http
GET /healthcare/hospitals?region=11680
Authorization: Bearer sk_...        # 인증(서비스 키)  — 없으면 401
Accept-Language: en                 # 다국어           — 없으면 한국어
```

## 인증

인증은 성격이 다른 **두 층**으로 나뉩니다. 둘 다 시작점은 **앱 관리 콘솔**(plzhans 포털)입니다.

| 층 | 무엇을 인증하나 | 대표 방식 |
| --- | --- | --- |
| **① API 호출 인증** | *어느 앱*이 API 를 부르는가 | 서비스 키 · 클라이언트 ID |
| **② 로그인 연동** | *어느 사용자*로 로그인했는가 | OAuth2 Authorization Code + PKCE → JWT |

API 만 호출한다면 ①만 있으면 됩니다. 사용자를 우리 계정으로 로그인시키려면 ②까지 붙입니다.

### 콘솔 앱 등록 (시작 전 준비)

무엇을 하든 먼저 콘솔에서 **앱을 등록**하고, 용도에 맞는 자격증명을 만들어야 합니다.

1. **앱 관리 콘솔**에서 **앱을 등록**합니다.
2. 용도에 맞게 발급합니다.
   - **서버 → 서버 호출**: **서비스 키**를 만듭니다.
   - **브라우저·앱 호출 / 로그인 연동**: **웹 클라이언트**를 생성합니다(공개 클라이언트 ID 발급).
3. 웹 클라이언트에는 **오리진**과(로그인까지 붙이려면) **리디렉션 URI** 를 등록합니다.
   - **승인된 JavaScript 원본(origins)** — `X-Client-Id` 로 API 를 부를 수 있는 도메인.
   - **승인된 리디렉션 URI(redirectUris)** — 로그인 후 인가코드를 돌려받을 URL(정확히 일치해야 함).

---

### API 호출 인증

요청에는 아래 둘 중 **하나**만 실으면 됩니다. 없거나 유효하지 않으면 **401** 입니다.

| 방식 | 헤더 | 언제 쓰나 |
| --- | --- | --- |
| **서비스 키** | `Authorization: Bearer sk_...` | 서버 → 서버(백엔드에서 호출). 오리진은 보지 않음 |
| **클라이언트 ID** | `X-Client-Id: <clientId>` | 브라우저·네이티브 앱. WEB 은 등록한 오리진에서만 |

#### 서비스 키 (서버용)

발급받은 서비스 키를 `Authorization` 헤더에 **Bearer** 로 담습니다. 형식은
`sk_{appId}_{keyId}_{랜덤}` 이라 키값만 봐도 어느 앱·키인지 식별됩니다(서버는 원문을 저장하지
않고 SHA-256 해시만으로 검증).

```bash
curl -H "Authorization: Bearer sk_10000_1_XXXXXXXXXXXX" \
  "https://api.plzhans.com/healthcare/hospitals?region=11680"
```

::: warning
서비스 키는 **비밀값**입니다. 브라우저·앱에 넣지 말고 **서버에서만** 쓰세요. 유출되면 콘솔에서 즉시
재발급하면 이전 키는 무효화됩니다.
:::

#### 클라이언트 ID (브라우저·앱용)

클라이언트 ID 는 **공개 식별자**라 숨길 필요가 없습니다. `X-Client-Id` 헤더로 보냅니다.

```js
await fetch('https://api.plzhans.com/healthcare/hospitals?region=11680', {
  headers: { 'X-Client-Id': 'YOUR_CLIENT_ID' },
});
```

- **WEB 클라이언트**: 요청 **Origin** 이 콘솔에 등록한 *승인된 JavaScript 원본* 과 일치해야 합니다
  (브라우저 CORS + 서버 검증). 등록 안 된 도메인에서의 호출은 거부됩니다.
- **iOS / Android 클라이언트**: 커스텀 스킴·PKCE 기반(런타임은 추후). 지금은 식별자 등록 용도.

::: tip
각 API 페이지의 **Try it** 상단 **Authorize** 에서 Bearer(서비스 키) 또는 X-Client-Id 를 입력하면
인증된 요청으로 테스트할 수 있습니다.
:::

---

### 로그인 연동 (OAuth2 · PKCE) {#login-integration}

앱에서 **우리 계정으로 사용자를 로그인**시키는 표준 흐름입니다. **Authorization Code Grant + PKCE**
만 지원하며, 사양은 discovery 문서(`/.well-known/openid-configuration`)에 그대로 실려 있습니다.

| 항목 | 값 |
| --- | --- |
| `grant_types_supported` | `authorization_code`, `refresh_token` |
| `response_types_supported` | `code` |
| `code_challenge_methods_supported` | `S256` **(PKCE 필수)** |
| `token_endpoint_auth_methods_supported` | `none` **(공개 클라이언트 — client secret 없음)** |

::: warning 사전 준비
콘솔에서 **웹 클라이언트**를 만들고, 로그인 후 돌아올 **리디렉션 URI(redirectUris)** 를 등록하세요.
토큰 교환 때 요청의 `redirect_uri` 는 등록값과 **정확히 일치**해야 합니다(오픈 리다이렉트 방지).
:::

#### PKCE — 공개 클라이언트 보호

공개 클라이언트는 client secret 을 안전하게 보관할 수 없으므로, 대신 **PKCE(RFC 7636)** 로 인가코드
가로채기를 막습니다. 요청마다 1회용 짝을 만듭니다.

- **`code_verifier`** — 난수 문자열(43~128자). 클라이언트만 보관합니다.
- **`code_challenge`** = `BASE64URL(SHA256(code_verifier))` — 인가 요청에 실어 보냅니다.
- 토큰 교환 때 `code_verifier` 원문을 제시하면, 서버가 `SHA256` 을 다시 계산해 **인가코드에 박아둔
  challenge 와 대조**합니다. 일치하지 않으면 교환이 거부됩니다. `S256` 만 받습니다(`plain` 불가).

#### 흐름

```mermaid
sequenceDiagram
    autonumber
    participant App as 내 앱
    participant Auth as 인증 포털<br/>(authorization_endpoint)
    participant API as Hans API<br/>(/oauth/token)

    App->>App: code_verifier · code_challenge · state 생성
    App->>Auth: 인증 포털로 이동<br/>redirect_uri + code_challenge + state
    Note over Auth: 사용자가 인증 포털에서 로그인
    Auth-->>App: 등록한 redirect_uri 로 복귀<br/>code=ac_... + state
    App->>App: 받은 state 가 보낸 값과 같은지 확인
    App->>API: POST /oauth/token<br/>code + code_verifier
    API-->>App: accessToken · refreshToken
```

1. **1회용 값 생성** — `code_verifier`, `code_challenge`, CSRF 대조용 `state`.
2. **인증 포털로 이동** — discovery 의 `authorization_endpoint`(예: `https://auth.plzhans.com/login`)로
   사용자를 보냅니다. 사용자는 인증 포털에서 로그인합니다(로그인 방식은 포털이 알아서 처리합니다).
3. **인가코드 수신** — 로그인이 끝나면 등록해 둔 `redirect_uri` 로 되돌아오며, 쿼리에 1회용
   인가코드(`code=ac_...`)와 `state` 가 실립니다. 보낸 `state` 와 같은지 먼저 확인하세요.
4. **토큰 교환** — 인가코드와 `code_verifier` 를 `/oauth/token` 으로 교환합니다.

::: warning 인가코드(`ac_...`)는 1회용이고 수명이 짧습니다
- **한 번만** 교환할 수 있습니다. 같은 코드를 두 번 보내면 거부됩니다(재사용된 코드로 간주).
- **30초** 안에 교환해야 합니다. 시간이 지난 코드는 만료되어 무효입니다.
- 만료·재사용으로 교환이 실패하면 그 코드는 버리고 **로그인 흐름을 처음부터** 다시 시작하세요.
:::

::: tip `state` 는 왜 보내나요
인가 요청을 **시작할 때** 만들어 보내고, 콜백에서 **그대로 돌려받는** 임의값입니다.
- **원래 용도는 위조 요청 식별(CSRF 방어)입니다.** 내가 시작한 요청을 가려내는 식별값이라, 콜백으로
  돌아온 `state` 가 내가 보낸 값과 **다르면 공격자가 유도한 콜백**으로 보고 버립니다. 그래서 추측할 수
  없는 난수여야 하고, 교환 전에 반드시 대조해야 합니다.
- 부가적으로 **로그인 후 돌아갈 위치·문맥을 실어 나르는 파라미터**로도 쓸 수 있습니다(예: 원래 보던
  페이지 경로). 다만 이건 곁다리 활용이고, 본래 역할은 위의 식별·검증입니다.
:::

```bash
curl -X POST "https://api.plzhans.com/oauth/token" \
  -H "Content-Type: application/json" \
  -H "Origin: https://your-app.example.com" \
  -d '{
    "grant_type": "authorization_code",
    "code": "ac_XXXXXXXX",
    "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  }'
```

```json
{
  "accessToken": "eyJhbGciOiJFUzI1NiIsImtpZCI6...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "refreshToken": "rt_XXXXXXXX",
  "refreshExpiresAt": "2026-09-20T12:00:00.000Z"
}
```

발급된 `accessToken` 은 이후 `Authorization: Bearer <accessToken>` 로 API 호출에 씁니다.

#### 토큰 갱신

`POST /oauth/token` 에 `grant_type=refresh_token` 으로 refresh token(`rt_...`)을 바디에 담아 보내면
**rotate** 되어(이전 refresh 는 무효화) 새 토큰 쌍이 나옵니다. access token 이 만료되기 전에 갱신하세요.

로그아웃은 저장한 토큰을 폐기하면 됩니다 — rotate 된 이전 refresh token 은 다시 쓰이지 않습니다.

---

### 토큰 만료 시간 {#token-ttl}

| 토큰 | 기본 만료 | 비고 |
| --- | --- | --- |
| **access token** | **1시간**(3600초) | JWT. 짧게 두고 refresh 로 재발급 |
| **refresh token** | **60일** | rotate(갱신)마다 60일로 **재연장(sliding)** |
| 인가코드(`ac_...`) | 30초 | 1회용. 토큰 교환에 즉시 소진 |

::: tip 값의 출처
만료 시간은 서버 설정으로 조정될 수 있습니다. **access token 의 실제 만료는 토큰 응답의 `expiresIn`**,
**refresh 의 만료는 `refreshExpiresAt`**(ISO8601) 을 신뢰하세요. 하드코딩하지 마세요.
:::

---

### JWT 검증 (JWS · 공개키 · `.well-known`) {#jwt-verify}

access token 은 **JWT**이며, 서명은 **JWS** 표준을 따릅니다. **비대칭 서명(ES256)** 을 쓰므로,
토큰을 받는 리소스 서버는 **공개키(JWKS)만으로** 서명을 검증할 수 있습니다 — 개인키는 절대 노출되지 않습니다.

| 엔드포인트 | 용도 |
| --- | --- |
| `GET /.well-known/openid-configuration` | OIDC discovery — 아래 주소·지원 사양을 한 문서로 노출 |
| `GET /.well-known/jwks.json` | 공개키 셋(JWKS). 토큰 헤더의 `kid` 로 해당 공개키를 골라 검증 |

- **discovery 를 기준으로 삼으세요.** `issuer` · `authorization_endpoint` · `token_endpoint` · `jwks_uri` ·
  지원 grant/PKCE 방식이 모두 여기 실립니다. URL 을 코드에 박지 말고 이 문서에서 읽으세요.
- **검증 절차** — 토큰 헤더의 `kid` 로 `jwks.json` 에서 공개키를 찾고 서명·만료(`exp`)를 검증합니다.
  모르는 `kid` 는 거부됩니다(키 로테이션 시 옛 공개키는 `retired` 로 남아 검증은 계속 가능).
- **`iss`(발급자) 검증** — access token 에는 발급자(`iss`)가 담깁니다. 검증하는 쪽도 discovery 의
  `issuer` 값과 일치하는지 대조하세요.

```bash
# discovery — 여기서 jwks_uri·token_endpoint 등을 읽는다
curl "https://api.plzhans.com/.well-known/openid-configuration"

# 공개키 셋 — kid 로 매칭해 검증
curl "https://api.plzhans.com/.well-known/jwks.json"
```

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
