import React from 'react';

/**
 * Real-time Telemetry and Avionics HUD Component.
 */
export default function Stats({ state, isConnected }) {
  const info = state?.info || {};
  const drone = state?.drone || {};

  const energy = drone.energy !== undefined ? Math.max(0, drone.energy) : 100;
  const birdsRemaining = info.birds_remaining ?? 5;
  const birdsScared = info.birds_scared_off ?? 0;
  const steps = info.steps ?? 0;
  const totalReward = info.total_reward ?? 0.0;

  // Gauge color based on remaining battery
  const getBatteryColor = (level) => {
    if (level > 40) return '#2ea043';
    if (level > 20) return '#d29922';
    return '#f85149';
  };

  const batteryColor = getBatteryColor(energy);

  return (
    <div className="deck-panel">
      <div className="panel-header">
        <span>MISSION TELEMETRY</span>
        <span style={{ color: isConnected ? '#2ea043' : '#f85149' }}>
          {isConnected ? 'ONLINE' : 'LINK LOST'}
        </span>
      </div>

      {/* Battery Status */}
      <div className="battery-gauge">
        <div className="gauge-top">
          <span style={{ color: 'var(--text-dim)' }}>BATTERY LEVEL</span>
          <span style={{ color: batteryColor, fontWeight: 700 }}>
            {energy.toFixed(1)}%
          </span>
        </div>
        <div className="gauge-track">
          <div
            className="gauge-level"
            style={{
              width: `${Math.min(100, Math.max(0, energy))}%`,
              backgroundColor: batteryColor,
            }}
          />
        </div>
      </div>

      {/* Telemetry Grid */}
      <div className="telemetry-grid">
        <div className="telemetry-cell">
          <div className="cell-label">BIRDS REMAINING</div>
          <div className="cell-val alert">{birdsRemaining} / 5</div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">BIRDS SCARED OFF</div>
          <div className="cell-val positive">{birdsScared}</div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">FLIGHT STEPS</div>
          <div className="cell-val">{steps}</div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">TOTAL REWARD</div>
          <div
            className={`cell-val ${
              totalReward >= 0 ? 'positive' : 'warning'
            }`}
          >
            {totalReward > 0 ? `+${totalReward.toFixed(1)}` : totalReward.toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  );
}
