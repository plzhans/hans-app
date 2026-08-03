#!/usr/bin/env bash
#
# 서버로 나갈 설정을 한 곳에 모은다. **서버를 건드리지 않는다.**
#
#   APP_ENV=develop scripts/deploy/stage/config-bundle.sh
#   ls -R .deploy-work/develop/bundle
#
# 접속도 전송도 하지 않으므로 **VPN 없이 혼자 돌려볼 수 있다.** 무엇이 배포될지 눈으로
# 확인하는 것이 배포를 실제로 돌리지 않고도 가능해진다 — 예전에는 이걸 보려면 배포를
# 끝까지 돌리는 수밖에 없었다.
#
# [서버로 나가는 것은 전부 설정이다]
# 코드는 이미지로 간다. 이미지는 환경을 모르고(APP_ENV 를 런타임에 읽는다), 그래서
# 환경별로 달라지는 것은 여기 모이는 파일들뿐이다.
#
#   bundle/
#   ├── docker-compose.yml          infra/<환경>/                      평문
#   ├── redis/redis.conf            infra/<환경>/config/redis/         평문
#   ├── .env.redis                ← infra/<환경>/.env.redis.enc        sops
#   └── config/
#       ├── config.<환경>.yaml      config/                            평문
#       ├── .env.<환경>           ← config/.env.<환경>.enc             sops
#       └── <환경>/…              ← config/<환경>/*.enc                sops
#
# `.env`(IMAGE_TAG·APP_UID·APP_GID)는 여기 없다 — **서버가 자기 uid 를 답해야** 하므로
# config-upload.sh 가 서버에서 만든다. 로컬에서 계산하면 배포하는 사람의 번호가 박힌다.
#
# [환경변수]
#   APP_ENV               develop | production
#   AGE_SECRET_KEY_FILE   (선택) sops 복호화용 age 키. **경로 또는 내용**
#                         로컬은 기본 경로(~/.config/sops/age/keys.txt)에 이미 있어 보통 비운다
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

stage_start '설정 번들 만들기'

command -v sops >/dev/null || die 'sops 가 없다. 복호화는 배포하는 쪽에서 한다.'

bundle="$DEPLOY_WORK/bundle"

# **매번 통째로 새로 만든다.** 남은 파일이 섞이면 지운 설정이 계속 배포된다.
rm -rf "$bundle"
mkdir -p "$bundle/config" "$bundle/redis"

