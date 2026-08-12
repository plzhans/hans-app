import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BoardStatus, BoardWriteRole } from '@hansapp/common';
import type { Board } from '@hansapp/data';

import { BoardRepository } from './board.repository';

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
  readonly secretPostEnabled: boolean;
  readonly secretCommentEnabled: boolean;
  readonly status: BoardStatus;
  readonly sortOrder: number;
  readonly postCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** 만들 때 받는 것. 스위치들은 빠지면 끈 것으로 본다. */
export interface BoardCreateInput {
  readonly name: string;
  readonly title: string;
  readonly description?: string | null;
  readonly writeRole?: BoardWriteRole;
  readonly commentEnabled?: boolean;
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
  constructor(private readonly boards: BoardRepository) {}

  async list(): Promise<BoardSummary[]> {
    const rows = await this.boards.findAll();
    return rows.map(({ board, postCount }) => toSummary(board, postCount));
  }

  async get(id: number): Promise<BoardSummary> {
    const board = await this.mustFind(id);
    return toSummary(board, await this.boards.countPosts(id));
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
        secretPostEnabled: input.secretPostEnabled ?? false,
        secretCommentEnabled: input.secretCommentEnabled ?? false,
      }),
    });
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
      description:
        input.description === undefined
          ? undefined
          : input.description?.trim() || null,
      writeRole: input.writeRole,
      status: input.status,
      sortOrder: input.sortOrder,
      ...switches({
        commentEnabled: input.commentEnabled ?? current.commentEnabled,
        secretPostEnabled: input.secretPostEnabled ?? current.secretPostEnabled,
        secretCommentEnabled:
          input.secretCommentEnabled ?? current.secretCommentEnabled,
      }),
    });
    return toSummary(board, await this.boards.countPosts(id));
  }

  /**
   * 지운다. **글이 하나라도 있으면 거절한다.**
   *
   * DB 의 FK 는 CASCADE 라 지우면 글도 댓글도 함께 사라지는데, 그건 되돌릴 수 없다.
   * 안 보이게 하려는 것이라면 status=HIDDEN 이 그 자리다 — 그쪽은 되돌릴 수 있다.
   */
  async remove(id: number): Promise<void> {
    await this.mustFind(id);
    const posts = await this.boards.countPosts(id);
    if (posts > 0) {
      throw new BadRequestException(
        `Board has ${posts} post(s). Hide it instead of deleting.`,
      );
    }
    await this.boards.delete(id);
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
  secretPostEnabled: boolean;
  secretCommentEnabled: boolean;
}) {
  return {
    commentEnabled: input.commentEnabled,
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
