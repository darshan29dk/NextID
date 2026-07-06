import React from 'react';
import './DashboardCard.css';

const DashboardCard = ({ title, value, icon: Icon, color, trend, loading, onClick }) => {
  const isTrendDown = trend && trend.startsWith('-');
  
  return (
    <div 
      className={`kpi-card-premium ${onClick ? 'interactive-kpi' : ''}`} 
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : {}}
    >
      <div className="kpi-top-row">
        <div className={`kpi-icon-container kpi-bg-${color || 'blue'}`}>
          <Icon size={16} />
        </div>
        {trend && (
          <span className={`kpi-trend ${isTrendDown ? 'trend-down' : 'trend-up'}`}>
            {trend}
          </span>
        )}
      </div>
      <div className="kpi-bottom-content">
        {loading ? (
          <div className="kpi-value-shimmer"></div>
        ) : (
          <h3 className="kpi-value-premium">{value !== undefined ? value.toLocaleString() : 0}</h3>
        )}
        <span className="kpi-label-premium">{title}</span>
      </div>
    </div>
  );
};

export default DashboardCard;
