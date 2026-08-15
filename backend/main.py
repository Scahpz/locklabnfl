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

            data        = r.json()
            lines       = data.get("over_under_lines", [])
            players     = {p["id"]: p for p in data.get("players", [])}
            appearances = {a["id"]: a for a in data.get("appearances", [])}

            # Only single-game prop stats (no season-total futures markets).
            # Period props get distinct keys so they don't collapse into the full-game market.
            STAT_MAP = {
                # Full-game props
                "passing_yds":              "passing_yards",
                "rushing_yds":              "rushing_yards",
                "receiving_yds":            "receiving_yards",
                "receptions":               "receptions",
                "passing_tds":              "passing_tds",
                "rushing_tds":              "rushing_tds",
                "receiving_tds":            "receiving_tds",
                "rush_rec_tds":             "rush_rec_tds",     # Rush+Rec TDs (combo)
                "fantasy_pts":              "fantasy_points",
                "passing_ints":             "passing_ints",     # INTs thrown (QB stat, not defensive)
                "sacks":                    "sacks",
                "passing_and_rushing_yds":  "pass_rush_yards",  # QB combo
                "passing_long":             "passing_long",
                "rushing_long":             "rushing_long",
                # 1st-quarter props
                "period_1_receiving_yds":   "q1_receiving_yards",
                "period_1_passing_yds":     "q1_passing_yards",
                "period_1_rushing_yds":     "q1_rushing_yards",
                # 1st-half props
                "period_1_2_receiving_yds": "h1_receiving_yards",
                "period_1_2_passing_yds":   "h1_passing_yards",
                "period_1_2_rushing_yds":   "h1_rushing_yards",
            }

            # Build team UUID → abbreviation + game info maps from games array
            # Note: game ids are integers, appearance.match_id is also an integer
            team_uuid_map = {}  # team_uuid → abbreviation
            game_info_map = {}  # game_id (int) → {home, away, scheduled_at, home_team_id}
            for g in data.get("games", []):
                title = g.get("abbreviated_title", "")
                parts = [p.strip() for p in title.split(" @ ")]
                away_abbrev = parts[0] if len(parts) >= 1 else ""
                home_abbrev = parts[1] if len(parts) >= 2 else ""
                away_uuid = g.get("away_team_id", "")
                home_uuid = g.get("home_team_id", "")
                if away_uuid and away_abbrev:
                    team_uuid_map[away_uuid] = away_abbrev
                if home_uuid and home_abbrev:
                    team_uuid_map[home_uuid] = home_abbrev
                g_id = g.get("id")  # integer
                if g_id is not None:
                    game_info_map[g_id] = {
                        "home": home_abbrev,
                        "away": away_abbrev,
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

                ou              = line.get("over_under", {})
                app_stat        = ou.get("appearance_stat", {})
                stat            = app_stat.get("stat", "")
                display_stat    = app_stat.get("display_stat", "")
                appearance_id   = app_stat.get("appearance_id")

                prop_type = STAT_MAP.get(stat)
                if not prop_type or not appearance_id:
                    continue

                # appearance → player lookup chain
                appearance = appearances.get(appearance_id, {})
                player_id  = appearance.get("player_id")
                player     = players.get(player_id, {}) if player_id else {}
                if not player:
                    continue

                name = f"{player.get('first_name', '')} {player.get('last_name', '')}".strip()
                if not name:
                    continue

                # Team and opponent from UUID maps (game id is an integer)
                team_uuid = appearance.get("team_id", "")
                match_id  = appearance.get("match_id")  # integer
                team_abbrev = team_uuid_map.get(team_uuid, "")
                game_meta = game_info_map.get(match_id, {})
                home = game_meta.get("home", "")
                away = game_meta.get("away", "")
                opponent = away if team_abbrev and team_abbrev == home else (home if team_abbrev else "")
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
                    "player_name":   name,
                    "team":          team_abbrev,
                    "position":      player.get("position_name", ""),
                    "prop_type":     prop_type,
                    "line":          float(stat_value),
                    "over_odds":     over_odds,
                    "under_odds":    under_odds,
                    "display_stat":  display_stat,
                    "home":          home,
                    "away":          away,
                    "opponent":      opponent,
                    "scheduled_at":  scheduled_at,
                    "image_url":     player.get("image_url") or player.get("dark_image_url") or "",
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
