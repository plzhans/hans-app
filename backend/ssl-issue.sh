#!/usr/bin/env bash
#
# Cloudflare Origin CA 인증서를 발급해 config/<환경>/ssl/ 에 놓는다.
#
#   backend/ssl-issue.sh develop    develop-api.plzhans.com
#   backend/ssl-issue.sh production api.plzhans.com
#
# **개인키는 이 머신에서 만들고 CSR 만 Cloudflare 로 보낸다.** 대시보드 발급은 Cloudflare 가
# 개인키를 만들어 화면에 한 번만 보여주는 방식이라, 그 화면을 놓치면 재발급뿐이고 키가
# 남의 손을 한 번 거친다. 여기서는 개인키가 이 디렉터리 밖으로 나가지 않는다.
#
# **환경마다 따로 발급한다.** `*.plzhans.com` 하나로 퉁치면 develop 과 production 이 같은
# 개인키를 공유하게 되어, 한쪽이 뚫리면 다른 쪽도 같이 뚫린다.
#
# [이 인증서는 Cloudflare 만 신뢰한다]
# 브라우저로 오리진에 직접 붙으면 신뢰 오류가 난다 — 정상이다. CF 를 거치지 않는 경로가
# 있다면 그 경로는 이 인증서로 감당할 수 없다.
#
# [인증] 둘 중 하나를 환경변수로 준다
#   CLOUDFLARE_API_TOKEN       권장. 스코프를 좁힐 수 있다
#   CLOUDFLARE_ORIGIN_CA_KEY   대시보드 → My Profile → API Tokens → Origin CA Key
#                              **계정의 모든 존에 인증서를 발급할 수 있다.** 파일에 남기지 말 것
#
# [결과]
#   config/<환경>/ssl/privkey.pem     개인키   (gitignore)
#   config/<환경>/ssl/fullchain.pem   인증서   (gitignore)
#
# 이어서 backend/env-encrypt.sh 를 돌리면 .enc 가 생기고, 커밋되는 건 그것뿐이다.
# 배포는 ci-deploy.sh 가 .enc 를 풀어 서버로 나른다 — jwt 키와 같은 경로를 탄다.
set -euo pipefail

AREA_DIR="$(cd "$(dirname "$0")" && pwd)" # <repo>/backend

usage() {
  sed -n '3,7p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

APP_ENV="${1:-}"
shift || true
hostnames=("$@")
[ -n "$APP_ENV" ] && [ ${#hostnames[@]} -gt 0 ] || usage

case "$APP_ENV" in
  develop | production) ;;
  *) echo "❌ 환경은 develop | production 이어야 한다 (받은 값: $APP_ENV)" >&2; exit 2 ;;
esac

for c in openssl curl jq; do
  command -v "$c" >/dev/null 2>&1 || { echo "❌ $c 가 필요하다." >&2; exit 1; }
done

# 토큰이 셸에 없으면 frontend/.env 에서 빌려 온다.
#
# **영역을 넘어 읽는 게 어색해 보이지만, Cloudflare 토큰은 계정 단위지 영역 단위가 아니다.**
# 프론트 배포가 쓰는 것과 같은 계정·같은 존이라, 개발자가 같은 값을 두 군데 적어 두고
# 한쪽만 갱신해 어긋나는 쪽이 더 나쁘다. CI 에서는 이 경로가 없어 그냥 건너뛴다.
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$AREA_DIR/../frontend/.env" ]; then
  CLOUDFLARE_API_TOKEN="$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' "$AREA_DIR/../frontend/.env" | tr -d '"'"'"'' | head -1)"
  [ -n "$CLOUDFLARE_API_TOKEN" ] && auth_source='frontend/.env 의 CLOUDFLARE_API_TOKEN'
fi

# 인증 헤더. 토큰이 있으면 그쪽을 쓴다 — Origin CA Key 는 계정의 모든 존에 통한다.
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  auth_header="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
  auth_source="${auth_source:-CLOUDFLARE_API_TOKEN}"
elif [ -n "${CLOUDFLARE_ORIGIN_CA_KEY:-}" ]; then
  auth_header="X-Auth-User-Service-Key: $CLOUDFLARE_ORIGIN_CA_KEY"
  auth_source='CLOUDFLARE_ORIGIN_CA_KEY'
else
  echo "❌ CLOUDFLARE_API_TOKEN 또는 CLOUDFLARE_ORIGIN_CA_KEY 가 필요하다." >&2
  echo "   Origin CA Key: 대시보드 → My Profile → API Tokens → Origin CA Key" >&2
  exit 1
fi

ssl_dir="$AREA_DIR/config/$APP_ENV/ssl"
key="$ssl_dir/privkey.pem"
crt="$ssl_dir/fullchain.pem"

echo
echo "  환경      $APP_ENV"
echo "  호스트명  ${hostnames[*]}"
echo "  위치      config/$APP_ENV/ssl/"
echo

# 있는 키를 말없이 덮으면 서버에 깔린 인증서와 짝이 안 맞게 된다.
if [ -e "$key" ] && [ -t 0 ]; then
  printf '%s 가 이미 있다. 새로 발급하면 기존 인증서는 못 쓰게 된다. 계속할까? [y/N] ' "$key"
  read -r answer
  case "$answer" in y | Y | yes | YES) ;; *) echo "취소했다."; exit 1 ;; esac
