#!/usr/bin/env bash
#
# 앱 컨테이너를 새 이미지·새 설정으로 띄운다.
#
#   APP_ENV=develop scripts/deploy/stage/app-start.sh
#
# 설정만 바꿨을 때는 config-upload.sh 뒤에 이것만 돌리면 된다 — app-stop 도 필요 없다.
# --force-recreate 가 교체하므로 멈춰 있는 시간이 거의 없다.
#
# [--force-recreate 가 반드시 필요하다]
# compose 는 **서비스 정의가 바뀌어야** 컨테이너를 다시 만든다. 그런데 앱 설정은
# bind mount 라 경로가 그대로다:
#
#   ./config/config.develop.yaml:/app/config/config.yaml:ro
#
# 즉 파일 내용을 갈아끼워도 정의는 그대로라 컨테이너가 재생성되지 않고, 앱은 부팅 때
# 읽어둔 옛 설정을 계속 들고 돈다. **파일은 바뀌었는데 동작은 안 바뀌는** 제일 헷갈리는
# 실패 모양이다.
#
# 지금까지 이게 안 터진 것은 우연에 가깝다 — api 서비스만 SLACK_DEPLOY_THREAD_TIMESTAMP 를
# environment 로 받는데 그 값이 배포마다 달라서 api 는 매번 재생성됐다. 그런데 그건
# x-common 이 아니라 api 에만 있어서 **batch 는 해당이 없다.**
#
# [환경변수]
#   APP_ENV                        develop | production
#   BE_HANSAPP_DEPLOY_PATH         ~/app/hansapp-dev
#   SLACK_DEPLOY_THREAD_TIMESTAMP  (선택) 배포 스레드의 ts. 앱의 기동 알림이 그 스레드에 붙는다
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start '앱 기동'

require_env BE_HANSAPP_DEPLOY_PATH
require_ssh

# api 는 depends_on 으로 redis 를 물고 있어 멈춰 있으면 compose 가 알아서 같이 띄운다.
#
# **슬랙 스레드 ts 는 이 명령에만 붙인다.** 서버의 .env 에 쓰면 그 파일이 계속 남아 다음
# 재시작에도 옛 스레드를 가리킨다. 여기서 주면 그 up 에만 적용되고 파일에는 안 남는다.
# (컨테이너 환경에는 구워지므로, 낡은 값은 앱이 ts 의 나이를 보고 무시한다.)
#
# --remove-orphans: compose 에서 서비스를 지웠을 때 서버에 남은 컨테이너를 정리한다.
remote "cd $BE_HANSAPP_DEPLOY_PATH && SLACK_DEPLOY_THREAD_TIMESTAMP='${SLACK_DEPLOY_THREAD_TIMESTAMP:-}' \
  docker compose up -d --force-recreate --remove-orphans api batch"

echo
remote "cd $BE_HANSAPP_DEPLOY_PATH && docker compose ps"

# 무엇이 떠 있는지는 태그가 아니라 앱이 답한다(dist/build-info.json 의 sha) —
# develop 은 :develop 이 계속 움직이므로 태그 이름만으로는 알 수 없다.
echo
echo "✅ 기동 완료. 무엇이 떠 있는지는 앱의 build-info 가 답한다"
