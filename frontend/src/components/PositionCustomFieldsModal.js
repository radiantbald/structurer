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
                
                // Извлекаем основную часть значения (до первого тире, если есть)
                // Это нужно для случаев, когда значение было сохранено как "Value1 - LinkedValue1"
                const extractMainValue = (val) => {
                  if (!val) return '';
                  const trimmed = val.trim();
                  // Если есть тире, берем часть до первого тире
                  const dashIndex = trimmed.indexOf(' - ');
                  return dashIndex >= 0 ? trimmed.substring(0, dashIndex).trim() : trimmed;
                };
                
                const mainValue = extractMainValue(normalizedCurrentValue);
                
                // Находим текущее выбранное значение среди опций селектора
                // Опции теперь содержат полное значение с тире (если есть привязанные поля)
                let currentValueForSelect = '';
                
                if (isEnum) {
                  if (normalizedCurrentValue) {
                    // Создаем карту полных значений (с тире) для поиска
                    const fullValueMap = new Map();
                    
                    // Строим полные значения для каждой опции
                    fieldDef.allowed_values.forEach((val) => {
                      const valueStr = typeof val === 'string' ? val.trim() : String(val.value || '').trim();
                      const hasLinked = typeof val === 'object' && val.linked_custom_fields && val.linked_custom_fields.length > 0;
                      const linkedValues = hasLinked 
                        ? val.linked_custom_fields.flatMap(lf => 
                            lf.linked_custom_field_values.map(lv => String(lv.linked_custom_field_value || '').trim())
                          )
                        : [];
                      
                      // Формируем полное значение с тире (как в опциях)
                      const fullValue = linkedValues.length > 0
                        ? `${valueStr} - ${linkedValues.join(' - ')}`
                        : valueStr;
                      
                      fullValueMap.set(fullValue, fullValue);
                      // Также добавляем основное значение для обратной совместимости
                      fullValueMap.set(valueStr, fullValue);
                      
                      // Также добавляем value_id как ключ, если есть
                      if (typeof val === 'object' && val.value_id) {
                        const valueIdStr = String(val.value_id).trim();
                        fullValueMap.set(valueIdStr, fullValue);
                      }
                    });
                    
                    // Пытаемся найти полное значение в карте
                    if (fullValueMap.has(normalizedCurrentValue)) {
                      currentValueForSelect = fullValueMap.get(normalizedCurrentValue);
                    } else {
                      // Если не нашли точное совпадение, пробуем найти без учета регистра
                      let found = false;
                      for (const [mapKey, mapVal] of fullValueMap.entries()) {
                        if (mapKey.toLowerCase() === normalizedCurrentValue.toLowerCase()) {
                          currentValueForSelect = mapVal;
                          found = true;
                          break;
                        }
                      }
                      
                      // Если не нашли, используем сохраненное значение как есть
                      // Оно будет добавлено как опция ниже (для обратной совместимости)
                      if (!found) {
                        currentValueForSelect = normalizedCurrentValue;
                      }
                    }
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
                            const selectedValue = e.target.value;
                            // Нормализуем выбранное значение
                            // Значение уже содержит тире, если есть привязанные поля (из value атрибута опции)
                            const normalizedValue = selectedValue.trim();
                            
                            // Сохраняем значение (оно уже содержит тире, если есть привязанные поля)
                            onChangeValue(key, normalizedValue);
                          }}
                        >
                          <option value="">Выберите значение...</option>
                          {fieldDef.allowed_values.map((val, idx) => {
                            // Поддержка нового формата (объект с value) и старого (строка)
                            // Нормализуем точно так же, как при поиске значения
                            const valueStr = typeof val === 'string' ? val.trim() : String(val.value || '').trim();
                            const hasLinked = typeof val === 'object' && val.linked_custom_fields && val.linked_custom_fields.length > 0;
                            // Собираем все привязанные значения в один массив
                            const linkedValues = hasLinked 
                              ? val.linked_custom_fields.flatMap(lf => 
                                  lf.linked_custom_field_values.map(lv => String(lv.linked_custom_field_value || '').trim())
                                )
                              : [];
                            
                            // Формируем полное значение с тире для сохранения
                            const fullValue = linkedValues.length > 0
                              ? `${valueStr} - ${linkedValues.join(' - ')}`
                              : valueStr;
                            
                            // Используем полное значение с тире в value атрибуте опции
                            return (
                              <option key={`${key}-${valueStr}-${idx}`} value={fullValue}>
                                {fullValue}
                              </option>
                            );
                          })}
                          {/* Добавляем опцию для текущего значения, если оно не найдено в allowed_values 
                              (например, установлено через прилинкованное поле, но не совпадает точно с опциями) */}
                          {normalizedCurrentValue && 
                           !fieldDef.allowed_values.some(v => {
                             const valStr = typeof v === 'string' ? v.trim() : String(v.value || '').trim();
                             const valId = typeof v === 'object' && v.value_id ? String(v.value_id).trim() : '';
                             const hasLinked = typeof v === 'object' && v.linked_custom_fields && v.linked_custom_fields.length > 0;
                             const linkedValues = hasLinked 
                               ? v.linked_custom_fields.flatMap(lf => 
                                   lf.linked_custom_field_values.map(lv => String(lv.linked_custom_field_value || '').trim())
                                 )
                               : [];
                             const fullValue = linkedValues.length > 0
                               ? `${valStr} - ${linkedValues.join(' - ')}`
                               : valStr;
                             return valStr === mainValue || valId === mainValue || fullValue === normalizedCurrentValue;
                           }) && (
                            <option key={`${key}-linked-${normalizedCurrentValue}`} value={normalizedCurrentValue}>
                              {normalizedCurrentValue}
                            </option>
                          )}
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


