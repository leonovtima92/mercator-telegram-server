document.addEventListener("DOMContentLoaded", function () {
  const fontSlider = document.getElementById("fontSlider");
  const layoutButtons = document.querySelectorAll(".layout-btn");
  const postContainer = document.getElementById("post-container");
  const displayContainer = document.getElementById("display-container");

  const saveArchiveButton = document.getElementById("saveArchiveButton");
  const saveArchiveText = document.getElementById("saveArchiveText");
  const archiveSpinner = document.getElementById("archiveSpinner");

  // Изменение размера текста
  fontSlider.addEventListener("input", function () {
    const textBlocks = postContainer.querySelectorAll(".text-block");
    textBlocks.forEach((el) => {
      el.style.fontSize = fontSlider.value + "px";
    });
  });

  // Обработка кликов по кнопкам расположения медиа
  layoutButtons.forEach((button) => {
    button.addEventListener("click", function () {
      layoutButtons.forEach((btn) => btn.classList.remove("active"));
      this.classList.add("active");
      const layout = this.getAttribute("data-layout");
      postContainer.classList.remove(
        "layout-top",
        "layout-left",
        "layout-right"
      );
      postContainer.classList.add("layout-" + layout);
      if (layout === "top") {
        displayContainer.style.aspectRatio = "auto";
        displayContainer.style.height = "auto";
      } else {
        displayContainer.style.aspectRatio = "16 / 9";
        displayContainer.style.height = "";
      }
    });
  });

  // Обработка клика по кнопке "Сохранить архив"
  saveArchiveButton.addEventListener("click", function () {
    saveArchiveButton.disabled = true;
    saveArchiveText.style.display = "none";
    archiveSpinner.style.display = "inline-block";
    // Используем html2canvas для захвата содержимого postContainer
    html2canvas(postContainer, { scrollY: -window.scrollY })
      .then((canvas) => {
        // Получаем данные изображения в формате base64 (без префикса)
        const dataUrl = canvas.toDataURL("image/png");
        const base64Data = dataUrl.split(",")[1];
        // Получаем скрытые данные
        const chat = document.getElementById("chat").value;
        const msg_id = document.getElementById("msg_id").value;
        const payload = {
          screenshot: base64Data,
          chat: chat,
          msg_id: msg_id,
        };
        fetch("/save_archive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
          .then((response) => response.blob())
          .then((blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = "archive.zip";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            archiveSpinner.style.display = "none";
            saveArchiveText.style.display = "inline-block";
            saveArchiveButton.disabled = false;
          })
          .catch((error) => {
            console.error("Ошибка при сохранении архива:", error);
            archiveSpinner.style.display = "none";
            saveArchiveText.style.display = "inline-block";
            saveArchiveButton.disabled = false;
          });
      })
      .catch((error) => {
        console.error("Ошибка при захвате скриншота:", error);
        archiveSpinner.style.display = "none";
        saveArchiveText.style.display = "inline-block";
        saveArchiveButton.disabled = false;
      });
  });

  // Логика перетаскивания разделителя (splitter)
  let isDragging = false;
  let splitter = null;
  let mediaBlock = null;
  let startX = 0;
  let startY = 0;
  let initialMediaSize = 0;

  function onMouseDown(e) {
    if (e.target.classList.contains("splitter")) {
      isDragging = true;
      splitter = e.target;
      mediaBlock = postContainer.querySelector(".media-block");
      let layout = "left";
      if (postContainer.classList.contains("layout-top")) layout = "top";
      else if (postContainer.classList.contains("layout-right"))
        layout = "right";
      if (layout === "top") {
        startY = e.clientY;
        initialMediaSize = mediaBlock.getBoundingClientRect().height;
      } else {
        startX = e.clientX;
        initialMediaSize = mediaBlock.getBoundingClientRect().width;
      }
      document.body.style.userSelect = "none";
    }
  }

  function onMouseMove(e) {
    if (!isDragging || !mediaBlock) return;
    let layout = "left";
    if (postContainer.classList.contains("layout-top")) layout = "top";
    else if (postContainer.classList.contains("layout-right")) layout = "right";
    if (layout === "top") {
      const dy = e.clientY - startY;
      const containerHeight = postContainer.clientHeight;
      let newSize = initialMediaSize + dy;
      newSize = Math.max(50, Math.min(newSize, containerHeight - 50));
      mediaBlock.style.flex = `0 0 ${newSize}px`;
    } else {
      const dx = e.clientX - startX;
      const containerWidth = postContainer.clientWidth;
      let newSize = initialMediaSize + (layout === "left" ? dx : -dx);
      newSize = Math.max(50, Math.min(newSize, containerWidth - 50));
      mediaBlock.style.flex = `0 0 ${newSize}px`;
    }
  }

  function onMouseUp() {
    isDragging = false;
    splitter = null;
    document.body.style.userSelect = "";
  }

  postContainer.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});
