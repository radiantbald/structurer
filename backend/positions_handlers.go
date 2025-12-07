package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// Helper function to combine surname, employee_name, and patronymic into full name
func combineEmployeeFullName(surname, employeeName, patronymic *string) *string {
	var parts []string
	if surname != nil && *surname != "" {
		parts = append(parts, *surname)
	}
	if employeeName != nil && *employeeName != "" {
		parts = append(parts, *employeeName)
	}
	if patronymic != nil && *patronymic != "" {
		parts = append(parts, *patronymic)
	}
	if len(parts) == 0 {
		return nil
	}
	fullName := strings.Join(parts, " ")
	return &fullName
}

// Position handlers

func (h *Handler) GetPositions(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 100
	offset := 0

	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	// Parse search query
	searchQuery := ParseSearchQuery(search)
	whereClause, whereArgs := BuildWhereClause(searchQuery)

	var query string
	var args []interface{}

	baseQuery := `SELECT id, position_name, custom_fields_id, custom_fields_values_id, employee_id, employee_surname, employee_name, employee_patronymic, 
		employee_profile_url, created_at, updated_at
		FROM positions`

	if whereClause != "" {
		// Add WHERE clause and adjust parameter indices for LIMIT/OFFSET
		argCount := len(whereArgs)
		query = baseQuery + ` WHERE ` + whereClause + ` ORDER BY id LIMIT $` + strconv.Itoa(argCount+1) + ` OFFSET $` + strconv.Itoa(argCount+2)
		args = append(whereArgs, limit, offset)
	} else {
		query = baseQuery + ` ORDER BY id LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	rows, err := h.db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var positions []map[string]interface{}
	for rows.Next() {
		var p Position
		var customFieldsIDsJSON []byte
		var customFieldsValuesIDsJSON []byte
		err := rows.Scan(&p.ID, &p.Name, &customFieldsIDsJSON, &customFieldsValuesIDsJSON,
			&p.EmployeeExternalID, &p.Surname, &p.EmployeeName, &p.Patronymic, &p.EmployeeProfileURL,
			&p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if customFieldsIDsJSON != nil {
			json.Unmarshal(customFieldsIDsJSON, &p.CustomFieldsIDs)
		}
		if customFieldsValuesIDsJSON != nil {
			json.Unmarshal(customFieldsValuesIDsJSON, &p.CustomFieldsValuesIDs)
		}

		// Build nested custom_fields array
		customFieldsArray, err := h.buildCustomFieldsArrayFromIDs(p.CustomFieldsIDs, p.CustomFieldsValuesIDs)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Compute employee_full_name for backward compatibility
		p.EmployeeFullName = combineEmployeeFullName(p.Surname, p.EmployeeName, p.Patronymic)

		// Build response object with custom_fields array
		positionResponse := map[string]interface{}{
			"id":                   p.ID,
			"name":                 p.Name,
			"custom_fields":        customFieldsArray,
			"employee_id": p.EmployeeExternalID,
			"surname":              p.Surname,
			"employee_name":        p.EmployeeName,
			"patronymic":           p.Patronymic,
			"employee_full_name":   p.EmployeeFullName,
			"employee_profile_url": p.EmployeeProfileURL,
			"created_at":           p.CreatedAt,
			"updated_at":           p.UpdatedAt,
		}
		positions = append(positions, positionResponse)
	}

	// Get total count using the same search logic
	var total int
	countQuery := "SELECT COUNT(*) FROM positions"
	if whereClause != "" {
		countQuery = countQuery + " WHERE " + whereClause
		h.db.QueryRow(countQuery, whereArgs...).Scan(&total)
	} else {
		h.db.QueryRow(countQuery).Scan(&total)
	}

	response := map[string]interface{}{
		"items": positions,
		"total": total,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) GetPosition(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var p Position
	var customFieldsIDsJSON []byte
	var customFieldsValuesIDsJSON []byte
	err = h.db.QueryRow(
		`SELECT id, position_name, custom_fields_id, custom_fields_values_id, employee_id, employee_surname, employee_name, employee_patronymic, 
		employee_profile_url, created_at, updated_at
		FROM positions WHERE id = $1`,
		id,
	).Scan(&p.ID, &p.Name, &customFieldsIDsJSON, &customFieldsValuesIDsJSON,
		&p.EmployeeExternalID, &p.Surname, &p.EmployeeName, &p.Patronymic, &p.EmployeeProfileURL,
		&p.CreatedAt, &p.UpdatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, "Position not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if customFieldsIDsJSON != nil {
		json.Unmarshal(customFieldsIDsJSON, &p.CustomFieldsIDs)
	}
	if customFieldsValuesIDsJSON != nil {
		json.Unmarshal(customFieldsValuesIDsJSON, &p.CustomFieldsValuesIDs)
	}

	// Build nested custom_fields array
	customFieldsArray, err := h.buildCustomFieldsArrayFromIDs(p.CustomFieldsIDs, p.CustomFieldsValuesIDs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Compute employee_full_name for backward compatibility
	p.EmployeeFullName = combineEmployeeFullName(p.Surname, p.EmployeeName, p.Patronymic)

	response := map[string]interface{}{
		"id":                   p.ID,
		"name":                 p.Name,
		"custom_fields":        customFieldsArray,
		"employee_id": p.EmployeeExternalID,
		"surname":              p.Surname,
		"employee_name":        p.EmployeeName,
		"patronymic":           p.Patronymic,
		"employee_full_name":   p.EmployeeFullName,
		"employee_profile_url": p.EmployeeProfileURL,
		"created_at":           p.CreatedAt,
		"updated_at":           p.UpdatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) CreatePosition(w http.ResponseWriter, r *http.Request) {
	// Parse request body - can accept either nested structure or flat structure
	var requestBody map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Extract basic fields
	var name string
	var surname *string
	var employeeName *string
	var patronymic *string
	var employeeExternalID *string
	var employeeProfileURL *string

	if n, ok := requestBody["name"].(string); ok {
		name = n
	}
	// Handle both new format (surname, employee_name, patronymic) and old format (employee_full_name)
	if s, ok := requestBody["surname"].(string); ok {
		if s != "" {
			surname = &s
		}
	} else if requestBody["surname"] == nil {
		surname = nil
	}
	if en, ok := requestBody["employee_name"].(string); ok {
		if en != "" {
			employeeName = &en
		}
	} else if requestBody["employee_name"] == nil {
		employeeName = nil
	}
	if p, ok := requestBody["patronymic"].(string); ok {
		if p != "" {
			patronymic = &p
		}
	} else if requestBody["patronymic"] == nil {
		patronymic = nil
	}
	
	// Backward compatibility: if employee_full_name is provided, parse it
	if efn, ok := requestBody["employee_full_name"].(string); ok && efn != "" {
		parts := strings.Fields(efn)
		if len(parts) > 0 {
			surname = &parts[0]
		}
		if len(parts) > 1 {
			employeeName = &parts[1]
		}
		if len(parts) > 2 {
			pat := strings.Join(parts[2:], " ")
			patronymic = &pat
		}
	}
	
	if eid, ok := requestBody["employee_id"].(string); ok {
		employeeExternalID = &eid
	} else if requestBody["employee_id"] == nil {
		employeeExternalID = nil
	}
	if epu, ok := requestBody["employee_profile_url"].(string); ok {
		employeeProfileURL = &epu
	} else if requestBody["employee_profile_url"] == nil {
		employeeProfileURL = nil
	}

	// Process custom_fields
	// New format: custom_fields is an array with structure:
	// [
	//   {
	//     "custom_field_id": "uuid поля из таблицы custom_fields",
	//     "custom_field_value_id": "uuid значения из таблицы custom_fields_values",
	//     "linked_custom_fields": [
	//       {
	//         "linked_custom_field_values": [
	//           {
	//             "linked_custom_field_value_id": "uuid значения из таблицы custom_fields_values"
	//           }
	//         ]
	//       }
	//     ]
	//   }
	// ]
	// Note:
	//   - В positions.custom_fields_ids храним ИМЕННО ID кастомных полей (custom_field_id)
	//     для верхнеуровневых полей должности.
	//   - В positions.custom_fields_values_ids храним ID значений (custom_field_value_id)
	//     как для основного поля, так и для всех привязанных (linked_custom_field_value_id).
	
	// Save original custom_fields structure from request to return it in response
	var originalCustomFields interface{}
	if customFieldsRaw, ok := requestBody["custom_fields"]; ok {
		originalCustomFields = customFieldsRaw
	}
	
	// Use maps to track unique IDs and avoid duplicates
	customFieldsIDsMap := make(map[uuid.UUID]bool)
	customFieldsValuesIDsMap := make(map[uuid.UUID]bool)
	
	if customFieldsRaw, ok := requestBody["custom_fields"]; ok {
		if customFieldsArray, ok := customFieldsRaw.([]interface{}); ok {
			// Process each custom field
			for _, cfItem := range customFieldsArray {
				if cfMap, ok := cfItem.(map[string]interface{}); ok {
					// 1) Сохраняем ID самого кастомного поля (custom_field_id) в custom_fields_ids
					if customFieldIDRaw, ok := cfMap["custom_field_id"]; ok {
						if customFieldIDStr, ok := customFieldIDRaw.(string); ok && customFieldIDStr != "" {
							if fieldID, err := uuid.Parse(customFieldIDStr); err == nil {
								customFieldsIDsMap[fieldID] = true
							}
						}
					}

					// 2) Сохраняем ID выбранного значения основного поля (custom_field_value_id)
					//    в custom_fields_values_ids
					if customFieldValueIDRaw, ok := cfMap["custom_field_value_id"]; ok {
						if customFieldValueIDStr, ok := customFieldValueIDRaw.(string); ok && customFieldValueIDStr != "" {
							// Parse custom_field_value_id as UUID and store it in custom_fields_values_ids
							if valueID, err := uuid.Parse(customFieldValueIDStr); err == nil {
								customFieldsValuesIDsMap[valueID] = true
							}
						}
					}

					// 3) Обрабатываем привязанные кастомные поля и их значения
					if linkedFields, ok := cfMap["linked_custom_fields"].([]interface{}); ok {
						for _, lfItem := range linkedFields {
							if lfMap, ok := lfItem.(map[string]interface{}); ok {
								// 3.1) Сохраняем ID самого привязанного кастомного поля
								if linkedFieldIDRaw, ok := lfMap["linked_custom_field_id"]; ok {
									if linkedFieldIDStr, ok := linkedFieldIDRaw.(string); ok && linkedFieldIDStr != "" {
										if fieldID, err := uuid.Parse(linkedFieldIDStr); err == nil {
											// ID привязанного кастомного поля храним в custom_fields_ids
											customFieldsIDsMap[fieldID] = true
										}
									}
								}

								// 3.2) Сохраняем ID выбранных значений привязанных кастомных полей
								if linkedValues, ok := lfMap["linked_custom_field_values"].([]interface{}); ok {
									for _, lvItem := range linkedValues {
										if lvMap, ok := lvItem.(map[string]interface{}); ok {
											linkedValueID, _ := lvMap["linked_custom_field_value_id"].(string)
											if linkedValueID != "" {
												if valueID, err := uuid.Parse(linkedValueID); err == nil {
													// Store linked value IDs in custom_fields_values_ids
													customFieldsValuesIDsMap[valueID] = true
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// Convert maps to slices
	customFieldsIDs := make([]uuid.UUID, 0, len(customFieldsIDsMap))
	for id := range customFieldsIDsMap {
		customFieldsIDs = append(customFieldsIDs, id)
	}
	customFieldsValuesIDs := make([]uuid.UUID, 0, len(customFieldsValuesIDsMap))
	for id := range customFieldsValuesIDsMap {
		customFieldsValuesIDs = append(customFieldsValuesIDs, id)
	}

	customFieldsIDsArray := UUIDArray(customFieldsIDs)
	customFieldsIDsJSON, _ := json.Marshal(customFieldsIDsArray)

	customFieldsValuesIDsArray := UUIDArray(customFieldsValuesIDs)
	customFieldsValuesIDsJSON, _ := json.Marshal(customFieldsValuesIDsArray)

	var positionID int64
	err := h.db.QueryRow(
		`INSERT INTO positions (position_name, custom_fields_id, custom_fields_values_id, employee_id, employee_surname, employee_name, employee_patronymic, 
		employee_profile_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		RETURNING id`,
		name, customFieldsIDsJSON, customFieldsValuesIDsJSON,
		employeeExternalID, surname, employeeName, patronymic, employeeProfileURL,
	).Scan(&positionID)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Get created position to return with timestamps
	var p Position
	var customFieldsIDsFromCreated []byte
	var customFieldsValuesIDsFromCreated []byte
	err = h.db.QueryRow(
		`SELECT id, position_name, custom_fields_id, custom_fields_values_id, employee_id, employee_surname, employee_name, employee_patronymic, 
		employee_profile_url, created_at, updated_at
		FROM positions WHERE id = $1`,
		positionID,
	).Scan(&p.ID, &p.Name, &customFieldsIDsFromCreated, &customFieldsValuesIDsFromCreated,
		&p.EmployeeExternalID, &p.Surname, &p.EmployeeName, &p.Patronymic, &p.EmployeeProfileURL,
		&p.CreatedAt, &p.UpdatedAt)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if customFieldsIDsFromCreated != nil {
		json.Unmarshal(customFieldsIDsFromCreated, &p.CustomFieldsIDs)
	}
	if customFieldsValuesIDsFromCreated != nil {
		json.Unmarshal(customFieldsValuesIDsFromCreated, &p.CustomFieldsValuesIDs)
	}

	// Enrich the original custom_fields structure from request with additional data from DB
	// (key, label, value text) while preserving 100% structure match
	var customFieldsForResponse interface{}
	if originalCustomFields != nil {
		enriched, err := h.enrichCustomFieldsFromRequest(originalCustomFields)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		customFieldsForResponse = enriched
	} else {
		customFieldsForResponse = []interface{}{}
	}

	// Compute employee_full_name for backward compatibility
	p.EmployeeFullName = combineEmployeeFullName(p.Surname, p.EmployeeName, p.Patronymic)

	response := map[string]interface{}{
		"id":                   p.ID,
		"name":                 p.Name,
		"custom_fields":        customFieldsForResponse,
		"employee_id": p.EmployeeExternalID,
		"surname":              p.Surname,
		"employee_name":        p.EmployeeName,
		"patronymic":           p.Patronymic,
		"employee_full_name":   p.EmployeeFullName,
		"employee_profile_url": p.EmployeeProfileURL,
		"created_at":           p.CreatedAt,
		"updated_at":           p.UpdatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// enrichCustomFieldsFromRequest enriches the original custom_fields structure from request
// with additional data from DB (key, label, value text) while preserving the original structure
func (h *Handler) enrichCustomFieldsFromRequest(originalCustomFields interface{}) (interface{}, error) {
	// Pre-load all custom field definitions
	fieldRows, err := h.db.Query(`SELECT id, key, label FROM custom_fields`)
	if err != nil {
		return nil, err
	}
	defer fieldRows.Close()
	
	fieldInfoMap := make(map[string]struct {
		Key   string
		Label string
	})
	for fieldRows.Next() {
		var fieldID uuid.UUID
		var key, label string
		if err := fieldRows.Scan(&fieldID, &key, &label); err == nil {
			fieldInfoMap[fieldID.String()] = struct {
				Key   string
				Label string
			}{Key: key, Label: label}
		}
	}

	// Pre-load all custom field values
	valueRows, err := h.db.Query(`SELECT id, value FROM custom_fields_values`)
	if err != nil {
		return nil, err
	}
	defer valueRows.Close()
	
	valueInfoMap := make(map[string]string)
	for valueRows.Next() {
		var valueID uuid.UUID
		var value string
		if err := valueRows.Scan(&valueID, &value); err == nil {
			valueInfoMap[valueID.String()] = value
		}
	}

	// Enrich the original structure
	if customFieldsArray, ok := originalCustomFields.([]interface{}); ok {
		enrichedArray := make([]interface{}, 0, len(customFieldsArray))
		// Map to track linked fields that have been added as top-level items
		// Key: linked_custom_field_id, Value: set of linked_custom_field_value_id
		linkedFieldsAdded := make(map[string]map[string]bool)
		
		for _, cfItem := range customFieldsArray {
			if cfMap, ok := cfItem.(map[string]interface{}); ok {
				enrichedMap := make(map[string]interface{})
				// Copy all original fields
				for k, v := range cfMap {
					enrichedMap[k] = v
				}

				// Add custom_field_key and custom_field_label if custom_field_id exists
				if customFieldID, ok := cfMap["custom_field_id"].(string); ok && customFieldID != "" {
					if fieldInfo, exists := fieldInfoMap[customFieldID]; exists {
						enrichedMap["custom_field_key"] = fieldInfo.Key
						enrichedMap["custom_field_label"] = fieldInfo.Label
					}
				}

				// Add custom_field_value (text) if custom_field_value_id exists
				if customFieldValueID, ok := cfMap["custom_field_value_id"].(string); ok && customFieldValueID != "" {
					if valueText, exists := valueInfoMap[customFieldValueID]; exists {
						enrichedMap["custom_field_value"] = valueText
					}
				}

				// Enrich linked_custom_fields
				if linkedFields, ok := cfMap["linked_custom_fields"].([]interface{}); ok {
					enrichedLinkedFields := make([]interface{}, 0, len(linkedFields))
					for _, lfItem := range linkedFields {
						if lfMap, ok := lfItem.(map[string]interface{}); ok {
							enrichedLinkedMap := make(map[string]interface{})
							// Copy all original fields
							for k, v := range lfMap {
								enrichedLinkedMap[k] = v
							}

							// Add linked_custom_field_key and linked_custom_field_label if linked_custom_field_id exists
							if linkedFieldID, ok := lfMap["linked_custom_field_id"].(string); ok && linkedFieldID != "" {
								if fieldInfo, exists := fieldInfoMap[linkedFieldID]; exists {
									enrichedLinkedMap["linked_custom_field_key"] = fieldInfo.Key
									enrichedLinkedMap["linked_custom_field_label"] = fieldInfo.Label
								}
							}

							// Enrich linked_custom_field_values
							if linkedValues, ok := lfMap["linked_custom_field_values"].([]interface{}); ok {
								enrichedLinkedValues := make([]interface{}, 0, len(linkedValues))
								for _, lvItem := range linkedValues {
									if lvMap, ok := lvItem.(map[string]interface{}); ok {
										enrichedLinkedValueMap := make(map[string]interface{})
										// Copy all original fields
										for k, v := range lvMap {
											enrichedLinkedValueMap[k] = v
										}

										// Add linked_custom_field_value (text) if linked_custom_field_value_id exists
										if linkedValueID, ok := lvMap["linked_custom_field_value_id"].(string); ok && linkedValueID != "" {
											if valueText, exists := valueInfoMap[linkedValueID]; exists {
												enrichedLinkedValueMap["linked_custom_field_value"] = valueText
											}
										}

										enrichedLinkedValues = append(enrichedLinkedValues, enrichedLinkedValueMap)
									}
								}
								enrichedLinkedMap["linked_custom_field_values"] = enrichedLinkedValues
							}

							enrichedLinkedFields = append(enrichedLinkedFields, enrichedLinkedMap)
						}
					}
					enrichedMap["linked_custom_fields"] = enrichedLinkedFields
				}

				enrichedArray = append(enrichedArray, enrichedMap)
			}
		}
		
		// Add linked custom fields as separate top-level items
		// Iterate through enriched array to find linked fields
		for _, cfItem := range enrichedArray {
			if cfMap, ok := cfItem.(map[string]interface{}); ok {
				if linkedFields, ok := cfMap["linked_custom_fields"].([]interface{}); ok {
					for _, lfItem := range linkedFields {
						if lfMap, ok := lfItem.(map[string]interface{}); ok {
							linkedFieldID, hasLinkedFieldID := lfMap["linked_custom_field_id"].(string)
							if !hasLinkedFieldID || linkedFieldID == "" {
								continue
							}
							
							// Initialize map for this linked field if not exists
							if linkedFieldsAdded[linkedFieldID] == nil {
								linkedFieldsAdded[linkedFieldID] = make(map[string]bool)
							}
							
							// Process each linked value
							if linkedValues, ok := lfMap["linked_custom_field_values"].([]interface{}); ok {
								for _, lvItem := range linkedValues {
									if lvMap, ok := lvItem.(map[string]interface{}); ok {
										linkedValueID, hasLinkedValueID := lvMap["linked_custom_field_value_id"].(string)
										if !hasLinkedValueID || linkedValueID == "" {
											continue
										}
										
										// Check if we already added this combination
										if linkedFieldsAdded[linkedFieldID][linkedValueID] {
											continue
										}
										
										// Mark as added
										linkedFieldsAdded[linkedFieldID][linkedValueID] = true
										
										// Create top-level item for linked field
										topLevelLinkedField := make(map[string]interface{})
										topLevelLinkedField["custom_field_id"] = linkedFieldID
										topLevelLinkedField["custom_field_value_id"] = linkedValueID
										
										// Add field info
										if fieldInfo, exists := fieldInfoMap[linkedFieldID]; exists {
											topLevelLinkedField["custom_field_key"] = fieldInfo.Key
											topLevelLinkedField["custom_field_label"] = fieldInfo.Label
										}
										
										// Add value text
										if valueText, exists := valueInfoMap[linkedValueID]; exists {
											topLevelLinkedField["custom_field_value"] = valueText
										}
										
										enrichedArray = append(enrichedArray, topLevelLinkedField)
									}
								}
							}
						}
					}
				}
			}
		}
		
		return enrichedArray, nil
	}

	// If structure is not as expected, return as-is
	return originalCustomFields, nil
}

// buildCustomFieldsArrayFromIDs builds the nested custom_fields array structure
// customFieldsIDs          - массив ID кастомных полей (custom_field_id) для позиции
// customFieldsValuesIDs    - массив ID выбранных значений (custom_field_value_id и linked_custom_field_value_id)
func (h *Handler) buildCustomFieldsArrayFromIDs(customFieldsIDs *UUIDArray, customFieldsValuesIDs *UUIDArray) ([]PositionCustomFieldValue, error) {
	customFieldsArray := []PositionCustomFieldValue{}

	if customFieldsIDs == nil || len(*customFieldsIDs) == 0 || customFieldsValuesIDs == nil || len(*customFieldsValuesIDs) == 0 {
		return customFieldsArray, nil
	}

	// Build a set of selected value IDs (как для основных, так и для привязанных значений)
	selectedValueIDs := make(map[uuid.UUID]bool)
	if customFieldsValuesIDs != nil {
		for _, id := range *customFieldsValuesIDs {
			selectedValueIDs[id] = true
		}
	}

	// Load all custom fields data using service
	fieldInfoMap, valueInfoMap, fieldToValuesMap, err := h.customFieldsService.LoadAllCustomFieldsData()
	if err != nil {
		return nil, err
	}

	// Load all custom field definitions
	rows, err := h.db.Query(
		`SELECT id, key, label, allowed_values_ids, created_at, updated_at
		FROM custom_fields`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Build a map of custom field definitions by ID and map valueID -> fieldID
	fieldDefsByID := make(map[uuid.UUID]CustomFieldDefinition)
	valueToFieldMap := make(map[uuid.UUID]uuid.UUID) // Maps value ID to field ID
	for rows.Next() {
		var f CustomFieldDefinition
		var allowedValueIDsJSON []byte
		err := rows.Scan(&f.ID, &f.Key, &f.Label, &allowedValueIDsJSON,
			&f.CreatedAt, &f.UpdatedAt)
		if err != nil {
			return nil, err
		}
		fieldDefsByID[f.ID] = f

		// Map each allowed value to this field
		if allowedValueIDsJSON != nil {
			var ids []string
			if err := json.Unmarshal(allowedValueIDsJSON, &ids); err == nil {
				for _, idStr := range ids {
					if valueID, err := uuid.Parse(idStr); err == nil {
						valueToFieldMap[valueID] = f.ID
					}
				}
			}
		}
	}

	// Построим отображение: ID поля -> выбранное для него значение (valueID)
	fieldToSelectedValue := make(map[uuid.UUID]uuid.UUID)
	for _, valueID := range *customFieldsValuesIDs {
		fieldID, exists := valueToFieldMap[valueID]
		if !exists {
			continue
		}
		// Берём первое найденное значение для поля (предполагаем по одному значению на поле)
		if _, already := fieldToSelectedValue[fieldID]; !already {
			fieldToSelectedValue[fieldID] = valueID
		}
	}

	// Process each field ID from the position (верхнеуровневые поля должности)
	for _, fieldID := range *customFieldsIDs {
		valueID, hasValue := fieldToSelectedValue[fieldID]
		if !hasValue {
			continue
		}

		fieldDef := fieldDefsByID[fieldID]
		valueText := valueInfoMap[valueID]

		// Build linked custom fields structure from custom_fields_values
		var linkedCustomFieldIDsJSON []byte
		var linkedCustomFieldValueIDsJSON []byte
		err := h.db.QueryRow(
			`SELECT linked_custom_fields_ids, linked_custom_fields_values_ids
			FROM custom_fields_values WHERE id = $1`,
			valueID,
		).Scan(&linkedCustomFieldIDsJSON, &linkedCustomFieldValueIDsJSON)

		var linkedFields []LinkedCustomField
		if err == nil {
			linkedFields, _ = h.customFieldsService.BuildLinkedCustomFields(
				linkedCustomFieldIDsJSON,
				linkedCustomFieldValueIDsJSON,
				fieldInfoMap,
				fieldToValuesMap,
				valueInfoMap,
				selectedValueIDs,
			)
		}

		valueItem := PositionCustomFieldValue{
			CustomFieldID:      fieldDef.ID.String(),
			CustomFieldKey:     fieldDef.Key,
			CustomFieldLabel:   fieldDef.Label,
			CustomFieldValue:   valueText,
			CustomFieldValueID: valueID,
		}
		if len(linkedFields) > 0 {
			valueItem.LinkedCustomFields = linkedFields
		}
		customFieldsArray = append(customFieldsArray, valueItem)
	}

	return customFieldsArray, nil
}

// buildCustomFieldsArray builds the nested custom_fields array structure from flat JSONB
// DEPRECATED: Use buildCustomFieldsArrayFromIDs instead
func (h *Handler) buildCustomFieldsArray(customFieldsJSON JSONB) ([]PositionCustomFieldValue, error) {
	customFieldsArray := []PositionCustomFieldValue{}

	// Pre-load all custom field definitions for linked fields lookup
	allFieldsRows, err := h.db.Query(`SELECT id, key, label FROM custom_fields`)
	if err != nil {
		return nil, err
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
	allValuesRows, err := h.db.Query(`SELECT id, value FROM custom_fields_values`)
	if err != nil {
		return nil, err
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
	fieldsForMappingRows, err := h.db.Query(`SELECT id, allowed_values_ids FROM custom_fields WHERE allowed_values_ids IS NOT NULL`)
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

	// Load all custom field definitions
	rows, err := h.db.Query(
		`SELECT id, key, label, allowed_values_ids, created_at, updated_at
		FROM custom_fields`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Build a map of custom field definitions by key
	fieldDefsByKey := make(map[string]CustomFieldDefinition)
	for rows.Next() {
		var f CustomFieldDefinition
		var allowedValueIDsJSON []byte
		err := rows.Scan(&f.ID, &f.Key, &f.Label, &allowedValueIDsJSON,
			&f.CreatedAt, &f.UpdatedAt)
		if err != nil {
			return nil, err
		}
		fieldDefsByKey[f.Key] = f
	}

	// Process each custom field in the position
	for fieldKey, storedValue := range customFieldsJSON {
		fieldDef, exists := fieldDefsByKey[fieldKey]
		if !exists {
			// Field definition not found, skip
			continue
		}

		// Get stored value as string
		storedValueStr := ""
		if v, ok := storedValue.(string); ok {
			storedValueStr = v
		}

		// Try to find matching value in custom_fields_values
		var matchedValueID *uuid.UUID
		var matchedValueText string

		// Check if stored value is a UUID (value_id) or a text value
		if valueID, err := uuid.Parse(storedValueStr); err == nil {
			// It's a UUID, check if it exists in custom_fields_values
			var valueText string
			err := h.db.QueryRow(
				`SELECT value FROM custom_fields_values WHERE id = $1`,
				valueID,
			).Scan(&valueText)
			if err == nil {
				matchedValueID = &valueID
				matchedValueText = valueText
			} else {
				// UUID not found, treat as plain text
				matchedValueText = storedValueStr
			}
		} else {
			// It's a text value, try to find matching value_id
			// First, try exact match
			var valueID uuid.UUID
			err := h.db.QueryRow(
				`SELECT id FROM custom_fields_values WHERE value = $1 LIMIT 1`,
				storedValueStr,
			).Scan(&valueID)
			if err == nil {
				matchedValueID = &valueID
				matchedValueText = storedValueStr
			} else {
				// Value not found, check if it's a combined value.
				// Новый формат: "Main (Linked1, Linked2)".
				// Старый формат: "Main - Linked1 - Linked2".
				mainValue := ""

				// Попробуем сначала скобочный формат
				if idx := strings.Index(storedValueStr, "("); idx > 0 {
					endIdx := strings.LastIndex(storedValueStr, ")")
					if endIdx > idx {
						mainValue = strings.TrimSpace(storedValueStr[:idx])
					}
				}

				// Если скобочный формат не сработал, пробуем старый через " - "
				if mainValue == "" && strings.Contains(storedValueStr, " - ") {
					parts := strings.SplitN(storedValueStr, " - ", 2)
					mainValue = strings.TrimSpace(parts[0])
				}

				if mainValue != "" {
					// Try to find the main value in custom_fields_values
					err := h.db.QueryRow(
						`SELECT id FROM custom_fields_values WHERE value = $1 LIMIT 1`,
						mainValue,
					).Scan(&valueID)
					if err == nil {
						matchedValueID = &valueID
						matchedValueText = mainValue
					} else {
						// Main value not found, use the extracted main value
						matchedValueText = mainValue
					}
				} else {
					// Value not found and not combined, use as-is
					matchedValueText = storedValueStr
				}
			}
		}

		// Build linked custom fields structure from custom_fields_values
		linkedFields := []LinkedCustomField{}
		if matchedValueID != nil {
			// Load linked fields from custom_fields_values
			var linkedCustomFieldIDsJSON []byte
			var linkedCustomFieldValueIDsJSON []byte
			err := h.db.QueryRow(
				`SELECT linked_custom_fields_ids, linked_custom_fields_values_ids
				FROM custom_fields_values WHERE id = $1`,
				*matchedValueID,
			).Scan(&linkedCustomFieldIDsJSON, &linkedCustomFieldValueIDsJSON)

			if err == nil && linkedCustomFieldIDsJSON != nil && linkedCustomFieldValueIDsJSON != nil {
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
										// Include all linked values from the definition (like in custom-fields endpoint)
										// Show all possible linked values for the selected value, regardless of what's set in position
										linkedFieldValues = append(linkedFieldValues, LinkedCustomFieldValue{
											LinkedCustomFieldValueID: valueID,
											LinkedCustomFieldValue:   valueText,
										})
									}
								}
							}

							if len(linkedFieldValues) > 0 {
								linkedFields = append(linkedFields, LinkedCustomField{
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
		}

		valueItem := PositionCustomFieldValue{
			CustomFieldID:    fieldDef.ID.String(),
			CustomFieldKey:   fieldDef.Key,
			CustomFieldLabel: fieldDef.Label,
			CustomFieldValue: matchedValueText,
		}
		if len(linkedFields) > 0 {
			valueItem.LinkedCustomFields = linkedFields
		}
		customFieldsArray = append(customFieldsArray, valueItem)
	}

	return customFieldsArray, nil
}

func (h *Handler) UpdatePosition(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Parse request body - can accept either nested structure or flat structure
	var requestBody map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Extract basic fields
	var name string
	var surname *string
	var employeeName *string
	var patronymic *string
	var employeeExternalID *string
	var employeeProfileURL *string

	if n, ok := requestBody["name"].(string); ok {
		name = n
	}
	// Handle both new format (surname, employee_name, patronymic) and old format (employee_full_name)
	if s, ok := requestBody["surname"].(string); ok {
		if s != "" {
			surname = &s
		}
	} else if requestBody["surname"] == nil {
		surname = nil
	}
	if en, ok := requestBody["employee_name"].(string); ok {
		if en != "" {
			employeeName = &en
		}
	} else if requestBody["employee_name"] == nil {
		employeeName = nil
	}
	if p, ok := requestBody["patronymic"].(string); ok {
		if p != "" {
			patronymic = &p
		}
	} else if requestBody["patronymic"] == nil {
		patronymic = nil
	}
	
	// Backward compatibility: if employee_full_name is provided, parse it
	if efn, ok := requestBody["employee_full_name"].(string); ok && efn != "" {
		parts := strings.Fields(efn)
		if len(parts) > 0 {
			surname = &parts[0]
		}
		if len(parts) > 1 {
			employeeName = &parts[1]
		}
		if len(parts) > 2 {
			pat := strings.Join(parts[2:], " ")
			patronymic = &pat
		}
	}
	
	if eid, ok := requestBody["employee_id"].(string); ok {
		employeeExternalID = &eid
	} else if requestBody["employee_id"] == nil {
		employeeExternalID = nil
	}
	if epu, ok := requestBody["employee_profile_url"].(string); ok {
		employeeProfileURL = &epu
	} else if requestBody["employee_profile_url"] == nil {
		employeeProfileURL = nil
	}

	// Process custom_fields
	// New format: custom_fields is an array with structure:
	// [
	//   {
	//     "custom_field_id": "uuid поля из таблицы custom_fields",
	//     "custom_field_value_id": "uuid значения из таблицы custom_fields_values",
	//     "linked_custom_fields": [
	//       {
	//         "linked_custom_field_values": [
	//           {
	//             "linked_custom_field_value_id": "uuid значения из таблицы custom_fields_values"
	//           }
	//         ]
	//       }
	//     ]
	//   }
	// ]
	// Note:
	//   - В positions.custom_fields_ids храним ИМЕННО ID кастомных полей (custom_field_id)
	//     для верхнеуровневых полей должности.
	//   - В positions.custom_fields_values_ids храним ID значений (custom_field_value_id)
	//     как для основного поля, так и для всех привязанных (linked_custom_field_value_id).
	// Use maps to track unique IDs and avoid duplicates
	customFieldsIDsMap := make(map[uuid.UUID]bool)
	customFieldsValuesIDsMap := make(map[uuid.UUID]bool)
	
	if customFieldsRaw, ok := requestBody["custom_fields"]; ok {
		if customFieldsArray, ok := customFieldsRaw.([]interface{}); ok {
			log.Printf("[UpdatePosition] Processing custom_fields array with %d items", len(customFieldsArray))
			// Process each custom field
			for i, cfItem := range customFieldsArray {
				if cfMap, ok := cfItem.(map[string]interface{}); ok {
					log.Printf("[UpdatePosition] Processing custom field item %d: %+v", i, cfMap)

					// 1) Сохраняем ID самого кастомного поля (custom_field_id) в custom_fields_ids
					if customFieldIDRaw, ok := cfMap["custom_field_id"]; ok {
						if customFieldIDStr, ok := customFieldIDRaw.(string); ok && customFieldIDStr != "" {
							if fieldID, err := uuid.Parse(customFieldIDStr); err == nil {
								customFieldsIDsMap[fieldID] = true
								log.Printf("[UpdatePosition] Added custom_field_id to customFieldsIDs: %s", fieldID.String())
							} else {
								log.Printf("[UpdatePosition] Error parsing custom_field_id UUID: %v", err)
							}
						} else {
							log.Printf("[UpdatePosition] custom_field_id is not a valid string or is empty: %v", customFieldIDRaw)
						}
					} else {
						log.Printf("[UpdatePosition] custom_field_id not found in custom field item %d", i)
					}

					// 2) Сохраняем ID выбранного значения основного поля (custom_field_value_id)
					//    в custom_fields_values_ids
					if customFieldValueIDRaw, ok := cfMap["custom_field_value_id"]; ok {
						log.Printf("[UpdatePosition] Found custom_field_value_id: %v (type: %T)", customFieldValueIDRaw, customFieldValueIDRaw)
						if customFieldValueIDStr, ok := customFieldValueIDRaw.(string); ok && customFieldValueIDStr != "" {
							log.Printf("[UpdatePosition] Parsing custom_field_value_id as UUID: %s", customFieldValueIDStr)
							// Parse custom_field_value_id as UUID and store it in custom_fields_values_ids
							if valueID, err := uuid.Parse(customFieldValueIDStr); err == nil {
								log.Printf("[UpdatePosition] Successfully parsed UUID: %s, adding to customFieldsValuesIDs", valueID.String())
								customFieldsValuesIDsMap[valueID] = true
							} else {
								log.Printf("[UpdatePosition] Error parsing UUID: %v", err)
							}
						} else {
							log.Printf("[UpdatePosition] custom_field_value_id is not a valid string or is empty: %v", customFieldValueIDRaw)
						}
					} else {
						log.Printf("[UpdatePosition] custom_field_value_id not found in custom field item %d", i)
					}

					// 3) Обрабатываем привязанные кастомные поля и их значения
					if linkedFields, ok := cfMap["linked_custom_fields"].([]interface{}); ok {
						for _, lfItem := range linkedFields {
							if lfMap, ok := lfItem.(map[string]interface{}); ok {
								// 3.1) Сохраняем ID самого привязанного кастомного поля
								if linkedFieldIDRaw, ok := lfMap["linked_custom_field_id"]; ok {
									if linkedFieldIDStr, ok := linkedFieldIDRaw.(string); ok && linkedFieldIDStr != "" {
										if fieldID, err := uuid.Parse(linkedFieldIDStr); err == nil {
											// ID привязанного кастомного поля храним в custom_fields_ids
											customFieldsIDsMap[fieldID] = true
										}
									}
								}

								// 3.2) Сохраняем ID выбранных значений привязанных кастомных полей
								if linkedValues, ok := lfMap["linked_custom_field_values"].([]interface{}); ok {
									for _, lvItem := range linkedValues {
										if lvMap, ok := lvItem.(map[string]interface{}); ok {
											linkedValueID, _ := lvMap["linked_custom_field_value_id"].(string)
											if linkedValueID != "" {
												if valueID, err := uuid.Parse(linkedValueID); err == nil {
													// Store linked value IDs in custom_fields_values_ids
													customFieldsValuesIDsMap[valueID] = true
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// Convert maps to slices
	customFieldsIDs := make([]uuid.UUID, 0, len(customFieldsIDsMap))
	for id := range customFieldsIDsMap {
		customFieldsIDs = append(customFieldsIDs, id)
	}
	customFieldsValuesIDs := make([]uuid.UUID, 0, len(customFieldsValuesIDsMap))
	for id := range customFieldsValuesIDsMap {
		customFieldsValuesIDs = append(customFieldsValuesIDs, id)
	}

	log.Printf("[UpdatePosition] Final customFieldsIDs count: %d, IDs: %v", len(customFieldsIDs), customFieldsIDs)
	log.Printf("[UpdatePosition] Final customFieldsValuesIDs count: %d, IDs: %v", len(customFieldsValuesIDs), customFieldsValuesIDs)

	customFieldsIDsArray := UUIDArray(customFieldsIDs)
	customFieldsIDsJSON, _ := json.Marshal(customFieldsIDsArray)
	log.Printf("[UpdatePosition] customFieldsIDsJSON: %s", string(customFieldsIDsJSON))

	customFieldsValuesIDsArray := UUIDArray(customFieldsValuesIDs)
	customFieldsValuesIDsJSON, _ := json.Marshal(customFieldsValuesIDsArray)
	log.Printf("[UpdatePosition] customFieldsValuesIDsJSON: %s", string(customFieldsValuesIDsJSON))

	result, err := h.db.Exec(
		`UPDATE positions SET position_name = $1, custom_fields_id = $2, custom_fields_values_id = $3, 
		employee_id = $4, employee_surname = $5, employee_name = $6, employee_patronymic = $7, employee_profile_url = $8, 
		updated_at = NOW() WHERE id = $9`,
		name, customFieldsIDsJSON, customFieldsValuesIDsJSON,
		employeeExternalID, surname, employeeName, patronymic, employeeProfileURL, id,
	)

	if err != nil {
		log.Printf("[UpdatePosition] Error updating position: %v", err)
	} else {
		rowsAffected, _ := result.RowsAffected()
		log.Printf("[UpdatePosition] Successfully updated position %d, rows affected: %d", id, rowsAffected)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Get updated position to return with nested custom_fields structure
	var p Position
	var customFieldsIDsFromDB []byte
	var customFieldsValuesIDsFromDB []byte
	err = h.db.QueryRow(
		`SELECT id, position_name, custom_fields_id, custom_fields_values_id, employee_id, employee_surname, employee_name, employee_patronymic, 
		employee_profile_url, created_at, updated_at
		FROM positions WHERE id = $1`,
		id,
	).Scan(&p.ID, &p.Name, &customFieldsIDsFromDB, &customFieldsValuesIDsFromDB,
		&p.EmployeeExternalID, &p.Surname, &p.EmployeeName, &p.Patronymic, &p.EmployeeProfileURL,
		&p.CreatedAt, &p.UpdatedAt)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if customFieldsIDsFromDB != nil {
		json.Unmarshal(customFieldsIDsFromDB, &p.CustomFieldsIDs)
	}
	if customFieldsValuesIDsFromDB != nil {
		json.Unmarshal(customFieldsValuesIDsFromDB, &p.CustomFieldsValuesIDs)
	}

	// Build nested custom_fields array
	customFieldsArray, err := h.buildCustomFieldsArrayFromIDs(p.CustomFieldsIDs, p.CustomFieldsValuesIDs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Compute employee_full_name for backward compatibility
	p.EmployeeFullName = combineEmployeeFullName(p.Surname, p.EmployeeName, p.Patronymic)

	response := map[string]interface{}{
		"id":                   p.ID,
		"name":                 p.Name,
		"custom_fields":        customFieldsArray,
		"employee_id": p.EmployeeExternalID,
		"surname":              p.Surname,
		"employee_name":        p.EmployeeName,
		"patronymic":           p.Patronymic,
		"employee_full_name":   p.EmployeeFullName,
		"employee_profile_url": p.EmployeeProfileURL,
		"created_at":           p.CreatedAt,
		"updated_at":           p.UpdatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) DeletePosition(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec("DELETE FROM positions WHERE id = $1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
