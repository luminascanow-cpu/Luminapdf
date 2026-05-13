const pdfLibApi = window.PDFLib || null;
const PDFDocument = pdfLibApi?.PDFDocument || null;
const rgb = pdfLibApi?.rgb || null;
const StandardFonts = pdfLibApi?.StandardFonts || null;
const pdfJsApi = window.pdfjsLib || null;
const editorUrlParams = new URLSearchParams(window.location.search);

if (editorUrlParams.get('embed') === '1') {
  document.body.classList.add('embed-mode');
}

if (pdfJsApi) {
  // Use local worker file (version 3.11.174 UMD build, served alongside this page)
  pdfJsApi.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';
}

const DOC_COLORS = [
  '#4647d3', '#e05a2b', '#10a37f', '#d32b6b', '#7c3aed',
  '#d97706', '#0369a1', '#065f46', '#9f1239', '#1d4ed8'
];
const FONT_PRESETS = {
  sans: {
    css: '"Manrope", "Segoe UI", sans-serif',
    pdf: 'Helvetica',
    label: 'Sans',
  },
  serif: {
    css: '"Georgia", "Times New Roman", serif',
    pdf: 'TimesRoman',
    label: 'Serif',
  },
  mono: {
    css: '"SFMono-Regular", "Courier New", monospace',
    pdf: 'Courier',
    label: 'Mono',
  },
};
let docColorIndex = 0;
const getNextDocColor = () => DOC_COLORS[docColorIndex++ % DOC_COLORS.length];

const state = {
  sourceBytes: null,
  pdfJsDoc: null,
  thumbnailPdfJsDoc: null, // separate lightweight instance for thumbnails only
  selectedPageIndex: 0,
  pageOrder: [],
  pageSizes: [],
  pageMetadata: [], // [{ docId, color, docName }] parallel to pageOrder
  overlays: {},
  mode: 'view',
  signatureDataUrl: null,
  imageDataUrl: null,
  drag: null,
  fileName: 'edited-document.pdf',
  zoomLevel: 1.0,
  isDraggingPan: false,
  lastPanPoint: null,
  focusMode: false,
  contextPoint: null,
  pendingTextFocusId: null,
  pendingTextSelectAllId: null,
  textFontPreset: 'sans',
  selectionDraft: null,
  committedSelection: null,
  pageTextCache: {}, // { [sourcePageIndex]: textContent }
  pdfSessionId: null,
  currentScale: 1.0,
  activeOverlayId: null,
};

const elements = {
  upload: document.getElementById('editor-pdf-upload'),
  uploadMirrors: Array.from(document.querySelectorAll('.file-trigger-input')),
  fileState: document.getElementById('editor-file-state'),
  fileName: document.getElementById('editor-file-name'),
  imageUpload: document.getElementById('editor-image-upload'),
  imageState: document.getElementById('editor-image-state'),
  imageName: document.getElementById('editor-image-name'),
  textSize: document.getElementById('editor-text-size'),
  textColor: document.getElementById('editor-text-color'),
  textStyleCopy: document.getElementById('text-style-copy'),
  textStyleChips: document.getElementById('text-style-chips'),
  whiteoutWidth: document.getElementById('whiteout-width'),
  whiteoutHeight: document.getElementById('whiteout-height'),
  placeWhiteoutButton: document.getElementById('place-whiteout-button'),
  placeImageButton: document.getElementById('place-image-button'),
  openSignatureModalButton: document.getElementById('open-signature-modal'),
  placeSignatureButton: document.getElementById('place-signature-button'),
  movePageUpButton: document.getElementById('move-page-up'),
  movePageDownButton: document.getElementById('move-page-down'),
  deletePageButton: document.getElementById('delete-page'),
  extractPageButton: document.getElementById('extract-page'),
  extractTextButton: document.getElementById('extract-text'),
  downloadButton: document.getElementById('download-edited-pdf'),
  zoomOutButton: document.getElementById('zoom-out'),
  zoomFitButton: document.getElementById('zoom-fit'),
  zoomInButton: document.getElementById('zoom-in'),
  toolPanButton: document.getElementById('tool-pan'),
  mergePdfInput: document.getElementById('editor-pdf-merge'),
  splitPdfBtn: document.getElementById('split-pdf-btn'),
  thumbnailsStrip: document.getElementById('editor-thumbnails-strip'),
  prevPageButton: document.getElementById('prev-page'),
  nextPageButton: document.getElementById('next-page'),
  pageStage: document.getElementById('page-stage'),
  pageStageCard: document.getElementById('page-stage-card'),
  pageStageWrap: document.querySelector('.page-stage-wrap'),
  emptyState: document.getElementById('editor-empty-state'),
  textHitLayer: document.getElementById('pdf-text-hit-layer'),
  overlayLayer: document.getElementById('page-overlay-layer'),
  canvas: document.getElementById('pdf-canvas'),
  nativePreview: document.getElementById('pdf-native-preview'),
  statusTitle: document.getElementById('editor-status-title'),
  statusCopy: document.getElementById('editor-status-copy'),
  modePill: document.getElementById('editor-mode-pill'),
  signatureModal: document.getElementById('signature-modal'),
  signatureCanvas: document.getElementById('signature-canvas'),
  clearSignatureButton: document.getElementById('clear-signature'),
  saveSignatureButton: document.getElementById('save-signature'),
  ocrModal: document.getElementById('ocr-modal'),
  ocrStatus: document.getElementById('ocr-modal-status'),
  ocrResultText: document.getElementById('ocr-result-text'),
  copyOcrTextButton: document.getElementById('copy-ocr-text'),
  // Dropdown buttons
  toolWhiteoutDropdown: document.getElementById('tool-whiteout-dropdown'),
  toolImageDropdown: document.getElementById('tool-image-dropdown'),
  toolSignatureDropdown: document.getElementById('tool-signature-dropdown'),
  toggleEditModeButton: document.getElementById('toggle-edit-mode'),
  workspace: document.querySelector('.editor-workspace'),
  contextMenu: document.getElementById('editor-context-menu'),
  contextAddWhiteout: document.getElementById('context-add-whiteout'),
  contextAddImage: document.getElementById('context-add-image'),
  contextAddSignature: document.getElementById('context-add-signature'),
  contextPan: document.getElementById('context-pan'),
  imagePreviewBox: document.getElementById('image-import-preview-box'),
  imagePreviewEl: document.getElementById('image-preview-el'),
  signatureUploadInput: document.getElementById('signature-upload-input'),
  sigPreviewImg: document.getElementById('sig-preview-img'),
  activeSigPreview: document.getElementById('active-signature-preview'),
  leftRail: document.querySelector('.editor-left-rail'),
  railDragHandle: document.getElementById('left-rail-header'),
  uploadSignatureLocal: document.getElementById('upload-signature-local'),
  paymentModal: document.getElementById('payment-modal'),
  paymentModalBackdrop: document.getElementById('payment-modal-backdrop'),
  cancelPaymentButton: document.getElementById('cancel-payment-button'),
  proceedPaymentButton: document.getElementById('proceed-payment-button'),
};

const dropdownIds = ['dropdown-whiteout', 'dropdown-image', 'dropdown-signature'];

const toggleDropdown = (targetId) => {
  dropdownIds.forEach((id) => {
    const el = document.getElementById(id);
    if (id === targetId) {
      el.hidden = !el.hidden;
    } else {
      el.hidden = true;
    }
  });
};

const closeAllDropdowns = () => {
  dropdownIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.hidden = true;
    }
  });
};

const hideContextMenu = () => {
  if (elements.contextMenu) {
    elements.contextMenu.hidden = true;
  }
};

const setEmptyState = (isEmpty, isDragging = false) => {
  if (!elements.emptyState || !elements.pageStage) return;
  elements.emptyState.hidden = !isEmpty;
  elements.pageStage.hidden = isEmpty;
  elements.pageStageCard.classList.toggle('is-empty', isEmpty);
  elements.pageStageCard.classList.toggle('has-document', !isEmpty);
  elements.pageStageCard.classList.toggle('is-dragover', isDragging);
};

const showContextMenu = (clientX, clientY) => {
  if (!elements.contextMenu) return;
  const menuWidth = 196;
  const menuHeight = 240;
  const left = Math.min(clientX, window.innerWidth - menuWidth - 14);
  const top = Math.min(clientY, window.innerHeight - menuHeight - 14);
  elements.contextMenu.style.left = `${Math.max(12, left)}px`;
  elements.contextMenu.style.top = `${Math.max(12, top)}px`;
  elements.contextMenu.hidden = false;
};

document.addEventListener('click', (event) => {
  if (!event.target.closest('.tool-dropdown-container')) {
    closeAllDropdowns();
  }

  if (!event.target.closest('.editor-context-menu')) {
    hideContextMenu();
  }

  if (state.committedSelection && !event.target.closest('.pdf-text-hit')) {
    cancelActiveSelection();
  }

  // Clear active overlay if clicking away from overlays and tools rail
  if (!event.target.closest('.overlay-item') && !event.target.closest('.editor-rail-card')) {
    if (state.activeOverlayId) {
      state.activeOverlayId = null;
      renderOverlayLayer();
    }
  }
});

// Robust global key listener for confirmation
window.addEventListener('keydown', (event) => {
  const isInput = event.target.tagName === 'INPUT' || 
                  event.target.tagName === 'TEXTAREA' || 
                  event.target.isContentEditable;

  if (event.key === 'Escape') {
    hideContextMenu();
    closeAllDropdowns();
    if (state.committedSelection) {
      cancelActiveSelection();
      return;
    }
  }

  if (state.committedSelection) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commitActiveSelection();
      return;
    } else if (event.key.toLowerCase() === 'x' && !isInput) {
      event.preventDefault();
      event.stopPropagation();
      cancelActiveSelection();
      return;
    }
  }

  // If user is editing a text overlay, handle Enter/Escape if not already handled
  if (event.key === 'Enter' && isInput && event.target.classList.contains('overlay-text-content')) {
    // This is mostly handled by the element's own listener, but adding it here as fallback
    // or to ensure it doesn't bubble up to other handlers.
  }
}, true);
 // Use capture phase to ensure we catch Enter before other elements

elements.textStyleChips?.querySelectorAll('[data-font-preset]').forEach((chip) => {
  chip.addEventListener('click', () => {
    setTextFontPreset(chip.dataset.fontPreset);
  });
});

elements.textSize?.addEventListener('input', () => {
  if (state.activeOverlayId) {
    updateActiveOverlayStyle();
  }
});

elements.textColor?.addEventListener('input', () => {
  if (state.activeOverlayId) {
    updateActiveOverlayStyle();
  }
});

const signatureContext = elements.signatureCanvas.getContext('2d');
let signatureDrawing = false;
let signatureHasPath = false;
const WEBSITE_EDITOR_PDF_KEY = 'luminaWebsiteEditorPdf';
let editorPdfObjectUrl = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const hasPdfLib = () => !!(PDFDocument && rgb && StandardFonts);
const hasPdfJs = () => !!pdfJsApi;

const setTextFontPreset = (preset) => {
  state.textFontPreset = FONT_PRESETS[preset] ? preset : 'sans';
  elements.textStyleChips?.querySelectorAll('[data-font-preset]').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.fontPreset === state.textFontPreset);
  });
  
  if (state.activeOverlayId) {
    updateActiveOverlayStyle();
  }
};

const detectFontPreset = (fontName = '') => {
  const normalized = String(fontName).toLowerCase();
  if (normalized.includes('courier') || normalized.includes('mono') || normalized.includes('consolas')) return 'mono';
  if (normalized.includes('times') || normalized.includes('serif') || normalized.includes('garamond') || normalized.includes('georgia') || normalized.includes('cambria')) return 'serif';
  if (normalized.includes('arial') || normalized.includes('helvetica') || normalized.includes('sans') || normalized.includes('verdana') || normalized.includes('tahoma')) return 'sans';
  return 'sans';
};

const formatDisplayFontSize = (fontSize) => {
  const numericSize = Number(fontSize);
  if (!Number.isFinite(numericSize) || numericSize <= 0) return null;
  return Math.round(numericSize);
};

