# hansapp-api 이미지.
#
#   docker build -f backend/docker/hansapp-api.Dockerfile -t <태그> backend
#
# **빌드 컨텍스트는 backend/ 다.** 앱 디렉터리가 아니다 — 워크스페이스 의존성
# (packages/*, clients/*)과 lockfile 이 있어야 설치가 되기 때문이다. Dockerfile 을
# apps/hansapp-api/ 안에 두지 않은 것도 그래서다. 그 자리에 있으면 컨텍스트가 그
# 디렉터리인 것처럼 읽힌다.
#
# [최종 구조]
#   /app                    ← WORKDIR. 앱은 여기를 cwd 로 보고 config 를 찾는다
#   ├── config/             ← 환경별 yaml. 비밀 아님
#   ├── dist/               ← main.js · build-info.json
#   ├── node_modules/
#   └── package.json
#
# [config 를 굽는 이유]
# 앱은 <cwd>/config/config.<환경>.yaml 을 읽는다(packages/hansapp-common/src/env.ts).
# 이미지에 pnpm-workspace.yaml 이 없어 findRootDir 이 실패하고 cwd 로 떨어지므로,
# WORKDIR 바로 밑에 config/ 가 있으면 서버 배포와 같은 방식으로 잡힌다.
#
# **비밀은 굽지 않는다.** config/.env* 와 config/<환경>/ 아래 에셋(jwt 키·인증서)은
# 실행할 때 마운트하거나 환경변수로 넣는다. 이미지는 어느 환경에서나 같아야 하고,
# 비밀이 들어가면 레지스트리를 읽을 수 있는 사람이 곧 비밀을 읽을 수 있게 된다.
#
# NODE_VERSION 은 레포 루트 .nvmrc 와 일치해야 한다.
ARG NODE_VERSION=24

# ─────────────────────────────────────────────────────────────────────────────
# builder — 설치 · 빌드 · 자립형 디렉터리 추출
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

# 소스보다 먼저 매니페스트만 넣어 install 레이어를 캐시한다. 소스만 바뀐 빌드에서
# 의존성 설치를 통째로 건너뛴다.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/hansapp-api/package.json                 apps/hansapp-api/
COPY apps/hansapp-batch/package.json               apps/hansapp-batch/
COPY apps/hansapp-cli/package.json                 apps/hansapp-cli/
COPY packages/hansapp-admin-application/package.json packages/hansapp-admin-application/
COPY packages/hansapp-application/package.json     packages/hansapp-application/
COPY packages/hansapp-auth-application/package.json packages/hansapp-auth-application/
COPY packages/hansapp-common/package.json          packages/hansapp-common/
COPY packages/hansapp-data/package.json            packages/hansapp-data/
COPY packages/hansapp-search/package.json          packages/hansapp-search/
COPY clients/kr-go-juso/package.json               clients/kr-go-juso/
COPY clients/kr-go-nts/package.json                clients/kr-go-nts/
COPY clients/kr-or-hira/package.json               clients/kr-or-hira/
COPY clients/krdata-core/package.json              clients/krdata-core/
COPY clients/krdata-hira/package.json              clients/krdata-hira/
COPY clients/krdata-nmc/package.json               clients/krdata-nmc/
COPY clients/seouldata-subway/package.json         clients/seouldata-subway/

# --ignore-scripts: 이 시점엔 prisma 스키마가 아직 없어 postinstall(prisma generate)이
# 실패한다. 스키마를 넣은 뒤 빌드 단계에서 생성한다.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# 이 앱이 실제로 의존하는 패키지만 빌드한다. admin-application·cli·seouldata-subway 는
# hansapp-api 가 안 쓰므로 건드릴 이유가 없다.
RUN pnpm --filter "hansapp-api..." build

# 산출물의 신원. 숫자는 package.json 에서, sha 는 빌드 인자로 받는다.
#
# **버전을 여기서 계산하지 않는다.** package.json 은 "마지막으로 릴리스한 버전"(개발
# 중에는 <다음>-dev)이고, 그 판단은 사람과 release-please 의 몫이다. 빌드는 그 값을
# 읽어 sha 를 붙일 뿐이다. GIT_SHA 가 없으면 unknown 이 박혀 눈에 보인다.
ARG GIT_SHA=unknown
RUN node -e "\
  const fs=require('fs'), p=require('./apps/hansapp-api/package.json'); \
  fs.writeFileSync('apps/hansapp-api/dist/build-info.json', JSON.stringify({ \
    version: p.version + '+' + '${GIT_SHA}'.slice(0,7), \
    semver: p.version, sha: '${GIT_SHA}', \
    builtAt: new Date().toISOString(), node: process.version \
  }, null, 2)); \
"

# pnpm deploy: 이 앱과 그 의존성만 추려 자립형 디렉터리를 만든다(node_modules 포함).
#
# --legacy: pnpm 10 부터는 inject-workspace-packages=true 인 워크스페이스에서만 기본
#   동작한다. 그 설정을 켜면 워크스페이스 전체의 설치 방식이 바뀌므로 여기서만 우회한다.
#
# 앱의 package.json 에 "files": ["dist"] 가 있어야 dist 가 담긴다. pnpm deploy 는 배포
# 루트가 되는 패키지를 npm pack 규칙으로 담는데, dist 는 gitignore 라 그냥 두면 통째로
# 빠진다(워크스페이스 의존성은 디렉터리째 복사돼서 이 함정이 안 보인다).
RUN pnpm deploy --filter hansapp-api --prod --legacy /out

# ─────────────────────────────────────────────────────────────────────────────
# runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# prisma 엔진이 OpenSSL 을 찾는다. slim 에는 없다.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /out ./
COPY --from=builder /build/config/*.yaml ./config/

# root 로 돌리지 않는다. 컨테이너가 뚫렸을 때 할 수 있는 일을 줄인다.
USER node

# APP_ENV 가 어느 config.<환경>.yaml 을 읽을지 정한다. 기본값을 두지 않는 이유는,
# 안 주고 띄웠을 때 develop 설정으로 조용히 도는 것보다 즉시 드러나는 편이 낫기 때문이다.
CMD ["node", "dist/main.js"]
