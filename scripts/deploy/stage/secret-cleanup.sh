#!/usr/bin/env bash
#
# 배포하며 만든 평문과 자격증명을 지운다.
#
#   APP_ENV=develop scripts/deploy/stage/secret-cleanup.sh
#
# [왜 별도 단계인가]
# 예전에는 한 스크립트가 mktemp -d 로 작업 공간을 잡고 EXIT 트랩으로 지웠다. 단계를
# 나누면 그럴 수가 없다 — **다음 단계가 그것을 읽어야** 하기 때문이다. 그래서 지우는
# 것이 명시적인 마지막 일이 되었다.
#
# **CI 는 이것을 always() 로 부른다.** 앞이 실패해도 키와 평문은 지워져야 한다.
# 로컬에서 개별 단계만 돌렸다면 직접 불러야 한다.
#
# [무엇을 지우나]
#   $DEPLOY_WORK/bundle/     복호화된 설정 트리 (평문 시크릿)
#   $DEPLOY_WORK/id_deploy   SSH 개인키
#   $DEPLOY_WORK/age.key     sops 복호화 키
#   $DEPLOY_WORK/ssh_config · known_hosts
#   서버의 GHCR 로그인       docker-image-pull 이 이미 지우지만 한 번 더 확인한다
#
# **wg.conf 는 남긴다.** 터널을 내리는 것은 scripts/deploy/wireguard.sh down 의 일이고,
# 그쪽이 이 파일을 필요로 한다 — 여기서 지우면 터널이 내려가지 않은 채로 남는다.
#
# [환경변수]
#   APP_ENV                  develop | production
#   BE_HANSAPP_DEPLOY_PATH   (선택) 있으면 서버 로그아웃까지 확인한다
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start '정리'

# 서버에 로그인 상태를 남기지 않는다. **실패해도 넘어간다** — 정리하는 쪽이라 여기서
# 멈춰봐야 할 일이 없고, 접속이 이미 끊긴 상태로 들어오는 것이 정상이다.
if [ -f "$SSH_CONFIG" ] && [ -n "${BE_HANSAPP_DEPLOY_PATH:-}" ]; then
  remote 'docker logout ghcr.io' >/dev/null 2>&1 || true
fi

removed=0
for path in bundle id_deploy age.key ssh_config known_hosts config.tgz; do
  if [ -e "$DEPLOY_WORK/$path" ]; then
    rm -rf "${DEPLOY_WORK:?}/$path"
    echo "  지움  $path"
    removed=$((removed + 1))
  fi
done

[ "$removed" -eq 0 ] && echo "  (지울 것 없음)"

echo "✅ 정리 완료"
