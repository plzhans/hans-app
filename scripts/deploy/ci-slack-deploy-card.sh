#!/usr/bin/env bash
#
# 배포 스레드의 **루트 메시지**를 그린다. 네트워크를 타지 않는다 — JSON 을 stdout 으로 뱉을
# 뿐이고, 부치는 것은 워크플로의 slack-github-action 이 한다.
#
#   scripts/deploy/ci-slack-deploy-card.sh > card.json
#
# [제목만 담는다]
# 이 메시지는 **채널에 남는 한 줄**이다. 커밋·요청자·실행 링크 같은 세부는 첫 댓글로 내려
# 스레드 안에 두고, 채널에서는 "무엇이 시작됐다" 만 보이게 한다. 채널이 배포 카드로 빽빽해지면
# 정작 그 사이에 낀 다른 이야기가 안 보인다.
#
# 세부를 여기 안 담으니 커밋 제목도 안 받는다 — 값에 섞인 따옴표·꺾쇠를 걱정할 일이
# 이 스크립트에서는 사라졌다.
#
# [환경변수]
#   SLACK_CHANNEL   C… 또는 #이름
#   APP_ENV         develop | production (기본 develop)
#   DEPLOY_LABEL    (선택) '백엔드'·'프론트'. **한 채널에 여러 배포가 뜨므로** 제목에서
#                   무엇의 배포인지 갈려야 한다. 없으면 환경 이름만 나온다
set -euo pipefail

: "${SLACK_CHANNEL:?SLACK_CHANNEL 이 필요하다}"

app_env="${APP_ENV:-develop}"

# **production 만 다른 색을 쓴다**(앱의 기동 알림과 같은 규칙). develop 은 하루에도 몇 번씩
# 도니 흘려보내도 되지만, 운영이 나간 것은 스크롤하다 걸려야 하는 사건이다.
if [ "$app_env" = 'production' ]; then
  color='#e8912d'
else
  color='#4a90d9'
fi

label="${DEPLOY_LABEL:-}"
title="🚀  ${label:+$label }$app_env 배포 시작"

# text 는 채널 밖(모바일 푸시·채널 목록)에 뜨는 한 줄이다. attachments 를 쓰면 채널에는
# 그쪽이 그려지고 이 값은 미리보기로만 남으므로 비워 두면 안 된다.
jq -n \
  --arg channel "$SLACK_CHANNEL" \
  --arg color   "$color" \
  --arg title   "$title" '
    {
      channel: $channel,
      text: $title,
      attachments: [ {
        color: $color,
        blocks: [ { type: "section", text: { type: "mrkdwn", text: ("*" + $title + "*") } } ]
      } ]
    }
  '
