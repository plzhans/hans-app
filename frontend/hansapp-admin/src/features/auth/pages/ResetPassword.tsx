import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Clock } from 'lucide-react';

import {
  getPasswordResetTarget,
  resetPasswordWithToken,
} from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

/** 서버(AdminResetPasswordRequestDto)와 같은 값. */
const PASSWORD_MIN_LENGTH = 10;

interface Form {
  newPassword: string;
  confirm: string;
}

/**
 * 만료까지 남은 시간(밀리초). **1초마다 다시 센다.**
 *
 * 다 되면 타이머를 스스로 멈춘다 — 0 아래로 내려갈 일이 없고, 그 뒤로는 다시 그릴 값도 없다.
 */
function useRemaining(expiresAt: string | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= end) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return undefined;
  return Math.max(0, new Date(expiresAt).getTime() - now);
}

/**
 * 남은 시간 — `28분 41초`, 1분 미만이면 `41초`.
 *
 * **`28:41` 같은 시계 표기를 쓰지 않는다.** 그 모양은 시각으로 읽히기 쉬워서 "28시 41분"
 * 인지 남은 시간인지 한 번 더 생각하게 된다. 30분짜리 값이라 시간 단위는 나올 일이 없다.
 */
function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

/**
 * 메일 링크로 들어와 새 비밀번호를 정하는 화면.
 *
 * **토큰은 URL 에서 읽고 다시 쓰지 않는다.** 어차피 한 번만 유효한 값이라 어디에 담아 둘
 * 이유가 없다 — 저장해 두면 그것대로 새어 나갈 자리만 는다.
 *
 * **누구의 비밀번호인지는 서버에 묻는다.** 토큰 안에 이메일을 담아 브라우저가 풀어 보게 하면
 * 화면이 그 값을 검증할 수 없다 — 아무나 남의 주소를 넣어 링크를 만들면 우리 도메인에서
 * 그 주소가 그대로 보인다. URL 에 담긴 값이 기록·공유로 오래 남는 것도 이유다.
 *
 * 같은 요청이 **링크가 아직 살아 있는지도 미리 본다** — 이게 없으면 폼을 다 채우고 누른
 * 뒤에야 만료를 알게 된다.
 *
 * 성공해도 **자동으로 로그인시키지 않는다.** 새 비밀번호가 실제로 되는지는 그 값으로 한 번
 * 들어가 봐야 아는 것이고, 링크를 연 브라우저가 반드시 본인 것이라는 보장도 없다.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const target = useQuery({
    queryKey: ['password-reset-target', token],
    queryFn: () => getPasswordResetTarget(token),
    enabled: !!token,
    // 만료·사용 여부는 다시 물어도 답이 달라지지 않는다. 재시도로 한도만 깎지 않게 한다.
    retry: false,
  });

  const remaining = useRemaining(target.data?.expiresAt);
  /*
    **화면에서 시간이 다 되면 폼을 접는다.** 창을 열어 둔 채 자리를 비웠다 돌아온 사람이
    다 채우고 눌러서야 "만료됐다" 를 보는 일을 없앤다 — 어차피 서버도 거절할 요청이다.
  */
  const timedOut = remaining !== undefined && remaining <= 0;

  /** 두 칸이 **함께** 열린다 — 한쪽만 보이면 서로 맞는지 눈으로 볼 수가 없다. */
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    setServerError(null);
    try {
      await resetPasswordWithToken(token, newPassword);
      setDone(true);
    } catch (e) {
      setServerError(
        errorMessage(e, '비밀번호를 다시 세우지 못했습니다.'),
      );
    }
  });

  /*
    **토큰이 없으면 폼을 그리지 않는다.** 주소를 손으로 치거나 메일 앱이 링크를 잘라 먹은
    경우인데, 폼을 보여 주면 다 채우고 누른 뒤에야 안 된다는 것을 알게 된다.
  */
  if (!token) {
    return (
      <AuthCard title="링크가 올바르지 않습니다">
        <p className="text-sm leading-relaxed text-gray-600">
          메일에 있는 링크를 그대로 열어 주세요. 주소가 잘렸거나 복사되지 않은
          것 같습니다.
        </p>
        <div className="mt-6">
          <Link
            to="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            링크 다시 받기
          </Link>
        </div>
      </AuthCard>
    );
  }

  /*
    **링크가 죽었으면 폼을 그리지 않는다.** 다 채우고 누른 뒤에 만료를 알게 되는 것이
    이 화면에서 가장 허탈한 자리다.
  */
  if (target.isError || timedOut) {
    return (
      <AuthCard title="링크가 만료됐습니다">
        <p className="text-sm leading-relaxed text-gray-600">
          이 링크는 이미 쓰였거나 유효기간(30분)이 지났습니다. 다시 받아 주세요.
        </p>
        <div className="mt-6">
          <Link
            to="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            링크 다시 받기
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="비밀번호를 바꿨습니다">
        <p className="text-sm leading-relaxed text-gray-600">
          새 비밀번호로 로그인하세요.
        </p>
        {/* 다른 기기가 끊겼다는 것은 놀랄 일이라 미리 말해 둔다. */}
        <p className="mt-2 text-xs text-gray-400">
          안전을 위해 이 계정으로 로그인돼 있던 다른 기기는 모두 로그아웃됐습니다.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            로그인하기
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="새 비밀번호" subtitle="앞으로 이 값으로 로그인합니다">
      {/*
        **어느 계정인지 보여 준다.** 계정을 둘 이상 가진 사람이 엉뚱한 쪽을 바꾸는 사고를
        막는다. 가린 값이라 옆에서 화면을 봐도 주소를 옮겨 적을 수는 없다.

        남은 시간은 **1초마다 줄어든다.** 30분은 자리를 비웠다 돌아오기 충분한 시간이라,
        멈춰 있는 숫자는 언제 찍힌 값인지 알 수 없어 안 보느니만 못하다.
      */}
      <dl className="mb-4 space-y-1.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-gray-400">계정</dt>
          <dd className="min-w-0 flex-1 break-all font-medium text-gray-900">
            {target.data?.maskedEmail ?? '확인 중…'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-gray-400">만료까지</dt>
          <dd
            className={cn(
              // tabular-nums 다 — 숫자 폭이 고정돼 초가 바뀔 때 글자가 들썩이지 않는다.
              'flex flex-1 items-center gap-1.5 tabular-nums',
              // 1분을 남기면 붉게. 다 채우기 전에 끊길 수 있다는 뜻이다.
              remaining !== undefined && remaining < 60_000
                ? 'font-semibold text-red-600'
                : 'text-gray-600',
            )}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {remaining === undefined ? '—' : formatRemaining(remaining)}
          </dd>
        </div>
      </dl>

      <form onSubmit={onSubmit} className="space-y-3">
        <TextField
          label="새 비밀번호"
          type="password"
          revealable
          revealed={revealed}
          onRevealedChange={setRevealed}
          autoComplete="new-password"
          autoFocus
          hint={`${PASSWORD_MIN_LENGTH}자 이상`}
          error={errors.newPassword?.message}
          {...register('newPassword', {
            required: '새 비밀번호를 입력하세요.',
            minLength: {
              value: PASSWORD_MIN_LENGTH,
              message: `${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`,
            },
          })}
        />
        <TextField
          label="새 비밀번호 확인"
          type="password"
          revealable
          revealed={revealed}
          onRevealedChange={setRevealed}
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm', {
            required: '한 번 더 입력하세요.',
            validate: (value) =>
              value === watch('newPassword') || '비밀번호가 일치하지 않습니다.',
          })}
        />
        {serverError && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {serverError}
          </p>
        )}
        {/* 대상을 확인하기 전에는 누를 수 없다 — 죽은 링크로 폼을 채우게 두지 않는다. */}
        <Button type="submit" loading={isSubmitting} disabled={target.isLoading}>
          비밀번호 바꾸기
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-400">
        링크는 30분 동안, 한 번만 쓸 수 있습니다.
      </p>
    </AuthCard>
  );
}
