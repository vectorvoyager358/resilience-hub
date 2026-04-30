/* React is imported for JSX transformation - required even if not explicitly used */
import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CircularProgress, Box, Typography } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';

// Lazy load pages
const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const NotesHistoryPage = lazy(() => import('./pages/NotesHistoryPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));

// Loading component for suspense fallback
const PageLoader = () => (
  <Box 
    display="flex" 
    justifyContent="center" 
    alignItems="center" 
    minHeight="100vh"
    flexDirection="column"
    gap={2}
  >
    <CircularProgress />
    <Typography>Loading page...</Typography>
  </Box>
);

// Create a theme instance
const theme = createTheme({
  palette: {
    primary: {
      main: '#2ec4b6',
    },
    secondary: {
      main: '#ff9f1c',
    },
    error: {
      main: '#e76f51',
    },
    background: {
      default: '#f7f9fc',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
  },
});

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Verify required environment variables
      const requiredEnvVars = [
        'VITE_FIREBASE_API_KEY',
        'VITE_FIREBASE_AUTH_DOMAIN',
        'VITE_FIREBASE_PROJECT_ID'
      ];

      const missingEnvVars = requiredEnvVars.filter(
        varName => !import.meta.env[varName]
      );

      if (missingEnvVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
      }

      // Log Firebase config for debugging
      console.log('Firebase Config:', {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.slice(0, 5) + '...',
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID
      });

      setIsLoading(false);
    } catch (err) {
      console.error('Error initializing app:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize application');
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
        flexDirection="column"
        gap={2}
      >
        <CircularProgress />
        <Typography>Loading application...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
        flexDirection="column"
        gap={2}
        p={3}
      >
        <Typography variant="h5" color="error">Error Initializing Application</Typography>
        <Typography color="text.secondary" align="center">{error}</Typography>
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Authentication Routes - Redirect to dashboard if already logged in */}
              <Route path="/login" element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              } />
              <Route path="/register" element={
                <PublicRoute redirectUnverified={false}>
                  <RegisterPage />
                </PublicRoute>
              } />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              
              {/* Protected Routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              } />
              <Route path="/notes-history" element={
                <ProtectedRoute>
                  <NotesHistoryPage />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } />
              
              {/* Unprotected Welcome Page - also redirect to dashboard if logged in */}
              <Route path="/" element={
                <PublicRoute>
                  <WelcomePage />
                </PublicRoute>
              } />
              
              {/* Default redirect to home */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App; 