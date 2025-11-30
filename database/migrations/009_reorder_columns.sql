-- Миграция: перемещение столбцов created_at и updated_at в конец таблиц
-- custom_fields и custom_field_values

BEGIN;

-- 1. Пересоздаем таблицу custom_fields с правильным порядком столбцов
CREATE TABLE custom_fields_new (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    allowed_value_ids JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Копируем данные
INSERT INTO custom_fields_new (id, key, label, allowed_value_ids, created_at, updated_at)
SELECT id, key, label, allowed_value_ids, created_at, updated_at
FROM custom_fields;

-- Переименовываем таблицы
ALTER TABLE custom_fields RENAME TO custom_fields_old;
ALTER TABLE custom_fields_new RENAME TO custom_fields;

-- Восстанавливаем индексы (если еще не существуют)
CREATE INDEX IF NOT EXISTS idx_custom_fields_key ON custom_fields(key);
-- Constraint для уникальности key уже создан при создании таблицы (UNIQUE в определении столбца)

-- Удаляем старую таблицу
DROP TABLE custom_fields_old;

-- 2. Пересоздаем таблицу custom_field_values с правильным порядком столбцов
CREATE TABLE custom_field_values_new (
    id UUID PRIMARY KEY,
    value TEXT NOT NULL,
    linked_custom_field_ids JSONB DEFAULT '[]'::jsonb,
    linked_custom_field_value_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Копируем данные
INSERT INTO custom_field_values_new (id, value, linked_custom_field_ids, linked_custom_field_value_ids, created_at, updated_at)
SELECT id, value, linked_custom_field_ids, linked_custom_field_value_ids, created_at, updated_at
FROM custom_field_values;

-- Переименовываем таблицы
ALTER TABLE custom_field_values RENAME TO custom_field_values_old;
ALTER TABLE custom_field_values_new RENAME TO custom_field_values;

-- Восстанавливаем индексы
CREATE INDEX IF NOT EXISTS idx_custom_field_values_id ON custom_field_values(id);

-- Удаляем старую таблицу
DROP TABLE custom_field_values_old;

COMMIT;

