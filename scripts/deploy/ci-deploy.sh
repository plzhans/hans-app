#!/usr/bin/env bash
#
# 이미 레지스트리에 있는 이미지를 서버가 당겨 띄우게 한다. **이미지를 굽지 않는다.**
#
#   APP_ENV=develop IMAGE_TAG=develop-a1b2c3d scripts/deploy/ci-deploy.sh
#
# 굽는 것은 be-image.yml(CI) 또는 scripts/deploy/build.sh(로컬)가 한다. 여기는 "어느 태그를
# 띄울지" 만 안다. 그래서 롤백이 재빌드 없이 태그 지정만으로 끝난다.
#
# **값은 오로지 환경변수로만 받는다.** 누가 채웠는지 이 스크립트는 모른다.
#   CI    .github/workflows/be-deploy-<환경>.yml 이 secrets/vars 로 주입
#   로컬  scripts/deploy/deploy.sh 가 backend/.env 를 읽어 주입
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
#   SLACK_DEPLOY_THREAD_TIMESTAMP (선택) 배포 스레드의 ts. 서버로 넘겨 앱이 기동 알림을
#                                 그 스레드에 답글로 달게 한다. 로컬은 보통 비운다
#
# [WireGuard 를 조건부로 올리는 이유]
# 로컬은 작업 환경이라 VPN 이 이미 붙어 있다. CI 는 매번 새 러너라 직접 올려야 한다.
# 그 차이를 if 로 가르지 않고 **설정이 주어졌는가**로 판단한다 — 로컬에서는 이 변수를
# 비워 두면 그만이고, 스크립트는 자기가 어디서 도는지 몰라도 된다.
#
# **동시 실행이 금지다.** WireGuard 피어는 같은 키로 두 곳에서 붙을 수 없다. 두 배포가
# 겹치면 먼저 붙은 쪽의 연결이 끊겨 배포가 반쯤 진행된 채로 죽는다. 워크플로의
# concurrency 로 막아 두었다(be-deploy-<환경>.yml). 로컬 키는 별개라 서로 간섭하지 않는다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)" # <repo>

# 배포 대상의 위치. **도구와 대상이 다른 곳에 있을 수 있다.**
#
# CI 는 도구를 main 에서, 배포되는 것(설정·compose)을 릴리스 태그에서 따로 받아 온다 —
# 도구는 계속 나아지는 물건이라 옛 릴리스에 묶을 이유가 없고, 배포되는 것은 묶을 때로
# 고정돼야 하기 때문이다. 로컬에서는 둘이 같은 트리에 있어 기본값이 맞는다.
AREA_DIR="${BACKEND_DIR:-$ROOT_DIR/backend}"

die() {
  # 열린 단계를 먼저 닫는다. 안 닫으면 CI 에서 **에러 메시지가 접힌 그룹 안에 숨는다.**
  end_phase
  echo "❌ $*" >&2
  exit 1
}

# 배포가 어느 단계에 들어섰는지 선언한다. **로그 접기는 부수 효과지 본체가 아니다** —
# CI 에서는 마침 ::group:: 으로 접히고, 로컬에서는 제목 한 줄로 보인다.
#
# **닫는 짝이 없다.** 다음 phase 가 앞의 것을 닫고, 마지막 하나는 EXIT 트랩(cleanup)이
# 닫는다. 짝을 손으로 맞추게 두면 언젠가 하나를 빠뜨리는데, 그 대가가 예전에는 로그
# 들여쓰기가 어긋나는 정도였다. 여기에 알림이 얹히면 **"이 단계가 끝났다" 는 사실이
# 조용히 사라지는** 것으로 바뀐다 — 짝을 아예 없애면 틀릴 수가 없다.
current_phase=''

phase() {
  end_phase
  current_phase="$1"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}

