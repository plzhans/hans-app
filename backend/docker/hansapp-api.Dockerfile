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
#   ├── hansapp-api/        ← 이름이 남아 있어 컨테이너 안에서 자기가 뭔지 보인다
#   │   ├── dist/               main.js · build-info.json
#   │   ├── node_modules/
#   │   └── package.json
#   ├── data/               ← 서비스 프롬프트. **환경과 무관해서 구워 넣는다**
#   │   └── healthcare/svc-prompts/
#   └── config/             ← **이미지엔 비어 있다.** 배포가 아래를 마운트한다
#       ├── config.yaml         환경별 yaml
#       ├── .env                환경별 env (APP_ENV 가 여기 들어 있다)
#       └── secrets/            jwt 키 · TLS 인증서
#
# [프롬프트를 이미지에 굽는 이유]
# config/ 와 달리 환경마다 다르지 않고 비밀도 아니다 — 코드와 같이 버전이 매겨지는
# 산출물이라, 뜨는 순간 그 커밋의 프롬프트가 같이 있어야 한다. 마운트로 빼면 서버의
# 파일과 이미지의 코드가 따로 움직인다.
#
# **pnpm deploy 산출물에는 안 담긴다.** 그것은 앱 패키지와 의존성만 추리는데 이 파일들은
# 워크스페이스 루트의 data/ 에 있다. 그래서 최종 스테이지가 컨텍스트에서 직접 복사한다.
# 경로는 config.<환경>.yaml 의 llm.promptDir(기본 data/healthcare/svc-prompts)과 짝이다 —
# 앱이 cwd(/app) 기준으로 찾으므로 WORKDIR 바로 밑이어야 한다.
#
# [이미지에 환경이 없다]
# 컨테이너에는 환경이 하나뿐이라, 자기가 develop 인지 production 인지 파일 구조로 알
# 필요가 없다. 그래서 위 셋 다 **이름에 환경이 들어가지 않고**, 호스트의 환경별 파일을
# 그 자리에 얹는다. 덕분에 이미지도 compose 도 환경을 모른 채로 있을 수 있다.
#
# 앱은 cwd 기준으로 config/ 를 찾는다(packages/hansapp-common/src/env.ts). 이미지에
# pnpm-workspace.yaml 이 없어 findRootDir 이 실패하고 cwd 로 떨어지므로, WORKDIR 바로
# 밑이면 로컬 개발과 같은 방식으로 잡힌다.
#
# **비밀은 굽지 않는다.** 이미지는 어느 환경에서나 같아야 하고, 비밀이 들어가면
# 레지스트리를 읽을 수 있는 사람이 곧 비밀을 읽을 수 있게 된다.
#
# **레포 루트 .nvmrc 와 정확히 같아야 한다.** 메이저만 적으면(node:24) 베이스가 패치를
# 따라 움직여서, 같은 커밋을 다시 구워도 다른 node 가 들어간다. 빌드를 도커 밖으로 뺀
# 뒤로는 "만든 node" 와 "실행하는 node" 가 갈릴 수 있어 더 크게 문제가 된다.
#
# CI 와 build.sh 는 .nvmrc 를 읽어 --build-arg 로 덮어쓴다. 이 기본값은 그것 없이
# 직접 `docker build` 할 때를 위한 것이고, 어긋나면 be.yml 의 검사가 잡는다.
ARG NODE_VERSION=24.18.0

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

# **락파일만 넣고 의존성을 미리 받는다.**
#
# pnpm fetch 는 워크스페이스 구조를 몰라도 된다 — pnpm-lock.yaml 하나만 읽어 스토어를
# 채운다. 그래서 패키지를 추가해도 이 파일을 고칠 일이 없다.
#
# 예전에는 패키지마다 package.json 을 한 줄씩 COPY 했다. install 레이어를 캐시하려면
# 소스보다 매니페스트가 먼저 들어가야 했기 때문인데, **패키지를 추가할 때마다 여기에
# 한 줄을 더해야 했고 빠뜨리면 조용히 이상하게 깨졌다.** 캐시 효과는 같으면서
# 관리할 목록이 없어지는 쪽을 택한다.
COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . .

# --offline: 위에서 받아둔 스토어만 쓴다. 네트워크를 타면 락파일과 어긋난 것을
#            받아올 수 있는데, 그러면 캐시가 맞았는지 아닌지를 알 수 없게 된다.
# --ignore-scripts: 이 시점엔 prisma 클라이언트를 만들 준비가 안 돼 postinstall
#            (prisma generate)이 실패한다. 빌드 단계에서 생성한다.
RUN pnpm install --frozen-lockfile --offline --ignore-scripts

