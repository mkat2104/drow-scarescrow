import React, { useRef, useEffect, useCallback } from 'react';

/**
 * 2D Canvas Renderer for Drone Scarecrow Field Simulator.
 * Uses requestAnimationFrame for smooth rotor animation, 
 * and draws the latest simulation state each frame.
 */
export default function SimulationCanvas({ state, farmData, mode }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const farmRef = useRef(farmData);
  const modeRef = useRef(mode);
  const rotorAngleRef = useRef(0);
  const rafIdRef = useRef(null);

  // Keep refs in sync with latest props
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { farmRef.current = farmData; }, [farmData]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const WORLD_W = 800;
    const WORLD_H = 600;

    // Do NOT reset canvas.width/height here — it clears the buffer every frame.
    // Size is set once in the setup effect below.

    rotorAngleRef.current = (rotorAngleRef.current + 0.12) % (Math.PI * 2);
    const rotorAngle = rotorAngleRef.current;

    const currentState = stateRef.current;
    const currentFarm = farmRef.current;
    const currentMode = modeRef.current;

    // 1. Draw Field Background & Crop Rows
    ctx.fillStyle = '#121812';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Subtle crop furrows
    ctx.strokeStyle = 'rgba(46, 160, 67, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 20; y < WORLD_H; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }
    ctx.setLineDash([4, 12]);
    ctx.strokeStyle = 'rgba(46, 160, 67, 0.04)';
    for (let x = 40; x < WORLD_W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Field boundary
    ctx.strokeStyle = '#233225';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);

    // 2. Draw Obstacles
    const obstacles = currentState?.obstacles || currentFarm?.obstacles || [];
    obstacles.forEach((obs) => {
      ctx.save();
      if (obs.label === 'barn') {
        ctx.fillStyle = '#2d1c1c';
        ctx.strokeStyle = '#5a3535';
        ctx.lineWidth = 2;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeStyle = '#7c4343';
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y + obs.height / 2);
        ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
        ctx.stroke();
        ctx.fillStyle = '#a87575';
        ctx.font = '9px monospace';
        ctx.fillText('BARN', obs.x + 6, obs.y + 14);
      } else if (obs.label === 'tree') {
        const cx = obs.x + obs.width / 2;
        const cy = obs.y + obs.height / 2;
        const r = obs.width / 2;
        ctx.fillStyle = '#172b1b';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#274b2f';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#1f3824';
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 3, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.label === 'fence') {
        ctx.fillStyle = '#262f3a';
        ctx.strokeStyle = '#3d4b5c';
        ctx.lineWidth = 1.5;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      }
      ctx.restore();
    });

    // 3. Draw Birds
    const birds = currentState?.birds || [];
    birds.forEach((bird, idx) => {
      const isFleeing = bird.state === 'FLEEING';
      const isScaredOff = bird.state === 'SCARED_OFF';
      if (isScaredOff) return;

      ctx.save();
      ctx.translate(bird.x, bird.y);

      if (isFleeing) {
        ctx.strokeStyle = 'rgba(248, 81, 73, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Bird chevron
      ctx.fillStyle = isFleeing ? '#f85149' : '#c9d1d9';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(5, 4);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isFleeing ? '#ffa198' : '#8b949e';
      ctx.font = '8px monospace';
      ctx.fillText(`B${idx + 1}`, -5, -8);
      ctx.restore();
    });

    // 4. Draw Drone
    const drone = currentState?.drone;
    if (drone) {
      const dx = drone.x;
      const dy = drone.y;

      ctx.save();
      ctx.translate(dx, dy);

      const hasFleeing = birds.some((b) => b.state === 'FLEEING');

      // Scare radius
      ctx.beginPath();
      ctx.arc(0, 0, 80, 0, Math.PI * 2);
      ctx.strokeStyle = hasFleeing
        ? 'rgba(46, 160, 67, 0.55)'
        : 'rgba(57, 197, 207, 0.18)';
      ctx.lineWidth = 1.5;
      if (hasFleeing) ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = hasFleeing
        ? 'rgba(46, 160, 67, 0.04)'
        : 'rgba(57, 197, 207, 0.02)';
      ctx.fill();

      // Arms
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, -12); ctx.lineTo(12, 12);
      ctx.moveTo(12, -12); ctx.lineTo(-12, 12);
      ctx.stroke();

      // Rotors with animation
      [[-12, -12], [12, -12], [-12, 12], [12, 12]].forEach(([rx, ry], rIdx) => {
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(rotorAngle * (rIdx % 2 === 0 ? 1 : -1));
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.stroke();
        ctx.restore();
      });

      // Body pod
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = drone.energy > 20 ? '#2ea043' : '#f85149';
      ctx.lineWidth = 2;
      ctx.stroke();

      // LED
      ctx.fillStyle = drone.active ? '#39c5cf' : '#6b7280';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Heading vector
      ctx.strokeStyle = '#39c5cf';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(0, -18);
      ctx.stroke();

      ctx.restore();
    }

    // 5. Telemetry watermark
    ctx.fillStyle = 'rgba(139, 148, 158, 0.5)';
    ctx.font = '9px monospace';
    ctx.fillText(`MODE: ${(currentMode || 'agent').toUpperCase()} · 800m × 600m SECTOR`, 12, 20);
    if (drone) {
      ctx.fillText(`UAV-01  [${drone.x.toFixed(0)}, ${drone.y.toFixed(0)}]  E:${drone.energy.toFixed(1)}%`, 12, 34);
    }

    // Episode end banner
    if (currentState?.done) {
      const allCleared = currentState?.info?.birds_remaining === 0;
      ctx.fillStyle = allCleared ? 'rgba(46,160,67,0.88)' : 'rgba(248,81,73,0.88)';
      ctx.fillRect(WORLD_W / 2 - 175, WORLD_H / 2 - 28, 350, 56);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        allCleared ? '✓ MISSION COMPLETE — SECTOR SECURED' : '✕ MISSION TERMINATED — LOW BATTERY',
        WORLD_W / 2,
        WORLD_H / 2 + 6
      );
      ctx.textAlign = 'left';
    }

    // Schedule next frame
    rafIdRef.current = requestAnimationFrame(draw);
  }, []);

  // Set canvas size once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 800;
      canvas.height = 600;
    }
  }, []);

  // Start animation loop on mount, stop on unmount
  useEffect(() => {
    rafIdRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [draw]);

  return (
    <div className="viewport-frame">
      <div className="viewport-header">
        <span>TOP-DOWN FIELD RADAR · SECTOR-04</span>
        <span>{stateRef.current?.drone?.active ? '● ACTIVE PATROL' : '○ STANDBY'}</span>
      </div>
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
