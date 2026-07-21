import React from 'react';
import './RoleMiningMatrix.css';

/**
 * Alternate chart views for the Analytical View tab (formerly "Matrix View"),
 * per sir's (Dharankumar Bera) feedback: the entitlement x member grid should
 * be one view among several. All of these are computed from the exact same
 * entitlements/members/cells payload the grid already uses (no extra API
 * calls, no fabricated numbers).
 *
 * Props mirror RoleMiningMatrix:
 *   entitlements: [{ key, entitlement_id, entitlement_name, application_name, is_core, role_id, role_name, color }]
 *   members: [{ key, account_id, name, role_id, role_name, color }]
 *   cells: boolean[entitlements.length][members.length]
 *   mode: 'coverage' | 'core' | 'member' | 'role'
 */

const VIEW_MODES = [
  { value: 'grid', label: 'Grid (dots)' },
  { value: 'coverage', label: 'Coverage by Entitlement' },
  { value: 'core', label: 'Core vs Non-Core' },
  { value: 'member', label: 'Member Match' },
  { value: 'role', label: 'Entitlements by Role' },
];

// Generic multi-segment SVG donut - shared math for Core Split and By Role.
const Donut = ({ segments, centerLabel, centerSubLabel }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <div className="matrix-empty-state">Nothing to chart yet.</div>;
  }

  const radius = 40;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPct = 0;

  return (
    <div className="donut-chart-container">
      <svg width="150" height="150" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="transparent" stroke="var(--bg-hover)" strokeWidth={strokeWidth} />
        {segments.filter((s) => s.value > 0).map((seg) => {
          const pct = (seg.value / total) * 100;
          const dashoffset = circumference - (pct / 100) * circumference;
          const rotation = accumulatedPct * 3.6;
          accumulatedPct += pct;
          return (
            <circle
              key={seg.label}
              cx="60" cy="60" r={radius} fill="transparent"
              stroke={seg.color} strokeWidth={strokeWidth}
              strokeDasharray={circumference} strokeDashoffset={dashoffset}
              transform={`rotate(${rotation - 90} 60 60)`}
            />
          );
        })}
        <text x="60" y="62" textAnchor="middle" fill="var(--text-main)" fontSize="16" fontWeight="bold">{centerLabel ?? total}</text>
        <text x="60" y="76" textAnchor="middle" fill="var(--text-muted)" fontSize="8">{centerSubLabel}</text>
      </svg>
      <div className="donut-legend">
        {segments.map((seg) => (
          <div className="legend-row" key={seg.label}>
            <span className="legend-dot" style={{ backgroundColor: seg.color }}></span>
            <span className="legend-label">{seg.label}</span>
            <span className="legend-value">{seg.value} ({Math.round((seg.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const CoreDoughnut = ({ entitlements }) => {
  const coreCount = entitlements.filter((e) => e.is_core).length;
  const nonCoreCount = entitlements.length - coreCount;
  return (
    <Donut
      segments={[
        { label: 'Core', value: coreCount, color: 'var(--success)' },
        { label: 'Non-Core', value: nonCoreCount, color: 'var(--text-muted)' },
      ]}
      centerLabel={entitlements.length}
      centerSubLabel="Entitlements"
    />
  );
};

const RoleSplitDoughnut = ({ entitlements }) => {
  const byRole = {};
  entitlements.forEach((e) => {
    const key = e.role_name || 'Unassigned';
    if (!byRole[key]) byRole[key] = { label: key, value: 0, color: e.color || 'var(--primary)' };
    byRole[key].value += 1;
  });
  const segments = Object.values(byRole);
  return (
    <Donut segments={segments} centerLabel={entitlements.length} centerSubLabel="Entitlements" />
  );
};

const CoverageBarChart = ({ entitlements, members, cells }) => {
  const memberIndexByKey = {};
  members.forEach((m, idx) => { memberIndexByKey[m.key] = idx; });
  const multiRole = new Set(entitlements.map((e) => e.role_name)).size > 1;

  const rows = entitlements.map((ent, rowIdx) => {
    const roleMembers = members.filter((m) => m.role_id === ent.role_id);
    const holders = roleMembers.filter((m) => {
      const colIdx = memberIndexByKey[m.key];
      return cells[rowIdx] && cells[rowIdx][colIdx];
    }).length;
    const pct = roleMembers.length ? Math.round((holders / roleMembers.length) * 100) : 0;
    return { ...ent, holders, roleMemberCount: roleMembers.length, pct };
  });

  return (
    <div className="dept-bar-chart">
      {rows.map((row) => (
        <div key={row.key} className="bar-row">
          <div className="bar-row-label">
            <span title={row.application_name || ''}>
              {row.entitlement_name}
              {multiRole && row.role_name && <span className="text-muted" style={{ fontSize: '10.5px', marginLeft: '6px' }}>({row.role_name})</span>}
            </span>
            <strong>{row.holders}/{row.roleMemberCount} ({row.pct}%)</strong>
          </div>
          <div className="bar-container">
            <div className="bar-fill" style={{ width: `${row.pct}%`, backgroundColor: row.color || 'var(--primary)' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
};

const MemberMatchBarChart = ({ entitlements, members, cells }) => {
  const entIndexByKey = {};
  entitlements.forEach((e, idx) => { entIndexByKey[e.key] = idx; });
  const multiRole = new Set(members.map((m) => m.role_name)).size > 1;

  const rows = members.map((mem, colIdx) => {
    const roleEnts = entitlements.filter((e) => e.role_id === mem.role_id);
    const held = roleEnts.filter((e) => {
      const rowIdx = entIndexByKey[e.key];
      return cells[rowIdx] && cells[rowIdx][colIdx];
    }).length;
    const pct = roleEnts.length ? Math.round((held / roleEnts.length) * 100) : 0;
    return { ...mem, held, roleEntCount: roleEnts.length, pct };
  });

  return (
    <div className="dept-bar-chart">
      {rows.map((row) => (
        <div key={row.key} className="bar-row">
          <div className="bar-row-label">
            <span>
              {row.name}
              {multiRole && row.role_name && <span className="text-muted" style={{ fontSize: '10.5px', marginLeft: '6px' }}>({row.role_name})</span>}
            </span>
            <strong>{row.held}/{row.roleEntCount} ({row.pct}%)</strong>
          </div>
          <div className="bar-container">
            <div className="bar-fill" style={{ width: `${row.pct}%`, backgroundColor: row.color || 'var(--primary)' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
};

const RoleAnalyticalCharts = ({ entitlements = [], members = [], cells = [], loading = false, mode = 'core', emptyMessage = 'No mining data available for this view yet.' }) => {
  if (loading) {
    return <div className="matrix-empty-state">Loading...</div>;
  }
  if (!entitlements.length || !members.length) {
    return <div className="matrix-empty-state">{emptyMessage}</div>;
  }

  switch (mode) {
    case 'coverage':
      return <CoverageBarChart entitlements={entitlements} members={members} cells={cells} />;
    case 'member':
      return <MemberMatchBarChart entitlements={entitlements} members={members} cells={cells} />;
    case 'role':
      return <RoleSplitDoughnut entitlements={entitlements} />;
    case 'core':
    default:
      return <CoreDoughnut entitlements={entitlements} />;
  }
};

export default RoleAnalyticalCharts;
export { VIEW_MODES };