# 열려 있는 단계가 있으면 닫는다. 없으면 아무것도 안 한다 — 두 번 불려도 안전해야 한다
# (die 가 닫고 나가면 EXIT 트랩이 한 번 더 부른다).
end_phase() {
  [ -n "$current_phase" ] || return 0
  current_phase=''
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
    echo "   CI 면 워크플로우의 env: 를, 로컬이면 scripts/deploy/deploy.sh 를 볼 것." >&2
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
  # 마지막 단계를 닫는 것은 여기 몫이다 — phase 에는 닫는 짝이 없다.
  end_phase
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
  phase 'wireguard 연결'
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
phase '연결 확인'
remote 'docker --version && docker compose version' | sed 's/^/  /'

phase 'compose 전송'
# 경로의 ~ 를 서버 셸이 풀게 한다. 로컬에서 풀면 로컬 홈이 박힌다.
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH"
scp "${ssh_opts[@]}" -q "$compose_src" "$BE_HANSAPP_DEPLOY_SSH_HOST:$BE_HANSAPP_DEPLOY_PATH/docker-compose.yml"

# **이 파일이 배포 상태의 전부다.** compose 는 인프라라 거의 안 바뀌고, 무엇이 떠 있는지는
# 여기에만 적힌다. 롤백은 IMAGE_TAG 를 옛 태그로 바꿔 다시 up 하는 것이다.
#
# **uid 는 서버가 스스로 답한다.** 마운트된 설정은 이 접속 계정 소유이므로, 컨테이너가
# 같은 번호로 돌아야 읽을 수 있다. 로컬에서 계산해 보내면 배포하는 사람의 번호가 박힌다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && {
  printf 'IMAGE_TAG=%s\n' '$IMAGE_TAG'
  printf 'APP_UID=%s\n'   \"\$(id -u)\"
  printf 'APP_GID=%s\n'   \"\$(id -g)\"
} > .env"

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
phase '설정 · 시크릿 전송'

# age 키. 로컬은 기본 경로(~/.config/sops/age/keys.txt)에 이미 있어 보통 비어 있다.
if [ -n "${AGE_SECRET_KEY_FILE:-}" ]; then
  materialize "$AGE_SECRET_KEY_FILE" "$work/age.key"
  export SOPS_AGE_KEY_FILE="$work/age.key"

  # **키 파일의 모양을 먼저 본다.** 값을 볼 수 없는 곳(GitHub Secrets)에서 온 것이라,
  # 잘못 들어가 있어도 sops 는 "복호화 실패" 라고만 말한다. 그 메시지로는 키가 틀린
  # 것인지 파일이 깨진 것인지 구분되지 않아, 한참을 엉뚱한 데서 찾게 된다.
  #
  # 값 자체는 절대 찍지 않는다 — 형태만 센다.
  if ! grep -qE '^AGE-SECRET-KEY-1[A-Z0-9]+$' "$work/age.key"; then
    echo "❌ age 키 파일에 개인키 줄이 없다." >&2
    echo "   AGE_SECRET_KEY_FILE 에 **키 파일 내용 전체**가 들어가야 한다." >&2
    echo >&2
    echo "   받은 것의 모양:" >&2
    awk '{
      if ($0 ~ /^#/)                     printf "     %d: 주석\n", NR;
      else if ($0 ~ /^AGE-SECRET-KEY-1/) printf "     %d: 개인키(형식 어긋남, %d자)\n", NR, length($0);
      else if ($0 ~ /^age1/)             printf "     %d: **공개키** — 개인키가 아니다\n", NR;
      else if ($0 == "")                 printf "     %d: 빈 줄\n", NR;
      else                               printf "     %d: 알 수 없음 (%d자, 앞 4자 \"%s\")\n", NR, length($0), substr($0,1,4);
    }' "$work/age.key" >&2
    echo >&2
    echo "   고치는 법:" >&2
    echo "     gh secret set AGE_SECRET_KEY_FILE --env $APP_ENV < ~/.config/sops/age/<키파일>.txt" >&2
    exit 1
  fi
fi

command -v sops >/dev/null || die "sops 가 없다. 복호화는 배포하는 쪽에서 한다."

