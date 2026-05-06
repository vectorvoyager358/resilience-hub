import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// We mock navigate so we can assert on redirects without relying on Router internals.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const loginMock = vi.fn();
const resetPasswordMock = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    resetPassword: resetPasswordMock,
  }),
}));

import LoginPage from './LoginPage';

describe('LoginPage', () => {
  it('navigates to /dashboard after successful login', async () => {
    loginMock.mockResolvedValue({
      user: { displayName: 'Test User' },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'password123');

    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});

