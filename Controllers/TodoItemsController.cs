using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TodoListApp.Models;

namespace TodoListApp.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class TodoItemsController : ControllerBase
    {
        private readonly TodoContext _context;

        public TodoItemsController(TodoContext context)
        {
            _context = context;
        }

        private string GetUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        }

        // GET: api/TodoItems
        [HttpGet]
        public async Task<ActionResult<IEnumerable<TodoItem>>> GetTodoItems()
        {
            var userId = GetUserId();
            return await _context.TodoItems
                .Include(t => t.Category)
                .Where(t => t.UserId == userId)
                .ToListAsync();
        }

        // GET: api/TodoItems/5
        [HttpGet("{id}")]
        public async Task<ActionResult<TodoItem>> GetTodoItem(int id)
        {
            var userId = GetUserId();
            var todoItem = await _context.TodoItems
                .Include(t => t.Category)
                .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);

            if (todoItem == null)
            {
                return NotFound(new { message = "Задача не найдена или принадлежит другому пользователю." });
            }

            return todoItem;
        }

        // POST: api/TodoItems
        [HttpPost]
        public async Task<ActionResult<TodoItem>> PostTodoItem(TodoItem todoItem)
        {
            var userId = GetUserId();
            todoItem.UserId = userId;
            todoItem.Id = 0; // Ensure EF generates a new ID
            todoItem.Category = null; // Prevent EF from trying to recreate/update the category object

            // Validate Category ownership if CategoryId is provided
            if (todoItem.CategoryId.HasValue)
            {
                var categoryExists = await _context.ItemCategories
                    .AnyAsync(c => c.Id == todoItem.CategoryId.Value && c.UserId == userId);
                if (!categoryExists)
                {
                    return BadRequest(new { message = "Указанная категория не существует или принадлежит другому пользователю." });
                }
            }

            _context.TodoItems.Add(todoItem);
            await _context.SaveChangesAsync();

            // Load category reference for return payload
            if (todoItem.CategoryId.HasValue)
            {
                await _context.Entry(todoItem).Reference(t => t.Category).LoadAsync();
            }

            return CreatedAtAction(nameof(GetTodoItem), new { id = todoItem.Id }, todoItem);
        }

        // PUT: api/TodoItems/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutTodoItem(int id, TodoItem todoItem)
        {
            if (id != todoItem.Id)
            {
                return BadRequest(new { message = "ID в запросе и в объекте не совпадают." });
            }

            var userId = GetUserId();
            var existingItem = await _context.TodoItems
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);

            if (existingItem == null)
            {
                return NotFound(new { message = "Задача не найдена." });
            }

            // Validate Category ownership if CategoryId is provided
            if (todoItem.CategoryId.HasValue)
            {
                var categoryExists = await _context.ItemCategories
                    .AnyAsync(c => c.Id == todoItem.CategoryId.Value && c.UserId == userId);
                if (!categoryExists)
                {
                    return BadRequest(new { message = "Указанная категория не существует или принадлежит другому пользователю." });
                }
            }

            todoItem.UserId = userId; // Force preserve ownership
            todoItem.Category = null; // Clear navigation property so EF doesn't modify it

            _context.Entry(todoItem).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!TodoItemExists(id, userId))
                {
                    return NotFound();
                }
                throw;
            }

            return NoContent();
        }

        // DELETE: api/TodoItems/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTodoItem(int id)
        {
            var userId = GetUserId();
            var todoItem = await _context.TodoItems
                .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);

            if (todoItem == null)
            {
                return NotFound(new { message = "Задача не найдена или нет прав для удаления." });
            }

            _context.TodoItems.Remove(todoItem);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private bool TodoItemExists(int id, string userId)
        {
            return _context.TodoItems.Any(e => e.Id == id && e.UserId == userId);
        }
    }
}
