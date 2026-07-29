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
#   BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE (선택) 서버 host key
#   GHCR_TOKEN                    (선택) 서버가 이미지를 받을 때 쓸 토큰.
#                                 CI 는 GITHUB_TOKEN, 로컬은 read:packages PAT
#   GHCR_USER                     (선택) 위 토큰의 사용자. 기본 x
#   AGE_SECRET_KEY_FILE           (선택) sops 복호화용 age 키. **경로 또는 내용**
#                                 로컬은 기본 경로에 이미 있어 보통 비운다
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
  # 중간에 죽어도 서버에 로그인 상태를 남기지 않는다.
  [ -n "${ghcr_logged_in:-}" ] && remote 'docker logout ghcr.io' >/dev/null 2>&1 || true
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

  # **핸드셰이크를 확인한다.** WireGuard 는 UDP 라 wg-quick up 이 성공해도 상대가
  # 응답했는지는 알 수 없다. 확인하지 않으면 터널이 안 뚫린 채로 SSH 를 시도하다
  # 60초 timeout 을 기다리게 되고, 에러 메시지도 "connect timed out" 뿐이라
  # 원인이 VPN 인지 서버인지 방화벽인지 구분이 안 된다.
  handshake=0
  for _ in $(seq 1 15); do
    handshake=$(wg show "$wg_iface" latest-handshakes 2>/dev/null | awk '{print $2}' | sort -rn | head -1)
    [ "${handshake:-0}" -gt 0 ] && break
    sleep 1
  done
  if [ "${handshake:-0}" -eq 0 ]; then
    echo '--- wg show ---' >&2
    wg show "$wg_iface" >&2 || true
    die "WireGuard 핸드셰이크가 없다(15초).
   확인할 것:
     - 피어 공개키가 서버에 등록되어 있는지
     - Endpoint 주소·포트가 맞고 UDP 가 막히지 않았는지
     - **같은 키를 다른 곳에서 쓰고 있지 않은지** — 피어는 동시 접속이 안 된다"
  fi
  echo "· 핸드셰이크 확인됨"
  endgroup
else
  echo "· WireGuard 설정이 없다. 이미 연결되어 있다고 보고 진행한다."
fi

# ─────────────────────────────────────────────────────────────────────────────
# SSH 준비
# ─────────────────────────────────────────────────────────────────────────────
materialize "$BE_HANSAPP_DEPLOY_SSH_KEY_FILE" "$work/id_deploy"

ssh_opts=(-i "$work/id_deploy" -o IdentitiesOnly=yes -o BatchMode=yes)
if [ -n "${BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE:-}" ]; then
  materialize "$BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE" "$work/known_hosts"
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
# 시크릿 — **여기서 풀어서 평문을 보낸다**
#
# 복호화하는 쪽에는 이미 sops 와 age 키가 있다 — 로컬은 개발자가 암복호화에 쓰는 것,
# CI 는 node-builder 이미지에 sops 가 들어 있고 AGE_SECRET_KEY_FILE 로 키를 받는다.
# 서버에 sops 를 새로 깔지 않아도 되고, 서버는 받은 파일을 놓기만 한다.
#
# 평문이 SSH 로 가는 것은 문제가 아니다 — 채널이 암호화돼 있고, 어차피 서버에는
# 평문으로 놓여야 앱이 읽는다. 레지스트리나 로그에는 어느 단계에서도 남지 않는다.
# ─────────────────────────────────────────────────────────────────────────────
group '설정 · 시크릿 전송'

# age 키. 로컬은 기본 경로(~/.config/sops/age/keys.txt)에 이미 있어 보통 비어 있다.
if [ -n "${AGE_SECRET_KEY_FILE:-}" ]; then
  materialize "$AGE_SECRET_KEY_FILE" "$work/age.key"
  export SOPS_AGE_KEY_FILE="$work/age.key"
fi

command -v sops >/dev/null || die "sops 가 없다. 복호화는 배포하는 쪽에서 한다."

# .enc 를 풀어 $work/config 아래에 같은 구조로 놓는다.
#
# PEM(*.key)은 dotenv/json 이 아니라 binary 모드여야 한다 — env-decrypt.sh 와 같은 규칙.
# 원본 트리를 건드리지 않으므로 로컬의 평문·암호문이 섞이지 않는다.
(
  cd "$AREA_DIR"
  { find "config/$APP_ENV" -type f -name '*.enc'; echo "config/.env.$APP_ENV.enc"; } \
  | while IFS= read -r f; do
      out="$work/${f%.enc}"
      mkdir -p "$(dirname "$out")"
      case "$f" in
        *.key.enc | *.pem.enc) sops --decrypt --input-type binary --output-type binary "$f" > "$out" ;;
        *)         sops --decrypt "$f" > "$out" ;;
      esac
      chmod 600 "$out"
      echo "  $f → ${f%.enc}"
    done

  # 환경별 yaml. **비밀이 아니라 복호화 대상이 아니지만 같이 나른다** — 이미지에 굽지
  # 않기 때문이다(이미지는 환경을 모른다). 컨테이너에서는 config/config.yaml 로 마운트된다.
  #
  # 이미지에 굽지 않는 대신 배포가 나르므로, **이미지와 설정이 어긋날 수 있다.** 서버의
  # yaml 은 배포할 때마다 덮어써지니 레포가 정본이고, 서버에서 직접 고치면 다음 배포가 지운다.
  yaml="config/config.$APP_ENV.yaml"
  [ -f "$yaml" ] || die "$yaml 이 없다."
  mkdir -p "$work/config"
  cp "$yaml" "$work/$yaml"
  chmod 644 "$work/$yaml"
  echo "  $yaml (비밀 아님)"
)

