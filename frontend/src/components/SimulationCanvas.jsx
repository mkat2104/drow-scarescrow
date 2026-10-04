import React, { useRef, useEffect, useCallback } from 'react';

/**
 * 2D Canvas Renderer for Drone Scarecrow Field Simulator.
 * Industrial Ground Control Station (GCS) tactical radar interface.
 * Features:
 * - Animated UAV rotors & heading vector
 * - Phosphor flight path trail
 * - Base Charging Station / Helipad with active docking aura
 * - Crop Health overlay & damage indicators
 * - Acoustic Deterrent Shockwave pulse
 * - Bird species taxonomy & panic radius
 * - Mission Wave telemetry banner
 */
export default function SimulationCanvas({ state, farmData, mode }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const farmRef = useRef(farmData);
  const modeRef = useRef(mode);
  const rotorAngleRef = useRef(0);
  const trailRef = useRef([]);
  const pulseRadiusRef = useRef(0);
  const rafIdRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
    // Add position to flight path trail
    if (state?.drone?.x !== undefined) {
      trailRef.current.push({ x: state.drone.x, y: state.drone.y });
      if (trailRef.current.length > 50) {
        trailRef.current.shift();
      }
    }
  }, [state]);

  useEffect(() => { farmRef.current = farmData; }, [farmData]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const WORLD_W = 800;
    const WORLD_H = 600;

    rotorAngleRef.current = (rotorAngleRef.current + 0.14) % (Math.PI * 2);
    const rotorAngle = rotorAngleRef.current;

    const currentState = stateRef.current;
    const currentFarm = farmRef.current;
    const currentMode = modeRef.current;

    const cropHealth = currentState?.crops?.health ?? 100.0;
    const isDocked = currentState?.drone?.is_charging ?? false;
    const wave = currentState?.wave ?? 1;

    // 1. Tactical Field Grid Background
    ctx.fillStyle = '#0d130e';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Dynamic Crop Furrows (color shifts if crops are under stress)
    const furrowColor = cropHealth > 75 
      ? 'rgba(46, 160, 67, 0.06)' 
      : cropHealth > 40 
      ? 'rgba(210, 153, 34, 0.07)' 
      : 'rgba(248, 81, 73, 0.08)';

    ctx.strokeStyle = furrowColor;
    ctx.lineWidth = 1;
    for (let y = 20; y < WORLD_H; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }

    ctx.setLineDash([3, 15]);
    ctx.strokeStyle = 'rgba(57, 197, 207, 0.04)';
    for (let x = 40; x < WORLD_W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 2. Base Helipad & Charging Station (Center [400, 300])
    const padX = currentState?.charging_station?.x ?? 400;
    const padY = currentState?.charging_station?.y ?? 300;
    const padRadius = currentState?.charging_station?.radius ?? 45;

    ctx.save();
    ctx.translate(padX, padY);

    // Docking pad outer ring
    ctx.strokeStyle = isDocked ? '#39c5cf' : '#274b2f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, padRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Docking pad fill
    ctx.fillStyle = isDocked ? 'rgba(57, 197, 207, 0.08)' : 'rgba(23, 43, 27, 0.35)';
    ctx.fill();

    // H mark
    ctx.strokeStyle = isDocked ? '#7ee787' : 'rgba(139, 148, 158, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.lineTo(-10, 12);
    ctx.moveTo(10, -12);  ctx.lineTo(10, 12);
    ctx.moveTo(-10, 0);   ctx.lineTo(10, 0);
    ctx.stroke();

    // Pad label
    ctx.fillStyle = isDocked ? '#7ee787' : 'rgba(139, 148, 158, 0.6)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isDocked ? '⚡ CHARGING' : 'BASE DOCK', 0, padRadius + 12);
    ctx.textAlign = 'left';

    // Charging pulse animation
    if (isDocked) {
      const chargeWave = (Date.now() / 250) % 20;
      ctx.strokeStyle = 'rgba(57, 197, 207, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, padRadius + chargeWave, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Draw Obstacles (Barns, Trees, Fences)
    const obstacles = currentState?.obstacles || currentFarm?.obstacles || [];
    obstacles.forEach((obs) => {
      ctx.save();
      if (obs.label === 'barn') {
        ctx.fillStyle = '#261717';
        ctx.strokeStyle = '#5a3030';
        ctx.lineWidth = 2;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        ctx.fillStyle = '#b36b6b';
        ctx.font = '9px monospace';
        ctx.fillText('BARN 01', obs.x + 8, obs.y + 16);
      } else if (obs.label === 'tree') {
        const cx = obs.x + obs.width / 2;
        const cy = obs.y + obs.height / 2;
        const r = obs.width / 2;
        ctx.fillStyle = '#112415';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e4024';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (obs.label === 'fence') {
        ctx.fillStyle = '#1c242d';
        ctx.strokeStyle = '#324050';
        ctx.lineWidth = 1.5;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      }
      ctx.restore();
    });

    // 4. Drone Flight Path Phosphor Trail
    const trail = trailRef.current;
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.3;
        ctx.strokeStyle = isDocked ? `rgba(126, 231, 135, ${alpha})` : `rgba(57, 197, 207, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }

    // 5. Draw Birds
    const birds = currentState?.birds || [];
    birds.forEach((bird, idx) => {
      const isFleeing = bird.state === 'FLEEING';
      const isScaredOff = bird.state === 'SCARED_OFF';
      if (isScaredOff) return;

      ctx.save();
      ctx.translate(bird.x, bird.y);

      if (isFleeing) {
        ctx.strokeStyle = 'rgba(248, 81, 73, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Bird chevron symbol
      ctx.fillStyle = isFleeing ? '#f85149' : '#e6edf3';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(6, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();

      // Threat species tag based on wave
      const tag = wave === 1 ? `CROW-${idx + 1}` : wave === 2 ? `PGN-${idx + 1}` : `STRL-${idx + 1}`;
      ctx.fillStyle = isFleeing ? '#ffa198' : '#8b949e';
      ctx.font = '8px monospace';
      ctx.fillText(tag, -8, -9);
      ctx.restore();
    });

    // 6. Draw Drone
    const drone = currentState?.drone;
    if (drone) {
      const dx = drone.x;
      const dy = drone.y;

      ctx.save();
      ctx.translate(dx, dy);

      const hasFleeing = birds.some((b) => b.state === 'FLEEING');

      // Acoustic Deterrent Pulse Shockwave Animation
      if (currentState?.pulse_active) {
        pulseRadiusRef.current = (pulseRadiusRef.current + 6) % 160;
        ctx.strokeStyle = 'rgba(57, 197, 207, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, pulseRadiusRef.current, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        pulseRadiusRef.current = 0;
      }

      // Scare radius circle
      ctx.beginPath();
      ctx.arc(0, 0, 85, 0, Math.PI * 2);
      ctx.strokeStyle = hasFleeing
        ? 'rgba(46, 160, 67, 0.6)'
        : isDocked
        ? 'rgba(126, 231, 135, 0.3)'
        : 'rgba(57, 197, 207, 0.22)';
      ctx.lineWidth = 1.5;
      if (hasFleeing) ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = hasFleeing
        ? 'rgba(46, 160, 67, 0.05)'
        : 'rgba(57, 197, 207, 0.02)';
      ctx.fill();

      // Cross arms
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-13, -13); ctx.lineTo(13, 13);
      ctx.moveTo(13, -13); ctx.lineTo(-13, 13);
      ctx.stroke();

      // Rotors
      [[-13, -13], [13, -13], [-13, 13], [13, 13]].forEach(([rx, ry], rIdx) => {
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(rotorAngle * (rIdx % 2 === 0 ? 1 : -1));
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = isDocked ? '#7ee787' : '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
        ctx.stroke();
        ctx.restore();
      });

      // Body pod
      ctx.fillStyle = '#0b1118';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = drone.energy > 25 ? '#2ea043' : '#f85149';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Status LED
      ctx.fillStyle = isDocked ? '#7ee787' : drone.active ? '#39c5cf' : '#6b7280';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Heading vector
      ctx.strokeStyle = '#39c5cf';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(0, -20);
      ctx.stroke();

      ctx.restore();
    }

    // 7. Tactical HUD Overlay Watermark
    ctx.fillStyle = 'rgba(139, 148, 158, 0.7)';
    ctx.font = '10px monospace';
    ctx.fillText(`PATROL SECTOR-04 · WAVE ${String(wave).padStart(2, '0')}`, 14, 22);

    if (drone) {
      const chargeText = isDocked ? ' [DOCK CHARGING]' : '';
      ctx.fillText(`UAV-01 · BATTERY: ${drone.energy.toFixed(1)}%${chargeText}`, 14, 38);
    }

    // Crop Health Indicator on top-right
    const harvestSaved = currentState?.crops?.harvest_saved ?? 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = cropHealth > 70 ? '#7ee787' : cropHealth > 35 ? '#d29922' : '#f85149';
    ctx.fillText(`CROP INTEGRITY: ${cropHealth.toFixed(1)}%`, WORLD_W - 14, 22);
    ctx.fillStyle = '#8b949e';
    ctx.fillText(`HARVEST PROTECTED: $${harvestSaved.toFixed(0)}`, WORLD_W - 14, 38);
    ctx.textAlign = 'left';

    // Field perimeter boundary
    ctx.strokeStyle = '#1e3222';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);

    // Episode End / Game Over banner
    if (currentState?.done) {
      const failed = cropHealth <= 0 || (drone && drone.energy <= 0);
      ctx.fillStyle = failed ? 'rgba(248, 81, 73, 0.92)' : 'rgba(46, 160, 67, 0.92)';
      ctx.fillRect(WORLD_W / 2 - 200, WORLD_H / 2 - 32, 400, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        failed ? '✕ PATROL COMPROMISED — HARVEST DAMAGE / POWER LOSS' : '✓ SECTOR SECURED — ALL WAVES REPELLED',
        WORLD_W / 2,
        WORLD_H / 2 + 4
      );
      ctx.textAlign = 'left';
    }

    rafIdRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 800;
      canvas.height = 600;
    }
  }, []);

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
        <span>
          {stateRef.current?.drone?.is_charging
            ? '⚡ BASE DOCKING ACTIVE'
            : stateRef.current?.drone?.active
            ? '● ACTIVE PATROL'
            : '○ STANDBY'}
        </span>
      </div>
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
