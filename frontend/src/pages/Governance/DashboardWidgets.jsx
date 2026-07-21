import React from 'react';
import { Shield, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';

export const KpiCard = ({ title, value, trend, trendType, icon: Icon, onClick }) => {
  const getTrendClass = () => {
    if (!trend) return '';
    // TrendType 'good' means decreasing violations or increasing approvals is good
    if (trendType === 'good') {
      return trend.startsWith('-') ? 'trend-success' : 'trend-danger';
    } else {
      return trend.startsWith('+') ? 'trend-success' : 'trend-danger';
    }
  };

  return (
    <div className="sod-kpi-card clickable-card" onClick={onClick}>
      <div className="kpi-card-header">
        <span className="kpi-card-title">{title}</span>
        {Icon && <Icon className="kpi-card-icon" size={16} />}
      </div>
      <div className="kpi-card-value">{value}</div>
      {trend && (
        <div className={`kpi-card-trend ${getTrendClass()}`}>
          <span>{trend}</span>
          <span className="trend-lbl"> vs last 30d</span>
        </div>
      )}
    </div>
  );
};

export const ScoreWidget = ({ score, onClick }) => {
  const getScoreStatus = (val) => {
    if (val >= 80) return { label: 'Excellent', color: 'var(--success)' };
    if (val >= 60) return { label: 'Good / Moderate', color: 'var(--info)' };
    if (val >= 40) return { label: 'High Risk', color: 'var(--warning)' };
    return { label: 'Critical Alert', color: 'var(--danger)' };
  };

  const status = getScoreStatus(score);

  return (
    <div className="sod-kpi-card score-kpi-card clickable-card" onClick={onClick}>
      <div className="kpi-card-header">
        <span className="kpi-card-title">Governance Score</span>
        <Shield size={16} className="text-primary" />
      </div>
      <div className="score-widget-body">
        <div className="score-value-big" style={{ color: status.color }}>{score}%</div>
        <div className="score-status-lbl" style={{ color: status.color }}>{status.label}</div>
      </div>
      <div className="score-widget-desc">Compliance Health Index</div>
    </div>
  );
};
