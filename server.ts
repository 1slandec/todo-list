import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import dotenv from "dotenv";
import dns from "dns";

// Принудительно используем IPv4 вместо IPv6, так как Render не поддерживает исходящий IPv6 трафик по умолчанию
dns.setDefaultResultOrder("ipv4first");

dotenv.config();

interface User {
  email: string;
  password?: string;
}

interface Category {
  id: number;
  title: string;
  userId: string;
}

interface TodoItem {
  id: number;
  name: string;
  isComplete: boolean;
  categoryId: number | null;
  userId: string;
}

interface DB {
  users: User[];
  categories: Category[];
  todoItems: TodoItem[];
}

const DB_FILE = path.join(process.cwd(), "database.json");

// --- LOCAL JSON FILE DATABASE BACKUP ---
function loadDB(): DB {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch (e) {
      console.error("Ошибка чтения JSON базы данных, сброс к значениям по умолчанию", e);
    }
  }

  const defaultDB: DB = {
    users: [
      { email: "admin@example.com", password: "Password123" }
    ],
    categories: [
      { id: 1, title: "Работа", userId: "admin@example.com" },
      { id: 2, title: "Учёба", userId: "admin@example.com" },
      { id: 3, title: "Личное", userId: "admin@example.com" }
    ],
    todoItems: [
      { id: 1, name: "Подготовить отчет по практике", isComplete: false, categoryId: 1, userId: "admin@example.com" },
      { id: 2, name: "Изучить принципы ASP.NET Core Identity", isComplete: true, categoryId: 2, userId: "admin@example.com" },
      { id: 3, name: "Купить продукты к ужину", isComplete: false, categoryId: 3, userId: "admin@example.com" }
    ]
  };

  saveDB(defaultDB);
  return defaultDB;
}

function saveDB(db: DB) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Ошибка сохранения базы данных в файл", e);
  }
}

// --- HYBRID DATABASE CLIENT CONTEXT ---
const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
let pool: pg.Pool | null = null;

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });
  console.log("🚀 [Database] Инициализировано подключение к удаленной БД PostgreSQL/Supabase.");
} else {
  console.log("ℹ️ [Database] DATABASE_URL не задана. Работает локальная файловая БД (database.json).");
}

// Автоматическая инициализация (создание таблиц в Supabase при первом запуске)
async function initDb() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        email VARCHAR(255) PRIMARY KEY,
        password VARCHAR(255) NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS todo_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_complete BOOLEAN DEFAULT FALSE,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        user_id VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE
      );
    `);

    // Наполнение демонстрационными данными, если таблица пользователей пуста
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", ["admin@example.com"]);
    if (userCheck.rows.length === 0) {
      await pool.query("INSERT INTO users (email, password) VALUES ($1, $2)", ["admin@example.com", "Password123"]);
      
      const cat1 = await pool.query("INSERT INTO categories (title, user_id) VALUES ($1, $2) RETURNING id", ["Работа", "admin@example.com"]);
      const cat2 = await pool.query("INSERT INTO categories (title, user_id) VALUES ($1, $2) RETURNING id", ["Учёба", "admin@example.com"]);
      const cat3 = await pool.query("INSERT INTO categories (title, user_id) VALUES ($1, $2) RETURNING id", ["Личное", "admin@example.com"]);
      
      const id1 = cat1.rows[0].id;
      const id2 = cat2.rows[0].id;
      const id3 = cat3.rows[0].id;

      await pool.query("INSERT INTO todo_items (name, is_complete, category_id, user_id) VALUES ($1, $2, $3, $4)", ["Подготовить отчет по практике", false, id1, "admin@example.com"]);
      await pool.query("INSERT INTO todo_items (name, is_complete, category_id, user_id) VALUES ($1, $2, $3, $4)", ["Изучить принципы ASP.NET Core Identity", true, id2, "admin@example.com"]);
      await pool.query("INSERT INTO todo_items (name, is_complete, category_id, user_id) VALUES ($1, $2, $3, $4)", ["Купить продукты к ужину", false, id3, "admin@example.com"]);
      console.log("🌱 [Database] Удаленная БД пуста. Демо-данные успешно импортированы.");
    } else {
      console.log("✅ [Database] Схема удаленной БД успешно проверена.");
    }
  } catch (err) {
    console.error("❌ [Database] Ошибка при инициализации таблиц PostgreSQL:", err);
  }
}

// --- УНИВЕРСАЛЬНЫЕ МЕТОДЫ ДОСТУПА К ДАННЫМ ---

async function findUserByEmail(email: string): Promise<User | null> {
  if (pool) {
    const res = await pool.query("SELECT email, password FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    if (res.rows.length === 0) return null;
    return { email: res.rows[0].email, password: res.rows[0].password };
  } else {
    const db = loadDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user || null;
  }
}

async function createUser(user: User): Promise<void> {
  if (pool) {
    await pool.query("INSERT INTO users (email, password) VALUES ($1, $2)", [user.email, user.password]);
  } else {
    const db = loadDB();
    db.users.push(user);
    saveDB(db);
  }
}

async function getCategories(userId: string): Promise<Category[]> {
  if (pool) {
    const res = await pool.query(
      `SELECT id, title, user_id AS "userId" FROM categories WHERE user_id = $1 ORDER BY id ASC`,
      [userId]
    );
    return res.rows;
  } else {
    const db = loadDB();
    return db.categories.filter(c => c.userId === userId);
  }
}

async function getCategoryById(id: number, userId: string): Promise<Category | null> {
  if (pool) {
    const res = await pool.query(
      `SELECT id, title, user_id AS "userId" FROM categories WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  } else {
    const db = loadDB();
    const category = db.categories.find(c => c.id === id && c.userId === userId);
    return category || null;
  }
}

