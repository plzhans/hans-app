#!/usr/bin/env bash
#
# 주어진 명령을 CI 와 같은 컨테이너(node-builder) 안에서 실행한다.
# 로컬에서 CI 를 재현하기 위한 것이다. CI 자신은 이 스크립트를 쓰지 않는다
# (이미 그 컨테이너 안에서 돌고 있으므로).
#
#   ./scripts/ci/run-in-builder.sh ./scripts/ci/build-backend.sh
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
# 그러면 build-backend.sh 가 컨테이너 사정을 알아야 한다. 기본 경로에 붙이면 아무도 몰라도 된다.
# .git 은 컨테이너로 복사하지 않는다(느리고 빌드에 필요 없다). 그래서 컨테이너 안에서는
# git 에 물어볼 수가 없다. 산출물에 박을 신원(sha·브랜치·dirty)은 호스트가 계산해 넘긴다.
git_sha=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)
git_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
git_dirty=0
[ -n "$(git -C "$REPO_ROOT" status --porcelain -uno 2>/dev/null)" ] && git_dirty=1

docker run --rm "${tty_flags[@]}" \
  -v "$REPO_ROOT:/src:ro" \
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
    rsync -a \
      --exclude .git \
      --exclude "node_modules/" \
      --exclude "dist/" \
      /src/ /workspace/

    exec "$@"
  ' -- "$@"
