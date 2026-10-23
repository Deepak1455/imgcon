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
    fileThumbnail: document.getElementById("file-thumbnail"),
    fileName: document.getElementById("file-name"),
    imageDetails: document.getElementById("image-details"),
    originalPreview: document.getElementById("original-preview"),
    originalSize: document.getElementById("original-size"),
    resultPreview: document.getElementById("result-preview"),
    resultPlaceholder: document.getElementById("result-placeholder"),
    resultSize: document.getElementById("result-size"),
    dimensionsResult: document.getElementById("dimensions-result"),
    sizeChange: document.getElementById("size-change"),
    status: document.getElementById("status"),
    formatSelect: document.getElementById("format-select"),
    qualitySlider: document.getElementById("quality-slider"),
    qualityValue: document.getElementById("quality-value"),
    qualityNote: document.getElementById("quality-note"),
    targetSizeButtons: [...document.querySelectorAll("[data-target-bytes]")],
    targetSizeNote: document.getElementById("target-size-note"),
    customTargetKb: document.getElementById("custom-target-kb"),
    customTargetButton: document.getElementById("custom-target-button"),
    aspectButtons: [...document.querySelectorAll("[data-aspect-ratio]")],
    brightnessSlider: document.getElementById("brightness-slider"),
    brightnessValue: document.getElementById("brightness-value"),
    contrastSlider: document.getElementById("contrast-slider"),
    contrastValue: document.getElementById("contrast-value"),
    saturationSlider: document.getElementById("saturation-slider"),
    saturationValue: document.getElementById("saturation-value"),
    sharpnessSlider: document.getElementById("sharpness-slider"),
    sharpnessValue: document.getElementById("sharpness-value"),
    autoEnhanceButton: document.getElementById("auto-enhance-button"),
    enhanceNote: document.getElementById("enhance-note"),
    grayscaleToggle: document.getElementById("grayscale-toggle"),
    ratioLock: document.getElementById("ratio-lock"),
    widthInput: document.getElementById("width-input"),
    heightInput: document.getElementById("height-input"),
    resetButton: document.getElementById("reset-button"),
    chooseAnother: document.getElementById("choose-another"),
    downloadButton: document.getElementById("download-button"),
    downloadAllButton: document.getElementById("download-all-button"),
    batchPanel: document.getElementById("batch-panel"),
    batchList: document.getElementById("batch-list"),
    batchSummary: document.getElementById("batch-summary"),
    downloadPdfButton: document.getElementById("download-pdf-button"),
    processingError: document.getElementById("processing-error"),
    shareButton: document.getElementById("share-button"),
    installButton: document.getElementById("install-button"),
    toast: document.getElementById("toast"),
    legalDialog: document.getElementById("legal-dialog"),
    legalTitle: document.getElementById("legal-title"),
    legalContent: document.getElementById("legal-content"),
    legalClose: document.getElementById("legal-close"),
    themeToggle: document.getElementById("theme-toggle"),
    themeIcon: document.getElementById("theme-icon"),
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
    targetBytes: null,
    cropRatio: null,
    ratio: 1,
    revision: 0,
    renderFrame: 0,
    loadingImage: false,
    batchItems: [],
    batchRunId: 0,
    activeBatchItem: null,
    batchResolver: null,
    zipBuilding: false,
    toastTimer: 0,
    installPrompt: null,
  };

  function showToast(message) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.remove("opacity-0");
    elements.toastTimer = setTimeout(() => elements.toast.classList.add("opacity-0"), 2800);
  }

  async function copyWebsiteLink() {
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText("https://imgcon.online");
        copied = true;
      }
    } catch (error) {
      console.warn("ImgCon could not use the Clipboard API; trying the browser fallback.", error);
    }
    if (!copied) {
      const input = document.createElement("textarea");
      input.value = "https://imgcon.online";
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.append(input);
      input.select();
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        console.warn("ImgCon could not copy the website link.", error);
      } finally {
        input.remove();
      }
    }
    showToast(copied ? "Link copied to clipboard!" : "Could not copy the link.");
  }

  async function sharePage() {
    if (navigator.share) {
      const shareData = {
        title: "ImgCon — Free Online Image Tools",
        text: "Compress, convert, and enhance images privately in your browser.",
        url: "https://imgcon.online",
      };
      if (state.resultBlob && state.file && typeof File === "function") {
        const extension = FORMAT_EXTENSIONS[elements.formatSelect.value];
        const baseName = state.file.name.replace(/\.[^.]+$/, "") || "image";
        const imageFile = new File([state.resultBlob], `${baseName}.${extension}`, { type: state.resultBlob.type });
        try {
          if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
            shareData.files = [imageFile];
          }
        } catch (error) {
          console.warn("ImgCon could not check image sharing support.", error);
        }
      }
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
        console.warn("ImgCon could not open the native share dialog; copying the website link.", error);
      }
    }
    await copyWebsiteLink();
  }

  function renderBatchQueue() {
    const fragment = document.createDocumentFragment();
    let readyCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    for (const item of state.batchItems) {
      if (item.status === "Ready") readyCount += 1;
      if (item.status === "Failed") failedCount += 1;
      if (item.status === "Queued" || item.status === "Processing") pendingCount += 1;
      const row = document.createElement("li");
      row.className = "flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5";
      if (item.previewUrl) {
        const thumbnail = document.createElement("img");
        thumbnail.src = item.previewUrl;
        thumbnail.alt = "";
        thumbnail.className = "h-10 w-10 shrink-0 rounded-lg border border-white/[0.07] object-cover";
        row.append(thumbnail);
      }
      const details = document.createElement("div");
      details.className = "min-w-0 flex-1";
      const name = document.createElement("p");
      name.className = "truncate text-xs font-medium text-slate-200";
      name.textContent = item.file.name;
      const status = document.createElement("p");
      status.className = `mt-1 text-[11px] ${item.status === "Ready" ? "text-emerald-400" : item.status === "Failed" ? "text-rose-300" : "text-slate-500"}`;
      status.textContent = item.status === "Ready" && item.blob
        ? `Ready · ${formatBytes(item.blob.size)}`
        : item.message || item.status;
      details.append(name, status);
      row.append(details);
      fragment.append(row);
    }
    elements.batchList.replaceChildren(fragment);
    elements.batchPanel.classList.toggle("hidden", state.batchItems.length === 0);
    elements.batchSummary.textContent = `${state.batchItems.length} image${state.batchItems.length === 1 ? "" : "s"} · ${readyCount} ready${pendingCount ? ` · ${pendingCount} processing` : ""}${failedCount ? ` · ${failedCount} failed` : ""}`;
    elements.downloadAllButton.disabled = readyCount === 0 || pendingCount > 0 || state.zipBuilding;
  }

  function completeActiveBatchItem(success) {
    const item = state.activeBatchItem;
    if (!item) return;
    if (success && state.resultBlob) {
      const baseName = item.file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") || "image";
      item.blob = state.resultBlob;
      item.outputName = `${baseName}.${FORMAT_EXTENSIONS[elements.formatSelect.value]}`;
      item.status = "Ready";
      item.message = "";
    } else if (!item.blob) {
      item.status = "Failed";
      item.message = "Could not process";
    }
    renderBatchQueue();
    if (state.batchResolver) {
      const resolve = state.batchResolver;
      state.batchResolver = null;
      resolve(success);
    }
  }

  function cancelBatchRun() {
    state.batchRunId += 1;
    if (state.batchResolver) {
      const resolve = state.batchResolver;
      state.batchResolver = null;
      resolve(false);
    }
    for (const item of state.batchItems) {
      if (item.status === "Processing" || item.status === "Queued") {
        item.status = "Failed";
        item.message = "Cancelled";
      }
    }
    renderBatchQueue();
    state.activeBatchItem = null;
  }

  function queueFiles(files) {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;
    cancelBatchRun();
    clearCurrentImage();
    for (const item of state.batchItems) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    state.batchItems = selectedFiles.map((file) => {
      const item = { file, status: "Queued", message: "", previewUrl: null, blob: null, outputName: "" };
      if (!file.type.startsWith("image/")) {
        item.status = "Failed";
        item.message = "Not an image file";
      } else if (file.size > MAX_FILE_SIZE) {
        item.status = "Failed";
        item.message = "Larger than 50 MB";
      } else {
        item.previewUrl = URL.createObjectURL(file);
      }
      return item;
    });
    elements.features.classList.toggle("hidden", state.batchItems.some((item) => item.status === "Queued"));
    elements.dropZone.classList.remove("hidden");
    elements.fileInput.value = "";
    renderBatchQueue();
    const runId = state.batchRunId;
    void processBatch(runId);
  }

  async function processBatch(runId) {
    for (const item of state.batchItems) {
      if (runId !== state.batchRunId) return;
      if (item.status !== "Queued") continue;
      item.status = "Processing";
      renderBatchQueue();
      try {
        await acceptFile(item.file, item);
      } catch (error) {
        item.status = "Failed";
        item.message = "Could not process";
        if (state.activeBatchItem === item) {
          state.activeBatchItem = null;
          state.batchResolver = null;
        }
        showMessage(elements.uploadError, error.message || "An image could not be processed.");
        renderBatchQueue();
      }
    }
  }

  function setTheme(theme, persist = true) {
    const isLight = theme === "light";
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    elements.themeToggle.setAttribute("aria-pressed", String(isLight));
    elements.themeToggle.setAttribute("aria-label", `Switch to ${isLight ? "dark" : "light"} mode`);
    elements.themeToggle.title = `Switch to ${isLight ? "dark" : "light"} mode`;
    document.querySelector('meta[name="theme-color"]').content = isLight ? "#f8fafc" : "#020617";
    elements.themeIcon.innerHTML = isLight
      ? '<path d="M20.4 15.3A8.5 8.5 0 0 1 8.7 3.6 8.5 8.5 0 1 0 20.4 15.3Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';
    if (persist) {
      try {
        localStorage.setItem("imgcon-theme", isLight ? "light" : "dark");
      } catch (error) {
        console.warn("ImgCon could not save the theme preference.", error);
      }
    }
  }

  try {
    setTheme(localStorage.getItem("imgcon-theme") === "light" ? "light" : "dark", false);
  } catch (error) {
    console.warn("ImgCon could not read the saved theme preference.", error);
    setTheme("dark", false);
  }

  elements.themeToggle.addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });
  elements.shareButton.addEventListener("click", sharePage);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    elements.installButton.classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    elements.installButton.classList.add("hidden");
    showToast("ImgCon installed!");
  });
  elements.installButton.addEventListener("click", async () => {
    if (!state.installPrompt) return;
    const prompt = state.installPrompt;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.error("ImgCon could not open the install prompt.", error);
      showToast("The install prompt could not be opened.");
    } finally {
      state.installPrompt = null;
      elements.installButton.classList.add("hidden");
    }
  });

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

  function updateTargetSizeControls(note) {
    for (const button of elements.targetSizeButtons) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.targetBytes) === state.targetBytes));
    }
    elements.qualitySlider.disabled = state.targetBytes !== null;
    elements.qualitySlider.classList.toggle("cursor-not-allowed", state.targetBytes !== null);
    elements.qualitySlider.classList.toggle("opacity-50", state.targetBytes !== null);
    elements.targetSizeNote.textContent = note
      || (state.targetBytes === null
        ? "Choose a size to automatically fit your image. Dimensions shrink only if needed."
        : `Finding the best quality under ${formatBytes(state.targetBytes)}…`);
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
    elements.downloadPdfButton.disabled = true;
  }

  function clearCurrentImage() {
    cancelAnimationFrame(state.renderFrame);
    state.renderFrame = 0;
    state.revision += 1;
    releaseResult();
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.file = null;
    state.image = null;
    state.sourceUrl = null;
    state.loadingImage = false;
    state.targetBytes = null;
    state.cropRatio = null;
    elements.customTargetKb.value = "";
    updateTargetSizeControls();
    updateAspectControls();
    elements.originalPreview.removeAttribute("src");
    elements.fileThumbnail.removeAttribute("src");
    elements.editor.classList.add("hidden");
    elements.features.classList.remove("hidden");
    elements.dropZone.classList.remove("hidden");
    elements.fileInput.value = "";
  }

  function openPicker() {
    elements.fileInput.click();
  }

  function acceptFile(file, batchItem) {
    if (state.loadingImage || !file) return Promise.resolve(false);
    showMessage(elements.uploadError, "");
    showMessage(elements.processingError, "");
    if (!file.type.startsWith("image/")) {
      showMessage(elements.uploadError, "Please choose a valid image file.");
      return Promise.resolve(false);
    }
    if (file.size > MAX_FILE_SIZE) {
      showMessage(elements.uploadError, "This image is larger than 50 MB. Please choose a smaller file.");
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      state.batchResolver = resolve;
      state.activeBatchItem = batchItem;
      releaseResult();
      if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      state.loadingImage = true;
      state.file = file;
      elements.status.textContent = "Loading image…";
      state.targetBytes = null;
      updateTargetSizeControls();
      state.sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        if (state.file !== file) return;
        state.loadingImage = false;
        if (!image.naturalWidth || !image.naturalHeight) {
          showMessage(elements.uploadError, "This image could not be decoded. Try another image.");
          completeActiveBatchItem(false);
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
        state.cropRatio = null;
        elements.brightnessSlider.value = "100";
        elements.brightnessValue.textContent = "100%";
        elements.contrastSlider.value = "100";
        elements.contrastValue.textContent = "100%";
        elements.saturationSlider.value = "100";
        elements.saturationValue.textContent = "100%";
        elements.sharpnessSlider.value = "0";
        elements.sharpnessValue.textContent = "0%";
        elements.enhanceNote.textContent = "Automatically balance contrast and color, then add a touch of sharpness.";
        elements.grayscaleToggle.checked = false;
        updateAspectControls();

        elements.fileName.textContent = file.name;
        elements.imageDetails.textContent = `${state.width.toLocaleString()} × ${state.height.toLocaleString()} px`;
        elements.fileThumbnail.src = state.sourceUrl;
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
        completeActiveBatchItem(false);
        clearCurrentImage();
      };
      image.src = state.sourceUrl;
    });
  }

  function updateQualityNote() {
    elements.qualityNote.classList.toggle("hidden", elements.formatSelect.value !== "image/png");
  }

  function updateEnhancementControls() {
    elements.brightnessValue.textContent = `${elements.brightnessSlider.value}%`;
    elements.contrastValue.textContent = `${elements.contrastSlider.value}%`;
    elements.saturationValue.textContent = `${elements.saturationSlider.value}%`;
    elements.sharpnessValue.textContent = `${elements.sharpnessSlider.value}%`;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function autoEnhance() {
    if (!state.image) return;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 64;
    sampleCanvas.height = 64;
    try {
      const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Your browser could not analyze this image for enhancement.");
      context.drawImage(state.image, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
      let luminanceTotal = 0;
      let luminanceSquaredTotal = 0;
      let saturationTotal = 0;
      let sampleCount = 0;
      for (let index = 0; index < pixels.length; index += 16) {
        if (pixels[index + 3] === 0) continue;
        const red = pixels[index] / 255;
        const green = pixels[index + 1] / 255;
        const blue = pixels[index + 2] / 255;
        const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * 255;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        luminanceTotal += luminance;
        luminanceSquaredTotal += luminance * luminance;
        saturationTotal += maximum === 0 ? 0 : (maximum - minimum) / maximum;
        sampleCount += 1;
      }
      if (sampleCount === 0) throw new Error("This image has no visible pixels to analyze for auto-enhancement.");
      const meanLuminance = luminanceTotal / sampleCount;
      const luminanceDeviation = Math.sqrt(Math.max(0, luminanceSquaredTotal / sampleCount - meanLuminance ** 2));
      const meanSaturation = saturationTotal / sampleCount;
      elements.brightnessSlider.value = String(Math.round(clamp((128 / Math.max(1, meanLuminance)) * 100, 90, 115)));
      elements.contrastSlider.value = String(Math.round(clamp(100 + (56 - luminanceDeviation) * 0.45, 90, 125)));
      elements.saturationSlider.value = String(Math.round(clamp(100 + (0.5 - meanSaturation) * 35, 100, 125)));
      elements.sharpnessSlider.value = "22";
      elements.grayscaleToggle.checked = false;
      updateEnhancementControls();
      elements.enhanceNote.textContent = "Auto-enhanced for balanced light, contrast, color, and crisp detail. Fine-tune any slider.";
      showMessage(elements.processingError, "");
      scheduleProcessing();
    } catch (error) {
      showMessage(elements.processingError, error.message || "This image could not be auto-enhanced.");
    } finally {
      sampleCanvas.width = 0;
      sampleCanvas.height = 0;
    }
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
    if (!state.image) return;
    cancelAnimationFrame(state.renderFrame);
    state.revision += 1;
    const revision = state.revision;
    state.renderFrame = requestAnimationFrame(() => {
      state.renderFrame = 0;
      if (revision !== state.revision) return;
      showMessage(elements.processingError, "");
      updateTargetSizeControls();
      elements.resultPlaceholder.textContent = "Your edited image will appear here";
      elements.status.textContent = "Updating preview…";
      elements.downloadButton.disabled = true;
      elements.downloadPdfButton.disabled = true;
      processImage(revision);
    });
  }

  function createCanvas(dimensions) {
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) {
      canvas.width = 0;
      canvas.height = 0;
      throw new Error("Your browser could not create an image canvas.");
    }

    try {
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
      context.filter = `brightness(${Number(elements.brightnessSlider.value)}%) contrast(${Number(elements.contrastSlider.value)}%) saturate(${Number(elements.saturationSlider.value)}%) grayscale(${elements.grayscaleToggle.checked ? 1 : 0})`;
      if (state.cropRatio === null) {
        context.drawImage(state.image, -rotatedWidth / 2, -rotatedHeight / 2, rotatedWidth, rotatedHeight);
      } else {
        const outputRatio = rotatedWidth / rotatedHeight;
        const sourceRatio = Math.abs(state.rotation % 180) === 90 ? 1 / outputRatio : outputRatio;
        const imageRatio = state.image.naturalWidth / state.image.naturalHeight;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = state.image.naturalWidth;
        let sourceHeight = state.image.naturalHeight;
        if (imageRatio > sourceRatio) {
          sourceWidth = sourceHeight * sourceRatio;
          sourceX = (state.image.naturalWidth - sourceWidth) / 2;
        } else {
          sourceHeight = sourceWidth / sourceRatio;
          sourceY = (state.image.naturalHeight - sourceHeight) / 2;
        }
        context.drawImage(state.image, sourceX, sourceY, sourceWidth, sourceHeight, -rotatedWidth / 2, -rotatedHeight / 2, rotatedWidth, rotatedHeight);
      }
      return canvas;
    } catch (error) {
      canvas.width = 0;
      canvas.height = 0;
      throw error;
    }
  }

  function encodeCanvas(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      } catch (error) {
        reject(error);
      }
    });
  }

  function scaledDimensions(dimensions, scale) {
    return {
      width: Math.max(1, Math.round(dimensions.width * scale)),
      height: Math.max(1, Math.round(dimensions.height * scale)),
    };
  }

  async function sharpenCanvas(canvas, revision) {
    const strength = Number(elements.sharpnessSlider.value) / 100;
    if (strength <= 0) return true;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create an image canvas for sharpening.");
    const width = canvas.width;
    const height = canvas.height;
    const amount = strength * 0.2;
    const rowsPerTile = 128;
    for (let firstRow = 0; firstRow < height; firstRow += rowsPerTile) {
      if (revision !== undefined && revision !== state.revision) return false;
      const rowCount = Math.min(rowsPerTile, height - firstRow);
      const sourceTop = Math.max(0, firstRow - 1);
      const sourceBottom = Math.min(height, firstRow + rowCount + 1);
      const source = context.getImageData(0, sourceTop, width, sourceBottom - sourceTop);
      const output = context.createImageData(width, rowCount);
      for (let row = 0; row < rowCount; row += 1) {
        const imageY = firstRow + row;
        const sourceRow = (imageY - sourceTop) * width;
        const outputRow = row * width;
        for (let x = 0; x < width; x += 1) {
          const pixel = sourceRow + x;
          const outputPixel = outputRow + x;
          const offset = pixel * 4;
          if (x === 0 || x === width - 1 || imageY === 0 || imageY === height - 1) {
            output.data.set(source.data.subarray(offset, offset + 4), outputPixel * 4);
            continue;
          }
          let redNeighbors = 0;
          let greenNeighbors = 0;
          let blueNeighbors = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const neighbor = ((imageY + dy - sourceTop) * width + x + dx) * 4;
              redNeighbors += source.data[neighbor];
              greenNeighbors += source.data[neighbor + 1];
              blueNeighbors += source.data[neighbor + 2];
            }
          }
          const outputOffset = outputPixel * 4;
          output.data[outputOffset] = Math.max(0, Math.min(255, Math.round(source.data[offset] * (1 + 8 * amount) - redNeighbors * amount)));
          output.data[outputOffset + 1] = Math.max(0, Math.min(255, Math.round(source.data[offset + 1] * (1 + 8 * amount) - greenNeighbors * amount)));
          output.data[outputOffset + 2] = Math.max(0, Math.min(255, Math.round(source.data[offset + 2] * (1 + 8 * amount) - blueNeighbors * amount)));
          output.data[outputOffset + 3] = source.data[offset + 3];
        }
      }
      context.putImageData(output, 0, firstRow);
      if (firstRow + rowCount < height) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    return true;
  }

  async function encodeAtSize(dimensions, mimeType, quality, revision) {
    const canvas = createCanvas(dimensions);
    try {
      const sharpened = await sharpenCanvas(canvas, revision);
      if (!sharpened) return null;
      return await encodeCanvas(canvas, mimeType, quality);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async function findBestQuality(dimensions, mimeType, targetBytes, revision) {
    const minimumQuality = 0.05;
    let bestBlob = await encodeAtSize(dimensions, mimeType, minimumQuality, revision);
    if (!bestBlob) throw new Error("The image could not be exported. Try another format.");
    if (revision !== state.revision) return null;

    if (bestBlob.size >= targetBytes) {
      let tooLargeScale = 1;
      let fittingScale = 1;
      let foundFittingScale = false;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const scale = 0.75 ** (attempt + 1);
        const candidateDimensions = scaledDimensions(dimensions, scale);
        const candidate = await encodeAtSize(candidateDimensions, mimeType, minimumQuality, revision);
        if (!candidate) throw new Error("The image could not be exported. Try another format.");
        if (revision !== state.revision) return null;
        if (candidate.size < targetBytes) {
          bestBlob = candidate;
          fittingScale = scale;
          foundFittingScale = true;
          break;
        }
        tooLargeScale = scale;
        if (candidateDimensions.width === 1 && candidateDimensions.height === 1) break;
      }
      if (!foundFittingScale) {
        throw new Error(`This image cannot fit under ${formatBytes(targetBytes)} in the selected format.`);
      }

      let lowScale = fittingScale;
      let highScale = tooLargeScale;
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const scale = (lowScale + highScale) / 2;
        const candidateDimensions = scaledDimensions(dimensions, scale);
        const candidate = await encodeAtSize(candidateDimensions, mimeType, minimumQuality, revision);
        if (!candidate) throw new Error("The image could not be exported. Try another format.");
        if (revision !== state.revision) return null;
        if (candidate.size < targetBytes) {
          bestBlob = candidate;
          lowScale = scale;
        } else {
          highScale = scale;
        }
      }
      dimensions = scaledDimensions(dimensions, lowScale);
    }

    if (mimeType === "image/png") return { blob: bestBlob, dimensions };

    let lowQuality = minimumQuality;
    let highQuality = 1;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const quality = (lowQuality + highQuality) / 2;
      const candidate = await encodeAtSize(dimensions, mimeType, quality, revision);
      if (!candidate) throw new Error("The image could not be exported. Try another format.");
      if (revision !== state.revision) return null;
      if (candidate.size < targetBytes) {
        bestBlob = candidate;
        lowQuality = quality;
      } else {
        highQuality = quality;
      }
    }
    return { blob: bestBlob, dimensions };
  }

  function updateAspectControls() {
    for (const button of elements.aspectButtons) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.aspectRatio) === state.cropRatio));
    }
  }

  function applyAspectRatio(ratio) {
    const maxWidth = state.width;
    const maxHeight = state.height;
    let width = maxWidth;
    let height = Math.round(width / ratio);
    if (height > maxHeight) {
      height = maxHeight;
      width = Math.round(height * ratio);
    }
    elements.widthInput.value = String(Math.max(1, width));
    elements.heightInput.value = String(Math.max(1, height));
    elements.ratioLock.checked = true;
    elements.widthInput.max = String(MAX_DIMENSION);
    elements.heightInput.max = String(MAX_DIMENSION);
    state.ratio = ratio;
    state.cropRatio = ratio;
    updateAspectControls();
    scheduleProcessing();
  }

  function buildPdf(jpegBytes, imageWidth, imageHeight) {
    const landscape = imageWidth > imageHeight;
    const pageWidth = landscape ? 842 : 595;
    const pageHeight = landscape ? 595 : 842;
    const margin = 36;
    const scale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const append = (part) => {
      chunks.push(part);
      length += part.length;
    };
    const appendText = (text) => append(encoder.encode(text));
    appendText("%PDF-1.4\n");
    const objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
      null,
      null,
    ];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(length);
      if (index === 3) {
        appendText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
        append(jpegBytes);
        appendText("\nendstream\nendobj\n");
      } else if (index === 4) {
        const contentBytes = encoder.encode(content);
        appendText(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
        append(contentBytes);
        appendText("endstream\nendobj\n");
      } else {
        appendText(objects[index]);
      }
    }
    const xrefOffset = length;
    appendText(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    for (const offset of offsets.slice(1)) appendText(`${String(offset).padStart(10, "0")} 00000 n \n`);
    appendText(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    const pdf = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      pdf.set(chunk, offset);
      offset += chunk.length;
    }
    return new Blob([pdf], { type: "application/pdf" });
  }

  async function downloadAsPdf() {
    if (!state.resultBlob || !state.file) return;
    const resultBlob = state.resultBlob;
    const sourceFile = state.file;
    const buttonLabel = elements.downloadPdfButton.textContent;
    elements.downloadPdfButton.disabled = true;
    elements.downloadPdfButton.textContent = "Creating PDF…";
    try {
      const bitmap = await createImageBitmap(resultBlob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const imageWidth = bitmap.width;
      const imageHeight = bitmap.height;
      const context = canvas.getContext("2d");
      let jpegBlob;
      try {
        if (!context) throw new Error("Your browser could not create an image canvas for the PDF.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0);
        jpegBlob = await encodeCanvas(canvas, "image/jpeg", 0.92);
      } finally {
        bitmap.close();
        canvas.width = 0;
        canvas.height = 0;
      }
      if (!jpegBlob) throw new Error("The image could not be prepared for PDF export.");
      const pdf = buildPdf(new Uint8Array(await jpegBlob.arrayBuffer()), imageWidth, imageHeight);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sourceFile.name.replace(/\.[^.]+$/, "") || "image"}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      showMessage(elements.processingError, error.message || "The PDF could not be created in this browser.");
    } finally {
      elements.downloadPdfButton.textContent = buttonLabel;
      elements.downloadPdfButton.disabled = !state.resultBlob;
    }
  }

  async function processImage(revision) {
    if (revision !== state.revision || !state.image) return;
    let dimensions;
    try {
      dimensions = getOutputDimensions();
    } catch (error) {
      elements.resultPreview.classList.add("hidden");
      elements.resultPlaceholder.classList.remove("hidden");
      elements.resultPlaceholder.textContent = error.message;
      elements.status.textContent = "Check dimensions";
      showMessage(elements.processingError, error.message);
      completeActiveBatchItem(false);
      return;
    }

    const mimeType = elements.formatSelect.value;
    try {
      const result = state.targetBytes === null
        ? { blob: await encodeAtSize(dimensions, mimeType, Number(elements.qualitySlider.value) / 100, revision), dimensions }
        : await findBestQuality(dimensions, mimeType, state.targetBytes, revision);
      if (revision !== state.revision) return;
      const { blob } = result;
      if (!blob) {
        throw new Error("The image could not be exported in this format. Try another format or smaller dimensions.");
      }
      const resultUrl = URL.createObjectURL(blob);
      try {
        const decodedPreview = new Image();
        decodedPreview.src = resultUrl;
        await decodedPreview.decode();
      } catch (error) {
        URL.revokeObjectURL(resultUrl);
        throw new Error("The processed image could not be decoded for preview.");
      }
      if (revision !== state.revision) {
        URL.revokeObjectURL(resultUrl);
        return;
      }
      if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
      state.resultBlob = blob;
      state.resultUrl = resultUrl;
      elements.resultPreview.src = state.resultUrl;
      elements.resultPreview.classList.remove("hidden");
      elements.resultPlaceholder.classList.add("hidden");
      elements.resultSize.textContent = formatBytes(blob.size);
      elements.dimensionsResult.textContent = `${result.dimensions.width.toLocaleString()} × ${result.dimensions.height.toLocaleString()} px`;
      updateSizeChange(blob.size, state.file.size);
      elements.status.textContent = "Preview updated";
      elements.downloadButton.disabled = false;
      elements.downloadPdfButton.disabled = false;
      showMessage(elements.processingError, "");
      updateTargetSizeControls(state.targetBytes === null
        ? ""
        : `Target met: ${formatBytes(blob.size)} (maximum ${formatBytes(state.targetBytes)}).`);
      completeActiveBatchItem(true);
    } catch (error) {
      if (revision !== state.revision) return;
      showProcessingFailure(error.message || "The image could not be exported. Try another format or smaller dimensions.");
      if (state.targetBytes !== null) updateTargetSizeControls("Could not meet this size target. See the error above.");
      completeActiveBatchItem(false);
    }
  }

  function updateSizeChange(newSize, originalSize) {
    if (newSize < originalSize) {
      const saved = Math.round((1 - newSize / originalSize) * 100);
      elements.sizeChange.textContent = `${saved}% smaller`;
      elements.sizeChange.classList.add("text-emerald-600");
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
    elements.resultPreview.classList.add("hidden");
    elements.resultPlaceholder.classList.remove("hidden");
    elements.resultPlaceholder.textContent = "Preview unavailable";
    elements.status.textContent = "Could not process image";
    elements.downloadButton.disabled = true;
    elements.downloadPdfButton.disabled = true;
    showMessage(elements.processingError, message);
  }

  async function downloadBatchZip() {
    const readyItems = state.batchItems.filter((item) => item.status === "Ready" && item.blob);
    if (readyItems.length === 0) return;
    if (typeof window.JSZip !== "function") {
      showToast("ZIP download is unavailable. Check your internet connection and try again.");
      return;
    }
    state.zipBuilding = true;
    renderBatchQueue();
    const originalLabel = elements.downloadAllButton.textContent;
    elements.downloadAllButton.textContent = "Preparing ZIP…";
    try {
      const zip = new window.JSZip();
      const usedNames = new Set();
      for (const item of readyItems) {
        const lastDot = item.outputName.lastIndexOf(".");
        const baseName = lastDot > 0 ? item.outputName.slice(0, lastDot) : item.outputName;
        const extension = lastDot > 0 ? item.outputName.slice(lastDot) : "";
        let name = item.outputName;
        let suffix = 2;
        while (usedNames.has(name.toLowerCase())) {
          name = `${baseName} (${suffix})${extension}`;
          suffix += 1;
        }
        usedNames.add(name.toLowerCase());
        zip.file(name, item.blob);
      }
      const archive = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = "imgcon-images.zip";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("ImgCon could not create the ZIP archive.", error);
      showToast("Could not create the ZIP download.");
    } finally {
      state.zipBuilding = false;
      elements.downloadAllButton.textContent = originalLabel;
      renderBatchQueue();
    }
  }

  elements.downloadAllButton.addEventListener("click", downloadBatchZip);

  elements.dropZone.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openPicker();
  });
  elements.browseButton.addEventListener("click", openPicker);
  elements.fileInput.addEventListener("change", (event) => queueFiles(event.target.files));
  elements.chooseAnother.addEventListener("click", () => {
    cancelBatchRun();
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
  elements.dropZone.addEventListener("drop", (event) => queueFiles(event.dataTransfer.files));
  window.addEventListener("paste", (event) => {
    const clipboardItems = event.clipboardData ? [...event.clipboardData.items] : [];
    const imageFiles = clipboardItems
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (imageFiles.length === 0) return;
    event.preventDefault();
    queueFiles(imageFiles);
  });
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => event.preventDefault());

  elements.formatSelect.addEventListener("change", () => {
    updateQualityNote();
    scheduleProcessing();
  });
  elements.qualitySlider.addEventListener("input", () => {
    state.targetBytes = null;
    elements.customTargetKb.value = "";
    elements.qualityValue.textContent = `${elements.qualitySlider.value}%`;
    scheduleProcessing();
  });
  for (const button of elements.targetSizeButtons) {
    button.addEventListener("click", () => {
      const targetBytes = Number(button.dataset.targetBytes);
      state.targetBytes = state.targetBytes === targetBytes ? null : targetBytes;
      elements.customTargetKb.value = "";
      updateTargetSizeControls();
      scheduleProcessing();
    });
  }
  elements.customTargetButton.addEventListener("click", () => {
    const targetKb = Number(elements.customTargetKb.value);
    if (!Number.isFinite(targetKb) || targetKb < 0.1 || targetKb > 51200) {
      elements.targetSizeNote.textContent = "Enter a target between 0.1 KB and 51,200 KB.";
      return;
    }
    const targetBytes = targetKb * 1024;
    state.targetBytes = state.targetBytes === targetBytes ? null : targetBytes;
    if (state.targetBytes === null) elements.customTargetKb.value = "";
    updateTargetSizeControls();
    scheduleProcessing();
  });
  elements.customTargetKb.addEventListener("keydown", (event) => {
    if (event.key === "Enter") elements.customTargetButton.click();
  });
  for (const button of elements.aspectButtons) {
    button.addEventListener("click", () => applyAspectRatio(Number(button.dataset.aspectRatio)));
  }
  elements.brightnessSlider.addEventListener("input", () => {
    updateEnhancementControls();
    elements.enhanceNote.textContent = "Custom adjustments applied.";
    scheduleProcessing();
  });
  elements.contrastSlider.addEventListener("input", () => {
    updateEnhancementControls();
    elements.enhanceNote.textContent = "Custom adjustments applied.";
    scheduleProcessing();
  });
  elements.saturationSlider.addEventListener("input", () => {
    updateEnhancementControls();
    elements.enhanceNote.textContent = "Custom adjustments applied.";
    scheduleProcessing();
  });
  elements.sharpnessSlider.addEventListener("input", () => {
    updateEnhancementControls();
    elements.enhanceNote.textContent = "Custom adjustments applied.";
    scheduleProcessing();
  });
  elements.grayscaleToggle.addEventListener("change", scheduleProcessing);
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
    state.targetBytes = null;
    state.cropRatio = null;
    elements.widthInput.value = String(state.width);
    elements.heightInput.value = String(state.height);
    elements.ratioLock.checked = true;
    elements.customTargetKb.value = "";
    elements.qualitySlider.value = "85";
    elements.qualityValue.textContent = "85%";
    elements.brightnessSlider.value = "100";
    elements.brightnessValue.textContent = "100%";
    elements.contrastSlider.value = "100";
    elements.contrastValue.textContent = "100%";
    elements.saturationSlider.value = "100";
    elements.saturationValue.textContent = "100%";
    elements.sharpnessSlider.value = "0";
    elements.sharpnessValue.textContent = "0%";
    elements.enhanceNote.textContent = "Automatically balance contrast and color, then add a touch of sharpness.";
    elements.grayscaleToggle.checked = false;
    elements.formatSelect.value = FORMAT_EXTENSIONS[state.file.type] ? state.file.type : "image/png";
    updateQualityNote();
    updateTargetSizeControls();
    updateAspectControls();
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

  elements.downloadPdfButton.addEventListener("click", downloadAsPdf);

  const editorTabs = [...document.querySelectorAll("[data-editor-tab]")];
  function activateEditorTab(name, focus = false) {
    for (const tab of editorTabs) {
      const active = tab.dataset.editorTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      panel.hidden = !active;
      if (active && focus) tab.focus();
    }
  }
  for (const tab of editorTabs) {
    tab.addEventListener("click", () => activateEditorTab(tab.dataset.editorTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = editorTabs.indexOf(tab);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? editorTabs.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : editorTabs.length - 1)) % editorTabs.length;
      activateEditorTab(editorTabs[nextIndex].dataset.editorTab, true);
    });
  }
  activateEditorTab("compress");

  elements.autoEnhanceButton.addEventListener("click", autoEnhance);

  const legalPages = {
    about: {
      title: "About ImgCon",
      html: `<p>ImgCon is a browser-based image utility for everyday conversion, resizing, compression, cropping, and PDF export. It is designed to make common image tasks straightforward without requiring an account.</p>
        <h3 class="font-semibold text-white">Private by design</h3>
        <p>Image processing happens locally in your browser. Images selected in the editor are not uploaded to or stored on an ImgCon image-processing server. Temporary working data stays in your browser tab and is released when you replace or clear the image or close the page.</p>
        <h3 class="font-semibold text-white">About this service</h3>
        <p>ImgCon is provided as a general-purpose tool. Supported formats and performance depend on your browser and device. We may improve or change the service over time.</p>`,
    },
    privacy: {
      title: "Privacy Policy",
      html: `<p><strong class="text-white">Images are processed on your device.</strong> ImgCon does not upload, collect, or store the image files you open in the editor on an ImgCon server. Conversion, resizing, filtering, compression, and PDF generation take place locally in your browser.</p>
        <h3 class="font-semibold text-white">Information and storage</h3>
        <p>This version does not require an account and does not intentionally store image content, edited results, or personal information. Your browser or device may keep temporary memory while the page is open. Standard web hosting and network providers may process basic technical request data, such as an IP address or requested page, to deliver and protect the website; this does not include image files selected in the editor.</p>
        <h3 class="font-semibold text-white">Third parties</h3>
        <p>The page may load website styling resources from third-party providers. If advertising, analytics, or other third-party services are added, those providers may use cookies or similar technologies under their own privacy policies. We will update this notice to identify those services before enabling them.</p>
        <h3 class="font-semibold text-white">Your choices and security</h3>
        <p>You can remove an image from the editor by choosing another file or closing the page. Keep in mind that no website or local browser environment can guarantee absolute security. Do not use this tool for files that your device or browser is not permitted to handle.</p>
        <p class="text-xs text-slate-500">Last updated: October 22, 2026.</p>`,
    },
    terms: {
      title: "Terms of Service",
      html: `<p>By using ImgCon, you agree to these terms. If you do not agree, do not use the service.</p>
        <h3 class="font-semibold text-white">Use of the tool</h3>
        <p>ImgCon provides browser-based image utilities on an “as available” basis. You are responsible for ensuring that you have the rights and permissions needed to use, edit, and download each image, and for checking that the resulting file meets the requirements of its intended destination.</p>
        <h3 class="font-semibold text-white">Your files and results</h3>
        <p>Image processing and PDF creation are performed locally in your browser; ImgCon does not upload or retain your image files on an image-processing server. You remain responsible for keeping your original files and verifying downloaded results. Output quality, supported formats, and exact file size can vary by browser.</p>
        <h3 class="font-semibold text-white">No warranty; limitation</h3>
        <p>The service is provided without warranties to the fullest extent permitted by applicable law. ImgCon is not responsible for lost files, rejected uploads, inaccurate output, interruption, or indirect damages arising from use of the service. Nothing in these terms limits rights that cannot be excluded by law.</p>
        <h3 class="font-semibold text-white">Changes</h3>
        <p>We may update these terms or change features as the service evolves. Continued use after a revised version is posted constitutes acceptance where permitted by law.</p>
        <p class="text-xs text-slate-500">Last updated: October 22, 2026.</p>`,
    },
    contact: {
      title: "Contact Us",
      html: `<p>We welcome questions, accessibility feedback, and reports about problems with ImgCon.</p>
        <h3 class="font-semibold text-white">Contact information</h3>
        <p><a class="font-medium text-indigo-300 underline underline-offset-2" href="mailto:imgcon72@gmail.com">imgcon72@gmail.com</a> <button type="button" data-copy-email class="ml-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-400">Copy email</button></p>
        <p data-copy-status role="status" aria-live="polite" class="text-xs text-slate-500"></p>
        <p>We aim to respond to support messages within 2 business days. Please do not include sensitive personal information or private images in a support request; image files are processed locally and are not needed to report a problem.</p>`,
    },
  };

  document.querySelectorAll("[data-legal]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = legalPages[button.dataset.legal];
      if (!page) return;
      elements.legalTitle.textContent = page.title;
      elements.legalContent.innerHTML = page.html;
      elements.legalDialog.showModal();
      elements.legalClose.focus();
    });
  });
  elements.legalClose.addEventListener("click", () => elements.legalDialog.close());
  elements.legalDialog.addEventListener("click", (event) => {
    if (event.target === elements.legalDialog) elements.legalDialog.close();
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-email]");
    if (!button) return;
    const status = button.parentElement.querySelector("[data-copy-status]")
      || button.closest("#legal-content").querySelector("[data-copy-status]");
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText("imgcon72@gmail.com");
        copied = true;
      }
    } catch (error) {
      console.warn("ImgCon could not use the Clipboard API; trying the browser fallback.", error);
    }
    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = "imgcon72@gmail.com";
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        console.warn("ImgCon could not use the browser clipboard fallback.", error);
      } finally {
        textarea.remove();
      }
    }
    if (copied) {
      button.textContent = "Copied!";
      status.textContent = "Email address copied to clipboard.";
    } else {
      button.textContent = "Copy unavailable";
      status.textContent = "Clipboard access is unavailable. Use the email link to contact us.";
    }
  });

  document.querySelectorAll(".faq-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const opening = item.dataset.open !== "true";
      document.querySelectorAll(".faq-item").forEach((faqItem) => {
        const isOpen = faqItem === item && opening;
        faqItem.dataset.open = String(isOpen);
        faqItem.querySelector(".faq-toggle").setAttribute("aria-expanded", String(isOpen));
        faqItem.querySelector(".faq-answer").setAttribute("aria-hidden", String(!isOpen));
        faqItem.querySelector(".faq-indicator").textContent = isOpen ? "−" : "+";
      });
    });
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("ImgCon could not register offline support.", error);
      showToast("Offline support could not be enabled.");
    });
  }
})();
