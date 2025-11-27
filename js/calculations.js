/**
 * Sous-Vide Calculations
 * Based on heat transfer physics and standard pasteurization models.
 * 
 * References:
 * - Baldwin, D. E. (2012). A Practical Guide to Sous Vide Cooking.
 * - Myhrvold, N., et al. (2011). Modernist Cuisine.
 */

// Thermal Diffusivity (alpha) in m^2/s
// Baldwin recommends using the lowest reported values to ensure safety.
// Beef Round ~ 1.11e-7 m^2/s (Sanz et al., 1987)
const THERMAL_DIFFUSIVITY = {
    beef: 1.11e-7,
    pork: 1.11e-7,
    poultry: 1.11e-7,
    fish: 1.11e-7, // Conservative
    vegetables: 1.4e-7, // Approx
    default: 1.11e-7
};

// Pasteurization Parameters (D_ref in minutes, T_ref in C, z in C)
// Target is usually 6D or 7D reduction for Listeria/Salmonella
const PASTEURIZATION_PARAMS = {
    beef: { d_ref: 3.2, t_ref: 60, z: 6.0, target_log: 6.5 }, // Listeria
    pork: { d_ref: 3.2, t_ref: 60, z: 6.0, target_log: 6.5 },
    poultry: { d_ref: 5.0, t_ref: 60, z: 6.0, target_log: 7.0 }, // Salmonella
    fish: { d_ref: 3.0, t_ref: 60, z: 6.0, target_log: 6.0 }, // Listeria
    vegetables: { d_ref: 0, t_ref: 0, z: 0, target_log: 0 } // Pasteurization not usually primary goal for veg texture
};

/**
 * Calculates the time to reach the target core temperature.
 * Uses simplified solutions to the heat equation.
 * 
 * @param {Object} params
 * @param {string} params.foodType - 'beef', 'pork', 'poultry', 'fish', 'vegetables'
 * @param {string} params.shape - 'slab', 'cylinder', 'sphere'
 * @param {number} params.thickness - Thickness or Diameter in mm
 * @param {number} params.tempBath - Bath temperature in °C
 * @param {number} params.tempStart - Initial food temperature in °C
 * @param {number} params.tempCore - Target core temperature in °C
 * @returns {number} Time in minutes
 */
