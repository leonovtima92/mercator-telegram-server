import { showToast } from "./modules/utils.js"; // getNodePath импортируется в textControls
import {
  initMediaViewer,
  applyZoom, // Используется в initZoomControls
  resetMediaView, // Используется в initZoomControls
} from "./modules/mediaViewer.js";
import {
  initFontSizeControls,
  adjustTextContent,
  initSelectionMenu,
  loadRemovedFragments,
  addClickHandlersToExistingHighlights,
} from "./modules/textControls.js";
import {
  initLayoutControls,
  initResizableSplitter,
  // applyLayoutAdjustments, // Вызывается внутри initLayoutControls и actionPanel
  // getLayoutType // Вызывается внутри actionPanel и layoutControls
} from "./modules/layoutControls.js";
import {
  initActionButtons, // Общие кнопки (download, clear)
  initShowHiddenButton,
  initToggleMediaButton,
  initToggleTextButton,
  copyZoomToAllMedia, // <-- ДОБАВЛЕНО
  checkAllHidden, // Используется после инициализации toggle кнопок
} from "./modules/actionPanel.js";

// --- Глобальные переменные ---
// mediaSettings теперь локальная переменная модуля
let mediaSettings = {}; // <--- УБРАН export

// Остальные экспорты остаются как есть
export let currentMedia = null;
export let currentMediaIndex = 0;
export let zoomLevel = 1;
export let fontSizePercent = 100;
// --- ИСПРАВЛЯЕМ ОПРЕДЕЛЕНИЕ ПЛЕЙСХОЛДЕРА ---
// Берем значение из глобальной переменной, установленной в HTML
export const placeholderSrc =
  window.placeholderSrc || "/static/img/placeholder.png"; // Добавляем дефолт на случай ошибки
// --- КОНЕЦ ИСПРАВЛЕНИЯ ---
export let removedTextFragments = [];
export const chatId = window.chatId;
export const messageId = window.messageId;
export const mediaList = window.mediaList;
export let highlightObserver = null;

// --- Функции-сеттеры и геттеры для управления состоянием ---

// Получает настройки для индекса или возвращает дефолтные
export function getMediaSettings(index) {
  if (typeof index !== "undefined" && mediaSettings[index]) {
    return { ...mediaSettings[index] }; // Возвращаем копию
  } else {
    // Возвращаем дефолтные настройки, если для индекса нет записи
    return { zoom: 1, positionX: 0, positionY: 0 };
  }
}

// Обновляет настройки для индекса
export function updateMediaSettings(index, newSettings) {
  if (typeof index !== "undefined" && newSettings) {
    mediaSettings[index] = { ...newSettings };
    console.log(
      `updateMediaSettings: Обновлены настройки для #${index}:`,
      mediaSettings[index]
    );
  } else {
    console.warn(
      `updateMediaSettings: Некорректный индекс (${index}) или настройки (${newSettings})`
    );
  }
}

// --->>> НОВАЯ ФУНКЦИЯ-СЕТТЕР <<<---
// Позволяет модулям изменять значение fontSizePercent
export function setFontSizePercent(newValue) {
  // Добавляем проверку, что значение является числом и в допустимом диапазоне
  if (
    typeof newValue === "number" &&
    !isNaN(newValue) &&
    newValue >= 50 &&
    newValue <= 200
  ) {
    fontSizePercent = newValue;
    // console.log(`fontSizePercent updated to: ${fontSizePercent}`); // Опциональный лог
  } else {
    console.warn(`Invalid value passed to setFontSizePercent: ${newValue}`);
  }
}
// ---<<<<<<<<<<<<<<<<<<<<<<<<<<<---

