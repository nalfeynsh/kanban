import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
} from 'lucide-react';

export default function TipTapEditor({ content, onChange }) {
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
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

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
      <div className="flex flex-wrap items-center gap-0.5 border-b border-white/40 bg-white/30 px-2 py-1.5 backdrop-blur dark:border-white/10 dark:bg-white/5">
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
    </div>
  );
}
