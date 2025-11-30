-- Миграция: реструктуризация custom fields
-- 1. Создает таблицу custom_field_values для хранения данных о значениях
-- 2. Переименовывает allowed_values в allowed_value_ids в custom_field_definitions
-- 3. Добавляет столбцы linked_custom_field_ids и linked_custom_field_value_ids в custom_field_definitions
-- 4. Мигрирует существующие данные

BEGIN;

-- 1. Создаем таблицу custom_field_values
CREATE TABLE IF NOT EXISTS custom_field_values (
    id UUID PRIMARY KEY,
    value TEXT NOT NULL,
    linked_custom_fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Создаем индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_custom_field_values_id ON custom_field_values(id);

-- 3. Мигрируем существующие данные из allowed_values в custom_field_values
-- Извлекаем все value_id, value и linked_custom_fields из allowed_values JSONB
INSERT INTO custom_field_values (id, value, linked_custom_fields, created_at, updated_at)
SELECT 
    (av->>'value_id')::UUID as id,
    av->>'value' as value,
    COALESCE(av->'linked_custom_fields', '[]'::jsonb) as linked_custom_fields,
    NOW() as created_at,
    NOW() as updated_at
FROM custom_field_definitions,
     jsonb_array_elements(COALESCE(allowed_values, '[]'::jsonb)) as av
WHERE allowed_values IS NOT NULL 
  AND av->>'value_id' IS NOT NULL
  AND av->>'value' IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    value = EXCLUDED.value,
    linked_custom_fields = EXCLUDED.linked_custom_fields,
    updated_at = NOW();

-- 4. Добавляем новые столбцы в custom_field_definitions
ALTER TABLE custom_field_definitions
ADD COLUMN IF NOT EXISTS allowed_value_ids JSONB,
ADD COLUMN IF NOT EXISTS linked_custom_field_ids JSONB,
ADD COLUMN IF NOT EXISTS linked_custom_field_value_ids JSONB;

-- 5. Мигрируем allowed_values в allowed_value_ids (извлекаем только ID)
-- Также извлекаем linked_custom_field_ids и linked_custom_field_value_ids
UPDATE custom_field_definitions
SET 
    allowed_value_ids = COALESCE((
        SELECT jsonb_agg((av->>'value_id')::text)
        FROM jsonb_array_elements(COALESCE(allowed_values, '[]'::jsonb)) as av
        WHERE av->>'value_id' IS NOT NULL
    ), '[]'::jsonb),
    linked_custom_field_ids = COALESCE((
        SELECT jsonb_agg(DISTINCT (lcf->>'linked_custom_field_id')::text)
        FROM jsonb_array_elements(COALESCE(allowed_values, '[]'::jsonb)) as av,
             jsonb_array_elements(COALESCE(av->'linked_custom_fields', '[]'::jsonb)) as lcf
        WHERE lcf->>'linked_custom_field_id' IS NOT NULL
    ), '[]'::jsonb),
    linked_custom_field_value_ids = COALESCE((
        SELECT jsonb_agg(DISTINCT (lcv->>'linked_custom_field_value_id')::text)
        FROM jsonb_array_elements(COALESCE(allowed_values, '[]'::jsonb)) as av,
             jsonb_array_elements(COALESCE(av->'linked_custom_fields', '[]'::jsonb)) as lcf,
             jsonb_array_elements(COALESCE(lcf->'linked_custom_field_values', '[]'::jsonb)) as lcv
        WHERE lcv->>'linked_custom_field_value_id' IS NOT NULL
    ), '[]'::jsonb);

-- 6. Удаляем старый столбец allowed_values
ALTER TABLE custom_field_definitions
DROP COLUMN IF EXISTS allowed_values;

-- 7. Переименовываем allowed_value_ids (если нужно, но мы уже создали его с правильным именем)
-- Столбец уже создан с именем allowed_value_ids, так что переименование не нужно

COMMIT;

