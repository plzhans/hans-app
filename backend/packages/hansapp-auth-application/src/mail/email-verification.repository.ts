import { Injectable } from '@nestjs/common';
import { EmailVerification, EmailVerifyPurpose, PrismaService } from '@hansapp/data';

/**
 * 이메일 인증 코드(OTP) 저장소. 이메일·코드 원문은 다루지 않고 **HMAC 해시**만 저장/조회한다
 * (해싱은 서비스가 한다 — 이 계층은 해시를 그대로 받는다).
 */
@Injectable()
export class EmailVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    emailHash: string;
    purpose: EmailVerifyPurpose;
    codeHash: string;
    expiresAt: Date;
  }): Promise<EmailVerification> {
    return this.prisma.emailVerification.create({ data: input });
  }

  /** 용도별 가장 최근 코드 1건(소비/만료 무관). 검증·쿨다운 판정에 쓴다. */
  latest(emailHash: string, purpose: EmailVerifyPurpose): Promise<EmailVerification | null> {
    return this.prisma.emailVerification.findFirst({
      where: { emailHash, purpose },
      orderBy: { id: 'desc' },
    });
  }

  /** since 이후 발송 건수(시간당 상한 판정). 용도 무관하게 이메일 기준으로 센다. */
  countSince(emailHash: string, since: Date): Promise<number> {
    return this.prisma.emailVerification.count({
      where: { emailHash, createdAt: { gte: since } },
    });
  }

  /** 검증 시도 1회 증가. */
  incrementAttempts(id: number): Promise<EmailVerification> {
    return this.prisma.emailVerification.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  /** 1회용 소비(성공·시도초과). 아직 소비 안 된 건만 처리하고 count 반환. */
  consume(id: number, at: Date): Promise<number> {
    return this.prisma.emailVerification
      .updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt: at },
      })
      .then((r) => r.count);
  }

  /** 같은 이메일·용도의 미소비 코드를 무효화(재발송 시 이전 코드 폐기). */
  consumeAllActive(emailHash: string, purpose: EmailVerifyPurpose, at: Date): Promise<number> {
    return this.prisma.emailVerification
      .updateMany({
        where: { emailHash, purpose, consumedAt: null },
        data: { consumedAt: at },
      })
      .then((r) => r.count);
  }
}
