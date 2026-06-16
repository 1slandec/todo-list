/**
 * ToDo List SPA - Клиентская логика (Vanilla Javascript)
 * Полная интеграция с C# ASP.NET Core 8 Web API & Identity
 */

const API_ITEMS_URL = '/api/TodoItems';
const API_CATEGORIES_URL = '/api/Categories';
const API_REGISTER_URL = '/register';
const API_LOGIN_URL = '/login';

// Глобальное состояние приложения
let allTasks = [];
let allCategories = [];
let activeStatusFilter = 'all'; // 'all', 'pending', 'completed'
let activeCategoryFilterId = 'all'; // 'all' или ID конкретной категории

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
});

// Проверка авторизации
function checkAuthentication() {
    const token = localStorage.getItem('accessToken');
    const userEmail = localStorage.getItem('userEmail');

    if (token && userEmail) {
        // Пользователь вошел в систему
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');
        document.getElementById('current-user-display').textContent = userEmail;
        
        // Загружаем данные пользователя
        loadDashboardData();
    } else {
        // Пользователь не авторизован
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('dashboard-section').classList.add('hidden');
    }
}

// Загрузка всех данных для дашборда
async function loadDashboardData() {
    await getCategories(); // Сначала категории, чтобы правильно сопоставить задачи
    await getItems();
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Переключение экранов Вход / Регистрация
    document.getElementById('switch-to-register').addEventListener('click', () => {
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('register-container').classList.remove('hidden');
    });

    document.getElementById('switch-to-login').addEventListener('click', () => {
        document.getElementById('register-container').classList.add('hidden');
        document.getElementById('login-container').classList.remove('remove');
        document.getElementById('login-container').classList.remove('hidden');
    });

    // Форма входа
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btnText = document.getElementById('login-btn-text');

        btnText.innerHTML = '<span class="spinner"></span> Вход...';
        
        try {
            const response = await fetch(API_LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('userEmail', email);
                showToast('Успешный вход!', 'success');
                checkAuthentication();
            } else {
                const errData = await response.json().catch(() => ({}));
                const message = errData.message || 'Неверный адрес почты или пароль';
                showToast(message, 'error');
            }
        } catch (error) {
            showToast('Ошибка подключения к серверу авторизации', 'error');
            console.error(error);
        } finally {
            btnText.innerHTML = 'Войти';
        }
    });

    // Форма регистрации
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const btnText = document.getElementById('register-btn-text');

        if (password !== confirmPassword) {
            showToast('Пароли не совпадают!', 'error');
            return;
        }

        btnText.innerHTML = '<span class="spinner"></span> Регистрация...';

        try {
            const response = await fetch(API_REGISTER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                showToast('Регистрация успешна! Войдите.', 'success');
                // Переключаем на вход
                document.getElementById('register-container').classList.add('hidden');
                document.getElementById('login-container').classList.remove('hidden');
                document.getElementById('login-email').value = email;
                document.getElementById('login-password').value = password;
            } else {
                const errData = await response.json().catch(() => ({}));
                let errorMsg = 'Ошибка регистрации';
                if (errData.errors) {
                    const keys = Object.keys(errData.errors);
                    if (keys.length > 0) {
                        errorMsg = errData.errors[keys[0]][0];
                    }
                }
                showToast(errorMsg, 'error');
            }
        } catch (error) {
            showToast('Ошибка подключения к серверу авторизации', 'error');
            console.error(error);
        } finally {
            btnText.innerHTML = 'Зарегистрироваться';
        }
    });

    // Кнопка Выход
    document.getElementById('logout-button').addEventListener('click', () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('userEmail');
        allTasks = [];
        allCategories = [];
        showToast('Вы вышли из учетной записи', 'info');
        checkAuthentication();
    });

    // Форма создания категории
    document.getElementById('create-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('new-category-title');
        const title = titleInput.value.trim();
        if (!title) return;

        await addCategory(title);
        titleInput.value = '';
    });

    // Форма создания задачи Todo
    document.getElementById('create-todo-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('new-todo-name');
        const categorySelect = document.getElementById('new-todo-category');
        
        const name = nameInput.value.trim();
        const categoryId = categorySelect.value ? parseInt(categorySelect.value) : null;

        if (!name) return;

        await addItem(name, categoryId);
        nameInput.value = '';
        categorySelect.value = '';
    });

    // Обработчик фильтров по статусу выполнения
    document.getElementById('status-filter-row').addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-tab')) {
            // Убираем активный класс у всех
            document.querySelectorAll('#status-filter-row .filter-tab').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            activeStatusFilter = e.target.getAttribute('data-status');
            applyFiltersAndRender();
        }
    });

    // Обработчик динамических фильтров по категориям
    document.getElementById('category-filter-row').addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-tab')) {
            document.querySelectorAll('#category-filter-row .filter-tab').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            activeCategoryFilterId = e.target.getAttribute('data-category-id');
            applyFiltersAndRender();
        }
    });

    // Закрытие модального окна редактирования
    document.getElementById('close-modal-button').addEventListener('click', closeModal);
    document.getElementById('edit-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('edit-modal-overlay')) {
            closeModal();
        }
    });

    // Форма сохранения редактирования задачи
    document.getElementById('edit-todo-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateItem();
    });
}

