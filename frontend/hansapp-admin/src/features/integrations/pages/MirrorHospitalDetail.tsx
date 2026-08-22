import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import {
  getHiraMirrorHospital,
  getNmcMirrorHospital,
  type MirrorHospitalDetail,
  type MirrorSection,
} from '@/shared/api/mirrors';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { CacheJsonView } from '@/shared/components/CachePanel';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';

type Source = 'hira' | 'nmc';
type ViewMode = 'fields' | 'json';

const SOURCE_LABEL: Record<Source, string> = {
  hira: 'HIRA(심사평가원)',
  nmc: 'NMC(국립중앙의료원)',
};

/** 각 원본의 기본키 이름. "id" 로 뭉뚱그리면 헷갈린다 — HIRA·NMC 가 쓰는 실제 이름 그대로. */
const ID_LABEL: Record<Source, string> = {
  hira: '요양기호',
  nmc: 'hpid',
};

/**
 * 연동 데이터(HIRA·NMC 미러) 병원 상세.
 *
 * **레이아웃은 healthcare_hospital 상세(HospitalDetail)와 같은 부품을 쓴다** — 헤더 카드
 * (이름·배지·id) + 흰 카드로 쌓은 섹션들, Section/Field 짜임새. 다만 좌우 2단으로는 안
 * 가른다 — 저기는 "자주 보는 값"과 "가끔 보는 값"이 갈리지만, 여기는 API 오퍼레이션이
 * 11개나 되고 다 같은 무게라 가를 기준이 없다.
 *
 * **핵심은 섹션마다 "조회 안 함" 과 "조회했지만 없음" 을 가리는 것이다** — 서버가 이미
 * MirrorSection.queried/empty 로 계산해 준다(HiraMirrorDetailService 주석 참고).
 *
 * **필드/JSON 전체를 섹션마다 탭으로 둔다.** 기본은 필드(원본 key 를 그대로 보여주는 1단
 * 펼침)고, 옆 탭을 누르면 그 섹션의 원본을 한 번에 JSON 으로 볼 수 있다.
 */
export default function MirrorHospitalDetail({ source }: { source: Source }) {
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['mirror-hospital', source, id],
    queryFn: () => (source === 'hira' ? getHiraMirrorHospital(id!) : getNmcMirrorHospital(id!)),
    enabled: !!id,
  });

  const hospital = query.data;
  const listPath = `/${source}/hospitals`;

  return (
    <AdminLayout
      title={hospital?.name ?? '병원 미러 상세'}
      breadcrumbs={[
        { label: '연동 데이터' },
        { label: SOURCE_LABEL[source], to: `/${source}/dashboard` },
        { label: '병원', to: listPath },
        { label: id ?? '상세' },
      ]}
    >
      <BackLink to={listPath} />

      <div className="max-w-6xl">
        {query.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
            {errorMessage(query.error, '데이터를 불러오지 못했습니다.')}
          </div>
        ) : query.isLoading || !hospital ? (
          <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : (
          <MirrorDetailBody source={source} hospital={hospital} id={id!} />
        )}
      </div>
    </AdminLayout>
  );
}

function MirrorDetailBody({
  source,
  hospital,
  id,
}: {
  source: Source;
  hospital: MirrorHospitalDetail;
  id: string;
}) {
  const queriedCount = hospital.sections.filter((s) => s.queried && !s.empty).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{SOURCE_LABEL[source]}</Badge>
          <Badge tone="gray">
            {queriedCount}/{hospital.sections.length}개 구간에 데이터 있음
          </Badge>
        </div>
        <h2 className="mt-2 text-lg font-bold text-gray-900">
          {hospital.name ?? <span className="text-gray-400">이름 없음</span>}
        </h2>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-100 pt-3 text-sm text-gray-400">
          <span>
            {ID_LABEL[source]} <span className="font-mono text-gray-600">{id}</span>
          </span>
          <span>
            동기화 <span className="text-gray-600">{formatDateTime(hospital.syncedAt)}</span>
          </span>
          {hospital.linkedHealthcareHospitalId != null && (
            <span>
              통합병원{' '}
              <Link
                to={`/healthcare/hospitals/${hospital.linkedHealthcareHospitalId}`}
                className="text-primary underline decoration-gray-300 underline-offset-2"
              >
                #{hospital.linkedHealthcareHospitalId} 바로가기
              </Link>
            </span>
          )}
        </dl>
      </section>

      {hospital.sections.map((section) => (
        <MirrorSectionCard key={section.key} section={section} />
      ))}
    </div>
  );
}

