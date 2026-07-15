# medifinder-web

병원 검색 사이트 `medifinder.kr` 프론트엔드.

- **스택**: React 19 · Vite 6 · TypeScript · Tailwind 3 · TanStack Query · react-router v7 · i18next(ko/en/ja)
- **구조**: Feature-sliced (`src/{app,features,shared}`)
- **API**: hansapi-server OpenAPI 기반 타입드 클라이언트(openapi-fetch)

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
pnpm api:gen      # docs/openapi/openapi_hansapi.json → src/shared/api/schema.d.ts
```

## 환경변수

| 변수 | 설명 |
|---|---|
| `VITE_API_BASE_URL` | hansapi-server base URL |
| `VITE_API_KEY` | 인증 토큰(Authorization: Bearer). 통합 병원 API 는 Jwt/ApiKey 필요 |

## 알려진 제약 (TODO)

- 백엔드 `/healthcare/hospitals` 는 현재 `source`/`page`/`size` 만 지원한다. 키워드/지역
  검색 파라미터가 없어, 프론트의 키워드는 **불러온 페이지 내 클라이언트 필터링**으로 동작한다.
  서버측 검색 파라미터가 생기면 `src/features/clinic/api.ts` 에서 쿼리로 전환할 것.
- 통합 목록에는 상세 단건 엔드포인트가 없다(현재 hira/nmc origin 별 상세만 존재). 상세 페이지는
  통합 상세 API 가 준비되면 추가.
