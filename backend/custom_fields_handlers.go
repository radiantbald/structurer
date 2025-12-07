package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)
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
		}
	}

	// Prepare JSONB array for allowed_values_ids
	allowedValueIDsArray := UUIDArray(allowedValueIDs)
	allowedValueIDsJSON, _ := allowedValueIDsArray.Value()

	// First, create the custom field itself (must exist before creating values due to FK constraint)
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

	// Now create the values (field must exist first due to FK constraint)
	if f.AllowedValues != nil {
		for i := range *f.AllowedValues {
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
				`INSERT INTO custom_fields_values (id, value, custom_field_id, linked_custom_fields_ids, linked_custom_fields_values_ids, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
				ON CONFLICT (id) DO UPDATE SET
					value = EXCLUDED.value,
					custom_field_id = EXCLUDED.custom_field_id,
					linked_custom_fields_ids = EXCLUDED.linked_custom_fields_ids,
					linked_custom_fields_values_ids = EXCLUDED.linked_custom_fields_values_ids,
					updated_at = NOW()`,
				(*f.AllowedValues)[i].ValueID,
				(*f.AllowedValues)[i].Value,
				f.ID,
				linkedCustomFieldIDsJSON,
				linkedCustomFieldValueIDsJSON,
			)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
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
				`INSERT INTO custom_fields_values (id, value, custom_field_id, linked_custom_fields_ids, linked_custom_fields_values_ids, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
				ON CONFLICT (id) DO UPDATE SET
					value = EXCLUDED.value,
					custom_field_id = EXCLUDED.custom_field_id,
					linked_custom_fields_ids = EXCLUDED.linked_custom_fields_ids,
					linked_custom_fields_values_ids = EXCLUDED.linked_custom_fields_values_ids,
					updated_at = NOW()`,
				(*f.AllowedValues)[i].ValueID,
				(*f.AllowedValues)[i].Value,
				id,
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
	log.Printf("[DeleteCustomField] Deleting custom field %s", id.String())
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
		log.Printf("[DeleteCustomField] begin tx error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Get allowed_values_ids for this field to remove them (and the field itself)
	// from all positions.
	var allowedValueIDsJSON []byte
	err = tx.QueryRow(
		`SELECT allowed_values_ids FROM custom_fields WHERE id = $1`,
		id,
	).Scan(&allowedValueIDsJSON)

	if err == nil && allowedValueIDsJSON != nil {
		log.Printf("[DeleteCustomField] Loaded allowed_values_ids for field %s", id.String())
		var valueIDs []string
		if err := json.Unmarshal(allowedValueIDsJSON, &valueIDs); err == nil && len(valueIDs) > 0 {
			// Prepare sets for fast lookup:
			// - valueSet: all value IDs belonging to this field
			// - fieldIDStr: ID of the field itself to remove from positions.custom_fields_ids
			valueSet := make(map[string]struct{}, len(valueIDs))
			for _, v := range valueIDs {
				valueSet[v] = struct{}{}
			}
			fieldIDStr := id.String()

			// Iterate over all positions that have custom fields assigned.
			// ВАЖНО: мы сначала собираем все изменения в память, а затем выполняем UPDATE,
			// чтобы не вызывать Exec на том же соединении, пока открыт rows (иначе pq путается
			// в протоколе и выдаёт "unexpected Parse response 'C'").
			rows, err := tx.Query(`
				SELECT id, custom_fields_ids, custom_fields_values_ids 
				FROM positions 
				WHERE custom_fields_ids IS NOT NULL OR custom_fields_values_ids IS NOT NULL`)
			if err != nil {
				log.Printf("[DeleteCustomField] query positions error: %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			// Буфер обновлений, которые нужно выполнить.
			type positionUpdate struct {
				id             int64
				cfIDsJSON      []byte
				cfValuesJSON   []byte
			}
			var updates []positionUpdate

			for rows.Next() {
				var positionID int64
				var cfIDsJSON, cfValuesJSON []byte
				if err := rows.Scan(&positionID, &cfIDsJSON, &cfValuesJSON); err != nil {
					log.Printf("[DeleteCustomField] scan position row error: %v", err)
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				// custom_fields_ids and custom_fields_values_ids are stored
				// as JSON arrays of UUID strings.
				var cfIDs []string
				if cfIDsJSON != nil {
					if err := json.Unmarshal(cfIDsJSON, &cfIDs); err != nil {
						log.Printf("[DeleteCustomField] unmarshal custom_fields_ids error: %v", err)
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
				}

				var cfValueIDs []string
				if cfValuesJSON != nil {
					if err := json.Unmarshal(cfValuesJSON, &cfValueIDs); err != nil {
						log.Printf("[DeleteCustomField] unmarshal custom_fields_values_ids error: %v", err)
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
				}

				changed := false

				// 1) Remove the field ID itself from custom_fields_ids
				if len(cfIDs) > 0 {
					var filteredFieldIDs []string
					for _, idStr := range cfIDs {
						if idStr == fieldIDStr {
							changed = true
							continue
						}
						filteredFieldIDs = append(filteredFieldIDs, idStr)
					}
					cfIDs = filteredFieldIDs
				}

				// 2) Remove all value IDs that belong to this field
				if len(cfValueIDs) > 0 {
					var filteredValueIDs []string
					for _, v := range cfValueIDs {
						if _, toRemove := valueSet[v]; toRemove {
							changed = true
							continue
						}
						filteredValueIDs = append(filteredValueIDs, v)
					}
					cfValueIDs = filteredValueIDs
				}

				if !changed {
					continue
				}

				newCFIDsJSON, err := json.Marshal(cfIDs)
				if err != nil {
					log.Printf("[DeleteCustomField] marshal new custom_fields_ids error: %v", err)
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				newCFValuesJSON, err := json.Marshal(cfValueIDs)
				if err != nil {
					log.Printf("[DeleteCustomField] marshal new custom_fields_values_ids error: %v", err)
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				updates = append(updates, positionUpdate{
					id:           positionID,
					cfIDsJSON:    newCFIDsJSON,
					cfValuesJSON: newCFValuesJSON,
				})
			}
			if err := rows.Err(); err != nil {
				log.Printf("[DeleteCustomField] rows.Err(): %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Выполняем UPDATE по всем накопленным позициям.
			for _, upd := range updates {
				_, err = tx.Exec(
					`UPDATE positions 
					SET custom_fields_ids = $1, custom_fields_values_ids = $2, updated_at = NOW()
					WHERE id = $3`,
					upd.cfIDsJSON,
					upd.cfValuesJSON,
					upd.id,
				)
				if err != nil {
					log.Printf("[DeleteCustomField] update position %d error: %v", upd.id, err)
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}
	}
	if err != nil {
		log.Printf("[DeleteCustomField] error loading allowed_values_ids: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Remove levels from tree_definitions that use this custom field.
	// IMPORTANT: we first collect all updates in memory, then run UPDATEs,
	// to avoid issuing Exec on the same connection while rows are still open
	// (which caused "pq: unexpected Parse response 'C'").
	type treeUpdate struct {
		id           uuid.UUID
		levelsJSON   []byte
	}

	treeRows, err := tx.Query(
		`SELECT id, levels FROM tree_definitions 
		WHERE levels::text LIKE '%' || $1 || '%'`,
		fieldKey,
	)
	if err != nil {
		log.Printf("[DeleteCustomField] query tree_definitions error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer treeRows.Close()

	var treeUpdates []treeUpdate

	for treeRows.Next() {
		var treeID uuid.UUID
		var levelsJSON []byte
		if err := treeRows.Scan(&treeID, &levelsJSON); err != nil {
			log.Printf("[DeleteCustomField] scan tree_definitions row error: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Parse levels JSON
		var levels []TreeLevel
		if err := json.Unmarshal(levelsJSON, &levels); err != nil {
			log.Printf("[DeleteCustomField] unmarshal levels JSON error: %v", err)
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

		filteredLevelsJSON, _ := json.Marshal(filteredLevels)
		treeUpdates = append(treeUpdates, treeUpdate{
			id:         treeID,
			levelsJSON: filteredLevelsJSON,
		})
	}
	if err = treeRows.Err(); err != nil {
		log.Printf("[DeleteCustomField] tree_definitions rows.Err(): %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for _, upd := range treeUpdates {
		_, err = tx.Exec(
			`UPDATE tree_definitions 
			SET levels = $1, updated_at = NOW() 
			WHERE id = $2`,
			upd.levelsJSON, upd.id,
		)
		if err != nil {
			log.Printf("[DeleteCustomField] update tree_definitions %s error: %v", upd.id.String(), err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	// Delete the custom field definition
	_, err = tx.Exec("DELETE FROM custom_fields WHERE id = $1", id)
	if err != nil {
		log.Printf("[DeleteCustomField] delete custom_fields error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		log.Printf("[DeleteCustomField] tx commit error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
