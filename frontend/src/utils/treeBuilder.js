// Функция для локального построения структуры дерева на основе должностей
// Аналог buildTreeStructure из backend/tree_builder.go

function buildTreeStructureLocally(positions, treeDefinition) {
  const structure = {
    tree_id: treeDefinition ? String(treeDefinition.id) : '',
    name: treeDefinition ? treeDefinition.name : 'Плоское',
    levels: treeDefinition ? (treeDefinition.levels || []) : [],
    root: {
      type: 'root',
      children: []
    }
  };

  // Если нет уровней, возвращаем плоский список должностей
  if (!treeDefinition || !treeDefinition.levels || treeDefinition.levels.length === 0) {
    structure.root.children = positions.map(pos => ({
      type: 'position',
      position_id: String(pos.id),
      position_name: pos.name,
      employee_full_name: pos.employee_full_name || null,
      children: []
    }));
    return structure;
  }

  // Нормализуем custom_fields в строки
  const normalizedPositions = positions.map(pos => ({
    id: String(pos.id),
    name: pos.name,
    custom_fields: normalizeCustomFields(pos.custom_fields),
    employee_full_name: pos.employee_full_name || null
  }));

  // Определяем должности, которые имеют хотя бы одно значимое значение уровня
  const structuredPositionIDs = new Set();
  for (const pos of normalizedPositions) {
    for (const level of treeDefinition.levels) {
      const val = pos.custom_fields[level.custom_field_key];
      if (val && val !== '') {
        structuredPositionIDs.add(pos.id);
        break;
      }
    }
  }

  // Фильтруем структурированные должности
  const structuredPositions = normalizedPositions.filter(pos => structuredPositionIDs.has(pos.id));

  // Строим структурированную часть дерева
  const structuredChildren = buildTreeLevel(structuredPositions, treeDefinition.levels, 0, {});

  // Собираем должности вне структуры
  const unstructuredPositions = normalizedPositions.filter(pos => !structuredPositionIDs.has(pos.id));

  if (unstructuredPositions.length > 0) {
    const unstructuredNodes = unstructuredPositions.map(pos => ({
      type: 'position',
      position_id: pos.id,
      position_name: pos.name,
      employee_full_name: pos.employee_full_name,
      children: []
    }));

    const label = 'Вне структуры';
    const unstructuredGroup = {
      type: 'field_value',
      level_order: null,
      custom_field_key: null,
      custom_field_value: label,
      children: unstructuredNodes
    };

    structuredChildren.push(unstructuredGroup);
  }

  // Защитный fallback: если дерево не смогло распределить должности, показываем все плоским списком
  if (structuredChildren.length === 0 && normalizedPositions.length > 0) {
    structure.root.children = normalizedPositions.map(pos => ({
      type: 'position',
      position_id: pos.id,
      position_name: pos.name,
      employee_full_name: pos.employee_full_name,
      children: []
    }));
  } else {
    structure.root.children = structuredChildren;
  }

  return structure;
}

function buildTreeLevel(positions, levels, levelIndex, path) {
  if (levelIndex >= levels.length) {
    // Листовой уровень - возвращаем должности
    const nodes = [];
    for (const pos of positions) {
      if (matchesPath(pos.custom_fields, path)) {
        nodes.push({
          type: 'position',
          position_id: pos.id,
          position_name: pos.name,
          employee_full_name: pos.employee_full_name,
          children: []
        });
      }
    }
    return nodes;
  }

  // Получаем уникальные значения для текущего уровня
  const level = levels[levelIndex];
  const fieldKey = level.custom_field_key;
  const order = level.order;

  const valueSet = new Set();
  const positionsWithoutValue = [];

  for (const pos of positions) {
    if (!matchesPath(pos.custom_fields, path)) {
      continue;
    }
    const val = pos.custom_fields[fieldKey];
    if (!val || val === '') {
      // Должность подходит под путь, но не заполнила поле текущего уровня
      positionsWithoutValue.push(pos);
      continue;
    }
    valueSet.add(val);
  }

  // Если по текущему уровню нет значений, отображаем должности как листья
  if (valueSet.size === 0) {
    return positionsWithoutValue.map(pos => ({
      type: 'position',
      position_id: pos.id,
      position_name: pos.name,
      employee_full_name: pos.employee_full_name,
      children: []
    }));
  }

  // Создаем узлы для каждого уникального значения
  const nodes = [];
  const sortedValues = Array.from(valueSet).sort();

  for (const val of sortedValues) {
    const newPath = { ...path, [fieldKey]: val };
    const children = buildTreeLevel(positions, levels, levelIndex + 1, newPath);

    // Локальный билдер теперь тоже использует custom_field_key/custom_field_value,
    // чтобы формат совпадал с ответом бэкенда (ручка structure).
    nodes.push({
      type: 'field_value',
      level_order: order,
      custom_field_key: fieldKey,
      custom_field_value: val,
      children: children
    });
  }

  // Добавляем должности без значения текущего уровня
  for (const pos of positionsWithoutValue) {
    nodes.push({
      type: 'position',
      position_id: pos.id,
      position_name: pos.name,
      employee_full_name: pos.employee_full_name,
      children: []
    });
  }

  // Сортировка: папки (field_value) по названию, должности после папок
  const fieldNodes = [];
  const positionNodes = [];
  for (const n of nodes) {
    if (n.type === 'field_value') {
      fieldNodes.push(n);
    } else {
      positionNodes.push(n);
    }
  }

  // Сортируем папки по названию
  fieldNodes.sort((a, b) => {
    const va = a.custom_field_value || a.field_value || '';
    const vb = b.custom_field_value || b.field_value || '';
    return va.localeCompare(vb);
  });

  return [...fieldNodes, ...positionNodes];
}

function matchesPath(customFields, path) {
  if (!path || Object.keys(path).length === 0) {
    return true;
  }
  for (const key in path) {
    if (customFields[key] !== path[key]) {
      return false;
    }
  }
  return true;
}

function normalizeCustomFields(customFields) {
  if (!customFields) {
    return {};
  }
  const normalized = {};
  for (const key in customFields) {
    // Преобразуем значение в строку
    normalized[key] = String(customFields[key]);
  }
  return normalized;
}

export { buildTreeStructureLocally };


