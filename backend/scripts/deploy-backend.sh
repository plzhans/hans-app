#!/usr/bin/env bash
#
# backend 앱을 사설망 서버에 배포한다. **배포 로직의 유일한 출처다.**
# CI 워크플로우도, 로컬 테스트 스크립트도 이 파일을 호출만 한다.
#
# **TS 는 빌드하지 않는다.** 먼저 `pnpm -r build` 로 apps/<app>/dist 를 만들어 둔다.
# 이 스크립트는 **전송 직전에** 그 dist 를 자립형 번들(node_modules 포함)로 묶어 압축해 보낸다.
# 압축·전송이 배포의 몫이므로, 별도의 번들 산출물(.deploy/*.tar.gz)에 기대지 않는다 —
# 항상 지금 워킹트리의 dist 를 그대로 싣는다. 그래서 build-info 의 git sha 도 늘 현재와 맞는다.
#
#   cd backend && pnpm -r build                           # 1번. dist 를 만든다
#   ./backend/scripts/deploy-backend.sh hansapi-server    # N번. 앱마다(서버마다) 따로 번들·전송
#   ./backend/scripts/deploy-backend.sh api               # 별칭도 받는다 (lib/apps.sh)
#
# **이 스크립트는 오로지 환경변수로만 값을 받는다.** 그 변수를 누가 채우는지는 모른다:
#   로컬:  local-deploy.sh 가 채워서 부른다
#   CI:    .github/workflows/deploy-backend.yml 이 GitHub Secrets/Variables 로 자동 주입한다
# 그래서 여기엔 로컬 전용 파일(local-deploy-<환경>.env)이 등장하지 않는다 — 그건 local-deploy.sh 몫이다.
#
# [서버 구조]  — 전부 이 스크립트가 만든다
#   $HANSAPI_DEPLOY_PATH/
#     ecosystem.config.js      ← pm2 구성 (infra/<환경>/ 에서 온다)
#     .nvmrc                    ← node 버전 (backend/.nvmrc)
#     config/                   ← 앱이 읽는 설정 + 정적 설정이 함께 놓인다
#                                 config/<환경>.env  ← 앱 설정 (backend/config/<환경>/ 를 평면화, 권한 600)
#                                 config/nginx-*.conf ← 정적 설정 (infra/<환경>/config/ 통째)
#                                 acme.sh 인증서는 여기 넣지 않는다(서버가 따로 관리).
#     bin/hansapi-server/       ← 번들 (dist + node_modules)
#     bin/hansapi-batch/        ← 앱이 늘면 형제로 붙는다
#     logs/                     ← pm2 로그
#
#   **앱은 실행 위치(cwd) 기준으로 설정을 찾는다** (envFiles @hansapi/common).
#   디렉터리를 거슬러 올라가지 않는다 — 배치 가정이 깨지는 순간 조용히 틀리기 때문이다.
#
#     서버   cwd = <배포경로>   → <배포경로>/config/<환경>.env
#     개발   cwd = backend      → backend/config/<환경>/<환경>.env
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
#   WIREGUARD_CLIENT_CONF_FILE     (secret) wg-quick 이 그대로 먹는 클라이언트 conf 통째
#   DEPLOY_SSH_PRIVATE_KEY_FILE    (secret) 배포용 SSH 개인키 (공용이라 앱 접두사 없음)
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
# [비밀값은 내용(_FILE) 대신 파일 경로(_PATH)로 줘도 된다]
#   같은 값을 _PATH 접미사로 주면 그 경로의 파일을 읽어 쓴다.
#
#     WIREGUARD_CLIENT_CONF_PATH          ~/.config/wireguard/hans-dev.conf
#     DEPLOY_SSH_PRIVATE_KEY_PATH         ~/.ssh/id_rsa
#
#   CI 는 시크릿으로 내용을 준다. 로컬에서는 이미 갖고 있는 파일을 가리키는 편이 낫다 —
#   키를 파일에 한 벌 더 복사해 두면 그만큼 새어나갈 자리가 는다.
#
#   **conf 가 없으면 VPN 을 붙이지 않는다.** 이미 사설망에 닿는 환경(로컬에서 다른 VPN 을
#   쓰고 있는 경우)에서는 붙일 이유가 없다. 억지로 올리면 오히려 기존 터널과 라우팅이 겹친다.
#
# [선택]
#   APP_ENV                      기본 develop
#   HANSAPI_DEPLOY_RESTART_CMD   재시작 명령을 직접 지정한다. 없으면 pm2 로 재시작한다:
#                                  없으면 nvm 을 소싱하고 pm2 startOrReload 한다(로그 참고).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# shellcheck source=lib/apps.sh
source "$(dirname "$0")/lib/apps.sh"

