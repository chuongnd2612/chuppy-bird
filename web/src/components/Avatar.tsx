import type { AdoIdentity } from '../../../shared/types.ts';

interface AvatarProps {
  identity: AdoIdentity | null;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ identity, size = 24 }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (!identity) {
    return (
      <span className="avatar avatar--empty" style={style} title="Unassigned" aria-label="Unassigned">
        –
      </span>
    );
  }

  if (identity.avatarUrl) {
    return (
      <img
        className="avatar"
        style={style}
        src={identity.avatarUrl}
        alt={identity.displayName}
        title={identity.displayName}
        loading="lazy"
      />
    );
  }

  return (
    <span className="avatar avatar--initials" style={style} title={identity.displayName}>
      {initials(identity.displayName)}
    </span>
  );
}
