import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import { BoardPostAdminService } from '@hansapp/admin-application';
import { AuthorType } from '@hansapp/common';
import {
  AdminAccountService,
  CurrentAdmin,
} from '@hansapp/admin-application/auth';
import type { AdminAuthUser } from '@hansapp/admin-application/auth';

import {
  PostDetailDto,
  PostListQueryDto,
  PostSummaryDto,
  PostWriteRequestDto,
} from './dto/board-post.dto';

/**
 * 게시글 관리.
 *
 * **목록·쓰기는 게시판 아래에 있다**(`/api/boards/:boardId/posts`) — 글은 게시판의 규칙
 * 안에서만 뜻이 있고, 어느 게시판인지 모르면 댓글·비공개를 켤 수 있는지도 정할 수 없다.
 * 반면 글 하나를 보고 고치는 것은 `/api/posts/:id` 다 — 글 번호만으로 찾아간다.
 */
@ApiTags('board-post')
@Controller('api')
/*
  **응답의 enum 을 이름으로 바꾸는 것은 이 인터셉터다**(@EnumField 의 @Transform 을 실행한다).
  전역으로 켜지 않는다 — 켜는 순간 회원·앱·설정·로그 응답까지 전부 이 직렬화를 타므로,
  커뮤니티부터 쓰고 다른 도메인 enum 을 정리할 때 함께 올린다.
*/
@UseInterceptors(ClassSerializerInterceptor)
export class BoardPostController {
  constructor(
    private readonly posts: BoardPostAdminService,
    private readonly admins: AdminAccountService,
  ) {}

  @Get('boards/:boardId/posts')
  @ApiOperation({
    summary: '게시글 목록',
    description: '고정 글이 먼저, 그다음 공개일 역순.',
  })
  @ApiPageResponse(PostSummaryDto)
  async list(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Query() query: PostListQueryDto,
  ): Promise<PageResponseDto<PostSummaryDto>> {
    const page = await this.posts.list({ boardId, ...query });
    return new PageResponseDto(
      page,
      page.items.map((post) => new PostSummaryDto(post)),
    );
  }

  @Post('boards/:boardId/posts')
  @ApiOperation({
    summary: '게시글 쓰기',
    description: '작성자는 지금 로그인한 관리자다.',
  })
  @ApiOkResponse({ type: PostDetailDto })
  async create(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() body: PostWriteRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<PostDetailDto> {
    /*
      **표시 이름은 쓸 때 박아 둔다**(BoardPost.authorName). 그래서 여기서 한 번 읽는다 —
      목록을 그릴 때마다 관리자 표를 조인하지 않으려는 값이다. 이름을 비워 둔 계정도 있어
      그때는 '관리자' 로 남긴다(공개 화면에는 어차피 HansApp 으로 나간다).
    */
    const account = await this.admins.findById(admin.adminId);
    return new PostDetailDto(
      await this.posts.create(
        boardId,
        {
          type: AuthorType.ADMIN,
          id: admin.adminId,
          name: account?.name?.trim() || '관리자',
        },
        body,
      ),
    );
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '게시글 하나(본문 포함)' })
  @ApiOkResponse({ type: PostDetailDto })
  async get(@Param('id', ParseIntPipe) id: number): Promise<PostDetailDto> {
    return new PostDetailDto(await this.posts.get(id));
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: '게시글 수정' })
  @ApiOkResponse({ type: PostDetailDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PostWriteRequestDto,
  ): Promise<PostDetailDto> {
    return new PostDetailDto(await this.posts.update(id, body));
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '게시글 삭제' })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.posts.remove(id);
  }
}