// --- Инициализация при загрузке DOM ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed. Starting initialization...");

  // 0. Проверка наличия базовых данных
  if (typeof chatId === "undefined" || typeof messageId === "undefined") {
    console.error("Chat ID or Message ID is missing. Initialization aborted.");
    showToast("Ошибка: Не удалось загрузить данные сообщения.", "error");
    return;
  }
  console.log(
    `Initializing post view for chat ${chatId}, message ${messageId}`
  );

  // 1. Инициализация хранилища настроек медиа (если есть медиа)
  const hasMedia = mediaList && mediaList.length > 0;
  if (hasMedia) {
    initMediaSettings(); // Инициализирует mediaSettings на основе mediaList
  }

  // 2. Загрузка сохраненных состояний (скрытый текст)
  loadRemovedFragments(); // Из textControls.js

  // 3. Начальная настройка UI (скрыть/показать блоки)
  setupInitialUI(hasMedia);

  // --- ПРОВЕРКА ПЕРЕД ИНИЦИАЛИЗАЦИЕЙ КОНТРОЛОВ ---
  console.log("Checking if controls panel exists before init...");
  const controlsPanelCheck = document.querySelector(
    ".controls-sidebar .controls-panel"
  ); // Уточняем селектор, если нужно
  console.log("Controls panel found:", controlsPanelCheck);
  if (controlsPanelCheck) {
    const resetButtonCheck = controlsPanelCheck.querySelector(
      '[data-action="reset"]'
    );
    console.log("Reset button found inside panel:", resetButtonCheck);
  }
  // --- КОНЕЦ ПРОВЕРКИ ---

  // 4. Инициализация основных модулей и контролов
  initLayoutControls();
  initFontSizeControls();
  initSelectionMenu();

  if (hasMedia) {
    console.log("Initializing media-related components...");
    initMediaViewer();
    initResizableSplitter();
    // --- ВЫЗОВ НОВОЙ ФУНКЦИИ С ЗАДЕРЖКОЙ ---
    console.log(
      "Scheduling initializeZoomControlsListeners with setTimeout(100)..."
    );
    setTimeout(() => initializeZoomControlsListeners(), 100); // Увеличили задержку до 100ms
    // --- КОНЕЦ ВЫЗОВА ---
  } else {
    console.log(
      "No media found, skipping media-related components initialization."
    );
  }

  // 5. Инициализация кнопок панели действий
  initAllActionButtons(); // Все кнопки из actionPanel.js

  // 6. Первичная настройка содержимого текста (переносы и т.д.)
  adjustTextContent(); // Из textControls.js
  window.addEventListener("resize", adjustTextContent); // Обновляем при ресайзе окна

  // 7. Инициализация сворачиваемых панелей управления
  initCollapsiblePanels(); // Остается здесь

  // NEW: Инициализация кнопки "Копировать Zoom/Pos" напрямую по XPath
  initCopyZoomButtonByXPath();

  // 8. Observer для обновления обработчиков клика на .highlight
  const textContentElement = document.querySelector(".post-text-content");
  if (textContentElement) {
    // Присваиваем экземпляр экспортируемой переменной
    highlightObserver = new MutationObserver((mutationsList) => {
      // <-- ПРИСВАИВАЕМ ЗДЕСЬ
      for (const mutation of mutationsList) {
        // Оптимизация: проверяем, были ли добавлены/удалены узлы или изменился текст
        if (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        ) {
          // Проверяем, изменились ли именно .highlight (опционально, для точности)
          let highlightsChanged = false;
          if (mutation.type === "childList") {
            const addedNodes = Array.from(mutation.addedNodes);
            const removedNodes = Array.from(mutation.removedNodes);
            highlightsChanged =
              addedNodes.some(
                (n) => n.nodeType === 1 && n.matches(".highlight")
              ) ||
              removedNodes.some(
                (n) => n.nodeType === 1 && n.matches(".highlight")
              ) ||
              addedNodes.some(
                (n) => n.querySelector && n.querySelector(".highlight")
              ) || // Проверяем добавленные поддеревья
              (mutation.target.nodeType === 1 &&
                mutation.target.matches(".highlight")); // Если сам target - highlight
          } else if (mutation.type === "characterData") {
            // Изменение текста внутри highlight или его родителя
            highlightsChanged =
              mutation.target.parentNode &&
              mutation.target.parentNode.closest(".highlight");
          }

          if (highlightsChanged) {
            console.log(
              "Highlight-related change detected, re-attaching handlers."
            );
            addClickHandlersToExistingHighlights();
            break; // Выходим после первой релевантной мутации
          }
        }
      }
    });
    // Наблюдаем за изменениями в дочерних элементах, поддереве и текстовом содержимом
    highlightObserver.observe(textContentElement, {
      childList: true,
      subtree: true,
      characterData: true, // <-- ДОБАВЛЯЕМ characterData
    });
    console.log("MutationObserver for highlight updates initialized.");
  }

  // 9. Финальная проверка видимости блоков (после инициализации toggle кнопок)
  checkAllHidden(); // Из actionPanel.js

  console.log("Page initialization complete.");
});