# 이 앱이 실제로 의존하는 패키지만 빌드한다. admin-application·cli·seouldata-subway 는
# hansapp-api 가 안 쓰므로 건드릴 이유가 없다.
# 산출물의 신원(dist/build-info.json)은 **각 앱의 build 스크립트가 만든다**
# (scripts/build-info.mjs). 여기서 만들지 않는 이유는, 그러면 로컬 `pnpm build` 로는
# 안 생겨 로컬과 이미지의 동작이 달라지고, 같은 코드가 Dockerfile 두 곳에 복붙되기 때문이다.
#
# 컨텍스트에 .git 이 없으므로(.dockerignore) sha·branch 를 환경변수로 넘겨준다.
# 안 주면 스크립트가 dev 로 채워 **빌드된 산출물이 아니라는 사실이 드러난다.**
ARG GIT_SHA=
ARG GIT_BRANCH=
ENV GIT_SHA=${GIT_SHA} GIT_BRANCH=${GIT_BRANCH}

RUN pnpm --filter "hansapp-api..." build


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
# runtime-base — 산출물을 뺀 나머지 전부
#
# 산출물이 **어디서 왔는지**만 다른 두 최종 스테이지가 이것을 공유한다.
#
#   --target prebuilt   CI 가 도커 밖에서 만들어 넣어준 것   ← develop·production 둘 다
#   --target with-build 도커 안에서 빌드부터 한다            ← 로컬에서 한 번에 만들 때
#
# CI 는 러너에서 install·build 를 끝내고 이미지는 COPY 만 한다 — 도커 안에서 워크스페이스를
# 통째로 빌드하면 매번 몇 분이 든다.
#
# **맥에서는 prebuilt 를 쓸 수 없다.** 아키텍처(arm64)는 같아도 OS 가 다르다 — 맥에서
# pnpm install 을 하면 esbuild·@swc·prisma 엔진이 전부 darwin-arm64 로 깔려서 리눅스
# 컨테이너에서 돌지 않는다. CI 러너는 애초에 리눅스라 그 문제가 없다.
#
#   CI (ubuntu-24.04-arm)   linux/arm64   → 도커 밖 빌드 가능 → prebuilt
#   맥 (darwin/arm64)        리눅스가 아님  → 도커 안 빌드 필수 → runtime
#
# **with-build 가 파일의 마지막 스테이지다.** --target 을 안 주면 도커가 마지막 것을 만드는데,
# 그때 prebuilt 가 걸리면 있지도 않은 out/ 을 찾다가 죽는다. 기본값이 안전한 쪽이어야 한다.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime-base

# prisma 엔진이 OpenSSL 을 찾는다. slim 에는 없다.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# 컨테이너 안에서의 자리. **환경 이름이 들어가지 않는다.**
#
# 컨테이너에는 환경이 하나뿐이므로 자기가 develop 인지 production 인지 파일 구조로
# 알 필요가 없다. 배포는 호스트의 `config/<환경>/` 을 여기로 마운트하고, 앱은 환경을
# 모르는 이 경로만 본다. 그래서 compose 에 환경별 값이 남지 않는다.
#
# 이미지의 속성이라 compose 가 아니라 여기 둔다 — 배포가 바뀌어도 안 바뀌는 값이다.
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
#
# (실제 COPY 는 아래 두 최종 스테이지가 각자 한다.)
#
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

# APP_ENV 는 마운트된 config/.env 에서 앱이 스스로 읽는다(compose 가 넘기지 않는다).
# 기본값을 두지 않아, 없으면 뜨지 않는다 — Redis 네임스페이스와 Elasticsearch 인덱스가
# 이 값에서 파생되므로 조용히 아무 환경으로 떨어지면 엉뚱한 데이터를 건드린다.
CMD ["node", "hansapp-api/dist/main.js"]

# ─────────────────────────────────────────────────────────────────────────────
# prebuilt — CI 가 도커 밖에서 만든 것을 담는다
#
# 컨텍스트의 out/<앱>/ 이 `pnpm deploy --prod` 결과와 같은 모양이어야 한다(dist +
# node_modules 를 가진 자립형 디렉터리). .dockerignore 가 dist·node_modules 를 자르므로
# 그 아래만 예외로 되돌려 뒀다 — 안 그러면 **빈 디렉터리가 조용히 복사된다.**
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS prebuilt
COPY out/hansapp-api ./hansapp-api/
COPY data/healthcare/svc-prompts ./data/healthcare/svc-prompts/

# ─────────────────────────────────────────────────────────────────────────────
# with-build — 도커 안에서 빌드부터 한다 (로컬 · 기본 타깃)
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS with-build
COPY --from=builder /out ./hansapp-api/
COPY --from=builder /build/data/healthcare/svc-prompts ./data/healthcare/svc-prompts/
