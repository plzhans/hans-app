import SettingsPage from './SettingsPage';

export default function IntegrationSettings() {
  return (
    <SettingsPage
      category="integration"
      title="외부 연동"
      description="소셜 로그인과 공공데이터 서비스 키입니다."
      crumb="외부 연동"
    />
  );
}
