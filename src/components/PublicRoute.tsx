import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CircularProgress, Box } from '@mui/material';

interface PublicRouteProps {
  children: React.ReactNode;
  /**
   * If true (default), signed-in users with unverified email are sent to /verify-email.
   * Set false for /register so signup can finish Firestore setup before navigating.
   */
  redirectUnverified?: boolean;
}

/**
 * PublicRoute component to handle authentication redirection for public pages
 * If user is already authenticated and verified, redirect to dashboard
 * Otherwise, render the children (login/register pages)
 */
const PublicRoute: React.FC<PublicRouteProps> = ({
  children,
  redirectUnverified = true,
}) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh' 
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (currentUser) {
    if (!currentUser.emailVerified && redirectUnverified) {
      return <Navigate to="/verify-email" replace />;
    }
    if (currentUser.emailVerified) {
      console.log('User already authenticated, redirecting to dashboard');
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

export default PublicRoute; 