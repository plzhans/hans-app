/**
 * 서비스 설정 카탈로그. **어떤 설정이 존재하는지는 코드가 소유한다.**
 *
 * DB(env_setting)는 `키 → 암호화된 값` 한 쌍만 들고 있고, 그 키가 무엇이며 어떻게 보여야
 * 하는지는 전부 여기 있다. 그래서 설정을 하나 더하는 일이 **이 파일 한 줄**로 끝난다 —
 * 마이그레이션도, 관리 화면 수정도 없다(화면은 이 카탈로그를 받아 그대로 그린다).
 *
 * 서비스마다 필드가 다른 문제도 여기서 풀린다. 구글은 clientId·clientSecret 두 개고
 * 메일은 일곱 개인데, 화면은 그 차이를 모른 채 목록을 렌더링하기만 한다.
 *
 * **키는 기존 설정 경로 그대로 쓴다**(`mail.smtp.host`). 그래야 DB 로 옮긴 뒤에도
 * yaml·.env 를 뒤져 "이 값이 원래 어디 있었나" 를 찾을 수 있고, 폴백도 같은 경로로 읽는다.
 */

export type SettingFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  /** 값을 절대 내보내지 않는다. 화면에는 "설정됨 ****abcd" 만 간다. */
  | 'secret';

export interface SettingField {
  /** 설정 경로. DB 의 기본키이자 폴백으로 읽을 ConfigSource 경로다. */
  readonly key: string;
  readonly label: string;
  readonly type: SettingFieldType;
  /** type=select 일 때 고를 수 있는 값. */
  readonly options?: readonly string[];
  readonly placeholder?: string;
  /** 입력칸 아래 한 줄 설명. */
  readonly help?: string;
  /**
   * 카드 안에서 다시 갈라 놓을 구역 이름.
   *
   * 한 그룹 안에서도 성격이 갈리는 값이 있다 — 메일의 `from` 은 그냥 헤더에 박히는
   * 문자열이라 서버가 어디에 붙는지와 무관하고, host·port·user 는 접속 정보다.
   * 나란히 두면 "메일이 안 나가는데 어디를 고쳐야 하나" 를 매번 다시 읽어야 한다.
   *
   * 값이 없으면 카드 맨 위에 구분선 없이 놓인다.
   */
  readonly section?: string;
}

/** 화면 메뉴를 가르는 축. 성격이 다른 것을 한 화면에 몰지 않는다. */
export type SettingCategory = 'mail' | 'integration';

/**
 * 키를 발급받는 곳.
 *
 * 키가 만료됐거나 새로 받아야 할 때 매번 검색으로 찾아가게 되는데, 검색 결과 상위에
 * 낚시성 페이지가 섞이는 곳이 있다. 주소를 코드에 박아 두면 그 위험이 없다.
 */
export interface SettingConsole {
  /**
   * 그 사이트가 스스로를 부르는 이름(`Google Cloud Console`).
   *
   * **옮겨 적지 않는다** — 화면의 이름과 도착한 사이트의 제목이 같아야 제대로 왔는지 안다.
   * 이름이 딱히 없는 곳(공공데이터포털 등)은 비워 두면 화면이 "신청" 으로 채운다.
   */
  readonly label?: string;
  readonly url: string;
}

export interface SettingGroup {
  readonly id: string;
  readonly label: string;
  readonly category: SettingCategory;
  readonly help?: string;
  /**
   * 값을 바꿔도 **서버를 다시 띄워야 반영되는** 그룹인가.
   *
   * 소셜 로그인(google·naver·kakao·line)이 그렇다 — passport 전략이 모듈을 만들 때
   * 조건부로 등록돼서, 값만 바뀐다고 전략이 새로 끼워지지 않는다. 화면에서 미리 알려 주지
   * 않으면 "저장했는데 안 되는데요" 가 된다.
   */
  readonly restartRequired?: boolean;
  /** 이 그룹의 키를 발급받는 곳. 화면에서 바로 열 수 있게 띄운다. */
  readonly consoles?: readonly SettingConsole[];
  readonly fields: readonly SettingField[];
}

