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
    return {
        "status": "ok",
        "sport": "nfl",
        "data_loaded": _data_loaded,
        "data_loading": _data_loading,
        "loaded_seasons": _loaded_seasons,
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

        # Discover which seasons actually have regular-season data (try last 3 years).
        # The current year may only have preseason data if the season hasn't started —
        # we include it only if it has actual REG rows.
        import datetime
        current_year = datetime.datetime.now().year
        available = []
        for yr in [current_year - 2, current_year - 1, current_year]:
            try:
                tmp = nfl.import_weekly_data([yr])
                if tmp is None or len(tmp) == 0:
                    continue
                # Only count a year if it has at least one regular-season row
                if "season_type" in tmp.columns:
                    if len(tmp[tmp["season_type"] == "REG"]) > 0:
                        available.append(yr)
                else:
                    available.append(yr)
            except Exception:
                pass

        if not available:
            print("[nfl_data_py] No regular-season data found — giving up")
            return

        # Use the two most recent seasons with real data (crosses season boundary cleanly)
        seasons = sorted(available)[-2:]
        print(f"[nfl_data_py] Loading seasons {seasons}")
        df = nfl.import_weekly_data(seasons)

        # Keep regular season only
        if "season_type" in df.columns:
            df = df[df["season_type"] == "REG"]

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
        print(f"[nfl_data_py] Ready — {len(df):,} player-weeks across seasons {seasons}")
    except Exception as exc:
        print(f"[nfl_data_py] Load error: {exc}")
    finally:
        _data_loading = False


@app.on_event("startup")
async def _startup():
    threading.Thread(target=_load_nfl_data, daemon=True).start()


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
                "https://api.underdogfantasy.com/beta/v5/over_under_lines",
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
@app.get("/api/team-context")
async def team_context():
    return {"teams": {}, "injuries": {}, "game_spreads": {}}