async function createCategory(title: string, userId: string): Promise<Category> {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO categories (title, user_id) VALUES ($1, $2) RETURNING id, title, user_id AS "userId"`,
      [title, userId]
    );
    return res.rows[0];
  } else {
    const db = loadDB();
    const newId = db.categories.length > 0 ? Math.max(...db.categories.map(c => c.id)) + 1 : 1;
    const newCategory: Category = { id: newId, title, userId };
    db.categories.push(newCategory);
    saveDB(db);
    return newCategory;
  }
}

async function updateCategory(id: number, title: string, userId: string): Promise<boolean> {
  if (pool) {
    const res = await pool.query(
      `UPDATE categories SET title = $1 WHERE id = $2 AND user_id = $3`,
      [title, id, userId]
    );
    return (res.rowCount ?? 0) > 0;
  } else {
    const db = loadDB();
    const index = db.categories.findIndex(c => c.id === id && c.userId === userId);
    if (index === -1) return false;
    db.categories[index].title = title;
    saveDB(db);
    return true;
  }
}

async function deleteCategory(id: number, userId: string): Promise<boolean> {
  if (pool) {
    const res = await pool.query(
      `DELETE FROM categories WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (res.rowCount ?? 0) > 0;
  } else {
    const db = loadDB();
    const index = db.categories.findIndex(c => c.id === id && c.userId === userId);
    if (index === -1) return false;
    db.categories.splice(index, 1);
    db.todoItems = db.todoItems.map(item => {
      if (item.categoryId === id && item.userId === userId) {
        return { ...item, categoryId: null };
      }
      return item;
    });
    saveDB(db);
    return true;
  }
}

async function getTodoItems(userId: string): Promise<(TodoItem & { category: Category | null })[]> {
  if (pool) {
    const res = await pool.query(
      `SELECT t.id, t.name, t.is_complete AS "isComplete", t.category_id AS "categoryId", t.user_id AS "userId",
              c.id AS "catId", c.title AS "catTitle"
       FROM todo_items t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1
       ORDER BY t.id ASC`,
      [userId]
    );
    return res.rows.map(r => ({
      id: r.id,
      name: r.name,
      isComplete: r.isComplete,
      categoryId: r.categoryId,
      userId: r.userId,
      category: r.catId ? { id: r.catId, title: r.catTitle, userId: r.userId } : null
    }));
  } else {
    const db = loadDB();
    const userItems = db.todoItems.filter(item => item.userId === userId);
    return userItems.map(item => {
      const category = item.categoryId ? db.categories.find(c => c.id === item.categoryId) : null;
      return {
        ...item,
        category: category || null
      };
    });
  }
}

