#!/usr/bin/env bash
#
# backend 이미지를 굽고 레지스트리에 올린다.
#
#   backend/build.sh <환경> [대상]
#
#   backend/build.sh develop                 # hansapp-api · hansapp-batch 둘 다
#   backend/build.sh develop hansapp-api     # 하나만
#
# 평소에는 CI 가 굽는다(.github/workflows/be-image.yml). 이건 **급할 때 커밋 없이 바로
# 굽는 우회로**다 — CI 왕복을 기다릴 수 없을 때, 또는 배포 경로를 로컬에서 검증할 때.
#
# [로컬 산출물을 쓰지 않는다]
# Dockerfile 이 소스만 복사해 컨테이너 안에서 처음부터 빌드한다(.dockerignore 가 node_modules
# 와 dist 를 막는다). 그래서 맥에서 굽든 CI 에서 굽든 결과 이미지가 같다.
#
# [작업 트리가 더러우면 sha 태그를 안 붙인다]
# `<환경>-<sha>` 는 "이 이미지는 그 커밋이다" 라는 약속이다. 커밋 안 한 변경이 섞여 있으면
# 그 약속이 거짓이 되므로, 움직이는 태그(`<환경>`)만 올린다. 그래야 나중에 "그 sha 이미지가
# 뭐였나" 를 되짚을 때 답이 하나로 남는다.
#
# [인증]
# GHCR 푸시에는 **write:packages** 가 필요하다. 없으면 아래로 한 번 붙인다.
#   gh auth refresh -h github.com -s write:packages
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)" # <repo>/backend
ALL='hansapp-api hansapp-batch'

usage() {
  sed -n '3,8p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

APP_ENV="${1:-}"
TARGET="${2:-all}"
[ -n "$APP_ENV" ] || usage

case "$APP_ENV" in
  develop | production) ;;
  *) echo "❌ 환경은 develop | production 이어야 한다 (받은 값: $APP_ENV)" >&2; exit 2 ;;
esac

if [ "$TARGET" = 'all' ]; then
  targets="$ALL"
else
  case " $ALL " in
    *" $TARGET "*) targets="$TARGET" ;;
    *) echo "❌ 대상은 $ALL 중 하나여야 한다 (받은 값: $TARGET)" >&2; exit 2 ;;
  esac
fi

# 레지스트리 경로는 remote 에서 유도한다 — 레포 이름을 두 군데 적지 않으려는 것이다.
slug="$(git -C "$AREA_DIR" remote get-url origin 2>/dev/null \
  | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
[ -n "$slug" ] || { echo '❌ origin remote 를 못 읽었다.' >&2; exit 1; }
REGISTRY="ghcr.io/$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')"

sha="$(git -C "$AREA_DIR" rev-parse HEAD)"
branch="$(git -C "$AREA_DIR" rev-parse --abbrev-ref HEAD)"
dirty=''
git -C "$AREA_DIR" diff --quiet && git -C "$AREA_DIR" diff --cached --quiet || dirty=1

echo
echo "  환경        $APP_ENV"
echo "  대상        $targets"
echo "  레지스트리   $REGISTRY"
echo "  커밋        ${sha:0:7} ($branch)${dirty:+  ⚠ 커밋 안 한 변경 있음}"
echo "  플랫폼      ${PLATFORM:-linux/arm64}"
echo

if [ -n "$dirty" ]; then
  echo "⚠ 작업 트리에 커밋 안 한 변경이 있다."
  echo "  → '$APP_ENV' 태그만 올린다. '$APP_ENV-${sha:0:7}' 는 올리지 않는다"
  echo "    (그 태그는 해당 커밋을 가리켜야 하는데 지금 이미지는 그 커밋이 아니다)."
  echo
  if [ -t 0 ]; then
    printf '계속할까? [y/N] '
    read -r answer
    case "$answer" in y | Y | yes | YES) ;; *) echo "취소했다."; exit 1 ;; esac
    echo
  fi
fi

if [ "$APP_ENV" = 'production' ] && [ -t 0 ]; then
  printf "production 이미지를 올린다. 계속할까? [y/N] "
  read -r answer
  case "$answer" in y | Y | yes | YES) ;; *) echo "취소했다."; exit 1 ;; esac
  echo
fi

# ─────────────────────────────────────────────────────────────────────────────
# GHCR 로그인
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh 와 같은 자리에서 토큰을 빌려 온다. 다만 푸시라 write:packages 가 필요하다.
if [ -z "${GHCR_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  GHCR_TOKEN="$(gh auth token 2>/dev/null || true)"
fi
if [ -z "${GHCR_TOKEN:-}" ]; then
  echo '❌ GHCR 토큰이 없다. gh 로 로그인하거나 GHCR_TOKEN 을 넘길 것.' >&2
  exit 1
fi
user="${GHCR_USER:-$(gh api user --jq .login 2>/dev/null || echo x)}"
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$user" --password-stdin >/dev/null
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

# ─────────────────────────────────────────────────────────────────────────────
# 빌드 · 푸시
# ─────────────────────────────────────────────────────────────────────────────
# 플랫폼을 배포 서버에 맞춘다. 맥(Apple Silicon)이면 네이티브라 빠르고, x86 에서 돌리면
# QEMU 에뮬레이션이라 몇 배 느려진다 — 그때는 CI 에 맡기는 편이 낫다.
for app in $targets; do
  echo "▶ $app"
  tags=(-t "$REGISTRY/$app:$APP_ENV")
  [ -z "$dirty" ] && tags+=(-t "$REGISTRY/$app:$APP_ENV-$sha")

  docker buildx build \
    --platform "${PLATFORM:-linux/arm64}" \
    -f "$AREA_DIR/docker/$app.Dockerfile" \
    --build-arg "GIT_SHA=$sha" \
    --build-arg "GIT_BRANCH=$branch" \
    --label "org.opencontainers.image.source=https://github.com/$slug" \
    --label "org.opencontainers.image.revision=$sha" \
    --label "org.opencontainers.image.description=$app ($APP_ENV)" \
    "${tags[@]}" \
    --push \
    "$AREA_DIR"

  for t in "${tags[@]}"; do [ "$t" = '-t' ] || echo "  ✅ $t"; done
done

echo
echo "다음: backend/deploy.sh $APP_ENV $APP_ENV"
