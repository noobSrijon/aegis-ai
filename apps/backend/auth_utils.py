from fastapi import Header, HTTPException, Depends
from supabase import create_client, Client
import os

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    try:
        # Expected format: Bearer <jwt>
        token = authorization.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")
