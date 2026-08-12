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
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BoardAdminService } from '@hansapp/admin-application';

import {
  BoardCreateRequestDto,
  BoardDto,
  BoardUpdateRequestDto,
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
@Controller('api/boards')
// 응답의 enum 을 이름으로 바꾸는 인터셉터(@EnumField 참고). 전역이 아니라 여기서만 켠다.
@UseInterceptors(ClassSerializerInterceptor)
export class BoardController {
  constructor(private readonly boards: BoardAdminService) {}

  @Get()
  @ApiOperation({
    summary: '게시판 목록',
    description:
      '순서(sortOrder)대로 전부 준다. 게시판은 수가 적어 페이징이 없다.',
  })
  @ApiOkResponse({ type: [BoardDto] })
  async list(): Promise<BoardDto[]> {
    return (await this.boards.list()).map((board) => new BoardDto(board));
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

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '게시판 삭제',
    description:
      '글이 하나라도 있으면 거절한다. 안 보이게 하려는 것이면 status=HIDDEN 을 쓴다.',
  })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.boards.remove(id);
  }
}
