import { apiFetch } from '@/shared/api/client';

export type SettingFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'secret';

/** 값이 있는가. 출처는 DB 하나뿐이다 — 설정 파일 폴백은 걷어냈다. */
export type SettingSource = 'db' | 'none';

export type SettingCategory = 'mail' | 'integration' | 'llm';

export interface SettingField {
  key: string;
  label: string;
  type: SettingFieldType;
  options?: string[];
  placeholder?: string;
  help?: string;
  /** 카드 안에서 다시 갈라 놓을 구역 이름. 없으면 맨 위 묶음이다. */
  section?: string;
  /** 현재 값. **secret 은 언제나 null** — 서버가 원문을 안 내려보낸다. */
  value: string | null;
  hasValue: boolean;
  /** secret 의 뒤 4자. 업체 콘솔의 값과 대조할 유일한 단서다. */
  suffix?: string | null;
  source: SettingSource;
}

/** 키를 발급받는 곳. */
export interface SettingConsole {
  /** 발급처가 둘 이상일 때만 있다(네이버). */
  label?: string;
  url: string;
}

export interface SettingGroup {
  id: string;
  label: string;
  category: SettingCategory;
  help?: string;
  /** 값을 바꿔도 서버를 다시 띄워야 반영되는 그룹인지. */
  restartRequired?: boolean;
  consoles?: SettingConsole[];
  fields: SettingField[];
}

/** 저장 요청. `null` 은 "지운다"는 뜻이다. */
export type SettingValues = Record<string, string | number | boolean | null>;

export const listSettings = () => apiFetch<SettingGroup[]>('/api/settings');

/**
 * 한 그룹을 저장한다. **바꾼 값만 보낸다** — 요청에 없는 키는 서버가 건드리지 않는다.
 * 그래야 secret 을 빈 값으로 되돌려 보내 실수로 지우는 일이 없다.
 */
export const saveSettingGroup = (groupId: string, values: SettingValues) =>
  apiFetch<SettingGroup[]>(`/api/settings/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify({ values }),
  });
