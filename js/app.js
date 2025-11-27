import { computeTotalTime, getDonenessPresets, computeTemperatureCurve, VEGETABLE_DATA } from './calculations.js?v=4';
import en from './i18n/en.js?v=4';
import it from './i18n/it.js?v=4';
import fr from './i18n/fr.js?v=4';
import pl from './i18n/pl.js?v=4';

const translations = { en, it, fr, pl };
const STORAGE_KEY = 'sousvide-settings-v2';
let currentLang = 'en';
let savedDoneness = null;

// DOM Elements
const els = {
    categoryToggle: document.getElementById('category-toggle'),
    categoryLabelLeft: document.querySelector('.toggle-label.left'),
    categoryLabelRight: document.querySelector('.toggle-label.right'),
    langButtons: document.querySelectorAll('.lang-btn'),
    tempUnitSlider: document.getElementById('temp-unit-slider'),
    lenUnitSlider: document.getElementById('len-unit-slider'),
    foodType: document.getElementById('food-type'),
    doneness: document.getElementById('doneness'),
    shape: document.getElementById('shape'),
    thickness: document.getElementById('thickness'),
    thicknessRange: document.getElementById('thickness-range'),
    tempBath: document.getElementById('temp-bath'),
    tempBathRange: document.getElementById('temp-bath-range'),
    tempCore: document.getElementById('temp-core'),
    tempCoreRange: document.getElementById('temp-core-range'),
    tempStartInputs: document.querySelectorAll('input[name="temp-start"]'),
    resHeat: document.getElementById('res-heat'),
    resPast: document.getElementById('res-past'),
    resTotal: document.getElementById('res-total'),
    resTemp: document.getElementById('res-temp'),
    warnings: document.getElementById('warnings'),
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
    logReduction: null,
    unit: 'C',
    lengthUnit: 'mm'
};

