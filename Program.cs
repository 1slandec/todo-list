using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TodoListApp.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Data Source=todo.db";

builder.Services.AddDbContext<TodoContext>(options =>
    options.UseNpgsql(connectionString));

// Configure Identity Core with Entity Framework stores
builder.Services.AddIdentityApiEndpoints<IdentityUser>()
    .AddEntityFrameworkStores<TodoContext>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

// Enable default files (index.html) and static files (css, js) in wwwroot
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

// Map Identity endpoints under /
app.MapIdentityApi<IdentityUser>();

app.MapControllers();

app.Run();
