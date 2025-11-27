import React, { useState, useRef, useEffect } from 'react';
import './ResizableSplitter.css';

const STORAGE_KEY = 'resizable-splitter-left-width';

function ResizableSplitter({ leftPanel, rightPanel, defaultLeftWidth = null, minLeftWidth = 300, minRightWidth = 400 }) {
  // Инициализируем state с сохраненным значением или null
  const [leftWidth, setLeftWidth] = useState(() => {
    const savedWidth = localStorage.getItem(STORAGE_KEY);
    return savedWidth ? parseInt(savedWidth, 10) : defaultLeftWidth;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);
  const splitterRef = useRef(null);
  const isInitialized = useRef(false);

  // Инициализируем ширину при монтировании, если она еще не установлена
  useEffect(() => {
    if (containerRef.current && !isInitialized.current) {
      let initialLeftWidth = leftWidth;
      
      if (initialLeftWidth === null || initialLeftWidth <= 0) {
        // Вычисляем начальную ширину
        const containerWidth = containerRef.current.offsetWidth;
        initialLeftWidth = containerWidth - 600; // 600px для правой панели по умолчанию
      }
      
      // Применяем ограничения
      const containerWidth = containerRef.current.offsetWidth;
      const constrainedWidth = Math.max(
        minLeftWidth,
        Math.min(initialLeftWidth, containerWidth - minRightWidth)
      );
      
      setLeftWidth(constrainedWidth);
      isInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сохраняем ширину в localStorage при изменении
  useEffect(() => {
    if (leftWidth !== null) {
      localStorage.setItem(STORAGE_KEY, leftWidth.toString());
    }
  }, [leftWidth]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const newLeftWidth = e.clientX - containerRect.left;

      // Ограничиваем минимальную и максимальную ширину
      const constrainedWidth = Math.max(
        minLeftWidth,
        Math.min(newLeftWidth, containerWidth - minRightWidth)
      );

      setLeftWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minLeftWidth, minRightWidth]);

  return (
    <div className="resizable-container" ref={containerRef}>
      <div
        className="resizable-panel resizable-panel-left"
        style={{ width: leftWidth !== null ? `${leftWidth}px` : undefined }}
      >
        {leftPanel}
      </div>
      <div
        className={`resizable-splitter ${isResizing ? 'resizing' : ''}`}
        ref={splitterRef}
        onMouseDown={handleMouseDown}
      >
        <div className="resizable-splitter-handle" />
      </div>
      <div className="resizable-panel resizable-panel-right">
        {rightPanel}
      </div>
    </div>
  );
}

export default ResizableSplitter;

