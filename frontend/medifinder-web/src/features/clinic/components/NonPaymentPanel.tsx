import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Receipt } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { Spinner } from '@/shared/ui/Spinner';
import {
  npayCategory,
  useHospitalNonPayments,
  type NonPaymentItem,
} from '../api';

/**
 * 같은 표준코드(npayCd)로 묶은 한 줄.
 *
 * **한 코드에 여러 행이 오는 게 흔하다**(서울아산 1,048행 → 380코드). 다만 그게 '같은 시술의
 * 가격 폭' 이 아니다 — 병원이 표준코드 하나에 **서로 다른 시술**을 몰아 넣는다. 실측 예:
 * FZ6890000(언어전반진단검사) 한 코드에 구어운동시트 21,000 · 음성검사 45,000 ·
 * 언어평가(복잡) 270,000 이 함께 있다.
 *
 * 그래서 범위(min~max)는 **요약일 뿐 답이 아니다.** 개별 항목(variants)을 반드시 함께 들고
 * 있다가 펼쳐 보여준다. 범위만 남기면 "음성검사 얼마?" 에 답할 수 없다.
 */
interface PriceRow {
  /** 표준 항목코드. 같은 기관 안에서 이 코드로 묶는다. */
  code: string;

  /** 표준 항목명(npayKorNm)에서 대분류를 뗀 나머지. */
  label: string;

  min: number;
  max: number;

  /** 이 코드에 속한 원본 행들. 2개 이상일 때만 펼침이 의미 있다. */
  variants: NonPaymentItem[];
}

/** 대분류 하나. rows 는 원본 순서(sno)를 유지한다. */
interface Category {
  name: string;
  rows: PriceRow[];
}

const amountOf = (item: NonPaymentItem): number => item.curAmt ?? 0;

/**
 * 대분류 → 표준코드 순으로 묶는다. **순서를 바꾸지 않는다** —
 * sno 순서가 곧 병원이 신고한 게시 순서다. 먼저 나온 것이 먼저 온다.
 */
function groupByCategory(items: NonPaymentItem[]): Category[] {
  const categories = new Map<string, Map<string, NonPaymentItem[]>>();

  for (const item of items) {
    const name = npayCategory(item);
    const byCode = categories.get(name) ?? new Map<string, NonPaymentItem[]>();

    /*
      **String() 이 필수다.** npayCd 는 number | string 으로 온다 — 코드가 전부 숫자면
      JSON number 로 뭉개진다(480510000 vs 'ABZ010001'). 그대로 Map 키로 쓰면 480510000 과
      '480510000' 이 다른 키가 되어 같은 항목이 두 줄로 갈라진다.
      없으면 묶을 수 없으니 원본 행을 잃지 않도록 sno 로 혼자 선다.
    */
    const code =
      item.npayCd === undefined || item.npayCd === null
        ? `sno:${item.sno}`
        : String(item.npayCd);
    const bucket = byCode.get(code);
    if (bucket) {
      bucket.push(item);
    } else {
      byCode.set(code, [item]);
    }
    categories.set(name, byCode);
  }

  return [...categories].map(([name, byCode]) => ({
    name,
    rows: [...byCode].map(([code, variants]) => {
      const amounts = variants.map(amountOf);
      return {
        code,
        label: itemLabel(variants[0]),
        min: Math.min(...amounts),
        max: Math.max(...amounts),
        variants,
      };
    }),
  }));
}

/**
 * 항목명. 원본은 '대분류/중분류/소분류' 를 슬래시로 이어 붙여 온다.
 * 대분류는 그룹 제목에 이미 있으므로 뒷부분만 남긴다.
 */
function itemLabel(item: NonPaymentItem): string {
  const full = item.npayKorNm ?? '';
  const rest = full.split('/').slice(1).join(' · ');
  return rest || full;
}

function formatAmount(amount: number | undefined, suffix: string): string {
  if (amount === undefined || amount === null) return '-';
  return `${amount.toLocaleString()}${suffix}`;
}

/**
 * 가격 표시. 값이 하나면 그대로, 여러 개면 최소~최대.
 *
 * **min === max 면 범위로 쓰지 않는다.** 같은 코드에 여러 행이 있어도 값이 같으면
 * "19,425 ~ 19,425원" 이 되어 없는 폭이 있는 것처럼 읽힌다(인천세종의 인플루엔자 검사가 그렇다).
 */
function PriceText({ row }: { row: PriceRow }) {
  const { t } = useTranslation();
  const won = t('clinic.npay.won');

  if (row.min === row.max) {
    return <>{formatAmount(row.min, won)}</>;
  }
  return (
    <>
      {row.min.toLocaleString()}
      <span className="mx-0.5 font-normal text-slate-400">~</span>
      {formatAmount(row.max, won)}
    </>
  );
}

