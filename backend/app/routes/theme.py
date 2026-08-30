from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.platform_settings import PlatformSettings
from app.schemas.theme import ThemeRequest, ThemeResponse

router = APIRouter()

@router.get("/theme", response_model=ThemeResponse)
def get_theme(db: Session = Depends(get_db)):
    settings = db.query(PlatformSettings).first()
    if not settings:
        return ThemeResponse(theme="dark")
    return ThemeResponse(theme=settings.default_theme or "dark")

@router.put("/theme", response_model=ThemeResponse)
def update_theme(payload: ThemeRequest, db: Session = Depends(get_db)):
    settings = db.query(PlatformSettings).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Platform settings not found")

    settings.default_theme = payload.theme
    db.commit()
    db.refresh(settings)
    return ThemeResponse(theme=settings.default_theme)