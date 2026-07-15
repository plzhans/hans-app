#!/usr/bin/env bash
#
# backend 앱을 사설망 서버에 배포한다. **배포 로직의 유일한 출처다.**
# CI 워크플로우도, 로컬 테스트 스크립트도 이 파일을 호출만 한다.
#
# **빌드하지 않는다.** build.sh 가 backend/.deploy/<app> 에 만들어 둔 번들을 보낼 뿐이다.
# 배포가 다시 빌드하면 "검사를 통과한 그 산출물이 배포된다" 는 보장이 깨진다.
#
#   ./backend/scripts/build.sh                            # 1번. 번들을 만든다
#   ./backend/scripts/deploy-backend.sh hansapi-server    # N번. 앱마다(서버마다) 따로 보낸다
#   ./backend/scripts/deploy-backend.sh api               # 별칭도 받는다 (lib/apps.sh)
#
#   로컬:  ./backend/scripts/deploy.sh develop api
#          (backend/config/develop/.deploy.env 를 읽어 환경변수를 채운 뒤 이 스크립트를 부른다)
#   CI:    .github/workflows/deploy-backend.yml
#
# [서버 구조]  — 전부 이 스크립트가 만든다
#   $HANSAPI_DEPLOY_PATH/
#     ecosystem.config.js      ← pm2 구성 (infra/<환경>/ 에서 온다)
#     .nvmrc                    ← node 버전 (backend/.nvmrc)
#     .env.<환경>               ← 앱 설정 (권한 600)
#     config/                   ← 배포 루트에 함께 놓는 정적 설정 (infra/<환경>/config/ 통째)
#                                 예: nginx-http.conf · nginx-https.conf. 여러 개로 쪼개도 폴더째
#                                 올라간다. acme.sh 인증서는 여기 넣지 않는다(서버가 따로 관리).
#     bin/hansapi-server/       ← 번들 (dist + node_modules)
#     bin/hansapi-batch/        ← 앱이 늘면 형제로 붙는다
#     logs/                     ← pm2 로그
#
#   **앱은 실행 위치(cwd) 기준으로 설정을 찾는다** (envFiles @hansapi/common).
#   디렉터리를 거슬러 올라가지 않는다 — 배치 가정이 깨지는 순간 조용히 틀리기 때문이다.
#
#     서버   cwd = <배포경로>   → <배포경로>/.env.<환경>
#     개발   cwd = backend      → backend/config/<환경>/.env.<환경>
#
#   그래서 **pm2 의 cwd 가 배포 경로여야 한다.** ecosystem.config.js 가 `cwd: __dirname` 을
#   쓰고 그 파일이 배포 루트에 놓이므로 자동으로 맞는다 — 경로를 어디에도 하드코딩하지 않는다.
#
# [환경 이름]
#   앱과 GitHub 이 **같은 이름을 쓴다**: local | develop | production (APP_ENVS).
#   예전엔 앱이 dev|prod 라 여기서 번역했는데, 번역이 있는 곳에는 반드시 어긋나는 순간이
#   오고 — 어긋나면 **엉뚱한 DB 에 붙는다.** 이름을 하나로 두면 번역할 게 없다.
#
# [필요한 값] — 이름은 GitHub Secrets/Variables 와 정확히 같다.
#   WIREGUARD_CLIENT_CONF          (secret) wg-quick 이 그대로 먹는 클라이언트 conf 통째
#   HANSAPI_DEPLOY_SSH_PRIVATE_KEY (secret) 배포용 SSH 개인키
#   HANSAPI_DEPLOY_SSH_HOST        (var)    ubuntu@10.0.0.101
#   HANSAPI_DEPLOY_PATH            (var)    ~/app/hansapi-develop
#
# [앱마다 서버가 다르면]
#   이름 뒤에 앱 이름을 붙인 값이 있으면 그게 이긴다. 없으면 위의 공용 값으로 떨어진다.
#
#     HANSAPI_DEPLOY_SSH_HOST_HANSAPI_SERVER = ubuntu@10.0.0.101
#     HANSAPI_DEPLOY_SSH_HOST_HANSAPI_BATCH  = ubuntu@10.0.0.102
#     HANSAPI_DEPLOY_PATH_HANSAPI_BATCH      = ~/app/hansapi-batch
#
#   앱 이름을 대문자로 바꾸고 '-' 를 '_' 로 바꾼 것이다 (hansapi-server → HANSAPI_SERVER).
#   서버가 하나뿐이면 공용 값만 두면 된다 — 접미사 붙은 값을 만들 필요가 없다.
#
# [VPN]
#   conf 를 조각내서 받지 않는다. 개인키·엔드포인트·AllowedIPs 를 따로 받아 여기서 조립하면,
#   VPN 설정이 두 곳(서버 쪽 설정과 이 스크립트)에 나뉘어 언젠가 어긋난다.
#   **wg-quick 이 먹는 conf 를 통째로 받아 그대로 넘긴다.** 라우팅을 어디까지 태울지는
#   conf 의 AllowedIPs 가 정한다 — 스크립트가 참견할 일이 아니다.
#
#   서비스로 등록하지 않는다. /etc/wireguard 에 아무것도 두지 않는다.
#   임시 파일에 쓰고 그 경로를 wg-quick 에 직접 넘긴 뒤, 끝나면 내리고 지운다.
#
# [비밀값은 내용 대신 파일 경로로 줘도 된다]
#   이름 뒤에 _FILE 을 붙이면 경로로 해석한다.
#
#     WIREGUARD_CLIENT_CONF_FILE            ~/.config/wireguard/hans-dev.conf
#     HANSAPI_DEPLOY_SSH_PRIVATE_KEY_FILE   ~/.ssh/id_rsa
#
#   CI 는 시크릿으로 내용을 준다. 로컬에서는 이미 갖고 있는 파일을 가리키는 편이 낫다 —
#   키를 파일에 한 벌 더 복사해 두면 그만큼 새어나갈 자리가 는다.
#
#   **conf 가 없으면 VPN 을 붙이지 않는다.** 이미 사설망에 닿는 환경(로컬에서 다른 VPN 을
#   쓰고 있는 경우)에서는 붙일 이유가 없다. 억지로 올리면 오히려 기존 터널과 라우팅이 겹친다.
#
# [선택]
#   HANSAPI_ENV                  .env 내용 (CI 시크릿)      ← 둘 중 하나면 된다
#   HANSAPI_ENV_FILE             .env 파일 경로 (로컬)      ← 없으면 서버의 기존 파일을 쓴다
#   APP_ENV                      기본 develop
#   HANSAPI_DEPLOY_RESTART_CMD   재시작 명령을 직접 지정한다. 없으면 pm2 로 재시작한다:
#                                  없으면 nvm 을 소싱하고 pm2 startOrReload 한다(로그 참고).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# shellcheck source=lib/apps.sh
source "$(dirname "$0")/lib/apps.sh"

