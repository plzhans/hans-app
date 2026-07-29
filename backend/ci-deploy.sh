#!/usr/bin/env bash
#
# 이미 레지스트리에 있는 이미지를 서버가 당겨 띄우게 한다. **이미지를 굽지 않는다.**
#
#   APP_ENV=develop IMAGE_TAG=develop-a1b2c3d backend/ci-deploy.sh
#
# 굽는 것은 be-image.yml(CI) 또는 backend/build.sh(로컬)가 한다. 여기는 "어느 태그를
# 띄울지" 만 안다. 그래서 롤백이 재빌드 없이 태그 지정만으로 끝난다.
#
# **값은 오로지 환경변수로만 받는다.** 누가 채웠는지 이 스크립트는 모른다.
#   CI    .github/workflows/be-deploy.yml 이 secrets/vars 로 주입
#   로컬  backend/deploy.sh 가 backend/.env 를 읽어 주입
#
# [환경변수]
#   APP_ENV                       develop | production
#   IMAGE_TAG                     띄울 이미지 태그 (v0.2.0 · develop-<sha>)
#   BE_HANSAPP_DEPLOY_SSH_HOST    ubuntu@10.0.0.101
#   BE_HANSAPP_DEPLOY_SSH_KEY_FILE  SSH 개인키. **경로 또는 내용**
#   BE_HANSAPP_DEPLOY_PATH        ~/app/hansapp-prod
#   BE_WIREGUARD_PEER_CONF_FILE   (선택) WireGuard 설정. **경로 또는 내용**
#   BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS (선택) 서버 host key
#
# [WireGuard 를 조건부로 올리는 이유]
# 로컬은 작업 환경이라 VPN 이 이미 붙어 있다. CI 는 매번 새 러너라 직접 올려야 한다.
# 그 차이를 if 로 가르지 않고 **설정이 주어졌는가**로 판단한다 — 로컬에서는 이 변수를
# 비워 두면 그만이고, 스크립트는 자기가 어디서 도는지 몰라도 된다.
#
# **동시 실행이 금지다.** WireGuard 피어는 같은 키로 두 곳에서 붙을 수 없다. 두 배포가
# 겹치면 먼저 붙은 쪽의 연결이 끊겨 배포가 반쯤 진행된 채로 죽는다. 워크플로의
# concurrency 로 막아 두었다(be-deploy.yml). 로컬 키는 별개라 서로 간섭하지 않는다.
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)"   # <repo>/backend

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
    echo "   CI 면 워크플로우의 env: 를, 로컬이면 backend/deploy.sh 를 볼 것." >&2
    exit 1
  fi
}

# 값이 **경로면 그 파일을, 내용이면 그대로** 쓴다.
#
# GitHub Secrets 에는 파일을 못 넣어 내용이 문자열로 들어온다. 반면 로컬에서는
# ~/.ssh/id_rsa 처럼 경로를 가리키는 편이 자연스럽다. 양쪽을 다 받아 주면 사람이
# "여기선 내용, 저기선 경로" 를 기억하지 않아도 된다.
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

compose_src="$AREA_DIR/infra/$APP_ENV/docker-compose.yml"
[ -f "$compose_src" ] || die "$compose_src 가 없다."

# 임시 파일은 한 곳에 모아 두고 끝날 때 통째로 지운다. 키가 디스크에 남지 않게.
work="$(mktemp -d)"
cleanup() {
  local code=$?
  [ -n "${wg_iface:-}" ] && wg-quick down "$work/wg.conf" 2>/dev/null || true
  rm -rf "$work"
  exit $code
}
trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────────────────────────────────────
# WireGuard — 설정이 주어졌을 때만
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "${BE_WIREGUARD_PEER_CONF_FILE:-}" ]; then
  group 'wireguard 연결'
  materialize "$BE_WIREGUARD_PEER_CONF_FILE" "$work/wg.conf"
  # wg-quick 은 설정 파일 이름에서 인터페이스 이름을 딴다 → wg.conf 면 'wg'.
  wg-quick up "$work/wg.conf"
  wg_iface=wg
  endgroup
else
  echo "· WireGuard 설정이 없다. 이미 연결되어 있다고 보고 진행한다."
fi

# ─────────────────────────────────────────────────────────────────────────────
# SSH 준비
# ─────────────────────────────────────────────────────────────────────────────
materialize "$BE_HANSAPP_DEPLOY_SSH_KEY_FILE" "$work/id_deploy"

