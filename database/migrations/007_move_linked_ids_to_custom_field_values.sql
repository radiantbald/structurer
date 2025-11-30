-- Миграция: перенос столбцов linked_custom_field_ids и linked_custom_field_value_ids
-- из таблицы custom_fields в таблицу custom_field_values

BEGIN;

-- 1. Добавляем столбцы в custom_field_values
ALTER TABLE custom_field_values
ADD COLUMN IF NOT EXISTS linked_custom_field_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS linked_custom_field_value_ids JSONB DEFAULT '[]'::jsonb;

-- 2. Извлекаем linked_custom_field_ids и linked_custom_field_value_ids из linked_custom_fields JSONB
-- для каждого значения в custom_field_values
UPDATE custom_field_values
SET 
    linked_custom_field_ids = COALESCE((
        SELECT jsonb_agg(DISTINCT (lcf->>'linked_custom_field_id')::text)
        FROM jsonb_array_elements(COALESCE(linked_custom_fields, '[]'::jsonb)) as lcf
        WHERE lcf->>'linked_custom_field_id' IS NOT NULL
    ), '[]'::jsonb),
    linked_custom_field_value_ids = COALESCE((
        SELECT jsonb_agg(DISTINCT (lcv->>'linked_custom_field_value_id')::text)
        FROM jsonb_array_elements(COALESCE(linked_custom_fields, '[]'::jsonb)) as lcf,
             jsonb_array_elements(COALESCE(lcf->'linked_custom_field_values', '[]'::jsonb)) as lcv
        WHERE lcv->>'linked_custom_field_value_id' IS NOT NULL
    ), '[]'::jsonb);

-- 3. Удаляем столбцы из custom_fields
ALTER TABLE custom_fields
DROP COLUMN IF EXISTS linked_custom_field_ids,
DROP COLUMN IF EXISTS linked_custom_field_value_ids;

COMMIT;

