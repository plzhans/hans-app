# frontend 배포 스크립트들이 공유하는 것들. **source 전용이다.** 직접 실행하지 않는다.
#
#   ci-build.sh   빌드
#   ci-deploy.sh  배포
#   deploy.sh     로컬 진입점
#
# 여기 있는 것은 전부 **두 스크립트가 같은 답을 내야 하는 판정**이다. 각자 갖고 있으면
# 한쪽만 고치는 날이 오고, 그때 "빌드는 됐는데 배포가 산출물을 못 찾는" 식으로 어긋난다.

# 이 파일의 위치가 기준이다. 부르는 쪽이 어디서 실행되든 같은 값이 나온다.
AREA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # <repo>/frontend
AREA="$(basename "$AREA_DIR")"                             # frontend

# 빌드 가능한 대상. 디렉터리를 훑지 않고 여기 적는다 — auth-sdk 는 medifinder-web 이 link:
# 로 무는 라이브러리라 자기 혼자 배포되지 않고(소비자 번들 안으로 들어갈 뿐), medifinder-web
# 은 아예 frontend/ 밖에 있다(target_dir_for 참고).
KNOWN_TARGETS='medifinder-web hansapp-docs hansapp-web hansapp-auth hansapp-admin'

# 그중 **Cloudflare Worker 로 나가는 것.** hansapp-admin 은 여기 없다 —
# 관리자 콘솔은 hansapp-admin 이미지 안에서 API 와 같이 나간다(같은 오리진).
# 빌드는 여기서 하고(ci-build.sh), 담는 것은 backend/docker/hansapp-admin.Dockerfile 이다.
WORKER_TARGETS='medifinder-web hansapp-docs hansapp-web hansapp-auth'

# **워커 스크립트(main)가 있는 대상.** 나머지는 정적 자산만 올리는 assets 전용 Worker 라
# 런타임 변수를 받을 곳이 없다. 파일을 grep 해서 알아내지 않고 여기 적는다 —
# 배포가 무엇을 하는지는 스크립트를 읽어서 알 수 있어야 한다.
WORKER_SCRIPT_TARGETS='medifinder-web'

group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

die() {
  echo "❌ $*" >&2
  exit 1
}

# 환경의 짧은 이름. **긴 이름이 거슬리는 자리에만** 쓴다(지금은 Worker 이름 하나뿐이다).
#
# 표에 없는 환경은 이름을 그대로 돌려준다. 여기 한 줄을 안 넣었다고 배포가 죽을 이유는
# 없고, Worker 이름에 긴 이름이 그대로 뜨는 건 눈에 보이는 실패라 알아서 고치게 된다.
env_short() {
  case "$1" in
    develop)    echo 'dev'  ;;
    production) echo 'prod' ;;
    *)          echo "$1"   ;;
  esac
}

# 필요한 환경변수가 다 있는지 **한 번에** 본다. 하나씩 죽으면 로컬에서 맞추는 데
# 왕복이 여러 번 필요하다. 모자란 걸 전부 알려주고 한 번에 끝낸다.
require_env() {
  local missing='' name value
  for name in "$@"; do
    eval "value=\${$name:-}"
    [ -n "$value" ] || missing="$missing  $name"$'\n'
  done
  if [ -n "$missing" ]; then
    echo "❌ 환경변수가 비어 있다:" >&2
    printf '%s' "$missing" >&2
    echo "   CI 면 워크플로우의 env: 를, 로컬이면 frontend/deploy.sh 를 볼 것." >&2
    exit 1
  fi
}

usage() {
  echo "사용: $0 <프로젝트>" >&2
  echo "" >&2
  echo "대상:" >&2
  local t
  for t in $KNOWN_TARGETS; do
    echo "  $t" >&2
  done
  exit 2
}

# 인자를 검사하고 project · target_dir 을 세운다.
#
# 인자는 **대상 이름**이다. 대부분 frontend/ 아래의 디렉터리 이름 그대로지만, medifinder 는
# 제품 단위로 따로 있어(medifinder/frontend/medifinder-web) 여기서 자리를 알려준다.
#
# **medifinder 가 자기 배포 스크립트를 갖지 않는 이유.** 이 파일과 ci-build/ci-deploy 는
# Cloudflare Worker 배포 절차를 담은 한 벌이고, 복사하면 "한쪽만 고치는 날" 이 온다 —
# 이 파일 머리에 같은 이유가 적혀 있다. 갈라야 할 것은 코드·시크릿·릴리스 주기였고
# 그건 이미 갈렸다. 배포 절차까지 두 벌로 만들 이유는 없다.
# 대상 이름 → 레포 루트 기준 경로. **워크플로의 경로 필터·캐시 키도 이 값을 쓴다.**
# 여기 한 곳에만 적는다 — 워크플로에 따로 적으면 한쪽만 고치는 날이 온다.
target_path_for() {
  case "$1" in
    medifinder-web) echo "medifinder/$AREA/$1" ;;
    *)              echo "$AREA/$1" ;;
  esac
}

