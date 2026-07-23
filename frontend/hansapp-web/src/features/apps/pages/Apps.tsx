import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { createApp, listApps } from '@/shared/api/apps';
import { errorMessage } from '@/shared/api/errorMessage';
import { Gnb } from '@/shared/components/Gnb';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { latinRegister } from '@/shared/lib/latinInput';
import { StatusBadge } from '../StatusBadge';

/** 앱 이름: 영어·하이픈만. */
const APP_NAME_RULE = {
  value: /^[a-zA-Z-]+$/,
  message: '영어와 하이픈(-)만 사용할 수 있습니다.',
};

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold transition ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {label}
      <span className="ml-1 text-xs text-gray-400">{count}</span>
    </button>
  );
}

export default function Apps() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: listApps,
  });

  const activeApps = apps?.filter((a) => !a.deletedAt) ?? [];
  const deletedApps = apps?.filter((a) => a.deletedAt) ?? [];
  const shown = tab === 'active' ? activeApps : deletedApps;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ name: string }>();
  const create = useMutation({
    mutationFn: (name: string) => createApp(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['apps'] });
      reset();
      setOpen(false);
    },
  });

  const nameReg = register('name', {
    required: '앱 이름을 입력하세요.',
    pattern: APP_NAME_RULE,
  });

  return (
    <div className="min-h-full">
      <Gnb />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">앱 관리</h1>
            <p className="mt-1 text-sm text-gray-500">
              HansAPI 를 사용할 앱을 등록하고 서비스 키·클라이언트를 관리합니다.
            </p>
          </div>
          <Button className="w-auto" onClick={() => setOpen((v) => !v)}>
            앱 등록
          </Button>
        </div>

        {/* 인라인 등록 폼 */}
        {open && (
          <form
            onSubmit={handleSubmit(({ name }) => create.mutate(name))}
            className="mb-4 rounded-2xl border border-gray-200 bg-white p-5"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <TextField
                  label="앱 이름"
                  hint="영어와 하이픈(-)만 사용할 수 있습니다."
                  placeholder="my-service"
                  autoFocus
                  error={errors.name?.message}
                  {...latinRegister(nameReg)}
                />
              </div>
              <Button
                type="submit"
                className="w-auto"
                loading={create.isPending}
              >
                등록
              </Button>
            </div>
            {create.isError && (
              <p className="mt-2 text-sm text-red-500">
                {errorMessage(create.error, '앱 등록에 실패했습니다.')}
              </p>
            )}
          </form>
        )}

        {/* 탭 */}
        <div className="mb-3 flex gap-4 border-b border-gray-200">
          <TabButton
            active={tab === 'active'}
            onClick={() => setTab('active')}
            label="활성"
            count={activeApps.length}
          />
          <TabButton
            active={tab === 'deleted'}
            onClick={() => setTab('deleted')}
            label="삭제됨"
            count={deletedApps.length}
          />
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            불러오는 중…
          </div>
        ) : shown.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            {tab === 'active'
              ? '등록된 앱이 없습니다.'
              : '삭제된 앱이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[1fr_80px_120px_24px] gap-2 border-b border-gray-200 bg-gray-50 px-5 py-2.5 text-xs font-semibold text-gray-400">
              <span>이름</span>
              <span>상태</span>
              <span>생성일</span>
              <span />
            </div>
            {shown.map((app) =>
              app.deletedAt ? (
                // 삭제된 앱: 표시만, 진입 불가.
                <div
                  key={app.id}
                  className="grid grid-cols-[1fr_80px_120px_24px] items-center gap-2 border-b border-gray-100 px-5 py-4 last:border-0"
                >
                  <span className="truncate font-semibold text-gray-400">
                    {app.name}
                  </span>
                  <span>
                    <StatusBadge status={app.status} deleted />
                  </span>
                  <span className="text-sm text-gray-400">
                    {app.createdAt.slice(0, 10)}
                  </span>
                  <span />
                </div>
              ) : (
                <Link
                  key={app.id}
                  to={`/apps/${app.id}`}
                  className="grid grid-cols-[1fr_80px_120px_24px] items-center gap-2 border-b border-gray-100 px-5 py-4 transition last:border-0 hover:bg-gray-50"
                >
                  <span className="truncate font-semibold text-gray-900">
                    {app.name}
                  </span>
                  <span>
                    <StatusBadge status={app.status} />
                  </span>
                  <span className="text-sm text-gray-500">
                    {app.createdAt.slice(0, 10)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </Link>
              ),
            )}
          </div>
        )}
      </main>
    </div>
  );
}
