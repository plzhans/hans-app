import { Preferences } from '@capacitor/preferences';

/** 저장 토큰. 웹·모바일 공용(Capacitor Preferences). */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** refresh 만료(ISO8601) */
  refreshExpiresAt: string;
}

/** 토큰 스토어. 키를 주입받아 앱마다 격리한다. */
export class TokenStorage {
  constructor(private readonly key: string) {}

  async load(): Promise<StoredTokens | null> {
    const { value } = await Preferences.get({ key: this.key });
    if (!value) return null;
    try {
      return JSON.parse(value) as StoredTokens;
    } catch {
      return null;
    }
  }

  async save(tokens: StoredTokens): Promise<void> {
    await Preferences.set({ key: this.key, value: JSON.stringify(tokens) });
  }

  async clear(): Promise<void> {
    await Preferences.remove({ key: this.key });
  }
}