function init() {
    loadSavedState();
    setActiveLanguageButton(currentLang);
    updateLanguage();
    applyUnitSettings();

    // Event Listeners
    els.langButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentLang = btn.dataset.lang;
            setActiveLanguageButton(currentLang);
            saveState();
            updateLanguage();
            updateFoodTypeOptions();
            updateDonenessOptions();
            calculate();
        });
    });

    els.tempUnitSlider.addEventListener('input', (e) => {
        state.unit = e.target.value === '1' ? 'F' : 'C';
        applyUnitSettings();
        updateLanguage();
        updateDonenessOptions();
        handleDonenessChange();
        calculate();
        saveState();
    });

    els.lenUnitSlider.addEventListener('input', (e) => {
        state.lengthUnit = e.target.value === '1' ? 'inch' : 'mm';
        applyUnitSettings();
        setInputsFromState();
        calculate();
        saveState();
    });

    els.categoryToggle.addEventListener('input', (e) => {
        state.category = e.target.value === '1' ? 'vegetables' : 'meat';
        updateCategoryLabels();
        saveState();
        updateFoodTypeOptions();
        handleFoodTypeChange();
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

    els.tempStartInputs.forEach(input => {
        input.addEventListener('change', () => {
            state.tempStart = parseFloat(input.value);
            calculate();
            saveState();
        });
    });

    els.detailsToggle.addEventListener('click', () => {
        els.detailsContent.classList.toggle('hidden');
    });

    // Chart mouseover tooltip
    els.chartCanvas.addEventListener('mousemove', handleChartMouseMove);
    els.chartCanvas.addEventListener('mouseleave', handleChartMouseLeave);

    // Initial Setup
    els.categoryToggle.value = state.category === 'vegetables' ? '1' : '0';
    els.tempUnitSlider.value = state.unit === 'F' ? '1' : '0';
    els.lenUnitSlider.value = state.lengthUnit === 'inch' ? '1' : '0';
    applyUnitSettings();
    setInputsFromState();
    updateCategoryLabels();
    updateFoodTypeOptions();
    if (state.foodType) {
        els.foodType.value = state.foodType;
    }
    handleFoodTypeChange();
    calculate();

    // Service Worker Registration
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log('SW Registered'))
            .catch(err => console.error('SW Fail', err));
    } else if (location.protocol === 'file:') {
        console.warn('Service worker disabilitato in modalità file://; avvia con un server locale per abilitarlo.');
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

function cToF(c) {
    return +(c * 9 / 5 + 32).toFixed(1);
}

function fToC(f) {
    return +((f - 32) * 5 / 9).toFixed(1);
}

function mmToIn(mm) {
    return +(mm / 25.4).toFixed(2);
}

function inToMm(inch) {
    return +(inch * 25.4).toFixed(1);
}

function applyUnitSettings() {
    const isF = state.unit === 'F';
    const stepC = 0.5;
    const step = isF ? cToF(stepC) - cToF(0) : stepC;

    const setBounds = (inputNum, inputRange, minC, maxC) => {
        const min = isF ? cToF(minC) : minC;
        const max = isF ? cToF(maxC) : maxC;
        inputNum.min = min; inputNum.max = max; inputNum.step = step;
        inputRange.min = min; inputRange.max = max; inputRange.step = step;
    };

    setBounds(els.tempBath, els.tempBathRange, 40, 95);
    setBounds(els.tempCore, els.tempCoreRange, 40, 95);

    // Length unit bounds
    const setLenBounds = (minMm, maxMm) => {
        const min = state.lengthUnit === 'inch' ? mmToIn(minMm) : minMm;
        const max = state.lengthUnit === 'inch' ? mmToIn(maxMm) : maxMm;
        const stepLen = state.lengthUnit === 'inch' ? 0.1 : 1;
        els.thickness.min = min;
        els.thickness.max = max;
        els.thickness.step = stepLen;
        els.thicknessRange.min = min;
        els.thicknessRange.max = max;
        els.thicknessRange.step = stepLen;
    };
    setLenBounds(5, 150);

    updateStartTempLabels();

    // Refresh visible values from state
    setInputsFromState();
    updateThicknessLabel();
}

function setInputsFromState() {
    // Thickness
    const displayThickness = state.lengthUnit === 'inch' ? mmToIn(state.thickness) : state.thickness;
    els.thickness.value = displayThickness;
    els.thicknessRange.value = displayThickness;
    // Temps
    updateInputValue(els.tempBath, els.tempBathRange, state.tempBath);
    updateInputValue(els.tempCore, els.tempCoreRange, state.tempCore);
    // Temp start radio
    els.tempStartInputs.forEach(r => { r.checked = parseFloat(r.value) === state.tempStart; });
    // Unit toggle state already handled in init
}

function saveState() {
    const payload = {
        lang: currentLang,
        category: state.category,
        foodType: state.foodType,
        shape: state.shape,
        thickness: state.thickness,
        tempBath: state.tempBath,
        tempCore: state.tempCore,
        tempStart: state.tempStart,
        unit: state.unit,
        lengthUnit: state.lengthUnit,
        doneness: els.doneness ? els.doneness.value : 'manual'
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('Unable to save settings', e);
    }
}

function loadSavedState() {
    const browserLang = navigator.language.split('-')[0];
    if (translations[browserLang]) currentLang = browserLang;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        currentLang = saved.lang || currentLang;
        state.category = saved.category || state.category;
        state.foodType = saved.foodType || state.foodType;
        state.shape = saved.shape || state.shape;
        state.thickness = saved.thickness || state.thickness;
        state.tempBath = saved.tempBath || state.tempBath;
        state.tempCore = saved.tempCore || state.tempCore;
        state.tempStart = saved.tempStart || state.tempStart;
        state.unit = saved.unit || state.unit;
        state.lengthUnit = saved.lengthUnit || state.lengthUnit;
        if (saved.doneness) { savedDoneness = saved.doneness; }
    } catch (e) {
        console.warn('Unable to load saved settings', e);
    }
}

function setActiveLanguageButton(lang) {
    els.langButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
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
    const displayVal = state.unit === 'F' ? cToF(value) : value;
    numInput.value = displayVal;
    rangeInput.value = displayVal;
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
    const preferred = savedDoneness;
    const exists = preferred && Array.from(els.doneness.options).some(o => o.value === preferred);
    if (exists) {
        els.doneness.value = preferred;
    } else if (presets.length > 0) {
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
        const min = state.unit === "F" ? cToF(40) : 40; const max = state.unit === "F" ? cToF(95) : 95; els.tempBath.min = min; els.tempBath.max = max; els.tempBathRange.min = min; els.tempBathRange.max = max;

    } else {
        const targetTemp = parseFloat(val);

        // Lock Target Core
        updateInputValue(els.tempCore, els.tempCoreRange, targetTemp);
        els.tempCore.disabled = true;
        els.tempCoreRange.disabled = true;

        // Restrict Bath Temp (Target + 0.5 to Target + 5)
        const minBath = targetTemp + 0.5;
        const maxBath = targetTemp + 5;

        const minDisplay = state.unit === "F" ? cToF(minBath) : minBath; const maxDisplay = state.unit === "F" ? cToF(maxBath) : maxBath; els.tempBath.min = minDisplay; els.tempBath.max = maxDisplay; els.tempBathRange.min = minDisplay; els.tempBathRange.max = maxDisplay;

        // Set default bath temp if out of range
        let currentBath = parseFloat(els.tempBath.value);
        if ((state.unit === "F" ? fToC(currentBath) : currentBath) < minBath || (state.unit === "F" ? fToC(currentBath) : currentBath) > maxBath) { const newBathC = targetTemp + 2; updateInputValue(els.tempBath, els.tempBathRange, newBathC);
        }

        els.tempBath.disabled = false;
        els.tempBathRange.disabled = false;
    }
}

