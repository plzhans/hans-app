import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  AuthorType,
  BoardStatus,
  Page,
  PostStatus,
  type BoardWriteRole,
} from '@hansapp/common';

import { BoardReadRepository } from './board-read.repository';

/** 운영자 글에 붙는 이름. **관리자 실명을 밖으로 내보내지 않는다.** */
const OPERATOR_NAME = 'HansApp';

/** 글 상세 캐시 TTL(ms). 1시간. 글이 바뀌면 관리자 쪽이 키를 지우므로 길게 잡아도 된다. */
const POST_CACHE_TTL_MS = 60 * 60_000;

/**
 * 글 상세 캐시 키.
 *
 * **관리자 계층도 같은 형식을 써야 지운다**(BoardPostCacheInvalidator). 그쪽은 이 계층을
 * 의존하지 않아 형식을 한 번 더 적어 두었다 — 여기를 고치면 그쪽도 같이 고쳐야 한다.
 * 환경 네임스페이스(`develop:`)는 CacheModule 이 붙이므로 여기서는 붙이지 않는다.
 */
export const boardPostCacheKey = (boardName: string, postId: number) =>
  `board:post:${boardName}:${postId}`;

export interface PublicAuthor {
  readonly type: AuthorType;
  /**
   * 쓴 사람 번호. 회원 글이면 회원번호다.
   *
   * **운영자 글은 0 이다** — 관리자 번호는 밖에서 쓸 일이 없고, 내보내면 관리자가 몇 명인지가
   * 드러난다. 화면이 구별해야 하는 것은 "운영자가 썼다" 는 사실(type)뿐이다.
   */
  readonly id: number;
  /** 운영자는 언제나 HansApp, 회원은 쓸 당시의 표시 이름. */
  readonly name: string;
}

export interface PublicBoard {
  readonly name: string;
  readonly title: string;
  readonly description: string | null;
  readonly writeRole: BoardWriteRole;
  readonly commentEnabled: boolean;
  readonly likeEnabled: boolean;
}

/** 댓글 한 줄. 비공개 댓글은 볼 수 없는 사람에게 content 가 오지 않는다. */
export interface PublicComment {
  readonly id: number;
  readonly parentId: number | null;
  readonly author: PublicAuthor;
  readonly content: string | null;
  readonly secret: boolean;
  readonly createdAt: Date;
}

export interface PublicPostSummary {
  readonly id: number;
  readonly title: string;
  readonly summary: string | null;
  readonly author: PublicAuthor;
  readonly pinned: boolean;
  /** 비공개 글인가. true 면 본문을 못 보는 사람에게는 content 가 오지 않는다. */
  readonly secret: boolean;
  /** **계산된 값이다** — 게시판이 켜고 글이 끄지 않았을 때만 true. */
  readonly commentEnabled: boolean;
  readonly likeEnabled: boolean;
  readonly publishedAt: Date | null;
  readonly viewCount: number;
  readonly commentCount: number;
}

export interface PublicPostDetail extends PublicPostSummary {
  /** 본문(마크다운). **볼 수 없는 비공개 글이면 null 이다.** */
  readonly content: string | null;
  readonly comments: PublicComment[];
}

/**
 * 포털이 읽는 게시판.
 *
 * **공개된 것만 나간다.** 게시판은 ACTIVE, 글은 PUBLISHED 만 본다 — 콘솔에서 내린 것과
 * 작성 중인 것이 주소를 안다고 열리면 "내린다" 는 말이 뜻을 잃는다.
 *
 * **비공개 글은 목록에는 남기고 본문만 뺀다.** 글이 있었다는 사실까지 지우면 번호가 비어
 * 보이고, 쓴 사람은 자기 글이 사라진 줄 안다. 본문은 **응답에 담지 않는다** — 화면에서
 * 가리는 방식은 개발자도구를 여는 순간 다 읽힌다.
 */
