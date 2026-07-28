#!/usr/bin/env bash
#
# 주어진 명령을 CI 와 같은 컨테이너(node-builder) 안에서 실행한다.
# 로컬에서 CI 를 재현하기 위한 것이다. CI 자신은 이 스크립트를 쓰지 않는다
# (이미 그 컨테이너 안에서 돌고 있으므로).
#
#   ./scripts/ci/run-in-builder.sh ./backend/scripts/build.sh
#   ./scripts/ci/run-in-builder.sh bash        ← 컨테이너 안을 직접 둘러볼 때
#
# 레포를 **읽기 전용으로** 마운트하고 컨테이너 안으로 복사해서 쓴다. 그냥 rw 로 마운트하면
# 컨테이너의 pnpm install 이 호스트의 node_modules 를 리눅스 바이너리로 덮어쓴다.
# esbuild·@swc/core·prisma 엔진은 플랫폼별 바이너리라, 그러면 맥에서 개발이 깨진다.
# 복사본에서 돌리므로 호스트 트리는 아무 영향이 없다. 산출물도 컨테이너와 함께 사라진다
# (여기서 알고 싶은 건 "빌드가 되느냐" 뿐이다).
set -euo pipefail

IMAGE="${BUILDER_IMAGE:-ghcr.io/plzhans/hans-api/node-builder:node24}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# **빌드 플랫폼은 배포 대상과 같아야 한다. 호스트 도커의 기본값에 맡기면 안 된다.**
#
# 아키텍처가 걸리는 지점이 둘인데, 성격이 다르다.
#
#   Prisma        엔진을 **내려받는다**(컴파일이 아니다). schema.prisma 의 binaryTargets 에
#                 대상 플랫폼을 적어두면 어느 아키텍처에서 구워도 서버용 엔진이 담긴다.
#                 → 아키텍처가 달라도 된다.
#
#   나머지 네이티브 애드온 (bcrypt·sharp·better-sqlite3 …)
#                 **설치하는 머신의 플랫폼**에 맞는 바이너리만 깔린다. 다 담아주지 않는다.
#                 → 아키텍처가 같아야 한다. 이게 진짜 제약이다.
#
# 지금 prod 의존에는 네이티브가 Prisma 하나뿐이라(swc·esbuild 는 devDep) 당장은 안 걸린다.
# 하지만 하나만 늘어도 즉시 현실이 되고, 그때 **조용히** 깨진다 — 배포는 "성공" 하고 서버만 안 뜬다.
# 그래서 지금 못박아 둔다.
#
# 배포 서버가 arm64 라 기본값이 linux/arm64 다. 서버가 amd64 로 바뀌면 이 값을 바꾼다.
# amd64 호스트에서 arm64 를 구우면 QEMU 에뮬레이션이라 느리다 (정확하긴 하다).
BUILDER_PLATFORM="${BUILDER_PLATFORM:-linux/arm64}"

if [ $# -eq 0 ]; then
  echo "사용: $0 <명령> [인자...]" >&2
  exit 2
fi

# 터미널에서 부르면 -it, 파이프·스크립트에서 부르면 붙이지 않는다.
# TTY 가 없는데 -it 를 주면 docker 가 그대로 실패한다.
tty_flags=()
if [ -t 0 ] && [ -t 1 ]; then
  tty_flags=(-it)
fi

# pnpm store 를 named volume 에 둬서 매번 전부 다시 받지 않게 한다.
# 이게 없으면 로컬 재현이 너무 느려서 아무도 안 쓰게 된다.
#
# 볼륨을 pnpm 의 **기본 store 경로에 그대로** 붙인다. 경로를 옮기려면 --store-dir 플래그를
# 써야 하는데(pnpm 11 은 .npmrc 의 store-dir 도, PNPM_STORE_DIR 도 읽지 않는다),
# 그러면 build.sh 가 컨테이너 사정을 알아야 한다. 기본 경로에 붙이면 아무도 몰라도 된다.
# .git 은 컨테이너로 복사하지 않는다(느리고 빌드에 필요 없다). 그래서 컨테이너 안에서는
# git 에 물어볼 수가 없다. 산출물에 박을 신원(sha·브랜치·dirty)은 호스트가 계산해 넘긴다.
git_sha=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)
git_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
git_dirty=0
[ -n "$(git -C "$REPO_ROOT" status --porcelain -uno 2>/dev/null)" ] && git_dirty=1

