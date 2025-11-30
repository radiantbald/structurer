package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/google/uuid"
)

func buildTreeStructure(db *sql.DB, tree TreeDefinition) TreeStructure {
	structure := TreeStructure{
		TreeID: tree.ID.String(),
		Name:   tree.Name,
		Levels: tree.Levels,
		Root: TreeNode{
			Type:     "root",
			Children: []TreeNode{},
		},
	}

	// If no levels, return plain list of positions
	if len(tree.Levels) == 0 {
		rows, _ := db.Query(
			`SELECT id, name, employee_full_name FROM positions ORDER BY id`,
		)
		defer rows.Close()

		for rows.Next() {
			var positionID int64
			var positionName string
			var employeeFullName sql.NullString
			if err := rows.Scan(&positionID, &positionName, &employeeFullName); err == nil {
				idStr := fmt.Sprint(positionID)
				var employeeFullNamePtr *string
				if employeeFullName.Valid && employeeFullName.String != "" {
					employeeFullNamePtr = &employeeFullName.String
				}
				structure.Root.Children = append(structure.Root.Children, TreeNode{
					Type:            "position",
					PositionID:      &idStr,
					PositionName:    &positionName,
					EmployeeFullName: employeeFullNamePtr,
					Children:        []TreeNode{},
				})
			}
		}
		return structure
	}

	// Pre-load field-to-values mapping (which values belong to which fields)
	fieldToValuesMap := make(map[uuid.UUID]map[uuid.UUID]bool)
	fieldInfoMap := make(map[uuid.UUID]struct {
		Key   string
		Label string
	})
	fieldsRows, _ := db.Query(`SELECT id, key, label, allowed_values_ids FROM custom_fields WHERE allowed_values_ids IS NOT NULL`)
	if fieldsRows != nil {
		for fieldsRows.Next() {
			var fieldID uuid.UUID
			var key, label string
			var allowedValueIDsJSON []byte
			if err := fieldsRows.Scan(&fieldID, &key, &label, &allowedValueIDsJSON); err == nil {
				fieldInfoMap[fieldID] = struct {
					Key   string
					Label string
				}{Key: key, Label: label}
				var ids []string
				if err := json.Unmarshal(allowedValueIDsJSON, &ids); err == nil {
					valueSet := make(map[uuid.UUID]bool)
					for _, idStr := range ids {
						if id, err := uuid.Parse(idStr); err == nil {
							valueSet[id] = true
						}
					}
					fieldToValuesMap[fieldID] = valueSet
				}
			}
		}
		fieldsRows.Close()
	}

	// Pre-load all custom field values
	valueInfoMap := make(map[uuid.UUID]string)
	valuesRows, _ := db.Query(`SELECT id, value FROM custom_fields_values`)
	if valuesRows != nil {
		for valuesRows.Next() {
			var valueID uuid.UUID
			var value string
			if err := valuesRows.Scan(&valueID, &value); err == nil {
				valueInfoMap[valueID] = value
			}
		}
		valuesRows.Close()
	}

	// Build value-to-field mapping
	valueToFieldMap := make(map[uuid.UUID]uuid.UUID)
	for fieldID, valueSet := range fieldToValuesMap {
		for valueID := range valueSet {
			valueToFieldMap[valueID] = fieldID
		}
	}

	// Get all positions в порядке их создания (по id)
	rows, _ := db.Query(
		`SELECT id, name, custom_fields_ids, employee_full_name FROM positions ORDER BY id`,
	)
	defer rows.Close()

	var positions []struct {
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
	}

	for rows.Next() {
		var p struct {
			ID             string
			Name           string
			CustomFields   map[string]string
			EmployeeFullName *string
		}
		var customFieldsIDsJSON []byte
		var employeeFullName sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &customFieldsIDsJSON, &employeeFullName); err == nil {
			p.CustomFields = make(map[string]string)
			if customFieldsIDsJSON != nil {
				// Parse array of UUID strings
				var ids []string
				if err := json.Unmarshal(customFieldsIDsJSON, &ids); err == nil {
					// For each value ID, find which field it belongs to and get its value
					for _, idStr := range ids {
						if valueID, err := uuid.Parse(idStr); err == nil {
							// Find which field this value belongs to
							if fieldID, exists := valueToFieldMap[valueID]; exists {
								// Get field key
								if fieldInfo, exists := fieldInfoMap[fieldID]; exists {
									// Get value text
									if valueText, exists := valueInfoMap[valueID]; exists {
										// Store first value for each field (take first occurrence)
										if _, alreadySet := p.CustomFields[fieldInfo.Key]; !alreadySet {
											p.CustomFields[fieldInfo.Key] = valueText
										}
									}
								}
							}
						}
					}
				}
			}
			if employeeFullName.Valid && employeeFullName.String != "" {
				p.EmployeeFullName = &employeeFullName.String
			}
			positions = append(positions, p)
		}
	}

	// First, determine positions that have at least one non‑empty value
	// for any of the tree levels. Остальные считаем полностью "вне структуры".
	structuredPositionIDs := make(map[string]bool)
	for _, pos := range positions {
	levelScan:
		for _, lvl := range tree.Levels {
			if val, ok := pos.CustomFields[lvl.CustomFieldKey]; ok && val != "" {
				structuredPositionIDs[pos.ID] = true
				break levelScan
			}
		}
	}

	// Filter positions passed into tree‑builder so, что в саму иерархию попадают
	// только должности, у которых есть хотя бы одно значимое значение уровня.
	var structuredPositions []struct {
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
	}
	for _, pos := range positions {
		if structuredPositionIDs[pos.ID] {
			structuredPositions = append(structuredPositions, pos)
		}
	}

	// Load custom field definitions to check for linked fields
	fieldDefsByKey := loadCustomFieldDefinitions(db)

	// Create a map of tree level field keys for quick lookup
	treeLevelFieldKeys := make(map[string]bool)
	for _, level := range tree.Levels {
		treeLevelFieldKeys[level.CustomFieldKey] = true
	}

	// Build structured part of the tree recursively на основе только структурированных позиций.
	structuredChildren := buildTreeLevel(structuredPositions, tree.Levels, 0, nil, fieldDefsByKey, treeLevelFieldKeys)

	// Collect positions that don't participate in the tree at all (no values for any tree level keys)
	unstructuredPositions := make([]struct {
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
	}, 0)

	for _, pos := range positions {
		if !structuredPositionIDs[pos.ID] {
			unstructuredPositions = append(unstructuredPositions, pos)
		}
	}

	// Create a special group node for positions outside the structure
	if len(unstructuredPositions) > 0 {
		var unstructuredNodes []TreeNode
		for _, pos := range unstructuredPositions {
			positionID := pos.ID
			positionName := pos.Name
			unstructuredNodes = append(unstructuredNodes, TreeNode{
				Type:            "position",
				PositionID:      &positionID,
				PositionName:    &positionName,
				EmployeeFullName: pos.EmployeeFullName,
				Children:        []TreeNode{},
			})
		}

		// Группа для должностей, которые находятся вне иерархической структуры
		label := "Вне структуры"
		// field_key is intentionally nil so that frontend won't add any path constraints
		unstructuredGroup := TreeNode{
			Type:            "custom_field_value",
			LevelOrder:      nil,
			CustomFieldKey:  nil,
			CustomFieldValue: &label,
			Children:        unstructuredNodes,
		}

		structuredChildren = append(structuredChildren, unstructuredGroup)
	}

	// Защитный fallback: если по какой‑то причине дерево уровней не смогло
	// распределить ни одной должности по веткам, показываем все позиции
	// плоским списком, чтобы они не "пропадали" из интерфейса.
	if len(structuredChildren) == 0 && len(positions) > 0 {
		var flat []TreeNode
		for _, pos := range positions {
			positionID := pos.ID
			positionName := pos.Name
			flat = append(flat, TreeNode{
				Type:            "position",
				PositionID:      &positionID,
				PositionName:    &positionName,
				EmployeeFullName: pos.EmployeeFullName,
				Children:        []TreeNode{},
			})
		}
		// Сохраняем порядок по id (как пришло из БД), без сортировки по имени
		structuredChildren = flat
	}

	structure.Root.Children = structuredChildren

	return structure
}

