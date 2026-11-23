import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Eraser,
  Frame,
  Hand,
  Image as ImageIcon,
  Link2,
  MessageSquare,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Settings2,
  Square,
  StickyNote,
  Timer,
  Trash2,
  Type,
  Undo2,
  Users,
  Vote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { supabase } from '../../supabaseClient';
import {
  addBoardComment,
  createBoardObject,
  deleteBoardComment,
  deleteBoardObject,
  fetchBoardData,
  getOrCreateBoard,
  resolveBoardComment,
  restoreBoardObject,
  toggleBoardVote,
  updateBoard,
  updateBoardObject,
  uploadBoardMedia,
} from './boardApi';

const STICKY_COLORS = ['#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa', '#e9d5ff'];
const SHAPE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const BPMN_ELEMENTS = [
  { key: 'start', label: 'Старт', width: 84, height: 84 },
  { key: 'end', label: 'Конец', width: 84, height: 84 },
  { key: 'intermediate', label: 'Событие', width: 84, height: 84 },
  { key: 'task', label: 'Задача', width: 190, height: 92 },
  { key: 'userTask', label: 'Задача пользователя', width: 190, height: 92 },
  { key: 'serviceTask', label: 'Сервисная задача', width: 190, height: 92 },
  { key: 'gatewayX', label: 'Развилка «или»', width: 116, height: 116 },
  { key: 'gatewayPlus', label: 'Развилка «и»', width: 116, height: 116 },
  { key: 'subprocess', label: 'Подпроцесс', width: 200, height: 100 },
  { key: 'dataObject', label: 'Данные', width: 120, height: 100 },
  { key: 'annotation', label: 'Комментарий', width: 190, height: 76 },
];
const REACTIONS = ['👍', '❤️', '🔥', '👏', '🎉', '🤔'];

