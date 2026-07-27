from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
import asyncio
import json
import os
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Settings ------------------------------------------------------------------
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

# -- Health --------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "sport": "nfl"}

# -- PrizePicks NFL Props (with 30-min server-side cache to avoid 429) ---------
_pp_cache: dict = {"data": None, "ts": 0.0}
PP_CACHE_TTL = 30 * 60  # seconds

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

            data = r.json()
            projections = data.get("data", [])
            included = {i["id"]: i for i in data.get("included", [])}

            STAT_MAP = {
                "Passing Yards": "passing_yards",
                "Passing TDs": "passing_tds",
                "Rushing Yards": "rushing_yards",
                "Rushing Attempts": "rushing_attempts",
                "Receiving Yards": "receiving_yards",
                "Receptions": "receptions",
                "Fantasy Points": "fantasy_points",
                "Kicking Points": "kicking_points",
                "Completions": "completions",
                "Tackles": "tackles",
                "Sacks": "sacks",
                "Interceptions": "interceptions",
            }

            props = []
            for proj in projections:
                attrs = proj.get("attributes", {})
                if attrs.get("status") not in ("pre_game", "in_progress"):
                    continue
                prop_type = STAT_MAP.get(attrs.get("stat_type", ""))
                if not prop_type:
                    continue
                line = attrs.get("line_score")
                if line is None:
                    continue

                rels = proj.get("relationships", {})
                player_id = (rels.get("new_player") or {}).get("data", {}).get("id")
                game_id   = (rels.get("game") or {}).get("data", {}).get("id")
                player    = included.get(player_id, {}).get("attributes", {})
                game      = included.get(game_id, {}).get("attributes", {})

                props.append({
                    "player_name": player.get("display_name") or player.get("name", ""),
                    "team":        player.get("team", ""),
                    "position":    player.get("position", ""),
                    "prop_type":   prop_type,
                    "line":        float(line),
                    "over_odds":   -110,
                    "under_odds":  -110,
                    "home":        game.get("home_team", ""),
                    "away":        game.get("away_team", ""),
                    "scheduled_at": attrs.get("start_time"),
                })

        result = {"rawProps": props, "source": "prizepicks", "game_date": "Today"}
        _pp_cache["data"] = result
        _pp_cache["ts"] = now
        return result

    except Exception as e:
        if _pp_cache["data"] is not None:
            return _pp_cache["data"]
        return {"rawProps": [], "source": "prizepicks", "error": str(e)}

# -- DraftKings NFL Props ------------------------------------------------------
@app.get("/api/draftkings/props")
async def draftkings_props():
    return {"rawProps": [], "source": "draftkings", "game_date": "Today"}

# -- Underdog NFL Props --------------------------------------------------------
@app.get("/api/underdog/props")
async def underdog_props():
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                "https://api.underdogfantasy.com/beta/v3/over_under_lines",
                params={"sport_id": "NFL"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if r.status_code != 200:
                return {"rawProps": [], "source": "underdog"}

            data   = r.json()
            lines  = data.get("over_under_lines", [])
            players = {p["id"]: p for p in data.get("players", [])}

            STAT_MAP = {
                "passing_yards": "passing_yards",
                "passing_touchdowns": "passing_tds",
                "rushing_yards": "rushing_yards",
                "receiving_yards": "receiving_yards",
                "receptions": "receptions",
                "fantasy_points": "fantasy_points",
            }

            props = []
            for line in lines:
                appearance_id = line.get("over_under", {}).get("appearance_stat", {}).get("appearance_id")
                player = players.get(appearance_id, {})
                stat   = line.get("over_under", {}).get("appearance_stat", {}).get("stat")
                prop_type = STAT_MAP.get(stat)
                if not prop_type or not player:
                    continue
                props.append({
                    "player_name": player.get("name", ""),
                    "team":        player.get("team_abbreviation", ""),
                    "position":    player.get("position", ""),
                    "prop_type":   prop_type,
                    "line":        float(line.get("stat_value", 0)),
                    "over_odds":   -110,
                    "under_odds":  -110,
                })

            return {"rawProps": props, "source": "underdog", "game_date": "Today"}
    except Exception as e:
        return {"rawProps": [], "source": "underdog", "error": str(e)}

# -- Live Props (aggregated) ---------------------------------------------------
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

# -- Game Odds (The Odds API → multi-book; falls back to empty so frontend uses ESPN) --
NFL_TEAM_ABBREV = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAC",
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
    """
    Returns NFL game odds per book. Requires ODDS_API_KEY env var.
    Returns [] when no key is configured — the frontend falls back to ESPN.
    """
    api_key = os.environ.get("ODDS_API_KEY", "")
    if not api_key:
        return []

    try:
        params = {
            "apiKey": api_key,
            "regions": "us",
            "markets": "h2h,spreads,totals",
            "bookmakers": bookmakers.replace(" ", ""),
            "oddsFormat": "american",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/",
                params=params,
            )
            if r.status_code != 200:
                return []
            events = r.json()

        games = []
        for ev in events:
            home_name = ev.get("home_team", "")
            away_name = ev.get("away_team", "")
            homeAbv = _abbrev(home_name)
            awayAbv = _abbrev(away_name)

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
                "id":           ev.get("id", ""),
                "commence_time": ev.get("commence_time", ""),
                "homeAbv":      homeAbv,
                "awayAbv":      awayAbv,
                "moneyline":    {"home": p_ml_h, "away": p_ml_a, "bookmaker": all_books[0]["title"] if all_books else ""},
                "spread":       {"home": p_sp_h, "homeOdds": p_sp_ho, "away": p_sp_a, "awayOdds": p_sp_ao},
                "total":        {"line": p_tot, "overOdds": p_tot_o, "underOdds": p_tot_u},
                "allBooks":     all_books,
                "is_preseason": False,
                "week":         None,
            })

        return games
    except Exception:
        return []

# -- Player Game Logs ----------------------------------------------------------
@app.post("/api/player-gamelogs-bulk")
async def player_gamelogs_bulk(request: Request):
    body = await request.json()
    player_names = body.get("playerNames", [])
    analytics = {name: None for name in player_names}
    return {"analytics": analytics}

# -- Team Context --------------------------------------------------------------
@app.get("/api/team-context")
async def team_context():
    return {
        "teams": {},
        "injuries": {},
        "game_spreads": {},
    }
