from typing import Optional
from dataclasses import dataclass


@dataclass
class BartStop:
    id: str
    name: str
    subtitle: str
    station: str
    direction: str  # "n" or "s"
    activity: Optional[str] = None


@dataclass
class MuniStop:
    id: str
    name: str
    subtitle: str
    stop_code: str
    route: str
    color: str
    activity: Optional[str] = None


BART_STOPS: list[BartStop] = [
    BartStop(
        id="glen_n",
        name="Glen Park BART",
        subtitle="Northbound → SF",
        station="glen",
        direction="n",
        activity="Downtown San Francisco",
    ),
    BartStop(
        id="glen_s",
        name="Glen Park BART",
        subtitle="Southbound → Daly City / Millbrae",
        station="glen",
        direction="s",
        activity="Flying at SFO",
    ),
]

MUNI_STOPS: list[MuniStop] = [
    MuniStop(
        id="j_church_inbound",
        name="J Church",
        subtitle="Inbound → Downtown (San Jose & Glen Park)",
        stop_code="14787",
        route="J",
        color="#D9541E",
        activity="Running in Mission Dolores Park",
    ),
    MuniStop(
        id="bosworth_52",
        name="52 Excelsior",
        subtitle="→ Forest Hill Station (Bosworth & Diamond)",
        stop_code="13695",
        route="52",
        color="#7B5EA7",
        activity="Groceries from Safeway",
    ),
    MuniStop(
        id="bosworth_44",
        name="44 O'Shaughnessy",
        subtitle="→ California & 6th Ave (Bosworth & Diamond)",
        stop_code="13695",
        route="44",
        color="#F7901E",
        activity="Running in Golden Gate Park",
    ),
    MuniStop(
        id="bosworth_23",
        name="23 Monterey",
        subtitle="→ SF Zoo (Diamond & Bosworth)",
        stop_code="14387",
        route="23",
        color="#4A90D9",
        activity="Running near Ocean Beach",
    ),
]
