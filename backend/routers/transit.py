from fastapi import APIRouter
from services.transit_service import fetch_all_arrivals

router = APIRouter()


@router.get("/arrivals")
async def get_arrivals():
    return await fetch_all_arrivals()
