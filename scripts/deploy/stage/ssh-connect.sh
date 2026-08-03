#!/usr/bin/env bash
#
# 서버 접속 수단을 갖추고, 실제로 닿는지 확인한다.
#
#   APP_ENV=develop scripts/deploy/stage/ssh-connect.sh
#
# **키를 $DEPLOY_WORK 에 놓고 ssh_config 한 장을 만든다.** 이후 모든 단계는 그 파일만
# 보면 되고(-F), 키 경로·known_hosts·옵션을 각자 알 필요가 없다.
#
# 예전에는 ssh_opts 배열을 만들어 한 스크립트 안에서 돌려썼는데, 단계를 나누면 배열을
# 넘길 방법이 없다. **설정 파일로 바꾸면 파일이 곧 상태**라 넘기고 말고 할 것이 없어진다.
#
# 터널은 이 단계가 모른다 — scripts/deploy/wireguard.sh 가 이미 올려 뒀거나(CI),
# 로컬처럼 원래 붙어 있거나 둘 중 하나다.
#
# [환경변수]
#   APP_ENV                                 develop | production
#   BE_HANSAPP_DEPLOY_SSH_HOST              ubuntu@10.0.0.101
#   BE_HANSAPP_DEPLOY_SSH_KEY_FILE          SSH 개인키. **경로 또는 내용**
#   BE_HANSAPP_DEPLOY_PATH                  ~/app/hansapp-dev
#   BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE  (선택) 서버 host key
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start 'ssh 접속 준비'

require_env BE_HANSAPP_DEPLOY_SSH_HOST BE_HANSAPP_DEPLOY_SSH_KEY_FILE BE_HANSAPP_DEPLOY_PATH

# ubuntu@10.0.0.101 → 사용자와 호스트로 가른다. ssh_config 는 둘을 따로 적는다.
case "$BE_HANSAPP_DEPLOY_SSH_HOST" in
  *@*)
    ssh_user="${BE_HANSAPP_DEPLOY_SSH_HOST%%@*}"
    ssh_host="${BE_HANSAPP_DEPLOY_SSH_HOST#*@}"
    ;;
  *)
    die "BE_HANSAPP_DEPLOY_SSH_HOST 는 user@host 형식이어야 한다 (받은 값: $BE_HANSAPP_DEPLOY_SSH_HOST)"
    ;;
esac

materialize "$BE_HANSAPP_DEPLOY_SSH_KEY_FILE" "$DEPLOY_WORK/id_deploy"

# host key 를 알면 검증하고, 모르면 첫 접속을 받아들일 수밖에 없다. VPN 안이라 노출
# 면적이 작지만 MITM 을 완전히 배제하지는 못한다 — known_hosts 를 등록하면 이 분기가
# 사라진다.
if [ -n "${BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE:-}" ]; then
  materialize "$BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE" "$DEPLOY_WORK/known_hosts"
  strict='yes'
else
  echo "⚠️  known_hosts 가 없다. 첫 접속의 host key 를 그대로 받아들인다."
  : > "$DEPLOY_WORK/known_hosts"
  chmod 600 "$DEPLOY_WORK/known_hosts"
  strict='accept-new'
fi

# **별칭은 'target' 하나뿐이다.** 각 단계가 `ssh -F "$SSH_CONFIG" target` 으로만 부르므로
# 호스트 주소가 스크립트 어디에도 안 박힌다.
cat > "$SSH_CONFIG" <<EOF
Host target
  HostName $ssh_host
  User $ssh_user
  IdentityFile $DEPLOY_WORK/id_deploy
  IdentitiesOnly yes
  BatchMode yes
  UserKnownHostsFile $DEPLOY_WORK/known_hosts
  StrictHostKeyChecking $strict
EOF
chmod 600 "$SSH_CONFIG"

echo "  서버   $BE_HANSAPP_DEPLOY_SSH_HOST"
echo "  경로   $BE_HANSAPP_DEPLOY_PATH"

# **여기서 한 번 닿아 본다.** 뒤 단계에서 처음 실패하면 그것이 접속 문제인지 그 단계의
# 문제인지 헷갈린다. 도커까지 확인하는 것은 어차피 전부 도커로 돌기 때문이다.
remote 'docker --version && docker compose version' | sed 's/^/  /'
