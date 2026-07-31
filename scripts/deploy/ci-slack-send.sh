#!/usr/bin/env bash
#
# 배포 스레드에 메시지를 보낸다. **이 스크립트는 배포를 모른다** — 무엇을 알릴지도, 어떤
# 모양으로 보일지도 부르는 쪽이 정하고, 여기서는 "어디로 어떻게 부치는지" 만 다룬다.
#
#   ts=$(scripts/deploy/ci-slack-send.sh --title '🚀 develop 배포 시작')
#
#   scripts/deploy/ci-slack-send.sh --thread "$ts" --title '도커 이미지를 배포합니다'
#
#   scripts/deploy/ci-slack-send.sh --thread "$ts" \
#     --title '서버를 새로 시작합니다' \
#     --text  "$(remote 'docker compose ps')"
#
#   scripts/deploy/ci-slack-send.sh --update "$ts" --title '✅ develop 배포 완료'
#
# [계약]
#   stdout   보낸(고친) 메시지의 ts, **오직 그것만**. 실패하거나 꺼져 있으면 빈 문자열
#   stderr   사람이 볼 로그
#   exit     **언제나 0**
#
# 셋이 한 묶음이다. ts 를 명령 치환($(...))으로 받아야 하므로 stdout 에 다른 것이 섞이면
# 안 되고, 부르는 쪽(ci-deploy.sh)이 `set -e` 라 여기서 1 을 뱉으면 **알림이 실패했다는
# 이유로 배포가 죽는다.** 알림은 배포의 부속물이지 조건이 아니다.
#
# [제목과 내용을 나누는 이유]
# 스레드에 쌓이는 것은 "지금 무엇을 하는 중인가" 의 목록이다. 그 목록은 **제목만 훑어도
# 읽혀야 하고**, 세부는 필요할 때만 눈에 들어와야 한다. 한 덩어리 문자열로 받으면 부르는
# 쪽마다 굵게 처리를 손으로 하게 되고, 그러다 보면 어떤 줄은 굵고 어떤 줄은 아니게 된다.
#
# 굵게(*…*)는 여기서 붙인다. 그래서 **--title 에는 mrkdwn 을 넣지 않는 편이 낫다** —
# `*` 가 겹치면 깨진다. --text 는 부르는 쪽의 것이라 손대지 않는다.
#
# [본문을 두 가지로 받는 이유]
# 보내는 것의 9할은 제목 한 줄 + 내용 몇 줄인데, 가끔은 색 띠나 필드 격자가 필요하다.
# 그렇다고 --color·--fields 처럼 플래그를 늘리면 슬랙이 블록을 하나 내놓을 때마다 이
# 스크립트를 고치게 된다. 그래서 **모양이 필요하면 페이로드를 통째로 준다.**
#
# 반대로 --json 만 받으면 한 줄 보내는 데도 부르는 쪽이 손으로 JSON 을 조립하게 된다.
# 배포 로그에 따옴표 하나만 섞여도 그 자리에서 깨진다 — 그래서 두 갈래가 다 있다.
#
# [옵션]
#   --title <제목>      한 줄. 굵게 나간다
#   --text <내용>       여러 줄 가능. 제목 아래 붙는다. 혼자 써도 된다
#   --json <값|경로|->  페이로드 원본. `{` 로 시작하면 그 자체를, `-` 면 stdin 을, 아니면 파일
#   --thread <ts>       그 메시지의 답글로 단다 (chat.postMessage + thread_ts)
#   --update <ts>       그 메시지를 이 내용으로 바꾼다 (chat.update)
#
# [환경변수]
#   SLACK_BOT_TOKEN   xoxb-… **웹훅이 아니라 봇 토큰이어야 한다.** 웹훅은 응답이 'ok' 뿐이라
#                     ts 를 주지 않고, ts 가 없으면 스레드가 성립하지 않는다. 필요한 스코프는
#                     chat:write (chat.update 도 같은 것).
#   SLACK_CHANNEL     C… 또는 #이름. **답글에도 필요하다** — 슬랙은 thread_ts 만으로
#                     대상을 찾지 못한다.
#
# **백엔드 .env.<환경> 의 것과 같은 값·같은 이름이다.** 앱의 기동 알림과 배포 알림이 같은 봇,
# 같은 채널을 쓰기 때문에 이름을 갈라 둘 이유가 없다 — 갈라 두면 어느 쪽이 정본인지 흐려진다.
# CI 에서는 environment secret/variable(develop·production)로 들어온다.
#
# [꺼져 있는 것은 정상이다]
# 로컬 배포(scripts/deploy/deploy.sh)에는 토큰이 없다. 그때는 조용히 아무것도 안 하고
# 빈 ts 를 돌려준다 — CI 안(GITHUB_ACTIONS)에서만 "설정이 빠졌다" 고 경고한다. 배포 한 번에
# 열 번쯤 불리므로, 정상 상황에서 같은 경고가 열 줄 쌓이면 진짜 경고가 묻힌다.