const nowMs = () => Date.now();
const randomId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${nowMs()}-${Math.random()}`);
const randomFraction = () => Math.random();
let zCounter = 0;
const nextZ = () => {
  zCounter += 1;
  return Math.floor(nowMs() / 1000) + zCounter;
};

const TOOLS = [
  { key: 'select', label: 'Выбор', icon: MousePointer2 },
  { key: 'hand', label: 'Рука', icon: Hand },
  { key: 'sticky', label: 'Стикер', icon: StickyNote },
  { key: 'text', label: 'Текст', icon: Type },
  { key: 'shape', label: 'Фигура', icon: Square },
  { key: 'connector', label: 'Связь', icon: Link2 },
  { key: 'pen', label: 'Рисовать', icon: Pencil },
  { key: 'eraser', label: 'Ластик', icon: Eraser },
  { key: 'frame', label: 'Фрейм', icon: Frame },
  { key: 'comment', label: 'Комментарий', icon: MessageSquare },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTimer(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function BpmnShape({ object }) {
  const type = object.data?.bpmnType || 'task';
  const width = Math.max(1, object.width);
  const height = Math.max(1, object.height);
  const stroke = '#475569';
  const fill = 'rgba(248,250,252,.96)';
  if (['start', 'end', 'intermediate'].includes(type)) {
    const size = Math.min(width, height);
    const center = size / 2;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
        <circle cx={width / 2} cy={height / 2} r={Math.max(8, size / 2 - 4)} fill={type === 'start' ? '#ecfdf5' : fill} stroke={type === 'end' ? '#334155' : '#10b981'} strokeWidth={type === 'end' ? 4 : 2.5} />
        {type === 'intermediate' && (
          <circle cx={width / 2} cy={height / 2} r={Math.max(6, size / 2 - 10)} fill="none" stroke="#10b981" strokeWidth="2" />
        )}
        {type === 'start' && <circle cx={center} cy={center} r="2.5" fill="#10b981" />}
      </svg>
    );
  }
  if (type.startsWith('gateway')) {
    const symbol = type === 'gatewayPlus' ? '+' : type === 'gatewayO' ? '○' : '×';
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
        <polygon points={`${width / 2},4 ${width - 4},${height / 2} ${width / 2},${height - 4} 4,${height / 2}`} fill={fill} stroke="#f59e0b" strokeWidth="2.5" />
        <text x={width / 2} y={height / 2 + 5} textAnchor="middle" fontSize="18" fontWeight="700" fill="#b45309">{symbol}</text>
      </svg>
    );
  }
  if (type === 'dataObject') {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
        <path d={`M 10 4 H ${width - 32} L ${width - 8} 28 V ${height - 6} H 10 Z`} fill="#eff6ff" stroke="#3b82f6" strokeWidth="2" />
        <path d={`M ${width - 32} 4 V 28 H ${width - 8}`} fill="none" stroke="#3b82f6" strokeWidth="2" />
      </svg>
    );
  }
  if (type === 'annotation') {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
        <path d={`M 12 6 H 4 V ${height - 6} H 12`} fill="none" stroke="#94a3b8" strokeWidth="2" />
        <text x="18" y={height / 2 + 4} fontSize="11" fill="#64748b">Комментарий</text>
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
      <rect x="2" y="2" width={Math.max(1, width - 4)} height={Math.max(1, height - 4)} rx="10" fill={fill} stroke={type === 'subprocess' ? '#6366f1' : stroke} strokeWidth="2" />
      {type === 'userTask' && (
        <g transform={`translate(10 10) scale(.7)`} fill="none" stroke="#475569" strokeWidth="2">
          <circle cx="8" cy="5" r="3" />
          <path d="M 3 15 Q 3 9 8 9 Q 13 9 13 15" />
        </g>
      )}
      {type === 'serviceTask' && (
        <g transform={`translate(9 9)`} fill="none" stroke="#475569" strokeWidth="1.6">
          <circle cx="7" cy="7" r="3" />
          <path d="M 7 1 V 3 M 7 11 V 13 M 1 7 H 3 M 11 7 H 13 M 2.8 2.8 L 4.2 4.2 M 9.8 9.8 L 11.2 11.2 M 11.2 2.8 L 9.8 4.2 M 4.2 9.8 L 2.8 11.2" />
        </g>
      )}
      {type === 'subprocess' && (
        <g fill="none" stroke="#475569" strokeWidth="1.8">
          <rect x={width / 2 - 12} y={height - 17} width="24" height="14" rx="2" fill={fill} />
          <path d={`M ${width / 2} ${height - 14} V ${height - 6} M ${width / 2 - 5} ${height - 10} H ${width / 2 + 5}`} />
        </g>
      )}
    </svg>
  );
}

export default function WhiteboardView({ project, userId, profile, authorById, canManageProject = false }) {
  const viewportRef = useRef(null);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const objectsRef = useRef([]);
  const channelRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const drawRef = useRef(null);
  const spaceRef = useRef(false);
  const followRef = useRef(null);
  const lastCursorRef = useRef(0);
  const movedRef = useRef(false);
  const historyRef = useRef({ undo: [], redo: [] });
  const [historyTick, setHistoryTick] = useState(0);

  const [board, setBoard] = useState(null);
  const [objects, setObjects] = useState([]);
  const [comments, setComments] = useState([]);
  const [votes, setVotes] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState('select');
  const [diagramMode, setDiagramMode] = useState('free');
  const [bpmnKind, setBpmnKind] = useState('task');
  const [shapeKind, setShapeKind] = useState('rect');
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [connectorFrom, setConnectorFrom] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [followingId, setFollowingId] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [timerEndsAt, setTimerEndsAt] = useState(null);
  const [timerNow, setTimerNow] = useState(0);
  const [spaceDown, setSpaceDown] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentPoint, setCommentPoint] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState('');
  const [uploading, setUploading] = useState(false);

  const setCameraSafe = useCallback((next) => {
    const value = typeof next === 'function' ? next(cameraRef.current) : next;
    cameraRef.current = value;
    setCamera(value);
  }, []);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  useEffect(() => {
    historyRef.current = { undo: [], redo: [] };
  }, [board?.id]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    followRef.current = followingId;
  }, [followingId]);

  const canEdit = useMemo(() => {
    if (!board) return false;
    const role = profile?.role || 'member';
    if (['admin', 'manager', 'deputy'].includes(role) || project?.owner_id === userId) return true;
    return board.edit_mode === 'all';
  }, [board, profile?.role, project?.owner_id, userId]);

  const canManage = canManageProject || ['admin', 'manager', 'deputy'].includes(profile?.role || '') || project?.owner_id === userId;

  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  const pushHistory = (action) => {
    historyRef.current.undo.push(action);
    historyRef.current.redo = [];
    setHistoryTick((value) => value + 1);
  };

  const applyHistoryAction = async (action) => {
    if (!action) return null;
    if (action.type === 'delete') {
      const object = objectsRef.current.find((item) => item.id === action.id);
      if (!object) return null;
      setObjects((prev) => prev.filter((item) => item.id !== action.id));
      await deleteBoardObject(action.id);
      return { type: 'restore', object };
    }
    if (action.type === 'restore') {
      const { object, error: restoreError } = await restoreBoardObject(action.object);
      if (restoreError || !object) {
        setError(restoreError?.message || 'Не удалось восстановить объект');
        return null;
      }
      setObjects((prev) => (prev.some((item) => item.id === object.id) ? prev : [...prev, object]));
      return { type: 'delete', id: object.id };
    }
    if (action.type === 'patch') {
      const { error: patchError } = await updateBoardObject(action.id, action.before);
      if (patchError) {
        setError(patchError.message);
        return null;
      }
      setObjects((prev) => prev.map((item) => (item.id === action.id ? { ...item, ...action.before } : item)));
      return { type: 'patch', id: action.id, before: action.after, after: action.before };
    }
    return null;
  };

  const undo = async () => {
    const action = historyRef.current.undo.pop();
    if (!action) return;
    const redoAction = await applyHistoryAction(action);
    if (redoAction) historyRef.current.redo.push(redoAction);
    setHistoryTick((value) => value + 1);
    showToast('Действие отменено');
  };

  const redo = async () => {
    const action = historyRef.current.redo.pop();
    if (!action) return;
    const undoAction = await applyHistoryAction(action);
    if (undoAction) historyRef.current.undo.push(undoAction);
    setHistoryTick((value) => value + 1);
    showToast('Действие повторено');
  };

  const deleteWithHistory = async (object) => {
    if (!object) return;
    pushHistory({ type: 'restore', object });
    setObjects((prev) => prev.filter((item) => item.id !== object.id));
    await deleteBoardObject(object.id);
    setSelectedId(null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { board: nextBoard, error: boardError } = await getOrCreateBoard(project.id);
      if (cancelled) return;
      if (boardError || !nextBoard) {
        setError(boardError?.message || 'Не удалось открыть доску');
        setLoading(false);
        return;
      }
      setBoard(nextBoard);
      const data = await fetchBoardData(nextBoard.id);
      if (cancelled) return;
      setObjects(data.objects);
      setComments(data.comments);
      setVotes(data.votes);
      if (data.error) setError(data.error.message);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    if (!board?.id) return undefined;
    const channel = supabase.channel(`team-board:${board.id}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_objects', filter: `board_id=eq.${board.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setObjects((prev) => (prev.some((item) => item.id === payload.new.id) ? prev : [...prev, payload.new]));
        } else if (payload.eventType === 'UPDATE') {
          setObjects((prev) => prev.map((item) => (item.id === payload.new.id ? { ...item, ...payload.new } : item)));
        } else if (payload.eventType === 'DELETE') {
          setObjects((prev) => prev.filter((item) => item.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_comments', filter: `board_id=eq.${board.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') setComments((prev) => (prev.some((item) => item.id === payload.new.id) ? prev : [...prev, payload.new]));
        if (payload.eventType === 'UPDATE') setComments((prev) => prev.map((item) => (item.id === payload.new.id ? payload.new : item)));
        if (payload.eventType === 'DELETE') setComments((prev) => prev.filter((item) => item.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_votes', filter: `board_id=eq.${board.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') setVotes((prev) => (prev.some((item) => item.id === payload.new.id) ? prev : [...prev, payload.new]));
        if (payload.eventType === 'DELETE') setVotes((prev) => prev.filter((item) => item.id !== payload.old.id));
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat().filter(Boolean);
        setCollaborators(users);
        const targetId = followRef.current;
        if (targetId) {
          const target = users.find((item) => item.user_id === targetId);
          if (target?.cursor && viewportRef.current) {
            const rect = viewportRef.current.getBoundingClientRect();
            setCameraSafe((prev) => ({
              ...prev,
              x: rect.width / 2 - target.cursor.x * prev.zoom,
              y: rect.height / 2 - target.cursor.y * prev.zoom,
            }));
          }
        }
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (payload?.user_id === userId) return;
        setCollaborators((prev) => {
          const next = prev.map((item) => (item.user_id === payload.user_id ? { ...item, cursor: payload.cursor } : item));
          return next.some((item) => item.user_id === payload.user_id) ? next : [...prev, payload];
        });
        if (followRef.current === payload.user_id && payload.cursor && viewportRef.current) {
          const rect = viewportRef.current.getBoundingClientRect();
          setCameraSafe((prev) => ({
            ...prev,
            x: rect.width / 2 - payload.cursor.x * prev.zoom,
            y: rect.height / 2 - payload.cursor.y * prev.zoom,
          }));
        }
      })
      .on('broadcast', { event: 'object-move' }, ({ payload }) => {
        if (!payload?.id || dragRef.current?.id === payload.id) return;
        setObjects((prev) => prev.map((item) => (item.id === payload.id ? { ...item, x: payload.x, y: payload.y } : item)));
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (!payload?.emoji) return;
        const id = `${randomId()}`;
        setReactions((prev) => [...prev, { id, ...payload, x: 30 + randomFraction() * 40, y: 60 + randomFraction() * 20 }]);
        window.setTimeout(() => setReactions((prev) => prev.filter((item) => item.id !== id)), 2600);
      })
      .on('broadcast', { event: 'timer' }, ({ payload }) => {
        setTimerNow(nowMs());
        setTimerEndsAt(payload?.endsAt || null);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            name: profile?.full_name || 'Участник',
            color: profile?.color || '#6366f1',
            avatar_url: profile?.avatar_url || null,
            cursor: null,
          });
        }
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [board?.id, profile?.color, profile?.full_name, profile?.avatar_url, setCameraSafe, userId]);

  useEffect(() => {
    if (!timerEndsAt) return undefined;
    const interval = window.setInterval(() => {
    const now = nowMs();
      setTimerNow(now);
      if (now >= timerEndsAt) setTimerEndsAt(null);
    }, 500);
    return () => window.clearInterval(interval);
  }, [timerEndsAt]);

  const screenToWorld = (clientX, clientY) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - cameraRef.current.x) / cameraRef.current.zoom,
      y: (clientY - rect.top - cameraRef.current.y) / cameraRef.current.zoom,
    };
  };

  const broadcastCursor = (event) => {
    const now = nowMs();
    if (now - lastCursorRef.current < 80) return;
    lastCursorRef.current = now;
    const world = screenToWorld(event.clientX, event.clientY);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'cursor',
      payload: {
        user_id: userId,
        name: profile?.full_name || 'Участник',
        color: profile?.color || '#6366f1',
        avatar_url: profile?.avatar_url || null,
        cursor: world,
      },
    });
  };

  const addObject = async (type, data, options = {}) => {
    if (!board || !canEdit) return null;
    const center = viewportRef.current
      ? screenToWorld(
          viewportRef.current.getBoundingClientRect().left + viewportRef.current.clientWidth / 2,
          viewportRef.current.getBoundingClientRect().top + viewportRef.current.clientHeight / 2,
        )
      : { x: 0, y: 0 };
    const object = {
      type,
      data,
      x: options.x ?? center.x - (options.width || 200) / 2,
      y: options.y ?? center.y - (options.height || 120) / 2,
      width: options.width || 200,
      height: options.height || 120,
      z: nextZ(),
    };
    const tempId = `temp-${randomId()}`;
    const optimistic = { id: tempId, board_id: board.id, ...object, created_by: userId };
    setObjects((prev) => [...prev, optimistic]);
    const { object: saved, error: createError } = await createBoardObject(board.id, object, userId);
    if (createError) {
      setObjects((prev) => prev.filter((item) => item.id !== tempId));
      setError(createError.message);
      return null;
    }
    setObjects((prev) => prev.map((item) => (item.id === tempId ? saved : item)));
    setSelectedId(saved.id);
    pushHistory({ type: 'delete', id: saved.id });
    return saved;
  };

  const saveObject = async (objectId, patch) => {
    if (!canEdit) return;
    const { object: saved, error: saveError } = await updateBoardObject(objectId, patch);
    if (saveError) setError(saveError.message);
    else if (saved) setObjects((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
  };

  const beginDrag = (event, object, mode = 'move') => {
    if (!canEdit || tool !== 'select' || object.type === 'connector') return;
    event.stopPropagation();
    setSelectedId(object.id);
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const world = screenToWorld(event.clientX, event.clientY);
    movedRef.current = false;
    dragRef.current = {
      id: object.id,
      mode,
      startX: world.x,
      startY: world.y,
      originX: object.x,
      originY: object.y,
      originWidth: object.width,
      originHeight: object.height,
      before: {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
      },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  useEffect(() => {
    const onMove = (event) => {
      if (dragRef.current) {
        const world = screenToWorld(event.clientX, event.clientY);
        const dx = world.x - dragRef.current.startX;
        const dy = world.y - dragRef.current.startY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) movedRef.current = true;
        setObjects((prev) =>
          prev.map((item) => {
            if (item.id !== dragRef.current.id) return item;
            if (dragRef.current.mode === 'resize') {
              return {
                ...item,
                width: Math.max(60, dragRef.current.originWidth + dx),
                height: Math.max(40, dragRef.current.originHeight + dy),
              };
            }
            return { ...item, x: dragRef.current.originX + dx, y: dragRef.current.originY + dy };
          }),
        );
      }
      if (panRef.current) {
        setCameraSafe({
          ...panRef.current.camera,
          x: panRef.current.camera.x + event.clientX - panRef.current.startX,
          y: panRef.current.camera.y + event.clientY - panRef.current.startY,
        });
      }
      if (drawRef.current) {
        const world = screenToWorld(event.clientX, event.clientY);
        drawRef.current.points.push(world);
        setDrawing({ points: [...drawRef.current.points], color: drawRef.current.color });
      }
    };
    const onUp = () => {
      if (dragRef.current) {
        const current = objectsRef.current.find((item) => item.id === dragRef.current.id);
        if (current && movedRef.current) {
          saveObject(current.id, { x: current.x, y: current.y, width: current.width, height: current.height });
          pushHistory({
            type: 'patch',
            id: current.id,
            before: dragRef.current.before,
            after: { x: current.x, y: current.y, width: current.width, height: current.height },
          });
          channelRef.current?.send({
            type: 'broadcast',
            event: 'object-move',
            payload: { id: current.id, x: current.x, y: current.y },
          });
        }
        dragRef.current = null;
      }
      if (panRef.current) panRef.current = null;
      if (drawRef.current) {
        const points = drawRef.current.points;
        const drawColor = drawRef.current.color || '#6366f1';
        drawRef.current = null;
        setDrawing(null);
        if (points.length > 2) {
          const xs = points.map((point) => point.x);
          const ys = points.map((point) => point.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          addObject(
            'drawing',
            {
              points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
              color: drawColor,
              strokeWidth: 3,
            },
            { x: minX, y: minY, width: Math.max(8, maxX - minX), height: Math.max(8, maxY - minY) },
          );
        }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, setCameraSafe]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.target.closest('input, textarea, [contenteditable]')) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          return;
        }
        if (key === 'y') {
          event.preventDefault();
          redo();
          return;
        }
      }
      if (event.code === 'Space' && !event.target.closest('input, textarea, [contenteditable]')) {
        spaceRef.current = true;
        setSpaceDown(true);
        event.preventDefault();
      }
      if (event.key === 'Escape') {
        setTool('select');
        setConnectorFrom(null);
        setEditingId(null);
        setSelectedId(null);
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && canEdit && !event.target.closest('input, textarea, [contenteditable]')) {
        event.preventDefault();
        const target = objectsRef.current.find((item) => item.id === selectedId);
        if (target) {
          deleteWithHistory(target);
        }
      }
    };
    const onKeyUp = (event) => {
      if (event.code === 'Space') {
        spaceRef.current = false;
        setSpaceDown(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, selectedId]);

  const handleCanvasPointerDown = async (event) => {
    stopFollowing();
    if (event.button === 1 || tool === 'hand' || spaceRef.current) {
      event.preventDefault();
      panRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        camera: cameraRef.current,
      };
      return;
    }
    if (event.target !== event.currentTarget && event.target.closest?.('[data-board-object]')) return;
    const world = screenToWorld(event.clientX, event.clientY);
    if (tool === 'select') {
      setSelectedId(null);
      return;
    }
    if (!canEdit && tool !== 'comment') return;
    if (tool === 'sticky') {
      await addObject('sticky', { text: 'Идея', color: STICKY_COLORS[objects.length % STICKY_COLORS.length] }, { x: world.x, y: world.y, width: 180, height: 140 });
      setTool('select');
      return;
    }
    if (tool === 'text') {
      await addObject('text', { text: 'Текст' }, { x: world.x, y: world.y, width: 260, height: 64 });
      setTool('select');
      return;
    }
    if (tool === 'bpmn') {
      const spec = BPMN_ELEMENTS.find((item) => item.key === bpmnKind) || BPMN_ELEMENTS[3];
      await addObject(
        'bpmn',
        { bpmnType: spec.key, text: spec.label },
        { x: world.x - spec.width / 2, y: world.y - spec.height / 2, width: spec.width, height: spec.height },
      );
      setTool('select');
      return;
    }
    if (tool === 'shape') {
      await addObject('shape', { shape: shapeKind, text: '', fill: SHAPE_COLORS[objects.length % SHAPE_COLORS.length] }, { x: world.x, y: world.y, width: 180, height: 110 });
      setTool('select');
      return;
    }
    if (tool === 'frame') {
      await addObject('frame', { title: `Фрейм ${objects.filter((item) => item.type === 'frame').length + 1}` }, { x: world.x, y: world.y, width: 640, height: 420 });
      setTool('select');
      return;
    }
    if (tool === 'pen') {
      drawRef.current = { points: [world], color: '#6366f1' };
      setDrawing({ points: [world], color: '#6366f1' });
      return;
    }
    if (tool === 'comment') {
      setCommentPoint(world);
      setShowComments(true);
      setTool('select');
    }
  };

  const handleObjectClick = async (event, object) => {
    event.stopPropagation();
    if (tool === 'vote') {
      const existing = votes.find((vote) => vote.object_id === object.id && vote.created_by === userId);
      const { error: voteError } = await toggleBoardVote(board.id, object.id, userId, Boolean(existing));
      if (voteError) setError(voteError.message);
      return;
    }
    if (!canEdit) {
      setSelectedId(object.id);
      return;
    }
    if (tool === 'eraser') {
      await deleteWithHistory(object);
      return;
    }
    if (tool === 'connector') {
      if (!connectorFrom) {
        setConnectorFrom(object.id);
      } else if (connectorFrom !== object.id) {
        await addObject('connector', { from: connectorFrom, to: object.id }, { x: 0, y: 0, width: 1, height: 1 });
        setConnectorFrom(null);
        setTool('select');
      }
      return;
    }
    setSelectedId(object.id);
  };

  const startEditing = (object) => {
    if (!canEdit) return;
    setEditingId(object.id);
    setEditValue(
      object.type === 'frame'
        ? object.data?.title || ''
        : object.data?.text || '',
    );
  };

  const saveEditing = async () => {
    if (!editingId) return;
    const object = objectsRef.current.find((item) => item.id === editingId);
    setEditingId(null);
    if (!object) return;
    const beforeData = object.data || {};
    const afterData =
      object.type === 'frame'
        ? { ...beforeData, title: editValue }
        : { ...beforeData, text: editValue };
    if (JSON.stringify(beforeData) === JSON.stringify(afterData)) return;
    pushHistory({ type: 'patch', id: object.id, before: { data: beforeData }, after: { data: afterData } });
    await saveObject(object.id, { data: afterData });
  };

  const insertBpmnTemplate = async () => {
    if (!canEdit) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const center = screenToWorld(
      (rect?.left || 0) + (rect?.width || 900) / 2,
      (rect?.top || 0) + (rect?.height || 600) / 2,
    );
    const baseX = center.x - 460;
    const baseY = center.y - 190;
    const addBpmn = (kind, text, x, y, width, height) =>
      addObject('bpmn', { bpmnType: kind, text }, { x: baseX + x, y: baseY + y, width, height });
    const start = await addBpmn('start', 'Заявка', 0, 110, 84, 84);
    const task = await addBpmn('userTask', 'Согласовать', 150, 106, 190, 92);
    const gateway = await addBpmn('gatewayX', 'Одобрено?', 410, 94, 116, 116);
    const approve = await addBpmn('task', 'Одобрить', 600, 10, 190, 92);
    const reject = await addBpmn('task', 'Отклонить', 600, 220, 190, 92);
    const endApprove = await addBpmn('end', 'Готово', 860, 14, 84, 84);
    const endReject = await addBpmn('end', 'Отказ', 860, 224, 84, 84);
    for (const [from, to] of [
      [start, task],
      [task, gateway],
      [gateway, approve],
      [gateway, reject],
      [approve, endApprove],
      [reject, endReject],
    ]) {
      if (from && to) {
        await addObject('connector', { from: from.id, to: to.id, variant: 'bpmn' }, { x: 0, y: 0, width: 1, height: 1 });
      }
    }
    setTool('select');
    showToast('BPMN-шаблон добавлен');
  };

  const handleWheel = (event) => {
    event.preventDefault();
    stopFollowing();
    if (event.ctrlKey || event.metaKey) {
      const rect = viewportRef.current.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const nextZoom = clamp(cameraRef.current.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.2, 3);
      const worldX = (px - cameraRef.current.x) / cameraRef.current.zoom;
      const worldY = (py - cameraRef.current.y) / cameraRef.current.zoom;
      setCameraSafe({ zoom: nextZoom, x: px - worldX * nextZoom, y: py - worldY * nextZoom });
    } else {
      setCameraSafe((prev) => ({ ...prev, x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
    }
  };

  const stopFollowing = () => {
    if (followRef.current) {
      followRef.current = null;
      setFollowingId(null);
    }
  };

  const focusFrame = (frameId) => {
    const frame = objectsRef.current.find((item) => item.id === frameId && item.type === 'frame');
    if (!frame || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const zoom = Math.min(1.1, Math.max(0.3, Math.min(rect.width / (frame.width + 160), rect.height / (frame.height + 160))));
    setCameraSafe({
      zoom,
      x: rect.width / 2 - (frame.x + frame.width / 2) * zoom,
      y: rect.height / 2 - (frame.y + frame.height / 2) * zoom,
    });
    setSelectedId(frame.id);
  };

  useEffect(() => {
    if (!objects.length) return;
    const params = new URLSearchParams(window.location.hash.replace(/^#whiteboard\??/, ''));
    const frameId = params.get('frame');
    if (frameId) focusFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects.length]);

  const copyFrameLink = async (frame) => {
    const url = `${window.location.origin}/#whiteboard?frame=${frame.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Ссылка на фрейм скопирована');
    } catch {
      showToast(url);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !board || !canEdit) return;
    if (!file.type.startsWith('image/')) {
      setError('Пока можно загружать только изображения.');
      return;
    }
    setUploading(true);
    const { url, error: uploadError } = await uploadBoardMedia(file, userId, board.id);
    setUploading(false);
    if (uploadError || !url) {
      setError(uploadError?.message || 'Не удалось загрузить файл');
      return;
    }
    const image = new Image();
    image.onload = () => {
      const ratio = image.height / Math.max(1, image.width);
      addObject('image', { url, name: file.name }, { width: 320, height: Math.round(320 * ratio) });
    };
    image.src = url;
  };

  const addComment = async () => {
    if (!commentDraft.trim() || !board) return;
    const { error: commentError } = await addBoardComment(board.id, commentDraft, userId, commentPoint);
    if (commentError) setError(commentError.message);
    else setCommentDraft('');
  };

  const startTimer = (minutes) => {
    const endsAt = nowMs() + minutes * 60 * 1000;
    setTimerNow(nowMs());
    setTimerEndsAt(endsAt);
    channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: { endsAt } });
  };

  const sendReaction = (emoji) => {
    const id = `${randomId()}`;
    setReactions((prev) => [...prev, { id, emoji, name: profile?.full_name || 'Участник', x: 30 + randomFraction() * 40, y: 60 + randomFraction() * 20 }]);
    window.setTimeout(() => setReactions((prev) => prev.filter((item) => item.id !== id)), 2600);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { emoji, name: profile?.full_name || 'Участник' },
    });
  };

  const changeEditMode = async (mode) => {
    if (!board || !canManage) return;
    const { board: saved, error: saveError } = await updateBoard(board.id, { edit_mode: mode });
    if (saveError) setError(saveError.message);
    else if (saved) setBoard(saved);
    setShowSettings(false);
  };

  const objectById = useMemo(() => new Map(objects.map((item) => [item.id, item])), [objects]);

  if (loading) {
    return (
      <div className="glass-panel flex min-h-[420px] items-center justify-center rounded-3xl text-sm text-slate-500">
        Открываем командную доску…
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="glass-panel rounded-3xl p-6 text-sm text-rose-600 dark:text-rose-300">
        Не удалось открыть доску: {error}
      </div>
    );
  }

  return (
    <div
      className="whiteboard-shell relative flex h-[calc(100vh-150px)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-slate-300/50 bg-slate-100/60 dark:border-white/10 dark:bg-slate-950/60"
      data-history-version={historyTick}
    >
      <div className="no-print absolute top-3 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-2xl border border-white/60 bg-white/80 p-1 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85">
        {TOOLS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTool(item.key);
                setConnectorFrom(null);
                stopFollowing();
              }}
              disabled={!canEdit && !['select', 'hand', 'comment', 'vote'].includes(item.key)}
              className={`rounded-xl p-2 transition ${tool === item.key ? 'bg-indigo-500 text-white shadow' : 'text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10'} disabled:opacity-30`}
              title={item.label}
            >
              <Icon size={16} />
            </button>
          );
        })}
        <button type="button" onClick={undo} className="rounded-xl p-2 text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10" title="Отменить (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button type="button" onClick={redo} className="rounded-xl p-2 text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10" title="Повторить (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </button>
        <select
          value={diagramMode}
          onChange={(event) => {
            const mode = event.target.value;
            setDiagramMode(mode);
            if (mode === 'bpmn') {
              setTool('bpmn');
              setBpmnKind('task');
            } else {
              setTool('select');
            }
          }}
          className="glass-input !w-auto !py-1 !text-[0.62rem]"
          title="Тип диаграммы"
        >
          <option value="free">Диаграмма: свободная</option>
          <option value="bpmn">Диаграмма: BPMN</option>
        </select>
        {tool === 'shape' && (
          <select value={shapeKind} onChange={(event) => setShapeKind(event.target.value)} className="glass-input !w-auto !py-1 !text-[0.62rem]" title="Тип фигуры">
            <option value="rect">Прямоугольник</option>
            <option value="ellipse">Эллипс</option>
            <option value="diamond">Ромб</option>
          </select>
        )}
        <span className="mx-1 h-6 w-px bg-slate-300/70 dark:bg-white/10" />
        <label className="cursor-pointer rounded-xl p-2 text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10" title={uploading ? 'Загрузка…' : 'Изображение'}>
          <ImageIcon size={16} />
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
        <button type="button" onClick={() => setShowComments((value) => !value)} className={`relative rounded-xl p-2 ${showComments ? 'bg-indigo-500 text-white' : 'text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10'}`} title="Комментарии">
          <MessageSquare size={16} />
          {comments.filter((comment) => !comment.resolved_at).length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 rounded-full bg-rose-500 px-1 text-[0.5rem] font-bold text-white">
              {comments.filter((comment) => !comment.resolved_at).length}
            </span>
          )}
        </button>
        <button type="button" onClick={() => setTool(tool === 'vote' ? 'select' : 'vote')} className={`rounded-xl p-2 ${tool === 'vote' ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10'}`} title="Голосование">
          <Vote size={16} />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setShowSettings((value) => !value)} className="rounded-xl p-2 text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10" title="Настройки доски">
            <Settings2 size={16} />
          </button>
          {showSettings && (
            <div className="glass-panel absolute top-11 right-0 z-50 w-64 rounded-2xl p-3 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-100">Доступ к доске</p>
              <p className="mt-0.5 text-[0.62rem] text-slate-500">Кто может редактировать объекты.</p>
              <select value={board?.edit_mode || 'all'} onChange={(event) => changeEditMode(event.target.value)} disabled={!canManage} className="glass-input mt-2 !py-1.5 !text-xs">
                <option value="all">Все участники проекта</option>
                <option value="managers">Только руководители</option>
              </select>
              <p className="mt-2 text-[0.6rem] text-slate-500">
                Комментировать и голосовать могут все участники проекта.
              </p>
              <button type="button" onClick={() => setShowSettings(false)} className="mt-2 text-[0.65rem] text-indigo-600 dark:text-indigo-300">Закрыть</button>
            </div>
          )}
        </div>
        <span className="mx-1 h-6 w-px bg-slate-300/70 dark:bg-white/10" />
        <div className="relative">
          <button type="button" onClick={() => startTimer(5)} className="rounded-xl p-2 text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10" title="Таймер 5 минут">
            <Timer size={16} />
          </button>
        </div>
        {REACTIONS.map((emoji) => (
          <button key={emoji} type="button" onClick={() => sendReaction(emoji)} className="rounded-xl px-1.5 py-1 text-sm hover:bg-white/80 dark:hover:bg-white/10" title="Реакция">
            {emoji}
          </button>
        ))}
      </div>

      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/75 px-3 py-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{board?.name || 'Командная доска'}</span>
        <span className="hidden text-[0.6rem] text-slate-500 sm:inline">{project.name}</span>
        {!canEdit && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[0.58rem] font-semibold text-amber-700 dark:text-amber-300">только просмотр</span>}
      </div>

      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded-2xl border border-white/60 bg-white/75 px-2 py-1.5 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
        <Users size={13} className="text-slate-500" />
        <div className="flex -space-x-1">
          {collaborators.filter((item) => item.user_id !== userId).slice(0, 5).map((item) => (
            <button
              key={item.user_id}
              type="button"
              onClick={() => {
                setFollowingId(followingId === item.user_id ? null : item.user_id);
                if (followingId !== item.user_id) showToast(`Следим за ${item.name}`);
              }}
              className={`rounded-full border-2 ${followingId === item.user_id ? 'border-indigo-500' : 'border-white dark:border-slate-900'}`}
              title={`Следить за ${item.name}`}
            >
              <Avatar name={item.name} color={item.color} src={item.avatar_url} className="h-6 w-6 text-[0.5rem]" />
            </button>
          ))}
          {collaborators.filter((item) => item.user_id !== userId).length === 0 && (
            <span className="text-[0.6rem] text-slate-400">только вы</span>
          )}
        </div>
        <span className="mx-1 h-5 w-px bg-slate-300/70 dark:bg-white/10" />
        <button type="button" onClick={() => setCameraSafe((prev) => ({ ...prev, zoom: clamp(prev.zoom - 0.15, 0.2, 3) }))} className="rounded-lg p-1 text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10"><ZoomOut size={14} /></button>
        <span className="min-w-8 text-center text-[0.6rem] font-semibold text-slate-500">{Math.round(camera.zoom * 100)}%</span>
        <button type="button" onClick={() => setCameraSafe((prev) => ({ ...prev, zoom: clamp(prev.zoom + 0.15, 0.2, 3) }))} className="rounded-lg p-1 text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10"><ZoomIn size={14} /></button>
        <button type="button" onClick={() => setCameraSafe({ x: 0, y: 0, zoom: 1 })} className="rounded-lg px-1.5 py-1 text-[0.6rem] text-slate-500 hover:bg-white/80 dark:hover:bg-white/10">100%</button>
      </div>

      {followingId && (
        <div className="absolute top-16 left-1/2 z-20 -translate-x-1/2 rounded-full border border-indigo-400/40 bg-indigo-500/90 px-3 py-1 text-[0.65rem] font-medium text-white shadow-lg">
          Следим за {collaborators.find((item) => item.user_id === followingId)?.name || 'участником'} · нажмите на холст, чтобы остановить
        </div>
      )}

      {timerEndsAt && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/60 bg-slate-900/85 px-3 py-1.5 text-white shadow-xl">
          <Timer size={14} />
          <span className="font-mono text-sm font-bold">{formatTimer(timerEndsAt - timerNow)}</span>
          <button type="button" onClick={() => { setTimerEndsAt(null); channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: { endsAt: null } }); }} className="text-white/60 hover:text-white"><X size={13} /></button>
        </div>
      )}

      {diagramMode === 'bpmn' && (
        <div className="no-print absolute top-20 left-1/2 z-30 flex max-w-[min(96vw,980px)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-2xl border border-white/60 bg-white/90 p-1.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
          <span className="px-1 text-[0.58rem] font-bold tracking-[0.12em] text-indigo-500 uppercase">BPMN</span>
          {BPMN_ELEMENTS.map((element) => (
            <button
              key={element.key}
              type="button"
              onClick={() => { setBpmnKind(element.key); setTool('bpmn'); setConnectorFrom(null); }}
              disabled={!canEdit}
              className={`rounded-lg border px-1.5 py-1 text-[0.6rem] transition disabled:opacity-40 ${tool === 'bpmn' && bpmnKind === element.key ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-300/70 bg-white/60 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'}`}
              title={`Добавить: ${element.label}`}
            >
              {element.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-300/70 dark:bg-white/10" />
          <button type="button" onClick={insertBpmnTemplate} disabled={!canEdit} className="glass-btn !px-2 !py-1 !text-[0.6rem]">Шаблон</button>
        </div>
      )}

      <div
        ref={viewportRef}
        className="relative flex-1 touch-none overflow-hidden"
        style={{
          cursor: tool === 'hand' || spaceDown ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
          backgroundImage: 'radial-gradient(circle, rgba(100,116,139,0.22) 1px, transparent 1px)',
          backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={broadcastCursor}
        onWheel={handleWheel}
      >
        <div
          className="absolute origin-top-left"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
        >
          <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
            <defs>
              <marker id="board-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#64748b" />
              </marker>
            </defs>
            {objects.filter((item) => item.type === 'connector').map((item) => {
              const from = objectById.get(item.data?.from);
              const to = objectById.get(item.data?.to);
              if (!from || !to) return null;
              const x1 = from.x + from.width / 2;
              const y1 = from.y + from.height / 2;
              const x2 = to.x + to.width / 2;
              const y2 = to.y + to.height / 2;
              const bpmnFlow = item.data?.variant === 'bpmn' || from.type === 'bpmn' || to.type === 'bpmn';
              return (
                <line key={item.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={bpmnFlow ? '#334155' : '#64748b'} strokeWidth={bpmnFlow ? 2.5 : 2} markerEnd="url(#board-arrow)" />
              );
            })}
          </svg>

          {objects.filter((item) => item.type === 'drawing').map((item) => {
            const points = (item.data?.points || []).map((point) => `${point.x},${point.y}`).join(' ');
            return (
              <svg key={item.id} className="pointer-events-none absolute overflow-visible" style={{ left: item.x, top: item.y }} width={Math.max(1, item.width)} height={Math.max(1, item.height)}>
                <polyline points={points} fill="none" stroke={item.data?.color || '#6366f1'} strokeWidth={item.data?.strokeWidth || 3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            );
          })}

          {objects.filter((item) => item.type !== 'connector' && item.type !== 'drawing').map((item) => {
            const isSelected = selectedId === item.id;
            const frame = item.type === 'frame';
            const sticky = item.type === 'sticky';
            const shape = item.type === 'shape';
            const text = item.type === 'text';
            const image = item.type === 'image';
            const bpmn = item.type === 'bpmn';
            const bpmnLabelBelow = bpmn && ['start', 'end', 'intermediate', 'gatewayX', 'gatewayPlus'].includes(item.data?.bpmnType);
            return (
              <div
                key={item.id}
                data-board-object
                className={`absolute select-none ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.width,
                  height: item.height,
                  zIndex: item.z,
                  background: sticky ? item.data?.color || '#fef08a' : shape || bpmn ? 'transparent' : frame ? 'rgba(255,255,255,0.28)' : 'transparent',
                  borderRadius: sticky ? 4 : shape ? 12 : bpmn ? 0 : frame ? 14 : text ? 0 : 12,
                  boxShadow: sticky ? '0 8px 20px rgba(15,23,42,.16)' : frame ? '0 0 0 1px rgba(99,102,241,.35)' : 'none',
                  border: frame ? '2px dashed rgba(99,102,241,.55)' : 'none',
                }}
                onPointerDown={(event) => beginDrag(event, item)}
                onClick={(event) => handleObjectClick(event, item)}
                onDoubleClick={() => startEditing(item)}
              >
                {frame && (
                  <div className="absolute -top-7 left-0 flex items-center gap-1 rounded-lg bg-indigo-500/90 px-2 py-0.5 text-[0.68rem] font-semibold text-white">
                    <Frame size={11} /> {item.data?.title || 'Фрейм'}
                    <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); copyFrameLink(item); }} className="ml-1 text-white/80 hover:text-white" title="Ссылка на фрейм"><Copy size={10} /></button>
                  </div>
                )}
                {image && item.data?.url && (
                  <img src={item.data.url} alt={item.data?.name || ''} className="h-full w-full rounded-xl object-contain" draggable={false} />
                )}
                {shape && (
                  <svg viewBox={`0 0 ${Math.max(1, item.width)} ${Math.max(1, item.height)}`} className="absolute inset-0 h-full w-full overflow-visible">
                    {item.data?.shape === 'ellipse' ? (
                      <ellipse cx={item.width / 2} cy={item.height / 2} rx={item.width / 2 - 2} ry={item.height / 2 - 2} fill={item.data?.fill || '#6366f1'} opacity="0.88" />
                    ) : item.data?.shape === 'diamond' ? (
                      <polygon points={`${item.width / 2},2 ${item.width - 2},${item.height / 2} ${item.width / 2},${item.height - 2} 2,${item.height / 2}`} fill={item.data?.fill || '#6366f1'} opacity="0.88" />
                    ) : (
                      <rect x="2" y="2" width={Math.max(1, item.width - 4)} height={Math.max(1, item.height - 4)} rx="12" fill={item.data?.fill || '#6366f1'} opacity="0.88" />
                    )}
                  </svg>
                )}
                {bpmn && <BpmnShape object={item} />}
                {(sticky || shape || text || frame || bpmn) && editingId === item.id ? (
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    onBlur={saveEditing}
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') saveEditing();
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        saveEditing();
                      }
                    }}
                    className="relative z-10 h-full w-full resize-none bg-transparent p-3 text-center text-xs font-medium text-slate-900 outline-none dark:text-slate-100"
                  />
                ) : (
                  <div className={`relative z-10 h-full w-full ${bpmnLabelBelow ? 'overflow-visible' : 'overflow-hidden'} p-3 ${sticky || text ? 'font-medium' : ''} ${shape || image || bpmn ? 'flex items-center justify-center text-center' : ''}`}>
                    <p className={`${sticky ? 'text-slate-900' : 'text-slate-700 dark:text-slate-100'} ${bpmnLabelBelow ? 'absolute -bottom-5 left-1/2 -translate-x-1/2 rounded bg-white/85 px-1 py-0.5 text-[0.58rem] font-semibold whitespace-nowrap dark:bg-slate-900/80' : text ? 'text-lg' : bpmn ? 'text-[0.68rem] leading-tight' : 'text-sm'} leading-snug whitespace-pre-wrap`}>
                      {item.data?.text || (sticky ? 'Двойной клик — текст' : bpmn ? 'Двойной клик — название' : '')}
                    </p>
                  </div>
                )}
                {isSelected && canEdit && (
                  <>
                    <span
                      data-resize
                      onPointerDown={(event) => { event.stopPropagation(); beginDrag(event, item, 'resize'); }}
                      className="absolute right-0 bottom-0 h-3 w-3 cursor-se-resize rounded-tl bg-indigo-500"
                    />
                    <div className="absolute -bottom-10 left-0 flex items-center gap-1 rounded-xl border border-white/50 bg-white/90 p-1 shadow-lg dark:border-white/10 dark:bg-slate-900/90">
                      {frame && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); copyFrameLink(item); }} className="rounded-lg p-1 text-slate-500 hover:bg-indigo-500/10 hover:text-indigo-600" title="Ссылка"><Copy size={12} /></button>}
                      <button type="button" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); deleteWithHistory(item); }} onClick={(event) => event.stopPropagation()} className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600" title="Удалить"><Trash2 size={12} /></button>
                    </div>
                  </>
                )}
                {votes.filter((vote) => vote.object_id === item.id).length > 0 && (
                  <span className="absolute -top-2 -right-2 z-20 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[0.58rem] font-bold text-white shadow">
                    {votes.filter((vote) => vote.object_id === item.id).length}
                  </span>
                )}
              </div>
            );
          })}

          {drawing && (
            <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1">
              <polyline points={drawing.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={drawing.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {collaborators.filter((item) => item.user_id !== userId && item.cursor).map((item) => {
          const screenX = item.cursor.x * camera.zoom + camera.x;
          const screenY = item.cursor.y * camera.zoom + camera.y;
          return (
            <div key={item.user_id} className="pointer-events-none absolute z-30" style={{ left: screenX, top: screenY }}>
              <div className="h-0 w-0 border-x-[6px] border-t-[10px] border-x-transparent" style={{ borderTopColor: item.color || '#6366f1' }} />
              <span className="ml-1 rounded-md px-1.5 py-0.5 text-[0.58rem] font-semibold text-white shadow" style={{ backgroundColor: item.color || '#6366f1' }}>{item.name}</span>
            </div>
          );
        })}

        {reactions.map((reaction) => (
          <span key={reaction.id} className="board-reaction pointer-events-none absolute z-40 text-3xl" style={{ left: `${reaction.x}%`, top: `${reaction.y}%` }}>
            {reaction.emoji}
          </span>
        ))}

        {objects.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="rounded-3xl border border-dashed border-slate-400/40 bg-white/50 px-6 py-5 backdrop-blur-sm dark:bg-slate-900/40">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Пустой холст</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">Выберите стикер, фигуру или карандаш на панели сверху. Перетаскивайте объекты, масштабируйте колесом с Ctrl.</p>
            </div>
          </div>
        )}
      </div>

      {showComments && (
        <aside className="absolute top-16 right-3 bottom-3 z-30 flex w-80 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
          <div className="flex items-center justify-between border-b border-slate-200/60 px-3 py-2 dark:border-white/10">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"><MessageSquare size={14} /> Комментарии</p>
            <button type="button" onClick={() => setShowComments(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
          </div>
          <div className="scrollbar-slim flex-1 space-y-2 overflow-y-auto p-2">
            {comments.length === 0 && <p className="p-3 text-center text-[0.65rem] text-slate-400">Пока нет комментариев</p>}
            {comments.map((comment) => (
              <div key={comment.id} className={`rounded-xl border p-2 ${comment.resolved_at ? 'border-slate-200/50 opacity-60 dark:border-white/5' : 'border-slate-200/70 dark:border-white/10'}`}>
                <div className="flex items-center gap-1.5">
                  <Avatar name={authorById?.get(comment.created_by)?.full_name || 'Участник'} color={authorById?.get(comment.created_by)?.color} src={authorById?.get(comment.created_by)?.avatar_url} className="h-5 w-5 text-[0.45rem]" />
                  <span className="truncate text-[0.62rem] font-semibold text-slate-700 dark:text-slate-200">{authorById?.get(comment.created_by)?.full_name || 'Участник'}</span>
                  <button type="button" onClick={() => resolveBoardComment(comment.id, !comment.resolved_at)} className="ml-auto text-[0.55rem] text-slate-400 hover:text-emerald-600" title={comment.resolved_at ? 'Вернуть' : 'Решено'}>✓</button>
                  {comment.created_by === userId && <button type="button" onClick={() => deleteBoardComment(comment.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={11} /></button>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[0.68rem] text-slate-600 dark:text-slate-300">{comment.body}</p>
                {comment.x != null && <button type="button" onClick={() => setCameraSafe((prev) => ({ ...prev, x: -comment.x * prev.zoom + 300, y: -comment.y * prev.zoom + 250 }))} className="mt-1 text-[0.58rem] text-indigo-500">Показать на доске</button>}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200/60 p-2 dark:border-white/10">
            {commentPoint && <p className="mb-1 text-[0.58rem] text-indigo-500">Комментарий к точке на доске</p>}
            <div className="flex gap-1">
              <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addComment(); }} placeholder="Написать комментарий…" className="glass-input !min-w-0 flex-1 !py-1.5 !text-xs" />
              <button type="button" onClick={addComment} disabled={!commentDraft.trim()} className="glass-btn glass-btn-primary !px-2 !py-1.5 !text-xs disabled:opacity-40"><Plus size={13} /></button>
            </div>
          </div>
        </aside>
      )}

      {toast && <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900/90 px-3 py-1.5 text-xs text-white shadow-xl">{toast}</div>}
      {error && <div className="absolute bottom-4 left-4 z-40 max-w-sm rounded-xl border border-rose-400/40 bg-rose-500/90 px-3 py-2 text-xs text-white shadow-xl">{error}<button type="button" onClick={() => setError('')} className="ml-2 font-bold">×</button></div>}
    </div>
  );
}
