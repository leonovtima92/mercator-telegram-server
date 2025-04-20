import { showToast } from "./utils.js";
import { showAllHiddenText } from "./textControls.js";
import {
  applyLayoutAdjustments,
  getLayoutType,
  initResizableSplitter,
} from "./layoutControls.js";
import {
  chatId,
  messageId,
  mediaList,
  currentMedia,
  currentMediaIndex,
  zoomLevel,
  removedTextFragments,
  highlightObserver,
  getMediaSettings,
  updateMediaSettings,
} from "../post.js";

// Проверяем доступность html2canvas (должен быть подключен в HTML)
if (typeof html2canvas === "undefined") {
  console.error("html2canvas library is not loaded!");
}

// Флаг для предотвращения одновременного скачивания
let isDownloading = false;

// Ссылки на обработчики для возможности их удаления
let handleToggleMediaClick;
let handleToggleTextClick;

// ---------------- Action Buttons Init (Common) ------------------
// Инициализирует кнопки "Скачать" и "Очистить выделения"
export function initActionButtons() {
  const actionButtons = document.querySelectorAll(".btn-action");

  actionButtons.forEach((button) => {
    const action = button.getAttribute("data-action");

    // Пропускаем кнопки, которые инициализируются отдельно
    if (
      ["toggle-media", "toggle-text", "show-hidden", "copy-zoom"].includes(
        action
      )
    ) {
      return;
    }

    // Удаляем старый обработчик, если он был
    if (button.dataset.handlerId) {
      try {
        const oldHandlerID = button.dataset.handlerId;
        if (
          window[oldHandlerID] &&
          typeof window[oldHandlerID] === "function"
        ) {
          button.removeEventListener("click", window[oldHandlerID]);
          delete window[oldHandlerID];
        }
      } catch (e) {
        console.warn(
          `Ошибка при удалении старого обработчика для ${action}:`,
          e
        );
      }
    }

    const handleClick = () => {
      console.log(`Нажата кнопка действия: ${action}`);
      switch (action) {
        case "download":
          if (!isDownloading) {
            isDownloading = true;
            downloadCurrentMedia().finally(() => {
              // Даем небольшую задержку перед сбросом флага
              setTimeout(() => {
                isDownloading = false;
              }, 1000);
            });
          } else {
            console.log(
              "Скачивание уже выполняется, новый запрос проигнорирован."
            );
            showToast("Скачивание уже выполняется...", "info");
          }
          break;
        case "clear-highlights":
          clearAllHighlights();
          break;
        default:
          console.warn(`Неизвестное действие для кнопки: ${action}`);
      }
    };

    // Сохраняем обработчик в data-атрибуте (или можно в Map, если много)
    const handlerId = `handler_${action}_${Date.now()}`;
    button.dataset.handlerId = handlerId;
    window[handlerId] = handleClick; // Сохраняем в window для возможности удаления по ID
    button.addEventListener("click", handleClick);
  });
  console.log(
    "Common action buttons (download, clear-highlights) initialized."
  );
}

