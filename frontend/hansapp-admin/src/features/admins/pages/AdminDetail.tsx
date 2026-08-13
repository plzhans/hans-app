import { Fragment, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil } from 'lucide-react';

import { deleteAdmin, getAdmin } from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { ADMIN_ROLE_LABEL, canManageRole } from '@/shared/lib/adminRoles';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { AdminTabs } from '../components/AdminTabs';
import { AdminEditModal } from '../AdminEditModal';
import { AdminPasswordResetModal } from '../AdminPasswordResetModal';

/**
 * 붙일 수 있는 소셜. **지금은 구글 하나다.**
 *
 * 서버가 주는 것은 "붙어 있는 것" 뿐이라, 붙일 수 있는 목록은 화면이 들고 있어야 한다 —
 * 이 값이 없으면 연동을 안 한 계정에서 아무 줄도 그리지 못한다. provider 문자열은 백엔드
 * `OAuthProvider` 와 같은 값이다(늘어나면 여기에 한 줄 더한다).
 */
const SOCIAL_PROVIDERS = [{ provider: 'GOOGLE', label: '구글' }];

/**
 * 관리자 상세.
 *
 * 고칠 수 있는 것은 **이메일·이름·등급**과 **비밀번호 초기화**다. 언어·시간대는 본인만
 * 바꾸고(내정보), 계정 중지(DISABLED)는 아직 CLI 에만 있다.
 *
 * **비밀번호 초기화는 계정 카드 위 오른쪽 버튼이다.** 아래 섹션으로 두면 계정 정보와 같은
 * 무게로 읽히는데, 이건 정보가 아니라 이 화면에서 할 수 있는 조치다 — 무엇이 일어나는지는
 * 누른 뒤 창이 설명한다(AdminPasswordResetModal).
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
  /** 지운 계정. **행은 남아 있지만 손댈 수 있는 것이 없다** — 서버도 404 로 답한다. */
  const isDeleted = !!admin?.deletedAt;
  /*
    **내가 이 계정을 다룰 수 있는가.** 자기보다 높은 등급은 고치지도 지우지도 못하고
    비밀번호도 다시 내지 못한다 — 막는 것은 서버이고, 여기서는 그 버튼을 아예 감춘다.
  */
  const manageable = !!admin && !isDeleted && canManageRole(me?.role, admin.role);

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

          {/*
            **버튼은 계정 머리에 모은다.** 고칠 값이 바로 아래에 있어 무엇이 바뀌는지 보면서
            누르게 되고, 사이트맵 줄에 얹으면 경로의 일부처럼 읽힌다.

            **비밀번호가 수정 왼쪽이다.** 오른쪽 끝은 가장 자주 누르는 자리라 수정이 갖는다.

            **본인 것은 여기서 초기화하지 않는다.** 세션이 끊겨 그 자리에서 튕기고, 값을
            아는 상황이라면 비밀번호 변경이 맞는 통로다(서버도 같은 규칙으로 막는다) —
            그래서 같은 자리에 그 화면으로 가는 버튼을 둔다.

            **뱃지 줄을 두지 않는다.** 등급은 아래 칸에 이미 있어 두 번 적히고, 나머지도
            결국 「이름 : 값」 한 줄이면 되는 것들이라 색칠한 조각으로 따로 세울 값이 아니다.
          */}
          <Section
            title="계정"
            actions={
              <>
                {/* 지운 계정에는 손댈 자리가 없다. 비밀번호도 세션도 의미가 없어졌다. */}
                {isDeleted ? null : isMe ? (
                  <Link
                    to="/password"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 hover:text-primary"
                  >
                    <KeyRound className="h-4 w-4" />
                    비밀번호 변경
                  </Link>
                ) : (
                  manageable && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-auto px-3"
                      onClick={() => setResetting(true)}
                    >
                      <KeyRound className="h-4 w-4" />
                      비밀번호 초기화
                    </Button>
                  )
                )}

                {manageable && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-auto px-3"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-4 w-4" />
                    수정
                  </Button>
                )}
              </>
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
            {/*
              **값을 뱃지로 적는다.** 상태는 정해진 몇 가지 중 하나라 글자를 읽기 전에 색으로
              먼저 갈리고, 로그인이 막혀 있다는 사실은 이 카드에서 놓치면 안 되는 쪽이다.

              비밀번호 변경 대기도 같은 칸이다 — 계정이 열려 있느냐(활성)와 지금 다른 화면을
              쓸 수 있느냐가 갈리는 상태라, 따로 두면 둘 다 반쪽으로 읽힌다.
            */}
            <Field label="상태">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {/*
                  **지운 계정에는 활성·중지가 아무 뜻이 없다.** 어느 쪽이든 로그인이 막혀
                  있어서, 그 값을 그대로 보여 주면 "중지만 풀면 되나" 로 읽힌다.
                */}
                {isDeleted ? (
                  <Badge tone="red">삭제됨</Badge>
                ) : (
                  <>
                    <Badge tone={admin.status === 'ACTIVE' ? 'green' : 'red'}>
                      {admin.status === 'ACTIVE' ? '활성' : '중지'}
                    </Badge>
                    {admin.mustChangePassword && (
                      <Badge tone="amber">비밀번호 변경 대기</Badge>
                    )}
                  </>
                )}
              </span>
            </Field>
            {isDeleted && (
              <Field label="삭제일">{formatDateTime(admin.deletedAt)}</Field>
            )}
            {/*
              **표시 설정도 계정 정보다.** 언어·시간대만으로 섹션을 하나 더 두면 두 줄짜리
              카드가 생기는데, 본인만 바꿀 수 있는 값이라 여기서는 어차피 읽기만 한다 —
              읽기만 하는 값이 따로 앉아 있을 이유가 없다.
            */}
            <Field label="언어">{admin.language}</Field>
            <Field label="시간대">{admin.timeZone}</Field>
            <Field label="생성일">{formatDateTime(admin.createdAt)}</Field>
            <Field label="최종 수정">{formatDateTime(admin.updatedAt)}</Field>
            {/*
              **활동 섹션을 따로 두지 않는다.** 마지막 로그인은 이 계정을 볼 때 같이 읽는
              값이라 여기 둔다. **세션 수는 적지 않는다** — 개수만으로는 할 일이 정해지지
              않고, 그 값을 보러 온 사람은 어차피 기기 탭을 연다.
            */}
            <Field label="마지막 로그인">
              {formatDateTime(admin.lastLoginAt)}
            </Field>
          </Section>

          {/*
            **붙어 있지 않아도 줄은 나온다.** 목록이 비면 섹션째 사라지는 화면(회원 상세)은
            "이 계정은 연동을 못 하나" 와 "안 했나" 가 구별되지 않는다 — 관리자 쪽은 붙일 수
            있는 것이 지금 구글 하나뿐이라, 그 하나를 늘 적어 두고 상태만 갈아 끼운다.
          */}
          <Section title="소셜 연동">
            {SOCIAL_PROVIDERS.map(({ provider, label }) => {
              const link = admin.oauths.find((o) => o.provider === provider);
              return (
                /*
                  **계정과 시각을 두 칸으로 가른다.** 한 칸에 붙여 놓으면 "…19:45:49 연동"
                  처럼 시각 뒤에 꼬리말이 붙어 읽히는데, 이 카드의 다른 줄들은 전부
                  「이름 : 값」 이라 그 줄만 문장이 된다. 격자가 2열이라 둘이 한 줄에 선다.
                */
                <Fragment key={provider}>
                  <Field label={label}>
                    {link ? (
                      // 관리자 계정의 이메일과 다를 수 있다. 어느 계정을 붙였는지가 값이다.
                      <span className="break-all">{link.email ?? '연동됨'}</span>
                    ) : (
                      <span className="text-gray-400">연동되지 않음</span>
                    )}
                  </Field>
                  <Field label="연동 시각">
                    {link ? (
                      formatDateTime(link.connectedAt)
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Field>
                </Fragment>
              );
            })}
          </Section>

          {/*
            **이미 지운 계정에는 이 자리를 두지 않는다.** 지울 것이 남아 있지 않고, 상태 칸이
            이미 그 사실을 말한다 — 되살리기는 아직 없다(필요해지면 여기 붙는다).
          */}
          {!isDeleted && (
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900">계정 삭제</h2>
            <p className="mt-1 text-sm text-gray-500">
              로그인과 세션이 곧바로 막힙니다. <b>계정 기록은 남습니다</b> — 목록의
              「삭제된 계정」 탭에서 계속 볼 수 있습니다.
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
          )}
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
  const [typed, setTyped] = useState('');

  const remove = useMutation({
    mutationFn: () => deleteAdmin(id),
    onSuccess: () => {
      /*
        **상세를 버리지 않고 다시 받는다.** 행이 남는 삭제라 그 화면은 여전히 열리고,
        지운 뒤 무엇이 달라졌는지(삭제됨·삭제일) 그 자리에서 보인다.
      */
      void qc.invalidateQueries({ queryKey: ['admin', id] });
      void qc.invalidateQueries({ queryKey: ['admins'] });
      void qc.invalidateQueries({ queryKey: ['admin-sessions', id] });
      onClose();
    },
  });

  return (
    <Modal size="md" title="관리자 삭제" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <b className="text-gray-900">{email}</b> 계정을 지웁니다. 로그인과 세션이
          곧바로 막힙니다. <b className="text-red-600">되살릴 수는 없습니다</b> —
          다만 계정 기록은 남고, 같은 이메일로 새 계정은 만들 수 있습니다.
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
