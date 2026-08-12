import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import type { BoardPost, Prisma } from '@hansapp/data';

export interface PostListFilter {
  readonly boardId: number;
  /** enum 값이 곧 DB 값이라 그대로 넘긴다. */
  readonly status?: number;
  /** 제목 부분 일치. 공백만 있으면 없는 것으로 본다. */
  readonly keyword?: string;
}

/**
 * 게시글 저장소(콘솔).
 *
 * **본문을 목록에 담지 않는다.** 마크다운 원문이 길어 한 페이지를 그리는 데 수십 KB 가
 * 오간다 — 목록이 필요한 것은 제목과 상태뿐이다.
 */
const LIST_SELECT = {
  id: true,
  boardId: true,
  title: true,
  summary: true,
  authorType: true,
  authorId: true,
  authorName: true,
  commentEnabled: true,
  secret: true,
  pinned: true,
  status: true,
  publishedAt: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PostListItem = Omit<BoardPost, 'content'>;

@Injectable()
export class BoardPostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    filter: PostListFilter,
    skip: number,
    take: number,
  ): Promise<{ items: PostListItem[]; totalCount: number }> {
    const where = buildWhere(filter);
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.boardPost.findMany({
        where,
        select: LIST_SELECT,
        // 고정 글이 먼저, 그다음 최신순. 아직 공개 전(publishedAt 없음)이면 만든 순으로 뒤에.
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.boardPost.count({ where }),
    ]);
    return { items, totalCount };
  }

  findById(id: number): Promise<BoardPost | null> {
    return this.prisma.boardPost.findUnique({ where: { id } });
  }

  create(data: Prisma.BoardPostUncheckedCreateInput): Promise<BoardPost> {
    return this.prisma.boardPost.create({ data });
  }

  update(
    id: number,
    data: Prisma.BoardPostUncheckedUpdateInput,
  ): Promise<BoardPost> {
    return this.prisma.boardPost.update({ where: { id }, data });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.boardPost.delete({ where: { id } });
  }
}

function buildWhere(filter: PostListFilter): Prisma.BoardPostWhereInput {
  const keyword = filter.keyword?.trim();
  return {
    boardId: filter.boardId,
    status: filter.status,
    ...(keyword ? { title: { contains: keyword } } : {}),
  };
}
