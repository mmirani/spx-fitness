/**
 * SPX Fitness - Real-time Speed Graph & Analytics Visualizer
 */

class SPXChartVisualizer {
  constructor(canvasOrSvgContainerId) {
    this.container = document.getElementById(canvasOrSvgContainerId);
    this.dataPoints = [];
    this.maxPoints = 120; // 2 minutes of rolling 1s telemetry
    this.CYAN = '#22e5ff';
    this.PURPLE = '#b968ff';
  }

  addPoint(speed, targetSpeed) {
    this.dataPoints.push({
      speed: speed,
      target: typeof targetSpeed === 'number' ? targetSpeed : speed,
      time: new Date()
    });

    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints.shift();
    }

    this.render();
  }

  clear() {
    this.dataPoints = [];
    this.render();
  }

  _linePoints(key, maxSpeed, width, height, padding) {
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    return this.dataPoints.map((p, idx) => {
      const x = padding + (idx / (this.maxPoints - 1)) * chartW;
      const y = height - padding - (p[key] / maxSpeed) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  render() {
    if (!this.container) return;

    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 200;

    if (this.dataPoints.length < 2) {
      this.container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#5b6272" font-size="13" font-family="Inter, sans-serif">
            Speed telemetry will chart dynamically here when workout starts...
          </text>
        </svg>`;
      return;
    }

    const maxSpeed = Math.max(6.0, ...this.dataPoints.map(p => Math.max(p.speed, p.target)));
    const padding = 18;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const speedPoints = this._linePoints('speed', maxSpeed, width, height, padding);
    const targetPoints = this._linePoints('target', maxSpeed, width, height, padding);

    const firstX = padding;
    const lastX = padding + ((this.dataPoints.length - 1) / (this.maxPoints - 1)) * chartW;
    const bottomY = height - padding;
    const lastSpeedY = height - padding - (this.dataPoints[this.dataPoints.length - 1].speed / maxSpeed) * chartH;

    const areaPath = `M ${firstX},${bottomY} L ${speedPoints} L ${lastX},${bottomY} Z`;

    this.container.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
        <defs>
          <linearGradient id="speedGlow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${this.CYAN}" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="${this.CYAN}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>

        <!-- Grid Lines -->
        <line x1="${padding}" y1="${bottomY}" x2="${width - padding}" y2="${bottomY}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

        <!-- Area Fill (actual speed) -->
        <path d="${areaPath}" fill="url(#speedGlow)" />

        <!-- Target Speed Line (reference) -->
        <polyline points="${targetPoints}" fill="none" stroke="${this.PURPLE}" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75" style="filter: drop-shadow(0 0 4px rgba(185,104,255,0.55));" />

        <!-- Actual Speed Line -->
        <polyline points="${speedPoints}" fill="none" stroke="${this.CYAN}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 5px rgba(34,229,255,0.65));" />

        <!-- Current Point Marker -->
        <circle cx="${lastX}" cy="${lastSpeedY}" r="5" fill="${this.CYAN}" stroke="#ffffff" stroke-width="2">
          <animate attributeName="r" values="5;8;5" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    `;
  }
}

window.SPXChartVisualizer = SPXChartVisualizer;