// Получение заголовков со встроенным JWT
function getAuthHeaders() {
    const token = localStorage.getItem('accessToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}


/* ==========================================================================
   CRUD: ЗАДАЧИ (TODO ITEMS)
   ========================================================================== */

// GET: Получение задач
async function getItems() {
    try {
        const response = await fetch(API_ITEMS_URL, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            allTasks = await response.json();
            _displayCount(allTasks.length);
            applyFiltersAndRender();
        } else {
            showToast('Не удалось загрузить задачи', 'error');
        }
    } catch (error) {
        showToast('Ошибка загрузки задач', 'error');
        console.error(error);
    }
}

// POST: Добавление задачи
async function addItem(name, categoryId) {
    const payload = {
        name: name,
        isComplete: false,
        categoryId: categoryId
    };

    try {
        const response = await fetch(API_ITEMS_URL, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            const newItem = await response.json();
            allTasks.push(newItem);
            _displayCount(allTasks.length);
            applyFiltersAndRender();
            showToast('Задача успешно добавлена!', 'success');
        } else {
            const errData = await response.json().catch(() => ({}));
            showToast(errData.message || 'Ошибка добавления задачи', 'error');
        }
    } catch (error) {
        showToast('Ошибка сохранения задачи', 'error');
        console.error(error);
    }
}

// DELETE: Удаление задачи
async function deleteItem(id) {
    if (!confirm('Вы действительно хотите удалить эту задачу?')) return;

    try {
        const response = await fetch(`${API_ITEMS_URL}/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            allTasks = allTasks.filter(item => item.id !== id);
            _displayCount(allTasks.length);
            applyFiltersAndRender();
            showToast('Задача успешно удалена', 'success');
        } else {
            showToast('Ошибка удаления задачи', 'error');
        }
    } catch (error) {
        showToast('Серверная ошибка удаления', 'error');
        console.error(error);
    }
}

// Быстрый переключатель IsComplete прямо из списка задач
async function toggleItemCompletion(id, isChecked) {
    const task = allTasks.find(item => item.id === id);
    if (!task) return;

    const payload = {
        id: task.id,
        name: task.name,
        isComplete: isChecked,
        categoryId: task.categoryId,
        userId: task.userId
    };

    try {
        const response = await fetch(`${API_ITEMS_URL}/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            task.isComplete = isChecked;
            _displayCount(allTasks.length);
            applyFiltersAndRender();
            showToast(isChecked ? 'Задача выполнена!' : 'Задача возобновлена', 'info');
        } else {
            showToast('Не удалось обновить статус задачи', 'error');
            // Возвращаем галочку назад на фронте
            applyFiltersAndRender();
        }
    } catch (error) {
        showToast('Ошибка сети при обновлении задачи', 'error');
        applyFiltersAndRender();
    }
}

// Открытие формы редактирования задачи (загрузка данных в модал)
async function displayEditForm(id) {
    try {
        const response = await fetch(`${API_ITEMS_URL}/${id}`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            const item = await response.json();
            
            document.getElementById('edit-todo-id').value = item.id;
            document.getElementById('edit-todo-userId').value = item.userId || '';
            document.getElementById('edit-todo-name').value = item.name;
            document.getElementById('edit-todo-status').checked = item.isComplete;
            document.getElementById('edit-todo-category').value = item.categoryId || '';

            // Отображаем оверлей
            document.getElementById('edit-modal-overlay').style.display = 'flex';
        } else {
            showToast('Не удалось получить подробности задачи', 'error');
        }
    } catch (error) {
        showToast('Ошибка загрузки модального окна', 'error');
        console.error(error);
    }
}

// PUT: Сохранение редактирования из модала
async function updateItem() {
    const id = parseInt(document.getElementById('edit-todo-id').value);
    const userId = document.getElementById('edit-todo-userId').value;
    const name = document.getElementById('edit-todo-name').value.trim();
    const isComplete = document.getElementById('edit-todo-status').checked;
    const catVal = document.getElementById('edit-todo-category').value;
    const categoryId = catVal ? parseInt(catVal) : null;

    if (!name) return;

    const payload = {
        id: id,
        name: name,
        isComplete: isComplete,
        categoryId: categoryId,
        userId: userId
    };

    try {
        const response = await fetch(`${API_ITEMS_URL}/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            // Обновляем локальный массив данных
            const index = allTasks.findIndex(item => item.id === id);
            if (index !== -1) {
                allTasks[index] = {
                    ...allTasks[index],
                    name: name,
                    isComplete: isComplete,
                    categoryId: categoryId,
                    category: categoryId ? allCategories.find(c => c.id === categoryId) : null
                };
            }
            
            closeModal();
            _displayCount(allTasks.length);
            applyFiltersAndRender();
            showToast('Задача обновлена!', 'success');
        } else {
            const errData = await response.json().catch(() => ({}));
            showToast(errData.message || 'Ошибка обновления задачи', 'error');
        }
    } catch (error) {
        showToast('Не удалось сохранить изменения', 'error');
        console.error(error);
    }
}

function closeModal() {
    document.getElementById('edit-modal-overlay').style.display = 'none';
}


/* ==========================================================================
   CRUD: КАТЕГОРИИ (ITEM CATEGORIES)
   ========================================================================== */

// GET: Получение категорий
async function getCategories() {
    try {
        const response = await fetch(API_CATEGORIES_URL, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            allCategories = await response.json();
            _renderCategoriesUI();
        }
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

// POST: Добавление категории
async function addCategory(title) {
    const payload = { title: title };

    try {
        const response = await fetch(API_CATEGORIES_URL, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            const newCategory = await response.json();
            allCategories.push(newCategory);
            _renderCategoriesUI();
            showToast('Категория успешно добавлена!', 'success');
        } else {
            showToast('Ошибка при добавлении категории', 'error');
        }
    } catch (error) {
        showToast('Не удалось соединиться с сервером', 'error');
        console.error(error);
    }
}

// DELETE: Удаление категории
async function deleteCategory(id) {
    if (!confirm('Вы действительно хотите удалить эту категорию? Связанные задачи останутся без категории.')) return;

    try {
        const response = await fetch(`${API_CATEGORIES_URL}/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            forceLogout();
            return;
        }

        if (response.ok) {
            allCategories = allCategories.filter(cat => cat.id !== id);
            
            // Локально убираем удаленную категорию у всех задач, у которых она была прикреплена
            allTasks = allTasks.map(task => {
                if (task.categoryId === id) {
                    return { ...task, categoryId: null, category: null };
                }
                return task;
            });

            // Если удалили категорию, которая сейчас в фильтре, сбрасываем фильтр на "Все"
            if (activeCategoryFilterId == id) {
                activeCategoryFilterId = 'all';
            }

            _renderCategoriesUI();
            _displayCount(allTasks.length);
            applyFiltersAndRender();
            showToast('Категория удалена', 'success');
        } else {
            showToast('Ошибка удаления категории', 'error');
        }
    } catch (error) {
        showToast('Серверная ошибка удаления категории', 'error');
        console.error(error);
    }
}


/* ==========================================================================
   ОТОБРАЖЕНИЕ И ФИЛЬТРАЦИЯ (UI RENDERING & FILTERS)
   ========================================================================== */

// Функция подсчета счетчиков задач и статистика
function _displayCount(itemCount) {
    const totalCount = allTasks.length;
    const completedCount = allTasks.filter(t => t.isComplete).length;
    const pendingCount = totalCount - completedCount;

    // Заполнение плашки статистики
    document.getElementById('stats-total-count').textContent = totalCount;
    document.getElementById('stats-completed-count').textContent = completedCount;
    document.getElementById('stats-pending-count').textContent = pendingCount;

    // Текст над списком дел
    const countBadge = document.getElementById('tasks-count-badge');
    countBadge.textContent = `Задач отфильтровано: ${itemCount} из ${totalCount}`;
}

// Рендеринг интерфейса категорий (боковое меню, выпадающие списки, пилюли фильтрации)
function _renderCategoriesUI() {
    // 1. Боковая панель
    const catContainer = document.getElementById('category-items-container');
    catContainer.innerHTML = '';

    if (allCategories.length === 0) {
        catContainer.innerHTML = '<div class="empty-state" style="padding: 1rem; font-size: 0.85rem;">Категории отсутствуют</div>';
    } else {
        allCategories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'category-badge-item';
            div.innerHTML = `
                <span class="category-name-span">
                    <span class="category-dot"></span>
                    <strong>${escapeHTML(cat.title)}</strong>
                </span>
                <button class="btn-icon-delete" onclick="deleteCategory(${cat.id})" title="Удалить категорию">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            `;
            catContainer.appendChild(div);
        });
    }

    // 2. Выпадающие списки (В основной форме создания задачи и в модале редактирования)
    const newSelect = document.getElementById('new-todo-category');
    const editSelect = document.getElementById('edit-todo-category');

    // Сохраняем выбранные значения на момент обновления списков
    const prevNewVal = newSelect.value;
    const prevEditVal = editSelect.value;

    const optionsHTML = `
        <option value="">Без категории</option>
        ${allCategories.map(cat => `<option value="${cat.id}">${escapeHTML(cat.title)}</option>`).join('')}
    `;

    newSelect.innerHTML = optionsHTML;
    editSelect.innerHTML = optionsHTML;

    // Восстанавливаем выбранные значения
    newSelect.value = prevNewVal;
    editSelect.value = prevEditVal;

    // 3. Динамические пилюли категорий в блоке фильтрации
    const catFiltersContainer = document.getElementById('category-filter-row');
    
    // Оставляем только первый тег "Все"
    catFiltersContainer.innerHTML = `<button class="filter-tab ${activeCategoryFilterId === 'all' ? 'active' : ''}" data-category-id="all">Все</button>`;
    
    allCategories.forEach(cat => {
        const button = document.createElement('button');
        button.className = `filter-tab ${activeCategoryFilterId == cat.id ? 'active' : ''}`;
        button.setAttribute('data-category-id', cat.id);
        button.textContent = cat.title;
        catFiltersContainer.appendChild(button);
    });
}