// --- Локальные функции инициализации (не экспортируются) ---

// Инициализация хранилища настроек (модифицирует локальную mediaSettings)
function initMediaSettings() {
  if (!mediaList || mediaList.length === 0) return;
  mediaList.forEach((media, index) => {
    if (!mediaSettings[index]) {
      mediaSettings[index] = { zoom: 1, positionX: 0, positionY: 0 };
    }
  });
  console.log("Media settings initialized (local):", mediaSettings);
}

// Настройка начального вида UI в зависимости от наличия медиа
function setupInitialUI(hasMedia) {
  const mediaBlock = document.querySelector(".media-block");
  const textBlock = document.querySelector(".text-block");
  const postContainer = document.querySelector(".post-container");
  const postContainerWrapper = document.querySelector(
    ".post-container-wrapper"
  );
  const splitter = document.querySelector(".splitter");
  const mediaControls = document.querySelector(".media-controls-group"); // Группа кнопок навигации медиа
  const zoomControls = document.querySelector(".zoom-controls-group"); // Группа кнопок зума

  console.log(`Setting up initial UI. Has media: ${hasMedia}`);

  if (hasMedia) {
    if (mediaBlock) mediaBlock.style.display = "";
    if (splitter) splitter.style.display = "";
    if (mediaControls) mediaControls.style.display = "";
    if (zoomControls) zoomControls.style.display = "";
    if (postContainerWrapper) postContainerWrapper.classList.remove("no-media");
    // Классы layout-* будут добавлены/удалены в initLayoutControls -> applyLayoutAdjustments
  } else {
    if (mediaBlock) mediaBlock.style.display = "none";
    if (splitter) splitter.style.display = "none";
    if (mediaControls) mediaControls.style.display = "none";
    if (zoomControls) zoomControls.style.display = "none";
    if (postContainerWrapper) postContainerWrapper.classList.add("no-media");

    if (postContainer) {
      postContainer.classList.remove(
        "layout-left",
        "layout-right",
        "layout-top"
      );
      postContainer.classList.add("layout-text-only");
      postContainer.style.gridTemplateColumns = "1fr";
      postContainer.style.gridTemplateRows = "auto";
    }
    if (textBlock) {
      textBlock.style.width = "100%";
      textBlock.style.height = "auto";
      textBlock.style.maxWidth = "100%";
    }
  }
  // Важно: Не вызываем здесь applyLayoutAdjustments, т.к. он будет вызван внутри initLayoutControls
}