const updateTextRecommendation = (recommendation) => {
  if (!elements.textStyleCopy) return;
  if (!recommendation) {
    elements.textStyleCopy.textContent = 'Smart suggestions will appear here.';
    setTextFontPreset('sans');
    return;
  }

  const fontLabel = recommendation.label || 'Sans';
  const displayFontSize = formatDisplayFontSize(recommendation.fontSize);
  const sizeLabel = displayFontSize ? `${displayFontSize}px` : 'matching size';
  const colorLabel = recommendation.color ? 'matching color' : '';
  
  elements.textStyleCopy.innerHTML = `
    <span style="color: var(--brand); font-weight: 700;">Matched Style:</span> 
    ${fontLabel}, ${sizeLabel} ${colorLabel}
  `;
  
  if (displayFontSize) elements.textSize.value = displayFontSize;
  if (recommendation.fontPreset) setTextFontPreset(recommendation.fontPreset);
  if (recommendation.color) {
    elements.textColor.value = recommendation.color;
  }
};

const getPdfFontForPreset = (preset) => {
  const key = FONT_PRESETS[preset]?.pdf || 'Helvetica';
  return StandardFonts[key] || StandardFonts.Helvetica;
};

const rgbToHex = (r, g, b) =>
  `#${[r, g, b]
    .map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0'))
    .join('')}`;
    
const getOverlayById = (overlayId) => {
  const sourceIndex = getSelectedSourcePageIndex();
  if (typeof sourceIndex !== 'number' || !state.overlays[sourceIndex]) return null;
  return state.overlays[sourceIndex].find((o) => o.id === overlayId) || null;
};

const updateActiveOverlayStyle = () => {
  if (!state.activeOverlayId) return;
  const overlay = getOverlayById(state.activeOverlayId);
  if (!overlay || overlay.type !== 'text') return;

  overlay.fontSize = Number(elements.textSize.value || 18);
  overlay.color = elements.textColor.value || '#1f2340';
  overlay.fontPreset = state.textFontPreset;
  
  // Apply immediately to DOM to avoid full re-render flickering during input
  const node = document.querySelector(`.overlay-item[data-id="${overlay.id}"]`);
  if (node) {
    const currentScale = state.currentScale || 1.0;
    node.style.fontSize = `${overlay.fontSize * currentScale}px`;
    node.style.color = overlay.color;
    node.style.fontFamily = FONT_PRESETS[overlay.fontPreset || 'sans']?.css || FONT_PRESETS.sans.css;
  }
};

const syncToolsWithOverlay = (overlay) => {
  if (!overlay || overlay.type !== 'text') return;
  
  if (elements.textSize) elements.textSize.value = Math.round(overlay.fontSize);
  if (elements.textColor) elements.textColor.value = overlay.color;
  if (overlay.fontPreset) {
    state.textFontPreset = overlay.fontPreset;
    elements.textStyleChips?.querySelectorAll('[data-font-preset]').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.fontPreset === state.textFontPreset);
    });
  }
};

const getCanvasColorRecommendation = (point) => {
  const context = elements.canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !elements.canvas.width || !elements.canvas.height) {
    return '#1f2340';
  }

  const canvasX = Math.round(clamp(point.x, 0, 1) * elements.canvas.width);
  const canvasY = Math.round(clamp(point.y, 0, 1) * elements.canvas.height);
  const sampleRadius = 18;

  let chosen = null;
  let chosenScore = Infinity;

  for (let offsetY = -sampleRadius; offsetY <= sampleRadius; offsetY += 1) {
    for (let offsetX = -sampleRadius; offsetX <= sampleRadius; offsetX += 1) {
      const x = canvasX + offsetX;
      const y = canvasY + offsetY;
      if (x < 0 || y < 0 || x >= elements.canvas.width || y >= elements.canvas.height) continue;
      const pixel = context.getImageData(x, y, 1, 1).data;
      const [red, green, blue, alpha] = pixel;
      if (alpha < 16) continue;
      const luminance = (red + green + blue) / 3;
      if (luminance > 242) continue;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance < chosenScore) {
        chosenScore = distance;
        chosen = rgbToHex(red, green, blue);
      }
    }
  }

  return chosen || '#1f2340';
};

const getCanvasBackgroundRecommendation = (rect) => {
  const context = elements.canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !elements.canvas.width || !elements.canvas.height) {
    return '#ffffff';
  }

  // Sample points in a grid around and inside the rect
  const samples = [];
  const steps = 4;
  const padding = 0.008; // 0.8% padding
  
  // Outer perimeter samples
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    samples.push({ x: rect.x - padding, y: rect.y + t * rect.height }); // Left
    samples.push({ x: rect.x + rect.width + padding, y: rect.y + t * rect.height }); // Right
    samples.push({ x: rect.x + t * rect.width, y: rect.y - padding }); // Top
    samples.push({ x: rect.x + t * rect.width, y: rect.y + rect.height + padding }); // Bottom
  }
  
  // Inner corner samples (slightly inside to catch text background)
  const inner = 0.002;
  samples.push({ x: rect.x + inner, y: rect.y + inner });
  samples.push({ x: rect.x + rect.width - inner, y: rect.y + inner });
  samples.push({ x: rect.x + inner, y: rect.y + rect.height - inner });
  samples.push({ x: rect.x + rect.width - inner, y: rect.y + rect.height - inner });

  const colors = [];
  samples.forEach(s => {
    const canvasX = Math.round(clamp(s.x, 0, 1) * elements.canvas.width);
    const canvasY = Math.round(clamp(s.y, 0, 1) * elements.canvas.height);
    try {
      const pixel = context.getImageData(canvasX, canvasY, 1, 1).data;
      const [r, g, b, a] = pixel;
      if (a > 128) {
        colors.push({ r, g, b, hex: rgbToHex(r, g, b), lum: (r + g + b) / 3 });
      }
    } catch (e) {}
  });

  if (colors.length === 0) return '#ffffff';

  // Use a frequency map with a small color distance tolerance
  const counts = {};
  colors.forEach(c => {
    // Simplify hex to reduce noise (group similar colors)
    const simplified = c.hex; 
    counts[simplified] = (counts[simplified] || 0) + 1;
  });

  // Pick the most frequent color among the lighter half of samples
  const sortedByFreq = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const mostFrequentHex = sortedByFreq[0][0];
  
  // If the most frequent is too dark, pick the brightest
  const mostFreqColor = colors.find(c => c.hex === mostFrequentHex);
  if (mostFreqColor && mostFreqColor.lum > 100) return mostFrequentHex;

  const brightest = colors.sort((a, b) => b.lum - a.lum)[0];
  return brightest ? brightest.hex : '#ffffff';
};

const wrapTextForPdf = (text, font, fontSize, maxWidth) => {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  if (!normalized.trim()) return [];

  const lines = [];
  const paragraphs = normalized.split('\n');

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      return;
    }

    let currentLine = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const nextCandidate = `${currentLine} ${words[index]}`;
      if (font.widthOfTextAtSize(nextCandidate, fontSize) <= maxWidth) {
        currentLine = nextCandidate;
      } else {
        lines.push(currentLine);
        currentLine = words[index];
      }
    }
    lines.push(currentLine);
  });

  return lines;
};

const getDisplaySizeForPage = (pageSize) => {
  const fallback = { width: 850, height: 1100 };
  if (!pageSize?.width || !pageSize?.height) return fallback;

  const stageBounds = elements.pageStageCard?.getBoundingClientRect();
  const availableW = Math.max(620, (stageBounds?.width || window.innerWidth - 520) - 18);
  const deduction = state.focusMode ? 42 : 92;
  const availableH = Math.max(420, window.innerHeight - deduction);

  const scaleW = availableW / pageSize.width;
  const scaleH = availableH / pageSize.height;
  
  // Use 'contain' logic: fit to the smaller dimension
  const scale = Math.min(scaleW, scaleH, 2.5); // Allow more scaling up for large screens

  return {
    width: Math.round(pageSize.width * scale),
    height: Math.round(pageSize.height * scale),
  };
};

const applyStageSize = (pageSize) => {
  const display = getDisplaySizeForPage(pageSize);
  elements.pageStage.style.width = `${display.width * state.zoomLevel}px`;
  elements.pageStage.style.height = `${display.height * state.zoomLevel}px`;
};

const setMode = (mode) => {
  state.mode = mode;
  const label = mode === 'place-image'
      ? 'Mode: Place image'
      : mode === 'place-whiteout'
        ? 'Mode: Place whiteout'
    : mode === 'place-signature'
      ? 'Mode: Place signature'
    : mode === 'pan'
      ? 'Mode: Pan'
      : 'Mode: View';
  elements.modePill.textContent = label;

  if (mode === 'pan') {
    elements.pageStage.style.cursor = 'grab';
  } else {
    elements.pageStage.style.cursor = '';
  }
};

const getSelectedSourcePageIndex = () => state.pageOrder[state.selectedPageIndex];

const tightenSelectionRect = (rect) => {
  if (!rect) return rect;

  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  const insetX = Math.min(width * 0.03, 0.003);
  const insetY = Math.min(height * 0.12, 0.004);
  const nextWidth = Math.max(0.008, width - insetX * 2);
  const nextHeight = Math.max(0.008, height - insetY * 2);

  return {
    x: (Number(rect.x) || 0) + insetX,
    y: (Number(rect.y) || 0) + insetY,
    width: nextWidth,
    height: nextHeight,
  };
};

const getCurrentPageOverlays = () => {
  const sourceIndex = getSelectedSourcePageIndex();
  if (typeof sourceIndex !== 'number') return [];
  if (!state.overlays[sourceIndex]) {
    state.overlays[sourceIndex] = [];
  }
  return state.overlays[sourceIndex];
};

const updateStatus = (title, copy) => {
  elements.statusTitle.textContent = title;
  elements.statusCopy.textContent = copy;
};

const showNativePreview = (bytes, title) => {
  if (editorPdfObjectUrl) {
    URL.revokeObjectURL(editorPdfObjectUrl);
    editorPdfObjectUrl = null;
  }

  const blob = new Blob([bytes], { type: 'application/pdf' });
  editorPdfObjectUrl = URL.createObjectURL(blob);
  // navpanes=0 hides the browser's built-in left thumbnail/sidebar panel
  elements.nativePreview.src = `${editorPdfObjectUrl}#page=${state.selectedPageIndex + 1}&toolbar=1&navpanes=0&scrollbar=0`;
  elements.nativePreview.hidden = false;
  elements.canvas.hidden = true;
  elements.textHitLayer.hidden = true;
  elements.overlayLayer.hidden = false;
  updateStatus(
    title || 'PDF loaded in native preview',
    'The document is visible using the browser preview fallback. You can keep working even if canvas rendering is limited in this browser.'
  );
};

const showCanvasPreview = () => {
  elements.nativePreview.hidden = true;
  elements.canvas.hidden = false;
  elements.textHitLayer.hidden = true;
  elements.overlayLayer.hidden = false;
};

const updateButtons = () => {
  const hasPdf = !!state.sourceBytes && state.pageOrder.length > 0;
  elements.downloadButton.disabled = !hasPdf || !hasPdfLib();
  elements.prevPageButton.disabled = !hasPdf || state.selectedPageIndex === 0;
  elements.nextPageButton.disabled = !hasPdf || state.selectedPageIndex === state.pageOrder.length - 1;
  elements.movePageUpButton.disabled = !hasPdf || state.selectedPageIndex === 0;
  elements.movePageDownButton.disabled =
    !hasPdf || state.selectedPageIndex === state.pageOrder.length - 1;
  elements.deletePageButton.disabled = !hasPdf || state.pageOrder.length === 0;
  elements.extractPageButton.disabled = !hasPdf || state.pageOrder.length === 0 || !hasPdfLib();
  elements.extractTextButton.disabled = !hasPdf || state.pageOrder.length === 0 || !state.pdfJsDoc;
  elements.placeImageButton.disabled = !hasPdf || !state.imageDataUrl;
  elements.placeSignatureButton.disabled = !hasPdf || !state.signatureDataUrl;
  elements.zoomOutButton.disabled = !hasPdf;
  elements.zoomFitButton.disabled = !hasPdf;
  elements.zoomInButton.disabled = !hasPdf;
  elements.toolPanButton.disabled = !hasPdf;
  elements.mergePdfInput.disabled = !hasPdf || !hasPdfLib();
  elements.splitPdfBtn.disabled = !hasPdf || !hasPdfLib() || typeof JSZip === 'undefined';
  elements.toggleEditModeButton.disabled = !hasPdf;
};

elements.toggleEditModeButton.addEventListener('click', () => {
  state.focusMode = !state.focusMode;
  
  if (state.focusMode) {
    elements.workspace.classList.add('focus-mode');
    elements.toggleEditModeButton.classList.add('active');
    elements.toggleEditModeButton.innerHTML = '🔳';
  } else {
    elements.workspace.classList.remove('focus-mode');
    elements.toggleEditModeButton.classList.remove('active');
    elements.toggleEditModeButton.innerHTML = '🔲';
  }
  
  // Re-render to adapt to new available height
  void renderWorkspace();
});

