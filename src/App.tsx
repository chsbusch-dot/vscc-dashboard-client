import { useCallback, useMemo, useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import AppLayout from './components/AppLayout';
import { DashboardProvider } from './data/DashboardContext';
import { ColorModeContext, readColorMode, writeColorMode, type ColorMode } from './utils/colorMode';

function App() {
  const [mode, setMode] = useState<ColorMode>(readColorMode);
  const toggle = useCallback(() => {
    setMode(m => {
      const next = m === 'dark' ? 'light' : 'dark';
      writeColorMode(next);
      return next;
    });
  }, []);
  const colorMode = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? '#90caf9' : '#1976d2',
      },
    },
  }), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <DashboardProvider>
          <AppLayout />
        </DashboardProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export default App;
