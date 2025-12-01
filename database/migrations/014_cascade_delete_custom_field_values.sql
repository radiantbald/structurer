-- Миграция: каскадное удаление значений кастомных полей
-- Цель: при удалении записи из custom_fields удалять связанные значения
-- из таблицы custom_fields_values, чьи id содержались в массиве allowed_value_ids.

BEGIN;

-- Функция-триггер для каскадного удаления значений
CREATE OR REPLACE FUNCTION delete_custom_fields_values_on_field_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Удаляем значения, id которых были в массиве allowed_value_ids удаляемого поля
    IF OLD.allowed_value_ids IS NOT NULL THEN
        DELETE FROM custom_fields_values
        WHERE id IN (
            SELECT (value)::uuid
            FROM jsonb_array_elements_text(OLD.allowed_value_ids)
        );
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Триггер на удаление записей из custom_fields
DROP TRIGGER IF EXISTS trg_delete_custom_fields_values_on_field_delete ON custom_fields;

CREATE TRIGGER trg_delete_custom_fields_values_on_field_delete
AFTER DELETE ON custom_fields
FOR EACH ROW
EXECUTE FUNCTION delete_custom_fields_values_on_field_delete();

COMMIT;


