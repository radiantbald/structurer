-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum type for custom field types (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'custom_field_type'
    ) THEN
        CREATE TYPE custom_field_type AS ENUM ('string', 'number', 'enum');
    END IF;
END
$$;

-- Positions table (idempotent)
CREATE TABLE IF NOT EXISTS positions (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    employee_full_name VARCHAR(255),
    employee_external_id VARCHAR(255),
    employee_profile_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Custom field definitions table (idempotent)
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    type custom_field_type NOT NULL,
    allowed_values JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tree definitions table (idempotent)
CREATE TABLE IF NOT EXISTS tree_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    levels JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_positions_name ON positions(name);
CREATE INDEX IF NOT EXISTS idx_positions_custom_fields ON positions USING GIN(custom_fields);
CREATE INDEX IF NOT EXISTS idx_custom_field_definitions_key ON custom_field_definitions(key);
CREATE INDEX IF NOT EXISTS idx_tree_definitions_is_default ON tree_definitions(is_default);

-- Insert default tree (idempotent)
INSERT INTO tree_definitions (id, name, description, is_default, levels)
SELECT uuid_generate_v4(),
       'Plain List',
       'Default plain list of positions',
       true,
       '[]'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM tree_definitions
    WHERE name = 'Plain List' AND is_default = true
);

