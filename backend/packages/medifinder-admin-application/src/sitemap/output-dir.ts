import path from 'node:path';

/** 디렉터리 이름에 그대로 들어가므로 경로를 벗어날 수 있는 글자는 막는다. */
const SAFE_ENV = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 산출물이 놓이는 디렉터리. `--out` 이 가리키는 곳 **아래에 환경별로 따로** 만든다.
 *
 *   --out ./out  +  appEnv=production  →  ./out/medifinder_production_sitemap
 *
 * 환경을 이름에 박는 이유는 섞이면 알아챌 방법이 없기 때문이다. develop 으로 만든 것을
 * 운영 버킷에 올려도 파일 이름은 똑같아서, 올라간 뒤에야 develop URL 이 들어 있는 것을 안다.
 */
export function outputDir(base: string, appEnv: string): string {
  if (!SAFE_ENV.test(appEnv)) {
    throw new Error(`Invalid app env "${appEnv}". Use lowercase letters, digits and hyphens.`);
  }
  return path.join(path.resolve(base), `medifinder_${appEnv}_sitemap`);
}
