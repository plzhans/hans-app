import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { MetaAssessmentGroup } from '@/features/clinic/api';

/**
 * 상세검색 패널의 조각들.
 *
 * **화면(SearchPage)에서 떼어 둔다.** 여기 있는 것들은 전부 props 로만 움직인다 — 검색 상태나
 * URL 을 모르고, 무엇을 보여줄지와 고른 걸 어떻게 돌려줄지만 안다. 페이지가 1,800 줄까지
 * 자라면서 "상태를 다루는 코드" 와 "그리는 코드" 가 뒤섞여 무엇을 고치는지 찾기 어려워졌다.
 *
 * 페이지 자체(조건 ↔ 결과 ↔ 지도)를 더 쪼개는 일은 남아 있다. 그건 상태를 손으로 엮어야 해서
 * 위험도가 다르고, 지도 영역 검색이 붙을 때 경계가 다시 정해질 수 있어 그때 함께 본다.
 */

/**
 * 라벨 옆 ? 아이콘. 누르면 설명이 뜬다.
 *
 * Radix Popover 는 **portal 로 렌더**돼서 상세검색 패널의 overflow-hidden 에 안 잘린다.
 * 트리거는 button 이 아니라 span 이다 — 접힌 FilterRow 는 행 전체가 button 이라, 그 안에
 * button 을 또 넣으면 HTML 이 깨진다. 클릭 전파만 막아 행이 같이 펴지지 않게 한다.
 */
/**
 * 지금 열려 있는 설명이 어느 것인가.
 *
 * **Radix 는 Popover 마다 따로 논다** — 하나를 열어 둔 채 다른 ? 를 누르면 둘이 같이 뜬다.
 * 화면에 검은 말풍선이 서넛씩 쌓이면 어느 것이 방금 누른 것인지 알 수 없다.
 * 그래서 "열린 것 하나" 를 위에서 들고, 각 설명은 자기가 그것인지만 본다.
 *
 * 바깥에 provider 가 없으면 null 이고, 그때는 Radix 가 알아서 여닫는다(단독으로 써도 된다).
 */
const OpenHintContext = createContext<{
  openId: string | null;
  setOpenId: (id: string | null) => void;
} | null>(null);

