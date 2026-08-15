import { Get, HttpCode, Param, Post } from '@nestjs/common';
import { BadRequestError } from '@hansapp/common';
import { AdminErrorCode } from '@hansapp/admin-application';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import {
  ALL_PROFILES_MATCH,
  CachePurgeService,
  SessionPurgeService,
} from '@hansapp/admin-application';
import type { CachePurgeResult, SessionPurgeResult } from '@hansapp/admin-application';
import {
  ALL_ADMIN_PROFILES_MATCH,
  ALL_ADMIN_SESSIONS_MATCH,
  AdminSessionPurgeService,
} from '@hansapp/admin-application/auth';
import type { AdminSessionPurgeResult } from '@hansapp/admin-application/auth';

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
  /** 모든 관리자의 내 정보(`/api/admins/me`) 응답. */
  adminProfile: ALL_ADMIN_PROFILES_MATCH,
  /**
   * 모든 관리자의 인증 캐시.
   *
   * **로그아웃이 아니다.** 가드가 이 칸을 못 찾으면 DB 를 다시 읽을 뿐이라, 살아 있는
   * 세션은 그대로 통과한다 — 끊으려면 아래 전체 로그아웃이다.
   */
  adminSession: ALL_ADMIN_SESSIONS_MATCH,
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

export class AdminSessionPurgeResultDto {
  @ApiProperty({ description: '지운 세션 수' })
  readonly sessions!: number;

  @ApiProperty({ description: '로그아웃된 관리자 수' })
  readonly admins!: number;

  @ApiProperty({
    description: '지우지 못한 캐시 수. 0 이 아니면 그만큼은 만료까지 통과할 수 있다.',
  })
  readonly cacheLeft!: number;

  constructor(result: AdminSessionPurgeResult) {
    this.sessions = result.sessions;
    this.admins = result.admins;
    this.cacheLeft = result.cacheLeft;
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

export class CacheCountDto {
  @ApiProperty({ description: '이 패턴에 걸리는 캐시 키 수' })
  readonly count!: number;

  @ApiProperty({
    description:
      '캐시 저장소가 붙어 있었나. false 면 0 은 "없다" 가 아니라 "볼 수 없다" 는 뜻이다.',
  })
  readonly connected!: boolean;

  constructor(result: CachePurgeResult) {
    this.count = result.removed;
    this.connected = result.connected;
  }
}

export class SessionCountDto {
  @ApiProperty({ description: '살아 있는 로그인 세션 수' })
  readonly count!: number;

  constructor(count: number) {
    this.count = count;
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
@ApiTags('maintenance')
@ApiController('api/maintenance')
export class MaintenanceController {
  constructor(
    private readonly caches: CachePurgeService,
    private readonly sessions: SessionPurgeService,
    private readonly adminSessions: AdminSessionPurgeService,
  ) {}

  /*
    **규모는 갈래마다 따로 묻는다.** 한 번에 다 세 주는 통로를 두면 화면을 여는 것만으로
    전체 키스페이스를 갈래 수만큼 훑게 된다 — 세는 비용이 매칭된 키가 아니라 **Redis 에 있는
    모든 키**에 비례하기 때문이다(SCAN 은 MATCH 로 걸러도 전부 한 번씩은 본다).

    실제로 필요한 순간은 "지울까" 를 정하는 그 한 번뿐이라, 그때 그 갈래만 센다.
  */
  @Get('cache/:target/count')
  @ApiOperation({
    summary: '캐시 규모',
    description: '지우기 전에 몇 건인지 본다. 지우지 않고 세기만 한다.',
  })
  @ApiParam({ name: 'target', enum: Object.keys(CACHE_TARGETS) })
  @ApiOkResponse({ type: CacheCountDto })
  async cacheCount(@Param('target') target: string): Promise<CacheCountDto> {
    return new CacheCountDto(await this.caches.count(resolveTarget(target)));
  }

  @Get('sessions/count')
  @ApiOperation({
    summary: '세션 규모',
    description: '살아 있는 로그인 세션 수. 캐시와 달리 DB 한 번으로 끝난다.',
  })
  @ApiOkResponse({ type: SessionCountDto })
  async sessionCount(): Promise<SessionCountDto> {
    return new SessionCountDto(await this.sessions.count());
  }

  @Get('admin-sessions/count')
  @ApiOperation({
    summary: '관리자 세션 규모',
    description: '지금 있는 관리자 로그인 세션 수. 회원 쪽과 마찬가지로 DB 한 번이다.',
  })
  @ApiOkResponse({ type: SessionCountDto })
  async adminSessionCount(): Promise<SessionCountDto> {
    return new SessionCountDto(await this.adminSessions.count());
  }

  @Post('cache/:target/purge')
  @HttpCode(200)
  @ApiOperation({
    summary: '캐시 일괄 삭제',
    description:
      '`board` 는 게시판 목록·글 상세 캐시를, `userProfile` 은 모든 회원의 `/users/me` ' +
      '응답 캐시를, `adminProfile`·`adminSession` 은 관리자의 내 정보·인증 캐시를 지운다.\n\n' +
      '**API 인스턴스의 메모리 캐시는 지우지 못한다.** 공유 캐시(Redis)만 비우고, 각 ' +
      '인스턴스가 앞에 둔 메모리는 상한(기본 1분)까지 남는다.',
  })
  @ApiParam({ name: 'target', enum: Object.keys(CACHE_TARGETS) })
  @ApiOkResponse({ type: CachePurgeResultDto })
  async purgeCache(@Param('target') target: string): Promise<CachePurgeResultDto> {
    return new CachePurgeResultDto(await this.caches.purge(resolveTarget(target)));
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

  @Post('admin-sessions/purge')
  @HttpCode(200)
  @ApiOperation({
    summary: '모든 관리자 로그아웃',
    description:
      '모든 관리자의 로그인 세션을 폐기하고 그 인증 캐시도 함께 비운다.\n\n' +
      '**부른 사람도 함께 나간다.** 관리자 세션에 예외를 두지 않는다 — 자기 자리만 남기면 ' +
      '"전부 끊었다" 가 거짓이 되고, 유출 대응에서는 그 자리가 가장 위험할 수도 있다.\n\n' +
      '회원 쪽과 달리 **곧바로 막힌다** — 가드가 보는 캐시를 같은 프로세스에서 함께 지운다.',
  })
  @ApiOkResponse({ type: AdminSessionPurgeResultDto })
  async purgeAdminSessions(): Promise<AdminSessionPurgeResultDto> {
    return new AdminSessionPurgeResultDto(await this.adminSessions.purgeAll());
  }
}

/** 이름을 패턴으로 바꾼다. 모르는 이름은 400 이다 — 세는 쪽과 지우는 쪽이 같은 판정을 쓴다. */
function resolveTarget(target: string): string {
  const match = CACHE_TARGETS[target as CacheTarget];
  if (!match) {
    throw new BadRequestError(AdminErrorCode.ADMIN_CACHE_TARGET_UNKNOWN);
  }
  return match;
}