// ----------- Download Archive -----------
// Вспомогательная функция для скачивания архива с медиа, текстом и скриншотами
async function downloadCurrentMedia() {
  if (!chatId || !messageId) {
    showToast("Не удалось определить ID чата/сообщения", "error");
    return Promise.reject("Missing IDs");
  }
  const postContainerWrapper = document.querySelector(
    ".post-container-wrapper"
  );
  const textBlock = document.querySelector(".text-block");
  if (!postContainerWrapper) {
    showToast("Не найден контейнер поста", "error");
    return Promise.reject("Missing container");
  }

  showToast("Подготовка архива...", "info");

  const splitter = document.querySelector(".splitter");
  const mediaBlock = document.querySelector(".media-block");
  const postContainerElement = document.querySelector(".post-container");
  const controlsPanel = document.querySelector(".controls-panel");

  const savedStates = {
    splitter: { display: splitter?.style.display, element: splitter },
    media: { display: mediaBlock?.style.display, element: mediaBlock },
    container: {
      display: postContainerElement?.style.display,
      gridTemplateColumns: postContainerElement?.style.gridTemplateColumns,
      element: postContainerElement,
    },
    controls: { display: controlsPanel?.style.display, element: controlsPanel },
    scrollY: window.scrollY,
    originalStyles: new Map(),
  };

  // Функция для подготовки DOM к скриншоту (белый фон, скрытие контролов)
  function prepareDOMForScreenshot() {
    console.log("Preparing DOM for screenshot...");
    const postContainerWrapper = document.querySelector(
      ".post-container-wrapper"
    );
    const textBlock = document.querySelector(".text-block");
    const mediaBlock = document.querySelector(".media-block");

    // Сохраняем только стили основных контейнеров и элементов управления
    const elementsToSaveStyle = [
      document.body,
      postContainerWrapper,
      textBlock,
      mediaBlock,
      document.querySelector(".controls-panel"), // Добавляем панель для сохранения стиля display
    ].filter((el) => el);

    // Очищаем старые сохраненные стили
    savedStates.originalStyles.clear();

    elementsToSaveStyle.forEach((el) => {
      savedStates.originalStyles.set(el, {
        backgroundColor: el.style.backgroundColor,
        background: el.style.background,
        boxShadow: el.style.boxShadow,
        border: el.style.border,
        color: el.style.color,
        display: el.style.display, // Сохраняем и display
      });
    });

    // Скрываем панель управления напрямую
    const controlsPanel = document.querySelector(".controls-panel");
    if (controlsPanel) {
      savedStates.controls.element = controlsPanel; // Сохраняем ссылку для restoreDOM
      savedStates.controls.display = controlsPanel.style.display; // Сохраняем оригинальный display
      controlsPanel.style.display = "none";
    }

    // Добавляем стиль, который применит нужные изменения через CSS
    const style = document.createElement("style");
    style.id = "temp-screenshot-style";
    style.innerHTML = `
          /* Применяем белый фон только к основным контейнерам */
          body, .post-container-wrapper, .text-block, .media-block {
              background-color: white !important;
              background: white !important;
              box-shadow: none !important;
              border: none !important;
          }
          /* Стили для .highlight и других дочерних элементов НЕ трогаем,
             они будут использовать свои стили или унаследуют цвет текста */

          /* Скрываем панель управления и скроллбары */
          .controls-panel { display: none !important; }
          ::-webkit-scrollbar { display: none; }
          * { scrollbar-width: none; }
      `;
    document.head.appendChild(style);
    window.scrollTo(0, 0);
    return style;
  }

  // Функция для восстановления DOM после скриншота
  function restoreDOM(tempStyle) {
    console.log("Restoring DOM after screenshot...");
    if (tempStyle?.parentNode) tempStyle.parentNode.removeChild(tempStyle);

    // Восстанавливаем стили для сохраненных элементов
    savedStates.originalStyles.forEach((styles, el) => {
      if (el) {
        el.style.backgroundColor = styles.backgroundColor || "";
        el.style.background = styles.background || "";
        el.style.boxShadow = styles.boxShadow || "";
        el.style.border = styles.border || "";
        el.style.color = styles.color || "";
        el.style.display = styles.display || ""; // Восстанавливаем display
      }
    });
    savedStates.originalStyles.clear();

    // Дополнительно восстанавливаем grid layout для контейнера, если он был
    if (
      savedStates.container.element &&
      savedStates.container.gridTemplateColumns
    ) {
      savedStates.container.element.style.gridTemplateColumns =
        savedStates.container.gridTemplateColumns;
    }

    window.scrollTo(0, savedStates.scrollY);

    // Переинициализация разделителя
    setTimeout(() => {
      if (typeof initResizableSplitter === "function") {
        initResizableSplitter();
      }
    }, 100);
  }

  // Функция для захвата полного текстового блока
  async function captureTextBlock(captureWithHighlights = true) {
    const textContentElement = document.querySelector(".post-text-content");
    const textBlock = document.querySelector(".text-block");
    if (!textBlock || !textContentElement) return null;

    console.log(
      `Capturing full text block... ${
        captureWithHighlights ? "WITH" : "WITHOUT"
      } highlights`
    );
    const originalHeight = textBlock.style.height;
    const originalOverflow = textBlock.style.overflow;
    const originalMaxHeight = textBlock.style.maxHeight;
    const scrollHeight = textBlock.scrollHeight;
    const captureHeight = scrollHeight + 10; // Добавляем небольшой запас

    console.log(
      `Calculated scrollHeight: ${scrollHeight}, using captureHeight: ${captureHeight}`
    ); // Логируем высоту

    // Временно разворачиваем блок для захвата
    textBlock.style.height = `${captureHeight}px`; // Используем высоту с запасом
    textBlock.style.maxHeight = "none";
    textBlock.style.overflow = "visible";

    let replacedNodesInfo = [];

    if (highlightObserver) {
      console.log("Disconnecting highlight observer before DOM manipulation.");
      highlightObserver.disconnect();
    }

    if (!captureWithHighlights) {
      const highlightElements = textContentElement.querySelectorAll(
        ".highlight:not(.hidden-marker)"
      );
      if (highlightElements.length > 0) {
        console.log(
          `Temporarily replacing ${highlightElements.length} highlights with text nodes.`
        );
        highlightElements.forEach((highlightEl) => {
          const parentNode = highlightEl.parentNode;
          if (!parentNode) return;
          const textContent = highlightEl.textContent;
          const nextSibling = highlightEl.nextSibling;
          const textNode = document.createTextNode(textContent);
          try {
            parentNode.replaceChild(textNode, highlightEl);
            replacedNodesInfo.push({
              originalNode: highlightEl,
              textNode: textNode,
              parentNode: parentNode,
              nextSibling: nextSibling,
            });
          } catch (e) {
            console.error("Error replacing highlight node:", e, highlightEl);
          }
        });
      }
    }

    // Увеличиваем задержку до 500ms
    await new Promise((resolve) => setTimeout(resolve, 500));

    let screenshotDataUrl = null;
    try {
      const canvas = await html2canvas(textBlock, {
        allowTaint: true,
        useCORS: true,
        logging: false,
        scale: window.devicePixelRatio || 1,
        backgroundColor: "white",
        height: captureHeight, // Используем высоту с запасом
        windowHeight: captureHeight, // Используем высоту с запасом
        scrollY: 0,
      });
      screenshotDataUrl = canvas.toDataURL("image/png").split(",")[1];
      console.log(
        `Text block screenshot (${
          captureWithHighlights ? "with" : "without"
        } highlights) captured, size:`,
        screenshotDataUrl.length
      );
    } catch (error) {
      console.error(
        `Error capturing text block screenshot (${
          captureWithHighlights ? "with" : "without"
        } highlights):`,
        error
      );
    } finally {
      if (replacedNodesInfo.length > 0) {
        console.log(
          `Restoring ${replacedNodesInfo.length} original highlight nodes.`
        );
        replacedNodesInfo.forEach((info) => {
          try {
            info.parentNode.insertBefore(info.originalNode, info.nextSibling);
            if (info.textNode.parentNode === info.parentNode) {
              info.parentNode.removeChild(info.textNode);
            }
          } catch (e) {
            console.error("Error restoring highlight node:", e, info);
          }
        });
      }

      textBlock.style.height = originalHeight;
      textBlock.style.maxHeight = originalMaxHeight;
      textBlock.style.overflow = originalOverflow;

      if (highlightObserver && textContentElement) {
        console.log("Reconnecting highlight observer after DOM restoration.");
        try {
          highlightObserver.observe(textContentElement, {
            childList: true,
            subtree: true,
            characterData: true,
          });
        } catch (e) {
          console.error("Error reconnecting highlight observer:", e);
        }
      }
    }
    return screenshotDataUrl;
  }

  // Функция для отправки данных на сервер
  function sendArchiveRequest(textScreenshot, highlightedTextScreenshot) {
    // Собираем метаданные (настройки медиа, размеры, выделения)
    const currentMediaSettings = {};
    if (mediaList && mediaList.length > 0) {
      mediaList.forEach((media, index) => {
        // Инициализируем настройки, если их нет
        if (!getMediaSettings(index)) {
          updateMediaSettings(index, { zoom: 1, positionX: 0, positionY: 0 });
        }
        currentMediaSettings[index] = {
          ...getMediaSettings(index),
          originalFilename: media.filename || media.name || `media_${index}`, // Добавляем имя файла
        };
      });
    }
    let mediaBlockWidth = "N/A",
      mediaBlockHeight = "N/A";
    if (savedStates.media.element) {
      mediaBlockWidth = savedStates.media.element.offsetWidth;
      mediaBlockHeight = savedStates.media.element.offsetHeight;
    }

    const highlightsData = [];
    const textContentElement = document.querySelector(".post-text-content");
    if (textContentElement && textBlock) {
      const textBlockRect = textBlock.getBoundingClientRect();
      const highlightElements = textContentElement.querySelectorAll(
        ".highlight:not(.hidden-marker)"
      );
      highlightElements.forEach((highlightEl) => {
        const highlightText = highlightEl.textContent;
        const linesCoords = [];
        const range = document.createRange();
        range.selectNodeContents(highlightEl);
        const lineRects = range.getClientRects();
        for (let i = 0; i < lineRects.length; i++) {
          const rect = lineRects[i];
          linesCoords.push({
            startX: (rect.left - textBlockRect.left).toFixed(2),
            startY: (
              rect.top -
              textBlockRect.top +
              textBlock.scrollTop
            ).toFixed(2), // Учитываем скролл текста
            endX: (rect.right - textBlockRect.left).toFixed(2),
            endY: (
              rect.bottom -
              textBlockRect.top +
              textBlock.scrollTop
            ).toFixed(2),
          });
        }
        if (linesCoords.length > 0)
          highlightsData.push({ text: highlightText, lines: linesCoords });
      });
    }

    console.log("Sending data to /save_archive (without page screenshot)");
    // console.log("Media Settings:", currentMediaSettings);
    // console.log("Highlights:", highlightsData);

    fetch("/save_archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text_screenshot: textScreenshot, // Скриншот БЕЗ выделений (или такой же, если их нет)
        highlighted_text_screenshot: highlightedTextScreenshot, // Скриншот С выделениями
        chat: chatId,
        msg_id: messageId,
        media_settings: currentMediaSettings,
        media_block_width: mediaBlockWidth,
        media_block_height: mediaBlockHeight,
        highlights: highlightsData,
      }),
    })
      .then((response) => {
        if (response.ok) return response.blob();
        // Пытаемся получить текст ошибки от сервера
        return response.text().then((text) => {
          throw new Error(text || "Server error");
        });
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `telegram_post_${chatId}_${messageId}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("Архив успешно создан и загружен!", "success");
      })
      .catch((error) => {
        console.error("Ошибка при скачивании архива:", error);
        showToast(`Ошибка создания архива: ${error.message}`, "error");
      });
  }

  // --- Основная логика процесса скачивания ---
  let tempStyle = null;
  try {
    tempStyle = prepareDOMForScreenshot();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Создаем ДВА скриншота текста
    const highlightedTextScreenshot = await captureTextBlock(true); // С выделениями
    const textScreenshot = await captureTextBlock(false); // Без выделений

    restoreDOM(tempStyle); // Восстанавливаем DOM как можно скорее

    // Если скриншот без выделений не получился, используем тот, что с выделениями
    const finalTS = textScreenshot ? textScreenshot : highlightedTextScreenshot;
    const finalHighlightedTS = highlightedTextScreenshot;

    if (!finalTS && !finalHighlightedTS) {
      showToast("Не удалось создать скриншот текста.", "warning");
      // Продолжаем без текстовых скриншотов, если они не критичны
    }

    // Передаем ОБА скриншота (или null, если не создались)
    sendArchiveRequest(finalTS, finalHighlightedTS);

    return Promise.resolve();
  } catch (error) {
    console.error("Ошибка в процессе создания скриншотов:", error);
    if (tempStyle) restoreDOM(tempStyle);
    showToast("Ошибка при создании скриншотов", "error");
    return Promise.reject(error);
  } finally {
    // Сбрасываем флаг isDownloading здесь, если restoreDOM не асинхронный
    // Если restoreDOM асинхронный, нужно делать это после его завершения
    // setTimeout(() => { isDownloading = false; }, 1000); // Перенесли из initActionButtons
  }
}

// ----------- Other Actions -----------
// Очищает все элементы .highlight из текстового блока
function clearAllHighlights() {
  const highlights = document.querySelectorAll(
    ".post-text-content .highlight:not(.hidden-marker)"
  );
  if (highlights.length === 0) {
    showToast("Нет выделений для удаления", "info");
    return;
  }
  let removedCount = 0;
  let errorOccurred = false;

  // Отключаем observer перед массовым изменением DOM
  if (highlightObserver) {
    console.log(
      "Disconnecting highlight observer before clearing all highlights."
    );
    highlightObserver.disconnect();
  }

  highlights.forEach((highlight) => {
    const parent = highlight.parentNode;
    if (parent) {
      try {
        // Перемещаем содержимое span ПЕРЕД ним
        while (highlight.firstChild) {
          parent.insertBefore(highlight.firstChild, highlight);
        }
        // Удаляем пустой span
        parent.removeChild(highlight);
        removedCount++;
      } catch (err) {
        console.error(
          "Ошибка при удалении выделения (clearAllHighlights):",
          err,
          highlight
        );
        errorOccurred = true;
        // Пытаемся оставить узел как есть, если не удалось удалить
      }
    } else {
      console.warn(
        "Highlight node without parent found during clearAll:",
        highlight
      );
    }
  });

  // Повторно подключаем observer ПОСЛЕ всех изменений
  const textContentElement = document.querySelector(".post-text-content");
  if (highlightObserver && textContentElement) {
    console.log(
      "Reconnecting highlight observer after clearing all highlights."
    );
    try {
      highlightObserver.observe(textContentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch (e) {
      console.error("Error reconnecting highlight observer:", e);
    }
  }

  if (removedCount > 0 && !errorOccurred) {
    showToast(`Удалено ${removedCount} выделений`, "success");
    // Очищаем массив скрытых фрагментов, т.к. удаление выделений может сделать его неактуальным
    window.removedTextFragments = [];
    if (chatId && messageId) {
      localStorage.removeItem(`removed_fragments_${chatId}_${messageId}`);
      console.log(
        "LocalStorage для удаленных фрагментов очищен после clearAllHighlights."
      );
    }
  } else if (errorOccurred) {
    showToast("Произошла ошибка при удалении некоторых выделений", "error");
  } else if (removedCount === 0) {
    // Если были элементы highlight, но ни один не удалился (например, из-за ошибок)
    showToast("Не удалось удалить выделения", "warning");
  }
}

// Инициализирует кнопку "Показать скрытый текст"
export function initShowHiddenButton() {
  const showHiddenBtn = document.querySelector(
    '.btn-action[data-action="show-hidden"]'
  );
  if (showHiddenBtn) {
    // Удаляем старый обработчик, если был
    if (
      showHiddenBtn.dataset.handlerId &&
      window[showHiddenBtn.dataset.handlerId]
    ) {
      showHiddenBtn.removeEventListener(
        "click",
        window[showHiddenBtn.dataset.handlerId]
      );
      delete window[showHiddenBtn.dataset.handlerId];
    }
    // Добавляем новый
    const handleClick = () => {
      console.log("Нажата кнопка 'Показать скрытый текст'");
      showAllHiddenText(); // Вызов функции из textControls.js
    };
    const handlerId = `handler_showHidden_${Date.now()}`;
    showHiddenBtn.dataset.handlerId = handlerId;
    window[handlerId] = handleClick;
    showHiddenBtn.addEventListener("click", handleClick);
    console.log("Show hidden text button initialized.");
  }
}

// ----------- Toggle Media/Text Visibility -----------
// Инициализирует кнопку переключения видимости медиа
export function initToggleMediaButton() {
  const toggleMediaBtn = document.querySelector(
    '.btn-action[data-action="toggle-media"]'
  );
  const mediaBlock = document.querySelector(".media-block");

  if (!toggleMediaBtn || !mediaBlock) {
    console.warn("Элементы для кнопки toggle-media не найдены.");
    return;
  }

  // Получаем HTML иконки один раз
  const iconHTML = toggleMediaBtn.querySelector("i")?.outerHTML || "";
  // Устанавливаем иконку как ЕДИНСТВЕННОЕ содержимое кнопки
  toggleMediaBtn.innerHTML = iconHTML;

  // Удаляем старый обработчик
  if (handleToggleMediaClick) {
    toggleMediaBtn.removeEventListener("click", handleToggleMediaClick);
  }

  handleToggleMediaClick = () => {
    const isHidden = mediaBlock.classList.contains("hidden-block");
    toggleMediaVisibility(!isHidden);
    const newTitle = !isHidden ? "Показать медиа" : "Скрыть медиа";
    toggleMediaBtn.title = newTitle;
    toggleMediaBtn.classList.toggle("toggled", !isHidden);
    checkAllHidden();
  };

  // Устанавливаем начальное состояние title и класса
  const initiallyHidden = mediaBlock.classList.contains("hidden-block");
  const initialTitle = initiallyHidden ? "Скрыть медиа" : "Показать медиа";
  toggleMediaBtn.title = initialTitle;
  toggleMediaBtn.classList.toggle("toggled", initiallyHidden);

  toggleMediaBtn.addEventListener("click", handleToggleMediaClick);
  console.log(
    `Initial media visibility set to: ${initiallyHidden ? "hidden" : "visible"}`
  );
}

// Инициализирует кнопку переключения видимости текста
export function initToggleTextButton() {
  const toggleTextBtn = document.querySelector(
    '.btn-action[data-action="toggle-text"]'
  );
  const textBlock = document.querySelector(".text-block");

  if (!toggleTextBtn || !textBlock) {
    console.warn("Элементы для кнопки toggle-text не найдены.");
    return;
  }

  // Получаем HTML иконки один раз
  const iconHTML = toggleTextBtn.querySelector("i")?.outerHTML || "";
  // Устанавливаем иконку как ЕДИНСТВЕННОЕ содержимое кнопки
  toggleTextBtn.innerHTML = iconHTML;

  // Удаляем старый обработчик
  if (handleToggleTextClick) {
    toggleTextBtn.removeEventListener("click", handleToggleTextClick);
  }

  handleToggleTextClick = () => {
    const isHidden = textBlock.classList.contains("hidden-block");
    toggleTextVisibility(!isHidden);
    const newTitle = !isHidden ? "Показать текст" : "Скрыть текст";
    toggleTextBtn.title = newTitle;
    toggleTextBtn.classList.toggle("toggled", !isHidden);
    checkAllHidden();
  };

  // Устанавливаем начальное состояние title и класса
  const initiallyHidden = textBlock.classList.contains("hidden-block");
  const initialTitle = initiallyHidden ? "Скрыть текст" : "Показать текст";
  toggleTextBtn.title = initialTitle;
  toggleTextBtn.classList.toggle("toggled", initiallyHidden);

  toggleTextBtn.addEventListener("click", handleToggleTextClick);
  console.log(
    `Initial text visibility set to: ${initiallyHidden ? "hidden" : "visible"}`
  );
}

// Управляет видимостью блока медиа и разделителя
function toggleMediaVisibility(hide) {
  const mediaBlock = document.querySelector(".media-block");
  const textBlock = document.querySelector(".text-block");
  const splitter = document.querySelector(".splitter");
  const postContainer = document.querySelector(".post-container");

  if (!mediaBlock || !textBlock || !splitter || !postContainer) return;

  mediaBlock.classList.toggle("hidden-block", hide);
  postContainer.classList.toggle("media-is-hidden", hide);

  // Скрываем сплиттер, если ЭТОТ блок скрыт
  splitter.classList.toggle("hidden-block", hide);

  console.log(`Media block visibility set to: ${hide ? "hidden" : "visible"}`);
  checkAllHidden();
}

// Управляет видимостью блока текста и разделителя
function toggleTextVisibility(hide) {
  const textBlock = document.querySelector(".text-block");
  const mediaBlock = document.querySelector(".media-block");
  const splitter = document.querySelector(".splitter");
  const postContainer = document.querySelector(".post-container");

  if (!textBlock || !mediaBlock || !splitter || !postContainer) return;

  textBlock.classList.toggle("hidden-block", hide);
  postContainer.classList.toggle("text-is-hidden", hide);

  // Скрываем сплиттер, если ЭТОТ блок скрыт
  splitter.classList.toggle("hidden-block", hide);

  console.log(`Text block visibility set to: ${hide ? "hidden" : "visible"}`);
  checkAllHidden();
}

// Проверяет, скрыты ли оба блока, и показывает/скрывает предупреждение
export function checkAllHidden() {
  const mediaBlock = document.querySelector(".media-block");
  const textBlock = document.querySelector(".text-block");
  const warningBlock = document.getElementById("all-hidden-warning");

  const isMediaHidden = mediaBlock?.classList.contains("hidden-block");
  const isTextHidden = textBlock?.classList.contains("hidden-block");
  const isWarningHidden = warningBlock?.classList.contains("hidden-block");

  console.log(
    `Check all hidden: media=${isMediaHidden}, text=${isTextHidden}, warning=${isWarningHidden}`
  );

  if (isMediaHidden && isTextHidden) {
    if (warningBlock) warningBlock.classList.remove("hidden-block");
  } else {
    if (warningBlock) warningBlock.classList.add("hidden-block");
  }
}

// Копирует настройки текущего медиа на все остальные
export function copyZoomToAllMedia() {
  console.log("--- copyZoomToAllMedia: Function entered ---");
  // Используем импортированные переменные
  if (!window.currentMedia || !mediaList) {
    showToast(
      "Невозможно скопировать настройки: данные медиа не загружены.",
      "error"
    );
    return;
  }

  const currentIdx = window.currentMediaIndex;
  const currentSettings = getMediaSettings(currentIdx);

  if (!currentSettings) {
    showToast(
      "Невозможно скопировать настройки: нет настроек для текущего медиа.",
      "error"
    );
    return;
  }

  // Сначала сохраняем текущие настройки
  const transform = getComputedStyle(window.currentMedia).transform;
  const matrix = new DOMMatrix(transform);

  // Обновляем настройки с текущими значениями из DOM
  currentSettings.zoom = window.zoomLevel;
  currentSettings.positionX = matrix.e;
  currentSettings.positionY = matrix.f;

  // Обновляем настройки для текущего медиа
  updateMediaSettings(currentIdx, currentSettings);

  const zoom = currentSettings.zoom;
  const posX = currentSettings.positionX;
  const posY = currentSettings.positionY;

  let copiedCount = 0;
  mediaList.forEach((media, index) => {
    if (index !== currentIdx) {
      const existingSettings = getMediaSettings(index);
      const newSettingsForIndex = {
        ...existingSettings,
        zoom: zoom,
        positionX: posX,
        positionY: posY,
      };
      updateMediaSettings(index, newSettingsForIndex);
      copiedCount++;
    }
  });

  showToast(
    `Настройки (Zoom: ${Math.round(zoom * 100)}%, Pos: ${Math.round(
      posX
    )}px, ${Math.round(posY)}px) скопированы в ${copiedCount} других медиа.`,
    "success"
  );
  console.log(`Settings data copied for ${copiedCount} other media items.`);
}

// Инициализирует кнопку "Копировать Zoom/Pos"
export function initCopyZoomButton() {
  const copyZoomBtn = document.querySelector(
    '.btn-action[data-action="copy-zoom"]'
  );
  if (!copyZoomBtn) {
    console.warn("Copy Zoom button not found.");
    return;
  }

  // Удаляем старый обработчик, если он был (по атрибуту)
  if (copyZoomBtn.dataset.clickHandlerAttached) {
    copyZoomBtn.removeEventListener("click", copyZoomToAllMedia);
    console.log("Removed old copyZoomToAllMedia listener.");
  }

  // Добавляем новый обработчик
  copyZoomBtn.addEventListener("click", copyZoomToAllMedia);
  copyZoomBtn.dataset.clickHandlerAttached = "true"; // Помечаем, что обработчик добавлен

  console.log("Copy zoom button initialized/re-initialized.");
}
