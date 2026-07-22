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

export default function Apps() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: listApps,
  });

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
                  placeholder="내 서비스"
                  autoFocus
                  error={errors.name?.message}
                  {...register('name', { required: '앱 이름을 입력하세요.' })}
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

        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            불러오는 중…
          </div>
        ) : !apps || apps.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            등록된 앱이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {apps.map((app) => (
              <li key={app.id}>
                <Link
                  to={`/apps/${app.id}`}
                  className="flex items-center justify-between px-5 py-4 transition hover:bg-gray-50"
                >
                  <div className="font-semibold text-gray-900">{app.name}</div>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
