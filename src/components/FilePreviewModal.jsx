import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

export default function FilePreviewModal({ isOpen, onClose, file }) {
  if (!isOpen || !file) return null;

  // Проверяем тип файла (картинка или PDF)
  const isImage = file.type?.startsWith('image/') || file.name.match(/\.(jpeg|jpg|gif|png|bmp|svg)$/i);
  const isPdf = file.type === 'application/pdf' || file.name.match(/\.pdf$/i);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div 
        className="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        {/* Шапка модалки */}
        <div className="flex justify-between items-center px-4 py-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate pr-4">{file.name}</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Контент (картинка или PDF) */}
        <div className="flex-1 bg-gray-200 dark:bg-black overflow-hidden relative flex items-center justify-center">
          
          {isImage && (
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={5}
              centerOnInit={true}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  {/* Кнопки управления зумом */}
                  <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white/80 dark:bg-gray-800/80 p-1.5 rounded-lg shadow-sm backdrop-blur">
                    <button onClick={() => zoomIn()} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-200" title="Приблизить">
                      <ZoomIn size={20} />
                    </button>
                    <button onClick={() => zoomOut()} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-200" title="Отдалить">
                      <ZoomOut size={20} />
                    </button>
                    <button onClick={() => resetTransform()} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-200" title="Сбросить">
                      <RotateCcw size={20} />
                    </button>
                  </div>

                  <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full flex items-center justify-center">
                    <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain select-none" />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          )}
          
          {isPdf && (
            <iframe 
              src={`${file.url}#toolbar=0`} 
              className="w-full h-full border-0" 
              title={file.name}
            />
          )}

          {!isImage && !isPdf && (
            <div className="text-center text-gray-500">
              <p>Предпросмотр для этого формата недоступен.</p>
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline mt-2 inline-block">
                Скачать файл
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}