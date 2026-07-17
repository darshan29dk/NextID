import React from 'react';

// Custom SVG Donut Chart
export const SeverityDonut = ({ data = {}, onDrilldown }) => {
  const entries = Object.entries(data);
  const total = entries.reduce((acc, [_, v]) => acc + v, 0);
  
  if (total === 0) {
    return <div className="chart-no-data">No active open violations.</div>;
  }

  // Segment stroke calculations
  let accumulatedPercent = 0;
  const radius = 40;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;

  const colors = {
    CRITICAL: 'var(--danger)',
    HIGH: 'var(--warning)',
    MEDIUM: 'var(--info)',
    LOW: 'var(--success)'
  };

  return (
    <div className="donut-chart-container">
      <svg width="150" height="150" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="transparent" stroke="var(--bg-hover)" strokeWidth={strokeWidth} />
        {entries.map(([sev, val]) => {
          const pct = (val / total) * 100;
          const strokeDashoffset = circumference - (pct / 100) * circumference;
          const rotation = (accumulatedPercent * 3.6);
          accumulatedPercent += pct;
          
          return (
            <circle 
              key={sev}
              cx="60" 
              cy="60" 
              r={radius} 
              fill="transparent" 
              stroke={colors[sev] || 'var(--text-muted)'} 
              strokeWidth={strokeWidth} 
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform={`rotate(${rotation - 90} 60 60)`}
              style={{ cursor: 'pointer', transition: 'stroke-width 0.3s ease' }}
              onClick={() => onDrilldown({ severity: sev })}
              className="donut-segment"
              title={`${sev}: ${val}`}
            />
          );
        })}
        {/* Center label */}
        <text x="60" y="62" textAnchor="middle" fill="var(--text-main)" fontSize="12" fontWeight="bold">
          {total}
        </text>
        <text x="60" y="75" textAnchor="middle" fill="var(--text-muted)" fontSize="8">
          Violations
        </text>
      </svg>

      <div className="donut-legend">
        {entries.map(([sev, val]) => (
          <div key={sev} className="legend-row clickable-legend" onClick={() => onDrilldown({ severity: sev })}>
            <span className="legend-dot" style={{ backgroundColor: colors[sev] }}></span>
            <span className="legend-label">{sev}</span>
            <span className="legend-value">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Department Horizontal Bar Chart
export const DepartmentBarChart = ({ data = {}, onDrilldown }) => {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const maxVal = entries.length > 0 ? entries[0][1] : 1;

  if (entries.length === 0) {
    return <div className="chart-no-data">No department data.</div>;
  }

  return (
    <div className="dept-bar-chart">
      {entries.map(([dept, val]) => {
        const pct = (val / maxVal) * 100;
        return (
          <div key={dept} className="bar-row clickable-bar-row" onClick={() => onDrilldown({ department: dept })}>
            <div className="bar-row-label">
              <span>{dept}</span>
              <strong>{val}</strong>
            </div>
            <div className="bar-container">
              <div className="bar-fill blue" style={{ width: `${pct}%` }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Application Vertical Bar Chart
export const ApplicationBarChart = ({ data = {}, onDrilldown }) => {
  const entries = Object.entries(data).slice(0, 6);
  const maxVal = entries.reduce((acc, [_, v]) => Math.max(acc, v), 1);

  if (entries.length === 0) {
    return <div className="chart-no-data">No application data.</div>;
  }

  return (
    <div className="app-bar-chart">
      <svg width="100%" height="160" viewBox="0 0 300 160" preserveAspectRatio="none">
        {entries.map(([app, val], idx) => {
          const barHeight = (val / maxVal) * 120;
          const x = 20 + idx * 45;
          const y = 130 - barHeight;
          return (
            <g key={app} style={{ cursor: 'pointer' }} onClick={() => onDrilldown({ application: app })}>
              <rect 
                x={x} 
                y={y} 
                width="24" 
                height={barHeight} 
                fill="var(--primary)" 
                rx="3"
                className="vertical-bar"
              />
              <text x={x + 12} y="145" textAnchor="middle" fill="var(--text-muted)" fontSize="8" style={{ width: '40px', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {app.substring(0, 5)}
              </text>
              <text x={x + 12} y={y - 6} textAnchor="middle" fill="var(--text-main)" fontSize="8" fontWeight="bold">
                {val}
              </text>
            </g>
          );
        })}
        <line x1="10" y1="130" x2="290" y2="130" stroke="var(--border-color)" strokeWidth="1" />
      </svg>
    </div>
  );
};

// Simple SVG Line Chart for trends
export const TrendLineChart = ({ data = [], strokeColor = 'var(--primary)' }) => {
  if (data.length === 0) {
    return <div className="chart-no-data">No trend metrics.</div>;
  }

  const counts = data.map(d => d.count);
  const maxVal = counts.reduce((acc, v) => Math.max(acc, v), 1);
  const width = 300;
  const height = 120;

  // Generate points
  const points = data.map((d, idx) => {
    const x = 10 + (idx / (data.length - 1)) * 280;
    const y = height - 15 - (d.count / maxVal) * 90;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="trend-line-chart">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          points={points}
        />
        {/* Draw subtle grid lines */}
        <line x1="10" y1={height - 15} x2={width - 10} y2={height - 15} stroke="var(--border-color)" strokeWidth="1" />
      </svg>
      <div className="trend-footer">
        <span>30 Days Ago</span>
        <span>Today</span>
      </div>
    </div>
  );
};
