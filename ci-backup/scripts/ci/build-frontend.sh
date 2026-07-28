#!/usr/bin/env bash
#
# frontend 빌드. **빌드 로직의 유일한 출처다.** 워크플로우는 이 스크립트를 호출만 한다.
#
#   ./scripts/ci/build-frontend.sh <frontend 디렉터리명> [환경]
#
#   ./scripts/ci/build-frontend.sh medifinder-web develop
#   ./scripts/ci/build-frontend.sh hansapp-docs
#
#   로컬:  make ci-build-front APP=medifinder-web ENV=develop
#   CI:    .github/workflows/fe-build-test.yml (검사) · fe-deploy-medifinder.yml (배포)
#
# 인자는 frontend/ 아래의 **디렉터리 이름 그대로다.** 별칭(web, docs)을 쓰지 않는 이유:
# 프론트가 여러 개가 되면 별칭과 실제 디렉터리가 어긋나기 시작하고, 별칭이 무엇을 가리키는지
# 스크립트를 열어봐야 알게 된다. 디렉터리명이면 그런 중간 단계가 없다.
# (그래서 프로젝트 이름이 바뀌어도 git mv 만 하면 된다)
#
# frontend 의 프로젝트들은 pnpm 워크스페이스가 아니다. 각자 자기 lockfile 로 따로 설치한다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

