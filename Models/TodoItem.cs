namespace TodoListApp.Models
{
    public class TodoItem
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsComplete { get; set; }
        public int? CategoryId { get; set; }
        public ItemCategory? Category { get; set; }
        public string UserId { get; set; } = string.Empty;
    }
}
