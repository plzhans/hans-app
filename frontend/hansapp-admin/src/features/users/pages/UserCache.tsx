import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getUser, getUserCacheState, purgeUserCache } from '@/shared/api/users';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { CachePanel } from '@/shared/components/CachePanel';
import { UserTabs } from '../components/UserTabs';

/**
 * 이 회원의 `/users/me` 응답 캐시.
 *
 * **정비용 화면이다.** 회원을 이해하는 데 쓰는 값이 아니라 "고쳤는데 왜 그대로냐" 가
 * 캐시 때문인지 아닌지를 가릴 때 연다. 공개 API 라 외부 앱이 요청마다 부를 수 있어서
 * 응답을 통째로 캐싱하는데, 그러면 이런 확인 통로가 없으면 원인을 짚을 방법이 없다.
 *
 * 화면은 글 캐시와 같은 패널을 쓴다(CachePanel).
 */
export default function UserCache() {
  const { id } = useParams();
  const userId = Number(id);

  // 개요 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: Number.isFinite(userId),
  });

  return (
    <AdminLayout
      title={userQuery.data?.email ?? '회원 상세'}
      breadcrumbs={[
        { label: '회원', to: '/users' },
        { label: userQuery.data ? `#${userId}` : '상세' },
      ]}
    >
      <BackLink to="/users" />

      <UserTabs userId={userId} current="cache" />

      <CachePanel
        queryKey={['user-cache', userId]}
        fetchState={() => getUserCacheState(userId)}
        purge={() => purgeUserCache(userId)}
        confirmTitle="캐시 초기화"
      >
        <p>
          이 회원의 <b>내 정보 캐시</b>를 지웁니다. 지운 직후의{' '}
          <span className="font-mono text-xs">/users/me</span> 조회는 캐시를 타지
          않고 DB 로 내려갑니다.
        </p>
        <p className="mt-2">
          정보를 고칠 때 서버가 이미 지우므로 평소에는 누를 일이 없습니다. 고친
          내용이 회원 화면에 안 보일 때만 쓰세요.
        </p>
        <p className="mt-2">
          여기서 지워지는 것은 공유 캐시(Redis)입니다. API 서버가 자기 메모리에도
          최대 1분간 들고 있는데, 그쪽은 함께 비우도록 알림만 보냅니다.
        </p>
      </CachePanel>
    </AdminLayout>
  );
}
