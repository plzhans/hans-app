import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { requestPasswordReset, resetPassword } from "@/shared/api/auth";
import { errorMessage } from "@/shared/api/errorMessage";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/TextField";
import { AuthCard } from "../components/AuthCard";

interface RequestForm {
  email: string;
}

interface ConfirmForm {
  code: string;
  password: string;
  passwordConfirm: string;
}

/** SSO 릴레이 파라미터(return_to·client_id)를 보존해 링크를 만든다. 하나라도 빠지면 귀속이 끊긴다. */
function relayLink(
  path: string,
  returnTo?: string,
  clientId?: string,
  codeChallenge?: string,
  clientState?: string,
): string {
  if (!returnTo) return path;
  const params = new URLSearchParams({ return_to: returnTo });
  if (clientId) params.set("client_id", clientId);
  if (codeChallenge) params.set("code_challenge", codeChallenge);
  if (clientState) params.set("state", clientState);
  return `${path}?${params.toString()}`;
}

/**
 * 비밀번호 찾기. 두 단계로 나뉜다.
 *   1) request  — 가입 이메일 입력 → 서버가 인증 코드를 메일로 발송(항상 202).
 *   2) confirm  — 메일로 받은 코드 + 새 비밀번호 입력 → 재설정.
 */
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const returnTo = params.get("return_to") ?? undefined;
  const clientId = params.get("client_id") ?? undefined;
  const codeChallenge = params.get("code_challenge") ?? undefined;
  const clientState = params.get("state") ?? undefined;
  const loginLink = relayLink(
    "/login",
    returnTo,
    clientId,
    codeChallenge,
    clientState,
  );

  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [email, setEmail] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const reqForm = useForm<RequestForm>();
  const confirmForm = useForm<ConfirmForm>();

  const onRequest = reqForm.handleSubmit(async ({ email: inputEmail }) => {
    setServerError(null);
    try {
      await requestPasswordReset(inputEmail);
      setEmail(inputEmail);
      setStep("confirm");
    } catch (e) {
      setServerError(errorMessage(e, "요청을 처리하지 못했습니다."));
    }
  });

  const onConfirm = confirmForm.handleSubmit(async ({ code, password }) => {
    setServerError(null);
    try {
      await resetPassword(email, code.trim(), password);
      setStep("done");
    } catch (e) {
      setServerError(errorMessage(e, "비밀번호를 재설정하지 못했습니다."));
    }
  });

  const resend = async () => {
    setServerError(null);
    try {
      await requestPasswordReset(email);
    } catch (e) {
      setServerError(errorMessage(e, "인증 코드 재발송에 실패했습니다."));
    }
  };

  if (step === "done") {
    return (
      <AuthCard
        title="비밀번호가 변경되었습니다"
        subtitle="새 비밀번호로 다시 로그인해 주세요."
      >
        <Link to={loginLink}>
          <Button type="button">로그인하러 가기</Button>
        </Link>
      </AuthCard>
    );
  }

  if (step === "confirm") {
    return (
      <AuthCard
        title="인증 코드 입력"
        subtitle={`${email} 로 보낸 코드를 입력하고 새 비밀번호를 설정하세요.`}
      >
        {/*
          **key 를 준다.** 단계가 바뀌어도 React 는 같은 자리의 같은 태그(form>label>input)를
          **재사용하며 속성만 갈아끼운다.** react-hook-form 이 등록한 입력은 비제어라 DOM 이
          값을 그대로 들고 있어서, 앞 단계에 친 이메일이 다음 단계의 "인증 코드" 칸에 남았다.
          key 가 다르면 그 자리를 버리고 새로 만든다.
        */}
        <form key="confirm" onSubmit={onConfirm} className="space-y-3">
          <TextField
            label="인증 코드"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="메일로 받은 6자리 코드"
            error={confirmForm.formState.errors.code?.message}
            {...confirmForm.register("code", {
              required: "인증 코드를 입력하세요.",
            })}
          />
          <TextField
            label="새 비밀번호"
            type="password"
            autoComplete="new-password"
            placeholder="8자 이상"
            error={confirmForm.formState.errors.password?.message}
            {...confirmForm.register("password", {
              required: "새 비밀번호를 입력하세요.",
              minLength: {
                value: 8,
                message: "비밀번호는 8자 이상이어야 합니다.",
              },
            })}
          />
          <TextField
            label="새 비밀번호 확인"
            type="password"
            autoComplete="new-password"
            placeholder="비밀번호를 한 번 더 입력하세요"
            error={confirmForm.formState.errors.passwordConfirm?.message}
            {...confirmForm.register("passwordConfirm", {
              required: "비밀번호를 한 번 더 입력하세요.",
              validate: (v) =>
                v === confirmForm.getValues("password") ||
                "비밀번호가 일치하지 않습니다.",
            })}
          />
          {serverError && (
            <p className="whitespace-pre-line text-sm text-red-500">
              {serverError}
            </p>
          )}
          <Button type="submit" loading={confirmForm.formState.isSubmitting}>
            비밀번호 변경
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <button
            type="button"
            onClick={() => {
              setServerError(null);
              setStep("request");
            }}
            className="hover:underline"
          >
            이메일 다시 입력
          </button>
          <button type="button" onClick={resend} className="hover:underline">
            코드 재발송
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="비밀번호 찾기"
      subtitle="가입한 이메일로 인증 코드를 보내드립니다."
    >
      <form key="request" onSubmit={onRequest} className="space-y-3">
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={reqForm.formState.errors.email?.message}
          {...reqForm.register("email", { required: "이메일을 입력하세요." })}
        />
        {serverError && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {serverError}
          </p>
        )}
        <Button type="submit" loading={reqForm.formState.isSubmitting}>
          인증 코드 받기
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        비밀번호가 기억나셨나요?{" "}
        <Link
          to={loginLink}
          className="font-semibold text-primary hover:underline"
        >
          로그인
        </Link>
      </p>
    </AuthCard>
  );
}
