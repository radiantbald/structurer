-- Миграция: переименование столбцов с ID
-- 1. В custom_fields: allowed_value_ids → allowed_values_ids
-- 2. В custom_fields_values: linked_custom_field_ids → linked_custom_fields_ids
-- 3. В custom_fields_values: linked_custom_field_value_ids → linked_custom_fields_values_ids

BEGIN;

-- 1. Переименовываем столбец в custom_fields
ALTER TABLE custom_fields RENAME COLUMN allowed_value_ids TO allowed_values_ids;

-- 2. Переименовываем столбцы в custom_fields_values
ALTER TABLE custom_fields_values RENAME COLUMN linked_custom_field_ids TO linked_custom_fields_ids;
ALTER TABLE custom_fields_values RENAME COLUMN linked_custom_field_value_ids TO linked_custom_fields_values_ids;

COMMIT;

