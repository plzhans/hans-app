import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorType, Page, PostStatus } from '@hansapp/common';
import type { Board, BoardPost } from '@hansapp/data';

import { BoardRepository } from './board.repository';
import { BoardPostCacheInvalidator, type PostCacheState } from './board-post-cache.invalidator';
import { BoardCacheInvalidator } from './board-cache.invalidator';
import { BoardPostRepository, type PostListItem } from './board-post.repository';

/**
 * 글·댓글을 쓴 사람. **세 값이 한 벌이다.**
 *
 * name 은 쓸 당시의 표시 이름을 박아 둔 사본이다 — 목록마다 계정 표를 조인하지 않으려는
 * 것이고, 계정이 지워져도 "누가 썼는지" 가 글에 남는다. 프로필 사진처럼 뒤에 붙을 것도
 * 이 객체 안으로 들어온다.
 */
export interface PostAuthor {
  readonly type: AuthorType;
  /** type 이 정하는 표의 번호(USER=user.id, ADMIN=admin_user.id). */
  readonly id: number;
  readonly name: string;
}

/** 목록 한 줄. **본문은 담지 않는다** — 목록에 필요한 것은 제목과 상태뿐이다. */
export interface PostSummary {
  readonly id: number;
  readonly boardId: number;
  readonly title: string;
  readonly summary: string | null;
  readonly author: PostAuthor;
  /** null = 게시판 설정을 따른다. */
  readonly commentEnabled: boolean | null;
  readonly likeEnabled: boolean | null;
  readonly secret: boolean;
  readonly pinned: boolean;
  readonly status: PostStatus;
  readonly publishedAt: Date | null;
  readonly viewCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PostDetail extends PostSummary {
  /** 본문(마크다운). 편집 화면이 이 값을 그대로 에디터에 넣는다. */
  readonly content: string;
}

export interface PostListOptions {
  readonly boardId: number;
  readonly page: number;
  readonly size: number;
  readonly status?: PostStatus;
  readonly keyword?: string;
}

export interface PostWriteInput {
  readonly title: string;
  readonly content: string;
  readonly summary?: string | null;
  /** null = 게시판 따름. 빠지면(undefined) 수정에서는 그대로 둔다. */
  readonly commentEnabled?: boolean | null;
  readonly likeEnabled?: boolean | null;
  readonly secret?: boolean;
  readonly pinned?: boolean;
  readonly status?: PostStatus;
}

/**
 * 게시글 관리(콘솔).
 *
 * **게시판이 켠 것만 켤 수 있다.** 댓글도 비공개도 게시판이 상위 스위치라, 꺼진 게시판에
 * 글 설정만으로 열리면 게시판 설정이 거짓말이 된다 — 여기서 게시판을 읽어 잘라 낸다.
 */
@Injectable()
export class BoardPostAdminService {
  constructor(
    private readonly posts: BoardPostRepository,
    private readonly boards: BoardRepository,
    private readonly cache: BoardPostCacheInvalidator,
    private readonly boardCache: BoardCacheInvalidator,
  ) {}

  async list(options: PostListOptions): Promise<Page<PostSummary>> {
    await this.mustFindBoard(options.boardId);
    const { page, size } = options;
    const { items, totalCount } = await this.posts.findPage(
      {
        boardId: options.boardId,
        status: options.status,
        keyword: options.keyword,
      },
      (page - 1) * size,
      size,
    );
    return new Page(items.map(toSummary), page, size, totalCount);
  }

  async get(id: number): Promise<PostDetail> {
    const post = await this.mustFind(id);
    return { ...toSummary(post), content: post.content };
  }

  /** 쓴다. **작성자는 부르는 쪽이 확정해 넘긴다**(콘솔이면 지금 로그인한 관리자다). */
  async create(boardId: number, author: PostAuthor, input: PostWriteInput): Promise<PostDetail> {
    const board = await this.mustFindBoard(boardId);
    const status = input.status ?? PostStatus.PUBLISHED;
    const post = await this.posts.create({
      boardId,
      authorType: author.type,
      authorId: author.id,
      authorName: author.name,
      title: input.title.trim(),
      content: input.content,
      summary: input.summary?.trim() || null,
      pinned: input.pinned ?? false,
      status,
      // 공개로 만들면 그 순간이 공개 시각이다. 목록 정렬이 이 값을 본다.
      publishedAt: status === PostStatus.PUBLISHED ? new Date() : null,
      ...decided(board, input),
    });
    // 새 글이라 지울 것이 없어 보이지만, 지웠다 다시 만든 번호가 캐시에 남아 있을 수 있다.
    await this.cache.invalidate(board.name, post.id);
    return { ...toSummary(post), content: post.content };
  }

