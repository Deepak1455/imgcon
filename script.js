"use strict";

(() => {
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MAX_DIMENSION = 16000;
  const MAX_PIXELS = 100_000_000;
  const FORMAT_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };

  const elements = {
    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    browseButton: document.getElementById("browse-button"),
    uploadError: document.getElementById("upload-error"),
    editor: document.getElementById("editor"),
    features: document.getElementById("features"),
    fileName: document.getElementById("file-name"),
    imageDetails: document.getElementById("image-details"),
    originalPreview: document.getElementById("original-preview"),
    originalSize: document.getElementById("original-size"),
    resultPreview: document.getElementById("result-preview"),
    resultPlaceholder: document.getElementById("result-placeholder"),
    processing: document.getElementById("processing"),
    resultSize: document.getElementById("result-size"),
    dimensionsResult: document.getElementById("dimensions-result"),
    sizeChange: document.getElementById("size-change"),
    status: document.getElementById("status"),
    formatSelect: document.getElementById("format-select"),
    qualitySlider: document.getElementById("quality-slider"),
    qualityValue: document.getElementById("quality-value"),
    qualityNote: document.getElementById("quality-note"),
    ratioLock: document.getElementById("ratio-lock"),
    widthInput: document.getElementById("width-input"),
    heightInput: document.getElementById("height-input"),
    resetButton: document.getElementById("reset-button"),
    chooseAnother: document.getElementById("choose-another"),
    downloadButton: document.getElementById("download-button"),
    processingError: document.getElementById("processing-error"),
  };

  const state = {
    file: null,
    image: null,
    sourceUrl: null,
    resultUrl: null,
    resultBlob: null,
    width: 0,
    height: 0,
    rotation: 0,
    flipX: false,
    flipY: false,
    ratio: 1,
    revision: 0,
    processingTimer: null,
    loadingImage: false,
  };

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** unitIndex);
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function showMessage(element, message) {
    element.textContent = message;
    element.classList.toggle("hidden", !message);
  }

  function releaseResult() {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
    state.resultBlob = null;
    elements.resultPreview.removeAttribute("src");
    elements.resultPreview.classList.add("hidden");
    elements.resultPlaceholder.classList.remove("hidden");
    elements.resultPlaceholder.textContent = "Your edited image will appear here";
    elements.resultSize.textContent = "—";
    elements.dimensionsResult.textContent = "";
    elements.sizeChange.textContent = "";
    elements.sizeChange.className = "text-xs font-medium";
    elements.downloadButton.disabled = true;
  }

  function clearCurrentImage() {
    clearTimeout(state.processingTimer);
    state.revision += 1;
    releaseResult();
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.file = null;
    state.image = null;
    state.sourceUrl = null;
    state.loadingImage = false;
    elements.originalPreview.removeAttribute("src");
    elements.editor.classList.add("hidden");
    elements.features.classList.remove("hidden");
    elements.dropZone.classList.remove("hidden");
    elements.fileInput.value = "";
  }

  function openPicker() {
    elements.fileInput.click();
  }

  function acceptFile(file) {
    if (state.loadingImage || !file) return;
    showMessage(elements.uploadError, "");
    showMessage(elements.processingError, "");
    if (!file.type.startsWith("image/")) {
      showMessage(elements.uploadError, "Please choose a valid image file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showMessage(elements.uploadError, "This image is larger than 50 MB. Please choose a smaller file.");
      return;
    }
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.loadingImage = true;
    state.file = file;
    state.sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (state.file !== file) return;
      state.loadingImage = false;
      if (!image.naturalWidth || !image.naturalHeight) {
        showMessage(elements.uploadError, "This image could not be decoded. Try another image.");
        clearCurrentImage();
        return;
      }
      state.image = image;
      state.width = image.naturalWidth;
      state.height = image.naturalHeight;
      state.ratio = state.width / state.height;
      state.rotation = 0;
      state.flipX = false;
      state.flipY = false;

      elements.fileName.textContent = file.name;
      elements.imageDetails.textContent = `${state.width.toLocaleString()} × ${state.height.toLocaleString()} px`;
      elements.originalSize.textContent = formatBytes(file.size);
      elements.originalPreview.src = state.sourceUrl;
      elements.widthInput.value = String(state.width);
      elements.heightInput.value = String(state.height);
      elements.formatSelect.value = FORMAT_EXTENSIONS[file.type] ? file.type : "image/png";
      elements.qualitySlider.value = "85";
      elements.qualityValue.textContent = "85%";
      elements.editor.classList.remove("hidden");
      elements.features.classList.add("hidden");
      elements.dropZone.classList.add("hidden");
      updateQualityNote();
      scheduleProcessing();
    };
    image.onerror = () => {
      if (state.file !== file) return;
      showMessage(elements.uploadError, "This image could not be opened. Try a different file.");
      clearCurrentImage();
    };
    image.src = state.sourceUrl;
  }

  function updateQualityNote() {
    elements.qualityNote.classList.toggle("hidden", elements.formatSelect.value !== "image/png");
  }

  function getOutputDimensions() {
    const enteredWidth = Number(elements.widthInput.value);
    const enteredHeight = Number(elements.heightInput.value);
    if (!Number.isInteger(enteredWidth) || !Number.isInteger(enteredHeight)
      || enteredWidth < 1 || enteredHeight < 1
      || enteredWidth > MAX_DIMENSION || enteredHeight > MAX_DIMENSION) {
      throw new Error(`Width and height must be whole numbers between 1 and ${MAX_DIMENSION.toLocaleString()} pixels.`);
    }
    const swapped = Math.abs(state.rotation % 180) === 90;
    const width = swapped ? enteredHeight : enteredWidth;
    const height = swapped ? enteredWidth : enteredHeight;
    if (width * height > MAX_PIXELS) {
      throw new Error("The output image is too large to process. Choose dimensions with a maximum of 100 megapixels.");
    }
    return { width, height };
  }

  function scheduleProcessing() {
    clearTimeout(state.processingTimer);
    if (!state.image) return;
    state.revision += 1;
    const revision = state.revision;
    showMessage(elements.processingError, "");
    elements.resultPlaceholder.textContent = "Your edited image will appear here";
    elements.status.textContent = "Updating preview…";
    elements.processing.classList.remove("hidden");
    elements.processing.classList.add("flex");
    elements.resultPreview.classList.add("hidden");
    elements.resultPlaceholder.classList.add("hidden");
    elements.downloadButton.disabled = true;
    state.processingTimer = setTimeout(() => processImage(revision), 160);
  }

  function processImage(revision) {
    if (revision !== state.revision || !state.image) return;
    let dimensions;
    try {
      dimensions = getOutputDimensions();
    } catch (error) {
      elements.processing.classList.add("hidden");
      elements.processing.classList.remove("flex");
      elements.resultPlaceholder.classList.remove("hidden");
      elements.resultPlaceholder.textContent = error.message;
      elements.status.textContent = "Check dimensions";
      showMessage(elements.processingError, error.message);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) {
      showProcessingFailure("Your browser could not create an image canvas.");
      return;
    }

    if (elements.formatSelect.value === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const radians = (state.rotation * Math.PI) / 180;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(radians);
    context.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1);
    const rotatedWidth = Math.abs(state.rotation % 180) === 90 ? canvas.height : canvas.width;
    const rotatedHeight = Math.abs(state.rotation % 180) === 90 ? canvas.width : canvas.height;
    context.drawImage(state.image, -rotatedWidth / 2, -rotatedHeight / 2, rotatedWidth, rotatedHeight);

    const mimeType = elements.formatSelect.value;
    const quality = Number(elements.qualitySlider.value) / 100;
    canvas.toBlob((blob) => {
      if (revision !== state.revision) return;
      if (!blob) {
        showProcessingFailure("The image could not be exported in this format. Try another format or smaller dimensions.");
        return;
      }
      if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
      state.resultBlob = blob;
      state.resultUrl = URL.createObjectURL(blob);
      elements.resultPreview.src = state.resultUrl;
      elements.resultPreview.classList.remove("hidden");
      elements.resultPlaceholder.classList.add("hidden");
      elements.resultSize.textContent = formatBytes(blob.size);
      elements.dimensionsResult.textContent = `${dimensions.width.toLocaleString()} × ${dimensions.height.toLocaleString()} px`;
      updateSizeChange(blob.size, state.file.size);
      elements.processing.classList.add("hidden");
      elements.processing.classList.remove("flex");
      elements.status.textContent = "Preview updated";
      elements.downloadButton.disabled = false;
      showMessage(elements.processingError, "");
      canvas.width = 0;
      canvas.height = 0;
    }, mimeType, quality);
  }

  function updateSizeChange(newSize, originalSize) {
    if (newSize < originalSize) {
      const saved = Math.round((1 - newSize / originalSize) * 100);
      elements.sizeChange.textContent = `${saved}% smaller`;
      elements.sizeChange.classList.add("text-emerald-300");
    } else if (newSize > originalSize) {
      const increase = Math.round((newSize / originalSize - 1) * 100);
      elements.sizeChange.textContent = `${increase}% larger`;
      elements.sizeChange.classList.add("text-amber-300");
    } else {
      elements.sizeChange.textContent = "Same file size";
      elements.sizeChange.classList.add("text-slate-500");
    }
  }

  function showProcessingFailure(message) {
    elements.processing.classList.add("hidden");
    elements.processing.classList.remove("flex");
    elements.resultPlaceholder.classList.remove("hidden");
    elements.resultPlaceholder.textContent = "Preview unavailable";
    elements.status.textContent = "Could not process image";
    elements.downloadButton.disabled = true;
    showMessage(elements.processingError, message);
  }

  elements.dropZone.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openPicker();
  });
  elements.browseButton.addEventListener("click", openPicker);
  elements.fileInput.addEventListener("change", (event) => acceptFile(event.target.files[0]));
  elements.chooseAnother.addEventListener("click", () => {
    clearCurrentImage();
    showMessage(elements.uploadError, "");
    openPicker();
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("drop-active");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("drop-active");
    });
  }
  elements.dropZone.addEventListener("drop", (event) => acceptFile(event.dataTransfer.files[0]));
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => event.preventDefault());

  elements.formatSelect.addEventListener("change", () => {
    updateQualityNote();
    scheduleProcessing();
  });
  elements.qualitySlider.addEventListener("input", () => {
    elements.qualityValue.textContent = `${elements.qualitySlider.value}%`;
    scheduleProcessing();
  });
  elements.widthInput.addEventListener("input", () => {
    const width = Number(elements.widthInput.value);
    if (elements.ratioLock.checked && Number.isFinite(width) && width > 0 && state.ratio) {
      elements.heightInput.value = String(Math.max(1, Math.round(width / state.ratio)));
    }
    scheduleProcessing();
  });
  elements.heightInput.addEventListener("input", () => {
    const height = Number(elements.heightInput.value);
    if (elements.ratioLock.checked && Number.isFinite(height) && height > 0 && state.ratio) {
      elements.widthInput.value = String(Math.max(1, Math.round(height * state.ratio)));
    }
    scheduleProcessing();
  });
  elements.ratioLock.addEventListener("change", () => {
    if (elements.ratioLock.checked) {
      state.ratio = Number(elements.widthInput.value) / Number(elements.heightInput.value);
    }
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "rotate-left") state.rotation = (state.rotation + 270) % 360;
      if (action === "rotate-right") state.rotation = (state.rotation + 90) % 360;
      if (action === "flip-horizontal") state.flipX = !state.flipX;
      if (action === "flip-vertical") state.flipY = !state.flipY;
      scheduleProcessing();
    });
  });

  elements.resetButton.addEventListener("click", () => {
    if (!state.image) return;
    state.width = state.image.naturalWidth;
    state.height = state.image.naturalHeight;
    state.ratio = state.width / state.height;
    state.rotation = 0;
    state.flipX = false;
    state.flipY = false;
    elements.widthInput.value = String(state.width);
    elements.heightInput.value = String(state.height);
    elements.ratioLock.checked = true;
    elements.qualitySlider.value = "85";
    elements.qualityValue.textContent = "85%";
    elements.formatSelect.value = FORMAT_EXTENSIONS[state.file.type] ? state.file.type : "image/png";
    updateQualityNote();
    scheduleProcessing();
  });

  elements.downloadButton.addEventListener("click", () => {
    if (!state.resultBlob || !state.resultUrl || !state.file) return;
    const extension = FORMAT_EXTENSIONS[elements.formatSelect.value];
    const baseName = state.file.name.replace(/\.[^.]+$/, "") || "image";
    const link = document.createElement("a");
    link.href = state.resultUrl;
    link.download = `${baseName}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
  });
})();