# **`config` 는 앱이 아니라 설정만 배포하는 특수 대상이다.**
#   ./deploy.sh develop config   →  .env.<환경> 과 config/ 만 올린다. 번들·재시작은 안 건드린다.
# nginx-*.conf 같은 정적 설정만 고쳤을 때 앱 전체를 다시 배포하지 않으려는 것이다.
if [ "${1:-}" = 'config' ]; then
  config_only=1
  app='config'   # 로그·서버선택(app_key)용 이름. 번들 경로로는 쓰이지 않는다.
else
  config_only=0
  # api → hansapi-server. build.sh 와 같은 규칙을 쓴다(lib/apps.sh).
  if ! app="$(resolve_app "${1:-hansapi-server}")"; then
    echo "❌ 그런 앱이 없다: $1" >&2
    echo >&2
    echo "있는 앱 (괄호 안 이름으로도 부를 수 있다, config = 설정만 배포):" >&2
    app_help >&2
    exit 2
  fi
fi

APP_ENV="${APP_ENV:-develop}"

group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

# 비밀값은 **내용** 또는 **파일 경로** 로 줄 수 있다. 이름 뒤에 _FILE 을 붙이면 경로다.
#
#   WIREGUARD_CLIENT_CONF       = "<conf 내용>"
#   WIREGUARD_CLIENT_CONF_FILE  = "~/.config/wireguard/hans-dev.conf"
#
# CI 는 시크릿으로 내용을 준다. 로컬에서는 이미 갖고 있는 파일을 가리키는 편이 낫다 —
# 키를 파일에 한 벌 더 복사해 두면 그만큼 새어나갈 자리가 는다.
#
# 값마다 따로 분기하지 않고 한 곳에서 처리한다. 세 개를 각자 처리하면 하나는 반드시 어긋난다.
has_secret() {
  local name="$1" file="$1_FILE"
  [ -n "${!name:-}" ] || [ -n "${!file:-}" ]
}

