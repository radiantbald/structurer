/**
 * Utility functions for search functionality
 */

/**
 * Checks if a position matches a search query
 * Supports AND/OR operators (case insensitive)
 * 
 * @param {Object} position - The position object to check
 * @param {string} query - The search query string
 * @param {Array} customFields - Array of custom field definitions for searching
 * @returns {boolean} - True if position matches the query
 */
export function matchesSearch(position, query, customFields = []) {
  if (!query || !query.trim()) {
    return true;
  }

  const searchText = query.trim();
  const searchLower = searchText.toLowerCase();

  // Check for AND/OR operators (case insensitive)
  const hasAnd = / and /i.test(searchText);
  const hasOr = / or /i.test(searchText);

  if (hasAnd || hasOr) {
    // Split by AND (higher priority, case insensitive)
    let parts = [];
    if (hasAnd) {
      parts = searchText.split(/ and /i).map(p => p.trim());
    } else {
      parts = [searchText];
    }

    // Check each part (which may contain OR)
    for (const part of parts) {
      if (/ or /i.test(part)) {
        // OR logic: at least one condition must match
        const orParts = part.split(/ or /i).map(p => p.trim());
        let orMatch = false;
        for (const orPart of orParts) {
          if (orPart && matchesSingleTerm(position, orPart, customFields)) {
            orMatch = true;
            break;
          }
        }
        if (!orMatch) {
          return false; // If no OR condition matched, the entire AND group doesn't match
        }
      } else {
        // AND logic: condition must match
        if (part && !matchesSingleTerm(position, part, customFields)) {
          return false;
        }
      }
    }
    return true;
  } else {
    // Simple search without operators
    return matchesSingleTerm(position, searchText, customFields);
  }
}

/**
 * Checks if a position matches a single search term
 * 
 * @param {Object} position - The position object to check
 * @param {string} term - The search term
 * @param {Array} customFields - Array of custom field definitions
 * @returns {boolean} - True if position matches the term
 */
export function matchesSingleTerm(position, term, customFields = []) {
  if (!term) return true;

  const termLower = term.toLowerCase();

  // Search by name
  if (position.name && position.name.toLowerCase().includes(termLower)) {
    return true;
  }

  // Search by description
  if (position.description && position.description.toLowerCase().includes(termLower)) {
    return true;
  }

  // Search by employee name
  if (position.employee_full_name && position.employee_full_name.toLowerCase().includes(termLower)) {
    return true;
  }

  // Search by custom fields (handles different storage formats and values)
  const customFieldTexts = [];

  // 1) Old/alternative format: position.custom_fields as object or array
  if (position.custom_fields) {
    if (Array.isArray(position.custom_fields)) {
      // Possible new format: array of objects with custom_field_label/custom_field_value
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

        // Fallback: if it's a primitive or something else, just serialize
        if (
          !cf.custom_field_label &&
          !cf.custom_field_value &&
          typeof cf === 'string'
        ) {
          customFieldTexts.push(cf);
        }
      });
    } else if (typeof position.custom_fields === 'object') {
      // Format: object { key: value }
      Object.values(position.custom_fields).forEach((v) => {
        if (v !== undefined && v !== null) {
          customFieldTexts.push(String(v));
        }
      });
    } else if (typeof position.custom_fields === 'string') {
      customFieldTexts.push(position.custom_fields);
    }
  }

  // 2) New format: only value IDs in custom_fields_values_ids,
  // values are taken from custom field definitions (customFields from state)
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
}

/**
 * Applies search filter to positions array
 * 
 * @param {Array} allPositions - All positions to filter
 * @param {string} query - Search query string
 * @param {Array} customFields - Custom field definitions
 * @returns {Array} - Filtered positions
 */
export function applySearchFilter(allPositions, query, customFields = []) {
  if (!query || !query.trim()) {
    return allPositions;
  }

  return allPositions.filter(pos => matchesSearch(pos, query, customFields));
}


