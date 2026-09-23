from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
import asyncio
import json
import os
import time
import threading

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Settings ──────────────────────────────────────────────────────────────────
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")

def load_settings():
    try:
        with open(SETTINGS_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

@app.get("/api/settings")
async def get_settings():
    s = load_settings()
    has_odds_key = bool(os.environ.get("ODDS_API_KEY") or s.get("odds_api_key"))
    return {
        "odds_api_key": has_odds_key,
        "bookmakers": s.get("bookmakers", "draftkings,fanduel,betmgm,caesars,pointsbetus"),
    }

@app.get("/health")
async def health():
    import datetime
    actual_seasons = []
    row_count = 0
    if _weekly_df is not None and "season" in _weekly_df.columns:
        actual_seasons = sorted([int(s) for s in _weekly_df["season"].unique()])
        row_count = len(_weekly_df)
    return {
        "status": "ok",
        "sport": "nfl",
        "data_loaded": _data_loaded,
        "data_loading": _data_loading,
        "loaded_seasons": _loaded_seasons,       # what we requested
        "actual_seasons_in_df": actual_seasons,  # what nfl_data_py actually returned
        "row_count": row_count,
        "current_year": datetime.datetime.now().year,
    }

# ── nfl_data_py: background loading at startup ────────────────────────────────
_weekly_df      = None
_snap_df        = None   # separate import_snap_counts dataset
_data_loaded    = False
_data_loading   = False
_loaded_seasons: list[int] = []   # which seasons are actually in _weekly_df

# Prop type → column(s) in the weekly dataframe. Combo stats are summed.
PROP_COLS: dict[str, list[str]] = {
    "passing_yards":    ["passing_yards"],
    "passing_tds":      ["passing_tds"],
    "completions":      ["completions"],
    "passing_ints":     ["interceptions"],
    "rushing_yards":    ["rushing_yards"],
    "rushing_tds":      ["rushing_tds"],
    "rushing_attempts": ["carries"],
    "receiving_yards":  ["receiving_yards"],
    "receiving_tds":    ["receiving_tds"],
    "receptions":       ["receptions"],
    "fantasy_points":   ["fantasy_points_ppr"],
    "rush_rec_yards":   ["rushing_yards", "receiving_yards"],
    "rush_rec_tds":     ["rushing_tds",   "receiving_tds"],
    "pass_rush_yards":  ["passing_yards",  "rushing_yards"],
    "sacks":            ["sacks"],
    "tackles":          ["tackles_combined"],
}


def _norm(name: str) -> str:
    return name.lower().replace(".", "").replace("'", "").replace("-", " ").strip()


def _load_nfl_data():
    global _weekly_df, _snap_df, _data_loaded, _data_loading, _loaded_seasons
    _data_loading = True
    try:
        import nfl_data_py as nfl  # type: ignore
        import pandas as pd

        # Season selection rules:
        #   1. 2025 is ALWAYS the primary source — the most recently completed full season.
        #      Mixing in 2024 would contaminate L10/L5 with stale roster/scheme data.
        #   2. Add the current season (2026+) only once it has ≥5 completed regular-season
        #      weeks so that L5 can be entirely current-season and L10 is a meaningful blend.
        #   3. 2024 and older are never loaded unless 2025 itself is unavailable.
        import datetime
        current_year = datetime.datetime.now().year

        def reg_weeks_for_year(yr):
            """
            Return the number of distinct completed regular-season weeks for `yr`,
            or -1 if the data can't be loaded at all.
            """
            try:
                tmp = nfl.import_weekly_data([yr])
                if tmp is None or len(tmp) == 0:
                    print(f"[nfl_data_py] {yr}: no data returned")
                    return -1
                if "season_type" in tmp.columns:
                    reg = tmp[tmp["season_type"].str.upper().str.startswith("REG")]
                    n = int(reg["week"].nunique()) if "week" in reg.columns else 0
                    print(f"[nfl_data_py] {yr}: {len(reg)} REG rows, {n} distinct weeks")
                    return n
                else:
                    n = int(tmp["week"].nunique()) if "week" in tmp.columns else len(tmp)
                    print(f"[nfl_data_py] {yr}: {len(tmp)} rows (no season_type), {n} weeks")
                    return n
            except Exception as e:
                print(f"[nfl_data_py] {yr}: load error — {e}")
                return -1

        # 2025 is the ONLY acceptable primary season — never fall back to 2024.
        # If nfl_data_py can't provide 2025, we call _load_sleeper_fallback() immediately.
        weeks_2025 = reg_weeks_for_year(2025)
        if weeks_2025 <= 0:
            print("[nfl_data_py] 2025 data unavailable — switching to Sleeper API (never fall back to 2024)")
            _load_sleeper_fallback()
            return

        seasons: list[int] = [2025]

        # Also include the current season (2026+) once ≥5 weeks are completed
        MIN_CURRENT_WEEKS = 5
        if current_year > 2025:
            weeks_curr = reg_weeks_for_year(current_year)
            if weeks_curr >= MIN_CURRENT_WEEKS:
                seasons.append(current_year)
                print(f"[nfl_data_py] Including {current_year}: {weeks_curr} completed weeks")
            else:
                wk_str = str(weeks_curr) if weeks_curr >= 0 else "none"
                print(f"[nfl_data_py] Skipping {current_year}: {wk_str} week(s), need ≥{MIN_CURRENT_WEEKS}")

        seasons = sorted(seasons)
        print(f"[nfl_data_py] Requesting seasons from nfl_data_py: {seasons}")
        df = nfl.import_weekly_data(seasons)

        # Keep regular season only (handle both "REG" and "Regular Season" formats)
        if "season_type" in df.columns:
            df = df[df["season_type"].str.upper().str.startswith("REG")]

        # Explicit guard: strip any rows from years we didn't ask for.
        # If nfl_data_py returned 2024 rows when we asked for 2025, this removes them.
        if "season" in df.columns:
            before = len(df)
            df = df[df["season"].isin(seasons)]
            after = len(df)
            actual = sorted([int(s) for s in df["season"].unique()]) if after > 0 else []
            print(f"[nfl_data_py] After season filter: {before}→{after} rows, actual seasons={actual}")
            if not actual or 2025 not in actual:
                print(f"[nfl_data_py] ERROR: 2025 not in actual data {actual} — switching to Sleeper fallback")
                _load_sleeper_fallback()
                return
            # Record what we actually have, not just what we requested
            _loaded_seasons = actual
        else:
            _loaded_seasons = seasons

        # Normalise 'recent_team' → 'team' when needed
        if "recent_team" in df.columns and "team" not in df.columns:
            df = df.rename(columns={"recent_team": "team"})

        # Ensure all base columns exist (fill 0 when missing)
        for col in ["passing_yards", "rushing_yards", "receiving_yards",
                    "passing_tds", "rushing_tds", "receiving_tds",
                    "completions", "attempts", "receptions", "targets",
                    "interceptions", "fantasy_points_ppr"]:
            if col not in df.columns:
                df[col] = 0.0

        # Combo columns
        df["rush_rec_yards"]  = df["rushing_yards"].fillna(0) + df["receiving_yards"].fillna(0)
        df["rush_rec_tds"]    = df["rushing_tds"].fillna(0)   + df["receiving_tds"].fillna(0)
        df["pass_rush_yards"] = df["passing_yards"].fillna(0) + df["rushing_yards"].fillna(0)

        # carries → rushing_attempts alias
        if "carries" not in df.columns:
            df["carries"] = df.get("rushing_attempts", 0)

        # Normalised display name for fuzzy matching
        name_col = "player_display_name" if "player_display_name" in df.columns else "player_name"
        df["_norm_name"] = df[name_col].fillna("").apply(_norm)

        _weekly_df = df

        # Snap counts live in a separate dataset (not in weekly player data)
        try:
            snaps = nfl.import_snap_counts(seasons)
            # Prefer pfr_player_name (full name) over 'player' (abbreviated)
            snap_name_col = next(
                (c for c in ['pfr_player_name', 'player_name', 'player'] if c in snaps.columns),
                None
            )
            if snap_name_col:
                snaps['_norm_name'] = snaps[snap_name_col].fillna('').apply(_norm)
                _snap_df = snaps
                print(f"[nfl_data_py] Snap counts: {len(snaps):,} rows")
        except Exception as snap_err:
            print(f"[nfl_data_py] Snap counts failed: {snap_err}")

        _data_loaded = True
        print(f"[nfl_data_py] Ready — {len(df):,} player-weeks across seasons {_loaded_seasons}")
    except Exception as exc:
        print(f"[nfl_data_py] Load error: {exc}")
        # Attempt Sleeper API fallback so 2025 data is always available
        _load_sleeper_fallback()
    finally:
        _data_loading = False


def _load_sleeper_fallback():
    """
    Fetch 2025 NFL regular-season player stats from the Sleeper API.
    Used when nfl_data_py cannot provide 2025 data (old library version, network
    issue, or data not yet published).  The frontend already uses Sleeper for the
    fantasy/start-sit section, so this source is confirmed to have 2025 data.
    """
    global _weekly_df, _data_loaded, _loaded_seasons
    import urllib.request
    import json
    import pandas as pd

    print("[sleeper] nfl_data_py unavailable — falling back to Sleeper stats API for 2025")

    # ── 1. Player roster (name, team, position) ──────────────────────────────
    try:
        with urllib.request.urlopen(
            "https://api.sleeper.app/v1/players/nfl", timeout=30
        ) as resp:
            players: dict = json.loads(resp.read())
    except Exception as e:
        print(f"[sleeper] Failed to fetch player list: {e}")
        return

    player_info: dict[str, dict] = {}
    for pid, p in players.items():
        if p.get("active") and p.get("full_name") and p.get("position") in (
            "QB", "RB", "WR", "TE", "FB", "K", "DEF"
        ):
            player_info[pid] = {
                "name":     p["full_name"],
                "team":     p.get("team") or "",
                "position": p.get("position") or "",
            }

    # ── 2. Weekly stats for all 18 weeks of the 2025 regular season ──────────
    rows: list[dict] = []
    for week in range(1, 19):
        url = f"https://api.sleeper.app/v1/stats/nfl/regular/2025/{week}"
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                week_stats: dict = json.loads(resp.read())
        except Exception as e:
            print(f"[sleeper] Week {week} failed: {e}")
            continue

        if not week_stats:
            continue

        fetched = 0
        for pid, stats in week_stats.items():
            if pid not in player_info or not stats:
                continue
            info = player_info[pid]

            def s(key, default=0.0):
                v = stats.get(key)
                try:
                    return float(v) if v is not None else default
                except (TypeError, ValueError):
                    return default

            rows.append({
                "season":               2025,
                "week":                 week,
                "season_type":          "REG",
                "player_display_name":  info["name"],
                "team":                 info["team"],
                "position":             info["position"],
                "opponent_team":        stats.get("opp") or "",
                "home_team":            stats.get("home_team") or "",
                "passing_yards":        s("pass_yd"),
                "passing_tds":          s("pass_td"),
                "completions":          s("pass_cmp"),
                "attempts":             s("pass_att"),
                "interceptions":        s("pass_int"),
                "rushing_yards":        s("rush_yd"),
                "rushing_tds":          s("rush_td"),
                "carries":              s("rush_att"),
                "receiving_yards":      s("rec_yd"),
                "receiving_tds":        s("rec_td"),
                "receptions":           s("rec"),
                "targets":              s("rec_tgt"),
                "target_share":         stats.get("tgt_sh"),
                "air_yards_share":      stats.get("ay_sh"),
                "fantasy_points_ppr":   s("pts_ppr"),
                "sacks":                s("sack"),
                "tackles_combined":     s("tkl_solo") + s("tkl_ast"),
            })
            fetched += 1

        print(f"[sleeper] 2025 Week {week}: {fetched} player rows")

    if not rows:
        print("[sleeper] No data collected — both nfl_data_py and Sleeper unavailable")
        return

    df = pd.DataFrame(rows)

    # Combo columns to match nfl_data_py schema
    df["rush_rec_yards"]  = df["rushing_yards"].fillna(0) + df["receiving_yards"].fillna(0)
    df["rush_rec_tds"]    = df["rushing_tds"].fillna(0)   + df["receiving_tds"].fillna(0)
    df["pass_rush_yards"] = df["passing_yards"].fillna(0) + df["rushing_yards"].fillna(0)

    # Normalised name for fuzzy matching
    df["_norm_name"] = df["player_display_name"].fillna("").apply(_norm)

    _weekly_df      = df
    _loaded_seasons = [2025]
    _data_loaded    = True
    print(f"[sleeper] Ready — {len(df):,} player-weeks for 2025 season")


@app.on_event("startup")
async def _startup():
    threading.Thread(target=_load_nfl_data, daemon=True).start()
    threading.Thread(target=_load_trend_data, daemon=True).start()


def _player_analytics(name: str, prop_type: str, line, df) -> dict | None:
    """Return game-log analytics for one player × prop_type combination."""
    import pandas as pd

    norm = _norm(name)
    pdf = df[df["_norm_name"] == norm]

    # Last-name + first-initial fallback
    if pdf.empty:
        parts = norm.split()
        if len(parts) >= 2:
            candidates = df[df["_norm_name"].str.endswith(" " + parts[-1])]
            if len(candidates) > 0:
                pdf = candidates[candidates["_norm_name"].str.startswith(parts[0][0])]
    if pdf.empty:
        return None

    cols = PROP_COLS.get(prop_type, [])
    if not cols:
        return None
    # Skip if none of the columns are present
    available_cols = [c for c in cols if c in pdf.columns]
    if not available_cols:
        return None

    pdf = pdf.sort_values(["season", "week"], ascending=[False, False]).copy()

    def stat_value(row) -> float:
        return round(sum(row.get(c, 0) or 0 for c in available_cols), 1)

    pdf["_val"] = pdf.apply(stat_value, axis=1)

    # Build per-game logs (up to 20 most recent)
    logs: list[dict] = []
    for _, row in pdf.head(20).iterrows():
        team      = str(row.get("team", "") or "")
        home_team = str(row.get("home_team", "") or "")
        opp       = str(row.get("opponent_team", "") or "")
        is_home   = (team == home_team) if home_team else None
        logs.append({
            "value":  float(row["_val"]),
            "team":   team,
            "opp":    opp,
            "date":   f"{int(row['season'])}-W{int(row['week'])}",
            "isHome": is_home,
            "season": int(row["season"]),
            "week":   int(row["week"]),
        })

    v20 = [g["value"] for g in logs]
    v10 = v20[:10]
    v5  = v20[:5]

    def avg(vals):
        return round(sum(vals) / len(vals), 1) if vals else None

    def hit_rate(vals):
        if not vals or line is None:
            return None
        return round(sum(1 for v in vals if v > line) / len(vals) * 100)

    # Season stats (latest season in the dataset)
    latest_season = int(pdf["season"].max())
    season_vals = pdf[pdf["season"] == latest_season]["_val"].dropna().tolist()

    # Target share (average last 5 games, from weekly data)
    target_share = None
    if "target_share" in pdf.columns:
        ts_vals = pdf.head(5)["target_share"].dropna().tolist()
        target_share = round(sum(ts_vals) / len(ts_vals), 3) if ts_vals else None

    # Air yards share as aDOT proxy (average last 5 games)
    adot = None
    if "air_yards_share" in pdf.columns:
        ay_vals = pdf.head(5)["air_yards_share"].dropna().tolist()
        if ay_vals:
            adot = round(sum(ay_vals) / len(ay_vals) * 100, 1)

    # Snap percentage — from the separate snap counts dataset
    snap_pct = None
    if _snap_df is not None:
        snorm = _norm(name)
        sdf = _snap_df[_snap_df["_norm_name"] == snorm]
        if sdf.empty:
            parts = snorm.split()
            if len(parts) >= 2:
                cands = _snap_df[_snap_df["_norm_name"].str.endswith(" " + parts[-1])]
                if not cands.empty:
                    sdf = cands[cands["_norm_name"].str.startswith(parts[0][0])]
        if not sdf.empty and "offense_pct" in sdf.columns:
            sdf = sdf.sort_values(["season", "week"], ascending=[False, False])
            sp_vals = sdf.head(5)["offense_pct"].dropna().tolist()
            if sp_vals:
                snap_pct = round(sum(sp_vals) / len(sp_vals), 3)

    # EPA per game — pick the column that matches the prop type
    EPA_COL: dict[str, str] = {
        "passing_yards": "passing_epa", "passing_tds": "passing_epa",
        "completions": "passing_epa", "passing_ints": "passing_epa",
        "rushing_yards": "rushing_epa", "rushing_tds": "rushing_epa",
        "rushing_attempts": "rushing_epa",
        "receiving_yards": "receiving_epa", "receiving_tds": "receiving_epa",
        "receptions": "receiving_epa", "rush_rec_yards": "receiving_epa",
        "rush_rec_tds": "receiving_epa", "fantasy_points": "receiving_epa",
    }
    epa_per_game = None
    epa_col = EPA_COL.get(prop_type)
    if epa_col and epa_col in pdf.columns:
        epa_vals = pdf.head(10)[epa_col].dropna().tolist()
        if epa_vals:
            epa_per_game = round(sum(epa_vals) / len(epa_vals), 2)

    avg10 = avg(v10)
    avg5  = avg(v5)
    edge  = round(avg10 - line, 1) if avg10 is not None and line is not None else None

    # Home / away splits
    home_vals = [g["value"] for g in logs if g.get("isHome")]
    away_vals = [g["value"] for g in logs if not g.get("isHome")]

    return {
        "avg_last_10":       avg10,
        "avg_last_5":        avg5,
        "avg_last_20":       avg(v20),
        "hit_rate_last_10":  hit_rate(v10),
        "hit_rate_last_5":   hit_rate(v5),
        "hit_rate_last_20":  hit_rate(v20),
        "season_avg":        avg(season_vals),
        "season_games":      len(season_vals),
        "season_hit_rate":   hit_rate(season_vals),
        "last_10_games":     v10,
        "last_5_games":      v5,
        "last_20_games":     v20,
        "game_logs_last_10": logs[:10],
        "game_logs_last_20": logs,
        "target_share":      target_share,
        "snap_pct":          snap_pct,
        "adot":              adot,
        "epa_per_game":      epa_per_game,
        "edge":              edge,
        "projection":        avg5 if avg5 is not None else avg10,
        "home_avg":          avg(home_vals),
        "away_avg":          avg(away_vals),
        "home_hit_rate":     hit_rate(home_vals),
        "away_hit_rate":     hit_rate(away_vals),
        "home_games_count":  len(home_vals),
        "away_games_count":  len(away_vals),
        "data_seasons":      latest_season,
    }


# ── Player game logs (bulk) ───────────────────────────────────────────────────
@app.post("/api/player-gamelogs-bulk")
async def player_gamelogs_bulk(request: Request):
    body = await request.json()

    # New format: [{name, prop_type, line}, ...]
    player_props = body.get("playerProps", [])

    # Backward compat: old format sent only playerNames
    if not player_props:
        names = body.get("playerNames", [])
        return {"analytics": {n: None for n in names}, "data_loaded": _data_loaded}

    if not _data_loaded or _weekly_df is None:
        return {
            "analytics":    {pp["name"]: None for pp in player_props},
            "data_loaded":  False,
            "data_loading": _data_loading,
        }

    analytics: dict = {}
    for pp in player_props:
        name      = pp.get("name", "")
        prop_type = pp.get("prop_type", "")
        line      = pp.get("line")
        result    = _player_analytics(name, prop_type, line, _weekly_df)
        if name not in analytics:
            analytics[name] = {}
        analytics[name][prop_type] = result

    return {"analytics": analytics, "data_loaded": True}


# ── Weather (Open-Meteo, free, no key) ───────────────────────────────────────
STADIUMS: dict[str, dict] = {
    "ARI": {"lat": 33.5277,  "lon": -112.2626, "dome": True},
    "ATL": {"lat": 33.7554,  "lon": -84.4009,  "dome": True},
    "BAL": {"lat": 39.2780,  "lon": -76.6227,  "dome": False},
    "BUF": {"lat": 42.7738,  "lon": -78.7870,  "dome": False},
    "CAR": {"lat": 35.2258,  "lon": -80.8528,  "dome": False},
    "CHI": {"lat": 41.8623,  "lon": -87.6167,  "dome": False},
    "CIN": {"lat": 39.0954,  "lon": -84.5160,  "dome": False},
    "CLE": {"lat": 41.5061,  "lon": -81.6995,  "dome": False},
    "DAL": {"lat": 32.7473,  "lon": -97.0945,  "dome": True},
    "DEN": {"lat": 39.7439,  "lon": -105.0201, "dome": False},
    "DET": {"lat": 42.3400,  "lon": -83.0456,  "dome": True},
    "GB":  {"lat": 44.5013,  "lon": -88.0622,  "dome": False},
    "HOU": {"lat": 29.6847,  "lon": -95.4107,  "dome": True},
    "IND": {"lat": 39.7601,  "lon": -86.1639,  "dome": True},
    "JAX": {"lat": 30.3239,  "lon": -81.6373,  "dome": False},
    "KC":  {"lat": 39.0489,  "lon": -94.4839,  "dome": False},
    "LAC": {"lat": 33.9535,  "lon": -118.3392, "dome": True},
    "LAR": {"lat": 33.9535,  "lon": -118.3392, "dome": True},
    "LV":  {"lat": 36.0909,  "lon": -115.1833, "dome": True},
    "MIA": {"lat": 25.9580,  "lon": -80.2389,  "dome": False},
    "MIN": {"lat": 44.9737,  "lon": -93.2572,  "dome": True},
    "NE":  {"lat": 42.0909,  "lon": -71.2643,  "dome": False},
    "NO":  {"lat": 29.9511,  "lon": -90.0812,  "dome": True},
    "NYG": {"lat": 40.8135,  "lon": -74.0745,  "dome": False},
    "NYJ": {"lat": 40.8135,  "lon": -74.0745,  "dome": False},
    "PHI": {"lat": 39.9007,  "lon": -75.1674,  "dome": False},
    "PIT": {"lat": 40.4468,  "lon": -80.0158,  "dome": False},
    "SF":  {"lat": 37.4033,  "lon": -121.9694, "dome": False},
    "SEA": {"lat": 47.5952,  "lon": -122.3316, "dome": False},
    "TB":  {"lat": 27.9759,  "lon": -82.5033,  "dome": False},
    "TEN": {"lat": 36.1665,  "lon": -86.7713,  "dome": False},
    "WAS": {"lat": 38.9076,  "lon": -76.8645,  "dome": False},
}

_weather_cache: dict = {}
WEATHER_TTL = 3 * 3600  # 3 hours

@app.get("/api/weather/{home_team}")
async def get_weather(home_team: str):
    team    = home_team.upper()
    stadium = STADIUMS.get(team)
    if not stadium:
        return {"dome": False, "wind_mph": None, "error": "unknown team"}

    if stadium["dome"]:
        return {"dome": True, "wind_mph": 0, "precip_mm": 0, "temp_f": 72, "is_windy": False, "is_rainy": False}

    cached = _weather_cache.get(team)
    if cached and time.time() - cached["ts"] < WEATHER_TTL:
        return cached["data"]

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude":        stadium["lat"],
                    "longitude":       stadium["lon"],
                    "hourly":          "windspeed_10m,precipitation,temperature_2m",
                    "forecast_days":   7,
                    "timezone":        "auto",
                    "wind_speed_unit": "mph",
                },
            )
        if r.status_code != 200:
            return {"dome": False, "wind_mph": None, "error": f"HTTP {r.status_code}"}

        hourly  = r.json().get("hourly", {})
        times   = hourly.get("time", [])
        winds   = hourly.get("windspeed_10m", [])
        precips = hourly.get("precipitation", [])
        temps   = hourly.get("temperature_2m", [])

        # Filter to game-time hours (noon–8 pm local) across all 7 days
        game_winds, game_precips, game_temps = [], [], []
        for i, t in enumerate(times):
            if "T" in t:
                hour = int(t.split("T")[1][:2])
                if 12 <= hour <= 20:
                    if i < len(winds):   game_winds.append(winds[i])
                    if i < len(precips): game_precips.append(precips[i])
                    if i < len(temps):   game_temps.append(temps[i])

        wind_mph  = round(max(game_winds), 1)  if game_winds  else None
        precip_mm = round(max(game_precips), 1) if game_precips else 0
        temp_c    = game_temps[0] if game_temps else None
        temp_f    = round(temp_c * 9 / 5 + 32, 1) if temp_c is not None else None

        result = {
            "dome":      False,
            "wind_mph":  wind_mph,
            "precip_mm": precip_mm,
            "temp_f":    temp_f,
            "is_windy":  wind_mph is not None and wind_mph > 15,
            "is_rainy":  precip_mm is not None and precip_mm > 5,
        }
        _weather_cache[team] = {"data": result, "ts": time.time()}
        return result

    except Exception as exc:
        return {"dome": False, "wind_mph": None, "error": str(exc)}


