import { adjustTextContent } from "./textControls.js";

// Переменные состояния для ресайза (локализуем здесь)
let isResizing = false;

// Ссылка на MutationObserver для текста (чтобы его можно было отключить)
let textMutationObserver = null;

// ---------------- Layout Switching ------------------
export function initLayoutControls() {
  const layoutButtons = document.querySelectorAll(".btn-layout");
  const postContainer = document.querySelector(".post-container");
  if (!postContainer || layoutButtons.length === 0) {
    console.warn("Элементы управления макетом не найдены.");
    return;
  }

  layoutButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      const layout = e.currentTarget.getAttribute("data-layout");
      if (!layout) return;

      // Проверяем, не активна ли уже эта кнопка
      if (e.currentTarget.classList.contains("active")) return;

      layoutButtons.forEach((btn) => btn.classList.remove("active"));
      e.currentTarget.classList.add("active");

      postContainer.classList.remove(
        "layout-left",
        "layout-right",
        "layout-top"
      );
      postContainer.classList.add(`layout-${layout}`);

      applyLayoutAdjustments(layout);
      localStorage.setItem("preferred-layout", layout);
      console.log(`Layout changed to: ${layout}`);
    });
  });

  const savedLayout = localStorage.getItem("preferred-layout") || "left"; // Дефолт - left
  const defaultButton = document.querySelector(
    `.btn-layout[data-layout="${savedLayout}"]`
  );
  if (defaultButton) {
    // Применяем сохраненный или дефолтный макет при загрузке
    // Используем setTimeout, чтобы другие инициализации успели выполниться
    setTimeout(() => {
      if (!postContainer.classList.contains(`layout-${savedLayout}`)) {
        defaultButton.click();
        console.log(`Applied initial layout: ${savedLayout}`);
      }
    }, 0);
  } else {
    // Если кнопка для сохраненного макета не найдена, применяем дефолтный
    applyLayoutAdjustments("left");
    console.log(`Applied default layout: left`);
  }
  console.log("Layout controls initialized.");
}

