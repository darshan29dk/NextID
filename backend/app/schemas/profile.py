from pydantic import BaseModel

class ProfileResponse(BaseModel):
    name: str
    role: str
    avatar: str

    class Config:
        from_attributes = True