const base64ToUint8Array = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const dataUrlToBytes = (dataUrl) => {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const triggerBrowserDownload = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'download';
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
};

const uint8ArrayToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const registerPdfSession = async (bytes, fileName) => {
  try {
    const response = await fetch('/api/pdf-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: fileName || 'document.pdf',
        bytesBase64: uint8ArrayToBase64(bytes),
      }),
    });
    if (!response.ok) {
      throw new Error('Could not create local PDF session.');
    }
    const data = await response.json();
    state.pdfSessionId = data?.sessionId || null;
  } catch (error) {
    console.warn('[PyMuPDF] Session registration failed:', error);
    state.pdfSessionId = null;
  }
};

const getPyMuPdfSelectionRecommendation = async (rect) => {
  if (!state.pdfSessionId) return null;
  try {
    const response = await fetch('/api/pdf-selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.pdfSessionId,
        pageIndex: getSelectedSourcePageIndex(),
        rect,
      }),
    });
    if (!response.ok) {
      throw new Error('Selection analysis failed.');
    }
    const data = await response.json();
    const fontPreset = detectFontPreset(data?.fontName);
      return {
        fontPreset,
        fontSize: clamp(Number(data?.fontSize || 14), 4, 120),
        label: FONT_PRESETS[fontPreset]?.label || 'Sans',
        text: String(data?.text || '').trim(),
        color: data?.color || getCanvasColorRecommendation({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }),
        boundingBox: data?.boundingBox || null,
      };
  } catch (error) {
    console.warn('[PyMuPDF] Selection lookup failed:', error);
    return null;
  }
};


const renderOverlayLayer = () => {
  elements.overlayLayer.innerHTML = '';
  const stageRect = elements.pageStage.getBoundingClientRect();

  const overlays = getCurrentPageOverlays();
  overlays.forEach((overlay) => {
    const node = document.createElement(
      overlay.type === 'signature' || overlay.type === 'image' ? 'img' : 'div'
    );
    node.className = `overlay-item overlay-${overlay.type}${overlay.id === state.activeOverlayId ? ' is-active' : ''}${overlay.isMagicPen ? ' is-magic-pen-node' : ''}${overlay.isConfirmed ? ' is-confirmed' : ''}`;
    node.dataset.id = overlay.id;
    node.style.left = `${overlay.x * 100}%`;
    node.style.top = `${overlay.y * 100}%`;
    node.style.width =
      overlay.type === 'text'
        ? (overlay.lockWidth ? `${overlay.width * 100}%` : 'fit-content')
        : `${overlay.width * 100}%`;
    node.style.height =
      overlay.type === 'text'
        ? 'auto'
        : `${overlay.height * 100}%`;

    if (overlay.type === 'text') {
      node.classList.add('overlay-text-box');
      if (overlay.isMagicPen) {
        // Match the background color precisely and ensure it's visible (not transparent)
        const bgColor = overlay.backgroundColor || '#ffffff';
        node.style.backgroundColor = bgColor;

        // Ensure whiteout effect even if empty
        if (!overlay.text) {
          node.classList.add('is-magic-pen-empty');
        }
      }
      node.style.fontSize = `${overlay.fontSize * (state.currentScale || 1.0)}px`;
      node.style.color = overlay.color;
      node.style.fontFamily = FONT_PRESETS[overlay.fontPreset || 'sans']?.css || FONT_PRESETS.sans.css;
      node.classList.toggle('is-empty', !overlay.text);


      const content = document.createElement('div');
      content.className = 'overlay-text-content';
      content.textContent = overlay.text;
      content.contentEditable = overlay.isEditing ? 'true' : 'false';
      content.spellcheck = false;

      content.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        overlay.isEditing = true;
        if (overlay.isMagicPen) {
          overlay.isConfirmed = false;
        }
        renderOverlayLayer();
      });

      content.addEventListener('click', (event) => {
        if (!overlay.isEditing) return;
        event.stopPropagation();
      });

      content.addEventListener('input', () => {
        overlay.text = content.innerText || '';
        node.classList.toggle('is-empty', !overlay.text);
      });

      content.addEventListener('blur', (event) => {
        // If we clicked a control button, don't trigger blur logic yet
        if (event.relatedTarget?.closest('.overlay-control-bar')) return;
        
        overlay.text = (content.innerText || '').trimEnd();
        overlay.isEditing = false;
        renderOverlayLayer();
      });

      content.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          if (!event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            overlay.text = (content.innerText || '').trimEnd();
            overlay.isEditing = false;
            if (overlay.isMagicPen) {
              overlay.isConfirmed = true;
            }
            renderOverlayLayer();
          }
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          overlay.isEditing = false;
          renderOverlayLayer();
        }
      });


      node.appendChild(content);

      // Add Tick and Close buttons
      // Show controls if editing OR if it's a Magic Pen node
      if (overlay.isEditing || overlay.isMagicPen) {
        const controls = document.createElement('div');
        controls.className = 'overlay-control-bar';

        if (!overlay.isConfirmed) {
          const tickBtn = document.createElement('button');
          tickBtn.type = 'button';
          tickBtn.className = 'overlay-control-btn tick';
          tickBtn.innerHTML = '✓';
          tickBtn.title = 'Confirm & Merge';
          tickBtn.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            overlay.text = (content.innerText || '').trimEnd();
            overlay.isEditing = false;
            overlay.isConfirmed = true;
            renderOverlayLayer();
          });
          controls.appendChild(tickBtn);
        } else {
          // If confirmed, show Edit and Move handles
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'overlay-control-btn edit';
          editBtn.innerHTML = '✎';
          editBtn.title = 'Edit Text';
          editBtn.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            overlay.isConfirmed = false;
            overlay.isEditing = true;
            renderOverlayLayer();
          });
          controls.appendChild(editBtn);

          const moveBtn = document.createElement('button');
          moveBtn.type = 'button';
          moveBtn.className = 'overlay-control-btn move';
          moveBtn.innerHTML = '✛';
          moveBtn.title = 'Move';
          // Move logic is handled by letting pointerdown bubble to parent node
          controls.appendChild(moveBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'overlay-control-btn close';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Remove';
        closeBtn.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (overlay.linkedWhiteoutId) {
            removeOverlayById(overlay.linkedWhiteoutId);
          }
          removeOverlayById(overlay.id);
          renderOverlayLayer();
        });

        controls.appendChild(closeBtn);
        node.appendChild(controls);
      }
    } else if (overlay.type === 'whiteout') {
      node.style.background = '#ffffff';
      node.style.border = '1px solid rgba(31, 35, 64, 0.18)';
    } else {
      node.src = overlay.dataUrl;
      node.alt = overlay.type === 'image' ? 'Placed image' : 'Signature';
      node.draggable = false;
    }

    node.addEventListener('pointerdown', (event) => {
      if (overlay.type === 'text' && overlay.isEditing && event.target.closest('.overlay-text-content')) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      
      // Select the overlay and sync tools
      if (overlay.type === 'text') {
        state.activeOverlayId = overlay.id;
        syncToolsWithOverlay(overlay);
        renderOverlayLayer();
      }
      
      const rect = elements.pageStage.getBoundingClientRect();
      state.drag = {
        id: overlay.id,
        kind: 'move',
        type: overlay.type,
        offsetX: event.clientX - rect.left - overlay.x * rect.width,
        offsetY: event.clientY - rect.top - overlay.y * rect.height,
      };
      node.setPointerCapture(event.pointerId);
    });

    if ((overlay.type === 'text' || overlay.type === 'whiteout') && !overlay.isConfirmed) {
      const createHandle = (dir) => {
        const h = document.createElement('div');
        h.className = `overlay-resize-handle ${dir}`;
        h.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          state.drag = {
            id: overlay.id,
            kind: 'resize',
            direction: dir,
            type: overlay.type,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startWidth: overlay.width || 0.18,
            startHeight: overlay.height || 0.08,
            startFontSize: overlay.fontSize || 18,
          };
          h.setPointerCapture(event.pointerId);
        });
        return h;
      };

      node.appendChild(createHandle('x'));      // Horizontal
      node.appendChild(createHandle('y'));      // Vertical
      node.appendChild(createHandle('corner')); // Both
    }

    elements.overlayLayer.appendChild(node);

    if (overlay.type === 'text' && stageRect.height > 0 && stageRect.width > 0) {
      const measuredHeight = node.offsetHeight / stageRect.height;
      const measuredWidth = node.offsetWidth / stageRect.width;
      if (!overlay.lockWidth) {
        overlay.width = measuredWidth;
      }
      overlay.height = measuredHeight;
    }

    if (overlay.type === 'text' && state.pendingTextFocusId === overlay.id) {
      window.requestAnimationFrame(() => {
        const content = node.querySelector('.overlay-text-content');
        content?.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(content);
        selection.removeAllRanges();
        if (state.pendingTextSelectAllId === overlay.id) {
          selection.addRange(range);
          state.pendingTextSelectAllId = null;
        } else {
          range.collapse(false);
          selection.addRange(range);
        }
        state.pendingTextFocusId = null;
      });
    }
  });

  if (state.selectionDraft) {
    const selectionNode = document.createElement('div');
    selectionNode.className = 'overlay-selection-draft';
    selectionNode.style.left = `${state.selectionDraft.x * 100}%`;
    selectionNode.style.top = `${state.selectionDraft.y * 100}%`;
    selectionNode.style.width = `${state.selectionDraft.width * 100}%`;
    selectionNode.style.height = `${state.selectionDraft.height * 100}%`;
    elements.overlayLayer.appendChild(selectionNode);
  }

};

const commitActiveSelection = () => {
  if (!state.committedSelection) return;
  const sel = state.committedSelection;
  state.committedSelection = null;

  // Use the precise bounding box from the backend if available, otherwise use the manual selection rect
  const selectionRect = tightenSelectionRect(sel.recommendation?.boundingBox || sel);
  const x = selectionRect.x;
  const y = selectionRect.y;
  const width = selectionRect.width;
  const height = selectionRect.height;

  // Add the text overlay with isMagicPen=true. 
  // The UI and Export loop will handle drawing the white background.
  addTextOverlay(x, y, {
    text: sel.recommendation?.text || '',
    allowBlank: true,
    autoEdit: true,
    selectAllOnFocus: !!sel.recommendation?.text,
    width: width,
    height: height,
    fontSize: sel.recommendation?.fontSize || Number(elements.textSize.value || 18),
    color: sel.recommendation?.color || elements.textColor.value || '#1f2340',
    fontPreset: sel.recommendation?.fontPreset || state.textFontPreset,
    lockWidth: true,
    isMagicPen: true,
    linkedWhiteoutId: null, // No separate object needed anymore
  });
  
  // Clear selection highlight
  document.querySelectorAll('.pdf-text-hit').forEach(btn => btn.classList.remove('is-selected'));
  
  // Re-render to show the new overlays and focus the input
  renderOverlayLayer();
  updateStatus(`Editing ${state.fileName}`, 'Word replaced. You can now edit the text.');
};

const cancelActiveSelection = () => {
  state.committedSelection = null;
  renderOverlayLayer();
};

const renderTextHitLayer = async (page, displaySize, sourcePageIndex) => {
  if (!elements.textHitLayer) return;
  elements.textHitLayer.innerHTML = '';
  return;
};


