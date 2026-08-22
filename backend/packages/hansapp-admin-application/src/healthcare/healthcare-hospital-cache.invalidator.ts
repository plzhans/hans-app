import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { SUPPORTED_LANGS, type Lang } from '@hansapp/search';

/**
 * 병원 상세 캐시 키. **정본은 공개 계층의 HealthcareHospitalService 다**
 * (packages/hansapp-application/src/healthcare/healthcare-hospital.service.ts 의
 * baseKey/i18nKey). 여기서 형식을 다시 적는 것은 관리자 계층이 그 계층을 의존하지
 * 않기 위해서다 — 그쪽이 바뀌면 이 파일도 같이 고쳐야 한다
 * (BoardPostCacheInvalidator·UserProfileCacheAdmin 과 같은 방식).
 *
 * base 는 무거운 join(구조+평가)을 담아 병원당 1번만 캐싱된다. i18n 은 요청 언어만
 * lazy 캐싱된다. 환경 네임스페이스(`develop:`)는 CacheModule 이 붙이므로 여기서는 안 붙인다.
 */
const baseKey = (id: number): string => `hospital:{${id}}:base`;
const i18nKey = (id: number, lang: Lang): string => `hospital:{${id}}:i18n:${lang}`;

/** 캐시 한 칸의 상태. 다른 도메인의 캐시 패널(글·회원·관리자)과 같은 모양이다. */
export interface HospitalCacheState {
  readonly key: string;
  readonly hit: boolean;
  readonly expiresAt: Date | null;
  /** 남은 시간(ms). 만료 시각을 모르면 null. */
  readonly remainingMs: number | null;
  /** 담겨 있는 값 그대로. 화면이 JSON 으로 펴서 보여 준다. */
  readonly value: unknown;
  /** Redis 처럼 프로세스 밖에서도 공유되나. false 면 이 프로세스의 메모리다. */
  readonly shared: boolean;
}

/**
 * 병원 상세 캐시(공개 API)를 들여다보고 지운다.
 *
 * **base 키만 들여다본다.** i18n 은 언어별로 갈라져 한 화면에 다 보여줄 수 없고, "데이터를
 * 고쳤는데 안 바뀐다" 는 문의의 대부분은 구조·평가(base)다. 지울 때는 base + 지원 언어
 * i18n 전체를 함께 지운다 — 번역까지 확실히 갱신하려는 것이다.
 */
@Injectable()
export class HealthcareHospitalCacheInvalidator {
  private readonly logger = new Logger(HealthcareHospitalCacheInvalidator.name);

  constructor(@Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache) {}

  /**
   * 들여다본다. **지우기 전에 지울 것이 있는지 보라고 두는 창이다.**
   *
   * TTL 은 cache-manager 가 아니라 그 아래 Keyv 에게 직접 묻는다(`{ raw: true }`) — 위쪽
   * API 는 값만 돌려주고 남은 시간을 알려주지 않는다(글 캐시와 같은 방식).
   */
  async inspect(id: number): Promise<HospitalCacheState> {
    const key = baseKey(id);
    const empty: HospitalCacheState = {
      key,
      hit: false,
      expiresAt: null,
      remainingMs: null,
      value: null,
      shared: false,
    };
    const store = this.cache?.stores?.[0];
    if (!store) return empty;

    try {
      const raw = (await store.get(key, { raw: true })) as {
        value?: unknown;
        expires?: number | null;
      } | null;
      if (!raw) return { ...empty, shared: isShared(store) };

      const expires = raw.expires ?? null;
      return {
        key,
        hit: true,
        expiresAt: expires === null ? null : new Date(expires),
        remainingMs: expires === null ? null : Math.max(0, expires - Date.now()),
        value: raw.value ?? null,
        shared: isShared(store),
      };
    } catch (error) {
      this.logger.warn(`Failed to read hospital cache (id=${id}): ${String(error)}`);
      return empty;
    }
  }

  /**
   * 지운다. **실패해도 던지지 않는다** — 캐시는 TTL(5분)이 지나면 어차피 맞춰지고, 여기서
   * 예외를 내면 관리자 화면에 "초기화하지 못했습니다" 가 뜬다.
   */
  async invalidate(id: number): Promise<void> {
    const cache = this.cache;
    if (!cache) return;
    const keys = [baseKey(id), ...SUPPORTED_LANGS.map((lang) => i18nKey(id, lang))];
    try {
      await Promise.all(keys.map((key) => cache.del(key)));
    } catch (error) {
      this.logger.warn(`Failed to evict hospital cache (id=${id}): ${String(error)}`);
    }
    this.logger.log(`Hospital cache cleared: id=${id}`);
  }
}

/** Keyv 의 기본 저장소는 그냥 `Map` 이다 — 그것이면 이 프로세스 안에서만 사는 캐시다. */
function isShared(store: { opts?: { store?: unknown } }): boolean {
  return !(store.opts?.store instanceof Map);
}
