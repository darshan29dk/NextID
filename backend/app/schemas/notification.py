from pydantic import BaseModel
from datetime import datetime

class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
