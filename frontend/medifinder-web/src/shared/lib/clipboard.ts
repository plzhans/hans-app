/**
 * 텍스트를 클립보드에 복사한다. 어디서든 동작하도록 2단계로 시도한다.
 * 1) navigator.clipboard — HTTPS(보안 컨텍스트)에서만 사용 가능
 * 2) execCommand('copy') 폴백 — http/localhost·구형 브라우저 등 비보안 컨텍스트
 *
 * @returns 복사 성공 여부
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1) 표준 Clipboard API (보안 컨텍스트 전용)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 실패 시 아래 폴백으로 진행
    }
  }

  // 2) 폴백: 화면 밖 textarea 를 선택 후 execCommand('copy')
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
