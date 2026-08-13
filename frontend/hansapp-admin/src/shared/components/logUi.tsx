import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { MultiSelect } from '@/shared/ui/MultiSelect';

/**
 * 로그 화면의 공용 조각.
 *
 * **회원 인증 기록과 관리자 기록이 같은 모양을 쓴다.** 표에 담기는 값은 다르지만
 * 조건을 고르는 방식(기간 칩 + 날짜 두 칸, 종류 선택 상자)과 펼친 상세의 배치는 같다 —
 * 한쪽만 고쳐지면 같은 성격의 화면이 서로 다르게 동작하기 시작한다.
 */

/** 기간 빠른 선택. 값은 "며칠 전부터" 이고, 0 은 전체 기간이다. */
export const PERIODS: { days: number; label: string }[] = [
  { days: 0, label: '전체' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
];

/** `YYYY-MM-DD` 로. 날짜 입력칸이 쓰는 모양이다. */
export function toDateInput(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function daysAgo(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() - days + 1);
  return toDateInput(at);
}

/**
 * 기간 고르기(빠른 선택 칩 + 직접 지정).
 *
 * 값은 `YYYY-MM-DD` 문자열이고, **시간대 변환은 부르는 쪽이 한다** — 화면마다 표시
 * 시간대가 같아야 하지만 그 값을 아는 것은 조회를 만드는 자리다.
 */
export function PeriodFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <Filter label="기간">
      {PERIODS.map((period) => {
        // "전체" 는 두 칸이 모두 비었을 때만 켜진 것으로 본다.
        const active =
          period.days === 0
            ? !from && !to
            : from === daysAgo(period.days) && to === toDateInput(new Date());
        return (
          <Chip
            key={period.days}
            active={active}
            onClick={() =>
              onChange(
                period.days === 0
                  ? { from: '', to: '' }
                  : {
                      from: daysAgo(period.days),
                      to: toDateInput(new Date()),
                    },
              )
            }
          >
            {period.label}
          </Chip>
        );
      })}

      <span className="ml-1 flex items-center gap-1.5">
        <DateInput
          value={from}
          max={to || undefined}
          onChange={(value) => onChange({ from: value, to })}
        />
        <span className="text-sm text-gray-300">~</span>
        <DateInput
          value={to}
          min={from || undefined}
          onChange={(value) => onChange({ from, to: value })}
        />
      </span>
    </Filter>
  );
}

/**
 * 종류 고르기.
 *
 * **종류는 계속 늘어난다.** 인증 이벤트가 아홉 가지, 관리자 조치가 일곱 가지이고 기능이
 * 붙을 때마다 하나씩 는다. 칩으로 늘어놓던 것을 접어 둔 이유가 그것이다 — 항목이 몇 개든
 * 조건 줄의 높이가 같다.
 *
 * 값은 **쉼표로 묶인 문자열**이다. 초안과 URL 이 같은 모양을 써야 뒤로 가기가 성립한다.
 */
export function ActionFilter<T extends string>({
  label = '종류',
  items,
  value,
  onChange,
}: {
  label?: string;
  items: readonly { value: T; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Filter label={label}>
      <MultiSelect
        options={items}
        value={splitCsv(value)}
        onChange={(next) => onChange(next.join(','))}
      />
    </Filter>
  );
}

/** 쉼표로 묶인 조건을 푼다. 빈 문자열은 빈 배열이다 — `''.split(',')` 은 `['']` 이라서. */
export function splitCsv(value: string): string[] {
  return value.split(',').filter(Boolean);
}

/**
 * 검색 버튼 줄. **조건을 감싼 form 의 submit 이다.**
 *
 * 로그 표는 한 번이 무거워 칩을 누를 때마다 질의를 내보내지 않는다 — 조건은 초안으로만
 * 쌓이고 이 버튼에서 한 번에 나간다. 그래서 **바꿔 놓고 안 누른 상태**가 생기는데,
 * 그때 화면의 칩과 아래 표가 어긋나 보이므로 여기서 그렇다고 말해 준다.
 */
export function SearchRow({ dirty }: { dirty: boolean }) {
  return (
    <Filter label="">
      <Button type="submit" className="h-8 w-auto px-5">
        <Search className="h-3.5 w-3.5" />
        검색
      </Button>
      {dirty && (
        <span className="text-xs text-amber-600">
          조건이 바뀌었습니다. 검색을 누르세요.
        </span>
      )}
    </Filter>
  );
}

export function Filter({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-8 shrink-0 text-xs font-semibold text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm transition',
        active
          ? 'bg-primary-50 font-semibold text-primary-700'
          : 'text-gray-500 hover:bg-gray-100',
      )}
    >
      {children}
    </button>
  );
}

export function DateInput({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-gray-300 px-2 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
    />
  );
}

/** 펼친 상세의 한 항목. */
export function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-gray-700">{children}</dd>
    </div>
  );
}

/** 펼친 상세의 한 덩어리(여러 줄짜리 값). */
export function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold text-gray-400">{label}</p>
      {children}
    </div>
  );
}

/** JSON 값을 그대로 펼쳐 보여 준다. 화면은 해석하지 않고 눈으로 읽게 둔다. */
export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
