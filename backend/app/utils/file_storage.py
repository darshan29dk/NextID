import os
from sqlalchemy.orm import Session
from app.models.connector import Connector
from app.models.connector_file import ConnectorFile
from app.models.application import Application

def restore_file_from_db_if_needed(db: Session, model_instance):
    """
    Checks if the file referenced by model_instance.file_path exists on disk.
    If not, and the file content is stored in the database, it recreates it on the filesystem.
    """
    if not model_instance or not hasattr(model_instance, "file_path") or not model_instance.file_path:
        return
    
    # If the file path is a database table name (connector_type == "Database"), ignore it
    if hasattr(model_instance, "connector_type") and model_instance.connector_type == "Database":
        return

    # Resolve the expected file path relative to project root
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    full_path = os.path.join(base_dir, model_instance.file_path)
    
    if os.path.exists(full_path):
        return  # File is already on disk
    
    # Try to retrieve content from DB
    content = None
    if isinstance(model_instance, Connector):
        # Query the latest file uploaded for this connector that has non-null content
        conn_file = db.query(ConnectorFile).filter(
            ConnectorFile.connector_id == model_instance.id,
            ConnectorFile.file_content != None
        ).order_by(ConnectorFile.upload_date.desc()).first()
        
        if conn_file:
            content = conn_file.file_content
            
    elif isinstance(model_instance, Application):
        if hasattr(model_instance, "file_content") and model_instance.file_content:
            content = model_instance.file_content

    if content:
        try:
            # Recreate directory structure if it has been deleted
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(content)
            print(f"Successfully restored file from database to: {full_path}")
        except Exception as e:
            print(f"Error restoring file to disk: {e}")
