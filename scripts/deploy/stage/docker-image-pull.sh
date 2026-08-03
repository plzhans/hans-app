#!/usr/bin/env bash
#
# 서버가 GHCR 에서 이미지를 당긴다. **여기서 굽지 않는다.**
#
#   APP_ENV=develop scripts/deploy/stage/docker-image-pull.sh
#
# 굽는 것은 CI(main.yml 의 docker-image-push)나 로컬(scripts/deploy/build.sh)의 일이다.
# 이 단계는 "어느 태그를 받을지" 만 알고, 그 태그는 서버 .env 에 이미 적혀 있다
# (config-upload.sh 가 썼다). 그래서 롤백이 재빌드 없이 태그 지정만으로 끝난다.
#
# **앱을 멈추기 전에 받는다.** 받는 동안은 옛 컨테이너가 계속 돌아도 되므로, 다운타임이
# 이미지 전송 시간만큼 짧아진다. app-stop 이 이 뒤에 오는 이유다.
#
# **반드시 pull 부터 한다.** develop 은 :develop 처럼 움직이는 태그를 쓰는데, 이름이
# 그대로면 도커는 "이미 있다" 고 보고 로컬 캐시를 쓴다. 그러면 레지스트리에 새 이미지가
# 올라와 있어도 서버는 옛것으로 돈다 — 고친 줄 알았던 버그가 그대로 재현되어 원인을
# 짚기 어렵다.
#
# [환경변수]
#   APP_ENV                  develop | production
#   BE_HANSAPP_DEPLOY_PATH   ~/app/hansapp-dev
#   GHCR_TOKEN               (선택) 이미지가 private 이면 필요.
#                            CI 는 GITHUB_TOKEN, 로컬은 read:packages PAT
#   GHCR_USER                (선택) 위 토큰의 사용자. 기본 x
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start '이미지 받기'

require_env BE_HANSAPP_DEPLOY_PATH
require_ssh

# **서버에 자격증명을 남기지 않는다.** 받을 때만 로그인하고 끝나면 지운다. CI 는
# GITHUB_TOKEN 을 넘기는데 그건 잡이 끝나면 만료되는 임시 토큰이라 남아도 무해하지만,
# 영구 PAT 을 서버에 심어두면 만료일마다 배포가 죽고 서버가 뚫릴 때 토큰까지 같이 나간다.
#
# 값이 없으면 건너뛴다 — 이미지를 public 으로 돌렸거나 서버가 이미 로그인된 경우다.
logged_in=''
if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | remote "docker login ghcr.io -u ${GHCR_USER:-x} --password-stdin"
  logged_in=1
fi

# 성공하든 실패하든 반드시 지운다. stage_start 의 트랩과 별개로 여기서 한 번 더 건다 —
# 로그아웃은 이 단계가 연 것이므로 이 단계가 닫아야 한다.
logout_ghcr() {
  [ -n "$logged_in" ] || return 0
  remote 'docker logout ghcr.io' >/dev/null 2>&1 || true
  logged_in=''
}
trap 'logout_ghcr; _stage_end' EXIT

# **--profile migrate 를 붙인다.** migrate 서비스(hansapp-cli)는 profiles 에 들어 있어
# 기본 pull 로는 안 받아진다. 그런데 db-migrate.sh 가 곧 그 이미지를 쓴다 — 여기서 같이
# 받아 두지 않으면 앱을 멈춘 뒤에야 이미지를 받게 되어 다운타임이 그만큼 길어진다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose --profile migrate pull"

logout_ghcr

echo "✅ 이미지 받기 완료"