# 배포 번들만 **호스트로 가지고 나온다.** 나머지 산출물은 컨테이너와 함께 버린다.
#
# 이게 없으면 리눅스 번들을 만들 방법이 아예 없다. 호스트(맥)에서 build.sh 를 돌리면
# Prisma 가 native = darwin-arm64 로 엔진을 굽고, 그 번들을 리눅스 서버에 풀면 못 쓴다.
# (지금은 binaryTargets 에 linux-arm64 가 **명시**돼 있어 런타임만 겨우 사는 상태다.
#  네이티브 의존이 하나만 더 늘면 그대로 깨진다 — bcrypt, sharp 류)
#
# 컨테이너는 linux 다. 여기서 구우면 native 가 곧 서버의 것이 된다.
bundle_out="$REPO_ROOT/backend/.deploy"
mkdir -p "$bundle_out"

# 호스트 아키텍처와 빌드 플랫폼이 다르면 QEMU 에뮬레이션으로 돈다.
#
# **도커 데스크톱(맥·윈도우)은 QEMU 가 기본으로 등록돼 있다. 리눅스의 순정 도커는 아니다.**
# 등록이 안 된 채로 다른 아키텍처를 돌리면 `exec format error` 로 죽는데, 그 메시지만 보고
# 원인을 짐작하기 어렵다. 미리 알려준다.
host_arch="$(uname -m)"
case "$host_arch" in
  arm64 | aarch64) host_platform='linux/arm64' ;;
  x86_64 | amd64) host_platform='linux/amd64' ;;
  *) host_platform="linux/$host_arch" ;;
esac

if [ "$BUILDER_PLATFORM" != "$host_platform" ]; then
  echo "▶ 크로스 아키텍처 빌드: 호스트 $host_platform → 번들 $BUILDER_PLATFORM (QEMU 에뮬레이션. 느리다)"
  if ! docker run --rm --platform "$BUILDER_PLATFORM" "$IMAGE" true 2>/dev/null; then
    cat >&2 <<EOF
❌ $BUILDER_PLATFORM 을 실행할 수 없다. QEMU binfmt 가 등록돼 있지 않은 것 같다.

   리눅스의 순정 도커는 기본으로 등록돼 있지 않다. 한 번만 실행하면 된다:

     docker run --privileged --rm tonistiigi/binfmt --install all

   (도커 데스크톱을 쓴다면 이미 돼 있어야 한다. 그런데도 실패하면 이미지가 그 아키텍처로
    안 구워졌는지 확인할 것 — node-builder 는 amd64·arm64 멀티아치다.)

   서버가 이 머신과 같은 아키텍처라면 그냥 맞춰도 된다:

     BUILDER_PLATFORM=$host_platform cd backend && pnpm ci:bundle
EOF
    exit 1
  fi
fi

echo "▶ 빌더 컨테이너: $IMAGE  ($BUILDER_PLATFORM)"

docker run --rm "${tty_flags[@]}" \
  --platform "$BUILDER_PLATFORM" \
  -v "$REPO_ROOT:/src:ro" \
  -v "$bundle_out:/workspace/backend/.deploy" \
  -v hansapi-pnpm-store:/root/.local/share/pnpm/store \
  -e CI=1 \
  -e GIT_SHA="$git_sha" \
  -e GIT_BRANCH="$git_branch" \
  -e GIT_DIRTY="$git_dirty" \
  -w /workspace \
  "$IMAGE" \
  bash -euo pipefail -c '
    # node_modules 는 호스트(darwin) 바이너리라 가져가면 안 된다. 컨테이너에서 새로 깐다.
    # dist 도 빼서, 빌드가 정말로 처음부터 되는지 확인한다.
    #
    # .deploy 는 **쓰기 가능한 마운트**다. 호스트에 있던 옛 번들을 컨테이너로 복사해 넣으면
    # (1GB 가 넘는다) 느리기만 하고 어차피 새로 굽는다. 복사 대상에서 뺀다.
    rsync -a \
      --exclude .git \
      --exclude "node_modules/" \
      --exclude "dist/" \
      --exclude "backend/.deploy/" \
      /src/ /workspace/

    exec "$@"
  ' -- "$@"
