# hansapp-cli 이미지. **마이그레이션이 주 용도지만 CLI 전부를 담는다.**
#
# 이름을 hansapp-migrate 라 하지 않는 이유는 내용이 CLI 이기 때문이다. db 말고도
# es·healthcare·user 같은 커맨드가 함께 들어 있어, 운영에서 필요할 때 그대로 쓸 수 있다.
#
#   docker compose run --rm migrate            db deploy (기본)
#   docker compose run --rm migrate db status  적용 상태만 확인
#
# **빌드 컨텍스트는 backend/ 다**(다른 이미지와 같다).
#
# [왜 CLI 인가]
# 마이그레이션을 어떻게 실행하는지는 이미 @hansapp/data 의 PrismaMigrationService 가 알고,
# CLI 의 `db deploy` 가 그것을 부른다. 여기서 prisma 를 직접 부르는 스크립트를 따로 두면
# **같은 일을 아는 곳이 둘**이 되어 언젠가 어긋난다. 실제로 그렇게 만들었다가 되돌렸다.
#
# 덤으로 `db status` 로 적용 상태를 볼 수 있다 — 운영에서 "지금 어디까지 갔나" 를 묻는 자리다.
#
# [왜 앱 이미지와 따로인가]
# prisma CLI 와 스키마·마이그레이션 파일이 필요한데, 셋 다 운영 이미지에는 없어야 한다.
# 운영 컨테이너에 스키마를 바꿀 도구가 상주하면 그 컨테이너가 뚫렸을 때 할 수 있는 일이 늘고,
# 앱 DB 계정에 DDL 권한을 주게 된다.
#
# 앱 부팅 때 마이그레이션을 돌리는 방법도 흔하지만 쓰지 않는다. 그러면 스키마가 깨질 때
# 앱까지 같이 죽는다 — 마이그레이션이 실패해도 옛 컨테이너가 계속 서비스하는 편이 낫다.
#
# [한 번 돌고 죽는다]
#   compose  docker compose run --rm migrate
#   k8s      Job (배포 전에 돌고, 성공해야 Deployment 가 갱신된다)
#
# 지금은 compose 로 쓰지만 k3s 로 옮겨도 이 이미지는 그대로 쓴다.

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.10.0

# ─────────────────────────────────────────────────────────────────────────────
# builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder

ARG PNPM_VERSION

# prisma generate 가 OpenSSL 버전을 감지한다. 없으면 쓰지도 않을 엔진이 같이 구워진다.
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

RUN pnpm --filter "hansapp-cli..." build

# **--prod 를 쓰지 않는다.** prisma 는 devDependency 인데 이 이미지에는 그것이 있어야 한다.
# 앱 이미지가 --prod 로 추리는 것과 반대다 — 여기는 도구를 담는 자리다.
RUN pnpm deploy --filter hansapp-cli --legacy /out

# 스키마와 마이그레이션 파일은 pnpm deploy 가 함께 담는다. @hansapp/data 에 files 필드가
# 없어 패키지 전체가 들어가기 때문이다 — PrismaMigrationService 가 찾는
# `<패키지루트>/prisma/<target>` 이 그대로 성립한다.

# ─────────────────────────────────────────────────────────────────────────────
# runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /out ./hansapp-cli/

# root 로 돌리지 않는다. 앱 이미지와 같은 uid 를 쓴다 — 1000 은 리눅스의 첫 일반 계정이라
# 어느 호스트에 배포하든 사람이 앉아 있고, 마운트한 비밀 파일의 소유권을 넘기면 그 계정도
# 읽게 된다. 배포판이 일반 계정에 나눠주지 않는 대역을 쓴다.
RUN groupadd -g 10001 app && useradd -u 10001 -g app -M -s /usr/sbin/nologin app
USER app

# DB 접속정보는 실행할 때 준다(compose 의 env_file). 이미지는 어느 환경인지 모른다.
#
# 인자를 주면 그것을 쓴다 — `db status` 로 적용 상태만 볼 수도 있다.
ENTRYPOINT ["node", "hansapp-cli/dist/main.js"]
CMD ["db", "deploy"]