func loadCustomFieldDefinitions(db *sql.DB) map[string]CustomFieldDefinition {
	fieldDefsByKey := make(map[string]CustomFieldDefinition)
	rows, err := db.Query(
		`SELECT id, key, label, allowed_values_ids, created_at, updated_at
		FROM custom_fields`,
	)
	if err != nil {
		return fieldDefsByKey
	}
	defer rows.Close()

	for rows.Next() {
		var f CustomFieldDefinition
		var allowedValueIDsJSON []byte
		if err := rows.Scan(&f.ID, &f.Key, &f.Label, &allowedValueIDsJSON,
			&f.CreatedAt, &f.UpdatedAt); err == nil {
			// Load custom_fields_values and build allowed_values
			if allowedValueIDsJSON != nil {
				var ids []string
				if err := json.Unmarshal(allowedValueIDsJSON, &ids); err == nil {
					var allowedValues AllowedValuesArray
					for _, idStr := range ids {
						if valueID, err := uuid.Parse(idStr); err == nil {
							var cv CustomFieldValue
							var linkedCustomFieldIDsJSON []byte
							var linkedCustomFieldValueIDsJSON []byte
							err := db.QueryRow(
								`SELECT id, value, linked_custom_fields_ids, linked_custom_fields_values_ids, created_at, updated_at
								FROM custom_fields_values WHERE id = $1`,
								valueID,
							).Scan(&cv.ID, &cv.Value, &linkedCustomFieldIDsJSON, &linkedCustomFieldValueIDsJSON, &cv.CreatedAt, &cv.UpdatedAt)
							if err == nil {
								// LinkedCustomFields is no longer stored in DB, set empty array
								allowedValues = append(allowedValues, AllowedValue{
									ValueID:            cv.ID,
									Value:              cv.Value,
									LinkedCustomFields: []LinkedCustomField{},
								})
							}
						}
					}
					f.AllowedValues = &allowedValues
				}
			}
			fieldDefsByKey[f.Key] = f
		}
	}
	return fieldDefsByKey
}

