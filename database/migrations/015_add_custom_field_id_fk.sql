-- Миграция 015: добавляем связь custom_fields_values → custom_fields
-- 1. Добавляем столбец custom_field_id в custom_fields_values
-- 2. Заполняем его на основе custom_fields.allowed_values_ids
-- 3. Вешаем внешний ключ с ON DELETE CASCADE
-- 4. Удаляем старый триггер каскадного удаления и функцию, если они есть

BEGIN;

-- 1. Добавляем столбец custom_field_id (если его ещё нет)
ALTER TABLE custom_fields_values
ADD COLUMN IF NOT EXISTS custom_field_id UUID;

-- 2. Заполняем custom_field_id для существующих значений.
-- Для каждого значения берём то поле, у которого в allowed_values_ids есть его id.
UPDATE custom_fields_values v
SET custom_field_id = f.id
FROM custom_fields f
WHERE v.custom_field_id IS NULL
  AND f.allowed_values_ids IS NOT NULL
  AND f.allowed_values_ids <> '[]'::jsonb
  AND v.id::text = ANY (
    SELECT jsonb_array_elements_text(f.allowed_values_ids)
  );

-- 3. Для оставшихся без custom_field_id можно (опционально) попытаться найти поле,
--    у которого в allowed_values_ids есть это значение. Этот шаг уже сделан выше,
--    поэтому здесь просто защищаемся от NOT NULL-констрейнта:
--    если какие-то значения так и останутся без поля, констрейнт их не пропустит,
--    и миграция упадёт, сигнализируя о "висящих" данных.

-- 4. Создаём внешний ключ (если его ещё нет).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
          AND table_name = 'custom_fields_values'
          AND constraint_name = 'custom_fields_values_custom_field_id_fkey'
    ) THEN
        ALTER TABLE custom_fields_values
        ADD CONSTRAINT custom_fields_values_custom_field_id_fkey
            FOREIGN KEY (custom_field_id)
            REFERENCES custom_fields(id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- 5. Делаем столбец NOT NULL (после заполнения).
ALTER TABLE custom_fields_values
ALTER COLUMN custom_field_id SET NOT NULL;

-- 6. Удаляем старый триггер каскадного удаления и функцию, если они существуют.
DROP TRIGGER IF EXISTS trg_delete_custom_fields_values_on_field_delete ON custom_fields;
DROP FUNCTION IF EXISTS delete_custom_fields_values_on_field_delete();

COMMIT;