# ─────────────────────────────────────────────────────────────────────────────
# age 키 — 값을 볼 수 없는 곳에서 오므로 모양부터 본다
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "${AGE_SECRET_KEY_FILE:-}" ]; then
  materialize "$AGE_SECRET_KEY_FILE" "$DEPLOY_WORK/age.key"
  export SOPS_AGE_KEY_FILE="$DEPLOY_WORK/age.key"

  # **키 파일의 모양을 먼저 본다.** 값을 볼 수 없는 곳(GitHub Secrets)에서 온 것이라,
  # 잘못 들어가 있어도 sops 는 "복호화 실패" 라고만 말한다. 그 메시지로는 키가 틀린
  # 것인지 파일이 깨진 것인지 구분되지 않아, 한참을 엉뚱한 데서 찾게 된다.
  #
  # 값 자체는 절대 찍지 않는다 — 형태만 센다.
  if ! grep -qE '^AGE-SECRET-KEY-1[A-Z0-9]+$' "$DEPLOY_WORK/age.key"; then
    echo "❌ age 키 파일에 개인키 줄이 없다." >&2
    echo "   AGE_SECRET_KEY_FILE 에 **키 파일 내용 전체**가 들어가야 한다." >&2
    echo >&2
    echo "   받은 것의 모양:" >&2
    awk '{
      if ($0 ~ /^#/)                     printf "     %d: 주석\n", NR;
      else if ($0 ~ /^AGE-SECRET-KEY-1/) printf "     %d: 개인키(형식 어긋남, %d자)\n", NR, length($0);
      else if ($0 ~ /^age1/)             printf "     %d: **공개키** — 개인키가 아니다\n", NR;
      else if ($0 == "")                 printf "     %d: 빈 줄\n", NR;
      else                               printf "     %d: 알 수 없음 (%d자, 앞 4자 \"%s\")\n", NR, length($0), substr($0,1,4);
    }' "$DEPLOY_WORK/age.key" >&2
    echo >&2
    echo "   고치는 법:" >&2
    echo "     gh secret set AGE_SECRET_KEY_FILE --env $APP_ENV < ~/.config/sops/age/<키파일>.txt" >&2
    exit 1
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 복호화 규칙
#
# **env 는 `$` 를 `$$` 로 이스케이프한다.**
#
# docker compose 는 env_file 값을 보간한다. 비밀번호에 $ 가 있으면 그 뒤를 변수 이름으로
# 읽어 통째로 지운다 — 운영 DATABASE_URL 이 그렇게 잘려 "invalid port number" 로 죽었다.
# compose 는 보간 단계에서 $$ 를 $ 하나로 되돌리므로 값이 온전히 도착한다.
#
# `format: raw` 로 보간을 끌 수도 있지만 그것은 **따옴표도 안 벗긴다.** 우리 env 는 값이
# 따옴표로 감싸여 있어 DATABASE_URL 이 '"mysql://…"' 가 되고 prisma 가 거부한다.
#
# **서버 파일에는 $$ 로 남는다.** 비밀번호를 확인하러 그 파일을 열면 실제 값과 달라 보인다는
# 뜻이다 — 레포의 평문(sops 로 푼 것)이 정본이므로 확인은 그쪽에서 한다.
#
# PEM(*.key·*.pem)은 dotenv/json 이 아니라 binary 모드여야 한다 — env-decrypt.sh 와 같은 규칙.
# ─────────────────────────────────────────────────────────────────────────────
decrypt_env() {
  sops --decrypt "$1" | sed 's/\$/$$/g' > "$2"
  chmod 600 "$2"
}

decrypt_asset() {
  case "$1" in
    *.key.enc | *.pem.enc) sops --decrypt --input-type binary --output-type binary "$1" > "$2" ;;
    .env*.enc | */.env*.enc) sops --decrypt "$1" | sed 's/\$/$$/g' > "$2" ;;
    *) sops --decrypt "$1" > "$2" ;;
  esac
  chmod 600 "$2"
}

# ─────────────────────────────────────────────────────────────────────────────
# infra/<환경> — compose 와 그 옆의 것들
# ─────────────────────────────────────────────────────────────────────────────
compose_src="$AREA_DIR/infra/$APP_ENV/docker-compose.yml"
[ -f "$compose_src" ] || die "$compose_src 가 없다."
cp "$compose_src" "$bundle/docker-compose.yml"
echo "  infra/$APP_ENV/docker-compose.yml"

# compose 가 마운트하는 redis 설정. **compose 와 한 몸으로 나른다** — 없으면 컨테이너가
# 뜨다 죽는다.
#
# **config/ 가 아니라 redis/ 밑에 둔다.** config/ 는 배포가 0600·배포계정 소유로 잠그는
# 자리인데 redis 컨테이너는 uid 가 달라(이미지의 redis) 그 안의 파일을 못 읽는다.
# 이 파일에는 시크릿이 없으므로(비밀번호는 .env.redis) 0644 로 따로 놓는다.
redis_conf_src="$AREA_DIR/infra/$APP_ENV/config/redis/redis.conf"
[ -f "$redis_conf_src" ] || die "$redis_conf_src 가 없다."
cp "$redis_conf_src" "$bundle/redis/redis.conf"
chmod 644 "$bundle/redis/redis.conf"
echo "  infra/$APP_ENV/config/redis/redis.conf"

