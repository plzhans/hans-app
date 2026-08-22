import { ApiProperty } from '@nestjs/swagger';
import type {
  HospitalAdminAssessmentGroup,
  HospitalAdminAssessmentItem,
  HospitalAdminBeds,
  HospitalAdminCapability,
  HospitalAdminDetail,
  HospitalAdminEquipment,
  HospitalAdminHours,
  HospitalAdminI18n,
  HospitalAdminStaff,
  HospitalAdminSubject,
  HospitalCacheState,
} from '@hansapp/admin-application';

export class HospitalAdminSubjectDto {
  @ApiProperty() readonly cd!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;
  @ApiProperty() readonly declared!: boolean;
  @ApiProperty({ nullable: true }) readonly doctorCnt!: number | null;
  @ApiProperty({ nullable: true }) readonly specialistCnt!: number | null;

  constructor(row: HospitalAdminSubject) {
    this.cd = row.cd;
    this.name = row.name;
    this.declared = row.declared;
    this.doctorCnt = row.doctorCnt;
    this.specialistCnt = row.specialistCnt;
  }
}

export class HospitalAdminEquipmentDto {
  @ApiProperty() readonly cd!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;
  @ApiProperty({ nullable: true }) readonly cnt!: number | null;

  constructor(row: HospitalAdminEquipment) {
    this.cd = row.cd;
    this.name = row.name;
    this.cnt = row.cnt;
  }
}

export class HospitalAdminCapabilityDto {
  @ApiProperty({ description: 'severe(중증처치) · specialty(전문병원) · special(특수진료)' })
  readonly tp!: string;
  @ApiProperty() readonly cd!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;

  constructor(row: HospitalAdminCapability) {
    this.tp = row.tp;
    this.cd = row.cd;
    this.name = row.name;
  }
}

export class HospitalAdminHoursDto {
  @ApiProperty({ description: 'general(일반) · baby(달빛어린이)' }) readonly kind!: string;
  @ApiProperty({ description: '1~7=월~일, 8=공휴일' }) readonly day!: number;
  @ApiProperty({ nullable: true, description: 'HHMM' }) readonly openTime!: string | null;
  @ApiProperty({ nullable: true, description: 'HHMM' }) readonly closeTime!: string | null;
  @ApiProperty({ nullable: true, description: 'HHMM' }) readonly breakStart!: string | null;
  @ApiProperty({ nullable: true, description: 'HHMM' }) readonly breakEnd!: string | null;
  @ApiProperty({ nullable: true, description: 'HHMM' }) readonly receptionEnd!: string | null;

  constructor(row: HospitalAdminHours) {
    this.kind = row.kind;
    this.day = row.day;
    this.openTime = row.openTime;
    this.closeTime = row.closeTime;
    this.breakStart = row.breakStart;
    this.breakEnd = row.breakEnd;
    this.receptionEnd = row.receptionEnd;
  }
}

export class HospitalAdminStaffDto {
  @ApiProperty({ nullable: true }) readonly doctorTotal!: number | null;
  @ApiProperty({ nullable: true }) readonly specialist!: number | null;
  @ApiProperty({ nullable: true }) readonly resident!: number | null;
  @ApiProperty({ nullable: true }) readonly intern!: number | null;
  @ApiProperty({ nullable: true }) readonly generalDoctor!: number | null;
  @ApiProperty({ nullable: true }) readonly dentist!: number | null;
  @ApiProperty({ nullable: true }) readonly oriental!: number | null;
  @ApiProperty({ nullable: true }) readonly midwife!: number | null;

  constructor(row: HospitalAdminStaff) {
    this.doctorTotal = row.doctorTotal;
    this.specialist = row.specialist;
    this.resident = row.resident;
    this.intern = row.intern;
    this.generalDoctor = row.generalDoctor;
    this.dentist = row.dentist;
    this.oriental = row.oriental;
    this.midwife = row.midwife;
  }
}

export class HospitalAdminBedsDto {
  @ApiProperty({ nullable: true }) readonly total!: number | null;
  @ApiProperty({ nullable: true }) readonly standard!: number | null;
  @ApiProperty({ nullable: true }) readonly higher!: number | null;
  @ApiProperty({ nullable: true }) readonly icu!: number | null;
  @ApiProperty({ nullable: true }) readonly emergency!: number | null;
  @ApiProperty({ nullable: true }) readonly operatingRoom!: number | null;
  @ApiProperty({ nullable: true }) readonly delivery!: number | null;
  @ApiProperty({ nullable: true }) readonly neonatal!: number | null;
  @ApiProperty({ nullable: true }) readonly isolation!: number | null;
  @ApiProperty({ nullable: true }) readonly psyOpen!: number | null;
  @ApiProperty({ nullable: true }) readonly psyClosed!: number | null;

