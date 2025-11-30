package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

type Handler struct {
	db *sql.DB
}

func NewHandler(db *sql.DB) *Handler {
	return &Handler{db: db}
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

	var query string
	var args []interface{}

	if search != "" {
		// Parse search query for AND/OR operators
		// Split by AND/OR (case insensitive)
		searchLower := strings.ToLower(search)
		hasAnd := strings.Contains(searchLower, " and ")
		hasOr := strings.Contains(searchLower, " or ")

		if hasAnd || hasOr {
			// Advanced search with AND/OR
			var conditions []string
			var queryArgs []interface{}
			argIndex := 1

			// Split by AND first (higher priority)
			var parts []string
			if hasAnd {
				parts = strings.Split(search, " AND ")
				for i, part := range parts {
					parts[i] = strings.TrimSpace(part)
				}
			} else {
				parts = []string{search}
			}

			// Process each part (which may contain OR)
			for _, part := range parts {
				if strings.Contains(strings.ToLower(part), " or ") {
					orParts := strings.Split(part, " OR ")
					var orConditions []string
					for _, orPart := range orParts {
						orPart = strings.TrimSpace(orPart)
						if orPart != "" {
							orConditions = append(orConditions,
								`(name ILIKE $`+strconv.Itoa(argIndex)+` OR 
								COALESCE(description, '') ILIKE $`+strconv.Itoa(argIndex)+` OR 
								COALESCE(employee_full_name, '') ILIKE $`+strconv.Itoa(argIndex)+` OR
								custom_fields::text ILIKE $`+strconv.Itoa(argIndex)+`)`)
							queryArgs = append(queryArgs, "%"+orPart+"%")
							argIndex++
						}
					}
					if len(orConditions) > 0 {
						conditions = append(conditions, "("+strings.Join(orConditions, " OR ")+")")
					}
				} else {
					if part != "" {
						conditions = append(conditions,
							`(name ILIKE $`+strconv.Itoa(argIndex)+` OR 
							COALESCE(description, '') ILIKE $`+strconv.Itoa(argIndex)+` OR 
							COALESCE(employee_full_name, '') ILIKE $`+strconv.Itoa(argIndex)+` OR
							custom_fields::text ILIKE $`+strconv.Itoa(argIndex)+`)`)
						queryArgs = append(queryArgs, "%"+part+"%")
						argIndex++
					}
				}
			}

			if len(conditions) > 0 {
				whereClause := strings.Join(conditions, " AND ")
				query = `SELECT id, name, description, custom_fields, employee_full_name, 
					employee_external_id, employee_profile_url, created_at, updated_at
					FROM positions WHERE ` + whereClause + ` ORDER BY id LIMIT $` + strconv.Itoa(argIndex) + ` OFFSET $` + strconv.Itoa(argIndex+1)
				queryArgs = append(queryArgs, limit, offset)
				args = queryArgs
			} else {
				query = `SELECT id, name, description, custom_fields, employee_full_name, 
					employee_external_id, employee_profile_url, created_at, updated_at
					FROM positions ORDER BY id LIMIT $1 OFFSET $2`
				args = []interface{}{limit, offset}
			}
		} else {
			// Simple search
			query = `SELECT id, name, description, custom_fields, employee_full_name, 
				employee_external_id, employee_profile_url, created_at, updated_at
				FROM positions WHERE (name ILIKE $1 OR 
				COALESCE(description, '') ILIKE $1 OR 
				COALESCE(employee_full_name, '') ILIKE $1 OR
				custom_fields::text ILIKE $1) ORDER BY id LIMIT $2 OFFSET $3`
			args = []interface{}{"%" + search + "%", limit, offset}
		}
	} else {
		query = `SELECT id, name, description, custom_fields, employee_full_name, 
			employee_external_id, employee_profile_url, created_at, updated_at
			FROM positions ORDER BY id LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	rows, err := h.db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var positions []Position
	for rows.Next() {
		var p Position
		var customFieldsJSON []byte
		err := rows.Scan(&p.ID, &p.Name, &p.Description, &customFieldsJSON,
			&p.EmployeeFullName, &p.EmployeeExternalID, &p.EmployeeProfileURL,
			&p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if customFieldsJSON != nil {
			json.Unmarshal(customFieldsJSON, &p.CustomFields)
		}
		positions = append(positions, p)
	}

	// Get total count
	var total int
	countQuery := "SELECT COUNT(*) FROM positions"
	if search != "" {
		// Use same logic for count query
		searchLower := strings.ToLower(search)
		hasAnd := strings.Contains(searchLower, " and ")
		hasOr := strings.Contains(searchLower, " or ")

		if hasAnd || hasOr {
			var conditions []string
			var countArgs []interface{}
			argIndex := 1

			var parts []string
			if hasAnd {
				parts = strings.Split(search, " AND ")
				for i, part := range parts {
					parts[i] = strings.TrimSpace(part)
				}
			} else {
				parts = []string{search}
			}

			for _, part := range parts {
				if strings.Contains(strings.ToLower(part), " or ") {
					orParts := strings.Split(part, " OR ")
					var orConditions []string
					for _, orPart := range orParts {
						orPart = strings.TrimSpace(orPart)
						if orPart != "" {
							orConditions = append(orConditions,
								`(name ILIKE $`+strconv.Itoa(argIndex)+` OR 
								COALESCE(description, '') ILIKE $`+strconv.Itoa(argIndex)+` OR 
								COALESCE(employee_full_name, '') ILIKE $`+strconv.Itoa(argIndex)+` OR
								custom_fields::text ILIKE $`+strconv.Itoa(argIndex)+`)`)
							countArgs = append(countArgs, "%"+orPart+"%")
							argIndex++
						}
					}
					if len(orConditions) > 0 {
						conditions = append(conditions, "("+strings.Join(orConditions, " OR ")+")")
					}
				} else {
					if part != "" {
						conditions = append(conditions,
							`(name ILIKE $`+strconv.Itoa(argIndex)+` OR 
							COALESCE(description, '') ILIKE $`+strconv.Itoa(argIndex)+` OR 
							COALESCE(employee_full_name, '') ILIKE $`+strconv.Itoa(argIndex)+` OR
							custom_fields::text ILIKE $`+strconv.Itoa(argIndex)+`)`)
						countArgs = append(countArgs, "%"+part+"%")
						argIndex++
					}
				}
			}

			if len(conditions) > 0 {
				countQuery = "SELECT COUNT(*) FROM positions WHERE " + strings.Join(conditions, " AND ")
				h.db.QueryRow(countQuery, countArgs...).Scan(&total)
			} else {
				h.db.QueryRow(countQuery).Scan(&total)
			}
		} else {
			countQuery = `SELECT COUNT(*) FROM positions WHERE (name ILIKE $1 OR 
				COALESCE(description, '') ILIKE $1 OR 
				COALESCE(employee_full_name, '') ILIKE $1 OR
				custom_fields::text ILIKE $1)`
			h.db.QueryRow(countQuery, "%"+search+"%").Scan(&total)
		}
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
	var customFieldsJSON []byte
	err = h.db.QueryRow(
		`SELECT id, name, description, custom_fields, employee_full_name, 
		employee_external_id, employee_profile_url, created_at, updated_at
		FROM positions WHERE id = $1`,
		id,
	).Scan(&p.ID, &p.Name, &p.Description, &customFieldsJSON,
		&p.EmployeeFullName, &p.EmployeeExternalID, &p.EmployeeProfileURL,
		&p.CreatedAt, &p.UpdatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, "Position not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if customFieldsJSON != nil {
		json.Unmarshal(customFieldsJSON, &p.CustomFields)
	}

	// Build nested custom_fields array
	customFieldsArray, err := h.buildCustomFieldsArray(p.CustomFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":                   p.ID,
		"name":                 p.Name,
		"description":          p.Description,
		"custom_fields":        customFieldsArray,
		"employee_full_name":   p.EmployeeFullName,
		"employee_external_id": p.EmployeeExternalID,
		"employee_profile_url": p.EmployeeProfileURL,
		"created_at":           p.CreatedAt,
		"updated_at":           p.UpdatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) CreatePosition(w http.ResponseWriter, r *http.Request) {
	var p Position
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	customFieldsJSON, _ := json.Marshal(p.CustomFields)

	err := h.db.QueryRow(
		`INSERT INTO positions (name, description, custom_fields, employee_full_name, 
		employee_external_id, employee_profile_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING id`,
		p.Name, p.Description, customFieldsJSON,
		p.EmployeeFullName, p.EmployeeExternalID, p.EmployeeProfileURL,
	).Scan(&p.ID)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

// buildCustomFieldsArray builds the nested custom_fields array structure from flat JSONB
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
				// Value not found, check if it's a combined value (with " - ")
				// If it contains " - ", try to extract the main value (before first " - ")
				if strings.Contains(storedValueStr, " - ") {
					parts := strings.SplitN(storedValueStr, " - ", 2)
					mainValue := strings.TrimSpace(parts[0])
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
						matchedValueText = storedValueStr
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
	var description *string
	var employeeFullName *string
	var employeeExternalID *string
	var employeeProfileURL *string

	if n, ok := requestBody["name"].(string); ok {
		name = n
	}
	if d, ok := requestBody["description"].(string); ok {
		description = &d
	} else if requestBody["description"] == nil {
		description = nil
	}
	if efn, ok := requestBody["employee_full_name"].(string); ok {
		employeeFullName = &efn
	} else if requestBody["employee_full_name"] == nil {
		employeeFullName = nil
	}
	if eid, ok := requestBody["employee_external_id"].(string); ok {
		employeeExternalID = &eid
	} else if requestBody["employee_external_id"] == nil {
		employeeExternalID = nil
	}
	if epu, ok := requestBody["employee_profile_url"].(string); ok {
		employeeProfileURL = &epu
	} else if requestBody["employee_profile_url"] == nil {
		employeeProfileURL = nil
	}

	// Process custom_fields - can be either nested array or flat object
	customFieldsJSON := make(JSONB)
	if customFieldsRaw, ok := requestBody["custom_fields"]; ok {
		if customFieldsArray, ok := customFieldsRaw.([]interface{}); ok {
			// Nested structure: array of PositionCustomFieldValue
			for _, cfItem := range customFieldsArray {
				if cfMap, ok := cfItem.(map[string]interface{}); ok {
					customFieldKey, _ := cfMap["custom_field_key"].(string)

					if customFieldKey != "" {
						// Extract custom_field_value - should be a string
						if customFieldValueRaw, ok := cfMap["custom_field_value"]; ok {
							if customFieldValueStr, ok := customFieldValueRaw.(string); ok && customFieldValueStr != "" {
								// Store the value (can be either UUID string or text)
								customFieldsJSON[customFieldKey] = customFieldValueStr
							}
						}

						// Process linked custom fields and set their values
						if linkedFields, ok := cfMap["linked_custom_fields"].([]interface{}); ok {
							for _, lfItem := range linkedFields {
								if lfMap, ok := lfItem.(map[string]interface{}); ok {
									linkedFieldKey, _ := lfMap["linked_custom_field_key"].(string)

									// Process linked custom field values
									if linkedValues, ok := lfMap["linked_custom_field_values"].([]interface{}); ok {
										for _, lvItem := range linkedValues {
											if lvMap, ok := lvItem.(map[string]interface{}); ok {
												linkedValueID, _ := lvMap["linked_custom_field_value_id"].(string)
												linkedValue, _ := lvMap["linked_custom_field_value"].(string)

												// Set the linked field value (prefer value_id if available, otherwise use value text)
												if linkedFieldKey != "" {
													if linkedValueID != "" {
														// Try to parse as UUID, if valid use it, otherwise use the string
														if _, err := uuid.Parse(linkedValueID); err == nil {
															customFieldsJSON[linkedFieldKey] = linkedValueID
														} else {
															customFieldsJSON[linkedFieldKey] = linkedValue
														}
													} else if linkedValue != "" {
														customFieldsJSON[linkedFieldKey] = linkedValue
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
		} else if customFieldsMap, ok := customFieldsRaw.(map[string]interface{}); ok {
			// Flat structure: object with field_key -> value mapping
			for k, v := range customFieldsMap {
				if strVal, ok := v.(string); ok {
					customFieldsJSON[k] = strVal
				}
			}
		}
	}

	customFieldsJSONBytes, _ := json.Marshal(customFieldsJSON)

	_, err = h.db.Exec(
		`UPDATE positions SET name = $1, description = $2, custom_fields = $3, 
		employee_full_name = $4, employee_external_id = $5, employee_profile_url = $6, 
		updated_at = NOW() WHERE id = $7`,
		name, description, customFieldsJSONBytes,
		employeeFullName, employeeExternalID, employeeProfileURL, id,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Get updated position to return with nested custom_fields structure
	var p Position
	var customFieldsJSONFromDB []byte
	err = h.db.QueryRow(
		`SELECT id, name, description, custom_fields, employee_full_name, 
		employee_external_id, employee_profile_url, created_at, updated_at
		FROM positions WHERE id = $1`,
		id,
	).Scan(&p.ID, &p.Name, &p.Description, &customFieldsJSONFromDB,
		&p.EmployeeFullName, &p.EmployeeExternalID, &p.EmployeeProfileURL,
		&p.CreatedAt, &p.UpdatedAt)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if customFieldsJSONFromDB != nil {
		json.Unmarshal(customFieldsJSONFromDB, &p.CustomFields)
	}

	// Build nested custom_fields array
	customFieldsArray, err := h.buildCustomFieldsArray(p.CustomFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":                   p.ID,
		"name":                 p.Name,
		"description":          p.Description,
		"custom_fields":        customFieldsArray,
		"employee_full_name":   p.EmployeeFullName,
		"employee_external_id": p.EmployeeExternalID,
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

// Custom Field handlers

func (h *Handler) GetCustomFields(w http.ResponseWriter, r *http.Request) {
	// Pre-load all custom field definitions for linked fields lookup (once, before the loop)
	allFieldsRows, err := h.db.Query(`SELECT id, key, label FROM custom_fields`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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

	// Pre-load all custom field values for linked values lookup (once, before the loop)
	allValuesRows, err := h.db.Query(`SELECT id, value FROM custom_fields_values`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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

	// Pre-load field-to-values mapping (which values belong to which fields) (once, before the loop)
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

	rows, err := h.db.Query(
		`SELECT id, key, label, allowed_values_ids, created_at, updated_at
		FROM custom_fields ORDER BY label`,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var fields []CustomFieldDefinition
	for rows.Next() {
		var f CustomFieldDefinition
		var allowedValueIDsJSON []byte
		err := rows.Scan(&f.ID, &f.Key, &f.Label, &allowedValueIDsJSON,
			&f.CreatedAt, &f.UpdatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Parse allowed_values_ids
		if allowedValueIDsJSON != nil {
			var ids []string
			if err := json.Unmarshal(allowedValueIDsJSON, &ids); err == nil {
				uuidArray := make(UUIDArray, len(ids))
				for i, idStr := range ids {
					if id, err := uuid.Parse(idStr); err == nil {
						uuidArray[i] = id
					}
				}
				f.AllowedValueIDs = &uuidArray
			}
		}

		// Load custom_fields_values and build allowed_values with linked_custom_fields
		if f.AllowedValueIDs != nil && len(*f.AllowedValueIDs) > 0 {
			var allowedValues AllowedValuesArray

			for _, valueID := range *f.AllowedValueIDs {
				var cv CustomFieldValue
				var linkedCustomFieldIDsJSON []byte
				var linkedCustomFieldValueIDsJSON []byte
				err := h.db.QueryRow(
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
			f.AllowedValues = &allowedValues
		}

		fields = append(fields, f)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fields)
}

func (h *Handler) CreateCustomField(w http.ResponseWriter, r *http.Request) {
	var f CustomFieldDefinition
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	f.ID = uuid.New()

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Generate value_id for each allowed value if not present
	var allowedValueIDs []uuid.UUID

	if f.AllowedValues != nil {
		for i := range *f.AllowedValues {
			if (*f.AllowedValues)[i].ValueID == uuid.Nil {
				(*f.AllowedValues)[i].ValueID = uuid.New()
			}
			allowedValueIDs = append(allowedValueIDs, (*f.AllowedValues)[i].ValueID)

			// Generate value_id for linked custom field values if not present
			var linkedCustomFieldIDs []uuid.UUID
			var linkedCustomFieldValueIDs []uuid.UUID
			for j := range (*f.AllowedValues)[i].LinkedCustomFields {
				linkedCustomFieldIDs = append(linkedCustomFieldIDs, (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldID)
				for k := range (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues {
					if (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID == uuid.Nil {
						(*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID = uuid.New()
					}
					linkedCustomFieldValueIDs = append(linkedCustomFieldValueIDs, (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID)
				}
			}

			// Save custom_field_value with linked IDs
			linkedCustomFieldIDsArray := UUIDArray(linkedCustomFieldIDs)
			linkedCustomFieldValueIDsArray := UUIDArray(linkedCustomFieldValueIDs)
			linkedCustomFieldIDsJSON, _ := linkedCustomFieldIDsArray.Value()
			linkedCustomFieldValueIDsJSON, _ := linkedCustomFieldValueIDsArray.Value()

			_, err = tx.Exec(
				`INSERT INTO custom_fields_values (id, value, linked_custom_fields_ids, linked_custom_fields_values_ids, created_at, updated_at)
				VALUES ($1, $2, $3, $4, NOW(), NOW())
				ON CONFLICT (id) DO UPDATE SET
					value = EXCLUDED.value,
					linked_custom_fields_ids = EXCLUDED.linked_custom_fields_ids,
					linked_custom_fields_values_ids = EXCLUDED.linked_custom_fields_values_ids,
					updated_at = NOW()`,
				(*f.AllowedValues)[i].ValueID,
				(*f.AllowedValues)[i].Value,
				linkedCustomFieldIDsJSON,
				linkedCustomFieldValueIDsJSON,
			)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	// Prepare JSONB array for allowed_values_ids
	allowedValueIDsArray := UUIDArray(allowedValueIDs)
	allowedValueIDsJSON, _ := allowedValueIDsArray.Value()

	_, err = tx.Exec(
		`INSERT INTO custom_fields (id, key, label, allowed_values_ids, created_at, updated_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())`,
		f.ID, f.Key, f.Label, allowedValueIDsJSON,
	)

	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			http.Error(w, "Field with this key already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(f)
}

func (h *Handler) UpdateCustomField(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var f CustomFieldDefinition
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Get old allowed_values_ids to delete unused values
	var oldAllowedValueIDsJSON []byte
	err = tx.QueryRow(
		`SELECT allowed_values_ids FROM custom_fields WHERE id = $1`,
		id,
	).Scan(&oldAllowedValueIDsJSON)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Generate value_id for each allowed value if not present
	var allowedValueIDs []uuid.UUID

	if f.AllowedValues != nil {
		for i := range *f.AllowedValues {
			if (*f.AllowedValues)[i].ValueID == uuid.Nil {
				(*f.AllowedValues)[i].ValueID = uuid.New()
			}
			allowedValueIDs = append(allowedValueIDs, (*f.AllowedValues)[i].ValueID)

			// Generate value_id for linked custom field values if not present
			var linkedCustomFieldIDs []uuid.UUID
			var linkedCustomFieldValueIDs []uuid.UUID
			for j := range (*f.AllowedValues)[i].LinkedCustomFields {
				linkedCustomFieldIDs = append(linkedCustomFieldIDs, (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldID)
				for k := range (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues {
					if (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID == uuid.Nil {
						(*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID = uuid.New()
					}
					linkedCustomFieldValueIDs = append(linkedCustomFieldValueIDs, (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID)
				}
			}

			// Save or update custom_field_value with linked IDs
			linkedCustomFieldIDsArray := UUIDArray(linkedCustomFieldIDs)
			linkedCustomFieldValueIDsArray := UUIDArray(linkedCustomFieldValueIDs)
			linkedCustomFieldIDsJSON, _ := linkedCustomFieldIDsArray.Value()
			linkedCustomFieldValueIDsJSON, _ := linkedCustomFieldValueIDsArray.Value()

			_, err = tx.Exec(
				`INSERT INTO custom_fields_values (id, value, linked_custom_fields_ids, linked_custom_fields_values_ids, created_at, updated_at)
				VALUES ($1, $2, $3, $4, NOW(), NOW())
				ON CONFLICT (id) DO UPDATE SET
					value = EXCLUDED.value,
					linked_custom_fields_ids = EXCLUDED.linked_custom_fields_ids,
					linked_custom_fields_values_ids = EXCLUDED.linked_custom_fields_values_ids,
					updated_at = NOW()`,
				(*f.AllowedValues)[i].ValueID,
				(*f.AllowedValues)[i].Value,
				linkedCustomFieldIDsJSON,
				linkedCustomFieldValueIDsJSON,
			)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	// Delete unused custom_fields_values (values that are no longer in allowed_values_ids)
	if oldAllowedValueIDsJSON != nil {
		var oldIDs []string
		if err := json.Unmarshal(oldAllowedValueIDsJSON, &oldIDs); err == nil {
			oldIDsMap := make(map[string]bool)
			for _, idStr := range oldIDs {
				oldIDsMap[idStr] = true
			}
			for _, newID := range allowedValueIDs {
				delete(oldIDsMap, newID.String())
			}
			// Delete values that are no longer used
			for oldIDStr := range oldIDsMap {
				if oldID, err := uuid.Parse(oldIDStr); err == nil {
					// Check if this value is used by other custom_fields
					var count int
					err = tx.QueryRow(
						`SELECT COUNT(*) FROM custom_fields 
						WHERE id != $1 AND allowed_values_ids @> $2::text::jsonb`,
						id, `["`+oldIDStr+`"]`,
					).Scan(&count)
					if err == nil && count == 0 {
						// Not used by other definitions, safe to delete
						tx.Exec(`DELETE FROM custom_fields_values WHERE id = $1`, oldID)
					}
				}
			}
		}
	}

	// Prepare JSONB array for allowed_values_ids
	allowedValueIDsArray := UUIDArray(allowedValueIDs)
	allowedValueIDsJSON, _ := allowedValueIDsArray.Value()

	_, err = tx.Exec(
		`UPDATE custom_fields SET label = $1, allowed_values_ids = $2, updated_at = NOW() WHERE id = $3`,
		f.Label, allowedValueIDsJSON, id,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	f.ID = id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(f)
}

func (h *Handler) DeleteCustomField(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Get field key before deletion
	var fieldKey string
	err = h.db.QueryRow(
		"SELECT key FROM custom_fields WHERE id = $1",
		id,
	).Scan(&fieldKey)

	if err == sql.ErrNoRows {
		http.Error(w, "Field not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Start transaction to ensure atomicity
	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Remove the custom field key from all positions' custom_fields JSONB
	_, err = tx.Exec(
		`UPDATE positions 
		SET custom_fields = custom_fields - $1, updated_at = NOW()
		WHERE custom_fields ? $1`,
		fieldKey,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Remove levels from tree_definitions that use this custom field
	// We need to filter out levels where custom_field_key matches the deleted field
	rows, err := tx.Query(
		`SELECT id, levels FROM tree_definitions 
		WHERE levels::text LIKE '%' || $1 || '%'`,
		fieldKey,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var treeID uuid.UUID
		var levelsJSON []byte
		if err := rows.Scan(&treeID, &levelsJSON); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Parse levels JSON
		var levels []TreeLevel
		if err := json.Unmarshal(levelsJSON, &levels); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Filter out levels that use the deleted field
		var filteredLevels []TreeLevel
		for _, level := range levels {
			if level.CustomFieldKey != fieldKey {
				filteredLevels = append(filteredLevels, level)
			}
		}

		// Update tree with filtered levels
		filteredLevelsJSON, _ := json.Marshal(filteredLevels)
		_, err = tx.Exec(
			`UPDATE tree_definitions 
			SET levels = $1, updated_at = NOW() 
			WHERE id = $2`,
			filteredLevelsJSON, treeID,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err = rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Delete the custom field definition
	_, err = tx.Exec("DELETE FROM custom_fields WHERE id = $1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Tree handlers

func (h *Handler) GetTrees(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(
		`SELECT id, name, description, is_default, levels, created_at, updated_at
		FROM tree_definitions ORDER BY is_default DESC, name`,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var trees []TreeDefinition
	for rows.Next() {
		var t TreeDefinition
		var levelsJSON []byte
		err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.IsDefault, &levelsJSON,
			&t.CreatedAt, &t.UpdatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if levelsJSON != nil {
			json.Unmarshal(levelsJSON, &t.Levels)
		}
		trees = append(trees, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trees)
}

func (h *Handler) GetTree(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var t TreeDefinition
	var levelsJSON []byte
	err = h.db.QueryRow(
		`SELECT id, name, description, is_default, levels, created_at, updated_at
		FROM tree_definitions WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.Name, &t.Description, &t.IsDefault, &levelsJSON,
		&t.CreatedAt, &t.UpdatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, "Tree not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if levelsJSON != nil {
		json.Unmarshal(levelsJSON, &t.Levels)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(t)
}

func (h *Handler) CreateTree(w http.ResponseWriter, r *http.Request) {
	var t TreeDefinition
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	t.ID = uuid.New()
	levelsJSON, _ := json.Marshal(t.Levels)

	// If this is set as default, unset other defaults
	if t.IsDefault {
		_, _ = h.db.Exec("UPDATE tree_definitions SET is_default = false")
	}

	_, err := h.db.Exec(
		`INSERT INTO tree_definitions (id, name, description, is_default, levels, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
		t.ID, t.Name, t.Description, t.IsDefault, levelsJSON,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(t)
}

func (h *Handler) UpdateTree(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var t TreeDefinition
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	levelsJSON, _ := json.Marshal(t.Levels)

	// If this is set as default, unset other defaults
	if t.IsDefault {
		_, _ = h.db.Exec("UPDATE tree_definitions SET is_default = false WHERE id != $1", id)
	}

	_, err = h.db.Exec(
		`UPDATE tree_definitions SET name = $1, description = $2, is_default = $3, 
		levels = $4, updated_at = NOW() WHERE id = $5`,
		t.Name, t.Description, t.IsDefault, levelsJSON, id,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	t.ID = id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(t)
}

func (h *Handler) DeleteTree(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Check if it's the default tree
	var isDefault bool
	err = h.db.QueryRow(
		"SELECT is_default FROM tree_definitions WHERE id = $1",
		id,
	).Scan(&isDefault)

	if err == sql.ErrNoRows {
		http.Error(w, "Tree not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if isDefault {
		http.Error(w, "Cannot delete default tree", http.StatusConflict)
		return
	}

	_, err = h.db.Exec("DELETE FROM tree_definitions WHERE id = $1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetTreeStructure(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Get tree definition
	var t TreeDefinition
	var levelsJSON []byte
	err = h.db.QueryRow(
		`SELECT id, name, description, is_default, levels, created_at, updated_at
		FROM tree_definitions WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.Name, &t.Description, &t.IsDefault, &levelsJSON,
		&t.CreatedAt, &t.UpdatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, "Tree not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if levelsJSON != nil {
		json.Unmarshal(levelsJSON, &t.Levels)
	}

	// Build tree structure
	structure := buildTreeStructure(h.db, t)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(structure)
}
