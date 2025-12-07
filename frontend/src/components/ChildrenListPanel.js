import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ChildrenListPanel.css';
import pencilIcon from '../assets/images/pencil.png';

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
  const [loadingSuperior, setLoadingSuperior] = useState(false);
  const [isEditingNode, setIsEditingNode] = useState(false);
  const [pendingSuperiorId, setPendingSuperiorId] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const loadSuperiorInfo = async () => {
    if (!node || !node.custom_field_value_id) return;
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

  // Load superior information when node changes
  useEffect(() => {
    if (isFieldValueNode(node) && node.custom_field_value_id) {
      loadSuperiorInfo();
    } else {
      setSuperiorInfo(null);
    }
    // Сбрасываем режим редактирования и изменения при смене узла
    setIsEditingNode(false);
    setPendingSuperiorId(null);
    setHasChanges(false);
  }, [node]);


  if (!node || !node.children || node.children.length === 0) {
    return (
      <div className="children-list-panel">
        <div className="empty-state">
          <p>Нет сотрудников</p>
        </div>
      </div>
    );
  }

  const handlePositionClick = (positionId, e) => {
    // Предотвращаем клик, если кликнули на кнопку
    if (e && e.target.closest('.children-list-item-superior-btn')) {
      return;
    }
    if (onPositionSelect) {
      onPositionSelect(positionId, null);
    }
  };

  // Определяем начальника среди позиций для использования в renderNode
  // Используем pendingSuperiorId если есть изменения, иначе из superiorInfo
  // superiorInfo.superior - это число (int64), position_id - это строка
  const superiorId = pendingSuperiorId !== null
    ? (pendingSuperiorId !== undefined ? Number(pendingSuperiorId) : null)
    : (superiorInfo?.superior != null ? Number(superiorInfo.superior) : null);

  const handleToggleSuperior = (positionId, e) => {
    e.stopPropagation();
    if (!node.custom_field_value_id) return;
    
    // Получаем текущий superiorId (используем pendingSuperiorId если есть изменения, иначе из superiorInfo)
    const currentSuperiorId = pendingSuperiorId !== null 
      ? (pendingSuperiorId !== undefined ? Number(pendingSuperiorId) : null)
      : (superiorInfo?.superior != null ? Number(superiorInfo.superior) : null);
    
    const isCurrentlySuperior = currentSuperiorId !== null && positionId !== null && currentSuperiorId === positionId;
    const newSuperiorId = isCurrentlySuperior ? null : positionId;
    
    // Сохраняем изменения локально, не применяем сразу
    setPendingSuperiorId(newSuperiorId);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!node.custom_field_value_id || !hasChanges) return;
    
    setLoadingSuperior(true);
    try {
      await axios.put(`${API_BASE}/custom-field-values/${node.custom_field_value_id}/superior`, {
        superior: pendingSuperiorId
      });
      await loadSuperiorInfo();
      // Вызываем callback для обновления дерева
      if (onSuperiorUpdated) {
        onSuperiorUpdated(pendingSuperiorId);
      }
      // Сбрасываем изменения
      setPendingSuperiorId(null);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to update superior:', error);
      alert('Ошибка при обновлении начальника: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingSuperior(false);
    }
  };

  const handleCancel = () => {
    // Отменяем изменения и выходим из режима редактирования
    setPendingSuperiorId(null);
    setHasChanges(false);
    setIsEditingNode(false);
  };

  const renderNode = (child, index) => {
    if (child.type === 'position') {
      // Проверяем наличие ФИО
      const hasEmployeeName = child.employee_full_name && 
                              typeof child.employee_full_name === 'string' && 
                              child.employee_full_name.trim() !== '';
      
      // Проверяем, является ли эта должность начальником
      const positionId = child.position_id ? Number(child.position_id) : null;
      const isSuperior = superiorId !== null && positionId !== null && superiorId === positionId;
      
      return (
        <div
          key={`position-${index}`}
          className={`children-list-item children-list-item--position ${isSuperior ? 'children-list-item--superior' : ''}`}
          onClick={(e) => handlePositionClick(child.position_id, e)}
        >
          <div className="children-list-item-content">
            <span className="children-list-item-id">
              {child.position_id && `#${child.position_id}`}
            </span>
            <span className="children-list-item-name">
              {isSuperior && <span className="superior-star">⭐</span>}
              {child.position_name || 'Без названия'}
              {hasEmployeeName ? (
                <> — {child.employee_full_name}</>
              ) : (
                <span className="position-vacant"> — Вакант</span>
              )}
            </span>
          </div>
          {isFieldValueNode(node) && node.custom_field_value_id && isEditingNode && (
            <button
              className="children-list-item-superior-btn"
              onClick={(e) => handleToggleSuperior(positionId, e)}
              type="button"
              disabled={loadingSuperior}
            >
              {isSuperior ? 'Сделать должность рядовой' : 'Сделать должность руководящей'}
            </button>
          )}
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
  
  // Сортируем позиции так, чтобы superior была первой
  const sortedPositions = [...positions].sort((a, b) => {
    const aId = a.position_id ? Number(a.position_id) : null;
    const bId = b.position_id ? Number(b.position_id) : null;
    
    // Если есть superiorId и одна из позиций является superior, она должна быть первой
    if (superiorId !== null) {
      if (aId === superiorId) return -1; // a - superior, ставим первым
      if (bId === superiorId) return 1;  // b - superior, ставим первым
    }
    
    // Остальные позиции сохраняют исходный порядок
    return 0;
  });

  return (
    <div className="children-list-panel">
      <div className="children-list-header">
        <div className="children-list-header-content">
          <h2 className="children-list-title">{nodeTitle}</h2>
          <div className="children-list-subtitle">{subtitleText}</div>
        </div>
        {isFieldValueNode(node) && node.custom_field_value_id && (
          <div className="children-list-header-actions">
            {!isEditingNode ? (
              <button
                className="btn btn-icon-ghost"
                onClick={() => setIsEditingNode(true)}
                type="button"
                title="Редактировать узел"
              >
                <img src={pencilIcon} alt="Редактировать" className="pencil-icon" />
              </button>
            ) : (
              <div className="children-list-actions-vertical">
                <button
                  className="btn btn-icon-ghost"
                  onClick={handleCancel}
                  type="button"
                  title="Отмена"
                  disabled={loadingSuperior}
                >
                  <svg className="icon-cross" width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  className="btn btn-icon-ghost"
                  onClick={handleSave}
                  type="button"
                  title="Сохранить"
                  disabled={!hasChanges || loadingSuperior}
                >
                  <svg className="icon-save" width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="children-list-content">
        {/* Показываем все позиции вместе (начальник будет выделен визуально) */}
        {sortedPositions.map((child, index) => renderNode(child, index))}
        {/* Затем показываем подразделения */}
        {subdivisions.map((child, index) => renderNode(child, sortedPositions.length + index))}
      </div>
    </div>
  );
}

export default ChildrenListPanel;

