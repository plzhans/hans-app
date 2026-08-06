import { useState } from 'react';
import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { accountTermsDoc, privacyDoc, type LegalDoc } from '@hansapp/legal';
import { LegalModal } from './LegalModal';

/**
 * 가입 동의 항목. **계정을 만들기 직전 화면에 붙인다.**
 *
 * 이메일 가입은 이 폼 안이고, 소셜 가입은 콜백에서 돌아온 `pending` 단계다 — 두 경로가 결국
 * 한 곳(계정 생성)으로 모이므로 그 앞을 막으면 둘 다 덮인다. 소셜 버튼 **앞**에 두면 안 된다:
 * 로그인하려는 기존 회원까지 매번 동의 화면을 보게 되고, 제공자의 동의창은 "정보를 준다" 는
 * 동의지 우리 약관 동의가 아니다.
 *
 * 셋 다 필수라 "선택 동의" 가 없다. 마케팅 수신 같은 선택 항목이 생기면 그때 필수/선택을
 * 눈에 보이게 갈라야 한다 — 섞어 두면 필수 동의가 강요된 것으로 읽힌다.
 *
 * **문서는 이 화면 위에 레이어로 띄운다.** 새 창으로 보내면 다 채운 폼을 두고 나가는 셈이라
 * 사용자가 입력이 남아 있을지 확신하지 못한다. 조문은 `@hansapp/legal` 에서 오고, 포털의 문서
 * 페이지와 같은 파일이다 — 개정하면 양쪽이 함께 바뀐다.
 *
 * 보여주는 것은 **HansApp 계정 문서**다. 계정은 여러 서비스가 함께 쓰므로 약관도 계정 계층
 * 문서여야 한다. 특정 서비스(medifinder 등)의 약관을 띄우면 "다른 서비스의 약관에 동의하고
 * 가입" 하는 모양이 된다.
 *
 * ⚠ **화면만으로는 부족하다.** 서버가 동의 여부를 받아 거절하고, 언제 어느 버전에 동의했는지
 * 기록해야 한다 — 동의를 받았다는 입증 책임이 처리자에게 있다. 그 부분은 아직 없다.
 */
export interface ConsentForm {
  agreeAge: boolean;
  agreeTerms: boolean;
  agreePrivacy: boolean;
}

export function ConsentFields<T extends ConsentForm>({
  register,
  errors,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}) {
  /*
    제네릭 폼에 얹히는 조각이라 register 의 키 타입이 T 로 좁혀지지 않는다. T 는 ConsentForm 을
    **확장**하므로 세 필드가 있다는 것은 타입이 보장하는데, UseFormRegister 가 T 에 대해
    반공변이라 컴파일러는 그걸 못 잇는다. 필드 이름은 ConsentForm 이 고정하므로 여기 한 곳에서만
    단언하고, 바깥(호출부)은 자기 폼 타입 그대로 쓴다.
  */
  const field = register as unknown as UseFormRegister<ConsentForm>;
  const error = errors as unknown as FieldErrors<ConsentForm>;

  const [opened, setOpened] = useState<LegalDoc | null>(null);

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      <Check
        label="만 14세 이상입니다."
        error={error.agreeAge?.message}
        {...field('agreeAge', { required: '만 14세 이상만 가입할 수 있습니다.' })}
      />
      <Check
        error={error.agreeTerms?.message}
        label={
          <>
            <Doc onOpen={() => setOpened(accountTermsDoc)}>
              HansApp 계정 이용약관
            </Doc>
            에 동의합니다.
          </>
        }
        {...field('agreeTerms', { required: '이용약관에 동의해야 가입할 수 있습니다.' })}
      />
      <Check
        error={error.agreePrivacy?.message}
        label={
          <>
            <Doc onOpen={() => setOpened(privacyDoc)}>개인정보 수집·이용</Doc>에
            동의합니다.
          </>
        }
        {...field('agreePrivacy', {
          required: '개인정보 수집·이용에 동의해야 가입할 수 있습니다.',
        })}
      />

      <LegalModal doc={opened} onClose={() => setOpened(null)} />
    </div>
  );
}

/**
 * 체크박스 한 줄. `register` 가 돌려주는 ref·onChange 를 그대로 받아야 해서 forwardRef 없이
 * props 를 흘려보낸다(입력이 하나뿐이라 ref 를 나눠 줄 일이 없다).
 */
function Check({
  label,
  error,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          {...input}
        />
        <span>{label}</span>
      </label>
      {error && <p className="ml-6 mt-0.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

/**
 * 문서를 여는 글자. **`<a>` 가 아니라 `<button>` 이다** — 이동하지 않고 레이어를 연다.
 *
 * 체크박스 라벨 안에 있어서 `stopPropagation` 이 필요하다. 없으면 문서를 보려고 누른 것이
 * 라벨 클릭으로도 잡혀 체크 상태가 함께 뒤집힌다.
 */
function Doc({
  onOpen,
  children,
}: {
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      className="font-semibold text-primary underline"
    >
      {children}
    </button>
  );
}
