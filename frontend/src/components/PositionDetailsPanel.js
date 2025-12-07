import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import PositionForm from './PositionForm';
import './PositionDetailsPanel.css';
import { convertCustomFieldsObjectToArray } from '../utils/customFields';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';
const POSITION_CACHE_KEY = 'position_cache';

// Вычисляет порядок кастомных полей на основе дерева
// Поля из дерева идут в порядке уровней, остальные - в конце
function calculateCustomFieldsOrder(customFieldsObj, treeStructure) {
  if (!customFieldsObj || typeof customFieldsObj !== 'object') {
    return [];
  }

  const fieldKeys = Object.keys(customFieldsObj);
  if (fieldKeys.length === 0) {
    return [];
  }

  // Если есть дерево, используем порядок из дерева
  if (treeStructure && treeStructure.levels && Array.isArray(treeStructure.levels)) {
    // Создаем карту: custom_field_key -> order из дерева
    const levelOrderMap = new Map();
    treeStructure.levels
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .forEach((level, index) => {
        if (level.custom_field_key) {
          levelOrderMap.set(level.custom_field_key, level.order !== undefined ? level.order : index);
        }
      });

    // Разделяем поля на две группы: из дерева и не из дерева
    const fieldsInTree = [];
    const fieldsNotInTree = [];

    fieldKeys.forEach(key => {
      if (levelOrderMap.has(key)) {
        fieldsInTree.push({ key, order: levelOrderMap.get(key) });
      } else {
        fieldsNotInTree.push(key);
      }
    });

    // Сортируем поля из дерева по order
    fieldsInTree.sort((a, b) => a.order - b.order);

    // Объединяем: сначала поля из дерева, затем остальные
    return [
      ...fieldsInTree.map(item => item.key),
      ...fieldsNotInTree
    ];
  }

  // Если нет дерева, возвращаем порядок как есть
  return fieldKeys;
}

