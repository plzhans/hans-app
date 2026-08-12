import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthorType, Page, PostStatus } from '@hansapp/common';
import type { Board, BoardPost } from '@hansapp/data';

import { BoardRepository } from './board.repository';
import {
  BoardPostRepository,
  type PostListItem,
} from './board-post.repository';

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
  readonly commentEnabled: boolean;
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
  readonly commentEnabled?: boolean;
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
  async create(
    boardId: number,
    author: PostAuthor,
    input: PostWriteInput,
  ): Promise<PostDetail> {
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
      ...clamp(board, input),
    });
    return { ...toSummary(post), content: post.content };
  }

  async update(id: number, input: PostWriteInput): Promise<PostDetail> {
    const current = await this.mustFind(id);
    const board = await this.mustFindBoard(current.boardId);
    const status: PostStatus = input.status ?? current.status;
    const post = await this.posts.update(id, {
      title: input.title?.trim(),
      content: input.content,
      summary:
        input.summary === undefined ? undefined : input.summary?.trim() || null,
      pinned: input.pinned,
      status,
      /*
        **한 번 정해진 공개 시각은 그대로 둔다.** 글을 고칠 때마다 새로 찍으면 목록이
        수정 순으로 뒤섞인다 — 내렸다가 다시 올리는 경우에만 새로 찍는다.
      */
      publishedAt:
        status === PostStatus.PUBLISHED && current.publishedAt === null
          ? new Date()
          : undefined,
      ...clamp(board, {
        commentEnabled: input.commentEnabled ?? current.commentEnabled,
        secret: input.secret ?? current.secret,
      }),
    });
    return { ...toSummary(post), content: post.content };
  }

  async remove(id: number): Promise<void> {
    await this.mustFind(id);
    await this.posts.delete(id);
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

/** 게시판이 끈 기능은 글에서도 꺼진 값으로 저장한다. 켤 수 없는 값이 켜진 채 남지 않게. */
function clamp(
  board: Board,
  input: { commentEnabled?: boolean; secret?: boolean },
): { commentEnabled: boolean; secret: boolean } {
  const commentEnabled = input.commentEnabled ?? true;
  const secret = input.secret ?? false;
  if (secret && !board.secretPostEnabled) {
    // 조용히 끄지 않고 거절한다 — 비공개로 쓴 줄 알았는데 공개로 올라가면 사고다.
    throw new BadRequestException(
      'This board does not allow secret posts. Enable it on the board first.',
    );
  }
  return {
    commentEnabled: board.commentEnabled && commentEnabled,
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
    secret: post.secret,
    pinned: post.pinned,
    status: post.status,
    publishedAt: post.publishedAt,
    viewCount: post.viewCount,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}