/** 섹션 카드 하나. 필드/JSON 전체를 카드 안 탭으로 갈라, 섹션마다 원하는 쪽만 볼 수 있게 한다. */
function MirrorSectionCard({ section }: { section: MirrorSection }) {
  const [view, setView] = useState<ViewMode>('fields');
  const hasData = section.queried && !section.empty;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{section.label}</h2>
        {!section.queried ? (
          <Badge tone="gray">조회 안 함</Badge>
        ) : section.empty ? (
          <Badge tone="amber">조회함 · 데이터 없음</Badge>
        ) : (
          <Badge tone="green">
            {section.items.length > 1 ? `${section.items.length}건` : '데이터 있음'}
          </Badge>
        )}
        {section.syncedAt && (
          <span className="text-xs text-gray-400">{formatDateTime(section.syncedAt)}</span>
        )}

        {hasData && (
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView('fields')}
              className={cn(
                'rounded-md px-2.5 py-1 font-semibold transition',
                view === 'fields' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
              )}
            >
              필드
            </button>
            <button
              type="button"
              onClick={() => setView('json')}
              className={cn(
                'rounded-md px-2.5 py-1 font-semibold transition',
                view === 'json' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
              )}
            >
              JSON 전체
            </button>
          </div>
        )}
      </div>

      {!section.queried ? (
        <p className="text-sm text-gray-400">
          이 오퍼레이션(API)을 아직 한 번도 부르지 않았습니다 — 행 자체가 없습니다.
        </p>
      ) : section.empty ? (
        <p className="text-sm text-gray-400">
          조회는 했지만 돌아온 내용이 비어 있습니다(원본이 원래 없는 값입니다).
        </p>
      ) : view === 'json' ? (
        <div className="max-h-[32rem] overflow-auto">
          <CacheJsonView
            value={
              section.items.length === 1 ? section.items[0].raw : section.items.map((i) => i.raw)
            }
          />
        </div>
      ) : section.items.length > 1 ? (
        <MirrorItemsTable items={section.items} />
      ) : section.key === 'detail:info' ? (
        <InfoHoursSection item={section.items[0]} />
      ) : (
        <MirrorItemFields item={section.items[0]} />
      )}
    </section>
  );
}

