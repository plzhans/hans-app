import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createConfigSource,
  envNameOf,
  requireSettings,
} from './config-source';
import type { ConfigSource } from './config-source';
import { APP_ENVS } from './env';
import type { AppEnv } from './env';

/**
 * 설정 로딩은 **부팅 때 한 번 도는 코드라 깨져도 늦게 안다.** 이름 충돌처럼 배포에서야
 * 드러나는 것이 있어 CI 가 대신 본다.
 *
 * 임시 워크스페이스를 만들어 진짜 진입점(createConfigSource)을 그대로 부른다 —
 * 내부 함수를 꺼내 시험하면 실제로 쓰이는 조립 순서를 못 본다.
 */

/** .env 파일은 읽지 않는다. 테스트가 process.env 를 직접 세운다(머신마다 다르면 안 된다). */
const noEnvFiles = (): unknown => ({});

const REAL_CONFIG_DIR = __dirname;

let workspace: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = process.env;
  process.env = { ...originalEnv };

  workspace = mkdtempSync(join(tmpdir(), 'hansapp-config-'));
  // findRootDir 이 찾는 마커. 이게 있어야 설정을 이 임시 워크스페이스에서 찾는다.
  writeFileSync(join(workspace, 'pnpm-workspace.yaml'), '');
  mkdirSync(join(workspace, 'config'));
});

afterEach(() => {
  process.env = originalEnv;
  rmSync(workspace, { recursive: true, force: true });
});

function writeConfig(name: string, yaml: string): void {
  writeFileSync(join(workspace, 'config', `${name}.yaml`), yaml);
}

function load(env: AppEnv = 'develop'): ConfigSource {
  return createConfigSource(workspace, env, noEnvFiles);
}

describe('envNameOf — 경로에서 환경변수 이름 계산', () => {
  it.each([
    ['auth.jwt.secret', 'AUTH_JWT_SECRET'],
    ['database.logUrl', 'DATABASE_LOG_URL'],
    ['apps-api.web.sslCertificateKey', 'APPS_API_WEB_SSL_CERTIFICATE_KEY'],
    ['llm.anthropic.apiKey', 'LLM_ANTHROPIC_API_KEY'],
    ['appSecretEncryption.v1', 'APP_SECRET_ENCRYPTION_V1'],
    ['redis', 'REDIS'],
  ])('%s → %s', (path, name) => {
    expect(envNameOf(path)).toBe(name);
  });
});

describe('환경변수 오버레이', () => {
  it('yaml 값을 같은 이름의 환경변수가 덮는다', () => {
    writeConfig('config.develop', 'auth:\n  jwt:\n    secret: from-yaml\n');
    process.env.AUTH_JWT_SECRET = 'from-env';

    expect(load().getString('auth.jwt.secret')).toBe('from-env');
  });

  it('환경변수가 없으면 yaml 값이 남는다', () => {
    writeConfig('config.develop', 'auth:\n  jwt:\n    secret: from-yaml\n');

    expect(load().getString('auth.jwt.secret')).toBe('from-yaml');
  });

  it('빈 문자열도 값이다 — yaml 값으로 되돌아가지 않는다', () => {
    // TLS 를 끄는 방법이 이것이다. 빈값을 미설정과 같이 보면 그 의사를 표현할 길이 없다.
    writeConfig(
      'config.develop',
      'apps-api:\n  web:\n    sslCertificate: config/ssl/fullchain.pem\n',
    );
    process.env.APPS_API_WEB_SSL_CERTIFICATE = '';

    expect(load().getValue('apps-api.web.sslCertificate')).toBe('');
  });

  it('리스트는 콤마 문자열로 덮는다', () => {
    writeConfig(
      'config.develop',
      'auth:\n  jwt:\n    allowedIssuers:\n      - https://a\n      - https://b\n',
    );
    process.env.AUTH_JWT_ALLOWED_ISSUERS = 'https://c, https://d';

    expect(load().getStringArray('auth.jwt.allowedIssuers')).toEqual([
      'https://c',
      'https://d',
    ]);
  });

  it('섹션(객체)은 통째로 못 덮는다', () => {
    writeConfig('config.develop', 'auth:\n  jwt:\n    secret: from-yaml\n');
    process.env.AUTH_JWT = '섹션을 문자열로 갈아치우려는 시도';

    expect(load().getValue('auth.jwt')).toEqual({ secret: 'from-yaml' });
  });

  it('트리를 직접 순회하는 소비자도 덮인 값을 본다', () => {
    // parseSecretBoxKeys 처럼 섹션을 통째로 받아 자기가 도는 자리가 있다. 읽기 시점에만
    // 덮으면 그런 자리는 환경변수를 못 본 채 지나간다.
    writeConfig('config.develop', 'appSecretEncryption:\n  v1: from-yaml\n');
    process.env.APP_SECRET_ENCRYPTION_V1 = 'from-env';

    expect(load().getValue('appSecretEncryption')).toEqual({ v1: 'from-env' });
  });
});