const renderWorkspace = async () => {
  if (!state.sourceBytes || state.pageOrder.length === 0) {
    setEmptyState(true);
    elements.textHitLayer.innerHTML = '';
    elements.overlayLayer.innerHTML = '';
    const context = elements.canvas.getContext('2d');
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    elements.nativePreview.hidden = true;
    return;
  }

  setEmptyState(false);

  const sourcePageIndex = getSelectedSourcePageIndex();
  const selectedPageSize = state.pageSizes[sourcePageIndex];

  if (!state.pdfJsDoc) {
    applyStageSize(selectedPageSize);
    showNativePreview(state.sourceBytes, `Editing ${state.fileName}`);
    elements.textHitLayer.innerHTML = '';
    renderOverlayLayer();
    updateButtons();
    updateStatus(
      `Editing ${state.fileName}`,
      `Page ${state.selectedPageIndex + 1} of ${state.pageOrder.length}. Browser preview mode is active, and your edits still stay attached to the selected page.`
    );
    return;
  }

  const page = await state.pdfJsDoc.getPage(sourcePageIndex + 1);
  const viewport1 = page.getViewport({ scale: 1 });

  const availableWidth = Math.max(
    320,
    (elements.pageStageWrap?.clientWidth || elements.pageStageCard?.clientWidth || (window.innerWidth - 540)) - 20
  );
  const availableHeight = Math.max(
    320,
    (elements.pageStageCard?.clientHeight || (window.innerHeight - 180)) - 12
  );
  const widthScale = availableWidth / viewport1.width;
  const heightScale = availableHeight / viewport1.height;
  const isPortraitPage = viewport1.height >= viewport1.width;
  const editorFitScale = isPortraitPage
    ? Math.min(widthScale * 0.86, heightScale * 1.85)
    : Math.min(widthScale * 0.96, heightScale * 1.18);
  const scale = Math.max(0.2, editorFitScale * state.zoomLevel);
  const displaySize = {
    width: viewport1.width * scale,
    height: viewport1.height * scale,
  };

  const renderScale = scale * 1.5; // Scale up for crispness
  const viewport = page.getViewport({ scale: renderScale });
  
  elements.canvas.width = viewport.width;
  elements.canvas.height = viewport.height;
  elements.canvas.style.width = `${displaySize.width}px`;
  elements.canvas.style.height = `${displaySize.height}px`;
  elements.pageStage.style.width = `${displaySize.width}px`;
  elements.pageStage.style.height = `${displaySize.height}px`;
  state.currentScale = scale;

  try {
    await page.render({
      canvasContext: elements.canvas.getContext('2d'),
      viewport,
    }).promise;
    showCanvasPreview();
  } catch (error) {
    showNativePreview(state.sourceBytes, 'PDF loaded with browser preview');
    elements.textHitLayer.innerHTML = '';
    updateButtons();
    return;
  }

  try {
    await renderTextHitLayer(page, displaySize, sourcePageIndex);
  } catch (error) {
    console.warn('[HitLayer] Non-fatal render failure:', error);
    elements.textHitLayer.innerHTML = '';
  }
  renderOverlayLayer();
  updateButtons();
  updateStatus(
    `Editing ${state.fileName}`,
    `Page ${state.selectedPageIndex + 1} of ${state.pageOrder.length}. Drag across the text you want to replace, then press Enter to open the new text box.`
  );

  window.requestAnimationFrame(() => {
    if (elements.pageStageWrap) {
      const horizontalOffset = Math.max(
        0,
        (elements.pageStageWrap.scrollWidth - elements.pageStageWrap.clientWidth) / 2
      );
      elements.pageStageWrap.scrollLeft = horizontalOffset;
    }

    if (elements.pageStageCard) {
      elements.pageStageCard.scrollTop = 0;
    }
  });
};

const loadPdfBytes = async (bytes, fileName, appendMetadata) => {
  state.sourceBytes = bytes;
  state.pdfSessionId = null;
  state.pageSizes = [];
  state.pageTextCache = {}; // Reset cache for new doc
  updateStatus('Loading PDF...', 'Preparing your document for the browser editor.');
  await registerPdfSession(bytes, fileName);

  if (hasPdfLib()) {
    try {
      const inspectDoc = await PDFDocument.load(bytes);
      state.pageSizes = inspectDoc.getPages().map((page) => ({
        width: page.getWidth(),
        height: page.getHeight(),
      }));
    } catch (error) {
      state.pageSizes = [];
    }
  }

  try {
    if (!hasPdfJs()) {
      throw new Error('PDF canvas renderer is unavailable.');
    }
    // Use disableWorker:true — most reliable for static/local serving (no CORS, no CDN fetch)
    const dataCopy = new Uint8Array(bytes); // copy to prevent ArrayBuffer detachment
    state.pdfJsDoc = await pdfJsApi.getDocument({
      data: dataCopy,
      disableWorker: true,
    }).promise;
  } catch (error) {
    console.warn('[PDF.js] Canvas renderer failed:', error);
    state.pdfJsDoc = null;
    state.overlays = {};
    state.selectedPageIndex = 0;
    const fallbackPageCount = state.pageSizes.length || 1;
    state.pageOrder = Array.from({ length: fallbackPageCount }, (_, index) => index);
    const docColor = getNextDocColor();
    state.pageMetadata = appendMetadata || Array.from({ length: fallbackPageCount }, () => ({ docId: docColorIndex, color: docColor, docName: fileName || 'Document' }));
    state.fileName = (fileName || 'edited-document').replace(/\.pdf$/i, '') + '-edited.pdf';
    elements.fileName.textContent = fileName || 'Uploaded PDF';
    elements.fileState.hidden = false;
    setMode('view');
    updateButtons();
    await renderWorkspace();
    // Try once more with a fresh copy just for thumbnail rendering
    try {
      state.thumbnailPdfJsDoc = await pdfJsApi.getDocument({
        data: new Uint8Array(bytes),
        disableWorker: true,
      }).promise;
    } catch (e) {
      console.warn('[PDF.js] Thumbnail fallback also failed:', e);
      state.thumbnailPdfJsDoc = null;
    }
    renderThumbnails();
    return;
  }
  state.pageOrder = Array.from({ length: state.pdfJsDoc.numPages }, (_, index) => index);
  if (!state.pageSizes.length) {
    state.pageSizes = state.pageOrder.map(() => ({ width: 612, height: 792 }));
  }
  const docColor = getNextDocColor();
  state.pageMetadata = appendMetadata || Array.from({ length: state.pageOrder.length }, () => ({ docId: docColorIndex, color: docColor, docName: fileName || 'Document' }));
  state.thumbnailPdfJsDoc = state.pdfJsDoc; // same doc, no extra load
  state.overlays = {};
  state.selectedPageIndex = 0;
  state.fileName = (fileName || 'edited-document').replace(/\.pdf$/i, '') + '-edited.pdf';
  elements.fileName.textContent = fileName || 'Uploaded PDF';
  elements.fileState.hidden = false;
  setMode('view');
  updateButtons();
  await renderWorkspace();
  renderThumbnails();
  
  // Start background scan
  void scanPdfBackground();
};

const scanPdfBackground = async () => {
  if (!state.pdfJsDoc) return;
  
  const numPages = state.pdfJsDoc.numPages;
  updateStatus('Scanning Document...', `Processing ${numPages} pages for instant editing...`);
  
  for (let i = 0; i < numPages; i++) {
    // If user uploaded a new doc while scanning, stop
    if (!state.pdfJsDoc) break;
    
    try {
      const page = await state.pdfJsDoc.getPage(i + 1);
      const textContent = await page.getTextContent();
      state.pageTextCache[i] = textContent;
      
      // Update status every few pages to show progress
      if (i % 5 === 0 || i === numPages - 1) {
        updateStatus('Scanning Document...', `Processed ${i + 1} of ${numPages} pages...`);
      }
      
      // If this is the current page, re-render the hit layer to make it responsive
      if (i === getSelectedSourcePageIndex()) {
        const displaySize = getDisplaySizeForPage(state.pageSizes[i] || { width: 612, height: 792 });
        void renderTextHitLayer(page, displaySize, i);
      }
    } catch (err) {
      console.warn(`Failed to scan page ${i + 1}:`, err);
    }
  }
  
  updateStatus(`Editing ${state.fileName}`, 'Document scanned. Drag across the text you want to replace to start editing.');
};

const swapPages = (direction) => {
  const targetIndex = state.selectedPageIndex + direction;
  if (targetIndex < 0 || targetIndex >= state.pageOrder.length) return;

  const nextOrder = [...state.pageOrder];
  const currentSourceIndex = nextOrder[state.selectedPageIndex];
  nextOrder[state.selectedPageIndex] = nextOrder[targetIndex];
  nextOrder[targetIndex] = currentSourceIndex;
  state.pageOrder = nextOrder;

  const nextMeta = [...state.pageMetadata];
  const currentMeta = nextMeta[state.selectedPageIndex];
  nextMeta[state.selectedPageIndex] = nextMeta[targetIndex];
  nextMeta[targetIndex] = currentMeta;
  state.pageMetadata = nextMeta;

  state.selectedPageIndex = targetIndex;
  void renderWorkspace();
  renderThumbnails();
};

const deleteCurrentPage = () => {
  if (!state.sourceBytes || state.pageOrder.length === 0) return;
  state.pageOrder.splice(state.selectedPageIndex, 1);
  state.pageMetadata.splice(state.selectedPageIndex, 1);

  if (state.pageOrder.length === 0) {
    state.pdfJsDoc = null;
    state.sourceBytes = null;
    state.pageSizes = [];
    state.pageMetadata = [];
    state.selectedPageIndex = 0;
    state.overlays = {};
    elements.fileState.hidden = true;
    elements.fileName.textContent = 'No file selected';
    updateStatus('No PDF loaded yet', 'Upload a PDF to begin editing.');
    setMode('view');
    updateButtons();
    void renderWorkspace();
    renderThumbnails();
    return;
  }

  state.selectedPageIndex = Math.min(state.selectedPageIndex, state.pageOrder.length - 1);
  void renderWorkspace();
  renderThumbnails();
};

const createOverlayId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const removeOverlayById = (overlayId) => {
  if (!overlayId) return null;
  const overlays = getCurrentPageOverlays();
  const index = overlays.findIndex((item) => item.id === overlayId);
  if (index === -1) return null;
  const [removed] = overlays.splice(index, 1);
  return removed;
};

/* ── Thumbnail Rendering & Drag-and-Drop ─────────────────── */
let dragSrcIndex = null;

const renderThumbnails = () => {
  const strip = elements.thumbnailsStrip;
  strip.innerHTML = '';
  // Use main doc or fallback thumbnail-only doc
  const docToUse = state.pdfJsDoc || state.thumbnailPdfJsDoc;
  if (!docToUse || state.pageOrder.length === 0) return;

  state.pageOrder.forEach((sourcePageIndex, displayIndex) => {
    const meta = state.pageMetadata[displayIndex] || { color: '#4647d3', docName: 'Document' };
    const docColor = meta.color || '#4647d3';

    const thumb = document.createElement('div');
    thumb.className = 'pdf-thumbnail' + (displayIndex === state.selectedPageIndex ? ' is-selected' : '');
    thumb.draggable = true;
    thumb.dataset.index = displayIndex;
    // Thick colored border for identification
    thumb.style.borderLeft = `6px solid ${docColor}`;
    thumb.style.borderTop = `1px solid ${docColor}44`;
    thumb.style.borderRight = `1px solid ${docColor}44`;
    thumb.style.borderBottom = `1px solid ${docColor}44`;
    thumb.style.setProperty('--thumb-color', docColor);

    // Badge: first letter of doc name, top-right corner
    const badge = document.createElement('div');
    badge.className = 'doc-marker-badge';
    badge.style.background = docColor;
    badge.title = meta.docName || 'Document';
    badge.textContent = (meta.docName || 'D').charAt(0).toUpperCase();

    // Canvas wrap
    const wrap = document.createElement('div');
    wrap.className = 'thumbnail-canvas-wrap';

    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);

    // Page number label
    const label = document.createElement('div');
    label.className = 'thumbnail-label';
    label.textContent = `Page ${displayIndex + 1}`;

    thumb.appendChild(badge);
    thumb.appendChild(wrap);
    thumb.appendChild(label);

    // Active Indicator Dot
    if (displayIndex === state.selectedPageIndex) {
      const activeIndicator = document.createElement('div');
      activeIndicator.className = 'active-page-indicator';
      activeIndicator.textContent = 'Active';
      thumb.appendChild(activeIndicator);
    }

    strip.appendChild(thumb);

    // Auto-scroll selected into view
    if (displayIndex === state.selectedPageIndex) {
      setTimeout(() => {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 50);
    }

    // Async render the mini canvas — target width based on viewport + page count
    docToUse.getPage(sourcePageIndex + 1).then((page) => {
      const nativeW = page.getViewport({ scale: 1 }).width;
      
      // Auto-size: aggressively shrink thumbnails
      const pageCount = state.pageOrder.length;
      let baseW = Math.max(38, Math.min(70, window.innerWidth / 18));
      if (pageCount > 10) baseW = Math.max(34, baseW * 0.75);
      if (pageCount > 25) baseW = Math.max(30, baseW * 0.65);
      
      const thumbScale = baseW / nativeW;
      const viewport = page.getViewport({ scale: thumbScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise.catch(() => {});
    }).catch(() => {});

    // Click to select
    thumb.addEventListener('click', () => {
      state.selectedPageIndex = displayIndex;
      state.activeOverlayId = null; // Clear selection when changing pages
      void renderWorkspace();
      renderThumbnails();
      // Ensure selected thumbnail stays visible in the strip
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });

    // Drag-and-drop events
    thumb.addEventListener('dragstart', (e) => {
      dragSrcIndex = displayIndex;
      thumb.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    thumb.addEventListener('dragend', () => {
      thumb.classList.remove('is-dragging');
      document.querySelectorAll('.pdf-thumbnail').forEach(t => t.classList.remove('drag-over'));
    });
    thumb.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.pdf-thumbnail').forEach(t => t.classList.remove('drag-over'));
      if (dragSrcIndex !== displayIndex) thumb.classList.add('drag-over');
    });
    thumb.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === displayIndex) return;

      const newOrder = [...state.pageOrder];
      const newMeta = [...state.pageMetadata];
      const [movedPage] = newOrder.splice(dragSrcIndex, 1);
      const [movedMeta] = newMeta.splice(dragSrcIndex, 1);
      newOrder.splice(displayIndex, 0, movedPage);
      newMeta.splice(displayIndex, 0, movedMeta);
      state.pageOrder = newOrder;
      state.pageMetadata = newMeta;

      // Keep selected index pointing at the dragged page
      state.selectedPageIndex = displayIndex;
      dragSrcIndex = null;
      void renderWorkspace();
      renderThumbnails();
    });
  });
};

