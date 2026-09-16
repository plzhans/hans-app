-- 관리자 행위 로그에 배치 잡 수동 실행을 추가한다.
--
-- on/off(BATCH_JOB_*)와 나눠 둔다. 저쪽은 "앞으로 돌지 마라" 를 바꾼 것이고
-- 이건 지금 한 번 돌린 것이라, 되짚을 때 묻는 질문이 다르다 —
-- 원본(data.go.kr)의 일일 한도가 갑자기 줄었을 때 보는 것은 이 행이다.
--
-- 어느 잡인지와 force 여부는 detail 에 남는다.

ALTER TABLE `admin_action_log`
    MODIFY `action` ENUM(
        'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE',
        'ADMIN_CREATE', 'ADMIN_UPDATE', 'ADMIN_DELETE', 'ADMIN_PASSWORD_RESET',
        'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET',
        'SOCIAL_LINK', 'SOCIAL_UNLINK',
        'BATCH_JOB_ENABLE', 'BATCH_JOB_DISABLE', 'BATCH_JOB_RUN',
        'BATCH_STAGE_ENABLE', 'BATCH_STAGE_DISABLE'
    ) NOT NULL;
