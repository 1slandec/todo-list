using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace TodoListApp.Models
{
    public class TodoContext : IdentityDbContext<IdentityUser>
    {
        public TodoContext(DbContextOptions<TodoContext> options) : base(options)
        {
            Database.EnsureCreated();
        }

        public DbSet<TodoItem> TodoItems { get; set; } = null!;
        public DbSet<ItemCategory> ItemCategories { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            // Configure O2M (Category -> TodoItems) with Restrict/Nullable FK
            builder.Entity<TodoItem>()
                .HasOne(t => t.Category)
                .WithMany(c => c.TodoItems)
                .HasForeignKey(t => t.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);
        }
    }
}
