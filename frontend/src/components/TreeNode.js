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

// Вспомогательная функция для рекурсивного поиска узла в поддереве (вынесена наружу для стабильности)
const findNodeInSubtree = (currentNode, targetNode) => {
  if (!currentNode || !targetNode) return false;
  
  // Проверяем, соответствует ли текущий узел целевому
  if (isFieldValueNode(currentNode) && isFieldValueNode(targetNode)) {
    const current = getNodeKeyValue(currentNode);
    const target = getNodeKeyValue(targetNode);
    if (current && target && current.key === target.key && current.value === target.value) {
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
        const nodeKV = getNodeKeyValue(node);
        const selectedKV = getNodeKeyValue(selectedNode);
        const isSelected = nodeKV && selectedKV && 
                          nodeKV.key === selectedKV.key && 
                          nodeKV.value === selectedKV.value;
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
    onCreateFromNode(path, null);
  };

  const handleQuickCreateFromNode = (e, newPath, nameOverride) => {
    e.stopPropagation();
    const sourceValue = typeof nameOverride === 'string' ? nameOverride : newPositionName;
    const trimmedName = sourceValue.trim();
    if (!trimmedName) {
      return;
    }
    onCreateFromNode(newPath, trimmedName);
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
            {node.children && node.children.map((child, index) => (
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
    const nodeKV = getNodeKeyValue(node);
    const newPath = { ...path };
    if (nodeKV) {
      newPath[nodeKV.key] = nodeKV.value;
    }

    const hasChildren = node.children && node.children.length > 0;
    
    // Разделяем детей на должности и дочерние узлы
    const positionChildren = hasChildren 
      ? node.children.filter(child => child.type === 'position')
      : [];
    const fieldValueChildren = hasChildren
      ? node.children.filter(child => isFieldValueNode(child))
      : [];
    
    // Подсчитываем все позиции во всех дочерних уровнях
    const totalPositions = countAllPositions(node);
    
    // Проверяем, является ли текущий узел выбранным
    const selectedKV = selectedNode ? getNodeKeyValue(selectedNode) : null;
    const isSelected = selectedKV && nodeKV && 
                      selectedKV.key === nodeKV.key && 
                      selectedKV.value === nodeKV.value;
    
    // Получаем значение для отображения
    const displayValue = nodeKV ? nodeKV.value : (node.custom_field_value || node.field_value || '');

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
            {/* Сначала показываем должности */}
            {positionChildren.map((child, index) => (
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
            {fieldValueChildren.map((child, index) => (
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

