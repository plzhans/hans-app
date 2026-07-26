import { apiFetch } from './client';

export type AppStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';

export interface AppSummary {
  id: number;
  name: string;
  status: AppStatus;
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
