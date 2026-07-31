from fastapi import FastAPI

app = FastAPI(title="Hubris API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
