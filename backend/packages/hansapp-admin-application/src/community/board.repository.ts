import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import type { Board, Prisma } from '@hansapp/data';

/** 목록 한 줄 — 게시판 + 그 안의 글 수. */
export interface BoardListRow {
  readonly board: Board;
  /** 상태를 가리지 않은 전체 글 수. 삭제를 막을지 정하는 데 쓴다. */
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
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { posts: true } } },
    });
    return rows.map(({ _count, ...board }) => ({
      board,
      postCount: _count.posts,
    }));
  }

  findById(id: number): Promise<Board | null> {
    return this.prisma.board.findUnique({ where: { id } });
  }

  findByName(name: string): Promise<Board | null> {
    return this.prisma.board.findUnique({ where: { name } });
  }

  countPosts(boardId: number): Promise<number> {
    return this.prisma.boardPost.count({ where: { boardId } });
  }

  create(data: Prisma.BoardCreateInput): Promise<Board> {
    return this.prisma.board.create({ data });
  }

  update(id: number, data: Prisma.BoardUpdateInput): Promise<Board> {
    return this.prisma.board.update({ where: { id }, data });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.board.delete({ where: { id } });
  }
}
