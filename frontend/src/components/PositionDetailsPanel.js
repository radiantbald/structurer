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
      // API returns array with structure: [{custom_field_id, custom_field_key, custom_field_label, custom_field_value, linked_custom_fields}]
      // PositionForm expects object format: {field_key: value}
      if (Array.isArray(positionData.custom_fields)) {
        const customFieldsObj = {};
        positionData.custom_fields.forEach((item) => {
          // Use custom_field_key if available
          const fieldKey = item.custom_field_key;
          
          if (fieldKey) {
            // Store value string (not value_id) to match select option values
            // Нормализуем значение, обрезая пробелы для точного совпадения
            // НЕ объединяем значения через тире - используем только основное значение
            let normalizedValue = item.custom_field_value ? String(item.custom_field_value).trim() : '';
            
            // Сохраняем основное значение без объединения
            customFieldsObj[fieldKey] = normalizedValue;
            
            // Если есть привязанные поля, сохраняем их значения отдельно в объекте
            if (item.linked_custom_fields && Array.isArray(item.linked_custom_fields)) {
              item.linked_custom_fields.forEach(linkedField => {
                const linkedFieldKey = linkedField.linked_custom_field_key;
                if (linkedFieldKey && linkedField.linked_custom_field_values && Array.isArray(linkedField.linked_custom_field_values)) {
                  // Берем все установленные значения из массива
                  linkedField.linked_custom_field_values.forEach(linkedVal => {
                    if (linkedVal && linkedVal.linked_custom_field_value) {
                      const linkedValue = String(linkedVal.linked_custom_field_value).trim();
                      // Сохраняем значение связанного поля отдельно (если еще не установлено)
                      if (linkedValue && !customFieldsObj[linkedFieldKey]) {
                        customFieldsObj[linkedFieldKey] = linkedValue;
                      }
                    }
                  });
                }
              });
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

  const convertCustomFieldsToArray = (customFieldsObj) => {
    if (!customFieldsObj || typeof customFieldsObj !== 'object') {
      return [];
    }

    const customFieldsArray = [];

    // Проходим по каждому полю в объекте
    Object.entries(customFieldsObj).forEach(([fieldKey, fieldValue]) => {
      if (!fieldValue || !fieldValue.trim()) {
        return; // Пропускаем пустые значения
      }

      // Находим определение поля
      const fieldDef = customFields.find(f => f.key === fieldKey);
      if (!fieldDef) {
        return; // Пропускаем поля без определения
      }

      // Ищем выбранное значение в allowed_values
      let selectedValue = null;
      if (fieldDef.allowed_values && Array.isArray(fieldDef.allowed_values)) {
        const searchValue = String(fieldValue).trim();
        
        // Сначала пытаемся найти по точному совпадению значения
        selectedValue = fieldDef.allowed_values.find(av => {
          if (!av) return false;
          
          const value = av.value ? String(av.value).trim() : '';
          // value_id может быть строкой или UUID объектом
          const valueId = av.value_id 
            ? (typeof av.value_id === 'string' ? av.value_id.trim() : String(av.value_id))
            : '';
          
          // Сравниваем по значению или по value_id
          const matches = value === searchValue || valueId === searchValue;
          return matches;
        });
        
        // Если не найдено по точному совпадению, пробуем найти по частичному совпадению
        // (на случай, если значение было сохранено с дополнительными символами)
        if (!selectedValue && searchValue) {
          selectedValue = fieldDef.allowed_values.find(av => {
            if (!av) return false;
            const value = av.value ? String(av.value).trim() : '';
            // Проверяем, содержит ли значение searchValue или наоборот
            return value.includes(searchValue) || searchValue.includes(value);
          });
        }
      }

      // Новый формат: custom_field_id (ID поля) и custom_field_value_id (ID значения)
      const customFieldItem = {
        custom_field_id: fieldDef.id
      };
      
      // Добавляем ID выбранного значения, если оно найдено
      if (selectedValue) {
        // value_id может быть строкой или UUID объектом, преобразуем в строку
        let valueId = null;
        if (selectedValue.value_id) {
          valueId = typeof selectedValue.value_id === 'string' 
            ? selectedValue.value_id.trim() 
            : String(selectedValue.value_id);
        }
        
        if (valueId && valueId.length > 0) {
          customFieldItem.custom_field_value_id = valueId;
        } else {
          // Если value_id не найден, но значение найдено, логируем предупреждение
          console.warn(`Value found for field ${fieldKey} but value_id is missing`, selectedValue);
        }
      } else {
        // Если значение не найдено, но fieldValue есть, логируем для отладки
        if (fieldValue && fieldValue.trim()) {
          console.warn(`Value not found for field ${fieldKey} with value "${fieldValue}". Available values:`, 
            fieldDef.allowed_values?.map(av => ({ value: av.value, value_id: av.value_id })));
        }
      }

      // Если найдено значение с linked_custom_fields, добавляем их
      // Новый формат: только linked_custom_field_values с linked_custom_field_value_id
      if (selectedValue && selectedValue.linked_custom_fields && Array.isArray(selectedValue.linked_custom_fields)) {
        // Собираем все значения всех связанных полей в один массив
        const allLinkedFieldValues = [];
        
        selectedValue.linked_custom_fields.forEach(linkedField => {
          const linkedFieldKey = linkedField.linked_custom_field_key;
          const linkedValueInPosition = customFieldsObj[linkedFieldKey];
          
          if (linkedValueInPosition && linkedField.linked_custom_field_values && Array.isArray(linkedField.linked_custom_field_values)) {
            // Проходим по всем возможным значениям связанного поля
            linkedField.linked_custom_field_values.forEach(linkedVal => {
              const linkedValueText = linkedVal.linked_custom_field_value ? String(linkedVal.linked_custom_field_value).trim() : '';
              const linkedValueId = linkedVal.linked_custom_field_value_id 
                ? (typeof linkedVal.linked_custom_field_value_id === 'string' 
                    ? linkedVal.linked_custom_field_value_id.trim() 
                    : String(linkedVal.linked_custom_field_value_id))
                : '';
              const positionValue = String(linkedValueInPosition).trim();
              
              // Сравниваем по значению или по value_id
              if (linkedValueText === positionValue || linkedValueId === positionValue) {
                // Добавляем только linked_custom_field_value_id
                if (linkedValueId && linkedValueId.length > 0) {
                  allLinkedFieldValues.push({
                    linked_custom_field_value_id: linkedValueId
                  });
                }
              }
            });
          }
        });

        // Если есть значения, создаем структуру linked_custom_fields
        if (allLinkedFieldValues.length > 0) {
          // По формату: массив объектов, каждый с linked_custom_field_values
          // Группируем все значения в один объект
          customFieldItem.linked_custom_fields = [
            {
              linked_custom_field_values: allLinkedFieldValues
            }
          ];
        }
      }

      customFieldsArray.push(customFieldItem);
    });

    return customFieldsArray;
  };

  const handleSave = async (positionData) => {
    try {
      // Преобразуем custom_fields из объекта в массив с правильной структурой
      const customFieldsArray = convertCustomFieldsToArray(positionData.custom_fields);
      
      // Отладочное логирование
      console.log('Converting custom_fields:', {
        input: positionData.custom_fields,
        output: customFieldsArray,
        customFields: customFields
      });
      
      const dataToSend = {
        ...positionData,
        custom_fields: customFieldsArray
      };

      let savedPositionId = null;
      if (position && position.id) {
        await axios.put(`${API_BASE}/positions/${position.id}`, dataToSend);
        savedPositionId = position.id;
      } else {
        const response = await axios.post(`${API_BASE}/positions`, dataToSend);
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

