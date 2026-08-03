#!/usr/bin/env bash
#
# ci-bundle.sh 가 묶은 산출물을 원래 자리로 되돌린다.
#
#   APP_ENV=develop frontend/ci-unbundle.sh medifinder-web
#   → frontend/medifinder-web/dist  (docs 는 .vitepress/dist)
#
# 배포 잡이 아티팩트를 받은 직후에 부른다. 이 뒤에 ci-deploy.sh 가 산출물을 그대로 올린다 —
# **배포하는 쪽은 빌드를 하지 않는다.**
#
# [환경변수]
#   APP_ENV   develop | production
set -euo pipefail

# shellcheck source=frontend/ci-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/ci-lib.sh"

resolve_project "${1:-}"
require_app_env

dist_dir="$(dist_dir_for "$project")"
src="$target_dir/fe-dist.tgz"

[ -f "$src" ] || die "묶인 산출물이 없다: $AREA/$project/fe-dist.tgz
   빌드 잡의 아티팩트를 먼저 받아야 한다."

# **먼저 비운다.** 같은 러너에서 두 번 풀리는 일은 없지만, 남은 파일이 섞이면 지운
# 에셋이 계속 배포된다 — 그건 조용히 지나가는 종류의 실패다.
rm -rf "${target_dir:?}/${dist_dir:?}"
tar -xzf "$src" -C "$target_dir"
rm -f "$src"

[ -d "$target_dir/$dist_dir" ] || die "풀었는데 $dist_dir 이 없다. 묶을 때와 경로가 다르다."

du -sh "$target_dir/$dist_dir" | awk '{print "  산출물 " $1}'
echo "✅ $AREA/$project → $dist_dir"
