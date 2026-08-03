#!/usr/bin/env bash
#
# 빌드된 산출물을 묶는다. **빌드하지도 배포하지도 않는다.**
#
#   APP_ENV=develop frontend/ci-bundle.sh medifinder-web
#   → frontend/medifinder-web/fe-dist.tgz
#
# [왜 묶나]
# 빌드한 잡과 배포하는 잡이 다르기 때문이다. 예전에는 검증과 배포가 **각자 빌드**했는데,
# 빌드가 결정적이라(커밋 + frozen lockfile) 결과는 같지만 ci-build.sh 헤더가 말하는
# "검사한 산출물이 그대로 배포된다" 는 성질이 없었다. 이론상 다른 것이 나갈 수 있다.
#
# **디렉터리째 올리지 않는다.** dist 는 작은 파일이 수천 개라 아티팩트 업로드에서 개당
# 오버헤드가 지배한다. 하나로 묶으면 파일 1개가 된다.
#
# 산출물 경로는 ci-lib.sh 가 안다 — 빌드와 배포가 반드시 같은 답을 봐야 하는 값이라
# 여기에 다시 적지 않는다.
#
# [환경변수]
#   APP_ENV   develop | production
set -euo pipefail

# shellcheck source=frontend/ci-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/ci-lib.sh"

resolve_project "${1:-}"
require_app_env

dist_dir="$(dist_dir_for "$project")"

# 빌드를 여기서 하지 않으므로, 산출물이 없다는 건 순서가 틀렸다는 뜻이다.
[ -d "$target_dir/$dist_dir" ] || die "빌드 산출물이 없다: $AREA/$project/$dist_dir
   먼저 빌드할 것:  APP_ENV=$APP_ENV $AREA/ci-build.sh $project"

out="$target_dir/fe-dist.tgz"

# -C 로 프로젝트 안에서 묶는다. 그래야 푸는 쪽이 같은 자리에 그대로 되돌릴 수 있다
# (.vitepress/dist 처럼 중첩된 경로도 보존된다).
tar -czf "$out" -C "$target_dir" "$dist_dir"

ls -lh "$out" | awk '{print "  묶음 " $5}'
echo "✅ $AREA/$project ($APP_ENV) → $(basename "$out")"
