import React from 'react';
import './TreeSelector.css';

function TreeSelector({ trees, selectedTreeId, onChange }) {
  return (
    <select
      className="tree-selector"
      value={selectedTreeId || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Должность</option>
      {trees.map(tree => (
        <option key={tree.id} value={tree.id}>
          {tree.name}
        </option>
      ))}
    </select>
  );
}

export default TreeSelector;


