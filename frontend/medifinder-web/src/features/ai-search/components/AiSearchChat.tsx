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
  ChevronRight,
  LocateFixed,
  Info,
  Maximize2,
  Minimize2,
  RotateCcw,
  Siren,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
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
  type AiSearchFilter,
  type AiSearchResponse,
  type AiSearchWarning,
} from '../api';

/** 질문 길이 상한. 서버(MAX_QUESTION_LENGTH)와 같은 값이라 넘기기 전에 여기서 막는다. */
const MAX_LENGTH = 300;

/**
 * 마지막 답변이 밝힌 업체. 아직 답이 없으면 undefined 다.
 *
 * **모델 이름은 여기 없다** — 하단은 늘 보이는 줄이라 `claude-haiku-4-5-20251001` 같은
 * 식별자가 상시 떠 있으면 읽을 것도 없이 자리만 차지한다. 모델은 말풍선의 i 에서 본다.
 *
 * 첫 글자만 올린다(anthropic → Anthropic).
 */
function lastProvider(turns: Turn[]): string | undefined {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role === 'assistant') {
      const { provider } = turn.result;
      return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  }
  return undefined;
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
  const { size, resizing, onPointerDown, reset } = usePanelSize();
  // 저장된 대화를 이어받을 수 있으므로 **마지막 id 다음부터** 센다. 0 부터 시작하면
  // 새로고침 뒤 첫 질문이 기존 turn 과 key 가 겹쳐 React 가 엉뚱한 것을 다시 쓴다.
  const nextId = useRef(Math.max(0, ...turns.map((turn) => turn.id + 1)));

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 발송 중 잠금. **상태가 아니라 ref 인 이유**는 ask() 주석 참고(렌더를 기다리면 늦다). */
  const sendingRef = useRef(false);
  const { mutate, isPending } = useAiSearch();

  // 새 turn 이 쌓이면 맨 아래로. 답이 화면 밖에서 조용히 추가되면 아무 일도 안 한 것처럼 보인다.
  useEffect(() => {
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
    */
    if (!q || sendingRef.current) return;
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
   * 입력칸 위에 표시할 "누가 답했나". **마지막 응답 기준**이다 — 설정을 바꿔 업체가
   * 갈리면 그때부터 새 값이 보여야 하므로 첫 응답에 고정하지 않는다.
   */
  const provider = lastProvider(turns);

  /**
   * 내 위치. **패널에 하나만 둔다** — 답변 말풍선마다 훅을 돌리면 "근처" 질문을 세 번 했을 때
   * 측위도 세 번 하고, 권한 창도 그만큼 뜬다. 여기서 한 번 잡아 모든 말풍선이 나눠 쓴다.
   */
  const place = useMyPlace();

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
            'fixed bottom-3 right-3 z-50 flex animate-slide-up flex-col overflow-hidden rounded-card border border-line-subtle bg-surface shadow-raised sm:bottom-5 sm:right-5',
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
              대화 지우기. **대화가 있을 때만 보인다** — 빈 화면에 지울 것도 없는 버튼이
              떠 있으면 자리만 차지한다.

              닫기와 나란히 두지 않고 왼쪽에 떼어 둔 이유는, 닫기는 되돌릴 수 있지만
              (대화가 남아 있다) 이건 못 되돌리기 때문이다. 손가락이 미끄러질 자리를 벌린다.
            */}
            {turns.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                aria-label={t('aiSearch.clear')}
                title={t('aiSearch.clear')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-transform duration-100 ease-native active:scale-90"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {turns.length === 0 ? (
              <EmptyState onAsk={send} />
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

          {/*
          입력. **세이프에어리어를 더한다** — 아이폰에서 홈 인디케이터 위로 입력칸이 걸린다.
        */}
          <form
            onSubmit={ask}
            className="border-t border-line-subtle bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
          >
            {/*
              무엇이 답했는지. **마지막 응답 기준**이라 아직 아무것도 안 물었으면 안 나온다.

              말풍선마다 붙이지 않고 여기 한 줄로 모은 이유는, 대화가 쌓여도 같은 값이
              반복되기 때문이다 — 답변마다 모델 이름이 따라붙으면 정작 읽어야 할 explain 이
              묻힌다. 입력칸 위는 "지금 무엇과 이야기하고 있나" 가 궁금해지는 자리다.
            */}
            {provider && (
              <div className="mb-2 flex items-center justify-center gap-1.5 rounded-full bg-brand-tint px-3 py-1">
                <Sparkles className="h-3 w-3 shrink-0 text-brand" />
                {/*
                  캐시 여부는 여기 안 적는다. 늘 보이는 줄이라 "저장된 답" 같은 꼬리표가
                  붙으면 답의 품질이 다른 것처럼 읽히는데, 실제로는 같은 답이다.
                  궁금한 사람은 말풍선의 i 에서 cacheLocal 을 본다.
                */}
                <span className="truncate text-[0.68rem] font-extrabold text-brand-strong">
                  {t('aiSearch.analyzedBy', { provider })}
                </span>
              </div>
            )}

            {/*
              보내기 버튼을 **칸 안에** 넣는다. 패널 폭이 400px 밖에 안 되는데 버튼을 밖에
              세우면 그만큼 입력칸이 좁아져, 긴 질문을 칠 때 앞부분이 밀려 안 보인다.
            */}
            <div className="relative">
              <input
                ref={inputRef}
                value={question}
                onChange={(e) =>
                  setQuestion(e.target.value.slice(0, MAX_LENGTH))
                }
                placeholder={t('aiSearch.placeholder')}
                aria-label={t('aiSearch.placeholder')}
                className="h-11 w-full rounded-field bg-surface px-3.5 pr-11 text-sm text-ink outline-none ring-1 ring-inset ring-line placeholder:text-ink-subtle focus:ring-2 focus:ring-brand"
              />
              <button
                type="submit"
                disabled={!question.trim() || isPending}
                aria-label={t(
                  isPending ? 'aiSearch.thinking' : 'aiSearch.send',
                )}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white transition-transform duration-100 ease-native active:scale-90 disabled:bg-surface-subtle disabled:text-ink-subtle"
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
            {/*
            면책. **입력칸 바로 아래**다 — 보내기 직전에 읽히는 자리라야 의미가 있다.
            푸터에 있는 고지와 겹치지만, 여기서는 "AI 가 답한다" 는 맥락이 더해진다.
          */}
            <p className="mt-2 text-center text-[0.66rem] leading-relaxed text-ink-subtle">
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
function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
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
              className="w-full rounded-full bg-brand-tint px-3 py-2 text-center text-[0.8rem] font-bold text-brand transition-transform duration-100 ease-native active:scale-[0.98]"
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
        <AnswerMeta result={result} at={at} />
      </div>

      {result.warnings.map((warning) => (
        <WarningBanner key={warning} warning={warning} />
      ))}

      {searchable && (
        <>
          <ConditionChips filter={params.filter} />
          <ResultPreview result={result} place={place} />
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
          <ConditionChips filter={params.filter} />
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

      {/* reject 는 explain 한 문장이 전부다. 조건도 버튼도 붙일 게 없다. */}
    </div>
  );
}

/**
 * 답변 하나의 계측값. `i` 를 눌러야 나온다 — 평소엔 아무도 안 궁금해하는 숫자다.
 *
 * **캐시가 두 겹이라 나눠 적는다.** 이름이 둘 다 "캐시" 라 뭉뚱그리면 어느 쪽이 먹었는지
 * 알 수 없는데, 둘은 아끼는 것이 다르다:
 *
 *   cacheLocal   우리 Redis. 같은 질문이면 **LLM 을 아예 안 부른다**(요금 0, 수 ms)
 *   업체 캐시     Anthropic 프롬프트 캐시. 부르긴 하되 **입력 요금이 1/10** (지연은 그대로)
 *
 * cacheLocal 이 HIT 면 아래 토큰 값들은 **처음 물었을 때** 쓴 값이다 — 이번 요청은
 * 한 톨도 안 썼다. 그 구분이 없으면 합산하는 쪽이 실제보다 크게 센다.
 */
/** `HH:MM:SS`. 날짜는 안 적는다 — 대화가 새로고침이면 사라지므로 늘 오늘이다. */
function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour12: false });
}