# 전송. 서버에서 권한을 다시 잠근다 — scp 는 원본 모드를 항상 보존하지 않는다.
#
# **소유자를 컨테이너 유저로 넘긴다.** 0600 은 SSH 접속 계정만 읽을 수 있다는 뜻인데,
# 정작 파일을 읽어야 하는 건 컨테이너 안의 프로세스다. 접속 계정(uid 1001)과 이미지
# 유저(node, uid 1000)가 다르면 컨테이너가 Permission denied 로 설정을 못 읽고,
# 앱은 "설정이 없다" 며 부팅에 실패한다 — 파일은 멀쩡히 마운트돼 있는데도.
#
# 권한을 넓히지(0644) 않고 소유자만 바꾸는 이유는, 같은 호스트의 다른 계정이 비밀을
# 읽게 되는 것을 피하기 위해서다. 읽을 수 있는 주체를 하나로 유지하되 그 하나를
# 컨테이너로 옮기는 것이다.
#
# uid 를 상수로 박지 않고 **이미지에서 읽어온다.** 이미지가 유저를 바꾸면 자동으로 따라간다.
tar -czf "$work/config.tgz" -C "$work" config
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH"
scp "${ssh_opts[@]}" -q "$work/config.tgz" "$BE_HANSAPP_DEPLOY_SSH_HOST:$BE_HANSAPP_DEPLOY_PATH/config.tgz"
remote "set -e
  cd $BE_HANSAPP_DEPLOY_PATH

  # **매번 통째로 갈아끼운다.** 이전 설정은 컨테이너 uid 소유라 SSH 계정이 덮어쓸 수 없다
  # (0600 이고 소유자가 다르다). 제자리에서 풀려고 하면 tar 가 권한 오류로 죽는다.
  # 그래서 새 디렉터리에 풀고 통째로 교체한다 — 반쯤 갱신된 상태도 안 생긴다.
  rm -rf config.new && mkdir config.new
  tar -xzf config.tgz -C config.new --strip-components=1
  rm -f config.tgz

  sudo rm -rf config
  mv config.new config
  find config -type f -exec chmod 600 {} +

  # 이미지 이름은 compose 가 안다 — 여기서 레지스트리 경로를 다시 적지 않는다.
  # USER 가 이름(node)일 수 있어 이미지 안에서 id 로 풀어 실제 uid:gid 를 얻는다.
  img=\"\$(docker compose config --images 2>/dev/null | head -1)\"
  owner=\"\$(docker run --rm --entrypoint sh \"\$img\" -c 'echo \$(id -u):\$(id -g)' 2>/dev/null || true)\"
  if [ -n \"\$owner\" ]; then
    # **비밀 에셋(jwt·TLS)만 넘긴다.** 컨테이너에서 config/secrets 로 마운트되는 그 디렉터리다.
    # config.yaml 은 비밀이 아니고, .env 는 도커가 호스트에서 읽어 주입하므로(env_file)
    # 배포 계정 소유로 남아야 한다 — 넘기면 compose 가 못 읽어 컨테이너가 안 뜬다.
    sudo chown -R \"\$owner\" "config/$APP_ENV"
    echo \"  secrets 소유자 → \$owner (컨테이너 유저)\"
  else
    echo '  ⚠ 이미지에서 uid 를 못 읽었다 — 컨테이너가 설정을 못 읽을 수 있다.' >&2
  fi
"
endgroup

# 이미지가 private 이면 서버도 GHCR 에 인증해야 한다.
#
# **서버에 자격증명을 남기지 않는다.** 배포할 때만 로그인하고 끝나면 지운다. CI 는
# GITHUB_TOKEN 을 넘기는데 그건 잡이 끝나면 만료되는 임시 토큰이라, 남아도 무해하고
# 만료 관리도 필요 없다. 영구 PAT 을 서버에 심어두면 만료일마다 배포가 죽고, 서버가
# 뚫릴 때 토큰까지 같이 나간다.
#
# 값이 없으면 로그인을 건너뛴다 — 이미지를 public 으로 돌렸거나 서버가 이미 로그인된 경우다.
if [ -n "${GHCR_TOKEN:-}" ]; then
  group 'GHCR 로그인'
  printf '%s' "$GHCR_TOKEN" | remote "docker login ghcr.io -u ${GHCR_USER:-x} --password-stdin"
  endgroup
  # 성공하든 실패하든 반드시 지운다.
  ghcr_logged_in=1
fi

group 'pull · up'
# --remove-orphans: compose 에서 서비스를 지웠을 때 서버에 남은 컨테이너를 정리한다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose pull && docker compose up -d --remove-orphans"
endgroup

if [ -n "${ghcr_logged_in:-}" ]; then
  remote 'docker logout ghcr.io' >/dev/null 2>&1 || true
  ghcr_logged_in=''   # cleanup 이 한 번 더 부르지 않게
fi

group '상태'
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose ps"
endgroup

echo "✅ $APP_ENV → $IMAGE_TAG"
