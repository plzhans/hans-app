#!/usr/bin/env bash
#
# config/ 아래 암호화된 env 를 sops 로 복호화한다.
# 대상: .env.enc, .env.<환경>.enc(.env.develop.enc …), local-deploy-<환경>.env.enc.
# 결과: .enc 를 뗀 평문 (.env.develop.enc → .env.develop). 평문은 gitignore 라 커밋되지 않는다.
set -euo pipefail

find . -type f -not -path '*/node_modules/*' \
  \( -name '.env*.enc' -o -name '*.env.enc' \) |
while IFS= read -r file; do
  output="${file%.enc}"
  echo "Decrypting: $file -> $output"
  sops --decrypt "$file" > "$output"
done

# JWT 서명 개인키(*.key.enc). binary 모드로 복호화한다(env-encrypt.sh 의 짝).
find config -type f -name '*.key.enc' 2>/dev/null |
while IFS= read -r file; do
  output="${file%.enc}"
  echo "Decrypting (binary): $file -> $output"
  sops --decrypt --input-type binary --output-type binary "$file" > "$output"
done

echo "Done."