/** OAuth provider 는 전부 같은 모양이다. 네 번 적지 않는다. */
function oauthGroup(
  id: string,
  label: string,
  consoles: readonly SettingConsole[],
): SettingGroup {
  return {
    id,
    label,
    category: 'integration',
    restartRequired: true,
    consoles,
    fields: [
      { key: `${id}.clientId`, label: 'Client ID', type: 'string' },
      { key: `${id}.clientSecret`, label: 'Client Secret', type: 'secret' },
    ],
  };
}

export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    id: 'mail',
    label: '메일 발송',
    category: 'mail',
    /*
      **이건 남긴다.** SMTP 규격이 아니라 우리 서버의 동작이라 밖에서 알 방법이 없다 —
      비워 두면 발송이 실패하는 게 아니라 조용히 콘솔로 빠진다.
    */
    help: '끄면 메일을 보내지 않고 콘솔에 찍습니다.',
    fields: [
      /*
        **맨 위에 둔다.** 나머지 값이 아무리 맞아도 이것 하나로 발송 여부가 갈리므로,
        "메일이 왜 안 나가나" 를 볼 때 가장 먼저 닿아야 하는 자리다.

        **기본값은 꺼짐이다.** 설정을 덜 채운 환경이 실수로 바깥에 메일을 뿌리는 것보다,
        켜는 것을 잊어 안 나가는 쪽이 되돌리기 쉽다.
      */
      {
        key: 'mail.enabled',
        label: '메일 발송',
        type: 'boolean',
      },
      /*
        **어디로 보내는지와 무관한 값들이 먼저 온다.** from 은 메일 헤더에 박히는 문자열이고
        발송 방식은 어느 통로를 쓸지 고르는 것이라, 둘 다 SMTP 서버가 무엇이든 그대로다 —
        발송이 안 될 때 여기를 뒤지면 시간만 버린다.
      */
      {
        key: 'mail.from',
        label: 'from',
        type: 'string',
        placeholder: 'HansApp <no-reply@example.com>',
      },
      /*
        **아직 아무도 읽지 않는다.** 발송기(@hansapp/email-sender)가 SMTP 전용이라 이 값이
        무엇이든 결과가 같고, 선택지도 하나뿐이라 실질적인 차이가 없다.

        자리를 남겨 둔 것은 API 발송(SendGrid 등)을 붙일 날을 위해서다. 그때 이 키를 읽어
        통로를 가르면 된다 — 그전까지는 화면에만 보인다.
      */
      {
        key: 'mail.provider',
        label: '발송 방식',
        type: 'select',
        options: ['smtp'],
      },

      // 여기부터가 접속 정보다. 발송이 실패하면 이 구역만 보면 된다.
      {
        key: 'mail.smtp.host',
        label: 'host',
        type: 'string',
        section: 'SMTP 설정',
      },
      {
        key: 'mail.smtp.port',
        label: 'port',
        type: 'number',
        section: 'SMTP 설정',
        placeholder: '587',
      },
      {
        key: 'mail.smtp.user',
        label: 'user',
        type: 'string',
        section: 'SMTP 설정',
      },
      {
        key: 'mail.smtp.password',
        label: 'password',
        type: 'secret',
        section: 'SMTP 설정',
      },
      {
        key: 'mail.smtp.secure',
        label: 'tls',
        type: 'boolean',
        section: 'SMTP 설정',
      },
    ],
  },

  /*
    **외부 연동에는 설명을 달지 않는다.** 이 화면을 여는 사람은 그 서비스의 콘솔에서 키를
    발급받아 온 사람이라, "이게 무슨 키인지" 를 여기서 배울 일이 없다.
    설명이 붙으면 정작 봐야 할 값이 밀린다.

    다만 **발급처 이름은 각 업체가 부르는 그대로 쓴다.** 관리자가 그 사이트에 닿았을 때
    화면 제목과 같은 말이어야 제대로 왔는지 안다 — 옮겨 적으면 그 확인이 안 된다.
  */
  oauthGroup('google', '구글', [
    { label: 'Google Cloud Console', url: 'https://console.cloud.google.com/' },
  ]),
  /*
    **네이버만 발급처가 둘이다.** 어느 쪽에서 받은 키인지 모르면 콘솔을 두 번 뒤지게 되니
    둘 다 띄운다.
  */
  oauthGroup('naver', '네이버', [
    { label: '네이버 클라우드 플랫폼', url: 'https://console.ncloud.com' },
    { label: '네이버 개발자 센터', url: 'https://developers.naver.com' },
  ]),
  oauthGroup('kakao', '카카오', [
    {
      label: 'Kakao Developers',
      url: 'https://developers.kakao.com/console/app',
    },
  ]),
  oauthGroup('line', '라인', [
    { label: 'LINE Business ID', url: 'https://developers.line.biz/console/' },
  ]),

  {
    id: 'krdata',
    label: '공공데이터포털',
    category: 'integration',
    consoles: [{ url: 'https://www.data.go.kr/' }],
    fields: [
      { key: 'krdata.serviceKey', label: 'Service Key', type: 'secret' },
    ],
  },
  {
    id: 'molit',
    label: '국토교통부 브이월드',
    category: 'integration',
    consoles: [{ url: 'https://www.vworld.kr/' }],
    fields: [
      {
        key: 'molit.vworld.serviceKey',
        label: 'Service Key',
        type: 'secret',
      },
    ],
  },
  {
    id: 'juso',
    label: '행정안전부 도로명주소',
    category: 'integration',
    consoles: [{ url: 'https://juso.go.kr' }],
    fields: [{ key: 'juso.serviceKey', label: 'Service Key', type: 'secret' }],
  },
];

