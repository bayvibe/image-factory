'use client';

import { ChangeEvent, PointerEvent, WheelEvent, useEffect, useRef, useState } from 'react';

type PanelName = 'top' | 'bottom';
type AppMode = 'single' | 'batch-group';
type TemplateKind = 'yesbut' | 'color-note';

type PanelState = {
  image: HTMLImageElement | null;
  fileName: string;
  scale: number;
  offsetX: number;
  offsetY: number;
};

type BatchAsset = {
  id: string;
  image: HTMLImageElement;
  name: string;
  url: string;
};

type BatchPoster = {
  id: string;
  panels: Record<PanelName, PanelState>;
};

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

const outputWidth = 1080;
const outputHeight = 1440;
const panelHeight = outputHeight / 2;
const maxSourceDimension = 2400;
const labelFontSize = 74;
const colorNoteFontSize = 56;
const defaultColorNoteText = '这一刻有自己的颜色';
const defaultColorNoteColor: RgbColor = { r: 226, g: 176, b: 82 };

const fontOptions = [
  { label: '重磅无衬线', value: 'Arial Black, Arial, sans-serif', weight: 900 },
  { label: '细体', value: 'Helvetica Neue, Avenir Next, Arial, sans-serif', weight: 300 },
  { label: '手写体', value: 'Bradley Hand, Comic Sans MS, Segoe Print, cursive', weight: 700 },
  { label: '海报窄体', value: 'Impact, Haettenschweiler, sans-serif', weight: 900 },
  { label: '复古衬线', value: 'Georgia, serif', weight: 700 },
  { label: '圆润清晰', value: 'Verdana, Geneva, sans-serif', weight: 700 },
  { label: '轻快标题', value: "'Trebuchet MS', sans-serif", weight: 800 },
];

const colorCardFontOptions = [
  { label: '打字机', value: 'Courier New, Courier, Menlo, PingFang SC, Microsoft YaHei, monospace', weight: 700 },
  { label: '宋体印刷', value: 'Georgia, Times New Roman, Songti SC, Songti TC, STSong, SimSun, serif', weight: 700 },
  { label: '黑体印刷', value: 'Impact, Haettenschweiler, STHeiti, Heiti SC, PingFang SC, Arial Black, sans-serif', weight: 900 },
  { label: '手写体', value: 'Bradley Hand, HanziPen SC, Kaiti SC, Kaiti TC, STKaiti, Comic Sans MS, Segoe Print, cursive', weight: 700 },
];

function emptyPanel(): PanelState {
  return {
    image: null,
    fileName: '',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

function panelY(panel: PanelName) {
  return panel === 'top' ? 0 : panelHeight;
}

function imageSize(image: HTMLImageElement) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function getCoverScale(image: HTMLImageElement) {
  const size = imageSize(image);
  return Math.max(outputWidth / size.width, panelHeight / size.height);
}

function getClampedPanel(panel: PanelState): PanelState {
  if (!panel.image) return panel;

  const baseScale = getCoverScale(panel.image);
  const size = imageSize(panel.image);
  const drawWidth = size.width * baseScale * panel.scale;
  const drawHeight = size.height * baseScale * panel.scale;
  const maxX = Math.max(0, (drawWidth - outputWidth) / 2);
  const maxY = Math.max(0, (drawHeight - panelHeight) / 2);

  return {
    ...panel,
    offsetX: Math.min(maxX, Math.max(-maxX, panel.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, panel.offsetY)),
  };
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, panelName: PanelName) {
  const y = panelY(panelName);
  ctx.fillStyle = '#f1f1f1';
  ctx.fillRect(0, y, outputWidth, panelHeight);
}

function colorToCss(color: RgbColor) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function rgbToHsl(color: RgbColor) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  const normalizedS = s / 100;
  const normalizedL = l / 100;
  const c = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = normalizedL - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function relativeLuminance(color: RgbColor) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(a: RgbColor, b: RgbColor) {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function getReadableSameFamilyColor(background: RgbColor) {
  const hsl = rgbToHsl(background);
  const saturation = Math.min(92, Math.max(34, hsl.s + 18));
  const backgroundLuminance = relativeLuminance(background);
  const lightnessSteps = backgroundLuminance > 0.42 ? [16, 10, 22, 28, 34] : [92, 96, 86, 80, 74];
  let best = hslToRgb(hsl.h, saturation, lightnessSteps[0]);
  let bestContrast = contrastRatio(background, best);

  for (const lightness of lightnessSteps) {
    const candidate = hslToRgb(hsl.h, saturation, lightness);
    const contrast = contrastRatio(background, candidate);
    if (contrast > bestContrast) {
      best = candidate;
      bestContrast = contrast;
    }
    if (contrast >= 4.5) return candidate;
  }

  return best;
}

function extractDominantColorFromPixels(pixels: Uint8ClampedArray) {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number; score: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 160) continue;

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const hsl = rgbToHsl({ r, g, b });

    if ((hsl.l < 8 || hsl.l > 94) && hsl.s < 18) continue;

    const saturation = hsl.s / 100;
    const lightness = hsl.l / 100;
    const neutralPenalty = hsl.s < 14 ? 0.18 : 1;
    const blackWhitePenalty = hsl.l < 10 || hsl.l > 92 ? 0.25 : 1;
    const highlightWeight = 0.5 + lightness;
    const saturationWeight = 0.35 + saturation * 2.2;
    const pixelScore = saturationWeight * highlightWeight * neutralPenalty * blackWhitePenalty;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0, score: 0 };

    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    bucket.score += pixelScore;
    buckets.set(key, bucket);
  }

  let winner: { r: number; g: number; b: number; count: number; score: number } | null = null;
  let winnerScore = 0;
  for (const bucket of buckets.values()) {
    const averageSalience = bucket.score / bucket.count;
    const candidateScore = Math.sqrt(bucket.count) * averageSalience;
    if (!winner || candidateScore > winnerScore) {
      winner = bucket;
      winnerScore = candidateScore;
    }
  }

  if (!winner || winner.count === 0) return defaultColorNoteColor;

  return {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
  };
}

