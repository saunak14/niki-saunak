from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import transit

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(transit.router, prefix="/api/transit")


@app.get("/test")
def test():
    return {"status": "ok"}
