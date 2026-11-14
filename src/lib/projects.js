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

export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  return { projects: Array.isArray(data) ? data : [], error };
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
