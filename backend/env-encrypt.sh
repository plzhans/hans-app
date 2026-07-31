#!/usr/bin/env bash
#
# config/ 아래 평문 env 를 sops 로 암호화한다. (env-decrypt.sh 의 짝)
# 대상: config/.env, config/.env.<환경>(.env.develop …).
#   제외: *.enc(이미 암호화), *.example(커밋되는 예시), .env.<환경>.local(개인 오버라이드 — 커밋 안 함).
# 결과: 같은 이름 + .enc (.env.develop → .env.develop.enc). 키는 .sops.yaml 이 경로로 고른다.
#
# **config/ 밖은 훑지 않는다.** backend/.env 는 앱 설정이 아니라 deploy.sh 가 읽는 로컬 배포
# 변수 파일이라 .sops.yaml 에 규칙이 없다. 훑으면 "no matching creation rules" 로 죽는다.
set -euo pipefail

# sops 가 실패해도 반쪽짜리 .enc 를 남기지 않는다. 리다이렉트는 파일을 먼저 만들기 때문에
# 그냥 `> "$file.enc"` 로 쓰면 실패 시 0바이트 .enc 가 남고, .enc 는 커밋 대상이라 그대로 올라간다.
encrypt() {
  local src="$1" out="$2" tmp

  # **빈 파일은 암호화하지 않는다.** 평문이 비어 있다는 건 정상 상태가 아니라 사고다 —
  # 복호화가 실패해 리다이렉트가 파일을 0바이트로 만들어 놓은 경우가 대표적이다.
  # 그대로 암호화하면 멀쩡한 .enc 를 빈 내용으로 덮어써 원본이 사라진다.
  if [ ! -s "$src" ]; then
    echo "  ⏭  건너뜀(내용 없음): $src" >&2
    return 0
  fi
  tmp="$(mktemp)"
  if sops --encrypt "${@:3}" "$src" > "$tmp"; then
    mv "$tmp" "$out"
  else
    rm -f "$tmp"
    echo "  ❌ 실패: $src" >&2
    return 1
  fi
}

# **infra/ 도 같이 훑는다.** compose 옆의 서비스별 env(infra/<환경>/.env.redis)가 거기 있다 —
# 배포가 compose·redis.conf 와 한 덩어리로 나르는 것들이라 위치를 맞춰 뒀다.
# .sops.yaml 에 ^infra/<환경>/\.env 규칙이 있어야 키가 잡힌다.
find config infra -type f \
  \( -name '.env' -o -name '.env.*' \) \
  ! -name '*.enc' ! -name '*.example' ! -name '.env.*.local' |
while IFS= read -r file; do
  echo "Encrypting: $file -> $file.enc"
  encrypt "$file" "$file.enc"
done

# PEM 자산. JWT 서명키(*.key)와 TLS 인증서·개인키(*.pem, ssl-issue.sh 발급물)가 대상이다.
# config/ 아래만 훑는다(node_modules 등 오염 방지).
# PEM 은 dotenv/json 이 아니므로 binary 모드로 통째 암호화한다.
find config -type f \( -name '*.key' -o -name '*.pem' \) ! -name '*.enc' 2>/dev/null |
while IFS= read -r file; do
  echo "Encrypting (binary): $file -> $file.enc"
  encrypt "$file" "$file.enc" --input-type binary --output-type binary
done

echo "Done."
