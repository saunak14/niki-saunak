import json
import logging
import os
import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx
from cachetools import TTLCache

from config.transit_stops import BART_STOPS, MUNI_STOPS, BartStop, MuniStop

logger = logging.getLogger(__name__)

BART_PUBLIC_KEY = "MW9S-E7SL-26DU-VV8V"
BART_ETD_URL = "https://api.bart.gov/api/etd.aspx"
MUNI_STOP_MONITOR_URL = "http://api.511.org/transit/StopMonitoring"

# BART API returns color names, not hex codes
BART_COLOR_MAP = {
    "YELLOW": "#FFE400",
    "GREEN": "#4DB848",
    "BLUE": "#0099D8",
    "RED": "#ED1C24",
    "ORANGE": "#F48026",
    "BEIGE": "#C2A96E",
    "WHITE": "#FFFFFF",
    "BLACK": "#000000",
}

# 30-second debounce cache — absorbs duplicate calls within the same window
_cache: TTLCache = TTLCache(maxsize=20, ttl=30)


def _cache_key(*parts) -> str:
    return "|".join(str(p) for p in parts)


def _minutes_until(iso_time: str) -> Optional[int]:
    try:
        arrival = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
        delta = arrival - datetime.now(timezone.utc)
        mins = int(delta.total_seconds() / 60)
        return max(0, mins)
    except Exception:
        return None


async def fetch_bart_arrivals(stop: BartStop, max_results: int = 3) -> dict:
    key = _cache_key("bart", stop.station, stop.direction)
    if key in _cache:
        return _cache[key]

    result = {
        "id": stop.id,
        "name": stop.name,
        "subtitle": stop.subtitle,
        "color": None,
        "activity": stop.activity,
        "arrivals": [],
        "error": False,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                BART_ETD_URL,
                params={"cmd": "etd", "orig": stop.station, "key": BART_PUBLIC_KEY, "json": "y"},
            )
            resp.raise_for_status()
            data = resp.json()

        station_data = data.get("root", {}).get("station", [])
        if not station_data:
            _cache[key] = result
            return result

        # Collect all matching estimates across all destinations, then sort by time
        all_estimates = []
        for etd in station_data[0].get("etd", []):
            for estimate in etd.get("estimate", []):
                direction_letter = estimate.get("direction", "")[:1].lower()
                if direction_letter != stop.direction:
                    continue
                minutes_raw = estimate.get("minutes", "")
                minutes = 0 if minutes_raw == "Leaving" else int(minutes_raw) if minutes_raw.isdigit() else None
                if minutes is None:
                    continue
                color_name = estimate.get("color", "").upper()
                all_estimates.append({
                    "destination": etd.get("destination", ""),
                    "minutes": minutes,
                    "color": BART_COLOR_MAP.get(color_name),
                })

        arrivals = sorted(all_estimates, key=lambda x: x["minutes"])[:max_results]

        # BART card uses a fixed green — individual arrivals carry per-line colors
        result["color"] = "#009B3A"
        result["arrivals"] = arrivals
    except Exception:
        logger.exception(
            "BART fetch failed for station=%s direction=%s", stop.station, stop.direction
        )
        result["error"] = True

    _cache[key] = result
    return result


async def fetch_muni_arrivals(stop: MuniStop, max_results: int = 3) -> dict:
    key = _cache_key("muni", stop.stop_code, stop.route)
    if key in _cache:
        return _cache[key]

    result = {
        "id": stop.id,
        "name": stop.name,
        "subtitle": stop.subtitle,
        "color": stop.color,
        "activity": stop.activity,
        "arrivals": [],
        "error": False,
    }

    api_key = os.environ.get("TRANSIT_511_API_KEY", "").strip()
    if not api_key:
        logger.warning("Muni fetch skipped for stop_code=%s: TRANSIT_511_API_KEY not configured", stop.stop_code)
        result["error"] = True
        result["error_detail"] = "TRANSIT_511_API_KEY not configured"
        _cache[key] = result
        return result

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                MUNI_STOP_MONITOR_URL,
                params={"api_key": api_key, "agency": "SF", "stopCode": stop.stop_code, "format": "json"},
            )
            resp.raise_for_status()
            # 511.org sometimes returns a BOM character at the start of JSON
            text = resp.text.lstrip("﻿")
            data = json.loads(text)

        delivery = (
            data.get("ServiceDelivery", {})
            .get("StopMonitoringDelivery", {})
        )
        # API may return a list or a single object
        if isinstance(delivery, list):
            delivery = delivery[0] if delivery else {}

        visits = delivery.get("MonitoredStopVisit", [])
        arrivals = []
        for visit in visits:
            journey = visit.get("MonitoredVehicleJourney", {})
            line_ref = journey.get("LineRef", "").strip()
            if line_ref != stop.route:
                continue
            call = journey.get("MonitoredCall", {})
            arrival_time = call.get("ExpectedArrivalTime") or call.get("AimedArrivalTime")
            if not arrival_time:
                continue
            mins = _minutes_until(arrival_time)
            if mins is None:
                continue
            destination = journey.get("DestinationName", "")
            if isinstance(destination, dict):
                destination = destination.get("value", "")
            arrivals.append({"destination": destination, "minutes": mins})
            if len(arrivals) >= max_results:
                break

        result["arrivals"] = arrivals
    except Exception:
        logger.exception(
            "Muni fetch failed for stop_code=%s route=%s", stop.stop_code, stop.route
        )
        result["error"] = True

    _cache[key] = result
    return result


async def fetch_all_arrivals() -> dict:
    tasks = [fetch_bart_arrivals(stop) for stop in BART_STOPS]
    tasks += [fetch_muni_arrivals(stop) for stop in MUNI_STOPS]

    stops = await asyncio.gather(*tasks)

    return {
        "stops": list(stops),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