/** 항목 하나(진료과목 한 줄 등)를 라벨:값 목록으로. 단일 항목 섹션(기본정보 등)이 쓴다. */
function MirrorItemFields({ item }: { item: { fields: { key: string; value: string }[] } }) {
  if (item.fields.length === 0) {
    return <span className="text-sm text-gray-400">필드가 없습니다.</span>;
  }
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
      {item.fields.map((f) => (
        <div key={f.key} className="flex gap-3">
          <dt className="w-36 shrink-0 truncate text-gray-400" title={f.key}>
            {f.key}
          </dt>
          <dd className="min-w-0 flex-1 break-words text-gray-800">{f.value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * HIRA "상세 정보"(op=info) 의 요일별 진료시간 필드. **필드명은 원본 API(MadmDtlInfoService2.8)
 * 그대로다** — trmt{요일}Start/End 14개 + 휴진 안내 2개. 관리자가 한눈에 보기 좋게 표로
 * 묶고, 나머지 필드(접수·점심시간·응급실·주차 등)는 그 아래 평범한 key/value 로 낸다.
 */
const DAY_HOURS_FIELDS: { day: string; startKey: string; endKey: string }[] = [
  { day: '월', startKey: 'trmtMonStart', endKey: 'trmtMonEnd' },
  { day: '화', startKey: 'trmtTueStart', endKey: 'trmtTueEnd' },
  { day: '수', startKey: 'trmtWedStart', endKey: 'trmtWedEnd' },
  { day: '목', startKey: 'trmtThuStart', endKey: 'trmtThuEnd' },
  { day: '금', startKey: 'trmtFriStart', endKey: 'trmtFriEnd' },
  { day: '토', startKey: 'trmtSatStart', endKey: 'trmtSatEnd' },
  { day: '일', startKey: 'trmtSunStart', endKey: 'trmtSunEnd' },
];

/** "0830" → "08:30". 4자리 숫자가 아니면(빈 값 등) 원문 그대로 둔다. */
function formatHiraTime(value: string): string {
  return /^\d{4}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2)}` : value;
}

function InfoHoursSection({ item }: { item: { fields: { key: string; value: string }[] } }) {
  const byKey = new Map(item.fields.map((f) => [f.key, f.value]));
  const hasHours = DAY_HOURS_FIELDS.some((d) => byKey.get(d.startKey) || byKey.get(d.endKey));
  const noTrmtSun = byKey.get('noTrmtSun');
  const noTrmtHoli = byKey.get('noTrmtHoli');

  const consumed = new Set(
    DAY_HOURS_FIELDS.flatMap((d) => [d.startKey, d.endKey]).concat(['noTrmtSun', 'noTrmtHoli']),
  );
  const restFields = item.fields.filter((f) => !consumed.has(f.key));

  return (
    <div className="space-y-4">
      {hasHours && (
        <div>
          <p className="mb-1.5 text-xs font-bold text-gray-400">요일별 진료시간</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-semibold text-gray-500">
                    요일
                  </th>
                  <th className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-semibold text-gray-500">
                    시작
                  </th>
                  <th className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-semibold text-gray-500">
                    종료
                  </th>
                </tr>
              </thead>
              <tbody>
                {DAY_HOURS_FIELDS.map(({ day, startKey, endKey }) => {
                  const start = byKey.get(startKey);
                  const end = byKey.get(endKey);
                  return (
                    <tr key={day} className="odd:bg-white even:bg-gray-50/50">
                      <td className="border-b border-gray-50 px-3 py-2 font-semibold text-gray-700">
                        {day}
                      </td>
                      <td className="border-b border-gray-50 px-3 py-2 text-gray-800">
                        {start ? formatHiraTime(start) : '—'}
                      </td>
                      <td className="border-b border-gray-50 px-3 py-2 text-gray-800">
                        {end ? formatHiraTime(end) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(noTrmtSun || noTrmtHoli) && (
            <dl className="mt-2 space-y-1 text-sm">
              {noTrmtSun && (
                <div>
                  <dt className="inline text-gray-400">일요일 휴진 안내 </dt>
                  <dd className="inline text-gray-800">{noTrmtSun}</dd>
                </div>
              )}
              {noTrmtHoli && (
                <div>
                  <dt className="inline text-gray-400">공휴일 휴진 안내 </dt>
                  <dd className="inline text-gray-800">{noTrmtHoli}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}

      {restFields.length > 0 && <MirrorItemFields item={{ fields: restFields }} />}
    </div>
  );
}

/**
 * 항목이 여럿(진료과목·장비·비급여 등)인 섹션은 표로 낸다. **열은 모든 항목의 필드 key
 * 를 모은 합집합이다** — 항목마다 필드가 살짝 다를 수 있어(예: 있는 값만 온 JSON) 첫
 * 항목 기준으로만 열을 잡으면 다른 항목의 값이 통째로 빠진다.
 */
function MirrorItemsTable({
  items,
}: {
  items: { fields: { key: string; value: string }[] }[];
}) {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const f of item.fields) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        columns.push(f.key);
      }
    }
  }

  if (columns.length === 0) {
    return <span className="text-sm text-gray-400">필드가 없습니다.</span>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-semibold text-gray-500"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const byKey = new Map(item.fields.map((f) => [f.key, f.value]));
            return (
              <tr key={index} className="odd:bg-white even:bg-gray-50/50">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-xs truncate border-b border-gray-50 px-3 py-2 text-gray-800"
                    title={byKey.get(col) ?? ''}
                  >
                    {byKey.get(col) || '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').slice(0, 19);
}
