# hansapp-batch 이미지. **배치 하나만 담는다.**
#
#   docker build -f backend/docker/hansapp-batch.Dockerfile -t <태그> backend
#
# [최종 구조]
#   /app                    ← WORKDIR. 앱은 여기를 cwd 로 보고 config 를 찾는다
#   ├── config/             ← 배포가 마운트한다
#   └── hansapp-batch/
#       ├── dist/
#       ├── node_modules/
#       └── package.json
#
# **예전에는 cli 를 같이 담았다.** 배치 컨테이너에서 마이그레이션·시딩을 바로 돌리려는
# 것이었는데, 컨테이너를 api·batch·cli 로 가르면서 필요가 없어졌다 — cli 는 자기 이미지로
# 따로 뜬다(compose 의 migrate 서비스).
#
# 겸사겸사 앞뒤가 안 맞던 것도 사라진다. 그때 담기던 cli 는 --prod 로 추려져 prisma
# (devDependency)가 빠져 있었으므로, 정작 광고하던 `db migrate` 를 돌릴 수 없었다.
#
# 나머지 배경(빌드 컨텍스트·config 를 굽는 이유·비밀을 굽지 않는 이유)은
# hansapp-api.Dockerfile 헤더와 같다.
ARG NODE_VERSION=24.18.0

# ─────────────────────────────────────────────────────────────────────────────
# builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder

ARG PNPM_VERSION=11.10.0

# **openssl 은 빌더에도 필요하다.** 없으면 prisma generate 가 OpenSSL 버전을 감지하지
# 못하고 'native' 타겟을 openssl-1.1.x 로 잘못 잡는다. 그러면 데비안 bookworm(OpenSSL 3.x)
# 에서 쓰지도 않을 엔진이 19MB 씩 같이 구워진다. 감지가 되면 native 가 스키마에 명시된
# linux-arm64-openssl-3.0.x 와 같아져 중복이 사라진다.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /build

# **락파일만 넣고 의존성을 미리 받는다.**
#
# pnpm fetch 는 워크스페이스 구조를 몰라도 된다 — pnpm-lock.yaml 하나만 읽어 스토어를
# 채운다. 그래서 패키지를 추가해도 이 파일을 고칠 일이 없다.
#
# 예전에는 패키지마다 package.json 을 한 줄씩 COPY 했다. install 레이어를 캐시하려면
# 소스보다 매니페스트가 먼저 들어가야 했기 때문인데, **패키지를 추가할 때마다 여기에
# 한 줄을 더해야 했고 빠뜨리면 조용히 이상하게 깨졌다.**
COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . .

# --offline: 위에서 받아둔 스토어만 쓴다. 네트워크를 타면 락파일과 어긋난 것을 받아올 수 있다.
# --ignore-scripts: prisma generate(postinstall)는 빌드 단계에서 돌린다.
RUN pnpm install --frozen-lockfile --offline --ignore-scripts

# 두 앱과 그 의존성만. 필터를 두 개 주면 합집합이 잡힌다.
# 산출물의 신원(dist/build-info.json)은 **각 앱의 build 스크립트가 만든다**
# (scripts/build-info.mjs). 여기서 만들지 않는 이유는, 그러면 로컬 `pnpm build` 로는
# 안 생겨 로컬과 이미지의 동작이 달라지고, 같은 코드가 Dockerfile 두 곳에 복붙되기 때문이다.
#
# 컨텍스트에 .git 이 없으므로(.dockerignore) sha·branch 를 환경변수로 넘겨준다.
# 안 주면 스크립트가 dev 로 채워 **빌드된 산출물이 아니라는 사실이 드러난다.**
ARG GIT_SHA=
ARG GIT_BRANCH=
ENV GIT_SHA=${GIT_SHA} GIT_BRANCH=${GIT_BRANCH}

RUN pnpm --filter "hansapp-batch..." build


RUN pnpm deploy --filter hansapp-batch --prod --legacy /out

