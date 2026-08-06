import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { AuthCard } from '../components/AuthCard';
import { NameForm, PasswordForm } from '../components/ProfileForms';

/**
 * 정보 수정 화면. **마이페이지와 페이지를 나눈다.**
 *
 * 마이페이지는 읽는 화면이다 — 계정 정보, 동의 내역, 그리고 곧 로그인 기기 목록까지 붙는다.
 * 거기에 입력 폼을 펼쳐 두면 읽는 것과 고치는 것이 한 화면에 섞여 어느 쪽도 잘 안 보인다.
 * 주소도 갈라 두면 "수정하다 나갔다" 를 뒤로가기로 되돌릴 수 있다.
 *
 * 고칠 수 있는 것은 표시 이름과 비밀번호뿐이다.
 *  - **이메일은 못 바꾼다.** 계정의 식별자이자 로그인 수단이고, 바꾸려면 새 주소의 소유를
 *    다시 증명해야 한다(인증 코드). 지금은 그 흐름이 없으므로 화면에도 만들지 않는다 —
 *    "바꿀 수 있을 것처럼" 보이는 입력칸을 두고 막는 것이 더 나쁘다.
 *  - **비밀번호는 있는 계정만.** 소셜로만 가입하면 비밀번호가 없어 현재 비밀번호를 물을 수
 *    없다(`hasPassword`). 그런 계정에는 아예 띄우지 않는다.
 */
export default function ProfileEdit() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  if (!me) return null;

  return (
    <AuthCard title="정보 수정" subtitle="HansApp 계정 정보를 고칩니다">
      <NameForm current={me.name ?? ''} onSaved={refreshMe} />
      {me.hasPassword && <PasswordForm />}

      <button
        type="button"
        onClick={() => navigate('/me')}
        className="mt-6 block w-full text-center text-sm text-gray-500 hover:underline"
      >
        내 계정으로 돌아가기
      </button>
    </AuthCard>
  );
}