function updateState() {
    state.foodType = els.foodType.value;
    state.shape = els.shape.value;
    const thicknessVal = parseFloat(els.thickness.value);
    state.thickness = state.lengthUnit === 'inch' ? inToMm(thicknessVal) : thicknessVal;
    state.tempBath = state.unit === 'F' ? fToC(parseFloat(els.tempBath.value)) : parseFloat(els.tempBath.value);
    state.tempCore = state.unit === 'F' ? fToC(parseFloat(els.tempCore.value)) : parseFloat(els.tempCore.value);
    state.tempStart = getSelectedStartTemp();

    calculate();
    saveState();
}

function updateCategoryLabels() {
    if (!els.categoryLabelLeft || !els.categoryLabelRight) return;
    const isVeg = els.categoryToggle.value === '1';
    // keep attribute in sync so :has selector (if any) works too
    els.categoryToggle.setAttribute('value', isVeg ? '1' : '0');
    els.categoryLabelLeft.classList.toggle('active', !isVeg);
    els.categoryLabelRight.classList.toggle('active', isVeg);
}

function getSelectedStartTemp() {
    const checked = Array.from(els.tempStartInputs).find(input => input.checked);
    if (!checked) return state.tempStart;
    const cVal = parseFloat(checked.dataset.cValue || checked.value);
    return cVal;
}

