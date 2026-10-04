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

  const isFetchingRef = useRef(false); // guard: prevents concurrent step calls
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
      // Prevent overlapping requests
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
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
          if (newState.info?.birds_remaining === 0) {
            addLog('Mission Success: Sector cleared. Starting new episode…', 'success');
          } else {
            addLog('Episode ended: Energy depleted. Resetting…', 'alert');
          }
          // Auto-reset: POST /reset and continue running
          try {
            const resetRes = await fetch(`${API_BASE_URL}/reset`, { method: 'POST' });
            if (resetRes.ok) {
              const resetState = await resetRes.json();
              setState(resetState);
              prevStateRef.current = resetState;
            }
          } catch (_) { /* ignore reset errors */ }
        }
      } catch (err) {
        console.error('Step execution error:', err);
        setIsConnected(false);
        setIsRunning(false);
      } finally {
        isFetchingRef.current = false;
      }
    },
    [addLog]
  );

  // Simulation execution loop — uses recursive setTimeout so the next step
  // only fires after the previous API response has been received.
  useEffect(() => {
    if (!isRunning) return;

    const delayMs = Math.max(50, Math.floor(250 / speed)); // 4fps at 1x, up to ~20fps at 4x
    let timerId = null;

    const scheduleNext = () => {
      if (!isRunningRef.current) return;
      timerId = setTimeout(async () => {
        await executeStep();
        scheduleNext();
      }, delayMs);
    };

    scheduleNext();
    return () => { if (timerId) clearTimeout(timerId); };
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

  // Track which keys are held for UI display
  const [activeKeys, setActiveKeys] = useState(new Set());

  // Keyboard controls — works in manual mode, also auto-switches mode on arrow/WASD
  useEffect(() => {
    // Map single keys to drone actions
    // Action indices: 0=stay, 1=up, 2=down, 3=left, 4=right, 5=up-left, 6=up-right, 7=down-left, 8=down-right
    const singleKeyMap = {
      arrowup:    'up',
      arrowdown:  'down',
      arrowleft:  'left',
      arrowright: 'right',
      w:          'up',
      s:          'down',
      a:          'left',
      d:          'right',
    };

    const dirToAction = {
      'up':         1,
      'down':       2,
      'left':       3,
      'right':      4,
      'up-left':    5,
      'up-right':   6,
      'down-left':  7,
      'down-right': 8,
    };

    const heldKeys = new Set();
    let repeatTimer = null;

    const getActionFromHeld = () => {
      const dirs = new Set([...heldKeys].map(k => singleKeyMap[k]).filter(Boolean));
      const up    = dirs.has('up');
      const down  = dirs.has('down');
      const left  = dirs.has('left');
      const right = dirs.has('right');

      if (up && left)    return 5;
      if (up && right)   return 6;
      if (down && left)  return 7;
      if (down && right) return 8;
      if (up)            return 1;
      if (down)          return 2;
      if (left)          return 3;
      if (right)         return 4;
      return 0; // stay
    };

    const fireStep = () => {
      const action = getActionFromHeld();
      if (action !== 0) executeStep(action);
    };

    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (!singleKeyMap[key] && key !== ' ') return;

      e.preventDefault();

      // Auto-switch to manual mode when a movement key is pressed
      if (modeRef.current !== 'manual') {
        setMode('manual');
        modeRef.current = 'manual';
        addLog('Switched to MANUAL control via keyboard.', '');
      }

      if (!heldKeys.has(key)) {
        heldKeys.add(key);
        setActiveKeys(new Set(heldKeys));
        fireStep(); // immediate step on first press

        // Repeat every 150ms while held
        repeatTimer = setInterval(fireStep, 150);
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      heldKeys.delete(key);
      setActiveKeys(new Set(heldKeys));

      if (heldKeys.size === 0) {
        clearInterval(repeatTimer);
        repeatTimer = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(repeatTimer);
    };
  }, [executeStep, addLog]);

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
            activeKeys={activeKeys}
          />
        </aside>
      </main>
    </>
  );
}
