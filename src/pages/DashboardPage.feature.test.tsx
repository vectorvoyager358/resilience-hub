import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks ---
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const updateChallengesMock = vi.fn();
const updateDailyNotesMock = vi.fn();
const createUserDocumentMock = vi.fn();
vi.mock('../services/firestore', () => ({
  getUserData: vi.fn(),
  updateChallenges: (...args: unknown[]) => updateChallengesMock(...args),
  updateDailyNotes: (...args: unknown[]) => updateDailyNotesMock(...args),
  createUserDocument: (...args: unknown[]) => createUserDocumentMock(...args),
}));

const upsertChallengeDataMock = vi.fn();
const upsertDailyReflectionMock = vi.fn();
vi.mock('../services/pinecone', () => ({
  upsertChallengeData: (...args: unknown[]) => upsertChallengeDataMock(...args),
  upsertNoteData: vi.fn(),
  upsertDailyReflection: (...args: unknown[]) => upsertDailyReflectionMock(...args),
}));

const tryUpsertToPineconeMock = vi.fn();
const updatePineconeNoteMock = vi.fn();
vi.mock('../utils/api', () => ({
  tryUpsertToPinecone: (...args: unknown[]) => tryUpsertToPineconeMock(...args),
  tryDeleteFromPinecone: vi.fn(),
  deleteFromPinecone: vi.fn(),
  updatePineconeNote: (...args: unknown[]) => updatePineconeNoteMock(...args),
}));

vi.mock('../components/TypingAnimation', () => ({ default: () => null }));
vi.mock('../components/ChatAssistant', () => ({ default: () => null }));
vi.mock('./NotesHistoryPage', () => ({ default: () => null }));
vi.mock('@mui/material/useMediaQuery', () => ({ default: () => false }));

const getDocMock = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ __doc: true })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  updateDoc: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  db: {},
}));

import DashboardPage from './DashboardPage';

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  updateChallengesMock.mockReset();
  updateDailyNotesMock.mockReset();
  createUserDocumentMock.mockReset();
  upsertChallengeDataMock.mockReset();
  upsertDailyReflectionMock.mockReset();
  getDocMock.mockReset();
  tryUpsertToPineconeMock.mockReset();
  updatePineconeNoteMock.mockReset();

  // Avoid dialog validations / alerts breaking tests.
  (globalThis as unknown as { alert: unknown }).alert = vi.fn();
  // jsdom doesn't implement scrollTo; some UI code calls it.
  (globalThis as unknown as { scrollTo: unknown }).scrollTo = vi.fn();

  mockUseAuth.mockReturnValue({
    currentUser: {
      uid: 'u1',
      displayName: 'Test User',
      emailVerified: true,
    },
    loading: false,
    logout: vi.fn(),
  });

  getDocMock.mockResolvedValue({
    exists: () => true,
    data: () => ({
      uid: 'u1',
      name: 'Test User',
      challenges: [],
      dailyNotes: {},
    }),
  });

  tryUpsertToPineconeMock.mockResolvedValue(undefined);
  updatePineconeNoteMock.mockResolvedValue(undefined);
});

