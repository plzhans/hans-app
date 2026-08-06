import { useEffect } from 'react';
import { LegalDocumentView, type LegalDoc } from '@hansapp/legal';

/**
 * 약관 전문을 띄우는 레이어.
 *
 * **새 창으로 보내지 않는다.** 가입 폼을 다 채운 사람이 약관을 누르는 자리라, 창을 옮기면
 * 돌아왔을 때 입력이 남아 있는지 사용자가 확신하지 못한다(실제로 남아 있어도 그렇다).
 * 게다가 포털은 별도 도메인이라 로컬에서는 주소가 아예 달라 링크가 죽는다 — 문서를
 * `@hansapp/legal` 로 옮긴 것이 이 화면을 위해서다.
 *
 * 조문은 포털의 문서 페이지와 **같은 파일**을 읽는다. 개정하면 양쪽이 동시에 바뀐다.
 */
export function LegalModal({
  doc,
  onClose,
}: {
  /** 열려 있지 않으면 null. */
  doc: LegalDoc | null;
  onClose: () => void;
}) {
  // 레이어가 떠 있는 동안 뒤 배경이 스크롤되지 않게 잠근다. 긴 문서라 스크롤이 자주 쓰인다.
  useEffect(() => {
    if (!doc) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [doc]);

  // Esc 로 닫는다. 모바일에는 없지만 데스크톱에서 가장 먼저 눌러 보는 키다.
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, onClose]);

  if (!doc) return null;

  return (
    // 바깥을 눌러도 닫힌다. 문서 안을 누른 것까지 닫히지 않게 본문에서 전파를 멈춘다.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        onClick={(e) => e.stopPropagation()}
        /*
          좁은 화면에서는 바닥에서 올라오는 시트, 넓은 화면에서는 가운데 상자.
          가입은 대부분 휴대폰에서 하고, 시트가 그 손 위치에 맞는다.
        */
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[80vh] sm:rounded-2xl"
      >
        {/* 제목 줄은 고정하고 본문만 스크롤한다 — 긴 문서에서 닫기 버튼을 찾아 올라가지 않게. */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">{doc.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-900"
            aria-label="닫기"
          >
            닫기
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain">
          <LegalDocumentView doc={doc} />
        </div>
      </div>
    </div>
  );
}
