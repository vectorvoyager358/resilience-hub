import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Avatar,
  CircularProgress,
  InputAdornment,
  IconButton
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const navigate = useNavigate();
  const { login, resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      return setError('Please enter both email and password');
    }
    
    try {
      setError('');
      setLoading(true);
      
      try {
        const user = await login(email, password);
        console.log("Login successful, redirecting to dashboard...", user);
      
        // Ensure proper user data in localStorage
        let userData = localStorage.getItem('userData');
        if (!userData) {
          // Create default user data if it doesn't exist
          userData = JSON.stringify({
            name: user.user.displayName || email.split('@')[0],
            challenges: [],
            dailyNotes: {}
          });
          localStorage.setItem('userData', userData);
        }
      
        // Force navigation to dashboard
        window.location.href = '/dashboard';
        
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'email-not-verified') {
          navigate('/verify-email', { replace: true });
          return;
        }
        
        throw error;
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(
        err.code === 'auth/user-not-found' ? 'No account found with this email' :
        err.code === 'auth/wrong-password' ? 'Incorrect password' :
        err.code === 'auth/invalid-credential' ? 'Invalid email or password' :
        'Failed to sign in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      return setError('Please enter your email address');
    }
    
    try {
      setError('');
      setLoading(true);
      await resetPassword(email);
      console.log("Password reset email sent to:", email);
      setResetSent(true);
      
      // Show success message but don't reset the form
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(
        err.code === 'auth/user-not-found' ? 'No account found with this email' :
        err.code === 'auth/invalid-email' ? 'Invalid email format' :
        'Failed to send reset email. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      py: 8
    }}>
      <Paper 
        elevation={3} 
        sx={{ 
          p: { xs: 3, sm: 4 }, 
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(245,248,255,1) 100%)'
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Avatar 
            sx={{ 
              mx: 'auto', 
              mb: 2, 
              width: 56, 
              height: 56, 
              bgcolor: '#2ec4b6' 
            }}
          >
            <LocalFireDepartmentIcon fontSize="large" />
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
            variant="h5" 
            component="h1" 
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Sign in to continue your journey
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {resetSent && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
            Password reset link has been sent to <strong>{email}</strong>. 
            Please check your inbox and follow the instructions to reset your password.
            If you don&apos;t see the email, check your spam folder.
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />
          
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{ 
              mt: 2, 
              mb: 2, 
              py: 1.5,
              bgcolor: '#2ec4b6',
              '&:hover': {
                bgcolor: '#2a9d8f'
              },
              position: 'relative'
            }}
          >
            {loading ? (
              <CircularProgress size={24} sx={{ color: '#fff' }} />
            ) : (
              'Sign In'
            )}
          </Button>
          
          <Box 
            sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: { xs: 2, sm: 0 },
              mt: 2
            }}
          >
            <Button
              onClick={handleForgotPassword}
              sx={{
                color: '#2ec4b6',
                textTransform: 'none',
                '&:hover': {
                  bgcolor: 'rgba(46, 196, 182, 0.08)'
                }
              }}
            >
              Forgot password?
            </Button>
            <Button
              component={Link}
              to="/register"
              sx={{
                color: '#2ec4b6',
                textTransform: 'none',
                '&:hover': {
                  bgcolor: 'rgba(46, 196, 182, 0.08)'
                }
              }}
            >
              Don&apos;t have an account? Sign Up
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default LoginPage; 