function calculate() {
    // Special handling for Vegetables
    if (state.category === 'vegetables') {
        const veg = VEGETABLE_DATA[state.foodType];
        if (veg) {
            els.resHeat.textContent = "--";
            els.resPast.textContent = "--";
            els.resTotal.textContent = formatTime(veg.time);
            els.resTemp.textContent = formatTemp(veg.temp);
            els.warnings.style.display = 'none';

            // Draw a simple heating curve for vegetables: ramp to temp then hold
            const vegPoints = buildVegetableCurve({
                totalTime: veg.time,
                targetTemp: veg.temp,
                startTemp: state.tempStart
            });
            drawChart(vegPoints);
            return;
        }
    }

    const results = computeTotalTime(state);

    // Update UI
    els.resHeat.textContent = formatTime(results.heatingTime);
    els.resPast.textContent = formatTime(results.pasteurizationTime);
    els.resTotal.textContent = formatTime(results.totalTime);
    els.resTemp.textContent = formatTemp(state.tempCore);

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

        // Find when temperature plateaus (within 0.5\u00b0C of target)
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
    const t = translations[currentLang] || {};
    const ctx = els.chartCanvas.getContext('2d');
    const w = els.chartCanvas.width;
    const h = els.chartCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const displayPoints = state.unit === 'F' ? points.map(p => ({ x: p.x, y: cToF(p.y) })) : points;

    const padLeft = 50;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 40;
    const graphW = w - padLeft - padRight;
    const graphH = h - padTop - padBottom;

    const maxTime = displayPoints[displayPoints.length - 1].x;
    const rawMaxTemp = Math.max(...displayPoints.map(p => p.y), state.unit === 'F' ? cToF(state.tempBath) : state.tempBath);
    const rawMinTemp = Math.min(...displayPoints.map(p => p.y), state.unit === 'F' ? cToF(state.tempStart) : state.tempStart);

    const maxTemp = Math.ceil(rawMaxTemp / 5) * 5 + 5;
    const minTemp = Math.floor(rawMinTemp / 5) * 5 - 5;

    const scaleX = x => padLeft + (x / maxTime) * graphW;
    const scaleY = y => h - padBottom - ((y - minTemp) / (maxTemp - minTemp)) * graphH;

    // background danger zone
    ctx.fillStyle = 'rgba(255, 59, 48, 0.05)';
    const dangerTop = scaleY(state.unit === 'F' ? cToF(60) : 60);
    const dangerBottom = scaleY(state.unit === 'F' ? cToF(4) : 4);
    ctx.fillRect(padLeft, dangerTop, graphW, dangerBottom - dangerTop);

    // grid
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
    ctx.fillStyle = '#86868b';
    ctx.font = '11px monospace';
    ctx.lineWidth = 1;

    for (let temp = minTemp; temp <= maxTemp; temp += 5) {
        const y = scaleY(temp);
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(`${temp}\u00b0C`, padLeft - 5, y + 4);
    }

    const timeStep = 30;
    for (let tMin = 0; tMin <= maxTime; tMin += timeStep) {
        const x = scaleX(tMin);
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, h - padBottom);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(`${tMin}m`, x, h - padBottom + 20);
    }

    // axes
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    // safety lines
    const pastY = scaleY(state.unit === 'F' ? cToF(60) : 60);
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, pastY);
    ctx.lineTo(w - padRight, pastY);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffc107';
    ctx.fillText(`${state.unit === 'F' ? '140°F' : '60\u00b0C'} (${t.chart_danger_limit || 'Danger zone limit'})`, padLeft + 5, pastY - 5);

    const slowY = scaleY(state.unit === 'F' ? cToF(52) : 52);
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
    ctx.beginPath();
    ctx.moveTo(padLeft, slowY);
    ctx.lineTo(w - padRight, slowY);
    ctx.stroke();
    ctx.fillStyle = '#ff9800';
    ctx.fillText(`${state.unit === 'F' ? '125.6°F' : '52\u00b0C'} (${t.chart_slow_growth || 'Slow growth'})`, padLeft + 5, slowY - 5);
    ctx.setLineDash([]);

    // target line
    const targetY = scaleY(state.unit === 'F' ? cToF(state.tempCore) : state.tempCore);
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
    ctx.fillText(`${t.chart_target || 'Target'}: ${formatTemp(state.tempCore)}`, w - padRight - 5, targetY - 5);

    // curve
    ctx.strokeStyle = '#00C6FF';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 198, 255, 0.5)';
    ctx.beginPath();
    displayPoints.forEach((p, i) => {
        const x = scaleX(p.x);
        const y = scaleY(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    els.chartCanvas._chartData = {
        points: displayPoints,
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

function formatTemp(tempC) {
    return state.unit === 'F' ? `${cToF(tempC)}°F` : `${tempC}°C`;
}

function updateLanguage() {
    const t = translations[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
    updateStartTempLabels();
    updateThicknessLabel();
    setActiveLanguageButton(currentLang);
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
    const tooltipText = `${Math.round(time)}m: ${temp.toFixed(1)}${state.unit === 'F' ? '\u00b0F' : '\u00b0C'}`;
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

function buildVegetableCurve({ totalTime, targetTemp, startTemp }) {
    const points = [];
    const steps = 40;
    const rampFraction = 0.25; // ramp during first 25% of the time
    const rampMinutes = Math.max(10, totalTime * rampFraction);
    const stepMinutes = Math.max(1, totalTime / steps);

    for (let t = 0; t <= totalTime; t += stepMinutes) {
        let temp;
        if (t <= rampMinutes) {
            const ratio = t / rampMinutes;
            temp = startTemp + ratio * (targetTemp - startTemp);
        } else {
            temp = targetTemp;
        }
        points.push({ x: t, y: temp });
    }

    // Ensure final point exactly matches total time and target temp
    if (points[points.length - 1].x < totalTime) {
        points.push({ x: totalTime, y: targetTemp });
    }

    return points;
}

function updateStartTempLabels() {
    const t = translations[currentLang] || {};
    const fmt = (c) => state.unit === 'F' ? `${cToF(c)}°F` : `${c}°C`;
    const fridgeLabel = document.querySelector('label[for="temp-start-fridge"]');
    const roomLabel = document.querySelector('label[for="temp-start-room"]');
    if (fridgeLabel) fridgeLabel.textContent = `${(t.temp_start_fridge || 'Fridge').split('(')[0].trim()} (${fmt(4)})`;
    if (roomLabel) roomLabel.textContent = `${(t.temp_start_room || 'Room').split('(')[0].trim()} (${fmt(20)})`;
}

function updateThicknessLabel() {
    const label = document.querySelector('label[for="thickness"]');
    if (!label) return;
    const t = translations[currentLang] || {};
    const base = t.label_thickness || 'Thickness / Diameter';
    const unitTxt = state.lengthUnit === 'inch' ? 'inch' : 'mm';
    label.textContent = `${base} (${unitTxt})`;
}








