import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Undo,
  Redo,
  Link as LinkIcon,
  SpellCheck2,
  X,
} from 'lucide-react';
import { checkSpelling } from '../lib/spellcheck';

const SPELLCHECK_KEY = new PluginKey('spellcheck-decorations');

function buildPlainText(doc) {
  const chars = [];
  let needsSeparator = false;
  doc.descendants((node, pos) => {
    if (node.isText) {
      if (needsSeparator && chars.length > 0) {
        chars.push({ char: '\n', pos: null });
        needsSeparator = false;
      }
      for (let i = 0; i < node.text.length; i += 1) {
        chars.push({ char: node.text[i], pos: pos + i });
      }
    } else if (node.isBlock) {
      needsSeparator = true;
    }
  });
  return { text: chars.map((item) => item.char).join(''), chars };
}

function buildDecorations(doc, matches, chars) {
  return matches
    .map((match) => {
      const start = chars[match.offset];
      const end = chars[match.offset + Math.max(0, match.length - 1)];
      if (!start?.pos || !end?.pos) return null;
      return Decoration.inline(start.pos, end.pos + 1, {
        class: 'spellcheck-issue',
        title: match.message,
      });
    })
    .filter(Boolean);
}

export default forwardRef(function TipTapEditor({ content, onChange }, ref) {
  const [issues, setIssues] = useState([]);
  const [checking, setChecking] = useState(false);
  const [menu, setMenu] = useState(null);
  const issuesRef = useRef([]);
  const checkTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Добавьте детали к задаче…' }),
    ],
    content: content || '',
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'ProseMirror focus:outline-none',
        spellcheck: 'false',
        lang: 'ru',
      },
    },
  });

  const runCheck = useCallback(async () => {
    if (!editor || editor.isDestroyed) return;
    const { text, chars } = buildPlainText(editor.state.doc);
    if (text.trim().length < 3) {
      issuesRef.current = [];
      setIssues([]);
      editor.view.dispatch(editor.state.tr.setMeta(SPELLCHECK_KEY, { decorations: [] }));
      return;
    }
    setChecking(true);
    try {
      const matches = await checkSpelling(text);
      if (!mountedRef.current || editor.isDestroyed) return;
      const current = buildPlainText(editor.state.doc).text;
      if (current !== text) return;
      const normalized = matches.map((match) => {
        const start = chars[match.offset];
        const end = chars[match.offset + Math.max(0, match.length - 1)];
        return {
          ...match,
          from: start?.pos ?? null,
          to: end?.pos != null ? end.pos + 1 : null,
        };
      }).filter((match) => match.from != null && match.to != null && match.to > match.from);
      issuesRef.current = normalized;
      setIssues(normalized);
      const decorations = buildDecorations(editor.state.doc, matches, chars);
      editor.view.dispatch(editor.state.tr.setMeta(SPELLCHECK_KEY, { decorations }));
    } catch {
      // Проверка не должна мешать редактированию.
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return undefined;
    const plugin = new Plugin({
      key: SPELLCHECK_KEY,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, previous) {
          const meta = tr.getMeta(SPELLCHECK_KEY);
          if (meta) return DecorationSet.create(tr.doc, meta.decorations || []);
          if (tr.docChanged) return previous.map(tr.mapping, tr.doc);
          return previous;
        },
      },
      props: {
        decorations(state) {
          return SPELLCHECK_KEY.getState(state) || DecorationSet.empty;
        },
      },
    });
    editor.registerPlugin(plugin);
    const onUpdate = ({ transaction }) => {
      if (transaction?.getMeta(SPELLCHECK_KEY)) return;
      setMenu(null);
      clearTimeout(checkTimerRef.current);
      checkTimerRef.current = setTimeout(runCheck, 1000);
    };
    editor.on('update', onUpdate);
    const timer = setTimeout(runCheck, 600);
    return () => {
      clearTimeout(timer);
      clearTimeout(checkTimerRef.current);
      editor.off('update', onUpdate);
      editor.unregisterPlugin(SPELLCHECK_KEY);
    };
  }, [editor, runCheck]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    const handleContextMenu = (event) => {
      const info = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!info) return;
      const issue = issuesRef.current.find((item) => info.pos >= item.from && info.pos <= item.to);
      if (!issue) {
        setMenu(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setMenu({ x: event.clientX, y: event.clientY, issue });
    };
    const close = () => setMenu(null);
    dom.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      dom.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [editor]);

  const applyReplacement = (value) => {
    if (!editor || !menu?.issue) return;
    editor.chain().focus().insertContentAt({ from: menu.issue.from, to: menu.issue.to }, value).run();
    setMenu(null);
    setIssues([]);
  };

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (!editor) return;
        // editor.commands.focus() в некоторых сборках не ставит фокус на DOM —
        // фокусируем contenteditable напрямую и ставим курсор в конец.
        editor.view.dom.focus();
        const end = editor.state.doc.content.size;
        editor.commands.setTextSelection(end);
      },
    }),
    [editor],
  );

  if (!editor) return null;

  const btnClass = (isActive) =>
    `rounded-lg p-1.5 transition-colors ${
      isActive
        ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
        : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10'
    }`;

  const divider = <span className="mx-0.5 h-5 w-px self-center bg-white/50 dark:bg-white/15" />;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-300/60 bg-white/70 px-2 py-1.5 backdrop-blur dark:border-white/10 dark:bg-white/5">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="Жирный">
          <Bold size={15} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="Курсив">
          <Italic size={15} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="Подчёркнутый">
          <UnderlineIcon size={15} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="Зачёркнутый">
          <Strikethrough size={15} />
        </button>

        {divider}

        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnClass(editor.isActive('heading', { level: 1 }))} title="Заголовок 1">
          <Heading1 size={15} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive('heading', { level: 2 }))} title="Заголовок 2">
          <Heading2 size={15} />
        </button>

        {divider}

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title="Список">
          <List size={15} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title="Нумерованный список">
          <ListOrdered size={15} />
        </button>

        {divider}

        <button
          type="button"
          onClick={() => {
            const url = window.prompt('Введите URL ссылки:', 'https://');
            if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
          className={btnClass(editor.isActive('link'))}
          title="Вставить ссылку"
        >
          <LinkIcon size={15} />
        </button>

        <div className="flex-1" />

        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnClass(false)} disabled={!editor.can().undo()} title="Отменить">
          <Undo size={15} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnClass(false)} disabled={!editor.can().redo()} title="Повторить">
          <Redo size={15} />
        </button>
      </div>

      <EditorContent editor={editor} />

      <div className="flex min-h-4 items-center gap-1 px-1 pt-1 text-[0.58rem] text-slate-400 dark:text-slate-500">
        {checking ? (
          <>
            <SpellCheck2 size={10} className="animate-pulse" /> Проверка текста…
          </>
        ) : issues.length > 0 ? (
          <>
            <SpellCheck2 size={10} /> Найдено замечаний: {issues.length}. Правый клик по подчёркнутому слову.
          </>
        ) : (
          <>
            <SpellCheck2 size={10} /> Орфография проверяется автоматически
          </>
        )}
      </div>

      {menu && createPortal(
        <div
          className="glass-panel fixed z-[100] w-72 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 300)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 260)),
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-2 px-2 py-1.5">
            <SpellCheck2 size={14} className="mt-0.5 shrink-0 text-rose-500" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold text-slate-800 dark:text-slate-100">
                {menu.issue.shortMessage || 'Возможная ошибка'}
              </p>
              <p className="mt-0.5 text-[0.6rem] leading-snug text-slate-500 dark:text-slate-400">
                {menu.issue.message}
              </p>
            </div>
            <button type="button" onClick={() => setMenu(null)} className="text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          </div>
          <div className="border-t border-slate-300/50 pt-1 dark:border-white/10">
            {menu.issue.replacements?.length > 0 ? (
              menu.issue.replacements.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyReplacement(value)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[0.7rem] text-slate-700 transition hover:bg-white/70 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  {value}
                </button>
              ))
            ) : (
              <p className="px-2.5 py-1.5 text-[0.62rem] text-slate-500 dark:text-slate-400">
                Вариантов замены нет — проверьте формулировку вручную.
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});