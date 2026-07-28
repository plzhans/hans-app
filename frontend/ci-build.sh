#!/usr/bin/env bash
#
# frontend 프로젝트 하나를 빌드한다. **배포하지 않는다.**
#
#   APP_ENV=develop frontend/ci-build.sh medifinder-web
#   APP_ENV=production frontend/ci-build.sh hansapp-docs
#
# [왜 배포와 나뉘어 있나]
# 릴리스는 **전부 빌드한 다음에 배포를 시작한다.** backend 를 배포한 뒤 frontend 빌드가
# 깨지면 운영이 반쪽만 갱신된 상태로 남기 때문이다. 그래서 빌드 단계가 따로 있어야 하고,
# CI 는 이렇게 묶는다.
#
#   build-backend  ─┐
#   build-frontend ─┼─ 둘 다 성공 ─→ deploy-backend → deploy-frontend
#
# 나뉘어 있으면 덤이 하나 더 있다 — **검사한 산출물이 그대로 배포된다.** 배포 단계가 다시
# 빌드하면 이론상 다른 것이 나갈 수 있다(의존성이 그사이 바뀌는 등).
#
# backend 도 원래 이 모양이었다. 예전 deploy-backend.sh 는 "TS 는 빌드하지 않는다,
# 먼저 만들어 둔 dist 를 싣는다" 고 적혀 있었다. frontend 만 합쳐져 있던 것을 맞춘 것이다.
#
# [환경변수]
#   APP_ENV   develop | production
#
# 값은 환경변수로만 받는다. 누가 채웠는지 이 스크립트는 모른다 — CI 면 워크플로가,
# 로컬이면 frontend/deploy.sh 가 채운다.
set -euo pipefail

# shellcheck source=frontend/ci-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/ci-lib.sh"

resolve_project "${1:-}"
require_app_env

dist_dir="$(dist_dir_for "$project")"

cd "$target_dir"

# 프로젝트마다 빌드 방법이 다르다(환경별 빌드가 있는 것, 스펙을 읽는 것...).
# 새 프론트를 추가하면 여기에 케이스를 하나 더 넣고, ci-lib.sh 의 목록·산출물 경로도 맞춘다.
case "$project" in
  medifinder-web | hansapp-web | hansapp-auth)
    # .env.<환경> 은 커밋되어 있다. 값이 전부 VITE_*(브라우저 번들에 그대로 구워지는
    # 공개 상수)라 숨길 이유가 없다는 게 frontend/.gitignore 에 적힌 정책이다.
    #
    # 값이 비면 vite 는 조용히 빈 문자열을 번들에 박는다. 그러면 빌드는 "성공"하는데
    # 배포된 앱이 API 를 못 찾는다. 그 실패는 런타임에 사용자 화면에서 드러난다.
    # 여기서 크게 실패하는 게 낫다.
    env_file=".env.$APP_ENV"
    [ -f "$env_file" ] || die "$AREA/$project/$env_file 이 없다. 커밋되어 있어야 한다."

    group "install ($project)"
    pnpm install --frozen-lockfile
    endgroup

    # build:<환경> 은 vite build 만 한다(tsc 를 건너뛴다). 타입 검사는 plain `build` 에만
    # 있어서, 환경 빌드로 배포하면 타입 에러가 그대로 배포된다. 그래서 명시적으로 돌린다.
    group "typecheck ($project)"
    pnpm exec tsc -b
    endgroup

    group "build ($project, $APP_ENV)"
    pnpm "build:$APP_ENV"
    endgroup
    ;;

  hansapp-docs)
    # **docs 는 .env 를 우리가 직접 읽어 넘긴다.**
    #
    # 다른 셋은 `dotenv -e .env.<환경>` 으로 파일을 명시하지만, docs 는 dotenv-cli 없이
    # `vitepress build` 를 돌린다. 그러면 vite mode 가 **항상 'production'** 이라
    # .env.develop 은 아예 안 읽히고, 대신 .env.production 이 읽힌다.
    # 즉 그냥 두면 **develop 빌드가 운영 값으로 구워진다** — GA 측정 ID 가 그래서
    # dev 트래픽을 운영 속성으로 보내게 된다. 빌드는 성공하니 아무도 모른다.
    #
    # 아래처럼 process.env 에 실어 보내면 vite 가 파일보다 이쪽을 우선한다.
    # (vite loadEnv: .env 파일을 먼저 넣고 process.env 의 VITE_* 로 덮어쓴다)
    env_file=".env.$APP_ENV"
    [ -f "$env_file" ] || die "$AREA/$project/$env_file 이 없다. 커밋되어 있어야 한다."
    set -a
    # shellcheck disable=SC1090
    . "./$env_file"
    set +a

    # 환경 이름 자체는 .env 가 아니라 여기서 넘긴다
    # (Sentry 의 environment 태그가 이 값이다 → .vitepress/config.ts).
    export DOCS_ENV="$APP_ENV"

    # 환경마다 Worker 가 따로라 사이트가 각자 자기 도메인을 갖는다. GH Pages 시절 한
    # 사이트에 두 환경을 서브패스(/ 와 /develop/)로 욱여넣느라 base 를 흔들던 이유가
    # 사라졌다. 항상 루트다.
    export DOCS_BASE='/'

    group "install ($project)"
    pnpm install --frozen-lockfile
    endgroup

    # build:dev / build:prod 는 쓰지 않는다. 그것들은 스펙을 재생성하는데(spec:*),
    # 재생성이 NestFactory.create(AppModule) 로 앱을 부팅해서 **살아있는 DB** 를 요구한다.
    # 빌드가 DB 에 의존하게 만들 이유가 없다.
    #
    # docs:build 는 커밋된 스펙(docs/openapi/openapi_hansapi.json)을 그대로 읽는다.
    # 스펙 갱신은 개발자가 로컬에서 하고 커밋한다(pnpm -C backend openapi:gen).
    group "build ($project, $APP_ENV)"
    pnpm docs:build
    endgroup
    ;;

  *)
    die "$project 을 어떻게 빌드하는지 이 스크립트가 모른다. frontend/ci-build.sh 에 케이스를 추가할 것."
    ;;
esac

[ -d "$dist_dir" ] || die "빌드 산출물이 없다: $AREA/$project/$dist_dir"

echo "✅ 빌드 완료 $AREA/$project ($APP_ENV) → $dist_dir"
