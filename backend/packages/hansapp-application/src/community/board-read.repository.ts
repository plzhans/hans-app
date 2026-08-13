import { Injectable } from '@nestjs/common';
import { BoardStatus, CommentStatus, PostStatus } from '@hansapp/common';
import { PrismaService } from '@hansapp/data';
import type { Board } from '@hansapp/data';

/** 목록에 필요한 것만. **본문은 빼고 가져온다** — 마크다운 원문이 길다. */
const LIST_SELECT = {
  id: true,
  title: true,
  summary: true,
  authorType: true,
  authorId: true,
  authorName: true,
  pinned: true,
  secret: true,
  commentEnabled: true,
  likeEnabled: true,
  publishedAt: true,
  viewCount: true,
  // 목록에도 댓글 수는 보여 준다. DB 가 세므로 글마다 따로 조회하지 않는다(N+1 회피).
  _count: { select: { comments: { where: { deletedAt: null } } } },
} as const;

/**
 * 포털이 읽는 게시판 저장소. **읽기 전용이다**(조회수만 올린다).
 *
 * 공개 조건(게시판 ACTIVE·글 PUBLISHED)을 **쿼리에 박아 둔다** — 부르는 쪽이 조건을
 * 빠뜨려도 내린 글이 새어 나가지 않게.
 */
@Injectable()
export class BoardReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBoardByName(name: string): Promise<Board | null> {
    return this.prisma.board.findFirst({ where: { name, deletedAt: null } });
  }

  findActiveBoards(): Promise<Board[]> {
    return this.prisma.board.findMany({
      where: { status: BoardStatus.ACTIVE, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async findPublishedPosts(boardId: number, skip: number, take: number) {
    const where = { boardId, status: PostStatus.PUBLISHED, deletedAt: null };
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.boardPost.findMany({
        where,
        select: LIST_SELECT,
        // 고정 글이 먼저, 그다음 최신순.
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.boardPost.count({ where }),
    ]);
    return { items, totalCount };
  }

  /** 글 하나 + 보이는 댓글. 상세는 한 번에 가져온다(relationJoins). */
  findPublishedPost(boardId: number, postId: number) {
    return this.prisma.boardPost.findFirst({
      where: {
        id: postId,
        boardId,
        status: PostStatus.PUBLISHED,
        deletedAt: null,
      },
      include: {
        comments: {
          where: { status: CommentStatus.VISIBLE, deletedAt: null },
          orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async increaseViewCount(postId: number): Promise<void> {
    await this.prisma.boardPost.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 } },
    });
  }
}
