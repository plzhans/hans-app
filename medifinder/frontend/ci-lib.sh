# ci-build.sh · ci-deploy.sh · deploy.sh 가 공유한다. source 전용.
#
# 빌드와 배포가 같은 답을 봐야 하는 값만 둔다. 각자 갖고 있으면 한쪽만 고치는 날이 오고,
# 그때 빌드는 됐는데 배포가 산출물을 못 찾는다.

AREA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # <repo>/medifinder/frontend
PROJECT='medifinder-web'
TARGET_DIR="$AREA_DIR/$PROJECT"
DIST_DIR='dist'

group()    { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi; }
endgroup() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi; }
die()      { echo "❌ $*" >&2; exit 1; }

# Worker 이름에만 쓴다.
env_short() {
  case "$1" in
    develop)    echo 'dev'  ;;
    production) echo 'prod' ;;
    *)          echo "$1"   ;;
  esac
}

# 한 번에 본다. 하나씩 죽으면 맞추는 데 왕복이 여러 번 필요하다.
require_env() {
  local missing='' name value
  for name in "$@"; do
    eval "value=\${$name:-}"
    [ -n "$value" ] || missing="$missing  $name"$'\n'
  done
  if [ -n "$missing" ]; then
    echo "❌ 환경변수가 비어 있다:" >&2
    printf '%s' "$missing" >&2
    echo "   CI 면 워크플로우의 env: 를, 로컬이면 medifinder/frontend/deploy.sh 를 볼 것." >&2
    exit 1
  fi
}

require_app_env() {
  require_env APP_ENV
  case "$APP_ENV" in
    develop | production) ;;
    *) die "APP_ENV 는 develop | production 이어야 한다 (받은 값: $APP_ENV)" ;;
  esac
}

# <환경 약칭>-<프로젝트>. 대시보드에서 환경끼리 뭉쳐 보이도록 접두사다.
# 규칙에서 벗어나야 하면 CF_WORKER_NAME 으로 덮어쓴다.
worker_name() {
  if [ -n "${CF_WORKER_NAME:-}" ]; then echo "$CF_WORKER_NAME"; else echo "$(env_short "$APP_ENV")-$PROJECT"; fi
}
