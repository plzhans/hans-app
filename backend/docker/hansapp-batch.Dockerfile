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

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# 두 앱과 그 의존성만. 필터를 두 개 주면 합집합이 잡힌다.
RUN pnpm --filter "hansapp-batch..." --filter "hansapp-cli..." build

# 산출물의 신원. 두 앱이 각자 자기 dist 에 갖는다 — cli 로 뭔가 이상한 게 나왔을 때
# "어느 빌드의 cli 였나" 를 답할 수 있어야 하기 때문이다.
ARG GIT_SHA=unknown
RUN node -e "\
  const fs=require('fs'); \
  for (const app of ['hansapp-batch','hansapp-cli']) { \
    const p=require('./apps/'+app+'/package.json'); \
    fs.writeFileSync('apps/'+app+'/dist/build-info.json', JSON.stringify({ \
      version: p.version + '+' + '${GIT_SHA}'.slice(0,7), \
      semver: p.version, sha: '${GIT_SHA}', \
      builtAt: new Date().toISOString(), node: process.version \
    }, null, 2)); \
  } \
"

RUN pnpm deploy --filter hansapp-batch --prod --legacy /out/batch \
 && pnpm deploy --filter hansapp-cli   --prod --legacy /out/cli

# ─────────────────────────────────────────────────────────────────────────────
# runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /out/batch ./
COPY --from=builder /out/cli   ./cli/
COPY --from=builder /build/config/*.yaml ./config/

USER node

CMD ["node", "dist/main.js"]
