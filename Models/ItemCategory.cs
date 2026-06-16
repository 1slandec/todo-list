using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TodoListApp.Models
{
    public class ItemCategory
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;

        [JsonIgnore]
        public ICollection<TodoItem> TodoItems { get; set; } = new List<TodoItem>();
    }
}