export function computeHeatingTime({ foodType, shape, thickness, tempBath, tempStart, tempCore }) {
    if (tempCore >= tempBath) return Infinity; // Cannot reach temp higher than bath
    if (tempCore <= tempStart) return 0; // Already there

    const alpha = THERMAL_DIFFUSIVITY[foodType] || THERMAL_DIFFUSIVITY.default;
    const L = (thickness / 1000); // convert mm to meters

    // Beta values for different shapes (approximate geometric factors)
    // Slab: thickness is full thickness. Characteristic length is L/2.
    // Cylinder: thickness is diameter. Radius is L/2.
    // Sphere: thickness is diameter. Radius is L/2.

    // Using simplified formula: Time ~ factor * (L^2 / alpha) * log((T_bath - T_start) / (T_bath - T_core))
    // This is a first-order approximation.

    // More accurate approximation using Baldwin's approach or Heisler charts logic:
    // For Slab (thickness L): Time = (L^2 / (4 * alpha)) * ...
    // Let's use a robust approximation factor based on shape.

    // Shape factors (approximate for 0.01 difference ratio)
    let shapeFactor;
    switch (shape) {
        case 'slab': shapeFactor = 0.5; break; // Slower
        case 'cylinder': shapeFactor = 0.3; break; // Faster (2D heat flow)
        case 'sphere': shapeFactor = 0.2; break; // Fastest (3D heat flow)
        default: shapeFactor = 0.5;
    }

    // Normalized temperature ratio (unaccomplished temperature change)
    const Y = (tempBath - tempCore) / (tempBath - tempStart);

    // If Y is very small (close to equilibrium), time goes to infinity.
    // Practical cutoff: usually we calculate to 0.5C or 0.1C diff.

    // Formula: t = (L^2 / alpha) * F(Y, shape)
    // Using a simplified logarithmic decay model:
    // t = - (1 / (decay_constant * alpha / r^2)) * ln(Y * constant)

    // Let's use Baldwin's simplified table-based logic fitted to a curve for practical use.
    // Or the standard physics approximation:
    // Fourier Number Fo = alpha * t / r^2 (where r = L/2)
    // For center of slab: (T-Tb)/(Ti-Tb) ~ 1.27 * exp(-2.47 * Fo)
    // Y = 1.27 * exp(-2.47 * Fo)
    // ln(Y/1.27) = -2.47 * Fo
    // Fo = -ln(Y/1.27) / 2.47
    // t = Fo * r^2 / alpha

    const r = L / 2;
    let Fo;

    if (shape === 'slab') {
        // Slab: Y ~ 1.273 * exp(-2.467 * Fo)
        Fo = -Math.log(Y / 1.273) / 2.467;
    } else if (shape === 'cylinder') {
        // Cylinder: Y ~ 1.602 * exp(-5.783 * Fo)
        Fo = -Math.log(Y / 1.602) / 5.783;
    } else if (shape === 'sphere') {
        // Sphere: Y ~ 2.0 * exp(-9.87 * Fo)
        Fo = -Math.log(Y / 2.0) / 9.87;
    }

    // If Fo is negative (because Y is large, i.e., target is very close to start), 
    // it means the approximation (valid for long times) isn't perfect, but usually Y < 1.
    // If Y is close to 1, time is small.
    if (Fo < 0) Fo = 0.01; // Minimal time

    let timeSeconds = Fo * (r * r) / alpha;
    return timeSeconds / 60; // minutes
}

/**
 * Calculates pasteurization time based on temperature.
 * 
 * @param {Object} params
 * @param {string} params.foodType
 * @param {number} params.tempCore - Holding temperature in °C
 * @param {number} params.logReduction - Desired log reduction (optional, defaults to food type standard)
 * @returns {number} Time in minutes
 */
export function computePasteurizationTime({ foodType, tempCore, logReduction }) {
    const params = PASTEURIZATION_PARAMS[foodType] || PASTEURIZATION_PARAMS.beef;
    if (params.d_ref === 0) return 0; // No pasteurization for this type (e.g. veg)

    const targetLog = logReduction || params.target_log;

    // D_value at tempCore = D_ref * 10^((T_ref - tempCore) / z)
    const dValue = params.d_ref * Math.pow(10, (params.t_ref - tempCore) / params.z);

    return dValue * targetLog;
}

/**
 * Computes total recommended time.
 * Logic: You need to heat it up, AND keep it there long enough to pasteurize.
 * However, pasteurization happens DURING heating too.
 * A conservative simple approach: Heating Time + Pasteurization Time (at target temp).
 * A more accurate approach (integration) is complex for a client-side app without heavy iteration.
 * 
 * Standard conservative advice: Heating Time to core + Pasteurization Time at that core temp.
 * This is safe because the core is the coldest point.
 * 
 * @returns {Object} { heatingTime, pasteurizationTime, totalTime } (all in minutes)
 */
export function computeTotalTime(input) {
    const heatingTime = computeHeatingTime(input);
    const pasteurizationTime = computePasteurizationTime({
        foodType: input.foodType,
        tempCore: input.tempCore, // We pasteurize at the target core temp
        logReduction: input.logReduction
    });

    // If heating time is infinite (unreachable), return nulls
    if (!isFinite(heatingTime)) {
        return { heatingTime: null, pasteurizationTime: null, totalTime: null };
    }

    return {
        heatingTime: Math.ceil(heatingTime),
        pasteurizationTime: Math.ceil(pasteurizationTime),
        totalTime: Math.ceil(heatingTime + pasteurizationTime)
    };
}

