import { useEffect, useRef } from 'react';
import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';

/**
 * 본문 에디터(TOAST UI Editor).
 *
 * **바닐라 패키지를 직접 감싼다.** 공식 React 래퍼(@toast-ui/react-editor)는 peer 가
 * react@^17 이라 이 콘솔(React 19)에 안 맞는다 — 래퍼가 하는 일이 이 파일 정도라 직접 든다.
 *
 * **마크다운으로 주고받는다.** 저장되는 것도 마크다운이다(BoardPost.content). HTML 을
 * 그대로 저장하면 저장된 문자열 자체가 실행 가능한 것이 되어, 어디서 지워야 하는지가 흐려진다.
 *
 * **값을 prop 으로 다시 밀어 넣지 않는다.** 에디터가 자기 상태를 들고 있어서, 타이핑할
 * 때마다 setMarkdown 을 부르면 커서가 맨 앞으로 튄다 — 처음 한 번만 넣고 그 뒤로는
 * onChange 로 받아만 온다(비제어 컴포넌트).
 */
export function MarkdownEditor({
  initialValue,
  onChange,
  height = '420px',
}: {
  initialValue: string;
  onChange: (markdown: string) => void;
  height?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  /** 최신 onChange 를 참조로 들고 있는다. effect 를 다시 돌리면 에디터가 새로 만들어진다. */
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (!holder.current) return;
    const editor = new Editor({
      el: holder.current,
      height,
      // 처음에 마크다운 탭으로 연다. 위지윅으로도 오갈 수 있다.
      initialEditType: 'markdown',
      previewStyle: 'vertical',
      usageStatistics: false,
      initialValue,
      // 이미지는 아직 올릴 곳이 없다(파일 저장소 미정) — 툴바에서 뺀다.
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task'],
        ['table', 'link'],
        ['code', 'codeblock'],
      ],
    });
    editor.on('change', () => handler.current(editor.getMarkdown()));
    return () => editor.destroy();
    // initialValue·height 는 처음 한 번만 쓴다(위 주석 참고).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={holder} />;
}
