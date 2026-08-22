import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';

import {
  getHospital,
  type HospitalAssessmentGroup,
  type HospitalBeds,
  type HospitalCapability,
  type HospitalEquipment,
  type HospitalHours,
  type HospitalStaff,
  type HospitalSubject,
} from '@/shared/api/hospitals';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { CacheJsonView } from '@/shared/components/CachePanel';
import { writeClipboard } from '@/shared/lib/clipboard';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { HospitalTabs } from '../components/HospitalTabs';

const DAY_LABEL: Record<number, string> = {
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
  7: '일',
  8: '공휴일',
};

/** HHMM → "HH:MM". 형식이 아니면(빈 값 등) 원문 그대로 돌려준다. */
function formatTime(value?: string | null): string {
  if (!value || value.length !== 4) return value ?? '—';
  return `${value.slice(0, 2)}:${value.slice(2)}`;
}

function byTp(capabilities: HospitalCapability[], tp: string): HospitalCapability[] {
  return capabilities.filter((c) => c.tp === tp);
}

/**
 * healthcare_hospital 관리자 상세.
 *
 * **레이아웃을 medifinder-web(공개 상세)에 맞춘다.** 왼쪽 기둥에 "가장 자주 확인하는 값"
 * (연락처·소개·진료시간)을 두고, 오른쪽에 진료과목→규모→평가→위치처럼 한 번 훑고 마는
 * 것들을 두는 2단 구성, 특수진료(capability special)를 진료과목 카드에, 전문병원
 * 지정(specialty)·중증처치(severe)를 규모 카드에 접어 넣는 것까지 그대로 따른다.
 *
 * 다만 이 화면은 사용자용이 아니라 **감사용 표**다 — 탭·스크롤스파이·지도·교통편
 * 그룹핑 같은 건 넣지 않았고, 등급 정규화 같은 가공 없이 서버가 원본을 그대로 준다.
 */