function PositionDetailsPanel({ positionId, onSaved, onDeleted, initialPath, initialName, deletedCustomField, treeStructure, customFields: customFieldsProp }) {
  // Восстанавливаем position из кеша при монтировании, если positionId совпадает
  const [position, setPosition] = useState(() => {
    if (positionId) {
      try {
        const cached = localStorage.getItem(`${POSITION_CACHE_KEY}_${positionId}`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (e) {
        console.error('Failed to restore position from cache:', e);
      }
    }
    return null;
  });
  const [customFields, setCustomFields] = useState(customFieldsProp || []);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDataReady, setIsDataReady] = useState(() => {
    // Если position восстановлен из кеша и customFields готовы, данные готовы
    if (positionId) {
      try {
        const cached = localStorage.getItem(`${POSITION_CACHE_KEY}_${positionId}`);
        if (cached) {
          const hasCustomFields = (customFieldsProp && customFieldsProp.length > 0);
          return hasCustomFields;
        }
      } catch (e) {
        // Игнорируем ошибки при проверке кеша
      }
    }
    return false;
  });
  // Используем ref для сохранения предыдущего positionId и предотвращения сброса при обновлении
  const prevPositionIdRef = useRef(null);
  const positionRef = useRef(null);

  useEffect(() => {
    if (positionId) {
      // Если positionId изменился, очищаем кеш предыдущего position
      if (prevPositionIdRef.current && prevPositionIdRef.current !== positionId) {
        try {
          localStorage.removeItem(`${POSITION_CACHE_KEY}_${prevPositionIdRef.current}`);
        } catch (e) {
          console.error('Failed to clear position cache:', e);
        }
      }
      
      // Если positionId не изменился и position уже восстановлен из кеша, проверяем готовность данных
      // Это предотвращает мерцание при обновлении страницы
      if (prevPositionIdRef.current === positionId && position) {
        // position уже восстановлен из кеша в useState
        // Проверяем, готовы ли customFields
        const hasCustomFields = (customFieldsProp && customFieldsProp.length > 0) || 
                                 (customFields && customFields.length > 0);
        if (hasCustomFields) {
          setIsDataReady(true);
        } else {
          setIsDataReady(false);
        }
      } else if (prevPositionIdRef.current !== positionId) {
        // positionId изменился, сбрасываем isDataReady
        setIsDataReady(false);
      }
      
      prevPositionIdRef.current = positionId;
      loadPosition(positionId);
      setIsEditing(false);
    } else if (positionId === null) {
      if (initialPath) {
        // New position with path (from tree node)
        // ВАЖНО: Порядок полей вычисляем на основе дерева, а не из initialPath
        // Это гарантирует стабильный порядок
        const calculatedOrder = calculateCustomFieldsOrder(initialPath, treeStructure);
        const newPosition = {
          name: initialName || '',
          custom_fields: initialPath,
          custom_fields_order: calculatedOrder,
          employee_full_name: '',
          employee_id: '',
          employee_profile_url: ''
        };
        setPosition(newPosition);
        positionRef.current = newPosition;
        setIsEditing(true);
        setIsDataReady(true);
      } else {
        // New position without path
        setPosition(null);
        positionRef.current = null;
        setIsEditing(true);
        setIsDataReady(true);
      }
    }
  }, [positionId, initialPath]);

  // Обновляем customFields при изменении пропса
  useEffect(() => {
    if (customFieldsProp && customFieldsProp.length > 0) {
      setCustomFields(customFieldsProp);
      // Если данные должности уже загружены, помечаем данные как готовые
      if (position) {
        setIsDataReady(true);
      }
    }
  }, [customFieldsProp, position]);

  useEffect(() => {
    // Load custom fields definitions on mount (needed for new positions)
    // Только если не переданы через props
    if (!positionId && (!customFieldsProp || customFieldsProp.length === 0)) {
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

  const loadPosition = async (id, silent = false) => {
    // Не показываем состояние загрузки при тихой перезагрузке или если уже есть данные
    // Это предотвращает мерцание при обновлении страницы
    if (!silent && !position) {
      setLoading(true);
    }
    try {
      // Загружаем position и customFields параллельно для оптимизации
      const positionPromise = axios.get(`${API_BASE}/positions/${id}`);
      const customFieldsPromise = (!customFieldsProp || customFieldsProp.length === 0)
        ? axios.get(`${API_BASE}/custom-fields`)
        : Promise.resolve({ data: customFieldsProp });
      
      // Ждем оба запроса параллельно
      const [positionResponse, customFieldsResponse] = await Promise.all([
        positionPromise,
        customFieldsPromise
      ]);
      
      const positionData = positionResponse.data;
      
      // Устанавливаем customFields
      if (!customFieldsProp || customFieldsProp.length === 0) {
        const fieldsData = customFieldsResponse.data || [];
        setCustomFields(fieldsData);
      } else {
        setCustomFields(customFieldsProp);
      }
      
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
        // ВАЖНО: Порядок полей всегда вычисляем на основе дерева, а не из данных сервера
        // Это гарантирует стабильный порядок и предотвращает перепрыгивание полей
        positionData.custom_fields_order = calculateCustomFieldsOrder(customFieldsObj, treeStructure);
      } else if (!positionData.custom_fields || typeof positionData.custom_fields !== 'object') {
        positionData.custom_fields = {};
        positionData.custom_fields_order = [];
      }
      
      // Проверяем готовность customFields перед установкой position
      const hasCustomFields = (customFieldsProp && customFieldsProp.length > 0) || 
                               (customFields.length > 0);
      
      // Устанавливаем isDataReady синхронно ДО установки position
      // Это гарантирует, что кастомные поля не будут мерцать
      if (hasCustomFields) {
        setIsDataReady(true);
      }
      
      // При тихой перезагрузке всегда обновляем состояние, чтобы гарантировать правильный порядок
      // Порядок всегда пересчитывается на основе дерева, что предотвращает перепрыгивание полей
      setPosition(positionData);
      // Сохраняем position в ref для восстановления при обновлении страницы
      positionRef.current = positionData;
      // Сохраняем position в localStorage для восстановления при обновлении страницы
      try {
        localStorage.setItem(`${POSITION_CACHE_KEY}_${id}`, JSON.stringify(positionData));
      } catch (e) {
        console.error('Failed to cache position:', e);
      }
    } catch (error) {
      console.error('Failed to load position:', error);
      setIsDataReady(false);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomFields = async () => {
    try {
      const response = await axios.get(`${API_BASE}/custom-fields`);
      const fieldsData = response.data || [];
      setCustomFields(fieldsData);
      // Помечаем данные как готовые после загрузки customFields, если position уже загружен
      // Это гарантирует, что кастомные поля не будут мерцать
      // Если position еще не загружен, isDataReady будет установлен в loadPosition
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
      // ВАЖНО: Порядок полей всегда вычисляем на основе дерева, чтобы гарантировать правильный порядок
      const customFieldsOrder = calculateCustomFieldsOrder(positionData.custom_fields || {}, treeStructure);
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
      
      // Оптимистично обновляем состояние сразу после сохранения, чтобы избежать мерцания
      // Используем данные, которые мы только что отправили, преобразованные в формат для отображения
      // ВАЖНО: Порядок полей всегда вычисляем на основе дерева, чтобы избежать перепрыгивания
      const optimisticCustomFields = positionData.custom_fields || {};
      const calculatedOrder = calculateCustomFieldsOrder(optimisticCustomFields, treeStructure);
      
      const optimisticPosition = {
        ...(position || {}),
        id: savedPositionId,
        name: positionData.name,
        employee_full_name: positionData.employee_full_name,
        employee_id: positionData.employee_id,
        employee_profile_url: positionData.employee_profile_url,
        custom_fields: optimisticCustomFields,
        custom_fields_array: customFieldsArray,
        custom_fields_order: calculatedOrder
      };
      
      setIsEditing(false);
      setPosition(optimisticPosition);
      // Сохраняем position в ref для восстановления при обновлении страницы
      positionRef.current = optimisticPosition;
      // Сохраняем position в localStorage для восстановления при обновлении страницы
      try {
        localStorage.setItem(`${POSITION_CACHE_KEY}_${savedPositionId}`, JSON.stringify(optimisticPosition));
      } catch (e) {
        console.error('Failed to cache position:', e);
      }
      // Данные готовы, так как мы только что их сохранили
      setIsDataReady(true);
      
      if (onSaved) {
        onSaved(savedPositionId);
      }
      
      // Тихая перезагрузка в фоне для синхронизации с сервером
      // Не устанавливаем loading, чтобы избежать мерцания
      if (savedPositionId) {
        loadPosition(savedPositionId, true); // true = silent reload
      } else {
        setPosition(null);
      }
    } catch (error) {
      console.error('Failed to save position:', error);
      alert('Ошибка при сохранении: ' + (error.response?.data?.error || error.message));
      // В случае ошибки перезагружаем данные с сервера
      if (position && position.id) {
        loadPosition(position.id);
      }
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
      positionRef.current = null;
      // Удаляем position из кеша при удалении
      try {
        localStorage.removeItem(`${POSITION_CACHE_KEY}_${position.id}`);
      } catch (e) {
        console.error('Failed to remove position from cache:', e);
      }
      setIsEditing(false);
      if (onDeleted) {
        onDeleted(positionPath);
      }
    } catch (error) {
      console.error('Failed to delete position:', error);
      alert('Ошибка при удалении: ' + (error.response?.data?.error || error.message));
    }
  };

  // Показываем состояние загрузки только если нет предыдущих данных
  // Это предотвращает мерцание при обновлении страницы
  if (loading && !position && !isEditing) {
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
        isDataReady={isDataReady}
      />
    </div>
  );
}

export default PositionDetailsPanel;

