import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  seal,
  suffixOf,
  trimTrailingSlash,
  SETTING_GROUPS,
  SETTING_KEYRING,
  SETTING_ORIGINS,
  findSettingGroup,
  type SecretBoxKeys,
  type SettingField,
  type SettingFieldView,
  type SettingGroupView,
  type SettingInput,
  type SettingOrigins,
} from '@hansapp/common';

import { SettingCache } from './setting-cache.service';
import { SettingWriteRepository } from './setting-write.repository';

// 화면에 내려보내는 모양(SettingFieldView 등)은 @hansapp/common 이 갖는다 — DTO 도 같은 것을 본다.

/**
 * 서비스 설정 관리(쓰기).
 *
 * 읽기(SettingCache)와 갈라 둔 이유는 캐시 때문이다 — 읽기는 5분을 버티는 것이 목적이고,
 * 쓰기는 바꾼 즉시 보여야 한다. 한 클래스에 두면 저장할 때마다 캐시를 어떻게 다룰지
 * 부르는 쪽이 신경 써야 한다.
 *
 * **엔드포인트는 관리자 API 에만 있다.** 이 클래스가 공용 계층에 있는 것은 설정 모듈을
 * 한자리에 두려는 것이고, 쓰기를 열지 말지는 각 앱이 컨트롤러로 정한다.
 */
@Injectable()
export class SettingAdminService {
  constructor(
    private readonly repository: SettingWriteRepository,
    private readonly settings: SettingCache,
    @Inject(SETTING_KEYRING)
    private readonly keyring: SecretBoxKeys | undefined,
    @Inject(SETTING_ORIGINS)
    private readonly origins: SettingOrigins,
  ) {}

  /**
   * 카탈로그 전체 + 현재 값. 화면은 이것만 받아 그린다.
   *
   * @param adminOrigin 이 요청이 들어온 관리자 API 오리진(`{scheme}://{host}`). 관리자 콘솔
   *   로그인의 리디렉션 주소가 여기서 만들어진다 — 소셜 로그인도 같은 값으로 `redirect_uri` 를
   *   조립하므로(admin-social-flow), 설정 주소와 접속 주소가 갈리는 로컬에서도 어긋나지 않는다.
   *   없으면 설정(`apps-admin-api.externalUrl`)으로 물러선다.
   */
  async list(adminOrigin?: string): Promise<SettingGroupView[]> {
    const stored = await this.settings.storedKeys();
    const groups: SettingGroupView[] = [];

    for (const group of SETTING_GROUPS) {
      const fields: SettingFieldView[] = [];
      for (const field of group.fields) {
        if (field.type === 'readonly') {
          // DB 를 보지 않는다. 저장된 적이 없는 값이고, 저장할 수도 없다(saveGroup 참고).
          const derived = this.derive(field, adminOrigin);
          fields.push({
            ...field,
            value: derived,
            hasValue: derived !== null,
            suffix: null,
            source: 'none',
          });
          continue;
        }

        const inDb = stored.has(field.key);
        const raw = await this.settings.getString(field.key);
        /*
          **`null`(설정 안 됨)과 `''`(빈 값으로 설정함)를 갈라 받는다.** 화면에서는 둘 다
          "채워진 값이 없다" 로 보이지만, 출처는 다르다 — 빈 값이라도 DB 에 행이 있으면
          그것은 관리자가 일부러 넣은 상태다.
        */
        const hasValue = raw !== null && raw.length > 0;

        fields.push({
          ...field,
          /*
            **secret 은 원문을 안 내보낸다.** 설정 파일에서 온 값이라도 마찬가지다 —
            "파일에 있으니 보여줘도 된다" 로 두면 화면 하나가 서비스키 열람 창이 된다.
          */
          value: field.type === 'secret' ? null : hasValue ? raw : null,
          hasValue,
          suffix: field.type === 'secret' && hasValue ? suffixOf(raw) || null : null,
          // 빈 값이라도 DB 에 행이 있으면 'db' 다. 행의 유무가 정한다.
          source: inDb ? 'db' : 'none',
        });
      }
      groups.push({ ...group, fields });
    }

    return groups;
  }

