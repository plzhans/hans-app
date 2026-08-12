import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import { BoardReadService } from '@hansapp/application';
import { Public } from '@hansapp/auth-application';

import {
  PostListQueryDto,
  PublicBoardDto,
  PublicPostDetailDto,
  PublicPostSummaryDto,
} from './dto/board.dto';

/**
 * 포털이 읽는 게시판.
 *
 * **로그인 없이 볼 수 있다**(@Public). 공지사항은 로그인하지 않은 방문자에게도 보여야 하는
 * 것이고, 비공개 글의 본문만 로그인 여부를 따진다.
 *
 * 쓰기·수정·삭제는 여기 없다 — 운영자는 콘솔에서 쓰고, 회원 글쓰기는 아직 없다.
 */
@ApiTags('board')
@Public()
@Controller('boards')
// 응답의 enum 을 이름으로 바꾼다(@EnumField 참고). 전역이 아니라 이 컨트롤러에서만 켠다.
@UseInterceptors(ClassSerializerInterceptor)
export class BoardController {
  constructor(private readonly boards: BoardReadService) {}

  @Get()
  @ApiOperation({
    summary: '게시판 목록',
    description: '공개(ACTIVE)된 게시판만. 포털 메뉴가 이걸로 그려진다.',
  })
  @ApiOkResponse({ type: [PublicBoardDto] })
  async list(): Promise<PublicBoardDto[]> {
    return (await this.boards.listBoards()).map(
      (board) => new PublicBoardDto(board),
    );
  }

  @Get(':name/posts')
  @ApiOperation({
    summary: '게시글 목록',
    description: '공개된 글만. 고정 글이 먼저, 그다음 최신순.',
  })
  @ApiPageResponse(PublicPostSummaryDto)
  async listPosts(
    @Param('name') name: string,
    @Query() query: PostListQueryDto,
  ): Promise<PageResponseDto<PublicPostSummaryDto>> {
    const page = await this.boards.listPosts(name, query.page, query.size);
    return new PageResponseDto(
      page,
      page.items.map((post) => new PublicPostSummaryDto(post)),
    );
  }

  @Get(':name/posts/:id')
  @ApiOperation({
    summary: '게시글 하나',
    description:
      '비공개 글의 본문은 쓴 사람에게만 나간다 — 나머지에게는 content 가 빠진다.',
  })
  @ApiOkResponse({ type: PublicPostDetailDto })
  async getPost(
    @Param('name') name: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PublicPostDetailDto> {
    /*
      **조회수는 본문을 준 뒤에 센다.** 못 본 글(없거나 비공개)을 봤다고 세면 숫자가
      거짓말이 된다 — getPost 가 던지면 여기까지 오지 않는다.

      로그인한 회원을 넘기는 인자(viewerUserId)는 아직 비워 둔다. 이 라우트는 @Public 이라
      토큰이 없어도 들어오고, 회원 글쓰기가 생길 때 선택적 인증과 함께 채운다.
    */
    const post = await this.boards.getPost(name, id);
    await this.boards.countView(id);
    return new PublicPostDetailDto(post);
  }
}
