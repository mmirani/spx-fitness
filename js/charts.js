/**
 * SPX Fitness - Real-time Speed Graph & Analytics Visualizer
 */

class SPXChartVisualizer {
  constructor(canvasOrSvgContainerId) {
    this.container = document.getElementById(canvasOrSvgContainerId);
    this.dataPoints = [];
    this.maxPoints = 120; // 2 minutes of rolling 1s telemetry
  }

  addPoint(speed) {
    this.dataPoints.push({
      speed: speed,
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

  render() {
    if (!this.container) return;

    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 200;

    if (this.dataPoints.length < 2) {
      this.container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#505c6e" font-size="14" font-family="sans-serif">
            Speed telemetry will chart dynamically here when workout starts...
          </text>
        </svg>`;
      return;
    }

    const maxSpeed = Math.max(6.0, ...this.dataPoints.map(p => p.speed));
    const padding = 20;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const pointsStr = this.dataPoints.map((p, idx) => {
      const x = padding + (idx / (this.maxPoints - 1)) * chartW;
      const y = height - padding - (p.speed / maxSpeed) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const firstX = padding;
    const lastX = padding + ((this.dataPoints.length - 1) / (this.maxPoints - 1)) * chartW;
    const bottomY = height - padding;

    const areaPath = `M ${firstX},${bottomY} L ${pointsStr} L ${lastX},${bottomY} Z`;

    this.container.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
        <defs>
          <linearGradient id="speedGlow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#4f8dfd" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#4f8dfd" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        
        <!-- Grid Lines -->
        <line x1="${padding}" y1="${bottomY}" x2="${width - padding}" y2="${bottomY}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        
        <!-- Area Fill -->
        <path d="${areaPath}" fill="url(#speedGlow)" />
        
        <!-- Speed Line -->
        <polyline points="${pointsStr}" fill="none" stroke="#4f8dfd" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Current Point Marker -->
        <circle cx="${lastX}" cy="${height - padding - (this.dataPoints[this.dataPoints.length - 1].speed / maxSpeed) * chartH}" r="5" fill="#4f8dfd" stroke="#ffffff" stroke-width="2">
          <animate attributeName="r" values="5;8;5" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    `;
  }
}

window.SPXChartVisualizer = SPXChartVisualizer;
