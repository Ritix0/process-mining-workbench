// Process Mining Workbench Client Logic (Radix OKLCH + Dagre Vector Cards)

let cy = null;
let currentGraphData = null;
let currentMetricMode = 'frequency'; // 'frequency' or 'duration'
let currentPresetId = '1c_erp';
let isUpdating = false;
let isDarkTheme = true;

// Initialize on page load with persistent theme and optional ?preset= param
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('theme');
  if (saved) {
    isDarkTheme = (saved === 'dark');
  } else {
    isDarkTheme = document.documentElement.classList.contains('dark');
  }
  syncWorkbenchThemeIcons();
  initCytoscape();

  const params = new URLSearchParams(window.location.search);
  const requestedPreset = params.get('preset');
  const validPresets = ['1c_erp', 'servicedesk', 'bank_loan', 'ieee_xes'];
  const initialPreset = validPresets.includes(requestedPreset) ? requestedPreset : '1c_erp';
  loadPreset(initialPreset);
});

function syncWorkbenchThemeIcons() {
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    if (isDarkTheme) {
      sun.classList.add('hidden');
      moon.classList.remove('hidden');
    } else {
      sun.classList.remove('hidden');
      moon.classList.add('hidden');
    }
  }
}

// Escape HTML/XML entities for SVG rendering
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generate vector SVG card for nodes with Radix OKLCH theme
function generateNodeSvg(label, count, isStart, isEnd, isSelected = false) {
  const width = 230;
  const height = 76;
  
  // Theme palette using pure Radix OKLCH Colors
  const bg = isDarkTheme 
    ? (isSelected ? 'oklch(0.205 0.030 250)' : 'oklch(0.165 0.012 255)') 
    : (isSelected ? 'oklch(0.970 0.025 250)' : 'oklch(0.992 0.005 255)');
    
  const border = isSelected 
    ? (isDarkTheme ? 'oklch(0.620 0.230 250)' : 'oklch(0.530 0.230 250)') 
    : (isDarkTheme ? 'oklch(0.350 0.022 255)' : 'oklch(0.840 0.018 255)');
    
  const textTitle = isDarkTheme ? 'oklch(0.960 0.008 255)' : 'oklch(0.180 0.015 255)';
  const textSub = isDarkTheme ? 'oklch(0.760 0.018 255)' : 'oklch(0.430 0.020 255)';
  const pinFill = isSelected 
    ? (isDarkTheme ? 'oklch(0.620 0.230 250)' : 'oklch(0.530 0.230 250)') 
    : (isDarkTheme ? 'oklch(0.420 0.024 255)' : 'oklch(0.770 0.020 255)');

  // Tag type and coloring in Radix OKLCH
  let tagText = 'ЭТАП';
  let tagBg = isDarkTheme ? 'oklch(0.230 0.080 250 / 0.35)' : 'oklch(0.935 0.045 250)';
  let tagColor = isDarkTheme ? 'oklch(0.770 0.150 250)' : 'oklch(0.410 0.180 250)';

  if (isStart && isEnd) {
    tagText = 'СТАРТ / ФИНИШ';
    tagBg = isDarkTheme ? 'oklch(0.230 0.085 155 / 0.35)' : 'oklch(0.935 0.055 155)';
    tagColor = isDarkTheme ? 'oklch(0.780 0.145 155)' : 'oklch(0.400 0.160 155)';
  } else if (isStart) {
    tagText = 'СТАРТ';
    tagBg = isDarkTheme ? 'oklch(0.230 0.085 155 / 0.35)' : 'oklch(0.935 0.055 155)';
    tagColor = isDarkTheme ? 'oklch(0.780 0.145 155)' : 'oklch(0.400 0.160 155)';
  } else if (isEnd) {
    tagText = 'ФИНИШ';
    tagBg = isDarkTheme ? 'oklch(0.230 0.085 25 / 0.35)' : 'oklch(0.935 0.060 25)';
    tagColor = isDarkTheme ? 'oklch(0.780 0.145 25)' : 'oklch(0.420 0.190 25)';
  }

  // Header tag pill with dynamic adaptive width
  const tagTextWidth = Math.round(tagText.length * 7.5);
  const tagPillWidth = Math.max(54, tagTextWidth + 18);

  // Multi-line label wrapping
  let line1 = label;
  let line2 = '';
  if (label.length > 22) {
    const spaceIdx = label.lastIndexOf(' ', 22);
    if (spaceIdx > 0) {
      line1 = label.slice(0, spaceIdx);
      line2 = label.slice(spaceIdx + 1);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <!-- Card Surface -->
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="10" fill="${bg}" stroke="${border}" stroke-width="${isSelected ? 2.5 : 1.2}"/>
    
    <!-- Top & Bottom Connection Ports -->
    <circle cx="${width/2}" cy="1.5" r="3.5" fill="${pinFill}"/>
    <circle cx="${width/2}" cy="${height - 1.5}" r="3.5" fill="${pinFill}"/>
    
    <!-- Adaptive Header Tag Pill -->
    <rect x="12" y="11" width="${tagPillWidth}" height="18" rx="4" fill="${tagBg}"/>
    <text x="${12 + tagPillWidth / 2}" y="23.5" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="9" font-weight="700" fill="${tagColor}" text-anchor="middle">${tagText}</text>
    
    <!-- Execution Counter Badge -->
    <text x="${width - 12}" y="23.5" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="11" font-weight="600" fill="${textSub}" text-anchor="end">${count.toLocaleString()} раз</text>
    
    <!-- Title Text -->
    ${line2 ? `
      <text x="14" y="44" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="600" fill="${textTitle}">${escapeXml(line1)}</text>
      <text x="14" y="60" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="600" fill="${textTitle}">${escapeXml(line2)}</text>
    ` : `
      <text x="14" y="52" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="600" fill="${textTitle}">${escapeXml(line1)}</text>
    `}
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function initCytoscape() {
  if (typeof cytoscape === 'undefined') {
    console.error('Cytoscape library not found');
    return;
  }

  if (typeof cytoscapeDagre !== 'undefined') {
    cytoscape.use(cytoscapeDagre);
  }

  cy = cytoscape({
    container: document.getElementById('cy'),
    boxSelectionEnabled: false,
    autounselectify: false,
    style: [
      // Node Card Style
      {
        selector: 'node',
        style: {
          'shape': 'rectangle',
          'width': 230,
          'height': 76,
          'background-image': 'data(svg_image)',
          'background-fit': 'cover',
          'background-opacity': 0,
          'border-width': 0,
          'label': ''
        }
      },
      // Standard DFG Directed Edge (Bezier) with Radix scale
      {
        selector: 'edge',
        style: {
          'width': 'data(stroke_width)',
          'line-color': isDarkTheme ? '#3d4457' : '#c7c7d1',
          'target-arrow-color': isDarkTheme ? '#3d4457' : '#c7c7d1',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.05,
          'font-size': '10px',
          'font-family': 'sans-serif',
          'font-weight': '600',
          'color': isDarkTheme ? '#9ba1b0' : '#606470',
          'text-background-opacity': 0.95,
          'text-background-color': isDarkTheme ? '#111318' : '#ffffff',
          'text-background-padding': '3px',
          'text-background-shape': 'round-rectangle',
          'label': 'data(edge_label)'
        }
      },
      // Bottleneck Edge (Amber High Delay Warning)
      {
        selector: 'edge[?is_bottleneck]',
        style: {
          'line-color': isDarkTheme ? '#f59e0b' : '#d97706',
          'target-arrow-color': isDarkTheme ? '#f59e0b' : '#d97706',
          'color': isDarkTheme ? '#fbbf24' : '#b45309',
          'width': 3.5,
          'text-background-color': isDarkTheme ? '#241804' : '#fef3c7',
          'text-border-width': 1.2,
          'text-border-color': isDarkTheme ? '#f59e0b' : '#d97706'
        }
      },
      // Rework Loop Edge (Rose Cycle)
      {
        selector: 'edge[?is_loop]',
        style: {
          'line-color': isDarkTheme ? '#f43f5e' : '#e11d48',
          'target-arrow-color': isDarkTheme ? '#f43f5e' : '#e11d48',
          'color': isDarkTheme ? '#fda4af' : '#be123c',
          'width': 2.8,
          'control-point-step-size': 60,
          'text-background-color': isDarkTheme ? '#2a0c12' : '#ffe4e6',
          'text-border-width': 1.2,
          'text-border-color': isDarkTheme ? '#f43f5e' : '#e11d48'
        }
      },
      // Selected Edge
      {
        selector: 'edge:selected',
        style: {
          'line-color': '#0091ff',
          'target-arrow-color': '#0091ff',
          'color': isDarkTheme ? '#60a5fa' : '#2563eb',
          'width': 4.0
        }
      }
    ]
  });

  // Tap on node
  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    cy.nodes().forEach(n => {
      const d = n.data();
      n.data('svg_image', generateNodeSvg(d.label, d.count, d.is_start, d.is_end, n.id === node.id()));
    });
    showNodeInspector(node.data());
  });

  // Tap on edge
  cy.on('tap', 'edge', (evt) => {
    const edge = evt.target;
    showEdgeInspector(edge.data());
  });

  // Tap on background
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      closeInspector();
      cy.nodes().forEach(n => {
        const d = n.data();
        n.data('svg_image', generateNodeSvg(d.label, d.count, d.is_start, d.is_end, false));
      });
    }
  });
}

