import React from 'react';

const DEPARTMENTS = ["Finance", "Information Technology", "Human Resources", "Sales", "Engineering", "Marketing"];
const APPLICATIONS = ["SAP Production ERP", "GitHub Enterprise", "Workday HCM", "Active Directory", "Salesforce"];

const RiskHeatmap = ({ data = [], onCellClick }) => {
  // Helper to query score from list
  const getCellData = (dept, app) => {
    return data.find(
      x => x.department.toLowerCase() === dept.toLowerCase() && 
           x.application.toLowerCase() === app.toLowerCase()
    );
  };

  const getHeatmapColorClass = (scale) => {
    switch (scale) {
      case 'green': return 'heat-green';
      case 'yellow': return 'heat-yellow';
      case 'orange': return 'heat-orange';
      case 'red': return 'heat-red';
      default: return 'heat-empty';
    }
  };

  return (
    <div className="risk-heatmap-wrapper">
      <div className="heatmap-grid-scroll">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th className="corner-lbl">Dept / App</th>
              {APPLICATIONS.map(app => (
                <th key={app} className="col-header-lbl">{app}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEPARTMENTS.map(dept => (
              <tr key={dept}>
                <td className="row-header-lbl"><b>{dept}</b></td>
                {APPLICATIONS.map(app => {
                  const cell = getCellData(dept, app);
                  const count = cell ? cell.violations_count : 0;
                  const score = cell ? cell.risk_score : 0;
                  const color = cell ? cell.color_scale : 'empty';

                  return (
                    <td 
                      key={app} 
                      className={`heatmap-cell ${getHeatmapColorClass(color)}`}
                      onClick={() => onCellClick({ department: dept, application: app })}
                      title={`${dept} - ${app}: ${count} violations, Risk Score: ${score}`}
                    >
                      {count > 0 ? (
                        <div className="cell-content">
                          <span className="cell-score">{score}</span>
                          <span className="cell-count">{count} open</span>
                        </div>
                      ) : (
                        <span className="cell-empty-lbl">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Legend Scale */}
      <div className="heatmap-legend">
        <div className="legend-item"><span className="legend-box heat-green"></span><span>Low (0-25)</span></div>
        <div className="legend-item"><span className="legend-box heat-yellow"></span><span>Moderate (26-50)</span></div>
        <div className="legend-item"><span className="legend-box heat-orange"></span><span>High (51-75)</span></div>
        <div className="legend-item"><span className="legend-box heat-red"></span><span>Critical (76-100)</span></div>
      </div>
    </div>
  );
};

export default RiskHeatmap;
