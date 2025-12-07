package main

import (
	"database/sql"
)

// Handler contains database connection and services
type Handler struct {
	db                  *sql.DB
	customFieldsService *CustomFieldsService
}

// NewHandler creates a new Handler instance
func NewHandler(db *sql.DB) *Handler {
	return &Handler{
		db:                  db,
		customFieldsService: NewCustomFieldsService(db),
	}
}
