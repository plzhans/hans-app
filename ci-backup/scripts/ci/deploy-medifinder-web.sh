#!/usr/bin/env bash
#
# medifinder-web 정적 사이트를 GitHub Pages 에 배포한다.
#
#   ./scripts/ci/deploy-medifinder-web.sh develop
#   ./scripts/ci/deploy-medifinder-web.sh production
#
# [docs 와 무엇이 다른가]
# deploy-docs.sh 는 **한 레포·한 브랜치(gh-pages)** 안에서 경로만 나눈다(/ vs /develop/).
# 하나의 도메인(docs.plzhans.com)이 두 환경을 서브패스로 담기 때문이다.
#
# medifinder-web 은 환경마다 **도메인 자체가 다르다.**
#   production → medifinder.kr           (medifinder-kr 레포)
#   develop    → develop.medifinder.kr   (medifinder-kr-develop 레포)
#
# GitHub Pages 는 레포 하나당 사이트 하나, 커스텀 도메인 하나다. 서브도메인과 apex 를
# 한 레포로 동시에 서빙할 수 없다. 그래서 환경마다 **레포를 따로** 두고, 각 배포는
# 자기 레포의 gh-pages 루트를 통째로 갈아끼운다. subpath 를 나눌 일이 없어 docs 보다 단순하다.
#
# [인증]
# 다른 레포에 푸시하므로 GITHUB_TOKEN 으로는 안 된다. 배포 키(SSH)를 쓴다.
# 배포 키는 레포당 하나라, 환경(=레포)마다 다른 키가 필요하다.
#   MEDIFINDER_DEPLOY_KEY  **환경 레벨** secret. 그 환경의 대상 레포에 등록된 배포 키의 개인키.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$REPO_ROOT/scripts/ci"

# frontend/ 아래의 디렉터리 이름 그대로. 프로젝트 이름이 또 바뀌면 여기만 고친다.
PROJECT='medifinder-web'

# 대상 레포와 도메인은 환경변수로 제어한다. 아래 기본값은 로컬에서 손으로 돌릴 때의 폴백일 뿐,
# CI 에서는 GitHub Variables 가 넘어온다(.github/workflows/fe-deploy-medifinder.yml).
# 그래서 레포 이름이나 도메인이 바뀌어도 코드를 고칠 일이 없다.
#
#   MEDIFINDER_GHPAGES_REPO    **환경 레벨** 변수. 그 환경의 사이트를 담는 레포.
#   MEDIFINDER_DOMAIN  **환경 레벨** 변수. 그 환경의 커스텀 도메인(CNAME).
MEDIFINDER_GHPAGES_REPO="${MEDIFINDER_GHPAGES_REPO:-}"
MEDIFINDER_DOMAIN="${MEDIFINDER_DOMAIN:-}"

# 대상 레포의 배포 브랜치다. 어느 환경이든 자기 레포의 gh-pages 루트에 올라간다.
# 바뀔 일이 없으므로 변수로 빼지 않는다(바꾸려면 이 줄과 각 레포의 Pages 설정을 같이 고친다).
GHPAGES_BRANCH='gh-pages'

env_name="${1:-}"
[ -n "$env_name" ] || {
  echo "사용: $0 <환경>   (예: develop, production)" >&2
  exit 2
}

if [ -z "$MEDIFINDER_GHPAGES_REPO" ]; then
  echo "❌ MEDIFINDER_GHPAGES_REPO 가 없다. '$env_name' 을 어느 레포로 배포하는지 알 수 없다." >&2
  echo "   GitHub Environment '$env_name' 에 MEDIFINDER_GHPAGES_REPO 를 넣을 것 (예: git@github.com:plzhans/medifinder-kr.git)." >&2
  exit 1
fi
if [ -z "$MEDIFINDER_DOMAIN" ]; then
  echo "❌ MEDIFINDER_DOMAIN 이 없다. CNAME 을 쓸 수 없다." >&2
  echo "   GitHub Environment '$env_name' 에 MEDIFINDER_DOMAIN 을 넣을 것 (예: medifinder.kr)." >&2
  exit 1
fi

group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

# --- 1. 빌드 -----------------------------------------------------------------
# 빌드 로직은 build-frontend.sh 가 유일한 출처다. 여기서 다시 적지 않는다.
# 각 사이트는 자기 도메인의 루트에 뜨므로 vite base 는 기본값 '/' 그대로면 된다(docs 처럼
# base 를 넘길 필요가 없다). build-frontend.sh 가 .env.<환경> 을 요구하는데, CI 에서는
# 워크플로우가 빌드 직전에 GitHub Variables/Secrets 로 만들어 준다.
"$SCRIPT_DIR/build-frontend.sh" "$PROJECT" "$env_name"

site="$REPO_ROOT/frontend/$PROJECT/dist"
[ -d "$site" ] || {
  echo "❌ 빌드 산출물이 없다: $site" >&2
  exit 1
}