/** 이 안의 ? 들은 한 번에 하나만 열린다. */
export function InfoHintScope({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return (
    <OpenHintContext.Provider value={value}>{children}</OpenHintContext.Provider>
  );
}

function InfoHint({ text }: { text: string }) {
  const id = useId();
  const scope = useContext(OpenHintContext);

  return (
    <Popover.Root
      // scope 가 없으면 open 을 넘기지 않는다 — Radix 가 스스로 여닫는 원래 동작.
      open={scope ? scope.openId === id : undefined}
      onOpenChange={
        scope ? (next) => scope.setOpenId(next ? id : null) : undefined
      }
    >
      <Popover.Trigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={text}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex cursor-help text-ink-subtle hover:text-ink-body"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-xs rounded-xl bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-pop"
        >
          {text}
          <Popover.Arrow className="fill-ink" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * "우수 병원" 필터. 심평원 적정성평가 항목을 분야(그룹)별로 나열하고, 고른 항목에서
 * 1등급인 병원을 찾는다. 항목·이름은 서버 메타(/healthcare/meta/assessments)가 준다.
 *
 * FilterRow(라벨|항목 한 줄)와 달리 **그룹 헤더 밑에 항목을 펼친다** — 22개를 8분야로 묶어야
 * 읽힌다. selected 는 assessment 파라미터의 항목 코드 목록이다.
 */
export function AssessmentFilter({
  label,
  hint,
  groups,
  selected,
  onChange,
  featured,
  stacked,
}: {
  label: string;
  hint: string;
  groups: MetaAssessmentGroup[];
  selected: string[];
  onChange: (codes: string[]) => void;

  /** 자주 찾는 항목 코드. 기본은 이것들(+선택된 것)만, +N 으로 전부 펼친다. */
  featured?: string[];

  /** 라벨을 내용 위로. 좁은 사이드바용 — FilterRow 의 같은 이름 주석 참고. */
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggle = (code: string) =>
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code],
    );

  // 이 스코프에 featured 가 하나도 없으면(요양 탭 등) 접지 않고 전부 보여준다.
  // selected 는 featured 가 아니어도 유지한다(숨은 필터 방지).
  const featuredSet = new Set(featured ?? []);
  const allItems = groups.flatMap((g) => g.items);
  const featuredItems = allItems.filter(
    (i) => featuredSet.has(i.code) || selected.includes(i.code),
  );
  const collapsible =
    !!featured &&
    featuredItems.length > 0 &&
    featuredItems.length < allItems.length;
  // 즐겨찾기 접힘: **그룹 레이블 없이 한 줄로.** 전부 펼치면(닫기) 그룹으로 나눠 보여준다.
  const showFlat = collapsible && !expanded;
  const hidden = allItems.length - featuredItems.length;

  const checkbox = (item: { code: string; name: string }) => {
    const checked = selected.includes(item.code);
    return (
      <label
        key={item.code}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 text-[0.82rem] transition-colors',
          checked ? 'font-bold text-brand-strong' : 'font-medium text-ink-body',
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(item.code)}
          className="h-[0.95rem] w-[0.95rem] rounded border-line-strong text-brand focus:ring-brand focus:ring-offset-0"
        />
        <span>{item.name}</span>
      </label>
    );
  };

  return (
    // FilterRow 와 같은 규칙: 기본은 라벨이 윗줄, 넓어지면(sm~) 왼쪽 칸으로. stacked 면 늘 윗줄.
    <div
      className={cn(
        'border-b border-line px-3 py-3 last:border-b-0',
        !stacked && 'sm:flex sm:p-0',
      )}
    >
      <div
        className={cn(
          'mb-2 block text-[0.8rem] font-extrabold text-ink',
          !stacked &&
            'sm:mb-0 sm:w-28 sm:shrink-0 sm:bg-surface-subtle sm:px-3 sm:py-3 sm:text-sm sm:font-bold sm:text-ink-body',
        )}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <InfoHint text={hint} />
        </span>
      </div>

      <div className={cn(!stacked && 'sm:flex-1 sm:px-3 sm:py-3')}>
        {/* items-start: 항목이 여러 줄이어도 +N/닫기 가 오른쪽 위 끝에 고정된다. */}
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-3">
            {showFlat ? (
              // 즐겨찾기: 그룹 없이 한 줄에 모아 보여준다.
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {featuredItems.map((item) => checkbox(item))}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.code}>
                  {/*
                    분야 이름(급성질환·약제…). 아래 항목들보다 **한 단계 진하다** —
                    같은 흐림이면 항목 중 하나로 읽혀서 묶음의 머리인지 알 수 없다.
                  */}
                  <div className="mb-1.5 text-xs font-bold text-ink-body">
                    {g.name}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {g.items.map((item) => checkbox(item))}
                  </div>
                </div>
              ))
            )}
          </div>

          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn('shrink-0 self-start', FILTER_PILL)}
            >
              {expanded ? t('search.close') : `+${hidden}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 선택 칩. 켜진 상태는 **저장하지 않고 계산한다** — 호출부가 active 를 넘긴다. */
export function Chip({
  children,
  active,
  onClick,
  title,
}: {
  children: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm transition-all duration-100 ease-native active:scale-95',
        active
          ? 'bg-brand font-bold text-white shadow-brand-sm'
          : 'bg-surface font-semibold text-ink-body ring-1 ring-inset ring-line',
      )}
    >
      {children}
    </button>
  );
}

/**
 * `+N` · 닫기 · 접기 버튼의 공통 모양.
 *
 * **한 곳에 둔다.** 같은 뜻의 버튼이 필터마다 따로 그려져 있었다 — 진료과목·전문분야는
 * 알약인데 우수병원(심평원 평가)만 밑줄 없는 맨 글자라, 같은 자리에서 같은 일을 하는데
 * 다른 것처럼 보였다. 밋밋한 텍스트가 아니라 **살짝 버튼 느낌**이어야 눌러야 할 것으로 읽힌다.
 */
const FILTER_PILL =
  'rounded-full bg-surface-subtle px-2.5 py-1 text-[0.68rem] font-bold text-ink-muted transition-all duration-100 ease-native hover:bg-brand-tint hover:text-brand-strong active:scale-95';

const COLLAPSED_COUNT = 10;

interface FilterOption {
  code: string;
  name: string;
  description?: string;

  /** 면허 계열 (의/치/한). groupByField 일 때 이걸로 묶는다. 없으면 그룹 안 함. */
  field?: 'med' | 'dent' | 'km';
}

/** 계열 소제목 순서. 의과 → 치과 → 한방. */
const FIELD_ORDER: Array<'med' | 'dent' | 'km'> = ['med', 'dent', 'km'];

/**
 * 상세검색 한 줄. 왼쪽에 항목명, 오른쪽에 체크박스 그리드.
 *
 * 항목이 많으면(진료과목 47개) 접어두고 "N개 +" 로 펼친다 — 처음부터 47개를 쏟아내면
 * 아무것도 안 읽힌다.
 *
 * `group` 은 code 에 쉼표가 들어간 묶음이다(병원 규모 = 종별 여러 개). 체크 여부는
 * **저장하지 않고 계산한다** — 묶음의 코드가 전부 선택돼 있으면 켜진 것이다.
 */
export function FilterRow({
  label,
  hint,
  options,
  selected,
  onChange,
  group,
  collapsible,
  featured,
  groupByField,
  stacked,
}: {
  label: string;

  /** 라벨 옆 ? 아이콘에 붙는 설명. 마우스를 올리면 뜬다(native title — 패널이 overflow-hidden 이라 안 잘린다). */
  hint?: string;
  options: FilterOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
  group?: boolean;

  /** 행 전체를 접어 둔다. 항목이 많고(47개) 대부분의 사용자가 안 쓰는 행에 준다. */
  collapsible?: boolean;

  /**
   * 자주 찾는 항목 코드. 주면 **기본은 이것들만**(+이미 선택된 것) 보이고, 나머지는 줄 끝의
   * `+N` 을 눌러 펼친다. featured 순서대로 앞에 온다. collapsible 과는 같이 쓰지 않는다.
   */
  featured?: string[];

  /**
   * 옵션을 계열(의/치/한) 소제목으로 나눠 보여준다. option.field 로 묶는다.
   * 진료과목·전문의처럼 계열이 있는 필터에 쓴다. collapsible 과 같이 쓴다(접었다 펴는 긴 목록).
   */
  groupByField?: boolean;

  /**
   * 라벨을 **내용 위로 올린다.** 사이드바(지도 모드)처럼 좁은 자리를 위한 것이다.
   *
   * 넓은 자리에서는 [라벨 | 체크박스] 가로 배치가 낫다 — 라벨이 왼쪽에 줄지어 서서 무엇을
   * 고르는 행인지 훑기 좋다. 그런데 그 라벨 칸이 112px 고정이라, 21rem 사이드바에서는
   * 그것만으로 폭의 3분의 1을 먹고 체크박스가 두세 개마다 줄바꿈된다.
   */
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  /*
    행 껍데기. **기본은 세로(라벨이 위)이고, 넓어지면 가로로 편다.**

    가로 배치는 라벨이 왼쪽에 줄지어 서서 무엇을 고르는 행인지 훑기 좋다. 그런데 그 라벨 칸이
    112px 고정이라 좁은 화면에서는 폭의 3분의 1을 먹고, 체크박스가 두세 개마다 줄바꿈된다.
    그래서 **좁으면 라벨을 위로 올린다.**

    좁다는 판정이 둘이다:
      stacked  서랍·사이드바처럼 **창과 무관하게** 칸이 좁은 자리. 창이 아무리 넓어도 세로다.
      sm 미만  본문에 누웠을 때의 화면 폭. 이때는 칸 폭이 곧 화면 폭이라 미디어쿼리로 충분하다.
  */
  const inline = !stacked;
  const rowClass = cn(
    'border-b border-line px-3 py-3 last:border-b-0',
    inline && 'sm:flex sm:p-0',
  );
  const labelClass = cn(
    'mb-2 block text-[0.8rem] font-extrabold text-ink',
    inline &&
      'sm:mb-0 sm:w-28 sm:shrink-0 sm:bg-surface-subtle sm:px-3 sm:py-3 sm:text-sm sm:font-bold sm:text-ink-body',
  );
  const bodyClass = cn(inline && 'sm:flex-1 sm:px-3 sm:py-2.5');

  // 라벨 + (있으면) ? 아이콘. 접힌 상태·펼친 상태 두 곳에서 같은 걸 쓴다.
  const labelNode = hint ? (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoHint text={hint} />
    </span>
  ) : (
    label
  );

  /** 접힌 행은 라벨만 보인다. 고른 게 있으면 펴서 보여준다 — 숨긴 필터가 살아 있으면 안 된다. */
  const [open, setOpen] = useState(!collapsible);
  const visible = open || selected.length > 0;

  /**
   * 무엇을 보여줄지 + 몇 개가 숨었는지. 세 모드다:
   *   featured    자주 찾는 것(+선택된 것)만. 펼치면 전부.
   *   collapsible 행 자체를 접었다 펴는 것(위 early-return). 펴면 전부.
   *   기본        10개까지 보이고 나머지는 아래 "N개 +".
   */
  let shown: FilterOption[];
  let hidden: number;
  if (featured) {
    if (expanded) {
      shown = options;
      hidden = 0;
    } else {
      const featuredSet = new Set(featured);
      // featured 순서대로 앞에, 그다음 선택됐지만 featured 아닌 것(숨기면 안 되는 필터).
      const feat = featured
        .map((code) => options.find((o) => o.code === code))
        .filter((o): o is FilterOption => !!o);
      const extra = options.filter(
        (o) => selected.includes(o.code) && !featuredSet.has(o.code),
      );
      shown = [...feat, ...extra];
      hidden = options.length - shown.length;
    }
  } else if (collapsible || expanded) {
    shown = options;
    hidden = 0;
  } else {
    shown = options.slice(0, COLLAPSED_COUNT);
    hidden = options.length - COLLAPSED_COUNT;
  }

  if (collapsible && !visible) {
    return (
      /*
        **접힌 행은 좁아도 한 줄이다.** 펼친 행과 달리 라벨 밑에 놓일 내용이 없다 —
        "47개 ▾" 하나뿐이라, 라벨을 윗줄로 올려봐야 자리만 한 줄 더 먹는다.
        그래서 여기서는 stacked 여부와 무관하게 라벨과 개수를 나란히 둔다.
      */
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center border-b border-line px-3 py-3 text-left last:border-b-0',
          inline && 'sm:p-0',
        )}
      >
        <span
          className={cn(
            'text-[0.8rem] font-extrabold text-ink',
            inline &&
              'sm:w-28 sm:shrink-0 sm:bg-surface-subtle sm:px-3 sm:py-3 sm:text-sm sm:font-bold sm:text-ink-body',
          )}
        >
          {labelNode}
        </span>
        <span
          className={cn(
            // 좁을 때는 개수를 오른쪽 끝으로 밀어 목록 행처럼 읽히게 한다.
            'ml-auto flex items-center gap-1 text-sm text-ink-subtle',
            inline && 'sm:ml-0 sm:flex-1 sm:px-3 sm:py-3',
          )}
        >
          {t('search.optionCount', { count: options.length })}{' '}
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
    );
  }

  const toggle = (option: FilterOption) => {
    const codes = group ? option.code.split(',') : [option.code];
    const on = codes.every((code) => selected.includes(code));

    onChange(
      on
        ? selected.filter((code) => !codes.includes(code))
        : [...new Set([...selected, ...codes])],
    );
  };

  return (
    <div className={rowClass}>
      <div className={labelClass}>{labelNode}</div>

      <div className={bodyClass}>
        {/*
          featured·collapsible 는 체크박스 영역과 접기/펼치기 버튼을 나란히 둔다(items-start) —
          항목이 여러 줄로 펼쳐져도 버튼이 **오른쪽 위 끝에 고정**된다.
        */}
        <div className={cn((featured || collapsible) && 'flex items-start gap-3')}>
          {/*
            **flex 다.** grid 로 열을 고정하면 항목이 3개뿐인 행(병원 규모)에서
            체크박스가 화면 폭만큼 벌어져 서로 멀어진다. flex 는 내용 폭만 차지한다.
          */}
          {groupByField ? (
            // 계열(의/치/한) 소제목으로 나눠 그린다. 해당 계열이 있는 것만.
            <div className="flex-1 space-y-2">
              {FIELD_ORDER.filter((f) =>
                shown.some((o) => o.field === f),
              ).map((f) => (
                <div key={f}>
                  {/*
                    계열 이름(의과·치과·한방). 우수병원의 분야 이름과 **같은 무게**다 —
                    둘 다 "아래 항목들의 머리" 라는 같은 일을 하므로 다르게 보이면 안 된다.
                  */}
                  <p className="!my-0 mb-1.5 text-xs font-bold text-ink-body">
                    {t(`search.field.${f}`)}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {shown
                      .filter((o) => o.field === f)
                      .map((option) => (
                        <FilterCheckbox
                          key={option.code}
                          option={option}
                          group={group}
                          selected={selected}
                          onToggle={() => toggle(option)}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1.5">
              {shown.map((option) => (
                <FilterCheckbox
                  key={option.code}
                  option={option}
                  group={group}
                  selected={selected}
                  onToggle={() => toggle(option)}
                />
              ))}
            </div>
          )}

          {/* featured: 오른쪽 위 끝에 고정된 +N / 닫기. self-start 라 여러 줄이어도 맨 위에 붙는다. */}
          {featured && (hidden > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn('shrink-0 self-start', FILTER_PILL)}
            >
              {expanded ? t('search.close') : `+${hidden}`}
            </button>
          )}

          {/*
            collapsible 행은 펼치면 hidden 이 0 이라 아래 "N개 +" 접기가 안 뜬다 — 여기서 접기를
            준다. featured 와 같은 자리(오른쪽 위 고정)다. 고른 게 있으면 접지 않는다(숨긴 필터가
            살아 있으면 안 된다).
          */}
          {collapsible && open && selected.length === 0 && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn('shrink-0 self-start', FILTER_PILL)}
            >
              {t('search.close')}
            </button>
          )}
        </div>

        {/* 기본 모드(진료과목 등): 체크박스 아래에 "N개 +" */}
        {!featured && !collapsible && hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn('mt-1.5', FILTER_PILL)}
          >
            {expanded ? t('search.collapse') : t('search.more', { count: hidden })}
          </button>
        )}
      </div>
    </div>
  );
}

/** 체크박스 하나. 평평/계열그룹 두 렌더가 공유한다. */
function FilterCheckbox({
  option,
  group,
  selected,
  onToggle,
}: {
  option: FilterOption;
  group?: boolean;
  selected: string[];
  onToggle: () => void;
}) {
  const codes = group ? option.code.split(',') : [option.code];
  const checked = codes.every((code) => selected.includes(code));

  return (
    <label
      title={option.description}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 text-[0.82rem] transition-colors',
        checked ? 'font-bold text-brand-strong' : 'font-medium text-ink-body',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-[0.95rem] w-[0.95rem] rounded border-line-strong text-brand focus:ring-brand focus:ring-offset-0"
      />
      <span className="truncate">{option.name}</span>
    </label>
  );
}
