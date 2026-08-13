import { getPostCacheState, purgePostCache } from '@/shared/api/posts';
import { CachePanel } from '@/shared/components/CachePanel';

/**
 * 이 글의 공개 캐시.
 *
 * 화면은 공용 패널이 그린다 — 회원 캐시 탭도 같은 것을 쓴다. 여기 남는 것은 **무엇을
 * 읽고 지우는지**와 확인 창에 적을 말뿐이다.
 */
export function PostCachePanel({ postId }: { postId: number }) {
  return (
    <CachePanel
      queryKey={['post-cache', postId]}
      fetchState={() => getPostCacheState(postId)}
      purge={() => purgePostCache(postId)}
      confirmTitle="캐시 초기화"
    >
      <p>
        이 글의 <b>공개 화면 캐시</b>를 지웁니다. 지운 직후의 조회는 캐시를 타지
        않고 DB 로 내려갑니다.
      </p>
      <p className="mt-2">
        글을 저장할 때 서버가 이미 지우므로 평소에는 누를 일이 없습니다. 게시판
        설정만 바꿨거나, 고친 내용이 공개 화면에 안 보일 때만 쓰세요.
      </p>
    </CachePanel>
  );
}
