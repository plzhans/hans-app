#!/usr/bin/env bash
#
# config-bundle.sh 가 만든 번들을 서버에 올린다. **번들을 만들지 않는다.**
#
#   APP_ENV=develop IMAGE_TAG=develop scripts/deploy/stage/config-upload.sh
#
# 설정만 바꿨을 때는 이 단계와 app-start.sh 둘이면 끝난다 — 이미지를 다시 굽거나
# 받을 이유가 없다. 설정은 이미지에 안 들어가고 compose 가 마운트하기 때문이다.
#
# [서버에 놓이는 모양]
#
#   <배포경로>/
#   ├── docker-compose.yml     인프라 정의. 거의 안 바뀐다
#   ├── .env                   IMAGE_TAG·APP_UID·APP_GID  ← **여기서 만든다**
#   ├── .env.redis             redis 서비스 전용            0600
#   ├── redis/redis.conf       redis 가 읽는다              0644 (uid 가 다르다)
#   └── config/                앱 설정 뭉치                 0600
#
# **`.env` 만 서버에서 만든다.** uid 를 서버가 스스로 답해야 하기 때문이다 — 마운트된
# 설정은 이 접속 계정 소유이므로 컨테이너가 같은 번호로 돌아야 읽는다. 로컬에서 계산해
# 보내면 배포하는 사람의 번호가 박힌다.
#
# **이 파일이 배포 상태의 전부다.** compose 는 인프라라 거의 안 바뀌고, 무엇이 떠 있는지는
# .env 에만 적힌다.
#
# [환경변수]
#   APP_ENV                     develop | production
#   IMAGE_TAG                   띄울 이미지 태그 (develop · v0.2.0)
#   BE_HANSAPP_DEPLOY_PATH      ~/app/hansapp-dev
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start '설정 전송'

require_env IMAGE_TAG BE_HANSAPP_DEPLOY_PATH
require_ssh

bundle="$DEPLOY_WORK/bundle"
[ -d "$bundle" ] || die "번들이 없다: $bundle
   먼저 만들 것:  scripts/deploy/stage/config-bundle.sh"

# 경로의 ~ 는 서버 셸이 푼다. 로컬에서 풀면 로컬 홈이 박힌다.
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH/redis $BE_HANSAPP_DEPLOY_PATH/config"

send "$bundle/docker-compose.yml" 'docker-compose.yml'

# redis 컨테이너는 uid 가 달라(이미지의 redis) 0600 을 못 읽는다. 시크릿이 없으므로 0644.
send "$bundle/redis/redis.conf" 'redis/redis.conf'
remote "chmod 644 $BE_HANSAPP_DEPLOY_PATH/redis/redis.conf"

# 값을 파싱해 재조립하지 않고 파일째 옮긴다 — 레포의 평문과 서버의 평문이 같은 모양이다.
# 도커가 호스트에서 읽어 환경변수로 넣어 주므로 컨테이너 uid 와 무관하게 0600 이면 된다.
send "$bundle/.env.redis" '.env.redis'
remote "chmod 600 $BE_HANSAPP_DEPLOY_PATH/.env.redis"

# ─────────────────────────────────────────────────────────────────────────────
# config/ — **매번 통째로 갈아끼운다**
#
# 새 디렉터리에 풀고 교체하므로 반쯤 갱신된 상태가 안 생긴다. 앱이 설정을 읽는 도중에
# 파일이 바뀌는 창이 없다는 뜻이다.
# ─────────────────────────────────────────────────────────────────────────────
tar -czf "$DEPLOY_WORK/config.tgz" -C "$bundle" config
send "$DEPLOY_WORK/config.tgz" 'config.tgz'
rm -f "$DEPLOY_WORK/config.tgz"

remote "set -e
  cd $BE_HANSAPP_DEPLOY_PATH

  rm -rf config.new && mkdir config.new
  tar -xzf config.tgz -C config.new --strip-components=1
  rm -f config.tgz

  # 예전 배포가 남긴 것은 컨테이너 uid(10001) 소유라 이 계정이 못 지운다. 그때만 sudo 로
  # 치운다 — 소유권을 안 넘기는 지금 방식으로 한 번 배포되고 나면 이 갈래는 안 쓰인다.
  rm -rf config 2>/dev/null || sudo rm -rf config
  mv config.new config

  # 전부 잠근다. 컨테이너가 이 계정과 같은 uid 로 돌기 때문에 0600 으로도 읽는다 —
  # config.yaml 을 644 로 열거나 소유권을 넘길 이유가 없다.
  find config -type f -exec chmod 600 {} +
  find config -type d -exec chmod 700 {} +
  echo \"  config 소유자 \$(id -u):\$(id -g) · 0600\"
"

# ─────────────────────────────────────────────────────────────────────────────
# .env — 서버가 자기 uid 를 답한다
# ─────────────────────────────────────────────────────────────────────────────
# **시크릿은 안 들어간다.** compose 가 `${IMAGE_TAG}` 보간에 쓰는 자리라 성격이 다르다 —
# 서비스에 주는 값은 서비스별 .env.<서비스> 로 따로 나른다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && {
  printf 'IMAGE_TAG=%s\n' '$IMAGE_TAG'
  printf 'APP_UID=%s\n'   \"\$(id -u)\"
  printf 'APP_GID=%s\n'   \"\$(id -g)\"
} > .env"

echo "  IMAGE_TAG=$IMAGE_TAG"
echo "✅ 설정 전송 완료 → $BE_HANSAPP_DEPLOY_PATH"
