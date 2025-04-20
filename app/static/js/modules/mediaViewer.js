import { showToast } from "./utils.js";
import {
  getMediaSettings,
  updateMediaSettings,
  chatId,
  messageId,
  mediaList,
  placeholderSrc,
  zoomLevel, // Импортируем или передаем
  currentMedia, // Импортируем или передаем
  currentMediaIndex, // Импортируем или передаем
} from "../post.js"; // Предполагаем, что они экспортированы из post.js или управляем состоянием иначе

// -------------- Local Module State (alternative to global) --------------
// let localCurrentMedia = null;
// let localCurrentMediaIndex = 0;
// let localZoomLevel = 1;
// let localMediaSettings = {};

// Функции для обновления состояния, если оно локальное

// Intersection Observer for lazy loading media
let mediaObserver = null;

// --------------------- Initialization ---------------------
export function initMediaViewer() {
  console.log("Initializing Media Viewer with media list:", mediaList);

  if (mediaList && mediaList.length > 0) {
    console.log(`Найдено ${mediaList.length} медиа-файлов`);
    mediaList.forEach((item, idx) => {
      console.log(`Медиа #${idx + 1}:`, item);
    });

    setupMediaObserver();

    fetch(`/media/${chatId}/${messageId}/check`)
      .then((response) => {
        console.log("Проверка подключения к серверу:", response.status);
      })
      .catch((error) => {
        console.warn("Ошибка при проверке подключения:", error);
      });
  } else {
    console.warn("Список медиа отсутствует или пуст");
  }

  loadMedia(0); // Load the first media

  const prevButton = document.querySelector(".prev-media");
  const nextButton = document.querySelector(".next-media");

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      navigateMedia(-1);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      navigateMedia(1);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      navigateMedia(-1);
    } else if (e.key === "ArrowRight") {
      navigateMedia(1);
    }
  });
}

