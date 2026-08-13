import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import type { Board, Prisma } from '@hansapp/data';

/** 목록 한 줄 — 게시판 + 그 안의 글 수. */
export interface BoardListRow {
  readonly board: Board;
  /** 상태를 가리지 않은 글 수(지운 글은 뺀다). */
  readonly postCount: number;
}

/**
 * 게시판 저장소(콘솔).
 *
 * 게시판은 몇 개 되지 않고 화면도 한 장이라 **페이징을 두지 않는다** — 목록은 통째로 준다.
 * 수십 개가 되면 그때 나눈다.
 */
@Injectable()
export class BoardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 전체 목록. 정렬은 화면 순서(sortOrder) 그대로, 같으면 만든 순. */
  async findAll(): Promise<BoardListRow[]> {
    const rows = await this.prisma.board.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        _count: { select: { posts: { where: { deletedAt: null } } } },
      },
    });
    return rows.map(({ _count, ...board }) => ({
      board,
      postCount: _count.posts,
    }));
  }

  /** 지운 게시판만. 최근에 지운 것이 앞. */
  async findDeleted(): Promise<BoardListRow[]> {
    const rows = await this.prisma.board.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: {
        _count: { select: { posts: { where: { deletedAt: null } } } },
      },
    });
    return rows.map(({ _count, ...board }) => ({
      board,
      postCount: _count.posts,
    }));
  }

  findDeletedById(id: number): Promise<Board | null> {
    return this.prisma.board.findFirst({
      where: { id, deletedAt: { not: null } },
    });
  }

  /** 되살린다. 이름은 부르는 쪽이 정해서 준다(비켜 둔 이름을 그대로 쓸 수는 없다). */
  restore(id: number, name: string): Promise<Board> {
    return this.prisma.board.update({
      where: { id },
      data: { deletedAt: null, name },
    });
  }

  findById(id: number): Promise<Board | null> {
    return this.prisma.board.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * 이름으로 찾는다. **지운 게시판은 걸리지 않는다** — 지울 때 이름을 비켜 두기 때문이다
   * (→ retiredName).
   */
  findByName(name: string): Promise<Board | null> {
    return this.prisma.board.findUnique({ where: { name } });
  }

  countPosts(boardId: number): Promise<number> {
    return this.prisma.boardPost.count({
      where: { boardId, deletedAt: null },
    });
  }

  create(data: Prisma.BoardCreateInput): Promise<Board> {
    return this.prisma.board.create({ data });
  }

  update(id: number, data: Prisma.BoardUpdateInput): Promise<Board> {
    return this.prisma.board.update({ where: { id }, data });
  }

  /**
   * 소프트 삭제. **행은 남기고 지운 시각을 세우며, 이름을 비켜 둔다.**
   *
   * 정말로 지우면 FK 가 CASCADE 라 글도 댓글도 함께 사라진다 — 잘못 눌렀을 때 되돌릴 수
   * 없다. 안에 있던 글은 건드리지 않는다(게시판을 되살리면 그대로 돌아온다).
   */
  async softDelete(board: Board): Promise<void> {
    await this.prisma.board.update({
      where: { id: board.id },
      data: { deletedAt: new Date(), name: retiredName(board.name, board.id) },
    });
  }
}

/**
 * 지운 게시판이 쓸 이름. `notice` → `notice_12_deleted`.
 *
 * **name 의 unique 는 지운 행에도 걸린다.** 이름을 그대로 두면 지운 게시판이 그 이름을
 * 영영 쥐고 있어, 같은 이름으로 다시 만들 수 없다. 비켜 두면 살아 있는 것들끼리만
 * 겹치는지 보면 된다.
 *
 * id 를 끼우므로 여러 번 지워도 서로 부딪히지 않는다. 밑줄은 새 이름 규칙
 * (소문자·숫자·하이픈)에 없는 글자라, 이 이름이 정상적인 게시판과 겹칠 일도 없다.
 */
export function retiredName(name: string, id: number): string {
  const suffix = `_${id}_deleted`;
  // 컬럼이 50자다. 넘치면 이름 쪽을 자른다 — 꼬리표가 잘리면 겹치지 않는다는 보장이 깨진다.
  return name.slice(0, NAME_MAX_LENGTH - suffix.length) + suffix;
}

const NAME_MAX_LENGTH = 50;

/**
 * 비켜 둔 이름에서 원래 이름을 되돌린다. `notice_12_deleted` → `notice`.
 *
 * **꼬리표가 맞을 때만 떼어 낸다.** 50자에 걸려 잘렸거나 사람이 손으로 고쳤다면 원래
 * 이름을 알 수 없다 — 그럴 때는 있는 그대로 주고 사람이 정하게 한다.
 */
export function originalName(name: string, id: number): string {
  const suffix = `_${id}_deleted`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
