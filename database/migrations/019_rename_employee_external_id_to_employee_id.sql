-- Миграция 019: переименование столбца employee_external_id в employee_id в таблице positions

BEGIN;

-- Переименовываем столбец
ALTER TABLE positions
RENAME COLUMN employee_external_id TO employee_id;

COMMIT;