// --------------------- Media Loading ---------------------
export function loadMedia(index) {
  console.log("Loading media at index:", index, "Media list:", mediaList);
  if (!mediaList || mediaList.length === 0) {
    console.warn("No media available");
    return;
  }

  index = Math.max(0, Math.min(mediaList.length - 1, index));
  // currentMediaIndex = index; // Управляем через post.js или state manager
  // Вместо прямого присваивания, возможно, потребуется функция для обновления индекса
  window.currentMediaIndex = index; // Временное решение: используем глобальный объект window

  const currentIndexElem = document.querySelector(".current-index");
  const totalCountElem = document.querySelector(".total-count");

  if (currentIndexElem) {
    currentIndexElem.textContent = index + 1;
  }
  if (totalCountElem) {
    totalCountElem.textContent = mediaList.length;
  }

  const mediaContainer = document.querySelector(".current-media");
  if (!mediaContainer) {
    console.warn("Media container not found");
    return;
  }

  mediaContainer.innerHTML = "";

  const loaderElement = document.createElement("div");
  loaderElement.className = "media-loader";
  loaderElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin fa-2x"></i>';
  mediaContainer.appendChild(loaderElement);

  const mediaItem = mediaList[index];
  console.log("Media item to load:", mediaItem);

  if (!mediaItem) {
    console.error("Media item is undefined at index", index);
    showMediaError(mediaContainer, loaderElement, "Отсутствуют данные о медиа");
    return;
  }

  console.log(
    `Данные медиа: type=${mediaItem.type || "неизвестно"}, id=${
      mediaItem.id || "неизвестно"
    }, chatId=${chatId}, messageId=${messageId}, index=${index}`
  );

  let mediaElement;
  try {
    // ... (весь блок определения типа медиа isImage, isVideo и т.д.) ...
    const mediaType = (
      mediaItem.media_type ||
      mediaItem.type ||
      ""
    ).toLowerCase();
    const videoInfo =
      mediaItem.video_info || mediaItem.videoInfo || mediaItem.video || {};
    let filename = mediaItem.filename || mediaItem.name || "";
    if (videoInfo && videoInfo.filename) {
      filename = videoInfo.filename;
    }
    const fileExt = filename.split(".").pop().toLowerCase();
    const isImageExt = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "bmp",
      "svg",
    ].includes(fileExt);
    const isVideoExt = [
      "mp4",
      "webm",
      "ogg",
      "mov",
      "avi",
      "wmv",
      "flv",
      "mkv",
      "3gp",
      "m4v",
    ].includes(fileExt);
    let mimeType = (mediaItem.mime_type || "").toLowerCase();
    if (videoInfo && videoInfo.mime_type) {
      mimeType = videoInfo.mime_type.toLowerCase();
    }
    const isImageMime = mimeType.startsWith("image/");
    const isVideoMime = mimeType.startsWith("video/");
    const hasVideoField = Boolean(
      mediaItem.video || mediaItem.videoInfo || mediaItem.video_info
    );
    const hasVideoMention = Boolean(
      (mediaItem.type && mediaItem.type.toLowerCase().includes("video")) ||
        (mediaItem.media_type &&
          mediaItem.media_type.toLowerCase().includes("video"))
    );
    const hasDuration = Boolean(
      mediaItem.duration ||
        (mediaItem.video && mediaItem.video.duration) ||
        (mediaItem.video_info && mediaItem.video_info.duration) ||
        (mediaItem.videoInfo && mediaItem.videoInfo.duration)
    );
    const hasVideoAttributes = Boolean(
      (mediaItem.attributes &&
        mediaItem.attributes.toString().includes("video")) ||
        hasVideoField ||
        hasVideoMention ||
        hasDuration
    );

    const isImage =
      mediaType.includes("photo") ||
      mediaType === "photo" ||
      isImageExt ||
      isImageMime;
    const isVideo =
      mediaType.includes("video") ||
      mediaType === "video" ||
      isVideoExt ||
      isVideoMime ||
      hasVideoAttributes ||
      hasVideoField ||
      hasVideoMention ||
      hasDuration;

    console.log(
      `Определение типа медиа: ${filename}, тип: ${mediaType}, mime: ${mimeType}, ` +
        `isImage: ${isImage}, isVideo: ${isVideo}, hasVideoAttributes: ${hasVideoAttributes}, ` +
        `hasVideoField: ${hasVideoField}, hasVideoMention: ${hasVideoMention}, hasDuration: ${hasDuration}`
    );

    if (isVideo) {
      mediaElement = document.createElement("video");
      mediaElement.className = "media-element lazy-load-media";
      mediaElement.dataset.src = `/media/${chatId}/${messageId}/${index}?_nocache=${Date.now()}&type=video&album=1`;
      mediaElement.dataset.index = index;
      mediaElement.controls = true;
      mediaElement.preload = "metadata";
      mediaElement.playsInline = true;
      mediaElement.autoplay = false;
      console.log(
        `Создан элемент видео для lazy loading с индексом ${index}: data-src=${mediaElement.dataset.src}`
      );
    } else if (isImage) {
      mediaElement = document.createElement("img");
      mediaElement.className = "media-element lazy-load-media";
      mediaElement.dataset.src = `/media/${chatId}/${messageId}/${index}?_nocache=${Date.now()}&album=1`;
      mediaElement.dataset.index = index;
      mediaElement.src = placeholderSrc;
      mediaElement.alt = "Фото";
      console.log(
        `Создан элемент фото для lazy loading с индексом ${index}: data-src=${mediaElement.dataset.src}`
      );
    } else if (
      mediaType.includes("document") ||
      mediaType === "document" ||
      mediaType.includes("file") ||
      mediaType === "file"
    ) {
      if (
        isVideoExt ||
        isVideoMime ||
        hasVideoAttributes ||
        hasVideoField ||
        hasVideoMention ||
        hasDuration
      ) {
        mediaElement = document.createElement("video");
        mediaElement.className = "media-element lazy-load-media";
        mediaElement.dataset.src = `/media/${chatId}/${messageId}/${index}?_nocache=${Date.now()}&type=video&doc=1`;
        mediaElement.dataset.index = index;
        mediaElement.controls = true;
        mediaElement.preload = "metadata";
        mediaElement.playsInline = true;
        mediaElement.autoplay = false;
        console.log(
          `Документ является видео: ${filename}, отображаем как видео (lazy loading) с индексом ${index}`
        );
      } else if (isImageExt || isImageMime) {
        mediaElement = document.createElement("img");
        mediaElement.className = "media-element lazy-load-media";
        mediaElement.dataset.src = `/media/${chatId}/${messageId}/${index}?_nocache=${Date.now()}`;
        mediaElement.dataset.index = index;
        mediaElement.src = placeholderSrc;
        mediaElement.alt = "Фото";
        console.log(
          `Документ является изображением: ${filename}, отображаем как фото (lazy loading) с индексом ${index}`
        );
      } else {
        mediaElement = document.createElement("div");
        mediaElement.className = "document-preview";
        mediaElement.innerHTML = `
           <i class="fa-solid fa-file-lines fa-3x"></i>
           <div class="document-name">${
             mediaItem.filename || mediaItem.name || "Документ"
           }</div>
           <a href="/media/${chatId}/${messageId}/${index}?_nocache=${Date.now()}" 
              class="document-download" download="${
                mediaItem.filename || mediaItem.name || "document"
              }">
              <i class="fa-solid fa-download"></i> Скачать
           </a>
         `;
        console.log(
          `Создан элемент документа для: ${filename} с индексом ${index}`
        );
        loaderElement.remove();
      }
    } else {
      console.log(
        `Неопределенный тип медиа для индекса ${index}, пробуем прямой URL`
      );
      tryDirectMediaUrl(index, mediaContainer, loaderElement);
      return;
    }

    mediaContainer.appendChild(mediaElement);
    window.currentMedia = mediaElement;

    // Настройка Intersection Observer для отложенной загрузки
    if (mediaObserver) {
      mediaObserver.observe(mediaElement);
    }

    // Добавляем применение настроек масштабирования сразу после загрузки медиа
    if (mediaElement.tagName === "IMG" || mediaElement.tagName === "VIDEO") {
      const onMediaFullyLoaded = () => {
        console.log(
          `Медиа #${index} полностью загружено, применяем сохраненные настройки`
        );
        // Небольшая задержка для гарантии отрисовки
        setTimeout(() => applyMediaSettings(index), 50);
      };

      if (mediaElement.tagName === "IMG") {
        // Для изображений
        if (mediaElement.complete) {
          onMediaFullyLoaded();
        } else {
          mediaElement.addEventListener("load", onMediaFullyLoaded, {
            once: true,
          });
        }
      } else {
        // Для видео
        if (mediaElement.readyState >= 2) {
          // HAVE_CURRENT_DATA или выше
          onMediaFullyLoaded();
        } else {
          mediaElement.addEventListener("loadeddata", onMediaFullyLoaded, {
            once: true,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error creating media element:", error);
    showMediaError(
      mediaContainer,
      loaderElement,
      "Ошибка создания элемента медиа"
    );
    return;
  }

  return mediaElement;
}

// --------------------- Navigation ---------------------
function navigateMedia(step) {
  console.log(
    `Навигация с шагом: ${step}, текущий индекс: ${window.currentMediaIndex}, общее количество: ${mediaList.length}`
  );

  if (!mediaList || mediaList.length <= 1) return;

  // Сохраняем текущие настройки медиа перед переключением
  if (window.currentMedia) {
    // Получаем текущие настройки трансформации из DOM
    const transform = getComputedStyle(window.currentMedia).transform;
    const matrix = new DOMMatrix(transform);

    // Получаем существующие настройки и обновляем их текущими значениями
    const currentIdx = window.currentMediaIndex;
    const currentSettings = getMediaSettings(currentIdx);

    const newSettings = {
      ...currentSettings,
      zoom: window.zoomLevel,
      positionX: matrix.e,
      positionY: matrix.f,
    };

    // Обновляем настройки для текущего медиа перед переключением
    updateMediaSettings(currentIdx, newSettings);
    console.log(
      `Сохранены настройки для медиа #${currentIdx} перед переключением:`,
      newSettings
    );
  }

  let newIndex = window.currentMediaIndex + step;

  if (newIndex < 0) {
    newIndex = mediaList.length - 1;
  } else if (newIndex >= mediaList.length) {
    newIndex = 0;
  }

  console.log(`Переключение на медиа с индексом: ${newIndex}`);
  loadMedia(newIndex);
}

// ------------------ Settings Handling -----------------
export function applyMediaSettings(index) {
  if (!window.currentMedia || typeof index === "undefined") {
    console.warn(
      `applyMediaSettings #${index}: Пропущено (нет currentMedia или index)`
    );
    return;
  }

  // 1. Получаем базовый масштаб "cover" (восстанавливаем для совместимости)
  const fitScale = calculateFitScale(index, "cover");

  // 2. Получаем настройки через геттер
  const settings = getMediaSettings(index);
  console.log(
    `applyMediaSettings #${index}: Получены настройки из getMediaSettings(${index}):`,
    JSON.parse(JSON.stringify(settings))
  );

  // 3. Устанавливаем текущий уровень зума для интерфейса
  window.zoomLevel = settings.zoom;
  updateZoomValue();

  // 4. Применяем сохраненную трансформацию напрямую без учета fitScale
  window.currentMedia.style.transform = `translate(${settings.positionX}px, ${settings.positionY}px) scale(${settings.zoom})`;

  console.log(
    `applyMediaSettings #${index}: Применено: fitScale=${fitScale.toFixed(
      3
    )} (не используется), zoom=${settings.zoom}, pos=(${settings.positionX}, ${
      settings.positionY
    })`
  );
}

// Функция ТОЛЬКО для вычисления масштаба ('contain' или 'cover')
// НЕ применяет transform
function calculateFitScale(index, fitType = "cover") {
  // По умолчанию 'cover'
  const mediaElement =
    document.querySelector(
      `.current-media .media-element[data-index="${index}"]`
    ) || window.currentMedia;
  const container = document.querySelector(".current-media");

  if (!mediaElement || !container) {
    console.warn(
      `calculateFitScale #${index}: Не найден медиа-элемент или контейнер.`
    );
    return 1;
  }

  let mediaWidth, mediaHeight;
  if (mediaElement.tagName === "IMG") {
    mediaWidth = mediaElement.naturalWidth;
    mediaHeight = mediaElement.naturalHeight;
  } else if (mediaElement.tagName === "VIDEO") {
    mediaWidth = mediaElement.videoWidth;
    mediaHeight = mediaElement.videoHeight;
  } else {
    return 1;
  }

  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight;

  if (!mediaWidth || !mediaHeight || !containerWidth || !containerHeight) {
    console.warn(`calculateFitScale #${index}: Не удалось получить размеры.`);
    return 1;
  }

  const scaleX = containerWidth / mediaWidth;
  const scaleY = containerHeight / mediaHeight;

  let fitScale;
  if (fitType === "contain") {
    fitScale = Math.min(scaleX, scaleY);
  } else {
    // 'cover'
    fitScale = Math.max(scaleX, scaleY);
  }
  console.log(
    `calculateFitScale #${index} (${fitType}): scaleX=${scaleX.toFixed(
      3
    )}, scaleY=${scaleY.toFixed(3)}, fitScale=${fitScale.toFixed(3)}`
  );
  return fitScale;
}

export function saveCurrentMediaSettings() {
  if (window.currentMedia && typeof window.currentMediaIndex !== "undefined") {
    const index = window.currentMediaIndex;
    const transform = getComputedStyle(window.currentMedia).transform;
    const matrix = new DOMMatrix(transform);
    const currentSettings = getMediaSettings(index);
    const newSettings = {
      ...currentSettings,
      zoom: window.zoomLevel,
      positionX: matrix.e,
      positionY: matrix.f,
    };
    updateMediaSettings(index, newSettings);
    console.log(`Сохранены настройки для медиа #${index}:`, newSettings);
  } else {
    console.warn(
      "saveCurrentMediaSettings: Не удалось сохранить (нет currentMedia или index)."
    );
  }
}

// --------------------- Zoom & View ---------------------
export function applyZoom() {
  // Используем глобальные переменные через window временно
  if (
    window.currentMedia &&
    (window.currentMedia.tagName === "IMG" ||
      window.currentMedia.tagName === "VIDEO")
  ) {
    // 1. Получаем текущую позицию из стиля
    const transform = getComputedStyle(window.currentMedia).transform;
    const matrix = new DOMMatrix(transform);
    const tx = matrix.e; // Текущее смещение X
    const ty = matrix.f; // Текущее смещение Y

    // 2. Применяем НОВЫЙ масштаб (window.zoomLevel) и СТАРУЮ позицию
    window.currentMedia.style.transform = `translate(${tx}px, ${ty}px) scale(${window.zoomLevel})`;

    // 3. СРАЗУ сохраняем новое состояние (новый zoom, старая позиция) в mediaSettings
    if (
      typeof window.currentMediaIndex !== "undefined" &&
      getMediaSettings(window.currentMediaIndex) // Убедимся, что настройки существуют
    ) {
      const settings = getMediaSettings(window.currentMediaIndex);
      // Обновляем только zoom, позиция уже была правильной
      settings.zoom = window.zoomLevel;
      settings.positionX = tx; // Сохраняем текущую позицию
      settings.positionY = ty; // Сохраняем текущую позицию
      updateMediaSettings(window.currentMediaIndex, settings);
      console.log(
        `applyZoom: Сохранены настройки для #${window.currentMediaIndex} после изменения zoom:`,
        settings
      );
    }
  }
}

// Сбрасывает масштаб и позицию ТЕКУЩЕГО медиа к состоянию "cover 100%"
export function resetMediaView() {
  console.log("--- resetMediaView called ---");
  const index = window.currentMediaIndex;
  console.log(`Current index for reset: ${index}`);
  if (typeof index === "undefined") {
    console.warn("resetMediaView: index is undefined, aborting.");
    return;
  }

  const mediaElement =
    document.querySelector(
      `.current-media .media-element[data-index="${index}"]`
    ) || window.currentMedia;

  if (
    mediaElement &&
    (mediaElement.tagName === "IMG" || mediaElement.tagName === "VIDEO")
  ) {
    // 1. Сбрасываем настройки через сеттер на абсолютные значения по умолчанию
    const defaultSettings = { zoom: 1, positionX: 0, positionY: 0 };
    updateMediaSettings(index, defaultSettings);

    // 2. Устанавливаем текущий глобальный уровень зума
    window.zoomLevel = 1;
    updateZoomValue();

    // 3. Применяем трансформацию НАПРЯМУЮ к элементу
    mediaElement.style.transform = `translate(0px, 0px) scale(1)`;

    console.log(`resetMediaView: Сброшены настройки для медиа #${index}`);
    showZoomToast(100, true); // Показываем 100% при сбросе
  } else {
    console.warn("Не найден медиа-элемент для сброса вида.");
  }
}

// Показать всплывающее уведомление о масштабе
function showZoomToast(size, isReset = false) {
  let zoomToast = document.querySelector(".zoom-size-toast");
  if (!zoomToast) {
    zoomToast = document.createElement("div");
    zoomToast.className = "font-size-toast zoom-size-toast"; // Используем тот же стиль, что и для шрифта
    document.body.appendChild(zoomToast);
  }
  if (isReset) {
    zoomToast.innerHTML = `<i class="fa-solid fa-arrows-to-dot"></i> Вид сброшен`;
  } else {
    zoomToast.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Масштаб: ${size}%`;
  }
  zoomToast.classList.add("visible");
  clearTimeout(zoomToast.timeout);
  zoomToast.timeout = setTimeout(() => {
    zoomToast.classList.remove("visible");
  }, 1000);
}

// Update zoom value display (должна быть доступна глобально или передана)
function updateZoomValue() {
  const zoomValueElement = document.querySelector(".zoom-value");
  if (zoomValueElement) {
    zoomValueElement.textContent = `${Math.round(window.zoomLevel * 100)}%`;
  }
}

// --------------------- Dragging ---------------------
function setupMediaDragging(mediaElement) {
  if (!mediaElement) return;

  let isDragging = false;
  let startX = 0,
    startY = 0,
    lastOffsetX = 0,
    lastOffsetY = 0;

  mediaElement.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      e.preventDefault();
      doDrag(e.clientX, e.clientY);
    }
  });
  document.addEventListener("mouseup", () => {
    if (isDragging) endDrag();
  });
  mediaElement.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      e.preventDefault();
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  });
  document.addEventListener("touchmove", (e) => {
    if (isDragging && e.touches.length === 1) {
      e.preventDefault();
      doDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  });
  document.addEventListener("touchend", () => {
    if (isDragging) endDrag();
  });

  mediaElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY || e.detail || e.wheelDelta;
    const stepSize = 0.05;
    let newZoom = window.zoomLevel + (delta < 0 ? stepSize : -stepSize);
    newZoom = Math.max(0.5, Math.min(5, newZoom));
    window.zoomLevel = Math.round(newZoom * 100) / 100;
    updateZoomValue();
    applyZoom();
    showZoomToast(Math.round(window.zoomLevel * 100));
  });

  mediaElement.addEventListener("dblclick", (e) => {
    e.preventDefault();
    resetMediaView();
  });

  function startDrag(x, y) {
    isDragging = true;
    startX = x;
    startY = y;
    const transform = getComputedStyle(mediaElement).transform;
    const matrix = new DOMMatrix(transform);
    lastOffsetX = matrix.e;
    lastOffsetY = matrix.f;
    mediaElement.style.cursor = "grabbing";
    mediaElement.closest(".current-media")?.classList.add("dragging");
  }

  function doDrag(x, y) {
    if (!isDragging) return;
    const dx = x - startX;
    const dy = y - startY;
    mediaElement.style.transform = `translate(${lastOffsetX + dx}px, ${
      lastOffsetY + dy
    }px) scale(${window.zoomLevel})`;
    if (
      typeof window.currentMediaIndex !== "undefined" &&
      getMediaSettings(window.currentMediaIndex)
    ) {
      const settings = getMediaSettings(window.currentMediaIndex);
      settings.positionX = lastOffsetX + dx;
      settings.positionY = lastOffsetY + dy;
      updateMediaSettings(window.currentMediaIndex, settings);
    }
  }

  function endDrag() {
    isDragging = false;
    mediaElement.style.cursor = "grab";
    mediaElement.closest(".current-media")?.classList.remove("dragging");
    if (
      typeof window.currentMediaIndex !== "undefined" &&
      getMediaSettings(window.currentMediaIndex)
    ) {
      const settings = getMediaSettings(window.currentMediaIndex);
      const transform = getComputedStyle(mediaElement).transform;
      const matrix = new DOMMatrix(transform);
      settings.positionX = matrix.e;
      settings.positionY = matrix.f;
      updateMediaSettings(window.currentMediaIndex, settings);
      console.log(
        `Сохранена позиция для медиа #${window.currentMediaIndex} после перетаскивания:`,
        { x: matrix.e, y: matrix.f }
      );
    }
  }
}

// ----------- Intersection Observer Setup & Callback -------------
function setupMediaObserver() {
  const options = {
    root: document.querySelector(".current-media"),
    rootMargin: "0px 0px 200px 0px",
    threshold: 0.01,
  };
  mediaObserver = new IntersectionObserver(handleMediaIntersection, options);
}

function handleMediaIntersection(entries, observer) {
  console.log(
    `IntersectionObserver Callback Fired! Entries count: ${entries.length}`
  );
  entries.forEach((entry) => {
    console.log(
      `  Entry target: ${entry.target.tagName}, isIntersecting: ${entry.isIntersecting}, intersectionRatio: ${entry.intersectionRatio}`
    );
    if (entry.isIntersecting) {
      const element = entry.target;
      const index = parseInt(element.dataset.index, 10);

      console.log(
        `Медиа #${index} пересекло область видимости, загрузка...`,
        element.dataset.src
      );

      const mediaContainer = element.closest(".current-media");
      const loader = mediaContainer?.querySelector(".media-loader");

      // Обработчик, который сработает ПОСЛЕ загрузки размеров
      const onMediaLoaded = () => {
        console.log(`Медиа #${index} (${element.tagName}) загрузило размеры.`);
        if (loader) loader.classList.add("fade-out"); // Плавно убираем лоадер

        // Удаляем обработчики, чтобы не сработали повторно
        element.onload = null;
        element.onloadedmetadata = null;
        element.onerror = null;

        // Устанавливаем текущий медиа элемент для дальнейшей работы
        window.currentMedia = element;
        window.currentMediaIndex = index;

        // Получаем настройки через геттер
        const settings = getMediaSettings(index);
        // Если настройки дефолтные (т.е. их не было), лог об этом не нужен,
        // т.к. getMediaSettings возвращает дефолт

        // Всегда вызываем applyMediaSettings, она использует getMediaSettings
        applyMediaSettings(index);

        setupMediaDragging(element);
      };

      // Обработчик ошибки загрузки
      const onMediaError = () => {
        console.error(
          `Ошибка загрузки медиа #${index} по URL: ${element.dataset.src}`
        );
        if (loader) loader.remove(); // Удаляем лоадер сразу при ошибке
        showMediaError(
          mediaContainer,
          null,
          `Ошибка загрузки медиа #${index + 1}`
        );
        element.onload = null;
        element.onloadedmetadata = null;
        element.onerror = null;
      };

      // Назначаем обработчики
      if (element.tagName === "IMG") {
        element.onload = onMediaLoaded;
        element.onerror = onMediaError;
      } else if (element.tagName === "VIDEO") {
        element.onloadedmetadata = onMediaLoaded;
        element.onerror = onMediaError;
      }

      // Запускаем загрузку
      element.src = element.dataset.src;
      if (element.tagName === "VIDEO") {
        element.load(); // Для видео нужно вызвать load()
      }

      // Перестаем наблюдать за этим элементом
      observer.unobserve(element);
    }
  });
}

// --------------------- Error Handling ---------------------
function showMediaError(container, loader, message) {
  if (loader) loader.remove();
  const errorElement = document.createElement("div");
  errorElement.className = "media-error";
  errorElement.innerHTML = `
           <i class="fa-solid fa-triangle-exclamation"></i>
           <p>${message}</p>
           <button class="retry-media-btn">Повторить загрузку</button>
       `;
  if (container) {
    container.appendChild(errorElement);
  } else {
    console.error("Не удалось найти контейнер для отображения ошибки медиа.");
    showToast("Ошибка загрузки медиа: " + message, "error");
    return;
  }
  setTimeout(() => {
    const btnContainer = container || document;
    const retryBtn = btnContainer.querySelector(".retry-media-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () =>
        loadMedia(window.currentMediaIndex)
      );
    }
  }, 0);
}

// ---------------- Alternative Loaders (kept for now) ---------------
function tryAlternativeVideoLoader(index, container, loader) {
  console.log(`Альтернативная загрузка видео для индекса ${index}`);
  fetch(`/direct_media/${chatId}/${messageId}/${index}?type=video&album=1`)
    .then((response) => {
      if (!response.ok)
        throw new Error(`HTTP ошибка! статус: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (data.url) {
        console.log(`Получен прямой URL для видео: ${data.url}`);
        const videoElement = document.createElement("video");
        videoElement.className = "media-element lazy-load-media"; // Добавляем класс
        videoElement.dataset.src = data.url; // Ставим data-src
        videoElement.controls = true;
        videoElement.preload = "metadata";
        videoElement.playsInline = true;
        videoElement.style.display = "none"; // Скрываем

        container.innerHTML = "";
        container.appendChild(videoElement);

        if (mediaObserver) {
          mediaObserver.observe(videoElement); // Начинаем наблюдение
        } else {
          console.warn("Media observer not ready for alternative loader");
          // Можно либо инициализировать его здесь, либо загрузить сразу
          videoElement.src = data.url;
          videoElement.load();
          // ... (добавить обработчики onload/onerror) ...
        }
      } else {
        throw new Error("URL отсутствует в ответе при альтернативной загрузке");
      }
    })
    .catch((error) => {
      console.error("Ошибка при альтернативной загрузке видео:", error);
      tryDirectMediaUrl(index, container, loader);
    });
}

function tryDirectMediaUrl(index, container, loader) {
  console.log("Пробуем загрузить медиа напрямую по URL");
  fetch(`/direct_media/${chatId}/${messageId}/${index}?type=video&album=1`) // Уточнить URL, если нужно
    .then((response) => {
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      console.log("Получен ответ с прямым URL:", data);
      if (data.url) {
        let element;
        // ... (логика определения isImage/isVideo по data) ...
        const fileExt = data.url.split(".").pop().toLowerCase();
        const isImage =
          ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(
            fileExt
          ) ||
          (data.mime_type && data.mime_type.startsWith("image/"));
        const hasVideoAttributes = true; // Упрощено, нужно смотреть data
        const isVideo =
          [
            "mp4",
            "webm",
            "ogg",
            "mov",
            "avi",
            "wmv",
            "flv",
            "mkv",
            "3gp",
            "m4v",
          ].includes(fileExt) ||
          (data.mime_type && data.mime_type.startsWith("video/")) ||
          hasVideoAttributes;

        if (isVideo) {
          element = document.createElement("video");
          element.className = "media-element lazy-load-media";
          element.dataset.src = data.url;
          element.controls = true;
          element.preload = "metadata";
          element.playsInline = true;
          element.style.display = "none";
        } else if (isImage) {
          element = document.createElement("img");
          element.className = "media-element lazy-load-media";
          element.dataset.src = data.url;
          element.src = placeholderSrc;
          element.alt = "Изображение";
          element.style.display = "none";
        } else {
          element = document.createElement("div");
          element.className = "document-preview";
          element.innerHTML = `...`; // Как раньше
          if (loader) loader.remove();
        }

        container.innerHTML = "";
        container.appendChild(element);

        if (
          mediaObserver &&
          (element.tagName === "IMG" || element.tagName === "VIDEO")
        ) {
          mediaObserver.observe(element);
        } else if (element.tagName !== "IMG" && element.tagName !== "VIDEO") {
          // Документ
        }
      } else {
        throw new Error("URL отсутствует в ответе");
      }
    })
    .catch((error) => {
      console.error("Ошибка при получении прямого URL:", error);
      showMediaError(container, loader, "Не удалось загрузить медиа");
      // ... (код заглушки) ...
    });
}
