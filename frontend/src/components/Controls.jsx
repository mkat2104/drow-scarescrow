import React from 'react';

/**
 * Operations & Flight Control Deck Component.
 * Industrial Ground Control Station (GCS) flight console.
 */
export default function Controls({
  isRunning,
  onTogglePlay,
  onStep,
  onReset,
  onPulse,
  mode,
  onModeChange,
  speed,
  onSpeedChange,
  eventLogs = [],
  activeKeys = new Set(),
}) {
  return (
    <div className="deck-panel">
      <div className="panel-header">
        <span>FLIGHT COMMAND</span>
        <span>SYS-RDY</span>
      </div>

      <div className="flight-actions">
        {/* Mode Selector */}
        <div style={{ marginBottom: '0.35rem' }}>
          <div className="cell-label" style={{ marginBottom: '0.35rem' }}>
            CONTROL MODE
          </div>
          <div className="flight-mode-selector" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <button
              className={`mode-tab ${mode === 'agent' ? 'active' : ''}`}
              onClick={() => onModeChange('agent')}
            >
              AUTONOMOUS
            </button>
            <button
              className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
              onClick={() => onModeChange('manual')}
            >
              MANUAL (PILOT)
            </button>
            <button
              className={`mode-tab ${mode === 'dock' ? 'active' : ''}`}
              onClick={() => onModeChange('dock')}
              style={{ color: mode === 'dock' ? '#7ee787' : 'inherit' }}
            >
              ⚡ RTB / DOCK
            </button>
          </div>
        </div>

        {/* Primary Playback / Action Buttons */}
        <div className="btn-row">
          <button
            className={`btn-gcs ${isRunning ? 'danger' : 'primary'}`}
            onClick={onTogglePlay}
          >
            {isRunning ? '⏸ PAUSE PATROL' : '▶ LAUNCH / RESUME'}
          </button>
          <button className="btn-gcs" onClick={onStep} disabled={isRunning}>
            ⏭ STEP (1F)
          </button>
        </div>

        {/* Tactical Tactical Actions */}
        <div className="btn-row">
          <button
            className="btn-gcs"
            onClick={onPulse}
            style={{ borderColor: 'var(--terminal-cyan)', color: 'var(--terminal-cyan)' }}
          >
            🔊 SONIC PULSE (SPACE)
          </button>
          <button
            className="btn-gcs"
            onClick={() => onModeChange(mode === 'dock' ? 'agent' : 'dock')}
            style={{ borderColor: '#7ee787', color: '#7ee787' }}
          >
            {mode === 'dock' ? 'CANCEL RTB' : '⚡ RECHARGE DOCK (H)'}
          </button>
        </div>

        <div className="btn-row">
          <button className="btn-gcs" onClick={onReset}>
            🔄 RESET CAMPAIGN
          </button>

          {/* Speed Toggle */}
          <button
            className="btn-gcs"
            onClick={() => {
              const speeds = [1, 2, 4];
              const nextIdx = (speeds.indexOf(speed) + 1) % speeds.length;
              onSpeedChange(speeds[nextIdx]);
            }}
          >
            ⏩ {speed}x SPEED
          </button>
        </div>

        {/* Manual Keyboard Guide */}
        <div style={{ marginTop: '0.45rem' }}>
          <div className="cell-label" style={{ marginBottom: '0.35rem' }}>
            KEYBOARD OVERRIDE
            {mode !== 'manual' && (
              <span style={{ color: 'var(--flight-amber)', marginLeft: '0.5rem' }}>
                press key to pilot
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
            {/* WASD layout */}
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '3px' }}>
                WASD
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 34px)',
                  gap: '3px',
                }}
              >
                {[
                  { key: null, label: '' },
                  { key: 'w', label: '↑ W' },
                  { key: null, label: '' },
                  { key: 'a', label: '← A' },
                  { key: 's', label: '↓ S' },
                  { key: 'd', label: '→ D' },
                ].map((k, i) => (
                  <div
                    key={i}
                    className={`key-box${k.key && activeKeys.has(k.key) ? ' active' : ''}`}
                    style={{
                      height: '26px',
                      lineHeight: '26px',
                      visibility: k.label ? 'visible' : 'hidden',
                    }}
                  >
                    {k.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Tactical Shortcuts */}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: '1.5' }}>
              <div><strong style={{ color: '#c9d1d9' }}>SPACE</strong>: Sonic Deterrent Pulse</div>
              <div><strong style={{ color: '#c9d1d9' }}>H</strong>: Return to Base / Dock</div>
              <div><strong style={{ color: '#c9d1d9' }}>Hold Keys</strong>: Continuous Flight</div>
              <div><strong style={{ color: '#c9d1d9' }}>W+D, S+A</strong>: Diagonals</div>
            </div>
          </div>
        </div>

        {/* Event Log Feed */}
        <div style={{ marginTop: '0.5rem' }}>
          <div className="cell-label" style={{ marginBottom: '0.35rem' }}>
            TACTICAL EVENT FEED
          </div>
          <div className="event-feed">
            {eventLogs.length === 0 ? (
              <div className="feed-line">
                <span className="feed-time">00:00</span>
                <span className="feed-msg">Telemetry system nominal. Standby for patrol.</span>
              </div>
            ) : (
              eventLogs.map((log, index) => (
                <div key={index} className="feed-line">
                  <span className="feed-time">{log.time}</span>
                  <span className={`feed-msg ${log.type || ''}`}>
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