# **-e 를 일부러 뺐다.** 이 스크립트는 어떤 경우에도 0 으로 끝나야 하는데, -e 가 켜져 있으면
# curl 실패·jq 실패가 그대로 종료 코드가 되어 부르는 쪽의 배포를 죽인다. 실패는 아래에서
# 손으로 잡아 stderr 로만 알린다.
set -uo pipefail

title=''
text=''
json_input=''
thread_ts=''
update_ts=''

warn() { echo "⚠️  slack: $*" >&2; }

# 설정이 빠진 것은 CI 에서만 사고다. 로컬은 원래 안 보내는 게 맞다.
warn_if_ci() { [ -n "${GITHUB_ACTIONS:-}" ] && warn "$*"; return 0; }

# 알림을 포기하고 조용히 성공으로 끝낸다. stdout 은 비어 있어야 하므로 아무것도 안 찍는다.
give_up() { exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --title)  title="${2:-}";      shift 2 ;;
    --text)   text="${2:-}";       shift 2 ;;
    --json)   json_input="${2:-}"; shift 2 ;;
    --thread) thread_ts="${2:-}";  shift 2 ;;
    --update) update_ts="${2:-}";  shift 2 ;;
    *)        warn "모르는 인자다: $1"; give_up ;;
  esac
done

# --thread 와 --update 는 같이 쓸 수 없다. 답글을 달면서 동시에 고칠 수는 없다 —
# 조용히 하나를 무시하면 "왜 안 고쳐지지" 를 한참 찾게 된다.
if [ -n "$thread_ts" ] && [ -n "$update_ts" ]; then
  warn '--thread 와 --update 는 같이 못 쓴다.'
  give_up
fi

if [ -n "$json_input" ] && { [ -n "$title" ] || [ -n "$text" ]; }; then
  warn '--json 은 --title·--text 와 같이 못 쓴다. 모양을 통째로 주든지, 제목·내용을 주든지 하나만.'
  give_up
fi
if [ -z "$json_input" ] && [ -z "$title" ] && [ -z "$text" ]; then
  warn '보낼 내용이 없다. --title·--text·--json 중 하나는 있어야 한다.'
  give_up
fi

token="${SLACK_BOT_TOKEN:-}"
channel="${SLACK_CHANNEL:-}"

if [ -z "$token" ]; then
  warn_if_ci 'SLACK_BOT_TOKEN 이 없다. 알림을 건너뛴다.'
  give_up
fi
if [ -z "$channel" ]; then
  # 토큰만 있고 채널이 없는 것은 명백한 설정 실수다. 로컬이어도 알린다.
  warn 'SLACK_BOT_TOKEN 은 있는데 SLACK_CHANNEL 이 없다.'
  give_up
fi

for tool in curl jq; do
  command -v "$tool" >/dev/null || { warn "$tool 이 없어서 알림을 건너뛴다."; give_up; }
done

# ─────────────────────────────────────────────────────────────────────────────
# 페이로드
#
# 어느 쪽으로 받았든 여기서 channel 과 대상(thread_ts·ts)을 얹는다. **그 셋은 부르는 쪽이
# 못 덮는다** — 어디로 갈지는 이 스크립트의 소관이고, --json 에 실수로 남아 있는 옛 channel
# 이 대상을 바꿔 버리면 안 된다.
# ─────────────────────────────────────────────────────────────────────────────

# 대상 지정. 아래 두 갈래가 똑같이 쓰므로 한 번만 만든다.
target="$(jq -n \
  --arg channel "$channel" \
  --arg thread  "$thread_ts" \
  --arg update  "$update_ts" '
    { channel: $channel }
    # chat.update 는 고칠 대상을 ts 로 받는다. thread_ts 와 이름이 다르다.
    + (if $update != "" then { ts: $update }        else {} end)
    + (if $thread != "" then { thread_ts: $thread } else {} end)
  ')"

