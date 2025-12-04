package main

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Position represents a job position
type Position struct {
	ID                      int64           `json:"id" db:"id"`
	Name                    string          `json:"name" db:"name"`
	Description             *string         `json:"description" db:"description"`
	CustomFieldsIDs         *UUIDArray      `json:"custom_fields" db:"custom_fields_ids"`                     // Stored as array of UUIDs in DB, returned as custom_fields in JSON
	CustomFieldsValuesIDs   *UUIDArray      `json:"custom_fields_values_ids,omitempty" db:"custom_fields_values_ids"` // Stored as array of UUIDs in DB, exposed for search/UX
	EmployeeFullName        *string         `json:"employee_full_name" db:"employee_full_name"`
	EmployeeExternalID      *string         `json:"employee_external_id" db:"employee_external_id"`
	EmployeeProfileURL      *string         `json:"employee_profile_url" db:"employee_profile_url"`
	CreatedAt               time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt               time.Time       `json:"updated_at" db:"updated_at"`
}

// LinkedCustomFieldValue represents a linked custom field value
type LinkedCustomFieldValue struct {
	LinkedCustomFieldValueID    uuid.UUID `json:"linked_custom_field_value_id"`
	LinkedCustomFieldValue      string    `json:"linked_custom_field_value"`
}

// LinkedCustomField represents a linked custom field
type LinkedCustomField struct {
	LinkedCustomFieldID         uuid.UUID                `json:"linked_custom_field_id"`
	LinkedCustomFieldKey        string                   `json:"linked_custom_field_key"`
	LinkedCustomFieldLabel      string                   `json:"linked_custom_field_label"`
	LinkedCustomFieldValues     []LinkedCustomFieldValue `json:"linked_custom_field_values"`
}

// AllowedValue represents a single allowed value with optional linked fields
type AllowedValue struct {
	ValueID            uuid.UUID          `json:"value_id"`
	Value              string             `json:"value"`
	LinkedCustomFields []LinkedCustomField `json:"linked_custom_fields,omitempty"`
}

// AllowedValuesArray represents an array of allowed values
type AllowedValuesArray []AllowedValue

func (a AllowedValuesArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}
	return json.Marshal(a)
}

func (a *AllowedValuesArray) Scan(value interface{}) error {
	if value == nil {
		*a = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, a)
}

// UUIDArray represents an array of UUIDs as JSONB
type UUIDArray []uuid.UUID

func (a UUIDArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}
	// Convert to array of strings
	strs := make([]string, len(a))
	for i, id := range a {
		strs[i] = id.String()
	}
	return json.Marshal(strs)
}

func (a *UUIDArray) Scan(value interface{}) error {
	if value == nil {
		*a = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	// Parse as array of strings
	var strs []string
	if err := json.Unmarshal(bytes, &strs); err != nil {
		return err
	}
	// Convert to UUIDs
	*a = make([]uuid.UUID, len(strs))
	for i, s := range strs {
		id, err := uuid.Parse(s)
		if err != nil {
			return err
		}
		(*a)[i] = id
	}
	return nil
}

// LinkedCustomFieldsArray represents an array of linked custom fields
type LinkedCustomFieldsArray []LinkedCustomField

func (a LinkedCustomFieldsArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}
	return json.Marshal(a)
}

func (a *LinkedCustomFieldsArray) Scan(value interface{}) error {
	if value == nil {
		*a = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, a)
}

// CustomFieldValue represents a custom field value in the database
type CustomFieldValue struct {
	ID                      uuid.UUID              `json:"id" db:"id"`
	Value                   string                 `json:"value" db:"value"`
	LinkedCustomFields      LinkedCustomFieldsArray `json:"linked_custom_fields" db:"linked_custom_fields"`
	LinkedCustomFieldIDs    *UUIDArray              `json:"-" db:"linked_custom_fields_ids"` // Stored in DB
	LinkedCustomFieldValueIDs *UUIDArray            `json:"-" db:"linked_custom_fields_values_ids"` // Stored in DB
	CreatedAt               time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt               time.Time              `json:"updated_at" db:"updated_at"`
}

// CustomFieldDefinition represents a custom field definition
type CustomFieldDefinition struct {
	ID            uuid.UUID          `json:"id" db:"id"`
	Key           string             `json:"key" db:"key"`
	Label         string             `json:"label" db:"label"`
	AllowedValues *AllowedValuesArray `json:"allowed_values" db:"-"` // Computed field, not stored in DB
	AllowedValueIDs *UUIDArray        `json:"-" db:"allowed_values_ids"` // Stored in DB
	CreatedAt     time.Time          `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time          `json:"updated_at" db:"updated_at"`
}

// TreeLevel represents a level in a tree definition
type TreeLevel struct {
	Order          int    `json:"order"`
	CustomFieldKey string `json:"custom_field_key"`
}

// TreeDefinition represents a tree definition
type TreeDefinition struct {
	ID          uuid.UUID   `json:"id" db:"id"`
	Name        string      `json:"name" db:"name"`
	Description *string     `json:"description" db:"description"`
	IsDefault   bool        `json:"is_default" db:"is_default"`
	Levels      []TreeLevel `json:"levels" db:"levels"`
	CreatedAt   time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at" db:"updated_at"`
}

// TreeStructure represents the runtime tree structure
type TreeStructure struct {
	TreeID string      `json:"tree_id"`
	Name   string      `json:"name"`
	Levels []TreeLevel `json:"levels"`
	Root   TreeNode    `json:"root"`
}

// TreeNode represents a node in the tree
type TreeNode struct {
	Type            string     `json:"type"` // "root", "custom_field_value", "position"
	LevelOrder      *int       `json:"level_order,omitempty"`
	FieldKey        *string    `json:"field_key,omitempty"` // Deprecated: use CustomFieldKey
	// FieldValue is fully removed from API; kept only to avoid breaking old code references.
	// It is not serialized to JSON anymore; combined labels are now built on the frontend
	// from CustomFieldValue and LinkedCustomFields.
	FieldValue      *string    `json:"-"` // Deprecated and hidden from JSON
	CustomFieldID   *string    `json:"custom_field_id,omitempty"`
	CustomFieldKey  *string    `json:"custom_field_key,omitempty"`
	CustomFieldValue *string   `json:"custom_field_value,omitempty"`
	LinkedCustomFields []LinkedCustomField `json:"linked_custom_fields,omitempty"`
	PositionID      *string    `json:"position_id,omitempty"`
	PositionName    *string    `json:"position_name,omitempty"`
	EmployeeFullName *string   `json:"employee_full_name,omitempty"`
	Children        []TreeNode `json:"children"`
}

// PositionCustomFieldValue represents a custom field value in position response
type PositionCustomFieldValue struct {
	CustomFieldID      string              `json:"custom_field_id"`
	CustomFieldKey     string              `json:"custom_field_key"`
	CustomFieldLabel   string              `json:"custom_field_label"`
	CustomFieldValue   string              `json:"custom_field_value"`
	CustomFieldValueID uuid.UUID           `json:"custom_field_value_id"`
	LinkedCustomFields []LinkedCustomField `json:"linked_custom_fields,omitempty"`
}

// JSONB is a helper type for JSONB columns
type JSONB map[string]interface{}

func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, j)
}

