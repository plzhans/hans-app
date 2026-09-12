#!/usr/bin/env bash
#
# 빌드된 medifinder-web 을 Cloudflare Worker 로 올린다. 빌드하지 않는다.
#
#   APP_ENV=develop medifinder/frontend/ci-deploy.sh
#
# compatibility_date 는 wrangler.jsonc 가 정한다. 여기서 밀어 넣으면 올리는 사람과
# 검증하는 사람이 갈린다.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/ci-lib.sh"
require_app_env
require_env GITHUB_SHA GITHUB_REF_NAME CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

WRANGLER_VERSION="${WRANGLER_VERSION:-4}"
CF_WORKER_NAME="$(worker_name)"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

cd "$TARGET_DIR"
[ -d "$DIST_DIR" ] || die "빌드 산출물이 없다: $PROJECT/$DIST_DIR
   먼저 빌드할 것:  APP_ENV=$APP_ENV medifinder/frontend/ci-build.sh"

# wrangler deploy --name X 는 X 가 없으면 만든다. 그래서 이름을 잘못 준 배포가 조용히
# 성공하고, 엉뚱한 Worker 가 생기고 보고 있는 사이트는 안 바뀐다.
# "없음" 과 "권한 없음" 을 구분한다. 뭉뚱그리면 토큰 권한이 모자란 상황에서
# CF_ALLOW_CREATE 를 주라고 엉뚱하게 안내하게 된다.
http_code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$CF_WORKER_NAME")

case "$http_code" in
  # 2xx 를 통째로 받는다. 정적 자산만 담은 Worker 는 본문이 비어 204 가 온다.
  2[0-9][0-9]) ;;
  400) die "Worker 이름 '$CF_WORKER_NAME' 이 유효하지 않다 (HTTP 400). 영문 소문자·숫자·하이픈만 쓸 수 있다." ;;
  401 | 403) die "Cloudflare 인증에 실패했다 (HTTP $http_code). 토큰 권한과 계정 ID 를 확인할 것." ;;
  404)
    # 첫 생성은 의사표시를 받는다. CI 는 물어볼 상대가 없어 CF_ALLOW_CREATE 를 요구한다.
    if [ -n "${CF_ALLOW_CREATE:-}" ]; then
      echo "· '$CF_WORKER_NAME' 이 없다. 새로 만든다 (CF_ALLOW_CREATE)."
    elif [ -t 0 ]; then
      printf "· '%s' Worker 가 계정에 없다. 이 이름으로 새로 만들까? [y/N] " "$CF_WORKER_NAME"
      read -r answer
      case "$answer" in
        y | Y | yes | YES) ;;
        *) die "취소했다. 이름이 틀렸다면 APP_ENV($APP_ENV)를 확인할 것." ;;
      esac
    else
      die "'$CF_WORKER_NAME' Worker 가 없다. CI 는 Worker 를 만들지 않는다 —
   로컬에서 한 번 만든 뒤 CI 를 걸 것:  CF_ALLOW_CREATE=1 APP_ENV=$APP_ENV medifinder/frontend/ci-deploy.sh"
    fi
    ;;
  *) die "Worker 존재 확인에 실패했다 (HTTP $http_code)." ;;
esac

# 워커 스크립트가 읽는 값. 환경마다 달라지므로 wrangler.jsonc 에 박지 않는다.
# 이름은 .env 의 것을 그대로 쓴다 — 별명을 두면 매핑표가 또 하나 틀릴 자리가 된다.
env_file=".env.$APP_ENV"
[ -f "$env_file" ] || die "$PROJECT/$env_file 이 없다. 워커가 쓸 값을 읽을 수 없다."
# shellcheck disable=SC1090
. "./$env_file"

var_args=()
for key in VITE_SITE_URL VITE_HANSAPP_BASE_URL VITE_HANSAPP_CLIENT_ID; do
  [ -n "${!key:-}" ] || die "$env_file 에 $key 가 비어 있다. 워커가 그 값 없이는 동작하지 않는다."
  var_args+=(--var "$key:${!key}")
done
# 워커가 색인 허용 여부를 가르는 데 쓴다. 어느 환경으로 나가는지는 파일이 아니라
# 이 실행이 아는 값이라 .env 에서 읽지 않는다.
var_args+=(--var "APP_ENV:$APP_ENV")

group "deploy ($PROJECT, $APP_ENV → $CF_WORKER_NAME)"
# --allow-build 가 없으면 pnpm 이 대화형으로 묻고 거기서 멈춘다.
# dlx 는 임시 스토어를 써서 프로젝트의 allowBuilds 가 닿지 않는다.
CI=true WRANGLER_SEND_METRICS=false \
pnpm --allow-build=esbuild,workerd dlx "wrangler@$WRANGLER_VERSION" deploy \
  --name "$CF_WORKER_NAME" \
  --assets "$DIST_DIR" \
  "${var_args[@]}" \
  --tag "$GITHUB_SHA" \
  --message "ref: $GITHUB_REF_NAME"
endgroup

echo "✅ medifinder/frontend/$PROJECT ($APP_ENV) → $CF_WORKER_NAME"
