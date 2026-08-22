import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getHospital, getHospitalCacheState, purgeHospitalCache } from '@/shared/api/hospitals';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { CachePanel } from '@/shared/components/CachePanel';
import { HospitalTabs } from '../components/HospitalTabs';

/**
 * 이 병원의 공개 API 상세 캐시(base).
 *
 * **정비용 화면이다.** 병원을 이해하는 데 쓰는 값이 아니라 "관리자에서 고쳤는데
 * 공개 화면은 왜 그대로냐" 가 캐시 때문인지 아닌지를 가릴 때 연다. 회원 캐시(UserCache)와
 * 같은 패널(CachePanel)을 쓴다 — 묻는 것이 같아서다.
 */
export default function HospitalCache() {
  const { id } = useParams();
  const hospitalId = Number(id);

  // 개요 탭에서 넘어왔으면 캐시에 이미 있다. 제목(병원명)만 쓰려고 다시 받지 않는다.
  const hospitalQuery = useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn: () => getHospital(hospitalId),
    enabled: Number.isFinite(hospitalId),
  });

  return (
    <AdminLayout
      title={hospitalQuery.data?.name ?? '병원 상세'}
      breadcrumbs={[
        { label: '헬스케어' },
        { label: '병원', to: '/healthcare/hospitals' },
        { label: hospitalQuery.data ? `#${hospitalId}` : '상세' },
      ]}
    >
      <BackLink to="/healthcare/hospitals" />

      <HospitalTabs hospitalId={hospitalId} current="cache" />

      <CachePanel
        queryKey={['hospital-cache', hospitalId]}
        fetchState={() => getHospitalCacheState(hospitalId)}
        purge={() => purgeHospitalCache(hospitalId)}
        confirmTitle="캐시 초기화"
      >
        <p>
          이 병원의 <b>공개 상세 캐시</b>를 지웁니다. 지운 직후의 공개 API 조회는 캐시를 타지
          않고 DB 로 내려갑니다.
        </p>
        <p className="mt-2">
          base(구조·평가) 뿐 아니라 <b>지원 언어 전체의 번역 캐시(i18n)</b>도 함께 지웁니다 —
          번역까지 확실히 갱신하려는 것입니다.
        </p>
        <p className="mt-2">
          데이터를 build 배치가 다시 만들면 어차피 지워지므로 평소에는 누를 일이 없습니다.
          손으로 고친 값이 공개 화면에 안 보일 때만 쓰세요.
        </p>
        <p className="mt-2">
          여기서 지워지는 것은 공유 캐시(Redis)입니다. Redis 가 없는 환경에서는 공개 API
          프로세스의 메모리에 담기는데, 그쪽은 여기서 보이지도 지워지지도 않습니다.
        </p>
      </CachePanel>
    </AdminLayout>
  );
}
