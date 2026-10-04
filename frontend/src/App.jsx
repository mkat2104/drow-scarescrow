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
          // Wave advancement
          if (newState.wave && newState.wave > (prevStateRef.current.wave || 1)) {
            addLog(`★ THREAT WAVE ${prevStateRef.current.wave || 1} CLEARED! Advancing to Wave ${newState.wave} ★`, 'success');
          }

          // Docking status
          if (newState.drone?.is_charging && !prevStateRef.current.drone?.is_charging) {
            addLog('UAV docked on Helipad: Fast charging active.', 'success');
          }

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
            addLog(`Bird driven outside perimeter! Harvest protected.`, 'success');
          }

          if (
            newState.drone?.energy <= 22 &&
            prevStateRef.current.drone?.energy > 22
          ) {
            addLog(`Low battery alert (< 22%): RTB recommended.`, 'alert');
          }

          if (
            newState.crops?.health <= 50 &&
            (prevStateRef.current.crops?.health || 100) > 50
          ) {
            addLog(`Crop integrity below 50%! Pests are destroying harvest!`, 'alert');
          }
        }

        prevStateRef.current = newState;

        if (newState.done) {
          addLog('Mission concluded: Harvest depleted or battery exhausted. Resetting sector…', 'alert');
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

  // Acoustic Deterrent Pulse
  const handlePulse = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/pulse`, { method: 'POST' });
      if (res.ok) {
        const newState = await res.json();
        setState(newState);
        addLog('🔊 Acoustic Deterrent Pulse discharged!', 'alert');
      }
    } catch (err) {
      console.error('Pulse error:', err);
    }
  }, [addLog]);

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

    // Canvas Y-axis is inverted: Y=0 is top, increases downward.
    // Drone action 1 = +Y = moves DOWN on screen.
    // Drone action 2 = -Y = moves UP on screen.
    // So 'up' key must send action 2, 'down' key must send action 1.
    const dirToAction = {
      'up':         2,  // -Y = visually up
      'down':       1,  // +Y = visually down
      'left':       3,
      'right':      4,
      'up-left':    7,  // -Y, -X
      'up-right':   8,  // -Y, +X
      'down-left':  5,  // +Y, -X
      'down-right': 6,  // +Y, +X
    };

    const heldKeys = new Set();
    let repeatTimer = null;

    const getActionFromHeld = () => {
      const dirs = new Set([...heldKeys].map(k => singleKeyMap[k]).filter(Boolean));
      const up    = dirs.has('up');
      const down  = dirs.has('down');
      const left  = dirs.has('left');
      const right = dirs.has('right');

      if (up && left)    return dirToAction['up-left'];
      if (up && right)   return dirToAction['up-right'];
      if (down && left)  return dirToAction['down-left'];
      if (down && right) return dirToAction['down-right'];
      if (up)            return dirToAction['up'];
      if (down)          return dirToAction['down'];
      if (left)          return dirToAction['left'];
      if (right)         return dirToAction['right'];
      return 0; // stay
    };

    const fireStep = () => {
      const action = getActionFromHeld();
      if (action !== 0) executeStep(action);
    };

    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();

      // Spacebar: Sonic Deterrent Pulse
      if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handlePulse();
        return;
      }

      // H key: Return to Base / Dock toggle
      if (key === 'h') {
        e.preventDefault();
        const nextMode = modeRef.current === 'dock' ? 'agent' : 'dock';
        setMode(nextMode);
        modeRef.current = nextMode;
        addLog(nextMode === 'dock' ? 'Engaging RTB (Return to Base) auto-docking sequence.' : 'Resumed autonomous patrol.', nextMode === 'dock' ? 'alert' : 'success');
        return;
      }

      if (!singleKeyMap[key]) return;

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
            onPulse={handlePulse}
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
