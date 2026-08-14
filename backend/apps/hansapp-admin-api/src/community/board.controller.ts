import {
  Body,
  ClassSerializerInterceptor,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import { BoardAdminService } from '@hansapp/admin-application';

import {
  BoardCreateRequestDto,
  BoardDto,
  BoardRestoreRequestDto,
  BoardUpdateRequestDto,
  CachePurgeResultDto,
  CacheStateDto,
  DeletedBoardDto,
} from './dto/board.dto';

/**
 * 게시판 관리.
 *
 * **게시판이 그 게시판의 규칙을 들고 있다** — 누가 쓰나·댓글을 받나·비공개를 허용하나.
 * 글과 댓글에도 같은 이름의 설정이 있지만 여기서 켠 범위 안에서만 의미가 있다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 */
@ApiTags('board')
@ApiController('api/boards')
// 응답의 enum 을 이름으로 바꾸는 인터셉터(@EnumField 참고). 전역이 아니라 여기서만 켠다.
@UseInterceptors(ClassSerializerInterceptor)
export class BoardController {
  constructor(private readonly boards: BoardAdminService) {}

  @Get()
  @ApiOperation({
    summary: '게시판 목록',
    description: '순서(sortOrder)대로 전부 준다. 게시판은 수가 적어 페이징이 없다.',
  })
  @ApiOkResponse({ type: [BoardDto] })
  async list(): Promise<BoardDto[]> {
    const boards = await this.boards.list();
    return boards.map((board) => new BoardDto(board));
  }

  /*
   **`:id` 보다 먼저 와야 한다.** 아래에 두면 'deleted' 를 id 로 읽으려다 400 이 난다.
   */
  @Get('deleted')
  @ApiOperation({
    summary: '삭제함',
    description: '지운 게시판. 되살릴 때 채워 줄 이름(suggestedName)을 함께 준다.',
  })
  @ApiOkResponse({ type: [DeletedBoardDto] })
  async listDeleted(): Promise<DeletedBoardDto[]> {
    const boards = await this.boards.listDeleted();
    return boards.map((board) => new DeletedBoardDto(board));
  }

  /* 'deleted' 와 같은 이유로 ':id' 보다 먼저 온다. */
  @Get('cache')
  @ApiOperation({
    summary: '게시판 목록 캐시 상태',
    description: '포털이 쓰는 공개 게시판 목록 캐시(board:list). 값과 만료 시각을 준다.',
  })
  @ApiOkResponse({ type: CacheStateDto })
  async cacheState(): Promise<CacheStateDto> {
    return new CacheStateDto(await this.boards.cacheState());
  }

  @Post('cache/purge')
  @HttpCode(204)
  @ApiOperation({
    summary: '게시판 목록 캐시 삭제',
    description:
      '게시판 목록 캐시만 지운다. 글 캐시는 그대로다 — 그쪽은 게시판별 캐시 삭제를 쓴다.',
  })
  @ApiNoContentResponse()
  async purgeListCache(): Promise<void> {
    await this.boards.purgeListCache();
  }

  @Get(':id')
  @ApiOperation({ summary: '게시판 하나' })
  @ApiOkResponse({ type: BoardDto })
  async get(@Param('id', ParseIntPipe) id: number): Promise<BoardDto> {
    return new BoardDto(await this.boards.get(id));
  }

  @Post()
  @ApiOperation({ summary: '게시판 추가' })
  @ApiOkResponse({ type: BoardDto })
  async create(@Body() body: BoardCreateRequestDto): Promise<BoardDto> {
    return new BoardDto(await this.boards.create(body));
  }

  @Patch(':id')
  @ApiOperation({
    summary: '게시판 수정',
    description: '보낸 값만 바꾼다. 빠진 값은 그대로 둔다.',
  })
  @ApiOkResponse({ type: BoardDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BoardUpdateRequestDto,
  ): Promise<BoardDto> {
    return new BoardDto(await this.boards.update(id, body));
  }

  @Post(':id/restore')
  @ApiOperation({
    summary: '게시판 되살리기',
    description:
      '지운 게시판을 목록으로 되돌린다. 이름을 다시 받으며, 이미 쓰는 이름이면 거절한다.',
  })
  @ApiOkResponse({ type: BoardDto })
  async restore(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BoardRestoreRequestDto,
  ): Promise<BoardDto> {
    return new BoardDto(await this.boards.restore(id, body.name));
  }

  @Post(':id/cache/purge')
  @ApiOperation({
    summary: '이 게시판 캐시 삭제',
    description:
      '게시판 목록 캐시와 이 게시판 글들의 상세 캐시를 함께 지운다. ' +
      '게시판을 고치면 서버가 이미 지우므로 평소에는 부를 일이 없다.',
  })
  @ApiOkResponse({ type: CachePurgeResultDto })
  async purgeCache(@Param('id', ParseIntPipe) id: number): Promise<CachePurgeResultDto> {
    return new CachePurgeResultDto(await this.boards.purgeCache(id));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '게시판 삭제',
    description:
      '목록에서 내린다. 데이터는 남아 삭제함에서 되살릴 수 있다. 안에 있던 글도 함께 가려진다.',
  })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.boards.remove(id);
  }
}
