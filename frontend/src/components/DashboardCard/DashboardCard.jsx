import React from 'react';
import './DashboardCard.css';

const DashboardCard = ({ title, value, icon: Icon, color, trend, loading, onClick }) => {
  const isTrendDown = trend && trend.startsWith('-');

  // Some cards pass a text label instead of a count (e.g. "INCREMENTAL" for
  // "Last Executed Scan"). The default 26px bold number style was designed
  // for short numeric values and blows up awkwardly for longer words, so
  // text values get a smaller variant instead.
  const isTextValue = typeof value === 'string' && value.trim() !== '' && isNaN(Number(value.replace(/,/g, '')));
  // Callers can also pass a React element directly (e.g. a colored badge
  // matching how the same value is styled elsewhere on the page) instead of
  // a plain string/number.
  const isElementValue = React.isValidElement(value);

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
          <h3 className={`kpi-value-premium ${isTextValue ? 'kpi-value-text' : ''} ${isElementValue ? 'kpi-value-element' : ''}`}>
            {isElementValue ? value : (value !== undefined ? value.toLocaleString() : 0)}
          </h3>
        )}
        <span className="kpi-label-premium">{title}</span>
      </div>
    </div>
  );
};

export default DashboardCard;
