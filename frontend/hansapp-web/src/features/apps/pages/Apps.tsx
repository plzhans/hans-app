import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { createApp, listApps } from '@/shared/api/apps';
import { errorMessage } from '@/shared/api/errorMessage';
import { apiTermsDoc } from '@/features/legal/content';
import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Tabs } from '@/shared/ui/Tabs';
import { TextField } from '@/shared/ui/TextField';
import { PageHeader } from '@/shared/ui/PageHeader';
import { PAGE_CONTAINER } from '@/shared/ui/layout';
import { cn } from '@/shared/lib/cn';
import { latinRegister } from '@/shared/lib/latinInput';
import { StatusBadge } from '../StatusBadge';

/** 앱 이름: 영어·하이픈만. */
const APP_NAME_RULE = {
  value: /^[a-zA-Z-]+$/,
  message: '영어와 하이픈(-)만 사용할 수 있습니다.',
};

/**
 * 목록 표의 열 폭. 헤더 행과 내용 행이 같은 값을 써야 세로줄이 맞으므로 한 곳에 둔다.
 * 이름만 남는 폭을 가져가고 나머지는 고정 폭이다.
 */
const COLUMNS =
  'grid-cols-[minmax(0,1fr)_100px_120px_140px_32px] gap-4 px-6';

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

  /**
   * 등록 폼. 이름과 **API 이용약관 동의**를 함께 받는다 — 이용계약은 개발자가 약관에
   * 동의하고 신청함으로써 성립한다(API 이용약관 제4조).
   */
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ name: string; agreeApiTerms: boolean }>();
  const create = useMutation({
    mutationFn: (name: string) => createApp(name, apiTermsDoc.version),
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

  const closeCreate = () => {
    reset();
    create.reset();
    setOpen(false);
  };

  return (
    <div className="flex min-h-full flex-col">
      <Gnb />
      <main className={cn(PAGE_CONTAINER, 'flex-1 py-10')}>
        <PageHeader
          title="앱 관리"
          description="API 를 사용할 앱을 등록하고 서비스 키·클라이언트를 관리합니다."
          action={
            <Button className="w-auto shrink-0" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> 앱 등록
            </Button>
          }
        />

        <Tabs
          className="mb-4"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'active', label: '활성', count: activeApps.length },
            { value: 'deleted', label: '삭제됨', count: deletedApps.length },
          ]}
        />

        {isLoading ? (
          <div className="py-24 text-center text-sm text-gray-400">
            불러오는 중…
          </div>
        ) : shown.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            {tab === 'active'
              ? '등록된 앱이 없습니다.'
              : '삭제된 앱이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div
              className={cn(
                'grid border-b border-gray-200 bg-gray-50 py-3 text-xs font-semibold text-gray-400',
                COLUMNS,
              )}
            >
              <span>이름</span>
              <span>앱 ID</span>
              <span>상태</span>
              <span>생성일</span>
              <span />
            </div>
            {shown.map((app) =>
              app.deletedAt ? (
                // 삭제된 앱: 표시만, 진입 불가.
                <div
                  key={app.id}
                  className={cn(
                    'grid items-center border-b border-gray-100 py-4 last:border-0',
                    COLUMNS,
                  )}
                >
                  <span className="truncate font-semibold text-gray-400">
                    {app.name}
                  </span>
                  <span className="font-mono text-sm text-gray-400">
                    {app.id}
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
                  className={cn(
                    'grid items-center border-b border-gray-100 py-4 transition last:border-0 hover:bg-gray-50',
                    COLUMNS,
                  )}
                >
                  <span className="truncate font-semibold text-gray-900">
                    {app.name}
                  </span>
                  <span className="font-mono text-sm text-gray-500">
                    {app.id}
                  </span>
                  <span>
                    <StatusBadge
                      status={app.status}
                      reviewState={app.reviewState}
                    />
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

        {/* 등록 모달 */}
        {open && (
          <Modal onClose={closeCreate} title="앱 등록">
            <form
              onSubmit={handleSubmit(({ name }) => create.mutate(name))}
              className="space-y-5"
            >
              <TextField
                label="앱 이름"
                hint="영어와 하이픈(-)만 사용할 수 있습니다. 등록 후에도 바꿀 수 있습니다."
                placeholder="my-service"
                autoFocus
                error={errors.name?.message}
                {...latinRegister(nameReg)}
              />

              {/*
                약관은 **레이어가 아니라 새 탭으로 연다.** 여기는 이미 모달 안이고, 그 위에
                문서를 또 겹치면 이름으로 채워 둔 폼이 뒤로 묻힌다. 포털에는 /terms/app
                라우트가 있어서 새 탭이 그대로 읽는 화면이 된다.
              */}
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  {...register('agreeApiTerms', {
                    required: 'API 이용약관에 동의해야 앱을 등록할 수 있습니다.',
                  })}
                />
                <span>
                  <Link
                    to="/terms/app"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-gray-900 underline"
                  >
                    HansApp API 이용약관
                  </Link>
                  에 동의합니다.
                  <span className="mt-0.5 block text-xs text-gray-400">
                    데이터 이용 범위와 의료 정보 표시에 관한 개발자의 의무가 담겨
                    있습니다.
                  </span>
                </span>
              </label>
              {errors.agreeApiTerms && (
                <p className="text-sm text-red-500">
                  {errors.agreeApiTerms.message}
                </p>
              )}

              {create.isError && (
                <p className="text-sm text-red-500">
                  {errorMessage(create.error, '앱 등록에 실패했습니다.')}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-auto"
                  onClick={closeCreate}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  className="w-auto"
                  loading={create.isPending}
                >
                  등록
                </Button>
              </div>
            </form>
          </Modal>
        )}
      </main>
      <Footer />
    </div>
  );
}
