import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PositionForm from './PositionForm';
import './PositionDetailsPanel.css';
import { convertCustomFieldsObjectToArray } from '../utils/customFields';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';

function PositionDetailsPanel({ positionId, onSaved, onDeleted, initialPath, initialName, deletedCustomField, treeStructure }) {
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
        // Сохраняем порядок полей из initialPath
        const pathOrder = Object.keys(initialPath);
        setPosition({
          name: initialName || '',
          custom_fields: initialPath,
          custom_fields_order: pathOrder,
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

  // Реактивно удаляем кастомное поле из текущей должности,
  // когда оно было удалено в форме кастомных полей
  useEffect(() => {
    if (!deletedCustomField || !deletedCustomField.key) {
      return;
    }

    setPosition(prev => {
      if (!prev || !prev.custom_fields || typeof prev.custom_fields !== 'object') {
        return prev;
      }

      const fieldKey = deletedCustomField.key;
      if (!(fieldKey in prev.custom_fields)) {
        return prev;
      }

      const { [fieldKey]: _removed, ...restCustomFields } = prev.custom_fields;

      let updatedArray = prev.custom_fields_array;
      if (Array.isArray(prev.custom_fields_array)) {
        updatedArray = prev.custom_fields_array.filter(
          item => item && item.custom_field_key !== fieldKey
        );
      }

      // Удаляем ключ из порядка
      let updatedOrder = prev.custom_fields_order;
      if (Array.isArray(prev.custom_fields_order)) {
        updatedOrder = prev.custom_fields_order.filter(key => key !== fieldKey);
      }

      return {
        ...prev,
        custom_fields: restCustomFields,
        custom_fields_array: updatedArray,
        custom_fields_order: updatedOrder,
      };
    });
  }, [deletedCustomField]);

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
      
      // Сохраняем порядок ключей полей из исходного массива
      const customFieldsOrder = [];
      
      // Convert custom_fields array format to object format for PositionForm
      // API returns array with structure: [{custom_field_id, custom_field_key, custom_field_label, custom_field_value, linked_custom_fields}]
      // PositionForm expects object format: {field_key: value}
      if (Array.isArray(positionData.custom_fields)) {
        const customFieldsObj = {};
        positionData.custom_fields.forEach((item) => {
          // Use custom_field_key if available
          const fieldKey = item.custom_field_key;
          
          if (fieldKey) {
            // ВНУТРЕННЕ ХРАНЕНИЕ: всегда стараемся хранить именно ID значения (custom_field_value_id),
            // а не текст. Текстовое значение используем только как fallback.
            const rawValueId = item.custom_field_value_id
              ? String(item.custom_field_value_id).trim()
              : '';
            const rawValueText = item.custom_field_value
              ? String(item.custom_field_value).trim()
              : '';

            const storedMainValue = rawValueId || rawValueText;
            if (storedMainValue) {
              customFieldsObj[fieldKey] = storedMainValue;
              // Сохраняем порядок основного поля
              if (!customFieldsOrder.includes(fieldKey)) {
                customFieldsOrder.push(fieldKey);
              }
            }

            // Добавляем linked поля как отдельные записи в объект custom_fields
            // Это необходимо, чтобы при редактировании linked поля не пропадали
            if (item.linked_custom_fields && Array.isArray(item.linked_custom_fields)) {
              item.linked_custom_fields.forEach((linkedField) => {
                if (!linkedField || !linkedField.linked_custom_field_key) {
                  return;
                }

                const linkedFieldKey = linkedField.linked_custom_field_key;
                
                // Если это поле уже есть в объекте, не перезаписываем его
                // (приоритет у явно установленных значений)
                if (customFieldsObj.hasOwnProperty(linkedFieldKey)) {
                  return;
                }

                // Обрабатываем значения linked поля
                if (linkedField.linked_custom_field_values && Array.isArray(linkedField.linked_custom_field_values)) {
                  // Берем первое значение из linked_custom_field_values
                  // (обычно оно одно)
                  const firstLinkedValue = linkedField.linked_custom_field_values[0];
                  if (firstLinkedValue) {
                    // Приоритет отдаем ID, если он есть, иначе текстовому значению
                    const linkedValueId = firstLinkedValue.linked_custom_field_value_id
                      ? String(firstLinkedValue.linked_custom_field_value_id).trim()
                      : '';
                    const linkedValueText = firstLinkedValue.linked_custom_field_value
                      ? String(firstLinkedValue.linked_custom_field_value).trim()
                      : '';

                    const storedLinkedValue = linkedValueId || linkedValueText;
                    if (storedLinkedValue) {
                      customFieldsObj[linkedFieldKey] = storedLinkedValue;
                      // Сохраняем порядок linked поля (после основного поля)
                      if (!customFieldsOrder.includes(linkedFieldKey)) {
                        customFieldsOrder.push(linkedFieldKey);
                      }
                    }
                  }
                }
              });
            }
          }
        });
        positionData.custom_fields = customFieldsObj;
        // Store original array format for display
        positionData.custom_fields_array = originalCustomFieldsArray;
        // Store order of custom fields keys
        positionData.custom_fields_order = customFieldsOrder;
      } else if (!positionData.custom_fields || typeof positionData.custom_fields !== 'object') {
        positionData.custom_fields = {};
        positionData.custom_fields_order = [];
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
      // Преобразуем custom_fields из объекта в массив с правильной структурой
      // Используем сохраненный порядок полей из данных формы, если он есть
      const customFieldsOrder = positionData.custom_fields_order || position?.custom_fields_order || null;
      const customFieldsArray = convertCustomFieldsObjectToArray(
        positionData.custom_fields,
        customFields,
        customFieldsOrder
      );
      
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
        customFieldsOrder={position?.custom_fields_order}
        isEditing={isEditing}
        onEdit={handleEdit}
        onCancel={handleCancel}
        onSave={handleSave}
        onDelete={handleDelete}
        treeStructure={treeStructure}
      />
    </div>
  );
}

export default PositionDetailsPanel;

