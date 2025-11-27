# Position Management System

Веб-приложение для создания и учета должностей с возможностью представления их в виде деревьев.

## Структура проекта

- `backend/` - Go REST API
- `frontend/` - React SPA
- `database/` - SQL миграции

## Технологии

- Backend: Go (Golang) с REST API
- Frontend: React (JavaScript) SPA
- Database: PostgreSQL

## Быстрый старт

Подробные инструкции по установке и запуску см. в [SETUP.md](./SETUP.md)

### Краткая инструкция

1. **База данных**: Создайте PostgreSQL БД и выполните миграции:
   ```bash
   createdb position_management
   psql -d position_management -f database/migrations/001_initial_schema.sql
   # Опционально: примеры данных
   psql -d position_management -f database/migrations/002_sample_data.sql
   ```

2. **Backend**: 
   ```bash
   cd backend
   cp .env.example .env  # Отредактируйте настройки БД
   go mod download
   go run main.go
   ```

3. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Основные возможности

- ✅ Создание и управление должностями
- ✅ Кастомные поля для должностей
- ✅ Гибкое построение деревьев по кастомным полям
- ✅ Plain-список должностей (по умолчанию)
- ✅ Создание должностей из узлов дерева с автозаполнением полей
- ✅ Редактирование и удаление должностей

## API

См. [SETUP.md](./SETUP.md) для списка всех endpoints.

