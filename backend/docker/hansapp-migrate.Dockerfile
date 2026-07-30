# 마이그레이션 전용 이미지.
#
# **빌드 컨텍스트는 backend/ 다**(다른 이미지와 같다).
#
# [왜 앱 이미지와 따로인가]
# 마이그레이션에는 prisma CLI 와 스키마·마이그레이션 파일이 필요한데, 셋 다 운영 이미지에는
# 없어야 하는 것들이다. 운영 컨테이너 안에 스키마를 바꿀 수 있는 도구가 상주하면 그 컨테이너가
# 뚫렸을 때 할 수 있는 일이 늘고, 앱 DB 계정에 DDL 권한을 주게 된다.
#
# 앱 부팅 때 마이그레이션을 돌리는 방법도 흔하지만 쓰지 않는다. 그러면 **스키마가 깨질 때
# 앱까지 같이 죽는다** — 마이그레이션이 실패해도 옛 컨테이너가 계속 서비스하는 편이 낫다.
#
# [한 번 돌고 죽는다]
#   compose  docker compose run --rm migrate
#   k8s      Job (배포 전에 돌고, 성공해야 Deployment 가 갱신된다)
#
# 지금은 compose 로 쓰지만 k3s 로 옮겨도 이 이미지는 그대로 쓴다 — 그때 바뀌는 것은
# "무엇이 이 컨테이너를 띄우는가" 뿐이다.

ARG NODE_VERSION=24

# ─────────────────────────────────────────────────────────────────────────────
# builder — prisma 버전을 알아내고 스키마를 추린다
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /build

# 스키마와 마이그레이션 파일. 소스 트리에서 그대로 가져온다.
# 앱 이미지처럼 pnpm deploy 로 추리지 않는다 — 여기서 필요한 것은 빌드 산출물이 아니라
# .prisma 파일과 migrations/ 디렉터리라서, 컴파일이 낄 자리가 없다.
COPY packages/hansapp-data/prisma ./prisma
COPY packages/hansapp-data/package.json ./

# **prisma 버전을 소스에서 읽는다.** 여기 숫자를 적어 두면 언젠가 devDependencies 와
# 어긋나고, 그때 "마이그레이션은 되는데 스키마가 안 맞는다" 로 나타난다.
RUN node -p "require('./package.json').devDependencies.prisma.replace(/^[^0-9]*/, '')" > /prisma-version

# ─────────────────────────────────────────────────────────────────────────────
# runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# prisma 엔진이 OpenSSL 을 찾는다. slim 에는 없다.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# prisma CLI 만 넣는다. @prisma/client 는 필요 없다 — 쿼리를 하지 않고 스키마만 반영한다.
COPY --from=builder /prisma-version /tmp/prisma-version
RUN npm install -g "prisma@$(cat /tmp/prisma-version)" && rm /tmp/prisma-version

COPY --from=builder /build/prisma ./prisma
COPY scripts/migrate-entrypoint.sh /usr/local/bin/migrate

# root 로 돌리지 않는다. 앱 이미지와 같은 uid 를 쓴다 — 호스트의 로그인 계정과 겹치지
# 않는 대역이라, 마운트한 파일 소유권을 넘겨도 그 번호에 사람이 앉아 있지 않다.
RUN groupadd -g 10001 app && useradd -u 10001 -g app -M -s /usr/sbin/nologin app \
    && chmod +x /usr/local/bin/migrate
USER app

# DATABASE_URL · DATABASE_LOG_URL 은 실행할 때 준다. 이미지는 어느 환경인지 모른다.
ENTRYPOINT ["migrate"]
