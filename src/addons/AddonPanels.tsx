import { Box } from '@mui/material';
import { addonPanels, subscribeWaveform } from './index';

/** Slot for build-injected panels: those of `family`, or those without a family when
 *  unset. Renders nothing when none match. */
const AddonPanels = ({ family }: { family?: string }) => {
    const panels = addonPanels.filter(p => p.family === family);
    if (panels.length === 0) return null;
    return (
        <Box data-addon-slot={family ?? ''}>
            {panels.map(({ id, component: Panel }) => (
                <Box key={id} data-addon-panel={id} sx={{ mt: 2 }}>
                    <Panel subscribeWaveform={subscribeWaveform} />
                </Box>
            ))}
        </Box>
    );
};

export default AddonPanels;
