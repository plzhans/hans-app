import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateUser, type UserDetail, type UserTier } from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import {
  LANGUAGE_OPTIONS,
  formatTimeZoneLabel,
  timeZoneDisplayName,
  timeZoneOptions,
} from '@/shared/lib/timeZone';
import { Button } from '@/shared/ui/Button';
import { ComboBox } from '@/shared/ui/ComboBox';
import { Modal } from '@/shared/ui/Modal';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';

/** 등급. 백엔드 UserTier 와 같은 값이고, 앱 생성 한도를 정한다. */
const TIER_OPTIONS: { value: UserTier; label: string }[] = [
  { value: 'BASIC', label: 'BASIC' },
  { value: 'PRO', label: 'PRO' },
  { value: 'UNLIMITED', label: 'UNLIMITED' },
];

/**
 * **"정한 적 없음" 을 고를 수 있게 한다.** 언어·시간대는 비어 있는 것이 정상 상태이고
 * (언어가 비면 요청 헤더를, 시간대가 비면 화면 기본값을 따른다), 값이 한 번 들어가면
 * 이 창 말고는 되돌릴 자리가 없다. 서버도 빈 문자열을 "지운다" 로 받는다.
 */
const UNSET = '';

/**
 * 회원 정보 수정.
 *
 * **이름·등급·언어·시간대를 고친다.** 이메일 칸이 없는 것은 관리자 계정과 사정이 달라서다 —
 * 담당자 주소는 실제로 바뀌지만(부서 이동·도메인 교체), 회원 이메일을 남이 바꾸면 그 계정의
 * 주인이 바뀌는 일이 된다. 이메일 인증 여부도 마찬가지로 "우리가 확인했다" 는 기록이라
 * 손으로 켜면 기록이 거짓이 된다.
 *
 * **안 만진 항목은 요청에 담지 않는다.** 통째로 보내면 화면이 들고 있던 옛 값이 다른 곳에서
 * 방금 바뀐 값을 덮는다(관리자 수정과 같은 규칙).
 */
export function UserEditModal({
  user,
  onClose,
}: {
  user: UserDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name ?? '');
  const [tier, setTier] = useState<UserTier>(user.tier);
  const [language, setLanguage] = useState(user.language ?? UNSET);
  const [timeZone, setTimeZone] = useState(user.timeZone ?? UNSET);

  /*
    **고른 시간대가 목록에 없으면 앞에 끼워 넣는다.** `Intl.supportedValuesOf` 가 없는
    브라우저는 지금 쓰는 존 하나만 주는데, 그 상태로 다른 값이 든 계정을 열면 선택이 빈칸이
    되고 저장하는 순간 엉뚱한 값으로 덮인다(관리자 수정과 같은 처리).
  */
  const zoneOptions = useMemo(() => {
    const known = [
      { value: UNSET, label: '미설정', description: '화면 기본값을 따릅니다' },
      ...timeZoneOptions(),
    ];
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

  const nameChanged = name.trim() !== (user.name ?? '');
  const tierChanged = tier !== user.tier;
  const languageChanged = language !== (user.language ?? UNSET);
  const timeZoneChanged = timeZone !== (user.timeZone ?? UNSET);
  const changed =
    nameChanged || tierChanged || languageChanged || timeZoneChanged;

  const save = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        ...(nameChanged ? { name: name.trim() } : {}),
        ...(tierChanged ? { tier } : {}),
        ...(languageChanged ? { language } : {}),
        ...(timeZoneChanged ? { timeZone } : {}),
      }),
    onSuccess: () => {
      // 서버가 204 라 돌려받는 것이 없다. 상세·목록 모두 다시 받는다.
      void qc.invalidateQueries({ queryKey: ['user', user.id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <Modal size="md" title="회원 수정" onClose={onClose}>
      {/*
        **칸마다 설명을 달지 않는다.** 이름·등급·시간대·언어는 이름만 보고 아는 값이라,
        한 줄씩 붙이면 창이 길어져 저장 버튼이 스크롤 아래로 간다. 적어 두는 것은
        **바꿨을 때 벌어지는 일**뿐이고, 그것도 실제로 바꾼 순간에만 뜬다
        (관리자 수정 창과 같은 규칙).
      */}
      <div className="space-y-4">
        <TextField
          inline
          label="이름"
          autoComplete="off"
          // 비우면 지워진다는 사실은 placeholder 로 충분하다.
          placeholder="홍길동"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <SelectField
          inline
          label="등급"
          options={TIER_OPTIONS}
          value={tier}
          onChange={(e) => setTier(e.target.value as UserTier)}
        />

        {/* 등급은 앱을 몇 개까지 만들 수 있는지를 정한다. 저장 전에 말해 준다. */}
        {tierChanged && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            이 회원이 만들 수 있는 앱 수가 바뀝니다. 한도보다 이미 많이 들고
            있다면 기존 앱은 그대로 남습니다.
          </p>
        )}

        {/*
          **표시 설정을 관리자가 고칠 수 있게 둔다.** 본인 화면에도 같은 칸이 있지만,
          본인이 손댈 수 없는 상황(시간대를 잘못 골라 모든 시각이 어긋나 보이는 상태)에서
          물어볼 곳이 여기뿐이다 — 관리자 계정 수정과 같은 이유다.
        */}
        <ComboBox
          inline
          label="시간대"
          options={zoneOptions}
          value={timeZone}
          onChange={setTimeZone}
        />

        <SelectField
          inline
          label="언어"
          options={[
            { value: UNSET, label: '미설정' },
            ...LANGUAGE_OPTIONS,
          ]}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        />

        {save.error != null && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {errorMessage(save.error, '회원 정보를 저장하지 못했습니다.')}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto px-4"
          loading={save.isPending}
          // 바뀐 것이 없으면 누를 이유가 없다. 빈 요청을 보내면 서버도 그냥 넘긴다.
          disabled={!changed}
          onClick={() => save.mutate()}
        >
          저장
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          disabled={save.isPending}
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </Modal>
  );
}