const addTextOverlay = (x, y, options = {}) => {
  const text = typeof options.text === 'string' ? options.text : '';
  if (!text && !options.allowBlank) {
    window.alert('Enter some text first.');
    return;
  }

  const overlayId = createOverlayId();
  const overlays = getCurrentPageOverlays();
  
  // Set as active
  state.activeOverlayId = overlayId;
  
  overlays.push({
    id: overlayId,
    type: 'text',
    text,
    x,
    y,
    width: options.width || 0.06,
    height: options.height || 0.1,
    fontSize: options.fontSize || Number(elements.textSize.value || 18),
    color: options.color || elements.textColor.value || '#1f2340',
    fontPreset: options.fontPreset || state.textFontPreset || 'sans',
    isEditing: !!options.autoEdit,
    lockWidth: !!options.lockWidth,
    isMagicPen: !!options.isMagicPen,
    isConfirmed: !!options.isConfirmed,
    backgroundColor: options.backgroundColor || (options.isMagicPen ? getCanvasBackgroundRecommendation({
      x, y, 
      width: options.width || 0.06, 
      height: options.height || 0.1
    }) : 'transparent'),
    originalWidth: options.width || 0.06,
    originalHeight: options.height || 0.1,
    linkedWhiteoutId: options.linkedWhiteoutId || null,
  });
  
  if (options.autoEdit) {
    state.pendingTextFocusId = overlayId;
    if (options.selectAllOnFocus) {
      state.pendingTextSelectAllId = overlayId;
    }
  }
  
  // Sync tools with the new overlay
  const newOverlay = overlays[overlays.length - 1];
  syncToolsWithOverlay(newOverlay);
  
  setMode('view');
  renderOverlayLayer();
};

const addSignatureOverlay = (x, y) => {
  if (!state.signatureDataUrl) return;

  const overlays = getCurrentPageOverlays();
  overlays.push({
    id: createOverlayId(),
    type: 'signature',
    dataUrl: state.signatureDataUrl,
    x,
    y,
    width: 0.28,
    height: 0.11,
  });
  setMode('view');
  renderOverlayLayer();
};

const addImageOverlay = (x, y) => {
  if (!state.imageDataUrl) return;

  const overlays = getCurrentPageOverlays();
  overlays.push({
    id: createOverlayId(),
    type: 'image',
    dataUrl: state.imageDataUrl,
    x,
    y,
    width: 0.26,
    height: 0.18,
  });
  setMode('view');
  renderOverlayLayer();
};

const addWhiteoutOverlay = (x, y) => {
  const width = clamp(Number(elements.whiteoutWidth.value || 26) / 100, 0.05, 0.9);
  const height = clamp(Number(elements.whiteoutHeight.value || 10) / 100, 0.03, 0.6);

  const overlays = getCurrentPageOverlays();
  overlays.push({
    id: createOverlayId(),
    type: 'whiteout',
    x,
    y,
    width,
    height,
  });
  setMode('view');
  renderOverlayLayer();
};

const addWhiteoutOverlayWithSize = (x, y, width, height) => {
  const overlays = getCurrentPageOverlays();
  const whiteoutId = createOverlayId();
  // Add a bit more padding and shift slightly left/up to center the whiteout over the text
  const paddingX = 0.006;
  const paddingY = 0.004;
  overlays.push({
    id: whiteoutId,
    type: 'whiteout',
    x: x - paddingX / 2,
    y: y - paddingY / 2,
    width: width + paddingX,
    height: height + paddingY,
  });
  return whiteoutId;
};

const stagePointToRelative = (clientX, clientY) => {
  const rect = elements.pageStage.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return { x, y };
};

const getNearbyTextRecommendation = async (pointOrRect) => {
  if (!state.pdfJsDoc) return null;

  try {
    const sourcePageIndex = getSelectedSourcePageIndex();
    const pageSize = state.pageSizes[sourcePageIndex] || { width: 612, height: 792 };
    
    const textContent = state.pageTextCache[sourcePageIndex] || await (async () => {
       const page = await state.pdfJsDoc.getPage(sourcePageIndex + 1);
       const content = await page.getTextContent();
       state.pageTextCache[sourcePageIndex] = content;
       return content;
    })();

    const isRect = typeof pointOrRect.width === 'number';
    
    if (isRect) {
      const rect = pointOrRect;
      const pyMuPdfRecommendation = await getPyMuPdfSelectionRecommendation(rect);
      if (pyMuPdfRecommendation?.text) {
        return pyMuPdfRecommendation;
      }
      const pdfRect = {
        x: rect.x * pageSize.width,
        y: (1 - (rect.y + rect.height)) * pageSize.height,
        width: rect.width * pageSize.width,
        height: rect.height * pageSize.height
      };

      let itemsInRect = [];
      textContent.items.forEach((item) => {
        if (!item.transform || !String(item.str || '').trim()) return;
        const fontSize = Math.abs(item.transform?.[3] || item.height || 18);
        const itemX = item.transform[4];
        const itemY = item.transform[5];
        const itemWidth = Math.max(item.width || 0, fontSize * 0.45);
        const itemRect = {
          left: itemX,
          right: itemX + itemWidth,
          bottom: itemY - fontSize * 0.28,
          top: itemY + fontSize * 0.92,
        };
        const intersects =
          itemRect.left <= pdfRect.x + pdfRect.width &&
          itemRect.right >= pdfRect.x &&
          itemRect.bottom <= pdfRect.y + pdfRect.height &&
          itemRect.top >= pdfRect.y;
        if (intersects) {
          itemsInRect.push(item);
        }
      });

      if (itemsInRect.length > 0) {
        // Sort items by Y (top to bottom) then X (left to right)
        itemsInRect.sort((a, b) => {
          const ay = a.transform[5];
          const by = b.transform[5];
          if (Math.abs(ay - by) > 5) return by - ay;
          return a.transform[4] - b.transform[4];
        });

        const fullText = itemsInRect
          .map((item) => String(item.str || '').trim())
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const firstItem = itemsInRect[0];
        
        return {
          fontPreset: detectFontPreset(firstItem.fontName),
          fontSize: Math.round(clamp(Math.abs(firstItem.transform?.[3] || 18), 10, 72)),
          label: FONT_PRESETS[detectFontPreset(firstItem.fontName)]?.label || 'Sans',
          text: fullText,
          color: getCanvasColorRecommendation({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }),
        };
      }
      // Fallback to center point if no items directly in rect
      pointOrRect = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }

    const point = pointOrRect;
    const clickPdfX = point.x * pageSize.width;
    const clickPdfY = (1 - point.y) * pageSize.height;

    let closestItem = null;
    let closestDist = Infinity;

    textContent.items.forEach((item) => {
      if (!item.transform || !String(item.str || '').trim()) return;
      const [, , , , itemX, itemY] = item.transform;
      const dist = Math.hypot(itemX - clickPdfX, itemY - clickPdfY);
      if (dist < closestDist) {
        closestDist = dist;
        closestItem = item;
      }
    });

    if (!closestItem) return null;

    const fontPreset = detectFontPreset(closestItem.fontName);
    const fontSize = Math.round(clamp(Math.abs(closestItem.transform?.[3] || 18), 10, 72));

    return {
      fontPreset,
      fontSize,
      label: FONT_PRESETS[fontPreset]?.label || 'Sans',
      text: String(closestItem.str || '').trim(),
      color: getCanvasColorRecommendation(point),
    };
  } catch (error) {
    return null;
  }
};

const getWordAtPoint = async (point) => {
  if (!state.pdfJsDoc) return null;

  try {
    const sourcePageIndex = getSelectedSourcePageIndex();
    const pageSize = state.pageSizes[sourcePageIndex] || { width: 612, height: 792 };
    
    const textContent = state.pageTextCache[sourcePageIndex] || await (async () => {
       const page = await state.pdfJsDoc.getPage(sourcePageIndex + 1);
       const content = await page.getTextContent();
       state.pageTextCache[sourcePageIndex] = content;
       return content;
    })();

    const clickPdfX = point.x * pageSize.width;
    const clickPdfY = (1 - point.y) * pageSize.height;

    let containingItem = null;
    let nearestItem = null;
    let nearestDistance = Infinity;

    textContent.items.forEach((item) => {
      if (!item.transform || !String(item.str || '').trim()) return;

      const fontSize = Math.abs(item.transform?.[3] || item.height || 18);
      const itemX = item.transform[4];
      const itemY = item.transform[5];
      const itemWidth = Math.max(item.width || 0, fontSize * 0.45);
      const padX = Math.max(3, fontSize * 0.18);
      const padY = Math.max(3, fontSize * 0.24);
      const left = itemX - padX;
      const right = itemX + itemWidth + padX;
      const bottom = itemY - fontSize * 0.28 - padY;
      const top = itemY + fontSize * 0.92 + padY;

      if (clickPdfX >= left && clickPdfX <= right && clickPdfY >= bottom && clickPdfY <= top) {
        const area = (right - left) * (top - bottom);
        if (!containingItem || area < containingItem.area) {
          containingItem = { item, fontSize, itemX, itemY, itemWidth, area };
        }
        return;
      }

      const centerX = itemX + itemWidth / 2;
      const centerY = itemY + fontSize * 0.28;
      const distance = Math.hypot(centerX - clickPdfX, centerY - clickPdfY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestItem = { item, fontSize, itemX, itemY, itemWidth };
      }
    });

    const maxSnapDistance = Math.max(54, Math.min(pageSize.width, pageSize.height) * 0.12);
    const chosen = containingItem || (nearestDistance <= maxSnapDistance ? nearestItem : null);
    if (!chosen) return null;

    const fontPreset = detectFontPreset(chosen.item.fontName);
    const fontSize = Math.round(clamp(chosen.fontSize, 4, 120));
    const width = clamp((chosen.itemWidth + fontSize * 0.32) / pageSize.width, 0.03, 0.9);
    const height = clamp((fontSize * 1.3) / pageSize.height, 0.03, 0.25);
    const x = chosen.itemX / pageSize.width - 0.004;
    const y = (pageSize.height - (chosen.itemY + fontSize * 0.88)) / pageSize.height;

    return {
      text: String(chosen.item.str || '').trim(),
      fontPreset,
      fontSize,
      label: FONT_PRESETS[fontPreset]?.label || 'Sans',
      color: getCanvasColorRecommendation(point),
      x,
      y,
      width,
      height,
    };
  } catch (error) {
    return null;
  }
};

const replaceWordAtPoint = async (point) => {
  const word = await getWordAtPoint(point);
  if (!word) return false;

  updateTextRecommendation(word);
  
  // Use isMagicPen: true which automatically handles white background hiding the text
  addTextOverlay(word.x, word.y, {
    text: word.text,
    autoEdit: true,
    selectAllOnFocus: true,
    width: word.width,
    height: word.height,
    fontSize: word.fontSize,
    color: word.color,
    fontPreset: word.fontPreset,
    lockWidth: true,
    isMagicPen: true,
  });
  return true;
};

