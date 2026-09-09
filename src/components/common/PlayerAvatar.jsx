import React, { useState } from 'react';
import TeamLogo from '@/components/common/TeamLogo';

export default function PlayerAvatar({ photo, team, className = 'w-9 h-9', bgClass }) {
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt=""
        className={`${className} rounded-full object-cover object-top bg-white/5 border border-white/10 flex-shrink-0`}
        onError={() => setFailed(true)}
      />
    );
  }
  return <TeamLogo team={team} className={className} bgClass={bgClass} />;
}