describe('${} 자리표시자', () => {
  it('${VAR} 를 env 로 치환한다', () => {
    writeConfig('config.develop', 'redis:\n  url: ${REDIS_URL}\n');
    process.env.REDIS_URL = 'redis://host:6379';

    expect(load().getString('redis.url')).toBe('redis://host:6379');
  });

  it('${VAR:기본값} 은 키가 없을 때만 기본값을 쓴다', () => {
    writeConfig('config.develop', 'mail:\n  smtp:\n    port: ${SMTP:587}\n');

    expect(load().getNumber('mail.smtp.port')).toBe(587);
  });

  it('키가 있고 값이 비면 기본값이 아니라 빈 문자열이다', () => {
    writeConfig('config.develop', 'mail:\n  smtp:\n    port: ${SMTP:587}\n');
    process.env.SMTP = '';

    expect(load().getValue('mail.smtp.port')).toBe('');
  });

  it('bash 문법 ${VAR:-기본값} 은 부팅을 거부한다', () => {
    // `-` 가 기본값의 첫 글자로 먹혀 조용히 틀린 값이 되는 것을 막는다.
    writeConfig('config.develop', 'redis:\n  url: ${REDIS_URL:-x}\n');

    expect(() => load()).toThrow(/bash 문법/);
  });

  it('경로 이름 오버라이드가 자리표시자보다 이긴다', () => {
    writeConfig('config.develop', 'juso:\n  serviceKey: ${KRGO_JUSO_KEY}\n');
    process.env.KRGO_JUSO_KEY = '자리표시자로 들어온 값';
    process.env.JUSO_SERVICE_KEY = '경로로 들어온 값';

    expect(load().getString('juso.serviceKey')).toBe('경로로 들어온 값');
  });
});

describe('yaml 에 없는 경로', () => {
  it('환경변수만으로 값이 들어온다', () => {
    // Spring 이 yaml 에 없는 프로퍼티도 env 로 받는 것과 같다.
    writeConfig('config.develop', 'llm:\n  timeoutSec: 30\n');
    process.env.LLM_OPENAI_BASE_URL = 'https://vllm.internal/v1';

    expect(load().getString('llm.openai.baseUrl')).toBe(
      'https://vllm.internal/v1',
    );
  });

  it('섹션 밑에서도 마찬가지다', () => {
    writeConfig('config.develop', 'llm:\n  timeoutSec: 30\n');
    process.env.LLM_OPENAI_BASE_URL = 'https://vllm.internal/v1';

    expect(
      load().getSection('llm').getSection('openai').getString('baseUrl'),
    ).toBe('https://vllm.internal/v1');
  });

  it('환경변수도 없으면 기본값으로 떨어진다', () => {
    writeConfig('config.develop', 'llm:\n  timeoutSec: 30\n');

    expect(load().getStringOrDefault('llm.openai.baseUrl', '(없음)')).toBe(
      '(없음)',
    );
  });
});

