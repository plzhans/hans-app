# hansapp-batch 이미지. **hansapp-cli 를 같이 담는다.**
#
#   docker build -f backend/docker/hansapp-batch.Dockerfile -t <태그> backend
#
# 배치 컨테이너에서 운영 작업(마이그레이션·시딩·ES 동기화)을 바로 돌릴 수 있게 cli 를
# 함께 넣는다. 서버에 node 를 깔지 않아도 되고, 배치와 같은 코드·같은 설정으로 돈다.
#
#   docker run  --rm <이미지> node cli/dist/main.js db migrate
#   docker exec <배치컨테이너>  node cli/dist/main.js es hospital sync
#
# [최종 구조]
#   /app                    ← WORKDIR. 앱은 여기를 cwd 로 보고 config 를 찾는다
#   ├── config/             ← 환경별 yaml. batch·cli 가 공유한다
#   ├── dist/               ← 주 프로세스(batch). hansapp-api 이미지와 같은 자리
#   ├── node_modules/
#   ├── package.json
#   └── cli/                ← 부가 도구
#       ├── dist/main.js
#       └── node_modules/
#
# **node_modules 가 둘이다.** 두 앱의 의존성이 서로 포함 관계가 아니라(cli 는 search·
# auth-application·commander 가 더 있고, batch 는 schedule·cron·sentry 가 더 있다)
# 하나로 합칠 수가 없다. pnpm deploy 를 두 번 돌려 각자 자립형으로 담는다. 공유되는
# 부분이 중복되므로 이미지가 커진다 — 문제가 되면 그때 줄인다.
#
# 나머지 배경(빌드 컨텍스트·config 를 굽는 이유·비밀을 굽지 않는 이유)은
# hansapp-api.Dockerfile 헤더와 같다.
ARG NODE_VERSION=24

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

RUN pnpm --filter "hansapp-batch..." --filter "hansapp-cli..." build


RUN pnpm deploy --filter hansapp-batch --prod --legacy /out/batch \
 && pnpm deploy --filter hansapp-cli   --prod --legacy /out/cli

# ─────────────────────────────────────────────────────────────────────────────
# runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

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
COPY --from=builder /out/batch ./hansapp-batch/
COPY --from=builder /out/cli   ./hansapp-cli/
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
# **베이스의 node(uid 1000) 대신 전용 유저를 높은 번호로 만든다.**
# 배포가 마운트한 비밀 파일을 컨테이너 uid 소유로 넘기기 때문에, 그 번호에 호스트의
# 로그인 계정이 앉아 있으면 그 계정도 비밀을 읽게 된다.
#
# 1000 은 그 충돌이 **우연이 아니라 보장된** 번호다. 리눅스의 첫 일반 계정이 1000 이고
# 컨테이너 베이스 이미지들의 비루트 유저도 같은 관례를 따라서, 어느 호스트에 배포하든
# 누군가는 거기 있다. 배포판이 일반 계정에 나눠주지 않는 대역을 쓰면 그 문제가 사라진다.
RUN groupadd -g 10001 app && useradd -u 10001 -g app -M -s /usr/sbin/nologin app
USER app

CMD ["node", "hansapp-batch/dist/main.js"]
