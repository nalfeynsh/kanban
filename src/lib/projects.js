import { supabase } from '../supabaseClient';

export const PROJECT_STORAGE_KEY = 'kanban:current-project';

export const WORKFLOW_PRESETS = [
  {
    key: 'development',
    name: 'Разработка',
    description: 'Разработка и тестирование',
    columns: ['Сделать', 'В работе', 'В разработке', 'На тестировании', 'Готово'],
  },
  {
    key: 'analytics',
    name: 'Аналитика',
    description: 'Исследование и аналитика',
    columns: ['Сделать', 'В работе', 'Аналитика', 'Готово'],
  },
  {
    key: 'marketing',
    name: 'Маркетинг',
    description: 'Задачи и согласование',
    columns: ['Сделать', 'В работе', 'На согласовании', 'Готово'],
  },
  {
    key: 'simple',
    name: 'Простая',
    description: 'Базовый канбан',
    columns: ['Сделать', 'В работе', 'Готово'],
  },
];

export async function fetchProjects({ includeDeleted = false } = {}) {
  let query = supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });

  if (!includeDeleted) query = query.is('deleted_at', null);

  const { data, error } = await query;
  return { projects: Array.isArray(data) ? data : [], error };
}

export async function fetchProjectNotices() {
  const { data, error } = await supabase
    .from('project_notices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  return { notices: Array.isArray(data) ? data : [], error };
}

export async function markProjectNoticeRead(noticeId) {
  const { error } = await supabase
    .from('project_notices')
    .update({ read_at: new Date().toISOString() })
    .eq('id', noticeId);
  return { error };
}

export async function softDeleteProject(projectId) {
  const { data, error } = await supabase.rpc('soft_delete_project', {
    p_project: projectId,
  });
  return { result: data, error };
}

export async function restoreProject(projectId) {
  const { data, error } = await supabase.rpc('restore_project', {
    p_project: projectId,
  });
  return { result: data, error };
}

export async function purgeDeletedProjects() {
  const { data, error } = await supabase.rpc('purge_deleted_projects');
  return { count: data, error };
}

export async function downloadProjectArchive(projectId) {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError || !project) return { error: projectError || new Error('project_not_found') };

  const { data: columns } = await supabase
    .from('columns')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });

  const columnIds = (columns ?? []).map((column) => column.id);
  const { data: tasks } = columnIds.length
    ? await supabase.from('tasks').select('*').in('column_id', columnIds).order('position')
    : { data: [] };

  const payload = {
    exported_at: new Date().toISOString(),
    project,
    columns: columns ?? [],
    tasks: tasks ?? [],
    note: 'Файлы задач доступны по ссылкам в поле files. Это резервная копия метаданных проекта.',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `project-${project.name || projectId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { error: null };
}


export async function createProject({ name, description, columns, members }) {
  const { data, error } = await supabase.rpc('create_project', {
    p_name: name,
    p_description: description || null,
    p_columns: columns,
    p_members: members || [],
  });
  return { projectId: data, error };
}

export async function updateProject(projectId, patch) {
  const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  return { error };
}

export async function fetchProjectColumns(projectId) {
  const { data, error } = await supabase
    .from('columns')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  return { columns: Array.isArray(data) ? data : [], error };
}

export async function fetchProjectMembers(projectId) {
  const { data, error } = await supabase
    .from('project_members')
    .select('profile_id,role')
    .eq('project_id', projectId);
  return { members: Array.isArray(data) ? data : [], error };
}

export async function saveProjectColumn({ projectId, columnId = null, title, responsibleId = null }) {
  const { data, error } = await supabase.rpc('save_project_column', {
    p_project_id: projectId,
    p_column_id: columnId,
    p_title: title,
    p_responsible_id: responsibleId || null,
  });
  return { column: data, error };
}

export async function deleteProjectColumn(columnId) {
  const { data, error } = await supabase.rpc('delete_project_column', {
    p_column_id: columnId,
  });
  return { result: data, error };
}
