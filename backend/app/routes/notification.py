from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.notification import Notification
from app.schemas.notification import NotificationResponse

router = APIRouter()

@router.get("/notifications", response_model=List[NotificationResponse])
def get_notifications(db: Session = Depends(get_db)):
    notifications = db.query(Notification).order_by(Notification.id.desc()).limit(20).all()
    return notifications
