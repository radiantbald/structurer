package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
)

func buildTreeStructure(db *sql.DB, tree TreeDefinition) TreeStructure {
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

	// Get all positions в порядке их создания (по id)
	rows, _ := db.Query(
		`SELECT id, name, custom_fields, employee_full_name FROM positions ORDER BY id`,
	)
	defer rows.Close()

	var positions []struct {
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
	}

	for rows.Next() {
		var p struct {
			ID             string
			Name           string
			CustomFields   map[string]string
			EmployeeFullName *string
		}
		var customFieldsJSON []byte
		var employeeFullName sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &customFieldsJSON, &employeeFullName); err == nil {
			if customFieldsJSON != nil {
				// Сначала читаем в map[string]interface{}, затем нормализуем в строки
				var rawFields map[string]interface{}
				if err := json.Unmarshal(customFieldsJSON, &rawFields); err == nil && rawFields != nil {
					p.CustomFields = make(map[string]string, len(rawFields))
					for k, v := range rawFields {
						// Используем строковое представление для любых скалярных типов
						p.CustomFields[k] = fmt.Sprint(v)
					}
				}
			}
			if p.CustomFields == nil {
				p.CustomFields = make(map[string]string)
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
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
	}
	for _, pos := range positions {
		if structuredPositionIDs[pos.ID] {
			structuredPositions = append(structuredPositions, pos)
		}
	}

	// Build structured part of the tree recursively на основе только структурированных позиций.
	structuredChildren := buildTreeLevel(structuredPositions, tree.Levels, 0, nil)

	// Collect positions that don't participate in the tree at all (no values for any tree level keys)
	unstructuredPositions := make([]struct {
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
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
			Type:       "field_value",
			LevelOrder: nil,
			FieldKey:   nil,
			FieldValue: &label,
			Children:   unstructuredNodes,
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

func buildTreeLevel(positions []struct {
	ID             string
	Name           string
	CustomFields   map[string]string
	EmployeeFullName *string
}, levels []TreeLevel, levelIndex int, path map[string]string) []TreeNode {
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
		ID             string
		Name           string
		CustomFields   map[string]string
		EmployeeFullName *string
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

	// Create nodes for each unique value
	var nodes []TreeNode
	for val := range valueSet {
		valCopy := val
		levelOrder := order
		fieldKeyCopy := fieldKey

		// Build new path
		newPath := make(map[string]string)
		for k, v := range path {
			newPath[k] = v
		}
		newPath[fieldKey] = val

		children := buildTreeLevel(positions, levels, levelIndex+1, newPath)

		nodes = append(nodes, TreeNode{
			Type:       "field_value",
			LevelOrder: &levelOrder,
			FieldKey:   &fieldKeyCopy,
			FieldValue: &valCopy,
			Children:   children,
		})
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
		if n.Type == "field_value" {
			fieldNodes = append(fieldNodes, n)
		} else {
			positionNodes = append(positionNodes, n)
		}
	}

	// Сортируем только папки по названию
	sort.Slice(fieldNodes, func(i, j int) bool {
		vi := ""
		if fieldNodes[i].FieldValue != nil {
			vi = *fieldNodes[i].FieldValue
		}
		vj := ""
		if fieldNodes[j].FieldValue != nil {
			vj = *fieldNodes[j].FieldValue
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

