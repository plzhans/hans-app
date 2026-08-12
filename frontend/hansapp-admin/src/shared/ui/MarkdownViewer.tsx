import { useEffect, useRef } from 'react';
import { Editor } from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor-viewer.css';

/**
 * 마크다운 본문을 그리는 뷰어(TOAST UI).
 *
 * **글을 쓰는 에디터와 같은 패키지다.** 쓰는 쪽과 보는 쪽이 다른 구현이면 표·코드블록 같은
 * 문법에서 결과가 갈려, 쓴 사람이 본 것과 공개된 화면이 달라진다. 포털의 뷰어도 같은 것을 쓴다.
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
