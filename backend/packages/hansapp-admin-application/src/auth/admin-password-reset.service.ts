import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestError } from '@hansapp/common';
import { AdminErrorCode } from '../error';

import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AdminStatus } from '@hansapp/data';

import { ADMIN_AUTH_CONFIG } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import { AdminActionLogService } from './admin-action-log.service';
import { normalizeEmail } from './admin-email';
import { AdminPasswordResetRepository } from './admin-password-reset.repository';
import { AdminTokenService } from './admin-token.service';
import type { AdminRequestMeta } from './admin-token.service';
import { AdminUserRepository } from './admin-user.repository';

/**
 * 티켓 수명. **30분.**
 *
 * 메일함에 살아 있는 링크가 곧 위험이라 짧을수록 좋지만, 메일이 도착해 사람이 열어 보기까지
 * 걸리는 시간은 감당해야 한다 — 너무 짧으면 다시 요청하게 되고 그러면 살아 있는 링크만 는다.
 */
const TICKET_TTL_MS = 30 * 60_000;

/** 한 계정이 한 시간에 보낼 수 있는 재설정 메일 수. 메일함을 폭격하는 데 쓰이지 않게. */
const MAX_REQUESTS_PER_HOUR = 5;

/** 발급된 티켓. **토큰 원문은 이때 한 번만 손에 잡힌다** — 저장되는 것은 해시뿐이다. */
export interface AdminPasswordResetTicket {
  readonly email: string;
  readonly name: string | null;
  /** 메일 링크에 실을 값. */
  readonly token: string;
  readonly expiresAt: Date;
}

/** 재설정 화면이 "누구의 비밀번호인지" 를 보여 주기 위해 받는 것. */
export interface AdminPasswordResetTarget {
  /**
   * 가린 이메일(`plz***@gmail.com`).
   *
   * **원문을 안 내보낸다.** 링크를 손에 쥔 사람은 이미 그 메일함 주인이라 새로 알게 되는
   * 것은 없지만, 화면 공유·스크린샷으로 새는 자리를 이만큼 줄인다.
   */
  readonly maskedEmail: string;
  readonly expiresAt: Date;
}

/**
 * 로그인 화면의 "비밀번호 찾기".
 *
 * **이 통로는 메일함을 계정의 열쇠로 만든다.** 관리자 콘솔에서 그 값이 가볍지 않다는 것을
 * 알고 여는 것이라, 대신 조건을 좁혀 둔다:
 *
 *   - 티켓은 **30분·1회용**이고, 새로 요청하면 그 계정의 안 쓴 티켓을 먼저 지운다.
 *   - 토큰 원문은 **저장하지 않는다**(SHA-256 만 둔다).
 *   - 재설정에 성공하면 **살아 있는 세션을 전부 끊는다** — 비밀번호를 잃은 이유가
 *     계정을 빼앗긴 것일 수도 있다.
 *   - 비활성(DISABLED) 계정에는 티켓을 내주지 않는다.
 *   - 메일 발송이 꺼져 있으면 이 기능은 사실상 동작하지 않는다(그 자체로 안전판이다).
 *
 * **토큰이 DB 앞의 문지기다.** 이 경로는 로그인 앞에 열려 있어 아무 값이나 들어오는데,
 * 그때마다 조회가 나가면 링크 하나 흘린 것이 DB 를 두드리는 손잡이가 된다. 토큰 안에
 * 만료를 넣고 서명을 붙여 **모양·만료·서명이 다 맞는 값만** 조회로 넘긴다 —
 * 지어낸 값과 지나간 링크는 DB 를 건드리지 못한다.
 *
 * **계정이 있는지 없는지는 응답으로 흘리지 않는다.** 요청은 언제나 같은 모양으로 끝나고,
 * 무슨 일이 있었는지는 로그에만 남는다 — 로그인 실패 메시지를 하나로 맞춰 둔 것과 같은 이유다.
 */
