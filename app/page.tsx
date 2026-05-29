'use client';

import { ChangeEvent, PointerEvent, WheelEvent, useEffect, useRef, useState } from 'react';

type PanelName = 'top' | 'bottom';
type AppMode = 'single' | 'batch-group';

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

const outputWidth = 1080;
const outputHeight = 1440;
const panelHeight = outputHeight / 2;
const maxSourceDimension = 2400;

const fontOptions = [
  { label: '重磅无衬线', value: 'Arial Black, Arial, sans-serif', weight: 900 },
  { label: '细体', value: 'Helvetica Neue, Avenir Next, Arial, sans-serif', weight: 300 },
  { label: '手写体', value: 'Bradley Hand, Comic Sans MS, Segoe Print, cursive', weight: 700 },
  { label: '海报窄体', value: 'Impact, Haettenschweiler, sans-serif', weight: 900 },
  { label: '复古衬线', value: 'Georgia, serif', weight: 700 },
  { label: '圆润清晰', value: 'Verdana, Geneva, sans-serif', weight: 700 },
  { label: '轻快标题', value: "'Trebuchet MS', sans-serif", weight: 800 },
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

function drawPosterToCanvas(
  canvas: HTMLCanvasElement,
  panels: Record<PanelName, PanelState>,
  fontFamily: string,
  fontWeight: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, outputWidth, outputHeight);
  drawImagePanel(ctx, 'top', panels.top);
  drawImagePanel(ctx, 'bottom', panels.bottom);
  drawLabel(ctx, 'top', 'Yes', 60, fontFamily, fontWeight);
  drawLabel(ctx, 'bottom', 'But', 60, fontFamily, fontWeight);
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

function renderBatchOutputs(posters: BatchPoster[], fontFamily: string, fontWeight: number) {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const outputs: string[] = [];
  for (const poster of posters) {
    drawPosterToCanvas(canvas, poster.panels, fontFamily, fontWeight);
    outputs.push(canvas.toDataURL('image/png'));
  }

  return outputs;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const topInputRef = useRef<HTMLInputElement | null>(null);
  const bottomInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const batchAppendInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ panel: PanelName; x: number; y: number } | null>(null);
  const tapRef = useRef<{ panel: PanelName; x: number; y: number; moved: boolean } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ panel: PanelName; distance: number; scale: number } | null>(null);
  const interactionActiveRef = useRef(false);
  const batchOutputTimerRef = useRef<number | null>(null);
  const batchTipTimerRef = useRef<number | null>(null);

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
  const [fontIndex, setFontIndex] = useState(0);
  const topText = 'Yes';
  const bottomText = 'But';
  const fontFamily = fontOptions[fontIndex].value;
  const fontWeight = fontOptions[fontIndex].weight;
  const fontSize = 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, outputWidth, outputHeight);
    const activePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;
    drawImagePanel(ctx, 'top', activePanels?.top ?? emptyPanel());
    drawImagePanel(ctx, 'bottom', activePanels?.bottom ?? emptyPanel());
    drawLabel(ctx, 'top', topText, fontSize, fontFamily, fontWeight);
    drawLabel(ctx, 'bottom', bottomText, fontSize, fontFamily, fontWeight);
  }, [batchActive, batchPosters, currentBatchIndex, panels, fontFamily, fontWeight]);

  useEffect(() => {
    if (!batchActive) return;

    if (batchOutputTimerRef.current !== null) {
      window.clearTimeout(batchOutputTimerRef.current);
    }

    batchOutputTimerRef.current = window.setTimeout(
      () => {
        setBatchOutputs(renderBatchOutputs(batchPosters, fontFamily, fontWeight));
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
  }, [batchActive, batchPosters, fontFamily, fontWeight]);

  useEffect(() => {
    return () => {
      if (batchTipTimerRef.current !== null) {
        window.clearTimeout(batchTipTimerRef.current);
      }
    };
  }, []);

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

  async function loadFile(panelName: PanelName, file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;

    const image = await loadImageFromFile(file);
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
                  [panelName]: nextPanel,
                },
              }
            : poster,
        ),
      );
      return;
    }

    setPanels((current) => ({
      ...current,
      [panelName]: nextPanel,
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
    const posters = Array.from({ length: Math.ceil(batchAssets.length / 2) }, (_, index) => {
      const assetIndex = index * 2;
      return {
        id: `poster-${Date.now()}-${index}`,
        panels: {
          top: panelFromImage(batchAssets[assetIndex]?.image ?? null),
          bottom: panelFromImage(batchAssets[assetIndex + 1]?.image ?? null),
        },
      };
    });

    setBatchPosters(posters);
    setBatchOutputs(renderBatchOutputs(posters, fontFamily, fontWeight));
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
    const link = document.createElement('a');
    link.download = `image-factory-batch-${String(index + 1).padStart(2, '0')}.png`;
    link.href = url;
    link.click();
  }

  function downloadAllBatchPosters() {
    const outputs = renderBatchOutputs(batchPosters, fontFamily, fontWeight);
    outputs.forEach((url, index) => {
      window.setTimeout(() => downloadBatchPoster(url, index), index * 120);
    });
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
    const activePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;

    if (!activePanels?.[panel].image) {
      openUpload(panel);
      return;
    }

    interactionActiveRef.current = true;
    pointersRef.current.set(event.pointerId, point);
    tapRef.current = { panel, x: point.x, y: point.y, moved: false };
    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values());
      pinchRef.current = {
        panel,
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        scale: activePanels[panel].scale,
      };
      tapRef.current = null;
      dragRef.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    dragRef.current = { panel, x: point.x, y: point.y };
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
    const activePanels = batchActive ? batchPosters[currentBatchIndex]?.panels : panels;

    if (!activePanels?.[panel].image) return;

    updatePanel(panel, (current) => ({
      ...current,
      scale: Math.min(3, Math.max(1, current.scale + (event.deltaY > 0 ? -0.06 : 0.06))),
    }));
  }

  function downloadPoster() {
    if (batchActive && batchOutputs.length) {
      downloadAllBatchPosters();
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const link = document.createElement('a');
    link.download = `image-factory-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  if (mode === 'batch-group') {
    const groups = Array.from({ length: Math.ceil(batchAssets.length / 2) }, (_, index) => index * 2);

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
                <div key={startIndex} className="grid grid-cols-[42px_1fr_1fr] items-stretch gap-2 rounded-[14px] bg-white/[0.06] p-2">
                  <div className="grid place-items-center text-[12px] font-black text-white/45">#{groupIndex + 1}</div>
                  <div className="contents">
                    {[startIndex, startIndex + 1].map((assetIndex) => {
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
          className="absolute left-4 top-[calc(16px+env(safe-area-inset-top))] z-20 h-10 rounded-full bg-white/10 px-4 text-[14px] font-black text-white backdrop-blur active:scale-95"
        >
          批量
        </button>
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
                  loadFile(panelFromY(point.y), event.dataTransfer.files[0]);
                }}
              />
              {!visiblePanels?.top.image ? (
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
                  aria-label="上传下半部分图片"
                  onClick={() => openUpload('bottom')}
                  className="absolute inset-x-2 bottom-2 z-10 h-[calc(50%-8px)] border border-dashed border-[#c4c4c4] border-t-0 bg-transparent"
                />
              ) : null}
              {!visiblePanels?.top.image && !visiblePanels?.bottom.image ? (
                <div className="pointer-events-none absolute left-2 right-2 top-1/2 border-t border-dashed border-[#c4c4c4]" />
              ) : null}
            </div>
            {batchActive && batchOutputs.length ? (
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {batchOutputs.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    aria-label={`查看第 ${index + 1} 张`}
                    onClick={() => setCurrentBatchIndex(index)}
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
                onClick={() => setFontIndex((current) => (current + 1) % fontOptions.length)}
                aria-label={`切换字体：${fontOptions[fontIndex].label}`}
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
                <button
                  id="downloadButton"
                  type="button"
                  onClick={downloadPoster}
                  aria-label={batchActive ? '下载全部 3:4 图片' : '下载 3:4 图片'}
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