if [ -n "$json_input" ]; then
  case "$json_input" in
    '{'*) raw="$json_input" ;;
    '-')  raw="$(cat)" ;;
    *)
      [ -f "$json_input" ] || { warn "--json 파일이 없다: $json_input"; give_up; }
      raw="$(cat -- "$json_input")"
      ;;
  esac

  # **보내기 전에 검사한다.** 깨진 JSON 을 그대로 부치면 슬랙은 invalid_arguments 라고만
  # 답하는데, 그 메시지로는 어디가 깨졌는지 알 수 없다. jq 는 위치를 짚어 준다.
  if ! error="$(printf '%s' "$raw" | jq empty 2>&1)"; then
    warn "--json 이 올바른 JSON 이 아니다: $error"
    give_up
  fi

  payload="$(printf '%s' "$raw" | jq --argjson target "$target" '. + $target')"
else
  # 슬랙 text 는 넉넉하지만(4만자), 스레드에 통째로 쏟아 부으면 읽을 수가 없다. 로그를
  # 그대로 싣는 호출이 있으므로 여기서 자른다. 잘렸다는 사실은 남긴다 — 조용히 사라지면
  # "여기까지 밖에 안 나왔네" 를 로그가 짧아서라고 오해한다.
  MAX_TEXT=2800
  if [ "${#text}" -gt "$MAX_TEXT" ]; then
    text="${text:0:$MAX_TEXT}
…(잘림. 전체는 CI 로그에)"
  fi

  # 제목만 굵게 감싼다. 내용의 mrkdwn 은 **부르는 쪽의 것이라** 손대지 않는다 —
  # 여기서 `<`·`>` 를 막으면 `<url|텍스트>` 링크 문법까지 죽는다. 값에 남의 입력을
  # 섞을 때만 부르는 쪽이 escape 한다.
  payload="$(jq -n --argjson target "$target" --arg title "$title" --arg text "$text" '
    $target + { text: (
      if   $title != "" and $text != "" then "*" + $title + "*\n" + $text
      elif $title != ""                 then "*" + $title + "*"
      else $text
      end
    ) }
  ')"
fi

[ -n "$payload" ] || { warn '페이로드를 만들지 못했다.'; give_up; }

# ─────────────────────────────────────────────────────────────────────────────
# 전송
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "$update_ts" ]; then
  method='chat.update'
else
  method='chat.postMessage'
fi

# -m 5: 배포를 붙잡고 있으면 안 된다. --retry 는 5xx·연결 실패에만 걸린다.
#
# **토큰은 헤더로만 넘긴다.** 인자로 주면 프로세스 목록에 노출된다.
response="$(curl -sS -m 5 --retry 2 --retry-connrefused \
  -X POST "https://slack.com/api/$method" \
  -H "authorization: Bearer $token" \
  -H 'content-type: application/json; charset=utf-8' \
  --data-binary "$payload" 2>&1)"
curl_status=$?

if [ $curl_status -ne 0 ]; then
  # 응답에 토큰이 실릴 일은 없지만, 혹시 모를 에코를 위해 값을 지우고 찍는다.
  warn "요청 실패 (curl $curl_status): ${response//$token/***}"
  give_up
fi

# **슬랙은 실패해도 HTTP 200 을 준다.** 본문의 ok 를 봐야 한다.
if [ "$(printf '%s' "$response" | jq -r '.ok // false' 2>/dev/null)" != 'true' ]; then
  error="$(printf '%s' "$response" | jq -r '.error // "unknown"' 2>/dev/null)"
  warn "$method 실패: $error"
  # 흔한 것 몇 개는 무엇을 고쳐야 하는지까지 알려준다. 슬랙의 에러 코드만 보고는
  # 토큰 문제인지 채널 문제인지 스코프 문제인지 구분되지 않는다.
  case "$error" in
    not_in_channel)    warn "  봇을 채널($channel)에 초대할 것." ;;
    channel_not_found)
      warn "  SLACK_CHANNEL($channel) 이 맞는지 볼 것."
      # 실제로 여기 걸렸다. postMessage 는 `#이름` 을 받아 주는데 update 는 안 받는다.
      [ "$method" = 'chat.update' ] && warn '  **chat.update 는 채널 id(C…)만 받는다.** `#이름` 은 거절된다.'
      ;;
    invalid_auth | not_authed)
                       warn '  SLACK_BOT_TOKEN 이 잘못됐다. xoxb- 로 시작하는 봇 토큰이어야 한다.' ;;
    missing_scope)     warn '  봇에 chat:write 스코프를 주고 워크스페이스에 다시 설치할 것.' ;;
    invalid_blocks | invalid_arguments)
                       warn '  --json 의 블록 구조를 볼 것. Block Kit Builder 로 붙여 보면 빠르다.' ;;
  esac
  give_up
fi

# chat.update 는 고친 메시지의 ts 를 그대로 돌려준다 — 답글의 부모로 계속 쓸 수 있다.
printf '%s' "$(printf '%s' "$response" | jq -r '.ts // ""')"
exit 0
