# medifinder-web

병원 검색 사이트 `medifinder.kr` 프론트엔드.

- **스택**: React 19 · Vite 6 · TypeScript · Tailwind 3 · TanStack Query · react-router v7 · i18next(ko/en/ja)
- **구조**: Feature-sliced (`src/{app,features,shared}`)
- **API**: hansapp-api OpenAPI 기반 타입드 클라이언트(openapi-fetch)

## 실행

```bash
pnpm install
pnpm local        # .env.local (http://127.0.0.1:3000) 로 개발 서버
pnpm dev          # .env.develop (develop-api) 로 개발 서버
pnpm build        # tsc -b && vite build
```

## API 타입 동기화

`/healthcare/hospitals` 등 백엔드 스키마가 바뀌면 타입을 재생성한다.

```bash
pnpm api:sync     # 백엔드 openapi:gen(local) 실행 후 타입 재생성
# 또는 개별로
pnpm spec:local   # ../../backend 에서 openapi.json 재생성
pnpm api:gen      # docs/openapi/hansapp-openapi.json → src/shared/api/schema.d.ts
```

## 환경변수

| 변수 | 설명 |
|---|---|
| `VITE_HANSAPP_BASE_URL` | hansapp-api base URL (공유 백엔드) |
| `VITE_HANSAPP_CLIENT_ID` | hansapp WEB 클라이언트 ID. `X-Client-Id` 헤더로 전송된다. 공개값이며, 서버가 이 ID 에 등록된 오리진과 요청 `Origin` 을 대조한다 |
| `VITE_AUTH_WEB_URL` | 로그인 UI(인증웹) base URL. 마이페이지 링크에 쓴다. 로그인 이동 주소 자체는 discovery 가 정한다 |

> 서비스 키(`sk_...`)는 **프론트에 두지 않는다.** 오리진 검사를 받지 않는 비밀값이라
> 번들에 포함되는 순간 그대로 유출된다 — 서버-서버 호출에서만 쓴다.

## 로그인

백엔드가 없는 앱이라 **OAuth 2.0 인가 코드 + PKCE(S256)** 로 직접 토큰을 받는다
(`@hansapp/auth-sdk`). 엔드포인트는 `/.well-known/openid-configuration` 에서 읽고,
access token 은 JWKS 공개키로 브라우저에서 검증한다.

**리디렉션 URI 를 클라이언트에 등록해 둬야 한다.** 등록값과 정확히 일치해야 인가 코드가 나온다.

| 환경 | redirect URI |
|---|---|
| local | `http://127.0.0.1:5173/auth/callback` |
| develop | `https://develop.medifinder.kr/auth/callback` |
| production | `https://medifinder.kr/auth/callback` |

```bash
hansapp-cli app redirect --app <appId> --client <clientId> \
  --add https://medifinder.kr/auth/callback
```

토큰은 **세션 쿠키**(`medifinder.auth`)에 둔다 — 브라우저를 닫으면 로그아웃되고, 열려 있는
동안은 모든 탭이 공유한다. Capacitor 쿠키 API 를 쓰므로 네이티브에서도 같은 코드로 돈다.

로그인 이후는 이 앱 안에서 끝난다. 마이페이지(`/me`)는 로그인할 때 받아 둔 `GET /users/me`
캐시를 그리는 **읽기 전용** 화면이고, 로그아웃은 이 브라우저의 토큰만 지운다 — HansApp 계정
세션은 건드리지 않는다(다른 서비스까지 로그아웃시키지 않는다). 이름·비밀번호·소셜 연동을
고치는 자리는 HansApp 인증웹 하나로 두고, 마이페이지에서 링크로 보낸다.

> 쿠키는 **포트를 가리지 않는다.** 로컬에서 앱을 전부 127.0.0.1 로 띄우면 이름이 겹치는
> 순간 옆 앱과 세션을 덮어쓴다. 그래서 저장 키에 앱 접두사(`medifinder.auth`)를 붙이고,
> PKCE·탭 통신 채널 이름도 그 접두사에서 파생시킨다.

## 문서

- [앱 출시 준비](docs/app-release.md) — Capacitor 로 스토어에 올릴 때 걸리는 것들.
  아직 착수 전이고, 네이티브 플랫폼(`ios/`·`android/`)도 만들지 않았다.
- [이용 통계](docs/google-analytics.md) — Google Analytics. **콘솔 설정이 개인정보처리방침의 근거라서**
  저장소 밖에 있는 값까지 여기에 적어 둔다.

## 알려진 제약 (TODO)

- 백엔드 `/healthcare/hospitals` 는 현재 `source`/`page`/`size` 만 지원한다. 키워드/지역
  검색 파라미터가 없어, 프론트의 키워드는 **불러온 페이지 내 클라이언트 필터링**으로 동작한다.
  서버측 검색 파라미터가 생기면 `src/features/clinic/api.ts` 에서 쿼리로 전환할 것.
- 통합 목록에는 상세 단건 엔드포인트가 없다(현재 hira/nmc origin 별 상세만 존재). 상세 페이지는
  통합 상세 API 가 준비되면 추가.
