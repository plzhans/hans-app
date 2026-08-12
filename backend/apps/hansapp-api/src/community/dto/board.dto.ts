import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthorType, BoardWriteRole } from '@hansapp/common';
import { EnumField } from '@hansapp/http-common';
import type {
  PublicAuthor,
  PublicBoard,
  PublicComment,
  PublicPostDetail,
  PublicPostSummary,
} from '@hansapp/application';

export class PostListQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ description: '페이지 크기', default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly size: number = 20;
}

export class PublicBoardDto {
  @ApiProperty({ description: '주소에 쓰는 이름' }) readonly name!: string;
  @ApiProperty({ description: '화면에 보이는 이름' }) readonly title!: string;
  @ApiProperty({ nullable: true }) readonly description!: string | null;
  @EnumField(BoardWriteRole, { description: '글을 쓸 수 있는 사람' })
  readonly writeRole!: BoardWriteRole;
  @ApiProperty({ description: '댓글을 받는 게시판인가' })
  readonly commentEnabled!: boolean;

  constructor(board: PublicBoard) {
    this.name = board.name;
    this.title = board.title;
    this.description = board.description;
    this.writeRole = board.writeRole;
    this.commentEnabled = board.commentEnabled;
  }
}

/** 쓴 사람. **운영자는 이름이 HansApp 이고 번호가 0 이다**(실명·관리자 번호를 안 내보낸다). */
export class PublicAuthorDto {
  @EnumField(AuthorType) readonly type!: AuthorType;
  @ApiProperty({ description: '회원 글이면 회원번호, 운영자 글이면 0' })
  readonly id!: number;
  @ApiProperty() readonly name!: string;

  constructor(author: PublicAuthor) {
    this.type = author.type;
    this.id = author.id;
    this.name = author.name;
  }
}

export class PublicPostSummaryDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly title!: string;
  @ApiProperty({ nullable: true }) readonly summary!: string | null;
  @ApiProperty({ type: PublicAuthorDto }) readonly author!: PublicAuthorDto;
  @ApiProperty() readonly pinned!: boolean;
  @ApiProperty({ description: '비공개 글인가' }) readonly secret!: boolean;
  @ApiProperty() readonly commentEnabled!: boolean;
  @ApiProperty({ nullable: true }) readonly publishedAt!: string | null;
  @ApiProperty() readonly viewCount!: number;
  @ApiProperty() readonly commentCount!: number;

  constructor(post: PublicPostSummary) {
    this.id = post.id;
    this.title = post.title;
    this.summary = post.summary;
    this.author = new PublicAuthorDto(post.author);
    this.pinned = post.pinned;
    this.secret = post.secret;
    this.commentEnabled = post.commentEnabled;
    this.publishedAt = post.publishedAt?.toISOString() ?? null;
    this.viewCount = post.viewCount;
    this.commentCount = post.commentCount;
  }
}

/** 댓글 한 줄. 비공개 댓글은 볼 수 없으면 content 가 빠진다. */
export class PublicCommentDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty({ nullable: true, description: '답글이면 부모 댓글 번호' })
  readonly parentId!: number | null;
  @ApiProperty({ type: PublicAuthorDto }) readonly author!: PublicAuthorDto;
  @ApiPropertyOptional({ nullable: true }) readonly content!: string | null;
  @ApiProperty() readonly secret!: boolean;
  @ApiProperty() readonly createdAt!: string;

  constructor(comment: PublicComment) {
    this.id = comment.id;
    this.parentId = comment.parentId;
    this.author = new PublicAuthorDto(comment.author);
    this.content = comment.content;
    this.secret = comment.secret;
    this.createdAt = comment.createdAt.toISOString();
  }
}

export class PublicPostDetailDto extends PublicPostSummaryDto {
  /** 본문(마크다운). **볼 수 없는 비공개 글이면 아예 오지 않는다.** */
  @ApiPropertyOptional({ description: '본문(마크다운)' })
  readonly content?: string | null;

  @ApiProperty({ type: [PublicCommentDto] })
  readonly comments!: PublicCommentDto[];

  constructor(post: PublicPostDetail) {
    super(post);
    this.content = post.content;
    this.comments = post.comments.map(
      (comment) => new PublicCommentDto(comment),
    );
  }
}