# **`config` 는 앱이 아니라 설정만 배포하는 특수 대상이다.**
#   ./local-deploy.sh develop config   →  config/ (앱 설정 + 정적 설정)만 올린다. 번들·재시작은 안 건드린다.
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

# 비밀값은 **파일 내용**(_FILE) 또는 **파일 경로**(_PATH) 로 줄 수 있다.
# 접미사가 값의 성격을 말한다: _FILE 은 값이 곧 파일 내용, _PATH 는 값이 파일 경로다.
#
#   WIREGUARD_CLIENT_CONF_FILE  = "<conf 내용 통째>"                  ← 내용 그대로
#   WIREGUARD_CLIENT_CONF_PATH  = "~/.config/wireguard/hans-dev.conf"  ← 파일 경로
#
# CI 는 시크릿으로 내용(_FILE)을 준다. 로컬에서는 이미 갖고 있는 파일을 _PATH 로 가리키는
# 편이 낫다 — 키를 파일에 한 벌 더 복사해 두면 그만큼 새어나갈 자리가 는다.
#
# 값마다 따로 분기하지 않고 한 곳에서 처리한다. 세 개를 각자 처리하면 하나는 반드시 어긋난다.
has_secret() {
  local file="$1_FILE" path="$1_PATH"
  [ -n "${!file:-}" ] || [ -n "${!path:-}" ]
}

