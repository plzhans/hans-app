import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  type HiraHospital,
  type HiraHospitalAsm,
  type HiraHospitalDetail,
  type HiraHospitalNpay,
} from '@hansapi/data';

/**
 * HIRA 원본 미러 저장소. 병원·비급여·병원평가·의원 top5 테이블을 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. row.data 를 원본 item 타입으로
 * 읽는 캐스팅·envelope 조립은 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class HiraHospitalRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 병원 한 페이지. 기관기호 오름차순으로 정렬한다. */
  listHospitals(page: number, size: number): Promise<HiraHospital[]> {
    return this.prisma.hiraHospital.findMany({
      orderBy: { ykiho: 'asc' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  countHospitals(): Promise<number> {
    return this.prisma.hiraHospital.count();
  }

  /** 병원 1건. 기관기호로 찾는다. */
  getHospital(ykiho: string): Promise<HiraHospital | null> {
    return this.prisma.hiraHospital.findUnique({
      where: { ykiho },
    });
  }

  /** 한 기관의 비급여 진료비 한 페이지. sno(원본 신고 순번) 오름차순으로 정렬한다. */
  listNonPayments(
    ykiho: string,
    page: number,
    size: number,
  ): Promise<HiraHospitalNpay[]> {
    return this.prisma.hiraHospitalNpay.findMany({
      where: { ykiho },
      orderBy: { sno: 'asc' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  countNonPayments(ykiho: string): Promise<number> {
    return this.prisma.hiraHospitalNpay.count({ where: { ykiho } });
  }

  /** 한 기관의 병원평가 등급 1건. 기관기호로 찾는다. */
  getAssessment(ykiho: string): Promise<HiraHospitalAsm | null> {
    return this.prisma.hiraHospitalAsm.findUnique({
      where: { ykiho },
    });
  }

  /** 의원 진료 상위질병 5개 1건. (ykiho, op='top5') 복합키로 찾는다. */
  getClinicTop5(ykiho: string): Promise<HiraHospitalDetail | null> {
    return this.prisma.hiraHospitalDetail.findUnique({
      where: { ykiho_op: { ykiho, op: 'top5' } },
    });
  }
}
