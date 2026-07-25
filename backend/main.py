from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
import asyncio
import json
import os

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
    return {"odds_api_key": bool(s.get("odds_api_key")), "bookmakers": s.get("bookmakers", "draftkings,fanduel")}

# -- Health --------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "sport": "nfl"}

# -- PrizePicks NFL Props ------------------------------------------------------
@app.get("/api/prizepicks/props")
async def prizepicks_props():
    """Fetch NFL player props from PrizePicks."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                "https://api.prizepicks.com/projections",
                params={"league_id": "9", "per_page": "250", "single_stat": "true"},  # league_id 9 = NFL
                headers={"User-Agent": "Mozilla/5.0"}
            )
            if r.status_code != 200:
                return {"rawProps": [], "source": "prizepicks", "error": f"HTTP {r.status_code}"}

            data = r.json()
            projections = data.get("data", [])
            included    = {i["id"]: i for i in data.get("included", [])}

            props = []
            for proj in projections:
                attrs = proj.get("attributes", {})
                relationships = proj.get("relationships", {})

                player_rel = relationships.get("new_player", {}).get("data", {})
                player_id  = player_rel.get("id")
                player     = included.get(player_id, {})
                player_attrs = player.get("attributes", {})

                stat_type = attrs.get("stat_type", "")
                line      = attrs.get("line_score")
                if line is None:
                    continue

                # Map PrizePicks stat names to our prop types
                STAT_MAP = {
                    "Passing Yards": "passing_yards",
                    "Passing TDs": "passing_tds",
                    "Rushing Yards": "rushing_yards",
                    "Rushing Attempts": "rushing_attempts",
                    "Receiving Yards": "receiving_yards",
                    "Receptions": "receptions",
                    "Fantasy Points": "fantasy_points",
                    "Longest Reception": "longest_reception",
                    "Kicking Points": "kicking_points",
                }
                prop_type = STAT_MAP.get(stat_type)
                if not prop_type:
                    continue

                props.append({
                    "player_name": player_attrs.get("display_name", ""),
                    "team": player_attrs.get("team", ""),
                    "position": player_attrs.get("position", ""),
                    "prop_type": prop_type,
                    "line": float(line),
                    "over_odds": -110,
                    "under_odds": -110,
                })

            return {"rawProps": props, "source": "prizepicks", "game_date": "Today"}
    except Exception as e:
        return {"rawProps": [], "source": "prizepicks", "error": str(e)}

# -- DraftKings NFL Props ------------------------------------------------------
@app.get("/api/draftkings/props")
async def draftkings_props():
    """Fetch NFL player props from DraftKings."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # DK NFL player props category
            r = await client.get(
                "https://sportsbook.draftkings.com/sites/US-SB/api/v5/eventgroups/88808/categories/1000/subcategories/9517",
                headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
            )
            if r.status_code != 200:
                return {"rawProps": [], "source": "draftkings"}

            data = r.json()
            # Simple extraction -- return empty for now, real scraping requires parsing DK's structure
            return {"rawProps": [], "source": "draftkings", "game_date": "Today"}
    except Exception as e:
        return {"rawProps": [], "source": "draftkings", "error": str(e)}

# -- Underdog NFL Props --------------------------------------------------------
@app.get("/api/underdog/props")
async def underdog_props():
    """Fetch NFL player props from Underdog Fantasy."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                "https://api.underdogfantasy.com/beta/v3/over_under_lines",
                params={"sport_id": "NFL"},
                headers={"User-Agent": "Mozilla/5.0"}
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
                    "team": player.get("team_abbreviation", ""),
                    "position": player.get("position", ""),
                    "prop_type": prop_type,
                    "line": float(line.get("stat_value", 0)),
                    "over_odds": -110,
                    "under_odds": -110,
                })

            return {"rawProps": props, "source": "underdog", "game_date": "Today"}
    except Exception as e:
        return {"rawProps": [], "source": "underdog", "error": str(e)}

# -- Live Props (fallback merge) -----------------------------------------------
@app.get("/api/live-props")
async def live_props():
    """Aggregate all sources and return merged NFL props."""
    pp, ud, dk = await asyncio.gather(
        prizepicks_props(),
        underdog_props(),
        draftkings_props(),
        return_exceptions=True
    )

    all_props = []
    for result in [pp, ud, dk]:
        if isinstance(result, dict):
            all_props.extend(result.get("rawProps", []))

    # Basic dedup by player+prop_type
    seen = {}
    for p in all_props:
        key = f"{p['player_name']}__{p['prop_type']}"
        if key not in seen:
            seen[key] = p

    return {
        "rawProps": list(seen.values()),
        "game_date": "Today",
        "games_summary": [],
    }

# -- Player Game Logs ----------------------------------------------------------
@app.post("/api/player-gamelogs-bulk")
async def player_gamelogs_bulk(request: Request):
    """
    Fetch NFL player game logs from Pro Football Reference or NFL API.
    Placeholder -- returns empty analytics for now.
    """
    body = await request.json()
    player_names = body.get("playerNames", [])

    # TODO: integrate with nfl-data-py or Pro Football Reference
    # For now return empty so the app falls back to market-only grading
    analytics = {name: None for name in player_names}
    return {"analytics": analytics}

# -- Team Context --------------------------------------------------------------
@app.get("/api/team-context")
async def team_context():
    """NFL team defensive stats and injury context."""
    # TODO: integrate with NFL injury reports and defensive rankings
    return {
        "teams": {},
        "injuries": {},
        "back_to_back": [],
        "game_spreads": {},
    }