elements.pageStage.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  hideContextMenu();
});

elements.pageStageCard?.addEventListener('scroll', () => {
  hideContextMenu();
});

elements.pageStage.addEventListener('click', async (event) => {
  if (!state.sourceBytes || state.pageOrder.length === 0) return;
  hideContextMenu();
  if (event.target.closest('.overlay-item')) return;

  if (state.mode === 'view') {
    if (elements.nativePreview && !elements.nativePreview.hidden) {
      updateStatus(
        `Editing ${state.fileName}`,
        'This document is in browser preview fallback mode. Upload another PDF or use a smaller file for drag-to-replace editing.'
      );
    }
    return;
  }

  if (state.mode === 'pan') return;

  const point = stagePointToRelative(event.clientX, event.clientY);

  // ── Magic Brush: auto-detect font size near click ──────────
  if (state.mode === 'place-text' && state.pdfJsDoc) {
    const recommendation = await getNearbyTextRecommendation(point);
    updateTextRecommendation(recommendation);
    addTextOverlay(point.x, point.y);
  } else if (state.mode === 'place-image') {
    addImageOverlay(point.x, point.y);
  } else if (state.mode === 'place-whiteout') {
    addWhiteoutOverlay(point.x, point.y);
  } else if (state.mode === 'place-signature') {
    addSignatureOverlay(point.x, point.y);
  }
});

elements.pageStage.addEventListener('pointerdown', (event) => {
  if (state.mode === 'view' && state.sourceBytes && !event.target.closest('.overlay-item')) {
    event.preventDefault();
    hideContextMenu();
    const start = stagePointToRelative(event.clientX, event.clientY);
    state.selectionDraft = {
      startX: start.x,
      startY: start.y,
      x: start.x,
      y: start.y,
      width: 0.001,
      height: 0.001,
    };
    renderOverlayLayer();
    return;
  }

  if (state.mode === 'pan' && state.sourceBytes) {
    state.isDraggingPan = true;
    state.lastPanPoint = { x: event.clientX, y: event.clientY };
    elements.pageStage.style.cursor = 'grabbing';
    event.preventDefault();
  }
});

elements.pageStage.addEventListener('pointermove', (event) => {
  if (state.selectionDraft && state.mode === 'view') {
    const current = stagePointToRelative(event.clientX, event.clientY);
    const x = Math.min(state.selectionDraft.startX, current.x);
    const y = Math.min(state.selectionDraft.startY, current.y);
    const width = Math.abs(current.x - state.selectionDraft.startX);
    const height = Math.abs(current.y - state.selectionDraft.startY);
    state.selectionDraft = {
      ...state.selectionDraft,
      x,
      y,
      width: width,
      height: height,
    };
    renderOverlayLayer();
    return;
  }

  if (state.mode === 'pan' && state.isDraggingPan) {
    const dx = event.clientX - state.lastPanPoint.x;
    const dy = event.clientY - state.lastPanPoint.y;
    const wrap = document.querySelector('.page-stage-wrap');
    if (wrap) {
      wrap.scrollBy(-dx, -dy);
    }
    state.lastPanPoint = { x: event.clientX, y: event.clientY };
    return;
  }

  if (!state.drag) return;
  const overlays = getCurrentPageOverlays();
  const overlay = overlays.find((item) => item.id === state.drag.id);
  if (!overlay) return;

  const rect = elements.pageStage.getBoundingClientRect();
  if (state.drag.kind === 'resize') {
    const deltaX = (event.clientX - state.drag.startClientX) / rect.width;
    const deltaY = (event.clientY - state.drag.startClientY) / rect.height;
    const dir = state.drag.direction;

    if (overlay.type === 'text') {
      if (dir === 'x' || dir === 'corner') {
        overlay.width = clamp(state.drag.startWidth + deltaX, 0.08, 0.95);
      }
      if (dir === 'y' || dir === 'corner') {
        // For text, vertical pull updates font size
        overlay.fontSize = Math.round(clamp(state.drag.startFontSize + deltaY * 180, 4, 120));
      }
      
      // Sync linked whiteout
      if (overlay.linkedWhiteoutId) {
        const whiteout = overlays.find(o => o.id === overlay.linkedWhiteoutId);
        if (whiteout) {
          whiteout.width = overlay.width;
          whiteout.height = overlay.height;
        }
      }
    } else if (overlay.type === 'whiteout') {
      if (dir === 'x' || dir === 'corner') {
        overlay.width = clamp(state.drag.startWidth + deltaX, 0.01, 0.98);
      }
      if (dir === 'y' || dir === 'corner') {
        overlay.height = clamp(state.drag.startHeight + deltaY, 0.01, 0.95);
      }
    }
  } else {
    const nextX = (event.clientX - rect.left - state.drag.offsetX) / rect.width;
    const nextY = (event.clientY - rect.top - state.drag.offsetY) / rect.height;
    const rightAllowance = overlay.type === 'text' ? 0.995 : 1 - (overlay.width || 0.12);
    const bottomAllowance = overlay.type === 'text' ? 0.97 : 1 - (overlay.height || 0.05);
    overlay.x = clamp(nextX, 0, rightAllowance);
    overlay.y = clamp(nextY, 0, bottomAllowance);

    // Sync linked whiteout
    if (overlay.type === 'text' && overlay.linkedWhiteoutId) {
      const whiteout = overlays.find(o => o.id === overlay.linkedWhiteoutId);
      if (whiteout) {
        whiteout.x = overlay.x;
        whiteout.y = overlay.y;
      }
    }
  }
  renderOverlayLayer();
});

window.addEventListener('pointerup', async () => {
  if (state.selectionDraft && state.mode === 'view') {
    const draft = state.selectionDraft;
    state.selectionDraft = null;

    if (draft.width > 0.01 && draft.height > 0.01) {
      const recommendation = await getNearbyTextRecommendation({
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
      });
      updateTextRecommendation(recommendation);
      state.committedSelection = {
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
        recommendation: {
          fontSize: recommendation?.fontSize || Number(elements.textSize.value || 18),
          color: recommendation?.color || elements.textColor.value || '#1f2340',
          fontPreset: recommendation?.fontPreset || state.textFontPreset,
          text: recommendation?.text || '',
          boundingBox: recommendation?.boundingBox || null,
        }
      };
      commitActiveSelection();
      updateStatus(
        `Editing ${state.fileName}`,
        'Text box opened. Type your replacement text directly into the selected area.'
      );
    } else {
      renderOverlayLayer();
    }
  }

  state.drag = null;
  if (state.isDraggingPan) {
    state.isDraggingPan = false;
    if (state.mode === 'pan') {
      elements.pageStage.style.cursor = 'grab';
    }
  }
});

window.addEventListener('keydown', (event) => {
  // If we are currently editing a text box, let it handle its own Enter/Escape
  if (document.activeElement?.contentEditable === 'true') {
    return;
  }

  if (state.committedSelection) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitActiveSelection();
    } else if (event.key === 'Escape' || event.key.toLowerCase() === 'x') {
      event.preventDefault();
      cancelActiveSelection();
    }
  }
});

const handleUploadInputChange = async (event) => {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;

  await handlePdfFile(file);
  input.value = '';
  elements.uploadMirrors?.forEach((mirror) => {
    mirror.value = '';
  });
};

elements.uploadMirrors?.forEach((input) => {
  input.addEventListener('change', handleUploadInputChange);
});

const handlePdfFile = async (file) => {
  let bytes = null;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    await loadPdfBytes(bytes, file.name);
  } catch (error) {
    console.error('[Upload] PDF load failed, using fallback preview:', error);

    if (bytes) {
      state.sourceBytes = bytes;
      state.pdfJsDoc = null;
      state.thumbnailPdfJsDoc = null;
      state.pageOrder = [0];
      state.pageSizes = [{ width: 612, height: 792 }];
      state.pageMetadata = [{ docId: Date.now(), color: getNextDocColor(), docName: file.name || 'Document' }];
      state.pageTextCache = {};
      state.overlays = {};
      state.selectedPageIndex = 0;
      state.fileName = (file.name || 'edited-document').replace(/\.pdf$/i, '') + '-edited.pdf';
      elements.fileName.textContent = file.name || 'Uploaded PDF';
      elements.fileState.hidden = false;
      setMode('view');
      updateButtons();
      await renderWorkspace();
      updateStatus(
        `Editing ${state.fileName}`,
        'PDF opened in safe preview mode. You can keep viewing the document even if advanced canvas features are limited for this file.'
      );
      return;
    }

    updateStatus('PDF could not be loaded', 'Try a smaller or standard PDF file and upload again.');
  }
};

['dragenter', 'dragover'].forEach((eventName) => {
  elements.pageStageCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!event.dataTransfer?.types?.includes('Files')) return;
    setEmptyState(!state.sourceBytes, true);
  });
});

['dragleave', 'dragend'].forEach((eventName) => {
  elements.pageStageCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === 'dragleave' && elements.pageStageCard.contains(event.relatedTarget)) return;
    setEmptyState(!state.sourceBytes, false);
  });
});

elements.pageStageCard.addEventListener('drop', async (event) => {
  event.preventDefault();
  setEmptyState(!state.sourceBytes, false);
  const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type === 'application/pdf' || item.name?.toLowerCase().endsWith('.pdf'));
  if (!file) {
    updateStatus('PDF required', 'Drop a PDF file here to start editing.');
    return;
  }
  await handlePdfFile(file);
});

elements.placeWhiteoutButton.addEventListener('click', () => {
  if (!state.sourceBytes || state.pageOrder.length === 0) return;
  setMode('place-whiteout');
  toggleDropdown();
});

elements.imageUpload.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  state.imageDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  
  // Show preview
  if (elements.imagePreviewEl && elements.imagePreviewBox) {
    elements.imagePreviewEl.src = state.imageDataUrl;
    elements.imagePreviewEl.hidden = false;
    const placeholder = elements.imagePreviewBox.querySelector('.preview-placeholder');
    if (placeholder) placeholder.hidden = true;
  }
  
  elements.imageName.textContent = file.name;
  elements.imageState.hidden = false;
  updateButtons();
});

elements.signatureUploadInput?.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  updateActiveSignature(dataUrl);
});

const updateActiveSignature = (dataUrl) => {
  state.signatureDataUrl = dataUrl;
  if (elements.sigPreviewImg && elements.activeSignaturePreview) {
    elements.sigPreviewImg.src = dataUrl;
    elements.activeSignaturePreview.hidden = false;
  }
  updateButtons();
};

elements.placeImageButton.addEventListener('click', () => {
  if (!state.sourceBytes || state.pageOrder.length === 0 || !state.imageDataUrl) return;
  setMode('place-image');
  toggleDropdown();
});

elements.openSignatureModalButton.addEventListener('click', () => {
  elements.signatureModal.hidden = false;
  toggleDropdown();
});

elements.placeSignatureButton.addEventListener('click', () => {
  if (!state.signatureDataUrl || !state.sourceBytes || state.pageOrder.length === 0) return;
  setMode('place-signature');
  toggleDropdown();
});

elements.toolWhiteoutDropdown.addEventListener('click', () => toggleDropdown('dropdown-whiteout'));
elements.toolImageDropdown.addEventListener('click', () => toggleDropdown('dropdown-image'));
elements.toolSignatureDropdown.addEventListener('click', () => toggleDropdown('dropdown-signature'));

elements.contextAddWhiteout?.addEventListener('click', () => {
  const point = state.contextPoint;
  if (point) {
    addWhiteoutOverlay(point.x, point.y);
  } else {
    setMode('place-whiteout');
  }
  hideContextMenu();
});

elements.contextAddImage?.addEventListener('click', () => {
  const point = state.contextPoint;
  if (point && state.imageDataUrl) {
    addImageOverlay(point.x, point.y);
  } else {
    toggleDropdown('dropdown-image');
    setMode('place-image');
  }
  hideContextMenu();
});

elements.contextAddSignature?.addEventListener('click', () => {
  const point = state.contextPoint;
  if (point && state.signatureDataUrl) {
    addSignatureOverlay(point.x, point.y);
  } else if (state.signatureDataUrl) {
    setMode('place-signature');
  } else {
    elements.signatureModal.hidden = false;
  }
  hideContextMenu();
});

elements.contextPan?.addEventListener('click', () => {
  setMode('pan');
  hideContextMenu();
});

