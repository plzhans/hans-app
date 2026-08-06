import { useState } from 'react';
import { accountTermsDoc, privacyDoc, type LegalDoc } from '@hansapp/legal';
import { LegalModal } from './LegalModal';
import type { ConsentPayload } from '@/shared/api/auth';

/**
 * 가입 동의 항목. **계정을 만들기 직전 화면에 붙인다.**
 *
 * 이메일 가입은 가입 폼 안, 소셜 가입은 콜백에서 돌아온 `pending` 화면이다 — 두 경로가 결국
 * 한 곳(계정 생성)으로 모이므로 그 앞을 막으면 둘 다 덮인다. 소셜 버튼 **앞**에 두면 안 된다:
 * 로그인하려는 기존 회원까지 매번 동의 화면을 보게 되고, 제공자의 동의창은 "정보를 준다" 는
 * 동의지 우리 약관 동의가 아니다.
 *
 * **폼 라이브러리에 묶지 않는다.** 가입 폼은 react-hook-form 을 쓰지만 소셜 콜백 화면은
 * 평범한 useState 다. 한쪽에 맞추면 다른 쪽이 그 라이브러리를 끌어 쓰거나 같은 UI 를 한 벌 더
 * 만들게 되는데, 동의 화면이 두 벌로 갈라지는 건 약관이 두 벌로 갈라지는 것 다음으로 나쁘다.
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
 * **화면만으로는 부족하다.** API 를 직접 부르는 경로가 남기 때문에 서버도 같은 것을 요구한다 —
 * 동의 없이 온 요청은 거절되고, 통과한 요청은 `user_consent` 에 기록된다(누가·언제·어느 판에).
 * 동의를 받았다는 입증 책임이 처리자에게 있어서, 화면의 체크박스는 그 기록을 만드는 입구일 뿐이다.
 */
export interface ConsentState {
  age: boolean;
  terms: boolean;
  privacy: boolean;
}

export const EMPTY_CONSENT: ConsentState = {
  age: false,
  terms: false,
  privacy: false,
};

/** 셋 다 필수다. 하나라도 비면 가입을 진행하지 않는다. */
export function isConsented(c: ConsentState): boolean {
  return c.age && c.terms && c.privacy;
}

export const CONSENT_REQUIRED_MESSAGE = '필수 항목에 모두 동의해야 가입할 수 있습니다.';

/**
 * 서버로 보낼 모양으로 바꾼다.
 *
 * **판은 화면이 실제로 보여준 문서에서 꺼낸다** — 상수로 박아 두면 문서를 개정했을 때 화면과
 * 기록이 어긋난다. 여기서 doc 을 읽으므로 JSON 만 고치면 따라온다.
 */
export function toConsentPayload(c: ConsentState): ConsentPayload {
  return {
    age: c.age,
    termsVersion: accountTermsDoc.version,
    privacyVersion: privacyDoc.version,
  };
}

export function ConsentFields({
  value,
  onChange,
  /** 동의 없이 진행을 시도했을 때 띄우는 문구. */
  error,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  error?: string;
}) {
  const [opened, setOpened] = useState<LegalDoc | null>(null);
  const set = (key: keyof ConsentState) => (checked: boolean) =>
    onChange({ ...value, [key]: checked });

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="space-y-2">
        <Check
          checked={value.age}
          onChange={set('age')}
          label="만 14세 이상입니다."
        />
        <Check
          checked={value.terms}
          onChange={set('terms')}
          label={
            <>
              <Doc onOpen={() => setOpened(accountTermsDoc)}>
                HansApp 계정 이용약관
              </Doc>
              에 동의합니다.
            </>
          }
        />
        <Check
          checked={value.privacy}
          onChange={set('privacy')}
          label={
            <>
              <Doc onOpen={() => setOpened(privacyDoc)}>개인정보 수집·이용</Doc>에
              동의합니다.
            </>
          }
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <LegalModal doc={opened} onClose={() => setOpened(null)} />
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <span>{label}</span>
    </label>
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