describe('섹션', () => {
  const yaml = 'auth:\n  jwt:\n    secret: from-yaml\n';

  it('환경변수 이름을 루트 기준 절대 경로로 계산한다', () => {
    writeConfig('config.develop', yaml);
    process.env.AUTH_JWT_SECRET = 'from-env';
    // 섹션 기준으로 이름을 계산하면 이 값들이 잡힌다. 잡히면 안 된다.
    process.env.JWT_SECRET = '섹션 기준 이름';
    process.env.SECRET = '잎 이름';

    const cfg = load();
    expect(cfg.getSection('auth').getSection('jwt').getString('secret')).toBe(
      'from-env',
    );
    expect(cfg.getSection('auth').getString('jwt.secret')).toBe('from-env');
    expect(cfg.getSection('auth:jwt').getString('secret')).toBe('from-env');
    expect(cfg.getString('auth.jwt.secret')).toBe('from-env');
  });

  it('같은 섹션을 다시 만들지 않는다', () => {
    writeConfig('config.develop', yaml);
    const auth = load().getSection('auth');

    expect(auth.getSection('jwt')).toBe(auth.getSection('jwt'));
  });

  it('없는 섹션을 열어도 터지지 않는다', () => {
    writeConfig('config.develop', yaml);

    expect(
      load().getSection('nope.nothing').getStringOrDefault('x', '(기본값)'),
    ).toBe('(기본값)');
  });

  it('끝값을 섹션으로 열어도 터지지 않는다', () => {
    writeConfig('config.develop', yaml);

    expect(
      load().getSection('auth.jwt.secret').getStringOrDefault('x', '(기본값)'),
    ).toBe('(기본값)');
  });
});

describe('환경변수 이름 충돌', () => {
  it('두 경로가 같은 이름으로 접히면 부팅을 거부한다', () => {
    // `apps.api.port` 와 `apps-api.port` 는 둘 다 APPS_API_PORT 다. 환경변수로 구별할
    // 방법이 없으므로 값이 주입되기를 기다리지 않고 설정을 읽는 순간 잡는다.
    writeConfig(
      'config.develop',
      'apps:\n  api:\n    port: 1\napps-api:\n  port: 2\n',
    );

    expect(() => load()).toThrow(/APPS_API_PORT/);
  });

  it('환경변수가 실제로 없어도 거부한다', () => {
    writeConfig(
      'config.develop',
      'apps:\n  api:\n    port: 1\napps-api:\n  port: 2\n',
    );
    delete process.env.APPS_API_PORT;

    expect(() => load()).toThrow(/같은 환경변수 이름/);
  });
});

describe('yaml 병합', () => {
  it('config.yaml 위에 config.<환경>.yaml 이 이긴다', () => {
    // 컨테이너는 환경 이름 없는 config.yaml 로 마운트받고, 로컬은 환경별 파일을 쓴다.
    writeConfig(
      'config',
      'apps-api:\n  name: base\n  externalUrl: https://base\n',
    );
    writeConfig('config.develop', 'apps-api:\n  name: develop\n');

    const cfg = load();
    expect(cfg.getString('apps-api.name')).toBe('develop');
    // 깊은 병합이라 덮이지 않은 형제 키는 살아 있어야 한다.
    expect(cfg.getString('apps-api.externalUrl')).toBe('https://base');
  });

  it('config.<환경>.local.yaml 이 가장 세다', () => {
    // .env.<환경>.local 과 같은 자리다 — 개인 오버라이드라 커밋하지 않는다(.gitignore).
    writeConfig(
      'config',
      'apps-api:\n  name: base\n  externalUrl: https://base\n',
    );
    writeConfig('config.develop', 'apps-api:\n  name: develop\n');
    writeConfig('config.develop.local', 'apps-api:\n  name: 내것\n');

    const cfg = load();
    expect(cfg.getString('apps-api.name')).toBe('내것');
    // 덮지 않은 값은 아래 두 장에서 그대로 올라온다.
    expect(cfg.getString('apps-api.externalUrl')).toBe('https://base');
  });

  it('환경변수는 config.<환경>.local.yaml 보다도 세다', () => {
    // 오버레이(4단계)는 yaml 을 다 합친 뒤에 얹힌다 — 층이 늘어도 그 순서는 안 바뀐다.
    writeConfig('config.develop.local', 'apps-api:\n  name: 내것\n');
    process.env.APPS_API_NAME = 'env';

    expect(load().getString('apps-api.name')).toBe('env');
  });

  it('설정 파일이 하나도 없으면 부팅을 거부한다', () => {
    expect(() => load()).toThrow(/설정 파일이 없다/);
  });
});

