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
                return (
                  <div key={key} className="custom-field-item">
                    <label>{fieldDef ? fieldDef.label : key}</label>
                    <div className="custom-field-input-group">
                      {isEnum ? (
                        <select
                          value={value || ''}
                          onChange={(e) => {
                            const selectedValue = e.target.value;
                            onChangeValue(key, selectedValue);
                            
                            // Если выбрано значение с привязанными полями, автоматически добавляем их
                            if (selectedValue) {
                              const selectedValObj = fieldDef.allowed_values.find(v => {
                                const valStr = typeof v === 'string' ? v : (v.value || String(v));
                                return valStr === selectedValue;
                              });
                              
                              if (selectedValObj && typeof selectedValObj === 'object' && selectedValObj.linked_custom_fields) {
                                // Автоматически добавляем привязанные значения
                                selectedValObj.linked_custom_fields.forEach(linkedField => {
                                  linkedField.linked_custom_field_values.forEach(linkedVal => {
                                    // Добавляем привязанное значение только если оно еще не установлено
                                    const linkedKey = linkedField.linked_custom_field_key;
                                    if (!customFieldsValues[linkedKey]) {
                                      onChangeValue(linkedKey, linkedVal.linked_custom_field_value);
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
                            const valueStr = typeof val === 'string' ? val : (val.value || String(val));
                            const hasLinked = typeof val === 'object' && val.linked_custom_fields && val.linked_custom_fields.length > 0;
                            // Собираем все привязанные значения в один массив
                            const linkedValues = hasLinked 
                              ? val.linked_custom_fields.flatMap(lf => 
                                  lf.linked_custom_field_values.map(lv => lv.linked_custom_field_value)
                                )
                              : [];
                            const linkedInfo = linkedValues.length > 0 
                              ? ` (${linkedValues.join(', ')})`
                              : '';
                            return (
                              <option key={idx} value={valueStr}>
                                {valueStr}{linkedInfo}
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


