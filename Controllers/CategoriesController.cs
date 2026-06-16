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
    public class CategoriesController : ControllerBase
    {
        private readonly TodoContext _context;

        public CategoriesController(TodoContext context)
        {
            _context = context;
        }

        private string GetUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        }

        // GET: api/Categories
        [HttpGet]
        public async Task<ActionResult<IEnumerable<ItemCategory>>> GetCategories()
        {
            var userId = GetUserId();
            return await _context.ItemCategories
                .Where(c => c.UserId == userId)
                .ToListAsync();
        }

        // GET: api/Categories/5
        [HttpGet("{id}")]
        public async Task<ActionResult<ItemCategory>> GetCategory(int id)
        {
            var userId = GetUserId();
            var category = await _context.ItemCategories
                .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена или принадлежит другому пользователю." });
            }

            return category;
        }

        // POST: api/Categories
        [HttpPost]
        public async Task<ActionResult<ItemCategory>> PostCategory(ItemCategory category)
        {
            var userId = GetUserId();
            category.UserId = userId;
            category.Id = 0; // Ensure EF generates a new ID

            _context.ItemCategories.Add(category);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetCategory), new { id = category.Id }, category);
        }

        // PUT: api/Categories/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutCategory(int id, ItemCategory category)
        {
            if (id != category.Id)
            {
                return BadRequest(new { message = "ID в запросе и в объекте не совпадают." });
            }

            var userId = GetUserId();
            var existingCategory = await _context.ItemCategories
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

            if (existingCategory == null)
            {
                return NotFound(new { message = "Категория не найдена." });
            }

            category.UserId = userId; // Force preserve ownership
            _context.Entry(category).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!CategoryExists(id, userId))
                {
                    return NotFound();
                }
                throw;
            }

            return NoContent();
        }

        // DELETE: api/Categories/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            var userId = GetUserId();
            var category = await _context.ItemCategories
                .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена или нет прав для удаления." });
            }

            _context.ItemCategories.Remove(category);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private bool CategoryExists(int id, string userId)
        {
            return _context.ItemCategories.Any(e => e.Id == id && e.UserId == userId);
        }
    }
}