describe('값 읽기', () => {
  it('필수 설정이 없으면 절대 경로를 찍는다', () => {
    // 섹션 기준 이름(`secret`)만 찍히면 어느 줄을 고쳐야 하는지 알 수 없다.
    writeConfig('config.develop', 'auth:\n  jwt:\n    secret:\n');

    expect(() =>
      load().getSection('auth').getSection('jwt').getString('secret'),
    ).toThrow('필수 설정이 없다: auth.jwt.secret');
  });

  it('숫자가 아니면 던진다', () => {
    writeConfig('config.develop', 'apps-api:\n  web:\n    port: 삼천\n');

    expect(() => load().getNumber('apps-api.web.port')).toThrow(
      /apps-api.web.port 는 숫자여야 한다/,
    );
  });

  it('환경변수로 들어온 문자열도 타입으로 읽는다', () => {
    writeConfig(
      'config.develop',
      'auth:\n  cookieSecure: true\n  otp:\n    ttlSec: 600\n',
    );
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_OTP_TTL_SEC = '900';

    const cfg = load();
    expect(cfg.getBool('auth.cookieSecure')).toBe(false);
    expect(cfg.getNumber('auth.otp.ttlSec')).toBe(900);
  });

  it('기간 문자열을 초로 바꾼다', () => {
    writeConfig(
      'config.develop',
      'auth:\n  jwt:\n    accessTokenExpiresIn: 1h\n',
    );

    expect(load().getDurationSec('auth.jwt.accessTokenExpiresIn')).toBe(3600);
  });
});

describe('실제 설정 파일', () => {
  /*
    여기서 잡는 것: yaml 문법 오류, bash 자리표시자, **환경변수 이름 충돌**.

    충돌은 설정을 읽는 순간에만 드러나므로 이 테스트가 없으면 배포에서 처음 본다.
    값은 .env 에 있어 CI 에 없지만, 위 셋은 값과 무관하게 파일만으로 판정된다.
  */
  it.each(APP_ENVS)('config.%s.yaml 이 예외 없이 로드된다', (env) => {
    const cfg = createConfigSource(REAL_CONFIG_DIR, env, noEnvFiles);

    expect(cfg.env).toBe(env);
  });
});

describe('requireSettings — 필수 설정 방어', () => {
  it('빠진 것을 한 번에 다 알린다', () => {
    writeConfig('config.develop', 'auth:\n  jwt:\n    secret: s\n');

    expect(() =>
      requireSettings(load(), [
        'auth.jwt.secret',
        'llm.answerSigningKey',
        'appSecretEncryption.v1',
      ]),
    ).toThrow(/llm\.answerSigningKey[\s\S]*appSecretEncryption\.v1/);
  });

  it('빈 문자열도 없는 것으로 본다', () => {
    // 시크릿을 빈값으로 두는 것은 끄겠다는 뜻이 아니라 실수다.
    writeConfig('config.develop', "auth:\n  jwt:\n    secret: ''\n");

    expect(() => requireSettings(load(), ['auth.jwt.secret'])).toThrow(
      /AUTH_JWT_SECRET/,
    );
  });

  it('다 있으면 조용히 지나간다', () => {
    writeConfig('config.develop', 'auth:\n  jwt:\n    secret: s\n');

    expect(() => requireSettings(load(), ['auth.jwt.secret'])).not.toThrow();
  });
});
