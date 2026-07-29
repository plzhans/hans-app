#!/usr/bin/env bash
#
# backend 를 로컬에서 배포한다.
#
#   backend/deploy.sh <환경> <이미지태그> [-y]
#
#   backend/deploy.sh develop    develop-a1b2c3d
#   backend/deploy.sh production v0.2.0
#   backend/deploy.sh production v0.1.0        ← 롤백. 재빌드 없이 태그만 바꾼다
#
# CI 가 주는 환경변수를 같은 규칙으로 채워서 ci-deploy.sh 를 부른다. 배포 로직은 전부
# 거기 있고 여기엔 두지 않는다 — 그래야 로컬과 CI 가 같은 코드를 지나간다.
#
# **이미지를 굽지 않는다.** 이미 레지스트리에 있는 것을 서버가 당기게 할 뿐이다.
# 로컬에서 새로 구워야 하면 backend/build.sh 를 먼저 돌린다.
#
# [비밀값]
# backend/.env 에서 읽는다(gitignore). 이미 셸에 export 되어 있으면 그쪽이 이긴다.
#
# [WireGuard]
# 로컬은 작업 환경이라 VPN 이 이미 붙어 있다고 본다. 그래서 BE_WIREGUARD_PEER_CONF_FILE
# 을 채우지 않는다 — ci-deploy.sh 는 그 변수가 비면 연결을 건드리지 않는다.
# CI 는 매번 새 러너라 직접 올리고, 그쪽 키는 이 머신 키와 별개라 서로 간섭하지 않는다.
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)"   # <repo>/backend
AREA="$(basename "$AREA_DIR")"

usage() {
  sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

APP_ENV="${1:-}"
IMAGE_TAG="${2:-}"
assume_yes="${3:-}"
[ -n "$APP_ENV" ] && [ -n "$IMAGE_TAG" ] || usage

case "$APP_ENV" in
  develop | production) ;;
  *)
    echo "❌ 환경은 develop | production 이어야 한다 (받은 값: $APP_ENV)" >&2
    exit 2
    ;;
esac

export APP_ENV IMAGE_TAG

# 자기 디렉터리의 .env 를 읽는다. set -a 로 이 구간에서 정의되는 변수만 자동 export 한다.
env_file="$AREA_DIR/.env"
if [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  echo "· $AREA/.env 읽음"
fi

# ─────────────────────────────────────────────────────────────────────────────
# ci-deploy.sh 에 넘기는 값. **be-deploy.yml 의 env: 블록과 같은 목록이어야 한다.**
# 여기에 이름을 다시 적는 이유는, 이 파일만 읽어도 무엇이 넘어가는지 보이게 하기 위해서다.
# ─────────────────────────────────────────────────────────────────────────────
export BE_HANSAPP_DEPLOY_SSH_HOST="${BE_HANSAPP_DEPLOY_SSH_HOST:-}"
export BE_HANSAPP_DEPLOY_SSH_KEY_FILE="${BE_HANSAPP_DEPLOY_SSH_KEY_FILE:-}"
export BE_HANSAPP_DEPLOY_PATH="${BE_HANSAPP_DEPLOY_PATH:-}"
export BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE="${BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE:-}"
# 로컬은 VPN 이 이미 붙어 있으므로 비운다. 채우면 ci-deploy.sh 가 새로 연결하려 든다.
export BE_WIREGUARD_PEER_CONF_FILE=''

missing=''
for n in BE_HANSAPP_DEPLOY_SSH_HOST BE_HANSAPP_DEPLOY_SSH_KEY_FILE BE_HANSAPP_DEPLOY_PATH; do
  eval "v=\$$n"
  [ -n "$v" ] || missing="$missing  $n"$'\n'
done
if [ -n "$missing" ]; then
  echo "❌ 배포 정보가 없다:" >&2
  printf '%s' "$missing" >&2
  echo >&2
  echo "   cp $AREA/.env.example $AREA/.env  후 값을 채울 것 (gitignore 라 커밋되지 않는다)." >&2
  exit 1
fi

echo
echo "  환경        $APP_ENV"
echo "  이미지 태그  $IMAGE_TAG"
echo "  서버        $BE_HANSAPP_DEPLOY_SSH_HOST"
echo

# production 은 사람에게 한 번 묻는다. tty 가 없으면 물어볼 상대가 없으므로 건너뛴다.
if [ "$APP_ENV" = 'production' ] && [ "$assume_yes" != '-y' ] && [ -t 0 ]; then
  printf 'production 에 %s 를 배포한다. 계속할까? [y/N] ' "$IMAGE_TAG"
  read -r answer
  case "$answer" in
    y | Y | yes | YES) ;;
    *) echo "취소했다."; exit 1 ;;
  esac
fi

exec "$AREA_DIR/ci-deploy.sh"