read_secret() {
  local name="$1" file="$1_FILE" path
  if [ -n "${!name:-}" ]; then
    printf '%s' "${!name}"
    return
  fi
  # ~ 는 변수 안에서 셸이 안 풀어준다. 직접 푼다.
  path="${!file:-}"
  path="${path/#\~/$HOME}"
  [ -f "$path" ] || {
    echo "❌ $file 이 가리키는 파일이 없다: $path" >&2
    exit 1
  }
  cat "$path"
}

# --- 0. 필요한 값이 다 있나 --------------------------------------------------
# 빠진 채로 진행하면 ssh 가 빈 호스트로 붙거나, rsync 가 엉뚱한 경로를 지운다.
# 여기서 크게 실패하는 게 낫다.

# **앱마다 목적 서버가 다를 수 있다.** 배포 대상은 앱 단위라서, 서버·경로도 앱 단위로 줄 수 있어야 한다.
#
#   HANSAPI_DEPLOY_SSH_HOST_HANSAPI_SERVER=ubuntu@10.0.0.101   ← 이 앱만
#   HANSAPI_DEPLOY_SSH_HOST=ubuntu@10.0.0.101                  ← 앱별 값이 없을 때
#
# 앱별 값이 있으면 그걸 쓰고, 없으면 공용 값으로 떨어진다. 서버가 하나뿐이면 공용 값만 두면 된다.
# 이름 규칙: 앱 이름을 대문자로, '-' 는 '_' 로. (hansapi-server → HANSAPI_SERVER)
app_key="$(echo "$app" | tr '[:lower:]-' '[:upper:]_')"

# 앱별 값 → 공용 값 순으로 찾는다. 둘 다 없으면 빈 문자열.
resolve() {
  local base="$1"
  local per_app="${base}_${app_key}"
  echo "${!per_app:-${!base:-}}"
}

ssh_host="$(resolve HANSAPI_DEPLOY_SSH_HOST)"   # ubuntu@10.0.0.101
deploy_path="$(resolve HANSAPI_DEPLOY_PATH)"    # ~/app/hansapi-develop (원격 셸이 ~ 를 푼다)

missing=()
[ -n "$ssh_host" ] || missing+=("HANSAPI_DEPLOY_SSH_HOST (또는 HANSAPI_DEPLOY_SSH_HOST_${app_key})")
[ -n "$deploy_path" ] || missing+=("HANSAPI_DEPLOY_PATH (또는 HANSAPI_DEPLOY_PATH_${app_key})")

has_secret HANSAPI_DEPLOY_SSH_PRIVATE_KEY ||
  missing+=("HANSAPI_DEPLOY_SSH_PRIVATE_KEY (또는 HANSAPI_DEPLOY_SSH_PRIVATE_KEY_FILE)")

# WIREGUARD_CLIENT_CONF 는 필수가 아니다. 없으면 VPN 을 붙이지 않는다.
if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ 값이 없다: ${missing[*]}" >&2
  echo "   CI 면 GitHub Secrets/Variables 를, 로컬이면 backend/config/<환경>/.deploy.env 를 확인할 것." >&2
  exit 1
fi

remote_ip="${ssh_host#*@}"                   # 10.0.0.101