# ── PrizePicks NFL Props ───────────────────────────────────────────────────────
_pp_cache: dict = {"data": None, "ts": 0.0}
PP_CACHE_TTL = 30 * 60

@app.get("/api/prizepicks/props")
async def prizepicks_props():
    now = time.time()
    if _pp_cache["data"] is not None and now - _pp_cache["ts"] < PP_CACHE_TTL:
        return _pp_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                "https://api.prizepicks.com/projections",
                params={"league_id": "9", "per_page": "250", "single_stat": "true"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if r.status_code != 200:
                if _pp_cache["data"] is not None:
                    return _pp_cache["data"]
                return {"rawProps": [], "source": "prizepicks", "error": f"HTTP {r.status_code}"}

            data        = r.json()
            projections = data.get("data", [])
            included    = {i["id"]: i for i in data.get("included", [])}

            STAT_MAP = {
                "Passing Yards": "passing_yards", "Passing TDs": "passing_tds",
                "Rushing Yards": "rushing_yards", "Rushing Attempts": "rushing_attempts",
                "Receiving Yards": "receiving_yards", "Receptions": "receptions",
                "Fantasy Points": "fantasy_points", "Kicking Points": "kicking_points",
                "Completions": "completions", "Tackles": "tackles", "Sacks": "sacks",
                "Interceptions": "interceptions",
            }

            props = []
            for proj in projections:
                attrs     = proj.get("attributes", {})
                if attrs.get("status") not in ("pre_game", "in_progress"):
                    continue
                prop_type = STAT_MAP.get(attrs.get("stat_type", ""))
                if not prop_type:
                    continue
                line = attrs.get("line_score")
                if line is None:
                    continue

                rels      = proj.get("relationships", {})
                player_id = (rels.get("new_player") or {}).get("data", {}).get("id")
                game_id   = (rels.get("game") or {}).get("data", {}).get("id")
                player    = included.get(player_id, {}).get("attributes", {})
                game      = included.get(game_id, {}).get("attributes", {})

                props.append({
                    "player_name":  player.get("display_name") or player.get("name", ""),
                    "team":         player.get("team", ""),
                    "position":     player.get("position", ""),
                    "prop_type":    prop_type,
                    "line":         float(line),
                    "over_odds":    -110,
                    "under_odds":   -110,
                    "home":         game.get("home_team", ""),
                    "away":         game.get("away_team", ""),
                    "scheduled_at": attrs.get("start_time"),
                })

        result = {"rawProps": props, "source": "prizepicks", "game_date": "Today"}
        _pp_cache["data"] = result
        _pp_cache["ts"]   = now
        return result

    except Exception as e:
        if _pp_cache["data"] is not None:
            return _pp_cache["data"]
        return {"rawProps": [], "source": "prizepicks", "error": str(e)}


# ── DraftKings NFL Props ───────────────────────────────────────────────────────
@app.get("/api/draftkings/props")
async def draftkings_props():
    return {"rawProps": [], "source": "draftkings", "game_date": "Today"}


# ── Underdog NFL Props ─────────────────────────────────────────────────────────
@app.get("/api/underdog/props")
async def underdog_props():
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                "https://api.underdogfantasy.com/v1/over_under_lines",
                params={"sport_id": "NFL"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if r.status_code != 200:
                return {"rawProps": [], "source": "underdog"}

            data        = r.json()
            lines       = data.get("over_under_lines", [])
            players     = {p["id"]: p for p in data.get("players", [])}
            appearances = {a["id"]: a for a in data.get("appearances", [])}

            STAT_MAP = {
                "passing_yds": "passing_yards", "rushing_yds": "rushing_yards",
                "receiving_yds": "receiving_yards", "receptions": "receptions",
                "receiving_rec": "receptions", "passing_tds": "passing_tds",
                "rushing_tds": "rushing_tds", "receiving_tds": "receiving_tds",
                "rush_rec_tds": "rush_rec_tds", "rush_rec_yds": "rush_rec_yards",
                "fantasy_pts": "fantasy_points", "passing_ints": "passing_ints",
                "sacks": "sacks", "passing_and_rushing_yds": "pass_rush_yards",
                "passing_long": "passing_long", "rushing_long": "rushing_long",
                "rushing_att": "rushing_attempts",
                "period_1_receiving_yds":   "q1_receiving_yards",
                "period_1_receiving_rec":   "q1_receptions",
                "period_1_passing_yds":     "q1_passing_yards",
                "period_1_rushing_yds":     "q1_rushing_yards",
                "period_1_rush_rec_tds":    "q1_rush_rec_tds",
                "period_1_2_receiving_yds": "h1_receiving_yards",
                "period_1_2_receiving_rec": "h1_receptions",
                "period_1_2_passing_yds":   "h1_passing_yards",
                "period_1_2_rushing_yds":   "h1_rushing_yards",
                "period_1_2_rush_rec_tds":  "h1_rush_rec_tds",
            }

            team_uuid_map = {}
            game_info_map = {}
            for g in data.get("games", []):
                title      = g.get("abbreviated_title", "")
                parts      = [p.strip() for p in title.split(" @ ")]
                away_abbrev = parts[0] if len(parts) >= 1 else ""
                home_abbrev = parts[1] if len(parts) >= 2 else ""
                away_uuid  = g.get("away_team_id", "")
                home_uuid  = g.get("home_team_id", "")
                if away_uuid and away_abbrev:
                    team_uuid_map[away_uuid] = away_abbrev
                if home_uuid and home_abbrev:
                    team_uuid_map[home_uuid] = home_abbrev
                g_id = g.get("id")
                if g_id is not None:
                    game_info_map[g_id] = {
                        "home": home_abbrev, "away": away_abbrev,
                        "home_team_id": home_uuid,
                        "scheduled_at": g.get("scheduled_at") or g.get("start_time", ""),
                    }

            props = []
            for line in lines:
                if line.get("status") != "active":
                    continue
                stat_value = line.get("stat_value")
                if stat_value is None:
                    continue

                ou           = line.get("over_under", {})
                app_stat     = ou.get("appearance_stat", {})
                stat         = app_stat.get("stat", "")
                display_stat = app_stat.get("display_stat", "")
                appearance_id = app_stat.get("appearance_id")

                prop_type = STAT_MAP.get(stat)
                if not prop_type or not appearance_id:
                    continue

                appearance = appearances.get(appearance_id, {})
                player_id  = appearance.get("player_id")
                player     = players.get(player_id, {}) if player_id else {}
                if not player:
                    continue
                if player.get("sport_id") != "NFL":
                    continue

                name = f"{player.get('first_name', '')} {player.get('last_name', '')}".strip()
                if not name:
                    continue

                team_uuid   = appearance.get("team_id", "")
                match_id    = appearance.get("match_id")
                team_abbrev = team_uuid_map.get(team_uuid, "")
                game_meta   = game_info_map.get(match_id, {})
                home        = game_meta.get("home", "")
                away        = game_meta.get("away", "")
                opponent    = away if team_abbrev and team_abbrev == home else (home if team_abbrev else "")
                scheduled_at = game_meta.get("scheduled_at", "")

                over_odds, under_odds = -110, -110
                for opt in line.get("options", []):
                    try:
                        price = int(opt.get("american_price", -110))
                    except (TypeError, ValueError):
                        price = -110
                    if opt.get("choice") == "higher":
                        over_odds = price
                    elif opt.get("choice") == "lower":
                        under_odds = price

                props.append({
                    "player_name":  name,
                    "team":         team_abbrev,
                    "position":     player.get("position_name", ""),
                    "prop_type":    prop_type,
                    "line":         float(stat_value),
                    "over_odds":    over_odds,
                    "under_odds":   under_odds,
                    "display_stat": display_stat,
                    "home":         home,
                    "away":         away,
                    "opponent":     opponent,
                    "scheduled_at": scheduled_at,
                    "image_url":    player.get("image_url") or player.get("dark_image_url") or "",
                })

        return {"rawProps": props, "source": "underdog", "game_date": "Today"}
    except Exception as e:
        return {"rawProps": [], "source": "underdog", "error": str(e)}


# ── Live Props (aggregated) ───────────────────────────────────────────────────
@app.get("/api/live-props")
async def live_props():
    pp, ud, dk = await asyncio.gather(
        prizepicks_props(), underdog_props(), draftkings_props(),
        return_exceptions=True,
    )
    all_props = []
    for result in [pp, ud, dk]:
        if isinstance(result, dict):
            all_props.extend(result.get("rawProps", []))

    seen = {}
    for p in all_props:
        key = f"{p['player_name']}__{p['prop_type']}"
        if key not in seen:
            seen[key] = p

    return {"rawProps": list(seen.values()), "game_date": "Today", "games_summary": []}


# ── Game Odds (The Odds API) ──────────────────────────────────────────────────
NFL_TEAM_ABBREV = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}

def _abbrev(name: str) -> str:
    return NFL_TEAM_ABBREV.get(name, name.split()[-1][:3].upper())

@app.get("/api/odds/games")
async def odds_games(bookmakers: str = "draftkings,fanduel,betmgm,caesars,pointsbetus"):
    api_key = os.environ.get("ODDS_API_KEY", "")
    if not api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/",
                params={
                    "apiKey": api_key, "regions": "us",
                    "markets": "h2h,spreads,totals",
                    "bookmakers": bookmakers.replace(" ", ""),
                    "oddsFormat": "american",
                },
            )
            if r.status_code != 200:
                return []
            events = r.json()

        games = []
        for ev in events:
            home_name = ev.get("home_team", "")
            away_name = ev.get("away_team", "")
            homeAbv   = _abbrev(home_name)
            awayAbv   = _abbrev(away_name)

            all_books = []
            p_ml_h = p_ml_a = None
            p_sp_h = p_sp_a = None
            p_sp_ho = p_sp_ao = -110
            p_tot = p_tot_o = p_tot_u = None

            for bm in ev.get("bookmakers", []):
                bk: dict = {"key": bm["key"], "title": bm["title"]}
                for mkt in bm.get("markets", []):
                    outs = {o["name"]: o for o in mkt.get("outcomes", [])}
                    if mkt["key"] == "h2h":
                        bk["ml_home"] = outs.get(home_name, {}).get("price")
                        bk["ml_away"] = outs.get(away_name, {}).get("price")
                        if p_ml_h is None:
                            p_ml_h, p_ml_a = bk.get("ml_home"), bk.get("ml_away")
                    elif mkt["key"] == "spreads":
                        ho = outs.get(home_name, {})
                        ao = outs.get(away_name, {})
                        bk["spread_home"]      = ho.get("point")
                        bk["spread_away"]      = ao.get("point")
                        bk["spread_home_odds"] = ho.get("price", -110)
                        bk["spread_away_odds"] = ao.get("price", -110)
                        if p_sp_h is None:
                            p_sp_h, p_sp_a   = bk.get("spread_home"), bk.get("spread_away")
                            p_sp_ho, p_sp_ao = bk.get("spread_home_odds", -110), bk.get("spread_away_odds", -110)
                    elif mkt["key"] == "totals":
                        ov = outs.get("Over", {})
                        un = outs.get("Under", {})
                        bk["total_line"]       = ov.get("point")
                        bk["total_over_odds"]  = ov.get("price", -110)
                        bk["total_under_odds"] = un.get("price", -110)
                        if p_tot is None:
                            p_tot   = bk.get("total_line")
                            p_tot_o = bk.get("total_over_odds", -110)
                            p_tot_u = bk.get("total_under_odds", -110)
                all_books.append(bk)

            games.append({
                "id":            ev.get("id", ""),
                "commence_time": ev.get("commence_time", ""),
                "homeAbv":       homeAbv,
                "awayAbv":       awayAbv,
                "moneyline":     {"home": p_ml_h, "away": p_ml_a, "bookmaker": all_books[0]["title"] if all_books else ""},
                "spread":        {"home": p_sp_h, "homeOdds": p_sp_ho, "away": p_sp_a, "awayOdds": p_sp_ao},
                "total":         {"line": p_tot, "overOdds": p_tot_o, "underOdds": p_tot_u},
                "allBooks":      all_books,
                "is_preseason":  False,
                "week":          None,
            })

        return games
    except Exception:
        return []


