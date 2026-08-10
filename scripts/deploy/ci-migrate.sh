#!/usr/bin/env bash
#
# DB 스키마를 대상 환경에 반영한다. main·log 두 스키마를 함께 돌린다.
#
# **이 파일에는 진입점이 없다.** 필요한 값이 환경변수로 이미 있다고 보고 동작한다.
# CI 는 워크플로가(be-deploy-<환경>.yml), 로컬은 scripts/deploy/migrate.sh 가 채워 준다 —
# 같은 이름·같은 규칙이라 양쪽이 같은 코드를 지나간다. ci-deploy.sh 와 같은 구조다.
#
#   APP_ENV                       develop | production
#   IMAGE_TAG                     띄울 마이그레이션 이미지 태그
#   BE_HANSAPP_DEPLOY_SSH_HOST    ubuntu@10.0.0.101
#   BE_HANSAPP_DEPLOY_SSH_KEY_FILE  SSH 개인키. **경로 또는 내용**
#   BE_HANSAPP_DEPLOY_PATH        '~/app/hansapp-dev'
#   BE_HANSAPP_DEPLOY_SSH_KNOWN_HOSTS_FILE  (선택)
#   BE_WIREGUARD_PEER_CONF_FILE   (선택) 채우면 그 설정으로 VPN 을 올린다
#   AGE_SECRET_KEY_FILE           (선택) sops 복호화용 age 키. **경로 또는 내용**
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
# 이미지에는 prisma CLI 와 스키마·마이그레이션 파일만 들어 있다(hansapp-cli.Dockerfile).
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

# 단계 선언(ci-deploy.sh 와 같은 규칙). **닫는 짝이 없다** — 다음 phase 가 앞의 것을 닫고,
# 마지막 하나는 EXIT 트랩이 닫는다.
current_phase=''

phase() {
  end_phase
  current_phase="$1"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}

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
    echo "   CI 면 워크플로우의 env: 를, 로컬이면 scripts/deploy/migrate.sh 를 볼 것." >&2
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
  # 어디서 멈췄는지 스레드에 남긴다(ci-deploy.sh 와 같은 규칙).
  if [ "$code" -ne 0 ] && [ -n "$current_phase" ]; then
    "$ROOT_DIR/scripts/deploy/ci-slack-send.sh" \
      --thread "${SLACK_DEPLOY_THREAD_TIMESTAMP:-}" \
      --title "⚠️  '$current_phase' 에서 멈췄다" >/dev/null 2>&1 || true
  fi
  # 마지막 단계를 닫는 것은 여기 몫이다 — phase 에는 닫는 짝이 없다.
  end_phase
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
  phase 'wireguard 연결'
  command -v wg-quick >/dev/null || die 'wg-quick 이 없다.'
  materialize "$BE_WIREGUARD_PEER_CONF_FILE" "$work/wg.conf"
  wg-quick up "$work/wg.conf"
  wg_iface=1
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
# **compose 를 직접 올린다.** 마이그레이션이 배포보다 먼저 도는 순서라, 배포가 나르는
# compose 를 기다릴 수 없다. 서버에 옛 파일이 있으면 migrate 서비스가 없어서
# "no such service: migrate" 로 죽는다 — 실제로 그렇게 한 번 걸렸다.
#
# 덮어써도 안전하다. 같은 ref 의 같은 파일이고, 배포가 곧 다시 올린다.
compose_src="$AREA_DIR/infra/$APP_ENV/docker-compose.yml"
env_enc="$AREA_DIR/config/.env.$APP_ENV.enc"
[ -f "$compose_src" ] || die "$compose_src 가 없다."

phase 'compose 전송'
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH"
scp "${ssh_opts[@]}" -q "$compose_src" "$BE_HANSAPP_DEPLOY_SSH_HOST:$BE_HANSAPP_DEPLOY_PATH/docker-compose.yml"

# **접속 정보도 직접 올린다.** 마이그레이션에 필요한 것을 배포가 날라 주기를 기다리면,
# 첫 배포에서 순서가 꼬인다 — 마이그레이션이 배포보다 먼저 도는데 그 파일을 만드는 것이
# 배포이기 때문이다. 필요한 것은 필요한 쪽이 갖춘다.
#
# 여기서 쓰는 것은 env 파일 하나뿐이다. jwt·TLS 키는 앱의 것이라 배포가 나른다.
phase '접속 정보 전송'
[ -f "$env_enc" ] || die "$env_enc 가 없다."
command -v sops >/dev/null || die 'sops 가 없다. 복호화는 이쪽에서 한다.'

if [ -n "${AGE_SECRET_KEY_FILE:-}" ]; then
  materialize "$AGE_SECRET_KEY_FILE" "$work/age.key"
  export SOPS_AGE_KEY_FILE="$work/age.key"
fi

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
sops --decrypt "$env_enc" | sed 's/\$/$$/g' > "$work/env"
chmod 600 "$work/env"
remote "mkdir -p $BE_HANSAPP_DEPLOY_PATH/config"
scp "${ssh_opts[@]}" -q "$work/env" "$BE_HANSAPP_DEPLOY_SSH_HOST:$BE_HANSAPP_DEPLOY_PATH/config/.env.$APP_ENV"
remote "chmod 600 $BE_HANSAPP_DEPLOY_PATH/config/.env.$APP_ENV"
echo "  $(basename "$env_enc") → config/.env.$APP_ENV"

