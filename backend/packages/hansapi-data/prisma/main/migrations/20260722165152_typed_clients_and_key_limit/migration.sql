-- App: 서비스 키 발급 상한 컬럼(기본 3). 앱별로 값만 올려 늘린다.
ALTER TABLE `app` ADD COLUMN `api_key_limit` INTEGER NOT NULL DEFAULT 3;

-- AppClient: 웹 전용 컬럼을 nullable 로 넓히고(네이티브는 null), 네이티브 식별자용 config 추가.
ALTER TABLE `app_client` ADD COLUMN `config` JSON NULL,
    MODIFY `origins` JSON NULL,
    MODIFY `redirect_uris` JSON NULL,
    MODIFY `client_secret_hash` CHAR(64) NULL,
    MODIFY `secret_created_at` DATETIME(3) NULL,
    MODIFY `secret_suffix` VARCHAR(8) NULL;

-- 플랫폼 타입 컬럼. 기존 행이 있어 NOT NULL 직행이 불가하므로
-- nullable 추가 → 기존 행 WEB 백필 → NOT NULL 로 승격.
ALTER TABLE `app_client` ADD COLUMN `type` ENUM('WEB', 'IOS', 'ANDROID') NULL;
UPDATE `app_client` SET `type` = 'WEB' WHERE `type` IS NULL;
ALTER TABLE `app_client` MODIFY `type` ENUM('WEB', 'IOS', 'ANDROID') NOT NULL;