# ── Team Context ──────────────────────────────────────────────────────────────

# Cache computed defensive stats so we don't reprocess on every request
_defense_cache: dict | None = None

# nfl_data_py → frontend team abbreviation normalization
_TEAM_ABBREV = {
    "JAC": "JAX", "WSH": "WAS", "OAK": "LV",
    "SD":  "LAC", "STL": "LAR", "ARZ": "ARI",
}

def _compute_team_defense(df):
    """
    Compute real per-game defensive stats for every team from the loaded weekly data.
    Uses only the most recent season in the dataset (typically 2025).

    Returns (teams_dict, league_avgs_dict).
    """
    import pandas as pd

    if df is None or len(df) == 0:
        return {}, {}
    if "opponent_team" not in df.columns or "position" not in df.columns:
        return {}, {}

    # Only the most recently loaded regular season
    latest = int(df["season"].max())
    sdf = df[df["season"] == latest].copy()
    if sdf.empty:
        sdf = df.copy()

    # Normalise opponent abbreviations
    def norm_abbrev(t):
        if not t or (isinstance(t, float)):
            return None
        t = str(t).strip().upper()
        return _TEAM_ABBREV.get(t, t) if t else None

    sdf["_opp"] = sdf["opponent_team"].apply(norm_abbrev)
    sdf = sdf[sdf["_opp"].notna() & (sdf["_opp"] != "")]

    def per_game_avg(pos_list, stat_cols):
        """
        For the given positions, sum each stat within each (opponent, week) pair
        (= one game's worth of yards allowed), then average across all games in the season.
        """
        sub = sdf[sdf["position"].isin(pos_list)]
        valid = [c for c in stat_cols if c in sub.columns]
        if sub.empty or not valid:
            return {}
        game_totals = sub.groupby(["_opp", "week"])[valid].sum().reset_index()
        avgs = game_totals.groupby("_opp")[valid].mean()
        return {
            team: {col: round(float(val), 2) for col, val in row.items()}
            for team, row in avgs.iterrows()
        }

    pass_avgs = per_game_avg(["QB"],                   ["passing_yards",  "passing_tds"])
    rush_avgs = per_game_avg(["QB","RB","WR","TE","FB"],["rushing_yards",  "rushing_tds"])
    wr_avgs   = per_game_avg(["WR"],                   ["receiving_yards", "receiving_tds"])
    te_avgs   = per_game_avg(["TE"],                   ["receiving_yards", "receiving_tds"])
    rb_avgs   = per_game_avg(["RB","FB"],              ["receiving_yards", "receiving_tds"])

    # Static fallbacks (league-average estimates) used when a team has no data
    FALLBACK = {
        "pass_yds_allowed": 229, "pass_tds_allowed": 1.18,
        "rush_yds_allowed": 117, "rush_tds_allowed": 0.90,
        "rec_yds_allowed_wr": 151, "rec_yds_allowed_te": 58,
        "rec_yds_allowed_rb": 35,  "rec_tds_allowed": 1.18,
    }

    all_teams = set()
    for d in (pass_avgs, rush_avgs, wr_avgs, te_avgs, rb_avgs):
        all_teams.update(d.keys())

    teams: dict = {}
    for team in sorted(all_teams):
        teams[team] = {
            "pass_yds_allowed":   pass_avgs.get(team, {}).get("passing_yards",   FALLBACK["pass_yds_allowed"]),
            "pass_tds_allowed":   pass_avgs.get(team, {}).get("passing_tds",     FALLBACK["pass_tds_allowed"]),
            "rush_yds_allowed":   rush_avgs.get(team, {}).get("rushing_yards",   FALLBACK["rush_yds_allowed"]),
            "rush_tds_allowed":   rush_avgs.get(team, {}).get("rushing_tds",     FALLBACK["rush_tds_allowed"]),
            "rec_yds_allowed_wr": wr_avgs.get(team,  {}).get("receiving_yards",  FALLBACK["rec_yds_allowed_wr"]),
            "rec_tds_allowed":    wr_avgs.get(team,  {}).get("receiving_tds",    FALLBACK["rec_tds_allowed"]),
            "rec_yds_allowed_te": te_avgs.get(team,  {}).get("receiving_yards",  FALLBACK["rec_yds_allowed_te"]),
            "rec_yds_allowed_rb": rb_avgs.get(team,  {}).get("receiving_yards",  FALLBACK["rec_yds_allowed_rb"]),
        }

    # League averages derived from the real computed team values
    league_avgs: dict = {}
    if teams:
        for key in FALLBACK:
            vals = [t[key] for t in teams.values() if t.get(key) is not None]
            league_avgs[key] = round(sum(vals) / len(vals), 2) if vals else FALLBACK[key]
    else:
        league_avgs = dict(FALLBACK)

    print(f"[team-context] Computed defense for {len(teams)} teams from {latest} season data")
    return teams, league_avgs


