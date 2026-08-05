import { useCallback, useRef, useState, type PointerEvent } from 'react';

/**
 * 패널 크기. 픽셀로 든다 — 드래그로 자유롭게 조절하는 값이라 단계(sm/lg)로는 표현이 안 된다.
 */
export interface PanelSize {
  width: number;
  height: number;
}

/** 기본 크기. PC 에서 조건 칩이 한 줄에 들어가는 폭을 기준으로 잡았다. */
const DEFAULT_SIZE: PanelSize = { width: 480, height: 620 };

/**
 * 최소 크기. 이보다 작으면 입력칸과 헤더만 남아 대화가 안 보인다 —
 * 줄일 수는 있게 하되 쓸모없어지는 지점에서 멈춘다.
 */
const MIN_SIZE: PanelSize = { width: 320, height: 320 };

/** 화면 가장자리에 남기는 여백. 패널이 화면에 딱 붙으면 리사이즈 손잡이를 잡을 수 없다. */
const VIEWPORT_MARGIN = 24;

const STORAGE_KEY = 'medifinder.aiSearch.panel';

function read(): PanelSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SIZE;
    const parsed = JSON.parse(raw) as Partial<PanelSize>;
    return {
      width: Number(parsed.width) || DEFAULT_SIZE.width,
      height: Number(parsed.height) || DEFAULT_SIZE.height,
    };
  } catch {
    // 시크릿 모드·저장 차단·깨진 값. 기본 크기로 연다.
    return DEFAULT_SIZE;
  }
}

function write(size: PanelSize): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    // 저장이 막혀도 이번 세션은 동작한다. 조용히 넘긴다.
  }
}

/** 화면 밖으로 못 나가게 자른다. 창을 줄인 뒤 다시 열었을 때도 여기서 걸린다. */
function clamp(size: PanelSize): PanelSize {
  const maxWidth = Math.max(
    MIN_SIZE.width,
    window.innerWidth - VIEWPORT_MARGIN * 2,
  );
  const maxHeight = Math.max(
    MIN_SIZE.height,
    window.innerHeight - VIEWPORT_MARGIN * 2,
  );
  return {
    width: Math.min(Math.max(size.width, MIN_SIZE.width), maxWidth),
    height: Math.min(Math.max(size.height, MIN_SIZE.height), maxHeight),
  };
}

/** 어느 손잡이를 잡았나. 왼쪽=폭, 위=높이, 왼쪽위 모서리=둘 다. */
export type ResizeEdge = 'left' | 'top' | 'corner';

/**
 * 드래그로 크기를 바꾸는 패널.
 *
 * **패널이 오른쪽 아래에 고정돼 있어서 부호가 뒤집힌다** — 왼쪽 손잡이를 왼쪽으로 끌면
 * (clientX 가 줄면) 폭이 **늘어난다**. 위 손잡이도 마찬가지다. 그래서 시작점과의 차이를
 * 그대로 더하지 않고 빼야 한다.
 *
 * **Pointer Events 를 쓴다**(mouse/touch 를 나누지 않는다). setPointerCapture 로 포인터를
 * 손잡이에 묶어 두면, 드래그 중 커서가 패널 밖으로 나가도 이벤트가 계속 들어온다 —
 * 안 묶으면 빨리 끌었을 때 중간에 놓친 것처럼 멈춘다.
 */
export function usePanelSize() {
  const [size, setSize] = useState<PanelSize>(() => clamp(read()));
  const [resizing, setResizing] = useState(false);
  /** 드래그 시작 시점의 포인터 위치와 크기. 매 move 마다 이 기준으로 다시 계산한다. */
  const origin = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const onPointerDown = useCallback(
    (edge: ResizeEdge) => (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      origin.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
      };
      setResizing(true);

      const move = (moveEvent: PointerEvent<HTMLElement>) => {
        const next = clamp({
          width:
            edge === 'top'
              ? origin.current.width
              : origin.current.width - (moveEvent.clientX - origin.current.x),
          height:
            edge === 'left'
              ? origin.current.height
              : origin.current.height - (moveEvent.clientY - origin.current.y),
        });
        setSize(next);
      };

      const target = e.currentTarget;
      const onMove = move as unknown as EventListener;
      const onUp = () => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
        setResizing(false);
        // 놓는 순간에만 저장한다. 드래그 중 매 프레임 쓰면 localStorage 를 수백 번 친다.
        setSize((current) => {
          write(current);
          return current;
        });
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [size.width, size.height],
  );

  /** 기본 크기로 되돌린다. 손잡이 더블클릭에 붙인다 — 잘못 끌어 이상해졌을 때의 탈출구다. */
  const reset = useCallback(() => {
    const next = clamp(DEFAULT_SIZE);
    setSize(next);
    write(next);
  }, []);

  return { size, resizing, onPointerDown, reset };
}
