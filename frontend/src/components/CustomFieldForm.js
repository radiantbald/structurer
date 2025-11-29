import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CustomFieldForm.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';

function CustomFieldForm({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    key: '',
    label: '',
    allowed_values: []
  });
  const [currentValueInput, setCurrentValueInput] = useState('');
  const [currentValueLinkedFields, setCurrentValueLinkedFields] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingFields, setExistingFields] = useState([]);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingError, setExistingError] = useState('');
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [deletingFieldId, setDeletingFieldId] = useState(null);
  
  // Состояния для выпадающих списков привязки
  const [showFieldDropdown, setShowFieldDropdown] = useState(false);
  const [showValueDropdown, setShowValueDropdown] = useState(false);
  const [selectedFieldForLink, setSelectedFieldForLink] = useState(null);
  const [selectedValueForLink, setSelectedValueForLink] = useState(null);

  useEffect(() => {
    const loadExistingFields = async () => {
      setExistingLoading(true);
      setExistingError('');
      try {
        const response = await axios.get(`${API_BASE}/custom-fields`);
        setExistingFields(response.data || []);
      } catch (err) {
        setExistingError('Не удалось загрузить список кастомных полей');
      } finally {
        setExistingLoading(false);
      }
    };

    loadExistingFields();
  }, []);

  const reloadExistingFields = async () => {
    setExistingLoading(true);
    setExistingError('');
    try {
      const response = await axios.get(`${API_BASE}/custom-fields`);
      setExistingFields(response.data || []);
    } catch (err) {
      setExistingError('Не удалось загрузить список кастомных полей');
    } finally {
      setExistingLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
  };

  const handleValueInputChange = (value) => {
    setCurrentValueInput(value);
  };

  const handleValueInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentValueInput.trim()) {
        handleAddValue();
      }
    }
  };

  const handleRemoveValue = (indexToRemove) => {
    setFormData(prev => ({
      ...prev,
      allowed_values: prev.allowed_values.filter((_, index) => index !== indexToRemove)
    }));
  };

  const handleAddValue = () => {
    if (!currentValueInput.trim()) return;

    const newValue = {
      value_id: null, // Будет сгенерирован на бэкенде
      value: currentValueInput.trim(),
      linked_custom_fields: currentValueLinkedFields.map(linked => ({
        linked_custom_field_id: linked.linked_custom_field_id,
        linked_custom_field_key: linked.linked_custom_field_key,
        linked_custom_field_label: linked.linked_custom_field_label,
        linked_custom_field_values: linked.linked_custom_field_values.map(val => ({
          linked_custom_field_value_id: val.linked_custom_field_value_id,
          linked_custom_field_value: val.linked_custom_field_value
        }))
      }))
    };

    setFormData(prev => ({
      ...prev,
      allowed_values: [...prev.allowed_values, newValue]
    }));

    setCurrentValueInput('');
    setCurrentValueLinkedFields([]);
  };

  const handleLinkFieldClick = () => {
    // Исключаем текущее редактируемое поле из списка доступных для привязки
    const availableFields = existingFields.filter(f => f.id !== editingFieldId);
    if (availableFields.length === 0) {
      alert('Нет доступных кастомных полей для привязки');
      return;
    }
    setShowFieldDropdown(true);
    setShowValueDropdown(false);
    setSelectedFieldForLink(null);
    setSelectedValueForLink(null);
  };

  const handleSelectFieldForLink = (field) => {
    setSelectedFieldForLink(field);
    setShowFieldDropdown(false);
    setShowValueDropdown(true);
  };

  const handleSelectValueForLink = (valueObj) => {
    if (!selectedFieldForLink) return;

    // Проверяем, не добавлено ли уже это поле
    const alreadyLinked = currentValueLinkedFields.find(
      linked => linked.linked_custom_field_id === selectedFieldForLink.id
    );

    if (alreadyLinked) {
      // Добавляем значение к существующей привязке
      const updatedLinkedFields = currentValueLinkedFields.map(linked => {
        if (linked.linked_custom_field_id === selectedFieldForLink.id) {
          // Проверяем, не добавлено ли уже это значение
          const valueExists = linked.linked_custom_field_values.find(
            v => v.linked_custom_field_value_id === valueObj.value_id
          );
          if (!valueExists) {
            return {
              ...linked,
              linked_custom_field_values: [
                ...linked.linked_custom_field_values,
                {
                  linked_custom_field_value_id: valueObj.value_id,
                  linked_custom_field_value: valueObj.value
                }
              ]
            };
          }
        }
        return linked;
      });
      setCurrentValueLinkedFields(updatedLinkedFields);
    } else {
      // Создаем новую привязку
      const newLinkedField = {
        linked_custom_field_id: selectedFieldForLink.id,
        linked_custom_field_key: selectedFieldForLink.key,
        linked_custom_field_label: selectedFieldForLink.label,
        linked_custom_field_values: [{
          linked_custom_field_value_id: valueObj.value_id,
          linked_custom_field_value: valueObj.value
        }]
      };
      setCurrentValueLinkedFields([...currentValueLinkedFields, newLinkedField]);
    }

    setShowValueDropdown(false);
    setSelectedFieldForLink(null);
    setSelectedValueForLink(null);
  };

  const handleRemoveLinkedField = (linkedFieldId) => {
    setCurrentValueLinkedFields(prev =>
      prev.filter(linked => linked.linked_custom_field_id !== linkedFieldId)
    );
  };

  const handleRemoveLinkedValue = (linkedFieldId, valueId) => {
    setCurrentValueLinkedFields(prev =>
      prev.map(linked => {
        if (linked.linked_custom_field_id === linkedFieldId) {
          const updatedValues = linked.linked_custom_field_values.filter(
            v => v.linked_custom_field_value_id !== valueId
          );
          if (updatedValues.length === 0) {
            return null; // Удаляем всю привязку, если не осталось значений
          }
          return {
            ...linked,
            linked_custom_field_values: updatedValues
          };
        }
        return linked;
      }).filter(Boolean)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Валидация
    if (!formData.key.trim()) {
      setError('Ключ поля обязателен');
      setLoading(false);
      return;
    }
    if (!formData.label.trim()) {
      setError('Название поля обязательно');
      setLoading(false);
      return;
    }

    if (!formData.allowed_values || formData.allowed_values.length === 0) {
      setError('Нужно указать хотя бы одно значение списка');
      setLoading(false);
      return;
    }

    let key = formData.key.trim();
    
    // При создании нормализуем ключ
    if (!editingFieldId) {
      key = key.toLowerCase().replace(/\s+/g, '_');
      key = key.replace(/[^a-z0-9_]/g, '');
      
      if (!key) {
        setError('Ключ должен содержать хотя бы одну латинскую букву или цифру');
        setLoading(false);
        return;
      }
      
      if (/^\d/.test(key)) {
        setError('Ключ не может начинаться с цифры');
        setLoading(false);
        return;
      }
    }

    const payload = {
      key: key,
      label: formData.label.trim(),
      allowed_values: formData.allowed_values
    };

    try {
      let response;
      if (editingFieldId) {
        response = await axios.put(`${API_BASE}/custom-fields/${editingFieldId}`, payload);
      } else {
        response = await axios.post(`${API_BASE}/custom-fields`, payload);
      }
      
      // Сброс формы
      setFormData({
        key: '',
        label: '',
        allowed_values: []
      });
      setCurrentValueInput('');
      setCurrentValueLinkedFields([]);
      setEditingFieldId(null);
      
      // Перезагрузка списка полей
      await reloadExistingFields();
      
      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data || 
                          err.message || 
                          (editingFieldId ? 'Ошибка при обновлении поля' : 'Ошибка при создании поля');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (field) => {
    setEditingFieldId(field.id);
    
    // Преобразуем данные из формата API в формат формы
    const allowedValues = (field.allowed_values || []).map(val => {
      // Если значение - строка (старый формат), преобразуем в новый
      if (typeof val === 'string') {
        return {
          value_id: null,
          value: val,
          linked_custom_fields: []
        };
      }
      // Если уже объект, используем как есть
      return {
        value_id: val.value_id || null,
        value: val.value || String(val),
        linked_custom_fields: val.linked_custom_fields || []
      };
    });
    
    setFormData({
      key: field.key,
      label: field.label,
      allowed_values: allowedValues
    });
    
    setCurrentValueInput('');
    setCurrentValueLinkedFields([]);
    setError('');
    
    document.querySelector('.custom-field-form form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleCancelEdit = () => {
    setEditingFieldId(null);
    setFormData({
      key: '',
      label: '',
      allowed_values: []
    });
    setCurrentValueInput('');
    setCurrentValueLinkedFields([]);
    setError('');
  };

  const handleDelete = async (fieldId) => {
    if (!window.confirm('Вы уверены, что хотите удалить это поле?')) {
      return;
    }

    setDeletingFieldId(fieldId);
    try {
      await axios.delete(`${API_BASE}/custom-fields/${fieldId}`);
      await reloadExistingFields();
      
      if (editingFieldId === fieldId) {
        handleCancelEdit();
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data || 
                          err.message || 
                          'Ошибка при удалении поля';
      alert(errorMessage);
    } finally {
      setDeletingFieldId(null);
    }
  };

  // Получаем доступные поля для привязки (исключаем текущее редактируемое)
  const availableFieldsForLink = existingFields.filter(f => f.id !== editingFieldId);

  // Получаем значения выбранного поля для привязки
  const selectedFieldValues = selectedFieldForLink?.allowed_values || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingFieldId ? 'Редактировать кастомное поле' : 'Создать новое кастомное поле'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="custom-field-form">
          <div className="existing-fields-section">
            <h3>Существующие кастомные поля</h3>
            {existingLoading && (
              <p className="existing-fields-status">Загрузка...</p>
            )}
            {existingError && !existingLoading && (
              <div className="error-message">
                {existingError}
              </div>
            )}
            {!existingLoading && !existingError && existingFields.length === 0 && (
              <p className="existing-fields-status">
                Пока нет ни одного кастомного поля
              </p>
            )}
            {!existingLoading && !existingError && existingFields.length > 0 && (
              <div className="existing-fields-list">
                {existingFields.map(field => (
                  <div key={field.id} className="existing-field-item">
                    <div className="existing-field-main">
                      <div className="existing-field-main-info">
                        <span className="existing-field-label">{field.label}</span>
                        <span className="existing-field-key">{field.key}</span>
                      </div>
                      <div className="existing-field-actions">
                        <button
                          type="button"
                          className="btn btn-small btn-edit"
                          onClick={() => handleEdit(field)}
                          disabled={deletingFieldId === field.id}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="btn btn-small btn-delete"
                          onClick={() => handleDelete(field.id)}
                          disabled={deletingFieldId === field.id || editingFieldId === field.id}
                        >
                          {deletingFieldId === field.id ? 'Удаление...' : 'Удалить'}
                        </button>
                      </div>
                    </div>
                    {field.allowed_values && field.allowed_values.length > 0 && (
                      <div className="existing-field-allowed">
                        <span className="existing-field-allowed-title">Значения:</span>
                        <div className="values-list">
                          {field.allowed_values.map((val, idx) => {
                            // Поддержка нового формата (объект с value и linked_custom_fields) и старого (строка)
                            const valueStr = typeof val === 'string' ? val : (val.value || String(val));
                            
                            // Собираем все привязанные значения в один массив
                            const linkedValues = [];
                            if (typeof val === 'object' && val.linked_custom_fields && val.linked_custom_fields.length > 0) {
                              val.linked_custom_fields.forEach(linkedField => {
                                linkedField.linked_custom_field_values.forEach(v => {
                                  linkedValues.push(v.linked_custom_field_value);
                                });
                              });
                            }
                            
                            return (
                              <span key={idx} className="value-tag">
                                <span className="value-tag-main">{valueStr}</span>
                                {linkedValues.length > 0 && (
                                  <span className="value-tag-linked-container">
                                    {linkedValues.map((linkedVal, linkedIdx) => (
                                      <span key={linkedIdx} className="value-tag-linked">
                                        {linkedVal}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-mode-title">
              {editingFieldId ? 'Режим редактирования' : 'Создать новое кастомное поле'}
            </div>
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-field">
              <label>Ключ поля *</label>
              <input
                type="text"
                value={formData.key}
                onChange={(e) => handleChange('key', e.target.value)}
                placeholder="например: department"
                required
                disabled={!!editingFieldId}
              />
              <small>
                {editingFieldId 
                  ? 'Ключ поля нельзя изменить при редактировании'
                  : 'Будет использован для сохранения данных (только латинские буквы, цифры и подчеркивания)'}
              </small>
            </div>
            
            <div className="form-field">
              <label>Название поля *</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => handleChange('label', e.target.value)}
                placeholder="например: Отдел"
                required
              />
              <small>Отображаемое название поля</small>
            </div>

            <div className="form-field">
              <label>Допустимые значения</label>
              <small>Введите значение и нажмите Enter или кнопку «Добавить»</small>
              <div className="allowed-values-editor">
                <div className="values-list">
                  {formData.allowed_values.map((valObj, idx) => {
                    // Собираем все привязанные значения в один массив
                    const linkedValues = [];
                    if (valObj.linked_custom_fields && valObj.linked_custom_fields.length > 0) {
                      valObj.linked_custom_fields.forEach(linkedField => {
                        linkedField.linked_custom_field_values.forEach(val => {
                          linkedValues.push(val.linked_custom_field_value);
                        });
                      });
                    }
                    
                    return (
                      <span key={idx} className="value-tag">
                        <span className="value-tag-main">{valObj.value}</span>
                        {linkedValues.length > 0 && (
                          <span className="value-tag-linked-container">
                            {linkedValues.map((linkedVal, linkedIdx) => (
                              <span key={linkedIdx} className="value-tag-linked">
                                {linkedVal}
                              </span>
                            ))}
                          </span>
                        )}
                        <button
                          type="button"
                          className="value-tag-remove"
                          onClick={() => handleRemoveValue(idx)}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <div className="allowed-values-input-wrapper">
                  <input
                    type="text"
                    className="allowed-values-input-inline"
                    value={currentValueInput}
                    onChange={(e) => handleValueInputChange(e.target.value)}
                    onKeyDown={handleValueInputKeyDown}
                    placeholder={
                      formData.allowed_values.length === 0
                        ? 'например: Отдел управления продуктами'
                        : 'Добавьте еще значение...'
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-small btn-link"
                    onClick={handleLinkFieldClick}
                    disabled={!currentValueInput.trim()}
                    title="Привязать кастомное поле"
                  >
                    Связать
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-add-allowed"
                    onClick={handleAddValue}
                    disabled={!currentValueInput.trim()}
                  >
                    Добавить
                  </button>
                </div>
                
                {/* Выпадающий список полей для привязки */}
                {showFieldDropdown && (
                  <div className="dropdown-container">
                    <div className="dropdown-overlay" onClick={() => setShowFieldDropdown(false)}></div>
                    <div className="dropdown-menu">
                      <div className="dropdown-header">Выберите кастомное поле:</div>
                      {availableFieldsForLink.length === 0 ? (
                        <div className="dropdown-item">Нет доступных полей</div>
                      ) : (
                        availableFieldsForLink.map(field => (
                          <div
                            key={field.id}
                            className="dropdown-item"
                            onClick={() => handleSelectFieldForLink(field)}
                          >
                            {field.label} ({field.key})
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Выпадающий список значений для привязки */}
                {showValueDropdown && selectedFieldForLink && (
                  <div className="dropdown-container">
                    <div className="dropdown-overlay" onClick={() => setShowValueDropdown(false)}></div>
                    <div className="dropdown-menu">
                      <div className="dropdown-header">Выберите значение поля "{selectedFieldForLink.label}":</div>
                      {selectedFieldValues.length === 0 ? (
                        <div className="dropdown-item">Нет доступных значений</div>
                      ) : (
                        selectedFieldValues.map((valueObj, idx) => {
                          const valueStr = typeof valueObj === 'string' ? valueObj : (valueObj.value || String(valueObj));
                          const valueId = typeof valueObj === 'string' ? null : (valueObj.value_id || null);
                          return (
                            <div
                              key={idx}
                              className="dropdown-item"
                              onClick={() => handleSelectValueForLink({ value: valueStr, value_id: valueId })}
                            >
                              {valueStr}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Отображение привязанных полей для текущего значения */}
                {currentValueLinkedFields.length > 0 && (
                  <div className="current-linked-fields">
                    <div className="current-linked-fields-title">Привязанные поля:</div>
                    {currentValueLinkedFields.map((linkedField, idx) => (
                      <div key={idx} className="current-linked-field-item">
                        <div className="current-linked-field-header">
                          <span className="current-linked-field-label">{linkedField.linked_custom_field_label}</span>
                          <button
                            type="button"
                            className="btn-link-remove"
                            onClick={() => handleRemoveLinkedField(linkedField.linked_custom_field_id)}
                          >
                            ×
                          </button>
                        </div>
                        <div className="current-linked-values">
                          {linkedField.linked_custom_field_values.map((val, valIdx) => (
                            <span key={valIdx} className="current-linked-value-tag">
                              {val.linked_custom_field_value}
                              <button
                                type="button"
                                className="current-linked-value-remove"
                                onClick={() => handleRemoveLinkedValue(linkedField.linked_custom_field_id, val.linked_custom_field_value_id)}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Отмена
              </button>
              {editingFieldId && (
                <button 
                  type="button" 
                  className="btn" 
                  onClick={handleCancelEdit}
                  disabled={loading}
                >
                  Отменить редактирование
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading 
                  ? (editingFieldId ? 'Сохранение...' : 'Создание...') 
                  : (editingFieldId ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CustomFieldForm;
