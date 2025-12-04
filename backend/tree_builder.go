package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/google/uuid"
)

func buildTreeStructure(db *sql.DB, tree TreeDefinition) TreeStructure {
	// Local handler to reuse helper logic that builds custom_fields with linked_custom_fields
	h := &Handler{db: db}

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
		// ВАЖНО:
		//  - custom_fields_ids теперь хранит ID самих кастомных полей (field_id),
		//  - custom_fields_values_ids хранит ID выбранных значений (value_id).
		// Для построения иерархии по значениям нам нужны ИМЕННО value_id,
		// поэтому здесь используем custom_fields_values_ids.
		// Дополнительно читаем custom_fields_ids, чтобы корректно восстановить структуру
		// с учётом linked_custom_fields так же, как это делает ручка positions/{id}.
		`SELECT id, name, custom_fields_ids, custom_fields_values_ids, employee_full_name FROM positions ORDER BY id`,
	)
	defer rows.Close()

	var positions []struct {
		ID                   string
		Name                 string
		CustomFields         map[string]string
		CustomFieldDetails   map[string]PositionCustomFieldValue
		EmployeeFullName     *string
	}

	for rows.Next() {
		var p struct {
			ID                 string
			Name               string
			CustomFields       map[string]string
			CustomFieldDetails map[string]PositionCustomFieldValue
			EmployeeFullName   *string
		}
		var customFieldsIDsJSON []byte
		var customFieldsValuesIDsJSON []byte
		var employeeFullName sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &customFieldsIDsJSON, &customFieldsValuesIDsJSON, &employeeFullName); err == nil {
			p.CustomFields = make(map[string]string)
			p.CustomFieldDetails = make(map[string]PositionCustomFieldValue)

			// Восстанавливаем те же структуры custom_fields, что и в ручке positions/{id},
			// чтобы структура дерева учитывала все linked_custom_fields и их значения.
			var cfIDs UUIDArray
			var cfValueIDs UUIDArray
			if customFieldsIDsJSON != nil {
				_ = json.Unmarshal(customFieldsIDsJSON, &cfIDs)
			}
			if customFieldsValuesIDsJSON != nil {
				_ = json.Unmarshal(customFieldsValuesIDsJSON, &cfValueIDs)
			}

			if len(cfIDs) > 0 && len(cfValueIDs) > 0 {
				if customFieldsArray, err := h.buildCustomFieldsArrayFromIDs(&cfIDs, &cfValueIDs); err == nil {
					for _, cf := range customFieldsArray {
						// Сохраняем основное значение поля по его key —
						// именно по нему строится путь в дереве.
						if _, exists := p.CustomFields[cf.CustomFieldKey]; !exists {
							p.CustomFields[cf.CustomFieldKey] = cf.CustomFieldValue
						}
						// И отдельную детальную структуру, включающую linked_custom_fields.
						if _, exists := p.CustomFieldDetails[cf.CustomFieldKey]; !exists {
							p.CustomFieldDetails[cf.CustomFieldKey] = cf
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
		ID                 string
		Name               string
		CustomFields       map[string]string
		CustomFieldDetails map[string]PositionCustomFieldValue
		EmployeeFullName   *string
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
		ID                 string
		Name               string
		CustomFields       map[string]string
		CustomFieldDetails map[string]PositionCustomFieldValue
		EmployeeFullName   *string
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

	// Pre-load all custom field definitions for linked fields lookup
	allFieldsRows, err := db.Query(`SELECT id, key, label FROM custom_fields`)
	if err != nil {
		return fieldDefsByKey
	}
	fieldInfoMap := make(map[uuid.UUID]struct {
		Key   string
		Label string
	})
	for allFieldsRows.Next() {
		var fieldID uuid.UUID
		var key, label string
		if err := allFieldsRows.Scan(&fieldID, &key, &label); err == nil {
			fieldInfoMap[fieldID] = struct {
				Key   string
				Label string
			}{Key: key, Label: label}
		}
	}
	allFieldsRows.Close()

	// Pre-load all custom field values for linked values lookup
	allValuesRows, err := db.Query(`SELECT id, value FROM custom_fields_values`)
	if err != nil {
		return fieldDefsByKey
	}
	valueInfoMap := make(map[uuid.UUID]string)
	for allValuesRows.Next() {
		var valueID uuid.UUID
		var value string
		if err := allValuesRows.Scan(&valueID, &value); err == nil {
			valueInfoMap[valueID] = value
		}
	}
	allValuesRows.Close()

	// Pre-load field-to-values mapping (which values belong to which fields)
	fieldToValuesMap := make(map[uuid.UUID]map[uuid.UUID]bool)
	fieldsForMappingRows, err := db.Query(`SELECT id, allowed_values_ids FROM custom_fields WHERE allowed_values_ids IS NOT NULL`)
	if err == nil {
		for fieldsForMappingRows.Next() {
			var fieldID uuid.UUID
			var allowedValueIDsJSON []byte
			if err := fieldsForMappingRows.Scan(&fieldID, &allowedValueIDsJSON); err == nil {
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
		fieldsForMappingRows.Close()
	}

	// Load custom field definitions with allowed values and linked fields
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
			// Load custom_fields_values and build allowed_values with linked_custom_fields
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
								// Build linked_custom_fields structure
								linkedCustomFields := []LinkedCustomField{}

								if linkedCustomFieldIDsJSON != nil && linkedCustomFieldValueIDsJSON != nil {
									var linkedFieldIDs []string
									var linkedValueIDs []string

									if err := json.Unmarshal(linkedCustomFieldIDsJSON, &linkedFieldIDs); err == nil {
										if err := json.Unmarshal(linkedCustomFieldValueIDsJSON, &linkedValueIDs); err == nil {
											// Parse all linked field IDs
											linkedFieldUUIDs := make([]uuid.UUID, 0, len(linkedFieldIDs))
											for _, idStr := range linkedFieldIDs {
												if id, err := uuid.Parse(idStr); err == nil {
													linkedFieldUUIDs = append(linkedFieldUUIDs, id)
												}
											}

											// Parse all linked value IDs
											linkedValueUUIDs := make([]uuid.UUID, 0, len(linkedValueIDs))
											for _, idStr := range linkedValueIDs {
												if id, err := uuid.Parse(idStr); err == nil {
													linkedValueUUIDs = append(linkedValueUUIDs, id)
												}
											}

											// For each linked field, find which values belong to it
											for _, linkedFieldID := range linkedFieldUUIDs {
												fieldInfo, fieldExists := fieldInfoMap[linkedFieldID]
												if !fieldExists {
													continue
												}

												// Find values that belong to this field
												fieldValueSet, hasValues := fieldToValuesMap[linkedFieldID]
												if !hasValues {
													continue
												}

												var linkedFieldValues []LinkedCustomFieldValue
												for _, valueID := range linkedValueUUIDs {
													// Check if this value belongs to the linked field
													if fieldValueSet[valueID] {
														// Get the value text from pre-loaded map
														if valueText, exists := valueInfoMap[valueID]; exists {
															linkedFieldValues = append(linkedFieldValues, LinkedCustomFieldValue{
																LinkedCustomFieldValueID: valueID,
																LinkedCustomFieldValue:   valueText,
															})
														}
													}
												}

												if len(linkedFieldValues) > 0 {
													linkedCustomFields = append(linkedCustomFields, LinkedCustomField{
														LinkedCustomFieldID:     linkedFieldID,
														LinkedCustomFieldKey:    fieldInfo.Key,
														LinkedCustomFieldLabel:  fieldInfo.Label,
														LinkedCustomFieldValues: linkedFieldValues,
													})
												}
											}
										}
									}
								}

								allowedValues = append(allowedValues, AllowedValue{
									ValueID:            cv.ID,
									Value:              cv.Value,
									LinkedCustomFields: linkedCustomFields,
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
	ID                 string
	Name               string
	CustomFields       map[string]string
	CustomFieldDetails map[string]PositionCustomFieldValue
	EmployeeFullName   *string
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
		ID                 string
		Name               string
		CustomFields       map[string]string
		CustomFieldDetails map[string]PositionCustomFieldValue
		EmployeeFullName   *string
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
				ID                 string
				Name               string
				CustomFields       map[string]string
				CustomFieldDetails map[string]PositionCustomFieldValue
				EmployeeFullName   *string
			})
			positionsWithoutLinkedValue := []struct {
				ID                 string
				Name               string
				CustomFields       map[string]string
				CustomFieldDetails map[string]PositionCustomFieldValue
				EmployeeFullName   *string
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

					// Строка с основной и прилинкованными величинами используется только
					// для внутренней группировки веток на бэкенде. Отдельное поле field_value
					// больше не выводится наружу — комбинированное название узла полностью
					// формируется на фронтенде из custom_field_value и linked_custom_field_value.
					combinedName := mainValueName
					for _, lv := range linkedValues {
						if lv.valueName == "" {
							continue
						}
						combinedName += " - " + lv.valueName
					}

					// Для группировки веток используем комбинированное имя, чтобы разные
					// комбинации прилинкованных значений расходились по разным веткам.
					linkedValueGroups[combinedName] = append(linkedValueGroups[combinedName], pos)
				} else {
					positionsWithoutLinkedValue = append(positionsWithoutLinkedValue, pos)
				}
			}

			// Create nodes for each linked value group
			for _, groupPositions := range linkedValueGroups {
				// Build new path (still using original value for path matching)
				newPath := make(map[string]string)
				for k, v := range path {
					newPath[k] = v
				}
				newPath[fieldKey] = val

				children := buildTreeLevel(groupPositions, levels, levelIndex+1, newPath, fieldDefsByKey, treeLevelFieldKeys)

				// Build linked custom fields и основное значение на основе той же логики,
				// что и в ручке positions/{id}: берём структуру из CustomFieldDetails.
				var linkedFields []LinkedCustomField
				customFieldID := fieldDef.ID.String()
				customFieldKey := fieldKey
				originalValue := mainValueName

				if len(groupPositions) > 0 {
					repPos := groupPositions[0]
					if cf, ok := repPos.CustomFieldDetails[fieldKey]; ok {
						if len(cf.LinkedCustomFields) > 0 {
							linkedFields = cf.LinkedCustomFields
						}
						// Перестраховка: если текст основного значения отличается от mainValueName,
						// используем тот, что вернула buildCustomFieldsArrayFromIDs.
						if cf.CustomFieldValue != "" {
							originalValue = cf.CustomFieldValue
						}
						if cf.CustomFieldID != "" {
							customFieldID = cf.CustomFieldID
						}
						if cf.CustomFieldKey != "" {
							customFieldKey = cf.CustomFieldKey
						}
					}
				}

				nodes = append(nodes, TreeNode{
					Type:               "custom_field_value",
					LevelOrder:         &levelOrder,
					CustomFieldID:      &customFieldID,
					CustomFieldKey:     &customFieldKey,
					CustomFieldValue:   &originalValue,
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
				ID                 string
				Name               string
				CustomFields       map[string]string
				CustomFieldDetails map[string]PositionCustomFieldValue
				EmployeeFullName   *string
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
		}
		vj := ""
		if fieldNodes[j].CustomFieldValue != nil {
			vj = *fieldNodes[j].CustomFieldValue
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