elements.prevPageButton.addEventListener('click', () => {
  if (state.selectedPageIndex > 0) {
    state.selectedPageIndex -= 1;
    void renderWorkspace(true);
    renderThumbnails();
  }
});
elements.nextPageButton.addEventListener('click', () => {
  if (state.selectedPageIndex < state.pageOrder.length - 1) {
    state.selectedPageIndex += 1;
    void renderWorkspace(true);
    renderThumbnails();
  }
});
elements.movePageUpButton.addEventListener('click', () => swapPages(-1));
elements.movePageDownButton.addEventListener('click', () => swapPages(1));
elements.deletePageButton.addEventListener('click', () => deleteCurrentPage());

elements.zoomInButton.addEventListener('click', () => {
  state.zoomLevel = Math.min(state.zoomLevel + 0.2, 4.0);
  void renderWorkspace();
});
elements.zoomOutButton.addEventListener('click', () => {
  state.zoomLevel = Math.max(state.zoomLevel - 0.2, 0.2);
  void renderWorkspace();
});
elements.zoomFitButton.addEventListener('click', () => {
  state.zoomLevel = 1.0;
  void renderWorkspace();
});
elements.toolPanButton.addEventListener('click', () => {
  setMode('pan');
});

elements.mergePdfInput.addEventListener('change', async (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  if (!state.sourceBytes) {
    alert('Please upload a base PDF first before merging.');
    event.target.value = '';
    return;
  }
  if (!hasPdfLib()) {
    alert('PDF editing library (pdf-lib) failed to load. Please refresh the page and try again.');
    event.target.value = '';
    return;
  }

  try {
    updateStatus('Merging PDFs...', 'Appending pages from selected files.');
    let mainDoc;
    let startIndex = 0;
    const newMeta = state.sourceBytes ? [...state.pageMetadata] : [];

    if (!state.sourceBytes) {
      // Use first file as base
      const firstFile = files[0];
      const bytes = new Uint8Array(await firstFile.arrayBuffer());
      mainDoc = await PDFDocument.load(bytes);
      const docColor = getNextDocColor();
      const docName = firstFile.name.replace(/\.pdf$/i, '');
      for (let j = 0; j < mainDoc.getPageCount(); j++) {
        newMeta.push({ docId: docColorIndex, color: docColor, docName });
      }
      startIndex = 1;
    } else {
      mainDoc = await PDFDocument.load(state.sourceBytes);
      startIndex = 0;
    }

    for (let i = startIndex; i < files.length; i++) {
      const file = files[i];
      const bytes = new Uint8Array(await file.arrayBuffer());
      const appendDoc = await PDFDocument.load(bytes);
      const docColor = getNextDocColor();
      const docName = file.name.replace(/\.pdf$/i, '');
      const copiedPages = await mainDoc.copyPages(appendDoc, appendDoc.getPageIndices());
      copiedPages.forEach(() => {
        newMeta.push({ docId: docColorIndex, color: docColor, docName });
      });
      copiedPages.forEach((page) => mainDoc.addPage(page));
    }

    const savedBytes = await mainDoc.save();

    // Rebuild pdfJsDoc from the merged bytes to get correct page count
    let newPdfJsDoc = null;
    try {
      newPdfJsDoc = await pdfJsApi.getDocument({ data: savedBytes, disableWorker: true }).promise;
    } catch (e) { /* ignore */ }

    state.sourceBytes = savedBytes;
    state.pdfJsDoc = newPdfJsDoc;
    state.thumbnailPdfJsDoc = newPdfJsDoc; // keep thumbnail doc in sync
    state.pageOrder = Array.from({ length: mainDoc.getPageCount() }, (_, idx) => idx);
    state.pageMetadata = newMeta;
    state.selectedPageIndex = Math.min(state.selectedPageIndex, state.pageOrder.length - 1);

    updateButtons();
    await renderWorkspace();
    renderThumbnails();
    updateStatus('Merge Complete', `${files.length} file(s) appended — ${state.pageOrder.length} pages total.`);
  } catch (err) {
    updateStatus('Merge Failed', err.message);
  }
  // reset input
  event.target.value = '';
});

elements.splitPdfBtn.addEventListener('click', async () => {
  if (!state.sourceBytes || state.pageOrder.length === 0 || !hasPdfLib() || typeof JSZip === 'undefined') return;
  
  updateStatus('Splitting PDF...', 'Creating a ZIP file with individual pages.');
  
  try {
    const zip = new JSZip();
    const pdfDoc = await PDFDocument.load(state.sourceBytes);
    
    for (let i = 0; i < state.pageOrder.length; i++) {
      const sourcePageIndex = state.pageOrder[i];
      const outputDoc = await PDFDocument.create();
      const [copiedPage] = await outputDoc.copyPages(pdfDoc, [sourcePageIndex]);
      outputDoc.addPage(copiedPage);
      const bytes = await outputDoc.save();
      zip.file(`Page_${i + 1}.pdf`, bytes);
    }
    
    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerBrowserDownload(zipBlob, `${state.fileName.replace(/\.pdf$/i, '')}_split.zip`);
    
    updateStatus('Split Complete', 'ZIP file downloaded successfully.');
  } catch (err) {
    updateStatus('Split Failed', err.message);
  }
});

elements.extractTextButton.addEventListener('click', async () => {
  if (!state.sourceBytes || state.pageOrder.length === 0 || !state.pdfJsDoc) return;
  if (typeof window.Tesseract === 'undefined') {
    window.alert('OCR library (Tesseract.js) failed to load. Please check your internet connection.');
    return;
  }
  
  elements.ocrModal.hidden = false;
  elements.ocrStatus.textContent = "Processing image (this may take a moment)...";
  elements.ocrResultText.value = "";
  elements.copyOcrTextButton.disabled = true;
  
  try {
    const dataUrl = elements.canvas.toDataURL('image/png');
    const result = await window.Tesseract.recognize(dataUrl, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          elements.ocrStatus.textContent = `Recognizing text: ${Math.round(m.progress * 100)}%`;
        } else {
          elements.ocrStatus.textContent = m.status;
        }
      }
    });
    elements.ocrResultText.value = result.data.text;
    elements.ocrStatus.textContent = "Extraction complete!";
    elements.copyOcrTextButton.disabled = false;
  } catch (err) {
    elements.ocrStatus.textContent = "Error: " + err.message;
  }
});

elements.extractPageButton.addEventListener('click', async () => {
  if (!state.sourceBytes || state.pageOrder.length === 0 || !hasPdfLib()) return;
  const pdfDoc = await PDFDocument.load(state.sourceBytes);
  const outputDoc = await PDFDocument.create();
  const sourcePageIndex = getSelectedSourcePageIndex();
  const [copiedPage] = await outputDoc.copyPages(pdfDoc, [sourcePageIndex]);
  outputDoc.addPage(copiedPage);
  const bytes = await outputDoc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  triggerBrowserDownload(
    blob,
    `${state.fileName.replace(/\.pdf$/i, '')}-page-${state.selectedPageIndex + 1}.pdf`
  );
});

const closeSignatureModal = () => {
  elements.signatureModal.hidden = true;
};

document.querySelectorAll('[data-close-signature]').forEach((node) => {
  node.addEventListener('click', closeSignatureModal);
});

const closeOcrModal = () => {
  elements.ocrModal.hidden = true;
};

document.querySelectorAll('[data-close-ocr]').forEach((node) => {
  node.addEventListener('click', closeOcrModal);
});

elements.copyOcrTextButton.addEventListener('click', () => {
  navigator.clipboard.writeText(elements.ocrResultText.value).then(() => {
    const originalText = elements.copyOcrTextButton.textContent;
    elements.copyOcrTextButton.textContent = "Copied!";
    setTimeout(() => {
      elements.copyOcrTextButton.textContent = originalText;
    }, 2000);
  });
});

const resetSignatureCanvas = () => {
  signatureContext.fillStyle = '#ffffff';
  signatureContext.fillRect(0, 0, elements.signatureCanvas.width, elements.signatureCanvas.height);
  signatureContext.lineWidth = 3;
  signatureContext.lineCap = 'round';
  signatureContext.lineJoin = 'round';
  signatureContext.strokeStyle = '#111827';
};

