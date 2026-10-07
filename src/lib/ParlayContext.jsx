import React, { createContext, useContext, useState, useEffect } from 'react';
import { gradeForDisplay } from '@/lib/grading';

const STORAGE_KEY = 'locklab_parlay_slip';

const ParlayContext = createContext(null);

export function ParlayProvider({ children }) {
  // Slip survives refreshes / closing the PWA.
  const [legs, setLegs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(legs)); } catch {}
  }, [legs]);

  // Add a player prop leg
  const addLeg = (prop, pick) => {
    const exists = legs.find(l => l.player_name === prop.player_name && l.prop_type === prop.prop_type && !l.is_game_bet);
    if (exists) {
      if (exists.pick === pick) {
        setLegs(prev => prev.filter(l => !(l.player_name === prop.player_name && l.prop_type === prop.prop_type && !l.is_game_bet)));
      } else {
        setLegs(prev => prev.map(l =>
          l.player_name === prop.player_name && l.prop_type === prop.prop_type && !l.is_game_bet
            ? { ...l, pick, odds: pick === 'over' ? prop.over_odds : prop.under_odds, model_prob: pick === 'over' ? l.over_prob : l.under_prob }
            : l
        ));
      }
      return;
    }
    // Grade now, while the prop still carries its game logs. The slip only keeps
    // a few fields, so re-grading it later falls back to a ~50/50 market guess.
    const grade = prop.over_prob != null ? null : gradeForDisplay(prop);
    const overProb  = prop.over_prob  ?? grade?.overProb  ?? null;
    const underProb = prop.under_prob ?? grade?.underProb ?? null;
    setLegs(prev => [...prev, {
      player_name: prop.player_name,
      team: prop.team,
      opponent: prop.opponent,
      position: prop.position,
      prop_type: prop.prop_type,
      line: prop.line,
      scheduled_at: prop.scheduled_at ?? '',
      pick,
      odds: pick === 'over' ? prop.over_odds : prop.under_odds,
      over_prob: overProb,
      under_prob: underProb,
      model_prob: pick === 'over' ? overProb : underProb,
      has_model: grade ? grade.dataQuality !== 'market' : true,
      is_game_bet: false,
    }]);
  };

  // Add a team moneyline or spread leg
  // leg_id is a unique key e.g. "gameId_away_ml"
  const addGameLeg = (leg) => {
    setLegs(prev => {
      const exists = prev.find(l => l.leg_id === leg.leg_id);
      if (exists) return prev.filter(l => l.leg_id !== leg.leg_id); // toggle off
      return [...prev, leg];
    });
  };

  const removeLeg = (player_name, prop_type) => {
    setLegs(prev => prev.filter(l => !(l.player_name === player_name && l.prop_type === prop_type)));
  };

  const removeGameLeg = (leg_id) => {
    setLegs(prev => prev.filter(l => l.leg_id !== leg_id));
  };

  const clearLegs = () => setLegs([]);

  const isSelected = (player_name, prop_type, pick) =>
    legs.some(l => l.player_name === player_name && l.prop_type === prop_type && l.pick === pick && !l.is_game_bet);

  const isGameLegSelected = (leg_id) => legs.some(l => l.leg_id === leg_id);

  return (
    <ParlayContext.Provider value={{ legs, addLeg, addGameLeg, removeLeg, removeGameLeg, clearLegs, isSelected, isGameLegSelected }}>
      {children}
    </ParlayContext.Provider>
  );
}

export function useParlay() {
  return useContext(ParlayContext);
}