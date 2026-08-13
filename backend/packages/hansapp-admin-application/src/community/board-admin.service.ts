import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BoardStatus, BoardWriteRole } from '@hansapp/common';
import type { Board } from '@hansapp/data';

import { BoardRepository, originalName } from './board.repository';
import { BoardCacheInvalidator } from './board-cache.invalidator';
import type { CacheState } from './cache-sweeper';

/** 이름 규칙: 소문자·숫자·하이픈, 2~50자. 주소에 그대로 실리는 값이다. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

/** 목록 한 줄. */
export interface BoardSummary {
  readonly id: number;
  /** 주소·API 에서 쓰는 이름 */
  readonly name: string;
  /** 화면에 보이는 이름 */
  readonly title: string;
  readonly description: string | null;
  readonly writeRole: BoardWriteRole;
  readonly commentEnabled: boolean;
  readonly likeEnabled: boolean;
  readonly secretPostEnabled: boolean;
  readonly secretCommentEnabled: boolean;
  readonly status: BoardStatus;
  readonly sortOrder: number;
  readonly postCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** 삭제함 한 줄. 되살릴 때 쓸 이름을 미리 계산해서 함께 준다. */
export interface DeletedBoardSummary extends BoardSummary {
  /** 지운 시각. 목록의 정렬 기준이다. */
  readonly deletedAt: Date;
  /**
   * 되살릴 때 채워 줄 이름. 비켜 두기 전의 이름이다.
   *
   * **이 이름이 지금도 비어 있다는 보장은 없다** — 지운 사이에 같은 이름으로 새 게시판을
   * 만들었을 수 있다. 그래서 되살리기는 이름을 다시 받고, 겹치면 거절한다.
   */
  readonly suggestedName: string;
}

/** 만들 때 받는 것. 스위치들은 빠지면 끈 것으로 본다. */
export interface BoardCreateInput {
  readonly name: string;
  readonly title: string;
  readonly description?: string | null;
  readonly writeRole?: BoardWriteRole;
  readonly commentEnabled?: boolean;
  readonly likeEnabled?: boolean;
  readonly secretPostEnabled?: boolean;
  readonly secretCommentEnabled?: boolean;
  readonly status?: BoardStatus;
  readonly sortOrder?: number;
}

/** 고칠 때 받는 것. **빠진 값은 그대로 둔다**(빈 값으로 덮지 않는다). */
export type BoardUpdateInput = Partial<BoardCreateInput>;

/**
 * 게시판 관리(콘솔).
 *
 * **게시판이 그 게시판의 규칙을 들고 있다.** 누가 쓰나·댓글을 받나·비공개를 허용하나가
 * 전부 여기 있고, 글과 댓글의 같은 이름 설정은 이 범위 안에서만 의미가 있다. 그 관계는
 * DB 제약으로 표현할 수 없어 이 서비스가 지킨다 — 상위를 끄면 하위도 같이 끈다.
 */
@Injectable()
export class BoardAdminService {
  constructor(
    private readonly boards: BoardRepository,
    private readonly cache: BoardCacheInvalidator,
  ) {}

  async list(): Promise<BoardSummary[]> {
    const rows = await this.boards.findAll();
    return rows.map(({ board, postCount }) => toSummary(board, postCount));
  }

  async get(id: number): Promise<BoardSummary> {
    const board = await this.mustFind(id);
    return toSummary(board, await this.boards.countPosts(id));
  }

  /** 공개 게시판 목록 캐시 상태. 콘솔의 캐싱 탭이 그대로 그린다. */
  cacheState(): Promise<CacheState> {
    return this.cache.inspectList();
  }

  /** 공개 게시판 목록 캐시만 지운다. 글 캐시는 건드리지 않는다. */
  async purgeListCache(): Promise<void> {
    await this.cache.invalidateList();
  }

