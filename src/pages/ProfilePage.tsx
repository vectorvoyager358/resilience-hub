import React, { useMemo, useState } from 'react';
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
  InputAdornment,
  IconButton
} from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
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

  const profileInitials = useMemo(() => {
    const name = currentUser?.displayName?.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [currentUser?.displayName]);
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
      } catch (error) {
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
    } catch (error) {
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

  const fieldShellSx = {
    p: { xs: 2, sm: 2.5 },
    borderRadius: 3,
    border: '1px solid',
    borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.12),
    bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.04),
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    '&:hover': {
      borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.22),
      boxShadow: (t: Theme) => `0 12px 40px ${alpha(t.palette.common.black, 0.06)}`,
    },
  };

  const iconWrapSx = {
    width: 44,
    height: 44,
    borderRadius: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.12),
    color: 'primary.main',
  };

  return (
    <Box
      sx={{
        minHeight: { xs: 'calc(100vh - 32px)', sm: '85vh' },
        py: { xs: 3, sm: 5 },
        px: { xs: 1, sm: 2 },
        background: (t) =>
          `radial-gradient(1200px 600px at 50% -10%, ${alpha(t.palette.primary.main, 0.14)}, transparent 55%),
           radial-gradient(900px 500px at 100% 30%, ${alpha(t.palette.secondary.main, 0.08)}, transparent 50%),
           linear-gradient(180deg, ${t.palette.grey[50]} 0%, ${alpha(t.palette.primary.main, 0.03)} 100%)`,
      }}
    >
      <Container maxWidth="sm" sx={{ display: 'flex', justifyContent: 'center' }}>
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 440,
            borderRadius: 4,
            overflow: 'hidden',
            position: 'relative',
            border: '1px solid',
            borderColor: (t) => alpha(t.palette.divider, 0.6),
            boxShadow: (t) => `0 24px 64px ${alpha(t.palette.common.black, 0.08)}`,
            bgcolor: (t) => alpha(t.palette.background.paper, 0.92),
            backdropFilter: 'blur(12px)',
          }}
        >
          <Box
            sx={{
              height: 4,
              width: '100%',
              background: (t) =>
                `linear-gradient(90deg, ${t.palette.primary.main} 0%, ${t.palette.secondary.main} 100%)`,
            }}
          />

          <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 1 }}>
            <IconButton
              onClick={() => navigate('/dashboard')}
              aria-label="Back to dashboard"
              sx={{
                color: 'text.secondary',
                bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
                '&:hover': {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
                  color: 'primary.main',
                },
              }}
              size="small"
            >
              <ArrowBackIosNewIcon sx={{ fontSize: 16, ml: 0.25 }} />
            </IconButton>
          </Box>

          <Box
            sx={{
              px: { xs: 2.5, sm: 3.5 },
              pt: 0.5,
              pb: 2.5,
              textAlign: 'center',
            }}
          >
            <Box
              sx={{
                display: 'inline-flex',
                p: '3px',
                borderRadius: '50%',
                background: (t) =>
                  `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.secondary.main})`,
                boxShadow: (t) => `0 12px 32px ${alpha(t.palette.primary.main, 0.35)}`,
                mb: 2,
              }}
            >
              <Avatar
                src={currentUser?.photoURL || undefined}
                alt=""
                sx={{
                  width: 88,
                  height: 88,
                  fontSize: 32,
                  fontWeight: 700,
                  bgcolor: 'background.paper',
                  color: 'primary.main',
                  border: '3px solid',
                  borderColor: 'background.paper',
                }}
              >
                {!currentUser?.photoURL ? profileInitials : null}
              </Avatar>
            </Box>

            <Typography
              variant="overline"
              sx={{
                letterSpacing: 2,
                color: 'text.secondary',
                fontWeight: 600,
                display: 'block',
                mb: 0.5,
              }}
            >
              Account
            </Typography>
            <Typography variant="h4" component="h1" fontWeight={800} sx={{ letterSpacing: -0.5, mb: 0.5 }}>
              Your profile
            </Typography>
          </Box>

          <Stack spacing={2} sx={{ px: { xs: 2, sm: 3 }, pb: 3 }}>
            {error && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {success}
              </Alert>
            )}

            <Box sx={fieldShellSx}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box sx={iconWrapSx}>
                  <AccountCircleIcon sx={{ fontSize: 22 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Name
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 0.25 }}>
                    {currentUser?.displayName || '—'}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => setOpenNameDialog(true)}
                  aria-label="Edit name"
                  sx={{
                    color: 'primary.main',
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                    '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.2) },
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>

            <Box sx={fieldShellSx}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={iconWrapSx}>
                  <EmailIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Email
                  </Typography>
                  <Typography
                    variant="subtitle1"
                    fontWeight={700}
                    sx={{ mt: 0.25, wordBreak: 'break-word', lineHeight: 1.45 }}
                  >
                    {currentUser?.email || '—'}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Box sx={fieldShellSx}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'nowrap' }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={iconWrapSx}>
                    <LockIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      Password
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 0.25, letterSpacing: 3 }}>
                      ••••••••
                    </Typography>
                  </Box>
                </Stack>
                <Button
                  variant="contained"
                  onClick={() => setOpenPasswordDialog(true)}
                  aria-label="Change password"
                  sx={{
                    flexShrink: 0,
                    width: 'auto',
                    minWidth: { sm: 168 },
                    px: { xs: 1.5, sm: 2.5 },
                    py: { xs: 0.65, sm: 1.25 },
                    minHeight: { xs: 40, sm: 42 },
                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                    whiteSpace: 'nowrap',
                    borderRadius: 2,
                    boxShadow: (t) => `0 8px 24px ${alpha(t.palette.primary.main, 0.35)}`,
                    background: (t) =>
                      `linear-gradient(135deg, ${t.palette.primary.main} 0%, ${alpha(t.palette.primary.dark, 0.95)} 100%)`,
                    '&:hover': {
                      boxShadow: (t) => `0 12px 28px ${alpha(t.palette.primary.main, 0.45)}`,
                    },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                    Change
                  </Box>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Change password
                  </Box>
                </Button>
              </Stack>
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
    </Box>
  );
};

export default ProfilePage; 