import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Box, 
  Button, 
  Container, 
  Typography, 
  Paper,
  Avatar,
  Grid,
  CircularProgress,
  Alert
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import auth from '../services/firebase';

const WelcomePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if Firebase is initialized correctly
    try {
      if (!auth) {
        throw new Error('Firebase Authentication is not initialized');
      }
      setLoading(false);
    } catch (err) {
      console.error('Firebase initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize Firebase');
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Typography variant="body1" color="text.secondary">
          Please check your Firebase configuration and try again.
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ 
        position: 'relative',
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        py: 6,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(100%, 520px)',
          height: 140,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(46, 196, 182, 0.12) 0%, transparent 72%)',
          zIndex: 0,
        },
      }}>
        <Paper 
          elevation={3} 
          sx={{ 
            position: 'relative',
            zIndex: 1,
            p: { xs: 3, sm: 4, md: 5 }, 
            borderRadius: 3, 
            width: '100%',
            background: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(245,248,255,1) 100%)'
          }}
        >
          <Grid container spacing={4} alignItems="center" justifyContent="center">
            <Grid item xs={12} sm={11} md={9}>
              <Box sx={{ mb: 0, textAlign: 'center' }}>
                <Avatar 
                  sx={{ 
                    width: 64, 
                    height: 64, 
                    bgcolor: '#2ec4b6',
                    mb: 2,
                    mx: 'auto'
                  }}
                >
                  <LocalFireDepartmentIcon sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography
                  component="p"
                  sx={{
                    m: 0,
                    mb: 1.25,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.28em',
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                  }}
                >
                  Habits · Growth · Balance
                </Typography>
                <Typography 
                  variant="h4" 
                  component="h1" 
                  gutterBottom
                  sx={{ 
                    fontWeight: 700,
                    background: 'linear-gradient(90deg, #2ec4b6, #ff9f1c)',
                    backgroundClip: 'text',
                    textFillColor: 'transparent',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}
                >
                  Resilience Hub
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 480, mx: 'auto', lineHeight: 1.7 }}>
                  Build healthy habits, track your progress, and become your best self through the power of consistency.
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 2,
                  }}
                >
                  <Button 
                    variant="contained" 
                    size="large"
                    component={Link}
                    to="/register"
                    sx={{ 
                      py: 1.5, 
                      px: 3,
                      minWidth: 160,
                      bgcolor: '#2ec4b6',
                      '&:hover': {
                        bgcolor: '#2a9d8f'
                      }
                    }}
                  >
                    Create Account
                  </Button>
                  <Button 
                    variant="outlined" 
                    size="large"
                    component={Link}
                    to="/login"
                    sx={{ 
                      py: 1.5, 
                      px: 3,
                      minWidth: 160,
                      borderColor: '#ff9f1c',
                      color: '#ff9f1c',
                      '&:hover': {
                        borderColor: '#f9844a',
                        bgcolor: 'rgba(249, 132, 74, 0.04)'
                      }
                    }}
                  >
                    Sign In
                  </Button>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </Container>
  );
};

export default WelcomePage; 