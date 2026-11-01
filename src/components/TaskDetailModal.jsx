import { useState, useEffect } from 'react';
import { X, Calendar, AlignLeft, Check, Trash2, Copy, User, Clock, Link as LinkIcon, Plus, Paperclip, FileText, Loader2, Eye } from 'lucide-react';
import TipTapEditor from './TipTapEditor';
import FilePreviewModal from './FilePreviewModal'; // <-- Импортируем новую модалку
import { supabase } from '../supabaseClient';

export default function TaskDetailModal({ isOpen, onClose, task, onSaveTask, onDeleteTask, allProfiles = [] }) {
  const [editedTask, setEditedTask] = useState(null);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Состояния для предпросмотра файла
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (task) {
      setEditedTask({
        id: task.id || null,
        title: task.title || '',
        description: task.description || '',
        date: task.date || '',
        links: Array.isArray(task.links) ? task.links : [],
        files: Array.isArray(task.files) ? task.files : [],
        column_id: task.column_id,
        created_at: task.created_at,
        created_by: task.created_by
      });
      setIsCopied(false);
      setNewLinkTitle('');
      setNewLinkUrl('');
    }
  }, [task]);

  useEffect(() => {
    if (!task || !task.created_by) {
      setAuthorProfile(null);
      return;
    }
    const foundInList = allProfiles.find(p => p.id === task.created_by);
    if (foundInList) {
      setAuthorProfile(foundInList);
    } else {
      const fetchAuthor = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', task.created_by).maybeSingle();
        if (data) setAuthorProfile(data);
      };
      fetchAuthor();
    }
  }, [task, allProfiles]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCancel();
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !editedTask) return null;

  const isNewTask = !editedTask.id;

  const handleCancel = () => {
    onClose();
  };

  const handleSave = () => {
    if (!editedTask.title.trim()) {
      alert('Название задачи не может быть пустым');
      return;
    }
    onSaveTask(editedTask, editedTask.column_id);
  };

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;
    let formattedUrl = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = `https://${formattedUrl}`;
    const newLink = { id: Date.now().toString(), title: newLinkTitle.trim() || formattedUrl, url: formattedUrl };
    setEditedTask({ ...editedTask, links: [...editedTask.links, newLink] });
    setNewLinkTitle('');
    setNewLinkUrl('');
  };

  const handleRemoveLink = (linkId) => {
    setEditedTask({ ...editedTask, links: editedTask.links.filter(l => l.id !== linkId) });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('task-files').upload(fileName, file);
    if (uploadError) {
      alert("Не удалось загрузить файл: " + uploadError.message);
      setIsUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('task-files').getPublicUrl(fileName);
    const newFile = { id: Date.now().toString(), name: file.name, url: urlData.publicUrl, type: file.type };
    setEditedTask({ ...editedTask, files: [...editedTask.files, newFile] });
    setIsUploading(false);
  };

  const handleRemoveFile = (fileId) => {
    setEditedTask({ ...editedTask, files: editedTask.files.filter(f => f.id !== fileId) });
  };

  // Функция для открытия предпросмотра
  const handlePreviewFile = (file) => {
    // Проверяем, можно ли предпросмотреть (картинка или PDF)
    const isImage = file.type?.startsWith('image/') || file.name.match(/\.(jpeg|jpg|gif|png|bmp|svg)$/i);
    const isPdf = file.type === 'application/pdf' || file.name.match(/\.pdf$/i);
    
    if (isImage || isPdf) {
      setPreviewFile(file);
      setIsPreviewOpen(true);
    } else {
      // Для Word, Excel и других — скачиваем
      window.open(file.url, '_blank');
    }
  };

  const createdDate = editedTask.created_at 
    ? new Date(editedTask.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Только что';

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleCancel}>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl p-6 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          
          <div className="flex justify-between items-start mb-2 gap-4">
            <input
              type="text"
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              className="text-xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 outline-none w-full pb-1 transition-colors"
              placeholder="Название задачи"
              autoFocus={isNewTask}
            />
            <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mt-1">
              <X size={24} />
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            {authorProfile ? (
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style={{ backgroundColor: authorProfile.color || '#3b82f6' }}>
                  {authorProfile.full_name?.charAt(0) || '?'}
                </div>
                <span>Автор: {authorProfile.full_name}</span>
              </div>
            ) : (
              !isNewTask && <span>Автор: Загрузка...</span>
            )}
            <div className="flex items-center gap-1.5">
              <Clock size={14} />
              <span>Создано: {createdDate}</span>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                  <AlignLeft size={18} /> <span>Описание</span>
                </div>
                {(editedTask.description || editedTask.links.length > 0 || editedTask.files.length > 0) && (
                  <button onClick={async () => {
                    const tempDiv = document.createElement("div");
                    tempDiv.innerHTML = editedTask.description;
                    tempDiv.querySelectorAll('p, h1, h2, h3, li, br').forEach(el => el.insertAdjacentText('afterend', '\n'));
                    const text = tempDiv.textContent || "";
                    await navigator.clipboard.writeText(`${editedTask.title}\n\n${text.trim()}`);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }} className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors">
                    {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {isCopied ? 'Скопировано' : 'Копировать всё'}
                  </button>
                )}
              </div>
              
              <TipTapEditor 
                key={editedTask.id || 'new'} 
                content={editedTask.description} 
                onChange={(html) => setEditedTask({ ...editedTask, description: html })}
              />

              {/* Ссылки */}
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium mb-3">
                  <LinkIcon size={18} /> <span>Ссылки</span>
                </div>
                {editedTask.links.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {editedTask.links.map((link) => (
                      <li key={link.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[250px]">{link.title}</a>
                        <button onClick={() => handleRemoveLink(link.id)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 items-center">
                  <input type="text" placeholder="Название" value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                  <input type="url" placeholder="URL (https://...)" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} className="flex-[2] px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }} />
                  <button onClick={handleAddLink} className="p-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300"><Plus size={18} /></button>
                </div>
              </div>

              {/* Файлы */}
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium mb-3">
                  <Paperclip size={18} /> <span>Файлы</span>
                </div>
                {editedTask.files.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {editedTask.files.map((file) => (
                      <li key={file.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 group">
                        <div className="flex items-center gap-2 truncate max-w-[250px]">
                          <FileText size={16} className="text-gray-400" />
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Кнопка просмотра для картинок и PDF */}
                          {(file.type?.startsWith('image/') || file.type === 'application/pdf' || file.name.match(/\.(jpeg|jpg|gif|png|bmp|svg|pdf)$/i)) && (
                            <button onClick={() => handlePreviewFile(file)} className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Просмотреть">
                              <Eye size={16} />
                            </button>
                          )}
                          <button onClick={() => handleRemoveFile(file.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><X size={16} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div>
                  <input type="file" id="file-upload" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                  <label htmlFor="file-upload" className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${isUploading ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40'}`}>
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                    {isUploading ? 'Загрузка...' : 'Прикрепить файл'}
                  </label>
                </div>
              </div>
            </div>

            <div className="w-48 space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1"><Calendar size={14} /> Дата</div>
                <input type="date" value={editedTask.date || ''} onChange={(e) => setEditedTask({ ...editedTask, date: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={handleSave} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors mt-4">
                <Check size={16} /> {isNewTask ? 'Создать' : 'Готово'}
              </button>
              {!isNewTask && (
                <button onClick={() => onDeleteTask(editedTask.id)} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-lg transition-colors">
                  <Trash2 size={16} /> Удалить задачу
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Модалка предпросмотра файла */}
      <FilePreviewModal 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />
    </>
  );
}