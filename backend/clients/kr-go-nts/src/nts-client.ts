import { getBusinessStatus, validateBusiness } from './generated/nts';
import type {
  BusinessDescription,
  BusinessStatus,
  BusinessValidation,
  StatusResponse,
  ValidateResponse,
} from './generated/model';
import { NtsConfig } from './http';
import { withNtsConfig } from './mutator';

/** 한 번에 요청할 수 있는 최대 건수. 넘기면 TOO_LARGE_REQUEST(HTTP 413). */
const MAX_BATCH = 100;

/**
 * 국세청 사업자등록 진위확인·상태조회 클라이언트 (odcloud.kr).
 *
 * API 응답을 그대로 반환한다. 필드명·코드도 원본 그대로다(b_stt, tax_type_cd). 코드→명칭 매핑,
 * 유효성 판정은 **하지 않는다** — 그건 이 데이터를 쓰는 쪽의 일이고, SDK 가 손대면 원본이
 * 무엇이었는지 알 수 없게 된다.
 * status_code 가 'OK' 가 아니면 mutator 가 NtsError 로 바꿔 던지므로, 성공 응답만 여기로 온다.
 */
export class NtsClient {
  constructor(private readonly config: NtsConfig) {}

  /**
   * 사업자등록 상태조회. 사업자번호만으로 계속/휴업/폐업·과세유형을 조회한다.
   *
   * **등록되지 않은 번호는 에러가 아니라 데이터로 온다** — b_stt 가 비고 tax_type 이
   * '국세청에 등록되지 않은 사업자등록번호입니다' 로 온다. 결과는 요청 순서를 따른다.
   *
   * @param bNos 사업자등록번호('-' 없이 10자리) 목록. 최대 100건.
   */
  async getStatus(bNos: string[]): Promise<StatusResponse> {
    if (bNos.length > MAX_BATCH) {
      throw new Error(
        `NTS 상태조회는 한 번에 최대 ${MAX_BATCH}건이다 (요청: ${bNos.length}건).`,
      );
    }
    const { data } = await getBusinessStatus(
      { b_no: bNos },
      withNtsConfig(this.config),
    );
    return data;
  }

  /** 사업자번호 한 건의 상태만 조회하는 편의 메서드. 없으면 undefined. */
  async getStatusOne(bNo: string): Promise<BusinessStatus | undefined> {
    const { data } = await this.getStatus([bNo]);
    return data?.[0];
  }

  /**
   * 사업자등록정보 진위확인. b_no·start_dt·p_nm 이 **필수**다 — 하나라도 빠지면 API 가
   * REQUEST_DATA_MALFORMED(HTTP 411)로 거부한다.
   *
   * @param businesses 진위확인할 사업자 목록. 최대 100건.
   */
  async validate(businesses: BusinessDescription[]): Promise<ValidateResponse> {
    if (businesses.length > MAX_BATCH) {
      throw new Error(
        `NTS 진위확인은 한 번에 최대 ${MAX_BATCH}건이다 (요청: ${businesses.length}건).`,
      );
    }
    const { data } = await validateBusiness(
      { businesses },
      withNtsConfig(this.config),
    );
    return data;
  }

  /** 사업자 한 건의 진위확인 편의 메서드. 없으면 undefined. */
  async validateOne(
    business: BusinessDescription,
  ): Promise<BusinessValidation | undefined> {
    const { data } = await this.validate([business]);
    return data?.[0];
  }
}
