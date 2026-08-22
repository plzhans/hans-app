import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database, List } from 'lucide-react';

import { getHiraMirrorDashboard, getNmcMirrorDashboard, type MirrorTableCount } from '@/shared/api/mirrors';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';

type Source = 'hira' | 'nmc';

const SOURCE_LABEL: Record<Source, string> = {
  hira: 'HIRA(심사평가원)',
  nmc: 'NMC(국립중앙의료원)',
};

const COLUMNS = 'grid-cols-[minmax(0,1fr)_140px] gap-4 px-6';

/**
 * 연동 데이터(HIRA·NMC 미러) 대시보드. 테이블(또는 op 로 쪼개진 논리 테이블)마다 이름과
 * 건수만 훑는다 — 행 하나하나가 화면으로 이어지진 않는다.
 *
 * **표는 group 별로 나눠 카드를 따로 그린다** — "병원"(병원 하나하나에 딸린 미러)과
 * "코드"(hira_code/hira_npay_code/hira_region 같은, 병원과 무관한 참조표)는 성격이 달라
 * 한 표에 섞으면 "병원 수" 옆에 "코드 수" 가 나란히 앉아 서로 비교되는 것처럼 읽힌다.
 *
 * **병원 목록으로 가는 길은 표와 분리했다.** 표 안 특정 줄에만 "목록 보기" 를 박아두면
 * (기본 정보 한 줄만 이동 가능한 게) 부자연스러워서, 화면 위쪽 행동 줄에 버튼 하나로
 * 뺐다 — 병원 원본을 찾아보는 진입점이라는 뜻만 전달하면 된다.
 */
export default function IntegrationDashboard({ source }: { source: Source }) {
  const query = useQuery({
    queryKey: ['mirror-dashboard', source],
    queryFn: () => (source === 'hira' ? getHiraMirrorDashboard() : getNmcMirrorDashboard()),
  });

  const rows = query.data;
  const listPath = rows?.find((row) => row.listPath)?.listPath;

  const groups: { name: string; rows: MirrorTableCount[] }[] = [];
  for (const row of rows ?? []) {
    const group = groups.find((g) => g.name === row.group);
    if (group) group.rows.push(row);
    else groups.push({ name: row.group, rows: [row] });
  }

  return (
    <AdminLayout
      title={SOURCE_LABEL[source]}
      description="원본 미러 테이블별 건수입니다. healthcare_hospital(통합병원)과 무관합니다."
      breadcrumbs={[{ label: '연동 데이터' }, { label: SOURCE_LABEL[source] }]}
      actions={
        listPath && (
          // 기본은 오른쪽 정렬이지만, 본문(연동 현황 표)이 좁은 왼쪽 열이라 오른쪽 끝에
          // 두면 표와 멀어져 따로 논다 — mr-auto 로 표 위 왼쪽에 붙인다.
          <Link
            to={listPath}
            className="mr-auto inline-flex h-9 w-auto items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            <List className="h-4 w-4" />
            병원 목록 보기
          </Link>
        )
      }
    >
      <div className="max-w-2xl space-y-8">
        {query.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
            {errorMessage(query.error, '대시보드를 불러오지 못했습니다.')}
          </div>
        ) : query.isLoading || !rows ? (
          <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : (
          groups.map((group) => <DashboardGroup key={group.name} name={group.name} rows={group.rows} />)
        )}
      </div>
    </AdminLayout>
  );
}

function DashboardGroup({ name, rows }: { name: string; rows: MirrorTableCount[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{name} 연동 현황</h2>
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div
          className={`grid items-center border-b border-gray-100 py-3 text-xs font-semibold text-gray-400 ${COLUMNS}`}
        >
          <span>테이블</span>
          <span className="text-right">건수</span>
        </div>
        {rows.map((row) => (
          <DashboardRow key={row.key} row={row} />
        ))}
        <div className={`grid items-center py-3 text-sm text-gray-500 ${COLUMNS}`}>
          <span className="flex items-center gap-2 font-semibold text-gray-700">
            <Database className="h-4 w-4 text-gray-300" />
            합계
          </span>
          <span className="text-right font-mono">{total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function DashboardRow({ row }: { row: MirrorTableCount }) {
  return (
    <div className={`grid items-center border-b border-gray-100 py-3.5 last:border-0 ${COLUMNS}`}>
      <span className="truncate text-sm font-medium text-gray-900">{row.label}</span>
      <span className="text-right font-mono text-sm text-gray-600">{row.count.toLocaleString()}</span>
    </div>
  );
}
