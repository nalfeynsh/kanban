import { X, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

export default function FilePreviewModal({ isOpen, onClose, file }) {
  if (!isOpen || !file) return null;

  const isImage = file.type?.startsWith('image/') || /\.(jpeg|jpg|gif|png|bmp|svg|webp)$/i.test(file.name || '');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

  return (
    <div
      className="modal-overlay !z-[80] !bg-slate-950/70"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-300/50 px-4 py-3 dark:border-white/10">
          <h3 className="truncate pr-4 text-sm font-semibold text-slate-800 dark:text-slate-100">{file.name}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <a href={file.url} download={file.name} className="glass-btn !p-2" title="Скачать">
              <Download size={16} />
            </a>
            <button type="button" onClick={onClose} className="glass-btn !p-2" title="Закрыть">
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-900/30 dark:bg-black/40">
          {isImage && (
            <TransformWrapper initialScale={1} minScale={0.4} maxScale={6} centerOnInit>
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 rounded-xl border border-slate-300/50 bg-white/60 p-1.5 backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
                    <button type="button" onClick={() => zoomIn()} className="rounded-lg p-1.5 text-slate-700 transition hover:bg-white/70 dark:text-slate-200 dark:hover:bg-white/10" title="Приблизить">
                      <ZoomIn size={18} />
                    </button>
                    <button type="button" onClick={() => zoomOut()} className="rounded-lg p-1.5 text-slate-700 transition hover:bg-white/70 dark:text-slate-200 dark:hover:bg-white/10" title="Отдалить">
                      <ZoomOut size={18} />
                    </button>
                    <button type="button" onClick={() => resetTransform()} className="rounded-lg p-1.5 text-slate-700 transition hover:bg-white/70 dark:text-slate-200 dark:hover:bg-white/10" title="Сбросить масштаб">
                      <RotateCcw size={18} />
                    </button>
                  </div>

                  <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full flex items-center justify-center">
                    <img src={file.url} alt={file.name} className="max-h-full max-w-full object-contain select-none" />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          )}

          {isPdf && (
            <iframe src={`${file.url}#toolbar=0`} className="h-full w-full border-0" title={file.name} />
          )}

          {!isImage && !isPdf && (
            <div className="p-8 text-center text-sm text-slate-300">
              <p>Предпросмотр для этого формата недоступен.</p>
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="glass-btn mt-3 !text-xs">
                Скачать файл
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
