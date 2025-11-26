import { computeTotalTime, getDonenessPresets, computeTemperatureCurve, VEGETABLE_DATA } from './calculations.js?v=4';
import en from './i18n/en.js?v=4';
import it from './i18n/it.js?v=4';

const translations = { en, it };
let currentLang = 'en';

// DOM Elements
const els = {
    categoryToggle: document.getElementById('category-toggle'),
    foodType: document.getElementById('food-type'),
    doneness: document.getElementById('doneness'),
    shape: document.getElementById('shape'),
    thickness: document.getElementById('thickness'),
    thicknessRange: document.getElementById('thickness-range'),
    tempBath: document.getElementById('temp-bath'),
    tempBathRange: document.getElementById('temp-bath-range'),
    tempCore: document.getElementById('temp-core'),
    tempCoreRange: document.getElementById('temp-core-range'),
    resHeat: document.getElementById('res-heat'),
    resPast: document.getElementById('res-past'),
    resTotal: document.getElementById('res-total'),
    resTemp: document.getElementById('res-temp'),
    warnings: document.getElementById('warnings'),
    langSelector: document.getElementById('language-selector'),
    detailsToggle: document.getElementById('details-toggle'),
    detailsContent: document.getElementById('details-content'),
    debugInfo: document.getElementById('debug-info'),
    chartCanvas: document.getElementById('temp-chart')
};

// State
let state = {
    category: 'meat', // 'meat' or 'vegetables'
    foodType: 'beef',
    shape: 'slab',
    thickness: 25,
    tempBath: 58,
    tempCore: 56,
    tempStart: 4, // Fridge temp default
    logReduction: null
};

function init() {
    // Detect Language
    const browserLang = navigator.language.split('-')[0];
    if (translations[browserLang]) {
        currentLang = browserLang;
        els.langSelector.value = currentLang;
    }
    updateLanguage();

    // Event Listeners
    els.langSelector.addEventListener('change', (e) => {
        currentLang = e.target.value;
        updateLanguage();
        updateFoodTypeOptions(); // Re-render to translate options
        updateDonenessOptions();
        calculate();
    });

    els.categoryToggle.addEventListener('input', (e) => {
        state.category = e.target.value === '1' ? 'vegetables' : 'meat';
        updateFoodTypeOptions();
        handleFoodTypeChange(); // Reset to first item
    });

    // Sync Range and Number inputs
    syncInputs(els.thickness, els.thicknessRange);
    syncInputs(els.tempBath, els.tempBathRange);
    syncInputs(els.tempCore, els.tempCoreRange);

    // Input Changes
    const inputs = [els.thickness, els.tempBath, els.tempCore];
    inputs.forEach(el => el.addEventListener('input', updateState));

    els.foodType.addEventListener('change', handleFoodTypeChange);
    els.shape.addEventListener('change', updateState);

    els.doneness.addEventListener('change', () => {
        handleDonenessChange();
        updateState();
    });

    els.detailsToggle.addEventListener('click', () => {
        els.detailsContent.classList.toggle('hidden');
    });

    // Chart mouseover tooltip
    els.chartCanvas.addEventListener('mousemove', handleChartMouseMove);
    els.chartCanvas.addEventListener('mouseleave', handleChartMouseLeave);

    // Initial Setup
    updateFoodTypeOptions();
    handleFoodTypeChange();

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log('SW Registered'))
            .catch(err => console.error('SW Fail', err));
    }
}

function syncInputs(numberInput, rangeInput) {
    numberInput.addEventListener('input', () => {
        rangeInput.value = numberInput.value;
        updateState();
    });
    rangeInput.addEventListener('input', () => {
        numberInput.value = rangeInput.value;
        updateState();
    });
}

function updateFoodTypeOptions() {
    const t = translations[currentLang];
    els.foodType.innerHTML = '';

    if (state.category === 'meat') {
        const meats = ['beef', 'pork', 'poultry', 'fish'];
        meats.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = t[type] || type.charAt(0).toUpperCase() + type.slice(1);
            els.foodType.appendChild(opt);
        });
    } else {
        // Vegetables
        Object.keys(VEGETABLE_DATA).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            // Fallback formatting: replace _ with space and capitalize
            const fallback = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            opt.textContent = t[VEGETABLE_DATA[key].label] || fallback;
            els.foodType.appendChild(opt);
        });
    }

    // Select first option by default if current selection is invalid
    const currentVal = els.foodType.value;
    if (!currentVal || (state.category === 'meat' && !['beef', 'pork', 'poultry', 'fish'].includes(currentVal)) ||
        (state.category === 'vegetables' && !VEGETABLE_DATA[currentVal])) {
        els.foodType.selectedIndex = 0;
    }
}

