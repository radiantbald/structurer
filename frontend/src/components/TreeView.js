import React, { useState } from 'react';
import TreeNode from './TreeNode';
import './TreeView.css';

function TreeView({ tree, onPositionSelect, onCreateFromNode, onNodeSelect, selectedNode, selectedPositionId, searchQuery, subtreeContainsMatchingPositions }) {
  const [newRootPositionName, setNewRootPositionName] = useState('');

  const handleRootQuickCreate = (e, nameOverride) => {
    e.stopPropagation();
    const sourceValue = typeof nameOverride === 'string' ? nameOverride : newRootPositionName;
    const trimmedName = sourceValue.trim();
    if (!trimmedName) {
      return;
    }
    onCreateFromNode({}, trimmedName);
    setNewRootPositionName('');
  };

  const handleRootQuickCreateKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRootQuickCreate(e, e.target.value);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setNewRootPositionName('');
    }
  };

  if (!tree || !tree.root) {
    return <div className="tree-view">Нет данных</div>;
  }

  return (
    <div className="tree-view">
      <TreeNode
        node={tree.root}
        level={0}
        path={{}}
        onPositionSelect={onPositionSelect}
        onCreateFromNode={onCreateFromNode}
        onNodeSelect={onNodeSelect}
        selectedNode={selectedNode}
        selectedPositionId={selectedPositionId}
        searchQuery={searchQuery}
        subtreeContainsMatchingPositions={subtreeContainsMatchingPositions}
      />
      <div
        className="tree-node-quick-create"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="tree-node-quick-input"
          placeholder="Добавить новую должность"
          value={newRootPositionName}
          onChange={(e) => setNewRootPositionName(e.target.value)}
          onKeyDown={handleRootQuickCreateKeyDown}
        />
        <button
          type="button"
          className={`btn btn-small tree-node-quick-create-button${
            newRootPositionName.trim() ? ' tree-node-quick-create-button--visible' : ''
          }`}
          onClick={handleRootQuickCreate}
          title="Быстро создать должность в корне дерева"
        >
          Создать
        </button>
      </div>
    </div>
  );
}

export default TreeView;

