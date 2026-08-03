#!/usr/bin/env bash
#
# backend 를 develop 서버에 배포한다. **로컬 진입점이다.**
#
#   scripts/deploy/deploy-develop.sh                  전체
#   scripts/deploy/deploy-develop.sh --config-only    설정만 (빌드·이미지·스키마 없음)
#   scripts/deploy/deploy-develop.sh --skip-migrate   스키마만 건너뜀
#
# CI 가 주는 환경변수를 같은 규칙으로 채워서 stage/ 의 단계들을 순서대로 부른다.
# **배포 로직은 여기 없다** — 전부 stage/ 안에 있고, CI(be-deploy-develop.yml)도 같은
# 것들을 같은 순서로 부른다. 그래서 로컬이 우회로가 아니라 정식 배포 경로가 된다.
#
# [단계를 따로 부를 수도 있다]
# 이 파일은 편의를 위한 묶음일 뿐이다. 무엇이 배포될지만 보고 싶다거나 재기동만 하고
# 싶으면 그 단계만 부르면 된다:
#
#   APP_ENV=develop scripts/deploy/stage/config-bundle.sh   # 서버 없이, VPN 없이
#   APP_ENV=develop scripts/deploy/stage/app-start.sh       # 재기동만
#
# 다만 그때는 **정리도 직접 해야 한다**(stage/secret-cleanup.sh) — 평문이 .deploy-work
# 아래에 남는다.
#
# [이미지를 굽지 않는다]
# 이미 레지스트리에 있는 것을 서버가 당기게 할 뿐이다. 로컬에서 새로 구워야 하면
# scripts/deploy/build.sh 를 먼저 돌린다.
#
# [비밀값]
# backend/.env 에서 읽는다(gitignore). 이미 셸에 export 되어 있으면 그쪽이 이긴다.
#
# [WireGuard]
# 로컬은 작업 환경이라 VPN 이 이미 붙어 있다고 본다 — scripts/deploy/wireguard.sh 를
# 부르지 않는다. CI 는 매번 새 러너라 직접 올리고, 그쪽 키는 이 머신 키와 별개다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)" # <repo>
STAGE_DIR="$(cd "$(dirname "$0")" && pwd)/stage"
AREA_DIR="${BACKEND_DIR:-$ROOT_DIR/backend}"
AREA="$(basename "$AREA_DIR")"

usage() {
  sed -n '3,7p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

config_only=''
skip_migrate=''

for arg in "$@"; do
  case "$arg" in
    --config-only) config_only=1 ;;
    --skip-migrate) skip_migrate=1 ;;
    -h | --help) usage ;;
    *) echo "❌ 모르는 옵션: $arg" >&2; exit 2 ;;
  esac
done

# develop 은 움직이는 태그 하나만 쓴다. 고를 것이 없으므로 인자로 받지 않는다 —
# 특정 버전을 띄우려면 그것은 운영의 일이고 be-deploy-production.yml 이 한다.
export APP_ENV='develop'
export IMAGE_TAG='develop'

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
# stage/ 에 넘기는 값. **be-deploy-develop.yml 의 env: 블록과 같은 목록이어야 한다.**
# 여기에 이름을 다시 적는 이유는, 이 파일만 읽어도 무엇이 넘어가는지 보이게 하기 위해서다.
# ─────────────────────────────────────────────────────────────────────────────
export BE_HANSAPP_DEPLOY_SSH_HOST="${BE_HANSAPP_DEPLOY_SSH_HOST:-}"
export BE_HANSAPP_DEPLOY_SSH_KEY_FILE="${BE_HANSAPP_DEPLOY_SSH_KEY_FILE:-}"
export BE_HANSAPP_DEPLOY_PATH="${BE_HANSAPP_DEPLOY_PATH:-}"
export BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE="${BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE:-}"
# 로컬은 기본 경로(~/.config/sops/age/keys.txt)에 이미 있어 보통 비운다.
export AGE_SECRET_KEY_FILE="${AGE_SECRET_KEY_FILE:-}"
# 슬랙은 CI 의 것이다. 로컬 배포가 배포 채널에 끼어들 이유가 없다.
export SLACK_DEPLOY_THREAD_TIMESTAMP="${SLACK_DEPLOY_THREAD_TIMESTAMP:-}"

# 서버가 private 이미지를 받을 때 쓸 GHCR 토큰. CI 는 GITHUB_TOKEN 이 자동으로 들어오지만
# 로컬엔 그런 게 없어서, .env 에 없으면 gh CLI 로그인에서 빌려 온다.
# **read:packages 스코프가 있어야 한다.** 없으면 pull 이 unauthorized 로 떨어진다:
#   gh auth refresh -h github.com -s read:packages
if [ -z "${GHCR_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  GHCR_TOKEN="$(gh auth token 2>/dev/null || true)"
  [ -n "$GHCR_TOKEN" ] && echo "· GHCR 토큰: gh auth token"
fi
export GHCR_TOKEN="${GHCR_TOKEN:-}"
export GHCR_USER="${GHCR_USER:-$(gh api user --jq .login 2>/dev/null || echo x)}"

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
echo "  환경        develop"
echo "  이미지 태그  $IMAGE_TAG"
echo "  서버        $BE_HANSAPP_DEPLOY_SSH_HOST"
[ -n "$config_only" ] && echo "  모드        설정만 (이미지·스키마 건너뜀)"
[ -n "$skip_migrate" ] && echo "  모드        스키마 건너뜀"
echo

# **평문과 키는 어떤 경로로 끝나도 지운다.** 중간에 실패하면 .deploy-work 아래에
# 복호화된 시크릿이 남는다.
trap '"$STAGE_DIR/secret-cleanup.sh" || true' EXIT

"$STAGE_DIR/ssh-connect.sh"
"$STAGE_DIR/config-bundle.sh"
"$STAGE_DIR/config-upload.sh"

if [ -n "$config_only" ]; then
  # 설정만 바뀌었으면 이미지를 받을 것도, 스키마를 건드릴 것도 없다.
  # --force-recreate 가 컨테이너를 교체하므로 stop 도 필요 없다.
  "$STAGE_DIR/app-start.sh"
else
  "$STAGE_DIR/docker-image-pull.sh"
  "$STAGE_DIR/app-stop.sh"

  # **실패해도 앱은 다시 띄운다.** 스키마 반영이 깨졌다고 서버를 내려간 채로 두면
  # develop 을 같이 쓰는 사람들이 전부 막힌다. 실패 자체는 아래에서 다시 알린다.
  migrate_failed=''
  if [ -z "$skip_migrate" ]; then
    "$STAGE_DIR/db-migrate.sh" || migrate_failed=1
  fi

  "$STAGE_DIR/app-start.sh"

  if [ -n "$migrate_failed" ]; then
    echo >&2
    echo "❌ 마이그레이션이 실패했다. 앱은 다시 띄웠지만 **새 코드가 옛 스키마 위에** 있다." >&2
    echo "   위 로그에서 prisma 출력을 확인할 것." >&2
    exit 1
  fi
fi

echo
echo "✅ develop 배포 완료"