function extractDominantColorFromPanel(panel: PanelState | null | undefined): RgbColor {
  if (!panel?.image) return defaultColorNoteColor;

  const sampleWidth = 72;
  const sampleHeight = 48;
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return defaultColorNoteColor;

  const clamped = getClampedPanel(panel);
  const image = clamped.image;
  if (!image) return defaultColorNoteColor;

  const size = imageSize(image);
  const baseScale = getCoverScale(image);
  const scale = baseScale * clamped.scale;
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  const x = (outputWidth - drawWidth) / 2 + clamped.offsetX;
  const y = (panelHeight - drawHeight) / 2 + clamped.offsetY;
  const sampleScaleX = sampleWidth / outputWidth;
  const sampleScaleY = sampleHeight / panelHeight;

  ctx.drawImage(image, x * sampleScaleX, y * sampleScaleY, drawWidth * sampleScaleX, drawHeight * sampleScaleY);

  try {
    return extractDominantColorFromPixels(ctx.getImageData(0, 0, sampleWidth, sampleHeight).data);
  } catch {
    return defaultColorNoteColor;
  }
}

function drawImagePanel(ctx: CanvasRenderingContext2D, panelName: PanelName, panel: PanelState) {
  const y = panelY(panelName);

  if (!panel.image) {
    drawPlaceholder(ctx, panelName);
    return;
  }

  const clamped = getClampedPanel(panel);
  const image = clamped.image;
  if (!image) return;

  const size = imageSize(image);
  const baseScale = getCoverScale(image);
  const scale = baseScale * clamped.scale;
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  const x = (outputWidth - drawWidth) / 2 + clamped.offsetX;
  const drawY = y + (panelHeight - drawHeight) / 2 + clamped.offsetY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, outputWidth, panelHeight);
  ctx.clip();
  ctx.drawImage(image, x, drawY, drawWidth, drawHeight);
  ctx.restore();
}

function drawColorPanel(ctx: CanvasRenderingContext2D, panelName: PanelName, color: RgbColor) {
  const y = panelY(panelName);
  ctx.fillStyle = colorToCss(color);
  ctx.fillRect(0, y, outputWidth, panelHeight);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  panelName: PanelName,
  label: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
) {
  const y = panelY(panelName);
  const text = label.trim();
  if (!text) return;

  const x = outputWidth / 2;
  const textY = y + panelHeight / 2;

  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.34)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.lineWidth = Math.max(2, fontSize * 0.035);
  ctx.strokeText(text, x, textY, outputWidth - 96);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, textY, outputWidth - 96);
  ctx.restore();
}

function drawColorNoteLabel(
  ctx: CanvasRenderingContext2D,
  panelName: PanelName,
  label: string,
  backgroundColor: RgbColor,
  fontFamily: string,
  fontWeight: number,
) {
  const y = panelY(panelName);
  const text = label.trim();
  if (!text) return;

  const x = outputWidth / 2;
  const textY = y + panelHeight / 2;
  const textColor = getReadableSameFamilyColor(backgroundColor);
  const contrastIsDark = relativeLuminance(textColor) < relativeLuminance(backgroundColor);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let fontSize = colorNoteFontSize;
  const maxWidth = outputWidth - 140;
  while (fontSize > 42) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontSize -= 2;
  }
  ctx.shadowColor = contrastIsDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = colorToCss(textColor);
  ctx.fillText(text, x, textY, maxWidth);
  ctx.restore();
}

