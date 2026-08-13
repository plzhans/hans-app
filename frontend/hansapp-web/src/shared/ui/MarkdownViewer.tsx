import { useEffect, useRef } from 'react';
import { Editor } from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor-viewer.css';

/**
 * 마크다운 본문을 그리는 뷰어(TOAST UI).
 *
 * **콘솔의 에디터와 같은 패키지다.** 쓰는 쪽과 보는 쪽이 다른 구현이면 표·코드블록 같은
 * 문법에서 결과가 갈린다 — 쓴 사람이 본 것과 독자가 보는 것이 달라진다.
 *
 * 본문은 서버에 **마크다운으로** 저장돼 있다. HTML 을 저장하지 않는 이유가 여기서 드러난다 —
 * 그리는 자리가 이 한 곳이라, 무엇을 허용할지도 이 한 곳에서 정할 수 있다.
 */
export function MarkdownViewer({ markdown }: { markdown: string }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!holder.current) return;
    const viewer = Editor.factory({
      el: holder.current,
      viewer: true,
      initialValue: markdown,
    });
    return () => viewer.destroy();
  }, [markdown]);

  return <div ref={holder} />;
}
