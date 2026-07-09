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

    # 1. Fetch all existing mappings for this connector
    existing_mappings = db.query(ConnectorFieldMapping).filter(ConnectorFieldMapping.connector_id == id).all()
    existing_by_source = {m.source_field: m for m in existing_mappings}

    new_mappings = []
    retained_source_fields = set()

    for payload in payloads:
        if payload.connector_id is not None and payload.connector_id != id:
            raise HTTPException(status_code=400, detail="Payload connector_id must match the URL id.")
        if not payload.target_attribute_name:
            continue  # skip unmapped fields silently

        source_field = payload.source_field
        retained_source_fields.add(source_field)

        if source_field in existing_by_source:
            # Update existing mapping
            mapping = existing_by_source[source_field]
            mapping.target_module = payload.target_module
            mapping.target_attribute_name = payload.target_attribute_name
            mapping.transformation_type = payload.transformation_type
            mapping.modified_by = x_user_name
        else:
            # Create new mapping
            mapping = ConnectorFieldMapping(
                connector_id=id,
                source_field=source_field,
                target_module=payload.target_module,
                target_attribute_name=payload.target_attribute_name,
                transformation_type=payload.transformation_type,
                created_by=x_user_name,
                modified_by=x_user_name
            )
            db.add(mapping)
        
        new_mappings.append(mapping)

    # 2. Identify mappings that were removed and need to be deleted
    mappings_to_delete = [m for m in existing_mappings if m.source_field not in retained_source_fields]
    if mappings_to_delete:
        ids_to_delete = [m.id for m in mappings_to_delete]
        
        # Set mapping_id = None in dependent transformation and validation rules to avoid foreign key errors
        from app.models.transformation_rule import TransformationRule
        from app.models.validation_rule import ValidationRule

        db.query(TransformationRule).filter(TransformationRule.mapping_id.in_(ids_to_delete)).update(
            {TransformationRule.mapping_id: None}, synchronize_session=False
        )
        db.query(ValidationRule).filter(ValidationRule.mapping_id.in_(ids_to_delete)).update(
            {ValidationRule.mapping_id: None}, synchronize_session=False
        )

        # Delete from connector_field_mappings
        for m in mappings_to_delete:
            db.delete(m)

    db.commit()
    for m in new_mappings:
        db.refresh(m)

    return new_mappings