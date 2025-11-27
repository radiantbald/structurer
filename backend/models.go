package main

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Position represents a job position
type Position struct {
	ID                   int64           `json:"id" db:"id"`
	Name                 string          `json:"name" db:"name"`
	Description          *string         `json:"description" db:"description"`
	CustomFields         JSONB           `json:"custom_fields" db:"custom_fields"`
	EmployeeFullName     *string         `json:"employee_full_name" db:"employee_full_name"`
	EmployeeExternalID   *string         `json:"employee_external_id" db:"employee_external_id"`
	EmployeeProfileURL   *string         `json:"employee_profile_url" db:"employee_profile_url"`
	CreatedAt            time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at" db:"updated_at"`
}

// CustomFieldType represents the type of a custom field
type CustomFieldType string

const (
	CustomFieldTypeString CustomFieldType = "string"
	CustomFieldTypeNumber CustomFieldType = "number"
	CustomFieldTypeEnum   CustomFieldType = "enum"
)

// AllowedValuesArray represents an array of allowed values for enum fields
type AllowedValuesArray []interface{}

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

// CustomFieldDefinition represents a custom field definition
type CustomFieldDefinition struct {
	ID           uuid.UUID          `json:"id" db:"id"`
	Key          string             `json:"key" db:"key"`
	Label        string             `json:"label" db:"label"`
	Type         CustomFieldType    `json:"type" db:"type"`
	AllowedValues *AllowedValuesArray `json:"allowed_values" db:"allowed_values"`
	CreatedAt    time.Time          `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at" db:"updated_at"`
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
	Type         string     `json:"type"` // "root", "field_value", "position"
	LevelOrder   *int       `json:"level_order,omitempty"`
	FieldKey     *string    `json:"field_key,omitempty"`
	FieldValue   *string    `json:"field_value,omitempty"`
	PositionID   *string    `json:"position_id,omitempty"`
	PositionName *string    `json:"position_name,omitempty"`
	Children     []TreeNode `json:"children"`
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

