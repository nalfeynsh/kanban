import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Heading1, Heading2, Undo, Redo, Link as LinkIcon } from 'lucide-react';

export default function TipTapEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Добавьте детали к задаче...' }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-sm max-w-none focus:outline-none min-h-[150px] p-3 text-gray-900 dark:text-gray-100',
      },
    },
  });

  // Синхронизируем контент, если он изменился извне (например, открыли другую задачу)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const btnClass = (isActive) => 
    `p-1.5 rounded transition-colors ${isActive ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`;

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 flex flex-col">
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="Жирный"><Bold size={16}/></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="Курсив"><Italic size={16}/></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="Подчеркнутый"><UnderlineIcon size={16}/></button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="Зачеркнутый"><Strikethrough size={16}/></button>
        
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 self-center"></div>
        
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnClass(editor.isActive('heading', { level: 1 }))} title="Заголовок 1"><Heading1 size={16}/></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive('heading', { level: 2 }))} title="Заголовок 2"><Heading2 size={16}/></button>
        
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 self-center"></div>
        
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title="Маркированный список"><List size={16}/></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title="Нумерованный список"><ListOrdered size={16}/></button>
        
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 self-center"></div>
        
        <button 
          type="button"
          onClick={() => {
            const url = window.prompt('Введите URL ссылки:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }} 
          className={btnClass(editor.isActive('link'))} 
          title="Вставить ссылку"
        >
          <LinkIcon size={16}/>
        </button>

        <div className="flex-1"></div>

        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnClass(false)} disabled={!editor.can().undo()} title="Отменить"><Undo size={16}/></button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnClass(false)} disabled={!editor.can().redo()} title="Повторить"><Redo size={16}/></button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}