from fastapi import FastAPI

app = FastAPI(
    title="Kavach API",
    description="Consent-based voice safety companion prototype.",
    version="0.1.0",
)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "kavach-api"}
