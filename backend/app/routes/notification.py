from fastapi import APIRouter, Depends, HTTPException
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


@router.put("/notifications/{id}/read", response_model=NotificationResponse)
def mark_notification_read(id: int, db: Session = Depends(get_db)):
    """The bell icon dropdown had no way to actually mark something read -
    the model already had a status column for it, just no endpoint."""
    notification = db.query(Notification).filter(Notification.id == id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.status = "read"
    db.commit()
    db.refresh(notification)
    return notification


@router.put("/notifications/read-all")
def mark_all_notifications_read(db: Session = Depends(get_db)):
    updated = db.query(Notification).filter(Notification.status == "unread").update({Notification.status: "read"})
    db.commit()
    return {"updated": updated}
