import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EnumField } from '@hansapp/http-common';
import { BoardStatus, BoardWriteRole } from '@hansapp/common';
import type { BoardSummary, CacheState, DeletedBoardSummary } from '@hansapp/admin-application';

/** 이름 규칙. 주소에 그대로 실리므로 소문자·숫자·하이픈만 받는다. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export class BoardCreateRequestDto {
  @ApiProperty({
    description: '주소·API 에서 쓰는 이름. 소문자·숫자·하이픈.',
    example: 'notice',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_PATTERN, {
    message: 'name must contain only lowercase letters, digits, and hyphens.',
  })
  readonly name!: string;

  @ApiProperty({ description: '화면에 보이는 이름', example: '공지사항' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly title!: string;

  @ApiPropertyOptional({ description: '게시판 설명', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly description?: string;

  @EnumField(BoardWriteRole, {
    optional: true,
    default: BoardWriteRole.ADMIN,
    description: '글을 쓸 수 있는 사람',
  })
  readonly writeRole?: BoardWriteRole;

  @ApiPropertyOptional({
    default: false,
    description: '댓글을 받는 게시판인가',
  })
  @IsOptional()
  @IsBoolean()
  readonly commentEnabled?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: '좋아요를 받는 게시판인가',
  })
  @IsOptional()
  @IsBoolean()
  readonly likeEnabled?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: '비공개 글을 허용하나',
  })
  @IsOptional()
  @IsBoolean()
  readonly secretPostEnabled?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: '비공개 댓글을 허용하나. commentEnabled 가 꺼져 있으면 함께 꺼진다.',
  })
  @IsOptional()
  @IsBoolean()
  readonly secretCommentEnabled?: boolean;

  @EnumField(BoardStatus, { optional: true, default: BoardStatus.ACTIVE })
  readonly status?: BoardStatus;

  @ApiPropertyOptional({ default: 0, description: '목록 순서. 작은 값이 앞.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly sortOrder?: number;
}

/** 고칠 때. **빠진 값은 그대로 둔다** — 빈 값으로 덮지 않는다. */
export class BoardUpdateRequestDto {
  @ApiPropertyOptional({ example: 'notice' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_PATTERN, {
    message: 'name must contain only lowercase letters, digits, and hyphens.',
  })
  readonly name?: string;

  @ApiPropertyOptional({ example: '공지사항' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly title?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly description?: string;

  @EnumField(BoardWriteRole, { optional: true })
  readonly writeRole?: BoardWriteRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly commentEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly likeEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly secretPostEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly secretCommentEnabled?: boolean;

  @EnumField(BoardStatus, { optional: true })
  readonly status?: BoardStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly sortOrder?: number;
}

/** 되살리기 요청. **이름을 반드시 받는다**(비켜 둔 이름을 그대로 쓸 수 없다). */
export class BoardRestoreRequestDto {
  @ApiProperty({
    description: '되살릴 때 쓸 이름. 소문자·숫자·하이픈. 이미 쓰는 이름이면 409 로 거절한다.',
    example: 'notice',
  })
  @IsString()
  @MaxLength(50)
  readonly name!: string;
}

export class BoardDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty({ description: '주소·API 에서 쓰는 이름' })
  readonly name!: string;
  @ApiProperty({ description: '화면에 보이는 이름' }) readonly title!: string;
  @ApiProperty({ nullable: true }) readonly description!: string | null;
  @EnumField(BoardWriteRole) readonly writeRole!: BoardWriteRole;
  @ApiProperty() readonly commentEnabled!: boolean;
  @ApiProperty() readonly likeEnabled!: boolean;
  @ApiProperty() readonly secretPostEnabled!: boolean;
  @ApiProperty() readonly secretCommentEnabled!: boolean;
  @EnumField(BoardStatus) readonly status!: BoardStatus;
  @ApiProperty() readonly sortOrder!: number;
  @ApiProperty({ description: '이 게시판의 글 수(상태 무관)' })
  readonly postCount!: number;
  @ApiProperty() readonly createdAt!: string;
  @ApiProperty() readonly updatedAt!: string;

  /*
    **클래스 인스턴스로 만든다.** 객체 리터럴을 그대로 돌려주면 ClassSerializerInterceptor
    가 손댈 것이 없어 @EnumField 의 변환이 실행되지 않는다(레포의 다른 DTO 도 생성자 방식이다).
  */
  constructor(board: BoardSummary) {
    this.id = board.id;
    this.name = board.name;
    this.title = board.title;
    this.description = board.description;
    this.writeRole = board.writeRole;
    this.commentEnabled = board.commentEnabled;
    this.likeEnabled = board.likeEnabled;
    this.secretPostEnabled = board.secretPostEnabled;
    this.secretCommentEnabled = board.secretCommentEnabled;
    this.status = board.status;
    this.sortOrder = board.sortOrder;
    this.postCount = board.postCount;
    this.createdAt = board.createdAt.toISOString();
    this.updatedAt = board.updatedAt.toISOString();
  }
}

/** 삭제함 한 줄. 게시판 정보에 지운 시각과 되살릴 때 채워 줄 이름을 더한다. */
export class DeletedBoardDto extends BoardDto {
  @ApiProperty({ description: '지운 시각' })
  readonly deletedAt!: string;

  @ApiProperty({
    description: '되살릴 때 채워 줄 이름(비켜 두기 전 이름). 지금도 비어 있다는 보장은 없다.',
  })
  readonly suggestedName!: string;

  constructor(board: DeletedBoardSummary) {
    super(board);
    this.deletedAt = board.deletedAt.toISOString();
    this.suggestedName = board.suggestedName;
  }
}

/** 캐시를 쓸어 낸 결과. */
export class CachePurgeResultDto {
  @ApiProperty({ description: '지운 글 캐시 수. 게시판 목록 캐시는 항상 함께 지운다.' })
  readonly deletedPosts!: number;

  constructor(deletedPosts: number) {
    this.deletedPosts = deletedPosts;
  }
}

/** 캐시 한 칸의 상태. 글 캐시(PostCacheStateDto)와 같은 모양이다. */
export class CacheStateDto {
  @ApiProperty({ description: '캐시 키. 환경 접두어는 빠져 있다.' })
  readonly key!: string;

  @ApiProperty({ description: '지금 캐시에 들어 있나' })
  readonly hit!: boolean;

  @ApiProperty({ nullable: true, description: '만료 시각' })
  readonly expiresAt!: string | null;

  @ApiProperty({ nullable: true, description: '남은 시간(ms)' })
  readonly remainingMs!: number | null;

  @ApiProperty({ nullable: true, description: '캐시에 담긴 값 그대로' })
  readonly value!: unknown;

  @ApiProperty({ description: 'Redis 처럼 프로세스 밖에서 공유되는 캐시인가' })
  readonly shared!: boolean;

  constructor(state: CacheState) {
    this.key = state.key;
    this.hit = state.hit;
    this.expiresAt = state.expiresAt?.toISOString() ?? null;
    this.remainingMs = state.remainingMs;
    this.value = state.value;
    this.shared = state.shared;
  }
}
