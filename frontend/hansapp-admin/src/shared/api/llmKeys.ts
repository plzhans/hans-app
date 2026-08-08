import { apiFetch } from '@/shared/api/client';

/** 백엔드 LlmProvider 와 같은 값. GOOGLE 은 enum 에 있지만 아직 못 부른다. */
export type LlmProvider = 'ANTHROPIC' | 'OPENAI' | 'LOCAL';
/** 값을 어떻게 실어 보내는가. AUTH_TOKEN 은 ANTHROPIC 전용(개인 구독 토큰). */
export type LlmKeyType = 'API_KEY' | 'AUTH_TOKEN';
export type EnvLlmKeyStatus = 'ACTIVE' | 'DISABLED';

/**
 * 서버가 LLM 을 부를 때 쓰는 키 한 줄.
 *
 * **null 인 필드는 응답에서 아예 빠진다**(StripNullInterceptor). 그래서 `?:` 로 선언한다.
 * 키는 원문이 오지 않는다 — `hasSecret` 과 `secretSuffix` 로 "설정돼 있다" 만 안다.
 */
export interface EnvLlmKey {
  id: number;
  provider: LlmProvider;
  /** provider 안에서의 신원. **LOCAL 만 갖는다** — 호스팅 업체는 빈 문자열이다. */
  name: string;
  keyType: LlmKeyType;
  hasSecret: boolean;
  secretSuffix?: string | null;
  baseUrl?: string | null;
  defaultModel?: string | null;
  allowedModels?: string | null;
  isDefault: boolean;
  status: EnvLlmKeyStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * 저장 요청.
 *
 * **보내지 않은 필드는 서버가 건드리지 않는다.** 키는 원문을 받아 온 적이 없어서,
 * 통째로 보내면 마스킹된 값으로 덮어쓰게 된다.
 */
export interface EnvLlmKeyInput {
  provider?: LlmProvider;
  /** LOCAL 만 필요하다. 그 밖에는 서버가 무시한다. */
  name?: string;
  keyType?: LlmKeyType;
  /** 평문으로 보낸다 — 잠그는 것은 서버가 한다. */
  secret?: string | null;
  baseUrl?: string | null;
  defaultModel?: string | null;
  allowedModels?: string | null;
  status?: EnvLlmKeyStatus;
}

export const listLlmKeys = () => apiFetch<EnvLlmKey[]>('/api/llm/keys');

export const createLlmKey = (input: EnvLlmKeyInput) =>
  apiFetch<EnvLlmKey>('/api/llm/keys', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateLlmKey = (id: number, input: EnvLlmKeyInput) =>
  apiFetch<EnvLlmKey>(`/api/llm/keys/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

/** 기본으로 지정. 지정 없는 호출이 이 키로 나간다 — 전체에서 하나뿐이다. */
export const setDefaultLlmKey = (id: number) =>
  apiFetch<void>(`/api/llm/keys/${id}/default`, { method: 'POST' });

export const deleteLlmKey = (id: number) =>
  apiFetch<void>(`/api/llm/keys/${id}`, { method: 'DELETE' });

/**
 * 업체에 실제로 있는 모델 목록.
 *
 * **저장 전에도 부를 수 있다.** `id` 를 주면 저장된 키를 쓰고, 안 주면 실린 값으로 부른다 —
 * 등록 화면에서 키를 막 입력한 상태로도 확인할 수 있어야 한다.
 *
 * **화면을 돕는 수단이다.** 실패해도 모델 이름을 직접 적을 수 있으니 등록을 막지 않는다.
 */
export const fetchVendorModels = (input: {
  id?: number;
  provider?: LlmProvider;
  keyType?: LlmKeyType;
  secret?: string | null;
  baseUrl?: string | null;
}) =>
  apiFetch<{ models: string[] }>('/api/llm/keys/models', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.models);