  constructor(row: HospitalAdminBeds) {
    this.total = row.total;
    this.standard = row.standard;
    this.higher = row.higher;
    this.icu = row.icu;
    this.emergency = row.emergency;
    this.operatingRoom = row.operatingRoom;
    this.delivery = row.delivery;
    this.neonatal = row.neonatal;
    this.isolation = row.isolation;
    this.psyOpen = row.psyOpen;
    this.psyClosed = row.psyClosed;
  }
}

export class HospitalAdminI18nDto {
  @ApiProperty() readonly lang!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;
  @ApiProperty({ nullable: true }) readonly intro!: string | null;
  @ApiProperty({ nullable: true }) readonly notice!: string | null;
  @ApiProperty({ nullable: true }) readonly directions!: string | null;

  constructor(row: HospitalAdminI18n) {
    this.lang = row.lang;
    this.name = row.name;
    this.intro = row.intro;
    this.notice = row.notice;
    this.directions = row.directions;
  }
}

export class HospitalAdminAssessmentItemDto {
  @ApiProperty() readonly code!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ description: "원본 그대로('1'~'5'·'등급제외'·천식만 '양호')" })
  readonly grade!: string;

  constructor(row: HospitalAdminAssessmentItem) {
    this.code = row.code;
    this.name = row.name;
    this.grade = row.grade;
  }
}

export class HospitalAdminAssessmentGroupDto {
  @ApiProperty() readonly code!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ type: HospitalAdminAssessmentItemDto, isArray: true })
  readonly items!: HospitalAdminAssessmentItemDto[];

  constructor(row: HospitalAdminAssessmentGroup) {
    this.code = row.code;
    this.name = row.name;
    this.items = row.items.map((item) => new HospitalAdminAssessmentItemDto(item));
  }
}