/** 카탈로그에 있는 모든 키. 알 수 없는 키로 저장 요청이 오면 이걸로 거른다. */
export const SETTING_KEYS: readonly string[] = SETTING_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key),
);

const FIELD_BY_KEY = new Map<string, SettingField>(
  SETTING_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f] as const)),
);

export function findSettingField(key: string): SettingField | undefined {
  return FIELD_BY_KEY.get(key);
}

export function findSettingGroup(id: string): SettingGroup | undefined {
  return SETTING_GROUPS.find((g) => g.id === id);
}

// ── 화면에 내려보내는 모양 ──────────────────────────────────────────────
//
// **값이 아니라 형태만 여기 있다.** 실제 값을 채우는 것은 각 응용 계층의 서비스이고,
// 그 결과가 이 모양이어야 관리 화면·DTO 가 계층을 몰라도 된다.

/** 값이 어디서 왔는가. 설정을 DB 로 옮기는 중에는 두 곳이 섞인다. */
export type SettingSource = 'db' | 'file' | 'none';

/** 화면에 내려보내는 필드 한 칸. */
export interface SettingFieldView extends SettingField {
  /**
   * 현재 값. **secret 필드는 언제나 null 이다** — 원문을 화면으로 보내지 않는다.
   * 대신 `hasValue` 와 `suffix` 로 "설정돼 있다" 만 알린다.
   */
  readonly value: string | null;
  readonly hasValue: boolean;
  /** secret 필드의 뒤 4자. 업체 콘솔의 값과 대조할 유일한 단서다. */
  readonly suffix: string | null;
  readonly source: SettingSource;
}

export interface SettingGroupView extends Omit<SettingGroup, 'fields'> {
  readonly fields: SettingFieldView[];
}

/** 저장 요청 한 건. `null` 은 "지운다"(설정 파일 값으로 되돌린다)는 뜻이다. */
export type SettingInput = Record<string, string | number | boolean | null>;

/**
 * 설정을 읽는 쪽이 필요로 하는 최소 모양.
 *
 * **구현체는 각 응용 계층이 제 손으로 만든다**(캐시 수명·폴백 정책이 계층마다 다를 수 있다).
 * 이 인터페이스만 공유하면 설정을 읽는 코드(메일 등)가 어느 계층에 얹히든 그대로 돈다.
 */
export interface SettingReader {
  getString(key: string): Promise<string>;
  getNumber(key: string, fallback: number): Promise<number>;
  getBoolean(key: string, fallback?: boolean): Promise<boolean>;
}
