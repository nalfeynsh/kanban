import { useCallback, useEffect, useMemo, useState } from 'react';
import ChatView from './ChatView';
import {
  ensureTeamChat,
  fetchDialogs,
  fetchMessages,
  isChatSchemaMissing,
  markDialogRead,
  openDialog,
  sendMessage,
  subscribeToMessages,
} from '../lib/chat';

export default function ChatModal({
  isOpen,
  onClose,
  currentUserId,
  members = [],
  peerId = null,
  onOpenProfile,
  onUnreadChange,
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

  const profilesById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const selectDialog = useCallback(async (conversationId) => {
    setActiveId(conversationId);
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
  }, []);

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

      // Без указанного сотрудника открываем общий чат команды
      const team = list.find((dialog) => dialog.is_team);
      if (team) await selectDialog(team.conversation_id);
    })();

    return () => {
      alive = false;
    };
  }, [peerId, selectDialog]);

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
      members={members}
      profilesById={profilesById}
      currentUserId={currentUserId}
      loadingDialogs={loadingDialogs}
      loadingMessages={loadingMessages}
      sending={sending}
      error={error}
      schemaMissing={schemaMissing}
      teamUnavailable={teamUnavailable}
      onSelect={(dialog) => selectDialog(dialog.conversation_id)}
      onSend={handleSend}
      onClose={onClose}
      onOpenProfile={handleOpenProfile}
      onStartDialog={handleStartDialog}
    />
  );
}