@app.get("/api/team-context")
async def team_context():
    global _defense_cache
    if not _data_loaded or _weekly_df is None:
        return {"teams": {}, "injuries": {}, "game_spreads": {}, "league_avgs": {}, "data_loaded": False}

    if _defense_cache is None:
        try:
            teams, league_avgs = _compute_team_defense(_weekly_df)
            _defense_cache = {"teams": teams, "league_avgs": league_avgs}
        except Exception as exc:
            print(f"[team-context] Error: {exc}")
            _defense_cache = {"teams": {}, "league_avgs": {}}

    return {
        "teams":        _defense_cache["teams"],
        "league_avgs":  _defense_cache["league_avgs"],
        "injuries":     {},
        "game_spreads": {},
        "data_loaded":  True,
    }


# ── Player Trend Engine (Phase 1: Stock Up / Stock Down) ──────────────────────
#
# Tags every QB/RB/WR/TE as stock_up / stock_down / hold from real usage-share
# trend (snap share, target share, carry share) — last-3-games vs season, with
# small-sample shrinkage toward the position average. No estimated stats: every
# input below is a real, directly-reported Sleeper field (off_snp/tm_off_snp,
# rec_tgt, rush_att), never a guess or a filled-in default.
#
# Sourced from the Sleeper stats API, not nfl_data_py: nfl_data_py's
# import_weekly_data() hardcodes a GitHub release URL
# (releases/download/player_stats/player_stats_{year}.parquet) that 404s for
# any season 2025+ — nflverse restructured those releases (now
# stats_player_week_{year}.parquet under a different tag) and nfl_data_py
# 0.3.3, the latest released on PyPI, was never updated to match. Sleeper is
# the same source this app's frontend (nflLiveData.js) and this file's own
# _load_sleeper_fallback() already rely on for real current-season data, and
# it reports snap counts (off_snp/tm_off_snp) directly per player-week, which
# nflverse's weekly file doesn't even carry (snap counts are a separate
# dataset there) — so it's a better fit here, not just a fallback.
#
# Deliberately isolated from _weekly_df/_load_nfl_data above: that pipeline
# waits for 5+ completed weeks of the current season before including it, to
# protect prop-grading L5/L10 stats from tiny-sample noise. The trend engine
# instead wants in-season data from week 1 onward and protects against small
# samples with _shrink() below, so it gets its own current-season-only pull.
#
# Phase 1 scope: Momentum is driven entirely by Role Trend (usage-share
# deltas). The full spec's Opportunity Outlook (injuries/depth-chart moves)
# and Environment (schedule, Vegas totals, PROE) sub-scores are later phases
# and are not faked here. Buy Low / Sell High (needs an xFP model + market
# value data) are likewise a later phase — this ships Stock Up/Down only.

