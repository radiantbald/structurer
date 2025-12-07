-- Миграция 018: изменение порядка столбцов в таблице positions и удаление столбца description
-- Порядок столбцов:
-- id - position_name - employee_external_id - employee_surname - employee_name - employee_patronymic 
-- employee_profile_url - custom_fields_id - custom_fields_values_id - created_at - updated_at
-- Также переименовываем custom_fields_ids -> custom_fields_id и custom_fields_values_ids -> custom_fields_values_id

BEGIN;

-- 1. Создаем новую таблицу с правильным порядком столбцов
CREATE TABLE positions_new (
    id BIGSERIAL PRIMARY KEY,
    position_name VARCHAR(255) NOT NULL,
    employee_external_id VARCHAR(255),
    employee_surname VARCHAR(255),
    employee_name VARCHAR(255),
    employee_patronymic VARCHAR(255),
    employee_profile_url TEXT,
    custom_fields_id JSONB DEFAULT '[]'::jsonb,
    custom_fields_values_id JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Копируем данные из старой таблицы (исключаем description)
-- Используем динамический SQL для безопасной обработки различных вариантов имен столбцов
DO $$
DECLARE
    v_position_name_col TEXT;
    v_custom_fields_col TEXT;
    v_custom_fields_values_col TEXT;
    v_sql TEXT;
BEGIN
    -- Определяем имя столбца для названия позиции
    SELECT column_name INTO v_position_name_col
    FROM information_schema.columns
    WHERE table_name = 'positions' 
    AND column_name IN ('position_name', 'name')
    LIMIT 1;
    
    -- Определяем имя столбца для custom_fields
    SELECT column_name INTO v_custom_fields_col
    FROM information_schema.columns
    WHERE table_name = 'positions' 
    AND column_name IN ('custom_fields_id', 'custom_fields_ids')
    LIMIT 1;
    
    -- Определяем имя столбца для custom_fields_values
    SELECT column_name INTO v_custom_fields_values_col
    FROM information_schema.columns
    WHERE table_name = 'positions' 
    AND column_name IN ('custom_fields_values_id', 'custom_fields_values_ids')
    LIMIT 1;
    
    -- Если столбцы не найдены, используем значения по умолчанию
    IF v_position_name_col IS NULL THEN
        v_position_name_col := 'position_name';
    END IF;
    IF v_custom_fields_col IS NULL THEN
        v_custom_fields_col := 'custom_fields_ids';
    END IF;
    IF v_custom_fields_values_col IS NULL THEN
        v_custom_fields_values_col := 'custom_fields_values_ids';
    END IF;
    
    -- Формируем и выполняем SQL запрос
    v_sql := format('
        INSERT INTO positions_new (
            id,
            position_name,
            employee_external_id,
            employee_surname,
            employee_name,
            employee_patronymic,
            employee_profile_url,
            custom_fields_id,
            custom_fields_values_id,
            created_at,
            updated_at
        )
        SELECT 
            id,
            %I as position_name,
            employee_external_id,
            employee_surname,
            employee_name,
            employee_patronymic,
            employee_profile_url,
            COALESCE(%I, ''[]''::jsonb) as custom_fields_id,
            COALESCE(%I, ''[]''::jsonb) as custom_fields_values_id,
            created_at,
            updated_at
        FROM positions',
        v_position_name_col,
        v_custom_fields_col,
        v_custom_fields_values_col
    );
    
    EXECUTE v_sql;
END
$$;

-- 3. Сохраняем последовательность для id
SELECT setval('positions_new_id_seq', (SELECT MAX(id) FROM positions_new));

-- 4. Переименовываем таблицы
ALTER TABLE positions RENAME TO positions_old;
ALTER TABLE positions_new RENAME TO positions;

-- 5. Восстанавливаем индексы
CREATE INDEX IF NOT EXISTS idx_positions_name ON positions(position_name);
CREATE INDEX IF NOT EXISTS idx_positions_custom_fields_id ON positions USING GIN(custom_fields_id);
CREATE INDEX IF NOT EXISTS idx_positions_custom_fields_values_id ON positions USING GIN(custom_fields_values_id);

-- Удаляем старые индексы, если они существуют с другими именами
DROP INDEX IF EXISTS idx_positions_custom_fields_ids;
DROP INDEX IF EXISTS idx_positions_custom_fields_values_ids;

-- 6. Удаляем старую таблицу
DROP TABLE positions_old;

COMMIT;

