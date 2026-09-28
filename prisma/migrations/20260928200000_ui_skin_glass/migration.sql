-- Liquid Glass yeni varsayılan görünüm: sütun varsayılanını değiştir ve mevcut "modern" ayarları da glass yap.
ALTER TABLE `system_settings` MODIFY `uiSkin` VARCHAR(191) NOT NULL DEFAULT 'glass';
UPDATE `system_settings` SET `uiSkin` = 'glass' WHERE `uiSkin` = 'modern';
