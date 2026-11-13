import { useCallback, useEffect, useMemo, useState } from 'react';
import ChatView from './ChatView';
import {
  ensureTeamChat,
  fetchChatCandidates,
  fetchDialogs,
  fetchMessages,
  isChatSchemaMissing,
  markDialogRead,
  openDialog,
  sendMessage,
  subscribeToMessages,
  deleteChatMessage,
  uploadChatFile,
  MAX_CHAT_FILE_SIZE,
} from '../lib/chat';

export default function ChatModal({
  isOpen,
  onClose,
  currentUserId,
  members = [],
  peerId = null,
  initialConversationId = null,
  initialDraft = '',
  onOpenProfile,
  onOpenTask,
  onUnreadChange,
  onActiveChange,
}) {
  const [dialogs, setDialogs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingDialogs, setLoadingDialogs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [teamUnavailable, setTeamUnavailable] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);

  const profilesById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const selectDialog = useCallback(async (conversationId) => {
    setActiveId(conversationId);
    onActiveChange?.(conversationId);
    setLoadingMessages(true);
    setError('');

    const { messages: rows, error: loadError } = await fetchMessages(conversationId);
    setMessages(rows);
    setLoadingMessages(false);

    if (loadError) {
      setSchemaMissing(isChatSchemaMissing(loadError));
      setError(loadError.message);
      return;
    }

    await markDialogRead(conversationId);
    setDialogs((prev) =>
      prev.map((dialog) =>
        dialog.conversation_id === conversationId ? { ...dialog, unread: 0 } : dialog,
      ),
    );
  }, [onActiveChange]);

  // Загрузка списка диалогов + опционально открытие диалога с сотрудником
  useEffect(() => {
    let alive = true;

    (async () => {
      const { error: teamError } = await ensureTeamChat();
      if (!alive) return;
      if (teamError) setTeamUnavailable(true);

      const { dialogs: list, error: loadError } = await fetchDialogs();
      if (!alive) return;

      if (loadError) {
        setSchemaMissing(isChatSchemaMissing(loadError));
        setError(loadError.message);
        setLoadingDialogs(false);
        return;
      }

      setDialogs(list);
      setLoadingDialogs(false);

      if (peerId) {
        const { conversationId, error: openError } = await openDialog(peerId);
        if (!alive) return;
        if (openError) {
          setError(openError.message);
          return;
        }
        await selectDialog(conversationId);
        return;
      }

      if (initialConversationId) {
        await selectDialog(initialConversationId);
        return;
      }

      // Без указанного сотрудника открываем общий чат команды
      const team = list.find((dialog) => dialog.is_team);
      if (team) await selectDialog(team.conversation_id);
    })();

    return () => {
      alive = false;
    };
  }, [peerId, initialConversationId, selectDialog]);

  // Список собеседников: только зарегистрированные пользователи (RPC 006)
  useEffect(() => {
    let alive = true;

    (async () => {
      const { candidates: list, error: loadError } = await fetchChatCandidates();
      if (!alive) return;

      if (loadError) {
        // Миграция 006 не применена — показываем профили из команды
        setCandidates(members.filter((member) => member.is_active !== false));
      } else {
        setCandidates(list);
      }
      setLoadingCandidates(false);
    })();

    return () => {
      alive = false;
    };
  }, [members]);

  // Realtime-подписка на активный диалог
  useEffect(() => {
    if (!isOpen || !activeId) return undefined;

    return subscribeToMessages(activeId, (row) => {
      setMessages((prev) => (prev.some((message) => message.id === row.id) ? prev : [...prev, row]));
      markDialogRead(activeId);
    });
  }, [isOpen, activeId]);

  // Сумма непрочитанных для бейджа в шапке
  useEffect(() => {
    const total = dialogs.reduce((sum, dialog) => sum + (Number(dialog.unread) || 0), 0);
    onUnreadChange?.(total);
  }, [dialogs, onUnreadChange]);

  if (!isOpen) return null;

  const handleSend = async (text) => {
    if (!activeId || sending) return;

    setSending(true);
    setError('');

    const optimistic = {
      id: `tmp-${Date.now()}`,
      body: text,
      author_id: currentUserId,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const { message, error: sendError } = await sendMessage(activeId, text, currentUserId);

    if (sendError) {
      setMessages((prev) => prev.filter((item) => item.id !== optimistic.id));
      setError(sendError.message);
      setSending(false);
      return;
    }

    setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? message : item)));

    const { dialogs: list } = await fetchDialogs();
    if (list.length > 0) setDialogs(list);

    setSending(false);
  };

  /** Отправка файлов: каждый файл — отдельное сообщение с вложением */
  const handleSendFiles = async (files) => {
    if (!activeId || sending || !files?.length) return;

    setSending(true);
    setError('');

    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > MAX_CHAT_FILE_SIZE) {
        setError(`«${file.name}» больше 20 МБ — такой файл не отправить.`);
        continue;
      }

      const { path, error: uploadError } = await uploadChatFile({
        conversationId: activeId,
        userId: currentUserId,
        file,
      });

      if (uploadError) {
        setError(
          /bucket|not found|does not exist/i.test(uploadError.message || '')
            ? 'Хранилище для файлов ещё не создано — примените миграцию 009.'
            : `Файл не загружен: ${uploadError.message}`,
        );
        break;
      }

      const optimistic = {
        id: `tmp-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        body: file.name,
        author_id: currentUserId,
        created_at: new Date().toISOString(),
        pending: true,
        attachment_path: path,
        attachment_name: file.name,
        attachment_type: file.type || null,
        attachment_size: file.size,
      };
      setMessages((prev) => [...prev, optimistic]);

      const { message, error: sendError } = await sendMessage(activeId, file.name, currentUserId, {
        path,
        name: file.name,
        type: file.type,
        size: file.size,
      });

      if (sendError) {
        setMessages((prev) => prev.filter((item) => item.id !== optimistic.id));
        setError(
          /attachment_|schema cache|does not exist/i.test(sendError.message || '')
            ? 'В базе нет полей для файлов — примените миграцию 009.'
            : sendError.message,
        );
        break;
      }

      setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? message : item)));
    }

    const { dialogs: list } = await fetchDialogs();
    if (list.length > 0) setDialogs(list);
    setSending(false);
  };

  const handleDeleteMessage = async (message) => {
    setError('');
    const { error: deleteError } = await deleteChatMessage(message);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessages((prev) => prev.filter((item) => item.id !== message.id));
    const { dialogs: list } = await fetchDialogs();
    if (list.length > 0) setDialogs(list);
  };

  /** Пересылка: копируем сообщение (и ссылку на файл) в другой диалог */
  const handleForwardMessage = async (message, target) => {
    setError('');
    let conversationId = target?.conversationId || null;

    if (!conversationId && target?.memberId) {
      const { conversationId: openedId, error: openError } = await openDialog(target.memberId);
      if (openError) {
        setError(openError.message);
        return;
      }
      conversationId = openedId;
    }
    if (!conversationId) return;

    const attachment = message.attachment_path
      ? {
          path: message.attachment_path,
          name: message.attachment_name,
          type: message.attachment_type,
          size: message.attachment_size,
        }
      : null;

    const { error: forwardError } = await sendMessage(
      conversationId,
      message.body || message.attachment_name || 'Файл',
      currentUserId,
      attachment,
    );

    if (forwardError) {
      setError(forwardError.message);
      return;
    }

    const { dialogs: list } = await fetchDialogs();
    if (list.length > 0) setDialogs(list);
    await selectDialog(conversationId);
  };

  const handleOpenProfile = (peer) => {
    const full = profilesById.get(peer.id);
    onOpenProfile?.(full || peer);
  };

  const handleStartDialog = async (memberId) => {
    setError('');
    const { conversationId, error: openError } = await openDialog(memberId);
    if (openError) {
      setError(openError.message);
      return;
    }

    const { dialogs: list } = await fetchDialogs();
    if (list.length > 0) setDialogs(list);

    await selectDialog(conversationId);
  };

  return (
    <ChatView
      dialogs={dialogs}
      activeId={activeId}
      messages={messages}
      candidates={candidates}
      profilesById={profilesById}
      currentUserId={currentUserId}
      loadingDialogs={loadingDialogs}
      loadingMessages={loadingMessages}
      loadingCandidates={loadingCandidates}
      sending={sending}
      error={error}
      schemaMissing={schemaMissing}
      teamUnavailable={teamUnavailable}
      initialConversationId={initialConversationId}
      initialDraft={initialDraft}
      onSelect={(dialog) => selectDialog(dialog.conversation_id)}
      onSend={handleSend}
      onSendFiles={handleSendFiles}
      onDeleteMessage={handleDeleteMessage}
      onForwardMessage={handleForwardMessage}
      onClose={onClose}
      onOpenProfile={handleOpenProfile}
      onOpenTask={onOpenTask}
      onStartDialog={handleStartDialog}
    />
  );
}