// Применяет стили и корректировки для выбранного макета
// Учитывает видимость медиа и текстовых блоков
export function applyLayoutAdjustments(layout) {
  const postContainer = document.querySelector(".post-container");
  const textBlock = document.querySelector(".text-block");
  const mediaBlock = document.querySelector(".media-block");
  const splitter = document.querySelector(".splitter");

  if (!postContainer) return;

  console.log(`Applying layout adjustments for: ${layout}`);

  // Сбрасываем inline-стили, которые могли быть установлены ресайзером или при скрытии блоков
  postContainer.style.gridTemplateColumns = "";
  postContainer.style.gridTemplateRows = "";
  postContainer.style.height = "";
  postContainer.style.maxHeight = "";
  if (textBlock) {
    textBlock.style.height = "";
    textBlock.style.maxHeight = "";
    textBlock.style.width = "";
    textBlock.style.minHeight = "";
    textBlock.style.overflowY = "";
    textBlock.style.display = ""; // Важно сбросить display
    textBlock.style.gridColumn = "";
    textBlock.style.gridRow = "";
    textBlock.style.maxWidth = "";
  }
  if (mediaBlock) {
    mediaBlock.style.height = "";
    mediaBlock.style.width = "";
    mediaBlock.style.minHeight = "";
    mediaBlock.style.maxHeight = "";
    mediaBlock.style.display = ""; // Важно сбросить display
    mediaBlock.style.gridColumn = "";
    mediaBlock.style.gridRow = "";
    mediaBlock.style.maxWidth = "";
  }
  if (splitter) {
    splitter.style.display = ""; // Сбрасываем display и для разделителя
  }

  // Определяем видимость блоков
  const isMediaVisible = mediaBlock && !mediaBlock.classList.contains("hidden");
  const isTextVisible =
    textBlock && !textBlock.classList.contains("text-hidden");

  // Отключаем старые обработчики resize и mutation observer
  window.removeEventListener("resize", adjustTextBlockHeight);
  if (textMutationObserver) {
    textMutationObserver.disconnect();
    textMutationObserver = null;
  }

  // Настраиваем Grid и стили в зависимости от макета и видимости
  if (layout === "top") {
    if (isMediaVisible && isTextVisible) {
      // Оба видны, вертикальный макет
      if (window.innerWidth > 768) {
        const containerWidth = postContainer.getBoundingClientRect().width;
        const aspectHeight = Math.round(containerWidth * (9 / 16));
        const mediaSize = Math.min(aspectHeight, 500);
        const splitterSize = splitter ? splitter.offsetHeight || 8 : 8;
        // Уменьшаем текстовый блок, чтобы влезло
        const availableHeight = window.innerHeight - 100; // Примерная высота минус хедер/футер
        const textSize = Math.max(
          200,
          availableHeight - mediaSize - splitterSize
        );

        postContainer.style.gridTemplateRows = `${mediaSize}px ${splitterSize}px ${textSize}px`;
        mediaBlock.style.height = `${mediaSize}px`;
        textBlock.style.height = `${textSize}px`;
      } else {
        postContainer.style.gridTemplateRows =
          "auto var(--splitter-width) auto";
      }
      if (splitter) splitter.style.display = "block"; // Показываем разделитель
    } else if (isMediaVisible) {
      postContainer.style.gridTemplateRows = "1fr";
      mediaBlock.style.height = "100%";
      if (splitter) splitter.style.display = "none"; // Скрываем разделитель
    } else if (isTextVisible) {
      postContainer.style.gridTemplateRows = "1fr";
      textBlock.style.height = "100%";
      if (splitter) splitter.style.display = "none"; // Скрываем разделитель
    } else {
      // Оба скрыты
      if (splitter) splitter.style.display = "none";
    }

    // Добавляем обработчики для автовысоты текста, только если текст видим
    if (isTextVisible) {
      adjustTextBlockHeight();
      window.addEventListener("resize", adjustTextBlockHeight);
      const textContent = textBlock.querySelector(".post-text-content");
      if (textContent) {
        textMutationObserver = new MutationObserver(adjustTextBlockHeight);
        textMutationObserver.observe(textContent, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }
  } else {
    // layout === 'left' or 'right'
    if (isMediaVisible && isTextVisible) {
      const mediaFr =
        layout === "left" ? "minmax(200px, 1fr)" : "minmax(300px, 2fr)";
      const textFr =
        layout === "left" ? "minmax(300px, 2fr)" : "minmax(200px, 1fr)";
      if (window.innerWidth > 768) {
        postContainer.style.gridTemplateColumns = `${mediaFr} var(--splitter-width) ${textFr}`;
      } else {
        // На мобильных один под другим
        postContainer.style.gridTemplateColumns = "1fr";
        postContainer.style.gridTemplateRows =
          "auto var(--splitter-width) auto";
      }
      if (splitter) splitter.style.display = "block"; // Показываем разделитель
    } else if (isMediaVisible) {
      postContainer.style.gridTemplateColumns = "1fr";
      mediaBlock.style.width = "100%";
      if (splitter) splitter.style.display = "none";
    } else if (isTextVisible) {
      postContainer.style.gridTemplateColumns = "1fr";
      textBlock.style.width = "100%";
      if (splitter) splitter.style.display = "none";
    } else {
      // Оба скрыты
      if (splitter) splitter.style.display = "none";
    }
  }

  // Форсируем перерасчет размеров текста
  setTimeout(() => {
    adjustTextContent();
    // Если макет верхний и текст видим, еще раз корректируем высоту текста
    if (layout === "top" && isTextVisible) {
      adjustTextBlockHeight();
    }
    isResizing = false; // Сбрасываем флаг ресайза на всякий случай
  }, 50);
}

// Корректирует высоту текстового блока в макете 'top' по высоте контента
function adjustTextBlockHeight() {
  const textBlock = document.querySelector(".text-block");
  const postContainer = document.querySelector(".post-container");
  if (
    !textBlock ||
    !postContainer ||
    !postContainer.classList.contains("layout-top") || // Только для верхнего макета
    textBlock.classList.contains("text-hidden") // Не делаем для скрытого блока
  ) {
    return;
  }
  const textContent = textBlock.querySelector(".post-text-content");
  if (!textContent) return;

  // Сначала сбрасываем высоту, чтобы правильно измерить scrollHeight
  textBlock.style.height = "auto";
  const contentHeight = textContent.scrollHeight;
  // Устанавливаем новую высоту с небольшим отступом снизу
  textBlock.style.height = contentHeight + 30 + "px";
  // console.log("Adjusted text block height: " + (contentHeight + 30) + "px");
}

// Возвращает текущий тип макета ('left', 'right', 'top')
export function getLayoutType() {
  const postContainer = document.querySelector(".post-container");
  if (!postContainer) return "left"; // Дефолтный макет
  if (postContainer.classList.contains("layout-left")) return "left";
  if (postContainer.classList.contains("layout-right")) return "right";
  if (postContainer.classList.contains("layout-top")) return "top";
  return "left"; // Дефолт, если класс не найден
}

// ---------------- Resizable Splitter ------------------
export function initResizableSplitter() {
  const splitter = document.querySelector(".splitter");
  const mediaBlock = document.querySelector(".media-block");
  const textBlock = document.querySelector(".text-block");
  const postContainer = document.querySelector(".post-container");

  if (!splitter || !mediaBlock || !textBlock || !postContainer) {
    console.warn("Элементы для инициализации разделителя не найдены.");
    return;
  }

  // Проверяем, был ли разделитель уже инициализирован
  if (splitter.dataset.resizableInitialized === "true") {
    // console.log("Разделитель уже инициализирован.");
    return;
  }
  splitter.dataset.resizableInitialized = "true";
  console.log("Инициализация разделителя");

  let startX, startY;
  let startMediaWidth, startMediaHeight;
  let startTextWidth, startTextHeight;

  function startResize(e) {
    // --->>> ОТЛАДКА <<<---
    console.log("Splitter startResize triggered! Event type:", e.type);
    // ---<<<<<<<<<<<<<<---
    // Не начинаем ресайз, если один из блоков скрыт или разделитель скрыт
    if (
      mediaBlock.classList.contains("hidden") ||
      textBlock.classList.contains("text-hidden") ||
      splitter.offsetParent === null // Проверка видимости
    ) {
      return;
    }
    isResizing = true;
    startX = e.clientX || (e.touches && e.touches[0].clientX);
    startY = e.clientY || (e.touches && e.touches[0].clientY);

    const mediaRect = mediaBlock.getBoundingClientRect();
    const textRect = textBlock.getBoundingClientRect();
    startMediaWidth = mediaRect.width;
    startMediaHeight = mediaRect.height;
    startTextWidth = textRect.width;
    startTextHeight = textRect.height;

    // Добавляем классы для стилизации и предотвращения выделения
    document.body.classList.add("resizing");
    splitter.classList.add("active");

    document.addEventListener("mousemove", resize);
    document.addEventListener("touchmove", resize, { passive: false }); // passive: false для предотвращения scroll
    document.addEventListener("mouseup", stopResize);
    document.addEventListener("touchend", stopResize);
    document.addEventListener("mouseleave", stopResize); // Останавливаем, если мышь ушла за пределы окна

    if (e.type === "touchstart") e.preventDefault(); // Предотвращаем стандартное поведение для touch
  }

  // Функция изменения размеров при перетаскивании
  function resize(e) {
    console.log(`Splitter resize event. isResizing: ${isResizing}`);
    if (!isResizing) return;
    if (e.type === "touchmove") e.preventDefault();

    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;
    const layoutType = getLayoutType();

    // --->>> ОТЛАДКА <<<---
    console.log(
      `  Layout: ${layoutType}, DeltaX: ${deltaX}, DeltaY: ${deltaY}`
    );
    // ---<<<<<<<<<<<<<<---

    if (layoutType === "top") {
      const splitterHeight = splitter.offsetHeight;
      const newMediaHeight = Math.max(100, startMediaHeight + deltaY);
      const newTextHeight = Math.max(100, startTextHeight - deltaY);
      // --->>> ОТЛАДКА <<<---
      console.log(
        `  Checking height condition: newMediaH(${newMediaHeight}) + newTextH(${newTextHeight}) + splitterH(${splitterHeight}) = ${
          newMediaHeight + newTextHeight + splitterHeight
        } vs containerH(${postContainer.offsetHeight}) - 10 = ${
          postContainer.offsetHeight - 10
        }`
      );
      // ---<<<<<<<<<<<<<<---
      if (
        newMediaHeight + newTextHeight + splitterHeight >
        postContainer.offsetHeight - 10
      ) {
        console.log(
          `  Exiting resize (top): calculated height exceeds container limit.`
        );
        return;
      }
      // ---<<<<<<<<<<<<<<---

      mediaBlock.style.height = `${newMediaHeight}px`;
      textBlock.style.height = `${newTextHeight}px`;
      const gridRows = `${newMediaHeight}px ${splitterHeight}px ${newTextHeight}px`;
      postContainer.style.gridTemplateRows = gridRows;
      // --->>> ОТЛАДКА <<<---
      console.log(`  Applied gridTemplateRows: ${gridRows}`);
      // ---<<<<<<<<<<<<<<---
    } else {
      const splitterWidth = splitter.offsetWidth;
      const factor = layoutType === "left" ? 1 : -1;
      const newMediaWidth = Math.max(150, startMediaWidth + deltaX * factor);
      const newTextWidth = Math.max(150, startTextWidth - deltaX * factor);
      // --->>> ОТЛАДКА <<<---
      console.log(
        `  Checking width condition: newMediaW(${newMediaWidth}) + newTextW(${newTextWidth}) + splitterW(${splitterWidth}) = ${
          newMediaWidth + newTextWidth + splitterWidth
        } vs containerW(${postContainer.offsetWidth}) - 10 = ${
          postContainer.offsetWidth - 10
        }`
      );
      // ---<<<<<<<<<<<<<<---
      // --- УДАЛЯЕМ НЕКОРРЕКТНУЮ ПРОВЕРКУ ---
      /*
      if (newMediaWidth + newTextWidth + splitterWidth > postContainer.offsetWidth - 10) {
           console.log(`  Exiting resize (horiz): calculated width exceeds container limit.`);
           return;
      }
      */
      // --- КОНЕЦ УДАЛЕНИЯ ---

      const totalWidthForFr = postContainer.offsetWidth - splitterWidth;
      // --->>> ОТЛАДКА <<<---
      console.log(
        `  Checking totalWidthForFr: containerW(${postContainer.offsetWidth}) - splitterW(${splitterWidth}) = ${totalWidthForFr}`
      );
      // ---<<<<<<<<<<<<<<---
      if (totalWidthForFr <= 0) {
        console.log(`  Exiting resize (horiz): totalWidthForFr <= 0`);
        return;
      }
      // ---<<<<<<<<<<<<<<---

      const mediaFr = newMediaWidth / totalWidthForFr;
      const textFr = newTextWidth / totalWidthForFr;

      // --->>> ОТЛАДКА <<<---
      console.log(
        `  ContainerW: ${postContainer.offsetWidth}, SplitterW: ${splitterWidth}`
      );
      console.log(
        `  StartMediaW: ${startMediaWidth}, StartTextW: ${startTextWidth}`
      );
      console.log(`  NewMediaW: ${newMediaWidth}, NewTextW: ${newTextWidth}`);
      console.log(`  MediaFr: ${mediaFr}, TextFr: ${textFr}`);
      // ---<<<<<<<<<<<<<<---

      let gridCols = "";
      if (layoutType === "left") {
        gridCols = `${mediaFr}fr ${splitterWidth}px ${textFr}fr`;
      } else {
        gridCols = `${textFr}fr ${splitterWidth}px ${mediaFr}fr`;
      }
      postContainer.style.gridTemplateColumns = gridCols;
      // --->>> ОТЛАДКА <<<---
      console.log(`  Applied gridTemplateColumns: ${gridCols}`);
      // ---<<<<<<<<<<<<<<---
    }
  }

  // Функция окончания перетаскивания
  function stopResize() {
    // --->>> ОТЛАДКА <<<---
    console.log(
      `Splitter stopResize triggered. isResizing before stop: ${isResizing}`
    );
    // ---<<<<<<<<<<<<<<---
    if (!isResizing) return;
    isResizing = false;

    document.body.classList.remove("resizing");
    splitter.classList.remove("active");

    document.removeEventListener("mousemove", resize);
    document.removeEventListener("touchmove", resize);
    document.removeEventListener("mouseup", stopResize);
    document.removeEventListener("touchend", stopResize);
    document.removeEventListener("mouseleave", stopResize);

    // Вызываем adjustTextContent для пересчета переносов и т.д.
    adjustTextContent();
  }

  // Удаляем старые обработчики перед добавлением новых (на всякий случай)
  splitter.removeEventListener("mousedown", startResize);
  splitter.removeEventListener("touchstart", startResize);

  // Добавляем обработчики
  splitter.addEventListener("mousedown", startResize);
  splitter.addEventListener("touchstart", startResize, { passive: false });
}