function drawPosterToCanvas(
  canvas: HTMLCanvasElement,
  panels: Record<PanelName, PanelState>,
  fontFamily: string,
  fontWeight: number,
  template: TemplateKind,
  colorNoteText: string,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, outputWidth, outputHeight);

  if (template === 'color-note') {
    const dominantColor = extractDominantColorFromPanel(panels.bottom);
    drawColorPanel(ctx, 'top', dominantColor);
    drawColorNoteLabel(ctx, 'top', colorNoteText, dominantColor, fontFamily, fontWeight);
    drawImagePanel(ctx, 'bottom', panels.bottom);
    return;
  }

  drawImagePanel(ctx, 'top', panels.top);
  drawImagePanel(ctx, 'bottom', panels.bottom);
  drawLabel(ctx, 'top', 'Yes', labelFontSize, fontFamily, fontWeight);
  drawLabel(ctx, 'bottom', 'But', labelFontSize, fontFamily, fontWeight);
}

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function normalizeImageForEditor(image: HTMLImageElement, mimeType: string) {
  const size = imageSize(image);
  const longestSide = Math.max(size.width, size.height);
  const scale = longestSide > maxSourceDimension ? maxSourceDimension / longestSide : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width * scale);
  canvas.height = Math.round(size.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return image;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const outputType = mimeType === 'image/png' || mimeType === 'image/svg+xml' ? 'image/png' : 'image/jpeg';
  return createImage(canvas.toDataURL(outputType, 0.9));
}

async function loadImageFromFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await createImage(url);
    return normalizeImageForEditor(image, file.type);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadImageAsset(file: File, index: number): Promise<BatchAsset> {
  const image = await loadImageFromFile(file);
  return {
    id: `${Date.now()}-${index}-${file.name}`,
    image,
    name: file.name,
    url: image.src,
  };
}

function panelFromImage(image: HTMLImageElement | null): PanelState {
  return image ? { ...emptyPanel(), image } : emptyPanel();
}

function renderBatchOutputs(
  posters: BatchPoster[],
  fontFamily: string,
  fontWeight: number,
  template: TemplateKind,
  colorNoteText: string,
) {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const outputs: string[] = [];
  for (const poster of posters) {
    drawPosterToCanvas(canvas, poster.panels, fontFamily, fontWeight, template, colorNoteText);
    outputs.push(canvas.toDataURL('image/png'));
  }

  return outputs;
}

function isTouchMobileBrowser() {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
}

async function dataUrlToPngFile(dataUrl: string, filename: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: 'image/png' });
}

async function shareImageOnMobile(dataUrl: string, filename: string) {
  if (!isTouchMobileBrowser() || !navigator.share) return false;

  try {
    const file = await dataUrlToPngFile(dataUrl, filename);
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;
    await navigator.share({
      files: [file],
      title: '图片工厂',
    });
    return true;
  } catch {
    return false;
  }
}

