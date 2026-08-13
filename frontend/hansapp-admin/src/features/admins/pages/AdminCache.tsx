import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getAdmin, getAdminCache, purgeAdminCache } from '@/shared/api/admins';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { CachePanel } from '@/shared/components/CachePanel';
import { AdminTabs } from '../components/AdminTabs';

/**
 * 이 관리자의 `/api/admins/me` 응답 캐시.
 *
 * **정비용 화면이다.** 계정을 이해하는 데 쓰는 값이 아니라 "고쳤는데 왜 그대로냐" 가
 * 캐시 때문인지 아닌지를 가릴 때 연다.
 *
 * **세션 캐시는 여기 없다.** 그건 기기 하나에 딸린 것이라 로그인 기기 탭에서 다룬다 —
 * 회원 상세와 같은 배치다(그쪽도 기기 탭에서 세션 캐시를, 캐시 탭에서 `/users/me` 캐시를 본다).
 *
 * 화면은 회원·글 캐시와 같은 패널을 쓴다(CachePanel).
 */
export default function AdminCache() {
  const { id } = useParams();
  const adminId = Number(id);

  // 개요 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const adminQuery = useQuery({
    queryKey: ['admin', adminId],
    queryFn: () => getAdmin(adminId),
    enabled: Number.isFinite(adminId),
  });

  return (
    <AdminLayout
      title={adminQuery.data?.email ?? '관리자 상세'}
      breadcrumbs={[
        { label: '관리자', to: '/admins' },
        { label: adminQuery.data ? `#${adminId}` : '상세' },
      ]}
    >
      <BackLink to="/admins" />

      <AdminTabs adminId={adminId} current="cache" />

      <CachePanel
        queryKey={['admin-cache', adminId]}
        fetchState={() => getAdminCache(adminId)}
        purge={() => purgeAdminCache(adminId)}
        confirmTitle="캐시 초기화"
      >
        <p>
          이 관리자의 <b>내 정보 캐시</b>를 지웁니다. 지운 직후의{' '}
          <span className="font-mono text-xs">/api/admins/me</span> 조회는 캐시를
          타지 않고 DB 로 내려갑니다.
        </p>
        <p className="mt-2">
          이름·등급·언어·시간대를 고치거나 로그인·비밀번호 변경이 있을 때 서버가 이미
          지우므로 평소에는 누를 일이 없습니다. 고친 내용이 그 관리자 화면에 안
          보일 때만 쓰세요.
        </p>
        <p className="mt-2">
          로그인 기기의 <b>인증 캐시는 여기서 지워지지 않습니다</b> — 그건 기기
          탭에서 다룹니다.
        </p>
      </CachePanel>
    </AdminLayout>
  );
}
