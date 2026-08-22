-- 관리자 행위 로그에 배치 **단계** on/off 를 추가한다.
--
-- 잡 on/off(BATCH_JOB_*)와 나눠 둔다. 단위가 다르고, 무엇보다 효력이 다르다 —
-- 잡은 스케줄만 끄지만 단계는 **수동 실행까지 막는다**(--force 로만 뚫린다).
-- dev 와 운영이 같은 서비스키를 써서, 단계 off 의 목적이 원본 한도 보호이기 때문이다.
--
-- 어느 단계인지는 detail 에 남는다(액션을 단계마다 만들면 단계가 늘 때마다 ALTER 가 따라온다).

ALTER TABLE `admin_action_log`
    MODIFY `action` ENUM(
        'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE',
        'ADMIN_CREATE', 'ADMIN_UPDATE', 'ADMIN_DELETE', 'ADMIN_PASSWORD_RESET',
        'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET',
        'SOCIAL_LINK', 'SOCIAL_UNLINK',
        'BATCH_JOB_ENABLE', 'BATCH_JOB_DISABLE',
        'BATCH_STAGE_ENABLE', 'BATCH_STAGE_DISABLE'
    ) NOT NULL;
