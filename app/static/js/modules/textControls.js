import { showToast, getNodePath } from "./utils.js";
import {
  chatId,
  messageId,
  removedTextFragments, // Управляем через экспорт/импорт
  fontSizePercent, // Читаем напрямую
  setFontSizePercent, // Импортируем новую функцию-сеттер
} from "../post.js"; // Импортируем глобальные переменные

// ----------- Font Size Control -----------
export function initFontSizeControls() {
  const textContainer = document.querySelector(".post-text-content");
  const textBlock = document.querySelector(".text-block");
  const fontSizeDisplay = document.querySelector(".font-size-display");

  if (!textContainer || !fontSizeDisplay || !textBlock) {
    console.warn("Не найдены все элементы для initFontSizeControls");
    return;
  }

  // Устанавливаем начальное значение из импортированной переменной
  textContainer.style.fontSize = `${fontSizePercent}%`; // Читаем напрямую
  fontSizeDisplay.textContent = `${fontSizePercent}%`; // Читаем напрямую

  const fontSizeButtons = document.querySelectorAll(".btn-font-size");

  fontSizeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action");
      console.log(
        `Font size button clicked: action=${action}, currentPercent=${fontSizePercent}`
      );
      let newFontSizePercent = fontSizePercent; // Используем импортированную переменную для чтения

      if (action === "increase") {
        newFontSizePercent = Math.min(200, newFontSizePercent + 10);
      } else if (action === "decrease") {
        newFontSizePercent = Math.max(50, newFontSizePercent - 10);
      } else if (action === "reset") {
        newFontSizePercent = 100;
      }

      setFontSizePercent(newFontSizePercent); // Вызываем сеттер из post.js
      textContainer.style.fontSize = `${fontSizePercent}%`; // Читаем обновленное значение
      fontSizeDisplay.textContent = `${fontSizePercent}%`; // Читаем обновленное значение
      console.log(
        `  New font size percent: ${fontSizePercent}%, Style applied: ${textContainer.style.fontSize}`
      );
      adjustTextContent(); // Пересчитываем после изменения
    });
  });

  textBlock.addEventListener("wheel", (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      console.log(
        `Text block wheel event: ctrlKey=${e.ctrlKey}, deltaY=${e.deltaY}, currentPercent=${fontSizePercent}`
      );
      const delta = e.deltaY || e.detail || e.wheelDelta;
      let newFontSizePercent = fontSizePercent; // Читаем напрямую
      if (delta < 0) {
        newFontSizePercent = Math.min(200, newFontSizePercent + 5);
      } else {
        newFontSizePercent = Math.max(50, newFontSizePercent - 5);
      }
      setFontSizePercent(newFontSizePercent); // Вызываем сеттер из post.js
      textContainer.style.fontSize = `${fontSizePercent}%`; // Читаем обновленное значение
      fontSizeDisplay.textContent = `${fontSizePercent}%`; // Читаем обновленное значение
      console.log(
        `  New font size percent (wheel): ${fontSizePercent}%, Style applied: ${textContainer.style.fontSize}`
      );
      adjustTextContent();
      showFontSizeToast(fontSizePercent); // Читаем напрямую
    }
  });
  console.log("Font size controls initialized.");
}

// Вспомогательная функция для показа уведомления о размере шрифта
function showFontSizeToast(size) {
  let fontToast = document.querySelector(
    ".font-size-toast:not(.zoom-size-toast)"
  ); // Уточняем селектор
  if (!fontToast) {
    fontToast = document.createElement("div");
    fontToast.className = "font-size-toast";
    document.body.appendChild(fontToast);
  }
  fontToast.textContent = `Размер текста: ${size}%`;
  fontToast.classList.add("visible");
  clearTimeout(fontToast.timeout); // Сбрасываем предыдущий таймер, если есть
  fontToast.timeout = setTimeout(() => {
    fontToast.classList.remove("visible");
  }, 1000);
}

// ----------- Text Content Adjustment -----------
// Эта функция обеспечивает правильное отображение встроенных элементов
// и перенос текста внутри блока.
export function adjustTextContent() {
  const textBlock = document.querySelector(".text-block");
  const textContent = document.querySelector(".post-text-content");

  if (textBlock && textContent) {
    // Ensure images and media inside text fit container width
    const mediaElements = textContent.querySelectorAll("img, video, iframe");
    mediaElements.forEach((el) => {
      el.style.maxWidth = "100%";
      el.style.height = "auto"; // Maintain aspect ratio
    });

    // Ensure preformatted text blocks are scrollable and wrap
    const preBlocks = textContent.querySelectorAll("pre");
    preBlocks.forEach((el) => {
      el.style.overflow = "auto"; // Add scrollbars if needed
      el.style.maxWidth = "100%"; // Prevent horizontal overflow of the block itself
      el.style.whiteSpace = "pre-wrap"; // Allow wrapping within the pre block
    });

    // Ensure long words break correctly
    textContent.style.wordBreak = "break-word";
    textContent.style.overflowWrap = "break-word";
  }
}