fi

mkdir -p "$ssl_dir"

# ─────────────────────────────────────────────────────────────────────────────
# 개인키 + CSR. **여기서 나가는 건 CSR 뿐이다.**
# ─────────────────────────────────────────────────────────────────────────────
# ECDSA P-256. RSA 보다 키가 작고 핸드셰이크가 가볍다.
# genpkey 를 쓰는 이유: ecparam -genkey 는 앞에 EC PARAMETERS 블록을 붙이는데,
# 그걸 못 읽는 파서가 있다. genpkey 는 PKCS#8 로 깔끔하게 나온다.
umask 077
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$key" 2>/dev/null
echo "· 개인키 생성  $key"

# CN 은 형식상 채운다 — Cloudflare 는 아래 hostnames 필드를 본다.
csr="$(openssl req -new -key "$key" -subj "/CN=${hostnames[0]}" -sha256)"

# ─────────────────────────────────────────────────────────────────────────────
# 서명 요청
# ─────────────────────────────────────────────────────────────────────────────
# requested_validity 는 7·30·90·365·730·1095·5475 중 하나. 5475 = 15년.
# 갱신 자동화가 없는 구성이라 최대값을 쓴다.
body="$(jq -n --arg csr "$csr" --argjson hosts "$(printf '%s\n' "${hostnames[@]}" | jq -R . | jq -s .)" \
  '{hostnames: $hosts, requested_validity: 5475, request_type: "origin-ecc", csr: $csr}')"

resp="$(curl -sS -X POST 'https://api.cloudflare.com/client/v4/certificates' \
  -H "$auth_header" -H 'Content-Type: application/json' -d "$body")"

if [ "$(jq -r '.success' <<<"$resp")" != 'true' ]; then
  echo "❌ 발급 실패:" >&2
  jq -r '.errors[]? | "  \(.code) \(.message)"' <<<"$resp" >&2
  codes="$(jq -r '.errors[]?.code' <<<"$resp")"

  # 에러 코드만 던지면 대시보드에서 뭘 눌러야 할지 알 수 없다. 무엇을 어디서 고치는지까지 적는다.
  case " $codes " in
    *' 1016 '* | *' 9109 '* | *' 10000 '*)
      echo >&2
      echo "   토큰은 맞는데(출처: $auth_source) 인증서 발급 권한이 없다." >&2
      echo "   **새 토큰을 만들 필요는 없다.** 쓰던 토큰에 권한 한 줄만 추가하면 된다:" >&2
      echo >&2
      echo "     대시보드 → My Profile → API Tokens → 해당 토큰 Edit" >&2
      echo "     Permissions      Zone | SSL and Certificates | Edit   ← 추가" >&2
      echo "     Zone Resources   Include | Specific zone | ${hostnames[0]#*.}" >&2
      echo >&2
      echo "   저장하고 이 명령을 그대로 다시 돌리면 된다." >&2
      ;;
    *' 1100 '* | *' 1101 '*)
      echo >&2
      echo "   호스트명이 이 계정의 존에 속하지 않는다. 존이 Cloudflare 에 등록돼 있는지," >&2
      echo "   토큰의 Zone Resources 가 그 존을 포함하는지 확인할 것: ${hostnames[*]}" >&2
      ;;
  esac

  rm -f "$key" # 짝 없는 개인키를 남기지 않는다
  exit 1
fi

jq -r '.result.certificate' <<<"$resp" > "$crt"
echo "· 인증서 수신  $crt"

echo
openssl x509 -in "$crt" -noout -subject -dates -ext subjectAltName 2>/dev/null | sed 's/^/  /'
echo
echo "다음:"
echo "  1) backend/env-encrypt.sh          .enc 생성 (커밋 대상은 이것뿐)"
echo "  2) config.$APP_ENV.yaml 의 apps-api.web.sslCertificate / sslCertificateKey 에 경로 기입"
echo "  3) Cloudflare SSL/TLS 모드를 Full (strict) 로"