# --- 2. 배포 키 ---------------------------------------------------------------
if [ -n "${MEDIFINDER_DEPLOY_KEY:-}" ]; then
  group "ssh 키 설치"
  umask 077

  # '~' 에 기대지 않는다. 컨테이너 잡에서는 HOME 이 무엇인지, ssh 와 이 스크립트가 같은 것을
  # 보는지가 확실하지 않다. 경로를 직접 만들어 ssh 에 명시적으로 넘긴다.
  ssh_dir="$(mktemp -d)"
  key_file="$ssh_dir/id_medifinder"
  known_hosts="$ssh_dir/known_hosts"

  printf '%s\n' "$MEDIFINDER_DEPLOY_KEY" > "$key_file"
  chmod 600 "$key_file"

  # known_hosts 를 고정한다. StrictHostKeyChecking=no 로 넘기면 MITM 에 노출된다.
  # 실패를 삼키지 않는다 — 키를 못 받으면 여기서 크게 실패해야 원인을 안다.
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

group "대상 레포 클론 ($MEDIFINDER_GHPAGES_REPO#$GHPAGES_BRANCH)"

# **접속 가능 여부부터 따로 확인한다.** clone 실패를 전부 "브랜치가 없다" 로 해석하면,
# 인증이 깨졌을 때도 조용히 "새로 만든다" 로 넘어간 뒤 엉뚱한 곳에서 터진다.
# ls-remote 가 실패하면 접속·권한 문제고, 성공하는데 비어 있으면 브랜치가 없는 것이다.
if ! remote_branch=$(git ls-remote --heads "$MEDIFINDER_GHPAGES_REPO" "$GHPAGES_BRANCH"); then
  echo "❌ 대상 레포에 접속할 수 없다: $MEDIFINDER_GHPAGES_REPO" >&2
  echo "   배포 키(MEDIFINDER_DEPLOY_KEY)와 그 레포의 Deploy keys(쓰기 허용) 설정을 확인할 것." >&2
  exit 1
fi

# clone 은 **레포·remote 를 얻기 위한 것뿐**이다. 어차피 아래에서 orphan 단일 커밋으로
# 통째 갈아끼우니 브랜치 내용은 안 쓴다. 브랜치가 있으면 그걸(가벼우니), 없으면 기본 브랜치를 뜬다.
if [ -n "$remote_branch" ]; then
  git clone --depth 1 --branch "$GHPAGES_BRANCH" "$MEDIFINDER_GHPAGES_REPO" "$work"
  echo "  기존 $GHPAGES_BRANCH 브랜치를 가져왔다."
else
  echo "  $GHPAGES_BRANCH 브랜치가 없다. 첫 배포다(push -f 로 생성)."
  git clone --depth 1 "$MEDIFINDER_GHPAGES_REPO" "$work"
fi
endgroup

# --- 4. 루트를 통째로 교체 ------------------------------------------------------
# 환경마다 레포가 다르므로 남겨둘 다른 환경의 산출물이 없다. 루트를 통째로 갈아끼운다.
# .git 과 CNAME 은 지우면 안 된다 — 하나는 레포 자체고, 하나는 커스텀 도메인이다.
group "사이트 갱신 (/)"
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'CNAME' \
  "$site/" "$work/"

# 커스텀 도메인. 이 파일이 없으면 Pages 가 <user>.github.io 로 돌아간다.
printf '%s\n' "$MEDIFINDER_DOMAIN" > "$work/CNAME"

# Jekyll 을 끈다. SPA 라우팅과 무관하게, _ 로 시작하는 자산이 있어도 Pages 가 무시하지 않게 한다.
touch "$work/.nojekyll"

# SPA 폴백. medifinder-web 은 클라이언트 라우팅(react-router)이라 /ko/... 같은 경로를
# 새로고침하면 Pages 가 그 파일을 찾다 404 를 낸다. 404.html 을 index 와 같게 두면
# 어떤 경로든 앱이 뜨고, 라우터가 URL 을 읽어 화면을 잡는다.
cp "$work/index.html" "$work/404.html"
endgroup

# --- 5. 커밋 & 푸시 ------------------------------------------------------------
cd "$work"
git config user.name 'github-actions[bot]'
git config user.email 'github-actions[bot]@users.noreply.github.com'

# 배포 결과는 **생성물**이라 history 가 무의미하다 — 자산 파일명에 해시가 박혀(app.<hash>.js)
# 매 배포마다 새 파일이 되니, 커밋을 쌓으면 .git 이 계속 커진다. 그래서 **매 배포를 부모 없는
# 단일 커밋(orphan)으로 만들어 force push** 한다. gh-pages 는 항상 커밋 1개고, 버려진 옛 커밋은
# GitHub 이 GC 로 정리한다.
#
# 그래서 "바뀐 게 없으면 스킵" 같은 diff 검사도, force 옵션도 없다 — 트리거(#deploy/수동)가
# 이미 "배포하겠다" 는 의도라, 트리거되면 항상 그대로 배포한다.
# 롤백은 git 이 아니라 그 소스로 다시 빌드해서 한다(커밋 메시지의 hans-api@sha 로 추적).
git checkout -q --orphan __deploy
git add -A

# 어느 소스에서 나왔는지 남긴다. git 에 직접 묻지 않는 이유는 version.sh 와 같다 —
# 컨테이너 잡에서 git 이 소유권 때문에 거부한다.
src_sha="${GIT_SHA:-${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)}}"
src_sha="${src_sha:0:7}"

git commit -q -m "web($env_name): hans-api@${src_sha}"
# 부모 없는 단일 커밋을 gh-pages 에 강제로 얹는다(원격 history 통째 교체). 브랜치가 없으면 생성.
git push -q -f origin "__deploy:$GHPAGES_BRANCH"

echo "✅ 배포됨 → https://$MEDIFINDER_DOMAIN/"