// ==================== PRESET DATA LOADING ====================
async function loadPreset(presetId) {
  currentPresetId = presetId;
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.className = "preset-btn px-3 h-8 rounded-lg font-medium text-[var(--slate-11)] hover:text-[var(--slate-12)]";
  });
  const activeBtn = document.getElementById(`btn-preset-${presetId}`);
  if (activeBtn) {
    activeBtn.className = "preset-btn px-3 h-8 rounded-lg font-medium bg-[var(--sapphire-9)] text-white";
  }

  document.getElementById('engine-status').innerText = 'Загрузка...';

  try {
    const resp = await fetch(`/api/v1/logs/load-preset/${presetId}`, { method: 'POST' });
    if (!resp.ok) throw new Error('Ошибка загрузки пресета');
    const data = await resp.json();

    currentGraphData = data.graph;
    updateKPIs(data.metrics, data.graph.metadata);
    renderGraph(data.graph);
    renderBottlenecks(data.graph.metadata.bottlenecks || []);

    document.getElementById('engine-status').innerText = 'Активен';
    if (typeof closeMappingModal === 'function') {
      closeMappingModal();
    } else {
      document.getElementById('mapping-panel').classList.add('hidden');
    }
  } catch (err) {
    console.error(err);
    document.getElementById('engine-status').innerText = 'Сбой сети';
  }
}