_trend_players: dict | None         = None  # player_id -> {name, team, position, weeks: [...]}
_trend_season: int | None           = None
_trend_loaded                       = False
_trend_loading                      = False
_trend_loaded_at: str | None        = None

TREND_POSITIONS = ["QB", "RB", "WR", "TE"]

# Which sticky usage metrics apply to which position. QBs have no meaningful
# target_share; carry_share doubles as "rushing involvement" for QBs (scrambles
# + designed runs), the closest real-stat proxy for the spec's QB rushing signal.
TREND_METRICS_BY_POS = {
    "QB": ["snap_share", "carry_share"],
    "RB": ["snap_share", "target_share", "carry_share"],
    "WR": ["snap_share", "target_share"],
    "TE": ["snap_share", "target_share"],
}

MIN_SNAP_SHARE_QUALIFY = 0.20   # spec: exclude backups from the position-average baseline
SHRINK_K                = 2.0   # stabilization constant for L3 shrinkage (sticky metrics -> small k)
TREND_REFRESH_TTL       = 6 * 3600  # Sleeper stats typically settle within hours of games ending


def _load_trend_data():
    """
    Pulls the current season's real weekly usage stats from the Sleeper API
    (see module comment above for why Sleeper instead of nfl_data_py here).
    """
    global _trend_players, _trend_season, _trend_loaded, _trend_loading, _trend_loaded_at
    _trend_loading = True
    try:
        import urllib.request
        import json
        import datetime

        year = datetime.datetime.now().year

        with urllib.request.urlopen("https://api.sleeper.app/v1/players/nfl", timeout=30) as resp:
            raw_players: dict = json.loads(resp.read())

        roster: dict = {}
        for pid, p in raw_players.items():
            if p.get("active") and p.get("full_name") and p.get("position") in TREND_POSITIONS:
                roster[pid] = {"name": p["full_name"], "team": p.get("team") or "", "position": p["position"]}

        players: dict = {}
        team_week_targets: dict = {}
        team_week_carries: dict = {}
        weeks_found: list = []

        for week in range(1, 19):
            url = f"https://api.sleeper.app/v1/stats/nfl/regular/{year}/{week}"
            try:
                with urllib.request.urlopen(url, timeout=30) as resp:
                    week_stats: dict = json.loads(resp.read())
            except Exception as e:
                print(f"[trend-engine] {year} week {week} fetch failed: {e}")
                continue
            if not week_stats:
                continue
            weeks_found.append(week)

            for pid, stats in week_stats.items():
                if pid not in roster or not stats:
                    continue
                team = roster[pid]["team"]
                targets = float(stats.get("rec_tgt") or 0)
                carries = float(stats.get("rush_att") or 0)
                off_snp = stats.get("off_snp")
                tm_off_snp = stats.get("tm_off_snp")
                snap_share = (off_snp / tm_off_snp) if (off_snp is not None and tm_off_snp) else None

                entry = players.setdefault(pid, {**roster[pid], "weeks": []})
                entry["team"] = team
                entry["weeks"].append({
                    "week": week, "team": team,
                    "snap_share": snap_share, "targets": targets, "carries": carries,
                })

                if team:
                    key = (team, week)
                    team_week_targets[key] = team_week_targets.get(key, 0.0) + targets
                    team_week_carries[key] = team_week_carries.get(key, 0.0) + carries

        if not players:
            print(f"[trend-engine] No {year} weekly stats available yet")
            return

        # Now that team-week totals are known, convert raw targets/carries into shares.
        for p in players.values():
            for w in p["weeks"]:
                tt = team_week_targets.get((w["team"], w["week"]))
                tc = team_week_carries.get((w["team"], w["week"]))
                w["target_share"] = (w["targets"] / tt) if tt else None
                w["carry_share"]  = (w["carries"] / tc) if tc else None
                del w["targets"]
                del w["carries"]
            p["weeks"].sort(key=lambda wk: wk["week"])

        _trend_players   = players
        _trend_season    = year
        _trend_loaded    = True
        _trend_loaded_at = datetime.datetime.utcnow().isoformat() + "Z"
        print(f"[trend-engine] Ready — {year} weeks {weeks_found}, {len(players)} players")
    except Exception as exc:
        print(f"[trend-engine] Load error: {exc}")
    finally:
        _trend_loading = False


