import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CustomFieldForm.css';
import './TreeDefinitionForm.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';

function TreeDefinitionForm({ onClose, onChanged }) {
  const [trees, setTrees] = useState([]);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [treesError, setTreesError] = useState('');

  const [availableFields, setAvailableFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldsError, setFieldsError] = useState('');

  const [editingTreeId, setEditingTreeId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingTreeId, setDeletingTreeId] = useState(null);
  const [error, setError] = useState('');

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [expandedLevelsTreeId, setExpandedLevelsTreeId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_default: false,
    levels: []
  });

  useEffect(() => {
    loadTrees();
    loadFields();
  }, []);

  const loadTrees = async () => {
    setLoadingTrees(true);
    setTreesError('');
    try {
      const response = await axios.get(`${API_BASE}/trees`);
      setTrees(response.data || []);
    } catch (err) {
      setTreesError('Не удалось загрузить список деревьев');
    } finally {
      setLoadingTrees(false);
    }
  };

  const loadFields = async () => {
    setLoadingFields(true);
    setFieldsError('');
    try {
      const response = await axios.get(`${API_BASE}/custom-fields`);
      setAvailableFields(response.data || []);
    } catch (err) {
      setFieldsError('Не удалось загрузить кастомные поля');
    } finally {
      setLoadingFields(false);
    }
  };

  const resetForm = () => {
    setEditingTreeId(null);
    setFormData({
      name: '',
      description: '',
      is_default: false,
      levels: []
    });
    setError('');
  };

  const handleSelectTree = (tree) => {
    if (!tree) {
      resetForm();
      setIsFormVisible(false);
      return;
    }
    setIsFormVisible(true);
    setEditingTreeId(tree.id);
    setFormData({
      name: tree.name || '',
      description: tree.description || '',
      is_default: !!tree.is_default,
      levels: (tree.levels || []).map((lvl, index) => ({
        order: typeof lvl.order === 'number' ? lvl.order : index + 1,
        custom_field_key: lvl.custom_field_key || ''
      }))
    });
    setError('');
  };

  const handleChangeField = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
  };

  const handleChangeLevelField = (index, value) => {
    setFormData(prev => {
      const levels = [...(prev.levels || [])];
      levels[index] = {
        ...levels[index],
        custom_field_key: value
      };
      return {
        ...prev,
        levels
      };
    });
  };

  const handleAddLevel = () => {
    setFormData(prev => {
      const nextOrder = (prev.levels?.length || 0) + 1;
      return {
        ...prev,
        levels: [
          ...(prev.levels || []),
          { order: nextOrder, custom_field_key: '' }
        ]
      };
    });
  };

  const handleRemoveLevel = (index) => {
    setFormData(prev => {
      const levels = [...(prev.levels || [])];
      levels.splice(index, 1);
      const reOrdered = levels.map((lvl, idx) => ({
        ...lvl,
        order: idx + 1
      }));
      return {
        ...prev,
        levels: reOrdered
      };
    });
  };

  const getTreeLevelsLabel = (tree) => {
    const levels = tree.levels || [];
    if (!levels.length) {
      return 'Без уровней';
    }

    const byKey = new Map(
      (availableFields || []).map(f => [f.key, f])
    );

    const parts = levels
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(lvl => {
        const field = byKey.get(lvl.custom_field_key);
        if (!field) {
          return lvl.custom_field_key || '—';
        }
        return field.label || field.key;
      });

    return parts.join(' → ');
  };

  const getTreeLevelsDetailed = (tree) => {
    const levels = tree.levels || [];
    if (!levels.length) {
      return [];
    }

    const byKey = new Map(
      (availableFields || []).map(f => [f.key, f])
    );

    return levels
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(lvl => {
        const field = byKey.get(lvl.custom_field_key);
        if (!field) {
          return null;
        }
        const values = Array.isArray(field.allowed_values)
          ? field.allowed_values.map(v => String(v))
          : [];
        return {
          key: field.key,
          label: field.label || field.key,
          values
        };
      })
      .filter(Boolean);
  };

  const toggleTreeLevelsExpanded = (treeId) => {
    setExpandedLevelsTreeId(prev => (prev === treeId ? null : treeId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Название дерева обязательно');
      return;
    }

    // Фильтруем пустые уровни
    const levels = (formData.levels || [])
      .filter(lvl => lvl.custom_field_key)
      .map((lvl, index) => ({
        order: index + 1,
        custom_field_key: lvl.custom_field_key
      }));

    const payload = {
      name: formData.name.trim(),
      description: formData.description || null,
      is_default: !!formData.is_default,
      levels
    };

    setSaving(true);
    try {
      let response;
      if (editingTreeId) {
        response = await axios.put(`${API_BASE}/trees/${editingTreeId}`, payload);
      } else {
        response = await axios.post(`${API_BASE}/trees`, payload);
      }

      await loadTrees();

      if (onChanged) {
        onChanged(response.data);
      }

      if (!editingTreeId) {
        // при создании остаёмся в режиме редактирования нового дерева
        handleSelectTree(response.data);
      }
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data ||
        err.message ||
        'Ошибка при сохранении дерева';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (treeId) => {
    if (!window.confirm('Вы уверены, что хотите удалить это дерево?')) {
      return;
    }

    setDeletingTreeId(treeId);
    try {
      await axios.delete(`${API_BASE}/trees/${treeId}`);
      await loadTrees();

      if (editingTreeId === treeId) {
        resetForm();
      }

      if (onChanged) {
        onChanged(null);
      }
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data ||
        err.message ||
        'Ошибка при удалении дерева';
      alert(message);
    } finally {
      setDeletingTreeId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={
          'modal-content tree-modal-content' +
          (!isFormVisible ? ' tree-modal-content-compact' : '')
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Управление деревьями</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="custom-field-form">
          <div
            className={
              'tree-definition-modal' +
              (!isFormVisible ? ' tree-definition-modal-single' : '')
            }
          >
            <div className="tree-definition-list">
            <h3>Деревья</h3>
            {loadingTrees && (
              <div className="tree-definition-empty">Загрузка...</div>
            )}
            {treesError && !loadingTrees && (
              <div className="error-message">{treesError}</div>
            )}
            {!loadingTrees && !treesError && trees.length === 0 && (
              <div className="tree-definition-empty">
                Пока нет ни одного дерева. Создайте первое.
              </div>
            )}
            {!loadingTrees && !treesError && trees.length > 0 && (
              <>
                {trees.map(tree => (
                  <div
                    key={tree.id}
                    className={
                      'tree-definition-item' +
                      (editingTreeId === tree.id ? ' active' : '')
                    }
                    onClick={() => handleSelectTree(tree)}
                  >
                    <div className="tree-definition-item-main">
                      <div className="tree-definition-item-title">
                        <span className="tree-definition-name">{tree.name}</span>
                        <div className="tree-definition-item-title-actions">
                          <button
                            type="button"
                            className="icon-button"
                            title="Редактировать"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTree(tree);
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button-danger"
                            title={deletingTreeId === tree.id ? 'Удаление…' : 'Удалить'}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(tree.id);
                            }}
                            disabled={deletingTreeId === tree.id}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="tree-definition-item-tags">
                        {tree.is_default && (
                          <span className="tree-definition-default-badge">
                            по умолчанию
                          </span>
                        )}
                        {getTreeLevelsDetailed(tree).length > 0 && (
                          <button
                            type="button"
                            className="tree-definition-levels-toggle"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTreeLevelsExpanded(tree.id);
                            }}
                          >
                            Компоненты дерева
                            <span className="tree-definition-levels-toggle-icon">
                              {expandedLevelsTreeId === tree.id ? '▴' : '▾'}
                            </span>
                          </button>
                        )}
                      </div>
                      {expandedLevelsTreeId === tree.id &&
                        getTreeLevelsDetailed(tree).length > 0 && (
                          <div className="tree-definition-levels-block">
                            {getTreeLevelsDetailed(tree).map(level => (
                              <div
                                key={`${tree.id}-${level.key}`}
                                className="tree-definition-level-row"
                              >
                                <div className="tree-definition-level-name">
                                  {level.label}
                                </div>
                                <div className="tree-definition-level-values">
                                  {level.values.length > 0 ? (
                                    level.values.map((val, idx) => (
                                      <span
                                        key={`${tree.id}-${level.key}-${idx}`}
                                        className="tree-definition-level-value-chip"
                                      >
                                        {val}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="tree-definition-level-no-values">
                                      Нет значений
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                      )}
                      {tree.description && (
                        <div className="tree-definition-item-details">
                          <span className="tree-definition-meta">
                            {tree.description}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '0.5rem', width: '100%' }}
              onClick={() => {
                setIsFormVisible(true);
                resetForm();
              }}
            >
              + Новое дерево
            </button>
          </div>

          {isFormVisible && (
          <form className="tree-definition-form" onSubmit={handleSubmit}>
            <h3>{editingTreeId ? 'Редактирование дерева' : 'Новое дерево'}</h3>

            {error && (
              <div className="error-message" style={{ marginBottom: '0.5rem' }}>
                {error}
              </div>
            )}

            <div className="form-field">
              <label>Название *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChangeField('name', e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Описание</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChangeField('description', e.target.value)}
                rows="3"
              />
            </div>

            <div className="tree-definition-checkbox">
              <input
                id="tree-default-checkbox"
                type="checkbox"
                checked={!!formData.is_default}
                onChange={(e) =>
                  handleChangeField('is_default', e.target.checked)
                }
              />
              <label htmlFor="tree-default-checkbox">
                Использовать как дерево по умолчанию
              </label>
            </div>

            <div className="tree-levels-section">
              <div className="tree-levels-header">
                <span>Уровни дерева</span>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={handleAddLevel}
                  disabled={loadingFields}
                >
                  + Уровень
                </button>
              </div>

              <div className="tree-definition-hint">
                Последовательно выберите поля, по которым будет строиться иерархия
                (например: подразделение → команда → грейд).
              </div>

              {fieldsError && !loadingFields && (
                <div className="error-message" style={{ marginBottom: '0.25rem' }}>
                  {fieldsError}
                </div>
              )}

              {loadingFields && (
                <div className="tree-definition-empty">
                  Загрузка списка кастомных полей...
                </div>
              )}

              {!loadingFields && (formData.levels || []).length === 0 && (
                <div className="tree-definition-empty">
                  Уровни ещё не заданы. Добавьте первый уровень.
                </div>
              )}

              <div className="tree-levels-list">
                {(formData.levels || []).map((lvl, index) => (
                  <div key={index} className="tree-level-row">
                    <div className="tree-level-row-order">
                      {index + 1}.
                    </div>
                    <select
                      value={lvl.custom_field_key || ''}
                      onChange={(e) =>
                        handleChangeLevelField(index, e.target.value)
                      }
                    >
                      <option value="">Выберите поле</option>
                      {availableFields.map(field => (
                        <option key={field.id} value={field.key}>
                          {field.label} ({field.key})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => handleRemoveLevel(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={saving}
              >
                Закрыть
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving
                  ? (editingTreeId ? 'Сохранение...' : 'Создание...')
                  : (editingTreeId ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </form>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TreeDefinitionForm;