  /**
   * 이 게시판과 그 안의 글 캐시를 손으로 지운다. 지운 글 캐시 수를 돌려준다.
   *
   * **바뀔 때마다 서버가 이미 지운다.** 그래도 통로를 두는 것은 Redis 가 잠깐 끊겼거나,
   * 다른 경로로 값이 바뀌어 확신이 안 서는 순간이 실제로 오기 때문이다.
   */
  async purgeCache(id: number): Promise<number> {
    const board = await this.mustFind(id);
    return this.cache.invalidateBoard(board.name);
  }

  /** 삭제함. 되살릴 수 있는 것들이다. */
  async listDeleted(): Promise<DeletedBoardSummary[]> {
    const rows = await this.boards.findDeleted();
    return rows.map(({ board, postCount }) => ({
      ...toSummary(board, postCount),
      // findDeleted 가 지운 것만 주므로 여기서 null 일 수 없다.
      deletedAt: board.deletedAt as Date,
      suggestedName: originalName(board.name, board.id),
    }));
  }

  /**
   * 되살린다. **이름을 다시 받는다.**
   *
   * 지울 때 이름을 비켜 뒀으므로(`notice` → `notice_12_deleted`) 그대로 되돌릴 수는 없고,
   * 그사이 누가 같은 이름으로 새 게시판을 만들었을 수도 있다 — 겹치면 거절한다.
   */
  async restore(id: number, rawName: string): Promise<BoardSummary> {
    const board = await this.boards.findDeletedById(id);
    if (!board) throw new NotFoundException(`Deleted board not found: ${id}`);

    const name = normalizeName(rawName);
    const owner = await this.boards.findByName(name);
    if (owner && owner.id !== id) {
      throw new ConflictException(`Board name already exists: ${name}`);
    }
    const restored = await this.boards.restore(id, name);
    await this.cache.invalidateBoard(name);
    return toSummary(restored, await this.boards.countPosts(id));
  }

  async create(input: BoardCreateInput): Promise<BoardSummary> {
    const name = normalizeName(input.name);
    if (await this.boards.findByName(name)) {
      throw new ConflictException(`Board name already exists: ${name}`);
    }
    const board = await this.boards.create({
      name,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      writeRole: input.writeRole,
      status: input.status,
      sortOrder: input.sortOrder,
      ...switches({
        commentEnabled: input.commentEnabled ?? false,
        likeEnabled: input.likeEnabled ?? false,
        secretPostEnabled: input.secretPostEnabled ?? false,
        secretCommentEnabled: input.secretCommentEnabled ?? false,
      }),
    });
    await this.cache.invalidateList();
    return toSummary(board, 0);
  }

  async update(id: number, input: BoardUpdateInput): Promise<BoardSummary> {
    const current = await this.mustFind(id);

    let name: string | undefined;
    if (input.name !== undefined) {
      name = normalizeName(input.name);
      const owner = await this.boards.findByName(name);
      if (owner && owner.id !== id) {
        throw new ConflictException(`Board name already exists: ${name}`);
      }
    }

    /*
      **스위치는 셋을 함께 본다.** 하나만 바꿔 보내도 나머지의 현재 값과 맞춰 정리해야
      한다 — 댓글을 끄면서 비공개 댓글만 켠 채로 두면 게시판 설정이 앞뒤가 안 맞는다.
    */
    const board = await this.boards.update(id, {
      name,
      title: input.title?.trim(),
      description: input.description === undefined ? undefined : input.description?.trim() || null,
      writeRole: input.writeRole,
      status: input.status,
      sortOrder: input.sortOrder,
      ...switches({
        commentEnabled: input.commentEnabled ?? current.commentEnabled,
        likeEnabled: input.likeEnabled ?? current.likeEnabled,
        secretPostEnabled: input.secretPostEnabled ?? current.secretPostEnabled,
        secretCommentEnabled: input.secretCommentEnabled ?? current.secretCommentEnabled,
      }),
    });
    /*
      **글 캐시까지 지운다.** 글 응답에는 게시판 설정과 합쳐진 값이 들어 있어
      (`board.commentEnabled && (post.commentEnabled ?? true)`), 여기서 댓글을 꺼도
      캐시에 남은 글은 계속 열려 있다고 답한다.

      무엇이 바뀌었는지는 따지지 않는다. 어떤 값이 응답에 영향을 주는지 여기서 가리기
      시작하면, 나중에 그 목록이 늘 때 이 조건도 같이 고쳐야 한다는 것을 아무도 모른다 —
      게시판은 자주 바뀌지 않으니 통째로 지우는 편이 싸다.

      이름이 바뀌면 옛 이름으로 만든 키는 여기서 안 지워지지만, 그 키를 다시 읽을 경로가
      없다(주소가 이름으로 가므로). TTL 이 지나면 사라진다.
    */
    await this.cache.invalidateBoard(current.name);
    if (name && name !== current.name) await this.cache.invalidatePosts(name);
    return toSummary(board, await this.boards.countPosts(id));
  }

