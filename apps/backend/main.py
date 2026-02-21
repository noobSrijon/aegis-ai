from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def read_root():
    return {"message": "Hello from FastAPI backend!"}

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
