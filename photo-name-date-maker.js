"use strict";

(() => {
  const fileInput = document.getElementById("photo-input");
  const browseButton = document.getElementById("browse-photo");
  const dropZone = document.getElementById("photo-drop-zone");
  const nameInput = document.getElementById("candidate-name");
  const dateInput = document.getElementById("photo-date");
  const prefixSelect = document.getElementById("date-prefix");
  const stripSlider = document.getElementById("strip-height");
  const stripValue = document.getElementById("strip-height-value");
  const previewCanvas = document.getElementById("photo-preview");
  const targetNote = document.getElementById("target-note");
  const downloadButton = document.getElementById("download-photo");
  const errorMessage = document.getElementById("photo-error");
  const PHOTO_WIDTH = 700;
  const PHOTO_HEIGHT = 900;
  let photo = null;
  let fileName = "photo";
  let revision = 0;
  let loadRevision = 0;
  let targetBytes = null;
  let lastBlob = null;

  function localDateValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  dateInput.value = localDateValue();
  nameInput.addEventListener("input", () => {
    const start = nameInput.selectionStart;
    const end = nameInput.selectionEnd;
    nameInput.value = nameInput.value.toLocaleUpperCase();
    nameInput.setSelectionRange(start, end);
    renderPreview();
  });
  dateInput.addEventListener("input", renderPreview);
  prefixSelect.addEventListener("change", renderPreview);
  stripSlider.addEventListener("input", () => {
    stripValue.textContent = `${stripSlider.value}%`;
    renderPreview();
  });

  function formattedDate() {
    if (!dateInput.value) return "";
    const [year, month, day] = dateInput.value.split("-");
    const date = `${day}-${month}-${year}`;
    if (prefixSelect.value === "dop") return `DOP: ${date}`;
    if (prefixSelect.value === "date") return `Date: ${date}`;
    return date;
  }

  function drawCover(source, target, width, height) {
    const scale = Math.max(width / source.width, height / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    target.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  function drawComposition(canvas) {
    const target = canvas.getContext("2d");
    if (!target) throw new Error("Your browser could not create a photo preview canvas.");
    target.fillStyle = "#fff";
    target.fillRect(0, 0, canvas.width, canvas.height);
    if (photo) drawCover(photo, target, canvas.width, canvas.height);
    const stripHeight = Math.round(canvas.height * Number(stripSlider.value) / 100);
    target.fillStyle = "#fff";
    target.fillRect(0, canvas.height - stripHeight, canvas.width, stripHeight);
    const name = nameInput.value.trim();
    const date = formattedDate();
    const padding = Math.max(12, Math.round(canvas.width * 0.035));
    const usableWidth = canvas.width - padding * 2;
    const baseFont = Math.min(stripHeight * 0.29, canvas.width * 0.07);
    const fitFont = (text, maximum) => {
      let size = maximum;
      target.font = `700 ${size}px Arial, sans-serif`;
      while (size > 11 && target.measureText(text).width > usableWidth) {
        size -= 1;
        target.font = `700 ${size}px Arial, sans-serif`;
      }
      return size;
    };
    const rows = [name || "CANDIDATE NAME", date || "DD-MM-YYYY"];
    const rowSizes = rows.map((text) => fitFont(text, baseFont));
    target.fillStyle = "#111";
    target.textAlign = "center";
    target.textBaseline = "middle";
    const centerY = canvas.height - stripHeight / 2;
    const lineGap = Math.min(stripHeight * 0.31, rowSizes[0] * 1.35);
    const nameY = centerY - lineGap / 2;
    const dateY = centerY + lineGap / 2;
    target.font = `700 ${rowSizes[0]}px Arial, sans-serif`;
    target.fillText(rows[0], canvas.width / 2, nameY, usableWidth);
    target.font = `700 ${rowSizes[1]}px Arial, sans-serif`;
    target.fillText(rows[1], canvas.width / 2, dateY, usableWidth);
  }

  function renderPreview() {
    revision += 1;
    lastBlob = null;
    downloadButton.disabled = !photo;
    drawComposition(previewCanvas);
    if (photo) void encodeOutput(revision);
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Your browser could not encode the photo as JPEG."));
      }, "image/jpeg", quality);
    });
  }

  async function encodeOutput(currentRevision) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_WIDTH;
      canvas.height = PHOTO_HEIGHT;
      drawComposition(canvas);
      let blob;
      for (let quality = 0.92; quality >= 0.3 && currentRevision === revision; quality -= 0.08) {
        blob = await canvasBlob(canvas, quality);
        if (currentRevision !== revision) {
          canvas.width = 0;
          canvas.height = 0;
          return;
        }
        if (!targetBytes || blob.size <= targetBytes) break;
      }
      let width = canvas.width;
      let height = canvas.height;
      while (targetBytes && blob.size > targetBytes && width > 280 && currentRevision === revision) {
        width = Math.round(width * 0.85);
        height = Math.round(height * 0.85);
        canvas.width = width;
        canvas.height = height;
        drawComposition(canvas);
        blob = await canvasBlob(canvas, 0.3);
      }
      canvas.width = 0;
      canvas.height = 0;
      if (currentRevision !== revision) return;
      lastBlob = blob;
      targetNote.textContent = targetBytes
        ? blob.size <= targetBytes
          ? `Ready · ${formatBytes(blob.size)} (target ${formatBytes(targetBytes)}).`
          : `Best effort: ${formatBytes(blob.size)}; this image could not be reduced below ${formatBytes(targetBytes)}.`
        : `Ready · ${formatBytes(blob.size)} JPEG.`;
      downloadButton.disabled = false;
    } catch (error) {
      if (currentRevision !== revision) return;
      errorMessage.textContent = error.message || "The photo could not be processed.";
      downloadButton.disabled = true;
    }
  }

  function formatBytes(bytes) {
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function loadPhoto(file) {
    const currentLoad = ++loadRevision;
    errorMessage.textContent = "";
    targetBytes = null;
    document.querySelectorAll("[data-target-bytes]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      errorMessage.textContent = "Choose a JPG, PNG, or other image file.";
      return;
    }
    try {
      if (photo && typeof photo.close === "function") photo.close();
      const loadedPhoto = await createImageBitmap(file);
      if (currentLoad !== loadRevision) {
        loadedPhoto.close();
        return;
      }
      photo = loadedPhoto;
      fileName = file.name.replace(/\.[^.]+$/, "") || "photo";
      downloadButton.disabled = false;
      dropZone.classList.add("has-photo");
      renderPreview();
    } catch (error) {
      if (currentLoad !== loadRevision) return;
      errorMessage.textContent = error.message || "This image could not be opened by your browser.";
    }
  }

  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files || [];
    void loadPhoto(file);
    fileInput.value = "";
  });
  browseButton.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    void loadPhoto(event.dataTransfer.files[0]);
  });
  document.querySelectorAll("[data-target-bytes]").forEach((button) => {
    button.addEventListener("click", () => {
      targetBytes = Number(button.dataset.targetBytes);
      document.querySelectorAll("[data-target-bytes]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      renderPreview();
    });
  });
  downloadButton.addEventListener("click", () => {
    if (!lastBlob || !photo) return;
    const safeName = (nameInput.value.trim() || fileName)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "photo";
    const url = URL.createObjectURL(lastBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}-name-date-imgcon.jpg`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  drawComposition(previewCanvas);
})();
