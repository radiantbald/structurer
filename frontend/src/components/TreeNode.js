import React, { useState, useEffect, useCallback } from 'react';
import './TreeNode.css';

// Вспомогательная функция для получения ключа и значения узла (поддержка старого и нового формата)
const getNodeKeyValue = (node) => {
  if (node.custom_field_key && node.custom_field_value) {
    return { key: node.custom_field_key, value: node.custom_field_value };
  }
  if (node.field_key && node.field_value) {
    return { key: node.field_key, value: node.field_value };
  }
  return null;
};

// Вспомогательная функция для проверки типа узла поля (поддержка старого и нового формата)
const isFieldValueNode = (node) => {
  return node.type === 'field_value' || node.type === 'custom_field_value';
};

// Генерирует уникальный идентификатор узла на основе ключа, значения и всех прилинкованных значений
// Это позволяет различать узлы с одинаковым основным значением, но разными прилинкованными полями
const getNodeUniqueId = (node) => {
  if (!isFieldValueNode(node)) {
    return null;
  }
  
  const nodeKV = getNodeKeyValue(node);
  if (!nodeKV) {
    return null;
  }
  
  // Базовый идентификатор: ключ + значение
  let uniqueId = `${nodeKV.key}:${nodeKV.value}`;
  
  // Добавляем все ID прилинкованных значений для уникальности
  if (node.linked_custom_fields && Array.isArray(node.linked_custom_fields)) {
    const linkedValueIds = [];
    
    node.linked_custom_fields.forEach((lf) => {
      if (lf && Array.isArray(lf.linked_custom_field_values)) {
        lf.linked_custom_field_values.forEach((lv) => {
          if (lv && lv.linked_custom_field_value_id) {
            // Используем ID прилинкованного значения для уникальности
            linkedValueIds.push(lv.linked_custom_field_value_id);
          }
        });
      }
    });
    
    // Сортируем ID для стабильности сравнения
    if (linkedValueIds.length > 0) {
      linkedValueIds.sort();
      uniqueId += '|' + linkedValueIds.join(',');
    }
  }
  
  return uniqueId;
};

