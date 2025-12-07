import React from 'react';
import './SearchBar.css';

function SearchBar({ value, onChange, placeholder = 'Поиск (AND/OR)' }) {
  return (
    <input
      type="text"
      className="tree-panel-search"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

export default SearchBar;


