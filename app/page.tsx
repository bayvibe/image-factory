'use client';

import { ChangeEvent, DragEvent, PointerEvent, WheelEvent, useEffect, useRef, useState } from 'react';

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

function getCoverScale(image: HTMLImageElement) {
  return Math.max(outputWidth / image.width, panelHeight / image.height);
}

function getClampedPanel(panel: PanelState): PanelState {
  if (!panel.image) return panel;

  const baseScale = getCoverScale(panel.image);
  const drawWidth = panel.image.width * baseScale * panel.scale;
  const drawHeight = panel.image.height * baseScale * panel.scale;
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

  const baseScale = getCoverScale(image);
  const scale = baseScale * clamped.scale;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
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

function loadImageAsset(file: File, index: number): Promise<BatchAsset> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        id: `${Date.now()}-${index}-${file.name}`,
        image,
        name: file.name,
        url,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Cannot load image: ${file.name}`));
    };
    image.src = url;
  });
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
  const [draggedBatchIndex, setDraggedBatchIndex] = useState<number | null>(null);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number | null>(null);
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

    setBatchOutputs(renderBatchOutputs(batchPosters, fontFamily, fontWeight));
  }, [batchActive, batchPosters, fontFamily, fontWeight]);

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

  function loadFile(panelName: PanelName, file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        if (batchActive) {
          setBatchPosters((current) =>
            current.map((poster, index) =>
              index === currentBatchIndex
                ? {
                    ...poster,
                    panels: {
                      ...poster.panels,
                      [panelName]: {
                        image,
                        fileName: file.name,
                        scale: 1,
                        offsetX: 0,
                        offsetY: 0,
                      },
                    },
                  }
                : poster,
            ),
          );
          return;
        }

        setPanels((current) => ({
          ...current,
          [panelName]: {
            image,
            fileName: file.name,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
          },
        }));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
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
    setDraggedBatchIndex(null);
    setMode('batch-group');
  }

  async function appendBatchFiles(files: FileList | null) {
    const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const offset = batchAssets.length;
    const assets = await Promise.all(imageFiles.map((file, index) => loadImageAsset(file, offset + index)));
    setBatchAssets((current) => [...current, ...assets]);
    setSelectedBatchIndex(null);
    setDraggedBatchIndex(null);
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
      return;
    }

    swapBatchAssets(selectedBatchIndex, index);
    setSelectedBatchIndex(null);
  }

  function handleBatchDrop(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    if (draggedBatchIndex !== null) {
      swapBatchAssets(draggedBatchIndex, index);
    }
    setDraggedBatchIndex(null);
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
    event.currentTarget.releasePointerCapture(event.pointerId);

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
        <section className="mx-auto flex min-h-[calc(100dvh-36px)] w-full max-w-[430px] flex-col">
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

          <button
            type="button"
            onClick={() => batchAppendInputRef.current?.click()}
            className="mb-3 h-11 w-full rounded-full bg-white/10 text-[14px] font-black text-white active:scale-[0.99]"
          >
            继续添加图片
          </button>

          <div className="flex-1 overflow-y-auto pb-5">
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
                          draggable
                          onClick={() => handleBatchTileClick(assetIndex)}
                          onDragStart={() => setDraggedBatchIndex(assetIndex)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleBatchDrop(event, assetIndex)}
                          onDragEnd={() => setDraggedBatchIndex(null)}
                          className={`relative aspect-[4/3] overflow-hidden bg-white/10 text-left active:scale-[0.98] ${
                            selectedBatchIndex === assetIndex ? 'ring-2 ring-white' : ''
                          }`}
                        >
                          <img src={asset.url} alt="" className="h-full w-full object-cover" draggable={false} />
                          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[11px] font-black text-white">
                            {assetIndex + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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
        <div className="flex flex-1 flex-col items-center justify-center gap-10 pb-[calc(34px+env(safe-area-inset-bottom))] pt-[calc(34px+env(safe-area-inset-top))]">
          <div className="w-full">
            <div className="poster-frame relative aspect-[3/4] overflow-hidden bg-[#f1f1f1] shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
              <canvas
                ref={canvasRef}
                width={outputWidth}
                height={outputHeight}
                aria-label="拼图预览"
                className="block h-full w-full"
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
                <div className="pointer-events-none absolute inset-x-2 top-2 h-[calc(50%-8px)] border border-dashed border-[#c4c4c4] border-b-0" />
              ) : null}
              {!visiblePanels?.bottom.image ? (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 h-[calc(50%-8px)] border border-dashed border-[#c4c4c4] border-t-0" />
              ) : null}
              {!visiblePanels?.top.image && !visiblePanels?.bottom.image ? (
                <div className="pointer-events-none absolute left-2 right-2 top-1/2 border-t border-dashed border-[#c4c4c4]" />
              ) : null}
            </div>
            {batchActive && batchOutputs.length ? (
              <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {batchOutputs.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    aria-label={`查看第 ${index + 1} 张`}
                    onClick={() => setCurrentBatchIndex(index)}
                    className={`h-[54px] w-[41px] shrink-0 overflow-hidden bg-[#f1f1f1] transition ${
                      currentBatchIndex === index ? 'ring-2 ring-white' : 'opacity-55'
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
