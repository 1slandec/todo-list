import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

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

// Загрузка начальной базы данных с демо-данными
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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
  app.post("/register", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ 
        errors: { 
          Email: ["Почта и пароль обязательны к заполнению."] 
        } 
      });
    }

    const db = loadDB();
    const exists = db.users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return res.status(400).json({ 
        errors: { 
          Email: ["Пользователь с такой электронной почтой уже существует."] 
        } 
      });
    }

    db.users.push({ email, password });
    saveDB(db);

    return res.status(200).json({ message: "Регистрация успешна!" });
  });

  // POST: /login
  app.post("/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Укажите почту и пароль." });
    }

    const db = loadDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (!user) {
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
  });


  /* ==========================================================================
     CRUD: CATEGORIES (МЕНЕДЖЕР КАТЕГОРИЙ)
     ========================================================================== */

  // GET: /api/Categories
  app.get("/api/Categories", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const db = loadDB();
    const userCategories = db.categories.filter(c => c.userId === userId);
    return res.json(userCategories);
  });

  // GET: /api/Categories/:id
  app.get("/api/Categories/:id", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const id = parseInt(req.params.id);
    const db = loadDB();
    const category = db.categories.find(c => c.id === id && c.userId === userId);

    if (!category) {
      return res.status(404).json({ message: "Категория не найдена." });
    }

    return res.json(category);
  });

  // POST: /api/Categories
  app.post("/api/Categories", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ message: "Укажите название категории." });
    }

    const db = loadDB();
    const newId = db.categories.length > 0 ? Math.max(...db.categories.map(c => c.id)) + 1 : 1;
    
    const newCategory: Category = {
      id: newId,
      title,
      userId
    };

    db.categories.push(newCategory);
    saveDB(db);

    return res.status(201).json(newCategory);
  });

  // PUT: /api/Categories/:id
  app.put("/api/Categories/:id", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const id = parseInt(req.params.id);
    const { title } = req.body;

    const db = loadDB();
    const index = db.categories.findIndex(c => c.id === id && c.userId === userId);
    if (index === -1) {
      return res.status(404).json({ message: "Категория не найдена." });
    }

    db.categories[index].title = title || db.categories[index].title;
    saveDB(db);

    return res.status(204).send();
  });

  // DELETE: /api/Categories/:id
  app.delete("/api/Categories/:id", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const id = parseInt(req.params.id);
    const db = loadDB();
    
    const index = db.categories.findIndex(c => c.id === id && c.userId === userId);
    if (index === -1) {
      return res.status(404).json({ message: "Категория не найдена." });
    }

    db.categories.splice(index, 1);
    
    // Задачи, привязанные к удаленной категории, переводятся в "Без категории"
    db.todoItems = db.todoItems.map(item => {
      if (item.categoryId === id && item.userId === userId) {
        return { ...item, categoryId: null };
      }
      return item;
    });

    saveDB(db);
    return res.status(204).send();
  });


  /* ==========================================================================
     CRUD: TODOITEMS (ЗАДАЧИ ПОЛЬЗОВАТЕЛЯ)
     ========================================================================== */

  // GET: /api/TodoItems
  app.get("/api/TodoItems", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const db = loadDB();
    const userItems = db.todoItems.filter(item => item.userId === userId);
    
    // Подгружаем навигационное свойство "category", как делает .Include(t=>t.Category) в C# EF Core
    const populatedItems = userItems.map(item => {
      const category = item.categoryId ? db.categories.find(c => c.id === item.categoryId) : null;
      return {
        ...item,
        category: category || null
      };
    });

    return res.json(populatedItems);
  });

  // GET: /api/TodoItems/:id
  app.get("/api/TodoItems/:id", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const id = parseInt(req.params.id);
    const db = loadDB();
    const item = db.todoItems.find(t => t.id === id && t.userId === userId);

    if (!item) {
      return res.status(404).json({ message: "Задача не найдена." });
    }

    const category = item.categoryId ? db.categories.find(c => c.id === item.categoryId) : null;
    return res.json({
      ...item,
      category: category || null
    });
  });

  // POST: /api/TodoItems
  app.post("/api/TodoItems", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const { name, isComplete, categoryId } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Наименование задачи обязательно." });
    }

    const db = loadDB();

    // Проверяем принадлежность категории, если передана
    if (categoryId) {
      const catExists = db.categories.some(c => c.id === categoryId && c.userId === userId);
      if (!catExists) {
        return res.status(400).json({ message: "Привязываемая категория не существует или создана другим пользователем." });
      }
    }

    const newId = db.todoItems.length > 0 ? Math.max(...db.todoItems.map(i => i.id)) + 1 : 1;
    const newItem: TodoItem = {
      id: newId,
      name,
      isComplete: !!isComplete,
      categoryId: categoryId ? parseInt(categoryId) : null,
      userId
    };

    db.todoItems.push(newItem);
    saveDB(db);

    const category = newItem.categoryId ? db.categories.find(c => c.id === newItem.categoryId) : null;
    return res.status(201).json({
      ...newItem,
      category: category || null
    });
  });

  // PUT: /api/TodoItems/:id
  app.put("/api/TodoItems/:id", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const id = parseInt(req.params.id);
    const { name, isComplete, categoryId } = req.body;

    const db = loadDB();
    const index = db.todoItems.findIndex(t => t.id === id && t.userId === userId);
    
    if (index === -1) {
      return res.status(404).json({ message: "Задача не найдена." });
    }

    // Проверяем категорию если меняется
    if (categoryId) {
      const catExists = db.categories.some(c => c.id === categoryId && c.userId === userId);
      if (!catExists) {
        return res.status(400).json({ message: "Указанная категория вам не доступна." });
      }
    }

    db.todoItems[index].name = name !== undefined ? name : db.todoItems[index].name;
    db.todoItems[index].isComplete = isComplete !== undefined ? !!isComplete : db.todoItems[index].isComplete;
    db.todoItems[index].categoryId = categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : db.todoItems[index].categoryId;

    saveDB(db);
    return res.status(204).send();
  });

  // DELETE: /api/TodoItems/:id
  app.delete("/api/TodoItems/:id", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Вы не авторизованы." });
    }

    const id = parseInt(req.params.id);
    const db = loadDB();

    const index = db.todoItems.findIndex(t => t.id === id && t.userId === userId);
    if (index === -1) {
      return res.status(404).json({ message: "Задача не найдена." });
    }

    db.todoItems.splice(index, 1);
    saveDB(db);

    return res.status(204).send();
  });


  /* ==========================================================================
     VITE INTEGRATION / STATIC SPA SERVER FALLBACK
     ========================================================================== */

  if (process.env.NODE_ENV !== "production") {
    // В режиме разработки монтируем Vite
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // В продакшене отдаем сжатые ресурсы из dist/
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
