import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  seal,
  suffixOf,
  SETTING_GROUPS,
  SETTING_KEYRING,
  findSettingGroup,
  type SecretBoxKeys,
  type SettingField,
  type SettingFieldView,
  type SettingGroupView,
  type SettingInput,
} from '@hansapp/common';

import { SettingService } from './setting.service';
import { SettingWriteRepository } from './setting-write.repository';

// 화면에 내려보내는 모양(SettingFieldView 등)은 @hansapp/common 이 갖는다 — DTO 도 같은 것을 본다.

/**
 * 서비스 설정 관리(쓰기).
 *
 * 읽기(SettingService)와 갈라 둔 이유는 캐시 때문이다 — 읽기는 5분을 버티는 것이 목적이고,
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
    private readonly settings: SettingService,
    @Inject(SETTING_KEYRING)
    private readonly keyring: SecretBoxKeys | undefined,
  ) {}

  /** 카탈로그 전체 + 현재 값. 화면은 이것만 받아 그린다. */
  async list(): Promise<SettingGroupView[]> {
    const stored = await this.settings.storedKeys();
    const groups: SettingGroupView[] = [];

    for (const group of SETTING_GROUPS) {
      const fields: SettingFieldView[] = [];
      for (const field of group.fields) {
        const inDb = stored.has(field.key);
        // 값 자체는 읽기 서비스를 통해 가져온다 — DB → 설정 파일 폴백이 거기 있다.
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
          suffix:
            field.type === 'secret' && hasValue ? suffixOf(raw) || null : null,
          // 빈 값이라도 DB 에 행이 있으면 'db' 다. 행의 유무가 출처를 정한다.
          source: inDb ? 'db' : hasValue ? 'file' : 'none',
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
    adopt: readonly string[] = [],
  ): Promise<SettingGroupView[]> {
    const group = findSettingGroup(groupId);
    if (!group) {
      throw new NotFoundException(`Unknown setting group: ${groupId}`);
    }

    const allowed = new Map(group.fields.map((f) => [f.key, f]));
    for (const key of [...Object.keys(input), ...adopt]) {
      // 카탈로그에 없는 키를 받으면 DB 에 쓰레기가 쌓이고, 남의 그룹 값을 이 화면에서
      // 덮어쓸 수도 있다. 그룹에 속한 키만 받는다.
      if (!allowed.has(key)) {
        throw new BadRequestException(
          `Key does not belong to group "${groupId}": ${key}`,
        );
      }
    }

    /*
      **설정 파일에 있던 값을 DB 로 옮긴다.**

      화면은 파일 값을 그대로 보여 주고 있으므로, 관리자가 그 상태로 저장을 누르면 "보이는
      대로 저장된다" 가 되어야 한다. 그런데 secret 은 원문을 내려보낸 적이 없어서 화면이
      되돌려 보낼 수가 없다 — 그래서 값이 아니라 **키만** 받아 서버가 제 손으로 읽어 넣는다.

      화면이 바꾼 값(input)이 우선이다. 같은 키가 양쪽에 있으면 여기서는 건너뛴다.
    */
    for (const key of adopt) {
      if (key in input) continue;
      const field = allowed.get(key) as SettingField;
      const plain = await this.settings.getString(key);
      // 파일에도 없는 값이다. 빈 행을 만들 이유가 없다.
      if (!plain) continue;
      await this.write(field, plain, adminId);
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
    return this.list();
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
  private async write(
    field: SettingField,
    plain: string,
    adminId: number | null,
  ): Promise<void> {
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
function normalize(
  field: SettingField,
  value: string | number | boolean,
): string {
  if (field.type === 'boolean')
    return value === true || value === 'true' ? 'true' : 'false';
  if (field.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`${field.label}: 숫자가 아닙니다.`);
    }
    return String(n);
  }
  const text = String(value);
  if (
    field.type === 'select' &&
    field.options &&
    !field.options.includes(text)
  ) {
    throw new BadRequestException(
      `${field.label}: 고를 수 없는 값입니다 (${field.options.join(', ')}).`,
    );
  }
  return text;
}
