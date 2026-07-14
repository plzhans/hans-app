import { PrismaService } from '@hansapi/data';

/** 원본 코드 → 우리 코드 변환기. 배치 시작 때 한 번 만들어 메모리에 들고 쓴다. */
export class CodeMapper {
  private constructor(
    /** 'class|hira|01' → 'TERTIARY' */
    private readonly codes: Map<string, string>,

    /**
     * HIRA 지역코드 → 우리 코드. **레벨을 키에 넣어야 한다.**
     * 세종은 시도와 시군구에 같은 코드(410000)를 쓴다. 레벨이 없으면 충돌한다.
     * 'hira|sggu|110001' → '11001' · 'hira|sido|110000' → '11'
     * NMC 는 코드가 없어 (시도코드, 시군구이름) 으로 찾는다: 'nmc|11|강남구'
     */
    private readonly regions: Map<string, string>,

    /** 시도 이름 → 우리 시도 코드. NMC 는 지역을 코드로 주지 않아 이름으로 찾는다. */
    private readonly sidoByName: Map<string, string>,
  ) {}

  /**
   * DB 에서 매핑을 읽어 메모리에 올린다. 코드 수백 행이라 부담이 없다.
   *
   * 중복 매핑이 있으면 나중 것이 앞의 것을 덮어써서 **조용히 틀린 코드로 적재된다**.
   * 시드가 이미 막고 있지만(assertNoDuplicateMapping), 여기서도 던진다 —
   * 사람이 DB 를 직접 고쳤을 수 있다.
   */
  static async load(prisma: PrismaService): Promise<CodeMapper> {
    const codes = new Map<string, string>();
    const regions = new Map<string, string>();
    const sidoByName = new Map<string, string>();

    const put = (
      map: Map<string, string>,
      key: string,
      value: string,
    ): void => {
      const owner = map.get(key);
      if (owner !== undefined && owner !== value) {
        throw new Error(`중복 매핑: ${key} → ${owner} / ${value}`);
      }
      map.set(key, value);
    };

    for (const row of await prisma.healthcare_code.findMany()) {
      for (const [src, raw] of [
        ['hira', row.hira_cd],
        ['nmc', row.nmc_cd],
      ] as const) {
        for (const sourceCode of (raw as string[] | null) ?? []) {
          put(codes, `${row.tp}|${src}|${sourceCode}`, row.cd);
        }
      }
    }

    for (const row of await prisma.region_code.findMany()) {
      for (const sourceCode of (row.hira_cd as string[] | null) ?? []) {
        put(regions, `hira|${row.level}|${sourceCode}`, row.cd);
      }
      // NMC 는 코드가 없다. 시군구는 (시도, 시군구) 이름 쌍으로 찾는다 — '중구' 는 여러 시도에 있다.
      for (const name of (row.nmc_nm as string[] | null) ?? []) {
        if (row.level === 'sido') {
          put(sidoByName, name, row.cd);
        } else if (row.parent_cd) {
          put(regions, `nmc|${row.parent_cd}|${name}`, row.cd);
        }
      }
    }

    return new CodeMapper(codes, regions, sidoByName);
  }

  /** 원본 코드 → 우리 코드. 매핑이 없으면 undefined (호출부가 경고를 낸다). */
  code(
    tp: 'class' | 'subject' | 'equipment' | 'severe',
    src: 'hira' | 'nmc',
    sourceCode: string | null | undefined,
  ): string | undefined {
    if (!sourceCode) {
      return undefined;
    }
    return this.codes.get(`${tp}|${src}|${sourceCode}`);
  }

  /**
   * HIRA 시군구코드 → 우리 지역코드.
   * 세종은 시군구가 없어 시도 코드(410000)를 시군구 자리에 그대로 준다. 그래서 시도로도 찾아본다.
   */
  regionByHira(sgguCd: string | null | undefined): string | undefined {
    if (!sgguCd) {
      return undefined;
    }
    return (
      this.regions.get(`hira|sggu|${sgguCd}`) ??
      this.regions.get(`hira|sido|${sgguCd}`)
    );
  }

  /**
   * NMC 시도·시군구 이름 → 우리 지역코드.
   * 시도부터 찾아야 한다 — '중구' 는 서울·부산·대구에 다 있다.
   */
  regionByNmc(
    sidoNm: string | null | undefined,
    sgguNm: string | null | undefined,
  ): string | undefined {
    if (!sidoNm) {
      return undefined;
    }
    const sido = this.sidoByName.get(sidoNm);
    if (!sido || !sgguNm) {
      return sido; // 세종처럼 시군구가 없으면 시도 코드를 준다
    }
    return this.regions.get(`nmc|${sido}|${sgguNm}`) ?? sido;
  }
}
