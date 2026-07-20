import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Receipt, RefreshCw } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { Spinner } from '@/shared/ui/Spinner';
import {
  npayGroup,
  NPAY_GROUP_ORDER,
  type NpayGroupKey,
} from '../lib/npayGroup';
import {
  useHospitalNonPayments,
  useNonPaymentRequest,
  type NonPaymentCategory,
  type NonPaymentItem,
  type NonPaymentPrice,
} from '../api';

function formatAmount(amount: number | undefined, suffix: string): string {
  if (amount === undefined || amount === null) return '-';
  return `${amount.toLocaleString()}${suffix}`;
}

/**
 * 가격 표시. 값이 하나면 그대로, 폭이 있으면 최소~최대.
 *
 * **min === max 면 범위로 쓰지 않는다.** 같은 코드에 여러 행이 있어도 값이 같으면
 * "19,425 ~ 19,425원" 이 되어 없는 폭이 있는 것처럼 읽힌다(인천세종의 인플루엔자 검사가 그렇다).
 */
function PriceText({ price }: { price: NonPaymentPrice }) {
  const { t } = useTranslation();
  const won = t('clinic.npay.won');

  if (price.min === price.max) {
    return <>{formatAmount(price.min, won)}</>;
  }
  return (
    <>
      {price.min.toLocaleString()}
      <span className="mx-0.5 font-normal text-slate-400">~</span>
      {formatAmount(price.max, won)}
    </>
  );
}

