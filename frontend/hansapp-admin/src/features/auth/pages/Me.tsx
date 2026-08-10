import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import {
  LANGUAGE_OPTIONS,
  formatTimeZoneLabel,
  timeZoneDisplayName,
  timeZoneOptions,
} from '@/shared/lib/timeZone';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ComboBox } from '@/shared/ui/ComboBox';
import { SelectField } from '@/shared/ui/SelectField';

/**
 * 내정보.
 *
 * **읽는 값은 스토어에 있는 것만 보여 준다.** 로그인·부팅 때 /auth/me 로 이미 받아 둔 값이라
 * 화면을 열 때 다시 부를 이유가 없다. 이메일·이름·번호는 CLI 가 정하는 값이라 여기서 못 고친다.
 *
 * 고칠 수 있는 것은 **언어와 시간대뿐이다.** 계정을 만들 때 한국(ko·Asia/Seoul)으로 시작하고,
 * 여기서 바꾼 값이 화면의 시각 표기와 안내 메일에 적용된다.
 * 국가는 화면에 없다 — 집계용으로만 두는 값이라 운영자가 관리할 대상이 아니다.
 */
export default function Me() {
  const me = useAuthStore((s) => s.me);
  const updateLocale = useAuthStore((s) => s.updateLocale);

  const [language, setLanguage] = useState(me?.language ?? 'ko');
  const [timeZone, setTimeZone] = useState(me?.timeZone ?? 'Asia/Seoul');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /*
    부팅 중에 이 화면이 먼저 그려지면 me 가 아직 null 이라 초기값이 기본값으로 굳는다.
    도착한 뒤 한 번 맞춰 준다 — 안 그러면 저장한 적도 없는데 "바뀜" 으로 보인다.
  */
  useEffect(() => {
    if (!me) return;
    setLanguage(me.language);
    setTimeZone(me.timeZone);
  }, [me]);

  /*
    **고른 값이 목록에 없으면 앞에 끼워 넣는다.** `Intl.supportedValuesOf` 가 없는 브라우저는
    지금 쓰는 존 하나만 주는데, 그 상태로 다른 기기에서 고른 값을 열면 선택이 빈칸이 되고
    저장 순간 엉뚱한 값으로 덮인다.
  */
  const zoneOptions = useMemo(() => {
    const known = timeZoneOptions();
    if (known.some((option) => option.value === timeZone)) return known;
    return [
      {
        value: timeZone,
        label: formatTimeZoneLabel(timeZone),
        description: timeZoneDisplayName(timeZone),
      },
      ...known,
    ];
  }, [timeZone]);

  const changed = !!me && (language !== me.language || timeZone !== me.timeZone);

  const save = async () => {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await updateLocale({ language, timeZone });
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e, '저장하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout
      title="내정보"
      description="로그인한 관리자 계정입니다."
      breadcrumbs={[{ label: '내정보' }]}
    >
      <section className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="이메일">
            <span className="break-all">{me?.email ?? '—'}</span>
          </Field>
          <Field label="이름">{me?.name ?? '—'}</Field>
          <Field label="관리자 번호">
            <span className="font-mono">{me?.id ?? '—'}</span>
          </Field>
          <Field label="마지막 로그인">
            {formatDateTime(me?.lastLoginAt)}
          </Field>
          <Field label="비밀번호">
            {me?.mustChangePassword ? (
              <Badge tone="amber">변경 필요</Badge>
            ) : (
              <Badge tone="green">정상</Badge>
            )}
          </Field>
        </dl>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <Link
            to="/password"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <KeyRound className="h-4 w-4" />
            비밀번호 변경
          </Link>
          {/*
            이름·이메일을 고치는 통로를 두지 않았다. 관리자 계정은 CLI 로만 만들고 지우는데,
            화면에서 이메일을 바꿀 수 있으면 로그인 식별자가 조용히 갈려 CLI 쪽과 어긋난다.
            필요해지면 서버에 변경 API 부터 만들고 붙인다.
          */}
          <p className="mt-3 text-xs text-gray-400">
            이메일·이름 변경은 운영자에게 요청하세요.
          </p>
        </div>
      </section>

      <section className="mt-6 max-w-2xl rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">표시 설정</h2>
        <p className="mt-1 text-xs text-gray-400">
          이 계정에만 적용됩니다. 다른 관리자에게는 영향이 없습니다.
        </p>

        <div className="mt-5 space-y-4">
          <ComboBox
            label="시간대"
            hint="관리 화면의 모든 날짜·시각을 이 시간대로 보여줍니다. 도시나 지역 이름으로 검색하세요 — seoul, 한국, GMT+9"
            options={zoneOptions}
            value={timeZone}
            onChange={setTimeZone}
            disabled={!me}
          />

          <SelectField
            label="언어"
            // 콘솔 화면은 아직 한국어뿐이다. 값이 무엇에 쓰이는지 적어 두지 않으면
            // 골라도 아무것도 안 바뀌는 것으로 보인다.
            hint="안내 메일에 쓰는 언어입니다. 관리 화면 번역은 아직 준비 중입니다."
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={!me}
          />

          {error && <p className="text-sm text-red-500">{error}</p>}
          {saved && !changed && (
            <p className="text-sm text-green-600">저장했습니다.</p>
          )}

          <Button
            type="button"
            className="w-auto"
            loading={busy}
            disabled={!changed}
            onClick={() => void save()}
          >
            저장
          </Button>
        </div>
      </section>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-24 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-gray-800">{children}</dd>
    </div>
  );
}
