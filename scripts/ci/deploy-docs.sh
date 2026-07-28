#!/usr/bin/env bash
#
# 문서 사이트를 GitHub Pages 에 배포한다.
#
#   ./scripts/ci/deploy-docs.sh develop
#   ./scripts/ci/deploy-docs.sh production
#
# [왜 별도 레포인가]
# hans-api 는 private 인데 GitHub Free 는 private 레포에서 Pages 를 못 쓴다.
# 그래서 **빌드된 정적 사이트만** public 레포로 밀고 거기에 Pages 를 붙인다.
# 소스는 private 그대로다. 어차피 Pages 사이트 자체는 누구나 볼 수 있으므로
# (Enterprise 가 아니면 private 레포에 붙인 Pages 도 공개다) 공개되는 범위는 같다.
#
# [하나의 사이트, 두 환경]
#   production 브랜치 → /          (docs.plzhans.com)
#   main 브랜치       → /develop/  (docs.plzhans.com/develop/)
#
# 각 배포는 **자기 경로만** 교체한다. production 배포가 develop/ 을 지우지 않고,
# develop 배포가 루트를 건드리지 않는다. 그래서 한쪽만 배포해도 다른 쪽이 살아 있다.
#
# [인증]
# 다른 레포에 푸시해야 하므로 GITHUB_TOKEN 으로는 안 된다. 배포 키(SSH)를 쓴다.
# 그 레포 하나에만 쓰기 권한이 있는 키라, PAT 보다 새는 범위가 좁다.
#   DOCS_DEPLOY_KEY  hans-api 의 secret. 문서 레포에 등록된 배포 키의 개인키.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$REPO_ROOT/scripts/ci"

# 문서 사이트를 담는 레포와 도메인은 환경변수로 제어한다. 아래 기본값은 로컬에서 손으로 돌릴 때의
# 폴백일 뿐이고, CI 에서는 GitHub Variables 가 넘어온다(.github/workflows/fe-deploy-hansapp-docs.yml).
# 그래서 레포 이름이나 도메인이 바뀌어도 코드를 고칠 일이 없다.
#
#   DOCS_REPO    레포 레벨 변수. 문서 사이트를 담는 public 레포.
#   DOCS_DOMAIN  레포 레벨 변수. 커스텀 도메인(CNAME).
#   DOCS_PATH    **환경 레벨** 변수. production 이 아닌 환경이 차지하는 경로.
DOCS_REPO="${DOCS_REPO:-git@github.com:plzhans/hans-api-docs.git}"
DOCS_DOMAIN="${DOCS_DOMAIN:-docs.plzhans.com}"

# 문서 전용 레포의 문서 전용 브랜치다. 바뀔 일이 없으므로 변수로 빼지 않는다.
# (바꾸려면 이 줄과 문서 레포의 Pages 설정을 같이 고치면 된다)
DOCS_BRANCH='gh-pages'

env_name="${1:-}"
[ -n "$env_name" ] || {
  echo "사용: $0 <환경>   (예: develop, production)" >&2
  exit 2
}

# 사이트 안에서 이 환경이 차지하는 경로.
#
#   production  → 항상 루트. 코드로 고정한다. 운영 문서가 어디에 뜨는지는 설정으로 흔들릴 값이 아니다.
#                 (단 다른 환경의 하위 디렉터리는 건드리지 않는다)
#   그 외        → DOCS_PATH 가 정한다. 예: /develop
#
# 환경을 하나 더 늘리고 싶으면(예: /staging) GitHub Environment 를 만들고 DOCS_PATH 를 넣으면 된다.
# 스크립트는 고치지 않아도 된다.
if [ "$env_name" = 'production' ]; then
  dest_subdir=''
