# medifinder 프론트 배포 스크립트들이 공유하는 것. **source 전용이다.**
#
#   ci-build.sh   빌드
#   ci-deploy.sh  배포
#   deploy.sh     로컬 진입점
#
# 여기 있는 것은 **두 스크립트가 같은 답을 내야 하는 판정**이다. 각자 갖고 있으면
# 한쪽만 고치는 날이 오고, 그때 "빌드는 됐는데 배포가 산출물을 못 찾는" 식으로 어긋난다.
#
# hansapp 의 frontend/ci-lib.sh 와 같은 역할이지만 **대상이 하나뿐이라** 훨씬 작다 —
# 대상 목록도, 산출물 경로 분기도 필요 없다. medifinder 는 별개 제품이라 배포도 여기서 닫는다.

AREA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # <repo>/medifinder/frontend
PROJECT='medifinder-web'
TARGET_DIR="$AREA_DIR/$PROJECT"
DIST_DIR='dist'

group()    { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi; }
endgroup() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi; }
die()      { echo "❌ $*" >&2; exit 1; }

# 환경의 짧은 이름. Worker 이름에만 쓴다.
env_short() {
  case "$1" in
    develop)    echo 'dev'  ;;
    production) echo 'prod' ;;
    *)          echo "$1"   ;;
  esac
}

# 필요한 환경변수를 **한 번에** 본다. 하나씩 죽으면 맞추는 데 왕복이 여러 번 필요하다.
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

# Worker 이름. <환경 약칭>-<프로젝트> — hansapp 과 같은 규칙이라 대시보드에서 나란히 보인다.
# 규칙에서 벗어나야 하면 CF_WORKER_NAME 으로 덮어쓴다.
worker_name() {
  if [ -n "${CF_WORKER_NAME:-}" ]; then echo "$CF_WORKER_NAME"; else echo "$(env_short "$APP_ENV")-$PROJECT"; fi
}
