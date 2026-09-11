import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 태그별 생성 파일을 하나로 모으는 배럴을 만든다.
 *
 * orval 은 schemas(모델)에만 index.ts 를 만들고, tags-split 로 나눈 클라이언트에는 안 만든다.
 * 그래서 소비자가 `.../react/healthcare/healthcare` 처럼 태그 경로를 직접 가리켜야 하는데,
 * 그러면 패키지의 공개 표면이 내부 디렉터리 구조가 되어 버린다 — 태그 이름이 바뀌면
 * 소비자 코드가 깨진다.
 *
 * **손으로 적지 않는다.** 스펙에 태그가 하나 늘면 이 목록도 늘어야 하는데, 사람이 관리하면
 * 반드시 낡는다. api:gen 이 orval 뒤에 이걸 돌려서 디렉터리를 읽어 다시 쓴다.
 */
const TARGETS = ['src/generated/fetch', 'src/generated/react'];

for (const target of TARGETS) {
  const tags = readdirSync(target)
    .filter((name) => statSync(join(target, name)).isDirectory())
    .sort();

  const body = tags.map((tag) => `export * from './${tag}/${tag}';`).join('\n');

  writeFileSync(
    join(target, 'index.ts'),
    `// orval 생성물의 배럴. scripts/write-barrels.mjs 가 만든다 — 직접 고치지 마라.\n${body}\n`,
    'utf8',
  );
  console.log(`${target}/index.ts — 태그 ${tags.length}개`);
}