// Применение фильтрации и запуск рендеринга задач
function applyFiltersAndRender() {
    let filtered = [...allTasks];

    // Фильтрация по статусу выполнения
    if (activeStatusFilter === 'pending') {
        filtered = filtered.filter(t => !t.isComplete);
    } else if (activeStatusFilter === 'completed') {
        filtered = filtered.filter(t => t.isComplete);
    }

    // Фильтрация по выбранной категории
    if (activeCategoryFilterId !== 'all') {
        const catId = parseInt(activeCategoryFilterId);
        filtered = filtered.filter(t => t.categoryId === catId);
    }

    _displayItems(filtered);
}

// Рендеринг задач во внутренний DOM-контейнер
function _displayItems(data) {
    const listContainer = document.getElementById('todo-items-container');
    listContainer.innerHTML = '';

    if (data.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
                <p>Нет задач, соответствующих заданным фильтрам</p>
            </div>
        `;
        _displayCount(0);
        return;
    }

    _displayCount(data.length);

    data.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = `todo-item ${item.isComplete ? 'completed' : ''}`;

        // Находим категорию для отображения плашки
        let categoryTagHTML = '';
        if (item.categoryId) {
            const cat = allCategories.find(c => c.id === item.categoryId);
            if (cat) {
                categoryTagHTML = `<span class="tag-badge">${escapeHTML(cat.title)}</span>`;
            } else if (item.category) {
                categoryTagHTML = `<span class="tag-badge">${escapeHTML(item.category.title)}</span>`;
            }
        } else {
            categoryTagHTML = `<span class="tag-badge uncategorized">Без категории</span>`;
        }

        itemElement.innerHTML = `
            <div class="todo-lhs">
                <label class="checkbox-container">
                    <input type="checkbox" ${item.isComplete ? 'checked' : ''} onchange="toggleItemCompletion(${item.id}, this.checked)">
                    <span class="checkmark"></span>
                </label>
                <div class="todo-content-box">
                    <span class="todo-item-title">${escapeHTML(item.name)}</span>
                    ${categoryTagHTML}
                </div>
            </div>
            
            <div class="todo-actions-panel">
                <button class="btn-icon-edit" onclick="displayEditForm(${item.id})" title="Редактировать">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="btn-icon-delete" onclick="deleteItem(${item.id})" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            </div>
        `;

        listContainer.appendChild(itemElement);
    });
}


/* ==========================================================================
   Вспомогательные утилиты (HELPERS & TOASTS)
   ========================================================================== */

// Безопасный эскейп строк для вывода в HTML во избежание XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Отображение всплывающего уведомления
function showToast(message, type = 'info') {
    const toastWrapper = document.getElementById('toast-wrapper');
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    // Цветовая гамма плашки по её роли
    if (type === 'success') {
        toast.style.borderLeft = '4px solid var(--success)';
        toast.style.borderColor = 'var(--success)';
    } else if (type === 'error') {
        toast.style.borderLeft = '4px solid var(--danger)';
        toast.style.borderColor = 'var(--danger)';
    } else {
        toast.style.borderLeft = '4px solid var(--primary)';
        toast.style.borderColor = 'var(--primary)';
    }

    toast.textContent = message;
    toastWrapper.appendChild(toast);

    // Удаляем по истечении 3 секунд
    setTimeout(() => {
        toast.style.animation = 'toast-fade 0.3s ease reverse';
        setTimeout(() => toast.remove(), 280);
    }, 3000);
}

// Принудительный сброс сессии по истечению токена (401 Unauthorized)
function forceLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userEmail');
    showToast('Сессия авторизации истекла. Пожалуйста, зайдите снова.', 'error');
    checkAuthentication();
}
