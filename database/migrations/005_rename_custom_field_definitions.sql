-- Миграция: переименование таблицы custom_field_definitions в custom_fields
-- Также переименовываем связанные индексы и ограничения

BEGIN;

-- 1. Переименовываем таблицу
ALTER TABLE custom_field_definitions RENAME TO custom_fields;

-- 2. Переименовываем индексы
ALTER INDEX IF EXISTS idx_custom_field_definitions_key RENAME TO idx_custom_fields_key;
ALTER INDEX IF EXISTS custom_field_definitions_pkey RENAME TO custom_fields_pkey;
ALTER INDEX IF EXISTS custom_field_definitions_key_key RENAME TO custom_fields_key_key;

COMMIT;

