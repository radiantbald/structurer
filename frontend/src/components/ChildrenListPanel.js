import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ChildrenListPanel.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';

// Вспомогательные функции для работы с узлами (поддержка старого и нового формата)
const getNodeKeyValue = (node) => {
  if (node.custom_field_key && node.custom_field_value) {
    return { key: node.custom_field_key, value: node.custom_field_value };
  }
  if (node.field_key && node.field_value) {
    return { key: node.field_key, value: node.field_value };
  }
  return null;
};

const isFieldValueNode = (node) => {
  return node.type === 'field_value' || node.type === 'custom_field_value';
};

// Формирование комбинированного названия узла (как в дереве слева):
// основное значение + все прилинкованные значения через тире.
// Источник данных:
// - node.custom_field_value / node.field_value / node.custom_field_key
// - node.linked_custom_fields[].linked_custom_field_values[].linked_custom_field_value
const buildCombinedFieldLabel = (node) => {
  const nodeKV = getNodeKeyValue(node);
  const baseValue =
    (nodeKV && nodeKV.value) ||
    node.custom_field_value ||
    node.field_value ||
    '';

  // Нет прилинкованных значений — возвращаем базовое
  if (!node.linked_custom_fields || !Array.isArray(node.linked_custom_fields)) {
    return baseValue;
  }

  const linkedNames = [];

  node.linked_custom_fields.forEach((lf) => {
    if (!lf || !Array.isArray(lf.linked_custom_field_values)) {
      return;
    }
    lf.linked_custom_field_values.forEach((lv) => {
      if (
        lv &&
        typeof lv.linked_custom_field_value === 'string' &&
        lv.linked_custom_field_value.trim()
      ) {
        linkedNames.push(lv.linked_custom_field_value.trim());
      }
    });
  });

  if (linkedNames.length === 0) {
    return baseValue;
  }

  // Комбинированное название: "Основное - Прилинк1 - Прилинк2"
  return [baseValue, ...linkedNames].join(' - ');
};

// Вспомогательная функция для рекурсивного подсчета всех позиций в поддереве
const countAllPositions = (node) => {
  if (!node) return 0;
  
  let count = 0;
  
  // Если текущий узел - позиция, считаем его
  if (node.type === 'position') {
    count = 1;
  }
  
  // Рекурсивно считаем позиции в дочерних узлах
  if (node.children) {
    node.children.forEach(child => {
      count += countAllPositions(child);
    });
  }
  
  return count;
};

// Функция для правильного склонения слова "сотрудник"
const getEmployeeWord = (count) => {
  if (count === 0) return 'сотрудников';
  
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  // Для чисел 11-19 всегда множественное число
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'сотрудников';
  }
  
  // Для чисел, оканчивающихся на 1 - единственное число
  if (lastDigit === 1) {
    return 'сотрудник';
  }
  
  // Для чисел, оканчивающихся на 2, 3, 4 - единственное число в родительном падеже
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'сотрудника';
  }
  
  // Для остальных - множественное число
  return 'сотрудников';
};

// Функция для рекурсивного подсчета всех подразделений (field_value узлов) во всех уровнях
const countAllSubdivisions = (node) => {
  if (!node) return 0;
  
  let count = 0;
  
  // Если текущий узел - подразделение, не считаем его (считаем только дочерние)
  // Но если это корневой узел или позиция, считаем дочерние подразделения
  
  // Рекурсивно считаем подразделения в дочерних узлах
  if (node.children) {
    node.children.forEach(child => {
      // Если дочерний узел - подразделение, считаем его и рекурсивно его дочерние
      if (isFieldValueNode(child)) {
        count += 1; // Считаем само подразделение
        count += countAllSubdivisions(child); // Рекурсивно считаем дочерние подразделения
      } else {
        // Для других типов узлов (например, position) тоже рекурсивно проверяем
        count += countAllSubdivisions(child);
      }
    });
  }
  
  return count;
};

// Функция для правильного склонения слова "подразделение"
const getSubdivisionWord = (count) => {
  if (count === 0) return 'подразделений';
  
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  // Для чисел 11-19 всегда множественное число
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'подразделений';
  }
  
  // Для чисел, оканчивающихся на 1 - единственное число
  if (lastDigit === 1) {
    return 'подразделение';
  }
  
  // Для чисел, оканчивающихся на 2, 3, 4 - единственное число в родительном падеже
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'подразделения';
  }
  
  // Для остальных - множественное число
  return 'подразделений';
};

