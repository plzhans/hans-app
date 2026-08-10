# hansapp-admin 이미지. **관리자 API 와 콘솔 SPA 가 같이 들어 있다.**
#
#   docker build -f backend/docker/hansapp-admin.Dockerfile -t <태그> backend
#
# [왜 한 이미지인가]
# 관리자 콘솔은 이 API 하나만 부른다. 따로 배포하면 도메인·인증서·CORS 가 한 벌씩 더 생기고,
# 무엇보다 **화면과 API 의 버전이 따로 움직인다** — "화면은 새것인데 API 는 옛것" 인 창이
# 열리고, 롤백할 때 둘을 손으로 맞춰야 한다. 한 태그가 둘의 버전이면 그 문제가 사라진다.
#
# 앞단 nginx 가 TLS 와 IP 제한을 하고 통째로 프록시한다. 그래서 이 이미지는 평문 HTTP 로
# 뜨고 인증서를 모른다(hansapp-api 와 다른 점이다 — 그쪽은 CF 가 직접 붙어 스스로 TLS 를 끝낸다).
#
# **빌드 컨텍스트는 backend/ 다.** 다만 SPA 는 frontend/ 에 있고 그쪽은 **별개 워크스페이스**라,
# 도커 안에서 빌드하지 않는다 — prebuilt 로만 담는다(아래 with-build 주석 참고).
#
# [최종 구조]
#   /app                       ← WORKDIR. 앱은 여기를 cwd 로 보고 config 를 찾는다
#   ├── hansapp-admin-api/     ← 이름이 남아 있어 컨테이너 안에서 자기가 뭔지 보인다
#   │   ├── dist/                  main.js · build-info.json
#   │   ├── node_modules/
#   │   └── package.json
#   ├── web/                   ← 관리자 콘솔 SPA. apps-admin-api.web.staticDir 가 이 경로다
#   │   ├── index.html
#   │   └── assets/
#   └── config/                ← **이미지엔 비어 있다.** 배포가 마운트한다
#
# 나머지 규칙(비밀을 굽지 않는다·yaml 을 굽지 않는다·uid 를 배포 계정에 맞춘다)은
# hansapp-api.Dockerfile 과 같다. 자세한 설명은 그쪽에 있다.
ARG NODE_VERSION=24.18.0

# ─────────────────────────────────────────────────────────────────────────────
# builder — 설치 · 빌드 · 자립형 디렉터리 추출
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder

ARG PNPM_VERSION=11.10.0

# prisma generate 가 OpenSSL 버전을 감지하지 못하면 쓰지도 않을 엔진이 같이 구워진다.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /build

COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . .

RUN pnpm install --frozen-lockfile --offline --ignore-scripts

ARG GIT_SHA=
ARG GIT_BRANCH=
ENV GIT_SHA=${GIT_SHA} GIT_BRANCH=${GIT_BRANCH}

RUN pnpm --filter "hansapp-admin-api..." build

RUN pnpm deploy --filter hansapp-admin-api --prod --legacy /out

# ─────────────────────────────────────────────────────────────────────────────
# runtime-base
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime-base

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# SPA 정적파일 자리. **이미지의 속성이라 compose 가 아니라 여기 둔다** — 배포가 바뀌어도
# 안 바뀌는 값이고, 값이 비면 앱이 SPA 를 안 내보낸다(로컬은 Vite dev server 로 따로 띄운다).
#
# TLS 는 없다. 앞단 nginx 가 끝낸다 — SSL_CERTIFICATE 를 두지 않는 것이 곧 평문으로 뜨라는 뜻이다.
# jwt 키 디렉터리도 없다. 관리자 토큰은 대칭키(HS256) 하나로 서명한다.
ENV APPS_ADMIN_API_WEB_STATIC_DIR=web

WORKDIR /app

ARG APP_UID=1001
ARG APP_GID=1001
RUN groupadd -g "${APP_GID}" app 2>/dev/null || true; \
    useradd -u "${APP_UID}" -g "${APP_GID}" -M -s /usr/sbin/nologin app 2>/dev/null || true
USER ${APP_UID}:${APP_GID}

CMD ["node", "hansapp-admin-api/dist/main.js"]

# ─────────────────────────────────────────────────────────────────────────────
# prebuilt — CI 가 도커 밖에서 만든 것을 담는다 (develop·production)
#
# **SPA 도 여기서만 들어온다.** frontend/ 는 backend/ 와 별개 워크스페이스라 이 컨텍스트에
# 없다. CI 가 `frontend/ci-build.sh hansapp-admin` 으로 만들어 out/hansapp-admin-web 에
# 옮겨 둔다(scripts/deploy/build.sh 도 같은 일을 한다).
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS prebuilt
COPY out/hansapp-admin-api ./hansapp-admin-api/
COPY out/hansapp-admin-web ./web/

# ─────────────────────────────────────────────────────────────────────────────
# with-build-web — API 는 도커 안에서 빌드하고, SPA 는 밖에서 만든 것을 담는다
#
# **scripts/deploy/build.sh 가 쓰는 타깃이다.** 맥에서는 API 를 도커 밖에서 빌드할 수 없지만
# (pnpm install 이 darwin 바이너리를 깐다) SPA 는 정적파일이라 어디서 만들든 같다.
# 그래서 둘을 갈라, 화면까지 담긴 이미지를 맥에서도 만들 수 있다.
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS with-build-web
COPY --from=builder /out ./hansapp-admin-api/
COPY out/hansapp-admin-web ./web/

# ─────────────────────────────────────────────────────────────────────────────
# with-build — 도커 안에서 빌드부터 한다 (기본 타깃)
#
# **SPA 는 빠진다.** frontend/ 가 컨텍스트 밖이라 여기서는 만들 수가 없고, 컨텍스트에
# out/hansapp-admin-web 이 있다고 가정할 수도 없다(그냥 `docker build` 하면 없다).
# staticDir 을 비워 API 만 뜬다 — 화면은 Vite dev server 로 따로 띄운다.
#
# **마지막 스테이지여야 한다.** --target 을 안 주면 도커가 마지막 것을 만드는데,
# 그때 out/ 을 요구하는 스테이지가 걸리면 있지도 않은 디렉터리를 찾다 죽는다.
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS with-build
ENV APPS_ADMIN_API_WEB_STATIC_DIR=
COPY --from=builder /out ./hansapp-admin-api/
