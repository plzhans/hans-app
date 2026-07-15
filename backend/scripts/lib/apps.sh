# 앱 이름 해석. **build.sh 와 deploy-backend.sh 가 같은 규칙을 쓰게 하려는 것이다.**
#
# 규칙을 두 곳에 두면 언젠가 갈라진다 — `build.sh api` 는 되는데
# `local-deploy.sh develop api` 는 "apps/api 가 없다" 로 죽는, 설명하기 어려운 상황이 온다.
#
# source 로 읽어 쓴다. cwd 에 기대지 않고 자기 위치에서 backend 를 찾는다 —
# build.sh 는 backend 로 cd 하고, deploy-backend.sh 는 안 하기 때문이다.

_APPS_BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 별칭 → 정식 이름. 못 찾으면 1.
#
#   hansapi-server   그대로
#   server           접두어를 붙인다
#   api              hansapi-server (아래 case)
#
# 접두어를 떼는 규칙(batch → hansapi-batch)이 대부분을 덮으므로, case 에는
# **그 규칙으로 안 되는 것만** 적는다. 목록이 짧을수록 안 갈라진다.
resolve_app() {
  local given="$1" name

  [ -d "$_APPS_BACKEND_DIR/apps/$given" ] && {
    printf '%s\n' "$given"
    return 0
  }

  case "$given" in
    # 이 앱은 'server' 보다 'api' 로 부르는 일이 많다.
    api) given='server' ;;
  esac

  name="hansapi-$given"
  [ -d "$_APPS_BACKEND_DIR/apps/$name" ] && {
    printf '%s\n' "$name"
    return 0
  }

  return 1
}

# 도움말·에러에 찍을 앱 목록. **받아주는 이름을 같이 보여준다** —
# "있는 앱: hansapi-server" 만 찍으면 api 라고 쳐도 되는 걸 아무도 모른다.
app_help() {
  local dir app short
  for dir in "$_APPS_BACKEND_DIR"/apps/*/; do
    app="$(basename "$dir")"
    short="${app#hansapi-}"
    [ "$app" = 'hansapi-server' ] && short="api, $short"
    printf '  %-18s %s\n' "$app" "($short)"
  done
}
