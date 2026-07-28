-- AlterTable
ALTER TABLE `healthcare_hospital` ADD COLUMN `directions` TEXT NULL,
    ADD COLUMN `intro` TEXT NULL,
    ADD COLUMN `notice` TEXT NULL,
    ADD COLUMN `park_note` TEXT NULL,
    ADD COLUMN `park_paid` BOOLEAN NULL,
    ADD COLUMN `park_qty` INTEGER NULL;
