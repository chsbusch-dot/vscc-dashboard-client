import { Box } from '@mui/material';
import { addonPanels, subscribeWaveform } from './index';

/** Slot for build-injected panels. Renders nothing when none are registered. */
const AddonPanels = () => {
    if (addonPanels.length === 0) return null;
    return (
        <Box data-addon-slot="">
            {addonPanels.map(({ id, component: Panel }) => (
                <Box key={id} data-addon-panel={id} sx={{ mt: 2 }}>
                    <Panel subscribeWaveform={subscribeWaveform} />
                </Box>
            ))}
        </Box>
    );
};

export default AddonPanels;