if [ "$config_only" = 1 ]; then
  echo "배포(설정만): .env.$APP_ENV + config/ → $ssh_host:$deploy_path   (APP_ENV=$APP_ENV)"
else
  echo "배포: $app → $ssh_host:$deploy_path/bin/$app   (APP_ENV=$APP_ENV)"
fi

# wg-quick 은 인터페이스와 라우팅을 건드리므로 root 여야 한다.
# CI 컨테이너는 root 로 돌지만 로컬 맥은 아니다. 그때만 sudo 를 붙인다.
WG=(wg-quick)
[ "$(id -u)" -eq 0 ] || WG=(sudo wg-quick)

work="$(mktemp -d)"
wg_up=0
cleanup() {
  # VPN 은 반드시 내린다. 실패해서 중간에 죽어도 인터페이스가 남으면 안 된다.
  if [ "$wg_up" = '1' ]; then
    "${WG[@]}" down "$wg_conf" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

# --- 1. 번들 확인 -------------------------------------------------------------
#
# **여기서 빌드하지 않는다. 압축하지도 않는다.**
# build.sh 가 backend/.deploy/<app>.tar.gz 로 만들어 둔 것을 보낼 뿐이다.
#
# 배포가 다시 빌드하면 두 가지가 어긋난다.
#   - **검사를 통과한 그 산출물이 배포된다는 보장이 없다.** 빌드 사이에 워킹트리가 바뀌면
#     조용히 다른 게 나간다. 검사한 것과 배포한 것이 다르면 검사를 한 의미가 없다.
#   - 앱마다 목적 서버가 다르면 배포를 앱 수만큼 돌리는데, 그때마다 전체를 다시 빌드하게 된다.
#
# 빌드 1번(전 앱) → 배포 N번(앱마다).
#
# **번들은 리눅스에서 구워야 한다.** Prisma 엔진이 빌드한 OS 의 것으로 담기기 때문이다.
# build.sh 가 맥에서는 아예 안 만든다 — pnpm ci:bundle 를 쓸 것.
# 설정만 배포(config)면 번들은 아예 안 본다.
if [ "$config_only" != 1 ]; then
  tarball="$REPO_ROOT/backend/.deploy/$app.tar.gz"

  if [ ! -f "$tarball" ]; then
    echo "❌ 번들이 없다: backend/.deploy/$app.tar.gz" >&2
    echo "   먼저 빌드할 것:  pnpm ci:bundle      (리눅스 컨테이너에서 굽는다)" >&2
    echo "   (CI 라면 build 잡의 아티팩트를 내려받는 단계가 빠졌다)" >&2
    exit 1
  fi

  version=$(tar -xzOf "$tarball" ./dist/build-info.json 2>/dev/null | jq -r '.version // "unknown"' || echo unknown)
  echo "  번들: $version  ($(du -h "$tarball" | cut -f1))"
fi

# --- 3. VPN ------------------------------------------------------------------
# conf 를 조각내서 받지 않는다. wg-quick 이 그대로 먹는 conf 를 통째로 받아 넘긴다.
# 라우팅을 어디까지 태울지(AllowedIPs)도 conf 가 정한다 — 스크립트가 참견할 일이 아니다.
#
# **conf 가 없으면 VPN 을 붙이지 않는다.** 이미 사설망에 닿는 환경(로컬에서 다른 VPN 을
# 쓰는 경우)에서 억지로 올리면 기존 터널과 라우팅이 겹친다.
if ! has_secret WIREGUARD_CLIENT_CONF; then
  echo "▶ VPN 건너뜀 (WIREGUARD_CLIENT_CONF 없음 — 이미 사설망에 닿는다고 본다)"
else
  group "wireguard 연결"
  umask 077

  # **인터페이스 이름은 conf 파일 이름에서 나온다.** wg0.conf 로 만들면 인터페이스가 wg0 이 되고,
  # 이미 wg0 이 떠 있는 머신에서는 남의 터널을 건드리게 된다. 배포 전용 이름을 쓴다(15자 제한).
  wg_conf="$work/hans-deploy.conf"
  read_secret WIREGUARD_CLIENT_CONF > "$wg_conf"
  chmod 600 "$wg_conf"

  grep -qi '^\[Interface\]' "$wg_conf" || {
    echo "❌ WIREGUARD_CLIENT_CONF 가 wg-quick conf 로 보이지 않는다 ([Interface] 가 없다)." >&2
    exit 1
  }

  # 서비스로 등록하지 않는다. /etc/wireguard 에 아무것도 두지 않는다.
  # 임시 파일 경로를 직접 넘기는 1회성 실행이고, 끝나면 위 trap 이 내리고 지운다.
  "${WG[@]}" up "$wg_conf"
  wg_up=1
  endgroup
fi

# --- 4. SSH 준비 --------------------------------------------------------------
group "ssh 준비"
ssh_dir="$work/ssh"
mkdir -p "$ssh_dir"
known_hosts="$ssh_dir/known_hosts"

# SSH 키만은 파일을 그대로 쓴다(내용을 읽어 임시파일로 복사하지 않는다).
# 이미 있는 ~/.ssh/id_rsa 를 굳이 한 벌 더 만들 이유가 없다 — 그만큼 새어나갈 자리가 는다.
if [ -n "${HANSAPI_DEPLOY_SSH_PRIVATE_KEY:-}" ]; then
  key_file="$ssh_dir/id_deploy"
  printf '%s\n' "$HANSAPI_DEPLOY_SSH_PRIVATE_KEY" > "$key_file"
  chmod 600 "$key_file"
  echo "  키: HANSAPI_DEPLOY_SSH_PRIVATE_KEY (내용)"
else
  key_file="${HANSAPI_DEPLOY_SSH_PRIVATE_KEY_FILE/#\~/$HOME}"
  [ -f "$key_file" ] || {
    echo "❌ HANSAPI_DEPLOY_SSH_PRIVATE_KEY_FILE 이 가리키는 파일이 없다: $key_file" >&2
    exit 1
  }
  echo "  키: $key_file (파일)"
fi

# 호스트 키를 고정한다. StrictHostKeyChecking=no 로 넘기면 MITM 에 노출된다.
# 사설망 안이라도 마찬가지다 — VPN 은 경로를 감싸줄 뿐 상대를 증명해주지 않는다.
ssh-keyscan -H "$remote_ip" > "$known_hosts" 2>/dev/null
[ -s "$known_hosts" ] || {
  echo "❌ $remote_ip 의 호스트 키를 못 가져왔다. VPN 이 붙었는지 확인할 것." >&2
  exit 1
}

SSH=(ssh -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts")

# 원격 셸에 값을 안전하게 넘긴다.
#
# **`ssh host VAR=x 'bash -s'` 는 안 된다.** SendEnv 설정이 없으면 sshd 가 그 VAR=x 를
# 환경변수로 안 받고, ssh 가 host 뒤 인자를 한 문자열로 이어붙여 원격 셸에 넘긴다.
# 그래서 `VAR=x bash -s` 가 원격에서 **다시 파싱**되고, 값에 공백이 있으면 거기서 잘린다.
# (실제로 NAMES="ecosystem.config.js .nvmrc" 가 잘려 `.nvmrc` 가 명령으로 실행됐다.)
#
# 대신 값을 heredoc **본문 안**에서 대입한다. 그건 원격 bash 의 stdin 으로 들어가므로
# ssh 인자 파싱을 안 거친다. 값은 printf %q 로 인용해 공백·특수문자를 막는다.
#
#   remote_run "$ssh_host" "root=$(rq "$path")" <<'REMOTE'
#     echo "$root"
#   REMOTE
rq() { printf '%q' "$1"; }

remote_run() {
  local host="$1"
  shift
  # 나머지 인자 = 본문 앞에 붙일 변수 대입 줄들. 그 뒤에 stdin(heredoc 본문)을 잇는다.
  { for assign in "$@"; do printf '%s\n' "$assign"; done; cat; } |
    "${SSH[@]}" "$host" 'bash -euo pipefail -s'
}
echo "  호스트 키 확보, $ssh_host 에 붙는다"
"${SSH[@]}" "$ssh_host" 'echo "  연결됨: $(hostname) $(uname -m)"'
endgroup

# --- 5. 설정 파일 -------------------------------------------------------------
#
# **앱이 읽는 자리에 정확히 넣어야 한다.** 그 자리는 <배포경로>/.env.<환경> 이다.
# 앱은 cwd 기준으로 찾으므로(envFiles), 서비스가 <배포경로>에서 떠야 이 파일이 읽힌다.
#
# 값은 다른 시크릿과 같은 방식으로 받는다(내용 또는 파일 경로):
#   HANSAPI_ENV       = "<.env 내용>"                 ← CI 는 시크릿으로 내용을 준다
#   HANSAPI_ENV_FILE  = "config/develop/.env.develop"  ← 로컬은 이미 있는 파일을 가리킨다
#
# **없으면 건너뛴다.** 예전엔 서버가 .env 를 직접 갖고 있었다. 그 서버들을 한 번에 못 바꾸므로,
# 값이 없으면 서버가 갖고 있던 파일을 그대로 쓴다. 다만 **조용히 넘어가지 않는다** —
# 설정이 안 나갔는데 배포가 "성공" 이라고 하면 그게 제일 나쁘다.
if has_secret HANSAPI_ENV; then
  group "설정 파일"
  env_payload="$(mktemp)"
  trap 'rm -f "$env_payload"' EXIT
  read_secret HANSAPI_ENV > "$env_payload"

  scp -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "$env_payload" "$ssh_host:/tmp/.env.$APP_ENV"

  remote_run "$ssh_host" \
    "root=$(rq "$deploy_path")" \
    "app_env=$(rq "$APP_ENV")" <<'REMOTE'
    root=$(eval echo "$root")   # ~ 를 원격 셸이 푼다
    mkdir -p "$root"

    # DB 접속정보가 들어 있다. 남이 읽을 이유가 없다.
    install -m 600 "/tmp/.env.$app_env" "$root/.env.$app_env"
    rm -f "/tmp/.env.$app_env"

    echo "  설정: $root/.env.$app_env  ($(wc -l < "$root/.env.$app_env")줄, 권한 600)"
REMOTE
  endgroup
else
  echo "⚠️  설정 파일을 안 보냈다 (HANSAPI_ENV / HANSAPI_ENV_FILE 이 없다)."
  echo "   서버의 $deploy_path/.env.$APP_ENV 를 그대로 쓴다. 그 파일이 없으면 앱이 못 뜬다."
  echo
fi

# --- 5.5 설정 디렉터리 (infra/<환경>/config/ → <배포경로>/config/) ------------
#
# infra/<환경>/config/ 폴더를 **통째로**(scp -r) 배포 루트에 그대로 올린다.
# 폴더 안 파일을 이름으로 고르지 않으므로 nginx.conf·nginx-http.conf·nginx-https.conf 처럼
# 여러 개로 쪼개도 전부 따라간다 — 목록을 따로 들고 있으면 파일이 늘 때마다 어긋난다.
# 설정의 출처는 리포다 — 서버에서 직접 고쳐도 다음 배포에 이 폴더 내용으로 덮인다.
config_src="$REPO_ROOT/backend/infra/$APP_ENV/config"
if [ -d "$config_src" ]; then
  group "설정 디렉터리 (config/)"
  # ~ 는 scp 목적지에서 원격 셸이 푼다 — 로컬에서 풀지 않는다.
  scp -r -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "$config_src" "$ssh_host:$deploy_path/"
  echo "  $deploy_path/config/"
  endgroup
fi

# **설정만 배포(config)면 여기서 끝낸다.** .env 와 config/ 만 올리고, 번들 전송·pm2 파일·
# 재시작은 앱 배포에서만 한다. nginx-*.conf 반영은 서버에서 `nginx -s reload` 로 따로 한다.
if [ "$config_only" = 1 ]; then
  echo "✅ 설정 배포 완료: .env.$APP_ENV + config/ → $ssh_host:$deploy_path   (앱 재시작 안 함)"
  exit 0
fi

# --- 6. 전송 & 교체 -----------------------------------------------------------
# 새 디렉터리에 풀고 마지막에 이름만 바꾼다. 풀다가 실패해도 돌던 버전이 살아 있다.
# 곧바로 덮어쓰면 "반쯤 풀린 상태" 로 서버가 재시작될 수 있다.
group "전송 & 교체"
scp -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
  "$tarball" "$ssh_host:/tmp/$app.tar.gz"

remote_run "$ssh_host" \
  "root=$(rq "$deploy_path")" \
  "app=$(rq "$app")" \
  "app_env=$(rq "$APP_ENV")" <<'REMOTE'
  root=$(eval echo "$root")   # ~ 를 원격 셸이 푼다
  mkdir -p "$root/bin"

  new="$root/bin/.$app.new"
  cur="$root/bin/$app"
  old="$root/bin/.$app.old"

  rm -rf "$new" "$old"
  mkdir -p "$new"
  tar -xzf "/tmp/$app.tar.gz" -C "$new"
  rm -f "/tmp/$app.tar.gz"

  [ -f "$new/dist/main.js" ] || { echo "  ❌ 푼 결과에 dist/main.js 가 없다" >&2; exit 1; }

  # **앱이 읽을 설정이 실제로 거기 있는지 확인한다.** 없으면 부팅해서 죽는다 — 그것도
  # 배포가 "성공" 이라고 말한 뒤에. 파일을 다 옮겨 놓고 여기서 멈추는 편이 낫다.
  [ -f "$root/.env.$app_env" ] || {
    echo "  ❌ $root/.env.$app_env 가 없다. 앱이 설정을 못 읽는다." >&2
    echo "     HANSAPI_ENV 또는 HANSAPI_ENV_FILE 을 주거나, 서버에 그 파일을 두고 다시 배포할 것." >&2
    exit 1
  }

  # 교체는 마지막 한 순간에만. 이전 버전은 한 벌 남겨 롤백에 쓴다.
  if [ -d "$cur" ]; then mv "$cur" "$old"; fi
  mv "$new" "$cur"

  echo "  배포됨: $cur"
  echo "  버전:   $(cat "$cur/dist/build-info.json" 2>/dev/null | tr -d '\n' | sed 's/.*"version":"\([^"]*\)".*/\1/')"
REMOTE
endgroup

# --- 7. 배포 루트 파일 (pm2 구성 · node 버전) --------------------------------
#
# 배포 루트에 놓이는 정적 파일들을 같이 보낸다.
#
#   ecosystem.config.js   pm2 구성 (infra/<환경>/ 에서 온다)
#   .nvmrc                  node 버전. backend/.nvmrc 를 그대로 보낸다.
#                          pm2 가 자동으로 읽지는 않지만, 배포 루트에 있으면 그 자리에서
#                          `nvm use` 가 먹고, 어느 버전 기준인지 사람도 안다.
#
# 배포 루트에 놓는 이유: ecosystem 이 `cwd: __dirname` 을 쓴다. 이 파일의 자리가 곧 앱의
# 실행 위치이고, 앱은 그 cwd 에서 .env 를 찾는다(envFiles). 경로를 하드코딩하지 않으므로
# HANSAPI_DEPLOY_PATH 와 어긋날 수가 없다.
#   (예전엔 cwd: '/opt/hansapi' 로 박혀 있었는데 배포 경로는 ~/app/hansapi-develop 이었다.
#    그대로 띄웠으면 pm2 가 script 를 못 찾아 죽었다)
group "배포 루트 파일"

ecosystem_src="$REPO_ROOT/backend/infra/$APP_ENV/ecosystem.config.js"
nvmrc_src="$REPO_ROOT/backend/.nvmrc"

# scp 할 것을 모은다. 배포 루트에 놓일 이름 = 소스 경로.
declare -a root_files=()
# pm2 구성이 없으면 건너뛴다 — 새 환경이라 infra/<환경>/ 을 아직 안 만들었을 수 있다.
[ -f "$ecosystem_src" ] && root_files+=("$ecosystem_src")
[ -f "$nvmrc_src" ] && root_files+=("$nvmrc_src")

if [ ${#root_files[@]} -gt 0 ]; then
  scp -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "${root_files[@]}" "$ssh_host:/tmp/"

  # 보낸 파일 이름들. 원격에서 배열로 다시 만들 수 있게 각 이름을 %q 로 인용해 잇는다.
  names_q=""
  for f in "${root_files[@]}"; do names_q+=" $(rq "$(basename "$f")")"; done

  remote_run "$ssh_host" \
    "root=$(rq "$deploy_path")" \
    "names=($names_q)" <<'REMOTE'
    root=$(eval echo "$root")
    mkdir -p "$root/logs"   # ecosystem 의 log_file 이 ./logs/ 를 가리킨다
    for name in "${names[@]}"; do
      install -m 644 "/tmp/$name" "$root/$name"
      rm -f "/tmp/$name"
      echo "  $root/$name"
    done
REMOTE
fi

if [ ! -f "$ecosystem_src" ]; then
  echo "⚠️  pm2 구성이 없다: backend/infra/$APP_ENV/ecosystem.config.js — 서버의 기존 것을 쓴다."
fi
endgroup

# --- 8. 재시작 ----------------------------------------------------------------
#
# **pm2 이름 규칙: <환경>-<앱>.** ecosystem 의 name 과 정확히 같아야 --only 가 먹는다.
# 규칙이 없으면 "우리 앱 이름 → pm2 이름" 표가 어딘가 또 생기고, 그 표가 언젠가 어긋난다.
#
# startOrReload: 안 떠 있으면 띄우고, 떠 있으면 무중단 reload 한다. 배포에 딱 맞는 동사다.
#   (restart 는 프로세스를 죽였다 살리므로 그 사이 요청이 떨어진다)
# --update-env: ecosystem 의 env 블록이 바뀌었을 때 반영한다. 안 주면 옛 환경변수로 계속 돈다.
# pm2 save: 재부팅 후에도 살아나게 프로세스 목록을 저장한다.
#
# **cd 가 핵심이다.** ecosystem 의 cwd 가 __dirname 이라 파일 위치가 곧 실행 위치이고,
# 앱은 그 cwd 에서 .env.<환경> 을 찾는다.
pm2_name="$APP_ENV-$app"

# **nvm 을 명시적으로 소싱한다.** pm2 가 nvm 아래 있는데, `ssh host '명령'` 은 비대화형이라
# ~/.bashrc 를 안 읽는다(우분투 기본 .bashrc 는 비대화형이면 맨 위에서 return). 그러면 PATH 에
# nvm 이 없어 `pm2: command not found` 가 난다 — 사람이 접속해서 치면 되는데 스크립트만 실패한다.
# nvm.sh 를 직접 source 하면 .bashrc 에 의존하지 않는다.
#
# `nvm use` 는 배포 루트의 .nvmrc(같이 올린 파일)를 읽어 그 버전을 고른다 — .nvmrc 를
# 배포하는 이유가 이것이다. nvm 이 없는 서버(시스템 node)면 소싱이 조용히 넘어가고 PATH 의
# pm2 를 쓴다.
nvm_prefix='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'

if [ -n "${HANSAPI_DEPLOY_RESTART_CMD:-}" ]; then
  restart_cmd="$HANSAPI_DEPLOY_RESTART_CMD"
else
  restart_cmd="$nvm_prefix
cd $deploy_path && nvm use >/dev/null 2>&1 || true
pm2 startOrReload ecosystem.config.js --only $pm2_name --update-env && pm2 save"
fi

group "재시작 (pm2)"
echo "  cd $deploy_path && pm2 startOrReload ecosystem.config.js --only $pm2_name (nvm 소싱 후)"
"${SSH[@]}" "$ssh_host" "$restart_cmd"
endgroup

echo "✅ $app $version → $ssh_host:$deploy_path/bin/$app   (pm2: $pm2_name)"
