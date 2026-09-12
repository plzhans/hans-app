#!/usr/bin/env bash
#
# medifinder 프론트를 로컬에서 배포한다.
#
#   medifinder/frontend/deploy.sh <환경> [-y]
#
#   medifinder/frontend/deploy.sh develop
#   medifinder/frontend/deploy.sh production -y
#
# 하는 일은 하나뿐이다 — **CI 가 주는 환경변수를 같은 규칙으로 채워서** 아래 둘을 순서대로 부른다.
#
#   ci-build.sh   빌드
#   ci-deploy.sh  배포
#
# CI 는 이 둘을 다른 잡으로 나눠 돌린다(전부 빌드한 뒤에 배포를 시작하려고).
# 로컬에서는 나눌 이유가 없으니 여기서 이어서 부른다. 로직은 어느 쪽에도 두지 않는다.
#
# 노리는 것 두 가지:
#   1. 배포를 CI 에 태워보지 않고 로컬에서 그대로 검증한다
#   2. 급할 때 로컬이 우회로가 아니라 정식 배포 경로가 된다 — 같은 코드를 지나가므로
#
# [비밀값]
# 같은 디렉터리의 .env 에서 읽는다 — medifinder/frontend/.env (gitignore).
# 이미 셸에 export 되어 있으면 파일보다 그쪽이 이긴다(한 번만 다른 계정으로 쏠 때).
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$AREA_DIR/../.." && pwd)"

usage() { sed -n '3,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

APP_ENV="${1:-}"
[ -n "$APP_ENV" ] || usage
case "$APP_ENV" in develop | production) ;; *) usage ;; esac
shift

assume_yes=''
[ "${1:-}" = '-y' ] && assume_yes=1

# 셸에 이미 있으면 그게 이긴다. 없으면 .env 에서 읽는다.
if [ -f "$AREA_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$AREA_DIR/.env"
  set +a
fi
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "❌ Cloudflare 자격증명이 없다:" >&2
  [ -n "$CLOUDFLARE_ACCOUNT_ID" ] || echo "     CLOUDFLARE_ACCOUNT_ID" >&2
  [ -n "$CLOUDFLARE_API_TOKEN" ]  || echo "     CLOUDFLARE_API_TOKEN" >&2
  echo "   medifinder/frontend/.env 에 적거나 셸에 export 할 것 (.env.example 참고)." >&2
  exit 1
fi

# CI 가 넘기는 값과 같은 이름으로 채운다. 로컬에서 빠지면 ci-deploy.sh 가 거기서 멈춘다.
export GITHUB_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
export GITHUB_REF_NAME="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
export APP_ENV

if [ "$APP_ENV" = 'production' ] && [ -z "$assume_yes" ]; then
  echo
  echo "⚠ 운영에 배포한다 — medifinder.kr"
  echo "    커밋 ${GITHUB_SHA:0:8} · 브랜치 $GITHUB_REF_NAME"
  printf '  계속할까? [y/N] '
  read -r answer
  case "$answer" in y | Y | yes | YES) ;; *) echo "취소했다." >&2; exit 1 ;; esac
fi

medifinder/frontend/ci-build.sh
medifinder/frontend/ci-deploy.sh
