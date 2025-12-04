import React, { useState } from 'react';
import TreePanel from './TreePanel';
import PositionDetailsPanel from './PositionDetailsPanel';
import ChildrenListPanel from './ChildrenListPanel';
import ResizableSplitter from './ResizableSplitter';
import TreeDefinitionForm from './TreeDefinitionForm';
import CustomFieldForm from './CustomFieldForm';
import PositionsListModal from './PositionsListModal';
import '../base.css';

const STORAGE_KEYS = {
  SELECTED_POSITION_ID: 'selectedPositionId',
  SELECTED_NODE_PATH: 'selectedNodePath',
};

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

function AppLayout() {
  // Восстанавливаем состояние из localStorage при инициализации
  const [selectedPositionId, setSelectedPositionId] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_POSITION_ID);
    return saved ? parseInt(saved, 10) : null;
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [treeRefreshTrigger, setTreeRefreshTrigger] = useState(0);
  const [initialPath, setInitialPath] = useState(null);
  const [initialName, setInitialName] = useState(null);
  const [showTreeDefinition, setShowTreeDefinition] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [showPositionsList, setShowPositionsList] = useState(false);
  const [treeStructure, setTreeStructure] = useState(null);
  const [deletedCustomField, setDeletedCustomField] = useState(null);
  const [savedNodePath, setSavedNodePath] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_NODE_PATH);
    return saved ? JSON.parse(saved) : null;
  });

  const handlePositionSelect = (positionId, path, name) => {
    setSelectedPositionId(positionId);
    setInitialPath(path || null);
    setInitialName(name || null);
    // Очищаем выбранный узел при выборе позиции
    setSelectedNode(null);
    // Сохраняем выбранную позицию в localStorage
    if (positionId) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_POSITION_ID, positionId.toString());
      localStorage.removeItem(STORAGE_KEYS.SELECTED_NODE_PATH);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_POSITION_ID);
    }
  };

  const handlePositionSaved = (savedPositionId) => {
    if (savedPositionId) {
      setSelectedPositionId(savedPositionId);
      // Очищаем выбранный узел, чтобы открылась карточка должности
      setSelectedNode(null);
      setInitialPath(null);
      setInitialName(null);
      // Сохраняем выбранную позицию в localStorage
      localStorage.setItem(STORAGE_KEYS.SELECTED_POSITION_ID, savedPositionId.toString());
      localStorage.removeItem(STORAGE_KEYS.SELECTED_NODE_PATH);
    }
    // Обновляем список должностей - TreePanel автоматически перестроит дерево локально
    setRefreshTrigger(prev => prev + 1);
  };

  // Функция для поиска родительского узла по path
  // Ищет узел field_value с максимальным префиксом targetPath, или корневой узел
  const findParentNode = (node, targetPath, currentPath = {}) => {
    if (!node) {
      return null;
    }

    // Если path пустой, возвращаем корневой узел
    if (!targetPath || Object.keys(targetPath).length === 0) {
      return node.type === 'root' ? node : null;
    }

    // Проверяем, является ли текущий path префиксом targetPath
    const isPathPrefix = (prefix, fullPath) => {
      for (const key in prefix) {
        if (fullPath[key] !== prefix[key]) {
          return false;
        }
      }
      return true;
    };

    let bestMatch = null;
    let bestPathLength = -1;

    // Рекурсивная функция для обхода дерева
    const traverse = (currentNode, path) => {
      if (!currentNode) {
        return;
      }

      // Если это узел field_value/custom_field_value, проверяем его path
      if (isFieldValueNode(currentNode)) {
        const nodeKV = getNodeKeyValue(currentNode);
        if (nodeKV) {
          const newPath = { ...path, [nodeKV.key]: nodeKV.value };
          
          // Проверяем, является ли этот path префиксом targetPath
          if (isPathPrefix(newPath, targetPath)) {
            const pathLength = Object.keys(newPath).length;
            // Если этот path длиннее текущего лучшего совпадения, обновляем
            if (pathLength > bestPathLength) {
              bestMatch = currentNode;
              bestPathLength = pathLength;
            }
          }

          // Продолжаем поиск в детях
          for (const child of currentNode.children || []) {
            traverse(child, newPath);
          }
          return;
        }
      }
      
      // Для других типов узлов продолжаем поиск в детях
      for (const child of currentNode.children || []) {
        traverse(child, path);
      }
    };

    traverse(node, currentPath);

    // Если нашли узел field_value, возвращаем его, иначе возвращаем корневой
    if (bestMatch) {
      return bestMatch;
    }
    
    return node.type === 'root' ? node : null;
  };

  const handlePositionDeleted = (positionPath) => {
    setSelectedPositionId(null);
    setInitialPath(null);
    setInitialName(null);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_POSITION_ID);
    
    // Находим ближайший родительский узел типа field_value
    let parentNode = null;
    if (treeStructure && treeStructure.root && positionPath) {
      parentNode = findParentNode(treeStructure.root, positionPath);
    }
    
    // Если не нашли родительский узел, используем корневой
    if (!parentNode && treeStructure && treeStructure.root) {
      parentNode = treeStructure.root;
    }
    
    setSelectedNode(parentNode);
    // Сохраняем путь выбранного узла
    if (parentNode && treeStructure) {
      const nodePath = buildNodePath(parentNode, treeStructure);
      if (nodePath) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_NODE_PATH, JSON.stringify(nodePath));
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_NODE_PATH);
      }
    }
    // Обновляем список должностей - TreePanel автоматически перестроит дерево локально
    setRefreshTrigger(prev => prev + 1);
  };

  const handlePositionCreated = (createdPositionId) => {
    if (createdPositionId) {
      setSelectedPositionId(createdPositionId);
      // Очищаем выбранный узел, чтобы открылась карточка должности
      setSelectedNode(null);
      setInitialPath(null);
      setInitialName(null);
      // Сохраняем выбранную позицию в localStorage
      localStorage.setItem(STORAGE_KEYS.SELECTED_POSITION_ID, createdPositionId.toString());
      localStorage.removeItem(STORAGE_KEYS.SELECTED_NODE_PATH);
    }
    // Обновляем список должностей - TreePanel автоматически перестроит дерево локально
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    // Очищаем выбранную позицию при выборе узла
    setSelectedPositionId(null);
    setInitialPath(null);
    setInitialName(null);
    // Сохраняем путь выбранного узла в localStorage
    if (node && treeStructure) {
      const nodePath = buildNodePath(node, treeStructure);
      if (nodePath) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_NODE_PATH, JSON.stringify(nodePath));
        localStorage.removeItem(STORAGE_KEYS.SELECTED_POSITION_ID);
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_NODE_PATH);
    }
  };

  const handleTreeStructureChange = (structure) => {
    setTreeStructure(structure);
    
    // Восстанавливаем выбранный узел после загрузки структуры дерева
    if (structure && savedNodePath && !selectedPositionId) {
      const node = findNodeByPath(structure.root, savedNodePath);
      if (node) {
        setSelectedNode(node);
        setSavedNodePath(null); // Очищаем сохраненный путь после восстановления
      }
    }
  };

  // Функция для построения пути узла
  const buildNodePath = (node, structure) => {
    if (!node || node.type === 'root' || !structure || !structure.root) {
      return null;
    }
    
    // Для узлов field_value/custom_field_value собираем путь из ключа и значения
    if (isFieldValueNode(node)) {
      const nodeKV = getNodeKeyValue(node);
      if (nodeKV) {
        // Находим путь, обходя дерево от корня до этого узла
        const findPath = (currentNode, targetNode, currentPath = {}) => {
          if (currentNode === targetNode) {
            return currentPath;
          }
          
          if (currentNode.children) {
            for (const child of currentNode.children) {
              if (isFieldValueNode(child)) {
                const childKV = getNodeKeyValue(child);
                if (childKV) {
                  const newPath = { ...currentPath, [childKV.key]: childKV.value };
                  const result = findPath(child, targetNode, newPath);
                  if (result) {
                    return result;
                  }
                }
              } else {
                const result = findPath(child, targetNode, currentPath);
                if (result) {
                  return result;
                }
              }
            }
          }
          return null;
        };
        
        return findPath(structure.root, node);
      }
    }
    
    return null;
  };

  // Функция для поиска узла по пути
  const findNodeByPath = (root, path) => {
    if (!root || !path || Object.keys(path).length === 0) {
      return root && root.type === 'root' ? root : null;
    }
    
    const traverse = (node, remainingPath, currentPath = {}) => {
      if (!node) {
        return null;
      }
      
      // Проверяем, совпадает ли текущий путь с искомым
      const pathMatches = (path1, path2) => {
        if (Object.keys(path1).length !== Object.keys(path2).length) {
          return false;
        }
        for (const key in path1) {
          if (path1[key] !== path2[key]) {
            return false;
          }
        }
        return true;
      };
      
      if (isFieldValueNode(node)) {
        const nodeKV = getNodeKeyValue(node);
        if (nodeKV) {
          const newPath = { ...currentPath, [nodeKV.key]: nodeKV.value };
          
          if (pathMatches(newPath, path)) {
            return node;
          }
          
          // Проверяем, является ли newPath префиксом искомого пути
          const isPrefix = (prefix, full) => {
            for (const key in prefix) {
              if (full[key] !== prefix[key]) {
                return false;
              }
            }
            return true;
          };
          
          if (isPrefix(newPath, path)) {
            // Продолжаем поиск в детях
            if (node.children) {
              for (const child of node.children) {
                const result = traverse(child, path, newPath);
                if (result) {
                  return result;
                }
              }
            }
          }
        }
      } else {
        // Для других типов узлов продолжаем поиск в детях
        if (node.children) {
          for (const child of node.children) {
            const result = traverse(child, path, currentPath);
            if (result) {
              return result;
            }
          }
        }
      }
      
      return null;
    };
    
    return traverse(root, path);
  };

  const handleTreeDefinitionChanged = () => {
    setTreeRefreshTrigger(prev => prev + 1);
  };

  const handleCustomFieldsChanged = (event) => {
    // Сохраняем информацию об удалённом поле (если есть), чтобы реактивно почистить дерево и должности
    if (event && event.type === 'deleted' && event.field) {
      setDeletedCustomField(event.field);
    }
    // На всякий случай всё равно перезагружаем должности с бэка
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="app-shell">
      <div className="app-body">
        <ResizableSplitter
          leftPanel={
            <TreePanel
              onPositionSelect={handlePositionSelect}
              refreshTrigger={refreshTrigger}
              treeRefreshTrigger={treeRefreshTrigger}
              onShowTreeDefinition={() => setShowTreeDefinition(true)}
              onShowCustomFields={() => setShowCustomFields(true)}
              onPositionCreated={handlePositionCreated}
              onNodeSelect={handleNodeSelect}
              selectedNode={selectedNode}
              selectedPositionId={selectedPositionId}
              onTreeStructureChange={handleTreeStructureChange}
              deletedCustomField={deletedCustomField}
            />
          }
          rightPanel={
            selectedNode ? (
              <ChildrenListPanel
                node={selectedNode}
                onPositionSelect={handlePositionSelect}
                onNodeSelect={handleNodeSelect}
              />
            ) : (
              <PositionDetailsPanel
                positionId={selectedPositionId}
                onSaved={handlePositionSaved}
                onDeleted={handlePositionDeleted}
                initialPath={initialPath}
                initialName={initialName}
                deletedCustomField={deletedCustomField}
              />
            )
          }
        />
      </div>

      {showTreeDefinition && (
        <TreeDefinitionForm
          onClose={() => setShowTreeDefinition(false)}
          onChanged={handleTreeDefinitionChanged}
        />
      )}

      {showCustomFields && (
        <CustomFieldForm
          onClose={() => setShowCustomFields(false)}
          onSuccess={handleCustomFieldsChanged}
        />
      )}

      {showPositionsList && (
        <PositionsListModal
          onClose={() => setShowPositionsList(false)}
        />
      )}
    </div>
  );
}

export default AppLayout;
