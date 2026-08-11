import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateMyProfile } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import {
  LANGUAGE_OPTIONS,
  detectSupportedLanguage,
  detectTimeZone,
  formatTimeZoneLabel,
  timeZoneDisplayName,
  timeZoneOptions,
} from '@/shared/lib/clientLocale';
import { Button } from '@/shared/ui/Button';
import { ComboBox } from '@/shared/ui/ComboBox';
import { FieldRow } from '@/shared/ui/FieldRow';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

/**
 * 정보 수정 화면. **마이페이지와 페이지를 나눈다.**
 *
 * 마이페이지는 읽는 화면이다 — 계정 정보, 동의 내역, 로그인 기기 목록까지 붙는다.
 * 거기에 입력 폼을 펼쳐 두면 읽는 것과 고치는 것이 한 화면에 섞여 어느 쪽도 잘 안 보인다.
 *
 * [비밀번호는 여기 없다]
 * 화면에서는 나란히 보일 뿐 서버에서는 남남이다 — 엔드포인트가 다르고, 실패 이유가 다르고,
 * 성공 후에 할 일도 다르다. 한 버튼으로 묶으면 "이름은 저장됐는데 비밀번호는 틀렸다" 는
 * 절반 성공을 화면이 떠안고, 그걸 피하려 호출 순서와 되돌리기 규칙이 붙는다.
 * **한 화면은 한 API 만 부른다** — 비밀번호는 PasswordEdit 이 맡는다.
 *
 * [고칠 수 있는 것]
 *  - **이메일은 못 바꾼다.** 계정의 식별자이자 로그인 수단이고, 바꾸려면 새 주소의 소유를
 *    다시 증명해야 한다(인증 코드). 그 흐름이 없으므로 입력칸을 만들지 않는다 —
 *    "바꿀 수 있을 것처럼" 보이는 칸을 두고 막는 것이 더 나쁘다. 대신 값은 보여준다.
 *  - 언어·타임존은 가입할 때 브라우저에서 뽑아 둔 값이 기본이고, 여기서 고른 값이 그것을 이긴다.
 *  - **국가는 없다.** 가입 시점에 한 번 기록하는 집계용 값이라 고칠 것이 아니다.
 */
export default function ProfileEdit() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  /*
    고른 적이 없으면(가입이 이 기능보다 앞선 계정) 이 브라우저의 값을 미리 채운다.
    빈 칸을 보여 주면 "무엇으로 동작 중인지" 를 알 수 없는데, 실제로는 서버가 요청 헤더로
    이미 무언가를 고르고 있다 — 화면이 그 사실을 감추면 안 된다.
  */
  const [name, setName] = useState(me?.name ?? '');
  const [language, setLanguage] = useState(
    me?.language ?? detectSupportedLanguage(),
  );
  const [timeZone, setTimeZone] = useState(
    me?.timeZone ?? detectTimeZone() ?? 'Asia/Seoul',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!me) return null;

  const nameChanged = name !== (me.name ?? '');
  const languageChanged = language !== me.language;
  const timeZoneChanged = timeZone !== me.timeZone;
  const changed = nameChanged || languageChanged || timeZoneChanged;

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      // **바뀐 것만 보낸다.** 서버가 보낸 항목만 고치므로, 손대지 않은 값은 실지 않는다.
      await updateMyProfile({
        ...(nameChanged ? { name } : {}),
        ...(languageChanged ? { language } : {}),
        ...(timeZoneChanged ? { timeZone } : {}),
      });
      await refreshMe();
      navigate('/me', { replace: true });
    } catch (e) {
      setError(errorMessage(e, '저장하지 못했습니다.'));
      setBusy(false);
    }
  };

  return (
    <AuthCard title="정보 수정" subtitle="HansApp 계정 정보를 고칩니다">
      <div className="space-y-3">
        {/* 못 바꾸는 값이라 입력칸이 아니라 읽는 줄로 둔다. */}
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">이메일</span>
            <span className="font-medium text-gray-900">{me.email}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            이메일은 계정을 식별하는 값이라 변경할 수 없습니다.
          </p>
        </div>

        <TextField
          label="이름"
          type="text"
          autoComplete="name"
          placeholder="비워 두면 이름을 지웁니다"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <SelectField
          label="언어"
          hint="화면과 안내 메일에 쓰는 언어입니다."
          options={LANGUAGE_OPTIONS}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        />

        <ComboBox
          label="시간대"
          hint="도시나 지역 이름으로 검색하세요. 예: seoul, 한국, GMT+9"
          options={zoneOptions}
          value={timeZone}
          onChange={setTimeZone}
        />

        {error && (
          <FieldRow as="div">
            <p className="text-sm text-red-500">{error}</p>
          </FieldRow>
        )}

        {/* 바꾼 게 없으면 저장할 것도 없다. */}
        <FieldRow as="div">
          <Button
            type="button"
            loading={busy}
            disabled={!changed}
            onClick={() => void save()}
          >
            저장
          </Button>
        </FieldRow>
      </div>

      <button
        type="button"
        onClick={() => navigate('/me')}
        className="mt-6 block w-full text-center text-sm text-gray-500 hover:underline"
      >
        취소
      </button>
    </AuthCard>
  );
}
