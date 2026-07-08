from fastapi import APIRouter, Depends, HTTPException, status, Header, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, asc, desc
from typing import List, Optional
import json
import os
import io
import time
from datetime import datetime
import openpyxl

from app.database import get_db
from app.models.connector import Connector
from app.models.connector_log import ConnectorLog
from app.models.connector_file import ConnectorFile
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.connector import (
    ConnectorCreate, ConnectorUpdate, ConnectorResponse, 
    ConnectorPaginatedResponse, ConnectorLogResponse, ConnectorFileResponse
)
from app.schemas.audit_log import AuditLogResponse
from app.utils.crypto import encrypt_password, decrypt_password

router = APIRouter()

# Helper for Audit Logging
def write_connector_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Connectors",
            action=action, # "Create", "Update", "Delete"
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Recent Activity Feed
        conn_label = new_val.get("connector_name") if new_val else (old_val.get("connector_name") if old_val else "")
        activity = RecentActivity(
            user=user,
            action=f"Connector {action.lower()}d - {conn_label}",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write connector audit: {e}")

# Helper for Connector Logs
def write_connector_log(db: Session, connector_id: int, action: str, details: str, status_val: str):
    try:
        log = ConnectorLog(
            connector_id=connector_id,
            action=action,
            details=details,
            status=status_val,
            timestamp=datetime.utcnow()
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write connector log: {e}")

@router.get("/connectors", response_model=ConnectorPaginatedResponse)
def get_connectors(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    connector_type: Optional[str] = None,
    status: Optional[str] = None,
    database_type: Optional[str] = None,
    sortBy: Optional[str] = "created_at",
    sortOrder: Optional[str] = "desc",
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    query = db.query(Connector).filter(Connector.is_deleted == False)

    # 1. Search Query
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Connector.connector_name.like(search_term),
                Connector.description.like(search_term),
                Connector.host.like(search_term),
                Connector.database_name.like(search_term)
            )
        )

    # 2. Filters
    if connector_type:
        query = query.filter(Connector.connector_type == connector_type)
    if status:
        query = query.filter(Connector.status == status)
    if database_type:
        query = query.filter(Connector.database_type == database_type)

    # 3. Sorting
    sort_fields = {
        "connector_name": Connector.connector_name,
        "connector_type": Connector.connector_type,
        "status": Connector.status,
        "database_type": Connector.database_type,
        "created_at": Connector.created_at,
        "updated_at": Connector.updated_at,
        "last_sync": Connector.last_sync,
        "last_tested": Connector.last_tested
    }

    sort_col = sort_fields.get(sortBy, Connector.created_at)
    if sortOrder == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    offset = (page - 1) * limit
    connectors = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "connectors": connectors
    }

@router.get("/connectors/{id}", response_model=ConnectorResponse)
def get_connector(id: int, db: Session = Depends(get_db)):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return connector

