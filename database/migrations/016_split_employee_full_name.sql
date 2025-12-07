-- Миграция 016: разделение employee_full_name на три столбца
-- 1. Переименовываем name в position_name (если еще не переименован)
-- 2. Добавляем три новых столбца: employee_surname, employee_name, employee_patronymic
-- 3. Переносим данные из employee_full_name в новые столбцы (разделяем по пробелам)
-- 4. Удаляем старый столбец employee_full_name

BEGIN;

-- 1. Переименовываем name в position_name (если столбец name еще существует)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'positions' AND column_name = 'name'
    ) THEN
        ALTER TABLE positions RENAME COLUMN name TO position_name;
    END IF;
END
$$;

-- 2. Добавляем три новых столбца
ALTER TABLE positions
ADD COLUMN IF NOT EXISTS employee_surname VARCHAR(255),
ADD COLUMN IF NOT EXISTS employee_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS employee_patronymic VARCHAR(255);

-- 3. Переносим данные из employee_full_name в новые столбцы
-- Формат: "Фамилия Имя Отчество" -> employee_surname, employee_name, employee_patronymic
UPDATE positions
SET 
    employee_surname = CASE 
        WHEN employee_full_name IS NULL OR employee_full_name = '' THEN NULL
        ELSE split_part(employee_full_name, ' ', 1)
    END,
    employee_name = CASE 
        WHEN employee_full_name IS NULL OR employee_full_name = '' THEN NULL
        WHEN array_length(string_to_array(employee_full_name, ' '), 1) >= 2 THEN split_part(employee_full_name, ' ', 2)
        ELSE NULL
    END,
    employee_patronymic = CASE 
        WHEN employee_full_name IS NULL OR employee_full_name = '' THEN NULL
        WHEN array_length(string_to_array(employee_full_name, ' '), 1) >= 3 THEN 
            array_to_string((string_to_array(employee_full_name, ' '))[3:], ' ')
        ELSE NULL
    END
WHERE employee_full_name IS NOT NULL AND employee_full_name != '';

-- 4. Удаляем старый столбец employee_full_name
ALTER TABLE positions
DROP COLUMN IF EXISTS employee_full_name;

COMMIT;

