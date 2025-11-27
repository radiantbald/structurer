import React, { useState } from 'react';
import TreePanel from './TreePanel';
import PositionDetailsPanel from './PositionDetailsPanel';
import ChildrenListPanel from './ChildrenListPanel';
import ResizableSplitter from './ResizableSplitter';
import TreeDefinitionForm from './TreeDefinitionForm';
import CustomFieldForm from './CustomFieldForm';
import PositionsListModal from './PositionsListModal';
import '../base.css';

function AppLayout() {
  const [selectedPositionId, setSelectedPositionId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [treeRefreshTrigger, setTreeRefreshTrigger] = useState(0);
  const [initialPath, setInitialPath] = useState(null);
  const [initialName, setInitialName] = useState(null);
  const [showTreeDefinition, setShowTreeDefinition] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [showPositionsList, setShowPositionsList] = useState(false);
  const [treeStructure, setTreeStructure] = useState(null);

  const handlePositionSelect = (positionId, path, name) => {
    setSelectedPositionId(positionId);
    setInitialPath(path || null);
    setInitialName(name || null);
    // Очищаем выбранный узел при выборе позиции
    setSelectedNode(null);
  };

  const handlePositionSaved = (savedPositionId) => {
    if (savedPositionId) {
      setSelectedPositionId(savedPositionId);
      // Очищаем выбранный узел, чтобы открылась карточка должности
      setSelectedNode(null);
      setInitialPath(null);
      setInitialName(null);
    }
    setRefreshTrigger(prev => prev + 1);
    setTreeRefreshTrigger(prev => prev + 1);
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

      // Если это узел field_value, проверяем его path
      if (currentNode.type === 'field_value' && currentNode.field_key && currentNode.field_value) {
        const newPath = { ...path, [currentNode.field_key]: currentNode.field_value };
        
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
      } else {
        // Для других типов узлов продолжаем поиск в детях
        for (const child of currentNode.children || []) {
          traverse(child, path);
        }
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
    setRefreshTrigger(prev => prev + 1);
    setTreeRefreshTrigger(prev => prev + 1);
  };

  const handlePositionCreated = (createdPositionId) => {
    setRefreshTrigger(prev => prev + 1);
    setTreeRefreshTrigger(prev => prev + 1);
    if (createdPositionId) {
      setSelectedPositionId(createdPositionId);
      // Очищаем выбранный узел, чтобы открылась карточка должности
      setSelectedNode(null);
      setInitialPath(null);
      setInitialName(null);
    }
  };

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    // Очищаем выбранную позицию при выборе узла
    setSelectedPositionId(null);
    setInitialPath(null);
    setInitialName(null);
  };

  const handleTreeStructureChange = (structure) => {
    setTreeStructure(structure);
  };

  const handleTreeDefinitionChanged = () => {
    setTreeRefreshTrigger(prev => prev + 1);
  };

  const handleCustomFieldsChanged = () => {
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
