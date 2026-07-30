#!/usr/bin/env bash
#
# DB 스키마를 대상 환경에 반영한다. main·log 두 스키마를 함께 돌린다.
#
# **이 파일에는 진입점이 없다.** 필요한 값이 환경변수로 이미 있다고 보고 동작한다.
# CI 는 워크플로가(be-deploy.yml), 로컬은 backend/migrate.sh 가 채워 준다 —
# 같은 이름·같은 규칙이라 양쪽이 같은 코드를 지나간다. ci-deploy.sh 와 같은 구조다.
#
#   APP_ENV                       develop | production
#   IMAGE_TAG                     띄울 마이그레이션 이미지 태그
#   BE_HANSAPP_DEPLOY_SSH_HOST    ubuntu@10.0.0.101
#   BE_HANSAPP_DEPLOY_SSH_KEY_FILE  SSH 개인키. **경로 또는 내용**
#   BE_HANSAPP_DEPLOY_PATH        '~/app/hansapp-dev'
#   BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE  (선택)
#   BE_WIREGUARD_PEER_CONF_FILE   (선택) 채우면 그 설정으로 VPN 을 올린다
#   GHCR_TOKEN · GHCR_USER        (선택) private 이미지를 받을 때
#
# [서버에서 컨테이너로 돌린다]
# 배포 대상 서버에 SSH 로 붙어 마이그레이션 이미지를 한 번 띄운다. 배포하는 쪽(CI 러너·맥)에서
# prisma 를 돌리지 않는 이유는 세 가지다.
#
#   - CI 러너에는 node_modules 가 없다. 매번 pnpm install 을 해야 한다
#   - prisma 는 devDependency 라 런타임 이미지에 없다 — 어디서 돌릴지가 애매해진다
#   - **DB 가 사설망에 있다.** 서버에서 돌리면 이미 그 안이라 VPN 을 탈 이유가 없다
#
# 이미지에는 prisma CLI 와 스키마·마이그레이션 파일만 들어 있다(hansapp-migrate.Dockerfile).
# 운영 이미지에는 그것들이 없어야 한다 — 스키마를 바꿀 수 있는 도구를 서비스 컨테이너에
# 상주시키지 않으려는 것이다.
#
# [k3s 로 옮길 때]
# 이 스크립트는 버려지고 Job 이 그 자리를 맡는다. **이미지는 그대로 쓴다.**
#
# [되돌리기]
# `migrate deploy` 에는 down 이 없다. 되돌리려면 새 마이그레이션을 쓴다. 그래서 이미지는
# 태그만 바꿔 롤백되지만 스키마는 그렇지 않다 — 컬럼 삭제·이름 변경은 두 번에 나눈다
# (코드에서 안 쓰게 배포 → 다음 릴리스에서 실제 삭제).
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)" # <repo>/backend

die() {
  echo "❌ $*" >&2
  exit 1
}

group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

require_env() {
  local missing='' name value
  for name in "$@"; do
    eval "value=\${$name:-}"
    [ -n "$value" ] || missing="$missing  $name"$'\n'
  done
  if [ -n "$missing" ]; then
    echo "❌ 환경변수가 비어 있다:" >&2
    printf '%s' "$missing" >&2
    echo "   CI 면 워크플로우의 env: 를, 로컬이면 backend/migrate.sh 를 볼 것." >&2
    exit 1
  fi
}

# 값이 경로면 그 파일을, 내용이면 그대로 쓴다(ci-deploy.sh 와 같은 규칙).
materialize() {
  local value="$1" dest="$2"
  if [ -f "$value" ]; then
    cp "$value" "$dest"
  else
    printf '%s\n' "$value" > "$dest"
  fi
  chmod 600 "$dest"
}

require_env APP_ENV IMAGE_TAG \
  BE_HANSAPP_DEPLOY_SSH_HOST BE_HANSAPP_DEPLOY_SSH_KEY_FILE BE_HANSAPP_DEPLOY_PATH

case "$APP_ENV" in
  develop | production) ;;
  *) die "APP_ENV 는 develop | production 이어야 한다 (받은 값: $APP_ENV)" ;;
esac

work="$(mktemp -d)"
cleanup() {
  local code=$?
  [ -n "${wg_iface:-}" ] && wg-quick down "$work/wg.conf" 2>/dev/null || true
  rm -rf "$work"
  exit $code
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────────────
# 연결
# ─────────────────────────────────────────────────────────────────────────────
# 설정이 주어졌는가로 판단한다 — 로컬은 VPN 이 이미 붙어 있어 비워 두면 그만이고,
# 스크립트는 자기가 어디서 도는지 몰라도 된다.
if [ -n "${BE_WIREGUARD_PEER_CONF_FILE:-}" ]; then
  group 'wireguard 연결'
  command -v wg-quick >/dev/null || die 'wg-quick 이 없다.'
  materialize "$BE_WIREGUARD_PEER_CONF_FILE" "$work/wg.conf"
  wg-quick up "$work/wg.conf"
  wg_iface=1
  endgroup
fi

materialize "$BE_HANSAPP_DEPLOY_SSH_KEY_FILE" "$work/id_deploy"
ssh_opts=(-i "$work/id_deploy" -o IdentitiesOnly=yes -o BatchMode=yes)
if [ -n "${BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE:-}" ]; then
  materialize "$BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE" "$work/known_hosts"
  ssh_opts+=(-o "UserKnownHostsFile=$work/known_hosts" -o StrictHostKeyChecking=yes)
else
  ssh_opts+=(-o StrictHostKeyChecking=accept-new)
fi

remote() { ssh "${ssh_opts[@]}" "$BE_HANSAPP_DEPLOY_SSH_HOST" "$@"; }

echo
echo "  환경      $APP_ENV"
echo "  이미지    $IMAGE_TAG"
echo "  서버      $BE_HANSAPP_DEPLOY_SSH_HOST"
echo "  스키마    prisma/main · prisma/log"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 실행
# ─────────────────────────────────────────────────────────────────────────────
# compose 와 config 는 배포가 이미 올려 두었거나, 이 다음에 올린다. 여기서는 그 자리에
# 있는 것을 쓴다 — 마이그레이션이 배포보다 먼저 도는 순서라, 첫 배포라면 compose 가
# 아직 없을 수 있다. 그때는 명확한 메시지로 멈춘다.
remote "test -f $BE_HANSAPP_DEPLOY_PATH/docker-compose.yml" \
  || die "서버에 docker-compose.yml 이 없다. 배포를 한 번 먼저 돌릴 것 (deploy.sh)."

if [ -n "${GHCR_TOKEN:-}" ]; then
  group 'GHCR 로그인'
  printf '%s' "$GHCR_TOKEN" | remote "docker login ghcr.io -u ${GHCR_USER:-x} --password-stdin"
  ghcr_logged_in=1
  endgroup
fi

group '마이그레이션'
# --rm: 끝나면 컨테이너를 지운다. 작업이지 서비스가 아니다.
# IMAGE_TAG 를 명령 앞에 붙여 그 실행에만 적용한다 — 서버 .env 의 값(지금 떠 있는 앱의
# 버전)을 건드리지 않는다. 배포가 아직 안 됐을 수도 있어 그 파일은 배포의 몫으로 둔다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && IMAGE_TAG='$IMAGE_TAG' docker compose run --rm migrate"
endgroup

if [ -n "${ghcr_logged_in:-}" ]; then
  remote 'docker logout ghcr.io' >/dev/null 2>&1 || true
fi

echo "✅ $APP_ENV 마이그레이션 완료"