// buildLinkedCustomFields builds linked custom fields array for a given allowed value.
// Returns all linked custom fields from the definition, not filtered by tree hierarchy.
func buildLinkedCustomFields(allowedValue *AllowedValue) []LinkedCustomField {
	if allowedValue == nil || len(allowedValue.LinkedCustomFields) == 0 {
		return nil
	}

	// Return all linked custom fields from the definition
	return allowedValue.LinkedCustomFields
}

func buildTreeLevel(positions []struct {
	ID             string
	Name           string
	CustomFields   map[string]string
	EmployeeFullName *string
}, levels []TreeLevel, levelIndex int, path map[string]string, fieldDefsByKey map[string]CustomFieldDefinition, treeLevelFieldKeys map[string]bool) []TreeNode {
	if levelIndex >= len(levels) {
		// Leaf level - return positions
		var nodes []TreeNode
		for _, pos := range positions {
			// Check if position matches the path
			if matchesPath(pos.CustomFields, path) {
				positionID := pos.ID
				positionName := pos.Name
				nodes = append(nodes, TreeNode{
					Type:            "position",
					PositionID:      &positionID,
					PositionName:    &positionName,
					EmployeeFullName: pos.EmployeeFullName,
					Children:        []TreeNode{},
				})
			}
		}
		// Сохраняем порядок по id (как пришло из БД), без сортировки по имени
		return nodes
	}

	// Get unique values for this level
	level := levels[levelIndex]
	fieldKey := level.CustomFieldKey
	order := level.Order

	valueSet := make(map[string]bool)
	var positionsWithoutValue []struct {
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
	}
	for _, pos := range positions {
		if !matchesPath(pos.CustomFields, path) {
			continue
		}
		val, ok := pos.CustomFields[fieldKey]
		if !ok || val == "" {
			// Должность подходит под путь, но не заполнила поле текущего уровня —
			// оставляем её на этом уровне как "лист" рядом с дочерними папками.
			positionsWithoutValue = append(positionsWithoutValue, pos)
			continue
		}
		valueSet[val] = true
	}

	// Если по текущему уровню вообще нет значений (ни одна должность не заполнила это поле),
	// дальше делить смысла нет — отображаем должности на текущем уровне как листья.
	if len(valueSet) == 0 {
		var nodes []TreeNode
		for _, pos := range positionsWithoutValue {
			positionID := pos.ID
			positionName := pos.Name
			nodes = append(nodes, TreeNode{
				Type:            "position",
				PositionID:      &positionID,
				PositionName:    &positionName,
				EmployeeFullName: pos.EmployeeFullName,
				Children:        []TreeNode{},
			})
		}
		// Сохраняем порядок по id (как пришло из БД), без сортировки по имени
		return nodes
	}

	// Get field definition to check for linked fields
	fieldDef, hasFieldDef := fieldDefsByKey[fieldKey]
	
	// Check if any value has linked custom fields
	hasLinkedFields := false
	if hasFieldDef && fieldDef.AllowedValues != nil {
		for _, allowedVal := range *fieldDef.AllowedValues {
			// Match by value_id (UUID string) or by value text
			valueIDStr := allowedVal.ValueID.String()
			for val := range valueSet {
				if val == valueIDStr || val == allowedVal.Value {
					if len(allowedVal.LinkedCustomFields) > 0 {
						hasLinkedFields = true
						break
					}
				}
			}
			if hasLinkedFields {
				break
			}
		}
	}

	// Create nodes for each unique value
	var nodes []TreeNode
	for val := range valueSet {
		levelOrder := order
		fieldKeyCopy := fieldKey

		// Find matching allowed value to get linked fields
		var matchedAllowedValue *AllowedValue
		if hasFieldDef && fieldDef.AllowedValues != nil {
			for i := range *fieldDef.AllowedValues {
				allowedVal := &(*fieldDef.AllowedValues)[i]
				valueIDStr := allowedVal.ValueID.String()
				if val == valueIDStr || val == allowedVal.Value {
					matchedAllowedValue = allowedVal
					break
				}
			}
		}

		// If this value has linked fields, create separate folders for each linked value
		// Разными значениями также считаются значения одного кастомного поля, 
		// к которому прилинкованы разные значения другого кастомного поля
		hasLinkedFields := false
		if matchedAllowedValue != nil && len(matchedAllowedValue.LinkedCustomFields) > 0 {
			hasLinkedFields = true
		}
		
		if hasLinkedFields {
			// Group positions by linked field values
			linkedValueGroups := make(map[string][]struct {
				ID             string
				Name           string
				CustomFields   map[string]string
				EmployeeFullName *string
			})
			positionsWithoutLinkedValue := []struct {
				ID             string
				Name           string
				CustomFields   map[string]string
				EmployeeFullName *string
			}{}

			// Get main value name for display
			mainValueName := matchedAllowedValue.Value

			// Create a map to get level order for linked fields (for sorting)
			linkedFieldOrder := make(map[string]int)
			for i, level := range levels {
				linkedFieldOrder[level.CustomFieldKey] = i
			}

			// Group positions by all linked field values
			// Разными значениями также считаются значения одного кастомного поля,
			// к которому прилинкованы разные значения другого кастомного поля
			for _, pos := range positions {
				if !matchesPath(pos.CustomFields, path) {
					continue
				}
				posVal, ok := pos.CustomFields[fieldKey]
				if !ok || posVal != val {
					continue
				}

				// Collect all linked field values
				// Название прилинкованного кастомного поля брать из объекта "custom_field_value" 
				// "linked_custom_field_value", находящегося иерархично в объекте "linked_custom_fields"
				type linkedValueInfo struct {
					fieldKey   string
					valueName  string
					order      int
				}
				var linkedValues []linkedValueInfo

				for _, linkedField := range matchedAllowedValue.LinkedCustomFields {
					linkedFieldKey := linkedField.LinkedCustomFieldKey
					
					linkedStoredValue, linkedExists := pos.CustomFields[linkedFieldKey]
					
					if linkedExists && linkedStoredValue != "" {
						// Find matching linked value name from linked_custom_field_value
						linkedValueName := linkedStoredValue
						for _, linkedValueDef := range linkedField.LinkedCustomFieldValues {
							linkedValueIDStr := linkedValueDef.LinkedCustomFieldValueID.String()
							if linkedStoredValue == linkedValueIDStr || linkedStoredValue == linkedValueDef.LinkedCustomFieldValue {
								// Название прилинкованного кастомного поля из linked_custom_field_value
								linkedValueName = linkedValueDef.LinkedCustomFieldValue
								break
							}
						}
						
						// Use order from tree hierarchy if field is in tree, otherwise use a high order
						order := 9999
						if treeLevelFieldKeys[linkedFieldKey] {
							order = linkedFieldOrder[linkedFieldKey]
						}
						
						linkedValues = append(linkedValues, linkedValueInfo{
							fieldKey:  linkedFieldKey,
							valueName: linkedValueName,
							order:     order,
						})
					}
				}

				if len(linkedValues) > 0 {
					// Sort linked values by their order in the tree hierarchy
					sort.Slice(linkedValues, func(i, j int) bool {
						return linkedValues[i].order < linkedValues[j].order
					})

					// Build folder name: "main value - linked value 1 - linked value 2 - ..."
					folderName := mainValueName
					for _, lv := range linkedValues {
						folderName += " - " + lv.valueName
					}
					
					linkedValueGroups[folderName] = append(linkedValueGroups[folderName], pos)
				} else {
					positionsWithoutLinkedValue = append(positionsWithoutLinkedValue, pos)
				}
			}

			// Create nodes for each linked value group
			for folderName, groupPositions := range linkedValueGroups {
				// Build new path (still using original value for path matching)
				newPath := make(map[string]string)
				for k, v := range path {
					newPath[k] = v
				}
				newPath[fieldKey] = val

				children := buildTreeLevel(groupPositions, levels, levelIndex+1, newPath, fieldDefsByKey, treeLevelFieldKeys)

				// Build linked custom fields (all linked fields from definition)
				linkedFields := buildLinkedCustomFields(matchedAllowedValue)

				customFieldID := fieldDef.ID.String()
				customFieldKey := fieldKey
				customFieldValue := folderName // Use folderName which contains "main value - linked value 1 - linked value 2"

				nodes = append(nodes, TreeNode{
					Type:              "custom_field_value",
					LevelOrder:         &levelOrder,
					CustomFieldID:      &customFieldID,
					CustomFieldKey:     &customFieldKey,
					CustomFieldValue:   &customFieldValue,
					LinkedCustomFields: linkedFields,
					Children:           children,
				})
			}

			// Add positions without linked values under main value name
			if len(positionsWithoutLinkedValue) > 0 {
				newPath := make(map[string]string)
				for k, v := range path {
					newPath[k] = v
				}
				newPath[fieldKey] = val

				children := buildTreeLevel(positionsWithoutLinkedValue, levels, levelIndex+1, newPath, fieldDefsByKey, treeLevelFieldKeys)

				// Build linked custom fields (all linked fields from definition)
				linkedFields := buildLinkedCustomFields(matchedAllowedValue)

				customFieldID := fieldDef.ID.String()
				customFieldKey := fieldKey
				customFieldValue := mainValueName

				nodes = append(nodes, TreeNode{
					Type:              "custom_field_value",
					LevelOrder:         &levelOrder,
					CustomFieldID:      &customFieldID,
					CustomFieldKey:     &customFieldKey,
					CustomFieldValue:   &customFieldValue,
					LinkedCustomFields: linkedFields,
					Children:           children,
				})
			}
		} else {
			// No linked fields - create node as before
			// Filter positions that match this value
			var matchingPositions []struct {
				ID             string
				Name           string
				CustomFields   map[string]string
				EmployeeFullName *string
			}
			for _, pos := range positions {
				if !matchesPath(pos.CustomFields, path) {
					continue
				}
				posVal, ok := pos.CustomFields[fieldKey]
				if ok && posVal == val {
					matchingPositions = append(matchingPositions, pos)
				}
			}

			// Build new path
			newPath := make(map[string]string)
			for k, v := range path {
				newPath[k] = v
			}
			newPath[fieldKey] = val

			// Get display name from allowed values if available
			displayValue := val
			if matchedAllowedValue != nil {
				displayValue = matchedAllowedValue.Value
			}

			children := buildTreeLevel(matchingPositions, levels, levelIndex+1, newPath, fieldDefsByKey, treeLevelFieldKeys)

			// Build linked custom fields (all linked fields from definition)
			var linkedFields []LinkedCustomField
			if matchedAllowedValue != nil {
				linkedFields = buildLinkedCustomFields(matchedAllowedValue)
			}

			var customFieldID *string
			var customFieldKey *string
			if hasFieldDef {
				id := fieldDef.ID.String()
				customFieldID = &id
				customFieldKey = &fieldKeyCopy
			}

			nodes = append(nodes, TreeNode{
				Type:              "custom_field_value",
				LevelOrder:         &levelOrder,
				CustomFieldID:      customFieldID,
				CustomFieldKey:     customFieldKey,
				CustomFieldValue:   &displayValue,
				LinkedCustomFields: linkedFields,
				Children:           children,
			})
		}
	}

	// Добавляем должности без значения текущего уровня как отдельные листовые узлы
	// на одном уровне с "папками" значений.
	for _, pos := range positionsWithoutValue {
		positionID := pos.ID
		positionName := pos.Name
		nodes = append(nodes, TreeNode{
			Type:            "position",
			PositionID:      &positionID,
			PositionName:    &positionName,
			EmployeeFullName: pos.EmployeeFullName,
			Children:        []TreeNode{},
		})
	}

	// Сортировка: папки (узлы-значения поля) по названию, должности в том порядке,
	// в котором они пришли из БД (по id), и всегда после папок.
	var fieldNodes, positionNodes []TreeNode
	for _, n := range nodes {
		if n.Type == "custom_field_value" {
			fieldNodes = append(fieldNodes, n)
		} else {
			positionNodes = append(positionNodes, n)
		}
	}

	// Сортируем только папки по названию
	sort.Slice(fieldNodes, func(i, j int) bool {
		vi := ""
		if fieldNodes[i].CustomFieldValue != nil {
			vi = *fieldNodes[i].CustomFieldValue
		} else if fieldNodes[i].FieldValue != nil {
			vi = *fieldNodes[i].FieldValue
		}
		vj := ""
		if fieldNodes[j].CustomFieldValue != nil {
			vj = *fieldNodes[j].CustomFieldValue
		} else if fieldNodes[j].FieldValue != nil {
			vj = *fieldNodes[j].FieldValue
		}
		return vi < vj
	})

	// Возвращаем: сначала отсортированные папки, затем должности в исходном порядке
	return append(fieldNodes, positionNodes...)
}

func matchesPath(customFields map[string]string, path map[string]string) bool {
	if path == nil {
		return true
	}
	for key, value := range path {
		if val, ok := customFields[key]; !ok || val != value {
			return false
		}
	}
	return true
}

