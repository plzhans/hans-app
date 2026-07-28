# hansapp-docs

Hans API 명세 문서. VitePress + [vitepress-openapi](https://github.com/enzonotario/vitepress-openapi) 로
OpenAPI 스펙에서 API 페이지를 자동 생성한다. 산출물은 **완전 정적 사이트**다.

기본 스펙 경로는 레포 루트의 **`docs/openapi/hansapp-openapi.json`** 이며, backend 가 이 파일을 생성하고
이 문서 프로젝트가 그걸 읽어 빌드한다.

## 스펙 갱신

스펙은 backend 에서 생성한다. backend 코드(컨트롤러/DTO/servers)가 바뀌면 다시 생성한다.

```bash
# backend/ 에서 — 기본 경로(docs/openapi/hansapp-openapi.json)로 내보냄
pnpm openapi:gen

# 출력 경로/파일명 지정(옵셔널): --out / -o / --out= / 위치 인자, 또는 OPENAPI_OUT 환경변수
pnpm --filter hansapp-api-server openapi:gen -- --out /path/to/spec.json
```

서버·DB 없이 preview 모드로 스펙만 뽑으므로 DB 연결이 필요 없다.
환경별 servers 는 `APP_ENV`(local|develop|production)로 결정된다.

## 개발 / 빌드

```bash
pnpm install       # (최초 1회, esbuild 빌드 승인은 pnpm-workspace.yaml 에 설정됨)
pnpm docs:dev      # 로컬 개발 서버 (http://localhost:5173)
pnpm docs:build    # 정적 사이트 빌드 → .vitepress/dist (이미 있는 스펙을 그대로 사용)
pnpm docs:preview  # 빌드 결과 미리보기

# 스펙 생성 + 빌드를 한 번에 (환경별)
pnpm build:local   # servers: Local, Development
pnpm build:dev     # servers: Development, Local
pnpm build:prod    # servers: Production 만

# 스펙만 환경별로 재생성
pnpm spec:local | spec:dev | spec:prod
```

`pnpm docs:build` 결과(`.vitepress/dist`)를 정적 호스팅(예: S3, GitHub Pages, Netlify)에 그대로 올리면 된다.
서브경로에 배포하려면 `.vitepress/config.ts` 의 `base` 를 조정한다.

## 구조

```
../../docs/openapi/hansapp-openapi.json  # backend 가 내보낸 OpenAPI 스펙 (레포 루트, 문서의 원천)
.vitepress/config.ts          # 사이트 설정 + 스펙 기반 사이드바 자동 생성 (+ vite fs.allow)
.vitepress/theme/index.ts     # vitepress-openapi 컴포넌트/스펙 등록
operations/[operationId].md   # 오퍼레이션별 동적 라우트 (정적 프리렌더)
operations/[operationId].paths.js  # 스펙의 모든 오퍼레이션 → 정적 경로 목록
index.md                      # 홈
```

> 스펙 파일은 프로젝트 밖(레포 루트 `docs/openapi/`)에 있으므로, VitePress 는 `.vitepress/config.ts` 의
> `vite.server.fs.allow` 로 상위 경로 접근을 허용한다.
