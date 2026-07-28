#!/usr/bin/env bash
#
# 빌드 산출물의 신원을 계산해 build-info JSON 으로 찍는다.
#
#   ./backend/scripts/version.sh apps/hansapi-server
#
# 숫자(0.0.1)는 사람용 라벨이고, **진짜 신원은 git sha 다.**
# 숫자는 apps/<app>/package.json 의 version 을 그대로 쓴다. 올리고 싶으면 사람이 고쳐 커밋한다.
# CI 가 package.json 을 고쳐 쓰지 않는 이유: 작업 트리가 더러워지고, 산출물의 신원이
# git 이 아니라 "CI 가 그때 뭘 썼는지" 에 달리게 된다.
#
# version      0.0.1+a1b2c3d        표시·로그용. semver 의 build metadata 문법이다.
# tagVersion   0.0.1-a1b2c3d        docker 태그·파일명용. 태그에는 '+' 를 쓸 수 없다.
#
# 커밋 안 된 변경이 있으면 .dirty 가 붙는다. 로컬에서 급히 만든 산출물을
# CI 산출물로 착각하지 않기 위해서다.
set -euo pipefail

pkg_dir="${1:?사용: $0 <패키지 디렉터리>}"

semver=$(jq -r '.version // "0.0.0"' "$pkg_dir/package.json")

# git 에 직접 묻는 건 마지막 수단이다. 두 환경에서 git 이 답을 못 준다.
#
#   로컬 컨테이너 — .git 을 복사하지 않는다(run-in-builder.sh). 그래서 GIT_* 로 받는다.
#   GitHub Actions 컨테이너 잡 — 체크아웃된 파일의 소유자(러너 UID)와 컨테이너 사용자(root)가
#     달라서 git 이 "dubious ownership" 으로 거부한다. 그러면 sha 가 unknown 이 되어
#     버전을 박아둔 의미가 통째로 사라진다(실제로 그렇게 0.0.1+unknown 이 찍혔다).
#     러너가 GITHUB_SHA 로 이미 알려주므로 그걸 쓴다.
sha=${GIT_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}}
branch=${GIT_BRANCH:-${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}}

if [ -n "${GIT_DIRTY:-}" ]; then
  dirty=$GIT_DIRTY
elif [ -n "${GITHUB_ACTIONS:-}" ]; then
  # 방금 체크아웃한 트리다. 더러울 수가 없다.
  dirty=0
elif [ -n "$(git status --porcelain -uno 2>/dev/null)" ]; then
  # 추적 중인 파일의 변경만 본다. 굴러다니는 untracked 파일 때문에 dirty 로 찍히면
  # 아무도 그 표시를 안 믿게 된다.
  dirty=1
else
  dirty=0
fi

short=${sha:0:7}
suffix=''
[ "$dirty" = '1' ] && suffix='.dirty'

jq -n \
  --arg version "${semver}+${short}${suffix}" \
  --arg tagVersion "${semver}-${short}${suffix}" \
  --arg semver "$semver" \
  --arg sha "$sha" \
  --arg branch "$branch" \
  --arg builtAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg node "$(node --version | sed 's/^v//')" \
  '{version: $version, tagVersion: $tagVersion, semver: $semver, sha: $sha, branch: $branch, builtAt: $builtAt, node: $node}'