describe('DashboardPage (feature regression)', () => {
  it('creates a challenge and persists via updateChallenges', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);

    updateChallengesMock.mockResolvedValue(undefined);
    upsertChallengeDataMock.mockResolvedValue(undefined);

    renderDashboard();

    // Wait for the empty-state CTA and open the dialog
    await userEvent.click(await screen.findByRole('button', { name: /add your first challenge/i }));

    await userEvent.type(screen.getByLabelText(/challenge name/i), 'No Sugar');
    await userEvent.type(screen.getByLabelText(/duration \(days\)/i), '30');

    await userEvent.click(screen.getByRole('button', { name: /^add challenge$/i }));

    expect(updateChallengesMock).toHaveBeenCalledTimes(1);
    const [uid, challenges] = updateChallengesMock.mock.calls[0];
    expect(uid).toBe('u1');
    expect(Array.isArray(challenges)).toBe(true);
    expect(challenges).toHaveLength(1);
    expect(challenges[0]).toEqual(
      expect.objectContaining({
        id: '12345',
        name: 'No Sugar',
        duration: 30,
        cadence: 'daily',
        completedDays: 0,
      })
    );
    expect(upsertChallengeDataMock).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ name: 'No Sugar', duration: 30 })
    );
  });

  it("saves today's reflection and persists via updateDailyNotes", async () => {

    updateDailyNotesMock.mockResolvedValue(undefined);
    upsertDailyReflectionMock.mockResolvedValue(undefined);

    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /add your reflection for today/i }));

    const textbox = screen.getByPlaceholderText(/how was your day/i);
    await userEvent.type(textbox, 'Felt good. Stayed consistent.');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(updateDailyNotesMock).toHaveBeenCalledTimes(1);
    const [uid, notesObj] = updateDailyNotesMock.mock.calls[0];
    expect(uid).toBe('u1');
    expect(Object.values(notesObj)).toContain('Felt good. Stayed consistent.');
    expect(upsertDailyReflectionMock).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      'Felt good. Stayed consistent.'
    );
  });

  it('marks today complete by saving a challenge note and persisting via updateChallenges', async () => {
    const startDate = new Date().toISOString();
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'u1',
        name: 'Test User',
        challenges: [
          {
            id: 'c1',
            name: 'No Sugar',
            duration: 30,
            startDate,
            completedDays: 0,
            notes: {},
          },
        ],
        dailyNotes: {},
      }),
    });

    updateChallengesMock.mockResolvedValue(undefined);

    renderDashboard();

    const noteBox = await screen.findByPlaceholderText(/add a note/i);
    await userEvent.type(noteBox, 'Did not eat sweets today');

    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));

    expect(updateChallengesMock).toHaveBeenCalledTimes(1);
    const [, challenges] = updateChallengesMock.mock.calls[0];
    expect(challenges[0].notes).toEqual(
      expect.objectContaining({
        '1': expect.objectContaining({ content: 'Did not eat sweets today' }),
      })
    );
  });

  it("edits today's note and calls updatePineconeNote", async () => {
    const startDate = new Date().toISOString();
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'u1',
        name: 'Test User',
        challenges: [
          {
            id: 'c1',
            name: 'No Sugar',
            duration: 30,
            startDate,
            completedDays: 1,
            notes: {
              '1': { content: 'Old note', vectorId: 'vid-1' },
            },
          },
        ],
        dailyNotes: {},
      }),
    });

    updateChallengesMock.mockResolvedValue(undefined);
    updatePineconeNoteMock.mockResolvedValue({ status: 'success', message: 'ok', vectorId: 'vid-2' });

    renderDashboard();

    // Click the "edit today's note" icon button on the challenge card
    await userEvent.click(await screen.findByLabelText(/edit today's note/i));

    const editBox = await screen.findByLabelText(/edit note/i, { selector: 'textarea,input' }).catch(async () => {
      // Dialog uses a TextField without label; fall back to placeholder
      return await screen.findByDisplayValue(/old note/i);
    });
    await userEvent.clear(editBox as HTMLInputElement);
    await userEvent.type(editBox as HTMLInputElement, 'New note');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(updatePineconeNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        type: 'note',
        content: 'New note',
        oldVectorId: 'vid-1',
      })
    );
  });

  it('resets all challenges via the menu action', async () => {
    updateChallengesMock.mockResolvedValue(undefined);

    renderDashboard();

    // Open floating menu (Fab has MenuIcon inside)
    const menuFab = (await screen.findByTestId('MenuIcon')).closest('button');
    expect(menuFab).toBeTruthy();
    await userEvent.click(menuFab!);

    await userEvent.click(await screen.findByText('Reset All Challenges'));

    await userEvent.click(await screen.findByRole('button', { name: 'Reset All Challenges' }));

    expect(updateChallengesMock).toHaveBeenCalledWith('u1', []);
  });

  it('deletes all daily reflection notes via the menu action', async () => {
    updateDailyNotesMock.mockResolvedValue(undefined);

    renderDashboard();

    const menuFab = (await screen.findByTestId('MenuIcon')).closest('button');
    expect(menuFab).toBeTruthy();
    await userEvent.click(menuFab!);

    await userEvent.click(await screen.findByText('Delete All Daily Reflection Notes'));

    await userEvent.click(await screen.findByRole('button', { name: /delete all notes/i }));

    expect(updateDailyNotesMock).toHaveBeenCalledWith('u1', {});
  });
});

