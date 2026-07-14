import { PrismaService } from '@hansapi/data';

/**
 * 동기화 예외(잠금).
 *
 * 병원이 요청해서 사람이 고친 값을 배치가 덮어쓰지 않게 한다.
 * **값을 담지 않는다** — 값은 실제 테이블에만 있고, 이건 "건드리지 마라"는 표시일 뿐이다.
 * 값을 두 곳에 두면 반드시 어긋난다.
 *
 * 잠금 단위가 둘이다.
 *   field = NULL    그 행 전체 (하위 테이블에 적합 — 월요일 진료시간을 통째로 관리)
 *   field = 'tel'   그 컬럼만 (본체에 적합 — 전화만 잠그고 주소·종별은 계속 갱신)
 */
export class HospitalLocks {
  private constructor(
    /** 'healthcare_hospital|22305' → Set('tel', 'name') · 빈 Set 이면 행 전체 잠금 */
    private readonly fields: Map<string, Set<string>>,

    /** 행 전체가 잠긴 것. 'healthcare_hospital_hours|22305|{"day":1,"kind":"general"}' */
    private readonly rows: Set<string>,
  ) {}

  static async load(prisma: PrismaService): Promise<HospitalLocks> {
    const fields = new Map<string, Set<string>>();
    const rows = new Set<string>();

    for (const lock of await prisma.healthcare_hospital_lock.findMany()) {
      const rowKey = HospitalLocks.rowKey(
        lock.table_name,
        lock.hospital_id,
        lock.key_json,
      );

      if (lock.field === null) {
        rows.add(rowKey);
        continue;
      }

      const set = fields.get(rowKey) ?? new Set<string>();
      set.add(lock.field);
      fields.set(rowKey, set);
    }

    return new HospitalLocks(fields, rows);
  }

  /**
   * 행 식별자. 키의 순서가 달라도 같은 행이 되도록 정렬해서 만든다.
   * ({"day":1,"kind":"general"} 와 {"kind":"general","day":1} 은 같은 행이다)
   */
  private static rowKey(
    table: string,
    hospitalId: number,
    keyJson: unknown,
  ): string {
    if (keyJson === null || keyJson === undefined) {
      return `${table}|${hospitalId}`;
    }
    const entries = Object.entries(keyJson as Record<string, unknown>)
      .map(([k, v]) => `${k}=${String(v)}`)
      .sort();
    return `${table}|${hospitalId}|${entries.join(',')}`;
  }

  /** 이 행이 통째로 잠겼나. 빌드가 지우지도 다시 만들지도 않는다. */
  isRowLocked(
    table: string,
    hospitalId: number,
    key?: Record<string, unknown>,
  ): boolean {
    return this.rows.has(HospitalLocks.rowKey(table, hospitalId, key ?? null));
  }

  /** 이 컬럼이 잠겼나. 본체(healthcare_hospital)에서 쓴다. */
  isFieldLocked(table: string, hospitalId: number, field: string): boolean {
    const key = HospitalLocks.rowKey(table, hospitalId, null);
    return this.fields.get(key)?.has(field) === true;
  }

  /** 컬럼이 잠긴 병원 id 들. UPDATE 의 IF() 조건에 쓴다. */
  lockedHospitalsFor(table: string, field: string): Set<number> {
    const ids = new Set<number>();
    for (const [key, set] of this.fields) {
      if (!key.startsWith(`${table}|`) || !set.has(field)) {
        continue;
      }
      const id = Number(key.split('|')[1]);
      if (!Number.isNaN(id)) {
        ids.add(id);
      }
    }
    return ids;
  }

  get size(): number {
    return this.rows.size + this.fields.size;
  }
}
