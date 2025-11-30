-- Миграция: добавление столбца custom_fields_values_ids в таблицу positions
-- Столбец хранит массив UUID значений кастомных полей, привязанных к позиции

BEGIN;

-- Добавляем новый столбец custom_fields_values_ids (JSONB массив UUID)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS custom_fields_values_ids JSONB DEFAULT '[]'::jsonb;

-- Устанавливаем пустой массив для существующих позиций без значений
UPDATE positions
SET custom_fields_values_ids = '[]'::jsonb
WHERE custom_fields_values_ids IS NULL;

-- Создаем индекс для быстрого поиска по значениям кастомных полей
CREATE INDEX IF NOT EXISTS idx_positions_custom_fields_values_ids ON positions USING GIN(custom_fields_values_ids);

COMMIT;

