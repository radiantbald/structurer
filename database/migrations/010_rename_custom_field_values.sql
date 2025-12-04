-- Миграция: переименование таблицы custom_field_values в custom_fields_values

BEGIN;

-- Переименовываем таблицу
ALTER TABLE custom_field_values RENAME TO custom_fields_values;

-- Переименовываем индексы
ALTER INDEX IF EXISTS custom_field_values_pkey RENAME TO custom_fields_values_pkey;
ALTER INDEX IF EXISTS idx_custom_field_values_id RENAME TO idx_custom_fields_values_id;

COMMIT;