usage() {
  echo "사용: $0 <frontend 디렉터리명> [환경]" >&2
  echo "" >&2
  echo "현재 있는 것:" >&2
  for d in "$REPO_ROOT"/frontend/*/; do
    [ -f "$d/package.json" ] && echo "  $(basename "$d")" >&2
  done
  exit 2
}

project="${1:-}"
[ -n "$project" ] || usage

project_dir="$REPO_ROOT/frontend/$project"
if [ ! -f "$project_dir/package.json" ]; then
  echo "❌ frontend/$project 이 없다." >&2
  usage
fi

cd "$project_dir"

# 프로젝트마다 빌드 방법이 다르다(환경별 빌드가 있는 것, 스펙을 읽는 것...).
# 새 프론트를 추가하면 여기에 케이스를 하나 더 넣는다.
case "$project" in
  medifinder-web)
    env_name="${2:-}"
    case "$env_name" in
      develop | production) ;;
      *)
        echo "❌ $project 은 환경이 필요하다: develop | production" >&2
        exit 2
        ;;
    esac

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
    #   VITE_HANSAPI_KEY 는 선택이다. mutator.ts 가 `if (API_KEY)` 로 감싸고 있어서,
    #     비면 Authorization 헤더를 안 붙인다(인증을 아직 안 거는 환경).
    #   VITE_SHOW_INTEGRATION_INFO 는 지금 코드에서 아무도 읽지 않는다.
    missing=()
    for key in VITE_HANSAPI_BASE_URL VITE_NCLOUD_CLIENT_ID VITE_SITE_URL; do
      # key=<비어있지 않은 값> 이 한 줄이라도 있어야 한다.
      grep -qE "^${key}=.+" "$env_file" || missing+=("$key")
    done
    if [ ${#missing[@]} -gt 0 ]; then
      echo "❌ $env_file 에 값이 빈 키가 있다: ${missing[*]}" >&2
      exit 1
    fi

    group "install ($project)"
    pnpm install --frozen-lockfile
    endgroup

    # build:<환경> 은 vite build 만 한다(tsc 를 건너뛴다). 타입 검사는 plain `build` 에만 있어서
    # 환경 빌드로 배포하면 타입 에러가 그대로 배포된다. 그래서 여기서 명시적으로 돌린다.
    group "typecheck ($project)"
    pnpm exec tsc -b
    endgroup

    group "build ($project, $env_name)"
    pnpm "build:$env_name"
    endgroup

    echo "✅ $project ($env_name) OK → frontend/$project/dist"
    ;;

  hansapp-docs)
    env_name="${2:-}"
    [ -n "$env_name" ] || {
      echo "❌ $project 은 환경이 필요하다 (예: develop, production)" >&2
      exit 2
    }

    # 환경 이름을 빌드에 알린다(Sentry 의 environment 태그가 이 값이다 → .vitepress/config.ts).
    # **.env.<환경> 으로는 못 넘긴다** — docs 는 dotenv-cli 없이 `vitepress build` 를 돌려서
    # vite mode 가 develop/production 둘 다 'production' 이고, .env.develop 은 로드되지 않는다.
    export DOCS_ENV="$env_name"

    # 하나의 Pages 사이트가 여러 환경을 담는다. 배포 경로가 다르므로 base 도 달라야 한다.
    # base 가 틀리면 페이지는 뜨는데 CSS·JS 경로가 어긋나 화면이 깨진다.
    #
    # 배포에서는 deploy-docs.sh 가 DOCS_BASE 를 넘겨준다(환경 변수 DOCS_PATH 에서 유도).
    # 아래 폴백은 로컬에서 이 스크립트만 단독으로 돌릴 때를 위한 것이다.
    if [ -z "${DOCS_BASE:-}" ]; then
      if [ "$env_name" = 'production' ]; then
        export DOCS_BASE='/'
      else
        export DOCS_BASE="/$env_name/"
      fi
    fi

    # 스펙의 servers 를 환경에 맞게 갈아끼운다.
    #
    # 커밋된 스펙은 개발 기준이라 servers 에 Local·Development 만 있다. 그대로 production 문서를
    # 올리면 "이 API 서버는 develop-api" 라고 안내하게 된다.
    #
    # 앱을 다시 부팅해서 재생성하지 않는다(그건 살아있는 DB 를 요구한다). 스펙은 그냥 JSON 이라
    # servers 만 갈아끼우면 된다. 형식은 backend 의 OPENAPI_SERVERS 관례와 같다.
    #   "https://api.example.com|Production;https://dev.example.com|Development"
    spec_src="$REPO_ROOT/docs/openapi/openapi_hansapi.json"
    if [ -n "${OPENAPI_SERVERS:-}" ]; then
      spec_out="$(mktemp -d)/openapi_hansapi.json"
      jq --arg servers "$OPENAPI_SERVERS" '
        .servers = (
          $servers
          | split(";")
          | map(select(length > 0) | split("|") | {
              url: (.[0] | ltrimstr(" ") | rtrimstr(" ")),
              description: ((.[1] // .[0]) | ltrimstr(" ") | rtrimstr(" "))
            })
        )
      ' "$spec_src" > "$spec_out"
      # openapi-spec.ts 가 OPENAPI_SPEC 을 먼저 본다.
      export OPENAPI_SPEC="$spec_out"
      echo "  servers → $(jq -r '[.servers[].url] | join(", ")' "$spec_out")"
    else
      echo "  ⚠️  OPENAPI_SERVERS 가 없다. 커밋된 스펙의 servers 를 그대로 쓴다:" >&2
      echo "     $(jq -r '[.servers[].url] | join(", ")' "$spec_src")" >&2
    fi

    group "install ($project)"
    pnpm install --frozen-lockfile
    endgroup

    # build:dev / build:prod 는 쓰지 않는다. 그것들은 스펙을 재생성하는데(spec:*),
    # 재생성이 NestFactory.create(AppModule) 로 앱을 부팅해서 **살아있는 DB** 를 요구한다.
    # CI 가 DB 에 의존하게 만들 이유가 없다.
    #
    # docs:build 는 커밋된 스펙(또는 위에서 servers 만 갈아끼운 사본)을 그대로 읽는다.
    # 스펙 갱신은 개발자가 로컬에서 하고 커밋한다(pnpm -C backend openapi:gen).
    group "build ($project, $env_name)"
    pnpm docs:build
    endgroup

    echo "✅ $project ($env_name, base=$DOCS_BASE) OK → frontend/$project/.vitepress/dist"
    ;;

  *)
    echo "❌ $project 을 어떻게 빌드하는지 이 스크립트가 모른다." >&2
    echo "   scripts/ci/build-frontend.sh 에 케이스를 추가할 것." >&2
    exit 2
    ;;
esac
