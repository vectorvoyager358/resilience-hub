import React, { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Stack,
  Divider,
  InputAdornment,
  IconButton
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockIcon from '@mui/icons-material/Lock';
import EmailIcon from '@mui/icons-material/Email';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { EmailAuthProvider, reauthenticateWithCredential, updateProfile } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { updateUserData, getUserData } from '../services/firestore';
import { upsertChallengeData } from '../services/pinecone';
import { useNavigate } from 'react-router-dom';

const ProfilePage: React.FC = () => {
  const { currentUser, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
  const [openNameDialog, setOpenNameDialog] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [newName, setNewName] = useState(currentUser?.displayName || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({
    length: true,
    uppercase: true,
    lowercase: true,
    number: true,
    special: true
  });
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

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

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPass = e.target.value;
    setNewPassword(newPass);
    validatePassword(newPass);
  };

  const handleUpdatePassword = async () => {
    if (!currentUser) return;

    // Reset states
    setError('');
    setSuccess('');

    // Validate inputs
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (oldPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    if (!validatePassword(newPassword)) {
      setError('New password does not meet requirements');
      return;
    }

    try {
      setLoading(true);
      
      // First verify the old password by attempting to reauthenticate
      try {
        const credential = EmailAuthProvider.credential(currentUser.email!, oldPassword);
        await reauthenticateWithCredential(currentUser, credential);
      } catch {
        setError('Current password is incorrect');
        setLoading(false);
        return;
      }

      // If reauthentication successful, update the password
      await updatePassword(newPassword);
      
      setSuccess('Password updated successfully');
      setOpenPasswordDialog(false);
      // Clear form
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setError('Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (!currentUser || !newName.trim()) return;

    try {
      setLoading(true);
      setError('');
      
      // Update display name in Firebase Auth
      await updateProfile(currentUser, {
        displayName: newName.trim()
      });

      // Update name in Firestore
      await updateUserData(currentUser.uid, { name: newName.trim() });

      setSuccess('Name updated successfully');
      setOpenNameDialog(false);

      // --- Pinecone: upsert all challenges with new name ---
      try {
        const latestUserData = await getUserData(currentUser.uid);
        if (latestUserData && latestUserData.challenges) {
          for (const challenge of latestUserData.challenges) {
            await upsertChallengeData(currentUser.uid, challenge);
          }
          console.log('[PINECONE][UPSERT] All challenges updated after name change.');
        }
      } catch (pineconeError) {
        console.error('[PINECONE][UPSERT] Error updating Pinecone after name change:', pineconeError);
      }
      // -----------------------------------------------------
    } catch (error) {
      console.error('Error updating name:', error);
      setError('Failed to update name. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 6, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Paper 
        elevation={6} 
        sx={{ 
          p: { xs: 2, sm: 4 }, 
          borderRadius: 4,
          maxWidth: 480,
          width: '100%',
          mx: 'auto',
          boxShadow: '0 8px 32px 0 rgba(46,196,182,0.10)',
          background: 'linear-gradient(135deg, #f8fafc 0%, #e3f6f5 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {/* Back Button */}
        <IconButton
          onClick={() => navigate('/dashboard')}
          sx={{
            position: 'absolute',
            top: 18,
            left: 18,
            bgcolor: 'white',
            color: 'primary.main',
            border: '2px solid',
            borderColor: 'primary.main',
            boxShadow: '0 1px 4px 0 rgba(46,196,182,0.10)',
            transition: 'all 0.2s',
            '&:hover': {
              bgcolor: 'primary.main',
              color: 'white',
              borderColor: 'primary.main',
            },
            zIndex: 2,
          }}
          size="small"
        >
          <ArrowBackIosNewIcon fontSize="small" />
        </IconButton>
        <Box sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mb: 3,
        }}>
          <Box sx={{
            background: 'linear-gradient(135deg, #2ec4b6 0%, #ff9f1c 100%)',
            borderRadius: '50%',
            p: 0.5,
            mb: 1.2,
            boxShadow: '0 4px 16px 0 rgba(46,196,182,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Avatar 
              sx={{ 
                width: 64, 
                height: 64, 
                bgcolor: 'white',
                color: '#2ec4b6',
                border: '3px solid #2ec4b6',
                fontSize: 36,
              }}
            >
              <AccountCircleIcon sx={{ fontSize: 40 }} />
            </Avatar>
          </Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom sx={{ color: '#222', mb: 0 }}>
            Profile
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2, width: '100%' }}>
            {success}
          </Alert>
        )}

        <Stack spacing={0} sx={{ width: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
            <AccountCircleIcon color="primary" sx={{ fontSize: 28 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Name</Typography>
              <Typography variant="h6" fontWeight={600}>{currentUser?.displayName || '—'}</Typography>
            </Box>
            <IconButton 
              size="small" 
              onClick={() => setOpenNameDialog(true)}
              sx={{
                bgcolor: 'white',
                color: 'primary.main',
                border: '2px solid',
                borderColor: 'primary.main',
                boxShadow: '0 1px 4px 0 rgba(46,196,182,0.10)',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: 'primary.main',
                  color: 'white',
                  borderColor: 'primary.main',
                },
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
            <EmailIcon color="primary" sx={{ fontSize: 28 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Email</Typography>
              <Typography variant="h6" fontWeight={600}>{currentUser?.email || '—'}</Typography>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
            <LockIcon color="primary" sx={{ fontSize: 28 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Password</Typography>
              <Typography variant="h6" fontWeight={600} sx={{ letterSpacing: 2 }}>••••••••</Typography>
            </Box>
            <Button
              variant="outlined"
              onClick={() => setOpenPasswordDialog(true)}
              sx={{
                borderRadius: 2,
                fontWeight: 600,
                borderColor: 'primary.main',
                color: 'primary.main',
                px: 2.5,
                '&:hover': {
                  bgcolor: 'primary.main',
                  color: 'white',
                  borderColor: 'primary.main',
                },
                transition: 'all 0.2s',
              }}
            >
              Change Password
            </Button>
          </Box>
        </Stack>

        {/* Name Update Dialog */}
        <Dialog 
          open={openNameDialog} 
          onClose={() => setOpenNameDialog(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 3 }
          }}
        >
          <DialogTitle>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <AccountCircleIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>
                Update Name
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2 }}>
              <TextField
                autoFocus
                margin="normal"
                required
                fullWidth
                label="New Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value.slice(0, 20))}
                inputProps={{ maxLength: 20 }}
                helperText={`${newName.length}/20 characters`}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button 
              onClick={() => {
                setOpenNameDialog(false);
                setNewName(currentUser?.displayName || '');
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateName}
              variant="contained"
              disabled={loading || !newName.trim() || newName === currentUser?.displayName}
            >
              {loading ? <CircularProgress size={24} /> : 'Update Name'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Password Update Dialog */}
        <Dialog 
          open={openPasswordDialog} 
          onClose={() => setOpenPasswordDialog(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 3 }
          }}
        >
          <DialogTitle>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <LockIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>
                Update Password
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Current Password"
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowOldPassword(!showOldPassword)}
                        edge="end"
                      >
                        {showOldPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="New Password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={handlePasswordChange}
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        edge="end"
                      >
                        {showNewPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              {isPasswordFocused && (
                <Box sx={{ mt: 1 }}>
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
                fullWidth
                label="Confirm New Password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button 
              onClick={() => {
                setOpenPasswordDialog(false);
                setOldPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdatePassword}
              variant="contained"
              disabled={loading || !oldPassword || !newPassword || !confirmNewPassword}
            >
              {loading ? <CircularProgress size={24} /> : 'Update Password'}
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
};

export default ProfilePage; 