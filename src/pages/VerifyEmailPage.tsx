import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';

function messageForResendError(err: unknown): string {
  const code =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : null;
  switch (code) {
    case 'auth/too-many-requests':
      return 'Firebase has temporarily limited verification emails for this account or device. Wait 15–60 minutes, then try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Could not send email. Try again in a few minutes.';
  }
}

const VerifyEmailPage: React.FC = () => {
  const { currentUser, loading, sendVerificationEmail, refreshAuthUser, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.emailVerified) {
    return <Navigate to="/dashboard" replace />;
  }

  const email = currentUser.email ?? '';

  const handleResend = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await sendVerificationEmail();
      setMessage({ type: 'success', text: 'Verification email sent. Check your inbox.' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: messageForResendError(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await refreshAuthUser();
      if (auth.currentUser?.emailVerified) {
        window.location.href = '/dashboard';
        return;
      }
      setMessage({
        type: 'error',
        text: 'Email not verified yet. Open the link in the email we sent, then try again.',
      });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Could not refresh your account. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
        <Box display="flex" flexDirection="column" alignItems="center" gap={2} mb={2}>
          <MarkEmailReadIcon color="primary" sx={{ fontSize: 48 }} />
          <Typography variant="h5" component="h1" fontWeight={600} textAlign="center">
            Verify your email
          </Typography>
          <Typography color="text.secondary" textAlign="center">
            We sent a link to <strong>{email}</strong>. Click it to activate your account, then use
            the button below to continue.
          </Typography>
        </Box>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }}>
            {message.text}
          </Alert>
        )}

        <TextField label="Email" value={email} fullWidth margin="normal" disabled sx={{ mb: 2 }} />

        <Box display="flex" flexDirection="column" gap={1.5}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            fullWidth
            disabled={busy}
            onClick={handleContinue}
          >
            {busy ? <CircularProgress size={24} color="inherit" /> : 'I’ve verified — continue'}
          </Button>
          <Button variant="outlined" fullWidth disabled={busy} onClick={handleResend}>
            Resend verification email
          </Button>
          <Button color="inherit" fullWidth disabled={busy} onClick={() => logout()}>
            Sign out
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default VerifyEmailPage;
