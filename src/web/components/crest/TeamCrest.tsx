import { memo } from 'react';
import { crestForTeamName, defaultUserCrest, type CrestConfig } from '../../../shared/crest';
import { useStore } from '../../lib/store';
import { Crest } from './Crest';

/**
 * Escudo de um time do jogo, achado pelo id do time na disputa (`u:<usuário>`, `cpu:3`, `bot-7`…):
 * técnicos usam o escudo que montaram; CPU e clubes do jogo, o escudo que sai do nome.
 */

const byName = new Map<string, CrestConfig>();

export function crestOfName(name: string): CrestConfig {
  let c = byName.get(name);
  if (!c) {
    c = crestForTeamName(name);
    byName.set(name, c);
  }
  return c;
}

/** Id do usuário dono do time, quando é time de técnico. */
export function userIdOfTeam(teamId: string | null | undefined): string | null {
  return teamId && teamId.startsWith('u:') ? teamId.slice(2) : null;
}

export function useTeamCrest(teamId: string | null | undefined, name: string, userId?: string | null): CrestConfig {
  const uid = userId ?? userIdOfTeam(teamId);
  const fromRoom = useStore((s) => (uid ? (s.room?.crests?.[uid] ?? (s.user?.id === uid ? s.user.crest : undefined)) : undefined));
  if (uid) return fromRoom ?? defaultUserCrest(uid, name);
  return crestOfName(name);
}

function TeamCrestImpl({
  id,
  name,
  userId,
  crest,
  size = 28,
  title,
}: {
  id?: string | null;
  name: string;
  userId?: string | null;
  /** Escudo já conhecido (perfil, confrontos): dispensa a busca. */
  crest?: CrestConfig | null;
  size?: number;
  title?: string;
}) {
  const found = useTeamCrest(id, name, userId);
  return (
    <span className="team-crest" style={{ height: size }}>
      <Crest crest={crest ?? found} size={size} {...(title ? { title } : {})} />
    </span>
  );
}

export const TeamCrest = memo(TeamCrestImpl);