function CategoryBlock({ category }: { category: Category }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-3 text-left"
      >
        <span className="text-sm font-bold text-slate-800">{category.name}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <ul className="!mt-0 list-none space-y-0 pb-2 pl-0">
          {category.rows.map((row) => (
            <PriceRowItem key={row.code} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 표준코드 한 줄. 여러 시술이 묶여 있으면 펼쳐서 개별 가격을 보여준다.
 *
 * **범위만으로 끝내지 않는 이유**는 PriceRow 주석에 있다 — 묶인 것들이 같은 시술의
 * 가격 폭이 아니라 서로 다른 시술이라서, 범위만 보고는 원하는 항목의 값을 알 수 없다.
 */
function PriceRowItem({ row }: { row: PriceRow }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const single = row.variants.length === 1;

  return (
    <li className="py-1.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {single ? (
            <p className="!my-0 text-sm text-slate-700">{row.label}</p>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-expanded={open}
              className="flex items-center gap-1 text-left text-sm text-slate-700 hover:text-primary-700"
            >
              {row.label}
              <span className="shrink-0 text-xs text-slate-400">
                {t('clinic.npay.variants', { count: row.variants.length })}
              </span>
              <ChevronDown
                className={cn(
                  'h-3 w-3 shrink-0 text-slate-400 transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>
          )}

          {/* 병원이 붙인 이름. 한 건뿐일 때만 여기 붙는다 — 여러 건이면 펼침 목록이 대신한다. */}
          {single &&
            row.variants[0].yadmNpayCdNm &&
            row.variants[0].yadmNpayCdNm !== row.label && (
              <p className="!my-0 text-xs text-slate-400">
                {row.variants[0].yadmNpayCdNm}
              </p>
            )}
        </div>

        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
          <PriceText row={row} />
        </span>
      </div>

      {open && !single && (
        <ul className="!mt-1 list-none space-y-0 border-l-2 border-slate-100 pl-3">
          {row.variants.map((item) => (
            // key 는 sno 다. 같은 코드 안에서 이름도 금액도 겹칠 수 있어(유도초음파2(중재술목적)이
            // 두 번 나온다) 그것들로는 유일하지 않다. sno 는 기관 안에서 유일하다.
            <li
              key={item.sno}
              className="flex items-start justify-between gap-3 py-1"
            >
              <span className="min-w-0 text-xs text-slate-500">
                {item.yadmNpayCdNm || row.label}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-600">
                {formatAmount(item.curAmt, t('clinic.npay.won'))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 비급여 진료비 패널.
 *
 * **탭을 눌렀을 때만 호출한다.** 통합 상세 응답에 실려 오지 않는 별도 API 다 —
 * 비급여가 있는 기관이 3,511곳(전체의 4.4%)뿐이라 나머지에게는 헛짐이기 때문이다.
 *
 * **없는 게 정상이다.** 의원은 원본 API 에 통째로 없고(의료법 공개 대상이 병원급 이상이다),
 * 병원급이어도 신고 항목이 없으면 0건이다. 그래서 빈 결과를 오류로 보이지 않게 한다.
 */
export function NonPaymentPanel({ ykiho }: { ykiho: string | undefined }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  // 더보기로 받은 페이지를 쌓아 둔다. 페이지를 갈아끼우면 앞 항목이 사라져
  // 대분류 묶음이 페이지 경계에서 쪼개진다.
  const [loaded, setLoaded] = useState<NonPaymentItem[]>([]);

  const { data, isLoading, isError } = useHospitalNonPayments(ykiho, page);

  const items = useMemo(() => {
    const fetched = data?.items ?? [];
    // 1페이지는 누적본을 신뢰하지 않는다(언어 전환 등으로 다시 받을 수 있다).
    return page === 1 ? fetched : [...loaded, ...fetched];
  }, [data, page, loaded]);

  const categories = useMemo(() => groupByCategory(items), [items]);

  const totalCount = data?.totalCount ?? 0;
  const hasMore = items.length < totalCount;

  if (!ykiho) {
    return <Empty message={t('clinic.npay.empty')} />;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return <Empty message={t('clinic.npay.error')} />;
  }

  if (items.length === 0) {
    return <Empty message={t('clinic.npay.empty')} />;
  }

  return (
    <div>
      <p className="!mt-0 text-xs leading-relaxed text-slate-500">
        {t('clinic.npay.source')}
      </p>

      <div className="mt-3">
        {categories.map((category) => (
          <CategoryBlock key={category.name} category={category} />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => {
            setLoaded(items);
            setPage((prev) => prev + 1);
          }}
          className="mt-4 w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          {t('clinic.npay.more', {
            shown: items.length,
            total: totalCount,
          })}
        </button>
      )}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Receipt className="h-6 w-6 text-slate-300" />
      <p className="!my-0 text-sm text-slate-500">{message}</p>
    </div>
  );
}
