-- Миграция: удаление столбца linked_custom_fields из таблицы custom_field_values
-- Данные теперь хранятся только в linked_custom_field_ids и linked_custom_field_value_ids

BEGIN;

-- Удаляем столбец linked_custom_fields из таблицы custom_field_values
ALTER TABLE custom_field_values DROP COLUMN IF EXISTS linked_custom_fields;

COMMIT;

