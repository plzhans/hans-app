import SettingsPage from './SettingsPage';

export default function MailSettings() {
  return (
    <SettingsPage
      category="mail"
      title="메일"
      description="발송 계정과 SMTP 접속 정보입니다."
      crumb="메일"
    />
  );
}
