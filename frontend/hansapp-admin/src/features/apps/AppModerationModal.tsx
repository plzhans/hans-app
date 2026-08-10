import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  approveApp,
  blockApp,
  rejectApp,
  unblockApp,
  type AppDetail,
  type AppStatus,
} from '@/shared/api/apps';
import { errorMessage } from '@/shared/api/errorMessage';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';

/** 거절 사유 길이 상한. 서버(app.rejection_reason VARCHAR 500)와 같은 값이다. */
const REASON_MAX_LENGTH = 500;

/** 관리자가 앱에 취할 수 있는 조치. */
export type ModerationAction = 'approve' | 'reject' | 'block' | 'unblock';

const TITLE: Record<ModerationAction, string> = {
  approve: '앱 승인',
  reject: '심사 거절',
  block: '앱 차단',
  unblock: '차단 해제',
};

const SUBMIT_LABEL: Record<ModerationAction, string> = {
  approve: '승인',
  reject: '거절',
  block: '차단',
  unblock: '차단 해제',
};

const FAIL_MESSAGE: Record<ModerationAction, string> = {
  approve: '승인하지 못했습니다.',
  reject: '거절하지 못했습니다.',
  block: '차단하지 못했습니다.',
  unblock: '차단을 풀지 못했습니다.',
};

/** 지정한 상태로 남아 있는 발급물 수. 조치가 무엇을 건드리는지 보여 주는 값이다. */
function countBy(app: AppDetail, status: AppStatus) {
  return {
    keys: app.apiKeys.filter((k) => k.status === status).length,
    clients: app.clients.filter((c) => c.status === status).length,
  };
}

/**
 * 앱 관리 조치 모달(승인·거절·차단·해제).
 *
 * **승인·차단도 확인을 받는다.** 누르는 즉시 외부에서 도는 API 호출이 살아나거나 끊기고,
 * 목록에서 잘못 누른 것을 되돌릴 방법이 없다.
 */
export function AppModerationModal({
  app,
  action,
  onClose,
}: {
  app: AppDetail;
  action: ModerationAction;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  /** 거절 사유. 이미 거절된 앱을 다시 거절할 때는 지난 사유에서 고쳐 쓰게 채워 둔다. */
  const [reason, setReason] = useState(app.rejectionReason ?? '');

  const run = useMutation({
    mutationFn: () => {
      switch (action) {
        case 'approve':
          return approveApp(app.id);
        case 'reject':
          return rejectApp(app.id, reason);
        case 'block':
          return blockApp(app.id);
        case 'unblock':
          return unblockApp(app.id);
      }
    },
    onSuccess: (updated) => {
      // 응답이 갱신된 상세다 — 다시 받아오지 않고 그대로 캐시에 꽂는다.
      qc.setQueryData(['app', app.id], updated);
      // 목록은 상태 뱃지가 바뀌므로 다음에 열 때 새로 받게 한다.
      void qc.invalidateQueries({ queryKey: ['apps'] });
      onClose();
    },
  });

  const trimmed = reason.trim();
  const tooLong = trimmed.length > REASON_MAX_LENGTH;
  const canSubmit = action !== 'reject' || (trimmed.length > 0 && !tooLong);

  return (
    <Modal size="md" title={TITLE[action]} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <span className="font-mono text-xs text-gray-400">#{app.id}</span>
          <span className="ml-2 font-semibold text-gray-900">{app.name}</span>
          {app.owner && (
            <span className="ml-2 text-gray-500">{app.owner.email}</span>
          )}
        </div>

        {action === 'reject' ? (
          <RejectReason
            reason={reason}
            onChange={setReason}
            length={trimmed.length}
            tooLong={tooLong}
          />
        ) : (
          <Explain app={app} action={action} />
        )}

        {run.error != null && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {errorMessage(run.error, FAIL_MESSAGE[action])}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className={
            action === 'block'
              ? 'w-auto bg-red-600 px-4 hover:bg-red-700'
              : 'w-auto px-4'
          }
          loading={run.isPending}
          disabled={!canSubmit}
          onClick={() => run.mutate()}
        >
          {SUBMIT_LABEL[action]}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          disabled={run.isPending}
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </Modal>
  );
}

/** 조치가 무엇을 건드리는지 설명한다. 사유 입력이 없는 세 조치가 쓴다. */
function Explain({
  app,
  action,
}: {
  app: AppDetail;
  action: Exclude<ModerationAction, 'reject'>;
}) {
  if (action === 'approve') {
    const n = countBy(app, 'PENDING');
    return (
      <Body>
        <p>
          앱을 승인합니다. 미승인 상태인 서비스 키 <Count>{n.keys}</Count>와
          OAuth 클라이언트 <Count>{n.clients}</Count>도 함께 켜집니다.
        </p>
        {/* 승인이 사용자 의도를 덮지 않는다는 점은 헷갈리기 쉬워 적어 둔다. */}
        <Note>사용자가 꺼 둔(중지) 키·클라이언트는 그대로 둡니다.</Note>
      </Body>
    );
  }

  if (action === 'block') {
    const active = countBy(app, 'ACTIVE');
    const pending = countBy(app, 'PENDING');
    return (
      <Body>
        <p>
          앱을 차단합니다. 서비스 키{' '}
          <Count>{active.keys + pending.keys}</Count>와 OAuth 클라이언트{' '}
          <Count>{active.clients + pending.clients}</Count>가 모두 중지되어{' '}
          <b className="text-red-600">이 앱의 API 호출이 즉시 거부됩니다.</b>
        </p>
        <Note>
          삭제가 아닙니다. 차단 해제로 되돌릴 수 있고, 앱을 지우는 것은 소유자의
          몫입니다.
        </Note>
      </Body>
    );
  }

  const n = countBy(app, 'DISABLED');
  return (
    <Body>
      <p>
        차단을 풉니다. 중지된 서비스 키 <Count>{n.keys}</Count>와 OAuth
        클라이언트 <Count>{n.clients}</Count>가 다시 살아납니다.
      </p>
      {/* 차단 이전 상태를 따로 기억해 두지 않는다는 점을 누르기 전에 알린다. */}
      <Note>중지돼 있던 것은 이유를 가리지 않고 모두 켜집니다.</Note>
    </Body>
  );
}

function RejectReason({
  reason,
  onChange,
  length,
  tooLong,
}: {
  reason: string;
  onChange: (value: string) => void;
  length: number;
  tooLong: boolean;
}) {
  return (
    <div>
      <label
        htmlFor="reject-reason"
        className="mb-1.5 block text-sm font-medium text-gray-700"
      >
        거절 사유
      </label>
      <textarea
        id="reject-reason"
        rows={4}
        value={reason}
        onChange={(e) => onChange(e.target.value)}
        placeholder="무엇을 고쳐야 다시 심사받을 수 있는지 적습니다."
        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-1 flex items-center justify-between text-xs">
        {/* 사유가 그대로 노출된다는 것을 쓰는 자리에서 알려 준다. */}
        <span className="text-gray-400">앱 소유자에게 그대로 보입니다.</span>
        <span className={tooLong ? 'text-red-500' : 'text-gray-400'}>
          {length} / {REASON_MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className="space-y-2 text-sm text-gray-600">{children}</div>;
}

function Count({ children }: { children: ReactNode }) {
  return <b className="text-gray-900">{children}개</b>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gray-400">{children}</p>;
}