// ОТДЕЛЬНАЯ ФУНКЦИЯ для инициализации ТОЛЬКО контролов зума
function initializeZoomControlsListeners() {
  console.log("--- Running initializeZoomControlsListeners ---");

  const zoomValueDisplay = document.querySelector(".zoom-value");
  const mediaBlock = document.querySelector(".media-block");
  // --- ИСПРАВЛЯЕМ СЕЛЕКТОР РОДИТЕЛЯ ---
  const controlsContainer = document.querySelector(".controls-sidebar");
  if (!controlsContainer) {
    console.error("Cannot find .controls-sidebar to initialize zoom buttons!");
    return;
  }
  console.log("Found controls container:", controlsContainer);

  // --- Обработка кнопок +/- ---
  // --- ИСПРАВЛЯЕМ СЕЛЕКТОР КНОПОК ---
  const zoomInOutButtons = controlsContainer.querySelectorAll(
    '.control-group .controls [data-action="in"], .control-group .controls [data-action="out"]'
  );
  console.log(
    `Found ${zoomInOutButtons.length} zoom buttons (+/-):`,
    zoomInOutButtons
  );

  zoomInOutButtons.forEach((button) => {
    // ... (остальная логика для +/- без изменений)
    const action = button.getAttribute("data-action");
    console.log(`Processing button +/- with data-action="${action}"`);

    const handlerKey = `zoomClickHandler_${action}`;
    // Удаляем старый обработчик, если есть
    if (button[handlerKey]) {
      console.log(`  Removing old zoom click handler for action="${action}"`);
      button.removeEventListener("click", button[handlerKey]);
      delete button[handlerKey]; // Удаляем ссылку
    }

    const clickHandler = () => {
      const currentAction = button.getAttribute("data-action");
      console.log(`Zoom button +/- clicked: action="${currentAction}"`);
      let newZoomLevel = window.zoomLevel; // <-- Используем window.zoomLevel

      if (currentAction === "in") {
        newZoomLevel = Math.min(5, newZoomLevel + 0.1);
      } else if (currentAction === "out") {
        newZoomLevel = Math.max(0.5, newZoomLevel - 0.1);
      }

      // --- ИСПРАВЛЕНИЕ: Обновляем глобальную window.zoomLevel ---
      window.zoomLevel = Math.round(newZoomLevel * 100) / 100;
      // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

      if (zoomValueDisplay) {
        // --- ИСПРАВЛЕНИЕ: Используем window.zoomLevel для отображения ---
        zoomValueDisplay.textContent = `${Math.round(window.zoomLevel * 100)}%`;
      }
      // Вызываем applyZoom, которая уже использует window.zoomLevel
      applyZoom();
    };

    button[handlerKey] = clickHandler; // Сохраняем ссылку
    button.addEventListener("click", clickHandler);
    console.log(`  Added click handler for +/- action="${action}"`);
  });

  // --- Обработка кнопки Reset ---
  // --- ИСПРАВЛЯЕМ СЕЛЕКТОР КНОПКИ: Добавляем класс .btn-zoom ---
  const resetButton = controlsContainer.querySelector(
    '.control-group .controls .btn-zoom[data-action="reset"]' // Добавили .btn-zoom
  );
  console.log(
    "Attempting to find ZOOM Reset button (.btn-zoom[data-action='reset']):",
    resetButton
  );

  if (resetButton) {
    console.log(`Processing ZOOM Reset button`);
    const handlerKey = "zoomResetClickHandler";
    if (resetButton[handlerKey]) {
      console.log("  Removing old ZOOM reset click handler");
      resetButton.removeEventListener("click", resetButton[handlerKey]);
      delete resetButton[handlerKey];
    }

    const resetClickHandler = () => {
      console.log("ZOOM Reset button clicked, calling resetMediaView()...");
      resetMediaView();
      if (zoomValueDisplay) zoomValueDisplay.textContent = "100%";
    };

    resetButton[handlerKey] = resetClickHandler;
    resetButton.addEventListener("click", resetClickHandler);
    console.log("  Added click handler for ZOOM Reset button");
  } else {
    console.warn(
      'ZOOM Reset button (.btn-zoom[data-action="reset"]) not found!'
    );
  }

  // --- Инициализация кнопки "Копировать Zoom/Pos" ---
  // --- ИСПРАВЛЯЕМ СЕЛЕКТОР КНОПКИ ---
  const copyZoomBtn = controlsContainer.querySelector(
    '.control-group .controls [data-action="copy-zoom"]'
  );
  console.log("Attempting to find Copy Zoom button:", copyZoomBtn);
  if (copyZoomBtn) {
    // ... (код для Copy кнопки без изменений)
    if (copyZoomBtn.dataset.clickHandlerAttached) {
      copyZoomBtn.removeEventListener("click", copyZoomToAllMedia);
      console.log("Removed old copyZoomToAllMedia listener.");
    }
    copyZoomBtn.addEventListener("click", copyZoomToAllMedia);
    copyZoomBtn.dataset.clickHandlerAttached = "true";
    console.log("Copy zoom button listener attached.");
  } else {
    console.warn("Copy Zoom button not found inside .controls-sidebar.");
  }

  // --- Обработчик колесика мыши ---
  // ... (код для wheelHandler без изменений)
  if (mediaBlock) {
    // ... (логика для Wheel без изменений)
    if (mediaBlock.dataset.wheelHandlerAttached) {
      console.log("Removing old mediaBlock wheel listener.");
      mediaBlock.removeEventListener("wheel", mediaBlock.wheelEventHandler);
      delete mediaBlock.wheelEventHandler; // Удаляем ссылку
    }

    const wheelHandler = (e) => {
      if (
        window.currentMedia &&
        e.target !== window.currentMedia &&
        !window.currentMedia.contains(e.target)
      ) {
        return;
      }
      e.preventDefault();
      const delta = e.deltaY || e.detail || e.wheelDelta;
      const stepSize = 0.05;
      let newZoomLevel = window.zoomLevel + (delta < 0 ? stepSize : -stepSize);
      newZoomLevel = Math.max(0.5, Math.min(5, newZoomLevel));

      // --- ИСПРАВЛЕНИЕ: Обновляем глобальную window.zoomLevel ---
      window.zoomLevel = Math.round(newZoomLevel * 100) / 100;

      if (zoomValueDisplay) {
        // --- ИСПРАВЛЕНИЕ: Используем window.zoomLevel для отображения ---
        zoomValueDisplay.textContent = `${Math.round(window.zoomLevel * 100)}%`;
      }
      // Вызываем applyZoom, которая уже использует window.zoomLevel
      applyZoom();
    };

    mediaBlock.wheelEventHandler = wheelHandler; // Сохраняем ссылку
    mediaBlock.addEventListener("wheel", wheelHandler, { passive: false });
    mediaBlock.dataset.wheelHandlerAttached = "true";
    console.log("Wheel listener attached to mediaBlock.");
  } else {
    console.warn("mediaBlock not found for wheel listener.");
  }

  console.log("--- initializeZoomControlsListeners finished ---");
}