// ----------- Selection Menu & Highlighting -----------
export function initSelectionMenu() {
  const selectionMenu = document.querySelector(".selection-menu");
  if (!selectionMenu) {
    console.warn("Selection menu not found.");
    return;
  }

  document.addEventListener("mouseup", (e) => {
    if (selectionMenu.contains(e.target)) {
      return;
    }

    const selection = window.getSelection();
    const textBlock = document.querySelector(".text-block");

    // Проверяем, что есть выделение, оно не пустое
    // и НАЧАЛО выделения находится внутри текстового блока
    if (
      !selection ||
      selection.isCollapsed ||
      !selection.toString().trim() ||
      !textBlock ||
      !textBlock.contains(selection.anchorNode) // <-- Убираем проверку focusNode
      // !textBlock.contains(selection.focusNode)
    ) {
      selectionMenu.classList.remove("visible");
      return;
    }

    // Если проверки пройдены, показываем меню
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const menuWidth = selectionMenu.offsetWidth;
    const menuHeight = selectionMenu.offsetHeight;
    let left = rect.left + window.scrollX + rect.width / 2 - menuWidth / 2;
    let top = rect.top + window.scrollY - menuHeight - 10;

    left = Math.max(0, Math.min(left, window.innerWidth - menuWidth));
    top = Math.max(0, top);

    selectionMenu.style.left = `${left}px`;
    selectionMenu.style.top = `${top}px`;
    selectionMenu.classList.add("visible");
  });

  // Скрываем меню при клике вне его и вне существующего выделения
  document.addEventListener("mousedown", (e) => {
    if (
      !selectionMenu.contains(e.target) &&
      !e.target.closest(".highlight") && // Не скрывать при клике на существующее выделение
      !e.target.closest(".remove-highlight-menu") // Не скрывать при клике на меню удаления
    ) {
      selectionMenu.classList.remove("visible");
    }
  });

  const highlightBtn = selectionMenu.querySelector('[data-action="highlight"]');
  const hideBtn = selectionMenu.querySelector('[data-action="hide"]');

  if (highlightBtn) {
    highlightBtn.addEventListener("click", () => {
      highlightSelectedText();
      selectionMenu.classList.remove("visible");
    });
  }

  if (hideBtn) {
    hideBtn.addEventListener("click", () => {
      hideSelectedText();
      selectionMenu.classList.remove("visible");
    });
  }

  addClickHandlersToExistingHighlights(); // Добавляем обработчики к существующим
  console.log("Selection menu initialized.");
}

// Добавляет обработчики клика ко всем элементам с классом 'highlight'
// внутри '.post-text-content'. Важно вызывать эту функцию после
// любых изменений DOM, которые могут добавить новые '.highlight' элементы
// (например, при восстановлении скрытого текста).
export function addClickHandlersToExistingHighlights() {
  const highlights = document.querySelectorAll(".post-text-content .highlight");
  console.log(`Adding click handlers to ${highlights.length} highlights.`);
  highlights.forEach((highlight) => {
    // Удаляем старый обработчик, чтобы избежать дублирования
    highlight.removeEventListener("click", handleHighlightClick);
    // Добавляем новый
    highlight.addEventListener("click", handleHighlightClick);
  });
}

// Вспомогательная функция для ограничения Range границами элемента
function constrainRangeToElement(range, element) {
  if (!range || !element) return range;

  const elementRange = document.createRange();
  elementRange.selectNodeContents(element);

  const constrainedRange = range.cloneRange();

  // Ограничиваем начало
  // compareBoundaryPoints возвращает -1 если точка range раньше elementRange, 0 если совпадают, 1 если позже
  if (
    constrainedRange.compareBoundaryPoints(Range.START_TO_START, elementRange) <
    0
  ) {
    constrainedRange.setStart(
      elementRange.startContainer,
      elementRange.startOffset
    );
  }

  // Ограничиваем конец
  if (
    constrainedRange.compareBoundaryPoints(Range.END_TO_END, elementRange) > 0
  ) {
    constrainedRange.setEnd(elementRange.endContainer, elementRange.endOffset);
  }

  return constrainedRange;
}

