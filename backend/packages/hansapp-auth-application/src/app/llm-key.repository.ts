import { Injectable } from '@nestjs/common';
import { AppLlmKey, LlmKeyVerifyState, LlmProvider, Prisma, PrismaService } from '@hansapp/data';

/**
 * 목록·상세에 내려도 되는 열만 고른 프로젝션.
 *
 * **secretEncrypted 를 아예 select 하지 않는다.** 조회 경로에서 잠긴 값을 읽을 일이 없으므로,
 * "실수로 응답에 실렸다" 가 성립하지 못하게 타입 수준에서 끊는다 — 매핑을 조심하는 것보다
 * 애초에 손에 안 들어오게 하는 편이 확실하다. 원문이 필요한 곳은 openSecret() 하나뿐이다.
 */
const VIEW_SELECT = {
  id: true,
  appId: true,
  provider: true,
  name: true,
  secretSuffix: true,
  baseUrl: true,
  defaultModel: true,
  monthlyLimitMicroUsd: true,
  dailyLimitMicroUsd: true,
  fallbackToService: true,
  verifyState: true,
  verifiedAt: true,
  verifyError: true,
  enabled: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AppLlmKeySelect;

/** 잠긴 값을 뺀 업체 키 한 행. */
export type LlmKeyView = Prisma.AppLlmKeyGetPayload<{
  select: typeof VIEW_SELECT;
}>;

/** 앱의 LLM 업체 키 저장소. */
@Injectable()
export class LlmKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 앱의 키 목록. 잠긴 값은 빠져 있다. */
  listByApp(appId: number): Promise<LlmKeyView[]> {
    return this.prisma.appLlmKey.findMany({
      where: { appId },
      select: VIEW_SELECT,
      orderBy: [{ provider: 'asc' }, { name: 'asc' }],
    });
  }

  /** 키 하나. 다른 앱 것이면 null(id 만으로 남의 앱 키에 닿지 못하게 appId 를 함께 건다). */
  findById(appId: number, id: number): Promise<LlmKeyView | null> {
    return this.prisma.appLlmKey.findFirst({
      where: { id, appId },
      select: VIEW_SELECT,
    });
  }

  create(data: Prisma.AppLlmKeyUncheckedCreateInput): Promise<LlmKeyView> {
    return this.prisma.appLlmKey.create({ data, select: VIEW_SELECT });
  }

  update(id: number, data: Prisma.AppLlmKeyUncheckedUpdateInput): Promise<LlmKeyView> {
    return this.prisma.appLlmKey.update({
      where: { id },
      data,
      select: VIEW_SELECT,
    });
  }

  delete(id: number): Promise<void> {
    return this.prisma.appLlmKey.delete({ where: { id } }).then(() => undefined);
  }

  /**
   * 업체를 부르기 직전에 잠긴 값을 꺼낸다. **이 메서드만 secretEncrypted 를 읽는다.**
   * 화면 경로에서는 부르지 않는다 — 부르는 쪽이 원문을 로그·응답에 싣지 않을 책임을 진다.
   */
  openSecret(
    appId: number,
    provider: LlmProvider,
    name: string,
  ): Promise<Pick<AppLlmKey, 'id' | 'secretEncrypted' | 'baseUrl'> | null> {
    return this.prisma.appLlmKey.findUnique({
      where: { appId_provider_name: { appId, provider, name } },
      select: { id: true, secretEncrypted: true, baseUrl: true },
    });
  }

  /**
   * 실사용 결과로 판정을 적는다. **등록이 아니라 여기서만 verifyState 가 바뀐다.**
   * 실패해도 호출 자체를 깨뜨리지 않게, 부르는 쪽이 결과를 기다리지 않아도 되도록 두었다.
   */
  markVerified(
    id: number,
    state: LlmKeyVerifyState,
    error: string | null,
    verifiedAt: Date,
  ): Promise<void> {
    return this.prisma.appLlmKey
      .update({
        where: { id },
        data: {
          verifyState: state,
          verifyError: error,
          verifiedAt,
          lastUsedAt: verifiedAt,
        },
      })
      .then(() => undefined);
  }
}
