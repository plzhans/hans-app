#!/usr/bin/env bash
#
# stage/ 의 모든 스크립트가 맨 위에서 source 한다. **단독으로 실행하지 않는다** —
# 그래서 이름 앞에 밑줄이 붙는다(단계가 아니다).
#
# [왜 단계마다 파일이 갈려 있나]
# 배포 절차를 읽는 사람이 "지금 서버를 건드리는 중인가" 를 파일 이름만으로 알 수 있게
# 하려는 것이다. 예전에는 한 스크립트가 접속·복호화·전송·기동을 전부 갖고 있어서,
# 복호화 규칙을 확인하려면 SSH 옵션 구성을 지나가야 했다.
#
# 각 단계는 **혼자 돌 수 있다.** 앞 단계가 남긴 것($DEPLOY_WORK)을 읽고, 자기 몫만 하고,
# 다음을 위해 남긴다. 그래서 설정만 다시 밀거나 재기동만 하는 것이 명령 하나로 끝난다.
#
# [$DEPLOY_WORK — 단계 사이에 남는 것]
#
#   ssh_config    ssh-connect.sh 가 만든다. 이후 모든 ssh/scp 가 -F 로 이것만 본다
#   id_deploy     SSH 개인키
#   known_hosts   있을 때만
#   bundle/       config-bundle.sh 가 만든 **평문** 설정 트리
#
# **평문이 디스크에 남는다.** 예전에는 한 스크립트가 mktemp -d 로 잡고 트랩으로 지웠지만,
# 단계를 나누면 그럴 수가 없다 — 다음 단계가 그것을 읽어야 하기 때문이다. 그래서 지우는
# 것이 마지막 단계(secret-cleanup.sh)의 명시적인 일이 되었고, CI 는 always() 로 부른다.
# 로컬에서 개별 단계만 돌렸다면 **직접 불러야 한다.**
#
# [값은 오로지 환경변수로만 받는다]
# 누가 채웠는지 이 스크립트들은 모른다.
#   CI    .github/workflows/be-deploy-develop.yml 이 secrets/vars 로 주입
#   로컬  scripts/deploy/deploy-develop.sh 가 backend/.env 를 읽어 주입
#
# 그래서 배포를 CI 에 태우지 않고 로컬에서 그대로 검증할 수 있고, 급할 때 로컬이
# 우회로가 아니라 정식 배포 경로가 된다. 둘이 같은 코드를 지나가기 때문이다.

# 이 파일은 source 전용이다. 직접 실행하면 아무 일도 안 일어나므로 크게 알린다.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "❌ _common.sh 는 source 전용이다. stage/ 안의 단계 스크립트를 실행할 것." >&2
  exit 1
fi

set -euo pipefail

# <repo>. stage/ 가 scripts/deploy/ 아래에 있으므로 세 단계 위다.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# 배포 대상의 위치. **도구와 대상이 다른 곳에 있을 수 있다.**
#
# CI 는 도구를 main 에서, 배포되는 것(설정·compose)을 릴리스 태그에서 따로 받아 올 수
# 있다 — 도구는 계속 나아지는 물건이라 옛 릴리스에 묶을 이유가 없고, 배포되는 것은 묶을
# 때로 고정돼야 하기 때문이다. 로컬에서는 둘이 같은 트리에 있어 기본값이 맞는다.
#
# source 하는 쪽(config-bundle.sh)이 쓴다. shellcheck 는 그 방향을 못 본다.
# shellcheck disable=SC2034
AREA_DIR="${BACKEND_DIR:-$ROOT_DIR/backend}"

# ─────────────────────────────────────────────────────────────────────────────
# 로그 · 실패
# ─────────────────────────────────────────────────────────────────────────────

# 단계 하나가 시작됨을 선언한다. **로그 접기는 부수 효과지 본체가 아니다** — CI 에서는
# 마침 ::group:: 으로 접히고, 로컬에서는 제목 한 줄로 보인다.
#
# 닫는 짝을 손으로 맞추지 않는다. EXIT 트랩이 닫으므로 빠뜨릴 수가 없다.
_stage_name=''

stage_start() {
  _stage_name="$1"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
  trap _stage_end EXIT
}

