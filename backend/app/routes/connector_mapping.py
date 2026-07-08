from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app.models.connector import Connector
from app.models.connector_field_mapping import ConnectorFieldMapping
from app.schemas.connector_mapping import ConnectorFieldMappingCreate, ConnectorFieldMappingResponse

router = APIRouter()

@router.get("/connectors/{id}/mappings", response_model=List[ConnectorFieldMappingResponse])
def get_connector_mappings(id: int, db: Session = Depends(get_db)):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    mappings = db.query(ConnectorFieldMapping).filter(ConnectorFieldMapping.connector_id == id).all()
    return mappings


@router.put("/connectors/{id}/mappings", response_model=List[ConnectorFieldMappingResponse])
def save_connector_mappings(
    id: int,
    payloads: List[ConnectorFieldMappingCreate],
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # Replace-all strategy: delete existing mappings for this connector, insert the new set.
    db.query(ConnectorFieldMapping).filter(ConnectorFieldMapping.connector_id == id).delete()

    new_mappings = []
    for payload in payloads:
        if payload.connector_id != id:
            raise HTTPException(status_code=400, detail="Payload connector_id must match the URL id.")
        if not payload.target_attribute_name:
            continue  # skip unmapped fields silently

        mapping = ConnectorFieldMapping(
            connector_id=id,
            source_field=payload.source_field,
            target_module=payload.target_module,
            target_attribute_name=payload.target_attribute_name,
            transformation_type=payload.transformation_type,
            created_by=x_user_name,
            modified_by=x_user_name
        )
        db.add(mapping)
        new_mappings.append(mapping)

    db.commit()
    for m in new_mappings:
        db.refresh(m)

    return new_mappings