# 경로 → 대상 이름. **마지막 조각이 곧 이름이다.**
#   frontend/hansapp-docs            → hansapp-docs
#   medifinder/frontend/medifinder-web → medifinder-web
target_name_for() {
  echo "${1##*/}"
}

# 인자를 검사하고 project · target_dir · project_label 을 세운다.
#
# **이름과 경로를 둘 다 받는다.** 사람은 이름으로 부르고(deploy.sh develop medifinder-web),
# 워크플로는 경로로 부른다(matrix 가 경로 필터와 캐시 키에 같은 값을 쓰기 때문이다).
resolve_project() {
  local given="${1:-}"
  [ -n "$given" ] || usage

  case "$given" in
    */*) project="$(target_name_for "$given")" ;;
    *)   project="$given" ;;
  esac

  local repo_root
  repo_root="$(cd "$AREA_DIR/.." && pwd)"
  target_dir="$(cd "$repo_root/$(target_path_for "$project")" 2>/dev/null && pwd)" \
    || die "$given 의 디렉터리를 찾을 수 없다"
  [ -f "$target_dir/package.json" ] || die "$given 이 없다 (package.json 없음)"

  # 출력용. 레포 루트 기준 경로라 어디 있는 대상인지 로그만 보고 안다.
  project_label="${target_dir#"$repo_root/"}"
}

# APP_ENV 검사. 판단은 언제나 이 긴 이름으로 한다 — 짧은 이름과 둘 다 조건문에 쓰이기
# 시작하면 `= prod` 와 `= production` 이 섞이고, 환경을 늘릴 때 한쪽만 고치는 날이 온다.
require_app_env() {
  require_env APP_ENV
  case "$APP_ENV" in
    develop | production) ;;
    *) die "APP_ENV 는 develop | production 이어야 한다 (받은 값: $APP_ENV)" ;;
  esac
}

# 빌드 산출물이 어디 나오는지. **빌드와 배포가 반드시 같은 답을 봐야 하는 값이다.**
# vite 는 dist, vitepress 는 .vitepress/dist 다.
dist_dir_for() {
  case "$1" in
    medifinder-web | hansapp-web | hansapp-auth | hansapp-admin) echo 'dist' ;;
    hansapp-docs)                                echo '.vitepress/dist' ;;
    *) die "$1 의 산출물 경로를 모른다. frontend/ci-lib.sh 에 케이스를 추가할 것." ;;
  esac
}

# Worker 이름은 <환경 약칭>-<프로젝트> 규칙으로 유도한다.
#
#   dev-medifinder-web      prod-medifinder-web
#   dev-hansapp-docs        prod-hansapp-docs
#
# 긴 이름을 그대로 쓰지 않는 이유. production- 은 그 자체로 11자라 대시보드의 좁은 목록에서
# 정작 구분해야 할 이름을 밀어낸다. dev-/prod- 는 길이도 비슷해 뒤가 세로로 맞는다.
#
# 환경마다 Worker 를 따로 두는 이유는 커스텀 도메인 때문이다. develop 도 자기 도메인이
# 있어야 한다 — 앱들이 쿠키로 SSO 를 하는데(VITE_APP_ROOT_DOMAIN), 공용 미리보기 도메인
# (*.workers.dev)은 public suffix 라 브라우저가 거기에 쿠키 심는 것을 거부한다.
#
# 접두사다. 접미사가 아니다. 대시보드는 이름순으로 늘어놓는데, 접미사면 환경이 섞여서
# 정렬되고 운영만 골라내려면 매번 눈으로 걸러야 한다. 접두사면 환경끼리 뭉쳐서 보인다.
# production 도 예외를 두지 않는다 — 규칙이 하나면 외울 것도, 분기도 없다.
#
# 규칙에서 벗어나는 이름이 필요하면 CF_WORKER_NAME 으로 덮어쓴다.
worker_name_for() {
  if [ -n "${CF_WORKER_NAME:-}" ]; then
    echo "$CF_WORKER_NAME"
  else
    echo "$(env_short "$APP_ENV")-$1"
  fi
}
