package main

import (
	"database/sql"
	"encoding/json"

	"github.com/google/uuid"
)

// CustomFieldsService provides reusable functions for working with custom fields
type CustomFieldsService struct {
	db *sql.DB
}

// NewCustomFieldsService creates a new CustomFieldsService
func NewCustomFieldsService(db *sql.DB) *CustomFieldsService {
	return &CustomFieldsService{db: db}
}

// FieldInfo represents basic information about a custom field
type FieldInfo struct {
	Key   string
	Label string
}

// FieldInfoMap is a map of field ID to field info
type FieldInfoMap map[uuid.UUID]FieldInfo

// ValueInfoMap is a map of value ID to value text
type ValueInfoMap map[uuid.UUID]string

// FieldToValuesMap maps field ID to a set of value IDs
type FieldToValuesMap map[uuid.UUID]map[uuid.UUID]bool

// LoadFieldInfoMap loads all custom field definitions into a map
func (s *CustomFieldsService) LoadFieldInfoMap() (FieldInfoMap, error) {
	fieldInfoMap := make(FieldInfoMap)
	rows, err := s.db.Query(`SELECT id, key, label FROM custom_fields`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var fieldID uuid.UUID
		var key, label string
		if err := rows.Scan(&fieldID, &key, &label); err == nil {
			fieldInfoMap[fieldID] = FieldInfo{Key: key, Label: label}
		}
	}
	return fieldInfoMap, nil
}

// LoadValueInfoMap loads all custom field values into a map
func (s *CustomFieldsService) LoadValueInfoMap() (ValueInfoMap, error) {
	valueInfoMap := make(ValueInfoMap)
	rows, err := s.db.Query(`SELECT id, value FROM custom_fields_values`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var valueID uuid.UUID
		var value string
		if err := rows.Scan(&valueID, &value); err == nil {
			valueInfoMap[valueID] = value
		}
	}
	return valueInfoMap, nil
}

// LoadFieldToValuesMap loads the mapping of which values belong to which fields
func (s *CustomFieldsService) LoadFieldToValuesMap() (FieldToValuesMap, error) {
	fieldToValuesMap := make(FieldToValuesMap)
	rows, err := s.db.Query(`SELECT id, allowed_values_ids FROM custom_fields WHERE allowed_values_ids IS NOT NULL`)
	if err != nil {
		return fieldToValuesMap, nil // Return empty map on error, not critical
	}
	defer rows.Close()

	for rows.Next() {
		var fieldID uuid.UUID
		var allowedValueIDsJSON []byte
		if err := rows.Scan(&fieldID, &allowedValueIDsJSON); err == nil {
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
	return fieldToValuesMap, nil
}

// LoadAllCustomFieldsData loads all custom fields related data in one call
func (s *CustomFieldsService) LoadAllCustomFieldsData() (FieldInfoMap, ValueInfoMap, FieldToValuesMap, error) {
	fieldInfoMap, err := s.LoadFieldInfoMap()
	if err != nil {
		return nil, nil, nil, err
	}

	valueInfoMap, err := s.LoadValueInfoMap()
	if err != nil {
		return nil, nil, nil, err
	}

	fieldToValuesMap, err := s.LoadFieldToValuesMap()
	if err != nil {
		return nil, nil, nil, err
	}

	return fieldInfoMap, valueInfoMap, fieldToValuesMap, nil
}

// BuildLinkedCustomFields builds linked custom fields structure from JSON data
func (s *CustomFieldsService) BuildLinkedCustomFields(
	linkedCustomFieldIDsJSON []byte,
	linkedCustomFieldValueIDsJSON []byte,
	fieldInfoMap FieldInfoMap,
	fieldToValuesMap FieldToValuesMap,
	valueInfoMap ValueInfoMap,
	selectedValueIDs map[uuid.UUID]bool,
) ([]LinkedCustomField, error) {
	linkedFields := []LinkedCustomField{}

	if linkedCustomFieldIDsJSON == nil || linkedCustomFieldValueIDsJSON == nil {
		return linkedFields, nil
	}

	var linkedFieldIDs []string
	var linkedValueIDs []string

	if err := json.Unmarshal(linkedCustomFieldIDsJSON, &linkedFieldIDs); err != nil {
		return linkedFields, nil
	}
	if err := json.Unmarshal(linkedCustomFieldValueIDsJSON, &linkedValueIDs); err != nil {
		return linkedFields, nil
	}

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
		for _, linkedValueID := range linkedValueUUIDs {
			// Check if this value belongs to the linked field
			// AND if it's in the selected values for position (if selectedValueIDs is provided)
			if fieldValueSet[linkedValueID] {
				// If selectedValueIDs is provided, filter by it
				if selectedValueIDs != nil && !selectedValueIDs[linkedValueID] {
					continue
				}
				// Get the value text from pre-loaded map
				if linkedValueText, exists := valueInfoMap[linkedValueID]; exists {
					linkedFieldValues = append(linkedFieldValues, LinkedCustomFieldValue{
						LinkedCustomFieldValueID: linkedValueID,
						LinkedCustomFieldValue:   linkedValueText,
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

	return linkedFields, nil
}