  /**
   * 지운다. **소프트 삭제다** — 행은 남고 목록·공개 API 에서만 사라진다.
   *
   * 그전에는 글이 하나라도 있으면 거절했다. DB 의 FK 가 CASCADE 라 진짜로 지우면 글도
   * 댓글도 함께 날아가는데 되돌릴 방법이 없었기 때문이다. 이제 되돌릴 수 있으니 막지
   * 않는다 — 안에 있던 글은 그대로 남아, 게시판을 되살리면 함께 돌아온다.
   *
   * **이름은 비켜 둔다**(`notice` → `notice_12_deleted`). 지운 게시판이 이름을 쥐고 있으면
   * 같은 이름으로 다시 만들 수 없는데, 그건 지웠다는 말과 맞지 않는다.
   */
  async remove(id: number): Promise<void> {
    const board = await this.mustFind(id);
    await this.boards.softDelete(board);
    // 지운 게시판의 글은 이제 공개 API 에서 404 다. 캐시에 남으면 그대로 계속 나간다.
    await this.cache.invalidateBoard(board.name);
  }

  private async mustFind(id: number): Promise<Board> {
    const board = await this.boards.findById(id);
    if (!board) throw new NotFoundException(`Board not found: ${id}`);
    return board;
  }
}

/** 상위가 꺼져 있으면 하위도 끈다. 켤 수 없는 값이 켜진 채 남지 않게. */
function switches(input: {
  commentEnabled: boolean;
  likeEnabled: boolean;
  secretPostEnabled: boolean;
  secretCommentEnabled: boolean;
}) {
  return {
    commentEnabled: input.commentEnabled,
    // 좋아요는 위에 아무것도 없다 — 게시판이 켜면 그것으로 끝이다.
    likeEnabled: input.likeEnabled,
    secretPostEnabled: input.secretPostEnabled,
    // 댓글이 없는 게시판에 "비공개 댓글 허용" 만 남으면 화면이 거짓말을 한다.
    secretCommentEnabled: input.commentEnabled && input.secretCommentEnabled,
  };
}

function normalizeName(raw: string): string {
  const name = raw.trim().toLowerCase();
  if (!NAME_PATTERN.test(name)) {
    throw new BadRequestException(
      'Board name must be 2-50 characters of lowercase letters, digits, or hyphens.',
    );
  }
  return name;
}

function toSummary(board: Board, postCount: number): BoardSummary {
  return {
    id: board.id,
    name: board.name,
    title: board.title,
    description: board.description,
    writeRole: board.writeRole as BoardWriteRole,
    commentEnabled: board.commentEnabled,
    likeEnabled: board.likeEnabled,
    secretPostEnabled: board.secretPostEnabled,
    secretCommentEnabled: board.secretCommentEnabled,
    // DB 는 문자열로 담는다(작은 표라 그대로 읽힌다). 허용 값은 @hansapp/common 이 정한다.
    status: board.status as BoardStatus,
    sortOrder: board.sortOrder,
    postCount,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}
