#!/usr/bin/env bash
#
# 앱 컨테이너를 멈춘다. **redis 는 건드리지 않는다.**
#
#   APP_ENV=develop scripts/deploy/stage/app-stop.sh
#
# [왜 마이그레이션 앞에서 멈추나]
# 스키마를 바꾸는 동안 옛 코드가 새 스키마 위에서 돌면 깨진다. 컬럼을 지우거나 이름을
# 바꾸는 변경이 특히 그렇다 — 앱이 없는 컬럼을 계속 읽는다.
#
# 예전에는 `migrate → up -d` 순서라 그 창이 열려 있었다. 앱을 먼저 내리면 창이 사라진다.
#
#   docker-image-pull  ← 여기까지는 앱이 살아 있다
#   app-stop   ┐
#   db-migrate │ 다운타임
#   app-start  ┘
#
# **다운타임이 생긴다.** develop 은 공용 개발 서버라 감수할 수 있는 종류지만, 무중단이
# 필요해지면 스키마 변경을 하위호환으로만 하는(expand-contract) 규율로 바꾸고 이 단계를
# 빼야 한다 — 지금은 그 규율이 없으므로 멈추는 쪽이 안전하다.
#
# **redis 를 남기는 이유.** 캐시라 앱과 수명을 같이할 이유가 없고, 멈췄다 켜면 콜드
# 캐시로 시작해 첫 요청들이 느려진다. 스키마와도 무관하다.
#
# [환경변수]
#   APP_ENV                  develop | production
#   BE_HANSAPP_DEPLOY_PATH   ~/app/hansapp-dev
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start '앱 중단'

require_env BE_HANSAPP_DEPLOY_PATH
require_ssh

# **stop 이지 down 이 아니다.** down 은 네트워크와 컨테이너를 지워서 redis 까지 딸려
# 내려간다. stop 은 컨테이너를 남긴 채 프로세스만 멈추므로 redis 가 그대로 산다.
#
# 없는 컨테이너를 멈추라고 해도 compose 는 조용히 넘어간다(첫 배포).
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose stop api batch"

remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose ps --all --format '  {{.Service}}\t{{.State}}'" || true

echo "✅ api·batch 중단 (redis 는 유지)"