export function getDonenessPresets(foodType) {
    const presets = {
        beef: [
            { label: 'doneness_rare', temp: 52 },
            { label: 'doneness_med_rare', temp: 55 },
            { label: 'doneness_medium', temp: 60 },
            { label: 'doneness_med_well', temp: 65 },
            { label: 'doneness_well', temp: 70 }
        ],
        pork: [
            { label: 'doneness_med_rare', temp: 58 }, // Modern pork
            { label: 'doneness_medium', temp: 62 },
            { label: 'doneness_well', temp: 70 }
        ],
        poultry: [
            { label: 'doneness_juicy', temp: 62 },
            { label: 'doneness_traditional', temp: 70 }
        ],
        fish: [
            { label: 'doneness_mi_cuit', temp: 45 },
            { label: 'doneness_medium', temp: 52 },
            { label: 'doneness_well', temp: 60 }
        ],
        vegetables: [
            { label: 'doneness_tender', temp: 85 }
        ]
    };
    return presets[foodType] || [];
}

export const VEGETABLE_DATA = {
    "asparagus_green": { time: 20, temp: 85, label: "veg_asparagus_green" },
    "potatoes_sliced": { time: 40, temp: 75, label: "veg_potatoes_sliced" },
    "leeks": { time: 60, temp: 85, label: "veg_leeks" },
    "potatoes_chunks": { time: 60, temp: 75, label: "veg_potatoes_chunks" },
    "carrots_sliced": { time: 40, temp: 85, label: "veg_carrots_sliced" },
    "zucchini_cubes": { time: 30, temp: 75, label: "veg_zucchini_cubes" },
    "eggplant_halves": { time: 40, temp: 75, label: "veg_eggplant_halves" },
    "artichokes_wedges": { time: 40, temp: 85, label: "veg_artichokes_wedges" },
    "artichokes_whole": { time: 70, temp: 85, label: "veg_artichokes_whole" },
    "onions_whole": { time: 80, temp: 90, label: "veg_onions_whole" },
    "broccoli": { time: 40, temp: 85, label: "veg_broccoli" },
    "cauliflower_florets": { time: 40, temp: 85, label: "veg_cauliflower_florets" },
    "peppers_strips": { time: 50, temp: 80, label: "veg_peppers_strips" },
    "celeriac_cubes": { time: 60, temp: 82, label: "veg_celeriac_cubes" },
    "pumpkin_puree": { time: 120, temp: 85, label: "veg_pumpkin_puree" }
};

export function computeTemperatureCurve(params, totalMinutes) {
    const { foodType, shape, thickness, tempBath, tempStart } = params;
    const alpha = THERMAL_DIFFUSIVITY[foodType] || THERMAL_DIFFUSIVITY.default;
    const L = (thickness / 1000);
    const r = L / 2;

    // Constants for shape decay
    let c1, c2;
    switch (shape) {
        case 'slab': c1 = 1.273; c2 = 2.467; break;
        case 'cylinder': c1 = 1.602; c2 = 5.783; break;
        case 'sphere': c1 = 2.0; c2 = 9.87; break;
        default: c1 = 1.273; c2 = 2.467;
    }

    const points = [];
    const steps = 50;
    const stepSize = Math.max(1, totalMinutes / steps);

    for (let t = 0; t <= totalMinutes; t += stepSize) {
        // Inverse formula:
        // Fo = alpha * t_sec / r^2
        // Y = c1 * exp(-c2 * Fo)
        // Tc = Tb - Y * (Tb - Ti)

        const tSec = t * 60;
        const Fo = (alpha * tSec) / (r * r);
        let Y = c1 * Math.exp(-c2 * Fo);
        if (Y > 1) Y = 1; // Clamp initial transient

        const temp = tempBath - Y * (tempBath - tempStart);
        points.push({ x: t, y: temp });
    }
    return points;
}
