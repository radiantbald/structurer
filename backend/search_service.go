package main

import (
	"strconv"
	"strings"
)

// SearchQuery represents a parsed search query
type SearchQuery struct {
	Conditions []SearchCondition
}

// SearchCondition represents a single search condition (AND group)
type SearchCondition struct {
	Terms []string // OR terms within this condition
}

// ParseSearchQuery parses a search query string into structured conditions
// Supports AND/OR operators (case insensitive)
func ParseSearchQuery(search string) *SearchQuery {
	if search == "" {
		return &SearchQuery{Conditions: []SearchCondition{}}
	}

	searchLower := strings.ToLower(search)
	hasAnd := strings.Contains(searchLower, " and ")
	hasOr := strings.Contains(searchLower, " or ")

	if !hasAnd && !hasOr {
		// Simple search - single term
		return &SearchQuery{
			Conditions: []SearchCondition{
				{Terms: []string{strings.TrimSpace(search)}},
			},
		}
	}

	var conditions []SearchCondition

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
			var terms []string
			for _, orPart := range orParts {
				orPart = strings.TrimSpace(orPart)
				if orPart != "" {
					terms = append(terms, orPart)
				}
			}
			if len(terms) > 0 {
				conditions = append(conditions, SearchCondition{Terms: terms})
			}
		} else {
			if part != "" {
				conditions = append(conditions, SearchCondition{Terms: []string{part}})
			}
		}
	}

	return &SearchQuery{Conditions: conditions}
}

// BuildWhereClause builds a SQL WHERE clause from parsed search conditions
func BuildWhereClause(query *SearchQuery) (string, []interface{}) {
	if query == nil || len(query.Conditions) == 0 {
		return "", []interface{}{}
	}

	var conditions []string
	var args []interface{}
	argIndex := 1

	for _, condition := range query.Conditions {
		if len(condition.Terms) == 0 {
			continue
		}

		if len(condition.Terms) == 1 {
			// Single term - simple condition
			conditions = append(conditions,
				`(name ILIKE $`+strconv.Itoa(argIndex)+` OR 
				COALESCE(description, '') ILIKE $`+strconv.Itoa(argIndex)+` OR 
				COALESCE(employee_full_name, '') ILIKE $`+strconv.Itoa(argIndex)+`)`)
			args = append(args, "%"+condition.Terms[0]+"%")
			argIndex++
		} else {
			// Multiple terms - OR condition
			var orConditions []string
			for _, term := range condition.Terms {
				orConditions = append(orConditions,
					`(name ILIKE $`+strconv.Itoa(argIndex)+` OR 
					COALESCE(description, '') ILIKE $`+strconv.Itoa(argIndex)+` OR 
					COALESCE(employee_full_name, '') ILIKE $`+strconv.Itoa(argIndex)+`)`)
				args = append(args, "%"+term+"%")
				argIndex++
			}
			if len(orConditions) > 0 {
				conditions = append(conditions, "("+strings.Join(orConditions, " OR ")+")")
			}
		}
	}

	if len(conditions) == 0 {
		return "", []interface{}{}
	}

	return strings.Join(conditions, " AND "), args
}


