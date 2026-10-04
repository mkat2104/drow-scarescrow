import React from 'react';

/**
 * Real-time Telemetry, Avionics, Crop Yield and Mission Deck HUD.
 */
export default function Stats({ state, isConnected }) {
  const info = state?.info || {};
  const drone = state?.drone || {};
  const crops = state?.crops || {};

  const energy = drone.energy !== undefined ? Math.max(0, drone.energy) : 100;
  const isCharging = drone.is_charging ?? false;
  const cropHealth = crops.health ?? 100.0;
  const harvestSaved = crops.harvest_saved ?? 0.0;
  const wave = state?.wave ?? info.wave ?? 1;
  const birdsRemaining = info.birds_remaining ?? 5;
  const birdsScared = info.birds_scared_off ?? 0;
  const steps = info.steps ?? 0;
  const totalReward = info.total_reward ?? 0.0;

  // Gauge colors
  const getBatteryColor = (level) => {
    if (isCharging) return '#7ee787';
    if (level > 40) return '#2ea043';
    if (level > 20) return '#d29922';
    return '#f85149';
  };

  const getCropColor = (health) => {
    if (health > 70) return '#2ea043';
    if (health > 35) return '#d29922';
    return '#f85149';
  };

  const batteryColor = getBatteryColor(energy);
  const cropColor = getCropColor(cropHealth);

  return (
    <div className="deck-panel">
      <div className="panel-header">
        <span>MISSION TELEMETRY</span>
        <span style={{ color: isConnected ? '#2ea043' : '#f85149' }}>
          {isConnected ? 'ONLINE · 30Hz' : 'LINK LOST'}
        </span>
      </div>

      {/* Battery Status */}
      <div className="battery-gauge">
        <div className="gauge-top">
          <span style={{ color: 'var(--text-dim)' }}>
            UAV POWER {isCharging ? '⚡ (FAST CHARGING)' : ''}
          </span>
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
              boxShadow: isCharging ? '0 0 10px rgba(126, 231, 135, 0.6)' : 'none',
            }}
          />
        </div>
      </div>

      {/* Crop Integrity Gauge */}
      <div className="battery-gauge" style={{ marginTop: '0.45rem' }}>
        <div className="gauge-top">
          <span style={{ color: 'var(--text-dim)' }}>CROP INTEGRITY</span>
          <span style={{ color: cropColor, fontWeight: 700 }}>
            {cropHealth.toFixed(1)}%
          </span>
        </div>
        <div className="gauge-track">
          <div
            className="gauge-level"
            style={{
              width: `${Math.min(100, Math.max(0, cropHealth))}%`,
              backgroundColor: cropColor,
            }}
          />
        </div>
      </div>

      {/* Telemetry Grid */}
      <div className="telemetry-grid" style={{ marginTop: '0.6rem' }}>
        <div className="telemetry-cell">
          <div className="cell-label">THREAT WAVE</div>
          <div className="cell-val" style={{ color: 'var(--terminal-cyan)' }}>
            WAVE {wave}
          </div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">HARVEST PROTECTED</div>
          <div className="cell-val positive">${harvestSaved.toFixed(0)}</div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">ACTIVE PESTS</div>
          <div className="cell-val alert">{birdsRemaining} BIRDS</div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">BIRDS REPELLED</div>
          <div className="cell-val positive">{birdsScared}</div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">BASE DOCK</div>
          <div className="cell-val" style={{ color: isCharging ? '#7ee787' : 'var(--text-dim)' }}>
            {isCharging ? '⚡ DOCKED' : 'AIRBORNE'}
          </div>
        </div>

        <div className="telemetry-cell">
          <div className="cell-label">SESSION REWARD</div>
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
