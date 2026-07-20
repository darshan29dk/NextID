import React from 'react';
import './RoleMiningMatrix.css';

/**
 * Entitlement x User matrix grid, per sir's (Dharankumar Bera) Role Studio
 * reference: entitlement names down the rows, individual users across the
 * columns, a colored dot wherever that user actually holds that entitlement.
 *
 * Every dot reflects a real grant pulled from the imported account/entitlement
 * data - not just role membership - so gaps are visible (a member missing an
 * entitlement the role expects to shows up as a blank cell in their column).
 *
 * Props:
 *   entitlements: [{ key, entitlement_name, application_name, is_core, role_name, color }]
 *   members: [{ key, name, role_name, color }]
 *   cells: boolean[entitlements.length][members.length]
 *   roles: optional legend [{ role_id, role_name, color }] - shown when more than one role is present
 *   loading, emptyMessage
 */
const RoleMiningMatrix = ({ entitlements = [], members = [], cells = [], roles = [], loading = false, emptyMessage = 'No mining data available for this view yet.' }) => {
  if (loading) {
    return <div className="matrix-empty-state">Loading matrix...</div>;
  }

  if (!entitlements.length || !members.length) {
    return <div className="matrix-empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="role-matrix-wrapper">
      {roles.length > 1 && (
        <div className="matrix-legend">
          {roles.map((r) => (
            <span className="matrix-legend-item" key={r.role_id}>
              <span className="matrix-legend-dot" style={{ backgroundColor: r.color }} />
              {r.role_name}
            </span>
          ))}
        </div>
      )}

      <div className="role-matrix-scroll">
        <table className="role-matrix-table">
          <thead>
            <tr>
              <th className="matrix-corner-cell">
                <span>Entitlement Name</span>
              </th>
              {members.map((m) => (
                <th key={m.key} className="matrix-col-header" title={m.name}>
                  <span className="matrix-col-header-label">{m.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entitlements.map((ent, rowIdx) => (
              <tr key={ent.key}>
                <td className="matrix-row-label" style={{ borderLeftColor: ent.color }}>
                  <span className="matrix-row-label-name">{ent.entitlement_name}</span>
                  {ent.application_name && (
                    <span className="matrix-row-label-app">{ent.application_name}</span>
                  )}
                </td>
                {members.map((mem, colIdx) => {
                  const hasGrant = cells[rowIdx] && cells[rowIdx][colIdx];
                  return (
                    <td key={mem.key} className="matrix-cell">
                      {hasGrant && (
                        <span
                          className="matrix-dot"
                          style={{ backgroundColor: ent.color }}
                          title={`${mem.name} has ${ent.entitlement_name}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RoleMiningMatrix;