// Функция для оборачивания выделенного текста в <span class="highlight">
function highlightSelectedText() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return;

  const originalRange = selection.getRangeAt(0);
  const textBlock = document.querySelector(".text-block");

  if (originalRange.toString().trim() === "" || !textBlock) return;

  // Ограничиваем range границами текстового блока
  const range = constrainRangeToElement(originalRange, textBlock);
  if (!range || range.collapsed) {
    console.warn("Selection range after constraining is empty or invalid.");
    selection.removeAllRanges();
    return;
  }

  const highlightEl = document.createElement("span");
  highlightEl.className = "highlight";

  try {
    const fragment = range.extractContents();
    highlightEl.appendChild(fragment);
    range.insertNode(highlightEl);
    highlightEl.addEventListener("click", handleHighlightClick);
    selection.removeAllRanges();
    showToast("Текст выделен", "success");
  } catch (e) {
    console.error("Ошибка при выделении текста:", e);
    showToast(
      "Не удалось выделить текст. Попробуйте выделить фрагмент внутри одного блока.",
      "error"
    );
    selection.removeAllRanges();
  }
}

// Функция для СКРЫТИЯ выделенного текста и сохранения информации о нем
function hideSelectedText() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return;

  const originalRange = selection.getRangeAt(0);
  const textBlock = document.querySelector(".text-block");

  if (originalRange.toString().trim() === "" || !textBlock) return;

  // Ограничиваем range границами текстового блока
  const range = constrainRangeToElement(originalRange, textBlock);
  if (!range || range.collapsed) {
    console.warn("Selection range after constraining is empty or invalid.");
    selection.removeAllRanges();
    return;
  }

  const markerId = `hidden-marker-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;
  const hiddenMarker = document.createElement("span");
  hiddenMarker.id = markerId;
  hiddenMarker.className = "hidden-marker";
  hiddenMarker.style.display = "none";

  // Используем ограниченный range для получения информации
  const parentNode =
    range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
  const nodeInfo = getNodePath(parentNode);
  const textContent = range.toString(); // Текст из ограниченного range

  try {
    // Используем ограниченный range
    hiddenMarker.appendChild(range.extractContents());
    range.insertNode(hiddenMarker);

    window.removedTextFragments.push({
      markerId: markerId,
      text: textContent,
      nodeInfo: nodeInfo,
      timestamp: new Date().getTime(),
    });

    saveRemovedFragments();
    selection.removeAllRanges();
    showToast("Текст скрыт", "success");
  } catch (e) {
    console.error("Ошибка при скрытии текста (оборачивание в span):", e);
    showToast(
      "Не удалось скрыть текст. Попробуйте выделить фрагмент внутри одного блока.",
      "error"
    );
    selection.removeAllRanges();
  }
}

// Обработчик клика по существующему элементу .highlight
function handleHighlightClick(e) {
  e.stopPropagation(); // Останавливаем всплытие, чтобы не скрыть меню сразу
  const highlight = e.currentTarget;

  // Удаляем предыдущее меню удаления, если оно есть
  document.querySelector(".remove-highlight-menu")?.remove();
  // Убираем класс 'active' со всех других выделений
  document
    .querySelectorAll(".highlight.active")
    .forEach((el) => el.classList.remove("active"));

  // Создаем новое меню
  const menu = document.createElement("div");
  menu.className = "remove-highlight-menu visible";
  const removeBtn = document.createElement("button");
  removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Удалить выделение';

  removeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const parent = highlight.parentNode;
    if (!parent) {
      console.error("Не найден родитель для удаления выделения.");
      menu.remove();
      showToast("Ошибка удаления", "error");
      return;
    }
    try {
      // Перемещаем содержимое span ПЕРЕД ним
      while (highlight.firstChild) {
        parent.insertBefore(highlight.firstChild, highlight);
      }
      // Удаляем пустой span
      parent.removeChild(highlight);

      menu.remove(); // Удаляем само меню
      showToast("Выделение удалено", "success");
    } catch (err) {
      console.error("Ошибка при удалении выделения (перемещение узлов):", err);
      showToast("Ошибка при удалении выделения", "error");
      menu.remove(); // Все равно удаляем меню
    }
  });

  menu.appendChild(removeBtn);
  document.body.appendChild(menu);

  // Позиционируем меню под выделением
  const rect = highlight.getBoundingClientRect();
  menu.style.left = `${rect.left + window.scrollX}px`;
  menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
  highlight.classList.add("active");
  const hideMenuOnClickOutside = (event) => {
    if (!menu.contains(event.target) && !highlight.contains(event.target)) {
      menu.remove();
      highlight.classList.remove("active");
      document.removeEventListener("mousedown", hideMenuOnClickOutside, true);
    }
  };
  setTimeout(() => {
    document.addEventListener("mousedown", hideMenuOnClickOutside, true);
  }, 0);
}

// ----------- Hidden Text Management -----------

// Восстанавливает текст, ЗАМЕНЯЯ маркеры их содержимым
export function showAllHiddenText() {
  const textContentDiv = document.querySelector(".post-text-content");
  if (!textContentDiv) {
    console.error(
      "Не найден контейнер .post-text-content для восстановления текста."
    );
    showToast("Ошибка: не найден текстовый блок.", "error");
    return;
  }

  // Проверяем массив в памяти, а не только наличие маркеров в DOM
  if (
    !window.removedTextFragments ||
    window.removedTextFragments.length === 0
  ) {
    showToast("Скрытый текст отсутствует", "info");
    return;
  }

  console.log(
    `Найдены записи о ${window.removedTextFragments.length} скрытых фрагментах. Попытка восстановления...`
  );
  let restoredCount = 0;
  let notFoundCount = 0;

  // Итерируем по сохраненной информации о маркерах
  window.removedTextFragments.forEach((markerInfo) => {
    if (!markerInfo || !markerInfo.markerId) {
      console.warn(
        "Некорректная информация о маркере в removedTextFragments:",
        markerInfo
      );
      return; // Пропускаем некорректную запись
    }

    const marker = document.getElementById(markerInfo.markerId);
    if (marker && marker.classList.contains("hidden-marker")) {
      const parent = marker.parentNode;
      if (parent) {
        try {
          // Перемещаем все дочерние узлы маркера перед маркером
          while (marker.firstChild) {
            parent.insertBefore(marker.firstChild, marker);
          }
          // Удаляем пустой маркер
          parent.removeChild(marker);
          restoredCount++;
        } catch (e) {
          console.error(
            `Ошибка при восстановлении маркера ${markerInfo.markerId}:`,
            e
          );
        }
      } else {
        console.warn(`Не найден родитель для маркера ${markerInfo.markerId}`);
        notFoundCount++;
      }
    } else {
      console.warn(`Маркер с ID ${markerInfo.markerId} не найден в DOM.`);
      notFoundCount++;
    }
  });

  // Очищаем массив и localStorage ПОСЛЕ попытки восстановления
  window.removedTextFragments = [];
  if (chatId && messageId) {
    localStorage.removeItem(`removed_fragments_${chatId}_${messageId}`);
    console.log(
      "localStorage для удаленных фрагментов очищен после попытки восстановления."
    );
  }

  if (restoredCount > 0) {
    showToast(`Восстановлено ${restoredCount} скрытых фрагментов`, "success");
    // Важно: После восстановления нужно заново навесить обработчики на .highlight
    addClickHandlersToExistingHighlights();
  } else if (notFoundCount > 0) {
    // Если ничего не восстановлено, но были записи
    showToast(
      "Не удалось найти скрытые фрагменты для восстановления",
      "warning"
    );
  } else {
    // Сюда не должны попасть из-за проверки в начале, но на всякий случай
    showToast("Скрытый текст отсутствует", "info");
  }
}

// Сохраняет текущее состояние массива removedTextFragments в localStorage
function saveRemovedFragments() {
  if (chatId && messageId) {
    try {
      const storageKey = `removed_fragments_${chatId}_${messageId}`;
      // Сохраняем массив с информацией о маркерах
      localStorage.setItem(
        storageKey,
        JSON.stringify(window.removedTextFragments)
      );
      console.log(
        `Информация о скрытых маркерах сохранена (${window.removedTextFragments.length} шт.)`
      );
    } catch (e) {
      console.error("Ошибка при сохранении информации о маркерах:", e);
      showToast("Не удалось сохранить состояние скрытого текста", "error");
    }
  }
}

// Загружает информацию о скрытых маркерах из localStorage
export function loadRemovedFragments() {
  // Эта функция теперь загружает информацию о МАРКЕРАХ, а не HTML
  // Реальная проверка наличия маркеров и их скрытие/показ
  // происходит при загрузке страницы или через showAllHiddenText
  if (chatId && messageId) {
    const storageKey = `removed_fragments_${chatId}_${messageId}`;
    const savedMarkersInfo = localStorage.getItem(storageKey);

    if (savedMarkersInfo) {
      try {
        window.removedTextFragments = JSON.parse(savedMarkersInfo);
        console.log(
          `Загружена информация о маркерах (${window.removedTextFragments.length} шт.)`
        );
        // Можно добавить логику проверки, существуют ли еще эти маркеры в DOM
      } catch (e) {
        console.error("Ошибка при парсинге информации о маркерах:", e);
        window.removedTextFragments = [];
        localStorage.removeItem(storageKey);
      }
    } else {
      window.removedTextFragments = [];
      console.log("Информация о маркерах в localStorage не найдена.");
    }
  } else {
    window.removedTextFragments = [];
    console.warn(
      "chatId или messageId не определены, информация о маркерах не загружена."
    );
  }
}
