#!/usr/bin/env bash
#
# config/ 아래 평문 env 를 sops 로 암호화한다. (env-decrypt.sh 의 짝)
# 대상: .env, .env.<환경>(.env.develop …), local-deploy-<환경>.env.
#   제외: *.enc(이미 암호화), *.example(커밋되는 예시), .env.<환경>.local(개인 오버라이드 — 커밋 안 함).
# 결과: 같은 이름 + .enc (.env.develop → .env.develop.enc). 키는 .sops.yaml 이 경로로 고른다.
set -euo pipefail

find . -type f -not -path '*/node_modules/*' \
  \( -name '.env' -o -name '.env.*' -o -name '*.env' \) \
  ! -name '*.enc' ! -name '*.example' ! -name '.env.*.local' |
while IFS= read -r file; do
  echo "Encrypting: $file -> $file.enc"
  sops --encrypt "$file" > "$file.enc"
done

# JWT 서명 개인키(PEM). config/ 아래 *.key 만 대상으로 한다(node_modules 등 오염 방지).
# PEM 은 dotenv/json 이 아니므로 binary 모드로 통째 암호화한다.
find config -type f -name '*.key' ! -name '*.enc' 2>/dev/null |
while IFS= read -r file; do
  echo "Encrypting (binary): $file -> $file.enc"
  sops --encrypt --input-type binary --output-type binary "$file" > "$file.enc"
done

echo "Done."