// ==================== RENDERING WORKFLOW GRAPH ====================
function renderGraph(graphData) {
  if (!cy) return;

  const nodes = graphData.nodes || [];
  const edges = graphData.edges || [];
  const bottlenecks = new Set((graphData.metadata.bottlenecks || []).map(b => `${b.source}->${b.target}`));

  const elements = [];

  // Construct nodes
  nodes.forEach(n => {
    elements.push({
      group: 'nodes',
      data: {
        id: n.id,
        label: n.label,
        count: n.count,
        relative_frequency: n.relative_frequency,
        is_start: n.is_start,
        is_end: n.is_end,
        svg_image: generateNodeSvg(n.label, n.count, n.is_start, n.is_end, false)
      }
    });
  });

  // Construct edges
  const maxWeight = edges.length > 0 ? Math.max(...edges.map(e => e.weight)) : 1;

  edges.forEach((e, idx) => {
    const isBottleneck = bottlenecks.has(`${e.source}->${e.target}`);
    const edgeLabel = currentMetricMode === 'frequency' 
      ? `${e.weight} раз`
      : `${e.avg_duration_formatted}`;

    const strokeWidth = Math.max(1.8, Math.min(5.5, 1.8 + (e.weight / maxWeight) * 3.7));

    elements.push({
      group: 'edges',
      data: {
        id: `e_${idx}_${e.source}_${e.target}`,
        source: e.source,
        target: e.target,
        weight: e.weight,
        relative_frequency: e.relative_frequency,
        dependency_score: e.dependency_score,
        avg_duration_seconds: e.avg_duration_seconds,
        avg_duration_formatted: e.avg_duration_formatted,
        median_duration_formatted: e.median_duration_formatted,
        is_loop: e.is_loop,
        is_bottleneck: isBottleneck,
        stroke_width: strokeWidth,
        edge_label: edgeLabel
      }
    });
  });

  cy.elements().remove();
  cy.add(elements);

  applyLayout();
}

function applyLayout() {
  if (!cy) return;
  const layout = cy.layout({
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 55,
    rankSep: 64,
    edgeSep: 30,
    animate: true,
    animationDuration: 260,
    animationEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fit: true,
    padding: 36
  });
  layout.run();
}

