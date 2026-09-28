import React, { useRef, useEffect } from 'react';

/**
 * 2D Canvas Renderer for Drone Scarecrow Field Simulator.
 * Renders the farm boundaries, obstacles, drone flight state, scare radius, and birds.
 */
export default function SimulationCanvas({ state, farmData, mode }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Simulation coordinate space is 800 x 600
    const WORLD_W = 800;
    const WORLD_H = 600;

    canvas.width = WORLD_W;
    canvas.height = WORLD_H;

    let rotorAngle = (animFrameRef.current * 0.4) % (Math.PI * 2);
    animFrameRef.current++;

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
    for (let x = 40; x < WORLD_W; x += 80) {
      ctx.beginPath();
      ctx.setLineDash([4, 12]);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Field boundary perimeter
    ctx.strokeStyle = '#233225';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);

    // 2. Draw Obstacles (Farm Layout)
    const obstacles = state?.obstacles || farmData?.obstacles || [];
    obstacles.forEach((obs) => {
      ctx.save();
      if (obs.label === 'barn') {
        // Red-brown agricultural barn
        ctx.fillStyle = '#2d1c1c';
        ctx.strokeStyle = '#5a3535';
        ctx.lineWidth = 2;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

        // Roof ridge line
        ctx.strokeStyle = '#7c4343';
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y + obs.height / 2);
        ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
        ctx.stroke();

        ctx.fillStyle = '#a87575';
        ctx.font = '10px monospace';
        ctx.fillText('BARN 01', obs.x + 6, obs.y + 16);
      } else if (obs.label === 'tree') {
        // Forest canopy circle
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
        // Perimeter fence
        ctx.fillStyle = '#262f3a';
        ctx.strokeStyle = '#3d4b5c';
        ctx.lineWidth = 1.5;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      }
      ctx.restore();
    });

    // 3. Draw Birds
    const birds = state?.birds || [];
    birds.forEach((bird, idx) => {
      ctx.save();
      ctx.translate(bird.x, bird.y);

      const isFleeing = bird.state === 'FLEEING';
      const isScaredOff = bird.state === 'SCARED_OFF';

      if (isScaredOff) {
        ctx.restore();
        return;
      }

      if (isFleeing) {
        // Panic alert indicator around fleeing bird
        ctx.strokeStyle = 'rgba(248, 81, 73, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Bird chevron body
      ctx.fillStyle = isFleeing ? '#f85149' : '#d1d5db';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(6, 4);
      ctx.lineTo(0, 2);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.fillStyle = isFleeing ? '#ffa198' : '#9ca3af';
      ctx.font = '9px monospace';
      ctx.fillText(`B${idx + 1}`, -6, -10);

      ctx.restore();
    });

    // 4. Draw Drone
    const drone = state?.drone;
    if (drone) {
      const dx = drone.x;
      const dy = drone.y;

      ctx.save();
      ctx.translate(dx, dy);

      // A. Scare Radius (80px radius standard)
      const hasFleeing = birds.some((b) => b.state === 'FLEEING');
      ctx.beginPath();
      ctx.arc(0, 0, 80, 0, Math.PI * 2);
      ctx.strokeStyle = hasFleeing
        ? 'rgba(46, 160, 67, 0.5)'
        : 'rgba(57, 197, 207, 0.2)';
      ctx.lineWidth = 1.5;
      if (hasFleeing) {
        ctx.setLineDash([6, 6]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle field wave
      ctx.fillStyle = hasFleeing
        ? 'rgba(46, 160, 67, 0.04)'
        : 'rgba(57, 197, 207, 0.02)';
      ctx.fill();

      // B. Drone Arms (X configuration)
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 12);
      ctx.moveTo(12, -12);
      ctx.lineTo(-12, 12);
      ctx.stroke();

      // C. Rotors with spinning animation
      const rotorPositions = [
        [-12, -12],
        [12, -12],
        [-12, 12],
        [12, 12],
      ];
      rotorPositions.forEach(([rx, ry], rIdx) => {
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(rotorAngle * (rIdx % 2 === 0 ? 1 : -1));

        // Rotor guard
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();

        // Rotor blades
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();
        ctx.restore();
      });

      // D. Drone Central Avionics Pod
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = drone.energy > 20 ? '#2ea043' : '#f85149';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Status indicator LED
      ctx.fillStyle = drone.active ? '#39c5cf' : '#6b7280';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Heading vector
      ctx.strokeStyle = '#39c5cf';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(0, -16);
      ctx.stroke();

      ctx.restore();
    }

    // 5. Telemetry Watermark & Status Banner
    ctx.fillStyle = 'rgba(230, 237, 243, 0.6)';
    ctx.font = '10px monospace';
    ctx.fillText(`SYS: ${mode.toUpperCase()} · SCALE: 1px=1m`, 14, 24);

    if (state?.drone) {
      ctx.fillText(
        `DRONE POS: [${state.drone.x.toFixed(1)}, ${state.drone.y.toFixed(1)}]`,
        14,
        40
      );
    }

    if (state?.done) {
      const allCleared = state?.info?.birds_remaining === 0;
      ctx.fillStyle = allCleared ? 'rgba(46, 160, 67, 0.85)' : 'rgba(248, 81, 73, 0.85)';
      ctx.fillRect(WORLD_W / 2 - 160, WORLD_H / 2 - 25, 320, 50);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        allCleared ? 'MISSION COMPLETE: CROPS SECURED' : 'MISSION TERMINATED: LOW ENERGY',
        WORLD_W / 2,
        WORLD_H / 2 + 5
      );
      ctx.textAlign = 'start';
    }
  }, [state, farmData, mode]);

  return (
    <div className="viewport-frame">
      <div className="viewport-header">
        <span>TOP-DOWN FIELD RADAR (SECTOR 04)</span>
        <span>STATUS: {state?.drone?.active ? 'ACTIVE PATROL' : 'STANDBY'}</span>
      </div>
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
