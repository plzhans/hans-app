#!/usr/bin/env bash
#
# 배포를 **로컬에서** 돌린다. CI 에 올리지 않고 고칠 수 있어야 한다 —
# 배포 스크립트를 CI 로만 테스트하면 한 번 고칠 때마다 커밋·푸시·대기를 반복하게 된다.
#
# **빌드는 하지 않는다.** 먼저 build.sh 로 번들을 만들어 둬야 한다.
#
#   ./backend/scripts/build.sh                              # 1번 — 번들
#   ./backend/scripts/deploy.sh develop hansapi-server      # N번 — 환경 + 앱
#   ./backend/scripts/deploy.sh develop hansapi-batch       # 앱마다 따로 (서버가 달라도 된다)
#   ./backend/scripts/deploy.sh production hansapi-server
#   ./backend/scripts/deploy.sh develop config              # 설정만 (.env + config/), 앱은 안 건드림
#
# 하는 일은 둘뿐이다.
#   1. deploy.<환경>.env 를 읽어 **GitHub 이 주입할 환경변수를 그대로 채운다**
#   2. 나머지 인자(앱 이름)를 deploy-backend.sh 에 그대로 넘긴다
#
# **배포 로직은 여기 없다.** 그래야 로컬에서 돌린 것과 CI 에서 돌아간 것이 같다고 말할 수 있다.
#
# [환경 파일]
#   backend/config/<환경>/.deploy.env — develop → config/develop/.deploy.env,
#   production → config/production/.deploy.env.
#   배포 시크릿은 스크립트가 아니라 설정이라, 그 환경의 다른 매체(.env·인증서)와 같이
#   backend/config/<환경>/ 에 둔다.
#
#   **앱·GitHub·디렉터리가 전부 같은 이름을 쓴다**(local | develop | production).
#   config/develop/.deploy.env 안의 APP_ENV=develop 이고, 앱이 읽는 파일은
#   config/develop/.env.develop 이다. 번역이 없으므로 어긋날 자리가 없다.
#
#   **커밋하지 않는다**(SSH 키·WireGuard conf 가 들어간다). .deploy.env.example 을 복사해 만든다.
#   .gitignore 가 `.deploy*.env` 로 **이름을 보고** 막는다. 예전엔 경로로 막았는데
#   (`scripts/ci/deploy-backend.local.sh.env`), 파일을 옮기는 순간 규칙이 헛돌아
#   시크릿이 추적 대상이 됐다. 파일이 어디로 가든 따라가야 한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 배포 시크릿은 스크립트가 아니라 설정이라, 그 환경의 다른 매체와 같이 backend/config/<환경>/ 에 둔다.
#   backend/config/<환경>/.deploy.env   (예: config/develop/.deploy.env)
CONFIG_DIR="$(cd "$SCRIPT_DIR/../config" && pwd)"

# 있는 환경 = .deploy.env 가 있는 config/<환경>/ 디렉터리. 목록을 따로 들고 있지 않는다 —
# 목록과 실제 파일이 어긋나는 순간 그 목록은 거짓말이 된다.
environments() {
  local f name found=()
  for f in "$CONFIG_DIR"/*/.deploy.env; do
    [ -e "$f" ] || continue
    name="$(basename "$(dirname "$f")")"   # config/<환경>/.deploy.env → <환경>
    found+=("$name")
  done
  printf '%s\n' "${found[@]+"${found[@]}"}"
}

usage() {
  echo "사용법: $(basename "$0") <환경> [앱]" >&2
  echo >&2
  echo "  <환경>   deploy.<환경>.env 를 읽는다" >&2
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
    echo "  mkdir -p $CONFIG_DIR/develop && cp $CONFIG_DIR/.deploy.env.example $CONFIG_DIR/develop/.deploy.env" >&2
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

env_file="$CONFIG_DIR/$env_name/.deploy.env"

if [ ! -f "$env_file" ]; then
  echo "❌ $(basename "$env_file") 이 없다." >&2
  echo >&2
  echo "이 파일에 GitHub Secrets/Variables 와 **같은 이름으로** 값을 채운다:" >&2
  echo "  mkdir -p $(dirname "$env_file") && cp $CONFIG_DIR/.deploy.env.example $env_file" >&2
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
# VPN 을 붙일지는 WIREGUARD_CLIENT_CONF 의 유무로만 정해진다. 없으면 이미 사설망에 닿는다고 본다.
# (예전엔 여기서 SKIP_VPN/SKIP_BUILD 를 찍었는데, 둘 다 아무 데서도 안 읽히는 값이었다 —
#  화면에는 나오는데 바꿔도 아무 일이 안 일어나는, 거짓말하는 출력이었다.)
if [ -n "${WIREGUARD_CLIENT_CONF:-}${WIREGUARD_CLIENT_CONF_FILE:-}" ]; then
  echo "  APP_ENV=${APP_ENV:-develop}  VPN=붙임"
else
  echo "  APP_ENV=${APP_ENV:-develop}  VPN=안 붙임 (이미 사설망에 닿는다고 본다)"
fi
echo

exec "$SCRIPT_DIR/deploy-backend.sh" "$@"
