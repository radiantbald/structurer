import React from 'react';
import './CustomFieldForm.css';

function PositionCustomFieldsModal({
  onClose,
  customFieldsValues,
  availableCustomFields,
  newCustomFieldKey,
  onChangeNewCustomFieldKey,
  onChangeValue,
  onRemoveField,
  onAddField
}) {
  const hasAnyFields = Object.keys(customFieldsValues || {}).length > 0;

  const handleOverlayClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={handleOverlayClick}>
        <div className="modal-header">
          <h2>Редактировать кастомные поля</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="custom-field-form">
          <p className="custom-fields-hint">
            Назначьте должности дополнительные атрибуты. Поля настраиваются отдельно в разделе
            «Кастомные поля» в шапке приложения.
          </p>

          {hasAnyFields && (
            <div className="custom-fields-list">
              {Object.entries(customFieldsValues).map(([key, value]) => {
                const fieldDef = availableCustomFields.find(f => f.key === key);
                const isEnum = fieldDef?.allowed_values && fieldDef.allowed_values.length > 0;

                // Нормализуем текущее значение для поиска совпадения
                const normalizedCurrentValue = value ? String(value).trim() : '';

                // Извлекаем основную часть значения (без прилинкованных, если они записаны в скобках или через тире)
                // Это нужно для случаев, когда значение было сохранено как "Value1 (Linked1, Linked2)"
                // или в старом формате "Value1 - Linked1 - Linked2"
                const extractMainValue = (val) => {
                  if (!val) return '';
                  const trimmed = val.trim();
                  // Новый формат: "Main (Linked1, Linked2)"
                  const parenStart = trimmed.indexOf('(');
                  const parenEnd = trimmed.lastIndexOf(')');
                  if (parenStart > 0 && parenEnd > parenStart) {
                    return trimmed.substring(0, parenStart).trim();
                  }
                  // Старый формат: "Main - Linked1 - Linked2"
                  const dashIndex = trimmed.indexOf(' - ');
                  return dashIndex >= 0 ? trimmed.substring(0, dashIndex).trim() : trimmed;
                };

                const mainValue = extractMainValue(normalizedCurrentValue);

                // Для enum‑полей селект должен опираться на value_id (уникальный ID значения),
                // а не только на текст. Иначе при повторяющихся текстах браузер будет выбирать
                // первое совпадение и визуально «выбираться» будет другой элемент.
                let currentValueForSelect = '';
                if (isEnum) {
                  const allowed = fieldDef?.allowed_values || [];

                  // Ищем элемент, который соответствует либо сохранённому ID, либо тексту
                  const matched = allowed.find(av => {
                    if (!av) return false;
                    if (typeof av === 'string') {
                      // Старый формат: строковые значения
                      const valStr = av.trim();
                      return (
                        normalizedCurrentValue === valStr ||
                        mainValue === valStr
                      );
                    }

                    const valStr = av.value ? String(av.value).trim() : '';
                    const idStr = av.value_id ? String(av.value_id).trim() : '';

                    return (
                      normalizedCurrentValue === idStr ||
                      normalizedCurrentValue === valStr ||
                      mainValue === valStr
                    );
                  });

                  if (matched) {
                    if (typeof matched === 'string') {
                      // Старый формат: в value селекта используем сам текст
                      currentValueForSelect = matched.trim();
                    } else if (matched.value_id) {
                      // Новый формат: используем value_id как значение селекта
                      currentValueForSelect = String(matched.value_id).trim();
                    } else if (matched.value) {
                      currentValueForSelect = String(matched.value).trim();
                    }
                  } else {
                    currentValueForSelect = '';
                  }
                } else if (normalizedCurrentValue && !isEnum) {
                  // Для не-enum полей просто используем сохраненное значение
                  currentValueForSelect = normalizedCurrentValue;
                }

                return (
                  <div key={key} className="custom-field-item">
                    <label>{fieldDef ? fieldDef.label : key}</label>
                    <div className="custom-field-input-group">
                      {isEnum ? (
                        <select
                          value={currentValueForSelect}
                          onChange={(e) => {
                            const selectedOptionValue = e.target.value;

                            if (!fieldDef || !fieldDef.allowed_values) {
                              onChangeValue(key, selectedOptionValue);
                              return;
                            }

                            // Находим выбранный объект в allowed_values.
                            // Значение селекта — это либо value_id (новый формат), либо текст (старый формат).
                            const selectedValueObj = fieldDef.allowed_values.find(v => {
                              if (!v) return false;
                              if (typeof v === 'string') {
                                return selectedOptionValue === v.trim();
                              }
                              const valStr = v.value ? String(v.value).trim() : '';
                              const idStr = v.value_id ? String(v.value_id).trim() : '';
                              return (
                                selectedOptionValue === idStr ||
                                selectedOptionValue === valStr
                              );
                            });

                            // Что сохраняем в custom_fields:
                            // - если есть value_id, сохраняем именно его (ID), чтобы однозначно
                            //   восстанавливать выбор;
                            // - иначе сохраняем текстовое значение.
                            let mainValueToStore = selectedOptionValue;
                            if (selectedValueObj && typeof selectedValueObj === 'object') {
                              if (selectedValueObj.value_id) {
                                mainValueToStore = String(selectedValueObj.value_id).trim();
                              } else if (selectedValueObj.value) {
                                mainValueToStore = String(selectedValueObj.value).trim();
                              }
                            }

                            onChangeValue(key, mainValueToStore);

                            // Дополнительно: если у выбранного значения есть привязанные кастомные поля,
                            // автоматически проставляем их как ОТДЕЛЬНЫЕ поля должности.
                            // Это даёт мгновенный визуальный эффект автопроставления,
                            // который уже делает бэкенд при сохранении.
                            if (
                              selectedValueObj &&
                              typeof selectedValueObj === 'object' &&
                              Array.isArray(selectedValueObj.linked_custom_fields)
                            ) {
                              selectedValueObj.linked_custom_fields.forEach(linkedField => {
                                if (!linkedField) return;

                                // Определяем ключ прилинкованного поля:
                                // сперва из linked_custom_field_key, при его отсутствии пытаемся найти
                                // определение по ID в списке availableCustomFields.
                                let linkedFieldKey = linkedField.linked_custom_field_key;
                                if (!linkedFieldKey && linkedField.linked_custom_field_id) {
                                  const def = availableCustomFields.find(
                                    f => String(f.id).trim() === String(linkedField.linked_custom_field_id).trim()
                                  );
                                  if (def) {
                                    linkedFieldKey = def.key;
                                  }
                                }

                                if (!linkedFieldKey) return;

                                // Берём первое значение из linked_custom_field_values (на практике оно одно).
                                if (
                                  Array.isArray(linkedField.linked_custom_field_values) &&
                                  linkedField.linked_custom_field_values.length > 0
                                ) {
                                  const firstLinkedValue = linkedField.linked_custom_field_values[0];
                                  const rawLinkedId = firstLinkedValue?.linked_custom_field_value_id;
                                  const rawLinkedValue = firstLinkedValue?.linked_custom_field_value;

                                  let linkedValueToStore = '';
                                  if (rawLinkedId) {
                                    linkedValueToStore = String(rawLinkedId).trim();
                                  } else if (rawLinkedValue) {
                                    linkedValueToStore = String(rawLinkedValue).trim();
                                  }

                                  if (linkedValueToStore) {
                                    onChangeValue(linkedFieldKey, linkedValueToStore);
                                  }
                                }
                              });
                            }
                          }}
                        >
                          <option value="">Выберите значение...</option>
                          {fieldDef.allowed_values.map((val, idx) => {
                            // Поддержка нового формата (объект с value) и старого (строка)
                            const valueStr = typeof val === 'string' ? val.trim() : String(val.value || '').trim();
                            const valueId = typeof val === 'object' && val.value_id
                              ? String(val.value_id).trim()
                              : null;
                            // Уникальное значение option: в приоритете используем value_id,
                            // иначе — текстовое значение.
                            const optionValue = valueId || valueStr;

                            const hasLinked = typeof val === 'object' && val.linked_custom_fields && val.linked_custom_fields.length > 0;
                            // Собираем все привязанные значения в один массив для отображения
                            const linkedValues = hasLinked 
                              ? val.linked_custom_fields.flatMap(lf => 
                                  lf.linked_custom_field_values.map(lv => String(lv.linked_custom_field_value || '').trim())
                                )
                              : [];
                            
                            // Текст опции: "Main (Linked1, Linked2)", но value — только основное значение
                            const fullLabel = linkedValues.length > 0
                              ? `${valueStr} (${linkedValues.join(', ')})`
                              : valueStr;
                            
                            return (
                              <option key={`${key}-${optionValue}-${idx}`} value={optionValue}>
                                {fullLabel}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={value || ''}
                          onChange={(e) => onChangeValue(key, e.target.value)}
                        />
                      )}
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => onRemoveField(key)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="add-custom-field">
            <div className="add-custom-field-label">
              <span className="step-number">1</span>
              <span>Выберите поле, которое хотите добавить к должности</span>
            </div>
            <select
              value={newCustomFieldKey}
              onChange={(e) => onChangeNewCustomFieldKey(e.target.value)}
            >
              <option value="">
                {availableCustomFields.filter(f => !customFieldsValues.hasOwnProperty(f.key)).length === 0
                  ? 'Нет доступных полей для добавления'
                  : 'Выберите поле для добавления...'}
              </option>
              {availableCustomFields
                .filter(f => !customFieldsValues.hasOwnProperty(f.key))
                .map(field => (
                  <option key={field.id} value={field.key}>
                    {field.label}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btn-small"
              onClick={onAddField}
              disabled={!newCustomFieldKey}
            >
              Добавить поле
            </button>
            <div className="add-custom-field-help">
              <span className="step-number">2</span>
              <span>После добавления выберите значение для поля выше.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PositionCustomFieldsModal;


