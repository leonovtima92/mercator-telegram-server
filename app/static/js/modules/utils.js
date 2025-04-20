import { chatId, messageId } from "../post.js"; // Импорт, если нужен

// Show a toast notification
export function showToast(message, type = "success") {
  // Проверяем, существует ли контейнер для тостов
  let toastContainer = document.querySelector(".toast-container");

  // Если контейнера нет, создаем его
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }

  // Создаем новый тост
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Добавляем иконку в зависимости от типа
  let icon = "";
  switch (type) {
    case "success":
      icon = '<i class="fa-solid fa-check-circle"></i>';
      break;
    case "error":
      icon = '<i class="fa-solid fa-times-circle"></i>';
      break;
    case "info":
      icon = '<i class="fa-solid fa-info-circle"></i>';
      break;
    default:
      icon = '<i class="fa-solid fa-bell"></i>';
  }

  // Заполняем содержимое тоста
  toast.innerHTML = `${icon} <span>${message}</span>`;

  // Добавляем тост в контейнер
  toastContainer.appendChild(toast);

  // Удаляем тост через 3 секунды
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      toast.remove();
      // Если все тосты удалены, удаляем контейнер
      if (toastContainer.children.length === 0) {
        toastContainer.remove();
      }
    }, 300);
  }, 3000);
}

// Функция для получения пути к узлу DOM
export function getNodePath(node) {
  const path = [];
  let current = node;

  // Поднимаемся вверх по дереву DOM до текстового блока
  const textBlock = document.querySelector(".text-block");

  while (current && current !== textBlock && current.parentNode) {
    const parent = current.parentNode;
    const children = Array.from(parent.childNodes);
    const index = children.indexOf(current);

    path.unshift({
      index: index,
      tagName: current.nodeType === 1 ? current.tagName.toLowerCase() : "text",
      className: current.className || "",
    });

    current = parent;
  }

  return path;
}
