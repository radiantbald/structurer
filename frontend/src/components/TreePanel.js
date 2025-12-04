import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import TreeView from './TreeView';
import TreeSelector from './TreeSelector';
import { buildTreeStructureLocally } from '../utils/treeBuilder';
import { convertCustomFieldsObjectToArray } from '../utils/customFields';
import './TreePanel.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';
const STORAGE_KEY_SELECTED_TREE_ID = 'selectedTreeId';

function TreePanel({
  onPositionSelect,
  refreshTrigger,
  treeRefreshTrigger,
  onShowTreeDefinition,
  onShowCustomFields,
  onPositionCreated,
  onNodeSelect,
  selectedNode,
  selectedPositionId,
  onTreeStructureChange,
  deletedCustomField,
}) {
  const [trees, setTrees] = useState([]);
  const [selectedTreeId, setSelectedTreeId] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SELECTED_TREE_ID);
    // Если ключ существует, возвращаем значение (даже если пустая строка для "Плоское")
    // Если ключа нет, возвращаем null
    return saved !== null ? saved : null;
  });
  const [treeStructure, setTreeStructure] = useState(null);
  const [originalTreeStructure, setOriginalTreeStructure] = useState(null); // Сохраняем исходную структуру дерева
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customFields, setCustomFields] = useState([]);
  const positionsRef = useRef([]);
  const allPositionsRef = useRef([]);

  // Первоначальная загрузка при монтировании компонента
  useEffect(() => {
    loadTrees();
    loadPositions();
    loadCustomFields();
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
      // Если есть поисковый запрос, используем исходную структуру дерева (не перестраиваем)
      if (searchQuery && searchQuery.trim()) {
        // Если исходная структура уже загружена, используем её
        if (originalTreeStructure) {
          setTreeStructure(originalTreeStructure);
        } else {
          // Иначе загружаем структуру с сервера и сохраняем как исходную
          loadTreeStructure(selectedTreeId);
        }
      } else {
        // Загружаем структуру дерева с сервера
        loadTreeStructure(selectedTreeId);
      }
    } else {
      // Когда выбрано "Плоское" (пустое значение), создаем плоскую структуру
      rebuildFlatStructureLocally();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreeId, trees, loading, searchQuery]);

  // Обновляем структуру дерева при изменении позиций
  // При первом входе или обновлении страницы всегда используем ручку structure
  useEffect(() => {
    if (loading || !treeStructure) {
      // Не обновляем, если структура еще не загружена (первоначальная загрузка)
      return;
    }
    
    // Если есть поисковый запрос, используем исходную структуру дерева (не перестраиваем)
    if (searchQuery && searchQuery.trim()) {
      if (selectedTreeId && selectedTreeId !== '') {
        // Используем исходную структуру, если она есть
        if (originalTreeStructure) {
          setTreeStructure(originalTreeStructure);
        }
      } else {
        rebuildFlatStructureLocally();
      }
    } else {
      // Если поиска нет, используем стандартную логику
      if (selectedTreeId && selectedTreeId !== '') {
        // При изменении позиций перезагружаем структуру с сервера
        loadTreeStructure(selectedTreeId);
      } else {
        rebuildFlatStructureLocally();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, searchQuery]);

  // Применяем фильтр при изменении поискового запроса и перестраиваем дерево
  useEffect(() => {
    if (allPositionsRef.current.length > 0) {
      applySearchFilter(allPositionsRef.current, searchQuery);
      
      // Если есть поисковый запрос, используем исходную структуру дерева (не перестраиваем)
      if (searchQuery && searchQuery.trim()) {
        if (selectedTreeId && selectedTreeId !== '') {
          // Используем исходную структуру, если она есть
          if (originalTreeStructure) {
            setTreeStructure(originalTreeStructure);
          }
        } else {
          rebuildFlatStructureLocally();
        }
      } else {
        // Если поиск очищен, перезагружаем дерево с сервера (для структурированного) или перестраиваем локально (для плоского)
        if (selectedTreeId && selectedTreeId !== '') {
          loadTreeStructure(selectedTreeId);
        } else {
          rebuildFlatStructureLocally();
        }
      }
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

  const loadCustomFields = async () => {
    try {
      const response = await axios.get(`${API_BASE}/custom-fields`);
      setCustomFields(response.data || []);
    } catch (error) {
      console.error('Failed to load custom fields in TreePanel:', error);
    }
  };

  // Реактивно удаляем кастомное поле из локального списка позиций и дерева,
  // когда оно было удалено в форме кастомных полей, чтобы не ждать перезапроса с бэкенда
  useEffect(() => {
    if (!deletedCustomField || !deletedCustomField.key) {
      return;
    }

    const fieldKey = deletedCustomField.key;

    const stripFieldFromPositions = (positions) =>
      positions.map(pos => {
        if (!pos.custom_fields || typeof pos.custom_fields !== 'object') {
          return pos;
        }
        if (!(fieldKey in pos.custom_fields)) {
          return pos;
        }
        const { [fieldKey]: _removed, ...rest } = pos.custom_fields;
        return {
          ...pos,
          custom_fields: rest,
        };
      });

    // Обновляем все локальные коллекции позиций
    allPositionsRef.current = stripFieldFromPositions(allPositionsRef.current);
    const updatedPositions = stripFieldFromPositions(positionsRef.current);
    positionsRef.current = updatedPositions;
    setPositions(updatedPositions);

    // Перестраиваем структуру дерева локально, без ожидания ответа сервера
    if (selectedTreeId && selectedTreeId !== '') {
      rebuildTreeStructureLocally(selectedTreeId);
    } else {
      rebuildFlatStructureLocally();
    }
  }, [deletedCustomField]);

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

    // Поиск по кастомным полям (учитываем разные форматы хранения и значения)
    const customFieldTexts = [];

    // 1) Старый / альтернативный формат: position.custom_fields как объект или массив
    if (position.custom_fields) {
      if (Array.isArray(position.custom_fields)) {
        // Возможный новый формат: массив объектов с custom_field_label/custom_field_value
        position.custom_fields.forEach((cf) => {
          if (!cf) return;

          if (cf.custom_field_label) {
            customFieldTexts.push(String(cf.custom_field_label));
          }
          if (cf.custom_field_value) {
            customFieldTexts.push(String(cf.custom_field_value));
          }

          if (Array.isArray(cf.linked_custom_fields)) {
            cf.linked_custom_fields.forEach((lf) => {
              if (!lf) return;
              if (lf.linked_custom_field_label) {
                customFieldTexts.push(String(lf.linked_custom_field_label));
              }
              if (Array.isArray(lf.linked_custom_field_values)) {
                lf.linked_custom_field_values.forEach((lv) => {
                  if (!lv) return;
                  if (lv.linked_custom_field_value) {
                    customFieldTexts.push(String(lv.linked_custom_field_value));
                  }
                });
              }
            });
          }

          // Fallback: если это примитив или что‑то ещё, просто сериализуем
          if (
            !cf.custom_field_label &&
            !cf.custom_field_value &&
            typeof cf === 'string'
          ) {
            customFieldTexts.push(cf);
          }
        });
      } else if (typeof position.custom_fields === 'object') {
        // Формат: объект { key: value }
        Object.values(position.custom_fields).forEach((v) => {
          if (v !== undefined && v !== null) {
            customFieldTexts.push(String(v));
          }
        });
      } else if (typeof position.custom_fields === 'string') {
        customFieldTexts.push(position.custom_fields);
      }
    }

    // 2) Новый формат: есть только ID значений в custom_fields_values_ids,
    // а сами значения берём из справочника кастомных полей (customFields из состояния)
    if (
      Array.isArray(position.custom_fields_values_ids) &&
      position.custom_fields_values_ids.length > 0 &&
      Array.isArray(customFields) &&
      customFields.length > 0
    ) {
      const valueIdSet = new Set(
        position.custom_fields_values_ids.map((v) => String(v)),
      );

      customFields.forEach((fieldDef) => {
        if (!fieldDef || !Array.isArray(fieldDef.allowed_values)) return;

        fieldDef.allowed_values.forEach((av) => {
          if (!av) return;
          const valueId = av.value_id ? String(av.value_id) : null;
          if (!valueId || !valueIdSet.has(valueId)) return;

          if (av.value) {
            customFieldTexts.push(String(av.value));
          }

          if (Array.isArray(av.linked_custom_fields)) {
            av.linked_custom_fields.forEach((lf) => {
              if (!lf) return;
              if (lf.linked_custom_field_label) {
                customFieldTexts.push(String(lf.linked_custom_field_label));
              }
              if (Array.isArray(lf.linked_custom_field_values)) {
                lf.linked_custom_field_values.forEach((lv) => {
                  if (!lv) return;
                  if (lv.linked_custom_field_value) {
                    customFieldTexts.push(String(lv.linked_custom_field_value));
                  }
                });
              }
            });
          }
        });
      });
    }

    if (customFieldTexts.length > 0) {
      const customFieldsStr = customFieldTexts.join(' ').toLowerCase();
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
      
      // Сохраняем исходную структуру дерева
      setOriginalTreeStructure(structure);
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

  // Строит массив custom_fields только из конкретного узла дерева (без предков),
  // используя определения кастомных полей. Нужен для точного переноса прилинкованных
  // значений при быстром создании должности в узле.
  const buildCustomFieldsFromNode = (node, customFieldsDefinitions) => {
    if (!node) {
      console.log('[buildCustomFieldsFromNode] No node provided');
      return [];
    }
    
    // Поддержка как нового формата (custom_field_key), так и старого (field_key)
    const hasKey = node.custom_field_key || node.field_key;
    if (!hasKey) {
      console.log('[buildCustomFieldsFromNode] Node has no key:', node);
      return [];
    }

    const defs = Array.isArray(customFieldsDefinitions) ? customFieldsDefinitions : [];
    const mainKey = node.custom_field_key || node.field_key;
    const mainValue =
      (node.custom_field_value && String(node.custom_field_value).trim()) ||
      (node.field_value && String(node.field_value).trim()) ||
      '';

    console.log('[buildCustomFieldsFromNode] Processing node:', {
      mainKey,
      mainValue,
      hasLinkedFields: !!node.linked_custom_fields,
      linkedFieldsCount: node.linked_custom_fields?.length || 0
    });

    if (!mainKey || !mainValue) {
      console.log('[buildCustomFieldsFromNode] Missing key or value');
      return [];
    }

    const fieldDef = defs.find((f) => f && f.key === mainKey);
    if (!fieldDef || !Array.isArray(fieldDef.allowed_values)) {
      console.log('[buildCustomFieldsFromNode] Field definition not found or no allowed_values:', {
        mainKey,
        fieldDefFound: !!fieldDef,
        allowedValuesCount: fieldDef?.allowed_values?.length || 0
      });
      return [];
    }

    // Находим выбранное основное значение по тексту/ID
    const matchedMain = fieldDef.allowed_values.find((av) => {
      if (!av) return false;
      const valueStr = av.value ? String(av.value).trim() : '';
      const idStr = av.value_id
        ? (typeof av.value_id === 'string'
            ? av.value_id.trim()
            : String(av.value_id))
        : '';
      return valueStr === mainValue || idStr === mainValue;
    });

    if (!matchedMain) {
      console.log('[buildCustomFieldsFromNode] Main value not found in allowed_values:', mainValue);
      return [];
    }
    
    console.log('[buildCustomFieldsFromNode] Found main value:', {
      value: matchedMain.value,
      value_id: matchedMain.value_id,
      hasLinkedFields: !!matchedMain.linked_custom_fields,
      linkedFieldsCount: matchedMain.linked_custom_fields?.length || 0
    });

    const item = {
      custom_field_id: fieldDef.id,
    };

    if (matchedMain.value_id) {
      const valueId =
        typeof matchedMain.value_id === 'string'
          ? matchedMain.value_id.trim()
          : String(matchedMain.value_id);
      if (valueId) {
        item.custom_field_value_id = valueId;
      }
    }

    // Если у основного значения есть прилинкованные поля, переносим ИМЕННО те,
    // которые заданы в узле (node.linked_custom_fields[*].linked_custom_field_values).
    if (
      node.linked_custom_fields &&
      Array.isArray(node.linked_custom_fields) &&
      node.linked_custom_fields.length > 0 &&
      matchedMain.linked_custom_fields &&
      Array.isArray(matchedMain.linked_custom_fields) &&
      matchedMain.linked_custom_fields.length > 0
    ) {
      const linkedFieldValuesByField = {};

      node.linked_custom_fields.forEach((lf) => {
        if (
          !lf ||
          !lf.linked_custom_field_id ||
          !Array.isArray(lf.linked_custom_field_values)
        ) {
          return;
        }

        // Находим соответствующее определение linked‑поля в matchedMain
        const defForLinked = matchedMain.linked_custom_fields.find((defLf) => {
          if (!defLf || !defLf.linked_custom_field_id) return false;
          const defId =
            typeof defLf.linked_custom_field_id === 'string'
              ? defLf.linked_custom_field_id.trim()
              : String(defLf.linked_custom_field_id);
          const nodeId =
            typeof lf.linked_custom_field_id === 'string'
              ? lf.linked_custom_field_id.trim()
              : String(lf.linked_custom_field_id);
          return defId === nodeId;
        });

        const fieldIdKey =
          typeof lf.linked_custom_field_id === 'string'
            ? lf.linked_custom_field_id.trim()
            : String(lf.linked_custom_field_id);

        if (!defForLinked || !Array.isArray(defForLinked.linked_custom_field_values)) {
          console.log('[buildCustomFieldsFromNode] Linked field definition not found:', {
            nodeLinkedFieldId: fieldIdKey,
            availableLinkedFields: matchedMain.linked_custom_fields.map(l => ({
              id: l.linked_custom_field_id,
              key: l.linked_custom_field_key
            }))
          });
          return;
        }
        
        console.log('[buildCustomFieldsFromNode] Processing linked field:', {
          linkedFieldId: fieldIdKey,
          valuesInNode: lf.linked_custom_field_values.length,
          valuesInDefinition: defForLinked.linked_custom_field_values.length
        });

        if (!linkedFieldValuesByField[fieldIdKey]) {
          linkedFieldValuesByField[fieldIdKey] = {
            linked_custom_field_id: fieldIdKey,
            linked_custom_field_values: [],
          };
        }

        // Для каждого значения в узле находим соответствующий value_id в определении
        lf.linked_custom_field_values.forEach((lv) => {
          if (!lv) return;
          
          // Сначала пытаемся использовать linked_custom_field_value_id напрямую из узла
          // Если ID есть в узле, значит он уже правильный и мы можем использовать его напрямую
          const nodeValueId = lv.linked_custom_field_value_id
            ? (typeof lv.linked_custom_field_value_id === 'string'
                ? lv.linked_custom_field_value_id.trim()
                : String(lv.linked_custom_field_value_id))
            : null;
          
          // Также берем текст для сопоставления (если ID нет)
          const text = lv.linked_custom_field_value
            ? String(lv.linked_custom_field_value).trim()
            : '';
          
          if (!nodeValueId && !text) return;

          let finalValueId = null;
          
          // Если есть ID в узле, используем его напрямую (без проверки в определении)
          // Это правильный подход, так как ID в узле уже является правильным идентификатором
          if (nodeValueId) {
            finalValueId = nodeValueId;
          } else if (text) {
            // Если ID нет, ищем по тексту в определении
            const matchedLinked = defForLinked.linked_custom_field_values.find((defVal) => {
              if (!defVal || !defVal.linked_custom_field_value) return false;
              const defText = String(defVal.linked_custom_field_value).trim();
              return defText === text;
            });
            
            if (matchedLinked && matchedLinked.linked_custom_field_value_id) {
              finalValueId =
                typeof matchedLinked.linked_custom_field_value_id === 'string'
                  ? matchedLinked.linked_custom_field_value_id.trim()
                  : String(matchedLinked.linked_custom_field_value_id);
            } else {
              console.log('[buildCustomFieldsFromNode] Linked value not found by text:', {
                text,
                availableValues: defForLinked.linked_custom_field_values.map(v => ({
                  id: v.linked_custom_field_value_id,
                  text: v.linked_custom_field_value
                }))
              });
            }
          }

          if (finalValueId) {
            linkedFieldValuesByField[fieldIdKey].linked_custom_field_values.push({
              linked_custom_field_value_id: finalValueId,
            });
          }
        });
      });

      const linkedArray = Object.values(linkedFieldValuesByField).filter(
        (lf) => lf.linked_custom_field_values.length > 0
      );
      if (linkedArray.length > 0) {
        item.linked_custom_fields = linkedArray;
      }
    }

    return [item];
  };

  const mergeCustomFieldsArrays = (baseArray, overrideArray) => {
    if (!Array.isArray(baseArray) && !Array.isArray(overrideArray)) {
      return [];
    }
    const base = Array.isArray(baseArray) ? baseArray : [];
    const extra = Array.isArray(overrideArray) ? overrideArray : [];

    if (extra.length === 0) {
      return base;
    }

    const byId = {};
    base.forEach((item) => {
      if (item && item.custom_field_id) {
        byId[item.custom_field_id] = item;
      }
    });

    extra.forEach((item) => {
      if (item && item.custom_field_id) {
        // Значения из overrideArray имеют приоритет (в т.ч. linked_custom_fields)
        byId[item.custom_field_id] = item;
      }
    });

    return Object.values(byId);
  };

  const handleCreateFromNode = async (path, initialName, sourceNode) => {
    const trimmedName = (initialName || '').trim();

    // Если есть имя, создаём должность сразу, без открытия формы справа
    if (trimmedName) {
      // Быстрое создание должности с немедленным назначением кастомных полей,
      // соответствующих текущему пути в дереве.
      try {
        console.log('[handleCreateFromNode] Creating position:', {
          name: trimmedName,
          path,
          sourceNode,
          hasLinkedFields: sourceNode?.linked_custom_fields?.length > 0
        });

        // Если есть sourceNode (узел дерева), используем его данные напрямую,
        // так как они содержат точную информацию о прилинкованных значениях.
        // Иначе используем path (для обратной совместимости).
        let customFieldsArray = [];
        
        if (sourceNode && (sourceNode.custom_field_key || sourceNode.field_key)) {
          // Строим custom_fields напрямую из узла - это самый точный способ
          const fromNodeArray = buildCustomFieldsFromNode(sourceNode, customFields);
          console.log('[handleCreateFromNode] fromNodeArray:', fromNodeArray);
          
          // Если из узла получили данные, используем их
          if (fromNodeArray.length > 0) {
            customFieldsArray = fromNodeArray;
            
            // Дополнительно добавляем поля из path, которых нет в узле
            // (например, поля из родительских узлов)
            const fromPathArray = convertCustomFieldsObjectToArray(path || {}, customFields);
            console.log('[handleCreateFromNode] fromPathArray:', fromPathArray);
            
            // Объединяем: приоритет у данных из узла
            customFieldsArray = mergeCustomFieldsArrays(fromPathArray, fromNodeArray);
          } else {
            // Если из узла ничего не получили, используем path
            customFieldsArray = convertCustomFieldsObjectToArray(path || {}, customFields);
          }
        } else {
          // Если нет sourceNode, используем только path
          customFieldsArray = convertCustomFieldsObjectToArray(path || {}, customFields);
        }
        
        console.log('[handleCreateFromNode] Final customFieldsArray:', customFieldsArray);

        const response = await axios.post(`${API_BASE}/positions`, {
          name: trimmedName,
          description: '',
          custom_fields: customFieldsArray,
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

