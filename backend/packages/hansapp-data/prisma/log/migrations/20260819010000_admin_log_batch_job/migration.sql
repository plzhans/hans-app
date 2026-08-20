-- 관리자 행위 로그에 배치 스케줄 on/off 를 추가한다.
--
-- 스케줄을 끄면 그 잡이 도는 것을 멈추는 것이라, 나중에 "왜 안 돌았나" 를 되짚을 때
-- 누가 언제 껐는지가 있어야 한다. 켠 것과 끈 것을 나눠 둔다 — 소셜 연동/해제와 같은 규칙이고,
-- 되짚을 때 묻는 질문이 서로 다르다.
--
-- 어느 잡인지는 detail 에 남는다(액션을 잡마다 만들면 잡이 늘 때마다 ALTER 가 따라온다).

ALTER TABLE `admin_action_log`
    MODIFY `action` ENUM(
        'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE',
        'ADMIN_CREATE', 'ADMIN_UPDATE', 'ADMIN_DELETE', 'ADMIN_PASSWORD_RESET',
        'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET',
        'SOCIAL_LINK', 'SOCIAL_UNLINK',
        'BATCH_JOB_ENABLE', 'BATCH_JOB_DISABLE'
    ) NOT NULL;
