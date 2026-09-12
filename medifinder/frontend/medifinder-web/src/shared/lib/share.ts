import { copyToClipboard } from './clipboard';

/**
 * 공유 결과. **취소와 실패를 가른다** — 사용자가 공유 시트를 닫은 것은 실패가 아니라서,
 * 그때 "복사했습니다" 나 오류를 띄우면 하지도 않은 일을 했다고 말하는 꼴이 된다.
 */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * 공유하기.
 *
 * 1) `navigator.share` — 모바일 브라우저·앱 웹뷰에 있다. 카톡·메모·에어드롭이 뜨는
 *    **OS 공유 시트**라, 우리가 흉내 낸 어떤 공유 메뉴보다 자연스럽다.
 * 2) 없으면(대부분의 데스크톱) 주소를 클립보드에 넣는다. 공유의 본질이 "이 주소를 남에게
 *    보내는 것" 이라, 링크만 손에 쥐여줘도 목적은 채워진다.
 *
 * **HTTPS 에서만 동작한다.** navigator.share 도 clipboard 도 보안 컨텍스트를 요구해서,
 * 로컬 http 개발 서버에서는 2)의 execCommand 폴백으로 떨어진다(clipboard.ts).
 */
export async function share(payload: {
  title: string;
  text?: string;
  url: string;
}): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (error) {
      // 시트를 닫은 것. 이때만 AbortError 가 온다 — 진짜 실패는 아래 복사로 넘긴다.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  return (await copyToClipboard(payload.url)) ? 'copied' : 'failed';
}