@router.post("/connectors", response_model=ConnectorResponse)
def create_connector(
    payload: ConnectorCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    # Unique constraint check
    existing = db.query(Connector).filter(
        Connector.connector_name == payload.connector_name.strip(),
        Connector.is_deleted == False
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A connector with this name already exists")

    encrypted_pw = None
    if payload.password:
        encrypted_pw = encrypt_password(payload.password)

    connector = Connector(
        connector_name=payload.connector_name.strip(),
        connector_type=payload.connector_type,
        description=payload.description,
        status=payload.status or "Draft",
        health_status=payload.health_status or "Unknown",
        environment=payload.environment or "Development",
        auth_type=payload.auth_type or "Basic",
        tags=payload.tags,
        database_type=payload.database_type,
        host=payload.host,
        port=payload.port,
        database_name=payload.database_name,
        username=payload.username,
        password=encrypted_pw,
        ssl_enabled=payload.ssl_enabled or False,
        connection_timeout=payload.connection_timeout or 30,
        csv_delimiter=payload.csv_delimiter or ",",
        csv_encoding=payload.csv_encoding or "UTF-8",
        excel_sheet_name=payload.excel_sheet_name,
        file_path=payload.file_path,
        created_by=x_user_name,
        modified_by=x_user_name
    )

    db.add(connector)
    db.commit()
    db.refresh(connector)

    # Logging and auditing
    write_connector_log(
        db=db,
        connector_id=connector.id,
        action="Created",
        details=f"Connector '{connector.connector_name}' successfully configured as {connector.connector_type}.",
        status_val="Success"
    )

    conn_dict = {
        "id": connector.id,
        "connector_name": connector.connector_name,
        "connector_type": connector.connector_type,
        "status": connector.status
    }
    write_connector_audit(db=db, user=x_user_name, action="Create", old_val=None, new_val=conn_dict)

    return connector

@router.put("/connectors/{id}", response_model=ConnectorResponse)
def update_connector(
    id: int,
    payload: ConnectorUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    old_dict = {
        "id": connector.id,
        "connector_name": connector.connector_name,
        "connector_type": connector.connector_type,
        "status": connector.status
    }

    # Unique check if name changed
    if payload.connector_name and payload.connector_name.strip() != connector.connector_name:
        existing = db.query(Connector).filter(
            Connector.connector_name == payload.connector_name.strip(),
            Connector.is_deleted == False
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A connector with this name already exists")
        connector.connector_name = payload.connector_name.strip()

    # Update logic
    update_data = payload.dict(exclude_unset=True)
    
    # Handle password encryption update specifically
    if "password" in update_data:
        if update_data["password"]:
            connector.password = encrypt_password(update_data["password"])
        else:
            connector.password = None
        del update_data["password"]

    for key, value in update_data.items():
        setattr(connector, key, value)

    connector.modified_by = x_user_name
    connector.updated_at = datetime.utcnow()

    # Bump version
    connector.version = (connector.version or 1) + 1

    db.commit()
    db.refresh(connector)

    # Logging and auditing
    write_connector_log(
        db=db,
        connector_id=connector.id,
        action="Updated",
        details=f"Connector configuration updated by {x_user_name}.",
        status_val="Success"
    )

    new_dict = {
        "id": connector.id,
        "connector_name": connector.connector_name,
        "connector_type": connector.connector_type,
        "status": connector.status
    }
    write_connector_audit(db=db, user=x_user_name, action="Update", old_val=old_dict, new_val=new_dict)

    return connector

@router.delete("/connectors/{id}")
def delete_connector(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    old_dict = {
        "id": connector.id,
        "connector_name": connector.connector_name,
        "connector_type": connector.connector_type,
        "status": connector.status
    }

    # Soft delete
    connector.is_deleted = True
    connector.modified_by = x_user_name
    connector.updated_at = datetime.utcnow()

    db.commit()

    write_connector_log(
        db=db,
        connector_id=id,
        action="Deleted",
        details=f"Connector soft deleted by {x_user_name}.",
        status_val="Success"
    )

    write_connector_audit(db=db, user=x_user_name, action="Delete", old_val=old_dict, new_val=None)

    return {"message": "Connector deleted successfully"}

@router.post("/connectors/{id}/upload", response_model=ConnectorFileResponse)
async def upload_connector_file(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # Read and save file content
    content = await file.read()
    file_size = len(content)

    # Ensure uploads directory exists inside backend/
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)

    safe_filename = f"{connector.id}_{file.filename}"
    file_path = os.path.join(uploads_dir, safe_filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # Create file record
    conn_file = ConnectorFile(
        connector_id=id,
        file_name=file.filename,
        file_type=file.content_type or "application/octet-stream",
        file_size=file_size,
        uploaded_by=x_user_name,
        upload_date=datetime.utcnow()
    )

    db.add(conn_file)

    # Update connector file path config
    connector.file_path = f"uploads/{safe_filename}"
    connector.status = "Configured"
    db.commit()
    db.refresh(conn_file)

    write_connector_log(
        db=db,
        connector_id=id,
        action="Import Started",
        details=f"File '{file.filename}' uploaded successfully. Connector status shifted to Configured.",
        status_val="Success"
    )

    return conn_file

@router.post("/connectors/read-sheets")
async def read_excel_sheets(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.xlsx', '.xlsm', '.xltx', '.xltm')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx) are supported")
    try:
        content = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        sheets = wb.sheetnames
        return {"sheets": sheets}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read sheets from Excel file: {str(e)}")

@router.get("/connectors/{id}/logs", response_model=List[ConnectorLogResponse])
def get_connector_logs(id: int, db: Session = Depends(get_db)):
    # Verify connector exists
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
        
    logs = db.query(ConnectorLog).filter(ConnectorLog.connector_id == id).order_by(ConnectorLog.timestamp.desc()).all()
    return logs

@router.get("/connectors/{id}/files", response_model=List[ConnectorFileResponse])
def get_connector_files(id: int, db: Session = Depends(get_db)):
    # Verify connector exists
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
        
    files = db.query(ConnectorFile).filter(ConnectorFile.connector_id == id).order_by(ConnectorFile.upload_date.desc()).all()
    return files

@router.get("/connectors/{id}/audit-logs", response_model=List[AuditLogResponse])
def get_connector_audit_logs(id: int, db: Session = Depends(get_db)):
    # Verify connector exists
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
        
    # Query audits where module is "Connectors" and the log matches this connector's ID or name
    audits = db.query(AuditLog).filter(
        AuditLog.module == "Connectors"
    ).order_by(AuditLog.timestamp.desc()).all()

    # Filter audits matching connector name or ID
    filtered_audits = []
    conn_id_str = f'"id": {id}'
    conn_name_str = f'"connector_name": "{connector.connector_name}"'
    
    for a in audits:
        match = False
        if a.old_value and (conn_id_str in a.old_value or conn_name_str in a.old_value):
            match = True
        if a.new_value and (conn_id_str in a.new_value or conn_name_str in a.new_value):
            match = True
        if match:
            filtered_audits.append(a)
            
    return filtered_audits

@router.post("/connectors/{id}/test")
def test_connector(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    start_time = time.time()
    success = False
    message = ""

    try:
        if connector.connector_type == "CSV":
            if not connector.file_path:
                raise Exception("No CSV file has been uploaded to this connector yet.")

            full_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                connector.file_path
            )
            if not os.path.exists(full_path):
                raise Exception(f"File not found on server: {connector.file_path}")

            import csv as csv_module
            with open(full_path, "r", encoding=connector.csv_encoding or "UTF-8") as f:
                reader = csv_module.reader(f, delimiter=connector.csv_delimiter or ",")
                header = next(reader, None)
                if not header:
                    raise Exception("CSV file appears to be empty or has no header row.")
                message = f"Successfully read CSV file. Detected {len(header)} column(s): {', '.join(header[:5])}{'...' if len(header) > 5 else ''}"
            success = True

        elif connector.connector_type == "Excel":
            if not connector.file_path:
                raise Exception("No Excel file has been uploaded to this connector yet.")

            full_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                connector.file_path
            )
            if not os.path.exists(full_path):
                raise Exception(f"File not found on server: {connector.file_path}")

            wb = openpyxl.load_workbook(full_path, read_only=True)
            if connector.excel_sheet_name and connector.excel_sheet_name not in wb.sheetnames:
                raise Exception(f"Configured sheet '{connector.excel_sheet_name}' not found in workbook. Available: {', '.join(wb.sheetnames)}")

            sheet = wb[connector.excel_sheet_name] if connector.excel_sheet_name else wb.active
            header_row = next(sheet.iter_rows(max_row=1, values_only=True), None)
            col_count = len([c for c in header_row if c is not None]) if header_row else 0
            message = f"Successfully opened workbook sheet '{sheet.title}'. Detected {col_count} column(s)."
            success = True

        elif connector.connector_type == "Database":
            if connector.database_type != "MySQL":
                raise Exception(f"Live connection testing for {connector.database_type} is not yet supported. Only MySQL is currently testable.")

            import pymysql
            decrypted_pw = decrypt_password(connector.password) if connector.password else ""

            conn = pymysql.connect(
                host=connector.host,
                port=connector.port or 3306,
                user=connector.username,
                password=decrypted_pw,
                database=connector.database_name,
                connect_timeout=connector.connection_timeout or 30
            )
            cursor = conn.cursor()
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()
            cursor.close()
            conn.close()
            message = f"Successfully connected to MySQL database '{connector.database_name}'. Server version: {version[0] if version else 'Unknown'}"
            success = True

        elif connector.connector_type == "LDAP":
            raise Exception("LDAP connection testing is not yet implemented.")

        else:
            raise Exception(f"Unknown connector type: {connector.connector_type}")

    except Exception as e:
        success = False
        message = str(e)

    duration_ms = int((time.time() - start_time) * 1000)

    # Update connector status based on test result
    connector.last_tested = datetime.utcnow()
    connector.last_sync_duration = duration_ms
    if success:
        connector.health_status = "Healthy"
        if connector.connector_type in ["Database", "LDAP"]:
            connector.status = "Connected"
        connector.success_count = (connector.success_count or 0) + 1
    else:
        connector.health_status = "Unhealthy"
        if connector.connector_type in ["Database", "LDAP"]:
            connector.status = "Failed"
        connector.failure_count = (connector.failure_count or 0) + 1

    db.commit()

    write_connector_log(
        db=db,
        connector_id=connector.id,
        action="Test Connection",
        details=message,
        status_val="Success" if success else "Failed"
    )

    return {
        "success": success,
        "message": message,
        "duration_ms": duration_ms,
        "tested_at": connector.last_tested.isoformat()
    }
@router.get("/connectors/{id}/tables")
def get_database_tables(id: int, db: Session = Depends(get_db)):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if connector.connector_type != "Database":
        raise HTTPException(status_code=400, detail="Table listing is only available for Database connectors.")
    if connector.database_type != "MySQL":
        raise HTTPException(status_code=400, detail=f"Table listing for {connector.database_type} is not yet supported. Only MySQL is currently supported.")

    import pymysql
    decrypted_pw = decrypt_password(connector.password) if connector.password else ""
    try:
        conn = pymysql.connect(
            host=connector.host,
            port=connector.port or 3306,
            user=connector.username,
            password=decrypted_pw,
            database=connector.database_name,
            connect_timeout=connector.connection_timeout or 30
        )
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list tables: {str(e)}")


@router.get("/connectors/{id}/schema")
def get_connector_schema(
    id: int,
    table_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    fields = []

    try:
        if connector.connector_type == "CSV":
            if not connector.file_path:
                raise Exception("No CSV file has been uploaded to this connector yet.")
            full_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                connector.file_path
            )
            if not os.path.exists(full_path):
                raise Exception(f"File not found on server: {connector.file_path}")

            import csv as csv_module
            with open(full_path, "r", encoding=connector.csv_encoding or "UTF-8") as f:
                reader = csv_module.reader(f, delimiter=connector.csv_delimiter or ",")
                header = next(reader, None)
                if not header:
                    raise Exception("CSV file appears to be empty or has no header row.")
                sample_row = next(reader, None)
                for idx, col_name in enumerate(header):
                    sample_val = sample_row[idx] if sample_row and idx < len(sample_row) else None
                    fields.append({
                        "field_name": col_name.strip(),
                        "data_type": "String",
                        "sample_value": sample_val
                    })

        elif connector.connector_type == "Excel":
            if not connector.file_path:
                raise Exception("No Excel file has been uploaded to this connector yet.")
            full_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                connector.file_path
            )
            if not os.path.exists(full_path):
                raise Exception(f"File not found on server: {connector.file_path}")

            wb = openpyxl.load_workbook(full_path, read_only=True)
            sheet = wb[connector.excel_sheet_name] if connector.excel_sheet_name and connector.excel_sheet_name in wb.sheetnames else wb.active

            rows_iter = sheet.iter_rows(max_row=2, values_only=True)
            header_row = next(rows_iter, None)
            sample_row = next(rows_iter, None)
            if not header_row:
                raise Exception("Excel sheet appears to be empty.")

            for idx, col_name in enumerate(header_row):
                if col_name is None:
                    continue
                sample_val = sample_row[idx] if sample_row and idx < len(sample_row) else None
                fields.append({
                    "field_name": str(col_name).strip(),
                    "data_type": "String",
                    "sample_value": str(sample_val) if sample_val is not None else None
                })

        elif connector.connector_type == "Database":
            if connector.database_type != "MySQL":
                raise Exception(f"Schema discovery for {connector.database_type} is not yet supported. Only MySQL is currently supported.")
            if not table_name:
                raise Exception("A table_name query parameter is required to discover schema for a Database connector.")

            import pymysql
            decrypted_pw = decrypt_password(connector.password) if connector.password else ""
            conn = pymysql.connect(
                host=connector.host,
                port=connector.port or 3306,
                user=connector.username,
                password=decrypted_pw,
                database=connector.database_name,
                connect_timeout=connector.connection_timeout or 30
            )
            cursor = conn.cursor()
            cursor.execute(f"DESCRIBE `{table_name}`")
            rows = cursor.fetchall()
            cursor.execute(f"SELECT * FROM `{table_name}` LIMIT 1")
            sample_row = cursor.fetchone()
            col_names = [desc[0] for desc in cursor.description]
            cursor.close()
            conn.close()

            for row in rows:
                col_name = row[0]
                col_type = row[1]
                sample_val = None
                if sample_row and col_name in col_names:
                    sample_val = sample_row[col_names.index(col_name)]
                fields.append({
                    "field_name": col_name,
                    "data_type": col_type,
                    "sample_value": str(sample_val) if sample_val is not None else None
                })

        elif connector.connector_type == "LDAP":
            raise Exception("Schema discovery for LDAP is not yet implemented.")

        else:
            raise Exception(f"Unknown connector type: {connector.connector_type}")

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    write_connector_log(
        db=db,
        connector_id=connector.id,
        action="Schema Discovery",
        details=f"Discovered {len(fields)} field(s)" + (f" from table '{table_name}'" if table_name else ""),
        status_val="Success"
    )

    return {"fields": fields, "field_count": len(fields)}
@router.put("/connectors/{id}/schedule")
def update_connector_schedule(
    id: int,
    schedule_enabled: bool,
    schedule_frequency: str = None,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    from app.services.scheduler import register_connector_schedule, unregister_connector_schedule

    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if schedule_enabled and not schedule_frequency:
        raise HTTPException(status_code=400, detail="A schedule frequency is required when enabling scheduling.")
    if schedule_frequency and schedule_frequency not in ["Hourly", "Daily", "Weekly"]:
        raise HTTPException(status_code=400, detail="Frequency must be one of: Hourly, Daily, Weekly.")

    connector.schedule_enabled = schedule_enabled
    connector.schedule_frequency = schedule_frequency if schedule_enabled else None
    connector.modified_by = x_user_name
    connector.updated_at = datetime.utcnow()

    if schedule_enabled:
        register_connector_schedule(connector.id, schedule_frequency)
        interval_map = {"Hourly": 1, "Daily": 24, "Weekly": 168}
        from datetime import timedelta
        connector.next_scheduled_run = datetime.utcnow() + timedelta(hours=interval_map[schedule_frequency])
    else:
        unregister_connector_schedule(connector.id)
        connector.next_scheduled_run = None

    db.commit()
    db.refresh(connector)

    write_connector_log(
        db=db,
        connector_id=connector.id,
        action="Schedule Updated",
        details=f"Scheduling {'enabled (' + schedule_frequency + ')' if schedule_enabled else 'disabled'} by {x_user_name}.",
        status_val="Success"
    )

    return {
        "schedule_enabled": connector.schedule_enabled,
        "schedule_frequency": connector.schedule_frequency,
        "next_scheduled_run": connector.next_scheduled_run.isoformat() if connector.next_scheduled_run else None
    }