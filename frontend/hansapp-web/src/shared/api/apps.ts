import { apiFetch } from './client';

export interface AppSummary {
  id: number;
  name: string;
  createdBy: number;
  createdAt: string;
}

export interface ApiKeySummary {
  id: number;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface AppClient {
  id: number;
  clientId: string;
  name: string;
  origins: string[];
  redirectUris: string[];
  secretSuffix: string;
  secretCreatedAt: string;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface AppDetail extends AppSummary {
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

/** 클라이언트 생성 응답. secret(원문)은 이때만 확인 가능. */
export interface CreatedClient extends AppClient {
  secret: string;
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

export const renameApp = (id: number, name: string) =>
  apiFetch<AppSummary>(
    `/apps/${id}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
    auth,
  );

export const deleteApp = (id: number) =>
  apiFetch<void>(`/apps/${id}`, { method: 'DELETE' }, auth);

// ---- 서비스 키 (앱당 1개, 발급/재발급으로 교체) ----
export const issueApiKey = (appId: number) =>
  apiFetch<CreatedApiKey>(`/apps/${appId}/api-keys`, { method: 'POST' }, auth);

// ---- 클라이언트 (앱당 1개) ----
// 클라이언트는 앱당 1개뿐이라 사용자에게 이름을 받지 않는다. 백엔드는 아직 name 을
// 요구하므로(싱글턴이라 식별 의미가 없음) 고정 기본값을 채워 보낸다.
const DEFAULT_CLIENT_NAME = 'default';

export const createClient = (
  appId: number,
  input: { origins: string[]; redirectUris: string[] },
) =>
  apiFetch<CreatedClient>(
    `/apps/${appId}/clients`,
    {
      method: 'POST',
      body: JSON.stringify({ ...input, name: DEFAULT_CLIENT_NAME }),
    },
    auth,
  );

export const updateClient = (
  appId: number,
  clientPk: number,
  input: { origins?: string[]; redirectUris?: string[] },
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