function handleFoodTypeChange() {
    state.foodType = els.foodType.value;

    if (state.category === 'vegetables') {
        const veg = VEGETABLE_DATA[state.foodType];
        if (veg) {
            // Lock controls
            setControlsLocked(true);

            // Set values
            updateInputValue(els.tempBath, els.tempBathRange, veg.temp);
            updateInputValue(els.tempCore, els.tempCoreRange, veg.temp); // Core = Bath for veg usually
            // Thickness doesn't matter for fixed time, but let's leave it or set to default

            // Hide Doneness (not relevant for veg usually, or just show 'Tender')
            els.doneness.innerHTML = '';
            const opt = document.createElement('option');
            opt.textContent = translations[currentLang]['doneness_tender'] || 'Tender';
            els.doneness.appendChild(opt);
            els.doneness.disabled = true;
        }
    } else {
        // Unlock controls
        setControlsLocked(false);
        updateDonenessOptions();
        handleDonenessChange(); // Reset limits
    }
    updateState();
}

function setControlsLocked(locked) {
    els.thickness.disabled = locked;
    els.thicknessRange.disabled = locked;
    els.tempBath.disabled = locked;
    els.tempBathRange.disabled = locked;
    els.tempCore.disabled = locked;
    els.tempCoreRange.disabled = locked;
    els.shape.disabled = locked;
}

function updateInputValue(numInput, rangeInput, value) {
    numInput.value = value;
    rangeInput.value = value;
}

function updateDonenessOptions() {
    if (state.category === 'vegetables') return;

    const presets = getDonenessPresets(els.foodType.value);
    const t = translations[currentLang];

    els.doneness.innerHTML = '';
    els.doneness.disabled = false;

    // Add Manual Option
    const manualOpt = document.createElement('option');
    manualOpt.value = 'manual';
    manualOpt.textContent = t.doneness_manual || "Manual Mode";
    els.doneness.appendChild(manualOpt);

    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.temp;
        opt.textContent = t[p.label] || p.label;
        els.doneness.appendChild(opt);
    });

    // Default to first preset if available
    if (presets.length > 0) {
        els.doneness.value = presets[0].temp;
    } else {
        els.doneness.value = 'manual';
    }
}

function handleDonenessChange() {
    if (state.category === 'vegetables') return;

    const val = els.doneness.value;

    if (val === 'manual') {
        // Unlock temps
        els.tempCore.disabled = false;
        els.tempCoreRange.disabled = false;
        els.tempBath.disabled = false;
        els.tempBathRange.disabled = false;

        // Reset ranges to full
        els.tempBath.min = 40; els.tempBath.max = 95;
        els.tempBathRange.min = 40; els.tempBathRange.max = 95;

    } else {
        const targetTemp = parseFloat(val);

        // Lock Target Core
        updateInputValue(els.tempCore, els.tempCoreRange, targetTemp);
        els.tempCore.disabled = true;
        els.tempCoreRange.disabled = true;

        // Restrict Bath Temp (Target + 0.5 to Target + 5)
        const minBath = targetTemp + 0.5;
        const maxBath = targetTemp + 5;

        els.tempBath.min = minBath;
        els.tempBath.max = maxBath;
        els.tempBathRange.min = minBath;
        els.tempBathRange.max = maxBath;

        // Set default bath temp if out of range
        let currentBath = parseFloat(els.tempBath.value);
        if (currentBath < minBath || currentBath > maxBath) {
            currentBath = targetTemp + 2; // Default +2°C
            updateInputValue(els.tempBath, els.tempBathRange, currentBath);
        }

        els.tempBath.disabled = false;
        els.tempBathRange.disabled = false;
    }
}

function updateState() {
    state.foodType = els.foodType.value;
    state.shape = els.shape.value;
    state.thickness = parseFloat(els.thickness.value);
    state.tempBath = parseFloat(els.tempBath.value);
    state.tempCore = parseFloat(els.tempCore.value);

    calculate();
}