# ─────────────────────────────────────────────────────────────────────────────
# runtime-base — 산출물을 뺀 나머지 전부
#
# 산출물이 **어디서 왔는지**만 다른 두 최종 스테이지가 이것을 공유한다.
#
#   --target prebuilt   CI 가 도커 밖에서 만들어 넣어준 것   ← develop·production 둘 다
#   --target runtime    도커 안에서 처음부터 빌드            ← 로컬에서 한 번에 만들 때
#
# CI 는 러너에서 install·build 를 끝내고 이미지는 COPY 만 한다 — 도커 안에서 워크스페이스를
# 통째로 빌드하면 매번 몇 분이 든다. 로컬에는 그 산출물이 없으므로 runtime 쪽이 남아 있다.
#
# **runtime 이 파일의 마지막 스테이지다.** --target 을 안 주면 도커가 마지막 것을 만드는데,
# 그때 prebuilt 가 걸리면 있지도 않은 out/ 을 찾다가 죽는다. 기본값이 안전한 쪽이어야 한다.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime-base

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# 컨테이너 안에서의 자리. **환경 이름이 들어가지 않는다.**
# 컨테이너에는 환경이 하나뿐이므로 자기가 develop 인지 production 인지 파일 구조로 알
# 필요가 없다. 배포는 호스트의 config/<환경>/ 을 여기로 마운트한다.
ENV AUTH_JWT_KEY_DIR=config/secrets/jwt \
    SSL_CERTIFICATE=config/secrets/ssl/fullchain.pem \
    SSL_CERTIFICATE_KEY=config/secrets/ssl/privkey.pem

WORKDIR /app

# **앱 이름을 경로에 남긴다.** 컨테이너 안에서 `ls` 만 쳐도 자기가 무엇인지 보인다.
#
# 예전에는 /app 바로 밑에 dist 를 풀어서, api 이미지와 batch 이미지가 안에서 똑같아 보였다.
# batch 는 더 나빴다 — batch 가 /app/dist, cli 가 /app/cli 로 둘의 층이 달랐다.
#
# WORKDIR 은 /app 그대로다. 앱이 cwd 기준으로 config/ 를 찾으므로 여기를 옮기면 설정
# 탐색과 마운트 경로가 같이 흔들린다. **코드만 한 층 내려가고 config/ 는 공유한다** —
# batch 이미지에서 batch 와 cli 가 같은 설정을 보는 것도 그래서 자연스럽다.
# (실제 COPY 는 아래 두 최종 스테이지가 각자 한다.)
# **yaml 을 굽지 않는다.** 환경별 설정은 배포가 config/config.yaml 로 얹는다.
#
# 예전에는 config.local/develop/production.yaml 셋을 다 넣고 APP_ENV 로 골랐다. 그러면
# 이미지가 자기가 모르는 환경들의 설정까지 들고 다니게 되고, 컨테이너 안에 환경 개념이
# 남는다. 컨테이너에는 환경이 하나뿐이라 그럴 이유가 없다.
#
# 마운트가 없으면 부팅에서 막힌다(config-source 가 설정 파일이 없다고 던진다) — 조용히
# 빈 설정으로 뜨는 것보다 낫다.

# root 로 돌리지 않는다. 컨테이너가 뚫렸을 때 할 수 있는 일을 줄인다.
#
# **번호를 배포 호스트에 맞춘다.** 마운트된 설정·비밀은 배포 계정 소유인데, 컨테이너가
# 다른 uid 로 돌면 Permission denied 로 못 읽는다. 예전에는 배포가 그 파일들의 소유자를
# 컨테이너 uid 로 넘겨서 맞췄지만, 두 번호를 같게 두면 그 단계 자체가 사라진다.
#
# 기본 1001 은 배포 대상(Oracle Cloud)의 첫 로그인 계정 번호다. 다른 호스트면
# --build-arg APP_UID=... 로 덮는다. compose 도 같은 값을 user: 로 넘긴다.
ARG APP_UID=1001
ARG APP_GID=1001
# 그 번호가 베이스 이미지에 이미 있으면(node 는 1000) 생성이 실패한다. 계정이 없어도
# USER 는 번호로 동작하므로 실패를 삼킨다 — 필요한 것은 이름이 아니라 번호다.
RUN groupadd -g "${APP_GID}" app 2>/dev/null || true; \
    useradd -u "${APP_UID}" -g "${APP_GID}" -M -s /usr/sbin/nologin app 2>/dev/null || true
USER ${APP_UID}:${APP_GID}

CMD ["node", "hansapp-batch/dist/main.js"]

# ─────────────────────────────────────────────────────────────────────────────
# prebuilt — CI 가 도커 밖에서 만든 것을 담는다
#
# 컨텍스트의 out/<앱>/ 이 `pnpm deploy --prod` 결과와 같은 모양이어야 한다(dist +
# node_modules 를 가진 자립형 디렉터리). .dockerignore 가 dist·node_modules 를 자르므로
# 그 아래만 예외로 되돌려 뒀다 — 안 그러면 **빈 디렉터리가 조용히 복사된다.**
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS prebuilt
COPY out/hansapp-batch ./hansapp-batch/

# ─────────────────────────────────────────────────────────────────────────────
# runtime — 도커 안에서 구운 것을 담는다 (로컬 · 기본 타깃)
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS runtime
COPY --from=builder /out ./hansapp-batch/
