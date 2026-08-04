import uuid
import hashlib
import base64
import secrets
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
import httpx
from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from app.core.security import (
    hash_password, verify_password, hash_token,
    create_access_token, create_refresh_token, decode_token
)
from app.core.database import mock_db
from app.core.deps import get_current_user
from app.core.config import settings

router = APIRouter()

# Memory store for OAuth PKCE state -> code_verifier
oauth_pkce_sessions: Dict[str, Dict[str, Any]] = {}

class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    preferred_language: Optional[str] = "en"
    preferred_state: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class LogoutRequest(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


def generate_pkce_pair():
    """Generates PKCE code_verifier and S256 code_challenge."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    challenge = base64.urlsafe_b64encode(digest).decode('ascii').replace('=', '')
    return verifier, challenge


@router.get("/auth/google/login")
async def google_login():
    """
    Initiates Google OAuth 2.0 OpenID Connect PKCE flow.
    Redirects user to Google's consent screen.
    """
    verifier, challenge = generate_pkce_pair()
    state = secrets.token_urlsafe(32)

    # Store state session for callback verification
    oauth_pkce_sessions[state] = {
        "verifier": verifier,
        "created_at": datetime.now(timezone.utc)
    }

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent"
    }

    google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=google_auth_url)


@router.get("/auth/google/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """
    Handles Google OAuth callback, verifies state & PKCE verifier,
    links accounts, creates user, and issues app JWT pair.
    """
    if error:
        raise HTTPException(status_code=400, detail=f"Google OAuth authorization error: {error}")

    if not state or state not in oauth_pkce_sessions:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state parameter")

    session = oauth_pkce_sessions.pop(state)
    code_verifier = session["verifier"]

    # Exchange auth code for tokens with Google
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code or "mock_code",
        "grant_type": "authorization_code",
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "code_verifier": code_verifier
    }

    user_info = None

    if settings.GOOGLE_CLIENT_ID.startswith("mock"):
        # Simulated Google User for local dev / tests
        user_info = {
            "sub": "google-user-sub-1029384756",
            "email": "reader.google@example.com",
            "email_verified": True,
            "name": "Google Reader"
        }
    else:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.post(token_url, data=token_data)
                res.raise_for_status()
                tokens = res.json()
                
                # Fetch Google userinfo
                userinfo_res = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {tokens['access_token']}"}
                )
                userinfo_res.raise_for_status()
                user_info = userinfo_res.json()
            except Exception as err:
                raise HTTPException(status_code=500, detail=f"Failed to exchange Google OAuth code: {str(err)}")

    if not user_info or not user_info.get("email"):
        raise HTTPException(status_code=400, detail="Google account did not return a valid email address")

    google_sub = user_info["sub"]
    email = user_info["email"].lower().strip()
    email_verified = user_info.get("email_verified", True)
    name = user_info.get("name") or email.split("@")[0].capitalize()

    # Account Linking Logic
    existing_user = None
    for u in mock_db.users.values():
        if u["email"].lower() == email:
            existing_user = u
            break

    if existing_user:
        if email_verified:
            # Link google_id to existing account if verified
            existing_user["google_id"] = google_sub
            target_user = existing_user
        else:
            raise HTTPException(status_code=400, detail="Google email is unverified. Cannot link account.")
    else:
        # Create new OAuth-only user (password_hash is None)
        user_id = str(uuid.uuid4())
        target_user = {
            "id": user_id,
            "name": name,
            "email": email,
            "phone": None,
            "password_hash": None, # OAuth account has no password
            "google_id": google_sub,
            "role": "reader",
            "location": "India",
            "preferences": {
                "language": "en",
                "categories": [],
                "region": {"state": "All Regions", "district": ""}
            },
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        mock_db.users[user_id] = target_user

    user_id = target_user["id"]
    access_token = create_access_token({"sub": user_id, "email": email, "role": target_user["role"]})
    refresh_token = create_refresh_token({"sub": user_id})

    # Save refresh token in DB
    ref_id = str(uuid.uuid4())
    ref_hash = hash_token(refresh_token)
    mock_db.refresh_tokens[ref_id] = {
        "id": ref_id,
        "user_id": user_id,
        "token_hash": ref_hash,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "revoked": False,
        "created_at": datetime.now(timezone.utc)
    }

    # Redirect to frontend with tokens
    frontend_target = f"{settings.FRONTEND_URL}/?auth_token={access_token}&user_name={urllib.parse.quote(target_user['name'])}"
    return RedirectResponse(url=frontend_target)


@router.post("/auth/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest):
    email = payload.email.lower().strip()
    
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    # Check if email exists
    for existing_user in mock_db.users.values():
        if existing_user["email"].lower() == email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email address already exists.")

    user_id = str(uuid.uuid4())
    hashed_pwd = hash_password(payload.password)
    
    new_user = {
        "id": user_id,
        "name": payload.name.strip(),
        "email": email,
        "phone": payload.phone,
        "password_hash": hashed_pwd,
        "google_id": None,
        "role": "reader",
        "location": payload.preferred_state or "India",
        "preferences": {
            "language": payload.preferred_language or "en",
            "categories": [],
            "region": {
                "state": payload.preferred_state or "All Regions",
                "district": ""
            }
        },
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }

    mock_db.users[user_id] = new_user

    access_token = create_access_token({"sub": user_id, "email": email, "role": new_user["role"]})
    refresh_token = create_refresh_token({"sub": user_id})

    ref_id = str(uuid.uuid4())
    ref_hash = hash_token(refresh_token)
    mock_db.refresh_tokens[ref_id] = {
        "id": ref_id,
        "user_id": user_id,
        "token_hash": ref_hash,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "revoked": False,
        "created_at": datetime.now(timezone.utc)
    }

    user_out = {k: v for k, v in new_user.items() if k != "password_hash"}
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_out
    }


@router.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    email = payload.email.lower().strip()
    target_user = None
    
    for u in mock_db.users.values():
        if u["email"].lower() == email:
            target_user = u
            break

    if not target_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    # Block password login for OAuth-only accounts without password
    if not target_user.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account was created using Google Sign-In. Please click 'Continue with Google' to sign in."
        )

    if not verify_password(payload.password, target_user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    user_id = target_user["id"]
    access_token = create_access_token({"sub": user_id, "email": email, "role": target_user["role"]})
    refresh_token = create_refresh_token({"sub": user_id})

    ref_id = str(uuid.uuid4())
    ref_hash = hash_token(refresh_token)
    mock_db.refresh_tokens[ref_id] = {
        "id": ref_id,
        "user_id": user_id,
        "token_hash": ref_hash,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "revoked": False,
        "created_at": datetime.now(timezone.utc)
    }

    user_out = {k: v for k, v in target_user.items() if k != "password_hash"}
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_out
    }


@router.post("/auth/refresh")
async def refresh_tokens(payload: RefreshRequest):
    token_data = decode_token(payload.refresh_token)
    if not token_data or token_data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    token_h = hash_token(payload.refresh_token)
    matched_ref = None
    for ref in mock_db.refresh_tokens.values():
        if ref["token_hash"] == token_h and not ref["revoked"]:
            matched_ref = ref
            break

    if not matched_ref:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked or invalid")

    user_id = token_data["sub"]
    user = mock_db.users.get(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_access_token = create_access_token({"sub": user_id, "email": user["email"], "role": user["role"]})
    return {"access_token": new_access_token, "token_type": "bearer"}


@router.post("/auth/logout")
async def logout(payload: LogoutRequest):
    token_h = hash_token(payload.refresh_token)
    for ref in mock_db.refresh_tokens.values():
        if ref["token_hash"] == token_h:
            ref["revoked"] = True

    return {"status": "success", "message": "Successfully logged out"}


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {k: v for k, v in current_user.items() if k != "password_hash"}