# redis 서비스의 env. 앱 시크릿 뭉치를 통째로 주지 않는 것은, 거기에 DB 접속 문자열·
# JWT 키·슬랙 토큰이 들어 있어 캐시 컨테이너 환경에 번지기 때문이다.
redis_env_src="$AREA_DIR/infra/$APP_ENV/.env.redis.enc"
[ -f "$redis_env_src" ] || die "$redis_env_src 가 없다."
decrypt_env "$redis_env_src" "$bundle/.env.redis"
echo "  infra/$APP_ENV/.env.redis.enc → .env.redis"

# **영숫자만 통과시킨다.** 이 값은 env_file 보간을 거쳐 컨테이너 셸의 인용까지 지난다.
# 중간에 `$`·따옴표·공백이 있으면 어디서 잘렸는지 모른 채 WRONGPASS 만 보게 된다.
redis_password="$(sed -n 's/^REDIS_PASSWORD=//p' "$bundle/.env.redis" | tail -1 | sed 's/^"//; s/"$//')"
[ -n "$redis_password" ] || die "infra/$APP_ENV/.env.redis 에 REDIS_PASSWORD 가 없다."
case "$redis_password" in
  *[!A-Za-z0-9]*) die "REDIS_PASSWORD 는 영숫자만 쓴다 (env_file 보간·셸 인용에 걸린다)." ;;
esac

# ─────────────────────────────────────────────────────────────────────────────
# config/ — 앱 설정
# ─────────────────────────────────────────────────────────────────────────────
# 환경별 yaml. **비밀이 아니라 복호화 대상이 아니지만 같이 나른다** — 이미지에 굽지
# 않기 때문이다(이미지는 환경을 모른다). 컨테이너에서는 config/config.yaml 로 마운트된다.
#
# 이미지에 굽지 않는 대신 배포가 나르므로, **이미지와 설정이 어긋날 수 있다.** 서버의
# yaml 은 배포할 때마다 덮어써지니 레포가 정본이고, 서버에서 직접 고치면 다음 배포가 지운다.
yaml_src="$AREA_DIR/config/config.$APP_ENV.yaml"
[ -f "$yaml_src" ] || die "$yaml_src 가 없다."
cp "$yaml_src" "$bundle/config/config.$APP_ENV.yaml"
chmod 600 "$bundle/config/config.$APP_ENV.yaml"
echo "  config/config.$APP_ENV.yaml (비밀 아님)"

env_enc="$AREA_DIR/config/.env.$APP_ENV.enc"
[ -f "$env_enc" ] || die "$env_enc 가 없다."
decrypt_env "$env_enc" "$bundle/config/.env.$APP_ENV"
echo "  config/.env.$APP_ENV.enc → .env.$APP_ENV"

# 에셋 디렉터리(jwt 키·TLS 인증서 등). **아직 비어 있을 수 있다** — 없다고 실패시키지
# 않는다. 컨테이너는 이 자리를 /app/config/secrets 로 마운트하므로 디렉터리 자체는 있어야 한다.
mkdir -p "$bundle/config/$APP_ENV"
asset_count=0
if [ -d "$AREA_DIR/config/$APP_ENV" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    rel="${f#"$AREA_DIR/config/$APP_ENV/"}"
    out="$bundle/config/$APP_ENV/${rel%.enc}"
    mkdir -p "$(dirname "$out")"
    decrypt_asset "$f" "$out"
    echo "  config/$APP_ENV/$rel → ${rel%.enc}"
    asset_count=$((asset_count + 1))
  done < <(find "$AREA_DIR/config/$APP_ENV" -type f -name '*.enc' | sort)
fi
[ "$asset_count" -eq 0 ] && echo "  config/$APP_ENV/ (암호화된 에셋 없음)"

echo
echo "  번들 $bundle"
du -sh "$bundle" | awk '{print "  크기 " $1}'
