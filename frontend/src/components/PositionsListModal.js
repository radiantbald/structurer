import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './CustomFieldForm.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';

function PositionsListModal({ onClose }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPositions();
  }, []);

  const loadPositions = async () => {
    setLoading(true);
    setError('');
    try {
      // Берём разумный лимит, чтобы не грузить бесконечный список
      const response = await axios.get(`${API_BASE}/positions`, {
        params: {
          limit: 1000,
          offset: 0
        }
      });
      const data = response.data || {};
      setPositions(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data ||
        err.message ||
        'Не удалось загрузить список должностей';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '900px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Список всех должностей</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="custom-field-form">
          {loading && (
            <div className="tree-definition-empty">Загрузка списка должностей…</div>
          )}

          {error && !loading && (
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {!loading && !error && positions.length === 0 && (
            <div className="tree-definition-empty">
              Пока нет ни одной должности. Создайте первую через интерфейс справа.
            </div>
          )}

          {!loading && !error && positions.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="positions-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Сотрудник</th>
                    <th>EID</th>
                    <th>Профиль</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="position-id">#{p.id}</span>
                      </td>
                      <td>{p.name}</td>
                      <td>{p.employee_full_name || '—'}</td>
                      <td>{p.employee_id || '—'}</td>
                      <td>
                        {p.employee_profile_url ? (
                          <a
                            href={p.employee_profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            открыть
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PositionsListModal;


