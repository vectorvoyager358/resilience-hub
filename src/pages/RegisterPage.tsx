import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Box,
  Alert,
  Avatar,
  CircularProgress,
  InputAdornment,
  IconButton
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useAuth } from '../contexts/AuthContext';
import { createUserDocument } from '../services/firestore';
import { User } from '../types';

const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({
    length: true,
    uppercase: true,
    lowercase: true,
    number: true,
    special: true
  });
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  
  const navigate = useNavigate();
  const { register } = useAuth();

  // Password validation function
  const validatePassword = (password: string) => {
    const errors = {
      length: password.length < 8,
      uppercase: !/[A-Z]/.test(password),
      lowercase: !/[a-z]/.test(password),
      number: !/[0-9]/.test(password),
      special: !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    setPasswordErrors(errors);
    return !Object.values(errors).some(error => error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    if (!name || !email || !password || !confirmPassword) {
      return setError('Please fill in all fields');
    }
    
    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    
    if (!validatePassword(password)) {
      return setError('Password does not meet requirements');
    }
    
    try {
      setError('');
      setLoading(true);
      const user = await register(email, password, name);
      console.log("Registration successful:", user);
      
      // Create initial user data in Firestore
      const userData: User = {
        uid: user.uid,
        name,
        challenges: [],
        dailyNotes: {}
      };
      
      await createUserDocument(user.uid, userData);

      navigate('/verify-email', { replace: true });
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error("Registration error:", err);
      setError(
        err.code === 'auth/email-already-in-use' ? 'Email is already in use' :
        err.code === 'auth/invalid-email' ? 'Invalid email address' :
        err.code === 'auth/weak-password' ? 'Password is too weak' :
        'Failed to create account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Update password validation on change
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    validatePassword(newPassword);
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
                  bgcolor: '#ff9f1c' 
                }}
              >
                <PersonAddIcon fontSize="large" />
              </Avatar>
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
                Create Account
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Join Resilience Hub and start building healthy habits
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="name"
                label="Name"
                name="name"
                placeholder="Challenger name please!"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 20))}
                inputProps={{ maxLength: 20 }}
                helperText={`${name.length}/20 characters`}
                autoFocus
              />
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
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
                autoComplete="new-password"
                value={password}
                onChange={handlePasswordChange}
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
                error={password.length > 0 && Object.values(passwordErrors).some(error => error)}
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
              />
              
              {isPasswordFocused && (
                <Box sx={{ mt: 1, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Password must contain:
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    <Typography variant="caption" component="li" color={passwordErrors.length ? "error.main" : "success.main"}>
                      At least 8 characters
                    </Typography>
                    <Typography variant="caption" component="li" color={passwordErrors.uppercase ? "error.main" : "success.main"}>
                      At least one uppercase letter
                    </Typography>
                    <Typography variant="caption" component="li" color={passwordErrors.lowercase ? "error.main" : "success.main"}>
                      At least one lowercase letter
                    </Typography>
                    <Typography variant="caption" component="li" color={passwordErrors.number ? "error.main" : "success.main"}>
                      At least one number
                    </Typography>
                    <Typography variant="caption" component="li" color={passwordErrors.special ? "error.main" : "success.main"}>
                      At least one special character
                    </Typography>
                  </Box>
                </Box>
              )}

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
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
                  bgcolor: '#ff9f1c',
                  '&:hover': {
                    bgcolor: '#f9844a'
                  },
                  position: 'relative'
                }}
              >
                {loading ? (
                  <CircularProgress size={24} sx={{ color: '#fff' }} />
                ) : (
                  'Sign Up'
                )}
              </Button>
              
              <Grid container justifyContent="center">
                <Grid item>
                  <Button 
                    component={Link} 
                    to="/login" 
                    variant="text" 
                    size="small"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    Already have an account? Sign In
                  </Button>
                </Grid>
              </Grid>
            </Box>
      </Paper>
    </Container>
  );
};

export default RegisterPage; 