// ==================== SLIDER FILTERING ====================
let sliderDebounceTimer = null;

function updateFilterPresetButtons(nodeThreshold, edgeThreshold) {
  const btnAll = document.getElementById('filter-preset-all');
  const btnOpt = document.getElementById('filter-preset-opt');
  const btnMain = document.getElementById('filter-preset-main');
  if (!btnAll || !btnOpt || !btnMain) return;

  const inactiveClass = "filter-preset-btn px-1.5 h-8 text-[11px] font-medium whitespace-nowrap rounded-lg bg-[var(--slate-2)] hover:bg-[var(--slate-3)] text-[var(--slate-12)] text-center border border-[var(--slate-6)]";
  const activeClass = "filter-preset-btn px-1.5 h-8 text-[11px] font-medium whitespace-nowrap rounded-lg bg-[var(--sapphire-9)] text-white text-center";

  btnAll.className = inactiveClass;
  btnOpt.className = inactiveClass;
  btnMain.className = inactiveClass;

  if (nodeThreshold === 0 && edgeThreshold === 0) {
    btnAll.className = activeClass;
  } else if (nodeThreshold === 0 && edgeThreshold === 5) {
    btnOpt.className = activeClass;
  } else if (nodeThreshold === 10 && edgeThreshold === 15) {
    btnMain.className = activeClass;
  }
}

function onSliderChange() {
  const nodeThreshold = parseFloat(document.getElementById('slider-node-threshold').value);
  const edgeThreshold = parseFloat(document.getElementById('slider-edge-threshold').value);

  document.getElementById('label-node-threshold').innerText = `${nodeThreshold}%`;
  document.getElementById('label-edge-threshold').innerText = `${edgeThreshold}%`;

  updateFilterPresetButtons(nodeThreshold, edgeThreshold);

  clearTimeout(sliderDebounceTimer);
  sliderDebounceTimer = setTimeout(() => {
    rebuildGraph(nodeThreshold, edgeThreshold);
  }, 120);
}

function setFilterPreset(nodeThreshold, edgeThreshold) {
  document.getElementById('slider-node-threshold').value = nodeThreshold;
  document.getElementById('slider-edge-threshold').value = edgeThreshold;
  document.getElementById('label-node-threshold').innerText = `${nodeThreshold}%`;
  document.getElementById('label-edge-threshold').innerText = `${edgeThreshold}%`;

  updateFilterPresetButtons(nodeThreshold, edgeThreshold);

  rebuildGraph(nodeThreshold, edgeThreshold);
}

async function rebuildGraph(nodeThreshold, edgeThreshold) {
  if (isUpdating) return;
  isUpdating = true;
  document.getElementById('engine-status').innerText = 'Расчет...';

  try {
    const resp = await fetch('/api/v1/graph/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_threshold_pct: nodeThreshold,
        edge_threshold_pct: edgeThreshold
      })
    });
    if (!resp.ok) throw new Error('Ошибка расчета DFG');
    const data = await resp.json();

    currentGraphData = data.graph;
    document.getElementById('stat-nodes').innerText = data.graph.metadata.visible_nodes;
    document.getElementById('stat-edges').innerText = data.graph.metadata.visible_edges;
    
    renderGraph(data.graph);
    renderBottlenecks(data.graph.metadata.bottlenecks || []);
    document.getElementById('engine-status').innerText = 'Готов';
  } catch (err) {
    console.error(err);
  } finally {
    isUpdating = false;
  }
}

// ==================== METRIC DISPLAY MODE ====================
function setMetricMode(mode) {
  currentMetricMode = mode;
  const btnFreq = document.getElementById('btn-mode-frequency');
  const btnDur = document.getElementById('btn-mode-duration');

  if (mode === 'frequency') {
    btnFreq.className = "px-2.5 h-8 text-xs rounded-lg font-medium bg-[var(--slate-4)] text-[var(--slate-12)]";
    btnDur.className = "px-2.5 h-8 text-xs rounded-lg font-medium text-[var(--slate-11)] hover:text-[var(--slate-12)]";
  } else {
    btnDur.className = "px-2.5 h-8 text-xs rounded-lg font-medium bg-[var(--slate-4)] text-[var(--slate-12)]";
    btnFreq.className = "px-2.5 h-8 text-xs rounded-lg font-medium text-[var(--slate-11)] hover:text-[var(--slate-12)]";
  }

  if (currentGraphData) {
    renderGraph(currentGraphData);
  }
}

