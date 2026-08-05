import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AiSearchChat } from '../components/AiSearchChat';

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
 * 채팅창의 주인. **레이아웃이 한 번만 감싼다.**
 *
 * 창 자체를 여기서 그린다 — 여는 버튼들은 `open()` 만 부르면 되고, 어디에 있든 상관없다.
 *
 * **닫히면 컴포넌트째 사라진다**(조건부 렌더). 대화 기록이 같이 비워지는데, 다시 열었을 때
 * 지난 대화가 남아 있으면 "이어서 묻는 것" 처럼 보이지만 서버는 대화를 기억하지 않는다 —
 * 보이는 것과 실제가 어긋나느니 새로 시작하는 게 낫다.
 */
export function AiSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // 값이 매 렌더 새로 만들어지면 컨텍스트를 읽는 쪽이 전부 다시 그려진다.
  const panel = useMemo<AiSearchPanel>(
    () => ({ open: () => setOpen(true), isOpen: open }),
    [open],
  );
  const close = useCallback(() => setOpen(false), []);

  return (
    <PanelContext.Provider value={panel}>
      {children}
      {open && <AiSearchChat onClose={close} />}
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
