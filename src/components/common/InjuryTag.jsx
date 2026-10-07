import React from 'react';
import { injuryMeta } from '@/lib/injuries';
import { cn } from '@/lib/utils';

// Small status chip (OUT / IR / D / Q / PUP / SUS / RET). Renders nothing for
// healthy players. `title` carries the full status plus any injury reasoning.
export default function InjuryTag({ player, className }) {
  const meta = injuryMeta(player);
  if (!meta) return null;
  const detail = [meta.long, player.injury_note, ...(player.injury_reasons ?? []).slice(0, 2)]
    .filter(Boolean).join(' · ');
  return (
    <span
      title={detail}
      className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide flex-shrink-0 leading-none', meta.cls, className)}
    >
      {meta.label}
    </span>
  );
}
