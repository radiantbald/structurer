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
                
                // Находим текущее выбранное значение среди allowed_values
                // Учитываем, что значение могло быть установлено через прилинкованное поле
                let currentValueForSelect = '';
                if (isEnum && normalizedCurrentValue) {
                  // Нормализуем все значения из allowed_values для сравнения
                  const normalizedAllowedValues = fieldDef.allowed_values.map(v => ({
                    original: v,
                    normalized: typeof v === 'string' ? v.trim() : String(v.value || '').trim(),
                    valueId: typeof v === 'object' && v.value_id ? String(v.value_id).trim() : null
                  }));
                  
                  // Сначала пытаемся найти точное совпадение по значению
                  let matched = normalizedAllowedValues.find(nv => 
                    nv.normalized === normalizedCurrentValue
                  );
                  
                  // Если не нашли, пытаемся найти по value_id
                  if (!matched) {
                    matched = normalizedAllowedValues.find(nv => 
                      nv.valueId && nv.valueId === normalizedCurrentValue
                    );
                  }
                  
                  // Если нашли совпадение, используем нормализованное значение из allowed_values
                  if (matched) {
                    currentValueForSelect = matched.normalized;
                  } else {
                    // Если не нашли в allowed_values, но значение есть - возможно, это прилинкованное значение
                    // Используем сохраненное значение, чтобы оно отобразилось (даже если не в списке)
                    currentValueForSelect = normalizedCurrentValue;
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
                            const normalizedValue = selectedValue.trim();
                            onChangeValue(key, normalizedValue);
                            
                            // Если выбрано значение с привязанными полями, автоматически добавляем их
                            if (normalizedValue) {
                              const selectedValObj = fieldDef.allowed_values.find(v => {
                                const valStr = typeof v === 'string' ? v.trim() : String(v.value || '').trim();
                                return valStr === normalizedValue;
                              });
                              
                              if (selectedValObj && typeof selectedValObj === 'object' && selectedValObj.linked_custom_fields) {
                                // Автоматически добавляем привязанные значения
                                selectedValObj.linked_custom_fields.forEach(linkedField => {
                                  linkedField.linked_custom_field_values.forEach(linkedVal => {
                                    // Добавляем привязанное значение только если оно еще не установлено
                                    const linkedKey = linkedField.linked_custom_field_key;
                                    if (!customFieldsValues[linkedKey]) {
                                      onChangeValue(linkedKey, String(linkedVal.linked_custom_field_value || '').trim());
                                    }
                                  });
                                });
                              }
                            }
                          }}
                        >
                          <option value="">Выберите значение...</option>
                          {fieldDef.allowed_values.map((val, idx) => {
                            // Поддержка нового формата (объект с value) и старого (строка)
                            const valueStr = typeof val === 'string' ? val.trim() : String(val.value || '').trim();
                            const hasLinked = typeof val === 'object' && val.linked_custom_fields && val.linked_custom_fields.length > 0;
                            // Собираем все привязанные значения в один массив
                            const linkedValues = hasLinked 
                              ? val.linked_custom_fields.flatMap(lf => 
                                  lf.linked_custom_field_values.map(lv => String(lv.linked_custom_field_value || '').trim())
                                )
                              : [];
                            const linkedInfo = linkedValues.length > 0 
                              ? ` (${linkedValues.join(', ')})`
                              : '';
                            return (
                              <option key={`${key}-${valueStr}-${idx}`} value={valueStr}>
                                {valueStr}{linkedInfo}
                              </option>
                            );
                          })}
                          {/* Добавляем опцию для текущего значения, если оно не найдено в allowed_values 
                              (например, установлено через прилинкованное поле) */}
                          {normalizedCurrentValue && currentValueForSelect === normalizedCurrentValue && 
                           !fieldDef.allowed_values.some(v => {
                             const valStr = typeof v === 'string' ? v.trim() : String(v.value || '').trim();
                             return valStr === normalizedCurrentValue;
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


