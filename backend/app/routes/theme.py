from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.theme import ThemeRequest, ThemeResponse

router = APIRouter()

@router.get("/theme", response_model=ThemeResponse)
def get_theme(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        return ThemeResponse(theme="light")
    return ThemeResponse(theme=user.theme)

@router.put("/theme", response_model=ThemeResponse)
def update_theme(payload: ThemeRequest, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="Default user not found")
    
    # Save the theme (e.g. 'light' or 'dark') to user profile
    user.theme = payload.theme
    db.commit()
    db.refresh(user)
    return ThemeResponse(theme=user.theme)