// ==================== BOTTLENECK LIST ====================
function renderBottlenecks(bottlenecks) {
  const container = document.getElementById('bottlenecks-list');
  container.innerHTML = '';

  if (!bottlenecks || bottlenecks.length === 0) {
    container.innerHTML = '<p class="text-[11px] text-[var(--slate-11)]">Узкие места при текущем пороге не найдены</p>';
    return;
  }

  bottlenecks.forEach((b, idx) => {
    const item = document.createElement('div');
    item.className = "p-2.5 rounded-lg bg-[var(--slate-2)] hover:bg-[var(--slate-3)] cursor-pointer transition-colors text-xs border border-[var(--slate-6)]";
    item.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="w-4 h-4 rounded flex items-center justify-center bg-[var(--slate-3)] text-[var(--slate-11)] text-[10px] font-mono tabular-nums shrink-0">${idx + 1}</span>
          <span class="font-medium text-[var(--slate-12)] truncate" title="${b.source} -> ${b.target}">${b.source} -> ${b.target}</span>
        </div>
        <span class="text-[var(--amber-11)] font-mono tabular-nums font-medium bg-[var(--amber-2)] px-1.5 py-0.5 rounded text-[11px] shrink-0">${b.avg_duration_formatted}</span>
      </div>
      <div class="flex justify-between text-[11px] text-[var(--slate-11)] font-mono tabular-nums pl-5">
        <span>Объем ${b.weight} раз</span>
        <span>Медиана ${b.median_duration_formatted}</span>
      </div>
    `;
    item.onclick = () => highlightEdge(b.source, b.target);
    container.appendChild(item);
  });
}

function highlightEdge(sourceId, targetId) {
  if (!cy) return;
  const edge = cy.edges(`[source = "${sourceId}"][target = "${targetId}"]`);
  if (edge.length > 0) {
    cy.elements().unselect();
    edge.select();
    cy.animate({
      center: { eles: edge },
      zoom: 1.25,
      duration: 240,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    });
    showEdgeInspector(edge.data());
  }
}

// ==================== INSPECTOR DRAWER ====================
function showNodeInspector(d) {
  const card = document.getElementById('inspector-card');
  document.getElementById('inspector-badge').innerText = 'Операция';
  document.getElementById('inspector-title').innerText = d.label;

  let html = `
    <div class="flex justify-between py-1.5 border-b border-[var(--slate-6)]">
      <span class="text-[var(--slate-11)]">Частота выполнения</span>
      <span class="font-mono tabular-nums font-medium text-[var(--slate-12)]">${d.count.toLocaleString()} раз</span>
    </div>
    <div class="flex justify-between py-1.5 border-b border-[var(--slate-6)]">
      <span class="text-[var(--slate-11)]">Относительный объем</span>
      <span class="font-mono tabular-nums text-[var(--sapphire-11)] font-medium">${Math.round(d.relative_frequency * 100)}% от макс.</span>
    </div>
    <div class="flex justify-between py-1.5">
      <span class="text-[var(--slate-11)]">Статус в процессе</span>
      <span class="font-mono font-medium ${d.is_start ? 'text-[var(--emerald-11)]' : (d.is_end ? 'text-[var(--ruby-11)]' : 'text-[var(--slate-12)]')}">
        ${d.is_start ? 'Стартовая операция' : (d.is_end ? 'Конечная операция' : 'Промежуточный шаг')}
      </span>
    </div>
  `;
  document.getElementById('inspector-body').innerHTML = html;
  card.classList.remove('hidden');
  requestAnimationFrame(() => card.classList.add('modal-enter-active'));
}

function showEdgeInspector(d) {
  const card = document.getElementById('inspector-card');
  document.getElementById('inspector-badge').innerText = 'Переход DFG';
  document.getElementById('inspector-title').innerText = `${d.source} -> ${d.target}`;

  let html = `
    <div class="flex justify-between py-1.5 border-b border-[var(--slate-6)]">
      <span class="text-[var(--slate-11)]">Количество переходов</span>
      <span class="font-mono tabular-nums font-medium text-[var(--slate-12)]">${d.weight.toLocaleString()} раз</span>
    </div>
    <div class="flex justify-between py-1.5 border-b border-[var(--slate-6)]">
      <span class="text-[var(--slate-11)]">Средняя задержка</span>
      <span class="font-mono tabular-nums font-medium text-[var(--amber-11)]">${d.avg_duration_formatted}</span>
    </div>
    <div class="flex justify-between py-1.5 border-b border-[var(--slate-6)]">
      <span class="text-[var(--slate-11)]">Медианное время</span>
      <span class="font-mono tabular-nums text-[var(--slate-12)]">${d.median_duration_formatted}</span>
    </div>
    <div class="flex justify-between py-1.5 border-b border-[var(--slate-6)]">
      <span class="text-[var(--slate-11)]">Heuristic Miner</span>
      <span class="font-mono tabular-nums font-medium text-[var(--sapphire-11)]">${d.dependency_score !== undefined ? d.dependency_score : 'N/A'}</span>
    </div>
    <div class="flex justify-between py-1.5">
      <span class="text-[var(--slate-11)]">Тип связки</span>
      <span class="font-mono font-medium ${d.is_loop ? 'text-[var(--ruby-11)]' : 'text-[var(--slate-12)]'}">
        ${d.is_loop ? 'Цикл возврата' : 'Прямое следование'}
      </span>
    </div>
  `;
  document.getElementById('inspector-body').innerHTML = html;
  card.classList.remove('hidden');
  requestAnimationFrame(() => card.classList.add('modal-enter-active'));
}

function closeInspector() {
  const card = document.getElementById('inspector-card');
  if (card) {
    card.classList.remove('modal-enter-active');
    setTimeout(() => {
      card.classList.add('hidden');
    }, 180);
  }
  if (cy) cy.elements().unselect();
}

// ==================== CANVAS VIEWPORT CONTROLS ====================
function cyZoomIn() {
  if (cy) cy.zoom(cy.zoom() * 1.25);
}
function cyZoomOut() {
  if (cy) cy.zoom(cy.zoom() * 0.8);
}
function cyFit() {
  if (cy) cy.fit(null, 36);
}
function cyRelayout() {
  applyLayout();
}

// ==================== THEME TOGGLER (DARK / LIGHT RADIX OKLCH) ====================
function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  const html = document.documentElement;
  localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
  syncWorkbenchThemeIcons();

  if (isDarkTheme) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  if (cy) {
    cy.style()
      .selector('edge')
      .style({
        'line-color': isDarkTheme ? '#3d4457' : '#c7c7d1',
        'target-arrow-color': isDarkTheme ? '#3d4457' : '#c7c7d1',
        'color': isDarkTheme ? '#9ba1b0' : '#606470',
        'text-background-color': isDarkTheme ? '#111318' : '#ffffff'
      })
      .selector('edge[?is_bottleneck]')
      .style({
        'line-color': isDarkTheme ? '#f59e0b' : '#d97706',
        'target-arrow-color': isDarkTheme ? '#f59e0b' : '#d97706',
        'color': isDarkTheme ? '#fbbf24' : '#b45309',
        'text-background-color': isDarkTheme ? '#241804' : '#fef3c7',
        'text-border-color': isDarkTheme ? '#f59e0b' : '#d97706'
      })
      .selector('edge[?is_loop]')
      .style({
        'line-color': isDarkTheme ? '#f43f5e' : '#e11d48',
        'target-arrow-color': isDarkTheme ? '#f43f5e' : '#e11d48',
        'color': isDarkTheme ? '#fda4af' : '#be123c',
        'text-background-color': isDarkTheme ? '#2a0c12' : '#ffe4e6',
        'text-border-color': isDarkTheme ? '#f43f5e' : '#e11d48'
      })
      .selector('edge:selected')
      .style({
        'line-color': '#0091ff',
        'target-arrow-color': '#0091ff',
        'color': isDarkTheme ? '#60a5fa' : '#2563eb'
      })
      .update();

    // Redraw all node SVGs in new palette
    cy.nodes().forEach(n => {
      const d = n.data();
      n.data('svg_image', generateNodeSvg(d.label, d.count, d.is_start, d.is_end, false));
    });
  }
}

// ==================== STATS UPDATE ====================
function updateKPIs(metrics, meta) {
  document.getElementById('stat-cases').innerText = (metrics.total_cases || meta.total_cases || 0).toLocaleString();
  document.getElementById('stat-events').innerText = (metrics.total_events || meta.total_events || 0).toLocaleString();
  document.getElementById('stat-nodes').innerText = (meta.visible_nodes || 0);
  document.getElementById('stat-edges').innerText = (meta.visible_edges || 0);
  document.getElementById('stat-lead-time').innerText = metrics.median_lead_time_formatted || '0 с';
  document.getElementById('stat-rework').innerText = `${meta.rework_loops_detected || 0} раз`;
}

// ==================== FILE UPLOADER ====================
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  document.getElementById('engine-status').innerText = 'Загрузка...';

  try {
    const resp = await fetch('/api/v1/logs/upload', {
      method: 'POST',
      body: formData
    });
    if (!resp.ok) throw new Error('Ошибка обработки файла');
    const data = await resp.json();

    if (data.type === 'xes') {
      currentGraphData = data.graph;
      updateKPIs(data.metrics, data.graph.metadata);
      renderGraph(data.graph);
      renderBottlenecks(data.graph.metadata.bottlenecks || []);
      document.getElementById('engine-status').innerText = 'Готов';
    } else {
      showMappingPanel(data.columns);
      document.getElementById('engine-status').innerText = 'Маппинг';
    }
  } catch (err) {
    console.error(err);
    alert('Не удалось прочитать файл журнала событий');
  }
}

function showMappingPanel(columns) {
  const mapPanel = document.getElementById('mapping-panel');
  const mapDialog = document.getElementById('mapping-dialog');
  mapPanel.classList.remove('hidden');
  if (mapDialog) {
    requestAnimationFrame(() => mapDialog.classList.add('modal-enter-active'));
  }
  ['map-case', 'map-act', 'map-time', 'map-res'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">-- Выберите колонку --</option>';
    columns.forEach(c => {
      sel.innerHTML += `<option value="${c}">${c}</option>`;
    });
  });

  // Heuristics for auto-selecting
  columns.forEach(c => {
    const low = c.toLowerCase();
    if (low.includes('case') || low.includes('номер') || low.includes('заказ') || low.includes('id')) {
      document.getElementById('map-case').value = c;
    }
    if (low.includes('act') || low.includes('статус') || low.includes('действие') || low.includes('этап')) {
      document.getElementById('map-act').value = c;
    }
    if (low.includes('time') || low.includes('дата') || low.includes('время')) {
      document.getElementById('map-time').value = c;
    }
    if (low.includes('res') || low.includes('ответ') || low.includes('исполн') || low.includes('сотруд')) {
      document.getElementById('map-res').value = c;
    }
  });

  mapPanel.classList.remove('hidden');
}

async function applyMapping() {
  const caseCol = document.getElementById('map-case').value;
  const actCol = document.getElementById('map-act').value;
  const timeCol = document.getElementById('map-time').value;
  const resCol = document.getElementById('map-res').value;

  if (!caseCol || !actCol || !timeCol) {
    alert('Необходимо выбрать как минимум Case ID, Activity и Timestamp');
    return;
  }

  document.getElementById('engine-status').innerText = 'Расчет DFG...';

  try {
    const resp = await fetch('/api/v1/logs/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_col: caseCol,
        act_col: actCol,
        time_col: timeCol,
        res_col: resCol || null
      })
    });
    if (!resp.ok) throw new Error('Ошибка применения маппинга');
    const data = await resp.json();

    currentGraphData = data.graph;
    updateKPIs(data.metrics, data.graph.metadata);
    renderGraph(data.graph);
    renderBottlenecks(data.graph.metadata.bottlenecks || []);
    document.getElementById('engine-status').innerText = 'Готов';
  } catch (err) {
    console.error(err);
    alert('Ошибка при маппинге данных лога');
  }
}

// ==================== EXPORT FUNCTIONS ====================
function exportBPMN() {
  const nodeThreshold = document.getElementById('slider-node-threshold').value;
  const edgeThreshold = document.getElementById('slider-edge-threshold').value;
  window.open(`/api/v1/graph/export?format=bpmn&node_threshold_pct=${nodeThreshold}&edge_threshold_pct=${edgeThreshold}`, '_blank');
}

function exportPNG() {
  if (!cy) return;
  const bgColor = isDarkTheme ? '#111318' : '#ffffff';
  const pngData = cy.png({ full: true, bg: bgColor, scale: 2 });
  const a = document.createElement('a');
  a.href = pngData;
  a.download = `process_graph_${currentPresetId}.png`;
  a.click();
}
