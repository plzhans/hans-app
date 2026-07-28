import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

/**
 * 통합 비급여 저장소. 읽기에서만 미러(hira_hospital_npay·hira_hospital_detail)를 보고,
 * ykiho 조회를 위해 healthcare_hospital 을, 분류코드 조회를 위해 hira_npay_code 를 읽는다
 * (사유는 HealthcareNonPaymentService 클래스 주석 참고).
 *
 * DB 접근·쿼리 조립만 담당한다. JSON(data) 은 원문 그대로 돌려주고, `row.data as ...` 캐스팅·
 * 그룹핑·출처 판단·큐 연동은 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class HealthcareNonPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 병원의 암호화 요양기호(ykiho)만 뽑는다. 없으면(비활성·미존재) null. */
  findHospitalYkiho(id: number): Promise<{ ykiho: string | null } | null> {
    return this.prisma.healthcareHospital.findUnique({
      where: { id },
      select: { ykiho: true },
    });
  }

  /** 공개 API 미러 전건. sno 가 심평원이 매긴 게시 순서라 그 순서로 정렬한다. */
  findHiraNpay(ykiho: string): Promise<{ data: Prisma.JsonValue }[]> {
    return this.prisma.hiraHospitalNpay.findMany({
      where: { ykiho },
      orderBy: { sno: 'asc' },
      select: { data: true },
    });
  }

  /** npayCd 목록의 분류코드(중분류) 원본 행. Map 조립·필터는 서비스가 한다. */
  findNpayCodeMdiv(
    codes: string[],
  ): Promise<{ cd: string; mdivCd: string | null }[]> {
    return this.prisma.hiraNpayCode.findMany({
      where: { cd: { in: codes } },
      select: { cd: true, mdivCd: true },
    });
  }

  /** 크롤 미러 한 행(기관+op 유니크). 없으면(아직 안 긁음) null. */
  findWebDetail(
    ykiho: string,
    op: string,
  ): Promise<{ data: Prisma.JsonValue } | null> {
    return this.prisma.hiraHospitalDetail.findUnique({
      where: { ykiho_op: { ykiho, op } },
      select: { data: true },
    });
  }
}