function calculate() {
    // Special handling for Vegetables
    if (state.category === 'vegetables') {
        const veg = VEGETABLE_DATA[state.foodType];
        if (veg) {
            els.resHeat.textContent = "--";
            els.resPast.textContent = "--";
            els.resTotal.textContent = formatTime(veg.time);
            els.resTemp.textContent = `${veg.temp}°C`;
            els.warnings.style.display = 'none';

            // Draw simple flat line chart or clear it
            const ctx = els.chartCanvas.getContext('2d');
            ctx.clearRect(0, 0, els.chartCanvas.width, els.chartCanvas.height);
            // Maybe draw a straight line at target temp?
            // For now, just clear or show simple text
            return;
        }
    }

    const results = computeTotalTime(state);

    // Update UI
    els.resHeat.textContent = formatTime(results.heatingTime);
    els.resPast.textContent = formatTime(results.pasteurizationTime);
    els.resTotal.textContent = formatTime(results.totalTime);
    els.resTemp.textContent = `${state.tempCore}°C`;

    // Warnings
    const msgs = [];
    const t = translations[currentLang];

    if (state.tempBath < 52) msgs.push(t.warning_temp_low);
    if (state.thickness > 70) msgs.push(t.warning_thick);

    els.warnings.innerHTML = msgs.join('<br>');
    els.warnings.style.display = msgs.length ? 'block' : 'none';

    // Debug Info
    els.debugInfo.textContent = JSON.stringify(results, null, 2);

    // Chart - show only relevant heating portion
    if (results.totalTime) {
        // Generate full curve
        const fullPoints = computeTemperatureCurve(state, results.totalTime + 30);

        // Find when temperature plateaus (within 0.5°C of target)
        let plateauIndex = fullPoints.length - 1;
        for (let i = 0; i < fullPoints.length; i++) {
            if (Math.abs(fullPoints[i].y - state.tempCore) < 0.5) {
                // Add 10% more time after plateau for context
                plateauIndex = Math.min(fullPoints.length - 1, i + Math.floor((fullPoints.length - i) * 0.1));
                break;
            }
        }

        // Cut the points array at plateau
        const relevantPoints = fullPoints.slice(0, plateauIndex + 1);
        drawChart(relevantPoints);
    }

}

