import React from 'react';
import './ChildrenListPanel.css';

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

function ChildrenListPanel({ node, onPositionSelect, onNodeSelect }) {
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
      
      // Получаем значение для отображения
      const nodeKV = getNodeKeyValue(child);
      const displayValue = nodeKV ? nodeKV.value : (child.custom_field_value || child.field_value || 'Без названия');
      
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
      const nodeKV = getNodeKeyValue(node);
      return nodeKV ? nodeKV.value : (node.custom_field_value || node.field_value || 'Узел');
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

  return (
    <div className="children-list-panel">
      <div className="children-list-header">
        <h2 className="children-list-title">{nodeTitle}</h2>
        <div className="children-list-subtitle">{subtitleText}</div>
      </div>
      <div className="children-list-content">
        {/* Сначала показываем подразделения */}
        {subdivisions.map((child, index) => renderNode(child, index))}
        {/* Затем показываем сотрудников */}
        {positions.map((child, index) => renderNode(child, subdivisions.length + index))}
      </div>
    </div>
  );
}

export default ChildrenListPanel;

