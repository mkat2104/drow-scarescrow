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

        {/* Manual Keyboard Guide — shown always, activates on first keypress */}
        <div style={{ marginTop: '0.5rem' }}>
          <div className="cell-label" style={{ marginBottom: '0.4rem' }}>
            KEYBOARD OVERRIDE{mode !== 'manual' && <span style={{ color: 'var(--flight-amber)', marginLeft: '0.5rem' }}>press a key to activate</span>}
          </div>

          {/* WASD layout */}
          <div style={{ marginBottom: '0.3rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>WASD</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gap: '3px', marginBottom: '0.6rem' }}>
            {[
              { key: null,  label: '' },
              { key: 'w',   label: '↑ W' },
              { key: null,  label: '' },
              { key: 'a',   label: '← A' },
              { key: 's',   label: '↓ S' },
              { key: 'd',   label: '→ D' },
            ].map((k, i) => (
              <div
                key={i}
                className={`key-box${k.key && activeKeys.has(k.key) ? ' active' : ''}`}
                style={{ height: '28px', lineHeight: '28px', visibility: k.label ? 'visible' : 'hidden' }}
              >
                {k.label}
              </div>
            ))}
          </div>

          {/* Arrow key layout */}
          <div style={{ marginBottom: '0.3rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>ARROW KEYS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gap: '3px' }}>
            {[
              { key: null,         label: '' },
              { key: 'arrowup',    label: '↑' },
              { key: null,         label: '' },
              { key: 'arrowleft',  label: '←' },
              { key: 'arrowdown',  label: '↓' },
              { key: 'arrowright', label: '→' },
            ].map((k, i) => (
              <div
                key={i}
                className={`key-box${k.key && activeKeys.has(k.key) ? ' active' : ''}`}
                style={{ height: '28px', lineHeight: '28px', visibility: k.label ? 'visible' : 'hidden' }}
              >
                {k.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
            Hold key to move · Diagonals: W+A, W+D, S+A, S+D
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
