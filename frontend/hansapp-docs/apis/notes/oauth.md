OAuth 2.0 토큰 엔드포인트입니다. 인가코드를 토큰으로 바꾸고, 만료 전에 갱신합니다.

**흐름 전체는 [공통 › 로그인 연동](/common#login-integration) 에 있습니다** — 이 페이지는 그
흐름에서 호출하는 엔드포인트의 요청·응답 스키마입니다.

- **Authorization Code + PKCE** 만 지원합니다(`code_challenge_method=S256`).
- 공개 클라이언트라 **client secret 이 없습니다.**
- refresh token 은 **1회용**입니다. 갱신하면 새 값으로 교체되고 직전 값은 무효가 됩니다.

::: tip 엔드포인트 주소는 discovery 에서 읽으세요
`GET /.well-known/openid-configuration` 에 `token_endpoint` · `authorization_endpoint` ·
`jwks_uri` 가 실려 있습니다. URL 을 코드에 박지 마세요.
:::
