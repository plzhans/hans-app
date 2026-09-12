import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AiSearchChat } from '../components/AiSearchChat';
import { loadTurns, saveTurns, type Turn } from './chatStorage';

interface AiSearchPanel {
  open: () => void;
  /** 열려 있나. **FAB 이 자기를 감추는 데 쓴다** — 둘 다 오른쪽 아래라 겹친다. */
  isOpen: boolean;
}

/**
 * 채팅창을 여는 손잡이. **여는 곳이 둘 이상이라 컨텍스트로 뺐다** —
 * 오른쪽 아래 FAB 과 홈 검색창 아래 버튼이 같은 창 하나를 열어야 한다.
 *
 * 각자 상태를 들면 두 개가 동시에 떠서 대화가 갈린다.
 */
const PanelContext = createContext<AiSearchPanel | undefined>(undefined);

/**
 * 채팅창의 주인. **라우터 최상단이 한 번만 감싼다.**
 *
 * 창과 대화를 여기서 들고 있다 — 레이아웃 안에 두면 화면을 옮길 때마다 언마운트돼
 * 묻던 것이 사라진다. 병원 상세를 열어 보고 돌아오는 건 이 기능에서 가장 흔한 동작이다.
 *
 * **대화는 sessionStorage 로도 남는다**(chatStorage 주석 참고) — 새로고침을 견디되
 * 탭을 닫으면 사라진다. 건강 질문이 공용 PC 에 영구히 남으면 안 되기 때문이다.
 */
export function AiSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // 첫 렌더에 한 번만 읽는다. 함수형 초기값이라 이후 렌더에서는 저장소를 안 친다.
  const [turns, setTurns] = useState<Turn[]>(loadTurns);

  // 대화가 바뀔 때마다 담는다. 저장 실패는 chatStorage 가 삼킨다.
  useEffect(() => {
    saveTurns(turns);
  }, [turns]);

  // 값이 매 렌더 새로 만들어지면 컨텍스트를 읽는 쪽이 전부 다시 그려진다.
  const panel = useMemo<AiSearchPanel>(
    () => ({ open: () => setOpen(true), isOpen: open }),
    [open],
  );
  const close = useCallback(() => setOpen(false), []);

  return (
    <PanelContext.Provider value={panel}>
      {children}
      {/*
        **닫아도 대화는 안 지운다.** 예전엔 닫으면 컴포넌트째 사라지며 기록도 같이
        비워졌는데, 실수로 닫았을 때 되돌릴 길이 없었다. 지우는 것은 사용자가
        "대화 지우기" 로 명시적으로 정한다.
      */}
      {open && (
        <AiSearchChat
          turns={turns}
          setTurns={setTurns}
          onClear={() => setTurns([])}
          onClose={close}
        />
      )}
    </PanelContext.Provider>
  );
}

/**
 * 채팅창을 여는 함수. **provider 밖에서 부르면 아무 일도 안 한다** —
 * 상세 화면처럼 AI 문의를 안 다는 레이아웃에도 같은 컴포넌트가 놓일 수 있어서,
 * 없다고 터뜨리는 대신 조용히 넘긴다(버튼을 감추는 건 그 화면이 정할 일이다).
 */
export function useAiSearchPanel(): AiSearchPanel {
  return useContext(PanelContext) ?? NOOP;
}

const NOOP: AiSearchPanel = { open: () => undefined, isOpen: false };
