// Утилита для преобразования объекта custom_fields
// в массив структуры, ожидаемой бэкендом:
// [
//   {
//     custom_field_id,
//     custom_field_value_id,
//     linked_custom_fields: [
//       {
//         linked_custom_field_id,
//         linked_custom_field_values: [{ linked_custom_field_value_id }]
//       }
//     ]
//   }
// ]

// customFieldsObj: { [field_key]: string | value_id | "Main - Linked1 - Linked2" | "Main (Linked1, Linked2)" }
// customFieldsDefinitions: массив определений кастомных полей с allowed_values
export function convertCustomFieldsObjectToArray(customFieldsObj, customFieldsDefinitions) {
  if (!customFieldsObj || typeof customFieldsObj !== 'object') {
    return [];
  }

  const result = [];
  const defs = Array.isArray(customFieldsDefinitions) ? customFieldsDefinitions : [];

  Object.entries(customFieldsObj).forEach(([fieldKey, fieldValueRaw]) => {
    if (fieldValueRaw === undefined || fieldValueRaw === null) {
      return;
    }

    const fieldValue = String(fieldValueRaw).trim();
    if (!fieldValue) {
      return; // Пропускаем пустые значения
    }

    // Разделяем на основное значение и «хвост» из прилинкованных значений.
    // Новый формат: "Main (Linked1, Linked2)".
    // Старый формат (для обратной совместимости): "Main - Linked1 - Linked2".
    // ВАЖНО: прилинкованные значения могут содержать запятые (например, "Частями, МКК"),
    // поэтому при разборе формата с запятыми нужно быть осторожным.
    let mainValueFromRaw = fieldValue;
    let linkedPartsFromRaw = [];

    const parenStart = fieldValue.indexOf('(');
    const parenEnd = fieldValue.lastIndexOf(')');
    if (parenStart > 0 && parenEnd > parenStart) {
      mainValueFromRaw = fieldValue.substring(0, parenStart).trim();
      const inside = fieldValue.substring(parenStart + 1, parenEnd);
      // Разбиваем по запятым, но учитываем, что само значение может содержать запятые
      // Поэтому просто разбиваем по запятым и обрезаем пробелы
      linkedPartsFromRaw = inside
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    } else {
      // Формат "Main - Linked1 - Linked2"
      // Разбиваем по " - " (пробел-дефис-пробел), чтобы корректно обработать значения с дефисами
      const parts = fieldValue.split(' - ').map((p) => p.trim()).filter(Boolean);
      mainValueFromRaw = parts.length > 0 ? parts[0] : fieldValue;
      linkedPartsFromRaw = parts.length > 1 ? parts.slice(1) : [];
    }

    const fieldDef = defs.find((f) => f && f.key === fieldKey);
    if (!fieldDef) {
      return; // Неизвестное поле — пропускаем
    }

    // Собираем все выбранные linked_custom_field_value_id из других полей,
    // которые могут быть связаны с текущим полем через linked_custom_fields
    // Это нужно для правильного выбора custom_field_value_id, который связан с этими значениями
    const selectedLinkedValueIdsByField = new Map(); // field_id -> Set of value_ids
    Object.entries(customFieldsObj).forEach(([otherFieldKey, otherFieldValueRaw]) => {
      if (otherFieldKey === fieldKey) return; // Пропускаем текущее поле
      
      const otherFieldValue = String(otherFieldValueRaw || '').trim();
      if (!otherFieldValue) return;
      
      // Находим определение другого поля
      const otherFieldDef = defs.find((f) => f && f.key === otherFieldKey);
      if (!otherFieldDef) return;
      
      // Проверяем, является ли значение UUID (linked_custom_field_value_id или custom_field_value_id)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(otherFieldValue);
      if (isUUID) {
        // Сохраняем как потенциально связанное значение
        if (!selectedLinkedValueIdsByField.has(otherFieldDef.id)) {
          selectedLinkedValueIdsByField.set(otherFieldDef.id, new Set());
        }
        selectedLinkedValueIdsByField.get(otherFieldDef.id).add(otherFieldValue.toLowerCase());
      }
    });

    let selectedValue = null;
    if (Array.isArray(fieldDef.allowed_values)) {
      const searchValue = mainValueFromRaw.trim();

      // ВАЖНО: Сначала проверяем, является ли searchValue валидным UUID (value_id)
      // Если да, то ищем значение ТОЛЬКО по этому UUID в allowed_values текущего поля
      // Это гарантирует, что мы используем правильный value_id, связанный именно с этим полем
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchValue);
      
      if (isUUID) {
        // Если это UUID, ищем значение ТОЛЬКО по value_id в allowed_values этого поля
        selectedValue = fieldDef.allowed_values.find((av) => {
          if (!av) return false;
          const idStr = av.value_id
            ? (typeof av.value_id === 'string'
                ? av.value_id.trim()
                : String(av.value_id))
            : '';
          return idStr === searchValue;
        });
      }
      
      // Если не нашли по UUID или это не UUID, ищем по тексту
      // ВАЖНО: если есть выбранные linked_custom_field_value_id, выбираем значение,
      // которое имеет эти значения в своих linked_custom_fields
      if (!selectedValue) {
        // Функция для проверки, содержит ли значение нужные linked_custom_field_value_id
        const hasMatchingLinkedValues = (av) => {
          if (!av || !Array.isArray(av.linked_custom_fields)) {
            // Если у значения нет linked_custom_fields, но есть выбранные linked значения,
            // то это значение не подходит
            return selectedLinkedValueIdsByField.size === 0;
          }
          
          // Если нет выбранных linked значений, подходит любое значение
          if (selectedLinkedValueIdsByField.size === 0) {
            return true;
          }
          
          // Проверяем, что для каждого выбранного linked поля есть соответствующее значение
          for (const [selectedFieldId, selectedValueIds] of selectedLinkedValueIdsByField) {
            // Находим linked_custom_field для этого поля
            const matchingLinkedField = av.linked_custom_fields.find((lf) => {
              if (!lf || !lf.linked_custom_field_id) return false;
              const linkedFieldId = typeof lf.linked_custom_field_id === 'string'
                ? lf.linked_custom_field_id.trim().toLowerCase()
                : String(lf.linked_custom_field_id).trim().toLowerCase();
              const selectedFieldIdStr = typeof selectedFieldId === 'string'
                ? selectedFieldId.trim().toLowerCase()
                : String(selectedFieldId).trim().toLowerCase();
              return linkedFieldId === selectedFieldIdStr;
            });
            
            if (!matchingLinkedField) {
              // Если для выбранного поля нет linked_custom_field, это значение не подходит
              return false;
            }
            
            // Проверяем, что выбранные значения присутствуют в linked_custom_field_values
            if (!Array.isArray(matchingLinkedField.linked_custom_field_values)) {
              return false;
            }
            
            const valueLinkedIds = new Set();
            matchingLinkedField.linked_custom_field_values.forEach((linkedVal) => {
              if (linkedVal && linkedVal.linked_custom_field_value_id) {
                const linkedId = typeof linkedVal.linked_custom_field_value_id === 'string'
                  ? linkedVal.linked_custom_field_value_id.trim().toLowerCase()
                  : String(linkedVal.linked_custom_field_value_id).trim().toLowerCase();
                if (linkedId) {
                  valueLinkedIds.add(linkedId);
                }
              }
            });
            
            // Проверяем, что все выбранные значения для этого поля присутствуют
            for (const selectedId of selectedValueIds) {
              if (!valueLinkedIds.has(selectedId)) {
                return false; // Не все выбранные значения присутствуют
              }
            }
          }
          
          return true;
        };

        // Сначала пытаемся найти по точному совпадению значения или value_id
        // И проверяем соответствие linked_custom_field_value_id
        const candidates = fieldDef.allowed_values.filter((av) => {
          if (!av) return false;

          const valueStr = av.value ? String(av.value).trim() : '';
          const idStr = av.value_id
            ? (typeof av.value_id === 'string'
                ? av.value_id.trim()
                : String(av.value_id))
            : '';

          const matchesTextOrId = valueStr === searchValue || idStr === searchValue;
          if (!matchesTextOrId) return false;
          
          // Если совпадает по тексту/ID, проверяем linked_custom_field_value_id
          return hasMatchingLinkedValues(av);
        });
        
        if (candidates.length > 0) {
          // Если нашли несколько кандидатов, выбираем первый (они все должны быть эквивалентны)
          selectedValue = candidates[0];
        }

        // Если не нашли по точному совпадению, пробуем более мягкий поиск по подстроке
        // Но только если основное значение достаточно длинное, чтобы избежать ложных совпадений
        if (!selectedValue && searchValue && searchValue.length >= 3) {
          const softCandidates = fieldDef.allowed_values.filter((av) => {
            if (!av) return false;
            const valueStr = av.value ? String(av.value).trim() : '';
            // Используем более строгое условие: одно должно содержать другое
            // и они должны быть достаточно похожи по длине
            if (valueStr.length >= 3) {
              const contains = valueStr.includes(searchValue) || searchValue.includes(valueStr);
              if (contains) {
                // Проверяем, что длины достаточно похожи (хотя бы 70% совпадения)
                const minLen = Math.min(valueStr.length, searchValue.length);
                const maxLen = Math.max(valueStr.length, searchValue.length);
                const lengthMatch = minLen / maxLen >= 0.7;
                if (lengthMatch) {
                  // Проверяем linked_custom_field_value_id
                  return hasMatchingLinkedValues(av);
                }
              }
            }
            return false;
          });
          
          if (softCandidates.length > 0) {
            selectedValue = softCandidates[0];
          }
        }
      }
    }

    const item = {
      custom_field_id: fieldDef.id,
    };

    if (selectedValue) {
      let valueId = null;
      if (selectedValue.value_id) {
        valueId =
          typeof selectedValue.value_id === 'string'
            ? selectedValue.value_id.trim()
            : String(selectedValue.value_id);
      }
      if (valueId && valueId.length > 0) {
        item.custom_field_value_id = valueId;
      }
    }

    // Обрабатываем linked_custom_fields: фильтруем по значениям из linkedPartsFromRaw
    if (
      selectedValue &&
      Array.isArray(selectedValue.linked_custom_fields) &&
      selectedValue.linked_custom_fields.length > 0
    ) {
      const linkedFieldValuesByField = {};

      // Если есть указанные прилинкованные значения, фильтруем по ним
      // Иначе берем все предопределённые значения (для обратной совместимости)
      const shouldFilter = linkedPartsFromRaw.length > 0;
      
      // Создаем множество для быстрого поиска указанных значений
      const linkedPartsSet = new Set(
        linkedPartsFromRaw.map((part) => String(part).trim().toLowerCase())
      );

      selectedValue.linked_custom_fields.forEach((linkedField) => {
        const linkedFieldId = linkedField && linkedField.linked_custom_field_id;
        if (!linkedFieldId) return;

        if (!Array.isArray(linkedField.linked_custom_field_values)) {
          return;
        }

        const fieldIdKey = String(linkedFieldId).trim();
        linkedFieldValuesByField[fieldIdKey] = {
          linked_custom_field_id: fieldIdKey,
          linked_custom_field_values: [],
        };

        linkedField.linked_custom_field_values.forEach((linkedVal) => {
          const rawId = linkedVal && linkedVal.linked_custom_field_value_id;
          const linkedValueId = rawId
            ? typeof rawId === 'string'
              ? rawId.trim()
              : String(rawId)
            : '';
          if (!linkedValueId) return;

          // Получаем текстовое значение для сопоставления
          const linkedValueText = linkedVal && linkedVal.linked_custom_field_value
            ? String(linkedVal.linked_custom_field_value).trim()
            : '';

          // Если нужно фильтровать, проверяем, есть ли это значение в linkedPartsFromRaw
          if (shouldFilter) {
            // Ищем совпадение по тексту значения или по value_id (регистронезависимо)
            // Приоритет: точное совпадение > совпадение по ID > частичное совпадение (только для длинных строк)
            const linkedValueTextLower = linkedValueText.toLowerCase().trim();
            const linkedValueIdLower = linkedValueId.toLowerCase().trim();
            
            let matches = false;
            
            // Сначала проверяем точное совпадение (по тексту или ID)
            for (const partLower of linkedPartsSet) {
              const partTrimmed = partLower.trim();
              // Точное совпадение (регистронезависимо)
              if (partTrimmed === linkedValueTextLower || partTrimmed === linkedValueIdLower) {
                matches = true;
                break;
              }
            }
            
            // Если точного совпадения нет, пробуем частичное, но только для достаточно длинных строк
            // и только если одно значение полностью содержится в другом
            if (!matches && linkedValueTextLower.length >= 3) {
              for (const partLower of linkedPartsSet) {
                const partTrimmed = partLower.trim();
                if (partTrimmed.length >= 3) {
                  // Проверяем, что одно значение полностью содержится в другом
                  // Это важно для значений типа "Частями, МКК" - нужно найти точное совпадение
                  const textContainsPart = linkedValueTextLower.includes(partTrimmed);
                  const partContainsText = partTrimmed.includes(linkedValueTextLower);
                  
                  // Для более точного сопоставления проверяем, что совпадает хотя бы 80% длины
                  const minLength = Math.min(linkedValueTextLower.length, partTrimmed.length);
                  const maxLength = Math.max(linkedValueTextLower.length, partTrimmed.length);
                  const lengthRatio = minLength / maxLength;
                  
                  if ((textContainsPart || partContainsText) && lengthRatio >= 0.8) {
                    matches = true;
                    break;
                  }
                }
              }
            }

            if (!matches) {
              return; // Пропускаем это значение, если оно не указано в linkedPartsFromRaw
            }
          }

          linkedFieldValuesByField[fieldIdKey].linked_custom_field_values.push({
            linked_custom_field_value_id: linkedValueId,
          });
        });
      });

      // Удаляем поля, у которых не осталось значений после фильтрации
      Object.keys(linkedFieldValuesByField).forEach((fieldIdKey) => {
        if (linkedFieldValuesByField[fieldIdKey].linked_custom_field_values.length === 0) {
          delete linkedFieldValuesByField[fieldIdKey];
        }
      });

      const linkedArray = Object.values(linkedFieldValuesByField);
      if (linkedArray.length > 0) {
        item.linked_custom_fields = linkedArray;
      }
    }

    result.push(item);
  });

  return result;
}


