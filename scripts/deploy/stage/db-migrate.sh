#!/usr/bin/env bash
#
# DB 스키마를 반영한다. main·log 두 스키마를 함께 돌린다.
#
#   APP_ENV=develop scripts/deploy/stage/db-migrate.sh
#
# **앱이 멈춰 있는 동안 돈다**(app-stop → db-migrate → app-start). 옛 코드가 새 스키마
# 위에서 도는 창을 없애려는 것이다 — 자세한 것은 app-stop.sh 헤더.
#
# [서버에서 컨테이너로 돌린다]
# 배포하는 쪽(CI 러너·맥)에서 prisma 를 돌리지 않는 이유는 세 가지다.
#
#   - CI 러너에는 node_modules 가 없다. 매번 pnpm install 을 해야 한다
#   - prisma 는 devDependency 라 런타임 이미지에 없다 — 어디서 돌릴지가 애매해진다
#   - **DB 가 사설망에 있다.** 서버에서 돌리면 이미 그 안이라 한 겹을 덜 지난다
#
# 이미지에는 prisma CLI 와 스키마·마이그레이션 파일만 들어 있다(hansapp-cli.Dockerfile).
# 운영 이미지에는 그것들이 없어야 한다 — 스키마를 바꿀 수 있는 도구를 서비스 컨테이너에
# 상주시키지 않으려는 것이다.
#
# [멱등하다]
# `migrate deploy` 는 적용할 게 없으면 그냥 지나간다. 스키마 변경이 없는 배포에서도 무해하다.
#
# [되돌리기]
# `migrate deploy` 에는 down 이 없다. 되돌리려면 새 마이그레이션을 쓴다. 그래서 이미지는
# 태그만 바꿔 롤백되지만 스키마는 그렇지 않다 — 컬럼 삭제·이름 변경은 두 번에 나눈다
# (코드에서 안 쓰게 배포 → 다음 릴리스에서 실제 삭제).
#
# [k3s 로 옮길 때]
# 이 스크립트는 버려지고 Job 이 그 자리를 맡는다. **이미지는 그대로 쓴다.**
#
# [환경변수]
#   APP_ENV                  develop | production
#   BE_HANSAPP_DEPLOY_PATH   ~/app/hansapp-dev
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start 'DB 마이그레이션'

require_env BE_HANSAPP_DEPLOY_PATH
require_ssh

echo "  스키마  prisma/main · prisma/log"
echo

# 이미지는 docker-image-pull.sh 가 --profile migrate 로 이미 받아 뒀고, IMAGE_TAG·uid 는
# config-upload.sh 가 서버 .env 에 써 뒀다. 그래서 여기서는 값을 다시 넘기지 않는다 —
# 두 군데서 같은 것을 정하면 언젠가 어긋난다.
#
# --rm: 끝나면 컨테이너를 지운다. 서비스가 아니라 작업이다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose run --rm migrate"

echo "✅ $APP_ENV 마이그레이션 완료"
