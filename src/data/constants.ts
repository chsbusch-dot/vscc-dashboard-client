export const PHYSIO_META = {
    /*
     * =================================================================
     * VSCapture Clinical Color Palette Reference
     * =================================================================
     *
     * --- Blood Pressure (NIBP) ---
     * NIBP Systolic: Deep Red (#C62828)
     * NIBP Mean: Dark Rust/Orange (#BF360C)
     * NIBP Diastolic: Dark Burgundy (#880E4F)
     * NIBP Pulse Rate: Very Dark Red (#B71C1C)
     *
     * --- ECG & Cardiac ---
     * ECG Heart Rate: Forest Green (#2E7D32)
     * ST Segment II: Very Dark Green (#1B5E20)
     * PVC Count: Olive/Leaf Green (#558B2F)
     *
     * --- Oxygenation (SpO2) ---
     * SpO2 %: Deep Teal (#00838F)
     * SpO2 Pulse: Deep Sky Blue (#0277BD)
     * Perfusion Index: Very Dark Cyan (#006064)
     *
     * --- Respiration & Temperature ---
     * Resp Rate: Burnt Orange (#E65100)
     * Temperature (Tympanic): Dark Brown (#5D4037)
     *
     * --- Neuro & Consciousness ---
     * BIS Index: Deep Gold/Amber (#F57F17)
     * EEG Total Power: Dark Slate Grey (#455A64)
     * EEG SEF (Spectral Edge): Pure Black (#000000)
     *
     * --- EEG Frequency Bands ---
     * EEG Delta: Blue (#1976D2)
     * EEG Theta: Green (#2E7D32)
     * EEG Alpha: Orange/Amber (#F57C00)
     * EEG Beta: Red (#D32F2F)
     */

    // --- Cardiovascular ---
    "NOM_ECG_CARD_BEAT_RATE": {"name": "MMS ECG HR", "unit": "bpm", "group": "ECG Heart Rate", "color": "#2E7D32"},
    // Oxygenation Group
    "NOM_PULS_OXIM_SAT_O2": {"name": "MMS SpO2", "unit": "%", "group": "MMS SpO2", "color": "#00838F"},
    "NOM_PLETH_PULS_RATE": {"name": "MMS SpO2 Pulse", "unit": "bpm", "group": "MMS SpO2 Pulse", "color": "#0277BD"},
    "NOM_PULS_OXIM_PERF_REL": {"name": "MMS Perf Index", "unit": "", "group": "MMS Perf Index", "color": "#006064"},
    "NOM_PLETH_WAVE_A": {"name": "MMS PLETH Wave", "unit": "ADU", "group": "Oxygenation", "color": "#0277BD"},
    "NOM_PRESS_BLD_NONINV_SYS": {"name": "MMS NIBP Systolic", "unit": "mmHg", "group": "NIBP", "color": "#C62828"},
    "NOM_PRESS_BLD_NONINV_DIA": {"name": "MMS NIBP Diastolic", "unit": "mmHg", "group": "NIBP", "color": "#880E4F"},
    "NOM_PRESS_BLD_NONINV_MEAN": {"name": "MMS NIBP Mean", "unit": "mmHg", "group": "NIBP", "color": "#BF360C"},
    "NOM_PRESS_BLD_NONINV_PULS_RATE": {"name": "MMS NIBP Pulse", "unit": "bpm", "group": "NIBP Pulse", "color": "#B71C1C"},

    // --- Respiratory & Temp (Adjusted to Standards) ---
    "NOM_RESP_RATE": {"name": "MMS Resp Rate", "unit": "rpm", "group": "Respiration", "color": "#E65100"},
    // "NOM_CONC_AWAY_CO2_ET": {"name": "MMS etCO2", "unit": "mmHg", "group": "CO2", "color": "#E65100"}, // Same as Resp
    //"iTtymp": {"name": "MMS Temp Tympanic", "unit": "°C", "group": "Temperature", "color": "#5D4037"},

    // --- ECG Metrics ---
    "NOM_ECG_AMPL_ST_II": {"name": "MMS ST II", "unit": "mm", "group": "ECG ST", "color": "#1B5E20"},
    "NOM_ECG_V_P_C_CNT": {"name": "MMS PVC Count", "unit": "", "group": "ECG PVC", "color": "#558B2F"},

    // --- Brain Monitoring (Standard palette for clarity) ---
    "NOM_EEG_PWR_SPEC_TOT": {"name": "EEG Power", "unit": "dB", "group": "EEG", "color": "#455A64"},
    "NOM_EEG_FREQ_PWR_SPEC_CRTX_SPECTRAL_EDGE": {"name": "EEG SEF", "unit": "Hz", "group": "EEG", "color": "#000000"},
    "NOM_EEG_BISPECTRAL_INDEX": {"name": "BIS Index", "unit": "", "group": "BIS", "color": "#F57F17"},
    "NOM_EEG_BIS_BURST_SUPPR_RATIO": {"name": "BIS BSR", "unit": "%", "group": "BIS", "color": "#F57F17"},
    "NOM_EEG_ELEC_POTL_CRTX": {name: "MMS EEG Wave", unit: "μV", group: "EEG", color: "#2ca02c"}, // ADD THIS FOR EEG WAVEFORM

    // --- Relative EEG Bands ---
    "NOM_EEG_PWR_SPEC_DELTA_REL": {"name": "EEG Delta", "unit": "%", "group": "4 Brainwaves", "color": "#1976D2"}, // Blue
    "NOM_EEG_PWR_SPEC_THETA_REL": {"name": "EEG Theta", "unit": "%", "group": "4 Brainwaves", "color": "#2E7D32"}, // Green
    "NOM_EEG_PWR_SPEC_ALPHA_REL": {"name": "EEG Alpha", "unit": "%", "group": "4 Brainwaves", "color": "#F57C00"}, // Orange/Amber
    "NOM_EEG_PWR_SPEC_BETA_REL": {"name": "EEG Beta", "unit": "%", "group": "4 Brainwaves", "color": "#D32F2F"}, // Red

    // --- Pulse Analysis (from previous version, needed for AdvancedCharts) ---
    "NOM_PULS_INTERVAL": {"name": "PPI Plot", "unit": "ms", "group": "Pulse Analysis", "color": "#E040FB"}
};

export type PhysioId = keyof typeof PHYSIO_META;