_stage_end() {
  local code=$?
  # **어디서 멈췄는지 스레드에 남긴다.** 워크플로는 "배포 잡이 실패했다" 까지만 알 수
  # 있고, 그것이 wireguard 인지 pull 인지는 이쪽만 안다. 그 한 줄이 있으면 CI 로그를
  # 열기 전에 대개 짐작이 끝난다. (토큰이 없으면 send 쪽이 조용히 넘어간다.)
  if [ "$code" -ne 0 ] && [ -n "$_stage_name" ]; then
    "$ROOT_DIR/scripts/deploy/ci-slack-send.sh" \
      --thread "${SLACK_DEPLOY_THREAD_TIMESTAMP:-}" \
      --title "⚠️  '$_stage_name' 에서 멈췄다" >/dev/null 2>&1 || true
  fi
  [ -n "${GITHUB_ACTIONS:-}" ] && [ -n "$_stage_name" ] && echo "::endgroup::"
  _stage_name=''
  return $code
}

die() {
  # 열린 그룹을 먼저 닫는다. 안 닫으면 CI 에서 **에러 메시지가 접힌 그룹 안에 숨는다.**
  if [ -n "${GITHUB_ACTIONS:-}" ] && [ -n "$_stage_name" ]; then echo "::endgroup::"; fi
  echo "❌ $*" >&2
  # 트랩이 한 번 더 끝내지 않도록 이름을 비우되, 슬랙 알림은 남겨야 하므로 트랩 자체는
  # 살려 둔다 — 위에서 그룹만 닫았고 알림은 트랩이 보낸다.
  exit 1
}

require_env() {
  local missing='' name value
  for name in "$@"; do
    eval "value=\${$name:-}"
    [ -n "$value" ] || missing="$missing  $name"$'\n'
  done
  if [ -n "$missing" ]; then
    echo "❌ 환경변수가 비어 있다:" >&2
    printf '%s' "$missing" >&2
    echo "   CI 면 .github/workflows/be-deploy-develop.yml 의 env: 를," >&2
    echo "   로컬이면 scripts/deploy/deploy-develop.sh 를 볼 것." >&2
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 환경 · 작업 디렉터리
# ─────────────────────────────────────────────────────────────────────────────
APP_ENV="${APP_ENV:-}"
require_env APP_ENV
case "$APP_ENV" in
  develop | production) ;;
  *) die "APP_ENV 는 develop | production 이어야 한다 (받은 값: $APP_ENV)" ;;
esac

# **단계 사이에 남아야 하므로 mktemp 를 쓰지 않는다.** 경로가 매번 달라지면 다음 단계가
# 앞 단계의 결과를 찾을 수 없다. 레포 안에 두는 것은 로컬에서 눈으로 확인하기 위해서다
# (.gitignore 에 있다).
DEPLOY_WORK="${DEPLOY_WORK:-$ROOT_DIR/.deploy-work/$APP_ENV}"
mkdir -p "$DEPLOY_WORK"
chmod 700 "$DEPLOY_WORK"

# ─────────────────────────────────────────────────────────────────────────────
# 값 받기
# ─────────────────────────────────────────────────────────────────────────────

# 값이 **경로면 그 파일을, 내용이면 그대로** 쓴다.
#
# GitHub Secrets 에는 파일을 못 넣어 내용이 문자열로 들어온다. 반면 로컬에서는
# ~/.ssh/id_rsa 처럼 경로를 가리키는 편이 자연스럽다. 양쪽을 다 받아 주면 사람이
# "여기선 내용, 저기선 경로" 를 기억하지 않아도 된다.
materialize() {
  local value="$1" dest="$2"
  if [ -f "$value" ]; then
    cp "$value" "$dest"
  else
    printf '%s\n' "$value" > "$dest"
  fi
  chmod 600 "$dest"
}

# ─────────────────────────────────────────────────────────────────────────────
# 서버 접속 — ssh-connect.sh 가 만든 ssh_config 하나만 본다
#
# 예전에는 ssh_opts 배열을 만들어 스크립트 안에서 돌려썼는데, 단계를 나누면 그것을 넘길
# 방법이 없다. 설정 파일로 바꾸면 **파일이 곧 상태**라 각 단계가 -F 만 붙이면 된다.
# ─────────────────────────────────────────────────────────────────────────────
SSH_CONFIG="$DEPLOY_WORK/ssh_config"

require_ssh() {
  [ -f "$SSH_CONFIG" ] || die "SSH 설정이 없다: $SSH_CONFIG
   먼저 접속을 준비할 것:  scripts/deploy/stage/ssh-connect.sh"
}

# 서버에서 명령을 돌린다. 호스트 별칭은 ssh_config 안에 'target' 으로 박혀 있다.
remote() {
  require_ssh
  ssh -F "$SSH_CONFIG" target "$@"
}

# 서버로 파일을 보낸다. 두 번째 인자는 배포 경로 기준 상대 경로다.
send() {
  require_ssh
  scp -F "$SSH_CONFIG" -q "$1" "target:$BE_HANSAPP_DEPLOY_PATH/$2"
}
