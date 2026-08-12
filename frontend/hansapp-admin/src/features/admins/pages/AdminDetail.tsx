import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil } from 'lucide-react';

import { deleteAdmin, getAdmin } from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import {
  ADMIN_ROLE_LABEL,
  ADMIN_ROLE_TONE,
  canManageRole,
} from '@/shared/lib/adminRoles';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { AdminTabs } from '../components/AdminTabs';
import { AdminEditModal } from '../AdminEditModal';
import { AdminPasswordResetModal } from '../AdminPasswordResetModal';

/**
 * 관리자 상세.
 *
 * 고칠 수 있는 것은 **이메일·이름·등급**과 **비밀번호 초기화**다. 언어·시간대는 본인만
 * 바꾸고(내정보), 계정 중지(DISABLED)는 아직 CLI 에만 있다.
 *
 * **나보다 등급이 높은 계정이면 고치는 자리들이 아예 안 보인다.** 막는 것은 서버지만,
 * 누를 수 없는 버튼을 띄워 놓고 403 으로 답하는 것보다 이 편이 낫다.
 */
export default function AdminDetail() {
  const { id } = useParams();
  const adminId = Number(id);
  const me = useAuthStore((s) => s.me);
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const query = useQuery({
    queryKey: ['admin', adminId],
    queryFn: () => getAdmin(adminId),
    // id 가 숫자가 아니면(주소를 손으로 고친 경우) 서버를 부르지 않는다.
    enabled: Number.isFinite(adminId),
  });

  const admin = query.data;
  const isMe = !!admin && admin.id === me?.id;
  /*
    **내가 이 계정을 다룰 수 있는가.** 자기보다 높은 등급은 고치지도 지우지도 못하고
    비밀번호도 다시 내지 못한다 — 막는 것은 서버이고, 여기서는 그 버튼을 아예 감춘다.
  */
  const manageable = !!admin && canManageRole(me?.role, admin.role);

  return (
    <AdminLayout
      title={admin?.email ?? '관리자 상세'}
      breadcrumbs={[
        { label: '관리자', to: '/admins' },
        { label: admin ? `#${admin.id}` : '상세' },
      ]}
    >
      <BackLink to="/admins" />

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '관리자 정보를 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading || !admin ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : (
        <div className="space-y-6">
          <AdminTabs adminId={admin.id} current="overview" />

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ADMIN_ROLE_TONE[admin.role]}>
              {ADMIN_ROLE_LABEL[admin.role]}
            </Badge>
            <Badge tone={admin.status === 'ACTIVE' ? 'green' : 'gray'}>
              {admin.status === 'ACTIVE' ? '활성' : '중지'}
            </Badge>
            {admin.mustChangePassword && (
              <Badge tone="amber">비밀번호 변경 대기</Badge>
            )}
            {isMe && <Badge tone="blue">나</Badge>}
          </div>

          {/*
            **수정 버튼은 계정 머리에 둔다.** 고칠 값(이메일·이름)이 바로 아래에 있어,
            무엇이 바뀌는지 보면서 누르게 된다.
          */}
          <Section
            title="계정"
            actions={
              manageable && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-auto px-3"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                  수정
                </Button>
              )
            }
          >
            <Field label="id">
              <span className="font-mono">{admin.id}</span>
            </Field>
            <Field label="이메일">
              <span className="break-all">{admin.email}</span>
            </Field>
            <Field label="이름">{admin.name ?? '—'}</Field>
            <Field label="등급">{ADMIN_ROLE_LABEL[admin.role]}</Field>
            <Field label="생성일">{formatDateTime(admin.createdAt)}</Field>
            <Field label="최종 수정">{formatDateTime(admin.updatedAt)}</Field>
          </Section>

          <Section title="활동">
            <Field label="마지막 로그인">
              {formatDateTime(admin.lastLoginAt)}
            </Field>
            <Field label="로그인 세션">
              {admin.activeSessionCount}개
              <span className="ml-1 text-xs text-gray-400">
                (살아 있는 것만)
              </span>
            </Field>
          </Section>

          <Section title="표시 설정">
            {/* 본인만 바꿀 수 있는 값이다. 여기서는 무엇으로 돼 있는지만 본다. */}
            <Field label="언어">{admin.language}</Field>
            <Field label="시간대">{admin.timeZone}</Field>
          </Section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900">
              비밀번호 초기화
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              본인이 비밀번호를 잃어버렸을 때 새 값을 내줍니다. 로그인 중인
              세션이 모두 끊기고, 본인이 첫 로그인에서 다시 바꿔야 합니다.
            </p>
            {isMe ? (
              /*
                **본인 것은 여기서 초기화하지 않는다.** 세션이 끊겨 그 자리에서 튕기고,
                값을 아는 상황이라면 비밀번호 변경이 맞는 통로다. 서버도 같은 규칙으로 막는다.
              */
              <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
                본인 계정은{' '}
                <Link to="/password" className="underline">
                  비밀번호 변경
                </Link>{' '}
                화면에서 바꿉니다.
              </p>
            ) : !manageable ? (
              <HigherRoleNote />
            ) : (
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-auto px-4"
                onClick={() => setResetting(true)}
              >
                <KeyRound className="h-4 w-4" />
                비밀번호 초기화
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900">계정 삭제</h2>
            <p className="mt-1 text-sm text-gray-500">
              계정과 로그인 세션을 함께 지웁니다. 되돌릴 수 없습니다.
            </p>
            {isMe ? (
              /*
                **자기 자신은 못 지운다.** 지우는 순간 콘솔 밖으로 튕기고, 남은 관리자가
                없으면 서버에 들어가 CLI 를 돌려야 풀린다. 서버도 같은 규칙으로 막는다.
              */
              <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
                로그인한 본인 계정은 지울 수 없습니다. 다른 관리자에게
                요청하세요.
              </p>
            ) : !manageable ? (
              <HigherRoleNote />
            ) : (
              <Button
                type="button"
                className="mt-4 w-auto bg-red-600 px-4 hover:bg-red-700"
                onClick={() => setConfirming(true)}
              >
                이 관리자 삭제
              </Button>
            )}
          </section>
        </div>
      )}

      {editing && admin && (
        <AdminEditModal admin={admin} onClose={() => setEditing(false)} />
      )}

      {resetting && admin && (
        <AdminPasswordResetModal
          admin={admin}
          onClose={() => setResetting(false)}
        />
      )}

      {confirming && admin && (
        <DeleteModal
          id={admin.id}
          email={admin.email}
          onClose={() => setConfirming(false)}
        />
      )}
    </AdminLayout>
  );
}

