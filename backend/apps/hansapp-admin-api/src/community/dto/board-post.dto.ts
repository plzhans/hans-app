import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EnumField } from '@hansapp/http-common';
import { AuthorType, PostStatus } from '@hansapp/common';
import type {
  PostAuthor,
  PostCacheState,
  PostDetail,
  PostSummary,
} from '@hansapp/admin-application';

/**
 * 쓴 사람. **한 객체로 내려보낸다** — 프로필 사진처럼 뒤에 붙을 것이 여기 들어온다.
 * 필드를 흩어 두면 화면마다 다시 모아야 한다.
 */
export class PostAuthorDto {
  @EnumField(AuthorType) readonly type!: AuthorType;
  @ApiProperty({ description: 'type 이 정하는 표의 번호' })
  readonly id!: number;
  @ApiProperty({ description: '쓸 당시의 표시 이름' }) readonly name!: string;

  constructor(author: PostAuthor) {
    this.type = author.type;
    this.id = author.id;
    this.name = author.name;
  }
}

export class PostListQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({
    description: '페이지 크기',
    default: 20,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly size: number = 20;

  @EnumField(PostStatus, { optional: true, description: '상태로 거른다' })
  readonly status?: PostStatus;

  @ApiPropertyOptional({ description: '제목 부분 일치' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly keyword?: string;
}

/** 쓰기·수정 공통. **수정도 본문을 통째로 받는다** — 에디터가 통째로 들고 있다. */
export class PostWriteRequestDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title!: string;

  @ApiProperty({ description: '본문(마크다운)' })
  @IsString()
  readonly content!: string;

  @ApiPropertyOptional({ description: '목록용 한 줄 요약', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  readonly summary?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      '이 글에 댓글을 받을지. **null 이면 게시판 설정을 따른다**(기본). ' +
      '게시판이 꺼져 있으면 true 로 둬도 실제로는 열리지 않는다.',
  })
  @IsOptional()
  @IsBoolean()
  readonly commentEnabled?: boolean | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '이 글에 좋아요를 받을지. null 이면 게시판 설정을 따른다.',
  })
  @IsOptional()
  @IsBoolean()
  readonly likeEnabled?: boolean | null;

  @ApiPropertyOptional({
    default: false,
    description: '비공개 글. 게시판이 허용하지 않으면 거절한다.',
  })
  @IsOptional()
  @IsBoolean()
  readonly secret?: boolean;

  @ApiPropertyOptional({ default: false, description: '목록 맨 위 고정' })
  @IsOptional()
  @IsBoolean()
  readonly pinned?: boolean;

  @EnumField(PostStatus, { optional: true, default: 'PUBLISHED' })
  readonly status?: PostStatus;
}

export class PostSummaryDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly boardId!: number;
  @ApiProperty() readonly title!: string;
  @ApiProperty({ nullable: true }) readonly summary!: string | null;
  @ApiProperty({ type: PostAuthorDto }) readonly author!: PostAuthorDto;
  @ApiProperty({ nullable: true, description: 'null = 게시판 따름' })
  readonly commentEnabled!: boolean | null;
  @ApiProperty({ nullable: true, description: 'null = 게시판 따름' })
  readonly likeEnabled!: boolean | null;
  @ApiProperty() readonly secret!: boolean;
  @ApiProperty() readonly pinned!: boolean;
  @EnumField(PostStatus) readonly status!: PostStatus;
  @ApiProperty({ nullable: true }) readonly publishedAt!: string | null;
  @ApiProperty() readonly viewCount!: number;
  @ApiProperty() readonly createdAt!: string;
  @ApiProperty() readonly updatedAt!: string;

  /*
    **클래스 인스턴스로 만든다.** 객체 리터럴이면 ClassSerializerInterceptor 가 손댈 것이
    없어 @EnumField 의 변환이 실행되지 않는다.
  */
  constructor(post: PostSummary) {
    this.id = post.id;
    this.boardId = post.boardId;
    this.title = post.title;
    this.summary = post.summary;
    this.author = new PostAuthorDto(post.author);
    this.commentEnabled = post.commentEnabled;
    this.likeEnabled = post.likeEnabled;
    this.secret = post.secret;
    this.pinned = post.pinned;
    this.status = post.status;
    this.publishedAt = post.publishedAt?.toISOString() ?? null;
    this.viewCount = post.viewCount;
    this.createdAt = post.createdAt.toISOString();
    this.updatedAt = post.updatedAt.toISOString();
  }
}

export class PostDetailDto extends PostSummaryDto {
  @ApiProperty({ description: '본문(마크다운)' }) readonly content!: string;

  constructor(post: PostDetail) {
    super(post);
    this.content = post.content;
  }
}

/** 이 글의 공개 캐시 상태. 콘솔 캐싱 탭이 그대로 그린다. */
export class PostCacheStateDto {
  @ApiProperty({ description: '캐시 키. 환경 접두어는 빠져 있다.' })
  readonly key!: string;

  @ApiProperty({ description: '지금 캐시에 들어 있나' })
  readonly hit!: boolean;

  @ApiProperty({ nullable: true, description: '만료 시각' })
  readonly expiresAt!: string | null;

  @ApiProperty({ nullable: true, description: '남은 시간(ms)' })
  readonly remainingMs!: number | null;

  @ApiProperty({
    nullable: true,
    description: '캐시에 담긴 값 그대로. 없으면 null.',
  })
  readonly value!: unknown;

  @ApiProperty({
    description:
      'Redis 처럼 프로세스 밖에서 공유되는 캐시인가. false 면 이 프로세스의 메모리라, ' +
      '공개 API 가 다른 프로세스면 그쪽 캐시는 여기서 보이지도 지워지지도 않는다.',
  })
  readonly shared!: boolean;

  constructor(state: PostCacheState) {
    this.key = state.key;
    this.hit = state.hit;
    this.expiresAt = state.expiresAt?.toISOString() ?? null;
    this.remainingMs = state.remainingMs;
    this.value = state.value;
    this.shared = state.shared;
  }
}
