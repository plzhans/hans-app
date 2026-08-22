import { ApiProperty } from '@nestjs/swagger';
import type {
  MirrorSection,
  MirrorSectionItem,
  MirrorTableCount,
} from '@hansapp/admin-application';

export class MirrorFieldDto {
  @ApiProperty() readonly key!: string;
  @ApiProperty() readonly value!: string;
}

export class MirrorSectionItemDto {
  @ApiProperty({ type: MirrorFieldDto, isArray: true })
  readonly fields!: MirrorFieldDto[];
  @ApiProperty({ description: '가공하지 않은 원본. "JSON 전체 보기" 가 이걸 그대로 찍는다.' })
  readonly raw!: unknown;

  constructor(item: MirrorSectionItem) {
    this.fields = item.fields;
    this.raw = item.raw;
  }
}

/** 연동 데이터 상세의 API 구간 하나. HIRA·NMC 공통 모양이다. */
export class MirrorSectionDto {
  @ApiProperty() readonly key!: string;
  @ApiProperty() readonly label!: string;
  @ApiProperty({ description: '이 오퍼레이션(API)을 조회한 적이 있나. false 면 행 자체가 없다.' })
  readonly queried!: boolean;
  @ApiProperty({ description: 'queried 인데 내용이 비었다.' })
  readonly empty!: boolean;
  @ApiProperty({ nullable: true })
  readonly syncedAt!: string | null;
  @ApiProperty({ type: MirrorSectionItemDto, isArray: true })
  readonly items!: MirrorSectionItemDto[];

  constructor(section: MirrorSection) {
    this.key = section.key;
    this.label = section.label;
    this.queried = section.queried;
    this.empty = section.empty;
    this.syncedAt = section.syncedAt;
    this.items = section.items.map((item) => new MirrorSectionItemDto(item));
  }
}

/** 연동 데이터 대시보드의 표 한 줄. */
export class MirrorTableCountDto {
  @ApiProperty() readonly key!: string;
  @ApiProperty({ description: '표를 묶는 그룹. 예: "병원", "코드".' })
  readonly group!: string;
  @ApiProperty() readonly label!: string;
  @ApiProperty() readonly count!: number;
  @ApiProperty({
    nullable: true,
    description: '"목록 보기" 가 이동할 경로. 없으면 아직 그 테이블만의 목록 화면이 없다.',
  })
  readonly listPath!: string | null;

  constructor(row: MirrorTableCount) {
    this.key = row.key;
    this.group = row.group;
    this.label = row.label;
    this.count = row.count;
    this.listPath = row.listPath ?? null;
  }
}