# **compose 가 읽을 것이므로 `$` 를 `$$` 로 이스케이프한다.**
#
# docker compose 는 env_file 값을 보간한다. 비밀번호에 $ 가 있으면 그 뒤를 변수 이름으로
# 읽어 통째로 지운다 — 운영 DATABASE_URL 이 그렇게 잘려 "invalid port number" 로 죽었다.
# compose 는 보간 단계에서 $$ 를 $ 하나로 되돌리므로 값이 온전히 도착한다.
#
# `format: raw` 로 보간을 끌 수도 있지만 그것은 **따옴표도 안 벗긴다.** 우리 env 는 값이
# 따옴표로 감싸여 있어 DATABASE_URL 이 '"mysql://…"' 가 되고 prisma 가 거부한다.
#
# **서버 파일에는 $$ 로 남는다.** 비밀번호를 확인하러 그 파일을 열면 실제 값과 달라 보인다는
# 뜻이다 — 레포의 평문(sops 로 푼 것)이 정본이므로 확인은 그쪽에서 한다.
#
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
        # env 는 compose 가 env_file 로 읽는다 — 위의 이스케이프 설명 참고.
        .env*.enc | */.env*.enc) sops --decrypt "$f" | sed 's/\$/$$/g' > "$out" ;;
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
# **소유권을 넘기지 않는다.** 컨테이너가 배포 계정과 같은 uid 로 돌기 때문이다
# (compose 의 user: 와 이미지의 APP_UID). 파일은 0600 배포 계정 소유 그대로 두면 되고,
# 같은 호스트의 다른 계정은 여전히 못 읽는다.
#
# 예전에는 이미지 유저(10001)가 달라서 sudo chown 으로 맞췄는데, 번호를 같게 두면 그
# 단계와 sudo 요구가 함께 사라진다.
tar -czf "$work/config.tgz" -C "$work" config
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH"
scp "${ssh_opts[@]}" -q "$work/config.tgz" "$BE_HANSAPP_DEPLOY_SSH_HOST:$BE_HANSAPP_DEPLOY_PATH/config.tgz"
remote "set -e
  cd $BE_HANSAPP_DEPLOY_PATH

  # **매번 통째로 갈아끼운다.** 새 디렉터리에 풀고 교체하므로 반쯤 갱신된 상태가 안 생긴다.
  rm -rf config.new && mkdir config.new
  tar -xzf config.tgz -C config.new --strip-components=1
  rm -f config.tgz

  # 예전 배포가 남긴 것은 컨테이너 uid(10001) 소유라 이 계정이 못 지운다. 그때만 sudo 로
  # 치운다 — 소유권을 안 넘기는 지금 방식으로 한 번 배포되고 나면 이 갈래는 안 쓰인다.
  rm -rf config 2>/dev/null || sudo rm -rf config
  mv config.new config

  # 전부 잠근다. 컨테이너가 이 계정과 같은 uid 로 돌기 때문에 0600 으로도 읽는다 —
  # config.yaml 을 644 로 열거나 secrets 소유권을 넘길 이유가 없다.
  find config -type f -exec chmod 600 {} +
  echo \"  config 소유자 \$(id -u):\$(id -g) · 0600 (컨테이너도 같은 uid 로 돈다)\"
"

# 이미지가 private 이면 서버도 GHCR 에 인증해야 한다.
#
# **서버에 자격증명을 남기지 않는다.** 배포할 때만 로그인하고 끝나면 지운다. CI 는
# GITHUB_TOKEN 을 넘기는데 그건 잡이 끝나면 만료되는 임시 토큰이라, 남아도 무해하고
# 만료 관리도 필요 없다. 영구 PAT 을 서버에 심어두면 만료일마다 배포가 죽고, 서버가
# 뚫릴 때 토큰까지 같이 나간다.
#
# 값이 없으면 로그인을 건너뛴다 — 이미지를 public 으로 돌렸거나 서버가 이미 로그인된 경우다.
if [ -n "${GHCR_TOKEN:-}" ]; then
  phase 'GHCR 로그인'
  printf '%s' "$GHCR_TOKEN" | remote "docker login ghcr.io -u ${GHCR_USER:-x} --password-stdin"
  # 성공하든 실패하든 반드시 지운다.
  ghcr_logged_in=1
fi

phase 'pull · up'
# --remove-orphans: compose 에서 서비스를 지웠을 때 서버에 남은 컨테이너를 정리한다.
#
# **슬랙 스레드 ts 는 이 명령에만 붙인다.** 서버의 .env 에 쓰면 그 파일이 계속 남아 다음
# 재시작에도 옛 스레드를 가리킨다. 여기서 주면 그 up 에만 적용되고 파일에는 안 남는다.
# (컨테이너 환경에는 구워지므로, 낡은 값은 앱이 ts 의 나이를 보고 무시한다.)
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose pull && SLACK_DEPLOY_THREAD_TIMESTAMP='${SLACK_DEPLOY_THREAD_TIMESTAMP:-}' docker compose up -d --remove-orphans"

if [ -n "${ghcr_logged_in:-}" ]; then
  remote 'docker logout ghcr.io' >/dev/null 2>&1 || true
  ghcr_logged_in=''   # cleanup 이 한 번 더 부르지 않게
fi

phase '상태'
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose ps"

echo "✅ $APP_ENV → $IMAGE_TAG"
