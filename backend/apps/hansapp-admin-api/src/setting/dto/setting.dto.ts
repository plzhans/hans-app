import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';
import type {
  SettingFieldView,
  SettingGroupView,
  SettingInput,
} from '@hansapp/admin-application';

export class SettingFieldDto {
  @ApiProperty({ description: '설정 경로. 저장할 때 이 값을 키로 보낸다.' })
  readonly key!: string;

  @ApiProperty({ description: '표시 이름' }) readonly label!: string;

  @ApiProperty({
    description: 'string · number · boolean · select · secret',
  })
  readonly type!: string;

  @ApiPropertyOptional({ description: 'select 의 선택지', type: [String] })
  readonly options?: string[];

  @ApiPropertyOptional({ description: '입력칸 안내 문구' })
  readonly placeholder?: string;

  @ApiPropertyOptional({ description: '입력칸 아래 설명' })
  readonly help?: string;

  @ApiPropertyOptional({
    description: '카드 안에서 다시 갈라 놓을 구역 이름. 없으면 맨 위 묶음이다.',
  })
  readonly section?: string;

  @ApiPropertyOptional({
    description:
      '현재 값. **secret 은 언제나 null 이다** — 원문은 내려보내지 않는다.',
  })
  readonly value!: string | null;

  @ApiProperty({ description: '값이 설정돼 있는지(설정 파일 값 포함)' })
  readonly hasValue!: boolean;

  @ApiPropertyOptional({ description: 'secret 의 뒤 4자(대조용)' })
  readonly suffix!: string | null;

  @ApiProperty({
    description:
      '값의 출처. db=화면에서 저장함, file=설정 파일 값, none=아직 없음',
  })
  readonly source!: string;

  constructor(field: SettingFieldView) {
    this.key = field.key;
    this.label = field.label;
    this.type = field.type;
    this.options = field.options ? [...field.options] : undefined;
    this.placeholder = field.placeholder;
    this.help = field.help;
    this.section = field.section;
    this.value = field.value;
    this.hasValue = field.hasValue;
    this.suffix = field.suffix;
    this.source = field.source;
  }
}

export class SettingConsoleDto {
  @ApiPropertyOptional({
    description: '그 사이트가 스스로를 부르는 이름. 없으면 화면이 채운다.',
  })
  readonly label?: string;

  @ApiProperty({ description: '키를 발급받는 콘솔 주소' })
  readonly url!: string;

  constructor(site: { label?: string; url: string }) {
    this.label = site.label;
    this.url = site.url;
  }
}

export class SettingGroupDto {
  @ApiProperty({ description: '그룹 id. 저장할 때 경로에 쓴다.' })
  readonly id!: string;

  @ApiProperty({ description: '표시 이름' }) readonly label!: string;

  @ApiProperty({ description: '메뉴 구분. mail · integration' })
  readonly category!: string;

  @ApiPropertyOptional({ description: '그룹 설명' })
  readonly help?: string;

  @ApiPropertyOptional({
    description: '값을 바꿔도 서버를 다시 띄워야 반영되는 그룹인지',
  })
  readonly restartRequired?: boolean;

  @ApiPropertyOptional({
    description: '이 그룹의 키를 발급받는 곳',
    type: [SettingConsoleDto],
  })
  readonly consoles?: SettingConsoleDto[];

  @ApiProperty({ type: [SettingFieldDto] })
  readonly fields!: SettingFieldDto[];

  constructor(group: SettingGroupView) {
    this.id = group.id;
    this.label = group.label;
    this.category = group.category;
    this.help = group.help;
    this.restartRequired = group.restartRequired;
    this.consoles = group.consoles?.map((c) => new SettingConsoleDto(c));
    this.fields = group.fields.map((f) => new SettingFieldDto(f));
  }
}

export class SettingSaveRequestDto {
  @ApiProperty({
    description:
      '바꿀 값만 담는다. **없는 키는 건드리지 않고**, null 을 보내면 지운다(설정 파일 값으로 되돌아간다).',
    example: { 'mail.smtp.host': 'smtp.example.com', 'mail.smtp.port': 587 },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  readonly values!: SettingInput;

  @ApiPropertyOptional({
    description:
      '설정 파일에 있던 값을 그대로 DB 로 옮길 키 목록. **값이 아니라 키만 보낸다** — ' +
      'secret 은 원문을 내려보낸 적이 없어 화면이 되돌려 보낼 수 없으므로, 서버가 제 손으로 읽어 넣는다. ' +
      'values 에 같은 키가 있으면 values 가 이긴다.',
    type: [String],
    example: ['mail.smtp.host', 'mail.smtp.password'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly adopt?: string[];
}
