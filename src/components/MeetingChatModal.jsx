import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import Avatar from './Avatar';
import { supabase } from '../supabaseClient';
import { formatDue } from '../lib/format';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

function safeFileName(name) {
  return String(name || 'file')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(-120);
}

export default function MeetingChatModal({ meeting, currentUserId, members = [], onClose }) {
  const [messages, setMessages] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const signAttachments = useCallback(async (rows) => {
    const paths = [...new Set(rows.map((row) => row.attachment_path).filter(Boolean))];
    if (paths.length === 0) return;
    const next = {};
    for (const path of paths) {
      const { data, error: signError } = await supabase.storage
        .from('meeting-files')
        .createSignedUrl(path, 3600);
      if (!signError && data?.signedUrl) next[path] = data.signedUrl;
    }
    if (Object.keys(next).length > 0) {
      setSignedUrls((prev) => ({ ...prev, ...next }));
    }
  }, []);

  const loadMessages = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('meeting_messages')
      .select('*')
      .eq('meeting_id', meeting.id)
      .order('created_at', { ascending: true });
    if (loadError) {
      setError(`Чат не загружен: ${loadError.message}`);
      setLoading(false);
      return;
    }
    setMessages(data ?? []);
    setLoading(false);
    await signAttachments(data ?? []);
  }, [meeting.id, signAttachments]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    const channel = supabase
      .channel(`meeting-chat-${meeting.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meeting_messages', filter: `meeting_id=eq.${meeting.id}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((message) => message.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          signAttachments([payload.new]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meeting.id, signAttachments]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const addFiles = (selected) => {
    const incoming = [...selected];
    if (incoming.length === 0) return;
    if (incoming.some((file) => file.size > MAX_FILE_SIZE)) {
      setError(`Файл больше ${formatSize(MAX_FILE_SIZE)}`);
      return;
    }
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
    setError('');
  };

  const handleSend = async () => {
    const text = body.trim();
    if (!text && files.length === 0) return;
    setSending(true);
    setError('');

    const uploaded = [];
    try {
      for (const file of files) {
        const path = `${meeting.id}/${currentUserId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from('meeting-files')
          .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push({ file, path });
      }

      const rows = [];
      if (uploaded.length === 0) {
        rows.push({ meeting_id: meeting.id, author_id: currentUserId, body: text });
      } else {
        uploaded.forEach((item, index) => {
          rows.push({
            meeting_id: meeting.id,
            author_id: currentUserId,
            body: index === 0 ? text : '',
            attachment_path: item.path,
            attachment_name: item.file.name,
            attachment_type: item.file.type || '',
            attachment_size: item.file.size,
          });
        });
      }

      const { error: insertError } = await supabase.from('meeting_messages').insert(rows);
      if (insertError) throw insertError;

      setBody('');
      setFiles([]);
      await loadMessages();
    } catch (sendError) {
      setError(`Не удалось отправить: ${sendError.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (message) => {
    if (!window.confirm('Удалить сообщение?')) return;
    const { error: deleteError } = await supabase.from('meeting_messages').delete().eq('id', message.id);
    if (deleteError) {
      setError(`Не удалось удалить: ${deleteError.message}`);
      return;
    }
    if (message.attachment_path) {
      await supabase.storage.from('meeting-files').remove([message.attachment_path]);
    }
    setMessages((prev) => prev.filter((item) => item.id !== message.id));
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return createPortal(
    <div className="modal-overlay !z-[85]">
      <div className="modal-panel glass-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <MessageCircle size={18} className="text-indigo-500 dark:text-indigo-300" />
              Чат встречи
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{meeting.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-slim min-h-[280px] flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Загрузка сообщений…
            </p>
          ) : messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/70 px-5 py-10 text-center dark:border-white/15">
              <MessageCircle size={24} className="mx-auto text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Сообщений пока нет</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Напишите первым — история сохранится у участников встречи.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const author = memberById.get(message.author_id);
              const mine = message.author_id === currentUserId;
              const isImage = String(message.attachment_type || '').startsWith('image/');
              const url = message.attachment_path ? signedUrls[message.attachment_path] : null;
              return (
                <div key={message.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  <Avatar
                    name={author?.full_name}
                    color={author?.color}
                    src={author?.avatar_url}
                    className="h-7 w-7 shrink-0 text-[0.55rem]"
                  />
                  <div className={`min-w-0 max-w-[82%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className="mb-0.5 flex items-center gap-1.5 text-[0.62rem] text-slate-400 dark:text-slate-500">
                      <span className="font-medium text-slate-500 dark:text-slate-400">
                        {mine ? 'Вы' : author?.full_name || 'Сотрудник'}
                      </span>
                      <span>{formatDue(message.created_at)}</span>
                      {mine && (
                        <button
                          type="button"
                          onClick={() => handleDelete(message)}
                          className="rounded p-0.5 transition hover:bg-rose-500/10 hover:text-rose-500"
                          title="Удалить сообщение"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                    <div
                      className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        mine
                          ? 'rounded-tr-sm bg-indigo-500/15 text-slate-800 dark:text-slate-100'
                          : 'rounded-tl-sm bg-white/65 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                      }`}
                    >
                      {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
                      {message.attachment_path && (
                        <div className={message.body ? 'mt-2' : ''}>
                          {isImage && url ? (
                            <button
                              type="button"
                              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                              className="block overflow-hidden rounded-xl border border-slate-300/50 dark:border-white/10"
                              title="Открыть изображение"
                            >
                              <img
                                src={url}
                                alt={message.attachment_name || 'Изображение'}
                                loading="lazy"
                                className="max-h-56 max-w-full object-contain"
                              />
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 rounded-xl border border-slate-300/60 bg-white/60 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5">
                              {isImage ? (
                                <ImageIcon size={16} className="shrink-0 text-sky-500" />
                              ) : (
                                <FileText size={16} className="shrink-0 text-indigo-500" />
                              )}
                              <span className="min-w-0 flex-1 truncate text-[0.68rem] text-slate-700 dark:text-slate-200">
                                {message.attachment_name || 'Файл'}
                              </span>
                              <span className="shrink-0 text-[0.6rem] text-slate-400">
                                {formatSize(message.attachment_size)}
                              </span>
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 rounded p-1 text-indigo-500 hover:bg-indigo-500/10"
                                  title="Скачать файл"
                                >
                                  <Download size={13} />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-300/50 px-4 py-3 dark:border-white/10">
          {error && (
            <p className="mb-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-[0.68rem] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {files.map((file) => (
                <span
                  key={`${file.name}-${file.lastModified}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/10 px-2 py-1 text-[0.62rem] text-indigo-700 dark:text-indigo-200"
                >
                  {file.type.startsWith('image/') ? <ImageIcon size={11} /> : <FileText size={11} />}
                  <span className="max-w-40 truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((item) => item !== file))}
                    className="rounded p-0.5 hover:bg-indigo-500/15"
                    title="Убрать файл"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files ?? []);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="glass-btn shrink-0 !px-2 !py-2"
              title="Прикрепить файл"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Сообщение встречи…"
              className="glass-input max-h-24 min-h-9 flex-1 resize-none !py-1.5 !text-xs"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!body.trim() && files.length === 0)}
              className="glass-btn glass-btn-primary shrink-0 !px-2.5 !py-2"
              title="Отправить"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="mt-1 text-[0.6rem] text-slate-400 dark:text-slate-500">
            Enter — отправить, Shift+Enter — перенос строки. До {MAX_FILES} файлов по {formatSize(MAX_FILE_SIZE)}.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