function ChildrenListPanel({ node, onPositionSelect, onNodeSelect, onSuperiorUpdated }) {
  const [superiorInfo, setSuperiorInfo] = useState(null);
  const [availableSuperiors, setAvailableSuperiors] = useState([]);
  const [isEditingSuperior, setIsEditingSuperior] = useState(false);
  const [loadingSuperior, setLoadingSuperior] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Load superior information when node changes
  useEffect(() => {
    if (isFieldValueNode(node) && node.custom_field_value_id) {
      loadSuperiorInfo();
      loadAvailableSuperiors();
    } else {
      setSuperiorInfo(null);
      setAvailableSuperiors([]);
    }
  }, [node]);

  const loadSuperiorInfo = async () => {
    if (!node.custom_field_value_id) return;
    setLoadingSuperior(true);
    try {
      const response = await axios.get(`${API_BASE}/custom-field-values/${node.custom_field_value_id}/superior`);
      setSuperiorInfo(response.data);
    } catch (error) {
      console.error('Failed to load superior info:', error);
      setSuperiorInfo(null);
    } finally {
      setLoadingSuperior(false);
    }
  };

  const loadAvailableSuperiors = async () => {
    if (!node.custom_field_value_id) return;
    setLoadingAvailable(true);
    try {
      const response = await axios.get(`${API_BASE}/custom-field-values/${node.custom_field_value_id}/available-superiors`);
      setAvailableSuperiors(response.data || []);
    } catch (error) {
      console.error('Failed to load available superiors:', error);
      setAvailableSuperiors([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleUpdateSuperior = async (superiorId) => {
    if (!node.custom_field_value_id) return;
    setLoadingSuperior(true);
    try {
      await axios.put(`${API_BASE}/custom-field-values/${node.custom_field_value_id}/superior`, {
        superior: superiorId
      });
      await loadSuperiorInfo();
      setIsEditingSuperior(false);
      // Вызываем callback для обновления дерева с новым значением superior
      if (onSuperiorUpdated) {
        onSuperiorUpdated(superiorId);
      }
    } catch (error) {
      console.error('Failed to update superior:', error);
      alert('Ошибка при обновлении начальника: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingSuperior(false);
    }
  };

  const handleClearSuperior = async () => {
    if (!node.custom_field_value_id) return;
    setLoadingSuperior(true);
    try {
      await axios.put(`${API_BASE}/custom-field-values/${node.custom_field_value_id}/superior`, {
        superior: null
      });
      await loadSuperiorInfo();
      setIsEditingSuperior(false);
      // Вызываем callback для обновления дерева с null значением
      if (onSuperiorUpdated) {
        onSuperiorUpdated(null);
      }
    } catch (error) {
      console.error('Failed to clear superior:', error);
      alert('Ошибка при удалении начальника: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingSuperior(false);
    }
  };

  if (!node || !node.children || node.children.length === 0) {
    return (
      <div className="children-list-panel">
        <div className="empty-state">
          <p>Нет сотрудников</p>
        </div>
      </div>
    );
  }

  const handlePositionClick = (positionId) => {
    if (onPositionSelect) {
      onPositionSelect(positionId, null);
    }
  };

  const renderNode = (child, index) => {
    if (child.type === 'position') {
      // Проверяем наличие ФИО
      const hasEmployeeName = child.employee_full_name && 
                              typeof child.employee_full_name === 'string' && 
                              child.employee_full_name.trim() !== '';
      
      return (
        <div
          key={`position-${index}`}
          className="children-list-item children-list-item--position"
          onClick={() => handlePositionClick(child.position_id)}
        >
          <span className="children-list-item-id">
            {child.position_id && `#${child.position_id}`}
          </span>
          <span className="children-list-item-name">
            {child.position_name || 'Без названия'}
            {hasEmployeeName ? (
              <> — {child.employee_full_name}</>
            ) : (
              <span className="position-vacant"> — Вакант</span>
            )}
          </span>
        </div>
      );
    }

    if (isFieldValueNode(child)) {
      const totalPositions = countAllPositions(child);
      const totalSubdivisions = countAllSubdivisions(child);
      const hasChildren = child.children && child.children.length > 0;
      const handleFieldNodeClick = () => {
        if (onNodeSelect && hasChildren) {
          onNodeSelect(child);
        }
      };
      
      // Получаем комбинированное значение для отображения:
      // основное + прилинкованные значения через тире
      const displayValue = buildCombinedFieldLabel(child) || 'Без названия';
      
      // Формируем информацию о количестве (сначала подразделения, потом сотрудники)
      const countParts = [];
      if (totalSubdivisions > 0) {
        countParts.push(`${totalSubdivisions} ${getSubdivisionWord(totalSubdivisions)}`);
      }
      if (totalPositions > 0) {
        countParts.push(`${totalPositions} ${getEmployeeWord(totalPositions)}`);
      }
      
      return (
        <div
          key={`field-${index}`}
          className={`children-list-item children-list-item--field${hasChildren ? ' children-list-item--clickable' : ''}`}
          onClick={hasChildren ? handleFieldNodeClick : undefined}
        >
          <span className="children-list-item-name">
            {displayValue}
          </span>
          {countParts.length > 0 && (
            <span className="children-list-item-count">
              ({countParts.join(', ')})
            </span>
          )}
        </div>
      );
    }

    return null;
  };

  const getNodeTitle = (node) => {
    if (node.type === 'root') {
      return 'Все сотрудники';
    }
    if (node.type === 'position') {
      return node.position_name || `Должность #${node.position_id}`;
    }
    if (isFieldValueNode(node)) {
      // В заголовке узла показываем полное название:
      // основное значение и все прилинкованные значения через тире
      const combined = buildCombinedFieldLabel(node);
      return combined || 'Узел';
    }
    return 'Узел';
  };
  
  const nodeTitle = getNodeTitle(node);

  // Подсчитываем общее количество сотрудников
  const totalEmployees = countAllPositions(node);
  // Если узел сам является позицией, вычитаем его из общего количества
  const employeesCount = node.type === 'position' ? totalEmployees - 1 : totalEmployees;
  
  // Подсчитываем количество подразделений во всех уровнях
  const subdivisionsCount = countAllSubdivisions(node);
  
  // Формируем подзаголовок с информацией (сначала подразделения, потом сотрудники)
  const parts = [];
  if (subdivisionsCount > 0) {
    parts.push(`${subdivisionsCount} ${getSubdivisionWord(subdivisionsCount)}`);
  }
  if (employeesCount > 0) {
    parts.push(`${employeesCount} ${getEmployeeWord(employeesCount)}`);
  }
  
  const subtitleText = parts.length > 0 ? parts.join(', ') : '';

  // Разделяем детей на подразделения и сотрудников
  const subdivisions = node.children.filter(child => isFieldValueNode(child));
  const positions = node.children.filter(child => child.type === 'position');

  // Определяем начальника среди позиций
  // superiorInfo.superior - это число (int64), position_id - это строка
  const superiorId = superiorInfo?.superior != null ? Number(superiorInfo.superior) : null;
  const superiorPosition = superiorId != null 
    ? positions.find(pos => {
        if (!pos.position_id) return false;
        const posId = Number(pos.position_id);
        return !isNaN(posId) && posId === superiorId;
      })
    : null;
  const otherPositions = superiorPosition
    ? positions.filter(pos => {
        if (!pos.position_id) return true;
        const posId = Number(pos.position_id);
        return isNaN(posId) || posId !== superiorId;
      })
    : positions;

  return (
    <div className="children-list-panel">
      <div className="children-list-header">
        <h2 className="children-list-title">{nodeTitle}</h2>
        <div className="children-list-subtitle">{subtitleText}</div>
        {/* Superior section for custom_field_value nodes */}
        {isFieldValueNode(node) && node.custom_field_value_id && (
          <div className="children-list-superior">
            <div className="children-list-superior-label">Начальник:</div>
            {!isEditingSuperior ? (
              <div className="children-list-superior-display">
                {loadingSuperior ? (
                  <span>Загрузка...</span>
                ) : superiorInfo && superiorInfo.superior ? (
                  <div className="children-list-superior-info">
                    <span className="children-list-superior-name">
                      {superiorInfo.superior_name || `Должность #${superiorInfo.superior}`}
                    </span>
                    {superiorInfo.superior_employee && (
                      <span className="children-list-superior-employee">
                        {superiorInfo.superior_employee}
                      </span>
                    )}
                    <button
                      className="children-list-superior-edit-btn"
                      onClick={() => setIsEditingSuperior(true)}
                      type="button"
                    >
                      Изменить
                    </button>
                  </div>
                ) : (
                  <div className="children-list-superior-info">
                    <span className="children-list-superior-empty">Не назначен</span>
                    <button
                      className="children-list-superior-edit-btn"
                      onClick={() => setIsEditingSuperior(true)}
                      type="button"
                    >
                      Назначить
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="children-list-superior-edit">
                {loadingAvailable ? (
                  <span>Загрузка списка...</span>
                ) : (
                  <>
                    <select
                      className="children-list-superior-select"
                      value={superiorInfo?.superior || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value) {
                          handleUpdateSuperior(parseInt(value, 10));
                        } else {
                          handleClearSuperior();
                        }
                      }}
                    >
                      <option value="">Не назначен</option>
                      {availableSuperiors.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.name} {pos.employee_name ? `(${pos.employee_name})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      className="children-list-superior-cancel-btn"
                      onClick={() => setIsEditingSuperior(false)}
                      type="button"
                    >
                      Отмена
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="children-list-content">
        {/* Сначала показываем начальника (если он есть в списке позиций) */}
        {superiorPosition && renderNode(superiorPosition, 0)}
        {/* Затем показываем остальных сотрудников */}
        {otherPositions.map((child, index) => renderNode(child, (superiorPosition ? 1 : 0) + index))}
        {/* Затем показываем подразделения */}
        {subdivisions.map((child, index) => renderNode(child, (superiorPosition ? 1 : 0) + otherPositions.length + index))}
      </div>
    </div>
  );
}

export default ChildrenListPanel;

