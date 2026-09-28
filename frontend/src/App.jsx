import React, { useState, useEffect, useRef, useCallback } from 'react';
import SimulationCanvas from './components/SimulationCanvas.jsx';
import Stats from './components/Stats.jsx';
import Controls from './components/Controls.jsx';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [state, setState] = useState(null);
  const [farmData, setFarmData] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('agent'); // 'agent' or 'manual'
  const [speed, setSpeed] = useState(1);
  const [isConnected, setIsConnected] = useState(false);
  const [eventLogs, setEventLogs] = useState([]);

  const isRunningRef = useRef(isRunning);
  const modeRef = useRef(mode);
  const speedRef = useRef(speed);
  isRunningRef.current = isRunning;
  modeRef.current = mode;
  speedRef.current = speed;

  const prevStateRef = useRef(null);

  // Helper to add timestamped telemetry event
  const addLog = useCallback((text, type = '') => {
    const now = new Date();
    const timeStr = `${String(now.getMinutes()).padStart(2, '0')}:${String(
      now.getSeconds()
    ).padStart(2, '0')}`;
    setEventLogs((prev) => [{ time: timeStr, text, type }, ...prev.slice(0, 19)]);
  }, []);

  // Fetch initial farm geometry and simulation state
  useEffect(() => {
    async function init() {
      try {
        const [farmRes, stateRes] = await Promise.all([
          fetch(`${API_BASE_URL}/farm`),
          fetch(`${API_BASE_URL}/state`),
        ]);

        if (farmRes.ok && stateRes.ok) {
          const farm = await farmRes.json();
          const simState = await stateRes.json();
          setFarmData(farm);
          setState(simState);
          setIsConnected(true);
          addLog('Ground telemetry downlink established.', 'success');
        } else {
          setIsConnected(false);
        }
      } catch (err) {
        console.warn('Initial connection attempt failed:', err);
        setIsConnected(false);
      }
    }
    init();
  }, [addLog]);

  // Advance simulation one step
  const executeStep = useCallback(
    async (manualAction = null) => {
      try {
        const payload = {
          mode: modeRef.current,
          action: manualAction,
        };

        const res = await fetch(`${API_BASE_URL}/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}`);

        const newState = await res.json();
        setState(newState);
        setIsConnected(true);

        // Detect and log tactical events
        if (prevStateRef.current) {
          const prevBirds = prevStateRef.current.birds || [];
          const currBirds = newState.birds || [];

          currBirds.forEach((b, idx) => {
            const prev = prevBirds[idx];
            if (prev && prev.state === 'WANDERING' && b.state === 'FLEEING') {
              addLog(`Bird #${idx + 1} intercepted → fleeing`, 'alert');
            }
          });

          if (
            newState.info?.birds_remaining <
            prevStateRef.current.info?.birds_remaining
          ) {
            addLog(`Bird successfully driven out of sector!`, 'success');
          }

          if (
            newState.drone?.energy <= 20 &&
            prevStateRef.current.drone?.energy > 20
          ) {
            addLog(`Low battery alert: < 20% remaining`, 'alert');
          }
        }

        prevStateRef.current = newState;

        if (newState.done) {
          setIsRunning(false);
          if (newState.info?.birds_remaining === 0) {
            addLog('Mission Success: Sector cleared of pests.', 'success');
          } else {
            addLog('Mission Ended: Battery depleted.', 'alert');
          }
        }
      } catch (err) {
        console.error('Step execution error:', err);
        setIsConnected(false);
      }
    },
    [addLog]
  );

  // Simulation execution loop
  useEffect(() => {
    if (!isRunning) return;

    const intervalMs = Math.max(10, Math.floor(33 / speed));
    const timer = setInterval(() => {
      executeStep();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isRunning, speed, executeStep]);

  // Reset simulation
  const handleReset = async () => {
    try {
      setIsRunning(false);
      const res = await fetch(`${API_BASE_URL}/reset`, { method: 'POST' });
      if (res.ok) {
        const resetState = await res.json();
        setState(resetState);
        prevStateRef.current = resetState;
        setIsConnected(true);
        addLog('Environment reset. Episode initialized.');
      }
    } catch (err) {
      console.error('Reset error:', err);
      setIsConnected(false);
    }
  };

  // Keyboard controls for manual pilot mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (modeRef.current !== 'manual') return;

      const keyActionMap = {
        w: 1, // Up
        x: 2, // Down
        s: 0, // Stay
        a: 3, // Left
        d: 4, // Right
        q: 5, // Up-Left
        e: 6, // Up-Right
        z: 7, // Down-Left
        c: 8, // Down-Right
        ArrowUp: 1,
        ArrowDown: 2,
        ArrowLeft: 3,
        ArrowRight: 4,
        ' ': 0,
      };

      const action = keyActionMap[e.key.toLowerCase()] ?? keyActionMap[e.key];
      if (action !== undefined) {
        e.preventDefault();
        executeStep(action);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeStep]);

  return (
    <>
      {/* Top Header */}
      <header className="gcs-topbar">
        <div className="gcs-brand">
          <div className="gcs-logo-badge">UAV-01</div>
          <div>
            <span className="gcs-title">DRONE SCARECROW OPERATIONS</span>
            <span className="gcs-subtitle">SECTOR PATROL STATION</span>
          </div>
        </div>

        <div className="gcs-telemetry-pill">
          <div className="pill-item">
            <span
              className={`pill-indicator ${
                isConnected ? 'active' : 'warning'
              }`}
            />
            <span>{isConnected ? 'TELEMETRY 30Hz' : 'OFFLINE'}</span>
          </div>
          <div className="pill-item">
            <span>MODEL: {state?.model_loaded ? 'DQN-BEST' : 'BASELINE'}</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="gcs-workspace">
        <section className="tactical-display">
          <SimulationCanvas
            state={state}
            farmData={farmData}
            mode={mode}
          />
        </section>

        <aside className="gcs-deck">
          <Stats state={state} isConnected={isConnected} />
          <Controls
            isRunning={isRunning}
            onTogglePlay={() => setIsRunning(!isRunning)}
            onStep={() => executeStep()}
            onReset={handleReset}
            mode={mode}
            onModeChange={(newMode) => {
              setMode(newMode);
              addLog(`Flight mode switched to: ${newMode.toUpperCase()}`);
            }}
            speed={speed}
            onSpeedChange={(newSpeed) => {
              setSpeed(newSpeed);
              addLog(`Sim playback speed set to: ${newSpeed}x`);
            }}
            eventLogs={eventLogs}
          />
        </aside>
      </main>
    </>
  );
}
