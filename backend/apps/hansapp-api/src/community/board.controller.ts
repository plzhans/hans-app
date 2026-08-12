import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import { BoardReadService } from '@hansapp/application';
import { Public } from '@hansapp/auth-application';

import { BOARD_POST_CACHE_CONTROL } from '../common/cache-control';
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
      '비공개 글의 본문은 쓴 사람에게만 나간다 — 나머지에게는 content 가 빠진다.\n\n' +
      '**공개 글에만** `Cache-Control: public, max-age=60` 이 붙는다 — 오래 태우려는 것이 ' +
      '아니라 링크가 퍼질 때의 순간 트래픽을 CDN 이 받아 내기 위한 1분이다. ' +
      '그동안의 조회는 서버에 닿지 않아 조회수도 그만큼 덜 는다. ' +
      '비공개 글은 no-store 라 공유 캐시에 남지 않는다.',
  })
  @ApiOkResponse({ type: PublicPostDetailDto })
  async getPost(
    @Param('name') name: string,
    @Param('id', ParseIntPipe) id: number,
    // passthrough: 헤더만 직접 손대고 본문은 Nest 가 그대로 처리한다(인터셉터도 그대로 탄다).
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicPostDetailDto> {
    /*
      **조회수는 본문을 준 뒤에 센다.** 못 본 글(없거나 비공개)을 봤다고 세면 숫자가
      거짓말이 된다 — getPost 가 던지면 여기까지 오지 않는다.

      로그인한 회원을 넘기는 인자(viewerUserId)는 아직 비워 둔다. 이 라우트는 @Public 이라
      토큰이 없어도 들어오고, 회원 글쓰기가 생길 때 선택적 인증과 함께 채운다.
    */
    const post = await this.boards.getPost(name, id);

    /*
      **캐시는 공개 글에만 건다.** 비공개 글의 응답은 보는 사람에 따라 본문이 있고 없고가
      갈린다 — 지금은 이 라우트가 로그인을 보지 않아 결과가 같지만, viewer 를 받는 순간
      공유 캐시(CDN)에 남은 한 사람의 응답이 다른 사람에게 그대로 나간다. 그 사고는 코드를
      고칠 때 기억해서 막는 것이 아니라 **지금 구조로 막아 둔다.**

      @Header 데코레이터로는 못 한다 — 글을 읽어 봐야 공개인지 알 수 있어 응답마다 값이 다르다.
    */
    res.setHeader(
      'Cache-Control',
      post.secret ? 'no-store' : BOARD_POST_CACHE_CONTROL,
    );

    await this.boards.countView(id);
    return new PublicPostDetailDto(post);
  }
}
