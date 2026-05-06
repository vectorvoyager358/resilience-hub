import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import PublicRoute from './PublicRoute';

const mockUseAuth = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('PublicRoute', () => {
  it('renders children when not authenticated', () => {
    mockUseAuth.mockReturnValue({ currentUser: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <div>login-form</div>
              </PublicRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('login-form')).toBeInTheDocument();
  });

  it('redirects verified users to /dashboard', () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      currentUser: { emailVerified: true },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/dashboard" element={<div>dashboard</div>} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <div>login-form</div>
              </PublicRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('redirects unverified users to /verify-email by default', () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      currentUser: { emailVerified: false },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/verify-email" element={<div>verify</div>} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <div>login-form</div>
              </PublicRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('verify')).toBeInTheDocument();
  });

  it('does not redirect unverified users when redirectUnverified=false', () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      currentUser: { emailVerified: false },
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route
            path="/register"
            element={
              <PublicRoute redirectUnverified={false}>
                <div>register-form</div>
              </PublicRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('register-form')).toBeInTheDocument();
  });
});