  async update(id: number, input: PostWriteInput): Promise<PostDetail> {
    const current = await this.mustFind(id);
    const board = await this.mustFindBoard(current.boardId);
    const status: PostStatus = input.status ?? current.status;
    const post = await this.posts.update(id, {
      title: input.title?.trim(),
      content: input.content,
      summary: input.summary === undefined ? undefined : input.summary?.trim() || null,
      pinned: input.pinned,
      status,
      /*
        **한 번 정해진 공개 시각은 그대로 둔다.** 글을 고칠 때마다 새로 찍으면 목록이
        수정 순으로 뒤섞인다 — 내렸다가 다시 올리는 경우에만 새로 찍는다.
      */
      publishedAt:
        status === PostStatus.PUBLISHED && current.publishedAt === null ? new Date() : undefined,
      ...decided(board, {
        commentEnabled:
          input.commentEnabled === undefined ? current.commentEnabled : input.commentEnabled,
        likeEnabled: input.likeEnabled === undefined ? current.likeEnabled : input.likeEnabled,
        secret: input.secret ?? current.secret,
      }),
    });
    await this.cache.invalidate(board.name, post.id);
    return { ...toSummary(post), content: post.content };
  }

  /**
   * 이 글의 공개 캐시를 손으로 지운다.
   *
   * **저장할 때 이미 지운다.** 그래도 통로를 두는 것은, 캐시가 지워졌는지 확신이 안 서는
   * 순간이 실제로 오기 때문이다 — Redis 가 잠깐 끊겼거나, 글이 아니라 게시판 설정만 바꿔
   * 보이는 내용이 달라졌거나. 그때 서버를 만지지 않고 화면에서 해결할 수 있어야 한다.
   */
  /**
   * 이 게시판 글 캐시를 통째로 지운다. 지운 수를 돌려준다.
   *
   * 글 목록 화면에서 한 번에 비우는 통로다 — 글마다 상세로 들어가 지우는 것은 글이
   * 몇 개만 넘어가도 할 짓이 못 된다.
   */
  async purgeBoardPostCache(boardId: number): Promise<number> {
    const board = await this.mustFindBoard(boardId);
    return this.boardCache.invalidatePosts(board.name);
  }

  /** 이 글의 공개 캐시에 무엇이 들어 있나. 지우기 전에 볼 수 있게 둔다. */
  async cacheState(id: number): Promise<PostCacheState> {
    const post = await this.mustFind(id);
    const board = await this.mustFindBoard(post.boardId);
    return this.cache.inspect(board.name, id);
  }

  async purgeCache(id: number): Promise<void> {
    const post = await this.mustFind(id);
    const board = await this.mustFindBoard(post.boardId);
    await this.cache.invalidate(board.name, id);
  }

  async remove(id: number): Promise<void> {
    const post = await this.mustFind(id);
    const board = await this.mustFindBoard(post.boardId);
    await this.posts.softDelete(id);
    // 지운 뒤에 비운다 — 먼저 비우면 그 사이의 조회가 옛 글을 다시 캐시에 올린다.
    await this.cache.invalidate(board.name, id);
  }

  private async mustFind(id: number): Promise<BoardPost> {
    const post = await this.posts.findById(id);
    if (!post) throw new NotFoundException(`Post not found: ${id}`);
    return post;
  }

  private async mustFindBoard(id: number): Promise<Board> {
    const board = await this.boards.findById(id);
    if (!board) throw new NotFoundException(`Board not found: ${id}`);
    return board;
  }
}

/**
 * 글이 고른 값을 **그대로** 저장한다.
 *
 * **게시판 값으로 자르지 않는다.** 잘라 두면 나중에 게시판에서 댓글을 켜도 그전 글은 꺼진
 * 채로 남는다 — 글을 하나하나 고칠 수는 없다. 실제로 열리는지는 읽을 때 계산한다.
 *
 * 비공개만 예외로 거절한다 — 이건 "안 열리는 것" 이 아니라 **사고**다(비공개로 쓴 줄 알았는데
 * 공개로 올라간다). 나머지는 꺼져 있어도 글이 잘못 보이지 않는다.
 */
function decided(
  board: Board,
  input: {
    commentEnabled?: boolean | null;
    likeEnabled?: boolean | null;
    secret?: boolean;
  },
): {
  commentEnabled: boolean | null;
  likeEnabled: boolean | null;
  secret: boolean;
} {
  const secret = input.secret ?? false;
  if (secret && !board.secretPostEnabled) {
    // 조용히 끄지 않고 거절한다 — 비공개로 쓴 줄 알았는데 공개로 올라가면 사고다.
    throw new BadRequestException(
      'This board does not allow secret posts. Enable it on the board first.',
    );
  }
  return {
    commentEnabled: input.commentEnabled ?? null,
    likeEnabled: input.likeEnabled ?? null,
    secret,
  };
}

/*
  **숫자 → enum 은 타입만 다시 입히는 것이다.** 값은 이미 같다(enum 값이 곧 DB 값) —
  Prisma 가 Int 를 number 로 돌려주니 여기서 한 번 좁혀 준다. 이름으로 바꾸는 일은
  HTTP 경계(@EnumField)가 한다.
*/
function toSummary(post: PostListItem): PostSummary {
  return {
    id: post.id,
    boardId: post.boardId,
    title: post.title,
    summary: post.summary,
    author: {
      type: post.authorType,
      id: post.authorId,
      name: post.authorName,
    },
    commentEnabled: post.commentEnabled,
    likeEnabled: post.likeEnabled,
    secret: post.secret,
    pinned: post.pinned,
    status: post.status,
    publishedAt: post.publishedAt,
    viewCount: post.viewCount,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}