read_secret() {
  local file="$1_FILE" pathvar="$1_PATH" path
  if [ -n "${!file:-}" ]; then
    printf '%s' "${!file}"
    return
  fi
  # ~ 는 변수 안에서 셸이 안 풀어준다. 직접 푼다.
  path="${!pathvar:-}"
  path="${path/#\~/$HOME}"
  [ -f "$path" ] || {
    echo "❌ $pathvar 이 가리키는 파일이 없다: $path" >&2
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

has_secret DEPLOY_SSH_PRIVATE_KEY ||
  missing+=("DEPLOY_SSH_PRIVATE_KEY_FILE (또는 DEPLOY_SSH_PRIVATE_KEY_PATH)")

# WIREGUARD_CLIENT_CONF 는 필수가 아니다. 없으면 VPN 을 붙이지 않는다.
if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ 값이 없다: ${missing[*]}" >&2
  echo "   이 값들은 환경변수로 주입된다 — CI 면 GitHub Secrets/Variables 를, 로컬이면 local-deploy.sh 를 확인할 것." >&2
  exit 1
fi

remote_ip="${ssh_host#*@}"                   # 10.0.0.101

if [ "$config_only" = 1 ]; then
  echo "배포(설정만): config/ → $ssh_host:$deploy_path/config   (APP_ENV=$APP_ENV)"
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

# --- 1. 번들 (전송 직전에 굽는다) ---------------------------------------------
#
# **TS 는 여기서 빌드하지 않는다. 하지만 압축은 여기서 한다.**
# 먼저 `pnpm -r build` 로 만들어 둔 apps/<app>/dist 를, 이 앱과 그 의존성만 추린
# 자립형 디렉터리(node_modules 포함)로 pnpm deploy 해서 tar 로 묶는다.
# 산출물은 임시 디렉터리($work)에 두고 끝나면 지운다 — 워크스페이스에 남기지 않는다.
#
# **왜 전송 시점에 굽나:** 미리 구워둔 번들(.deploy/*.tar.gz)에 기대면, 그게 오래되면
# 조용히 옛 산출물이 나간다(옛 git sha 로 찍힌 채). 전송 직전에 지금 dist 를 그대로 실으면
# "빌드한 것"과 "보낸 것"이 어긋날 자리가 없다.
#
# **Prisma 주의:** 이 번들의 Prisma 엔진은 **이 머신 OS 의 것**이다. schema.prisma 의
# binaryTargets 에 linux-arm64 를 명시해 둬서 서버에서 **쿼리는** 도는데, 마이그레이션
# (schema-engine)은 호스트(맥)의 것만 담긴다. 서버에서 이 번들로 migrate 를 돌리지 말 것 —
# 마이그레이션은 별도 경로로 한다. (컨테이너에서 구우려면 pnpm ci:bundle.)
#
# 설정만 배포(config)면 번들은 아예 안 본다.
if [ "$config_only" != 1 ]; then
  backend_dir="$REPO_ROOT/backend"
  app_dir="$backend_dir/apps/$app"

  if [ ! -f "$app_dir/dist/main.js" ]; then
    echo "❌ dist 가 없다: backend/apps/$app/dist/main.js" >&2
    echo "   먼저 빌드할 것:  cd backend && pnpm -r build" >&2
    exit 1
  fi

  # 산출물에 자기 신원(git sha)을 박는다. 전송 직전에 다시 찍으므로 워킹트리와 항상 일치한다.
  # (호스트에 .git 이 있어 version.sh 가 현재 HEAD 를 그대로 읽는다.)
  "$(dirname "$0")/version.sh" "$app_dir" > "$app_dir/dist/build-info.json"
  version=$(jq -r '.version // "unknown"' "$app_dir/dist/build-info.json")

  # 이 앱 + 의존 워크스페이스 패키지만 추려 자립형 디렉터리를 만든다(node_modules 포함).
  # --legacy: inject-workspace-packages 를 켜지 않은 워크스페이스에서 pnpm deploy 를 쓰기 위함.
  # apps/<app>/package.json 의 "files": ["dist"] 가 있어야 dist 가 담긴다.
  bundle_dir="$work/bundle"
  ( cd "$backend_dir" && pnpm deploy --filter "$app" --prod --legacy "$bundle_dir" ) >/dev/null

  # **dist 만 보면 안 된다.** node_modules 가 없는 반쪽 번들을 보내면 서버에서 앱이 안 뜬다 —
  # 그것도 배포가 "성공" 한 뒤에.
  [ -f "$bundle_dir/dist/main.js" ] || {
    echo "❌ 번들에 dist/main.js 가 없다. apps/$app/package.json 의 files 를 확인할 것." >&2
    exit 1
  }
  [ -d "$bundle_dir/node_modules" ] || {
    echo "❌ 번들에 node_modules 가 없다. 반쪽짜리다." >&2
    exit 1
  }

  tarball="$work/$app.tar.gz"
  tar -czf "$tarball" -C "$bundle_dir" .
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
if [ -n "${DEPLOY_SSH_PRIVATE_KEY_FILE:-}" ]; then
  key_file="$ssh_dir/id_deploy"
  printf '%s\n' "$DEPLOY_SSH_PRIVATE_KEY_FILE" > "$key_file"
  chmod 600 "$key_file"
  echo "  키: DEPLOY_SSH_PRIVATE_KEY_FILE (내용)"
else
  key_file="${DEPLOY_SSH_PRIVATE_KEY_PATH/#\~/$HOME}"
  [ -f "$key_file" ] || {
    echo "❌ DEPLOY_SSH_PRIVATE_KEY_PATH 이 가리키는 파일이 없다: $key_file" >&2
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

# --- 5. 업로드 (스테이징) -----------------------------------------------------
#
# 실행경로를 바로 건드리지 않는다. 산출물(번들·설정·pm2 구성)을 먼저 /tmp/<app>.deploy 로
# 다 올려두고, 실행경로 반영은 다음 블록에서 한 번에(정해진 순서로) 한다. 반쯤 올라간 상태로
# 앱이 재시작되는 일을 막는다.
#
# 설정은 두 출처를 config/ 한 곳으로 모은다. 둘 다 config/ 밑으로 **평면으로** 올린다.
#   backend/config/<환경>/*        앱 .env (develop/develop.env → config/develop.env)
#   backend/infra/<환경>/config/*  정적 설정(nginx-*.conf 등)
# 설정의 출처는 리포다. 뒤(교체 블록)에서 "내용만 덮어쓰기" 로 실행경로에 반영하므로,
# 서버가 config/ 안에 따로 둔 파일(인증서 등)은 건드리지 않는다.
stg="/tmp/$app.deploy"

group "업로드 (스테이징)"
remote_run "$ssh_host" "stg=$(rq "$stg")" <<'REMOTE'
  rm -rf "$stg"
  mkdir -p "$stg/config"
REMOTE

# "$src"/* 는 로컬 셸이 펴서 디렉터리 안의 것만 config/ 밑으로 평면으로 간다.
app_config_src="$REPO_ROOT/backend/config/$APP_ENV"
if [ -d "$app_config_src" ]; then
  scp -r -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "$app_config_src"/* "$ssh_host:$stg/config/"
  echo "  앱 설정:   config/ ← backend/config/$APP_ENV/"
else
  echo "⚠️  앱 설정 디렉터리가 없다: backend/config/$APP_ENV/"
  echo "   config/$APP_ENV/$APP_ENV.env 를 만들거나 .enc 를 복호화(./env-decrypt.sh)할 것."
fi

config_src="$REPO_ROOT/backend/infra/$APP_ENV/config"
if [ -d "$config_src" ]; then
  scp -r -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "$config_src"/* "$ssh_host:$stg/config/"
  echo "  정적 설정: config/ ← backend/infra/$APP_ENV/config/"
fi

if [ "$config_only" != 1 ]; then
  # 번들
  scp -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "$tarball" "$ssh_host:$stg/bundle.tar.gz"
  # pm2 구성 · node 버전 (있으면). 배포 루트에 놓일 이름 그대로 스테이징한다.
  ecosystem_src="$REPO_ROOT/backend/infra/$APP_ENV/ecosystem.config.js"
  [ -f "$ecosystem_src" ] && scp -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "$ecosystem_src" "$ssh_host:$stg/ecosystem.config.js"
  nvmrc_src="$REPO_ROOT/backend/.nvmrc"
  [ -f "$nvmrc_src" ] && scp -i "$key_file" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
    "$nvmrc_src" "$ssh_host:$stg/.nvmrc"
  [ -f "$ecosystem_src" ] || echo "⚠️  pm2 구성이 없다: backend/infra/$APP_ENV/ecosystem.config.js — 서버의 기존 것을 쓴다."
fi
echo "  → $ssh_host:$stg"
endgroup

# **설정만 배포(config)면 여기서 끝낸다.** config/ 만 실행경로에 반영하고(내용만 덮어쓰기),
# 번들·pm2 재시작은 앱 배포에서만 한다. nginx-*.conf 반영은 서버에서 `nginx -s reload` 로 따로.
if [ "$config_only" = 1 ]; then
  group "설정 교체 (내용만 덮어쓰기)"
  remote_run "$ssh_host" "root=$(rq "$deploy_path")" "stg=$(rq "$stg")" <<'REMOTE'
    root=$(eval echo "$root")   # ~ 를 원격 셸이 푼다
    mkdir -p "$root/config"
    cp -a "$stg/config/." "$root/config/"
    chmod 600 "$root"/config/*.env 2>/dev/null || true
    rm -rf "$stg"
    echo "  $root/config/ (env 권한 600)"
REMOTE
  endgroup
  echo "✅ 설정 배포 완료: config/ → $ssh_host:$deploy_path/config   (앱 재시작 안 함)"
  exit 0
fi

# --- 6. 교체 & 재시작 (원격, 정해진 순서로) ----------------------------------
#
# 스테이징(/tmp/<app>.deploy)에 다 올려둔 것을 실행경로로 반영한다. 한 번의 원격 세션에서
# 순서대로 처리해, 중간에 끊겨도 돌던 버전이 그대로 살아 있게 한다(교체는 마지막 mv 한 순간뿐).
#
#   2. 압축 풀기 → bin/.<app>.new, 압축파일 삭제
#   3. 푼(새 번들) 버전 출력
#   4. env 가 실제로 있는지 확인
#   5. 현재 실행 중인(교체 전) 버전 출력            ← node dist/main.js --version
#   6. 서비스 중지 — 하지 않는다. pm2 가 띄운 node 는 소스를 메모리에 올려 돌므로, 디스크의
#      파일을 바꿔도 돌던 프로세스엔 영향이 없다. 그래서 멈추지 않고 교체한 뒤 무중단 reload 한다.
#   7. 실행경로에 번들 옮김 (bin swap: cur→old, new→cur)
#   8. 실행경로에 설정 옮김 (config: 내용만 덮어쓰기) + pm2 구성·.nvmrc 배치
#   9. 새 버전 출력
#  10. 서비스 시작 (pm2 startOrReload — 안 떠 있으면 띄우고 떠 있으면 무중단 reload)
#
# **pm2 이름 규칙: <환경>-<앱>.** ecosystem 의 name 과 정확히 같아야 --only 가 먹는다.
# nvm 을 명시적으로 소싱한다 — `ssh host '명령'` 은 비대화형이라 ~/.bashrc 를 안 읽어서(우분투
# 기본 .bashrc 는 비대화형이면 맨 위에서 return), 안 하면 `node`/`pm2: command not found` 가 난다.
# `nvm use` 는 배포 루트의 .nvmrc(방금 올린 파일)를 읽어 그 버전을 고른다.
pm2_name="$APP_ENV-$app"

group "교체 & 재시작"
echo "  cd $deploy_path && pm2 startOrReload ecosystem.config.js --only $pm2_name (nvm 소싱 후)"
remote_run "$ssh_host" \
  "root=$(rq "$deploy_path")" \
  "app=$(rq "$app")" \
  "app_env=$(rq "$APP_ENV")" \
  "stg=$(rq "$stg")" \
  "pm2_name=$(rq "$pm2_name")" \
  "restart_override=$(rq "${HANSAPI_DEPLOY_RESTART_CMD:-}")" <<'REMOTE'
  root=$(eval echo "$root")   # ~ 를 원격 셸이 푼다
  export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  bin="$root/bin"; new="$bin/.$app.new"; cur="$bin/$app"; old="$bin/.$app.old"
  mkdir -p "$bin" "$root/logs"   # ecosystem 의 log_file 이 ./logs/ 를 가리킨다

  # 산출물이 자기 버전을 답하게 한다(node dist/main.js --version — env 로딩 전에 한 줄만 찍고 끝).
  pv() { node "$1/dist/main.js" --version 2>/dev/null || echo unknown; }

  # 2. 압축 풀기 && 압축파일 삭제
  rm -rf "$new" "$old"
  mkdir -p "$new"
  tar -xzf "$stg/bundle.tar.gz" -C "$new"
  rm -f "$stg/bundle.tar.gz"
  [ -f "$new/dist/main.js" ] || { echo "  ❌ 푼 결과에 dist/main.js 가 없다" >&2; exit 1; }

  # 3. 푼(새 번들) 버전
  echo "  새 번들:   $(pv "$new")"

  # 4. env 가 실제로 있는지 확인. 없으면 부팅해서 죽는다 — 그것도 배포가 "성공" 이라고 말한 뒤에.
  [ -f "$stg/config/$app_env.env" ] || {
    echo "  ❌ 설정에 $app_env.env 가 없다. 앱이 설정을 못 읽는다." >&2
    echo "     backend/config/$app_env/$app_env.env 를 두고(또는 .enc 복호화) 다시 배포할 것." >&2
    exit 1
  }

  # 5. 현재 실행 중인(교체 전) 버전
  if [ -f "$cur/dist/main.js" ]; then
    echo "  현재 실행: $(pv "$cur")"
  else
    echo "  현재 실행: (없음 — 최초 배포)"
  fi

  # 7. 실행경로에 번들 옮김. 교체는 이 mv 한 순간뿐. 이전 버전은 한 벌 남겨 롤백에 쓴다.
  if [ -d "$cur" ]; then mv "$cur" "$old"; fi
  mv "$new" "$cur"

  # 8. 실행경로에 설정 옮김 — **내용만 덮어쓰기.** config/ 를 통째로 갈지 않으므로 서버가
  #    거기 따로 둔 파일(인증서 등)은 보존된다. env 는 권한 600.
  mkdir -p "$root/config"
  cp -a "$stg/config/." "$root/config/"
  chmod 600 "$root"/config/*.env 2>/dev/null || true
  # pm2 구성·node 버전을 배포 루트에 놓는다(있으면). ecosystem 의 cwd 가 __dirname 이라 이 자리가
  # 곧 실행 위치이고, 앱은 그 cwd 에서 config/<환경>.env 를 찾는다.
  [ -f "$stg/ecosystem.config.js" ] && install -m 644 "$stg/ecosystem.config.js" "$root/ecosystem.config.js"
  [ -f "$stg/.nvmrc" ] && install -m 644 "$stg/.nvmrc" "$root/.nvmrc"
  rm -rf "$stg"

  # 9. 새 버전(교체 후 실행경로)
  echo "  배포됨:    $cur"
  echo "  새 버전:   $(pv "$cur")"

  # 10. 서비스 시작 (무중단). startOrReload: 안 떠 있으면 띄우고, 떠 있으면 graceful reload.
  #     --update-env: ecosystem 의 env 가 바뀌었으면 반영. pm2 save: 재부팅 후에도 살아나게 저장.
  cd "$root" && nvm use >/dev/null 2>&1 || true
  if [ -n "$restart_override" ]; then
    eval "$restart_override"
  elif [ -f "$root/ecosystem.config.js" ]; then
    pm2 startOrReload ecosystem.config.js --only "$pm2_name" --update-env && pm2 save
  else
    echo "  ⚠️ ecosystem.config.js 가 없어 재시작을 건너뛴다. 서버의 기존 pm2 구성을 쓸 것."
  fi
REMOTE
endgroup

echo "✅ $app $version → $ssh_host:$deploy_path/bin/$app   (pm2: $pm2_name)"
