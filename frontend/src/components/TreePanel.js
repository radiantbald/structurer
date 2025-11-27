import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TreeView from './TreeView';
import TreeSelector from './TreeSelector';
import './TreePanel.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';

function TreePanel({ onPositionSelect, refreshTrigger, treeRefreshTrigger, onShowTreeDefinition, onShowCustomFields, onPositionCreated, onNodeSelect, selectedNode, selectedPositionId, onTreeStructureChange }) {
  const [trees, setTrees] = useState([]);
  const [selectedTreeId, setSelectedTreeId] = useState(null);
  const [treeStructure, setTreeStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);

  useEffect(() => {
    loadTrees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeRefreshTrigger]);

  useEffect(() => {
    if (selectedTreeId) {
      loadTreeStructure(selectedTreeId);
    } else {
      setTreeStructure(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreeId, refreshTrigger]);

  const loadTrees = async () => {
    try {
      const response = await axios.get(`${API_BASE}/trees`);
      const treesData = response.data || [];
      setTrees(treesData);

      // если уже выбрано дерево, пробуем сохранить выбор
      if (selectedTreeId && treesData.some(t => t.id === selectedTreeId)) {
        return;
      }

      const defaultTree = treesData.find(t => t.is_default);
      if (defaultTree) {
        setSelectedTreeId(defaultTree.id);
      } else if (treesData.length > 0) {
        setSelectedTreeId(treesData[0].id);
      } else {
        setSelectedTreeId(null);
        setTreeStructure(null);
      }
    } catch (error) {
      console.error('Failed to load trees:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTreeStructure = async (treeId) => {
    if (!treeId) {
      setTreeStructure(null);
      setLoadingTree(false);
      if (onTreeStructureChange) {
        onTreeStructureChange(null);
      }
      return;
    }
    try {
      setLoadingTree(true);
      const response = await axios.get(`${API_BASE}/trees/${treeId}/structure`);
      setTreeStructure(response.data);
      if (onTreeStructureChange) {
        onTreeStructureChange(response.data);
      }
    } catch (error) {
      console.error('Failed to load tree structure:', error);
      setTreeStructure(null);
      if (onTreeStructureChange) {
        onTreeStructureChange(null);
      }
      alert('Ошибка при загрузке структуры дерева: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingTree(false);
    }
  };

  const handleTreeChange = (treeId) => {
    // Очищаем старое дерево сразу
    setTreeStructure(null);
    setSelectedTreeId(treeId || null);
  };

  const handleCreateFromNode = async (path, initialName) => {
    const trimmedName = (initialName || '').trim();

    // Если есть имя, создаём должность сразу, без открытия формы справа
    if (trimmedName) {
      try {
        const response = await axios.post(`${API_BASE}/positions`, {
          name: trimmedName,
          description: '',
          custom_fields: path || {},
          employee_full_name: '',
          employee_external_id: '',
          employee_profile_url: ''
        });

        const createdPositionId = response.data.id;

        // Сообщаем наверх, что появилась новая должность, чтобы обновить дерево/список
        // Передаем ID созданной позиции, чтобы её можно было открыть
        if (onPositionCreated) {
          onPositionCreated(createdPositionId);
        } else if (selectedTreeId) {
          // На всякий случай локально перезагрузим структуру дерева
          loadTreeStructure(selectedTreeId);
        }
      } catch (error) {
        console.error('Failed to create position from tree node:', error);
        alert('Ошибка при создании должности: ' + (error.response?.data?.error || error.message));
      }
      return;
    }

    // Старое поведение — если имени нет, открываем форму редактирования
    onPositionSelect(null, path, initialName);
  };

  const handlePositionClick = (positionId) => {
    onPositionSelect(positionId, null);
  };

  if (loading) {
    return <div className="tree-panel">Загрузка...</div>;
  }

  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
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
        <TreeSelector
          trees={trees}
          selectedTreeId={selectedTreeId}
          onChange={handleTreeChange}
        />
      </div>
      {loadingTree ? (
        <div className="tree-panel-loading">Загрузка дерева...</div>
      ) : treeStructure ? (
        <TreeView
          tree={treeStructure}
          onPositionSelect={handlePositionClick}
          onCreateFromNode={handleCreateFromNode}
          onNodeSelect={onNodeSelect}
          selectedNode={selectedNode}
          selectedPositionId={selectedPositionId}
        />
      ) : selectedTreeId ? (
        <div className="tree-panel-empty">Нет данных</div>
      ) : null}
    </div>
  );
}

export default TreePanel;

