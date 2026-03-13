import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import AppLayout from './components/AppLayout';
import { DashboardProvider } from './data/DashboardContext';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DashboardProvider>
        <AppLayout />
      </DashboardProvider>
    </ThemeProvider>
  );
}

export default App;