function CategoryBlock({ category }: { category: NonPaymentCategory }) {
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
          {category.items.map((item) => (
            <PriceRowItem key={item.code} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 표준코드 한 줄. 여러 시술이 묶여 있으면 펼쳐서 개별 가격을 보여준다.
 *
 * **범위만으로 끝내지 않는다.** 한 코드에 여러 행이 오는 게 흔한데(서울아산 1,048행 → 380코드),
 * 그게 '같은 시술의 가격 폭' 이 아니다 — 병원이 표준코드 하나에 **서로 다른 시술**을 몰아 넣는다.
 * 실측 예: FZ6890000(언어전반진단검사) 한 코드에 구어운동시트 21,000 · 음성검사 45,000 ·
 * 언어평가(복잡) 270,000 이 함께 있다. 범위만 남기면 "음성검사 얼마?" 에 답할 수 없다.
 *
 * **details 가 0개일 수 있다.** 원본이 처음부터 범위만 주는 출처(의원급)가 그렇다. 그때는
 * 펼칠 게 없으니 범위만 보여준다 — 0개짜리 펼침 버튼을 만들지 않는다.
 */
function PriceRowItem({ item }: { item: NonPaymentItem }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { details } = item.price;
  const expandable = details.length > 1;
  const only = details.length === 1 ? details[0] : undefined;

  return (
    <li className="py-1.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {expandable ? (
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-expanded={open}
              className="flex items-center gap-1 text-left text-sm text-slate-700 hover:text-primary-700"
            >
              {item.name}
              <span className="shrink-0 text-xs text-slate-400">
                {t('clinic.npay.variants', { count: details.length })}
              </span>
              <ChevronDown
                className={cn(
                  'h-3 w-3 shrink-0 text-slate-400 transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>
          ) : (
            <p className="!my-0 text-sm text-slate-700">{item.name}</p>
          )}

          {/* 병원이 붙인 이름. 한 건뿐일 때만 여기 붙는다 — 여러 건이면 펼침 목록이 대신한다. */}
          {only && only.name && only.name !== item.name && (
            <p className="!my-0 text-xs text-slate-400">{only.name}</p>
          )}
        </div>

        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
          <PriceText price={item.price} />
        </span>
      </div>

      {open && expandable && (
        <ul className="!mt-1 list-none space-y-0 border-l-2 border-slate-100 pl-3">
          {details.map((detail, index) => (
            /*
              **key 가 index 다.** 같은 코드 안에서 이름도 금액도 겹칠 수 있어(유도초음파2
              (중재술목적)이 두 번 나온다) 그것들로는 유일하지 않다. 서버가 준 순서를 그대로
              그리기만 하고 정렬·추가·삭제를 하지 않으므로 index 가 안정적이다.
            */
            <li
              key={index}
              className="flex items-start justify-between gap-3 py-1"
            >
              <span className="min-w-0 text-xs text-slate-500">
                {detail.name || item.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-600">
                {formatAmount(detail.amount, t('clinic.npay.won'))}
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
 * **서버가 묶어서 전건을 한 번에 준다.** 예전엔 미러(/data-go-kr/hira/…/npay)를 직접 불러
 * 원본 봉투를 풀고, 이름을 잘라 대분류를 만들고, 100건씩 받아 누적한 뒤 그룹핑했다.
 * 그 일이 전부 서버(/healthcare/hospitals/:id/hira-npay)로 갔다 — 여기는 받아서 그린다.
 *
 * **없는 게 정상이다.** 의원은 원본 API 에 통째로 없고(의료법 공개 대상이 병원급 이상이다),
 * 병원급이어도 신고 항목이 없으면 0건이다. 그래서 빈 결과를 오류로 보이지 않게 한다.
 */
export function NonPaymentPanel({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useHospitalNonPayments(id);

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

  const categories = data?.categories ?? [];
  if (categories.length === 0) {
    // 왜 비었는지는 source 가 말해준다 — 단순히 "없음" 이 아니다.
    return <EmptyState id={id} source={data?.source} status={data?.requestStatus} />;
  }

  // 중분류를 표시 그룹(검사·초음파·MRI…)으로 묶는다. 그 병원이 가진 그룹만, 정해진 순서로.
  const groups = buildGroups(categories);

  return (
    <div>
      <p className="!mt-0 text-xs leading-relaxed text-slate-500">
        {t('clinic.npay.source')}
      </p>

      {/* 그룹이 둘 이상일 때만 책갈피 탭을 띄운다 — 하나뿐이면 점프할 곳이 없다. */}
      {groups.length > 1 && <GroupTabs groups={groups} />}

      <div className="mt-3">
        {groups.map((group) => (
          <div
            key={group.key}
            id={`npay-group-${group.key}`}
            // sticky 병원 헤더(탭 바) 아래로 스크롤되게 위를 비운다. Section 과 같은 변수를 쓴다.
            style={{ scrollMarginTop: 'var(--detail-anchor-offset, 170px)' }}
          >
            {group.categories.map((category) => (
              <CategoryBlock key={category.name} category={category} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface NpayGroup {
  key: NpayGroupKey;
  categories: NonPaymentCategory[];
}

/**
 * 중분류들을 표시 그룹으로 묶고, 정해진 우선순위(NPAY_GROUP_ORDER)로 정렬한다.
 * 그룹 안에서는 원본(중분류) 순서를 지킨다 — 배열이 안정 정렬이라 그대로 살아 있다.
 */
function buildGroups(categories: NonPaymentCategory[]): NpayGroup[] {
  const byKey = new Map<NpayGroupKey, NonPaymentCategory[]>();
  for (const category of categories) {
    const key = npayGroup(category.mdivCd ?? undefined);
    const bucket = byKey.get(key) ?? [];
    bucket.push(category);
    byKey.set(key, bucket);
  }
  return NPAY_GROUP_ORDER.filter((key) => byKey.has(key)).map((key) => ({
    key,
    categories: byKey.get(key)!,
  }));
}

/**
 * 표시 그룹 책갈피 탭. 누르면 그 그룹으로 스크롤한다.
 *
 * 상세의 탭과 성격이 같다 — 내용을 감추지 않고 위치로 데려다줄 뿐이다. 가로로 넘치면 스크롤된다
 * (그룹이 최대 9개라 좁은 화면에서 한 줄을 넘길 수 있다).
 */
function GroupTabs({ groups }: { groups: NpayGroup[] }) {
  const { t } = useTranslation();

  const jump = (key: NpayGroupKey) => {
    document
      .getElementById(`npay-group-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          onClick={() => jump(group.key)}
          className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
        >
          {t(`clinic.npay.group.${group.key}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * 비급여가 비었을 때의 화면. **source 마다 다르다.**
 *   requestable  아직 안 받아봤다 → 갱신 요청 버튼
 *   none         받아봤는데 없다 → "없음"
 *   그 외         hira/web 인데 0건이거나 알 수 없음 → "없음"
 */
function EmptyState({
  id,
  source,
  status,
}: {
  id: string | undefined;
  source?: string;
  status?: string;
}) {
  const { t } = useTranslation();

  if (source === 'requestable') {
    return <RequestPanel id={id} status={status} />;
  }
  return <Empty message={t('clinic.npay.empty')} />;
}

/**
 * 갱신 요청 화면.
 *
 * **버튼을 누르면 크롤이 도는 게 아니다.** 요청이 큐에 들어갈 뿐이고 배치가 나중에 처리한다.
 * 그래서 누른 뒤에도 데이터가 바로 오지 않는다 — "요청됨" 으로 바뀌고, 다음에 다시 들어오면
 * 그 사이 배치가 처리했으면 값이 보인다. 이 사정을 문구로 정직하게 밝힌다.
 */
function RequestPanel({
  id,
  status,
}: {
  id: string | undefined;
  status?: string;
}) {
  const { t } = useTranslation();
  const request = useNonPaymentRequest(id);

  // 서버가 이미 pending/running 을 주거나(다른 사람이 눌렀다), 방금 내가 눌렀다.
  const requested = status === 'pending' || status === 'running' || request.isSuccess;

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Receipt className="h-6 w-6 text-slate-300" />
      <p className="!my-0 max-w-xs text-sm leading-relaxed text-slate-500">
        {requested ? t('clinic.npay.requested') : t('clinic.npay.requestHint')}
      </p>
      {!requested && (
        <button
          type="button"
          onClick={() => request.mutate()}
          disabled={request.isPending}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', request.isPending && 'animate-spin')}
          />
          {t('clinic.npay.request')}
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