const signaturePoint = (event) => {
  const rect = elements.signatureCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

elements.signatureCanvas.addEventListener('pointerdown', (event) => {
  signatureDrawing = true;
  signatureHasPath = true;
  const point = signaturePoint(event);
  signatureContext.beginPath();
  signatureContext.moveTo(point.x, point.y);
});

elements.signatureCanvas.addEventListener('pointermove', (event) => {
  if (!signatureDrawing) return;
  const point = signaturePoint(event);
  signatureContext.lineTo(point.x, point.y);
  signatureContext.stroke();
});

window.addEventListener('pointerup', () => {
  signatureDrawing = false;
});

elements.clearSignatureButton.addEventListener('click', () => {
  signatureHasPath = false;
  resetSignatureCanvas();
});

elements.saveSignatureButton.addEventListener('click', () => {
  if (!signatureHasPath) {
    window.alert('Draw a signature first.');
    return;
  }
  const dataUrl = elements.signatureCanvas.toDataURL('image/png');
  updateActiveSignature(dataUrl);
  closeSignatureModal();
});

const exportPdfContent = async () => {
  if (!state.sourceBytes || !hasPdfLib()) return;

  try {
    updateStatus('Exporting PDF...', 'Building your updated document for download.');

    const pdfDoc = await PDFDocument.load(state.sourceBytes);
    const sourcePages = pdfDoc.getPages();
    const outputDoc = await PDFDocument.create();
    const embeddedFonts = {
      sans: await outputDoc.embedFont(getPdfFontForPreset('sans')),
      serif: await outputDoc.embedFont(getPdfFontForPreset('serif')),
      mono: await outputDoc.embedFont(getPdfFontForPreset('mono')),
    };

    const signatureAssets = {};
    const imageAssets = {};

    for (let orderedIndex = 0; orderedIndex < state.pageOrder.length; orderedIndex += 1) {
      const sourcePageIndex = state.pageOrder[orderedIndex];
      const [copiedPage] = await outputDoc.copyPages(pdfDoc, [sourcePageIndex]);
      outputDoc.addPage(copiedPage);
      const outputPage = outputDoc.getPages()[orderedIndex];
      const sourcePage = sourcePages[sourcePageIndex];
      const pageWidth = sourcePage.getWidth();
      const pageHeight = sourcePage.getHeight();

      // Account for page origin (e.g. non-zero MediaBox/CropBox)
      const cropBox = sourcePage.getCropBox();
      const originX = cropBox.x || 0;
      const originY = cropBox.y || 0;

      const overlays = state.overlays[sourcePageIndex] || [];
      for (const overlay of overlays) {
        if (overlay.type === 'text') {
          if (!String(overlay.text || '').trim() && !overlay.isMagicPen) continue;

          const boxWidth = overlay.width * pageWidth;
          const boxHeight = overlay.height * pageHeight;

          const color = overlay.color || '#1f2340';
          const normalized = color.startsWith('#') ? color.slice(1) : color;
          const red = parseInt(normalized.slice(0, 2), 16) / 255;
          const green = parseInt(normalized.slice(2, 4), 16) / 255;
          const blue = parseInt(normalized.slice(4, 6), 16) / 255;
          const overlayFont = embeddedFonts[overlay.fontPreset || 'sans'] || embeddedFonts.sans;

          const insetX = overlay.isMagicPen ? 0.5 : Math.min(14, boxWidth * 0.08);
          const lineHeight = Math.round(overlay.fontSize * 1.2);
          const textLines = wrapTextForPdf(
            overlay.text,
            overlayFont,
            overlay.fontSize,
            Math.max(2, boxWidth - insetX * 2)
          );

          const totalTextHeight = textLines.length * lineHeight - (lineHeight - overlay.fontSize);
          const boxTop = originY + pageHeight - overlay.y * pageHeight;
          const textStartX = originX + overlay.x * pageWidth + insetX;
          const currentScale = state.currentScale || 1;
          const visualPadX = overlay.isMagicPen ? Math.max(0.5, 0.65 / currentScale) : insetX;
          const visualPadY = overlay.isMagicPen
            ? Math.max(0.35, 0.5 / currentScale)
            : Math.min(10, boxHeight * 0.08);

          let currentY = boxTop - (boxHeight - totalTextHeight) / 2 - overlay.fontSize;

          if (overlay.isMagicPen) {
            const longestLineWidth = textLines.reduce(
              (maxWidth, line) => Math.max(maxWidth, overlayFont.widthOfTextAtSize(line, overlay.fontSize)),
              0
            );

            // Ensure we cover at least the original selection area OR the new text area
            const exportBgWidth = Math.max(
              overlay.originalWidth * pageWidth || 0,
              boxWidth,
              longestLineWidth + visualPadX * 2
            );
            const exportBgHeight = Math.max(overlay.originalHeight * pageHeight || 0, boxHeight);

            const bgColor = overlay.backgroundColor || '#ffffff';
            // Robust hex to RGB conversion
            let bgR = 1;
            let bgG = 1;
            let bgB = 1;
            if (bgColor.startsWith('#')) {
              const hex = bgColor.length === 4
                ? bgColor[1] + bgColor[1] + bgColor[2] + bgColor[2] + bgColor[3] + bgColor[3]
                : bgColor.slice(1);
              bgR = parseInt(hex.slice(0, 2), 16) / 255 || 1;
              bgG = parseInt(hex.slice(2, 4), 16) / 255 || 1;
              bgB = parseInt(hex.slice(4, 6), 16) / 255 || 1;
            }

            outputPage.drawRectangle({
              x: originX + overlay.x * pageWidth,
              y: originY + pageHeight - (overlay.y + (exportBgHeight / pageHeight)) * pageHeight,
              width: exportBgWidth,
              height: exportBgHeight,
              color: rgb(bgR, bgG, bgB),
            });
          }

          textLines.forEach((line) => {
            outputPage.drawText(line, {
              x: textStartX,
              y: overlay.isMagicPen ? currentY + visualPadY * 0.15 : currentY,
              size: overlay.fontSize,
              font: overlayFont,
              color: rgb(red, green, blue),
            });
            currentY -= lineHeight;
          });
        }

        if (overlay.type === 'signature') {
          if (!signatureAssets[overlay.dataUrl]) {
            signatureAssets[overlay.dataUrl] = await outputDoc.embedPng(dataUrlToBytes(overlay.dataUrl));
          }

          const signatureImage = signatureAssets[overlay.dataUrl];
          outputPage.drawImage(signatureImage, {
            x: originX + overlay.x * pageWidth,
            y: originY + pageHeight - (overlay.y + overlay.height) * pageHeight,
            width: overlay.width * pageWidth,
            height: overlay.height * pageHeight,
          });
        }

        if (overlay.type === 'image') {
          if (!imageAssets[overlay.dataUrl]) {
            if (overlay.dataUrl.startsWith('data:image/png')) {
              imageAssets[overlay.dataUrl] = await outputDoc.embedPng(dataUrlToBytes(overlay.dataUrl));
            } else {
              imageAssets[overlay.dataUrl] = await outputDoc.embedJpg(dataUrlToBytes(overlay.dataUrl));
            }
          }

          const imageAsset = imageAssets[overlay.dataUrl];
          outputPage.drawImage(imageAsset, {
            x: originX + overlay.x * pageWidth,
            y: originY + pageHeight - (overlay.y + overlay.height) * pageHeight,
            width: overlay.width * pageWidth,
            height: overlay.height * pageHeight,
          });
        }

        if (overlay.type === 'whiteout') {
          outputPage.drawRectangle({
            x: originX + overlay.x * pageWidth,
            y: originY + pageHeight - (overlay.y + overlay.height) * pageHeight,
            width: overlay.width * pageWidth,
            height: overlay.height * pageHeight,
            color: rgb(1, 1, 1),
          });
        }
      }
    }

    const savedBytes = await outputDoc.save();
    const blob = new Blob([savedBytes], { type: 'application/pdf' });
    triggerBrowserDownload(blob, state.fileName);
    updateStatus('Export Complete', `${state.fileName} is ready and should download automatically.`);
  } catch (error) {
    console.error('[PDF Export] Failed to create PDF:', error);
    updateStatus('Export Failed', error?.message || 'Could not create the PDF file.');
    window.alert(`Export failed: ${error?.message || 'Could not create the PDF file.'}`);
  }
};

// Track lifetime payment status in session
let hasLifetimeAccess = false;

const checkLifetimeAccess = async () => {
  try {
    const res = await fetch('/api/check-payment-status');
    const data = await res.json();
    hasLifetimeAccess = !!data.hasPaid;
  } catch (e) {
    hasLifetimeAccess = false;
  }
};

// Check on page load
void checkLifetimeAccess();

elements.downloadButton.addEventListener('click', async () => {
  if (!state.sourceBytes || !hasPdfLib()) return;
  // Re-check in case status changed
  await checkLifetimeAccess();
  if (hasLifetimeAccess) {
    // Already paid — export directly without showing payment modal
    await exportPdfContent();
    return;
  }
  if (elements.paymentModal) {
    elements.paymentModal.hidden = false;
  }
});

if (elements.cancelPaymentButton) {
  elements.cancelPaymentButton.addEventListener('click', () => {
    if (elements.paymentModal) elements.paymentModal.hidden = true;
  });
}

if (elements.paymentModalBackdrop) {
  elements.paymentModalBackdrop.addEventListener('click', () => {
    if (elements.paymentModal) elements.paymentModal.hidden = true;
  });
}

if (elements.proceedPaymentButton) {
  elements.proceedPaymentButton.addEventListener('click', async () => {
    try {
      elements.proceedPaymentButton.disabled = true;
      elements.proceedPaymentButton.textContent = 'Processing...';

      const response = await fetch('/api/create-payment-order', {
        method: 'POST',
      });
      const orderData = await response.json();

      if (!response.ok) {
        throw new Error(orderData.error || 'Failed to create payment order');
      }

      const options = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'LuminaScan',
        description: 'Lifetime Export Access',
        order_id: orderData.orderId,
        handler: async function (rzpResponse) {
          // Confirm lifetime access on the server
          if (elements.proceedPaymentButton) {
            elements.proceedPaymentButton.textContent = 'Verifying Payment...';
            elements.proceedPaymentButton.disabled = true;
          }

          try {
            const confirmResponse = await fetch('/api/confirm-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentId: rzpResponse.razorpay_payment_id,
                orderId: rzpResponse.razorpay_order_id,
                signature: rzpResponse.razorpay_signature,
              }),
            });

            if (!confirmResponse.ok) {
              const errorData = await confirmResponse.json().catch(() => ({}));
              throw new Error(errorData.error || 'Payment confirmation failed on server.');
            }

            hasLifetimeAccess = true;
            alert('Success! Lifetime export access has been activated.');

            if (elements.paymentModal) elements.paymentModal.hidden = true;
            await exportPdfContent();
          } catch (e) {
            console.error('[Payment] Confirmation failed:', e);
            alert('Verification Error: ' + e.message + '\nPlease contact support if the payment was deducted.');
          } finally {
            if (elements.proceedPaymentButton) {
              elements.proceedPaymentButton.disabled = false;
              elements.proceedPaymentButton.textContent = 'Pay \u20B999 & Export';
            }
          }
        },
        prefill: {
          name: 'LuminaScan User',
        },
        theme: {
          color: '#10a37f'
        },
        modal: {
          ondismiss: function () {
            elements.proceedPaymentButton.disabled = false;
            elements.proceedPaymentButton.textContent = 'Pay \u20B999 & Export';
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        console.error('Payment failed', response.error);
        alert('Payment failed. Please try again.');
        elements.proceedPaymentButton.disabled = false;
        elements.proceedPaymentButton.textContent = 'Pay \u20B999 & Export';
      });
      rzp.open();

    } catch (error) {
      console.error('Payment Error:', error);
      alert(error.message || 'An error occurred during payment setup.');
      elements.proceedPaymentButton.disabled = false;
      elements.proceedPaymentButton.textContent = 'Pay \u20B999 & Export';
    }
  });
}

// Signature Upload Handler
if (elements.signatureUploadInput) {
  elements.signatureUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      state.signatureDataUrl = event.target.result;
      if (elements.sigPreviewImg) {
        elements.sigPreviewImg.src = state.signatureDataUrl;
      }
      if (elements.activeSigPreview) {
        elements.activeSigPreview.hidden = false;
      }
      if (elements.placeSignatureButton) {
        elements.placeSignatureButton.disabled = false;
      }
      updateStatus(`Editing ${state.fileName}`, 'Signature uploaded successfully. Use "Place Signature" to add it.');
    };
    reader.readAsDataURL(file);
  });
}

resetSignatureCanvas();
updateButtons();
sessionStorage.removeItem(WEBSITE_EDITOR_PDF_KEY);

// Handle window resize for responsiveness
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (state.sourceBytes && state.pageOrder.length > 0) {
      void renderWorkspace();
      renderThumbnails();
    }
  }, 200);
});

// Auto-paging on scroll
let isScrollingToPage = false;
elements.pageStageCard.addEventListener('scroll', () => {
  if (isScrollingToPage || state.pageOrder.length === 0) return;
  
  const { scrollTop, scrollHeight, clientHeight } = elements.pageStageCard;
  
  // Detect bottom - go to next page
  if (scrollTop + clientHeight >= scrollHeight - 30) {
    if (state.selectedPageIndex < state.pageOrder.length - 1) {
      isScrollingToPage = true;
      state.selectedPageIndex++;
      void renderWorkspace().then(() => {
        renderThumbnails();
        elements.pageStageCard.scrollTop = 5; // Reset scroll slightly for better UX
        setTimeout(() => { isScrollingToPage = false; }, 400);
      });
    }
  } 
  // Detect top - go to previous page
  else if (scrollTop <= 0) {
    if (state.selectedPageIndex > 0) {
      isScrollingToPage = true;
      state.selectedPageIndex--;
      void renderWorkspace().then(() => {
        renderThumbnails();
        // Set scroll to bottom of the previous page
        elements.pageStageCard.scrollTop = elements.pageStageCard.scrollHeight - elements.pageStageCard.clientHeight - 5;
        setTimeout(() => { isScrollingToPage = false; }, 400);
      });
    }
  }
});
// Improved Movable Left Rail Logic
let isDraggingRail = false;
let railStartPos = { x: 0, y: 0 };
let railOffset = { x: 0, y: 0 };

if (elements.railDragHandle && elements.leftRail) {
  elements.railDragHandle.addEventListener('pointerdown', (e) => {
    isDraggingRail = true;
    railStartPos = { x: e.clientX, y: e.clientY };
    
    const rect = elements.leftRail.getBoundingClientRect();
    // On first drag, switch to fixed to avoid layout shifts
    if (window.getComputedStyle(elements.leftRail).position !== 'fixed') {
      const placeholder = document.createElement('div');
      placeholder.className = 'rail-placeholder';
      elements.leftRail.parentNode.insertBefore(placeholder, elements.leftRail);
      
      elements.leftRail.style.top = `${rect.top}px`;
      elements.leftRail.style.left = `${rect.left}px`;
      elements.leftRail.style.width = `${rect.width}px`;
      elements.leftRail.style.position = 'fixed';
      elements.leftRail.style.margin = '0';
      elements.leftRail.style.zIndex = '1000';
    }

    // Get current transform
    const style = window.getComputedStyle(elements.leftRail);
    const matrix = new WebKitCSSMatrix(style.transform);
    railOffset = { x: matrix.m41, y: matrix.m42 };
    
    elements.leftRail.style.transition = 'none';
    elements.leftRail.classList.add('is-dragging');
    document.body.style.cursor = 'grabbing';
    elements.railDragHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  elements.railDragHandle.addEventListener('pointermove', (e) => {
    if (!isDraggingRail) return;
    
    const dx = e.clientX - railStartPos.x;
    const dy = e.clientY - railStartPos.y;
    
    const newX = railOffset.x + dx;
    const newY = railOffset.y + dy;
    
    elements.leftRail.style.transform = `translate(${newX}px, ${newY}px)`;
  });

  elements.railDragHandle.addEventListener('pointerup', () => {
    if (isDraggingRail) {
      isDraggingRail = false;
      elements.leftRail.style.transition = 'transform 0.1s ease-out';
      elements.leftRail.classList.remove('is-dragging');
      document.body.style.cursor = '';
    }
  });
}

// Local Signature Upload Handler
if (elements.uploadSignatureLocal) {
  elements.uploadSignatureLocal.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      state.signatureDataUrl = event.target.result;
      if (elements.sigPreviewImg) elements.sigPreviewImg.src = state.signatureDataUrl;
      if (elements.activeSigPreview) elements.activeSigPreview.hidden = false;
      if (elements.placeSignatureButton) elements.placeSignatureButton.disabled = false;
      
      closeSignatureModal();
      updateStatus(`Editing ${state.fileName}`, 'Local signature uploaded and ready to place.');
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset for next use
  });
}