async function savePosterImage(dataUrl: string, filename: string) {
  const shared = await shareImageOnMobile(dataUrl, filename);
  if (shared) return;

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const topInputRef = useRef<HTMLInputElement | null>(null);
  const bottomInputRef = useRef<HTMLInputElement | null>(null);
  const colorNoteInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const batchAppendInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ panel: PanelName; x: number; y: number } | null>(null);
  const tapRef = useRef<{ panel: PanelName; x: number; y: number; moved: boolean } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ panel: PanelName; distance: number; scale: number } | null>(null);
  const interactionActiveRef = useRef(false);
  const batchOutputTimerRef = useRef<number | null>(null);
  const batchTipTimerRef = useRef<number | null>(null);
  const fontCyclePointerRef = useRef(false);

  const [panels, setPanels] = useState<Record<PanelName, PanelState>>({
    top: emptyPanel(),
    bottom: emptyPanel(),
  });
  const [mode, setMode] = useState<AppMode>('single');
  const [batchAssets, setBatchAssets] = useState<BatchAsset[]>([]);
  const [batchPosters, setBatchPosters] = useState<BatchPoster[]>([]);
  const [batchOutputs, setBatchOutputs] = useState<string[]>([]);
  const [batchActive, setBatchActive] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number | null>(null);
  const [batchTip, setBatchTip] = useState('点一张图片选中，再点另一张交换位置。');
  const [batchTipVisible, setBatchTipVisible] = useState(false);
  const [cropGuideVisible, setCropGuideVisible] = useState(false);
  const [cropGuideSeen, setCropGuideSeen] = useState(true);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [fontIndex, setFontIndex] = useState(0);
  const [colorCardFontIndex, setColorCardFontIndex] = useState(1);
  const [template, setTemplate] = useState<TemplateKind>('yesbut');
  const [colorNoteText, setColorNoteText] = useState(defaultColorNoteText);
  const [colorNoteEditing, setColorNoteEditing] = useState(false);
  const [colorNoteBaseColor, setColorNoteBaseColor] = useState<RgbColor>(defaultColorNoteColor);
  const topText = 'Yes';
  const bottomText = 'But';
  const activeFontOption = template === 'color-note' ? colorCardFontOptions[colorCardFontIndex] : fontOptions[fontIndex];
  const fontFamily = activeFontOption.value;
  const fontWeight = activeFontOption.weight;
  const fontSize = labelFontSize;
  const editablePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;
  const hasEditableImage =
    template === 'color-note' ? Boolean(editablePanels?.bottom.image) : Boolean(editablePanels?.top.image || editablePanels?.bottom.image);
  const colorNoteTextColor = getReadableSameFamilyColor(colorNoteBaseColor);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, outputWidth, outputHeight);
    const activePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;
    if (template === 'color-note') {
      drawColorPanel(ctx, 'top', colorNoteBaseColor);
      if (!colorNoteEditing) {
        drawColorNoteLabel(ctx, 'top', colorNoteText, colorNoteBaseColor, fontFamily, fontWeight);
      }
      drawImagePanel(ctx, 'bottom', activePanels?.bottom ?? emptyPanel());
      return;
    }

    drawImagePanel(ctx, 'top', activePanels?.top ?? emptyPanel());
    drawImagePanel(ctx, 'bottom', activePanels?.bottom ?? emptyPanel());
    drawLabel(ctx, 'top', topText, fontSize, fontFamily, fontWeight);
    drawLabel(ctx, 'bottom', bottomText, fontSize, fontFamily, fontWeight);
  }, [batchActive, batchPosters, colorNoteBaseColor, colorNoteEditing, colorNoteText, currentBatchIndex, panels, fontFamily, fontWeight, template]);

  useEffect(() => {
    if (template !== 'color-note') return;
    setColorNoteBaseColor(extractDominantColorFromPanel(editablePanels?.bottom));
  }, [editablePanels?.bottom, template]);

  useEffect(() => {
    if (!colorNoteEditing) return;
    window.requestAnimationFrame(() => {
      colorNoteInputRef.current?.focus();
      colorNoteInputRef.current?.select();
    });
  }, [colorNoteEditing]);

  useEffect(() => {
    if (!batchActive) return;

    if (batchOutputTimerRef.current !== null) {
      window.clearTimeout(batchOutputTimerRef.current);
    }

    batchOutputTimerRef.current = window.setTimeout(
      () => {
        setBatchOutputs(renderBatchOutputs(batchPosters, fontFamily, fontWeight, template, colorNoteText));
        batchOutputTimerRef.current = null;
      },
      interactionActiveRef.current ? 220 : 40,
    );

    return () => {
      if (batchOutputTimerRef.current !== null) {
        window.clearTimeout(batchOutputTimerRef.current);
        batchOutputTimerRef.current = null;
      }
    };
  }, [batchActive, batchPosters, colorNoteText, fontFamily, fontWeight, template]);

  useEffect(() => {
    return () => {
      if (batchTipTimerRef.current !== null) {
        window.clearTimeout(batchTipTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCropGuideSeen(window.localStorage.getItem('yesbut-crop-guide-seen') === '1');
  }, []);

  useEffect(() => {
    if (mode === 'single' && hasEditableImage && !cropGuideSeen) {
      setCropGuideVisible(true);
    }
  }, [cropGuideSeen, hasEditableImage, mode]);

  useEffect(() => {
    if (!batchActive) {
      setDownloadMenuOpen(false);
    }
  }, [batchActive]);

  useEffect(() => {
    setColorNoteEditing(false);
    setDownloadMenuOpen(false);
  }, [template]);

  function canvasPoint(event: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * outputWidth,
      y: ((event.clientY - rect.top) / rect.height) * outputHeight,
    };
  }

  function panelFromY(y: number): PanelName {
    return y < panelHeight ? 'top' : 'bottom';
  }

  function openUpload(panel: PanelName) {
    (panel === 'top' ? topInputRef : bottomInputRef).current?.click();
  }

  function showBatchTip(message: string) {
    if (batchTipTimerRef.current !== null) {
      window.clearTimeout(batchTipTimerRef.current);
    }

    setBatchTip(message);
    setBatchTipVisible(true);
    batchTipTimerRef.current = window.setTimeout(() => {
      setBatchTipVisible(false);
      batchTipTimerRef.current = null;
    }, 2600);
  }

  function dismissCropGuide() {
    setCropGuideVisible(false);
    setCropGuideSeen(true);
    window.localStorage.setItem('yesbut-crop-guide-seen', '1');
  }

  async function loadFile(panelName: PanelName, file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;

    const image = await loadImageFromFile(file);
    const targetPanelName = template === 'color-note' ? 'bottom' : panelName;
    const nextPanel = {
      image,
      fileName: file.name,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };

    if (batchActive) {
      setBatchPosters((current) =>
        current.map((poster, index) =>
          index === currentBatchIndex
            ? {
                ...poster,
                panels: {
                  ...poster.panels,
                  [targetPanelName]: nextPanel,
                },
              }
            : poster,
        ),
      );
      return;
    }

    setPanels((current) => ({
      ...current,
      [targetPanelName]: nextPanel,
    }));
  }

  async function loadBatchFiles(files: FileList | null) {
    const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const assets = await Promise.all(imageFiles.map(loadImageAsset));
    setBatchAssets(assets);
    setBatchPosters([]);
    setBatchOutputs([]);
    setBatchActive(false);
    setCurrentBatchIndex(0);
    setSelectedBatchIndex(null);
    showBatchTip('点一张图片选中，再点另一张交换位置。');
    setMode('batch-group');
  }

  async function appendBatchFiles(files: FileList | null) {
    const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const offset = batchAssets.length;
    const assets = await Promise.all(imageFiles.map((file, index) => loadImageAsset(file, offset + index)));
    setBatchAssets((current) => [...current, ...assets]);
    setSelectedBatchIndex(null);
    showBatchTip('已添加图片。点一张图片选中，再点另一张交换位置。');
  }

  function swapBatchAssets(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setBatchAssets((current) => {
      const next = [...current];
      const temp = next[fromIndex];
      next[fromIndex] = next[toIndex];
      next[toIndex] = temp;
      return next;
    });
  }

  function handleBatchTileClick(index: number) {
    if (selectedBatchIndex === null) {
      setSelectedBatchIndex(index);
      showBatchTip(`已选中第 ${index + 1} 张。现在点目标图片完成交换。`);
      return;
    }

    if (selectedBatchIndex === index) {
      setSelectedBatchIndex(null);
      showBatchTip('已取消选择。点一张图片重新开始。');
      return;
    }

    swapBatchAssets(selectedBatchIndex, index);
    showBatchTip(`已交换第 ${selectedBatchIndex + 1} 张和第 ${index + 1} 张。`);
    setSelectedBatchIndex(null);
  }

  function completeBatch() {
    const groupSize = template === 'color-note' ? 1 : 2;
    const posters = Array.from({ length: Math.ceil(batchAssets.length / groupSize) }, (_, index) => {
      const assetIndex = index * groupSize;
      return {
        id: `poster-${Date.now()}-${index}`,
        panels: {
          top: template === 'color-note' ? emptyPanel() : panelFromImage(batchAssets[assetIndex]?.image ?? null),
          bottom:
            template === 'color-note'
              ? panelFromImage(batchAssets[assetIndex]?.image ?? null)
              : panelFromImage(batchAssets[assetIndex + 1]?.image ?? null),
        },
      };
    });

    setBatchPosters(posters);
    setBatchOutputs(renderBatchOutputs(posters, fontFamily, fontWeight, template, colorNoteText));
    setBatchActive(true);
    setCurrentBatchIndex(0);
    setMode('single');
  }

  function addEmptyBatchPoster() {
    const emptyPoster = {
      id: `poster-empty-${Date.now()}`,
      panels: {
        top: emptyPanel(),
        bottom: emptyPanel(),
      },
    };

    if (!batchActive) {
      setBatchPosters([
        {
          id: `poster-current-${Date.now()}`,
          panels,
        },
        emptyPoster,
      ]);
      setCurrentBatchIndex(1);
      setBatchActive(true);
      return;
    }

    setBatchPosters((current) => {
      const next = [...current, emptyPoster];
      setCurrentBatchIndex(next.length - 1);
      return next;
    });
  }

  function downloadBatchPoster(url: string, index: number) {
    savePosterImage(url, `image-factory-batch-${String(index + 1).padStart(2, '0')}.png`);
  }

  function downloadAllBatchPosters() {
    const outputs = renderBatchOutputs(batchPosters, fontFamily, fontWeight, template, colorNoteText);
    outputs.forEach((url, index) => {
      window.setTimeout(() => downloadBatchPoster(url, index), index * 120);
    });
  }

  function downloadCurrentPoster() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    savePosterImage(canvas.toDataURL('image/png'), `image-factory-${new Date().toISOString().slice(0, 10)}.png`);
  }

  function updatePanel(panelName: PanelName, updater: (panel: PanelState) => PanelState) {
    if (batchActive) {
      setBatchPosters((current) =>
        current.map((poster, index) =>
          index === currentBatchIndex
            ? {
                ...poster,
                panels: {
                  ...poster.panels,
                  [panelName]: getClampedPanel(updater(poster.panels[panelName])),
                },
              }
            : poster,
        ),
      );
      return;
    }

    setPanels((current) => ({
      ...current,
      [panelName]: getClampedPanel(updater(current[panelName])),
    }));
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event);
    const panel = panelFromY(point.y);
    if (template === 'color-note' && panel === 'top') {
      setColorNoteEditing(true);
      return;
    }

    const targetPanel = template === 'color-note' ? 'bottom' : panel;
    const activePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;

    if (!activePanels?.[targetPanel].image) {
      openUpload(targetPanel);
      return;
    }

    if (cropGuideVisible) {
      dismissCropGuide();
    }

    interactionActiveRef.current = true;
    pointersRef.current.set(event.pointerId, point);
    tapRef.current = { panel: targetPanel, x: point.x, y: point.y, moved: false };
    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values());
      pinchRef.current = {
        panel: targetPanel,
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        scale: activePanels[targetPanel].scale,
      };
      tapRef.current = null;
      dragRef.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    dragRef.current = { panel: targetPanel, x: point.x, y: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, canvasPoint(event));
    }

    if (pinchRef.current && pointersRef.current.size >= 2) {
      event.preventDefault();
      const points = Array.from(pointersRef.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const nextScale = Math.min(3, Math.max(1, pinchRef.current.scale * (distance / pinchRef.current.distance)));
      updatePanel(pinchRef.current.panel, (panel) => ({ ...panel, scale: nextScale }));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;

    event.preventDefault();
    const point = canvasPoint(event);
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    if (tapRef.current && Math.hypot(point.x - tapRef.current.x, point.y - tapRef.current.y) > 18) {
      tapRef.current.moved = true;
    }
    dragRef.current = { ...drag, x: point.x, y: point.y };

    updatePanel(drag.panel, (panel) => ({
      ...panel,
      offsetX: panel.offsetX + dx,
      offsetY: panel.offsetY + dy,
    }));
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    const tap = tapRef.current;
    pointersRef.current.delete(event.pointerId);
    dragRef.current = null;
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      interactionActiveRef.current = false;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (tap && !tap.moved && pointersRef.current.size === 0) {
      openUpload(tap.panel);
    }
    tapRef.current = null;
  }

  function handleWheel(event: WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const point = canvasPoint(event);
    const panel = panelFromY(point.y);
    if (template === 'color-note' && panel === 'top') return;
    const targetPanel = template === 'color-note' ? 'bottom' : panel;
    const activePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;

    if (!activePanels?.[targetPanel].image) return;

    updatePanel(targetPanel, (current) => ({
      ...current,
      scale: Math.min(3, Math.max(1, current.scale + (event.deltaY > 0 ? -0.06 : 0.06))),
    }));
  }

  function downloadPoster() {
    if (batchActive && batchPosters.length) {
      setDownloadMenuOpen((current) => !current);
      return;
    }

    downloadCurrentPoster();
  }

  function cycleActiveFont() {
    if (template === 'color-note') {
      setColorCardFontIndex((current) => (current + 1) % colorCardFontOptions.length);
      return;
    }
    setFontIndex((current) => (current + 1) % fontOptions.length);
  }

  if (mode === 'batch-group') {
    const batchGroupSize = template === 'color-note' ? 1 : 2;
    const groups = Array.from({ length: Math.ceil(batchAssets.length / batchGroupSize) }, (_, index) => index * batchGroupSize);

    return (
      <main className="min-h-dvh bg-[#202020] px-4 py-[calc(18px+env(safe-area-inset-top))] text-white">
        <section className="relative mx-auto flex min-h-[calc(100dvh-36px)] w-full max-w-[430px] flex-col">
          <header className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode('single')}
              className="h-10 px-2 text-[15px] font-bold text-white/80"
            >
              返回
            </button>
            <div className="text-center">
              <h1 className="text-[18px] font-black leading-none">批量分组</h1>
              <p className="mt-1 text-[12px] font-bold text-white/45">{batchAssets.length} 张图片</p>
            </div>
            <button
              type="button"
              onClick={completeBatch}
              disabled={!batchAssets.length}
              className="h-10 px-2 text-[15px] font-black text-white disabled:text-white/30"
            >
              完成
            </button>
          </header>

          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-none absolute left-3 right-3 top-[58px] z-30 rounded-full border border-white/16 bg-[#f1f1f1] px-4 py-2 text-center text-[13px] font-black text-[#202020] shadow-[0_16px_36px_rgba(0,0,0,0.32)] transition duration-200 ${
              batchTipVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
            }`}
          >
            {batchTip}
          </div>

          <div className="flex-1 overflow-y-auto pb-3">
            <div className="grid gap-2.5">
              {groups.map((startIndex, groupIndex) => (
                <div
                  key={startIndex}
                  className={`grid items-stretch gap-2 rounded-[14px] bg-white/[0.06] p-2 ${
                    template === 'color-note' ? 'grid-cols-[42px_1fr]' : 'grid-cols-[42px_1fr_1fr]'
                  }`}
                >
                  <div className="grid place-items-center text-[12px] font-black text-white/45">#{groupIndex + 1}</div>
                  <div className="contents">
                    {Array.from({ length: batchGroupSize }, (_, offset) => startIndex + offset).map((assetIndex) => {
                      const asset = batchAssets[assetIndex];
                      if (!asset) {
                        return (
                          <button
                            key={assetIndex}
                            type="button"
                            onClick={() => batchAppendInputRef.current?.click()}
                            className="grid aspect-[4/3] place-items-center border border-dashed border-white/25 bg-white/[0.03] text-[12px] font-bold text-white/40"
                          >
                            点击上传
                          </button>
                        );
                      }

                      return (
                        <button
                          key={asset.id}
                          type="button"
                          data-batch-index={assetIndex}
                          aria-pressed={selectedBatchIndex === assetIndex}
                          aria-label={
                            selectedBatchIndex === assetIndex
                              ? `第 ${assetIndex + 1} 张，已选中。再次点击取消选择`
                              : selectedBatchIndex === null
                                ? `选择第 ${assetIndex + 1} 张`
                                : `交换到第 ${assetIndex + 1} 张`
                          }
                          onClick={() => handleBatchTileClick(assetIndex)}
                          className={`relative aspect-[4/3] touch-manipulation select-none overflow-hidden bg-white/10 text-left transition active:scale-[0.98] ${
                            selectedBatchIndex === assetIndex
                              ? 'scale-[0.98] ring-2 ring-[#e84d35]'
                              : selectedBatchIndex !== null
                                ? 'ring-1 ring-white/12'
                                : ''
                          }`}
                        >
                          <img src={asset.url} alt="" className="h-full w-full object-cover" draggable={false} />
                          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[11px] font-black text-white">
                            {assetIndex + 1}
                          </span>
                          {selectedBatchIndex === assetIndex ? (
                            <span className="absolute bottom-2 left-2 rounded-full bg-[#e84d35] px-2.5 py-1 text-[11px] font-black text-white">
                              已选中
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => batchAppendInputRef.current?.click()}
                className="grid h-16 place-items-center rounded-[14px] border border-dashed border-white/25 bg-white/[0.03] text-[14px] font-black text-white/55 active:scale-[0.99]"
              >
                继续添加图片
              </button>
            </div>
          </div>
        </section>
        <input
          ref={batchAppendInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            appendBatchFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </main>
    );
  }

  const visiblePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;

  return (
    <main className="min-h-dvh bg-[#202020] text-white">
      <section aria-label="拼图编辑器" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4">
        <button
          type="button"
          onClick={() => batchInputRef.current?.click()}
          className="absolute right-4 top-[calc(16px+env(safe-area-inset-top))] z-20 h-10 rounded-full bg-white/10 px-4 text-[14px] font-black text-white backdrop-blur active:scale-95"
        >
          批量
        </button>
        <div className="absolute left-4 top-[calc(16px+env(safe-area-inset-top))] z-20 grid grid-cols-2 overflow-hidden rounded-full bg-white/10 p-1 text-[12px] font-black text-white backdrop-blur">
          <button
            type="button"
            aria-pressed={template === 'yesbut'}
            onClick={() => setTemplate('yesbut')}
            className={`h-8 px-3 transition active:scale-95 ${template === 'yesbut' ? 'rounded-full bg-white text-[#202020]' : 'text-white/65'}`}
          >
            Y/B
          </button>
          <button
            type="button"
            aria-pressed={template === 'color-note'}
            onClick={() => setTemplate('color-note')}
            className={`h-8 px-3 transition active:scale-95 ${
              template === 'color-note' ? 'rounded-full bg-white text-[#202020]' : 'text-white/65'
            }`}
          >
            调色卡
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-start gap-8 pb-[calc(28px+env(safe-area-inset-bottom))] pt-[calc(82px+env(safe-area-inset-top))]">
          <div className="w-full">
            <div className="poster-frame relative aspect-[3/4] overflow-hidden bg-[#202020] shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
              <canvas
                ref={canvasRef}
                width={outputWidth}
                height={outputHeight}
                aria-label="拼图预览"
                className="absolute inset-0 block h-full w-full"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onWheel={handleWheel}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const point = canvasPoint(event);
                  loadFile(template === 'color-note' ? 'bottom' : panelFromY(point.y), event.dataTransfer.files[0]);
                }}
              />
              {template === 'yesbut' && !visiblePanels?.top.image ? (
                <button
                  type="button"
                  aria-label="上传上半部分图片"
                  onClick={() => openUpload('top')}
                  className="absolute inset-x-2 top-2 z-10 h-[calc(50%-8px)] border border-dashed border-[#c4c4c4] border-b-0 bg-transparent"
                />
              ) : null}
              {!visiblePanels?.bottom.image ? (
                <button
                  type="button"
                  aria-label={template === 'color-note' ? '上传调色卡图片' : '上传下半部分图片'}
                  onClick={() => openUpload('bottom')}
                  className="absolute inset-x-2 bottom-2 z-10 h-[calc(50%-8px)] border border-dashed border-[#c4c4c4] border-t-0 bg-transparent"
                />
              ) : null}
              {template === 'yesbut' && !visiblePanels?.top.image && !visiblePanels?.bottom.image ? (
                <div className="pointer-events-none absolute left-2 right-2 top-1/2 border-t border-dashed border-[#c4c4c4]" />
              ) : null}
              {template === 'color-note' ? (
                <>
                  <button
                    type="button"
                    aria-label="修改调色卡文案"
                    onClick={() => setColorNoteEditing(true)}
                    className="absolute inset-x-0 top-0 z-10 h-1/2 cursor-text bg-transparent"
                  />
                  {colorNoteEditing ? (
                    <input
                      ref={colorNoteInputRef}
                      value={colorNoteText}
                      aria-label="调色卡文案"
                      maxLength={24}
                      onChange={(event) => setColorNoteText(event.target.value)}
                      onBlur={() => setColorNoteEditing(false)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                          event.currentTarget.blur();
                        }
                      }}
                      className="absolute left-8 right-8 top-[25%] z-30 -translate-y-1/2 bg-transparent text-center text-[22px] font-bold leading-none outline-none"
                      style={{
                        color: colorToCss(colorNoteTextColor),
                        fontFamily,
                        fontWeight,
                        textShadow:
                          relativeLuminance(colorNoteTextColor) < relativeLuminance(colorNoteBaseColor)
                            ? '0 2px 5px rgba(255,255,255,0.16)'
                            : '0 2px 5px rgba(0,0,0,0.18)',
                      }}
                    />
                  ) : null}
                </>
              ) : null}
              {cropGuideVisible && hasEditableImage ? (
                <div className="absolute inset-x-3 bottom-3 z-30 rounded-[14px] border border-white/18 bg-[#202020]/88 p-3 text-white shadow-[0_16px_36px_rgba(0,0,0,0.32)] backdrop-blur">
                  <div className="text-[13px] font-black">可以直接调整裁切</div>
                  <p className="mt-1 text-[12px] font-bold leading-snug text-white/70">
                    拖动图片改变位置，双指捏合缩放。桌面端也可以滚轮缩放。
                  </p>
                  <button
                    type="button"
                    onClick={dismissCropGuide}
                    className="mt-2 h-8 rounded-full bg-white px-3 text-[12px] font-black text-[#202020] active:scale-[0.98]"
                  >
                    知道了
                  </button>
                </div>
              ) : null}
            </div>
            {batchActive && batchOutputs.length ? (
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {batchOutputs.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    aria-label={`查看第 ${index + 1} 张`}
                    onClick={() => {
                      setCurrentBatchIndex(index);
                      setDownloadMenuOpen(false);
                    }}
                    className={`h-[54px] w-[41px] shrink-0 overflow-hidden bg-[#f1f1f1] transition ${
                      currentBatchIndex === index ? 'ring-2 ring-inset ring-white' : 'opacity-55'
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="w-full">
            <div className="poster-frame flex items-center justify-between">
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  fontCyclePointerRef.current = true;
                  cycleActiveFont();
                  window.setTimeout(() => {
                    fontCyclePointerRef.current = false;
                  }, 350);
                }}
                onClick={() => {
                  if (fontCyclePointerRef.current) return;
                  cycleActiveFont();
                }}
                aria-label={`切换字体：${activeFontOption.label}`}
                className="grid h-[50px] w-[50px] place-items-center rounded-full bg-[#e0e0e0] text-[24px] font-black leading-none text-black shadow-[0_14px_30px_rgba(0,0,0,0.24)] active:scale-95"
              >
                Aa
              </button>
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={addEmptyBatchPoster}
                  aria-label="添加空拼图"
                  className="grid h-[50px] w-[50px] place-items-center rounded-full bg-[#e0e0e0] text-black shadow-[0_14px_30px_rgba(0,0,0,0.24)] active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                    <path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"></path>
                  </svg>
                </button>
                <div className="relative">
                  {downloadMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="下载选项"
                      className="absolute bottom-[calc(100%+10px)] right-0 z-40 w-[152px] overflow-hidden rounded-[14px] border border-white/18 bg-[#f1f1f1] text-[#202020] shadow-[0_18px_40px_rgba(0,0,0,0.34)]"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setDownloadMenuOpen(false);
                          downloadCurrentPoster();
                        }}
                        className="block h-11 w-full px-4 text-left text-[13px] font-black active:bg-black/10"
                      >
                        下载当前图
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setDownloadMenuOpen(false);
                          downloadAllBatchPosters();
                        }}
                        className="block h-11 w-full border-t border-black/10 px-4 text-left text-[13px] font-black active:bg-black/10"
                      >
                        下载全部 {batchPosters.length} 张
                      </button>
                    </div>
                  ) : null}
                  <button
                    id="downloadButton"
                    type="button"
                    onClick={downloadPoster}
                    aria-label={batchActive ? '打开下载选项' : '下载当前图'}
                    aria-haspopup={batchActive && batchPosters.length ? 'menu' : undefined}
                    aria-expanded={batchActive && batchPosters.length ? downloadMenuOpen : undefined}
                    className="grid h-[50px] w-[50px] place-items-center rounded-full bg-[#e0e0e0] text-black shadow-[0_16px_34px_rgba(0,0,0,0.28)] active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <path d="M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <input
        ref={topInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          loadFile('top', event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={bottomInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          loadFile('bottom', event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={batchInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          loadBatchFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={batchAppendInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          appendBatchFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </main>
  );
}