@Injectable()
export class AdminPasswordResetService {
  /**
   * 토큰 서명 키. **부팅 때 한 번 만든다** — 토큰마다 유도하면 그때마다 HMAC 이 한 번 더 돈다.
   */
  private readonly signingKey: Buffer;

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
    private readonly admins: AdminUserRepository,
    private readonly tickets: AdminPasswordResetRepository,
    private readonly tokens: AdminTokenService,
    private readonly log: AdminActionLogService,
  ) {
    this.signingKey = deriveKey(config.jwtSecret, config.appEnv);
  }

  /**
   * 재설정 티켓을 낸다.
   *
   * @returns 메일로 보낼 것. **보낼 것이 없으면 `null`** 이다(없는 계정·비활성 계정·한도 초과).
   *          부르는 쪽은 어느 경우든 같은 응답을 돌려줘야 한다.
   */
  async issue(rawEmail: string, meta: AdminRequestMeta): Promise<AdminPasswordResetTicket | null> {
    const email = normalizeEmail(rawEmail);
    const admin = await this.admins.findByEmail(email);

    const failReason = !admin
      ? 'admin_not_found'
      : admin.status !== AdminStatus.ACTIVE
        ? 'account_disabled'
        : (await this.tickets.countRecentByAdmin(admin.id, new Date(Date.now() - 3_600_000))) >=
            MAX_REQUESTS_PER_HOUR
          ? 'too_many_requests'
          : null;

    if (failReason || !admin) {
      await this.log.record({
        adminId: admin?.id ?? null,
        email,
        action: 'PASSWORD_RESET_REQUEST',
        result: 'FAIL',
        failReason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return null;
    }

    // 옛 링크를 먼저 죽인다. 한 계정에 살아 있는 티켓은 언제나 하나뿐이다.
    await this.tickets.deleteUnusedByAdmin(admin.id);

    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    const token = buildToken(expiresAt, this.signingKey);

    await this.tickets.create({
      adminId: admin.id,
      tokenHash: hash(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    await this.log.record({
      adminId: admin.id,
      email: admin.email,
      action: 'PASSWORD_RESET_REQUEST',
      result: 'SUCCESS',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { email: admin.email, name: admin.name, token, expiresAt };
  }

  /**
   * 이 링크가 누구의 것인지. **화면이 열릴 때 부른다.**
   *
   * 두 가지를 한 번에 한다:
   *
   *   1. **누구의 비밀번호인지 보여 준다.** 계정을 둘 이상 가진 사람이 엉뚱한 쪽을 바꾸는
   *      사고를 막는다. 이메일은 **가려서** 준다.
   *   2. **링크가 아직 살아 있는지 미리 본다.** 이게 없으면 폼을 다 채우고 누른 뒤에야
   *      만료를 알게 된다.
   *
   * **이메일을 토큰에 담지 않고 여기서 되묻는 이유**는 브라우저가 토큰 속 값을 검증할 수
   * 없기 때문이다 — 아무나 남의 주소를 넣어 링크를 만들면 우리 도메인에서 그 주소가
   * 그대로 보인다. 게다가 URL 에 담긴 값은 기록·공유로 오래 남는다.
   *
   * 이 통로가 "이 토큰이 유효한가" 를 알려 주는 창구가 되기는 한다. 토큰이 256비트 난수라
   * 찍어 맞힐 수 없고 요청 한도도 걸려 있어 실질적인 위험은 없다고 본다.
   */
  async describe(token: string): Promise<AdminPasswordResetTarget> {
    // **DB 앞의 문지기다.** 서명이 안 맞거나 만료된 값은 여기서 끝난다.
    if (!looksValid(token, this.signingKey)) throw invalidLink();

    const ticket = await this.tickets.findByTokenHash(hash(token));
    if (!ticket || ticket.usedAt || ticket.expiresAt.getTime() <= Date.now()) {
      throw invalidLink();
    }

    const admin = await this.admins.findById(ticket.adminId);
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw invalidLink();
    }

    return { maskedEmail: maskEmail(admin.email), expiresAt: ticket.expiresAt };
  }

  /**
   * 티켓을 써서 비밀번호를 다시 세운다.
   *
   * **여기서는 실패 사유를 숨기지 않는다.** 토큰을 손에 쥔 사람에게 "만료됐다" 를 알려 주지
   * 않으면 왜 안 되는지 알 길이 없고, 그 사실이 새어 봐야 얻을 것도 없다 —
   * 계정 존재를 가리는 것(issue)과는 성격이 다르다.
   *
   * **변경 강제 플래그는 풀린다.** 본인이 방금 정한 값이라 다시 바꾸게 할 이유가 없다.
   */
  async consume(token: string, newPassword: string, meta: AdminRequestMeta): Promise<void> {
    // **DB 앞의 문지기다.** 서명이 안 맞거나 만료된 값은 여기서 끝난다.
    if (!looksValid(token, this.signingKey)) throw invalidLink();

    const ticket = await this.tickets.findByTokenHash(hash(token));
    if (!ticket || ticket.usedAt || ticket.expiresAt.getTime() <= Date.now()) {
      throw invalidLink();
    }

    const admin = await this.admins.findById(ticket.adminId);
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw invalidLink();
    }

    /*
      **쓴 것으로 먼저 찍는다.** 비밀번호를 바꾼 뒤에 찍으면 그 사이에 같은 링크로 들어온
      두 번째 요청이 통과한다. 여기서 0 이 돌아오면 다른 요청이 이미 가져간 것이다.
    */
    if ((await this.tickets.markUsed(ticket.id, new Date())) === 0) {
      throw invalidLink();
    }

    await this.admins.updatePassword(
      admin.id,
      await bcrypt.hash(newPassword, this.config.bcryptRounds),
      // 본인이 정한 값이다. 첫 로그인에서 또 바꾸게 할 이유가 없다.
      false,
    );

    /*
      **살아 있는 세션을 전부 끊는다.** 비밀번호를 잃어버린 이유가 계정을 빼앗긴 것일 수도
      있는데, 열려 있던 세션을 남겨 두면 비밀번호를 바꾼 의미가 없다.
    */
    await this.tokens.revokeAllByAdmin(admin.id);

    await this.log.record({
      adminId: admin.id,
      email: admin.email,
      action: 'PASSWORD_RESET',
      result: 'SUCCESS',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

/**
 * 토큰 — `<만료(36진수 초)>.<32바이트 난수>.<서명>`.
 *
 * **DB 를 때리기 전에 토큰만 보고 끝내려고 이 모양을 쓴다.** 이 경로는 로그인 앞에 열려
 * 있어 아무 값이나 들어오는데, 그때마다 조회가 나가면 URL 하나 흘린 것이 곧 DB 를 두드리는
 * 손잡이가 된다. 서명이 맞고 만료도 안 지난 값만 조회로 넘긴다.
 *
 * 초 단위 36진수라 여덟 자면 3000년대까지 간다 — 링크가 그만큼 길어지지 않는다.
 */
function buildToken(expiresAt: Date, key: Buffer): string {
  const seconds = Math.floor(expiresAt.getTime() / 1000).toString(36);
  /*
    **32바이트 난수다.** 사람이 옮겨 적을 값이 아니라 링크에 실려 가는 값이라, 길이를
    아낄 이유가 없다. base64url 이라 URL 에 그대로 들어간다.
  */
  const body = `${seconds}.${randomBytes(32).toString('base64url')}`;
  return `${body}.${sign(body, key)}`;
}

/**
 * 서명·만료만으로 거를 수 있는가. **여기서 false 면 DB 를 부르지 않는다.**
 *
 * 세 가지를 본다: 모양, 만료, 서명. 셋 다 통과해도 **유효하다는 뜻은 아니다** —
 * 이미 썼는지·계정이 살아 있는지는 DB 만 안다. 이건 "볼 가치가 있는 값인가" 까지다.
 */
function looksValid(token: string, key: Buffer): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [seconds, , signature] = parts;
  const expiresAt = Number.parseInt(seconds, 36);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
    return false;
  }

  const expected = sign(`${parts[0]}.${parts[1]}`, key);
  /*
    **timingSafeEqual 이다.** 앞에서부터 한 바이트씩 비교하면 걸린 시간이 "몇 글자까지
    맞았는지" 를 알려 주고, 그걸 반복하면 서명을 한 글자씩 맞춰 나갈 수 있다.
    길이가 다르면 그 함수가 던지므로 먼저 본다.
  */
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 본문 서명(HMAC-SHA256). 값은 base64url 43자다. */
function sign(body: string, key: Buffer): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

/**
 * 서명에 쓰는 키 — `HMAC(admin.jwt.secret, "{환경}:{버전}:{용도}")`.
 *
 * **access token 서명 키를 그대로 쓰지 않는다.** 한 키를 두 곳에 쓰면 한쪽 값이 다른 쪽
 * 자리에서 통하는지를 매번 따져야 하는데, 그 확인은 사람이 잊는 종류다.
 * 같은 비밀에서 갈라 낸 별도 키를 쓰면 그 질문 자체가 없어진다.
 *
 * **환경 이름도 함께 넣는다.** 시크릿은 환경마다 다르게 두는 것이 규칙이지만 실수로 같은
 * 값이 들어가는 일이 실제로 일어난다 — 그때도 개발에서 발행한 링크가 운영의 문지기를
 * 통과하지 못한다. 토큰이 길어지지 않고 환경 이름이 링크에 드러나지도 않는다.
 *
 * (환경이 갈려도 티켓 행은 각 환경의 DB 에만 있으니 비밀번호가 바뀌지는 않았다.
 *  여기서 막는 것은 **남의 환경 DB 까지 질의가 가는 것**이다.)
 */
function deriveKey(jwtSecret: string, appEnv: string): Buffer {
  return createHmac('sha256', jwtSecret).update(`${appEnv}:${KEY_VERSION}:${KEY_PURPOSE}`).digest();
}

/**
 * 키를 가르는 라벨의 조각들. **넓은 것부터 좁은 것 순**으로 이어 붙인다 —
 * `{환경}:{버전}:{용도}`.
 *
 * 환경이 맨 앞인 것은 그것이 가장 바깥 울타리이기 때문이다. 그다음이 형식의 버전이고,
 * 마지막이 이 키가 무엇에 쓰이는지다.
 *
 * **회원번호는 넣지 않는다.** 넣으면 서명을 검증하기 위해 "누구의 토큰인지" 를 먼저 알아야
 * 하고, 그러려면 그 번호가 링크(URL)에 실려 다녀야 한다 — 문지기를 세운 값을 URL 유출로
 * 되돌려 주는 셈이다. 게다가 토큰이 어느 계정의 것인지는 이미 티켓 행이 정하고 있어
 * (token_hash → admin_id), 키를 계정마다 갈라도 새로 막히는 것이 없다.
 */
const KEY_VERSION = 'v1';
const KEY_PURPOSE = 'admin-password-reset';

/**
 * 링크가 안 통할 때의 답.
 *
 * **사유를 가리지 않는다** — 만료됐든, 이미 썼든, 없는 값이든 한 문장이다. 토큰을 쥔
 * 사람에게는 어느 쪽이든 "다시 받으세요" 로 끝나는 일이고, 갈라 주면 유효한 토큰을
 * 찾아 헤매는 쪽에만 단서가 된다.
 */
function invalidLink(): BadRequestError {
  return new BadRequestError(AdminErrorCode.ADMIN_PASSWORD_RESET_LINK_INVALID);
}

/** 저장·대조에 쓰는 값. 원문은 메일로만 나간다. */
function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * 이메일을 가린다 — `plzhans@gmail.com` → `plz***@gmail.com`.
 *
 * **도메인은 그대로 보여 준다.** 본인이 "내 것이 맞다" 를 판단하는 데 가장 크게 거드는
 * 조각이고(회사 메일인지 개인 메일인지가 거기서 갈린다), 남는 정보량은 아이디 앞부분보다 적다.
 *
 * 앞부분은 길이에 따라 남기는 글자를 늘린다 — 짧은 아이디에서 두세 글자를 남기면
 * 사실상 다 보여 주는 셈이 된다.
 *
 *   6자 이상  앞 3자   plzhans → plz***
 *   3자 이상  앞 1자   hans    → h***
 *   그 미만   없음     ab      → ***
 */
function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = local.length >= 6 ? 3 : local.length >= 3 ? 1 : 0;

  return `${local.slice(0, keep)}***@${domain}`;
}