/** 병원 상세. 화면 구성은 medifinder-web(공개 상세)을 참고했다 — 자세한 내용은 서비스 주석 참고. */
export class HospitalAdminDetailDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly legalName!: string;
  @ApiProperty({ nullable: true }) readonly corpName!: string | null;
  @ApiProperty({ description: "예: 'active'·'closed'" }) readonly status!: string;
  @ApiProperty({ description: 'hira_nmc·hira·nmc·manual' }) readonly source!: string;
  @ApiProperty({ nullable: true }) readonly ykiho!: string | null;
  @ApiProperty({ nullable: true }) readonly hpid!: string | null;
  @ApiProperty({ nullable: true }) readonly classCd!: string | null;
  @ApiProperty({ nullable: true }) readonly className!: string | null;
  @ApiProperty({ nullable: true }) readonly regionCd!: string | null;
  @ApiProperty({ nullable: true }) readonly regionName!: string | null;
  @ApiProperty({ nullable: true }) readonly emdongNm!: string | null;
  @ApiProperty({ nullable: true }) readonly tier!: string | null;
  @ApiProperty({ nullable: true }) readonly addr!: string | null;
  @ApiProperty({ nullable: true }) readonly postNo!: string | null;
  @ApiProperty({ nullable: true }) readonly lat!: number | null;
  @ApiProperty({ nullable: true }) readonly lon!: number | null;
  @ApiProperty({ nullable: true }) readonly tel!: string | null;
  @ApiProperty({ nullable: true }) readonly homepage!: string | null;
  @ApiProperty({ nullable: true }) readonly estbDd!: string | null;
  @ApiProperty({ nullable: true }) readonly intro!: string | null;
  @ApiProperty({ nullable: true }) readonly notice!: string | null;
  @ApiProperty({ nullable: true }) readonly directions!: string | null;
  @ApiProperty({ nullable: true }) readonly parkQty!: number | null;
  @ApiProperty({ nullable: true }) readonly parkPaid!: boolean | null;
  @ApiProperty({ nullable: true, description: '원본 그대로의 JSON({subway,bus,etc})' })
  readonly transport!: unknown;
  @ApiProperty() readonly emergencyYn!: boolean;
  @ApiProperty() readonly babyYn!: boolean;
  @ApiProperty() readonly builtAt!: string;

  @ApiProperty({ type: HospitalAdminSubjectDto, isArray: true })
  readonly subjects!: HospitalAdminSubjectDto[];
  @ApiProperty({ type: HospitalAdminHoursDto, isArray: true })
  readonly hours!: HospitalAdminHoursDto[];
  @ApiProperty({ type: HospitalAdminStaffDto, nullable: true })
  readonly staff!: HospitalAdminStaffDto | null;
  @ApiProperty({ type: HospitalAdminBedsDto, nullable: true })
  readonly beds!: HospitalAdminBedsDto | null;
  @ApiProperty({ type: HospitalAdminEquipmentDto, isArray: true })
  readonly equipments!: HospitalAdminEquipmentDto[];
  @ApiProperty({ type: HospitalAdminCapabilityDto, isArray: true })
  readonly capabilities!: HospitalAdminCapabilityDto[];
  @ApiProperty({ type: HospitalAdminI18nDto, isArray: true })
  readonly i18n!: HospitalAdminI18nDto[];
  @ApiProperty({
    type: HospitalAdminAssessmentGroupDto,
    isArray: true,
    nullable: true,
    description: '평가대상이 아니면(ykiho 없음·미러에 없음) null',
  })
  readonly assessment!: HospitalAdminAssessmentGroupDto[] | null;

  constructor(row: HospitalAdminDetail) {
    this.id = row.id;
    this.name = row.name;
    this.legalName = row.legalName;
    this.corpName = row.corpName;
    this.status = row.status;
    this.source = row.source;
    this.ykiho = row.ykiho;
    this.hpid = row.hpid;
    this.classCd = row.classCd;
    this.className = row.className;
    this.regionCd = row.regionCd;
    this.regionName = row.regionName;
    this.emdongNm = row.emdongNm;
    this.tier = row.tier;
    this.addr = row.addr;
    this.postNo = row.postNo;
    this.lat = row.lat;
    this.lon = row.lon;
    this.tel = row.tel;
    this.homepage = row.homepage;
    this.estbDd = row.estbDd;
    this.intro = row.intro;
    this.notice = row.notice;
    this.directions = row.directions;
    this.parkQty = row.parkQty;
    this.parkPaid = row.parkPaid;
    this.transport = row.transport;
    this.emergencyYn = row.emergencyYn;
    this.babyYn = row.babyYn;
    this.builtAt = row.builtAt;
    this.subjects = row.subjects.map((s) => new HospitalAdminSubjectDto(s));
    this.hours = row.hours.map((h) => new HospitalAdminHoursDto(h));
    this.staff = row.staff && new HospitalAdminStaffDto(row.staff);
    this.beds = row.beds && new HospitalAdminBedsDto(row.beds);
    this.equipments = row.equipments.map((e) => new HospitalAdminEquipmentDto(e));
    this.capabilities = row.capabilities.map((c) => new HospitalAdminCapabilityDto(c));
    this.i18n = row.i18n.map((i) => new HospitalAdminI18nDto(i));
    this.assessment = row.assessment?.map((g) => new HospitalAdminAssessmentGroupDto(g)) ?? null;
  }
}

/** 병원 상세 캐시(공개 API) 한 칸의 상태. 글·회원 캐시 패널과 같은 모양이다. */
export class HospitalCacheStateDto {
  @ApiProperty({ description: '캐시 키. 환경 접두어는 빠져 있다.' })
  readonly key!: string;

  @ApiProperty({ description: '지금 캐시에 들어 있나' })
  readonly hit!: boolean;

  @ApiProperty({ nullable: true, description: '만료 시각' })
  readonly expiresAt!: string | null;

  @ApiProperty({ nullable: true, description: '남은 시간(ms)' })
  readonly remainingMs!: number | null;

  @ApiProperty({
    nullable: true,
    description: '캐시에 담긴 값 그대로(base 만 — i18n 은 언어별이라 안 보여준다)',
  })
  readonly value!: unknown;

  @ApiProperty({ description: 'Redis 처럼 프로세스 밖에서 공유되는 캐시인가' })
  readonly shared!: boolean;

  constructor(state: HospitalCacheState) {
    this.key = state.key;
    this.hit = state.hit;
    this.expiresAt = state.expiresAt?.toISOString() ?? null;
    this.remainingMs = state.remainingMs;
    this.value = state.value;
    this.shared = state.shared;
  }
}
