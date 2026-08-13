import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { EmailVerifyPurpose } from '@hansapp/data';

import { OTP_CONFIG } from './mail.config';
import type { OtpConfig } from './mail.config';
import { EmailVerificationRepository } from './email-verification.repository';
import { AuthEmailService } from './auth-email.service';
import { hmacSha256hex, randomNumericCode, timingSafeEqualHex } from '@hansapp/common';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 이메일 인증 코드(OTP) 발급·검증. **가입 전(계정 없음) 단계에서도 쓰므로 이메일 기준**이다.
 *
 * 저장은 원문이 아니라 pepper(서버 시크릿)로 HMAC 한 해시만 남긴다 — 유출돼도 미가입 이메일이
 * 수집되지 않게, 6자리 코드가 브루트포스로 복원되지 않게. 발급은 시간당 상한·재발송 쿨다운으로,
 * 검증은 시도 횟수 제한·단회용으로 무차별 대입을 막는다.
 *
 * 발급(issue)만 하고 실제 메일 발송은 상위(AuthEmailService)가 반환된 코드로 수행한다.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(OTP_CONFIG) private readonly config: OtpConfig,
    private readonly repo: EmailVerificationRepository,
    private readonly mail: AuthEmailService,
  ) {}

  private hash(value: string): string {
    return hmacSha256hex(value, this.config.hashSecret);
  }

  /**
   * 코드 발급 + 이메일 발송. 컨트롤러가 쓰는 진입점이다.
   * 발송 상한/쿨다운은 issue 에서 검사하므로, 상한 초과 시 메일은 나가지 않는다.
   */
  async issueAndSend(
    purpose: EmailVerifyPurpose,
    email: string,
    opts: { userName?: string | null; locale?: string } = {},
  ): Promise<void> {
    const { code, expiresInSec } = await this.issue(purpose, email);
    await this.mail.sendVerificationCode({
      purpose,
      to: email,
      code,
      expiresInSec,
      userName: opts.userName,
      locale: opts.locale,
    });
  }

  /**
   * 코드 발급. 시간당 상한·쿨다운을 넘으면 429 를 던진다. 이전 미소비 코드는 무효화한다.
   * 반환된 code 를 상위가 이메일로 보낸다(원문은 여기서만 존재하고 저장되지 않는다).
   */
  async issue(
    purpose: EmailVerifyPurpose,
    email: string,
  ): Promise<{ code: string; expiresInSec: number }> {
    const emailHash = this.hash(normalizeEmail(email));
    const now = new Date();

    // 시간당 발송 상한(용도 무관, 이메일 기준).
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const sent = await this.repo.countSince(emailHash, since);
    if (sent >= this.config.maxSendsPerHour) {
      throw new HttpException(
        'Too many verification emails. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 재발송 쿨다운(직전 발송으로부터 최소 간격).
    const last = await this.repo.latest(emailHash, purpose);
    if (last) {
      const elapsedSec = (now.getTime() - last.createdAt.getTime()) / 1000;
      if (elapsedSec < this.config.resendCooldownSec) {
        throw new HttpException(
          'A code was sent recently. Please wait before requesting another.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 이전 미소비 코드를 무효화(항상 최신 코드 1개만 유효).
    await this.repo.consumeAllActive(emailHash, purpose, now);

    const code = randomNumericCode(this.config.codeLength);
    const expiresAt = new Date(now.getTime() + this.config.ttlSec * 1000);
    await this.repo.create({
      emailHash,
      purpose,
      codeHash: this.hash(code),
      expiresAt,
    });

    return { code, expiresInSec: this.config.ttlSec };
  }

  /**
   * 코드 검증. 최신 코드가 미소비·미만료이고 시도 한도 내이며 값이 일치하면 true.
   * 성공 시 코드를 소비하고, 시도 한도를 넘기면 코드를 폐기한다.
   */
  async verify(purpose: EmailVerifyPurpose, email: string, code: string): Promise<boolean> {
    const emailHash = this.hash(normalizeEmail(email));
    const now = new Date();

    const record = await this.repo.latest(emailHash, purpose);
    if (!record || record.consumedAt || record.expiresAt <= now) {
      return false;
    }

    // 시도 한도 초과 → 코드 폐기(재발급 필요).
    if (record.attempts >= this.config.maxAttempts) {
      await this.repo.consume(record.id, now);
      return false;
    }

    await this.repo.incrementAttempts(record.id);

    const ok = timingSafeEqualHex(this.hash(code), record.codeHash);
    if (ok) {
      await this.repo.consume(record.id, now);
      return true;
    }
    return false;
  }
}
