package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// RunMigrations applies all pending SQL migrations from the migrations directory.
// It is safe to call on every server start: already applied migrations are skipped.
func RunMigrations(db *sql.DB) error {
	// Ensure migrations tracking table exists
	if err := ensureMigrationsTable(db); err != nil {
		return fmt.Errorf("ensure migrations table: %w", err)
	}
	// Determine migrations directory (can be overridden via env)
	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		// Try a couple of sensible defaults relative to current working directory:
		// - project root: "database/migrations"
		// - from backend subdir: "../database/migrations"
		candidates := []string{
			"database/migrations",
			filepath.Join("..", "database", "migrations"),
		}
		for _, c := range candidates {
			if info, err := os.Stat(c); err == nil && info.IsDir() {
				migrationsDir = c
				break
			}
		}
		if migrationsDir == "" {
			return fmt.Errorf("no migrations directory found; set MIGRATIONS_DIR or create database/migrations")
		}
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	// Collect only .sql files
	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasSuffix(strings.ToLower(name), ".sql") {
			files = append(files, name)
		}
	}

	// Sort to ensure deterministic order: 001_..., 002_..., etc.
	sort.Strings(files)

	for _, fname := range files {
		applied, err := isMigrationApplied(db, fname)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", fname, err)
		}
		if applied {
			continue
		}

		fullPath := filepath.Join(migrationsDir, fname)
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", fname, err)
		}

		// Execute migration; lib/pq allows multiple statements in one Exec
		if _, err := db.Exec(string(content)); err != nil {
			return fmt.Errorf("exec migration %s: %w", fname, err)
		}

		if err := markMigrationApplied(db, fname); err != nil {
			return fmt.Errorf("mark migration %s applied: %w", fname, err)
		}
	}

	return nil
}

func ensureMigrationsTable(db *sql.DB) error {
	const q = `
CREATE TABLE IF NOT EXISTS schema_migrations (
	id SERIAL PRIMARY KEY,
	filename TEXT NOT NULL UNIQUE,
	applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`
	_, err := db.Exec(q)
	return err
}

func isMigrationApplied(db *sql.DB, filename string) (bool, error) {
	const q = `SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1`
	var dummy int
	err := db.QueryRow(q, filename).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func markMigrationApplied(db *sql.DB, filename string) error {
	const q = `INSERT INTO schema_migrations (filename) VALUES ($1)`
	_, err := db.Exec(q, filename)
	return err
}


