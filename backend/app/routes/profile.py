from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.profile import ProfileResponse

router = APIRouter()

@router.get("/profile", response_model=ProfileResponse)
def get_profile(db: Session = Depends(get_db)):
    # Since auth is out of scope, we get the first administrator in the database
    user = db.query(User).first()
    if not user:
        return ProfileResponse(
            name="Darshan Kumar",
            role="Platform Administrator",
            avatar="DA"
        )
    
    initials = "".join([part[0] for part in user.name.split() if part])[:2].upper()
    avatar_val = user.profile_image if user.profile_image else initials
    
    return ProfileResponse(
        name=user.name,
        role=user.role,
        avatar=avatar_val
    )