else
  docs_path="${DOCS_PATH:-}"
  if [ -z "$docs_path" ]; then
    echo "❌ DOCS_PATH 가 없다. '$env_name' 이 사이트의 어느 경로에 배포되는지 알 수 없다." >&2
    echo "   GitHub Environment '$env_name' 에 DOCS_PATH 를 넣을 것 (예: /develop)." >&2
    exit 1
  fi
  # 앞뒤 '/' 를 털어낸다. /develop, develop, /develop/ 모두 develop 이 된다.
  dest_subdir="${docs_path#/}"
  dest_subdir="${dest_subdir%/}"

  # 루트는 production 만 쓴다. 다른 환경이 루트로 오면 운영 문서를 덮어쓰게 된다.
  if [ -z "$dest_subdir" ]; then
    echo "❌ DOCS_PATH 가 루트(/)를 가리킨다. 루트는 production 전용이다." >&2
    exit 1
  fi
fi

group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

# --- 1. 빌드 -----------------------------------------------------------------
# 빌드 로직은 build-frontend.sh 가 유일한 출처다. 여기서 다시 적지 않는다.
#
# 배포 경로와 base 는 같은 값에서 나와야 한다. 둘이 어긋나면 파일은 올라갔는데
# CSS·JS 를 못 찾는, 알아채기 어려운 방식으로 깨진다.
if [ -n "$dest_subdir" ]; then
  export DOCS_BASE="/$dest_subdir/"
else
  export DOCS_BASE='/'
fi

"$SCRIPT_DIR/build-frontend.sh" hansapp-docs "$env_name"

site="$REPO_ROOT/frontend/hansapp-docs/.vitepress/dist"
[ -d "$site" ] || {
  echo "❌ 빌드 산출물이 없다: $site" >&2
  exit 1
}

# --- 2. 배포 키 ---------------------------------------------------------------
if [ -n "${DOCS_DEPLOY_KEY:-}" ]; then
  group "ssh 키 설치"
  umask 077

  # '~' 에 기대지 않는다. 컨테이너 잡에서는 HOME 이 무엇인지, ssh 와 이 스크립트가 같은 것을
  # 보는지가 확실하지 않다. 경로를 직접 만들어 ssh 에 명시적으로 넘긴다.
  ssh_dir="$(mktemp -d)"
  key_file="$ssh_dir/id_docs"
  known_hosts="$ssh_dir/known_hosts"

  printf '%s\n' "$DOCS_DEPLOY_KEY" > "$key_file"
  chmod 600 "$key_file"

  # known_hosts 를 고정한다. StrictHostKeyChecking=no 로 넘기면 MITM 에 노출된다.
  #
  # 실패를 삼키지 않는다. 예전엔 2>/dev/null 로 가려서, 키를 못 받아도 조용히 넘어간 뒤
  # 한참 뒤에 "Host key verification failed" 로 터졌다. 원인이 여기인 줄 알 수가 없었다.
  ssh-keyscan -t rsa,ecdsa,ed25519 github.com > "$known_hosts"
  if [ ! -s "$known_hosts" ]; then
    echo "❌ github.com 의 호스트 키를 가져오지 못했다 (ssh-keyscan)." >&2
    exit 1
  fi
  echo "  호스트 키 $(wc -l < "$known_hosts") 개 확보"

  export GIT_SSH_COMMAND="ssh -i $key_file -o IdentitiesOnly=yes -o UserKnownHostsFile=$known_hosts"
  endgroup
fi

# --- 3. 대상 레포 가져오기 ------------------------------------------------------
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

group "문서 레포 클론 ($DOCS_BRANCH)"

# **접속 가능 여부부터 따로 확인한다.**
# 예전엔 clone 실패를 전부 "브랜치가 없다" 로 해석했다. 그래서 인증이 깨졌을 때도
# 조용히 "새로 만든다" 로 넘어간 뒤 엉뚱한 곳에서 터졌고, 원인을 찾는 데 시간을 버렸다.
# ls-remote 가 실패하면 접속·권한 문제고, 성공하는데 비어 있으면 브랜치가 없는 것이다.
if ! remote_branch=$(git ls-remote --heads "$DOCS_REPO" "$DOCS_BRANCH"); then
  echo "❌ 문서 레포에 접속할 수 없다: $DOCS_REPO" >&2
  echo "   배포 키(DOCS_DEPLOY_KEY)와 그 레포의 Deploy keys 설정을 확인할 것." >&2
  exit 1
