#!/usr/bin/env bash
#
# DB 스키마를 로컬에서 반영한다.
#
#   backend/migrate.sh <환경> [이미지태그] [-y]
#
#   backend/migrate.sh develop
#   backend/migrate.sh production v0.5.0
#
# CI 가 주는 환경변수를 같은 규칙으로 채워서 ci-migrate.sh 를 부른다. 실제 로직은 전부
# 거기 있고 여기엔 두지 않는다 — 그래야 로컬과 CI 가 같은 코드를 지나간다.
#
# **배포가 이것을 먼저 부른다.** 스키마가 안 맞으면 새 코드가 뜨지 못하므로 순서가
# 뒤바뀌면 안 된다. 따로 돌리는 건 "스키마만 먼저 올려보고 싶을 때" 를 위한 것이다.
#
# [WireGuard]
# 로컬은 작업 환경이라 VPN 이 이미 붙어 있다고 본다. 그래서 BE_WIREGUARD_PEER_CONF_FILE
# 을 채우지 않는다 — ci-migrate.sh 는 그 변수가 비면 연결을 건드리지 않는다.
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)" # <repo>/backend
AREA="$(basename "$AREA_DIR")"

usage() {
  sed -n '3,8p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

APP_ENV="${1:-}"
IMAGE_TAG="${2:-}"
assume_yes="${3:-}"
[ -n "$APP_ENV" ] || usage

# 배포와 같은 규칙이다 — develop 은 생략하면 최신, production 은 명시해야 한다.
if [ -z "$IMAGE_TAG" ]; then
  case "$APP_ENV" in
    develop) IMAGE_TAG='develop' ;;
    *) echo "❌ production 은 이미지 태그를 명시해야 한다 (예: v0.5.0)" >&2; exit 2 ;;
  esac
fi

case "$APP_ENV" in
  develop | production) ;;
  *)
    echo "❌ 환경은 develop | production 이어야 한다 (받은 값: $APP_ENV)" >&2
    exit 2
    ;;
esac

export APP_ENV IMAGE_TAG

# 자기 디렉터리의 .env 를 읽는다(deploy.sh 와 같은 파일). set -a 로 이 구간에서
# 정의되는 변수만 자동 export 한다.
env_file="$AREA_DIR/.env"
if [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi

# ci-migrate.sh 에 넘기는 값. **be-deploy.yml 의 env: 블록과 같은 목록이어야 한다.**
export BE_HANSAPP_DEPLOY_SSH_HOST="${BE_HANSAPP_DEPLOY_SSH_HOST:-}"
export BE_HANSAPP_DEPLOY_SSH_KEY_FILE="${BE_HANSAPP_DEPLOY_SSH_KEY_FILE:-}"
export BE_HANSAPP_DEPLOY_PATH="${BE_HANSAPP_DEPLOY_PATH:-}"
export BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE="${BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE:-}"

# GHCR 토큰. 마이그레이션 이미지도 private 이라 서버가 받으려면 필요하다.
if [ -z "${GHCR_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  GHCR_TOKEN="$(gh auth token 2>/dev/null || true)"
fi
export GHCR_TOKEN="${GHCR_TOKEN:-}"
export GHCR_USER="${GHCR_USER:-$(gh api user --jq .login 2>/dev/null || echo x)}"
# 평소 로컬은 VPN 이 이미 붙어 있어 비어 있다. 값을 채우면 ci-migrate.sh 가 그 설정으로
# 연결한다 — CI 설정을 로컬에서 시험할 때 쓰라고 열어 둔다.
export BE_WIREGUARD_PEER_CONF_FILE="${BE_WIREGUARD_PEER_CONF_FILE:-}"

# production 은 사람에게 한 번 묻는다. 스키마는 이미지처럼 태그로 되돌릴 수 없다 —
# 되돌리려면 새 마이그레이션을 써야 하므로, 한 번 더 확인할 값이 있다.
if [ "$APP_ENV" = 'production' ] && [ "$assume_yes" != '-y' ] && [ -t 0 ]; then
  echo
  echo "  운영 DB 에 스키마를 반영한다. **되돌리려면 새 마이그레이션이 필요하다.**"
  printf '  계속할까? [y/N] '
  read -r answer
  case "$answer" in
    y | Y | yes | YES) ;;
    *) echo "취소했다."; exit 1 ;;
  esac
fi

exec "$AREA_DIR/ci-migrate.sh"
