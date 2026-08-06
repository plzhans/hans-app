import {
  Fragment,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import {
  AlertTriangle,
  Ambulance,
  ArrowRight,
  Baby,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  LocateFixed,
  Lock,
  Info,
  Maximize2,
  Minimize2,
  RotateCcw,
  Siren,
  Sparkles,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { useLangPath } from '@/shared/i18n/routing';
import { LangLink } from '@/shared/i18n/LangLink';
import { cn } from '@/shared/lib/utils';
import { useHospitalSearch, type Hospital } from '@/features/clinic/api';
import { usePanelSize } from '../model/usePanelSize';
import { useMyPlace, type MyPlace } from '../model/useMyPlace';
import type { Turn } from '../model/chatStorage';
import {
  paramsToQuery,
  toSearchParams,
  useAiSearch,
  useAiSearchQuota,
  type AiSearchQuota,
  type AiSearchQuotaWindow,
  type AiSearchResponse,
  type AiSearchWarning,
} from '../api';

/**
 * 내용만큼 칸을 키운다. **scrollHeight 를 읽기 전에 height 를 비우는 게 핵심이다** —
 * 안 그러면 이미 커진 높이가 scrollHeight 의 하한이 되어 줄을 지워도 안 줄어든다.
 *
 * 최대 높이는 CSS(max-h)가 잡는다.
 *
 * **스크롤은 한도에 닿았을 때만 켠다.** 늘 auto 로 두면 줄이 늘어날 때마다 스크롤바가
 * 깜빡인다 — 줄높이가 22.75px 처럼 소수라 `height = scrollHeight` 로 맞춰도 브라우저가
 * 반올림하면서 1px 이 남고, 그 1px 에 스크롤바가 났다가 다음 렌더에 사라진다.
 * 그리고 스크롤바가 뜨는 순간 칸이 좁아져 글이 다시 접히므로 높이가 또 바뀐다(요동).
 */
function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  const full = el.scrollHeight;
  el.style.height = `${full}px`;
  // 실제로 잘렸을 때만(브라우저가 max-height 로 깎았을 때) 스크롤을 준다.
  el.style.overflowY = el.clientHeight < full ? 'auto' : 'hidden';
}

/** 질문 길이 상한. 서버(MAX_QUESTION_LENGTH)와 같은 값이라 넘기기 전에 여기서 막는다. */
const MAX_LENGTH = 300;

/**
 * 가장 최근에 받은 몫. **매 응답이 최신값을 싣고 온다** — 따로 조회하지 않는다.
 * 아직 아무것도 안 물었으면 undefined 다(그때는 보여줄 것이 없다).
 */
function lastQuota(turns: Turn[]): AiSearchQuota | undefined {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    // 모양을 확인하고 쓴다. 저장된 대화는 예전 판일 수 있고, 판 올리기를 잊어도
    // 화면이 터지지는 않아야 한다 — 사용량 표시 하나 때문에 채팅을 못 쓰면 손해다.
    const quota = turn.role === 'assistant' ? turn.result.quota : undefined;
    if (quota?.app || quota?.user) {
      return quota;
    }
  }
  return undefined;
}

/**
 * 남은 몫 표시. 숫자와 막대를 같이 둔다 — 숫자는 정확하고, 막대는 **한눈에 얼마나 남았나**를
 * 말한다. 둘 중 하나만 두면 "1,847,000/2,000,000" 이 많은 건지 적은 건지 세어 봐야 안다.
 *
 * **통이 여러 개여도 하나만 그린다.** 앱 몫은 일·월 두 통이 걸려 있는데 둘 다 그리면
 * 입력창 옆이 계기판이 된다 — 정작 알고 싶은 건 "지금 막히나" 라서 **가장 많이 찬 통**을
 * 고른다. 그게 실제로 먼저 막는 통이다.
 *
 * 다 써 갈수록 색이 바뀐다(80% 주의, 100% 위험) — 숫자를 읽지 않아도 눈에 걸려야 한다.
 */
/**
 * 사용량 자리를 미리 잡아 둔다. **빈칸으로 두지 않는 이유**는 값이 도착하는 순간 줄이
 * 생기면서 입력칸이 아래로 밀리기 때문이다 — 채팅창을 열자마자 눈이 가 있는 자리라
 * 그 흔들림이 크게 보인다. 접힌 상태가 한 줄이므로 여기도 한 줄이다.
 */
function QuotaSkeleton() {
  return (
    <div
      className="h-3 w-32 animate-pulse rounded-full bg-line"
      aria-hidden
    />
  );
}

/**
 * 사용량. **늘 한 줄이다** — 나머지 한도는 화살표를 누르면 **레이어로** 뜬다.
 *
 * 제자리에서 펼치지 않는 이유는 이 줄 바로 아래가 입력칸이어서다. 줄이 늘면 입력칸이
 * 밀려 내려가고, 닫을 때 다시 올라온다 — 잠깐 확인하고 마는 물건이 손대는 자리를
 * 흔드는 셈이다(`i` 패널을 말풍선 밖에 띄우는 것과 같은 이유).
 *
 * 로그인 전에는 한도가 둘(오늘·이번 달)인데, 평소에 궁금한 것은 **먼저 막는 쪽 하나**이고
 * 나머지는 "왜 막혔지" 를 따질 때만 본다. 로그인 후에는 잔액 하나뿐이라 화살표가 안 나온다.
 */
