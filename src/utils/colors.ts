import { PHYSIO_META, type PhysioId } from '../data/constants';

export const getClinicalColor = (id: string): string => {
    // Check if the ID exists in our metadata (The "Dumb" Data)
    if (id in PHYSIO_META) {
        return PHYSIO_META[id as PhysioId].color;
    }

    // Fallbacks for known waveform IDs that might not be in the sidebar selection list
    // but might need coloring if rendered directly (The "Smart" Logic)
    switch (id) {
        case 'NOM_ECG_ELEC_POTL_II':
        case 'NOM_ECG_ELEC_POTL_I':
        case 'NOM_ECG_ELEC_POTL_V':
            return '#2ca02c'; // Green (ECG) - Matches NOM_ECG_CARD_BEAT_RATE
        case 'NOM_PLETH_WAVE_A':
            return '#17becf'; // Cyan (SpO2) - Matches NOM_PULS_OXIM_SAT_O2
        case 'NOM_RESP':
        case 'NOM_IMPED_TTHOR':
            return '#ffff00'; // Yellow (Respiration) - Matches NOM_RESP_RATE
        default:
            return '#CCCCCC'; // Grey (Default)
    }
};