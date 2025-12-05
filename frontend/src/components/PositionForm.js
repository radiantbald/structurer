import React, { useState, useEffect, useRef } from 'react';
import './PositionForm.css';
import PositionCustomFieldsModal from './PositionCustomFieldsModal';
import pencilIcon from '../assets/images/pencil.png';

function PositionForm({
  position,
  customFields,
  customFieldsArray,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete
}) {
  const [formData, setFormData] = useState({
    name: '',
    custom_fields: {},
    employee_last_name: '',
    employee_first_name: '',
    employee_middle_name: '',
    employee_external_id: '',
    employee_profile_url: ''
  });

  // Функция для парсинга полного ФИО на отдельные части
  const parseFullName = (fullName) => {
    if (!fullName || !fullName.trim()) {
      return { last: '', first: '', middle: '' };
    }
    const parts = fullName.trim().split(/\s+/);
    return {
      last: parts[0] || '',
      first: parts[1] || '',
      middle: parts.slice(2).join(' ') || ''
    };
  };

  // Функция для объединения отдельных частей в полное ФИО
  const combineFullName = (last, first, middle) => {
    const parts = [last, first, middle].filter(part => part && part.trim());
    return parts.join(' ') || '';
  };

  const [availableCustomFields, setAvailableCustomFields] = useState([]);
  const [newCustomFieldKey, setNewCustomFieldKey] = useState('');
  const [showCustomFieldsEditor, setShowCustomFieldsEditor] = useState(false);
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (position) {
      const nameParts = parseFullName(position.employee_full_name || '');
      setFormData({
        name: position.name || '',
        custom_fields: position.custom_fields || {},
        employee_last_name: nameParts.last,
        employee_first_name: nameParts.first,
        employee_middle_name: nameParts.middle,
        employee_external_id: position.employee_external_id || '',
        employee_profile_url: position.employee_profile_url || ''
      });
    } else {
      setFormData({
        name: '',
        custom_fields: {},
        employee_last_name: '',
        employee_first_name: '',
        employee_middle_name: '',
        employee_external_id: '',
        employee_profile_url: ''
      });
    }
  }, [position]);

  useEffect(() => {
    // Гарантируем, что availableCustomFields всегда массив,
    // даже если с бэка или пропов пришёл null/undefined
    setAvailableCustomFields(Array.isArray(customFields) ? customFields : []);
  }, [customFields]);

  // Преобразует сохранённое значение кастомного поля (которое теперь может быть value_id)
  // в человекочитаемое название на основе allowed_values из определения поля.
  const getDisplayValueForCustomField = (fieldKey, storedValue) => {
    if (storedValue === undefined || storedValue === null) return '';

    const raw = String(storedValue).trim();
    if (!raw) return '';

    const fieldDef = Array.isArray(availableCustomFields)
      ? availableCustomFields.find(f => f.key === fieldKey)
      : null;

    if (!fieldDef || !Array.isArray(fieldDef.allowed_values)) {
      return raw;
    }

    const matched = fieldDef.allowed_values.find(av => {
      if (!av) return false;
      if (typeof av === 'string') {
        return raw === av.trim();
      }
      const valueStr = av.value ? String(av.value).trim() : '';
      const idStr = av.value_id ? String(av.value_id).trim() : '';
      return raw === idStr || raw === valueStr;
    });

    if (!matched) {
      return raw;
    }

    if (typeof matched === 'string') {
      return matched.trim();
    }

    return matched.value ? String(matched.value).trim() : raw;
  };

  const adjustTextareaHeight = (textarea) => {
    if (!textarea) return;
    
    // Проверяем, есть ли явные переносы строк в тексте
    const hasExplicitLineBreaks = textarea.value.includes('\n');
    
    // Сбрасываем высоту для правильного расчета
    textarea.style.height = 'auto';
    textarea.style.minHeight = '0';
    textarea.style.maxHeight = 'none';
    
    // Используем requestAnimationFrame для правильного расчета после рендера
    requestAnimationFrame(() => {
      const computedStyle = getComputedStyle(textarea);
      const fontSize = parseFloat(computedStyle.fontSize);
      const lineHeightValue = computedStyle.lineHeight;
      const width = textarea.offsetWidth;
      
      // Правильно вычисляем высоту одной строки
      let singleLineHeight;
      if (lineHeightValue === 'normal') {
        // Если line-height: normal, используем стандартный множитель 1.2
        singleLineHeight = fontSize * 1.2;
      } else {
        // Парсим line-height
        const parsedLineHeight = parseFloat(lineHeightValue);
        
        if (lineHeightValue.includes('px')) {
          // Если в px, используем как есть
          singleLineHeight = parsedLineHeight;
        } else if (lineHeightValue.includes('em') || lineHeightValue.includes('rem')) {
          // Если в em/rem, умножаем на fontSize
          singleLineHeight = parsedLineHeight * fontSize;
        } else {
          // Если без единиц (например, "1.4"), умножаем на fontSize
          singleLineHeight = parsedLineHeight * fontSize;
        }
      }
      
      // Создаем временный элемент для точного измерения высоты текста
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.height = 'auto';
      tempDiv.style.width = `${width}px`;
      tempDiv.style.fontSize = computedStyle.fontSize;
      tempDiv.style.fontFamily = computedStyle.fontFamily;
      tempDiv.style.fontWeight = computedStyle.fontWeight;
      tempDiv.style.lineHeight = computedStyle.lineHeight;
      tempDiv.style.wordBreak = computedStyle.wordBreak;
      tempDiv.style.overflowWrap = computedStyle.overflowWrap;
      tempDiv.style.whiteSpace = computedStyle.whiteSpace;
      tempDiv.style.padding = '0';
      tempDiv.style.margin = '0';
      tempDiv.style.border = 'none';
      tempDiv.textContent = textarea.value || ' ';
      
      document.body.appendChild(tempDiv);
      const textHeight = tempDiv.offsetHeight;
      document.body.removeChild(tempDiv);
      
      // Получаем scrollHeight при height: auto для сравнения
      const scrollHeight = textarea.scrollHeight;
      
      // Используем минимальное значение из двух измерений для более точного результата
      const actualHeight = Math.min(textHeight, scrollHeight);
      
      // Проверяем, помещается ли содержимое в одну строку
      // Используем погрешность в 2px для учета округлений
      const tolerance = 2;
      const fitsInOneLine = !hasExplicitLineBreaks && actualHeight <= singleLineHeight + tolerance;
      
      if (fitsInOneLine) {
        // Содержимое помещается в одну строку - устанавливаем высоту ровно в одну строку
        textarea.style.setProperty('height', `${singleLineHeight}px`, 'important');
        textarea.style.setProperty('min-height', '0', 'important');
        textarea.style.setProperty('max-height', `${singleLineHeight}px`, 'important');
      } else {
        // Содержимое не помещается в одну строку - устанавливаем высоту по содержимому (максимум 2 строки)
        const maxHeight = singleLineHeight * 2;
        const newHeight = Math.min(scrollHeight, maxHeight);
        
        textarea.style.setProperty('height', `${newHeight}px`, 'important');
        textarea.style.setProperty('min-height', '0', 'important');
        textarea.style.setProperty('max-height', `${maxHeight}px`, 'important');
      }
    });
  };

  useEffect(() => {
    // Устанавливаем высоту textarea при изменении formData.name или при монтировании
    if (isEditing && titleInputRef.current) {
      adjustTextareaHeight(titleInputRef.current);
    }
  }, [formData.name, isEditing]);

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCustomFieldChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      custom_fields: {
        ...prev.custom_fields,
        [key]: value
      }
    }));
  };

  const handleRemoveCustomField = (key) => {
    setFormData(prev => {
      const newCustomFields = { ...prev.custom_fields };
      delete newCustomFields[key];
      return {
        ...prev,
        custom_fields: newCustomFields
      };
    });
  };

  const handleAddCustomField = () => {
    if (newCustomFieldKey) {
      const field = availableCustomFields.find(f => f.key === newCustomFieldKey);
      if (field) {
        handleCustomFieldChange(newCustomFieldKey, '');
        setNewCustomFieldKey('');
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Объединяем отдельные поля ФИО в одно поле для отправки на сервер
    const dataToSave = {
      ...formData,
      employee_full_name: combineFullName(
        formData.employee_last_name,
        formData.employee_first_name,
        formData.employee_middle_name
      )
    };
    // Удаляем временные поля перед отправкой
    delete dataToSave.employee_last_name;
    delete dataToSave.employee_first_name;
    delete dataToSave.employee_middle_name;
    onSave(dataToSave);
  };

  if (!isEditing) {
    return (
      <div className="position-form">
        <div className="position-form-header">
          <div className="position-form-header-content">
            <h2>
              {position && position.id && (
                <span className="position-id">#{position.id}</span>
              )}
              {formData.name}
            </h2>
            <div className="position-form-employee-name">
              {combineFullName(
                formData.employee_last_name,
                formData.employee_first_name,
                formData.employee_middle_name
              ) || (
                <span className="vacant-text">Вакант</span>
              )}
            </div>
          </div>
          <div className="position-form-actions">
            <button className="btn btn-icon-ghost" onClick={onEdit} title="Редактировать">
              <img src={pencilIcon} alt="Редактировать" className="pencil-icon" />
            </button>
          </div>
        </div>

        <div className="position-form-section">
          <h3>Сотрудник</h3>
          <div className="form-field">
            <label>Внешний ID:</label>
            <p>{formData.employee_external_id || <em>Не указано</em>}</p>
          </div>
          <div className="form-field">
            <label>Ссылка на профиль:</label>
            {formData.employee_profile_url ? (
              <a href={formData.employee_profile_url} target="_blank" rel="noopener noreferrer">
                {formData.employee_profile_url}
              </a>
            ) : (
              <em>Не указано</em>
            )}
          </div>
        </div>

        {Object.keys(formData.custom_fields).length > 0 && (
          <div className="position-form-section position-form-section-custom-fields">
            <div className="position-form-section-divider"></div>
            <div className="custom-fields-chips">
              {Object.entries(formData.custom_fields).map(([key, value]) => {
                const fieldDef = Array.isArray(availableCustomFields)
                  ? availableCustomFields.find(f => f.key === key)
                  : null;
                // Базовое отображаемое значение (с учётом того, что в состоянии может храниться value_id)
                let displayValue = getDisplayValueForCustomField(key, value);
                
                // If we have the array format, find linked values for this field
                if (Array.isArray(customFieldsArray)) {
                  const fieldItem = customFieldsArray.find(item => item.custom_field_key === key);
                  if (fieldItem) {
                    // Используем значение из массива позиции (custom_field_value),
                    // чтобы гарантировать соответствие тому, что вернул бэкенд.
                    const mainFromArray = fieldItem.custom_field_value
                      ? String(fieldItem.custom_field_value).trim()
                      : '';
                    if (mainFromArray) {
                      displayValue = mainFromArray;
                    }
                    
                    // Добавляем привязанные значения, если они есть
                    if (fieldItem.linked_custom_fields && Array.isArray(fieldItem.linked_custom_fields)) {
                      const linkedValues = [];
                      fieldItem.linked_custom_fields.forEach(linkedField => {
                        if (linkedField.linked_custom_field_values && Array.isArray(linkedField.linked_custom_field_values)) {
                          linkedField.linked_custom_field_values.forEach(linkedVal => {
                            if (linkedVal && linkedVal.linked_custom_field_value) {
                              linkedValues.push(String(linkedVal.linked_custom_field_value).trim());
                            }
                          });
                        }
                      });
                      if (linkedValues.length > 0) {
                        displayValue = `${displayValue} - ${linkedValues.join(' - ')}`;
                      }
                    }
                  }
                }
                
                return (
                  <span key={key} className="custom-field-chip">
                    <span className="custom-field-chip-label">{fieldDef ? fieldDef.label : key}:</span>
                    <span className="custom-field-chip-value">{displayValue}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="position-form" onSubmit={handleSubmit}>
      <div className="position-form-header">
        <div className="position-form-header-content">
          <textarea
            ref={titleInputRef}
            className="position-form-title-input"
            value={formData.name}
            onChange={(e) => {
              handleChange('name', e.target.value);
              adjustTextareaHeight(e.target);
            }}
            onInput={(e) => {
              adjustTextareaHeight(e.target);
            }}
            placeholder={position && position.id ? 'Должность' : 'Новая должность'}
            required
            wrap="soft"
          />
          <div className="position-form-employee-name-input">
            <div className="employee-name-fields">
              <input
                type="text"
                className="position-form-employee-name-field"
                value={formData.employee_last_name}
                onChange={(e) => handleChange('employee_last_name', e.target.value)}
                placeholder="Фамилия"
              />
              <input
                type="text"
                className="position-form-employee-name-field"
                value={formData.employee_first_name}
                onChange={(e) => handleChange('employee_first_name', e.target.value)}
                placeholder="Имя"
              />
              <input
                type="text"
                className="position-form-employee-name-field"
                value={formData.employee_middle_name}
                onChange={(e) => handleChange('employee_middle_name', e.target.value)}
                placeholder="Отчество"
              />
            </div>
          </div>
        </div>
        <div className="position-form-actions position-form-actions-vertical">
          <button type="button" className="btn btn-icon-ghost" onClick={onCancel} title="Отмена">
            <svg className="icon-cross" width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button type="submit" className="btn btn-icon-ghost" title="Сохранить">
            <svg className="icon-save" width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="position-form-section">
        <h3>Сотрудник</h3>

        <div className="form-field">
          <label>Внешний ID</label>
          <input
            type="text"
            value={formData.employee_external_id}
            onChange={(e) => handleChange('employee_external_id', e.target.value)}
          />
        </div>

        <div className="form-field">
          <label>Ссылка на профиль</label>
          <input
            type="url"
            value={formData.employee_profile_url}
            onChange={(e) => handleChange('employee_profile_url', e.target.value)}
          />
        </div>
      </div>

      <div className="position-form-section position-form-section-custom-fields">
        <div className="position-form-section-divider"></div>
        <div className="custom-fields-section-header">
          <button
            type="button"
            className="btn btn-small btn-secondary custom-fields-edit-btn"
            onClick={() => setShowCustomFieldsEditor(true)}
          >
            {Object.keys(formData.custom_fields).length > 0 ? 'Изменить' : 'Добавить'} поля
          </button>
        </div>
        {Object.keys(formData.custom_fields).length > 0 && (
          <div className="custom-fields-chips">
            {(() => {
              // Сначала определяем, какие поля являются linked полями для других полей
              // чтобы не показывать их отдельно, а только через тире в основном поле
              const linkedFieldKeys = new Set();
              const fieldsToDisplay = [];

              // Проходим по всем полям и определяем, какие являются linked
              Object.entries(formData.custom_fields).forEach(([key, value]) => {
                const fieldDef = Array.isArray(availableCustomFields)
                  ? availableCustomFields.find(f => f.key === key)
                  : null;

                if (!fieldDef || !Array.isArray(fieldDef.allowed_values)) {
                  // Не enum поле - показываем как есть
                  fieldsToDisplay.push({ key, value, fieldDef });
                  return;
                }

                const raw = value !== undefined && value !== null ? String(value).trim() : '';
                if (!raw) {
                  fieldsToDisplay.push({ key, value, fieldDef });
                  return;
                }

                // Находим выбранное значение в allowed_values по ID или тексту
                const matchedMain = fieldDef.allowed_values.find(av => {
                  if (!av) return false;
                  if (typeof av === 'string') {
                    return raw === av.trim();
                  }
                  const valueStr = av.value ? String(av.value).trim() : '';
                  const idStr = av.value_id ? String(av.value_id).trim() : '';
                  return raw === idStr || raw === valueStr;
                });

                // Проверяем, является ли это поле linked полем для другого поля
                let isLinkedField = false;
                // Проверяем, не является ли оно само linked полем для другого
                Object.entries(formData.custom_fields).forEach(([otherKey, otherValue]) => {
                  if (otherKey === key || linkedFieldKeys.has(key)) return;
                  const otherFieldDef = Array.isArray(availableCustomFields)
                    ? availableCustomFields.find(f => f.key === otherKey)
                    : null;
                  if (!otherFieldDef || !Array.isArray(otherFieldDef.allowed_values)) return;

                  const otherRaw = otherValue !== undefined && otherValue !== null ? String(otherValue).trim() : '';
                  if (!otherRaw) return;

                  const otherMatched = otherFieldDef.allowed_values.find(av => {
                    if (!av) return false;
                    if (typeof av === 'string') {
                      return otherRaw === av.trim();
                    }
                    const valueStr = av.value ? String(av.value).trim() : '';
                    const idStr = av.value_id ? String(av.value_id).trim() : '';
                    return otherRaw === idStr || otherRaw === valueStr;
                  });

                  if (otherMatched && typeof otherMatched === 'object' && Array.isArray(otherMatched.linked_custom_fields)) {
                    // Проверяем, является ли текущее поле linked полем для otherMatched
                    otherMatched.linked_custom_fields.forEach(linkedField => {
                      const linkedFieldKey = linkedField.linked_custom_field_key;
                      if (linkedFieldKey === key) {
                        isLinkedField = true;
                        linkedFieldKeys.add(key);
                      }
                    });
                  }
                });

                if (!isLinkedField) {
                  fieldsToDisplay.push({ key, value, fieldDef, matchedMain });
                }
              });

              // Теперь отображаем поля, добавляя linked значения через тире
              return fieldsToDisplay.map(({ key, value, fieldDef, matchedMain }) => {
                // Базовое отображаемое значение (с учётом того, что в состоянии может храниться value_id)
                let displayValue = getDisplayValueForCustomField(key, value);
                
                // Добавляем к основному значению привязанные значения из определения поля
                if (fieldDef && Array.isArray(fieldDef.allowed_values)) {
                  const raw = value !== undefined && value !== null ? String(value).trim() : '';

                  if (raw) {
                    // Используем matchedMain, если он уже найден, иначе ищем заново
                    let mainValue = matchedMain;
                    if (!mainValue) {
                      mainValue = fieldDef.allowed_values.find(av => {
                        if (!av) return false;
                        if (typeof av === 'string') {
                          return raw === av.trim();
                        }
                        const valueStr = av.value ? String(av.value).trim() : '';
                        const idStr = av.value_id ? String(av.value_id).trim() : '';
                        return raw === idStr || raw === valueStr;
                      });
                    }

                    if (mainValue && typeof mainValue === 'object' && Array.isArray(mainValue.linked_custom_fields)) {
                      const linkedDisplayValues = [];

                      mainValue.linked_custom_fields.forEach(linkedField => {
                        const linkedFieldKey = linkedField.linked_custom_field_key;
                        // Проверяем, есть ли это linked поле в formData.custom_fields
                        const linkedFieldValue = formData.custom_fields[linkedFieldKey];
                        if (linkedFieldValue !== undefined && linkedFieldValue !== null) {
                          // Получаем отображаемое значение для linked поля
                          const linkedDisplayValue = getDisplayValueForCustomField(linkedFieldKey, linkedFieldValue);
                          if (linkedDisplayValue) {
                            linkedDisplayValues.push(linkedDisplayValue);
                          }
                        } else if (Array.isArray(linkedField.linked_custom_field_values)) {
                          // Если linked поле не выбрано в formData, используем значения из определения
                          linkedField.linked_custom_field_values.forEach(linkedVal => {
                            const txt = linkedVal && linkedVal.linked_custom_field_value
                              ? String(linkedVal.linked_custom_field_value).trim()
                              : '';
                            if (txt) {
                              linkedDisplayValues.push(txt);
                            }
                          });
                        }
                      });

                      if (linkedDisplayValues.length > 0) {
                        displayValue = `${displayValue} - ${linkedDisplayValues.join(' - ')}`;
                      }
                    }
                  }
                }

                return (
                  <span key={key} className="custom-field-chip">
                    <span className="custom-field-chip-label">{fieldDef ? fieldDef.label : key}:</span>
                    <span className="custom-field-chip-value">{displayValue}</span>
                  </span>
                );
              });
            })()}
          </div>
        )}
      </div>

      {position && position.id && (
        <div className="position-form-footer">
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
          >
            Удалить должность
          </button>
        </div>
      )}

      {showCustomFieldsEditor && (
        <PositionCustomFieldsModal
          onClose={() => setShowCustomFieldsEditor(false)}
          customFieldsValues={formData.custom_fields || {}}
          availableCustomFields={availableCustomFields}
          newCustomFieldKey={newCustomFieldKey}
          onChangeNewCustomFieldKey={setNewCustomFieldKey}
          onChangeValue={handleCustomFieldChange}
          onRemoveField={handleRemoveCustomField}
          onAddField={handleAddCustomField}
        />
      )}
    </form>
  );
}

export default PositionForm;

