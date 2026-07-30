#!/usr/bin/env bash
#
# frontend 를 로컬에서 배포한다.
#
#   frontend/deploy.sh <환경> <프로젝트> [-y]
#
#   frontend/deploy.sh develop    medifinder-web
#   frontend/deploy.sh production hansapp-docs
#
# 하는 일은 하나뿐이다 — **CI 가 주는 환경변수를 같은 규칙으로 채워서** 아래 둘을 순서대로 부른다.
#
#   frontend/ci-build.sh   빌드
#   frontend/ci-deploy.sh  배포
#
# CI 는 이 둘을 **다른 잡으로** 나눠 돌린다(전부 빌드한 뒤에 배포를 시작하려고).
# 로컬에서는 나눌 이유가 없으니 여기서 이어서 부른다. 로직은 어느 쪽에도 두지 않는다.
#
# 노리는 것 두 가지:
#   1. 배포를 CI 에 태워보지 않고 로컬에서 그대로 검증한다 (CI 로 배포 테스트하는 건 번거롭다)
#   2. 급할 때 로컬이 우회로가 아니라 정식 배포 경로가 된다 — 같은 코드를 지나가므로
#
# [왜 루트가 아니라 frontend 아래인가]
# 배포 자격증명이 서브트리마다 다르기 때문이다. 프론트는 Cloudflare 토큰을, 백엔드는
# SSH 키·WireGuard 설정을 쓴다. 성격도 수명도 다른 것을 한 진입점이 다 알게 하면 그 파일이
# "무엇을 배포하느냐"에 따라 갈라지기 시작한다. 서브트리마다 자기 deploy.sh 를 두면
# 각자 자기 .env 만 알면 된다. 나중에 backend/deploy.sh 가 생겨도 이 파일은 안 바뀐다.
# .gitignore 에 적힌 "env 는 서브트리별로 각자 관리한다" 와 같은 원칙이다.
#
# [비밀값]
# 같은 디렉터리의 .env 에서 읽는다 — frontend/.env (gitignore).
# 이미 셸에 export 되어 있으면 파일보다 그쪽이 이긴다(한 번만 다른 계정으로 쏠 때).
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)"   # <repo>/frontend
REPO_ROOT="$(cd "$AREA_DIR/.." && pwd)"
AREA="$(basename "$AREA_DIR")"              # frontend
cd "$REPO_ROOT"

usage() {
  sed -n '3,7p' "$0" | sed 's/^# \{0,1\}//'
  echo
  # 배포 가능한 대상이 무엇인지는 ci-deploy.sh 가 안다. 여기서 다시 적으면 언젠가 어긋나고,
  # 그때 이 사용법은 배포되지도 않는 것(auth-sdk 같은 라이브러리)을 대상이라고 말하게 된다.
  # 앞의 'frontend/' 는 떼고 보여준다 — 이 스크립트는 그 아래만 다루므로 인자에 안 쓴다.
  "$AREA_DIR/ci-build.sh" 2>&1 | sed -n '/^대상:/,$p'
  exit 2
}

APP_ENV="${1:-}"
project="${2:-}"
assume_yes="${3:-}"
[ -n "$APP_ENV" ] && [ -n "$project" ] || usage


case "$APP_ENV" in
  develop | production) ;;
  *)
    echo "❌ 환경은 develop | production 이어야 한다 (받은 값: $APP_ENV)" >&2
    exit 2
    ;;
esac

# ─────────────────────────────────────────────────────────────────────────────
# CI 가 주는 변수를 같은 규칙으로 채운다.
#
# 이미 값이 있으면 건드리지 않는다. 이 스크립트를 CI 안에서 부를 일은 없지만,
# 손으로 특정 커밋/브랜치를 흉내 내 시험할 때 셸에서 덮어쓸 수 있어야 한다.
# ─────────────────────────────────────────────────────────────────────────────
export APP_ENV
export GITHUB_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
export GITHUB_REF_NAME="${GITHUB_REF_NAME:-$(git branch --show-current)}"

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
# ci-deploy.sh 에 넘기는 값. **fe-deploy-*.yml 의 env: 블록과 같은 목록이어야 한다.**
#
# 위 파일에서 이미 export 됐는데 여기에 이름을 다시 적는 이유는, 이 파일만 읽어도
# "무엇이 넘어가는가" 가 보이게 하기 위해서다. deploy.env 를 열어봐야만 알 수 있으면
# CI 쪽 env: 와 눈으로 대조할 수가 없고, 둘이 어긋나도 배포해보기 전까지 모른다.
# ─────────────────────────────────────────────────────────────────────────────
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
# 선택. 비어 있으면 ci-deploy.sh 가 <환경 약칭>-<프로젝트> 규칙으로 유도한다(dev-/prod-).
export CF_WORKER_NAME="${CF_WORKER_NAME:-}"

# 첫 실행에서 제일 자주 걸리는 곳이라 여기서 먼저 잡는다.
# ci-deploy.sh 도 검사하지만, 그쪽은 값의 출처를 모르니 "어느 파일을 만들어라" 라고
# 말해줄 수가 없다. 출처를 아는 건 이 파일뿐이다.
if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "❌ Cloudflare 자격증명이 없다." >&2
  [ -n "$CLOUDFLARE_ACCOUNT_ID" ] || echo "     CLOUDFLARE_ACCOUNT_ID" >&2
  [ -n "$CLOUDFLARE_API_TOKEN" ] || echo "     CLOUDFLARE_API_TOKEN" >&2
  echo >&2
  echo "   cp $AREA/.env.example $AREA/.env  후 값을 채울 것 (gitignore 라 커밋되지 않는다)." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 작업 트리가 더러우면 알린다.
#
# **막지는 않는다.** 급할 때 손에 든 수정본을 바로 내보내는 게 이 스크립트의 존재 이유다.
# 다만 그때 배포된 것은 GITHUB_SHA 가 가리키는 커밋과 다르다 — CF 대시보드의 커밋 링크를
# 믿고 롤백하면 엉뚱한 걸 되돌리게 된다. 그래서 조용히 넘어가지 않는다.
# ─────────────────────────────────────────────────────────────────────────────
dirty="$(git status --porcelain -uno)"
if [ -n "$dirty" ]; then
  echo
  echo "⚠️  커밋 안 된 변경이 있다. 배포되는 내용은 $GITHUB_SHA 와 다르다:"
  printf '%s\n' "$dirty" | sed 's/^/     /'
fi

echo
echo "  환경     $APP_ENV"
echo "  대상     $AREA/$project"
echo "  브랜치   $GITHUB_REF_NAME"
echo "  커밋     $GITHUB_SHA${dirty:+  (+ 커밋 안 된 변경)}"
echo

# production 은 사람에게 한 번 묻는다. develop 은 자주 나가는 것이라 묻지 않는다.
# 파이프/CI 처럼 tty 가 없으면 물어볼 상대가 없으므로 건너뛴다.
if [ "$APP_ENV" = 'production' ] && [ "$assume_yes" != '-y' ] && [ -t 0 ]; then
  printf 'production 에 배포한다. 계속할까? [y/N] '
  read -r answer
  case "$answer" in
    y | Y | yes | YES) ;;
    *) echo "취소했다."; exit 1 ;;
  esac
fi

"$AREA_DIR/ci-build.sh" "$project"
exec "$AREA_DIR/ci-deploy.sh" "$project"
