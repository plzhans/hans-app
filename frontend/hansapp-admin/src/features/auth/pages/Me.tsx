import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

import { useAuthStore } from '@/shared/auth/authStore';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import { Badge } from '@/shared/ui/Badge';

/**
 * 내정보.
 *
 * **스토어에 있는 것만 보여 준다.** 로그인·부팅 때 /auth/me 로 이미 받아 둔 값이라
 * 화면을 열 때 다시 부를 이유가 없다. 서버가 주는 것도 딱 이만큼이다 —
 * 관리자 계정에는 프로필이랄 게 없다(이메일·이름·마지막 로그인).
 */
export default function Me() {
  const me = useAuthStore((s) => s.me);

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
