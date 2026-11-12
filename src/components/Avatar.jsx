import { initialsOf } from '../lib/initials';

/**
 * Аватар сотрудника: фото из profiles.avatar_url или инициалы на цветном фоне.
 *
 * Размер и скругление задаются снаружи классами — ровно как у прежних
 * «кружков» с инициалами, поэтому замена не меняет вёрстку.
 */
export default function Avatar({
  name,
  color,
  src,
  alt,
  title,
  shape = 'rounded-full',
  className = '',
  ...rest
}) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden font-bold text-white ${shape} ${className}`}
      style={{ backgroundColor: color || '#6366f1' }}
      title={title ?? undefined}
      {...rest}
    >
      {src ? (
        <img
          src={src}
          alt={alt || name || 'Аватар'}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