@Injectable()
export class BoardReadService {
  constructor(
    private readonly boards: BoardReadRepository,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /** 공개된 게시판 목록. 포털의 메뉴가 이걸로 그려진다. */
  async listBoards(): Promise<PublicBoard[]> {
    const rows = await this.boards.findActiveBoards();
    return rows.map((board) => ({
      name: board.name,
      title: board.title,
      description: board.description,
      writeRole: board.writeRole as BoardWriteRole,
      commentEnabled: board.commentEnabled,
      likeEnabled: board.likeEnabled,
    }));
  }

  /**
   * 게시판 하나의 글 목록.
   *
   * 게시판은 **번호가 아니라 이름으로 찾는다** — 포털 주소가 `/board/notice` 로 읽히고,
   * 번호를 노출하면 게시판이 몇 개인지가 그대로 드러난다.
   */
  async listPosts(
    boardName: string,
    page: number,
    size: number,
  ): Promise<Page<PublicPostSummary>> {
    const board = await this.mustFindBoard(boardName);
    const { items, totalCount } = await this.boards.findPublishedPosts(
      board.id,
      (page - 1) * size,
      size,
    );
    return new Page(
      items.map((post) => toSummary(post, board)),
      page,
      size,
      totalCount,
    );
  }

  /**
   * 글 하나.
   *
   * @param viewerUserId 지금 보고 있는 회원(로그인 안 했으면 undefined). 비공개 글의
   *   본문을 줄지 정하는 데만 쓴다.
   */
  async getPost(
    boardName: string,
    postId: number,
    viewerUserId?: number,
  ): Promise<PublicPostDetail> {
    const board = await this.mustFindBoard(boardName);

    /*
      **캐시는 공개 글만 태운다.** 비공개 글은 보는 사람에 따라 본문이 갈리므로 한 사람의
      응답을 남겨 두면 다음 사람에게 그대로 나간다(Cache-Control 과 같은 이유).
      TTL 이 한 시간이나 되는 것은 글이 바뀔 때 관리자 쪽이 이 키를 지우기 때문이다 —
      시간에 기대 낡은 것을 털어 내는 것이 아니라, 바뀐 순간 지운다.
    */
    const key = boardPostCacheKey(boardName, postId);
    const cached = await this.cache?.get<CachedPost>(key);
    if (cached) return revive(cached);

    const post = await this.boards.findPublishedPost(board.id, postId);
    if (!post) throw new NotFoundException(`Post not found: ${postId}`);

    /*
      비공개 글의 본문은 쓴 사람만 본다(운영자는 콘솔에서 본다 — 공개 API 에 관리자용
      통로를 내지 않는다). 볼 수 없으면 **응답에서 아예 뺀다**.
    */
    const canRead =
      !post.secret || isSelf(post.authorType, post.authorId, viewerUserId);

    const detail: PublicPostDetail = {
      ...toSummary(
        { ...post, _count: { comments: post.comments.length } },
        board,
      ),
      content: canRead ? post.content : null,
      comments: post.comments.map((comment) => ({
        id: comment.id,
        parentId: comment.parentId,
        author: toAuthor(
          comment.authorType,
          comment.authorId,
          comment.authorName,
        ),
        // 비공개 댓글의 본문도 같은 규칙이다 — 쓴 사람과 글쓴이만 본다.
        content:
          !comment.secret ||
          isSelf(comment.authorType, comment.authorId, viewerUserId) ||
          isSelf(post.authorType, post.authorId, viewerUserId)
            ? comment.content
            : null,
        secret: comment.secret,
        createdAt: comment.createdAt,
      })),
    };

    if (!detail.secret) {
      await this.cache?.set(key, detail, POST_CACHE_TTL_MS);
    }
    return detail;
  }

  /** 조회수 +1. **본문을 준 다음에 센다** — 못 본 글을 봤다고 세지 않는다. */
  async countView(postId: number): Promise<void> {
    await this.boards.increaseViewCount(postId);
  }

  private async mustFindBoard(name: string) {
    const board = await this.boards.findBoardByName(name);
    if (!board || (board.status as BoardStatus) !== BoardStatus.ACTIVE) {
      throw new NotFoundException(`Board not found: ${name}`);
    }
    return board;
  }
}

/**
 * 캐시에서 꺼낸 값. **Date 가 문자열로 돌아온다** — Redis 에 JSON 으로 담기기 때문이다.
 * 꺼낼 때 되살리지 않으면 DTO 의 `toISOString()` 에서 터진다.
 */
type CachedPost = Omit<PublicPostDetail, 'publishedAt' | 'comments'> & {
  publishedAt: Date | string | null;
  comments: (Omit<PublicComment, 'createdAt'> & {
    createdAt: Date | string;
  })[];
};

function revive(cached: CachedPost): PublicPostDetail {
  return {
    ...cached,
    publishedAt: cached.publishedAt ? new Date(cached.publishedAt) : null,
    comments: cached.comments.map((comment) => ({
      ...comment,
      createdAt: new Date(comment.createdAt),
    })),
  };
}

/**
 * 운영자면 이름을 HansApp 으로 덮고 번호를 감춘다(위 PublicAuthor 주석 참고).
 *
 * **인자를 enum 으로 받는다.** Prisma 는 number 를 주지만 숫자 enum 에는 그대로 대입되고,
 * 이렇게 두면 안에서 비교할 때 캐스팅이 필요 없다(number 끼리 비교하면 lint 가 막는다).
 */
function toAuthor(type: AuthorType, id: number, name: string): PublicAuthor {
  const operator = type === AuthorType.ADMIN;
  return {
    type,
    id: operator ? 0 : id,
    name: operator ? OPERATOR_NAME : name,
  };
}

/** 지금 보는 사람이 그 글·댓글을 쓴 본인인가. 회원 글에만 해당한다. */
function isSelf(type: AuthorType, id: number, viewerUserId?: number): boolean {
  return (
    type === AuthorType.USER &&
    viewerUserId !== undefined &&
    id === viewerUserId
  );
}

function toSummary(
  post: {
    id: number;
    title: string;
    summary: string | null;
    authorType: number;
    authorId: number;
    authorName: string;
    pinned: boolean;
    secret: boolean;
    commentEnabled: boolean | null;
    likeEnabled: boolean | null;
    publishedAt: Date | null;
    viewCount: number;
    _count: { comments: number };
  },
  board: { commentEnabled: boolean; likeEnabled: boolean },
): PublicPostSummary {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    author: toAuthor(post.authorType, post.authorId, post.authorName),
    pinned: post.pinned,
    secret: post.secret,
    /*
      **여기가 유효값을 정하는 자리다.** 게시판이 상위 스위치이고, 글은 그 안에서 끌 수만
      있다 — 글이 null 이면 게시판을 따른다(그래서 게시판을 켜면 옛 글도 함께 열린다).
    */
    commentEnabled: board.commentEnabled && (post.commentEnabled ?? true),
    likeEnabled: board.likeEnabled && (post.likeEnabled ?? true),
    publishedAt: post.publishedAt,
    viewCount: post.viewCount,
    commentCount: post._count.comments,
  };
}

export { PostStatus };