def _shrink(stat, pos_avg, n, k=SHRINK_K):
    """adjusted = (player_stat*n + pos_avg*k) / (n+k) — pulls small samples toward the position mean."""
    if stat is None or pos_avg is None:
        return stat
    return (stat * n + pos_avg * k) / (n + k)


def _mean(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def _std(vals, mean_val):
    vals = [v for v in vals if v is not None]
    if len(vals) < 2 or mean_val is None:
        return None
    return (sum((v - mean_val) ** 2 for v in vals) / (len(vals) - 1)) ** 0.5


def _compute_trend_scores():
    players = _trend_players or {}
    if not players:
        return {"data_loaded": False, "players": [], "season": _trend_season, "data_as_of": _trend_loaded_at}

    # ── Per-player season / L3 / L1 for each usage metric ───────────────────
    computed = []
    for pid, p in players.items():
        weeks = p["weeks"]
        n_games = len(weeks)
        if n_games == 0:
            continue
        # Once there are 4+ games, compare last-3-games vs full season (the
        # spec's definition, with L3 as a subset of season — standard, accepted
        # overlap for a "recent form vs season" read). Below that, L3 and season
        # would be the exact same games, so there's nothing to compare — instead
        # compare the most recent game against everything before it. Still two
        # genuinely different, non-overlapping sets of games, just smaller ones,
        # so the signal is real (noisier, but real) rather than fabricated.
        uses_l3_window = n_games >= 4
        last3 = weeks[-3:]
        metrics = {}
        for metric in ("snap_share", "target_share", "carry_share"):
            if uses_l3_window:
                season_vals = [w[metric] for w in weeks if w[metric] is not None]
                recent_vals = [w[metric] for w in last3  if w[metric] is not None]
            else:
                season_vals = [w[metric] for w in weeks[:-1] if w[metric] is not None]
                recent_vals = [weeks[-1][metric]] if weeks[-1][metric] is not None else []
            metrics[metric] = {
                "season":   _mean(season_vals),
                "l3":       _mean(recent_vals),
                "l1":       weeks[-1][metric],
                "n_l3":     len(recent_vals),
                "n_season": len(season_vals),
            }
        computed.append({
            "player_id": pid, "name": p["name"], "team": p["team"], "position": p["position"],
            "games_played": n_games, "metrics": metrics, "uses_l3_window": uses_l3_window,
            "qualifies": (metrics["snap_share"]["l1"] or 0) >= MIN_SNAP_SHARE_QUALIFY,
        })

    # ── Position averages (qualifying population only) — shrinkage targets ──
    pos_avgs: dict = {}
    for pos in TREND_POSITIONS:
        pos_players = [c for c in computed if c["position"] == pos and c["qualifies"]]
        pos_avgs[pos] = {
            metric: _mean([c["metrics"][metric]["season"] for c in pos_players])
            for metric in ("snap_share", "target_share", "carry_share")
        }

    # ── Role Trend = shrunk recent-window - season/prior baseline ───────────
    # A single game (games_played == 1) has nothing to compare against at all —
    # that's the only real floor. Everything from 2 games on gets a real,
    # non-fabricated comparison (see the uses_l3_window branch above).
    MIN_GAMES_FOR_TREND = 2
    role_trend_raw: dict = {}
    for c in computed:
        if c["games_played"] < MIN_GAMES_FOR_TREND:
            role_trend_raw[c["player_id"]] = {}
            continue
        applicable = TREND_METRICS_BY_POS.get(c["position"], [])
        deltas = {}
        for metric in applicable:
            m = c["metrics"][metric]
            pos_avg = pos_avgs.get(c["position"], {}).get(metric)
            shrunk_recent = _shrink(m["l3"], pos_avg, m["n_l3"])
            # In the small-sample fallback, the baseline is just as thin a
            # sample as the "recent" side (as little as 1 game) — shrinking
            # only one side while leaving an equally-noisy baseline untouched
            # can flip the apparent direction relative to the raw numbers
            # shown in the reason text. Shrink both sides the same way there.
            # Once there's a real season (uses_l3_window), the season average
            # is already a stable large-n estimate and doesn't need shrinking.
            baseline = _shrink(m["season"], pos_avg, m["n_season"]) if not c["uses_l3_window"] else m["season"]
            if shrunk_recent is not None and baseline is not None:
                deltas[metric] = shrunk_recent - baseline
        role_trend_raw[c["player_id"]] = deltas

    # z-score each metric's delta within its position's qualifying population
    z_stats: dict = {}
    for pos in TREND_POSITIONS:
        for metric in TREND_METRICS_BY_POS.get(pos, []):
            vals = [
                role_trend_raw[c["player_id"]][metric]
                for c in computed
                if c["position"] == pos and c["qualifies"] and metric in role_trend_raw[c["player_id"]]
            ]
            mean_v = _mean(vals)
            z_stats[(pos, metric)] = (mean_v, _std(vals, mean_v))

    # ── Assemble tagged output rows ──────────────────────────────────────────
    METRIC_LABEL = {"snap_share": "Snap share", "target_share": "Target share", "carry_share": "Carry share"}
    out_players = []
    for c in computed:
        pos, applicable = c["position"], TREND_METRICS_BY_POS.get(c["position"], [])
        deltas = role_trend_raw.get(c["player_id"], {})

        z_scores, max_move = [], 0.0
        for metric in applicable:
            delta = deltas.get(metric)
            if delta is None:
                continue
            mean_v, std_v = z_stats.get((pos, metric), (None, None))
            if std_v:
                z_scores.append(delta / std_v)
            if abs(delta) > abs(max_move):
                max_move = delta

        role_trend_z = _mean(z_scores)
        momentum = max(-100.0, min(100.0, role_trend_z * 33.3)) if role_trend_z is not None else None

        # Noise-game guard: last game's snaps cratered vs. this player's own prior
        # trend — likely an in-game injury exit, not a real role change.
        weeks = players[c["player_id"]]["weeks"]
        possible_injury_exit = False
        if len(weeks) >= 2:
            prior_avg = _mean([w["snap_share"] for w in weeks[:-1]])
            last_snap = weeks[-1]["snap_share"]
            if prior_avg and last_snap is not None and last_snap < prior_avg * 0.5:
                possible_injury_exit = True

        tag = "hold"
        if momentum is not None:
            if momentum >= 25 and abs(max_move) >= 0.10:
                tag = "stock_up"
            elif momentum <= -25 and abs(max_move) >= 0.10 and not possible_injury_exit:
                tag = "stock_down"

        reasons = []
        recent_label = "over the last 3 games" if c["uses_l3_window"] else "vs. the last game"
        for metric in applicable:
            m, delta = c["metrics"][metric], deltas.get(metric)
            if delta is None or m["season"] is None or m["l3"] is None or abs(delta) < 0.05:
                continue
            direction = "up" if delta > 0 else "down"
            reasons.append(
                f"{METRIC_LABEL[metric]} {direction} from {round(m['season']*100)}% "
                f"to {round(m['l3']*100)}% {recent_label}."
            )
        if possible_injury_exit:
            reasons.append("Snap share dropped sharply in the most recent game — may reflect an in-game injury, not a real role change.")
        if c["games_played"] < MIN_GAMES_FOR_TREND:
            reasons.append("Only 1 game played — nothing to compare it against yet.")
        elif not c["uses_l3_window"]:
            plural = "s" if c["games_played"] != 1 else ""
            reasons.append(
                f"Early-season sample ({c['games_played']} game{plural}) — comparing most recent game "
                f"to the game{plural} before it; widens to a full 3-game window at 4+ games."
            )

        out_players.append({
            "player_id":    c["player_id"],
            "player_name":  c["name"],
            "team":         c["team"],
            "position":     pos,
            "games_played": c["games_played"],
            "metrics": {
                metric: {k: v for k, v in c["metrics"][metric].items() if k != "n_l3"}
                for metric in applicable
            },
            # Week-by-week series (chronological) for sparkline charts — same
            # applicable metrics only, raw values straight from _trend_players.
            "weekly": [
                {"week": w["week"], **{metric: w[metric] for metric in applicable}}
                for w in weeks
            ],
            "momentum":   round(momentum, 1) if momentum is not None else None,
            "confidence": round(min(100.0, (c["games_played"] / 4.0) * 100)),
            "tag":        tag,
            "reasons":    reasons,
            "source":     "Sleeper API (api.sleeper.app/v1/stats)",
        })

    return {
        "data_loaded": True,
        "season":      _trend_season,
        "data_as_of":  _trend_loaded_at,
        "players":     out_players,
    }


@app.get("/api/trend-scores")
async def trend_scores():
    if not _trend_loaded and not _trend_loading:
        threading.Thread(target=_load_trend_data, daemon=True).start()
    if not _trend_loaded:
        return {"data_loaded": False, "data_loading": _trend_loading, "players": [], "season": None, "data_as_of": None}

    if _trend_loaded_at and not _trend_loading:
        import datetime
        age = (datetime.datetime.utcnow() - datetime.datetime.fromisoformat(_trend_loaded_at.rstrip("Z"))).total_seconds()
        if age > TREND_REFRESH_TTL:
            threading.Thread(target=_load_trend_data, daemon=True).start()

    try:
        return _compute_trend_scores()
    except Exception as exc:
        print(f"[trend-engine] Compute error: {exc}")
        return {"data_loaded": False, "error": str(exc), "players": [], "season": _trend_season, "data_as_of": _trend_loaded_at}