ssh_opts=(-i "$work/id_deploy" -o IdentitiesOnly=yes -o BatchMode=yes)
if [ -n "${BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS:-}" ]; then
  materialize "$BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS" "$work/known_hosts"
  ssh_opts+=(-o "UserKnownHostsFile=$work/known_hosts" -o StrictHostKeyChecking=yes)
else
  # host key 를 모르면 첫 접속을 받아들일 수밖에 없다. VPN 안이라 노출 면적이 작지만
  # MITM 을 완전히 배제하지는 못한다 — known_hosts 를 등록하면 이 분기가 사라진다.
  echo "⚠️  known_hosts 가 없다. 첫 접속의 host key 를 그대로 받아들인다."
  ssh_opts+=(-o "UserKnownHostsFile=$work/known_hosts" -o StrictHostKeyChecking=accept-new)
fi

remote() { ssh "${ssh_opts[@]}" "$BE_HANSAPP_DEPLOY_SSH_HOST" "$@"; }

echo
echo "배포:"
echo "  환경        $APP_ENV"
echo "  이미지 태그  $IMAGE_TAG"
echo "  서버        $BE_HANSAPP_DEPLOY_SSH_HOST"
echo "  경로        $BE_HANSAPP_DEPLOY_PATH"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 전송 · 기동
# ─────────────────────────────────────────────────────────────────────────────
group '연결 확인'
remote 'docker --version && docker compose version' | sed 's/^/  /'
endgroup

group 'compose 전송'
# 경로의 ~ 를 서버 셸이 풀게 한다. 로컬에서 풀면 로컬 홈이 박힌다.
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH"
scp "${ssh_opts[@]}" -q "$compose_src" "$BE_HANSAPP_DEPLOY_SSH_HOST:$BE_HANSAPP_DEPLOY_PATH/docker-compose.yml"

# **이 한 줄이 배포 상태의 전부다.** compose 는 인프라라 거의 안 바뀌고, 무엇이 떠 있는지는
# 여기에만 적힌다. 롤백은 이 값을 옛 태그로 바꿔 다시 up 하는 것이다.
remote "printf 'IMAGE_TAG=%s\n' '$IMAGE_TAG' > $BE_HANSAPP_DEPLOY_PATH/.env"
endgroup

# ─────────────────────────────────────────────────────────────────────────────
# 시크릿 — **암호문만 보내고 서버가 푼다**
#
# .sops.yaml 이 config/<환경>/ 과 config/.env.<환경> 에 **서버 age 키**를 넣어 둔 이유가
# 이것이다. 평문이 CI 러너 디스크에 존재하지 않고, 레지스트리나 로그를 볼 수 있는 사람이
# JWT 서명 키에 닿을 경로도 생기지 않는다.
#
# **.enc 만 골라 보낸다.** 로컬에는 복호화된 평문(*.key, .env.<환경>)이 같이 있는데,
# 디렉터리째 보내면 그것까지 올라간다. find 로 .enc 만 추린다.
# ─────────────────────────────────────────────────────────────────────────────
group '시크릿 전송 · 복호화'
(
  cd "$AREA_DIR"
  { find "config/$APP_ENV" -type f -name '*.enc'; echo "config/.env.$APP_ENV.enc"; } \
    | tar -czf "$work/config.tgz" -T -
)
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH"
scp "${ssh_opts[@]}" -q "$work/config.tgz" "$BE_HANSAPP_DEPLOY_SSH_HOST:$BE_HANSAPP_DEPLOY_PATH/config.tgz"

# 서버에서 푼다. PEM(*.key)은 dotenv/json 이 아니라 binary 모드여야 한다 — env-decrypt.sh 와 같은 규칙.
# 복호화 결과는 0600 으로 잠근다. 서명 키가 다른 사용자에게 읽히면 안 된다.
remote "set -e
  cd $BE_HANSAPP_DEPLOY_PATH
  tar -xzf config.tgz && rm -f config.tgz
  find config -type f -name '*.enc' | while IFS= read -r f; do
    out=\"\${f%.enc}\"
    case \"\$f\" in
      *.key.enc) sops --decrypt --input-type binary --output-type binary \"\$f\" > \"\$out\" ;;
      *)         sops --decrypt \"\$f\" > \"\$out\" ;;
    esac
    chmod 600 \"\$out\"
  done
  echo '  복호화 완료:'
  find config -type f ! -name '*.enc' | sed 's/^/    /'
"
endgroup

group 'pull · up'
# --remove-orphans: compose 에서 서비스를 지웠을 때 서버에 남은 컨테이너를 정리한다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose pull && docker compose up -d --remove-orphans"
endgroup

group '상태'
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose ps"
endgroup

echo "✅ $APP_ENV → $IMAGE_TAG"
