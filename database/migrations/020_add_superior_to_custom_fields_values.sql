-- Миграция 020: добавление столбца superior в таблицу custom_fields_values
-- Столбец superior хранит ID должности (из таблицы positions), которая является начальником узла

BEGIN;

-- Добавляем столбец superior (BIGINT, может быть NULL)
ALTER TABLE custom_fields_values
ADD COLUMN IF NOT EXISTS superior BIGINT;

-- Создаём внешний ключ на таблицу positions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
          AND table_name = 'custom_fields_values'
          AND constraint_name = 'custom_fields_values_superior_fkey'
    ) THEN
        ALTER TABLE custom_fields_values
        ADD CONSTRAINT custom_fields_values_superior_fkey
            FOREIGN KEY (superior)
            REFERENCES positions(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- Создаём индекс для ускорения поиска по superior
CREATE INDEX IF NOT EXISTS idx_custom_fields_values_superior ON custom_fields_values(superior);

COMMIT;

