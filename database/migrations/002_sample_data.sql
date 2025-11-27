-- Sample data for testing (optional)

-- Insert sample custom fields
INSERT INTO custom_field_definitions (id, key, label, type, allowed_values, created_at, updated_at)
VALUES 
    (uuid_generate_v4(), 'department', 'Отдел', 'string', NULL, NOW(), NOW()),
    (uuid_generate_v4(), 'product', 'Продукт', 'string', NULL, NOW(), NOW()),
    (uuid_generate_v4(), 'location', 'Локация', 'string', NULL, NOW(), NOW()),
    (uuid_generate_v4(), 'level', 'Уровень', 'enum', '["Junior", "Middle", "Senior"]'::jsonb, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- Insert sample positions
INSERT INTO positions (name, description, custom_fields, employee_full_name, employee_external_id, created_at, updated_at)
VALUES 
    (
        'QA инженер',
        'Тестирование продуктов',
        '{"department": "Финтех", "product": "Счета и переводы", "level": "Middle"}'::jsonb,
        'Иванов Иван Иванович',
        'EMP001',
        NOW(),
        NOW()
    ),
    (
        'Backend разработчик',
        'Разработка серверной части',
        '{"department": "Финтех", "product": "Счета и переводы", "level": "Senior"}'::jsonb,
        'Петров Петр Петрович',
        'EMP002',
        NOW(),
        NOW()
    ),
    (
        'Frontend разработчик',
        'Разработка клиентской части',
        '{"department": "Финтех", "product": "Мобильное приложение", "level": "Middle"}'::jsonb,
        NULL,
        NULL,
        NOW(),
        NOW()
    )
ON CONFLICT DO NOTHING;

-- Insert sample tree definition
INSERT INTO tree_definitions (id, name, description, is_default, levels, created_at, updated_at)
VALUES 
    (
        uuid_generate_v4(),
        'По отделам и продуктам',
        'Группировка по отделу и продукту',
        false,
        '[
            {"order": 1, "custom_field_key": "department"},
            {"order": 2, "custom_field_key": "product"}
        ]'::jsonb,
        NOW(),
        NOW()
    )
ON CONFLICT DO NOTHING;