fi

if [ -n "$remote_branch" ]; then
  git clone --depth 1 --branch "$DOCS_BRANCH" "$DOCS_REPO" "$work"
  echo "  기존 $DOCS_BRANCH 브랜치를 가져왔다."
else
  # 첫 배포. 브랜치가 아직 없다. 히스토리 없는 새 브랜치로 시작한다.
  echo "  $DOCS_BRANCH 브랜치가 없다. 새로 만든다."
  git clone --depth 1 "$DOCS_REPO" "$work"
  git -C "$work" checkout --orphan "$DOCS_BRANCH"
  git -C "$work" rm -rf . >/dev/null 2>&1 || true
fi
endgroup

# --- 4. 자기 경로만 교체 --------------------------------------------------------
group "사이트 갱신 (${dest_subdir:-/})"
if [ -n "$dest_subdir" ]; then
  # develop 배포: develop/ 하위만 통째로 갈아끼운다. 루트(production)는 그대로 둔다.
  mkdir -p "$work/$dest_subdir"
  rsync -a --delete "$site/" "$work/$dest_subdir/"
else
  # production 배포: 루트를 갈아끼우되 develop/ 은 남긴다.
  # .git 과 CNAME 도 지우면 안 된다 — 하나는 레포 자체고, 하나는 커스텀 도메인이다.
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'develop/' \
    --exclude 'CNAME' \
    "$site/" "$work/"
fi

# 커스텀 도메인. 이 파일이 없으면 Pages 가 <user>.github.io 로 돌아간다.
printf '%s\n' "$DOCS_DOMAIN" > "$work/CNAME"

# Jekyll 을 끈다. 없으면 _ 로 시작하는 vitepress 자산(_assets 등)을 Pages 가 무시한다.
touch "$work/.nojekyll"
endgroup

# --- 5. 커밋 & 푸시 ------------------------------------------------------------
cd "$work"
git config user.name 'github-actions[bot]'
git config user.email 'github-actions[bot]@users.noreply.github.com'
git add -A

# 내용이 같으면 빈 커밋을 쌓지 않는다.
#
# 다만 gh-pages 를 손으로 건드려 망가뜨렸는데 소스가 그대로면, 이 검사 때문에 복구 배포가
# 나가지 않는다. 그때 쓰라고 DOCS_FORCE 를 둔다.
force=${DOCS_FORCE:-false}
if git diff --cached --quiet; then
  if [ "$force" != 'true' ]; then
    echo "✅ 바뀐 게 없다. 배포하지 않는다. (강제로 밀려면 force 옵션)"
    exit 0
  fi
  echo "  바뀐 게 없지만 force 라 그대로 배포한다."
fi

# 배포 커밋에 어느 소스에서 나왔는지 남긴다. 이게 없으면 사이트를 보고 어느 커밋인지 알 수 없다.
# git 에 직접 묻지 않는 이유는 version.sh 와 같다 — 컨테이너 잡에서 git 이 소유권 때문에 거부한다.
src_sha="${GIT_SHA:-${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)}}"
src_sha="${src_sha:0:7}"

# 강제 배포에서 내용이 같으면 commit 이 실패한다(커밋할 게 없다). --allow-empty 로 흔적을 남긴다.
git commit -q --allow-empty -m "docs($env_name): hans-api@${src_sha}"
git push -q origin "$DOCS_BRANCH"

echo "✅ 배포됨 → https://$DOCS_DOMAIN/${dest_subdir:+$dest_subdir/}"
