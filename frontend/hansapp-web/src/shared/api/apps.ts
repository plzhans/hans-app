import { apiFetch } from './client';

export type AppStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';

/** 심사 세부 상태(표시용). status·요청·거절 조합에서 서버가 파생해 내려준다. */
export type AppReviewState =
  | 'DRAFT'
  | 'REVIEWING'
  | 'REJECTED'
  | 'APPROVED'
  | 'DISABLED';

export interface AppSummary {
  id: number;
  name: string;
  status: AppStatus;
  reviewState: AppReviewState;
  rejectionReason?: string | null;
  deletedAt?: string | null;
  createdBy: number;
  createdAt: string;
}

export interface ApiKeySummary {
  id: number;
  name: string;
  status: AppStatus;
  keyPrefix: string;
  lastUsedAt?: string | null;
  createdAt: string;
}

export type AppClientType = 'WEB' | 'IOS' | 'ANDROID';

export interface ClientConfig {
  bundleId?: string;
  teamId?: string;
  packageName?: string;
  fingerprints?: string[];
}

export interface AppClient {
  id: number;
  clientId: string;
  name: string;
  status: AppStatus;
  type: AppClientType;
  // WEB 전용
  origins?: string[] | null;
  redirectUris?: string[] | null;
  secretSuffix?: string | null;
  secretCreatedAt?: string | null;
  // NATIVE 전용(iOS: bundleId, Android: packageName+fingerprints)
  config?: ClientConfig | null;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface AppDetail extends AppSummary {
  apiKeyLimit: number;
  apiKeys: ApiKeySummary[];
  clients: AppClient[];
}

/** API 키 발급 응답. key(원문)는 이때만 확인 가능. */
export interface CreatedApiKey {
  id: number;
  name: string;
  key: string;
  keyPrefix: string;
  createdAt: string;
}

/** 클라이언트 생성 응답. secret(원문)은 WEB 일 때만, 이때만 확인 가능. */
export interface CreatedClient extends AppClient {
  secret?: string;
}

const auth = { auth: true } as const;

// ---- 앱 ----
export const listApps = () => apiFetch<AppSummary[]>('/apps', {}, auth);

export const createApp = (name: string) =>
  apiFetch<AppSummary>(
    '/apps',
    { method: 'POST', body: JSON.stringify({ name }) },
    auth,
  );

export const getApp = (id: number) =>
  apiFetch<AppDetail>(`/apps/${id}`, {}, auth);

export const updateApp = (
  id: number,
  input: { name?: string; status?: AppStatus },
) =>
  apiFetch<AppSummary>(
    `/apps/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    auth,
  );

/** 심사 요청(거절된 앱의 재요청도 이 경로). PENDING 앱만 가능. */
export const requestReview = (id: number) =>
  apiFetch<AppSummary>(
    `/apps/${id}/review-request`,
    { method: 'POST' },
    auth,
  );

export const deleteApp = (id: number) =>
  apiFetch<void>(`/apps/${id}`, { method: 'DELETE' }, auth);

// ---- 서비스 키 (앱당 여러 개, 이름 지정) ----
export const createApiKey = (appId: number, name: string) =>
  apiFetch<CreatedApiKey>(
    `/apps/${appId}/api-keys`,
    { method: 'POST', body: JSON.stringify({ name }) },
    auth,
  );

export const regenerateApiKey = (appId: number, keyId: number) =>
  apiFetch<CreatedApiKey>(
    `/apps/${appId}/api-keys/${keyId}/regenerate`,
    { method: 'POST' },
    auth,
  );

export const deleteApiKey = (appId: number, keyId: number) =>
  apiFetch<void>(`/apps/${appId}/api-keys/${keyId}`, { method: 'DELETE' }, auth);

// ---- 클라이언트 (앱당 여러 개, 플랫폼별) ----
interface CreateClientBase {
  name: string;
  /** Client ID 직접 지정(비우면 랜덤). 멀티 환경에서 값을 고정할 때. */
  clientId?: string;
}
export type CreateClientInput =
  | (CreateClientBase & {
      type: 'WEB';
      origins: string[];
      redirectUris: string[];
    })
  | (CreateClientBase & { type: 'IOS'; bundleId: string; teamId?: string })
  | (CreateClientBase & {
      type: 'ANDROID';
      packageName: string;
      fingerprints: string[];
    });

export const createClient = (appId: number, input: CreateClientInput) =>
  apiFetch<CreatedClient>(
    `/apps/${appId}/clients`,
    { method: 'POST', body: JSON.stringify(input) },
    auth,
  );

export interface UpdateClientInput {
  name?: string;
  origins?: string[];
  redirectUris?: string[];
  bundleId?: string;
  teamId?: string;
  packageName?: string;
  fingerprints?: string[];
}

export const updateClient = (
  appId: number,
  clientPk: number,
  input: UpdateClientInput,
) =>
  apiFetch<void>(
    `/apps/${appId}/clients/${clientPk}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    auth,
  );

export const regenerateClientSecret = (appId: number, clientPk: number) =>
  apiFetch<{ secret: string }>(
    `/apps/${appId}/clients/${clientPk}/secret`,
    { method: 'POST' },
    auth,
  );

export const deleteClient = (appId: number, clientPk: number) =>
  apiFetch<void>(`/apps/${appId}/clients/${clientPk}`, { method: 'DELETE' }, auth);

// ---- AI/LLM 업체 키 (BYOK) ----

/**
 * LLM 업체.
 *
 * `LOCAL` 은 OpenAI 호환 엔드포인트(Ollama·vLLM·LM Studio)를 뜻한다. 업체가 아니라
 * "사용자가 띄운 서버" 라 앞의 셋과 성격이 다르다 — 키가 없을 수 있고, baseUrl 이 신원이며,
 * 여러 대를 붙일 수 있다.
 */
export type LlmProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'LOCAL';

/**
 * 키 판정. **등록 시점에는 늘 `UNVERIFIED` 다** — 서버가 등록할 때 업체에 물어보지 않는다.
 * 첫 실사용의 결과가 `VALID`·`INVALID` 를 정한다.
 */
export type LlmKeyVerifyState = 'UNVERIFIED' | 'VALID' | 'INVALID';

export interface LlmKey {
  id: number;
  provider: LlmProvider;
  /** 이름. 호스팅 업체는 빈 문자열이고, LOCAL 만 값을 갖는다. */
  name: string;
  /** 표시용 키 뒤 4자. **원문은 어느 경로로도 다시 내려오지 않는다.** */
  secretSuffix?: string | null;
  baseUrl?: string | null;
  defaultModel?: string | null;
  monthlyLimitMicroUsd?: number | null;
  dailyLimitMicroUsd?: number | null;
  fallbackToService: boolean;
  verifyState: LlmKeyVerifyState;
  verifiedAt?: string | null;
  verifyError?: string | null;
  enabled: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface CreateLlmKeyInput {
  provider: LlmProvider;
  /** LOCAL 전용·필수. 다른 업체는 보내도 무시된다. */
  name?: string;
  secret?: string;
  baseUrl?: string;
  defaultModel?: string;
  monthlyLimitMicroUsd?: number | null;
  dailyLimitMicroUsd?: number | null;
  fallbackToService?: boolean;
  enabled?: boolean;
}

/** 수정. **보내지 않은 항목은 그대로 둔다** — 상한만 고칠 때 키를 다시 입력할 필요가 없다. */
export type UpdateLlmKeyInput = Omit<CreateLlmKeyInput, 'provider'>;

export const listLlmKeys = (appId: number) =>
  apiFetch<LlmKey[]>(`/apps/${appId}/llm-keys`, {}, auth);

export const createLlmKey = (appId: number, input: CreateLlmKeyInput) =>
  apiFetch<LlmKey>(
    `/apps/${appId}/llm-keys`,
    { method: 'POST', body: JSON.stringify(input) },
    auth,
  );

export const updateLlmKey = (
  appId: number,
  keyId: number,
  input: UpdateLlmKeyInput,
) =>
  apiFetch<LlmKey>(
    `/apps/${appId}/llm-keys/${keyId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    auth,
  );

export const deleteLlmKey = (appId: number, keyId: number) =>
  apiFetch<void>(`/apps/${appId}/llm-keys/${keyId}`, { method: 'DELETE' }, auth);