  /**
   * 한 그룹의 값을 저장한다.
   *
   * **요청에 없는 키는 건드리지 않는다.** 그래야 화면이 secret 을 빈 값으로 되돌려 보내
   * 실수로 지우는 일이 없다 — 안 바꿀 값은 안 보내면 된다.
   * 명시적으로 `null` 을 보내면 지운다(설정 파일 값으로 되돌아간다).
   */
  async saveGroup(
    groupId: string,
    input: SettingInput,
    adminId: number | null,
    adminOrigin?: string,
  ): Promise<SettingGroupView[]> {
    const group = findSettingGroup(groupId);
    if (!group) {
      throw new NotFoundException(`Unknown setting group: ${groupId}`);
    }

    const allowed = new Map(group.fields.map((f) => [f.key, f]));
    for (const key of Object.keys(input)) {
      // 카탈로그에 없는 키를 받으면 DB 에 쓰레기가 쌓이고, 남의 그룹 값을 이 화면에서
      // 덮어쓸 수도 있다. 그룹에 속한 키만 받는다.
      const field = allowed.get(key);
      if (!field) {
        throw new BadRequestException(`Key does not belong to group "${groupId}": ${key}`);
      }
      // 표시 전용 줄은 서버가 만들어 낸 값이다. 받아서 저장하면 화면이 보여 주는 것과 서버가
      // 실제로 쓰는 값이 갈리고, 그 뒤로는 어느 쪽이 맞는지 알 수 없다.
      if (field.type === 'readonly') {
        throw new BadRequestException(`Read-only setting: ${key}`);
      }
    }

    for (const [key, value] of Object.entries(input)) {
      if (value === null || value === '') {
        await this.repository.delete(key);
        continue;
      }
      const field = allowed.get(key) as SettingField;
      await this.write(field, normalize(field, value), adminId);
    }

    // 방금 바꾼 값이 5분간 안 먹으면 화면이 거짓말을 한다.
    this.settings.invalidate();
    return this.list(adminOrigin);
  }

  /**
   * 표시 전용 값을 만든다. 오리진이 비어 있으면 `null` 이다 — 화면은 "주소가 없다" 고 말하고,
   * 지어낸 주소를 콘솔에 등록하는 일이 없다.
   */
  private derive(field: SettingField, adminOrigin?: string): string | null {
    if (!field.derived) return null;
    const base =
      field.derived.origin === 'admin'
        ? trimTrailingSlash(adminOrigin) || this.origins.admin
        : this.origins.service;
    return base ? `${base}${field.derived.path}` : null;
  }

  /**
   * 한 값을 DB 에 넣는다.
   *
   * **잠글지 말지는 카탈로그가 정한다**(type === 'secret'). host·port·client id 까지
   * 잠그면 장애가 났을 때 SQL 로 확인할 수 있는 값이 하나도 없고, 키를 잃으면 설정 전체가
   * 안 열린다.
   *
   * 정한 결과는 행에 같이 적는다 — 읽는 쪽은 카탈로그가 아니라 그 기록을 따른다.
   */
  private async write(field: SettingField, plain: string, adminId: number | null): Promise<void> {
    const encrypted = field.type === 'secret';
    if (encrypted && !this.keyring) {
      // 비밀값을 평문으로 저장하는 우회는 두지 않는다. 저장 자체를 거절한다.
      throw new BadRequestException(
        `${field.label}: appSecretEncryption 키가 없어 저장할 수 없습니다.`,
      );
    }

    await this.repository.upsert(
      field.key,
      encrypted ? seal(plain, this.keyring as SecretBoxKeys) : plain,
      encrypted,
      adminId,
    );
  }
}

/** 저장 형태는 문자열 하나다. 타입은 카탈로그가 알고 있으니 읽을 때 되돌린다. */
function normalize(field: SettingField, value: string | number | boolean): string {
  if (field.type === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
  if (field.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`${field.label}: 숫자가 아닙니다.`);
    }
    return String(n);
  }
  const text = String(value);
  if (field.type === 'select' && field.options && !field.options.includes(text)) {
    throw new BadRequestException(
      `${field.label}: 고를 수 없는 값입니다 (${field.options.join(', ')}).`,
    );
  }
  return text;
}
