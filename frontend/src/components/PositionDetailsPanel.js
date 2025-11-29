import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PositionForm from './PositionForm';
import './PositionDetailsPanel.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';

function PositionDetailsPanel({ positionId, onSaved, onDeleted, initialPath, initialName }) {
  const [position, setPosition] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (positionId) {
      loadPosition(positionId);
      setIsEditing(false);
    } else if (positionId === null) {
      if (initialPath) {
        // New position with path (from tree node)
        setPosition({
          name: initialName || '',
          custom_fields: initialPath,
          employee_full_name: '',
          employee_external_id: '',
          employee_profile_url: ''
        });
        setIsEditing(true);
      } else {
        // New position without path
        setPosition(null);
        setIsEditing(true);
      }
    }
  }, [positionId, initialPath]);

  useEffect(() => {
    // Load custom fields definitions on mount (needed for new positions)
    // Note: loadPosition will also call loadCustomFields, but we need it here for new positions
    if (!positionId) {
      loadCustomFields();
    }
  }, []);

  const loadPosition = async (id) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/positions/${id}`);
      const positionData = response.data;
      
      // Load custom field definitions first (needed for conversion)
      await loadCustomFields();
      
      // Store original array format for display purposes
      const originalCustomFieldsArray = Array.isArray(positionData.custom_fields) 
        ? positionData.custom_fields 
        : null;
      
      // Convert custom_fields array format to object format for PositionForm
      // API returns array with structure: [{custom_field_key, value_id, value, linked_custom_fields}]
      // PositionForm expects object format: {field_key: value}
      if (Array.isArray(positionData.custom_fields)) {
        const customFieldsObj = {};
        positionData.custom_fields.forEach((item) => {
          // Use custom_field_key if available, otherwise try to match by value
          const fieldKey = item.custom_field_key;
          
          if (fieldKey) {
            // Store value string (not value_id) to match select option values
            // Нормализуем значение, обрезая пробелы для точного совпадения
            let normalizedValue = item.value ? String(item.value).trim() : '';
            
            // Если есть привязанные поля, объединяем их значения через тире
            if (item.linked_custom_fields && Array.isArray(item.linked_custom_fields)) {
              const linkedValues = [];
              item.linked_custom_fields.forEach(linkedField => {
                if (linkedField.linked_custom_field_values && Array.isArray(linkedField.linked_custom_field_values)) {
                  linkedField.linked_custom_field_values.forEach(linkedVal => {
                    const normalizedLinkedValue = linkedVal.linked_custom_field_value ? String(linkedVal.linked_custom_field_value).trim() : '';
                    if (normalizedLinkedValue) {
                      linkedValues.push(normalizedLinkedValue);
                    }
                  });
                }
              });
              
              // Объединяем основное значение с привязанными через тире
              if (linkedValues.length > 0) {
                normalizedValue = `${normalizedValue} - ${linkedValues.join(' - ')}`;
              }
            }
            
            customFieldsObj[fieldKey] = normalizedValue;
            
            // Также сохраняем привязанные значения как отдельные поля
            // (для обратной совместимости и для возможности их редактирования)
            if (item.linked_custom_fields && Array.isArray(item.linked_custom_fields)) {
              item.linked_custom_fields.forEach(linkedField => {
                if (linkedField.linked_custom_field_values && Array.isArray(linkedField.linked_custom_field_values)) {
                  linkedField.linked_custom_field_values.forEach(linkedVal => {
                    const normalizedLinkedValue = linkedVal.linked_custom_field_value ? String(linkedVal.linked_custom_field_value).trim() : '';
                    // Сохраняем только если поле еще не установлено
                    if (normalizedLinkedValue && !customFieldsObj[linkedField.linked_custom_field_key]) {
                      customFieldsObj[linkedField.linked_custom_field_key] = normalizedLinkedValue;
                    }
                  });
                }
              });
            }
          } else {
            // Fallback: try to find field by matching value in allowed_values
            const fieldDef = customFields.find(f => {
              if (!f.allowed_values || !Array.isArray(f.allowed_values)) return false;
              return f.allowed_values.some(av => {
                const val = typeof av === 'string' ? av.trim() : String(av.value || '').trim();
                const valId = typeof av === 'object' && av.value_id ? String(av.value_id).trim() : '';
                const itemValue = item.value ? String(item.value).trim() : '';
                const itemValueId = item.value_id ? String(item.value_id).trim() : '';
                return valId === itemValueId || val === itemValue || val === itemValueId || valId === itemValue;
              });
            });
            
            if (fieldDef) {
              const normalizedValue = item.value ? String(item.value).trim() : '';
              customFieldsObj[fieldDef.key] = normalizedValue;
            }
          }
        });
        positionData.custom_fields = customFieldsObj;
        // Store original array format for display
        positionData.custom_fields_array = originalCustomFieldsArray;
      } else if (!positionData.custom_fields || typeof positionData.custom_fields !== 'object') {
        positionData.custom_fields = {};
      }
      
      setPosition(positionData);
    } catch (error) {
      console.error('Failed to load position:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomFields = async () => {
    try {
      const response = await axios.get(`${API_BASE}/custom-fields`);
      setCustomFields(response.data);
    } catch (error) {
      console.error('Failed to load custom fields:', error);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (position && position.id) {
      setIsEditing(false);
      loadPosition(position.id);
    } else {
      setPosition(null);
      setIsEditing(false);
    }
  };

  const handleSave = async (positionData) => {
    try {
      let savedPositionId = null;
      if (position && position.id) {
        await axios.put(`${API_BASE}/positions/${position.id}`, positionData);
        savedPositionId = position.id;
      } else {
        const response = await axios.post(`${API_BASE}/positions`, positionData);
        savedPositionId = response.data.id;
      }
      setIsEditing(false);
      if (onSaved) {
        onSaved(savedPositionId);
      }
      if (savedPositionId) {
        loadPosition(savedPositionId);
      } else {
        setPosition(null);
      }
    } catch (error) {
      console.error('Failed to save position:', error);
      alert('Ошибка при сохранении: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDelete = async () => {
    if (!position || !position.id) return;
    if (!window.confirm('Вы уверены, что хотите удалить эту должность?')) {
      return;
    }
    try {
      await axios.delete(`${API_BASE}/positions/${position.id}`);
      const positionPath = position.custom_fields || {};
      setPosition(null);
      setIsEditing(false);
      if (onDeleted) {
        onDeleted(positionPath);
      }
    } catch (error) {
      console.error('Failed to delete position:', error);
      alert('Ошибка при удалении: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return (
      <div className="position-details-panel">
        <div className="empty-state">
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!position && !isEditing) {
    return (
      <div className="position-details-panel">
        <div className="empty-state">
          <p>Выберите должность или создайте новую</p>
        </div>
      </div>
    );
  }

  return (
    <div className="position-details-panel">
      <PositionForm
        position={position}
        customFields={customFields}
        customFieldsArray={position?.custom_fields_array}
        isEditing={isEditing}
        onEdit={handleEdit}
        onCancel={handleCancel}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default PositionDetailsPanel;

