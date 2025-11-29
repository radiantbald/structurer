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
  const [searchQuery, setSearchQuery] = useState('');
  const positionsRef = useRef([]);
  const allPositionsRef = useRef([]);

  // Первоначальная загрузка при монтировании компонента
  useEffect(() => {
    loadTrees();
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Обновляем список деревьев при изменении treeRefreshTrigger
  useEffect(() => {
    loadTrees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeRefreshTrigger]);

  // Обновляем список должностей при изменении refreshTrigger
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
      // Загружаем структуру дерева с сервера
      loadTreeStructure(selectedTreeId);
    } else {
      // Когда выбрано "Плоское" (пустое значение), создаем плоскую структуру
      rebuildFlatStructureLocally();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreeId, trees, loading]);

  // Обновляем структуру дерева при изменении позиций
  // При первом входе или обновлении страницы всегда используем ручку structure
  useEffect(() => {
    if (loading || !treeStructure) {
      // Не обновляем, если структура еще не загружена (первоначальная загрузка)
      return;
    }
    
    if (selectedTreeId && selectedTreeId !== '') {
      // При изменении позиций перезагружаем структуру с сервера
      loadTreeStructure(selectedTreeId);
    } else {
      rebuildFlatStructureLocally();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  // Применяем фильтр при изменении поискового запроса
  useEffect(() => {
    if (allPositionsRef.current.length > 0) {
      applySearchFilter(allPositionsRef.current, searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);


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
      allPositionsRef.current = positionsData;
      // Применяем фильтр поиска
      applySearchFilter(positionsData, searchQuery);
    } catch (error) {
      console.error('Failed to load positions:', error);
      alert('Ошибка при загрузке должностей: ' + (error.response?.data?.error || error.message));
    }
  };

  // Функция для проверки, соответствует ли позиция поисковому запросу
  const matchesSearch = (position, query) => {
    if (!query || !query.trim()) {
      return true;
    }

    const searchText = query.trim();
    const searchLower = searchText.toLowerCase();

    // Проверяем наличие AND/OR операторов (регистронезависимо)
    const hasAnd = / and /i.test(searchText);
    const hasOr = / or /i.test(searchText);

    if (hasAnd || hasOr) {
      // Разбиваем по AND (приоритет выше, регистронезависимо)
      let parts = [];
      if (hasAnd) {
        parts = searchText.split(/ and /i).map(p => p.trim());
      } else {
        parts = [searchText];
      }

      // Проверяем каждую часть (которая может содержать OR)
      for (const part of parts) {
        if (/ or /i.test(part)) {
          // OR логика: хотя бы одно условие должно совпадать
          const orParts = part.split(/ or /i).map(p => p.trim());
          let orMatch = false;
          for (const orPart of orParts) {
            if (orPart && matchesSingleTerm(position, orPart)) {
              orMatch = true;
              break;
            }
          }
          if (!orMatch) {
            return false; // Если ни одно OR условие не совпало, вся AND группа не совпадает
          }
        } else {
          // AND логика: условие должно совпадать
          if (part && !matchesSingleTerm(position, part)) {
            return false;
          }
        }
      }
      return true;
    } else {
      // Простой поиск без операторов
      return matchesSingleTerm(position, searchText);
    }
  };

  // Функция для проверки соответствия одному поисковому термину
  const matchesSingleTerm = (position, term) => {
    if (!term) return true;

    const termLower = term.toLowerCase();
    
    // Поиск по имени
    if (position.name && position.name.toLowerCase().includes(termLower)) {
      return true;
    }
    
    // Поиск по описанию
    if (position.description && position.description.toLowerCase().includes(termLower)) {
      return true;
    }
    
    // Поиск по имени сотрудника
    if (position.employee_full_name && position.employee_full_name.toLowerCase().includes(termLower)) {
      return true;
    }
    
    // Поиск по кастомным полям
    if (position.custom_fields && typeof position.custom_fields === 'object') {
      const customFieldsStr = JSON.stringify(position.custom_fields).toLowerCase();
      if (customFieldsStr.includes(termLower)) {
        return true;
      }
    }
    
    return false;
  };

  // Применяем фильтр поиска к позициям
  const applySearchFilter = (allPositions, query) => {
    if (!query || !query.trim()) {
      setPositions(allPositions);
      positionsRef.current = allPositions;
      return;
    }

    const filtered = allPositions.filter(pos => matchesSearch(pos, query));
    setPositions(filtered);
    positionsRef.current = filtered;
  };

  // Обработчик изменения поискового запроса
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    applySearchFilter(allPositionsRef.current, query);
  };

  // Функция для проверки, соответствует ли узел дерева поисковому запросу
  // Работает с узлами типа 'position' из структуры дерева
  const nodeMatchesSearch = (node, query) => {
    if (!query || !query.trim()) {
      return true;
    }

    // Если это узел позиции, проверяем его данные
    if (node.type === 'position') {
      // Получаем полные данные позиции из allPositionsRef, если они есть
      const positionId = node.position_id;
      const fullPosition = allPositionsRef.current.find(p => String(p.id) === positionId);
      
      if (fullPosition) {
        // Используем полные данные позиции
        return matchesSearch(fullPosition, query);
      } else {
        // Если полных данных нет, проверяем только то, что есть в узле
        const positionData = {
          name: node.position_name || '',
          description: '',
          employee_full_name: node.employee_full_name || '',
          custom_fields: {}
        };
        return matchesSearch(positionData, query);
      }
    }

    return false;
  };

  // Функция для проверки, содержит ли поддерево узла позиции, соответствующие поиску
  const subtreeContainsMatchingPositions = (node, query) => {
    if (!node) return false;

    // Проверяем текущий узел
    if (nodeMatchesSearch(node, query)) {
      return true;
    }

    // Рекурсивно проверяем дочерние узлы
    if (node.children && node.children.length > 0) {
      return node.children.some(child => subtreeContainsMatchingPositions(child, query));
    }

    return false;
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


  // Загружает структуру дерева с сервера через API
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
      setTreeStructure(null);
      if (onTreeStructureChange) {
        onTreeStructureChange(null);
      }

      const response = await axios.get(`${API_BASE}/trees/${treeId}/structure`);
      const structure = response.data;
      
      setTreeStructure(structure);
      if (onTreeStructureChange) {
        onTreeStructureChange(structure);
      }
    } catch (error) {
      console.error('Failed to load tree structure from server:', error);
      // Fallback: используем локальное построение при ошибке
      rebuildTreeStructureLocally(treeId);
    } finally {
      setLoadingTree(false);
    }
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
        <div className="tree-panel-selector-row">
          <TreeSelector
            trees={trees}
            selectedTreeId={selectedTreeId}
            onChange={handleTreeChange}
          />
          <input
            type="text"
            className="tree-panel-search"
            placeholder="Поиск (AND/OR)"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
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
          searchQuery={searchQuery}
          subtreeContainsMatchingPositions={subtreeContainsMatchingPositions}
        />
      ) : null}
    </div>
  );
}

export default TreePanel;

