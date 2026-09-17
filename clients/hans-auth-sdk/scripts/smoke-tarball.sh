#!/usr/bin/env bash
#
# 만들어진 tarball 을 **실제로 설치해서** import 와 타입이 풀리는지 본다.
#
# 레포 안에서는 medifinder 가 link: 로 src 를 직접 컴파일해 쓰고, 배포본은 dist 를 쓴다.
# 그래서 dist 는 이 검사 전까지 아무도 써 보지 않은 코드다 — exports 를 잘못 적거나
# files 에서 빠뜨려도 medifinder CI 는 초록이다.
#
# 소비자가 node16·nodenext 로 타입을 풀 수도 있어 그 모드로 검사한다. 상대 import 에
# .js 를 붙여 둔 것이 여기서 확인된다.
#
#   사용법:  scripts/smoke-tarball.sh <tarball 경로>
#
# 릴리스(확인)와 배포(npm-publish)가 같은 파일을 부른다. 확인에서 통과한 것이 배포에서
# 깨지면 안 되므로, 검사 내용이 두 벌로 갈리지 않게 여기 모아 둔다.
set -euo pipefail

tarball="${1:?tarball 경로를 넘길 것}"
[ -f "$tarball" ] || { echo "❌ tarball 이 없다: $tarball" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"

echo '{"name":"smoke","version":"1.0.0","type":"module","private":true}' > package.json
npm install "$tarball" typescript@^5.9.3 --no-audit --no-fund

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["smoke.ts"]
}
JSON

cat > smoke.ts <<'TS'
import { createAuthClient } from '@hansapp/auth-sdk';
import type { AuthClientConfig, JwtStatus } from '@hansapp/auth-sdk';
// 네이티브 어댑터는 서브패스로 갈라져 있다. 여기가 막히면 exports 가 빠진 것이다.
import { capacitorStorage } from '@hansapp/auth-sdk/capacitor';

const client = createAuthClient({} as AuthClientConfig);
const status: JwtStatus = 'valid' as JwtStatus;
console.log(client, status, typeof capacitorStorage);
TS

./node_modules/.bin/tsc -p tsconfig.json

# 의존성이 딸려 오면 안 된다. 웹 전용 앱이 Capacitor 를 받는 일이 없어야 한다.
if [ -d node_modules/@capacitor ]; then
  echo "❌ @capacitor 가 함께 설치됐다. SDK 가 의존성을 들고 있다." >&2
  exit 1
fi

echo "  스모크 통과 — dist 로 import·타입이 풀리고, 딸려 오는 의존성이 없다"