function QuotaBar({ quota }: { quota: AiSearchQuota }) {
  const { t } = useTranslation();
  const [first, ...rest] = shownWindows(quota);
  if (!first) {
    return null;
  }

  if (rest.length === 0) {
    return <QuotaRow label={first.label} window={first.window} />;
  }

  return (
    <Popover.Root>
      {/*
        **줄 전체를 기준점으로 삼는다**(Anchor). 버튼만 기준이면 16px 짜리 화살표의 왼쪽
        끝에 레이어가 맞춰져 대각선 위로 튀어나온 것처럼 보인다 — 누른 것은 화살표지만
        정렬은 이 줄에 맞아야 두 줄이 위아래로 쌓인 것으로 읽힌다.
      */}
      <Popover.Anchor className="flex min-w-0 items-center gap-1">
        <QuotaRow label={first.label} window={first.window} />
        <Popover.Trigger
          aria-label={t('aiSearch.quotaToggle')}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors active:bg-line data-[state=open]:bg-brand data-[state=open]:text-white"
        >
          {/* 레이어가 늘 위로 열리므로 화살표도 위를 가리킨다. */}
          <ChevronUp className="h-3.5 w-3.5" />
        </Popover.Trigger>
      </Popover.Anchor>
      <Popover.Portal>
        {/* **위로 띄운다.** 아래는 입력칸이라 그쪽으로 열면 손대는 자리를 덮는다. */}
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-max rounded-card border border-line-subtle bg-surface p-2.5 shadow-raised"
        >
          <div className="flex flex-col gap-1">
            {rest.map(({ label, window }) => (
              <QuotaRow key={label.text} label={label} window={window} />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * 통 하나. 숫자와 막대를 같이 둔다 — 숫자는 정확하고, 막대는 **한눈에 얼마나 남았나**를
 * 말한다. 둘 중 하나만 두면 "1,847,000/2,000,000" 이 많은 건지 적은 건지 세어 봐야 안다.
 *
 * 다 써 갈수록 색이 바뀐다(80% 주의, 100% 위험) — 숫자를 읽지 않아도 눈에 걸려야 한다.
 */
function QuotaRow({
  label,
  window,
}: {
  label: QuotaLabel;
  window: AiSearchQuotaWindow;
}) {
  const ratio = Math.min(1, window.used / window.limit);
  const pct = Math.round(ratio * 100);

  return (
    <div className="flex items-center gap-1.5">
      <span
        // 굵게 하지 않는다. 입력 상자 안에 같이 있어서 굵히면 입력칸보다 먼저 눈에 든다 —
        // 색만 기본색으로 두면 안 흐리면서도 주인공 자리를 안 뺏는다.
        className="shrink-0 text-[0.72rem] tabular-nums text-ink"
        /*
          줄인 숫자 뒤에 정확한 값을 남기고, **이 숫자가 누구 것인지도 여기서 말한다** —
          라벨은 자리가 좁아 두 낱말뿐이라 "모두가 합쳐 쓴 양" 이라는 설명이 안 들어간다.
        */
        title={`${label.hint}\n${window.used.toLocaleString()} / ${window.limit.toLocaleString()}`}
      >
        {label.text} {compact(window.used)}/{compact(window.limit)}
      </span>
      {/*
        role=progressbar 로 둔다. 시각적 막대만 두면 스크린리더에는 아무것도 안 읽힌다 —
        옆 숫자가 있으니 중복이지만, 값이 바뀌었다는 것은 이쪽만 알린다.
      */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label.hint}
        className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            ratio >= 1 ? 'bg-danger' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-brand',
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 통 이름과 툴팁. **번역하지 않는다** — `i` 패널의 라벨과 같은 규칙이다.
 *
 * 낱말을 네 언어로 옮기면 폭이 제각각이라 옆의 숫자와 막대가 언어마다 다른 자리에 선다.
 * 자리가 좁아 한두 글자 차이가 그대로 어긋남이 되는데, 정작 이 자리에서 읽어야 하는 것은
 * 낱말이 아니라 **숫자와 막대**다.
 *
 * **앱 몫을 `Shared` 라고 쓴다.** 로그인 전에는 이 숫자가 내가 쓴 양이 아니라 **모두가
 * 합쳐 쓴 양**이다 — 한 번밖에 안 물었는데 값이 크고, 가만히 있어도 늘어난다.
 * `Today` 라고만 적으면 그게 내 사용량으로 읽히고, 나아가 로그인한 줄로도 읽힌다.
 *
 * 어느 창인지(Today/Month)도 같이 적는다. 창이 바뀌면 값이 리셋되므로, 그것 없이는
 * 숫자가 왜 갑자기 줄었는지 설명이 안 된다.
 */
const WINDOW_LABEL = {
  daily: { text: 'Today Shared', hint: 'Shared across all users · today' },
  monthly: { text: 'Month Shared', hint: 'Shared across all users · this month' },
  balance: { text: 'Balance', hint: 'Your remaining tokens' },
} as const;

type QuotaLabel = (typeof WINDOW_LABEL)[keyof typeof WINDOW_LABEL];

/**
 * 보여줄 통들. **깎이는 쪽만 그린다** — 응답은 앱 예산과 개인 잔액을 둘 다 싣지만,
 * 사용자가 알고 싶은 것은 "내가 지금 뭘 쓰고 있나" 다. 로그인했으면 개인 잔액이 그것이고,
 * 아니면 앱 예산이다(안 깎이는 쪽을 그리면 숫자가 안 움직여서 고장처럼 보인다).
 *
 * **순서가 곧 우선순위다.** 앞의 것이 접힌 상태에서 보이는 줄이고 나머지는 화살표 뒤에
 * 숨는다 — 로그인 전이면 오늘이 먼저다(자정마다 걸리는 쪽이라 평소에 궁금한 것이 이쪽이고,
 * 이번 달은 "왜 막혔지" 를 따질 때만 본다).
 */
function shownWindows(
  quota: AiSearchQuota,
): { label: QuotaLabel; window: AiSearchQuotaWindow }[] {
  const candidates = quota.user
    ? ([['balance', quota.user.balance]] as const)
    : ([
        ['daily', quota.app?.daily],
        ['monthly', quota.app?.monthly],
      ] as const);

  return candidates
    .filter(([, window]) => window && window.limit > 0)
    .map(([key, window]) => ({
      label: WINDOW_LABEL[key],
      window: window as AiSearchQuotaWindow,
    }));
}

/** 큰 수를 짧게. 1,847,000 → 1.8M. 정확한 값은 title 에 남긴다. */
function compact(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
  }
  return String(n);
}

/**
 * 경고별 아이콘과 색. emergency 만 붉게 세운다 — 나머지는 안내지 경고가 아니다.
 *
 * **`off_topic` 은 일부러 없다.** 범위 밖 질문이면 explain 이 이미 "병원 검색에 대해
 * 물어봐 주세요" 라고 말하는데, 배너로 한 번 더 띄우면 같은 말이 두 번 나온다.
 * 여기 없는 신호는 WarningBanner 가 조용히 넘긴다.
 */
const WARNING_STYLE: Partial<
  Record<AiSearchWarning, { icon: typeof AlertTriangle; box: string }>
> = {
  emergency_suspected: { icon: Siren, box: 'bg-danger-tint text-danger' },
  medical_caution: { icon: AlertTriangle, box: 'bg-amber-50 text-amber-700' },
  unsupported_inverse: {
    icon: AlertTriangle,
    box: 'bg-surface-subtle text-ink-muted',
  },
  tertiary_referral: { icon: AlertTriangle, box: 'bg-amber-50 text-amber-700' },
  too_vague: { icon: AlertTriangle, box: 'bg-surface-subtle text-ink-muted' },
};

/**
 * AI 문의 채팅 레이어.
 *
 * **채팅처럼 보이지만 대화가 아니다.** 서버는 질문 하나를 받아 **검색 조건**을 돌려주고,
 * 여기서는 그걸 "AI 가 이렇게 이해했다" 로 보여준 뒤 기존 검색 화면으로 넘긴다.
 * 문장을 생성하지 않으므로 응답이 1~2초로 끝나고, 왕복이 한 번이라 요금도 그만큼만 든다.
 *
 * 그래서 **틀렸을 때 복구가 쉽다** — 조건 칩을 보고 아니다 싶으면 다시 물으면 되고,
 * 검색으로 넘어간 뒤에는 기존 필터 UI 로 고치면 된다.
 *
 * [채팅 라이브러리를 안 쓴 이유]
 * 말풍선 세 종류와 입력칸 하나가 전부다. 채팅 킷(@chatscope 등)은 스트리밍·타이핑 표시·
 * 이력 관리를 들고 오는데 여기서는 셋 다 안 쓰고, 대신 자기 CSS 테마가 따라와 디자인 토큰과
 * 충돌한다. 껍데기(모달)만 Radix Dialog 로 맡긴다 — 그건 직접 만들면 반드시 빠뜨리는 것들이다.
 */
export function AiSearchChat({
  turns,
  setTurns,
  onClear,
  onClose,
}: {
  /** 대화. **위(Provider)가 들고 있다** — 화면을 옮기거나 창을 닫아도 안 사라진다. */
  turns: Turn[];
  setTurns: Dispatch<SetStateAction<Turn[]>>;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const path = useLangPath();
  const [question, setQuestion] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const { size, resizing, onPointerDown, reset } = usePanelSize();
  // 저장된 대화를 이어받을 수 있으므로 **마지막 id 다음부터** 센다. 0 부터 시작하면
  // 새로고침 뒤 첫 질문이 기존 turn 과 key 가 겹쳐 React 가 엉뚱한 것을 다시 쓴다.
  const nextId = useRef(Math.max(0, ...turns.map((turn) => turn.id + 1)));

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 발송 중 잠금. **상태가 아니라 ref 인 이유**는 ask() 주석 참고(렌더를 기다리면 늦다). */
  const sendingRef = useRef(false);
  const { mutate, isPending } = useAiSearch();

  /*
    입력칸 높이를 내용에 맞춘다. **마운트 때도 돈다** — rows={1} 이 잡는 기본 높이가 실제
    내용 높이보다 미세하게 작아(줄높이 22.75px 가 소수점이라) 첫 화면부터 스크롤바가 났다.

    onChange 가 아니라 question 을 따라가는 이유는 **손으로 친 것 말고도 바뀌기 때문**이다 —
    보내고 나서 비우는 것, 예시를 눌러 채우는 것이 전부 여기로 모인다.
  */
  useEffect(() => {
    if (inputRef.current) {
      autoGrow(inputRef.current);
    }
  }, [question]);

  /*
    **맨 아래에 붙어 있게 한다.**

    turn 이 쌓일 때 한 번 내리는 것으로는 부족했다 — 답변이 온 뒤에 병원 미리보기가
    비동기로 도착해 말풍선이 다시 길어지는데, 그때는 이미 스크롤이 끝난 뒤라 방금 받은
    답이 화면 밖에 남는다. 그래서 **내용 높이가 변할 때마다** 따라간다.

    **사용자가 위로 올려 읽고 있으면 놓아준다.** 지난 답을 훑는 중에 새 내용이 도착했다고
    끌어내리면 읽던 자리를 뺏는 것이다. 바닥 근처(40px)에 있을 때만 붙잡는다.
  */
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const view = scrollRef.current;
    const content = contentRef.current;
    if (!view || !content) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (stickRef.current) {
        view.scrollTop = view.scrollHeight;
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // 새 turn 은 사용자가 방금 보낸 것이다. 어디를 보고 있었든 다시 붙잡는다.
  useEffect(() => {
    stickRef.current = true;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns]);

  function ask(e: FormEvent) {
    e.preventDefault();
    send(question.trim());
  }

  /** 질문 하나를 실제로 보낸다. 입력칸에서도, 실패 후 "다시 시도" 에서도 여기로 온다. */
  function send(q: string) {
    /*
      **중복 발송을 ref 로 막는다.** `isPending` 은 mutate 를 부른 다음 렌더에서야 true 가 되므로,
      그 사이에 들어온 두 번째 제출은 여전히 false 를 본다 — 빠른 더블클릭이나 Enter 를 누른 채
      두면 실제로 두 번 나간다. 요청 하나가 곧 외부 LLM 요금이라 조용히 두 배가 나가면 곤란하다.
      ref 는 렌더를 기다리지 않아 같은 tick 안에서도 즉시 닫힌다.

      **버튼의 disabled 만으로는 부족하다.** 입력칸에서 Enter 를 치면 비활성 제출 버튼과
      무관하게 form 의 onSubmit 이 그대로 불린다.

      **사용량을 못 읽었으면 여기서도 막는다.** 입력칸만 잠그면 빈 화면의 예시 질문 버튼이
      그대로 살아 있어 그쪽으로 빠져나간다 — 보내는 길이 둘이라 문지기도 둘일 수는 없다.
    */
    if (!q || sendingRef.current || blocked) return;
    sendingRef.current = true;

    const id = nextId.current++;
    const at = Date.now();
    setTurns((prev) => [...prev, { role: 'user', id, text: q }]);
    setQuestion('');

    mutate(q, {
      onSuccess: (result) =>
        setTurns((prev) => [
          ...prev,
          { role: 'assistant', id: nextId.current++, result, at },
        ]),
      // 실패를 조용히 넘기지 않는다 — 사용자는 자기가 뭘 잘못했는지 모른 채 기다리게 된다.
      onError: () =>
        setTurns((prev) => [
          ...prev,
          { role: 'error', id: nextId.current++, question: q },
        ]),
      // 성공·실패 어느 쪽이든 잠금을 푼다. onSuccess 에만 두면 실패한 뒤로 영영 못 보낸다.
      onSettled: () => {
        sendingRef.current = false;
        // 답이 온 뒤 바로 이어서 물을 수 있게 포커스를 돌려준다.
        inputRef.current?.focus();
      },
    });
  }

  /**
   * 내 위치. **패널에 하나만 둔다** — 답변 말풍선마다 훅을 돌리면 "근처" 질문을 세 번 했을 때
   * 측위도 세 번 하고, 권한 창도 그만큼 뜬다. 여기서 한 번 잡아 모든 말풍선이 나눠 쓴다.
   */
  const place = useMyPlace();

  /*
    남은 몫. **답변이 있으면 그쪽이 최신이다** — 응답마다 새 값이 실려 온다.
    아직 아무것도 안 물었을 때만 열면서 받아 온 값을 쓴다(그때는 실려 올 답변이 없다).
  */
  const fetched = useAiSearchQuota();
  const quota = lastQuota(turns) ?? fetched.data?.quota;
  /*
    **사용량을 못 읽으면 질문도 못 한다.** 서버가 계수기를 못 읽으면 요청을 fail-closed 로
    막으므로(한도가 사라진 채 요금이 새는 것보다 낫다), 여기서 입력을 열어 두면 사용자는
    질문을 다 치고 나서야 막힌 걸 안다.

    **불러오는 중과 실패를 나눠 다룬다.** 둘 다 "아직 못 쓴다" 지만, 잠깐 기다리면 되는
    것과 지금은 안 되는 것은 사용자가 할 일이 다르다.
  */
  const quotaPending = fetched.isPending;
  const quotaFailed = fetched.isError;
  const blocked = quotaPending || quotaFailed;

  /** 조건을 들고 기존 검색 화면으로. 레이어는 닫는다 — 뒤에 결과가 깔리므로 남길 이유가 없다. */
  function goSearch(result: AiSearchResponse) {
    const params = toSearchParams(result);
    onClose();
    navigate(path(`/search?${params.toString()}`));
  }

  /*
    **떠 있는 패널이지 모달이 아니다**(modal={false}).

    처음엔 딤을 깔고 화면을 막는 모달로 만들었는데, 그러면 문의창을 여는 순간 뒤의 검색·목록이
    통째로 죽는다 — 이 기능은 "찾다가 잘 안 되면 물어보는" 자리라, 물어보는 동안 원래 화면을
    못 쓰는 건 앞뒤가 안 맞는다. modal={false} 면 Radix 가 포커스 트랩과 pointer-events 차단을
    걸지 않아 뒤 화면이 그대로 살아 있다(비모달 패널에서 포커스를 가두는 건 오히려 잘못된
    접근성이다 — 사용자가 빠져나갈 수 없게 된다). Esc·Portal·ARIA 배선은 그대로 남는다.

    **바깥 클릭으로는 안 닫는다.** 기본값은 닫히는 것인데, 뒤 화면을 쓰라고 열어둔 패널이
    거기 손대는 순간 사라지면 쓸 수가 없다. 닫는 길은 X 와 Esc 다.

    Portal 은 Radix 가 한다. 홈의 히어로·검색 카드가 z-index 를 쓰고 있어서 트리 안에 두면
    부모의 stacking context 에 갇혀 패널이 그 아래로 깔린다.

    open 을 항상 true 로 두는 것은 **열림 여부를 부모(홈)가 마운트로 결정**하기 때문이다 —
    닫히면 컴포넌트째 사라져 대화 기록도 같이 비워진다(다시 열면 새 대화가 맞다).
  */
  return (
    <Dialog.Root open modal={false} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        {/*
          패널. **화면 구석에 붙는다** — 가운데 띄우면 그 자체로 "이것부터 처리해라" 가 되어
          비모달인 의미가 없다. 오른쪽 아래는 여느 문의 위젯이 서는 자리라 학습 비용도 없다.

          **크기는 두 갈래로 정해진다.**
            sm 미만  화면 폭을 거의 다 쓰고 높이는 75dvh 로 고정한다. 손가락으로 모서리를
                     잡는 건 실패하기 쉽고, 잡히더라도 스크롤과 싸운다 — 리사이즈를 안 준다.
            sm 이상  usePanelSize 가 든 픽셀 값(드래그로 조절). 인라인 style 로 넣는다 —
                     임의 픽셀이라 Tailwind 클래스로는 표현할 수 없다.

          전체화면일 때는 둘 다 무시하고 화면을 채운다.
        */}
        <Dialog.Content
          aria-describedby={undefined}
          // 열릴 때 포커스를 입력칸에 준다. 기본값은 첫 포커스 가능 요소(닫기 버튼)라
          // 열자마자 바로 칠 수 없다.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          // 뒤 화면을 쓰는 것이 이 패널의 목적이다. 바깥을 눌렀다고 닫으면 안 된다.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          style={
            fullscreen ? undefined : { width: size.width, height: size.height }
          }
          className={cn(
            'fixed bottom-3 right-3 z-50 flex animate-slide-up flex-col overflow-hidden rounded-card border border-line-subtle bg-surface shadow-pop sm:bottom-5 sm:right-5',
            // 모바일 기본값. sm 이상에서는 위 style 의 픽셀 값이 이긴다(sm:w-auto 로 풀어 준다).
            'h-[75dvh] w-[calc(100vw-1.5rem)] sm:h-auto sm:w-auto',
            fullscreen &&
              '!inset-3 !h-auto !w-auto sm:!inset-5 sm:!bottom-5 sm:!right-5',
            // 드래그 중에는 전환을 끈다 — 켜 두면 커서를 따라오는 게 한 박자 늦어 미끄러진다.
            !resizing && 'transition-[width,height] duration-150 ease-native',
          )}
        >
          {/*
            리사이즈 손잡이 셋. **패널이 오른쪽 아래에 붙어 있으니 잡을 수 있는 변은 왼쪽과 위다.**
            모바일에서는 감춘다(위 주석 참고). 전체화면일 때도 감춘다 — 크기를 화면이 정한다.

            더블클릭하면 기본 크기로 돌아간다. 잘못 끌어 이상해졌을 때의 탈출구다.
          */}
          {!fullscreen && (
            <>
              <span
                onPointerDown={onPointerDown('left')}
                onDoubleClick={reset}
                className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-ew-resize sm:block"
                aria-hidden
              />
              <span
                onPointerDown={onPointerDown('top')}
                onDoubleClick={reset}
                className="absolute inset-x-0 top-0 z-10 hidden h-1.5 cursor-ns-resize sm:block"
                aria-hidden
              />
              {/* 모서리는 폭·높이를 함께 잡는다. 위 둘보다 위에 있어야 겹친 자리에서 이긴다. */}
              <span
                onPointerDown={onPointerDown('corner')}
                onDoubleClick={reset}
                className="absolute left-0 top-0 z-20 hidden h-3 w-3 cursor-nwse-resize sm:block"
                aria-hidden
              />
            </>
          )}
          <header className="flex items-center gap-2 border-b border-line-subtle px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-box bg-brand-tint text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="flex items-center gap-1.5 text-[0.92rem] font-extrabold tracking-tight text-ink">
                {t('aiSearch.title')}
                <BetaTag />
              </Dialog.Title>
              <p className="truncate text-[0.72rem] text-ink-subtle">
                {t('aiSearch.subtitle')}
              </p>
            </div>
            {/*
              새 대화. **대화가 있을 때만 보인다** — 빈 화면에 비울 것도 없는 버튼이
              떠 있으면 자리만 차지한다.

              쓰레기통이 아니라 **말풍선+** 이다. 하는 일이 "지운다" 보다 "새로 시작한다" 에
              가깝고, 쓰레기통은 무언가를 잃는다는 신호라 누르기 전에 망설이게 만든다.

              **누르면 한 번 묻는다.** 되돌릴 수 없는데 닫기(되돌릴 수 있다) 바로 옆이라,
              손가락이 미끄러지면 대화가 통째로 날아간다.
            */}
            {turns.length > 0 && (
              <Popover.Root open={confirmClear} onOpenChange={setConfirmClear}>
                <Popover.Trigger
                  aria-label={t('aiSearch.newChat')}
                  title={t('aiSearch.newChat')}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-transform duration-100 ease-native active:scale-90 data-[state=open]:text-brand"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    collisionPadding={12}
                    className="z-50 w-max max-w-[16rem] rounded-card border border-line-subtle bg-surface p-3 shadow-raised"
                  >
                    <p className="text-[0.76rem] leading-relaxed text-ink">
                      {t('aiSearch.newChatConfirm')}
                    </p>
                    <div className="mt-2.5 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="h-8 rounded-field px-3 text-[0.76rem] font-bold text-ink-muted ring-1 ring-inset ring-line active:bg-surface-subtle"
                      >
                        {t('aiSearch.newChatCancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClear();
                          setConfirmClear(false);
                        }}
                        className="h-8 rounded-field bg-brand px-3 text-[0.76rem] font-bold text-white active:bg-brand-strong"
                      >
                        {t('aiSearch.newChat')}
                      </button>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
            {/*
              전체화면 토글. 세밀한 크기 조절은 모서리 드래그가 맡고, 이 버튼은 **한 번에
              화면을 꽉 채우는** 별개의 동작이다 — 긴 대화를 훑을 때 조금씩 끌 이유가 없다.
            */}
            <button
              type="button"
              onClick={() => setFullscreen((prev) => !prev)}
              aria-label={t(
                fullscreen ? 'aiSearch.exitFullscreen' : 'aiSearch.fullscreen',
              )}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-transform duration-100 ease-native active:scale-90"
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <Dialog.Close
              aria-label={t('common.close')}
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-transform duration-100 ease-native active:scale-90"
            >
              <X className="h-4.5 w-4.5" />
            </Dialog.Close>
          </header>

          {/*
            보관 안내. **헤더 아래에 고정한다** — 대화가 길어져도 "이게 어디 남나" 는 계속
            유효한 정보라, 첫 화면에만 두면 스크롤과 함께 사라진다.
          */}
          {/*
            **좌우로 붙이지 않는다.** 배경이 창 끝까지 닿으면 머리말이 아니라 경계선처럼
            읽혀서 패널이 두 동강 난 것처럼 보인다. 여백을 두고 모서리를 둥글리면
            "안에 놓인 쪽지" 로 읽힌다.
          */}
          <div className="px-4 pt-3">
            <div className="flex items-start gap-2 rounded-card bg-surface-subtle px-3 py-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
              <p className="text-[0.72rem] leading-relaxed text-ink">
                {t('aiSearch.storageNote')}
              </p>
            </div>
          </div>

          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              // 바닥에서 40px 안쪽이면 "따라가는 중" 으로 본다.
              stickRef.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="flex-1 overflow-y-auto px-4 pb-4 pt-3"
          >
            <div ref={contentRef}>
            {turns.length === 0 ? (
              <EmptyState onAsk={send} disabled={blocked} />
            ) : (
              <ul className="flex flex-col gap-3">
                {turns.map((turn) => (
                  <li key={turn.id}>
                    {turn.role === 'user' && <UserBubble text={turn.text} />}
                    {turn.role === 'assistant' && (
                      <AssistantBubble
                        result={turn.result}
                        at={turn.at}
                        place={place}
                        onSearch={() => goSearch(turn.result)}
                      />
                    )}
                    {turn.role === 'error' && (
                      <ErrorBubble onRetry={() => send(turn.question)} />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isPending && (
              <div className="mt-3 flex items-center gap-2 text-[0.78rem] text-ink-subtle">
                <Spinner className="h-3.5 w-3.5" />
                {t('aiSearch.thinking')}
              </div>
            )}
            </div>
          </div>

          {/*
            입력. **세이프에어리어를 더한다** — 아이폰에서 홈 인디케이터 위로 걸린다.
          */}
          <form
            onSubmit={ask}
            className="border-t border-line-subtle bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
          >
            {/*
              보내기 버튼을 **칸 안에** 넣는다. 패널 폭이 400px 밖에 안 되는데 버튼을 밖에
              세우면 그만큼 입력칸이 좁아져, 긴 질문을 칠 때 앞부분이 밀려 안 보인다.
            */}
            {/*
              **입력칸과 컨트롤이 한 상자다.** 테두리도 배경도 하나라, 사용량·모델·보내기가
              "입력에 딸린 것" 으로 읽힌다 — 따로 띄워 두면 각자 다른 기능처럼 보인다.

              테두리는 바깥 상자가 갖고 textarea 는 투명하다. 초점 표시(ring)도 상자에
              걸어서(focus-within) 칸 안을 눌렀을 때 상자 전체가 살아난다.
            */}
            <div className="rounded-field bg-surface ring-1 ring-inset ring-line transition-shadow focus-within:ring-2 focus-within:ring-brand">
              {/*
                **여러 줄을 받는다.** 증상을 설명하다 보면 줄을 나누고 싶어지는데, 한 줄
                입력칸은 그걸 아예 막는다(브라우저가 Enter 를 전송으로만 쓴다).

                Enter 는 보내기, Shift+Enter 는 줄바꿈이다 — 채팅 도구들이 공유하는 규칙이라
                따로 배울 게 없다.

                **한글 조합 중에는 보내지 않는다.** IME 로 "천식" 을 치는 중 마지막 글자를
                확정하려고 누른 Enter 가 keydown 으로도 온다 — 그걸 전송으로 읽으면 "천시"
                까지만 적힌 질문이 나간다. isComposing 이 그 구간을 알려 준다.
              */}
              <textarea
                ref={inputRef}
                rows={1}
                value={question}
                onChange={(e) =>
                  setQuestion(e.target.value.slice(0, MAX_LENGTH))
                }
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing)
                    return;
                  e.preventDefault();
                  send(question.trim());
                }}
                disabled={blocked}
                placeholder={t(
                  quotaFailed
                    ? 'aiSearch.quotaUnavailableHint'
                    : 'aiSearch.placeholder',
                )}
                aria-label={t('aiSearch.placeholder')}
                /*
                  **10줄까지 자라고 거기서 멈춘다**(넘으면 칸 안에서 스크롤).
                  계속 자라게 두면 대화 영역을 밀어내 방금 받은 답이 화면 밖으로 나간다 —
                  패널 높이가 400~600px 이라 입력칸이 절반을 먹으면 쓸 수가 없다.

                  15.5rem = 10줄 × 22.75px(text-sm × leading-relaxed) + 위아래 여백 20px.
                */
                className="block max-h-[15.5rem] w-full resize-none bg-transparent px-3.5 pb-1 pt-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-subtle disabled:text-ink-subtle"
              />
              {/*
                **컨트롤 줄.** 사용량은 왼쪽, 모델과 보내기는 오른쪽이다 — 읽는 순서가
                왼쪽부터라 "얼마나 남았나" 가 먼저 오고, 손이 가는 것들은 한쪽에 모인다.
              */}
              <div className="flex items-center justify-between gap-1.5 px-2 pb-2">
                {quotaPending ? (
                  <QuotaSkeleton />
                ) : quotaFailed ? (
                  <p className="min-w-0 text-[0.72rem] font-bold text-danger">
                    {t('aiSearch.quotaUnavailable')}
                  </p>
                ) : quota ? (
                  <QuotaBar quota={quota} />
                ) : (
                  <span />
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <ModelPicker />
                  <button
                    type="submit"
                    disabled={!question.trim() || isPending || blocked}
                    aria-label={t(
                      isPending ? 'aiSearch.thinking' : 'aiSearch.send',
                    )}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white transition-transform duration-100 ease-native active:scale-90 disabled:bg-surface-subtle disabled:text-ink-subtle"
                  >
                {/*
                  대기 중에는 버튼 자리에 스피너를 둔다. 회색으로 죽어 있기만 하면 "왜 안 눌리지"
                  가 되는데, 아래 대화 영역의 "정리하는 중…" 은 스크롤 위치에 따라 안 보일 수 있다.
                */}
                    {isPending ? (
                      <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            {/*
              면책. **입력칸 바로 아래**다 — 보내기 직전에 읽히는 자리라야 의미가 있다.
              푸터에 있는 고지와 겹치지만, 여기서는 "AI 가 답한다" 는 맥락이 더해진다.

              **본문색으로 둔다.** 흐린 회색은 "안 읽어도 되는 것" 이라는 표시라, 정작
              읽혀야 하는 문장을 배경으로 만든다 — 의료 맥락에서 그건 위험을 낮추는 게
              아니라 낮춘 것처럼 보이게만 한다.
            */}
            <p className="mt-2 text-center text-[0.72rem] leading-relaxed text-ink">
              {t('aiSearch.disclaimer')}
            </p>
          </form>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** beta 꼬리표. 이 기능이 아직 실험 중이라는 것을 제목 옆에서 계속 말해 준다. */
function BetaTag() {
  return (
    <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-brand">
      beta
    </span>
  );
}

/**
 * 대화가 비었을 때. **예시를 누르면 그대로 보낸다.**
 *
 * 한때는 입력칸에 넣어 주기만 했다 — 무엇을 물어도 되는지 알려주는 게 목적이지 대신
 * 물어봐 주는 게 목적은 아니라고 봤다. 그런데 눌러 놓고 다시 보내기를 눌러야 하는 건
 * 버튼을 두 번 누르는 일일 뿐이고, 예시를 누르는 사람은 이미 그걸 묻겠다고 정한 것이다.
 */
function EmptyState({
  onAsk,
  disabled,
}: {
  onAsk: (q: string) => void;
  /** 사용량을 못 읽어 질문 자체가 막힌 상태. 눌러도 아무 일 없으면 고장으로 보인다. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const examples = t('aiSearch.examples', { returnObjects: true }) as string[];

  return (
    <div className="py-2">
      <p className="text-[0.82rem] leading-relaxed text-ink-muted">
        {t('aiSearch.intro')}
      </p>
      {/*
        알약 버튼. **가운데 정렬한다** — 문장이 아니라 "누르는 것" 이라는 신호다.
        왼쪽으로 세우면 위 안내 문단과 같은 흐름으로 읽혀 눌러야 할 것으로 안 보인다.
      */}
      <ul className="mt-3 flex flex-col gap-1.5">
        {examples.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => onAsk(example)}
              disabled={disabled}
              className="w-full rounded-full bg-brand-tint px-3 py-2 text-center text-[0.8rem] font-bold text-brand transition-transform duration-100 ease-native active:scale-[0.98] disabled:bg-surface-subtle disabled:text-ink-subtle"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>

    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-brand px-3.5 py-2 text-[0.82rem] leading-relaxed text-white">
        {text}
      </p>
    </div>
  );
}

/**
 * AI 답변. **문장 한 줄(explain) + 조건 칩 + 병원 미리보기 + 검색 버튼**이다.
 *
 * 조건 칩은 "AI 가 내 말을 이렇게 알아들었구나" 를 확인하는 자리이고, 미리보기는
 * **그래서 뭐가 나오는데** 에 답하는 자리다. 한때는 칩만 두고 목록은 검색 화면으로
 * 넘겼는데, 조건이 맞게 잡혔는지는 결국 나온 병원을 봐야 알 수 있어서 여기로 당겼다.
 */
function AssistantBubble({
  result,
  at,
  place,
  onSearch,
}: {
  result: AiSearchResponse;
  at: number;
  place: MyPlace;
  onSearch: () => void;
}) {
  const { t } = useTranslation();
  // 카드에도 쓰고 복사에도 쓴다. 훅이라 조건 없이 부른다(검색이 아니면 안 그릴 뿐이다).
  const preview = usePreview(result, place);

  /*
    **툴 하나로 갈린다.** 예전엔 조건 개수를 세어 "검색할 만한가" 를 화면이 추론했는데,
    그러면 조건은 비었는데 할 일은 있는 경우("하남 병원", "근처 병원")를 통째로 놓쳤다.
    무엇을 할지는 서버가 정하고 여기서는 그리기만 한다.

    모르는 툴은 조용히 넘긴다(아래 default) — 서버가 새 툴을 내보내도 옛 화면이 안 깨진다.
  */
  const { tool, params } = result;
  const searchable = tool === 'search_hospitals' || tool === 'search_nearby';

  return (
    <div className="max-w-[92%] rounded-card border border-line-subtle bg-surface-subtle px-3.5 py-3">
      {/*
        설명 문장과 계측 버튼을 한 줄에 세운다. **버튼이 오른쪽 위**라 문장 길이와 무관하게
        늘 같은 자리에 있고, 답변이 쌓여도 눈으로 찾을 필요가 없다.
      */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[0.82rem] leading-relaxed text-ink">
          {result.explain || t('aiSearch.noExplain')}
        </p>
        <CopyButton text={copyTextOf(result, preview.data?.items ?? [], t)} />
        <AnswerMeta result={result} at={at} />
      </div>

      {result.warnings.map((warning) => (
        <WarningBanner key={warning} warning={warning} />
      ))}

      {searchable && (
        <>
          <ConditionList result={result} />
          <ResultPreview preview={preview} />
          {/*
            거리순으로 갈 거라면 미리 말해 준다 — 검색으로 넘어가자마자 브라우저 권한 창이
            뜨는데, 예고 없이 뜨면 사용자가 무엇 때문인지 모른 채 거절한다.
          */}
          {tool === 'search_nearby' && <MyLocationNote place={place} />}
          {/*
            **폭을 채우지 않고 채운 색도 쓰지 않는다.** 말풍선 안의 주인공은 조건 칩과
            미리보기 카드인데, 꽉 찬 파란 버튼을 깔면 그쪽이 눌리고 답변마다 같은 덩어리가
            반복돼 대화가 무거워진다. 다음 행동이 있다는 표시로는 조용한 버튼으로 족하다.

            왼쪽에 세우는 것은 위의 글·칩·카드가 전부 왼쪽에서 시작하기 때문이다 —
            혼자 오른쪽에 있으면 시선이 한 번 건너뛴다.
          */}
          <div className="mt-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={onSearch}
              className="h-8 gap-1 px-3 text-[0.76rem]"
            >
              {t('aiSearch.goSearch')}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}

      {/*
        지역을 말했는데 코드로 못 옮긴 경우(역 이름·읍면동). **전국 검색으로 밀지 않는다** —
        사용자는 자기가 말한 동네가 반영된 줄 아는데 실제로는 아니라서, 한 번 묻는 게 맞다.
        조건은 그대로 들고 넘어가므로 검색 화면에서 지역만 고르면 된다.
      */}
      {tool === 'ask_location' && (
        <>
          <ConditionList result={result} />
          <p className="mt-2 text-[0.72rem] text-ink-subtle">
            {t('aiSearch.placeUnresolved', { place: params.placeText ?? '' })}
          </p>
          <div className="mt-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={onSearch}
              className="h-8 gap-1 px-3 text-[0.76rem]"
            >
              {t('aiSearch.pickRegion')}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}

      {/*
        답변. **문단을 살려 그린다** — 서버가 줄바꿈을 남겨 보내므로 whitespace-pre-line 이
        없으면 여러 문장이 한 덩어리로 붙는다.
      */}
      {tool === 'answer_medical' && params.answer && (
        <div className="mt-2.5 rounded-card bg-surface px-3 py-2.5">
          <p className="whitespace-pre-line text-[0.8rem] leading-relaxed text-ink">
            {params.answer}
          </p>
          {/*
            **매번 붙인다.** 일반 정보이지 개인 진단이 아니라는 걸 답 바로 옆에서 말해야
            한다 — 한 번만 보여주면 스크롤에 묻히고, 정작 판단하는 순간에는 안 보인다.
          */}
          <p className="mt-2 border-t border-line-subtle pt-2 text-[0.72rem] leading-relaxed text-ink">
            {t('aiSearch.answerDisclaimer')}
          </p>
        </div>
      )}

      {/*
        **건강 질문은 그냥 거절과 다르게 잇는다.** 지금 답할 수 없는 건 같지만,
        이건 "나중에 답할 수 있는 질문" 이라 갈 곳이 있다 — 그냥 범위 밖은 이어질 데가 없어
        explain 한 문장으로 끝난다.
      */}
      {tool === 'reject' && params.reason === 'medical_question' && (
        <div className="mt-2.5 rounded-card bg-brand-tint px-3 py-2.5">
          {/*
            **버튼은 없다.** 정식 서비스 전이라 보낼 데가 없다 — 유도해 놓고 갈 데가
            없는 것이 안내가 없는 것보다 나쁘다. 충전 화면이 생기면 그때 붙인다.

            "건강에 대한 질문이네요" 같은 되짚기도 뺐다. 바로 위 explain 이 이미
            "팔 통증의 원인을 물으셨네요" 라고 말해서 같은 말이 두 번 나온다.
          */}
          <p className="text-[0.76rem] leading-relaxed text-brand-strong">
            {t('aiSearch.medicalUpsell')}
          </p>
        </div>
      )}

      {/*
        **쓴 양을 맨 밑 왼쪽에 흘려 둔다.** 답변마다 붙지만 주인공이 아니라서 가장 옅은
        색에 가장 작은 글자다 — 찾으면 보이고 안 찾으면 안 걸리는 정도가 맞다.

        **본문 흐름 밖으로 뺀 이유는 복사 때문이다.** 설명 문장 옆에 인라인으로 두면
        답변을 긁을 때 숫자가 딸려 붙는다. 줄을 따로 쓰고 select-none 을 걸면 드래그가
        지나가도 선택에 안 들어간다.

        0 이면 아예 안 그린다(사전 차단 — 답을 안 준 경우다). "0" 을 적어 두면 뭔가
        잘못된 것처럼 보인다.
      */}
      {result.credits > 0 && (
        <div
          className="mt-2 select-none text-[0.6rem] tabular-nums text-ink-subtle"
          title={`${t('aiSearch.creditsLabel')} ${result.credits.toLocaleString()}`}
        >
          {compact(result.credits)}
        </div>
      )}
    </div>
  );
}

/**
 * 고를 수 있는 모델. **표시용이다 — 서버로 안 간다.**
 *
 * 서버는 설정(`llm.anthropic.defaultModel`)대로 부르므로, 여기서 고른 값을 요청에 실으면
 * 아무 효과가 없다. 그래서 지금은 **켤 수 있는 것과 실제로 도는 것을 하나로 맞춰** 뒀다 —
 * 표시가 실제와 어긋나는 것이 고를 수 없는 것보다 나쁘다.
 *
 * `locked` 는 "유료가 열리면 쓸 수 있다" 는 예고다. 목록에서 아예 빼면 그런 게 있다는 걸
 * 알 길이 없어서, 잠긴 채로 보여 준다.
 */
const MODELS = [
  { id: 'haiku', label: 'Haiku', locked: false },
  { id: 'opus', label: 'Opus', locked: true },
] as const;

/**
 * 모델 고르개. 잠긴 항목은 눌러도 안 바뀌고 자물쇠와 안내만 보여 준다.
 *
 * 선택 상태를 위(Provider)로 안 올린 이유는 **아직 아무 데도 안 쓰이기 때문**이다 —
 * 요청에 싣기 시작하면 그때 올린다.
 */
/**
 * 모델 고르개. 입력칸 위 정보 줄의 오른쪽에 선다 — 바로 아래 보내기 버튼과 같은 쪽이라
 * "무엇으로 보내지" 가 궁금해지는 자리다.
 *
 * **지금은 고를 게 하나뿐이다.** Opus 는 잠겨 있고, 고른 값은 서버로 안 간다 — 서버가
 * 설정대로 부르므로 여기 표시가 실제와 어긋나면 안 된다. 그래서 켤 수 있는 것과 실제로
 * 도는 것이 같은 하나(Haiku)로 맞춰 뒀다. 유료가 열리면 그때 요청에 싣는다(그 전에
 * 실으면 아무 효과 없이 요금만 남의 손에 넘어간다).
 */
function ModelPicker() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>(MODELS[0].id);
  const current = MODELS.find((m) => m.id === selected) ?? MODELS[0];

  return (
    <Popover.Root>
      <Popover.Trigger className="flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-bold text-ink-muted transition-colors active:bg-surface-subtle data-[state=open]:bg-surface-subtle">
        <Sparkles className="h-3 w-3 shrink-0 text-brand" />
        <span>Anthropic / {current.label}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-max min-w-[11rem] rounded-card border border-line-subtle bg-surface p-1 shadow-raised"
        >
          {MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              disabled={model.locked}
              onClick={() => setSelected(model.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-[0.76rem]',
                model.locked
                  ? 'cursor-not-allowed text-ink-subtle'
                  : 'font-bold text-ink active:bg-surface-subtle',
              )}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {model.locked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  selected === model.id && (
                    <Check className="h-3.5 w-3.5 text-brand" />
                  )
                )}
              </span>
              <span className="flex-1">{model.label}</span>
              {model.locked && (
                <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[0.62rem] font-bold text-ink-muted">
                  {t('aiSearch.modelLocked')}
                </span>
              )}
            </button>
          ))}
          <p className="px-2.5 pb-1.5 pt-1 text-[0.66rem] leading-relaxed text-ink-subtle">
            {t('aiSearch.modelLockedHint')}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** `HH:MM:SS`. 날짜는 안 적는다 — 대화가 새로고침이면 사라지므로 늘 오늘이다. */
function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour12: false });
}

/**
 * 말풍선을 글로 옮긴다. **화면에 보이는 순서 그대로** 이어 붙인다 — 붙여 넣은 쪽에서
 * 원문과 대조할 사람이라, 순서가 다르면 같은 내용인지 확인하는 데 시간이 든다.
 *
 * 병원 목록까지 넣는다. 조건만 옮겨 봐야 **그래서 뭐가 나왔는지**가 빠져서, 남에게
 * 보낼 때 정작 필요한 부분이 없다.
 */
function copyTextOf(
  result: AiSearchResponse,
  hospitals: Hospital[],
  t: TFunction,
): string {
  const parts: string[] = [result.explain, result.params.answer ?? ''];

  const conditions = result.conditions.map(
    (c) => `${t(`aiSearch.conditions.${c.group}`)}: ${c.names.join(', ')}`,
  );
  parts.push(conditions.join('\n'));

  // 주소를 같이 적는다 — 이름만으로는 같은 상호가 여럿이라 어디인지 못 찾는다.
  parts.push(
    hospitals
      .map((h) => {
        const where = h.location.address;
        return `- ${h.name}${where ? ` (${where})` : ''}`;
      })
      .join('\n'),
  );

  return parts.filter((part) => part.trim()).join('\n\n');
}

/**
 * 말풍선 복사. **답변이 길어서 있는 물건이다** — 의학 답변은 여러 문단이라 드래그로
 * 긁으면 위아래 말풍선까지 딸려 온다.
 *
 * 누른 뒤 잠깐 체크로 바뀐다. 클립보드는 성공해도 화면이 안 변해서, 표시가 없으면
 * 눌린 건지 몰라 두세 번 누르게 된다.
 */
function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // 언마운트 뒤에 setState 가 돌지 않도록 타이머를 들고 있는다(대화 지우기로 사라진다).
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!text) {
    return null;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // http 로 열었거나(보안 컨텍스트 아님) 사용자가 권한을 막은 경우. 조용히 넘긴다 —
      // 복사가 안 됐다고 경고창을 띄울 만한 일이 아니고, 체크 표시가 안 뜨는 것으로 드러난다.
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t(copied ? 'aiSearch.copied' : 'aiSearch.copy')}
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-surface"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-brand" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

interface MetaRow {
  label: string;
  value: string;
  strong?: boolean;
}

/**
 * 라벨-값 표. **라벨과 값을 붙여 놓는다** — 양끝 정렬로 두면 패널 폭만큼 사이가 벌어져
 * 어느 값이 어느 라벨의 것인지 눈으로 이어 붙여야 한다. `auto 1fr` 그리드라 라벨 열은
 * 가장 긴 라벨 폭이고 값은 그 바로 옆에 선다.
 */
function MetaRows({ rows, muted }: { rows: MetaRow[]; muted?: boolean }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.68rem]">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt className="text-ink-subtle">{row.label}</dt>
          <dd
            className={cn(
              'tabular-nums',
              muted ? 'text-ink-muted' : 'text-ink-body',
              row.strong && 'font-extrabold text-ink',
            )}
          >
            {row.value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * 답변 하나의 계측값. `i` 를 눌러야 나온다 — 평소엔 아무도 안 궁금해하는 숫자다.
 *
 * **두 칸으로 나뉜다.** 위는 사용자에게 청구된 값(`credits`)이고, 선 아래는 우리 원가
 * 내역이다. 둘은 단위가 달라서 — credits 는 출력을 더 무겁게 쳐서 접은 환산값이라
 * input+output 과 안 맞는다 — 섞어 두면 "왜 합이 안 맞나" 가 된다.
 *
 * **아래 칸은 로컬·개발에만 있다.** 토큰 수는 단가에 곱할 수량이라 운영 응답에는
 * `debug` 자체가 없다. 모델 이름은 곱할 것이 없어 위 칸에 그대로 둔다.
 *
 * **캐시가 두 겹이라 나눠 적는다.** 이름이 둘 다 "캐시" 라 뭉뚱그리면 어느 쪽이 먹었는지
 * 알 수 없는데, 둘은 아끼는 것이 다르다:
 *
 *   cacheLocal   우리 Redis. 같은 질문이면 **LLM 을 아예 안 부른다**(요금 0, 수 ms)
 *   업체 캐시     Anthropic 프롬프트 캐시. 부르긴 하되 **입력 요금이 1/10** (지연은 그대로)
 *
 * cacheLocal 이 HIT 면 같은 칸의 토큰 값들은 **처음 물었을 때** 쓴 값이다 — 이번 요청은
 * 업체를 안 불렀다. 그래도 위 칸의 `credits` 는 평소와 같다(질문 하나의 값이지 우리
 * 원가가 아니다). 그래서 cacheLocal 도 아래 칸에 있다.
 */
function AnswerMeta({
  result,
  at,
}: {
  result: AiSearchResponse;
  at: number;
}) {
  const { t } = useTranslation();
  const n = (value: number | undefined) => (value ?? 0).toLocaleString();

  /*
    **라벨은 번역하지 않는다.** 확인하려고 여는 패널이고, 여기 적히는 이름을 응답 JSON 의
    필드명과 같게 두면 화면에서 본 값을 그대로 찾을 수 있다 — "캐시 읽기" 가
    `cacheReadTokens` 라는 걸 매번 머리로 옮길 이유가 없다.

    번역이 필요한 것은 버튼의 aria-label 뿐이다. 그건 스크린리더가 읽는 진짜 문장이다.
  */
  const rows: MetaRow[] = [
    { label: 'model', value: result.model },
    // **사용자가 실제로 쓴 양이다.** 원시 토큰이 아니라 환산된 통합 토큰이라, 아래
    // 디버깅 칸의 input/output 과 더해도 이 값이 안 나온다 — 그래서 칸을 나눠 둔다.
    { label: 'credits', value: n(result.credits), strong: true },
    // 브라우저 시각이다(서버 시각이 아니라) — 사용자가 자기 화면의 다른 기록과 맞춰 보는 자리다.
    { label: 'requestedAt', value: clockTime(at) },
    { label: 'respondedAt', value: clockTime(at + result.elapsedMs) },
    { label: 'elapsed', value: `${n(result.elapsedMs)} ms` },
  ];

  /*
    **원시 토큰 내역은 로컬·개발에서만 온다.** 운영 응답에는 `debug` 자체가 없다 —
    모델 이름과 달리 이쪽은 곱할 수량이라 단가와 맞물리면 요금이 역산되기 때문이다.
    그래서 여기서는 "있으면 그린다" 로 족하다. 없는 게 정상이다.
  */
  const debugRows: MetaRow[] | undefined = result.debug && [
    { label: 'cacheLocal', value: result.debug.cached ? 'HIT' : 'MISS' },
    { label: 'input', value: n(result.debug.usage.inputTokens) },
    { label: 'output', value: n(result.debug.usage.outputTokens) },
    { label: 'cacheRead', value: n(result.debug.usage.cacheReadTokens) },
    { label: 'cacheWrite', value: n(result.debug.usage.cacheWriteTokens) },
  ];

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t('aiSearch.metaToggle')}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-surface data-[state=open]:bg-brand data-[state=open]:text-white"
      >
        <Info className="h-3.5 w-3.5" />
      </Popover.Trigger>

      {/*
        **말풍선 안이 아니라 위에 띄운다.** 안에서 펼치면 그만큼 말풍선이 길어져 아래 내용이
        밀리고, 닫을 때 스크롤이 튄다 — 잠깐 확인하고 닫는 물건이라 레이아웃을 건드리면 안 된다.
        Popover 는 바깥 클릭·Esc 로 닫히고, 채팅 패널이 비모달이라 그 위에 겹치는 것도 자연스럽다.
      */}
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-max rounded-card border border-line-subtle bg-surface p-2.5 shadow-raised"
        >
          <MetaRows rows={rows} />
          {/*
            **디버깅 값은 선 아래로 내린다.** 위 칸은 사용자에게 청구된 값이고 아래는
            우리 원가 내역이라, 섞어 두면 `credits` 와 `input`/`output` 이 같은 층으로
            읽혀 "왜 안 맞나" 가 된다. 운영에서는 이 칸이 통째로 없다.
          */}
          {debugRows && (
            <div className="mt-2 border-t border-line-subtle pt-2">
              <MetaRows rows={debugRows} muted />
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * "내 위치 기준" 이라고 판단됐을 때 **어디를 기준으로 삼는지** 밝힌다.
 *
 * 위치를 안 밝히면 "가까운 순" 이라는 말만으로는 확인이 안 된다 — 사용자가 옆 동네에
 * 있다고 착각한 채 결과를 믿게 된다.
 *
 * **권한을 아직 안 물어봤으면 버튼을 둔다.** 답변이 뜨자마자 브라우저 권한 창이 저절로
 * 튀어나오면 사용자는 무엇 때문인지 모른 채 거절하고, 한 번 거절하면 되돌리기 어렵다.
 * 이미 허용해 둔 경우에만 조용히 잡는다(그건 창이 안 뜬다).
 */
function MyLocationNote({ place }: { place: MyPlace }) {
  const { t } = useTranslation();
  const { coords, label, locating, granted, denied, locate } = place;

  // 이미 허용된 상태에서만 자동으로 잡는다. 창이 안 뜨므로 사용자를 놀래지 않는다.
  useEffect(() => {
    if (granted && !coords && !locating) locate();
  }, [granted, coords, locating, locate]);

  const line = 'mt-2 text-[0.72rem] text-ink-subtle';

  if (denied) {
    return <p className={line}>{t('aiSearch.myLocationDenied')}</p>;
  }
  if (locating) {
    return (
      <p className={cn(line, 'flex items-center gap-1.5')}>
        <Spinner className="h-3 w-3" />
        {t('aiSearch.myLocationLocating')}
      </p>
    );
  }
  if (label) {
    return (
      <p className={cn(line, 'font-bold text-ink-muted')}>
        {t('aiSearch.myLocationBasis', { place: label })}
      </p>
    );
  }
  // 좌표는 잡혔는데 지역 이름이 아직인 짧은 구간. 굳이 버튼으로 되돌리지 않는다.
  if (coords) {
    return <p className={line}>{t('aiSearch.myLocationGeneric')}</p>;
  }
  return (
    <button
      type="button"
      onClick={locate}
      className="mt-2 inline-flex items-center gap-1 rounded-field px-2 py-1 text-[0.72rem] font-bold text-brand ring-1 ring-inset ring-brand/30 active:bg-brand-tint"
    >
      <LocateFixed className="h-3 w-3" />
      {t('aiSearch.myLocationAsk')}
    </button>
  );
}

/**
 * 미리보기에 띄울 병원 수. **적게 두는 게 핵심이다** — 여기는 목록을 읽는 자리가 아니라
 * "조건이 맞게 잡혔나" 를 눈으로 확인하는 자리다. 많이 깔면 채팅창이 목록 화면이 되고,
 * 정작 사용자가 눌러야 할 다음 질문 입력칸이 저 아래로 밀린다.
 */
const PREVIEW_SIZE = 3;

/**
 * 조건으로 실제 검색해 **상위 몇 곳과 전체 건수**를 보여준다.
 *
 * 검색 화면과 **같은 조건 객체(filterToQuery)** 를 쓴다 — 여기서 본 3곳과 넘어가서 보는
 * 목록이 다르면 미리보기가 거짓말이 된다.
 *
 * 실패는 조용히 삼킨다. 조건은 이미 위에 칩으로 나와 있고 검색 버튼도 살아 있어서,
 * 미리보기가 안 뜨는 것이 흐름을 막지 않는다 — 여기에 오류 배너까지 띄우면 정작
 * 성공한 AI 응답이 실패처럼 보인다.
 */
/**
 * 미리보기 질의. **말풍선이 들고 있다** — 카드를 그리는 데도 쓰고 복사에도 쓴다.
 *
 * 예전엔 ResultPreview 안에 있었는데, 그러면 복사 버튼이 병원 목록을 볼 수 없다.
 * 같은 키로 두 번 부르면 React Query 가 합쳐 주긴 하지만 키를 만드는 규칙이 두 군데로
 * 갈려서, 한쪽만 고치면 조용히 다른 목록을 복사하게 된다.
 */
function usePreview(result: AiSearchResponse, place: MyPlace) {
  /*
    **좌표가 있으면 거리순으로 맞춘다.** 검색으로 넘어가면 `sort=distance` 로 가는데
    미리보기만 기본 정렬이면, 여기서 본 3곳과 넘어가서 보는 첫 3곳이 완전히 달라진다 —
    전국에서 아무거나 셋을 보여주고는 "가까운 순으로 찾아드릴게요" 라고 적는 꼴이다.

    좌표가 아직 없으면 조건까지만 맞춘다. 건수는 어차피 같고, 순서만 나중에 정해진다.
  */
  const nearby = result.tool === 'search_nearby' && place.coords;

  return useHospitalSearch({
    page: 1,
    size: PREVIEW_SIZE,
    ...paramsToQuery(result.params),
    ...(nearby ? { sort: 'distance' as const, origin: place.coords } : {}),
  });
}

function ResultPreview({
  preview,
}: {
  preview: ReturnType<typeof usePreview>;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = preview;

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-[0.72rem] text-ink-subtle">
        <Spinner className="h-3 w-3" />
        {t('aiSearch.previewLoading')}
      </div>
    );
  }
  if (isError || !data) return null;

  const items = data.items ?? [];
  if (items.length === 0) {
    return (
      <p className="mt-3 text-[0.72rem] text-ink-subtle">
        {t('aiSearch.previewEmpty')}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-line-subtle pt-2.5">
      {/*
        **전체 건수와 보여준 개수를 같이 적는다.** "1,200곳을 찾았어요" 만 쓰고 카드를 셋만
        깔면 나머지가 어디 갔는지 알 수 없다 — 이게 목록이 아니라 맛보기라는 걸 숫자로 말한다.
        천 단위 구분은 로케일에 맡긴다(1200 → 1,200).
      */}
      <p className="mb-1.5 text-[0.72rem] font-bold text-ink-muted">
        {t('aiSearch.previewCount', {
          total: data.totalCount.toLocaleString(),
          shown: items.length,
        })}
      </p>
      <ul className="space-y-1.5">
        {items.map((hospital) => (
          <li key={hospital.id}>
            <PreviewCard hospital={hospital} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 미리보기 카드 한 장. **누르면 바로 안 간다 — 한 번 묻는다.**
 *
 * 여기서 이동하면 채팅 레이어가 닫히고 페이지가 통째로 바뀐다. 좁은 패널에 카드가 붙어
 * 있어서 스크롤하다 손가락이 스치기 쉬운데, 그 한 번에 대화가 통째로 사라지면 다시
 * 물어봐야 한다 — 되돌리는 비용이 큰 행동이라 확인을 한 단계 둔다.
 *
 * **모달로 묻지 않는다.** 이 패널 자체가 비모달이라(뒤 화면을 쓰라고 열어 둔 것) 그 위에
 * 포커스를 가두는 창을 띄우면 앞뒤가 안 맞는다. 카드가 그 자리에서 확인 상태로 바뀐다.
 */
function PreviewCard({ hospital }: { hospital: Hospital }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  // 목록 카드와 같은 배지를 쓴다 — 같은 병원이 화면마다 다른 옷을 입으면 같은 것으로 안 읽힌다.
  // TIER1(의원급)은 빼는 것도 그쪽 규칙 그대로다(대부분이라 붙여 봐야 구분이 안 된다).
  const badges = (
    <div className="flex flex-wrap items-center gap-1">
      {hospital.tier && hospital.tier.code !== 'TIER1' && (
        <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[0.64rem] font-extrabold text-brand-strong">
          {hospital.tier.name}
        </span>
      )}
      {hospital.specialty && (
        <span className="rounded-full bg-ok-tint px-2 py-0.5 text-[0.64rem] font-extrabold text-ok">
          {hospital.specialty.name
            ? `${hospital.specialty.name} ${t('clinic.specialtyHospital')}`
            : t('clinic.specialtyHospital')}
        </span>
      )}
      {hospital.emergency && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-danger-tint px-2 py-0.5 text-[0.64rem] font-extrabold text-danger">
          <Ambulance className="h-2.5 w-2.5" /> {t('clinic.badge.emergency')}
        </span>
      )}
      {hospital.baby && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[0.64rem] font-extrabold text-amber-600">
          <Baby className="h-2.5 w-2.5" /> {t('clinic.badge.baby')}
        </span>
      )}
    </div>
  );

  const where = [hospital.category?.name, hospital.location.region?.name]
    .filter(Boolean)
    .join(' · ');

  if (confirming) {
    return (
      <div className="rounded-card border border-brand/40 bg-brand-tint/30 px-3 py-2.5">
        <p className="truncate text-[0.76rem] text-ink">
          {t('aiSearch.openConfirm', { name: hospital.name })}
        </p>
        <div className="mt-2 flex gap-1.5">
          {/*
            LangLink 를 버튼처럼 쓴다. 실제 이동은 링크가 해야 새 탭·가운데 클릭이 살아 있고,
            브라우저가 "누르면 어디로 가는지" 를 미리 보여준다.
          */}
          <LangLink
            to={`/hospitals/${hospital.id}`}
            className="flex h-8 flex-1 items-center justify-center gap-1 rounded-field bg-brand text-[0.76rem] font-bold text-white active:bg-brand-strong"
          >
            {t('aiSearch.openConfirmYes')}
            <ArrowRight className="h-3 w-3" />
          </LangLink>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-8 rounded-field px-3 text-[0.76rem] font-bold text-ink-muted ring-1 ring-inset ring-line active:bg-surface"
          >
            {t('aiSearch.openConfirmNo')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="w-full rounded-card border border-line-subtle bg-surface px-3 py-2.5 text-left transition-colors active:bg-surface-subtle"
    >
      {badges}
      <div className="mt-1 flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[0.82rem] font-extrabold tracking-tight text-ink">
          {hospital.name}
        </span>
        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
      </div>
      {where && (
        <p className="mt-0.5 truncate text-[0.7rem] text-ink-subtle">{where}</p>
      )}
    </button>
  );
}

/**
 * 잡힌 조건. **"AI 가 내 말을 이렇게 알아들었구나" 를 확인하는 자리**라, 개수가 아니라
 * 이름을 적는다 — "진료과 3" 은 3개라는 뜻인지 3번 코드라는 뜻인지도 안 읽히고,
 * 정작 알고 싶은 *무슨* 진료과인지에 답하지 않는다.
 *
 * 이름은 서버가 붙여 준다(`result.conditions`). 코드표를 여기서 또 부르면 채팅을 열
 * 때마다 요청이 나가고, 그러면서도 결국 같은 값이 나온다.
 *
 * 등급·응급실·병원명은 코드표가 없어서 여기서 만든다.
 */
function ConditionList({ result }: { result: AiSearchResponse }) {
  const { t } = useTranslation();
  const { filter } = result.params;

  const rows = result.conditions.map((c) => ({
    key: c.group,
    label: t(`aiSearch.conditions.${c.group}`),
    value: c.names.join(', '),
  }));

  // 코드표에 없는 값들. 서버가 이름을 못 붙이므로 화면이 자기 문구를 쓴다.
  const flags = [
    filter.tiers.length > 0
      ? t('aiSearch.conditions.tier', { count: filter.tiers.length })
      : null,
    filter.emergency ? t('aiSearch.conditions.emergency') : null,
    filter.baby ? t('aiSearch.conditions.baby') : null,
    filter.name,
  ].filter(Boolean) as string[];

  if (rows.length === 0 && flags.length === 0) {
    return null;
  }

  return (
    <dl className="mt-2.5 space-y-1 text-[0.74rem] leading-relaxed">
      {rows.map((row) => (
        // **앞말과 값을 한 줄에 흘린다.** 줄을 나누면 조건 하나가 두 줄을 먹어서,
        // 네댓 개만 잡혀도 말풍선이 표처럼 길어진다.
        <div key={row.key} className="flex gap-1.5">
          <dt className="shrink-0 font-bold text-ink-muted">{row.label}</dt>
          <dd className="min-w-0 text-ink">{row.value}</dd>
        </div>
      ))}
      {flags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pt-0.5">
          {flags.map((flag) => (
            <Chip key={flag}>{flag}</Chip>
          ))}
        </ul>
      )}
    </dl>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-full bg-surface px-2.5 py-1 text-[0.72rem] font-bold text-ink-muted ring-1 ring-inset ring-line-subtle">
      {children}
    </li>
  );
}

function WarningBanner({ warning }: { warning: AiSearchWarning }) {
  const { t } = useTranslation();
  const style = WARNING_STYLE[warning];
  if (!style) return null;
  const { icon: Icon, box } = style;

  return (
    <div
      className={cn(
        'mt-2.5 flex items-start gap-2 rounded-tile px-2.5 py-2 text-[0.74rem] leading-relaxed',
        box,
      )}
    >
      <Icon className="mt-[0.1rem] h-3.5 w-3.5 shrink-0" />
      <span>{t(`aiSearch.warnings.${warning}`)}</span>
    </div>
  );
}

/**
 * 실패한 turn. **다시 시도 버튼이 핵심이다** — 보낸 질문은 이미 입력칸에서 지워졌으므로,
 * 이 버튼이 없으면 사용자가 방금 친 문장을 통째로 다시 쳐야 한다.
 */
function ErrorBubble({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-[92%] rounded-card border border-line-subtle bg-surface-subtle px-3.5 py-3">
      <p className="text-[0.82rem] leading-relaxed text-ink-muted">
        {t('aiSearch.error')}
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onRetry}
        className="mt-2.5"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('aiSearch.retry')}
      </Button>
    </div>
  );
}
