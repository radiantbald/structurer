import React from 'react';
import './TreeControls.css';

function TreeControls({ onShowCustomFields, onShowTreeDefinition }) {
  return (
    <div className="tree-panel-actions">
      <button
        className="btn btn-secondary btn-small"
        onClick={onShowCustomFields}
        type="button"
      >
        Кастомные поля
      </button>
      <button
        className="btn btn-secondary btn-small"
        onClick={onShowTreeDefinition}
        type="button"
      >
        Деревья
      </button>
    </div>
  );
}

export default TreeControls;


