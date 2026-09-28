import React from 'react';

/**
 * Operations & Flight Control Deck Component.
 */
export default function Controls({
  isRunning,
  onTogglePlay,
  onStep,
  onReset,
  mode,
  onModeChange,
  speed,
  onSpeedChange,
  eventLogs = [],
}) {
  return (
    <div className="deck-panel">
      <div className="panel-header">
        <span>FLIGHT COMMAND</span>
        <span>SYS-RDY</span>
      </div>

      <div className="flight-actions">
        {/* Mode Selector */}
        <div style={{ marginBottom: '0.25rem' }}>
          <div className="cell-label" style={{ marginBottom: '0.35rem' }}>
            CONTROL MODE
          </div>
          <div className="flight-mode-selector">
            <button
              className={`mode-tab ${mode === 'agent' ? 'active' : ''}`}
              onClick={() => onModeChange('agent')}
            >
              AUTONOMOUS DQN
            </button>
            <button
              className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
              onClick={() => onModeChange('manual')}
            >
              MANUAL (PILOT)
            </button>
          </div>
        </div>

        {/* Playback Buttons */}
        <div className="btn-row">
          <button
            className={`btn-gcs ${isRunning ? 'danger' : 'primary'}`}
            onClick={onTogglePlay}
          >
            {isRunning ? '⏸ PAUSE' : '▶ LAUNCH / RESUME'}
          </button>
          <button className="btn-gcs" onClick={onStep} disabled={isRunning}>
            ⏭ STEP (1F)
          </button>
        </div>

        <div className="btn-row">
          <button className="btn-gcs" onClick={onReset}>
            🔄 RESET EPISODE
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

        {/* Manual Keyboard Guidance */}
        {mode === 'manual' && (
          <div style={{ marginTop: '0.5rem' }}>
            <div className="cell-label">KEYBOARD OVERRIDE</div>
            <div className="key-guide">
              <div className="key-box">Q (↖)</div>
              <div className="key-box">W (↑)</div>
              <div className="key-box">E (↗)</div>
              <div className="key-box">A (←)</div>
              <div className="key-box">S (STAY)</div>
              <div className="key-box">D (→)</div>
              <div className="key-box">Z (↙)</div>
              <div className="key-box">X (↓)</div>
              <div className="key-box">C (↘)</div>
            </div>
          </div>
        )}

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
