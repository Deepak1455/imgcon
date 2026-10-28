"use strict";

(() => {
  const input = document.getElementById("images-input");
  const browseButton = document.getElementById("browse-images");
  const dropZone = document.getElementById("pdf-drop-zone");
  const pageGrid = document.getElementById("page-grid");
  const orientationSelect = document.getElementById("page-orientation");
  const qualitySelect = document.getElementById("pdf-quality");
  const mergeButton = document.getElementById("merge-pdf");
  const status = document.getElementById("pdf-status");
  const error = document.getElementById("pdf-error");
  const pages = [];
  let busy = false;

  function formatBytes(bytes) {
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function addFiles(files) {
    error.textContent = "";
    const allowed = Array.from(files || []);
    for (const file of allowed) {
      if (!file.type.startsWith("image/")) {
        error.textContent = `${file.name}: select an image file.`;
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        error.textContent = `${file.name}: images must be 50 MB or smaller.`;
        continue;
      }
      pages.push({ file, url: URL.createObjectURL(file) });
    }
    input.value = "";
    renderPages();
  }

  function renderPages(updateStatus = true) {
    pageGrid.replaceChildren();
    input.disabled = busy;
    browseButton.disabled = busy;
    orientationSelect.disabled = busy;
    qualitySelect.disabled = busy;
    pages.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "page-card";
      const image = document.createElement("img");
      image.src = item.url;
      image.alt = `Preview of ${item.file.name}`;
      image.loading = "lazy";
      const badge = document.createElement("span");
      badge.className = "page-badge";
      badge.textContent = `Page ${index + 1} of ${pages.length}`;
      const name = document.createElement("p");
      name.className = "page-name";
      name.textContent = item.file.name;
      const controls = document.createElement("div");
      controls.className = "page-controls";
      const up = makeButton("Move page up", "↑", () => movePage(index, -1));
      const down = makeButton("Move page down", "↓", () => movePage(index, 1));
      const remove = makeButton(`Delete ${item.file.name}`, "Delete", () => deletePage(index));
      up.disabled = busy || index === 0;
      down.disabled = busy || index === pages.length - 1;
      remove.disabled = busy;
      controls.append(up, down, remove);
      card.append(image, badge, name, controls);
      pageGrid.append(card);
    });
    mergeButton.disabled = busy || pages.length === 0;
    if (updateStatus && !busy) status.textContent = pages.length ? `${pages.length} image${pages.length === 1 ? "" : "s"} ready to combine.` : "Add images to start a PDF.";
  }

  function makeButton(label, text, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", action);
    return button;
  }

  function movePage(index, amount) {
    const target = index + amount;
    if (target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    renderPages();
  }

  function deletePage(index) {
    URL.revokeObjectURL(pages[index].url);
    pages.splice(index, 1);
    renderPages();
  }

  function canvasJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Your browser could not encode an image for the PDF."));
      }, "image/jpeg", quality);
    });
  }

  async function preparePage(item, quality, maxDimension, orientation) {
    const bitmap = await createImageBitmap(item.file);
    try {
      const landscape = orientation === "landscape" || (orientation === "auto" && bitmap.width > bitmap.height);
      const pageWidth = landscape ? 842 : 595;
      const pageHeight = landscape ? 595 : 842;
      const margin = 36;
      const maxSide = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, maxDimension / maxSide);
      const imageWidth = Math.max(1, Math.round(bitmap.width * scale));
      const imageHeight = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error(`Could not create a canvas for ${item.file.name}.`);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, imageWidth, imageHeight);
      context.drawImage(bitmap, 0, 0, imageWidth, imageHeight);
      const blob = await canvasJpeg(canvas, quality);
      canvas.width = 0;
      canvas.height = 0;
      const drawScale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight);
      return {
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        imageWidth,
        imageHeight,
        pageWidth,
        pageHeight,
        drawWidth: imageWidth * drawScale,
        drawHeight: imageHeight * drawScale,
        x: (pageWidth - imageWidth * drawScale) / 2,
        y: (pageHeight - imageHeight * drawScale) / 2,
      };
    } finally {
      bitmap.close();
    }
  }

  function buildPdf(preparedPages) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const append = (part) => {
      chunks.push(part);
      length += part.length;
    };
    const appendText = (text) => append(encoder.encode(text));
    const pageCount = preparedPages.length;
    const objectCount = 2 + pageCount * 3;
    const objects = new Array(objectCount + 1);
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    const pageKids = preparedPages.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
    objects[2] = `<< /Type /Pages /Kids [${pageKids}] /Count ${pageCount} >>`;
    preparedPages.forEach((page, index) => {
      const pageId = 3 + index * 3;
      const imageId = pageId + 1;
      const contentId = pageId + 2;
      const content = `q\n${page.drawWidth.toFixed(2)} 0 0 ${page.drawHeight.toFixed(2)} ${page.x.toFixed(2)} ${page.y.toFixed(2)} cm\n/Im${index} Do\nQ\n`;
      const contentBytes = encoder.encode(content);
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[imageId] = { image: page.jpeg, width: page.imageWidth, height: page.imageHeight };
      objects[contentId] = { content: contentBytes };
    });
    appendText("%PDF-1.4\n");
    for (let id = 1; id <= objectCount; id += 1) {
      offsets[id] = length;
      const object = objects[id];
      appendText(`${id} 0 obj\n`);
      if (object.image) {
        appendText(`<< /Type /XObject /Subtype /Image /Width ${object.width} /Height ${object.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${object.image.length} >>\nstream\n`);
        append(object.image);
        appendText("\nendstream\n");
      } else if (object.content) {
        appendText(`<< /Length ${object.content.length} >>\nstream\n`);
        append(object.content);
        appendText("endstream\n");
      } else {
        appendText(object);
      }
      appendText("\nendobj\n");
    }
    const xrefOffset = length;
    appendText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= objectCount; id += 1) {
      appendText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    }
    appendText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    const pdf = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      pdf.set(chunk, offset);
      offset += chunk.length;
    }
    return new Blob([pdf], { type: "application/pdf" });
  }

  async function createPdf() {
    if (busy || pages.length === 0) return;
    busy = true;
    const queuedPages = pages.slice();
    error.textContent = "";
    mergeButton.disabled = true;
    const preset = qualitySelect.value;
    const targetBytes = preset === "compressed" ? 1024 * 1024 : preset === "compact" ? 500 * 1024 : null;
    const settings = preset === "compact"
      ? [{ quality: 0.48, maxDimension: 900 }, { quality: 0.38, maxDimension: 760 }, { quality: 0.3, maxDimension: 640 }, { quality: 0.25, maxDimension: 520 }]
      : preset === "compressed"
        ? [{ quality: 0.72, maxDimension: 1400 }, { quality: 0.58, maxDimension: 1100 }, { quality: 0.45, maxDimension: 900 }, { quality: 0.35, maxDimension: 720 }]
        : [{ quality: 0.9, maxDimension: 2200 }];
    const originalLabel = mergeButton.textContent;
    try {
      let pdf;
      let attempt = 0;
      for (const setting of settings) {
        attempt += 1;
        status.textContent = `Preparing ${queuedPages.length} page${queuedPages.length === 1 ? "" : "s"} (${attempt}/${settings.length})…`;
        const prepared = [];
        for (const item of queuedPages) prepared.push(await preparePage(item, setting.quality, setting.maxDimension, orientationSelect.value));
        pdf = buildPdf(prepared);
        if (!targetBytes || pdf.size <= targetBytes) break;
      }
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = "combined-documents-imgcon.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      status.textContent = targetBytes && pdf.size > targetBytes
        ? `Downloaded ${formatBytes(pdf.size)}. The selected size target (${formatBytes(targetBytes)}) could not be reached with these images.`
        : `Downloaded ${formatBytes(pdf.size)} PDF with ${queuedPages.length} page${queuedPages.length === 1 ? "" : "s"}.`;
    } catch (cause) {
      error.textContent = cause.message || "The PDF could not be created in this browser.";
      status.textContent = "PDF creation failed.";
    } finally {
      busy = false;
      mergeButton.textContent = originalLabel;
      renderPages(false);
    }
  }

  input.addEventListener("change", () => addFiles(input.files));
  browseButton.addEventListener("click", () => input.click());
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    addFiles(event.dataTransfer.files);
  });
  mergeButton.addEventListener("click", createPdf);
  renderPages();
})();
