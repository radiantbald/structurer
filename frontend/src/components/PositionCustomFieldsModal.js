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
                          onChange={(e) => onChangeValue(key, e.target.value)}
                        >
                          <option value="">Выберите значение...</option>
                          {fieldDef.allowed_values.map((val, idx) => (
                            <option key={idx} value={String(val)}>
                              {String(val)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={fieldDef?.type === 'number' ? 'number' : 'text'}
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