function drawChart(points) {
    const ctx = els.chartCanvas.getContext('2d');
    const w = els.chartCanvas.width;
    const h = els.chartCanvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Margins (increased for labels)
    const padLeft = 50;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 40;
    const graphW = w - padLeft - padRight;
    const graphH = h - padTop - padBottom;

    // Scales - round to nice numbers
    const maxTime = points[points.length - 1].x;
    const rawMaxTemp = Math.max(...points.map(p => p.y), state.tempBath);
    const rawMinTemp = Math.min(...points.map(p => p.y), state.tempStart);

    // Round to nearest 5°C
    const maxTemp = Math.ceil(rawMaxTemp / 5) * 5 + 5;
    const minTemp = Math.floor(rawMinTemp / 5) * 5 - 5;

    const scaleX = x => padLeft + (x / maxTime) * graphW;
    const scaleY = y => h - padBottom - ((y - minTemp) / (maxTemp - minTemp)) * graphH;

    // Draw pathogen danger zones (background)
    // Danger zone: 4°C - 60°C (approximate)
    ctx.fillStyle = 'rgba(255, 59, 48, 0.05)';
    const dangerTop = scaleY(60);
    const dangerBottom = scaleY(4);
    ctx.fillRect(padLeft, dangerTop, graphW, dangerBottom - dangerTop);

    // Draw grid lines and labels
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
    ctx.fillStyle = '#86868b';
    ctx.font = '11px monospace';
    ctx.lineWidth = 1;

    // Temperature grid lines (every 5°C)
    for (let temp = minTemp; temp <= maxTemp; temp += 5) {
        const y = scaleY(temp);
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();

        // Label
        ctx.textAlign = 'right';
        ctx.fillText(`${temp}°C`, padLeft - 5, y + 4);
    }

    // Time grid lines (every 30 minutes)
    const timeStep = 30;
    for (let t = 0; t <= maxTime; t += timeStep) {
        const x = scaleX(t);
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, h - padBottom);
        ctx.stroke();

        // Label
        ctx.textAlign = 'center';
        ctx.fillText(`${t}m`, x, h - padBottom + 20);
    }

    // Draw Axes (thicker)
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    // Draw pathogen safety lines
    // 60°C line (pasteurization starts)
    const pastY = scaleY(60);
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, pastY);
    ctx.lineTo(w - padRight, pastY);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffc107';
    ctx.fillText('60°C (Danger zone limit)', padLeft + 5, pastY - 5);

    // 52°C line (slow growth)
    const slowY = scaleY(52);
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
    ctx.beginPath();
    ctx.moveTo(padLeft, slowY);
    ctx.lineTo(w - padRight, slowY);
    ctx.stroke();
    ctx.fillStyle = '#ff9800';
    ctx.fillText('52°C (Slow growth)', padLeft + 5, slowY - 5);

    ctx.setLineDash([]);

    // Draw Target Temperature Line
    const targetY = scaleY(state.tempCore);
    ctx.strokeStyle = 'rgba(0, 198, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, targetY);
    ctx.lineTo(w - padRight, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#00C6FF';
    ctx.textAlign = 'right';
    ctx.fillText(`Target: ${state.tempCore}°C`, w - padRight - 5, targetY - 5);

    // Draw Temperature Curve (thicker, with glow)
    ctx.strokeStyle = '#00C6FF';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 198, 255, 0.5)';
    ctx.beginPath();
    points.forEach((p, i) => {
        const x = scaleX(p.x);
        const y = scaleY(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Add interactive mouseover (store for event listener)
    els.chartCanvas._chartData = {
        points,
        scaleX,
        scaleY,
        maxTime,
        minTemp,
        maxTemp,
        padLeft,
        padRight,
        padTop,
        padBottom
    };
}

function formatTime(minutes) {
    if (minutes === null || !isFinite(minutes)) return "--";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function updateLanguage() {
    const t = translations[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
}

init();

// Chart mouseover handlers
function handleChartMouseMove(e) {
    const canvas = els.chartCanvas;
    const data = canvas._chartData;
    if (!data) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Scale mouse coordinates
    const scaleRatio = canvas.width / rect.width;
    const x = mouseX * scaleRatio;
    const y = mouseY * scaleRatio;

    // Check if mouse is in the graph area
    if (x < data.padLeft || x > canvas.width - data.padRight ||
        y < data.padTop || y > canvas.height - data.padBottom) {
        return;
    }

    // Calculate time at mouse position
    const graphW = canvas.width - data.padLeft - data.padRight;
    const time = ((x - data.padLeft) / graphW) * data.maxTime;

    // Find corresponding temp from points
    let temp = null;
    for (let i = 0; i < data.points.length - 1; i++) {
        const p1 = data.points[i];
        const p2 = data.points[i + 1];
        if (time >= p1.x && time <= p2.x) {
            // Linear interpolation
            const ratio = (time - p1.x) / (p2.x - p1.x);
            temp = p1.y + ratio * (p2.y - p1.y);
            break;
        }
    }

    if (temp === null) return;

    // Redraw chart with tooltip
    const points = data.points;
    drawChart(points); // Redraw base chart

    // Draw crosshair and tooltip
    const ctx = canvas.getContext('2d');

    // Vertical line at mouse
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, data.padTop);
    ctx.lineTo(x, canvas.height - data.padBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw point at cursor intersection with curve
    const pointY = data.scaleY(temp);
    ctx.fillStyle = '#00C6FF';
    ctx.beginPath();
    ctx.arc(x, pointY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tooltip box
    const tooltipText = `${Math.round(time)}m: ${temp.toFixed(1)}°C`;
    ctx.font = '12px monospace';
    const textWidth = ctx.measureText(tooltipText).width;
    const tooltipW = textWidth + 16;
    const tooltipH = 24;

    // Position tooltip (avoid going off screen)
    let tooltipX = x + 10;
    let tooltipY = pointY - 30;
    if (tooltipX + tooltipW > canvas.width - data.padRight) {
        tooltipX = x - tooltipW - 10;
    }
    if (tooltipY < data.padTop) {
        tooltipY = pointY + 10;
    }

    // Draw tooltip background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(tooltipX, tooltipY, tooltipW, tooltipH);
    ctx.strokeStyle = '#00C6FF';
    ctx.lineWidth = 1;
    ctx.strokeRect(tooltipX, tooltipY, tooltipW, tooltipH);

    // Draw tooltip text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tooltipText, tooltipX + 8, tooltipY + tooltipH / 2);
}

function handleChartMouseLeave() {
    // Redraw chart without tooltip
    const data = els.chartCanvas._chartData;
    if (data && data.points) {
        drawChart(data.points);
    }
}