function AnswerMeta({
  result,
  at,
}: {
  result: AiSearchResponse;
  at: number;
}) {
  const { t } = useTranslation();
  const { usage } = result;
  const n = (value: number | undefined) => (value ?? 0).toLocaleString();

  /*
    **라벨은 번역하지 않는다.** 개발자가 확인하려고 여는 패널이고, 여기 적히는 이름을
    응답 JSON 의 필드명과 같게 두면 화면에서 본 값을 그대로 찾을 수 있다 —
    "캐시 읽기" 가 `cacheReadTokens` 라는 걸 매번 머리로 옮길 이유가 없다.

    번역이 필요한 것은 버튼의 aria-label 뿐이다. 그건 스크린리더가 읽는 진짜 문장이다.
  */
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'model', value: result.model },
    // 브라우저 시각이다(서버 시각이 아니라) — 사용자가 자기 화면의 다른 기록과 맞춰 보는 자리다.
    { label: 'requestedAt', value: clockTime(at) },
    { label: 'respondedAt', value: clockTime(at + result.elapsedMs) },
    { label: 'elapsed', value: `${n(result.elapsedMs)} ms` },
    {
      label: 'cacheLocal',
      value: result.cached ? 'HIT' : 'MISS',
      strong: true,
    },
    { label: 'input', value: n(usage.inputTokens) },
    { label: 'output', value: n(usage.outputTokens) },
    { label: 'cacheRead', value: n(usage.cacheReadTokens) },
    { label: 'cacheWrite', value: n(usage.cacheWriteTokens) },
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
          {/*
            **라벨과 값을 붙여 놓는다.** 양끝 정렬(justify-between)로 두면 패널 폭만큼 사이가
            벌어져 어느 값이 어느 라벨의 것인지 눈으로 이어 붙여야 한다.
            `auto 1fr` 그리드라 라벨 열은 가장 긴 라벨 폭이고, 값은 그 바로 옆에 선다.
          */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.68rem]">
            {rows.map((row) => (
              <Fragment key={row.label}>
                <dt className="text-ink-subtle">{row.label}</dt>
                <dd
                  className={cn(
                    'tabular-nums text-ink-body',
                    row.strong && 'font-extrabold text-ink',
                  )}
                >
                  {row.value}
                </dd>
              </Fragment>
            ))}
          </dl>
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
function ResultPreview({
  result,
  place,
}: {
  result: AiSearchResponse;
  place: MyPlace;
}) {
  const { t } = useTranslation();

  /*
    **좌표가 있으면 거리순으로 맞춘다.** 검색으로 넘어가면 `sort=distance` 로 가는데
    미리보기만 기본 정렬이면, 여기서 본 3곳과 넘어가서 보는 첫 3곳이 완전히 달라진다 —
    전국에서 아무거나 셋을 보여주고는 "가까운 순으로 찾아드릴게요" 라고 적는 꼴이다.

    좌표가 아직 없으면 조건까지만 맞춘다. 건수는 어차피 같고, 순서만 나중에 정해진다.
  */
  const nearby = result.tool === 'search_nearby' && place.coords;

  const { data, isLoading, isError } = useHospitalSearch({
    page: 1,
    size: PREVIEW_SIZE,
    ...paramsToQuery(result.params),
    ...(nearby ? { sort: 'distance' as const, origin: place.coords } : {}),
  });

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

/** 잡힌 조건. 서버가 준 코드를 그대로 쓰지 않고 **사람이 읽는 이름**으로 바꿔 보여준다. */
function ConditionChips({ filter }: { filter: AiSearchFilter }) {
  const { t } = useTranslation();

  /*
    코드 → 이름 변환은 아직 안 한다. 메타 API(진료과목·평가항목)를 여기서 또 부르면
    레이어를 열 때마다 요청이 나가고, 캐시를 태워도 첫 열림이 느려진다.
    지금은 **몇 개의 조건이 잡혔는지**만 보여주고, 정확한 이름은 검색 화면의 필터 칩이 맡는다.
  */
  const groups: { key: string; count: number }[] = [
    { key: 'subject', count: filter.subjectCds.length },
    { key: 'specialist', count: filter.specialistCds.length },
    { key: 'assessment', count: filter.asmItemCds.length },
    { key: 'specialty', count: filter.specialtyCds.length },
    { key: 'equipment', count: filter.equipmentCds.length },
    { key: 'tier', count: filter.tiers.length },
  ].filter((g) => g.count > 0);

  const flags = [
    filter.emergency ? 'emergency' : null,
    filter.baby ? 'baby' : null,
  ].filter(Boolean) as string[];

  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5">
      {groups.map((group) => (
        <Chip key={group.key}>
          {t(`aiSearch.chips.${group.key}`, { count: group.count })}
        </Chip>
      ))}
      {flags.map((flag) => (
        <Chip key={flag}>{t(`aiSearch.chips.${flag}`)}</Chip>
      ))}
      {filter.name && <Chip>{filter.name}</Chip>}
    </ul>
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
