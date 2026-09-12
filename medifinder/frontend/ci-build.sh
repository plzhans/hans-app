#!/usr/bin/env bash
#
# medifinder-web 을 빌드한다. 배포하지 않는다.
#
#   APP_ENV=develop medifinder/frontend/ci-build.sh
#
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/ci-lib.sh"
require_app_env

cd "$TARGET_DIR"

# .env.<환경> 은 커밋되어 있다(값이 전부 VITE_* 공개 상수 — .gitignore 참고).
# 없으면 vite 가 빈 문자열을 번들에 박아 빌드는 성공하고 배포된 앱이 API 를 못 찾는다.
env_file=".env.$APP_ENV"
[ -f "$env_file" ] || die "$PROJECT/$env_file 이 없다. 커밋되어 있어야 한다."

# vite 는 .env.local 을 모든 mode 에서 읽는다. 이 레포는 그 파일을 local 환경 설정으로
# 쓰므로, develop·production 에 같은 키가 없으면 로컬 값이 배포 번들에 박힌다 —
# hansapp-web 운영 로그인 주소가 그렇게 깨진 적이 있다.
# 키가 있기만 하면 mode 파일이 이긴다. 빈 값이어도 된다.
if [ -f .env.local ] && [ "$APP_ENV" != 'local' ]; then
  leaked="$(
    comm -23 \
      <(grep -oE '^[A-Z0-9_]+' .env.local | sort -u) \
      <(grep -oE '^[A-Z0-9_]+' "$env_file" | sort -u)
  )"
  if [ -n "$leaked" ]; then
    echo "❌ .env.local 에만 있는 키가 있다. $env_file 에도 적을 것 (빈 값이어도 된다):" >&2
    printf '     %s\n' $leaked >&2
    exit 1
  fi
fi

# clients/ 의 SDK 는 워크스페이스가 아니라 심볼릭 링크라, 소비자에서 install 을 돌려도
# 그쪽 의존성은 안 깔린다. 그런데 SDK 는 src 를 내보내 tsc 가 그 소스까지 컴파일한다.
# 로컬은 node_modules 가 남아 있어 통과하고, CI 의 깨끗한 체크아웃에서만 터진다.
for linked in $(node -p "
  const d=require('./package.json').dependencies||{};
  Object.values(d).filter(v=>v.startsWith('link:')).map(v=>v.slice(5)).join(' ')
"); do
  group "install ($PROJECT → $linked)"
  (cd "$linked" && pnpm install --frozen-lockfile)
  endgroup
done

group "install ($PROJECT)"
pnpm install --frozen-lockfile
endgroup

# build:<환경> 은 vite build 만 하고 tsc 를 건너뛴다. 타입 에러가 그대로 배포되지 않게
# 여기서 돌린다.
group "typecheck ($PROJECT)"
pnpm exec tsc -b
endgroup

group "build ($PROJECT, $APP_ENV)"
pnpm "build:$APP_ENV"
endgroup

[ -d "$DIST_DIR" ] || die "빌드 산출물이 없다: $PROJECT/$DIST_DIR"

echo "✅ 빌드 완료 medifinder/frontend/$PROJECT ($APP_ENV) → $DIST_DIR"
