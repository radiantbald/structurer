# Инструкция по установке и запуску

## Требования

- Go 1.21 или выше
- Node.js 16 или выше
- PostgreSQL 12 или выше

## Установка

### 1. База данных

Создайте базу данных PostgreSQL:

```bash
createdb position_management
```

Или через psql:

```sql
CREATE DATABASE position_management;
```

Выполните миграции:

```bash
psql -d position_management -f database/migrations/001_initial_schema.sql
```

### 2. Backend

Перейдите в директорию backend:

```bash
cd backend
```

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Отредактируйте `.env` с вашими настройками базы данных:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=position_management
DB_SSLMODE=disable

SERVER_PORT=8080
```

Установите зависимости:

```bash
go mod download
```

Запустите сервер:

```bash
go run main.go
```

Сервер будет доступен на `http://localhost:8080`

### 3. Frontend

Откройте новый терминал и перейдите в директорию frontend:

```bash
cd frontend
```

Установите зависимости:

```bash
npm install
```

Запустите приложение:

```bash
npm start
```

Приложение будет доступно на `http://localhost:3000`

## Использование

1. Откройте браузер и перейдите на `http://localhost:3000`
2. По умолчанию будет показан plain-список должностей
3. Создайте кастомные поля через API или напрямую в БД
4. Создайте новое дерево через API или напрямую в БД
5. Выберите дерево из выпадающего списка для просмотра иерархии

## API Endpoints

### Positions
- `GET /api/positions` - список должностей
- `GET /api/positions/{id}` - получить должность
- `POST /api/positions` - создать должность
- `PUT /api/positions/{id}` - обновить должность
- `DELETE /api/positions/{id}` - удалить должность

### Custom Fields
- `GET /api/custom-fields` - список кастомных полей
- `POST /api/custom-fields` - создать кастомное поле
- `PUT /api/custom-fields/{id}` - обновить кастомное поле
- `DELETE /api/custom-fields/{id}` - удалить кастомное поле

### Trees
- `GET /api/trees` - список деревьев
- `GET /api/trees/{id}` - получить дерево
- `GET /api/trees/{id}/structure` - получить структуру дерева
- `POST /api/trees` - создать дерево
- `PUT /api/trees/{id}` - обновить дерево
- `DELETE /api/trees/{id}` - удалить дерево


