/**
 * 클립보드에 넣는다. 되면 true. 어느 경로로 됐는지는 부르는 쪽이 알 필요 없다.
 *
 * **복사는 실패할 수 있다.** `navigator.clipboard` 는 보안 컨텍스트(https·localhost)에서만
 * 있고, 브라우저에 따라 권한이나 사용자 제스처를 더 따진다. 그래서 되면 그걸 쓰고, 안 되면
 * 옛 방식으로 한 번 더 시도한다 — 부르는 쪽은 **실패를 화면에 말해야 한다**. 조용히 삼키면
 * 복사한 줄 알고 넘어간다.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  /*
    **먼저 보안 컨텍스트인지 본다.** http 나 신뢰되지 않는 인증서에서는 `navigator.clipboard`
    가 아예 없거나 부르는 순간 던진다. 있는지만 보고 부르면 예외로 흐름이 갈리므로 둘 다 본다.
  */
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 권한이 없거나 브라우저가 제스처를 못 알아봤다. 아래 옛 방식으로 한 번 더.
    }
  }

  /*
    **execCommand 는 폐기 예정이지만 여기서는 여전히 유효한 수단이다.** 보안 컨텍스트를
    따지지 않아, clipboard API 가 막히는 바로 그 환경에서 유일하게 남는 길이다.
  */
  try {
    const holder = document.createElement('textarea');
    holder.value = text;
    holder.setAttribute('readonly', '');
    // 화면 밖으로 밀면 iOS 가 스크롤을 튀게 한다. 자리에 두고 안 보이게만 만든다.
    holder.style.position = 'fixed';
    holder.style.top = '0';
    holder.style.opacity = '0';
    document.body.appendChild(holder);
    holder.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(holder);
    return ok;
  } catch {
    return false;
  }
}