export default function HospitalDetail() {
  const { id } = useParams();
  const hospitalId = Number(id);

  const query = useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn: () => getHospital(hospitalId),
    enabled: Number.isFinite(hospitalId),
  });

  const hospital = query.data;

  return (
    <AdminLayout
      title={hospital?.name ?? '병원 상세'}
      breadcrumbs={[
        { label: '헬스케어' },
        { label: '병원', to: '/healthcare/hospitals' },
        { label: hospital ? `#${hospital.id}` : '상세' },
      ]}
    >
      <BackLink to="/healthcare/hospitals" />

      <HospitalTabs hospitalId={hospitalId} current="overview" />

      {/*
        **폭만 제한하고 가운데로 모으지 않는다** — 왼쪽(사이드바 옆)에 붙여 다른 관리
        화면과 같은 자리를 지킨다. medifinder 의 max-w-7xl 두 칸 레이아웃을 참고했지만,
        그쪽은 화면 전체가 그 페이지라 가운데 정렬이 맞고 여기는 아니다.
      */}
      <div className="max-w-7xl">
      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '병원 정보를 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading || !hospital ? (
        <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : (
        <div className="space-y-6">
          {/* 헤더. medifinder 히어로의 이름·배지·지역 자리를 흰 카드로 옮긴 것이다. */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={hospital.status === 'active' ? 'green' : 'gray'}>{hospital.status}</Badge>
              {hospital.tier && <Badge tone="blue">{hospital.tier}</Badge>}
              {hospital.emergencyYn && <Badge tone="red">응급실</Badge>}
              {hospital.babyYn && <Badge tone="amber">달빛어린이병원</Badge>}
            </div>
            <h2 className="mt-2 text-lg font-bold text-gray-900">
              {hospital.name}
              {hospital.legalName !== hospital.name && (
                <span className="ml-2 text-sm font-normal text-gray-400">{hospital.legalName}</span>
              )}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {hospital.className ?? hospital.classCd ?? '종별 미상'}
              {hospital.regionName && <span className="mx-1.5 text-gray-300">·</span>}
              {hospital.regionName}
              {hospital.emdongNm && <span className="ml-1">{hospital.emdongNm}</span>}
              {hospital.corpName && <span className="ml-1.5 text-gray-400">· {hospital.corpName}</span>}
            </p>

            {/* 관리자만 보는 식별자·시스템값. 공개 화면엔 없는 줄이라 옅게, 맨 아래에 둔다. */}
            <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-gray-100 pt-3 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                id <span className="font-mono text-gray-600">{hospital.id}</span>
                <CopyIconButton value={String(hospital.id)} />
              </span>
              <span>
                출처 <span className="text-gray-600">{hospital.source}</span>
              </span>
              <span>
                개설일 <span className="text-gray-600">{hospital.estbDd ?? '—'}</span>
              </span>
            </dl>
          </section>

          {/* 왼쪽: 자주 확인하는 값(연락처·소개·진료시간). 오른쪽: 나머지(진료과목~번역). */}
          <div className="lg:grid lg:grid-cols-[26rem_1fr] lg:items-start lg:gap-6">
            <div className="min-w-0 space-y-6">
              <IntroSection {...hospital} />
            </div>

            <div className="mt-6 min-w-0 space-y-6 lg:mt-0">
              {hospital.subjects.length > 0 && (
                <SubjectsSection
                  subjects={hospital.subjects}
                  special={byTp(hospital.capabilities, 'special')}
                />
              )}

              {(hospital.staff ||
                hospital.beds ||
                hospital.equipments.length > 0 ||
                byTp(hospital.capabilities, 'specialty').length > 0 ||
                byTp(hospital.capabilities, 'severe').length > 0) && (
                <ScaleSection
                  staff={hospital.staff}
                  beds={hospital.beds}
                  equipments={hospital.equipments}
                  specialty={byTp(hospital.capabilities, 'specialty')}
                  severe={byTp(hospital.capabilities, 'severe')}
                />
              )}

              {hospital.assessment && hospital.assessment.length > 0 && (
                <AssessmentSection groups={hospital.assessment} />
              )}

              <LocationSection {...hospital} />

              {hospital.i18n.length > 0 && (
                <Section title="번역">
                  {hospital.i18n.map((row) => (
                    <Field key={row.lang} label={row.lang}>
                      {row.name ?? <span className="text-gray-400">이름 번역 없음</span>}
                    </Field>
                  ))}
                </Section>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  );
}

/**
 * "소개" 카드 — 연락처 · 소개글 · 진료시간 · 안내. medifinder 의 HospitalIntroCard 와
 * **같은 순서다**: 결국 같은 질문("이 병원에 어떻게 닿나")에 답하는 값들이라 한데 둔다.
 */
function IntroSection(hospital: {
  tel?: string | null;
  homepage?: string | null;
  intro?: string | null;
  hours: HospitalHours[];
  notice?: string | null;
  ykiho?: string | null;
  hpid?: string | null;
  builtAt: string;
}) {
  const general = hospital.hours.filter((h) => h.kind === 'general');
  const baby = hospital.hours.filter((h) => h.kind === 'baby');

  return (
    <Section title="소개">
      {(hospital.tel || hospital.homepage) && (
        <div className="col-span-full divide-y divide-gray-100 text-sm">
          {hospital.tel && (
            <div className="flex justify-between py-2">
              <span className="text-gray-400">전화</span>
              <span className="text-gray-800">{hospital.tel}</span>
            </div>
          )}
          {hospital.homepage && (
            <div className="flex justify-between gap-3 py-2">
              <span className="shrink-0 text-gray-400">홈페이지</span>
              <a
                href={hospital.homepage}
                target="_blank"
                rel="noreferrer"
                className="truncate text-primary underline decoration-gray-300 underline-offset-2"
              >
                {hospital.homepage}
              </a>
            </div>
          )}
        </div>
      )}

      {hospital.intro && <TextBlock label="소개">{hospital.intro}</TextBlock>}

      {(general.length > 0 || baby.length > 0) && (
        <div className="col-span-full">
          <p className="mb-1.5 text-sm font-bold text-gray-400">진료시간</p>
          {general.length > 0 && <HoursTable rows={general} />}
          {baby.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-sm text-amber-600">달빛어린이</p>
              <HoursTable rows={baby} />
            </div>
          )}
        </div>
      )}

      {hospital.notice && <TextBlock label="안내">{hospital.notice}</TextBlock>}

      {/* 원본 연동 식별자·빌드 시각. 소개 카드 맨 아래, 옅은 톤으로 — 자주 볼 값이 아니다. */}
      <div className="col-span-full border-t border-gray-100 pt-3">
        <p className="mb-1.5 text-sm font-bold text-gray-400">연동</p>
        <dl className="divide-y divide-gray-100 text-sm">
          <IntegrationRow label="HIRA ykiho">
            {hospital.ykiho ? <CopyableCode value={hospital.ykiho} /> : <span className="text-gray-400">—</span>}
          </IntegrationRow>
          <IntegrationRow label="NMC hpid">
            {hospital.hpid ? <CopyableCode value={hospital.hpid} /> : <span className="text-gray-400">—</span>}
          </IntegrationRow>
          <IntegrationRow label="빌드">
            <span className="text-gray-600">{formatDateTime(hospital.builtAt)}</span>
          </IntegrationRow>
        </dl>
      </div>
    </Section>
  );
}

function HoursTable({ rows }: { rows: HospitalHours[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      {rows.map((h) => (
        <div
          key={`${h.kind}-${h.day}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-gray-100 px-3 py-2 text-sm last:border-0"
        >
          <span className="w-10 shrink-0 font-semibold text-gray-700">
            {DAY_LABEL[h.day] ?? h.day}
          </span>
          <span className="text-gray-800">
            {formatTime(h.openTime)} ~ {formatTime(h.closeTime)}
          </span>
          {h.breakStart && (
            <span className="text-sm text-gray-400">
              점심 {formatTime(h.breakStart)}~{formatTime(h.breakEnd)}
            </span>
          )}
          {h.receptionEnd && (
            <span className="text-sm text-gray-400">접수마감 {formatTime(h.receptionEnd)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** 진료과목 카드. **특수진료(capability special)를 여기 접어 넣는다** — medifinder 와 같은 자리다. */
function SubjectsSection({
  subjects,
  special,
}: {
  subjects: HospitalSubject[];
  special: HospitalCapability[];
}) {
  const declared = subjects.filter((s) => s.declared);
  const display = subjects.filter((s) => (s.specialistCnt ?? 0) > 0);

  return (
    <Section title="진료과목">
      <div className="col-span-full">
        {declared.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {declared.map((s) => (
              <span
                key={s.cd}
                className="rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700"
              >
                {s.name ?? s.cd}
              </span>
            ))}
          </div>
        )}

        {display.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-sm text-gray-400">표시과목(전문의 보유)</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {display.map((s) => (
                <div
                  key={s.cd}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm"
                >
                  <span className="truncate text-gray-700">{s.name ?? s.cd}</span>
                  <span className="shrink-0 font-semibold text-gray-900">{s.specialistCnt}명</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {special.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-sm text-gray-400">특수진료</p>
            <div className="flex flex-col gap-1">
              {special.map((c) => (
                <span key={c.cd} className="text-sm font-medium text-gray-700">
                  ✓ {c.name ?? c.cd}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

/**
 * 규모 카드. 전문병원 지정(specialty)은 종별 옆에, 중증처치(severe)는 장비 아래에 —
 * 둘 다 "이 병원이 얼마나 갖췄나" 를 답하는 값이라 인력·병상·장비와 한 카드에 둔다.
 */
function ScaleSection({
  staff,
  beds,
  equipments,
  specialty,
  severe,
}: {
  staff?: HospitalStaff | null;
  beds?: HospitalBeds | null;
  equipments: HospitalEquipment[];
  specialty: HospitalCapability[];
  severe: HospitalCapability[];
}) {
  return (
    <Section title="규모">
      {specialty.length > 0 && (
        <div className="col-span-full flex flex-wrap gap-1.5">
          {specialty.map((c) => (
            <span
              key={c.cd}
              className="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-700"
            >
              {c.name ? `${c.name} 전문병원` : '전문병원 지정'}
            </span>
          ))}
        </div>
      )}

      {staff && staff.doctorTotal ? (
        <div className="col-span-full">
          <p className="mb-1.5 text-sm text-gray-400">인력(총원 · 겸직 중복 없음)</p>
          <StatRow
            items={[
              ['총 의사', staff.doctorTotal],
              ['전문의', staff.specialist],
              ['레지던트', staff.resident],
              ['인턴', staff.intern],
              ['일반의', staff.generalDoctor],
              ['치과', staff.dentist],
              ['한방', staff.oriental],
              ['조산사', staff.midwife],
            ]}
          />
        </div>
      ) : null}

      {beds && beds.total ? (
        <div className="col-span-full">
          <p className="mb-1.5 text-sm text-gray-400">병상</p>
          <StatRow
            items={[
              ['허가병상', beds.total],
              ['표준', beds.standard],
              ['상급', beds.higher],
              ['중환자실', beds.icu],
              ['응급', beds.emergency],
              ['수술실', beds.operatingRoom],
              ['분만실', beds.delivery],
              ['신생아실', beds.neonatal],
              ['격리', beds.isolation],
              ['정신과 개방', beds.psyOpen],
              ['정신과 폐쇄', beds.psyClosed],
            ]}
          />
        </div>
      ) : null}

      {equipments.length > 0 && (
        <div className="col-span-full">
          <p className="mb-1.5 text-sm text-gray-400">보유장비</p>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            {equipments.map((e) => (
              <div
                key={e.cd}
                className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm last:border-0"
              >
                <span className="truncate text-gray-600">{e.name ?? e.cd}</span>
                <span className="shrink-0 text-gray-900">{e.cnt ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {severe.length > 0 && (
        <div className="col-span-full">
          <p className="mb-1.5 text-sm text-gray-400">중증처치</p>
          <div className="flex flex-wrap gap-1.5">
            {severe.map((c) => (
              <span
                key={c.cd}
                className="rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700"
              >
                {c.name ?? c.cd}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function StatRow({ items }: { items: [string, number | null | undefined][] }) {
  const present = items.filter(([, value]) => !!value);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map(([label, value]) => (
        <span
          key={label}
          className="inline-flex items-baseline gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-sm"
        >
          <span className="text-gray-400">{label}</span>
          <span className="font-semibold text-gray-900">{value}</span>
        </span>
      ))}
    </div>
  );
}

function AssessmentSection({ groups }: { groups: HospitalAssessmentGroup[] }) {
  return (
    <Section title="병원평가(심평원, 원본 등급)">
      {groups.map((group) => (
        <div key={group.code} className="col-span-full">
          <p className="mb-1.5 text-sm font-semibold text-gray-500">{group.name}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {group.items.map((item) => (
              <div
                key={item.code}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm"
              >
                <span className="truncate text-gray-700">{item.name}</span>
                <span className="shrink-0 font-semibold text-gray-900">{item.grade}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

/**
 * 위치·교통 카드. **"어떻게 가나" 에 답하는 것을 전부 모은다** — medifinder 와 같은 이유로
 * 오시는길(directions)·대중교통·주차·주소를 여기 한데 둔다.
 */
function LocationSection(hospital: {
  directions?: string | null;
  transport?: unknown;
  parkQty?: number | null;
  parkPaid?: boolean | null;
  addr?: string | null;
  postNo?: string | null;
  lat?: number | null;
  lon?: number | null;
}) {
  return (
    <Section title="위치 · 교통">
      {hospital.directions && <TextBlock label="오시는 길">{hospital.directions}</TextBlock>}

      {hospital.transport != null && <TransportField value={hospital.transport} />}

      {(hospital.parkQty || hospital.parkPaid != null) && (
        <Field label="주차">
          {hospital.parkQty ? `${hospital.parkQty}대` : '—'}
          {hospital.parkPaid != null && (
            <span className="ml-1.5 text-gray-400">{hospital.parkPaid ? '유료' : '무료'}</span>
          )}
        </Field>
      )}

      <Field label="주소">
        {hospital.postNo && <span className="mr-1.5 font-mono text-sm">{hospital.postNo}</span>}
        {hospital.addr ?? '—'}
      </Field>
      <Field label="좌표">
        {hospital.lat != null && hospital.lon != null ? `${hospital.lat}, ${hospital.lon}` : '—'}
      </Field>
    </Section>
  );
}

type TransportViewMode = 'fields' | 'json';

/** healthcare-build 가 HIRA 원본(TransportInfoItem[])을 수단별로 묶어 저장한 모양. */
interface TransportRoute {
  kindName?: string | null;
  line?: string | null;
  arrival?: string | null;
  dir?: string | null;
  distance?: string | null;
  note?: string | null;
}

interface TransportGroups {
  subway?: TransportRoute[] | null;
  bus?: TransportRoute[] | null;
  etc?: TransportRoute[] | null;
}

const TRANSPORT_GROUPS: { key: keyof TransportGroups; label: string }[] = [
  { key: 'subway', label: '지하철' },
  { key: 'bus', label: '버스' },
  { key: 'etc', label: '기타' },
];

function isTransportGroups(value: unknown): value is TransportGroups {
  return (
    !!value && typeof value === 'object' && ('subway' in value || 'bus' in value || 'etc' in value)
  );
}

/**
 * 대중교통 카드. **필드/JSON 을 탭으로 가른다** — 연동 데이터(HIRA 미러) 상세와 같은
 * 방식이다(MirrorHospitalDetail 참고). 필드 보기는 원본을 완전히 풀어 수단별(지하철·버스·
 * 기타)로 표를 나눈다 — healthcare-build 가 이미 HIRA TransportInfoItem 을 저 셋으로
 * 묶어 저장하므로(HospitalTransport 참고) 그 구조를 그대로 표로 옮기면 된다.
 */
function TransportField({ value }: { value: unknown }) {
  const [view, setView] = useState<TransportViewMode>('fields');
  const groups = isTransportGroups(value) ? value : null;

  return (
    <div className="col-span-full">
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-sm font-bold text-gray-400">대중교통</p>
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
      </div>

      {view === 'json' ? (
        <div className="max-h-96 overflow-auto rounded-xl border border-gray-100 p-1">
          <CacheJsonView value={value} />
        </div>
      ) : groups ? (
        <TransportGroupTables groups={groups} />
      ) : (
        <span className="text-sm text-gray-400">필드로 펼칠 수 없는 형식입니다 — JSON 으로 확인하세요.</span>
      )}
    </div>
  );
}

function TransportGroupTables({ groups }: { groups: TransportGroups }) {
  const visible = TRANSPORT_GROUPS.filter(({ key }) => (groups[key]?.length ?? 0) > 0);

  if (visible.length === 0) {
    return <span className="text-sm text-gray-400">교통 정보가 없습니다.</span>;
  }

  return (
    <div className="space-y-3">
      {visible.map(({ key, label }) => (
        <div key={key}>
          <p className="mb-1 text-xs font-semibold text-gray-400">{label}</p>
          <TransportRouteTable routes={groups[key]!} />
        </div>
      ))}
    </div>
  );
}

const TRANSPORT_COLUMNS: { key: keyof TransportRoute; label: string }[] = [
  { key: 'kindName', label: '교통편' },
  { key: 'line', label: '노선' },
  { key: 'arrival', label: '하차지점' },
  { key: 'dir', label: '방면' },
  { key: 'distance', label: '거리' },
  { key: 'note', label: '비고' },
];

function TransportRouteTable({ routes }: { routes: TransportRoute[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead>
          <tr className="bg-gray-50">
            {TRANSPORT_COLUMNS.map((col) => (
              <th
                key={col.key}
                className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-semibold text-gray-500"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {routes.map((route, index) => (
            <tr key={index} className="odd:bg-white even:bg-gray-50/50">
              {TRANSPORT_COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="max-w-xs truncate border-b border-gray-50 px-3 py-2 text-gray-800"
                  title={route[col.key] ?? ''}
                >
                  {route[col.key] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">{title}</h2>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function TextBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="col-span-full">
      <p className="mb-1 text-sm font-bold text-gray-400">{label}</p>
      <p className="whitespace-pre-line rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
        {children}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-gray-800">{children}</dd>
    </div>
  );
}

/** "연동" 등 식별자 목록의 한 줄. 값이 길어도(요양기호 등) 줄이 늘어나며 자연스럽게 접힌다. */
function IntegrationRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <dt className="w-24 shrink-0 pt-0.5 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/** 길게 이어지는 식별자(ykiho 등) — 줄바꿈이 안 되는 공백 없는 문자열이라 break-all 로 강제로 접는다. */
function CopyableCode({ value }: { value: string }) {
  return (
    <span className="flex items-start gap-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-gray-700">{value}</code>
      <CopyIconButton value={value} />
    </span>
  );
}

/** 값 하나를 클립보드에 복사하는 아이콘 버튼. 복사 성공/실패를 아이콘으로만 잠깐 보여준다. */
function CopyIconButton({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    const ok = await writeClipboard(value);
    setState(ok ? 'copied' : 'failed');
    if (ok) setTimeout(() => setState('idle'), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={state === 'failed' ? '복사하지 못했습니다' : '복사'}
      aria-label="복사"
      className={cn(
        'shrink-0 transition',
        state === 'failed' ? 'text-amber-600' : 'text-gray-400 hover:text-gray-700',
      )}
    >
      {state === 'copied' ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
