import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  ALL_PROFILES_MATCH,
  CachePurgeService,
  SessionPurgeService,
} from '@hansapp/admin-application';
import type { CachePurgeResult, SessionPurgeResult } from '@hansapp/admin-application';

/**
 * 지울 수 있는 캐시 갈래.
 *
 * **패턴을 화면이 정하게 두지 않는다.** 요청이 임의의 패턴을 보낼 수 있으면 오타 하나로
 * 남의 도메인 캐시까지 날아간다 — 이름만 받고 패턴은 서버가 고른다.
 */
const CACHE_TARGETS = {
  /** 공개 게시판 목록과 글 상세. `board:list`·`board:post:*` 를 함께 덮는다. */
  board: '*board:*',
  /** 모든 회원의 내 정보(`/users/me`) 응답. 세션은 여기 안 걸린다. */
  userProfile: ALL_PROFILES_MATCH,
} as const;

type CacheTarget = keyof typeof CACHE_TARGETS;

export class CachePurgeResultDto {
  @ApiProperty({ description: '지운(또는 센) 키 수' })
  readonly removed!: number;

  @ApiProperty({
    description:
      '캐시 저장소가 붙어 있었나. false 면 0 은 "없다" 가 아니라 "볼 수 없다" 는 뜻이다.',
  })
  readonly connected!: boolean;

  constructor(result: CachePurgeResult) {
    this.removed = result.removed;
    this.connected = result.connected;
  }
}

export class SessionPurgeResultDto {
  @ApiProperty({ description: '지운 세션 수' })
  readonly sessions!: number;

  @ApiProperty({ description: '로그아웃된 회원 수' })
  readonly users!: number;

  @ApiProperty({
    description: '지우지 못한 캐시 수. 0 이 아니면 그만큼은 만료까지 통과할 수 있다.',
  })
  readonly cacheLeft!: number;

  constructor(result: SessionPurgeResult) {
    this.sessions = result.sessions;
    this.users = result.users;
    this.cacheLeft = result.cacheLeft;
  }
}

export class MaintenanceSummaryDto {
  @ApiProperty({ description: '게시판 캐시 키 수' })
  readonly board!: number;

  @ApiProperty({ description: '회원 내 정보 캐시 키 수' })
  readonly userProfile!: number;

  @ApiProperty({ description: '살아 있는 로그인 세션 수' })
  readonly sessions!: number;

  @ApiProperty({ description: '캐시 저장소가 붙어 있나' })
  readonly connected!: boolean;

  constructor(input: { board: CachePurgeResult; userProfile: CachePurgeResult; sessions: number }) {
    this.board = input.board.removed;
    this.userProfile = input.userProfile.removed;
    this.sessions = input.sessions;
    this.connected = input.board.connected;
  }
}

/**
 * 정리하기. **서비스 전체를 대상으로 하는 조치들**이 모인 자리다.
 *
 * 회원 상세·게시글 화면에도 같은 성격의 버튼이 있지만 그쪽은 "이 하나" 를 다룬다.
 * 여기 있는 것은 전부 **전부**를 다루므로, 대상을 고르는 화면과 섞지 않는다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 실리지 않게 하려는 것이다.
 */
@ApiTags('admin-maintenance')
@Controller('api/maintenance')
export class MaintenanceController {
  constructor(
    private readonly caches: CachePurgeService,
    private readonly sessions: SessionPurgeService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: '정리 대상 규모',
    description: '무엇을 얼마나 지우게 되는지 누르기 전에 보여 주려는 값이다.',
  })
  @ApiOkResponse({ type: MaintenanceSummaryDto })
  async summary(): Promise<MaintenanceSummaryDto> {
    const [board, userProfile, sessions] = await Promise.all([
      this.caches.count(CACHE_TARGETS.board),
      this.caches.count(CACHE_TARGETS.userProfile),
      this.sessions.count(),
    ]);
    return new MaintenanceSummaryDto({ board, userProfile, sessions });
  }

  @Post('cache/:target/purge')
  @HttpCode(200)
  @ApiOperation({
    summary: '캐시 일괄 삭제',
    description:
      '`board` 는 게시판 목록·글 상세 캐시를, `userProfile` 은 모든 회원의 `/users/me` ' +
      '응답 캐시를 지운다.\n\n' +
      '**API 인스턴스의 메모리 캐시는 지우지 못한다.** 공유 캐시(Redis)만 비우고, 각 ' +
      '인스턴스가 앞에 둔 메모리는 상한(기본 1분)까지 남는다.',
  })
  @ApiParam({ name: 'target', enum: Object.keys(CACHE_TARGETS) })
  @ApiOkResponse({ type: CachePurgeResultDto })
  async purgeCache(@Param('target') target: string): Promise<CachePurgeResultDto> {
    const match = CACHE_TARGETS[target as CacheTarget];
    if (!match) {
      throw new BadRequestException(`Unknown cache target: ${target}`);
    }
    return new CachePurgeResultDto(await this.caches.purge(match));
  }

  @Post('sessions/purge')
  @HttpCode(200)
  @ApiOperation({
    summary: '모든 회원 로그아웃',
    description:
      '모든 회원의 로그인 세션을 폐기한다. 전원이 다시 로그인해야 한다.\n\n' +
      '토큰 형식이나 서명 키를 바꿔 발급돼 있는 것이 의미를 잃었을 때, 또는 유출이 ' +
      '의심될 때 쓰는 비상 통로다.\n\n' +
      '**즉시 전부 막히지는 않는다.** 공유 캐시는 함께 지우지만 각 API 인스턴스의 메모리 ' +
      '캐시는 상한(기본 1분)까지 남는다.',
  })
  @ApiOkResponse({ type: SessionPurgeResultDto })
  async purgeSessions(): Promise<SessionPurgeResultDto> {
    return new SessionPurgeResultDto(await this.sessions.purgeAll());
  }
}
