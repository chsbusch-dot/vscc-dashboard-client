import { signalMeta } from '../data/signalMeta';

export const getClinicalColor = (id: string): string => {
    // Check if the ID has metadata, core or add-on (The "Dumb" Data)
    const meta = signalMeta(id);
    if (meta) {
        return meta.color;
    }

    // Fallbacks for known waveform IDs that might not be in the sidebar selection list
    // but might need coloring if rendered directly (The "Smart" Logic)
    switch (id) {
        case 'NOM_ECG_ELEC_POTL_II':
        case 'NOM_ECG_ELEC_POTL_I':
        case 'NOM_ECG_ELEC_POTL_V':
            return '#2ca02c'; // Green (ECG) - Matches NOM_ECG_CARD_BEAT_RATE
        case 'NOM_PLETH':
            return '#17becf'; // Cyan (SpO2) - Matches NOM_PULS_OXIM_SAT_O2
        case 'NOM_RESP':
        case 'NOM_IMPED_TTHOR':
            return '#E65100'; // Burnt Orange (Respiration) - Better contrast on white backgrounds
        default:
            return '#CCCCCC'; // Grey (Default)
    }
};