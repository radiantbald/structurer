-- Миграция 017: переименование столбцов для единообразия (только если миграция 016 была применена со старыми именами)
-- 1. Переименовываем surname в employee_surname (если существует)
-- 2. Переименовываем patronymic в employee_patronymic (если существует)
-- 3. Переименовываем name в position_name (если существует и еще не переименован)

BEGIN;

-- 1. Переименовываем surname в employee_surname (если столбец surname существует)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'positions' AND column_name = 'surname'
    ) THEN
        ALTER TABLE positions RENAME COLUMN surname TO employee_surname;
    END IF;
END
$$;

-- 2. Переименовываем patronymic в employee_patronymic (если столбец patronymic существует)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'positions' AND column_name = 'patronymic'
    ) THEN
        ALTER TABLE positions RENAME COLUMN patronymic TO employee_patronymic;
    END IF;
END
$$;

-- 3. Переименовываем name в position_name (если столбец name существует)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'positions' AND column_name = 'name'
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'positions' AND column_name = 'position_name'
        )
    ) THEN
        ALTER TABLE positions RENAME COLUMN name TO position_name;
    END IF;
END
$$;

COMMIT;