# **yaml 두 장을 다 올린다.** CLI 가 database.url 을 여기서 읽는다(값은 ${DATABASE_URL} 로
# env 에서 온다). 없으면 compose 가 마운트 원본을 못 찾아 **빈 디렉터리를 만들고**, CLI 가
# 그것을 읽다 EISDIR 로 죽는다 — 원인이 전혀 안 보이는 형태로 실패한다.
#
# **한 장만 올리면 안 된다.** 환경 파일에는 달라지는 값만 있어서 정본(config.yaml)이 빠지면
# database.url 부터 없는 반쪽이 된다. 실제로 정본만 빠뜨려 위 EISDIR 로 죽은 적이 있다.
for yaml_name in 'config.yaml' "config.$APP_ENV.yaml"; do
  yaml_src="$AREA_DIR/config/$yaml_name"
  [ -f "$yaml_src" ] || die "$yaml_src 가 없다."
  yaml_dst="$BE_HANSAPP_DEPLOY_PATH/config/$yaml_name"
  # **디렉터리로 남아 있으면 치운다.** 마운트 원본이 없는 채로 compose 가 돌면 도커가 그
  # 자리에 빈 디렉터리를 만든다. 그대로 두면 scp 가 'is a directory' 로 죽고, 지나가더라도
  # 앱이 그것을 읽다 EISDIR 로 죽는다. 비어 있을 때만 지운다 — 내용이 있으면 우리가 만든
  # 것이 아니므로 손대지 않고 멈춘다.
  remote "[ -d '$yaml_dst' ] && rmdir '$yaml_dst' || true"
  scp "${ssh_opts[@]}" -q "$yaml_src" "$BE_HANSAPP_DEPLOY_SSH_HOST:$yaml_dst"
  # 600 이면 된다. 컨테이너가 이 계정과 같은 uid 로 돌기 때문이다(compose 의 user:).
  remote "chmod 600 $yaml_dst"
  echo "  $yaml_name"
done

if [ -n "${GHCR_TOKEN:-}" ]; then
  phase 'GHCR 로그인'
  printf '%s' "$GHCR_TOKEN" | remote "docker login ghcr.io -u ${GHCR_USER:-x} --password-stdin"
  ghcr_logged_in=1
fi

phase '마이그레이션'
# --rm: 끝나면 컨테이너를 지운다. 작업이지 서비스가 아니다.
# IMAGE_TAG 를 명령 앞에 붙여 그 실행에만 적용한다 — 서버 .env 의 값(지금 떠 있는 앱의
# 버전)을 건드리지 않는다. 배포가 아직 안 됐을 수도 있어 그 파일은 배포의 몫으로 둔다.
#
# uid 도 같이 넘긴다. 첫 배포에서는 .env 가 아직 없어 compose 기본값(1001)으로 떨어지는데,
# 접속 계정이 그 번호가 아니면 마운트한 yaml 을 못 읽는다.
# **반드시 pull 부터 한다.** develop 은 :develop 처럼 움직이는 태그를 쓰는데, 이름이 그대로면
# 도커는 "이미 있다" 고 보고 로컬 캐시를 쓴다. 그러면 레지스트리에 새 이미지가 올라와 있어도
# 서버는 옛것으로 돈다 — 고친 줄 알았던 버그가 그대로 재현되어 원인을 짚기 어렵다.
#
# **명령을 명시한다.** 이미지 기본 CMD 도 `db deploy` 지만, 서비스 이름이 hansapp-cli 라
# 무엇을 돌리는지가 이름으로는 안 드러난다. 같은 컨테이너로 시드·재색인도 돌리므로
# 여기서만은 적어 둔다 — 로그에도 그대로 남는다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && IMAGE_TAG='$IMAGE_TAG' docker compose --profile cli pull hansapp-cli"

# **--db 를 반드시 준다.** 생략하면 CLI 기본값이 main 이라 로그 DB 가 통째로 빠진다 —
# 위 안내문은 "main · log 둘 다" 라고 적혀 있는데 실제로는 main 만 돌아, 운영 로그 DB 가
# 몇 달치 마이그레이션이 밀린 채로 성공 표시가 나 있었다.
#
# main 을 먼저 돌린다. 서비스가 뜨는 데 필요한 것은 그쪽이고, 로그 DB 는 못 따라가도
# 인증·업무는 돈다(로그 적재만 실패한다).
for db in main log; do
  echo "  → $db"
  remote "cd $BE_HANSAPP_DEPLOY_PATH && IMAGE_TAG='$IMAGE_TAG' APP_UID=\"\$(id -u)\" APP_GID=\"\$(id -g)\" docker compose run --rm hansapp-cli db deploy --db $db"
done

if [ -n "${ghcr_logged_in:-}" ]; then
  remote 'docker logout ghcr.io' >/dev/null 2>&1 || true
fi

echo "✅ $APP_ENV 마이그레이션 완료"
