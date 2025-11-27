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
  const [allowedValuesInput, setAllowedValuesInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingFields, setExistingFields] = useState([]);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingError, setExistingError] = useState('');
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [deletingFieldId, setDeletingFieldId] = useState(null);

  const addAllowedValue = (rawValue) => {
    const value = rawValue.trim();
    if (!value) return;

    setFormData(prev => {
      const exists = prev.allowed_values.includes(value);
      if (exists) return prev;
      return {
        ...prev,
        allowed_values: [...prev.allowed_values, value]
      };
    });
  };

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

  const handleAllowedValuesInputChange = (value) => {
    setAllowedValuesInput(value);
  };

  const handleAllowedValuesKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!allowedValuesInput.trim()) {
        return;
      }
      handleAddAllowedValue();
    }

    if (e.key === 'Backspace' && !allowedValuesInput && formData.allowed_values.length > 0) {
      e.preventDefault();
      setFormData(prev => ({
        ...prev,
        allowed_values: prev.allowed_values.slice(0, -1)
      }));
    }
  };

  const handleRemoveAllowedValue = (indexToRemove) => {
    setFormData(prev => ({
      ...prev,
      allowed_values: prev.allowed_values.filter((_, index) => index !== indexToRemove)
    }));
  };

  const handleAddAllowedValue = () => {
    if (!allowedValuesInput.trim()) return;
    addAllowedValue(allowedValuesInput);
    setAllowedValuesInput('');
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
      // Нормализуем ключ: приводим к нижнему регистру, заменяем пробелы на подчеркивания
      key = key.toLowerCase().replace(/\s+/g, '_');
      // Удаляем все символы, кроме латинских букв, цифр и подчеркиваний
      key = key.replace(/[^a-z0-9_]/g, '');
      
      // Проверяем, что ключ не пустой после нормализации
      if (!key) {
        setError('Ключ должен содержать хотя бы одну латинскую букву или цифру');
        setLoading(false);
        return;
      }
      
      // Проверяем, что ключ не начинается с цифры
      if (/^\d/.test(key)) {
        setError('Ключ не может начинаться с цифры');
        setLoading(false);
        return;
      }
    }

    const payload = {
      key: key,
      label: formData.label.trim(),
      // Тип поля всегда "enum" (список значений)
      type: 'enum',
      allowed_values: formData.allowed_values
    };

    try {
      let response;
      if (editingFieldId) {
        // Обновление существующего поля
        response = await axios.put(`${API_BASE}/custom-fields/${editingFieldId}`, payload);
      } else {
        // Создание нового поля
        response = await axios.post(`${API_BASE}/custom-fields`, payload);
      }
      
      // Сброс формы
      setFormData({
        key: '',
        label: '',
        allowed_values: []
      });
      setAllowedValuesInput('');
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
    setFormData({
      key: field.key,
      label: field.label,
      allowed_values: field.allowed_values || []
    });
    
    // Очищаем ввод для нового значения списка
    setAllowedValuesInput('');
    
    setError('');
    
    // Прокручиваем к форме
    document.querySelector('.custom-field-form form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleCancelEdit = () => {
    setEditingFieldId(null);
    setFormData({
      key: '',
      label: '',
      allowed_values: []
    });
    setAllowedValuesInput('');
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
      
      // Если удаляемое поле редактировалось, сбрасываем форму
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
                        <span className="existing-field-type">
                          {field.type === 'string' && 'Текст'}
                          {field.type === 'number' && 'Число'}
                          {field.type === 'enum' && 'Список'}
                        </span>
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
                          {field.allowed_values.map((val, idx) => (
                            <span key={idx} className="value-tag">
                              {String(val)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit}>
          {/* Режим работы формы: создание или редактирование */}
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
              <small>Введите значение и нажмите Enter (или запятую), либо кнопку «Добавить» справа</small>
              <div className="allowed-values-editor">
                <div className="values-list">
                  {formData.allowed_values.map((val, idx) => (
                    <span key={idx} className="value-tag">
                      {val}
                      <button
                        type="button"
                        className="value-tag-remove"
                        onClick={() => handleRemoveAllowedValue(idx)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="allowed-values-input-wrapper">
                  <input
                    type="text"
                    className="allowed-values-input-inline"
                    value={allowedValuesInput}
                    onChange={(e) => handleAllowedValuesInputChange(e.target.value)}
                    onKeyDown={handleAllowedValuesKeyDown}
                    placeholder={
                      formData.allowed_values.length === 0
                        ? 'например: Отдел управления продуктами'
                        : 'Добавьте еще значение...'
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-small btn-add-allowed"
                    onClick={handleAddAllowedValue}
                    disabled={!allowedValuesInput.trim()}
                  >
                    Добавить
                  </button>
                </div>
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

