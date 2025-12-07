/**
 * Validation utilities
 */

/**
 * Validates UUID string
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} - True if valid UUID
 */
export function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates position ID (can be number or string)
 * @param {string|number} id - Position ID
 * @returns {boolean} - True if valid position ID
 */
export function isValidPositionId(id) {
  if (id === null || id === undefined) {
    return false;
  }
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return !isNaN(numId) && numId > 0;
}

/**
 * Validates required string field
 * @param {string} value - Value to validate
 * @param {number} minLength - Minimum length (default: 1)
 * @param {number} maxLength - Maximum length (optional)
 * @returns {boolean} - True if valid
 */
export function isValidString(value, minLength = 1, maxLength = null) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    return false;
  }
  if (maxLength !== null && trimmed.length > maxLength) {
    return false;
  }
  return true;
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
export function isValidURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  try {
    new URL(url.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates custom fields array structure
 * @param {Array} customFields - Custom fields array
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateCustomFields(customFields) {
  const errors = [];

  if (!Array.isArray(customFields)) {
    return { valid: false, errors: ['Custom fields must be an array'] };
  }

  customFields.forEach((field, index) => {
    if (!field || typeof field !== 'object') {
      errors.push(`Field at index ${index} must be an object`);
      return;
    }

    if (!field.custom_field_id) {
      errors.push(`Field at index ${index} is missing custom_field_id`);
    } else if (!isValidUUID(field.custom_field_id)) {
      errors.push(`Field at index ${index} has invalid custom_field_id format`);
    }

    if (field.custom_field_value_id && !isValidUUID(field.custom_field_value_id)) {
      errors.push(`Field at index ${index} has invalid custom_field_value_id format`);
    }

    // Validate linked custom fields if present
    if (field.linked_custom_fields && Array.isArray(field.linked_custom_fields)) {
      field.linked_custom_fields.forEach((linkedField, lfIndex) => {
        if (!linkedField.linked_custom_field_id) {
          errors.push(`Linked field at index ${index}.${lfIndex} is missing linked_custom_field_id`);
        } else if (!isValidUUID(linkedField.linked_custom_field_id)) {
          errors.push(`Linked field at index ${index}.${lfIndex} has invalid linked_custom_field_id format`);
        }

        if (linkedField.linked_custom_field_values && Array.isArray(linkedField.linked_custom_field_values)) {
          linkedField.linked_custom_field_values.forEach((linkedValue, lvIndex) => {
            if (!linkedValue.linked_custom_field_value_id) {
              errors.push(`Linked value at index ${index}.${lfIndex}.${lvIndex} is missing linked_custom_field_value_id`);
            } else if (!isValidUUID(linkedValue.linked_custom_field_value_id)) {
              errors.push(`Linked value at index ${index}.${lfIndex}.${lvIndex} has invalid linked_custom_field_value_id format`);
            }
          });
        }
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates position data before creation/update
 * @param {Object} position - Position data
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validatePosition(position) {
  const errors = [];

  if (!position) {
    return { valid: false, errors: ['Position data is required'] };
  }

  if (!isValidString(position.name, 1, 255)) {
    errors.push('Position name is required and must be between 1 and 255 characters');
  }

  if (position.description && typeof position.description === 'string' && position.description.length > 1000) {
    errors.push('Description must be less than 1000 characters');
  }

  if (position.employee_full_name && !isValidString(position.employee_full_name, 1, 255)) {
    errors.push('Employee full name must be between 1 and 255 characters if provided');
  }

  if (position.employee_profile_url && !isValidURL(position.employee_profile_url)) {
    errors.push('Employee profile URL must be a valid URL if provided');
  }

  if (position.custom_fields) {
    const customFieldsValidation = validateCustomFields(position.custom_fields);
    if (!customFieldsValidation.valid) {
      errors.push(...customFieldsValidation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}


