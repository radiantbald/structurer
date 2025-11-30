-- Миграция: замена столбца custom_fields на custom_fields_ids
-- Столбец custom_fields (JSONB объект) заменяется на custom_fields_ids (JSONB массив UUID)

BEGIN;

-- 1. Создаем новый столбец custom_fields_ids
ALTER TABLE positions ADD COLUMN IF NOT EXISTS custom_fields_ids JSONB DEFAULT '[]'::jsonb;

-- 2. Преобразуем существующие данные из custom_fields в custom_fields_ids
-- Извлекаем все UUID значения из custom_fields и собираем их в массив
-- Для строковых значений пытаемся найти соответствующий ID в custom_fields_values
UPDATE positions
SET custom_fields_ids = (
    SELECT COALESCE(
        jsonb_agg(DISTINCT value_id::text),
        '[]'::jsonb
    )
    FROM (
        SELECT 
            CASE 
                WHEN kv.value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN kv.value::uuid
                ELSE (
                    SELECT id FROM custom_fields_values 
                    WHERE value = kv.value LIMIT 1
                )
            END AS value_id
        FROM jsonb_each_text(custom_fields) AS kv
        WHERE kv.value IS NOT NULL AND kv.value != ''
    ) AS extracted_ids
    WHERE value_id IS NOT NULL
)
WHERE custom_fields IS NOT NULL AND custom_fields != '{}'::jsonb;

-- Устанавливаем пустой массив для позиций без custom_fields
UPDATE positions
SET custom_fields_ids = '[]'::jsonb
WHERE custom_fields_ids IS NULL;

-- 3. Удаляем старый столбец custom_fields
ALTER TABLE positions DROP COLUMN IF EXISTS custom_fields;

-- 4. Переименовываем новый столбец (если нужно, но он уже создан с правильным именем)
-- ALTER TABLE positions RENAME COLUMN custom_fields_ids TO custom_fields_ids; -- не нужно

-- 5. Обновляем индекс
DROP INDEX IF EXISTS idx_positions_custom_fields;
CREATE INDEX IF NOT EXISTS idx_positions_custom_fields_ids ON positions USING GIN(custom_fields_ids);

COMMIT;