/**
 * 삭제 확인.
 *
 * **이메일을 그대로 받아 적게 한다.** 되돌릴 수 없는데다 목록에서 한 칸 어긋나 눌러도
 * 화면이 똑같이 생겨서, 버튼 한 번으로 끝나면 남의 계정을 지우고도 눈치채기 어렵다.
 */
function DeleteModal({
  id,
  email,
  onClose,
}: {
  id: number;
  email: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');

  const remove = useMutation({
    mutationFn: () => deleteAdmin(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['admin', id] });
      void qc.invalidateQueries({ queryKey: ['admins'] });
      // 지운 계정의 상세는 이제 404 다. 목록으로 돌려보낸다.
      navigate('/admins', { replace: true });
    },
  });

  return (
    <Modal size="md" title="관리자 삭제" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <b className="text-gray-900">{email}</b> 계정을 지웁니다. 이 계정의
          로그인 세션도 함께 끊기고,{' '}
          <b className="text-red-600">되돌릴 수 없습니다.</b>
        </p>

        <div>
          <label
            htmlFor="confirm-email"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            확인을 위해 이메일을 입력하세요
          </label>
          <input
            id="confirm-email"
            autoComplete="off"
            placeholder={email}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {remove.error != null && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {errorMessage(remove.error, '관리자를 지우지 못했습니다.')}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto bg-red-600 px-4 hover:bg-red-700"
          loading={remove.isPending}
          disabled={typed.trim() !== email}
          onClick={() => remove.mutate()}
        >
          삭제
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          disabled={remove.isPending}
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </Modal>
  );
}

/** 상급 계정이라 못 건드릴 때. 세 자리(수정·초기화·삭제)가 같은 문장을 쓴다. */
function HigherRoleNote() {
  return (
    <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
      나보다 높은 등급의 계정입니다. 같은 등급 이상의 관리자에게 요청하세요.
    </p>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  /** 제목 줄 오른쪽에 놓을 버튼들(선택). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-24 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-gray-800">{children}</dd>
    </div>
  );
}
