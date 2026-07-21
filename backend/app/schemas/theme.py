from pydantic import BaseModel

class ThemeRequest(BaseModel):
    theme: str

class ThemeResponse(BaseModel):
    theme: str
