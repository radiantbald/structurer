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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
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

func (h *Handler) UpdatePosition(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var p Position
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	customFieldsJSON, _ := json.Marshal(p.CustomFields)

	_, err = h.db.Exec(
		`UPDATE positions SET name = $1, description = $2, custom_fields = $3, 
		employee_full_name = $4, employee_external_id = $5, employee_profile_url = $6, 
		updated_at = NOW() WHERE id = $7`,
		p.Name, p.Description, customFieldsJSON,
		p.EmployeeFullName, p.EmployeeExternalID, p.EmployeeProfileURL, id,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	p.ID = id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
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
	rows, err := h.db.Query(
		`SELECT id, key, label, allowed_values, created_at, updated_at
		FROM custom_field_definitions ORDER BY label`,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var fields []CustomFieldDefinition
	for rows.Next() {
		var f CustomFieldDefinition
		var allowedValuesJSON []byte
		err := rows.Scan(&f.ID, &f.Key, &f.Label, &allowedValuesJSON,
			&f.CreatedAt, &f.UpdatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if allowedValuesJSON != nil {
			var arr AllowedValuesArray
			json.Unmarshal(allowedValuesJSON, &arr)
			f.AllowedValues = &arr
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
	
	// Generate value_id for each allowed value if not present
	if f.AllowedValues != nil {
		for i := range *f.AllowedValues {
			if (*f.AllowedValues)[i].ValueID == uuid.Nil {
				(*f.AllowedValues)[i].ValueID = uuid.New()
			}
			// Generate value_id for linked custom field values if not present
			for j := range (*f.AllowedValues)[i].LinkedCustomFields {
				for k := range (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues {
					if (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID == uuid.Nil {
						(*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID = uuid.New()
					}
				}
			}
		}
	}
	
	var allowedValuesJSON []byte
	if f.AllowedValues != nil {
		allowedValuesJSON, _ = json.Marshal(*f.AllowedValues)
	}

	// Type is always 'enum' now, but we keep it for backward compatibility with DB
	_, err := h.db.Exec(
		`INSERT INTO custom_field_definitions (id, key, label, type, allowed_values, created_at, updated_at)
		VALUES ($1, $2, $3, 'enum', $4, NOW(), NOW())`,
		f.ID, f.Key, f.Label, allowedValuesJSON,
	)

	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			http.Error(w, "Field with this key already exists", http.StatusConflict)
			return
		}
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

	// Generate value_id for each allowed value if not present
	if f.AllowedValues != nil {
		for i := range *f.AllowedValues {
			if (*f.AllowedValues)[i].ValueID == uuid.Nil {
				(*f.AllowedValues)[i].ValueID = uuid.New()
			}
			// Generate value_id for linked custom field values if not present
			for j := range (*f.AllowedValues)[i].LinkedCustomFields {
				for k := range (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues {
					if (*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID == uuid.Nil {
						(*f.AllowedValues)[i].LinkedCustomFields[j].LinkedCustomFieldValues[k].LinkedCustomFieldValueID = uuid.New()
					}
				}
			}
		}
	}

	var allowedValuesJSON []byte
	if f.AllowedValues != nil {
		allowedValuesJSON, _ = json.Marshal(*f.AllowedValues)
	}

	// Type is always 'enum' now, but we keep it for backward compatibility with DB
	_, err = h.db.Exec(
		`UPDATE custom_field_definitions SET label = $1, type = 'enum', allowed_values = $2, 
		updated_at = NOW() WHERE id = $3`,
		f.Label, allowedValuesJSON, id,
	)

	if err != nil {
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

	// Check if field is used in any tree
	var fieldKey string
	err = h.db.QueryRow(
		"SELECT key FROM custom_field_definitions WHERE id = $1",
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

	var count int
	err = h.db.QueryRow(
		`SELECT COUNT(*) FROM tree_definitions 
		WHERE levels::text LIKE '%' || $1 || '%'`,
		fieldKey,
	).Scan(&count)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if count > 0 {
		http.Error(w, "Cannot delete field: it is used in tree definitions", http.StatusConflict)
		return
	}

	_, err = h.db.Exec("DELETE FROM custom_field_definitions WHERE id = $1", id)
	if err != nil {
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

