-- Миграция: удаление столбца type из таблицы custom_fields
-- Столбец type больше не используется, так как все поля теперь enum

BEGIN;

-- Удаляем столбец type из таблицы custom_fields
ALTER TABLE custom_fields DROP COLUMN IF EXISTS type;

COMMIT;

