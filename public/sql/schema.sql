-- WoodStream Photo Gallery - MySQL 8.0 スキーマ
-- さくらインターネット (mysql3106.db.sakura.ne.jp / kizawa_photo) 対応

CREATE TABLE IF NOT EXISTS `albums` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `cover_photo_id` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_album_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `photos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `album_id` INT UNSIGNED NOT NULL,
  `date_group` VARCHAR(100) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `rel_path` VARCHAR(512) NOT NULL,
  `title` VARCHAR(255) NULL,
  `caption` TEXT NULL,
  `tags` VARCHAR(500) NULL,
  `file_size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `width` INT UNSIGNED NOT NULL DEFAULT 0,
  `height` INT UNSIGNED NOT NULL DEFAULT 0,
  `aspect_ratio` DECIMAL(8,4) NOT NULL DEFAULT 1.5000,
  `taken_at` VARCHAR(64) NULL,
  `exif_json` LONGTEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rel_path` (`rel_path`),
  KEY `idx_album_date` (`album_id`, `date_group`),
  KEY `idx_taken_at` (`taken_at`),
  CONSTRAINT `fk_photos_album` FOREIGN KEY (`album_id`) REFERENCES `albums` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