// Формирование комбинированного названия узла на фронтенде
// из custom_field_value и linked_custom_fields[].linked_custom_field_values[].linked_custom_field_value
const buildCombinedFieldLabel = (node) => {
  const nodeKV = getNodeKeyValue(node);
  const baseValue =
    (nodeKV && nodeKV.value) ||
    node.custom_field_value ||
    node.field_value || // поддержка старых данных, если вдруг ещё придут
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

// Вспомогательная функция для рекурсивного поиска узла в поддереве (вынесена наружу для стабильности)
const findNodeInSubtree = (currentNode, targetNode) => {
  if (!currentNode || !targetNode) return false;
  
  // Проверяем, соответствует ли текущий узел целевому
  if (isFieldValueNode(currentNode) && isFieldValueNode(targetNode)) {
    const currentId = getNodeUniqueId(currentNode);
    const targetId = getNodeUniqueId(targetNode);
    if (currentId && targetId && currentId === targetId) {
      return true;
    }
  }
  
  // Рекурсивно проверяем детей
  if (currentNode.children) {
    return currentNode.children.some(child => findNodeInSubtree(child, targetNode));
  }
  
  return false;
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

function TreeNode({ node, level, path, onPositionSelect, onCreateFromNode, onNodeSelect, selectedNode, selectedPositionId, searchQuery, subtreeContainsMatchingPositions }) {
  const [expanded, setExpanded] = useState(level < 2);
  const [newPositionName, setNewPositionName] = useState('');

  // Функция для проверки, содержит ли узел выбранную позицию
  const containsSelectedPosition = useCallback((currentNode, positionId) => {
    if (!currentNode || !positionId) return false;
    
    // Проверяем, является ли текущий узел выбранной позицией
    if (currentNode.type === 'position' && currentNode.position_id === String(positionId)) {
      return true;
    }
    
    // Рекурсивно проверяем дочерние узлы
    if (currentNode.children) {
      return currentNode.children.some(child => containsSelectedPosition(child, positionId));
    }
    
    return false;
  }, []);

  // Автоматически разворачиваем узел, если он выбран или находится на пути к выбранному узлу/позиции
  useEffect(() => {
    if (isFieldValueNode(node)) {
      let shouldExpand = false;
      
      // Проверяем выбранный узел
      if (selectedNode) {
        const nodeId = getNodeUniqueId(node);
        const selectedId = getNodeUniqueId(selectedNode);
        const isSelected = nodeId && selectedId && nodeId === selectedId;
        const isOnPath = findNodeInSubtree(node, selectedNode);
        shouldExpand = isSelected || isOnPath;
      }
      
      // Проверяем выбранную позицию
      if (!shouldExpand && selectedPositionId && containsSelectedPosition(node, selectedPositionId)) {
        shouldExpand = true;
      }
      
      // Проверяем, содержит ли узел позиции, соответствующие поиску
      if (!shouldExpand && searchQuery && searchQuery.trim() && subtreeContainsMatchingPositions) {
        if (subtreeContainsMatchingPositions(node, searchQuery)) {
          shouldExpand = true;
        }
      }
      
      if (shouldExpand) {
        setExpanded(true);
      }
    }
  }, [selectedNode, selectedPositionId, node, containsSelectedPosition, searchQuery, subtreeContainsMatchingPositions]);

  const handleToggle = (e) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handlePositionClick = (e) => {
    e.stopPropagation();
    if (node.type === 'position' && node.position_id) {
      onPositionSelect(node.position_id, null);
    }
    // Для позиций не показываем дочерние элементы при клике - только детали позиции
  };

  const handleNodeClick = (e) => {
    e.stopPropagation();
    // Показываем дочерние элементы при клике на узел
    if (onNodeSelect && node.children && node.children.length > 0) {
      onNodeSelect(node);
    }
  };

  const handleCreateFromNode = (e) => {
    e.stopPropagation();
    // Передаём не только path, но и сам узел, чтобы при быстром создании
    // можно было точно восстановить нужные custom_fields (включая прилинкованные).
    onCreateFromNode(path, null, node);
  };

  const handleQuickCreateFromNode = (e, newPath, nameOverride) => {
    e.stopPropagation();
    const sourceValue = typeof nameOverride === 'string' ? nameOverride : newPositionName;
    const trimmedName = sourceValue.trim();
    if (!trimmedName) {
      return;
    }
    // Третьим параметром также передаём исходный узел дерева
    // (field_value/custom_field_value), чтобы на уровне TreePanel
    // можно было достроить структуру custom_fields без нестрогого парсинга текста.
    onCreateFromNode(newPath, trimmedName, node);
    setNewPositionName('');
  };

  const handleQuickCreateKeyDown = (e, newPath) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickCreateFromNode(e, newPath, e.target.value);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setNewPositionName('');
    }
  };

  if (node.type === 'root') {
    return (
      <div className="tree-node-root">
            {node.children && node.children
              .filter(child => {
                // Если нет поискового запроса, показываем все узлы
                if (!searchQuery || !searchQuery.trim()) {
                  return true;
                }
                // Если есть поиск, показываем только узлы, которые содержат соответствующие позиции
                return subtreeContainsMatchingPositions ? subtreeContainsMatchingPositions(child, searchQuery) : true;
              })
              .map((child, index) => (
                <TreeNode
                  key={index}
                  node={child}
                  level={level + 1}
                  path={path}
                  onPositionSelect={onPositionSelect}
                  onCreateFromNode={onCreateFromNode}
                  onNodeSelect={onNodeSelect}
                  selectedNode={selectedNode}
                  selectedPositionId={selectedPositionId}
                  searchQuery={searchQuery}
                  subtreeContainsMatchingPositions={subtreeContainsMatchingPositions}
                />
              ))}
      </div>
    );
  }

  if (node.type === 'position') {
    const totalPositions = countAllPositions(node);
    const hasPositionChildren = totalPositions > 1; // Больше 1, так как сама позиция тоже считается
    const isSelected = selectedPositionId && node.position_id === String(selectedPositionId);
    
    // Проверяем наличие ФИО
    const hasEmployeeName = node.employee_full_name && 
                            typeof node.employee_full_name === 'string' && 
                            node.employee_full_name.trim() !== '';
    
    return (
      <div
        className={`tree-node tree-node-position tree-node-level-${level}${hasPositionChildren ? ' tree-node-clickable' : ''}${isSelected ? ' tree-node-position-selected' : ''}`.trim()}
        onClick={handlePositionClick}
      >
        <span className="tree-node-label">
          {node.position_id && (
            <span className="position-id">#{node.position_id}</span>
          )}
          {node.position_name}
          {hasEmployeeName ? (
            <> — {node.employee_full_name}</>
          ) : (
            <span className="position-vacant"> Вакант</span>
          )}
        </span>
        {hasPositionChildren && (
          <span className="tree-node-children-indicator">
            ({totalPositions - 1}) {/* Вычитаем саму позицию */}
          </span>
        )}
      </div>
    );
  }

  if (isFieldValueNode(node)) {
    // Если есть поисковый запрос, проверяем, содержит ли узел соответствующие позиции
    // Если нет - скрываем узел
    if (searchQuery && searchQuery.trim() && subtreeContainsMatchingPositions) {
      if (!subtreeContainsMatchingPositions(node, searchQuery)) {
        return null; // Скрываем узел, если он не содержит соответствующих позиций
      }
    }

    const nodeKV = getNodeKeyValue(node);
    const newPath = { ...path };
    if (nodeKV) {
      // Для быстрого создания должности важно передавать в path комбинированное значение:
      // "Основное - Прилинк1 - Прилинк2".
      // Именно такой формат ожидает convertCustomFieldsObjectToArray:
      // он разбивает строку, берёт основное значение и список прилинкованных,
      // и по ним находит нужные value_id как для основного, так и для linked‑полей.
      const combinedLabel = buildCombinedFieldLabel(node);
      newPath[nodeKV.key] = combinedLabel;
    }

    const hasChildren = node.children && node.children.length > 0;
    
    // Разделяем детей на должности и дочерние узлы
    const allPositionChildren = hasChildren 
      ? node.children.filter(child => child.type === 'position')
      : [];
    const fieldValueChildren = hasChildren
      ? node.children.filter(child => isFieldValueNode(child))
      : [];
    
    // Определяем начальника среди позиций (если у узла есть superior)
    const superiorId = node.superior != null ? Number(node.superior) : null;
    const superiorPosition = superiorId != null 
      ? allPositionChildren.find(pos => {
          if (!pos.position_id) return false;
          const posId = Number(pos.position_id);
          return !isNaN(posId) && posId === superiorId;
        })
      : null;
    const otherPositions = superiorPosition
      ? allPositionChildren.filter(pos => {
          if (!pos.position_id) return true;
          const posId = Number(pos.position_id);
          return isNaN(posId) || posId !== superiorId;
        })
      : allPositionChildren;
    
    // Порядок: сначала начальник, затем остальные сотрудники
    const positionChildren = superiorPosition 
      ? [superiorPosition, ...otherPositions]
      : otherPositions;
    
    // Подсчитываем все позиции во всех дочерних уровнях
    const totalPositions = countAllPositions(node);
    
    // Проверяем, является ли текущий узел выбранным
    // Используем уникальный идентификатор, чтобы учитывать прилинкованные поля
    const selectedId = selectedNode ? getNodeUniqueId(selectedNode) : null;
    const currentNodeId = getNodeUniqueId(node);
    const isSelected = selectedId && currentNodeId && selectedId === currentNodeId;
    
    // Комбинированное название формируем исключительно на фронтенде
    // из custom_field_value и linked_custom_field_value.
    const displayValue = buildCombinedFieldLabel(node);

    return (
      <div className={`tree-node tree-node-field tree-node-level-${level}`}>
        <div 
          className={`tree-node-header${isSelected ? ' tree-node-field-selected' : ''}`}
          onClick={hasChildren ? handleNodeClick : handleToggle}
        >
          <span className="tree-node-icon">
            {hasChildren ? (expanded ? '📂' : '📁') : '📁'}
          </span>
          <span className="tree-node-label">
            {displayValue}
          </span>
          {totalPositions > 0 && (
            <>
              <span className="tree-node-children-count">
                ({totalPositions})
              </span>
              <span className="tree-node-toggle" onClick={handleToggle}>
                {expanded ? '▼' : '▶'}
              </span>
            </>
          )}
          {totalPositions === 0 && hasChildren && (
            <span className="tree-node-toggle" onClick={handleToggle}>
              {expanded ? '▼' : '▶'}
            </span>
          )}
        </div>
        {expanded && (
          <div className="tree-node-children">
            {/* Сначала показываем должности (фильтруем по поиску, если есть) */}
            {positionChildren
              .filter(child => {
                // Если нет поискового запроса, показываем все позиции
                if (!searchQuery || !searchQuery.trim()) {
                  return true;
                }
                // Если есть поиск, показываем только соответствующие позиции
                // Используем subtreeContainsMatchingPositions для проверки позиции
                return subtreeContainsMatchingPositions ? subtreeContainsMatchingPositions(child, searchQuery) : true;
              })
              .map((child, index) => (
                <TreeNode
                  key={`position-${index}`}
                  node={child}
                  level={level + 1}
                  path={newPath}
                  onPositionSelect={onPositionSelect}
                  onCreateFromNode={onCreateFromNode}
                  onNodeSelect={onNodeSelect}
                  selectedNode={selectedNode}
                  selectedPositionId={selectedPositionId}
                  searchQuery={searchQuery}
                  subtreeContainsMatchingPositions={subtreeContainsMatchingPositions}
                />
              ))}
            {/* Затем действия (форма быстрого создания) */}
            <div
              className="tree-node-quick-create"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                className="tree-node-quick-input"
                placeholder="Добавить новую должность"
                value={newPositionName}
                onChange={(e) => setNewPositionName(e.target.value)}
                onKeyDown={(e) => handleQuickCreateKeyDown(e, newPath)}
              />
              <button
                type="button"
                className={`btn btn-small tree-node-quick-create-button${
                  newPositionName.trim() ? ' tree-node-quick-create-button--visible' : ''
                }`}
                onClick={(e) => handleQuickCreateFromNode(e, newPath)}
                title="Быстро создать должность в этой ветке"
              >
                Создать
              </button>
            </div>
            {/* В конце показываем дочерние узлы (custom_field_value/field_value) */}
            {/* Фильтруем дочерние узлы по поиску: показываем только те, которые содержат соответствующие позиции */}
            {fieldValueChildren
              .filter(child => {
                // Если нет поискового запроса, показываем все узлы
                if (!searchQuery || !searchQuery.trim()) {
                  return true;
                }
                // Если есть поиск, показываем только узлы, которые содержат соответствующие позиции
                return subtreeContainsMatchingPositions ? subtreeContainsMatchingPositions(child, searchQuery) : true;
              })
              .map((child, index) => (
                <TreeNode
                  key={`field-${index}`}
                  node={child}
                  level={level + 1}
                  path={newPath}
                  onPositionSelect={onPositionSelect}
                  onCreateFromNode={onCreateFromNode}
                  onNodeSelect={onNodeSelect}
                  selectedNode={selectedNode}
                  selectedPositionId={selectedPositionId}
                  searchQuery={searchQuery}
                  subtreeContainsMatchingPositions={subtreeContainsMatchingPositions}
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default TreeNode;