// Общая инициализация всех кнопок панели действий
function initAllActionButtons() {
  console.log("Initializing common action panel buttons...");
  initActionButtons(); // Download, Clear Highlights (actionPanel.js)
  initShowHiddenButton(); // Show Hidden Text (actionPanel.js)
  initToggleMediaButton(); // Toggle Media (actionPanel.js)
  initToggleTextButton(); // Toggle Text (actionPanel.js)
  // initCopyZoomButton(); // <-- УДАЛЕН ВЫЗОВ
}

// Инициализация сворачиваемых панелей в блоке управления
function initCollapsiblePanels() {
  const controlTitles = document.querySelectorAll(
    ".controls-panel .control-title"
  );
  if (controlTitles.length === 0) return;
  console.log(`Initializing ${controlTitles.length} collapsible panels...`);
  controlTitles.forEach((title, index) => {
    const group = title.closest(".control-group");
    if (group) {
      group.classList.toggle("collapsed", index !== 0);
      title.addEventListener("click", () => {
        group.classList.toggle("collapsed");
      });
    }
  });
}

// Инициализирует кнопку копирования масштаба по заданному XPath
function initCopyZoomButtonByXPath() {
  console.log("Attempting to initialize copy-zoom button directly by XPath...");

  // Функция для получения элемента по XPath
  function getElementByXPath(xpath) {
    return document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  }

  // Непосредственно выбираем кнопку по XPath, предоставленному пользователем
  const copyZoomBtn = getElementByXPath(
    "/html/body/div[1]/main/div[2]/div[3]/div[2]/button[4]"
  );

  if (copyZoomBtn) {
    console.log("Copy-zoom button found by XPath! Button:", copyZoomBtn);

    // Удаляем старый обработчик, если он был
    if (copyZoomBtn.copyZoomHandler) {
      copyZoomBtn.removeEventListener("click", copyZoomBtn.copyZoomHandler);
      console.log("Removed existing handler from copy-zoom button.");
    }

    // Привязываем функцию copyZoomToAllMedia к кнопке
    copyZoomBtn.copyZoomHandler = copyZoomToAllMedia;
    copyZoomBtn.addEventListener("click", copyZoomToAllMedia);
    copyZoomBtn.dataset.handlerAttached = "true";

    console.log(
      "Successfully attached copyZoomToAllMedia to the button using XPath approach."
    );
  } else {
    console.error(
      "Could not find copy-zoom button by XPath '/html/body/div[1]/main/div[2]/div[3]/div[2]/button[4]'"
    );
  }
}

console.log("post.js module execution finished.");
