import { useState } from 'react';
import { Check, Copy, Dices } from 'lucide-react';

import { writeClipboard } from '@/shared/lib/clipboard';
import { INLINE_GRID, TextField } from '@/shared/ui/TextField';

/** 서버(AdminAccountCreateRequestDto)와 같은 값. 여기서 먼저 막아 왕복을 아낀다. */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * 임의 비밀번호.
 *
 * **브라우저에서 만든다.** 서버가 만들어 내려 주면 그 값이 응답에 실려 오는데, 화면은
 * 이미 입력칸을 갖고 있어서 그럴 이유가 없다 — 만든 사람이 곧바로 눈으로 보고 옮겨 적는다.
 *
 * base64url 이라 붙여 넣어도 깨지지 않고(`+`·`/`·`=` 가 없다), 9바이트 = 72비트라
 * 사람이 고른 비밀번호보다 훨씬 강하다. 어차피 첫 로그인에서 바뀌는 값이다.
 */
export function randomPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** 값이 쓸 만한가. 폼마다 같은 조건을 다시 쓰지 않도록 여기 둔다. */
export function passwordReady(password: string, confirm: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && confirm === password;
}

/**
 * 비밀번호 입력 한 벌(값·확인·임의 생성).
 *
 * 계정을 만들 때와 비밀번호를 다시 낼 때가 **같은 값을 같은 규칙으로** 받는다 —
 * 한쪽만 고쳐져 최소 길이나 생성 방식이 갈리지 않도록 한 곳에 둔다.
 *
 * **기본은 가려져 있다.** 어깨너머로 보이는 것을 막는 것이 기본값이어야 하고, 확인이
 * 필요한 순간에만 눈 버튼으로 연다.
 */
export function PasswordFields({
  label,
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  /** 첫 칸의 이름. 만들 때는 "패스워드", 다시 낼 때는 "새 패스워드" 다. */
  label: string;
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
}) {
  /**
   * 두 칸이 **함께** 열리고 닫힌다. 한쪽만 보이면 서로 맞는지 눈으로 볼 수가 없어,
   * 오타를 잡으려고 연 것이 반쪽짜리가 된다.
   */
  const [visible, setVisible] = useState(false);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  const generate = () => {
    const generated = randomPassword();
    onPassword(generated);
    // 확인칸도 함께 채운다 — 눈으로 옮겨 적게 하면 그 자리에서 오타가 난다.
    onConfirm(generated);
    // 만들자마자 보여 준다. 만든 값을 확인하려고 매번 눈 버튼을 누르게 할 이유가 없다.
    setVisible(true);
  };

  /*
    **라벨을 왼쪽에 세운다**(다른 칸들과 같은 격자를 쓴다). 두 칸이 위아래로 쌓이면
    비밀번호만으로 창의 절반을 먹는다.

    첫 칸은 격자를 직접 그린다 — 오른쪽에 생성 버튼이 따라붙어야 해서 TextField 의
    `inline` 으로는 담을 수 없다.
  */
  return (
    <>
      <div className={INLINE_GRID}>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-start gap-2">
          {/* TextField 는 label 로 감싸져 있어 그대로 두면 flex 안에서 내용 너비가 된다. */}
          <div className="min-w-0 flex-1">
            <TextField
              className="font-mono"
              type="password"
              revealable
              revealed={visible}
              onRevealedChange={setVisible}
              // **`new-password` 다.** 브라우저가 저장해 둔 내 비밀번호를 채워 넣으면
              // 남의 계정에 그 값이 들어간다.
              autoComplete="new-password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              error={
                tooShort
                  ? `${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`
                  : undefined
              }
            />
          </div>
          {/*
            **아이콘만 둔다.** 주사위는 설명 없이도 "아무 값이나 뽑는다" 로 읽히고, 글자를
            붙이면 그 버튼이 입력칸만큼 넓어져 정작 값이 보이는 자리를 좁힌다.
            무엇인지는 마우스를 올리면 나오고, 화면 낭독기는 aria-label 을 읽는다.
          */}
          <button
            type="button"
            onClick={generate}
            title="임의 패스워드 생성"
            aria-label="임의 패스워드 생성"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
          >
            <Dices className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={INLINE_GRID}>
        <span className="text-sm font-medium text-gray-700">패스워드 확인</span>
        <TextField
          className="font-mono"
          type="password"
          revealable
          revealed={visible}
          onRevealedChange={setVisible}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          error={mismatch ? '비밀번호가 일치하지 않습니다.' : undefined}
        />
      </div>
    </>
  );
}


/**
 * 옮겨 적어야 하는 값.
 *
 * **복사는 실패할 수 있다**(writeClipboard 주석 참고). 안 되면 **실패했다고 말한다** —
 * 조용히 삼키면 복사한 줄 알고 창을 닫는다.
 *
 * 값 자체는 `select-all` 이라 클릭 한 번으로 전체가 잡힌다. 마지막 수단은 언제나 그것이다.
 */
export function SecretBox({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    const ok = await writeClipboard(value);
    setState(ok ? 'copied' : 'failed');
    if (ok) setTimeout(() => setState('idle'), 2000);
  };

  return (
    <div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-sm text-gray-900">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          title="복사"
          aria-label="복사"
          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
        >
          {state === 'copied' ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      {state === 'failed' && (
        <p className="mt-1 text-xs text-amber-600">
          복사하지 못했습니다. 값을 클릭하면 전체가 선택됩니다 — 직접 복사하세요.
        </p>
      )}
    </div>
  );
}

/** 메일을 보내려 했는데 못 보낸 이유. 서버 emailFailReason 과 같은 값이다. */
export const MAIL_FAIL_MESSAGE: Record<string, string> = {
  MAIL_DISABLED: '메일 발송이 꺼져 있거나 SMTP 가 설정되지 않았습니다.',
  SEND_FAILED: '메일 서버가 발송을 거절했습니다.',
};

/**
 * 켜고 끄는 한 줄. **비밀번호 창들이 같은 모양으로 묻는다**(세션 끊기·변경 강제·메일 발송).
 *
 * **설명은 선택이다.** 문장으로 풀어야 아는 항목에만 붙인다 — 줄마다 한 줄씩 달면 창이
 * 길어져 정작 읽어야 할 것이 묻힌다.
 */
export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        // 글줄 첫 줄에 맞춰 앉힌다. 설명이 붙으면 아래로 늘어나기 때문이다.
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary-100"
      />
      <span className="min-w-0">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
