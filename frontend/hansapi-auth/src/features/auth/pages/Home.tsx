import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { AuthCard } from '../components/AuthCard';

/**
 * 로그인 완료 랜딩. 지금 단계에선 로그인 상태 확인 + 로그아웃만.
 * 정보 수정/연동 관리(마이페이지)는 다음 단계.
 */
export default function Home() {
  const me = useAuthStore((s) => s.me);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <AuthCard title="로그인됨" subtitle="plzhans 계정에 로그인되었습니다">
      {me && (
        <dl className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
          <Row label="이메일" value={me.email} />
          <Row label="이름" value={me.name ?? '-'} />
          <Row label="가입수단" value={me.joinType} />
          <Row label="권한" value={me.role} />
          <Row label="이메일 인증" value={me.emailVerified ? '완료' : '미완료'} />
        </dl>
      )}
      <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
        로그아웃
      </Button>
    </AuthCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
