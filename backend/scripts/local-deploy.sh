#!/usr/bin/env bash
#
# **배포는 원래 CI(GitHub Actions)로 하는 게 정석이다.** 이 스크립트는 그걸 대체하지 않는다 —
# CI 를 거치지 않고 **로컬에서 바로 쏘고 싶을 때**, CI 가 세팅하는 것과 **똑같은 환경변수**를
# 채워서 deploy-backend.sh 를 부르는 용도다. 그래서 로컬로 쏜 것과 CI 로 쏜 것이 같다고 말할 수 있다.
# (배포 스크립트를 CI 로만 테스트하면 한 번 고칠 때마다 커밋·푸시·대기를 반복하게 된다.)
#
# **빌드는 하지 않는다.** 먼저 build.sh 로 번들을 만들어 둬야 한다.
#
#   ./backend/scripts/build.sh                              # 1번 — 번들
#   ./backend/scripts/local-deploy.sh develop hansapi-server      # N번 — 환경 + 앱
#   ./backend/scripts/local-deploy.sh develop hansapi-batch       # 앱마다 따로 (서버가 달라도 된다)
#   ./backend/scripts/local-deploy.sh production hansapi-server
#   ./backend/scripts/local-deploy.sh develop config              # 설정만 (.env + config/), 앱은 안 건드림
#
# 하는 일은 둘뿐이다.
#   1. local-deploy-<환경>.env 를 읽어 **CI(GitHub)가 주입할 환경변수를 그대로 채운다**
#   2. 나머지 인자(앱 이름)를 deploy-backend.sh 에 그대로 넘긴다
#
# **배포 로직은 여기 없다.** 그래야 로컬에서 돌린 것과 CI 에서 돌아간 것이 같다고 말할 수 있다.
#
# [환경 파일]
#   backend/local-deploy-<환경>.env — develop → local-deploy-develop.env,
#   production → local-deploy-production.env. 워킹디렉터리(backend) 루트에 둔다.
#   이 스크립트가 읽는 로컬 배포용 설정이라, 스크립트 이름을 그대로 물려 파일명만 봐도
#   "local-deploy.sh 가 읽는 환경 파일" 임을 안다. (앱이 읽는 config/<환경>/<환경>.env 과 별개다.)
#
#   **앱·GitHub·파일명이 전부 같은 환경 이름을 쓴다**(local | develop | production).
#   local-deploy-develop.env 안의 APP_ENV=develop 이고, 앱이 읽는 파일은
#   config/develop/develop.env 이다. 번역이 없으므로 어긋날 자리가 없다.
#
#   **커밋하지 않는다**(SSH 키·WireGuard conf 가 들어간다). local-deploy.env.example 을 복사해 만든다.
#   .gitignore 가 `local-deploy-*.env` 로 **이름을 보고** 막는다. 예전엔 경로로 막았는데
#   (`scripts/ci/deploy-backend.local.sh.env`), 파일을 옮기는 순간 규칙이 헛돌아
#   시크릿이 추적 대상이 됐다. 파일이 어디로 가든 따라가야 한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 이 스크립트가 읽는 로컬 배포 설정은 워킹디렉터리(backend) 루트에 둔다.
#   backend/local-deploy-<환경>.env   (예: local-deploy-develop.env)
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 있는 환경 = 있는 local-deploy-<환경>.env 파일. 목록을 따로 들고 있지 않는다 —
# 목록과 실제 파일이 어긋나는 순간 그 목록은 거짓말이 된다.
environments() {
  local f name found=()
  for f in "$ROOT_DIR"/local-deploy-*.env; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"                # local-deploy-<환경>.env
    name="${name#local-deploy-}"
    found+=("${name%.env}")
  done
  printf '%s\n' "${found[@]+"${found[@]}"}"
}

usage() {
  echo "사용법: $(basename "$0") <환경> [앱]" >&2
  echo >&2
  echo "  <환경>   local-deploy-<환경>.env 를 읽는다" >&2
  echo "  [앱]     기본 hansapi-server. 'config' 를 주면 설정만 배포한다(.env + config/)" >&2
  echo >&2
  echo "예:" >&2
  echo "  $(basename "$0") develop hansapi-server" >&2
  echo "  $(basename "$0") production hansapi-batch" >&2
  echo "  $(basename "$0") develop config            # 설정만 (.env + config/)" >&2
  echo >&2

  local envs
  envs="$(environments)"
  if [ -n "$envs" ]; then
    echo "지금 있는 환경:" >&2
    echo "$envs" | sed 's/^/  /' >&2
  else
    echo "환경 파일이 하나도 없다. 예제를 복사해서 만든다:" >&2
    echo "  cp $ROOT_DIR/local-deploy.env.example $ROOT_DIR/local-deploy-develop.env" >&2
  fi
}

env_name="${1:-}"

case "$env_name" in
  -h | --help | help)
    usage
    exit 0
    ;;
  '')
    echo "❌ 환경을 지정할 것." >&2
    echo >&2
    usage
    exit 2
    ;;
esac
shift # 남은 인자(앱 이름)는 deploy-backend.sh 가 그대로 받는다

env_file="$ROOT_DIR/local-deploy-$env_name.env"

if [ ! -f "$env_file" ]; then
  echo "❌ $(basename "$env_file") 이 없다." >&2
  echo >&2
  echo "이 파일에 GitHub Secrets/Variables 와 **같은 이름으로** 값을 채운다:" >&2
  echo "  cp $ROOT_DIR/local-deploy.env.example $env_file" >&2
  echo >&2
  usage
  exit 1
fi

# set -a: 이 파일에서 정의한 변수를 전부 export 한다. deploy-backend.sh 는 환경변수로만 값을 받는다.
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a

echo "▶ 로컬에서 배포 실행   (환경: $env_name — $(basename "$env_file"))"
# VPN 을 붙일지는 WIREGUARD_CLIENT_CONF_FILE/_PATH 의 유무로만 정해진다. 없으면 이미 사설망에 닿는다고 본다.
# (예전엔 여기서 SKIP_VPN/SKIP_BUILD 를 찍었는데, 둘 다 아무 데서도 안 읽히는 값이었다 —
#  화면에는 나오는데 바꿔도 아무 일이 안 일어나는, 거짓말하는 출력이었다.)
if [ -n "${WIREGUARD_CLIENT_CONF_FILE:-}${WIREGUARD_CLIENT_CONF_PATH:-}" ]; then
  echo "  APP_ENV=${APP_ENV:-develop}  VPN=붙임"
else
  echo "  APP_ENV=${APP_ENV:-develop}  VPN=안 붙임 (이미 사설망에 닿는다고 본다)"
fi
echo

exec "$SCRIPT_DIR/deploy-backend.sh" "$@"
