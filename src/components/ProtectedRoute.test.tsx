import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from './ProtectedRoute';

const mockUseAuth = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

describe('ProtectedRoute', () => {
  it('redirects to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ currentUser: null, loading: false });

    const ui = (
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>login</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    render(ui);
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('redirects to /verify-email when email is not verified', () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      currentUser: { emailVerified: false },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/verify-email" element={<div>verify</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('verify')).toBeInTheDocument();
  });

  it('renders children when authenticated and verified', () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      currentUser: { emailVerified: true },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});

