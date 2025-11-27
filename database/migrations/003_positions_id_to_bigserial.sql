-- Миграция: переводит колонку positions.id из UUID в BIGSERIAL (числовой primary key)
-- Допущения:
--   - текущая колонка id имеет тип UUID и является PRIMARY KEY
--   - имя PK-констрейнта по умолчанию: positions_pkey
--   - внешних ключей на positions.id нет (в текущей схеме их действительно нет)

BEGIN;

-- 1. Добавляем новую числовую колонку с автоинкрементом
ALTER TABLE positions
ADD COLUMN id_int BIGSERIAL;

-- 2. Заполняем её значениями для уже существующих строк
UPDATE positions
SET id_int = nextval(pg_get_serial_sequence('positions', 'id_int'))
WHERE id_int IS NULL;

-- 3. Удаляем старый PK по UUID
ALTER TABLE positions
DROP CONSTRAINT IF EXISTS positions_pkey;

-- 4. Удаляем старую UUID-колонку
ALTER TABLE positions
DROP COLUMN id;

-- 5. Переименовываем новую колонку в id
ALTER TABLE positions
RENAME COLUMN id_int TO id;

-- 6. Задаём её как новый PRIMARY KEY
ALTER TABLE positions
ADD CONSTRAINT positions_pkey PRIMARY KEY (id);

COMMIT;



