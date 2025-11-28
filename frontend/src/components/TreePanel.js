import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import TreeView from './TreeView';
import TreeSelector from './TreeSelector';
import { buildTreeStructureLocally } from '../utils/treeBuilder';
import './TreePanel.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';
const STORAGE_KEY_SELECTED_TREE_ID = 'selectedTreeId';

function TreePanel({ onPositionSelect, refreshTrigger, treeRefreshTrigger, onShowTreeDefinition, onShowCustomFields, onPositionCreated, onNodeSelect, selectedNode, selectedPositionId, onTreeStructureChange }) {
  const [trees, setTrees] = useState([]);
  const [selectedTreeId, setSelectedTreeId] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SELECTED_TREE_ID);
    // Если ключ существует, возвращаем значение (даже если пустая строка для "Плоское")
    // Если ключа нет, возвращаем null
    return saved !== null ? saved : null;
  });
  const [treeStructure, setTreeStructure] = useState(null);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const positionsRef = useRef([]);

  useEffect(() => {
    loadTrees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeRefreshTrigger]);

  // Загружаем список должностей
  useEffect(() => {
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Обновляем структуру дерева при изменении должностей, выбранного дерева или списка деревьев
  useEffect(() => {
    // Не обновляем структуру, пока не загружены деревья
    if (loading) {
      return;
    }
    
    if (selectedTreeId && selectedTreeId !== '') {
      // Проверяем, что дерево существует в списке
      if (trees.length > 0 && !trees.some(t => String(t.id) === String(selectedTreeId))) {
        // Дерево не найдено, очищаем выбор
        setSelectedTreeId(null);
        setTreeStructure(null);
        localStorage.removeItem(STORAGE_KEY_SELECTED_TREE_ID);
        return;
      }
      rebuildTreeStructureLocally(selectedTreeId);
    } else {
      // Когда выбрано "Плоское" (пустое значение), создаем плоскую структуру
      rebuildFlatStructureLocally();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreeId, positions, trees, loading]);


  const loadTrees = async () => {
    try {
      const response = await axios.get(`${API_BASE}/trees`);
      const treesData = response.data || [];
      setTrees(treesData);

      // Если уже есть сохраненное дерево и оно существует в списке, используем его
      if (selectedTreeId && treesData.some(t => String(t.id) === String(selectedTreeId))) {
        // selectedTreeId уже установлен, ничего не делаем
        return;
      }
      
      // Если выбрано "Плоское" (пустая строка), не выбираем дерево по умолчанию
      if (selectedTreeId === '') {
        return;
      }
      
      // Иначе выбираем дерево по умолчанию или первое доступное
      const defaultTree = treesData.find(t => t.is_default);
      const treeToSelect = defaultTree || (treesData.length > 0 ? treesData[0] : null);
      
      if (treeToSelect) {
        const treeIdStr = String(treeToSelect.id);
        setSelectedTreeId(treeIdStr);
        localStorage.setItem(STORAGE_KEY_SELECTED_TREE_ID, treeIdStr);
      } else {
        setSelectedTreeId(null);
        setTreeStructure(null);
        localStorage.removeItem(STORAGE_KEY_SELECTED_TREE_ID);
      }
    } catch (error) {
      console.error('Failed to load trees:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPositions = async () => {
    try {
      const response = await axios.get(`${API_BASE}/positions`, {
        params: {
          limit: 10000, // Большой лимит, чтобы получить все должности
          offset: 0
        }
      });
      const positionsData = response.data?.items || [];
      setPositions(positionsData);
      positionsRef.current = positionsData;
    } catch (error) {
      console.error('Failed to load positions:', error);
      alert('Ошибка при загрузке должностей: ' + (error.response?.data?.error || error.message));
    }
  };

  const rebuildFlatStructureLocally = () => {
    const flatStructure = {
      tree_id: '',
      name: 'Плоское',
      levels: [],
      root: {
        type: 'root',
        children: positionsRef.current.map(pos => ({
          type: 'position',
          position_id: String(pos.id),
          position_name: pos.name,
          employee_full_name: pos.employee_full_name || null,
          children: []
        }))
      }
    };
    
    setTreeStructure(flatStructure);
    if (onTreeStructureChange) {
      onTreeStructureChange(flatStructure);
    }
  };

  const rebuildTreeStructureLocally = (treeId) => {
    if (!treeId) {
      setTreeStructure(null);
      if (onTreeStructureChange) {
        onTreeStructureChange(null);
      }
      return;
    }

    const treeDefinition = trees.find(t => String(t.id) === String(treeId));
    if (!treeDefinition) {
      setTreeStructure(null);
      if (onTreeStructureChange) {
        onTreeStructureChange(null);
      }
      return;
    }

    try {
      setLoadingTree(true);
      const structure = buildTreeStructureLocally(positionsRef.current, treeDefinition);
      setTreeStructure(structure);
      if (onTreeStructureChange) {
        onTreeStructureChange(structure);
      }
    } catch (error) {
      console.error('Failed to rebuild tree structure locally:', error);
      setTreeStructure(null);
      if (onTreeStructureChange) {
        onTreeStructureChange(null);
      }
    } finally {
      setLoadingTree(false);
    }
  };


  // Эта функция больше не используется для обновления после операций с должностями,
  // но оставляем её для первоначальной загрузки при смене дерева (если нужно)
  const loadTreeStructure = async (treeId) => {
    if (!treeId) {
      setTreeStructure(null);
      setLoadingTree(false);
      if (onTreeStructureChange) {
        onTreeStructureChange(null);
      }
      return;
    }
    // Используем локальное построение вместо HTTP запроса
    rebuildTreeStructureLocally(treeId);
  };

  const handleTreeChange = (treeId) => {
    // Очищаем старое дерево сразу
    setTreeStructure(null);
    const newTreeId = treeId || '';
    setSelectedTreeId(newTreeId);
    // Сохраняем выбранное дерево в localStorage (даже если пустая строка для "Плоское")
    localStorage.setItem(STORAGE_KEY_SELECTED_TREE_ID, newTreeId);
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

        // Обновляем список должностей и перестраиваем дерево локально
        await loadPositions();
        if (selectedTreeId && selectedTreeId !== '') {
          rebuildTreeStructureLocally(selectedTreeId);
        } else {
          rebuildFlatStructureLocally();
        }

        // Сообщаем наверх, что появилась новая должность
        if (onPositionCreated) {
          onPositionCreated(createdPositionId);
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
      ) : null}
    </div>
  );
}

export default TreePanel;

