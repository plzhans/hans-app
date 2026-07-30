#!/usr/bin/env bash
#
# backend 를 로컬에서 배포한다.
#
#   backend/deploy.sh <환경> [이미지태그] [-y] [--skip-migrate]
#
#   backend/deploy.sh develop                  ← 태그 생략 = 'develop'(그 환경의 최신)
#   backend/deploy.sh develop    v0.5.0        ← 릴리스 후보를 먼저 검증할 때
#   backend/deploy.sh production v0.5.0        ← production 은 태그를 반드시 적는다
#   backend/deploy.sh production v0.4.0        ← 롤백. 재빌드 없이 태그만 바꾼다
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

APP_ENV=''
IMAGE_TAG=''
assume_yes=''
skip_migrate=''

# 위치 인자와 플래그를 섞어 쓸 수 있게 훑는다. '-' 로 시작하면 플래그이므로
# 이미지 태그 자리에 들어가지 않는다 — `deploy.sh develop --skip-migrate` 가 성립한다.
for arg in "$@"; do
  case "$arg" in
    -y) assume_yes='-y' ;;
    --skip-migrate) skip_migrate=1 ;;
    -*) echo "❌ 모르는 옵션: $arg" >&2; exit 2 ;;
    *)
      if [ -z "$APP_ENV" ]; then APP_ENV="$arg"
      elif [ -z "$IMAGE_TAG" ]; then IMAGE_TAG="$arg"
      else echo "❌ 인자가 너무 많다: $arg" >&2; exit 2
      fi
      ;;
  esac
done
[ -n "$APP_ENV" ] || usage

# develop 은 태그를 생략하면 'develop'(움직이는 최신)으로 본다. 매번 같은 값을 적게 하면
# 오랜만에 왔을 때 "뭘 적어야 하지" 로 막힌다.
#
# **production 은 생략을 허용하지 않는다.** 기본값으로 올라가면 서버에 무엇이 떠 있는지
# 아무도 답할 수 없게 되고, 되돌릴 이전 태그도 남지 않는다.
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
# 평소 로컬은 VPN 이 이미 붙어 있어 비어 있다. 값을 채우면 ci-deploy.sh 가 그 설정으로
# 연결한다 — **CI 설정을 로컬에서 시험할 때** 쓰라고 열어 둔다. CI 왕복 없이 확인된다.
export BE_WIREGUARD_PEER_CONF_FILE="${BE_WIREGUARD_PEER_CONF_FILE:-}"

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

# **스키마를 먼저 반영한다.** 새 코드가 옛 스키마 위에서는 뜨지 못하므로 순서가 정해져
# 있다. migrate deploy 는 적용할 게 없으면 그냥 통과하므로(멱등) 매번 돌려도 무해하다.
#
# --skip-migrate 는 이미 돌렸거나 스키마 변경이 없는 게 확실할 때의 우회로다.
if [ -z "$skip_migrate" ]; then
  "$AREA_DIR/migrate.sh" "$APP_ENV" "$assume_yes"
  echo
fi

exec "$AREA_DIR/ci-deploy.sh"
