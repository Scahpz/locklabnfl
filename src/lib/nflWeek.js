// NFL week number for a given date. Week 1 starts the Thursday after Labor Day.
export function getNFLWeek(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const sep1 = new Date(Date.UTC(year, 8, 1));
  // Labor Day = first Monday of September
  const daysToMonday = (1 - sep1.getUTCDay() + 7) % 7;
  const laborDay = new Date(Date.UTC(year, 8, 1 + daysToMonday));
  // Week 1 kicks off the Thursday after Labor Day
  const week1Start = new Date(laborDay.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (d < week1Start) return null; // preseason
  const weekNum = Math.floor((d.getTime() - week1Start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return weekNum >= 1 && weekNum <= 18 ? weekNum : null;
}

// NFL season a date belongs to (Jan/Feb games count toward the prior year's season).
export function getNFLSeason(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}
