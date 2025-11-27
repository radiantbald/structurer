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
    }
    setRefreshTrigger(prev => prev + 1);
    setTreeRefreshTrigger(prev => prev + 1);
  };

  const handlePositionDeleted = () => {
    setSelectedPositionId(null);
    setRefreshTrigger(prev => prev + 1);
    setTreeRefreshTrigger(prev => prev + 1);
  };

  const handlePositionCreated = (createdPositionId) => {
    setRefreshTrigger(prev => prev + 1);
    setTreeRefreshTrigger(prev => prev + 1);
    if (createdPositionId) {
      setSelectedPositionId(createdPositionId);
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