async function getTodoItemById(id: number, userId: string): Promise<(TodoItem & { category: Category | null }) | null> {
  if (pool) {
    const res = await pool.query(
      `SELECT t.id, t.name, t.is_complete AS "isComplete", t.category_id AS "categoryId", t.user_id AS "userId",
              c.id AS "catId", c.title AS "catTitle"
       FROM todo_items t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = $1 AND t.user_id = $2`,
      [id, userId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      isComplete: r.isComplete,
      categoryId: r.categoryId,
      userId: r.userId,
      category: r.catId ? { id: r.catId, title: r.catTitle, userId: r.userId } : null
    };
  } else {
    const db = loadDB();
    const item = db.todoItems.find(t => t.id === id && t.userId === userId);
    if (!item) return null;
    const category = item.categoryId ? db.categories.find(c => c.id === item.categoryId) : null;
    return {
      ...item,
      category: category || null
    };
  }
}

async function createTodoItem(name: string, isComplete: boolean, categoryId: number | null, userId: string): Promise<TodoItem & { category: Category | null }> {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO todo_items (name, is_complete, category_id, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, is_complete AS "isComplete", category_id AS "categoryId", user_id AS "userId"`,
      [name, isComplete, categoryId, userId]
    );
    const newItem = res.rows[0];
    const category = newItem.categoryId ? await getCategoryById(newItem.categoryId, userId) : null;
    return {
      ...newItem,
      category
    };
  } else {
    const db = loadDB();
    const newId = db.todoItems.length > 0 ? Math.max(...db.todoItems.map(i => i.id)) + 1 : 1;
    const newItem: TodoItem = {
      id: newId,
      name,
      isComplete: !!isComplete,
      categoryId,
      userId
    };
    db.todoItems.push(newItem);
    saveDB(db);
    const category = newItem.categoryId ? db.categories.find(c => c.id === newItem.categoryId) : null;
    return {
      ...newItem,
      category: category || null
    };
  }
}

async function updateTodoItem(
  id: number,
  userId: string,
  fields: { name?: string; isComplete?: boolean; categoryId?: number | null }
): Promise<boolean> {
  if (pool) {
    const current = await pool.query("SELECT id, name, is_complete, category_id FROM todo_items WHERE id = $1 AND user_id = $2", [id, userId]);
    if (current.rows.length === 0) return false;
    const item = current.rows[0];

    const finalName = fields.name !== undefined ? fields.name : item.name;
    const finalIsComplete = fields.isComplete !== undefined ? fields.isComplete : item.is_complete;
    const finalCategoryId = fields.categoryId !== undefined ? fields.categoryId : item.category_id;

    await pool.query(
      `UPDATE todo_items SET name = $1, is_complete = $2, category_id = $3 WHERE id = $4 AND user_id = $5`,
      [finalName, finalIsComplete, finalCategoryId, id, userId]
    );
    return true;
  } else {
    const db = loadDB();
    const index = db.todoItems.findIndex(t => t.id === id && t.userId === userId);
    if (index === -1) return false;

    if (fields.name !== undefined) db.todoItems[index].name = fields.name;
    if (fields.isComplete !== undefined) db.todoItems[index].isComplete = fields.isComplete;
    if (fields.categoryId !== undefined) db.todoItems[index].categoryId = fields.categoryId;

    saveDB(db);
    return true;
  }
}

async function deleteTodoItem(id: number, userId: string): Promise<boolean> {
  if (pool) {
    const res = await pool.query("DELETE FROM todo_items WHERE id = $1 AND user_id = $2", [id, userId]);
    return (res.rowCount ?? 0) > 0;
  } else {
    const db = loadDB();
    const index = db.todoItems.findIndex(t => t.id === id && t.userId === userId);
    if (index === -1) return false;
    db.todoItems.splice(index, 1);
    saveDB(db);
    return true;
  }
}

// --- EXPRESS APPLICATION STARTUP ---

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Запуск инициализации структуры таблиц БД (если используется удаленный пул)
  await initDb();

  app.use(express.json());

  // Явное развертывание статических ресурсов wwwroot для надежного доступа в SPA
  app.use("/wwwroot", express.static(path.join(process.cwd(), "wwwroot")));

  // Парсинг токена авторизации и извлечение email авторизованного пользователя
  function getUserIdFromRequest(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    const token = authHeader.substring(7);
    if (token.startsWith("mock-jwt-token-for-")) {
      return token.replace("mock-jwt-token-for-", "");
    }
    return token;
  }

  /* ==========================================================================
     IDENTITY (РЕГИСТРАЦИЯ И АВТОРИЗАЦИЯ)
     ========================================================================== */

  // POST: /register
  app.post("/register", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ 
          errors: { 
            Email: ["Почта и пароль обязательны к заполнению."] 
          } 
        });
      }

      const exists = await findUserByEmail(email);
      if (exists) {
        return res.status(400).json({ 
          errors: { 
            Email: ["Пользователь с такой электронной почтой уже существует."] 
          } 
        });
      }

      await createUser({ email, password });
      return res.status(200).json({ message: "Регистрация успешна!" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Внутренняя ошибка сервера при регистрации." });
    }
  });

  // POST: /login
  app.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Укажите почту и пароль." });
      }

      const user = await findUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(400).json({ message: "Неверный логин или пароль!" });
      }

      // Создаем токен-идентификатор
      const accessToken = `mock-jwt-token-for-${user.email}`;

      return res.status(200).json({
        tokenType: "Bearer",
        accessToken: accessToken,
        expiresIn: 3600,
        refreshToken: "mock-refresh-token-code"
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Внутренняя ошибка сервера при авторизации." });
    }
  });

  /* ==========================================================================
     CRUD: CATEGORIES (МЕНЕДЖЕР КАТЕГОРИЙ)
     ========================================================================== */

  // GET: /api/Categories
  app.get("/api/Categories", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const userCategories = await getCategories(userId);
      return res.json(userCategories);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при получении категорий." });
    }
  });

  // GET: /api/Categories/:id
  app.get("/api/Categories/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const id = parseInt(req.params.id);
      const category = await getCategoryById(id, userId);

      if (!category) {
        return res.status(404).json({ message: "Категория не найдена." });
      }

      return res.json(category);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при получении категории." });
    }
  });

  // POST: /api/Categories
  app.post("/api/Categories", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Укажите название категории." });
      }

      const newCategory = await createCategory(title, userId);
      return res.status(201).json(newCategory);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при создании категории." });
    }
  });

  // PUT: /api/Categories/:id
  app.put("/api/Categories/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const id = parseInt(req.params.id);
      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Укажите новое название." });
      }

      const updated = await updateCategory(id, title, userId);
      if (!updated) {
        return res.status(404).json({ message: "Категория не найдена." });
      }

      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при изменении категории." });
    }
  });

  // DELETE: /api/Categories/:id
  app.delete("/api/Categories/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const id = parseInt(req.params.id);
      const deleted = await deleteCategory(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Категория не найдена." });
      }

      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при удалении категории." });
    }
  });

  /* ==========================================================================
     CRUD: TODOITEMS (ЗАДАЧИ ПОЛЬЗОВАТЕЛЯ)
     ========================================================================== */

  // GET: /api/TodoItems
  app.get("/api/TodoItems", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const populatedItems = await getTodoItems(userId);
      return res.json(populatedItems);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при получении списка задач." });
    }
  });

  // GET: /api/TodoItems/:id
  app.get("/api/TodoItems/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const id = parseInt(req.params.id);
      const item = await getTodoItemById(id, userId);

      if (!item) {
        return res.status(404).json({ message: "Задача не найдена." });
      }

      return res.json(item);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при получении задачи." });
    }
  });

  // POST: /api/TodoItems
  app.post("/api/TodoItems", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const { name, isComplete, categoryId } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Наименование задачи обязательно." });
      }

      // Проверяем принадлежность категории, если передана
      let targetCategoryId: number | null = null;
      if (categoryId) {
        targetCategoryId = parseInt(categoryId);
        const catExists = await getCategoryById(targetCategoryId, userId);
        if (!catExists) {
          return res.status(400).json({ message: "Привязываемая категория не существует или создана другим пользователем." });
        }
      }

      const populatedItem = await createTodoItem(name, !!isComplete, targetCategoryId, userId);
      return res.status(201).json(populatedItem);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при создании задачи." });
    }
  });

  // PUT: /api/TodoItems/:id
  app.put("/api/TodoItems/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const id = parseInt(req.params.id);
      const { name, isComplete, categoryId } = req.body;

      // Проверяем категорию если меняется
      let targetCategoryId: number | null | undefined = undefined;
      if (categoryId !== undefined) {
        if (categoryId) {
          targetCategoryId = parseInt(categoryId);
          const catExists = await getCategoryById(targetCategoryId, userId);
          if (!catExists) {
            return res.status(400).json({ message: "Указанная категория вам не доступна." });
          }
        } else {
          targetCategoryId = null;
        }
      }

      const updated = await updateTodoItem(id, userId, {
        name,
        isComplete: isComplete !== undefined ? !!isComplete : undefined,
        categoryId: targetCategoryId
      });

      if (!updated) {
        return res.status(404).json({ message: "Задача не найдена." });
      }

      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при изменении задачи." });
    }
  });

  // DELETE: /api/TodoItems/:id
  app.delete("/api/TodoItems/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Вы не авторизованы." });
      }

      const id = parseInt(req.params.id);
      const deleted = await deleteTodoItem(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Задача не найдена." });
      }

      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Ошибка при удалении задачи." });
    }
  });

  /* ==========================================================================
     VITE INTEGRATION / STATIC SPA SERVER FALLBACK
     ========================================================================== */

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
