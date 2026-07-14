#!/usr/bin/env bash
#
# frontend 빌드. **빌드 로직의 유일한 출처다.** 워크플로우는 이 스크립트를 호출만 한다.
#
#   ./scripts/ci/build-frontend.sh web  develop|staging|production
#   ./scripts/ci/build-frontend.sh docs
#
#   로컬:  make ci-build-web ENV=develop   /   make ci-build-docs
#   CI:    .github/workflows/build-frontend.yml
#
# frontend 의 두 프로젝트는 pnpm 워크스페이스가 아니다. 각자 자기 lockfile 로 따로 설치한다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

usage() {
  echo "사용: $0 web <develop|staging|production>" >&2
  echo "      $0 docs" >&2
  exit 2
}

target="${1:-}"

case "$target" in
  web)
    env_name="${2:-}"
    case "$env_name" in
      develop | staging | production) ;;
      *) usage ;;
    esac

    cd "$REPO_ROOT/frontend/clinicfinder-web"

    # .env.<환경> 은 gitignore 다(레포에 없다). 로컬에는 개발자가 갖고 있고,
    # CI 에서는 워크플로우가 GitHub Variables/Secrets 를 읽어 빌드 직전에 써준다.
    #
    # 값이 비면 vite 는 조용히 빈 문자열을 번들에 박아 넣는다. 그러면 빌드는 "성공"하는데
    # 배포된 앱이 API 를 못 찾는다. 그 실패는 런타임에 사용자 화면에서 드러난다.
    # 여기서 크게 실패하는 게 낫다.
    env_file=".env.$env_name"
    if [ ! -f "$env_file" ]; then
      echo "❌ $env_file 이 없다." >&2
      echo "   로컬이면 개발자에게 받아서 두고, CI 면 워크플로우가 vars/secrets 로 만들어야 한다." >&2
      exit 1
    fi

    # 값이 반드시 있어야 하는 키만 본다.
    #   VITE_API_KEY 는 선택이다. mutator.ts 가 `if (API_KEY)` 로 감싸고 있어서,
    #     비면 Authorization 헤더를 안 붙인다(인증을 아직 안 거는 환경).
    #   VITE_SHOW_INTEGRATION_INFO 는 지금 코드에서 아무도 읽지 않는다.
    missing=()
    for key in VITE_API_BASE_URL VITE_NCLOUD_CLIENT_ID VITE_SITE_URL; do
      # key=<비어있지 않은 값> 이 한 줄이라도 있어야 한다.
      grep -qE "^${key}=.+" "$env_file" || missing+=("$key")
    done
    if [ ${#missing[@]} -gt 0 ]; then
      echo "❌ $env_file 에 값이 빈 키가 있다: ${missing[*]}" >&2
      exit 1
    fi

    group "install (clinicfinder-web)"
    pnpm install --frozen-lockfile
    endgroup

    # build:<환경> 은 vite build 만 한다(tsc 를 건너뛴다). 타입 검사는 plain `build` 에만 있어서
    # 환경 빌드로 배포하면 타입 에러가 그대로 배포된다. 그래서 여기서 명시적으로 돌린다.
    group "typecheck (clinicfinder-web)"
    pnpm exec tsc -b
    endgroup

    group "build (clinicfinder-web, $env_name)"
    pnpm "build:$env_name"
    endgroup

    echo "✅ clinicfinder-web ($env_name) OK → frontend/clinicfinder-web/dist"
    ;;

  docs)
    cd "$REPO_ROOT/frontend/hansapi-docs"

    group "install (hansapi-docs)"
    pnpm install --frozen-lockfile
    endgroup

    # build:dev / build:prod 는 쓰지 않는다. 그것들은 스펙을 재생성하는데(spec:*),
    # 재생성이 NestFactory.create(AppModule) 로 앱을 부팅해서 **살아있는 DB** 를 요구한다.
    # CI 가 DB 에 의존하게 만들 이유가 없다.
    #
    # docs:build 는 레포에 커밋된 docs/openapi/openapi_hansapi.json 을 그대로 읽는다.
    # 스펙 갱신은 개발자가 로컬에서 하고 커밋한다(pnpm -C backend openapi:gen).
    group "build (hansapi-docs)"
    pnpm docs:build
    endgroup

    echo "✅ hansapi-docs OK → frontend/hansapi-docs/.vitepress/dist"
    ;;

  *)
    usage
    ;;
esac
