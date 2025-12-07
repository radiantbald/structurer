package main

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// GetAvailableSuperiors returns positions that have the specified custom_field_value_id
// in their custom_fields_values_id array
func (h *Handler) GetAvailableSuperiors(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	valueID, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid custom field value ID", http.StatusBadRequest)
		return
	}

	// Query positions that have this custom_field_value_id in their custom_fields_values_id array
	rows, err := h.db.Query(
		`SELECT id, position_name, employee_surname, employee_name, employee_patronymic, employee_id
		FROM positions
		WHERE custom_fields_values_id @> $1::text::jsonb
		ORDER BY position_name`,
		`["`+valueID.String()+`"]`,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type SuperiorPosition struct {
		ID             int64   `json:"id"`
		Name           string  `json:"name"`
		EmployeeName   *string `json:"employee_name,omitempty"`
		EmployeeID     *string `json:"employee_id,omitempty"`
	}

	var positions []SuperiorPosition
	for rows.Next() {
		var pos SuperiorPosition
		var surname sql.NullString
		var employeeName sql.NullString
		var patronymic sql.NullString
		var employeeID sql.NullString

		if err := rows.Scan(&pos.ID, &pos.Name, &surname, &employeeName, &patronymic, &employeeID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Combine employee name parts if available
		var nameParts []string
		if surname.Valid && surname.String != "" {
			nameParts = append(nameParts, surname.String)
		}
		if employeeName.Valid && employeeName.String != "" {
			nameParts = append(nameParts, employeeName.String)
		}
		if patronymic.Valid && patronymic.String != "" {
			nameParts = append(nameParts, patronymic.String)
		}
		if len(nameParts) > 0 {
			fullName := ""
			for i, part := range nameParts {
				if i > 0 {
					fullName += " "
				}
				fullName += part
			}
			pos.EmployeeName = &fullName
		}

		if employeeID.Valid && employeeID.String != "" {
			pos.EmployeeID = &employeeID.String
		}

		positions = append(positions, pos)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(positions)
}

// UpdateCustomFieldValueSuperior updates the superior field for a custom field value
func (h *Handler) UpdateCustomFieldValueSuperior(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	valueID, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid custom field value ID", http.StatusBadRequest)
		return
	}

	var requestBody struct {
		Superior *int64 `json:"superior"` // Can be null to clear the superior
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update the superior field
	_, err = h.db.Exec(
		`UPDATE custom_fields_values 
		SET superior = $1, updated_at = NOW()
		WHERE id = $2`,
		requestBody.Superior,
		valueID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Get the updated custom field value with superior information
	var superior sql.NullInt64
	err = h.db.QueryRow(
		`SELECT superior FROM custom_fields_values WHERE id = $1`,
		valueID,
	).Scan(&superior)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var response struct {
		ID       string  `json:"id"`
		Superior *int64  `json:"superior,omitempty"`
	}
	response.ID = valueID.String()
	if superior.Valid {
		response.Superior = &superior.Int64
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetCustomFieldValueSuperior returns the superior information for a custom field value
func (h *Handler) GetCustomFieldValueSuperior(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	valueID, err := uuid.Parse(vars["id"])
	if err != nil {
		http.Error(w, "Invalid custom field value ID", http.StatusBadRequest)
		return
	}

	var superior sql.NullInt64
	var superiorName sql.NullString
	var superiorEmployeeName sql.NullString

	var surname sql.NullString
	var employeeName sql.NullString
	var patronymic sql.NullString

	err = h.db.QueryRow(
		`SELECT cfv.superior, p.position_name, 
			p.employee_surname, p.employee_name, p.employee_patronymic
		FROM custom_fields_values cfv
		LEFT JOIN positions p ON cfv.superior = p.id
		WHERE cfv.id = $1`,
		valueID,
	).Scan(&superior, &superiorName, &surname, &employeeName, &patronymic)

	if err == sql.ErrNoRows {
		http.Error(w, "Custom field value not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Combine employee name parts if available
	if superior.Valid {
		var nameParts []string
		if surname.Valid && surname.String != "" {
			nameParts = append(nameParts, surname.String)
		}
		if employeeName.Valid && employeeName.String != "" {
			nameParts = append(nameParts, employeeName.String)
		}
		if patronymic.Valid && patronymic.String != "" {
			nameParts = append(nameParts, patronymic.String)
		}
		if len(nameParts) > 0 {
			fullName := ""
			for i, part := range nameParts {
				if i > 0 {
					fullName += " "
				}
				fullName += part
			}
			superiorEmployeeName = sql.NullString{String: fullName, Valid: true}
		}
	}

	var response struct {
		ID                string  `json:"id"`
		Superior          *int64  `json:"superior,omitempty"`
		SuperiorName      *string `json:"superior_name,omitempty"`
		SuperiorEmployee  *string `json:"superior_employee,omitempty"`
	}
	response.ID = valueID.String()
	if superior.Valid {
		response.Superior = &superior.Int64
		if superiorName.Valid && superiorName.String != "" {
			response.SuperiorName = &superiorName.String
		}
		if superiorEmployeeName.Valid && superiorEmployeeName.String != "" {
			response.SuperiorEmployee = &superiorEmployeeName.String
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

