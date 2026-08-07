import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

interface Form {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** 서버 DTO 의 @MinLength(10) 와 같은 값. 어긋나면 서버가 거절하는데 이유가 안 보인다. */
const MIN_LENGTH = 10;

/**
 * 비밀번호 변경. **두 가지 상황에서 같은 폼을 쓴다.**
 *
 *   강제(status === 'mustChange')
 *     남이 정해 준 비밀번호로 막 로그인한 상태다. 서버가 다른 API 를 전부 403 으로 막고
 *     있어 사이드바를 보여 줘도 누를 게 없다 — 그래서 로그인 화면과 같은 카드로 띄우고
 *     빠져나갈 길은 로그아웃 하나만 둔다.
 *
 *   자발적(계정 메뉴 → 비밀번호 변경)
 *     평소 화면이므로 사이드바가 있는 일반 레이아웃 안에 놓는다. 취소하고 돌아갈 수 있다.
 *
 * 폼과 검증은 하나뿐이라 규칙이 갈릴 일이 없다.
 */
export default function ChangePassword() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const status = useAuthStore((s) => s.status);
  const changePassword = useAuthStore((s) => s.changePassword);
  const signOut = useAuthStore((s) => s.signOut);

  const forced = status === 'mustChange';
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      await changePassword(currentPassword, newPassword);
      // 강제였다면 status 가 authenticated 로 바뀌어 라우팅이 알아서 넘긴다.
      // 자발적이었다면 그대로 이 화면이라, 바뀌었다는 것을 눈에 보이게 알린다.
      reset();
      setDone(true);
    } catch (e) {
      setServerError(errorMessage(e, '비밀번호를 바꾸지 못했습니다.'));
    }
  });

  const form = (
    <form onSubmit={onSubmit} className="space-y-3">
      <TextField
        label="현재 비밀번호"
        type="password"
        autoComplete="current-password"
        autoFocus={forced}
        placeholder="••••••••"
        error={errors.currentPassword?.message}
        {...register('currentPassword', {
          required: '현재 비밀번호를 입력하세요.',
        })}
      />
      <TextField
        label="새 비밀번호"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        hint={`${MIN_LENGTH}자 이상`}
        error={errors.newPassword?.message}
        {...register('newPassword', {
          required: '새 비밀번호를 입력하세요.',
          minLength: {
            value: MIN_LENGTH,
            message: `${MIN_LENGTH}자 이상이어야 합니다.`,
          },
          validate: (value) =>
            value !== watch('currentPassword') ||
            '현재 비밀번호와 다른 값이어야 합니다.',
        })}
      />
      <TextField
        label="새 비밀번호 확인"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword', {
          required: '한 번 더 입력하세요.',
          validate: (value) =>
            value === watch('newPassword') || '비밀번호가 서로 다릅니다.',
        })}
      />

      {serverError && (
        <p className="whitespace-pre-line text-sm text-red-500">{serverError}</p>
      )}
      {done && !forced && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          비밀번호를 바꿨습니다. 다른 기기의 로그인은 모두 해제되었습니다.
        </p>
      )}

      <div className={forced ? undefined : 'flex gap-2'}>
        <Button type="submit" loading={isSubmitting}>
          {forced ? '변경하고 계속하기' : '변경'}
        </Button>
        {!forced && (
          <Button
            type="button"
            variant="outline"
            className="w-auto shrink-0"
            onClick={() => navigate('/me')}
          >
            취소
          </Button>
        )}
      </div>
    </form>
  );

  // ── 강제 변경: 로그인 화면과 같은 카드 ──────────────────────────────────────
  if (forced) {
    return (
      <AuthCard
        title="비밀번호 변경"
        subtitle="처음 발급받은 비밀번호는 계속 쓸 수 없습니다"
      >
        <Notice>
          <span className="font-semibold">{me?.email}</span>
          <br />새 비밀번호를 정해야 관리자 기능을 쓸 수 있습니다.
        </Notice>
        {form}
        {/* 빠져나갈 유일한 길. 이걸 없애면 비밀번호를 잊었을 때 갇힌다. */}
        <p className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-gray-400 transition hover:text-gray-600 hover:underline"
          >
            로그아웃
          </button>
        </p>
      </AuthCard>
    );
  }

  // ── 자발적 변경: 평소 레이아웃 ──────────────────────────────────────────────
  return (
    <AdminLayout
      title="비밀번호 변경"
      description="바꾸면 다른 기기의 로그인이 모두 해제됩니다."
      breadcrumbs={[{ label: '내정보', to: '/me' }, { label: '비밀번호 변경' }]}
    >
      <section className="max-w-md rounded-2xl border border-gray-200 bg-white p-6">
        {form}
      </section>
    </AdminLayout>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      {children}
    </p>
  );
}
