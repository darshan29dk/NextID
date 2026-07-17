import csv
import io
from typing import Optional, List
import openpyxl

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.utils.permissions import require_permission
from app.models.sod_dashboard import GovernanceDashboardPreferences
from app.schemas.sod_dashboard import GovernanceDashboardPreferencesResponse, GovernanceDashboardPreferencesUpdate
from app.services.sod_dashboard_service import (
    get_governance_dashboard_data,
    get_governance_kpis,
    get_governance_charts,
    get_governance_heatmap
)

router = APIRouter()

@router.get("/governance/dashboard", dependencies=[Depends(require_permission("SoD Policies", "view"))])
def get_dashboard_summary(
    department: Optional[str] = None,
    application: Optional[str] = None,
    risk_level: Optional[str] = None,
    status: Optional[str] = None,
    force_refresh: bool = False,
    db: Session = Depends(get_db)
):
    """Main endpoint to load all widgets, KPIs, charts, heatmaps, and summaries."""
    filters = {}
    if department:
        filters["department"] = department
    if application:
        filters["application"] = application
    if risk_level:
        filters["risk_level"] = risk_level
    if status:
        filters["status"] = status
        
    return get_governance_dashboard_data(db, filters, force_refresh)

@router.get("/governance/dashboard/kpis", dependencies=[Depends(require_permission("SoD Policies", "view"))])
def get_dashboard_kpis(
    department: Optional[str] = None,
    application: Optional[str] = None,
    risk_level: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    filters = {}
    if department:
        filters["department"] = department
    if application:
        filters["application"] = application
    if risk_level:
        filters["risk_level"] = risk_level
    if status:
        filters["status"] = status
    return get_governance_kpis(db, filters)

@router.get("/governance/dashboard/charts", dependencies=[Depends(require_permission("SoD Policies", "view"))])
def get_dashboard_charts(
    department: Optional[str] = None,
    application: Optional[str] = None,
    db: Session = Depends(get_db)
):
    filters = {}
    if department:
        filters["department"] = department
    if application:
        filters["application"] = application
    return get_governance_charts(db, filters)

@router.get("/governance/dashboard/heatmap", dependencies=[Depends(require_permission("SoD Policies", "view"))])
def get_dashboard_heatmap(
    department: Optional[str] = None,
    application: Optional[str] = None,
    db: Session = Depends(get_db)
):
    filters = {}
    if department:
        filters["department"] = department
    if application:
        filters["application"] = application
    return get_governance_heatmap(db, filters)

# ── User preferences settings ──
@router.get("/governance/dashboard/preferences", response_model=GovernanceDashboardPreferencesResponse, dependencies=[Depends(require_permission("SoD Policies", "view"))])
def get_user_preferences(x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    # Look up by simple hash check of name mapping or use user_id fallback
    pref = db.query(GovernanceDashboardPreferences).filter(GovernanceDashboardPreferences.user_id == 1).first()
    if not pref:
        # Create a default settings row
        pref = GovernanceDashboardPreferences(
            user_id=1,
            default_filters="{}",
            favorite_widgets="[]",
            layout="{}",
            theme="dark"
        )
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref

@router.post("/governance/dashboard/preferences", response_model=GovernanceDashboardPreferencesResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def save_user_preferences(
    payload: GovernanceDashboardPreferencesUpdate,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    pref = db.query(GovernanceDashboardPreferences).filter(GovernanceDashboardPreferences.user_id == 1).first()
    if not pref:
        pref = GovernanceDashboardPreferences(user_id=1)
        db.add(pref)
        
    pref.default_filters = payload.default_filters or pref.default_filters
    pref.favorite_widgets = payload.favorite_widgets or pref.favorite_widgets
    pref.layout = payload.layout or pref.layout
    pref.theme = payload.theme or pref.theme
    
    db.commit()
    db.refresh(pref)
    return pref

# ── Reporting Exports ──
@router.get("/governance/dashboard/export/csv", dependencies=[Depends(require_permission("SoD Policies", "view"))])
def export_dashboard_csv(db: Session = Depends(get_db)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Metric / Dimension", "Department", "Application", "Risk Score Value / Active Count"])
    
    # 1. Heatmap cells
    heatmap = get_governance_heatmap(db)
    for h in heatmap:
        writer.writerow([
            "Risk Matrix cell",
            h["department"],
            h["application"],
            f"{h['risk_score']} risk score ({h['violations_count']} violations)"
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=governance_risk_report.csv"}
    )

@router.get("/governance/dashboard/export/excel", dependencies=[Depends(require_permission("SoD Policies", "view"))])
def export_dashboard_excel(db: Session = Depends(get_db)):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Risk Matrix Overview"
    
    ws.append(["Metric Type", "Department", "Application", "Risk Score", "Violations Count", "Severity Warning"])
    
    heatmap = get_governance_heatmap(db)
    for h in heatmap:
        ws.append([
            "Heatmap Matrix",
            h["department"],
            h["application"],
            h["risk_score"],
            h["violations_count"],
            h["color_scale"].upper()
        ])
        
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=governance_risk_report.xlsx"}
    )
