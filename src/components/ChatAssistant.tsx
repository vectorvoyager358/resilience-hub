import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  Avatar,
  Fab,
  Zoom,
  Slide,
  Divider,
  CircularProgress,
  Button,
  Tooltip,
  InputAdornment,
  Snackbar,
  Alert,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import type { Challenge, ChatAssistantProps, User } from '../types';
import { isChallengePastCalendarDuration } from '../utils/challengeProgress';
import { apiUrl } from '../utils/apiBase';
import { auth } from '../services/firebase';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

const CHAT_STORAGE_VERSION = 1;

function chatStorageKey(uid: string): string {
  return `resilience-hub-assistant-chat:v${CHAT_STORAGE_VERSION}:${uid}`;
}

type PersistedMessage = Omit<Message, 'timestamp'> & { timestamp: string };

interface PersistedChatPayload {
  v: typeof CHAT_STORAGE_VERSION;
  open: boolean;
  messages: PersistedMessage[];
}

function parseStoredMessages(data: unknown): Message[] {
  if (!Array.isArray(data)) return [];
  const out: Message[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== 'string' || typeof m.content !== 'string') continue;
    if (m.sender !== 'user' && m.sender !== 'assistant') continue;
    const ts = m.timestamp;
    const d =
      typeof ts === 'string'
        ? new Date(ts)
        : ts instanceof Date
          ? ts
          : new Date(NaN);
    if (Number.isNaN(d.getTime())) continue;
    out.push({ id: m.id, content: m.content, sender: m.sender, timestamp: d });
  }
  return out;
}

function loadPersistedChat(uid: string): { open: boolean; messages: Message[] } | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = window.localStorage.getItem(chatStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedChatPayload;
    if (parsed.v !== CHAT_STORAGE_VERSION || typeof parsed.open !== 'boolean') return null;
    if (!Array.isArray(parsed.messages)) return null;
    const messages = parseStoredMessages(parsed.messages);
    return { open: parsed.open, messages };
  } catch {
    return null;
  }
}

// Function to convert markdown to plain text
const convertMarkdownToPlainText = (markdown: string): string => {
  return markdown
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1')     // Italic
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
    .replace(/#{1,6}\s/g, '')       // Headers
    .replace(/`(.*?)`/g, '$1')      // Code
    .replace(/\n\s*[-*+]\s/g, '\n') // Lists
    .replace(/\n\s*\d+\.\s/g, '\n') // Numbered lists
    .trim();
};

/** Matches server `/api/chat-assistant` safety limits; keeps prompts bounded. */
const MAX_MESSAGE_LENGTH = 2000;

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type GreetingPeriod = 'morning' | 'afternoon' | 'evening';

function getGreetingPeriod(now: Date = new Date()): GreetingPeriod {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function greetingFromPeriod(period: GreetingPeriod): string {
  if (period === 'morning') return 'Good morning';
  if (period === 'afternoon') return 'Good afternoon';
  return 'Good evening';
}

function pickRandomUnique(choices: string[], count: number): string[] {
  const pool = [...choices];
  const picked: string[] = [];
  while (pool.length > 0 && picked.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    const [item] = pool.splice(idx, 1);
    if (item) picked.push(item);
  }
  return picked;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ userData }) => {
  const [open, setOpen] = useState(() => loadPersistedChat(userData.uid)?.open ?? false);
  const [messages, setMessages] = useState<Message[]>(
    () => loadPersistedChat(userData.uid)?.messages ?? [],
  );

  useEffect(() => {
    const restored = loadPersistedChat(userData.uid);
    if (restored) {
      setOpen(restored.open);
      setMessages(restored.messages);
    } else {
      setOpen(false);
      setMessages([]);
    }
  }, [userData.uid]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [greetingPeriod, setGreetingPeriod] = useState<GreetingPeriod>(() => getGreetingPeriod());
  const [starterNonce, setStarterNonce] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  /** Ensures only the latest send toggles `isLoading` off (avoids races when aborting). */
  const sendGenerationRef = useRef(0);

  useEffect(
    () => () => {
      fetchAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const syncGreetingPeriod = () => {
      const next = getGreetingPeriod();
      setGreetingPeriod((prev) => (prev === next ? prev : next));
    };

    syncGreetingPeriod();
    const timer = window.setInterval(syncGreetingPeriod, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Generate personalized starter questions based on user's challenges
  const getPersonalizedStarterQuestions = useCallback(() => {
    const defaultQuestions = [
      'How can I stay motivated during my challenge?',
      'What are some tips for building resilience?',
      'How do I handle setbacks in my journey?',
      'What is one tiny action I can take today?',
      'How can I recover quickly after missing a day?',
      'How do I build a routine that actually sticks?',
      'What should I focus on this week to make progress?',
    ];

    const startedChallengePrompts = [
      'What should I do when I feel like skipping a day?',
      'How can I stay consistent when motivation drops?',
      'What should I do if I miss one day without losing momentum?',
      'How can I get back on track after a rough week?',
    ];

    const highProgressPrompts = [
      'How can I maintain my progress long-term?',
      'How do I avoid burnout while doing well?',
      'What can I do to lock in this momentum?',
      'How can I level up from here without overdoing it?',
    ];

    const lowProgressPrompts = [
      'How can I build momentum with my challenges?',
      'How do I restart when progress has been slow?',
      'What is the easiest way to regain consistency?',
      'How can I make this challenge feel less overwhelming?',
    ];

    const completedOnlyPrompts = [
      'What lessons can I take from my completed challenges?',
      'How can I turn completed challenge wins into lasting habits?',
      'What challenge should I start next based on my past progress?',
      'How can I reflect on what worked best for me?',
    ];

    if (!userData?.challenges || userData.challenges.length === 0) {
      return defaultQuestions;
    }

    const activeWindowChallenges = userData.challenges.filter(
      (c) => !isChallengePastCalendarDuration(c),
    );

    const ratio = (c: Challenge) => c.completedDays / Math.max(1, c.duration);

    // Only archived / ended windows: don't suggest named "improve my X challenge" as if ongoing
    if (activeWindowChallenges.length === 0) {
      const starters = pickRandomUnique(completedOnlyPrompts, 2);
      const fallback = pickRandomUnique(
        defaultQuestions.filter((q) => !starters.includes(q)),
        3 - starters.length,
      );
      return [...starters, ...fallback];
    }

    const personalQuestions: string[] = [];

    const randomChallenge =
      activeWindowChallenges[Math.floor(Math.random() * activeWindowChallenges.length)];

    if (randomChallenge) {
      personalQuestions.push(`How can I improve my ${randomChallenge.name} challenge?`);
    }

    const hasStartedChallenges = activeWindowChallenges.some((c) => c.completedDays > 0);
    const hasHighProgressChallenges = activeWindowChallenges.some((c) => ratio(c) >= 0.7);
    const hasLowProgressChallenges = activeWindowChallenges.some(
      (c) => c.completedDays > 0 && ratio(c) < 0.3,
    );

    if (hasStartedChallenges) {
      const startedPick = pickRandomUnique(startedChallengePrompts, 1)[0];
      if (startedPick) personalQuestions.push(startedPick);
    }

    if (hasHighProgressChallenges) {
      const highPick = pickRandomUnique(highProgressPrompts, 1)[0];
      if (highPick) personalQuestions.push(highPick);
    }

    if (hasLowProgressChallenges) {
      const lowPick = pickRandomUnique(lowProgressPrompts, 1)[0];
      if (lowPick) personalQuestions.push(lowPick);
    }

    while (personalQuestions.length < 3) {
      const candidates = defaultQuestions.filter((q) => !personalQuestions.includes(q));
      const next = pickRandomUnique(candidates, 1)[0];
      if (!next) break;
      personalQuestions.push(next);
    }

    return personalQuestions;
  }, [userData?.challenges]);

  const getPersonalizedWelcomeMessage = useCallback(() => {
    const greeting = greetingFromPeriod(greetingPeriod);
    const name = userData?.name || 'there';
    
    let welcomeMessage = `${greeting}, ${name}! I'm your personal resilience assistant.`;
    
    // If user has challenges, add personalized progress info.
    // "Active" matches Dashboard: calendar window not ended (see `isChallengePastCalendarDuration`).
    if (userData?.challenges && userData.challenges.length > 0) {
      const totalChallenges = userData.challenges.length;
      const activeWindowChallenges = userData.challenges.filter(
        (c) => !isChallengePastCalendarDuration(c),
      );

      if (activeWindowChallenges.length > 0) {
        const n = activeWindowChallenges.length;
        welcomeMessage += ` You're working on ${n} active ${n === 1 ? 'challenge' : 'challenges'}.`;

        const ratio = (c: Challenge) => c.completedDays / Math.max(1, c.duration);
        const mostProgressed = [...activeWindowChallenges].sort(
          (a, b) => ratio(b) - ratio(a),
        )[0];

        if (mostProgressed && ratio(mostProgressed) > 0.5) {
          welcomeMessage += ` You're making great progress with your ${mostProgressed.name} challenge!`;
        }
      } else {
        welcomeMessage += ` You have ${totalChallenges} ${totalChallenges === 1 ? 'challenge' : 'challenges'} in your history.`;
      }
    }
    
    welcomeMessage += ` How can I help you today?`;
    return welcomeMessage;
  }, [greetingPeriod, userData?.name, userData?.challenges]);

  const starterQuestions = useMemo(
    () => getPersonalizedStarterQuestions(),
    [getPersonalizedStarterQuestions, starterNonce],
  );

  const showStarterSuggestions =
    messages.length === 1 &&
    messages[0]?.sender === 'assistant' &&
    !isLoading;

  useEffect(() => {
    if (typeof window === 'undefined' || !userData.uid) return;
    try {
      const payload: PersistedChatPayload = {
        v: CHAT_STORAGE_VERSION,
        open,
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender: m.sender,
          timestamp: m.timestamp.toISOString(),
        })),
      };
      window.localStorage.setItem(chatStorageKey(userData.uid), JSON.stringify(payload));
    } catch (e) {
      console.warn('[ChatAssistant] Failed to persist chat', e);
    }
  }, [open, messages, userData.uid]);

  useEffect(() => {
    if (!open || messages.length !== 0) return;
    try {
      setMessages([
        {
          id: createMessageId(),
          content: getPersonalizedWelcomeMessage(),
          sender: 'assistant',
          timestamp: new Date(),
        },
      ]);
      setStarterNonce((n) => n + 1);
    } catch (error) {
      console.error('Error setting welcome message:', error);
      setHasError(true);
    }
  }, [open, messages.length, getPersonalizedWelcomeMessage]);

  /** Keep the lone welcome message in sync when challenges/name load or change (Firestore can lag behind dashboard). */
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0].sender !== 'assistant') return prev;
      const nextContent = getPersonalizedWelcomeMessage();
      if (prev[0].content === nextContent) return prev;
      return [{ ...prev[0], content: nextContent, timestamp: new Date() }];
    });
  }, [greetingPeriod, userData?.name, userData?.challenges, getPersonalizedWelcomeMessage]);

  useEffect(() => {
    try {
      // Scroll to bottom of messages
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error("Error scrolling to bottom:", error);
    }
  }, [messages]);

  const sendChatMessage = async (text: string) => {
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed || isLoading) return;

    const conversationHistory = messages.map((m) => ({
      role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const userMessage: Message = {
      id: createMessageId(),
      content: trimmed,
      sender: 'user',
      timestamp: new Date(),
    };

    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    const generation = ++sendGenerationRef.current;

    setMessages((prev) => [...prev, userMessage]);
    setNewMessage('');
    setIsLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('session');
      }
      const idToken = await currentUser.getIdToken();
      const response = await fetch(apiUrl('/api/chat-assistant'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        credentials: 'include',
        signal: ac.signal,
        body: JSON.stringify({
          message: trimmed,
          conversationHistory,
        }),
      });

      const rawText = await response.text();
      let data: { reply?: string; error?: string; detail?: string } = {};
      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText) as typeof data;
        } catch {
          throw new Error('bad_response');
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('session');
        }
        if (response.status === 403) {
          throw new Error('email_not_verified');
        }
        if (response.status === 404) {
          throw new Error('profile');
        }
        if (response.status === 503) {
          throw new Error('model');
        }
        if (response.status === 500 && data.detail) {
          console.error('[ChatAssistant] Server error:', data.detail);
        }
        throw new Error(data.error || 'request');
      }

      const replyText = typeof data.reply === 'string' ? data.reply : '';
      if (!replyText.trim()) {
        throw new Error('empty');
      }

      const plainTextResponse = convertMarkdownToPlainText(replyText);
      const assistantMessage: Message = {
        id: createMessageId(),
        content: plainTextResponse,
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Chat assistant error:', error);
      let fallback =
        "I'm sorry, I'm having trouble connecting right now. Please try again later.";
      if (error instanceof Error) {
        if (error.message === 'session') {
          fallback = 'Please sign in again to use the assistant.';
        } else if (error.message === 'email_not_verified') {
          fallback = 'Please verify your email to use the assistant.';
        } else if (error.message === 'profile') {
          fallback =
            'Your profile could not be loaded for the assistant. Try refreshing the page or signing in again.';
        } else if (error.message === 'model') {
          fallback =
            'The assistant is temporarily unavailable. Ensure the API server has GEMINI_API_KEY configured.';
        } else if (error.message === 'bad_response') {
          fallback =
            'The assistant server returned an invalid response. Check that the Flask API is running and check the server logs.';
        }
      }
      const errorMessage: Message = {
        id: createMessageId(),
        content: fallback,
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      if (fetchAbortRef.current === ac) {
        fetchAbortRef.current = null;
      }
      if (sendGenerationRef.current === generation) {
        setIsLoading(false);
      }
    }
  };

  const handleSendMessage = () => {
    void sendChatMessage(newMessage);
  };

  const handleStarterQuestionClick = (question: string) => {
    void sendChatMessage(question);
  };

  const handleNewChat = () => {
    fetchAbortRef.current?.abort();
    setNewMessage('');
    setMessages([
      {
        id: createMessageId(),
        content: getPersonalizedWelcomeMessage(),
        sender: 'assistant',
        timestamp: new Date(),
      },
    ]);
    setStarterNonce((n) => n + 1);
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setShowCopyNotification(true);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const filteredMessages = searchQuery
    ? messages.filter(msg => 
        msg.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // If there's an error in the component, render a simplified version
  if (hasError) {
    return (
      <Box sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
        <Fab
          color="primary"
          aria-label="chat"
          onClick={() => window.location.reload()}
          sx={{
            background: 'linear-gradient(45deg, #3a86ff 30%, #8338ec 90%)',
            boxShadow: '0 6px 15px rgba(58, 134, 255, 0.3)',
          }}
        >
          <ChatIcon />
        </Fab>
      </Box>
    );
  }

  return (
    <>
      {/* Chat Button */}
      <Box sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
        <Zoom in={!open}>
          <Fab
            color="primary"
            aria-label="chat"
            onClick={() => setOpen(true)}
            sx={{
              background: 'linear-gradient(45deg, #3a86ff 30%, #8338ec 90%)',
              boxShadow: '0 6px 15px rgba(58, 134, 255, 0.3)',
            }}
          >
            <ChatIcon />
          </Fab>
        </Zoom>
      </Box>

      {/* Chat Window */}
      <Slide direction="up" in={open} mountOnEnter unmountOnExit>
        <Paper
          elevation={3}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: { xs: 'calc(100% - 48px)', sm: 350 },
            height: 450,
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
            bgcolor: 'background.paper'
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              background: 'linear-gradient(45deg, #3a86ff 30%, #8338ec 90%)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SmartToyIcon />
              <Typography variant="subtitle1" fontWeight={600}>
                {userData?.name ? `${userData.name}'s Assistant` : 'Resilience Assistant'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Search Messages">
                <IconButton 
                  color="inherit" 
                  onClick={() => setIsSearching(!isSearching)}
                  size="small"
                >
                  <SearchIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="New Chat">
                <IconButton 
                  color="inherit" 
                  onClick={handleNewChat}
                  size="small"
                  sx={{ 
                    '&:hover': { 
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      transform: 'rotate(90deg)',
                      transition: 'transform 0.3s ease'
                    }
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton 
                  color="inherit" 
                  onClick={() => setOpen(false)} 
                  size="small"
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Search Bar */}
          {isSearching && (
            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
          )}

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              bgcolor: '#f5f7fa',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            {filteredMessages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignSelf: message.sender === 'user' ? 'flex-end' : 'flex-start',
                  width: '100%',
                }}
              >
                {message.sender === 'assistant' && (
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: 'primary.main',
                      flexShrink: 0,
                    }}
                  >
                    <SmartToyIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                )}
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: message.sender === 'user' ? 'primary.main' : 'white',
                    color: message.sender === 'user' ? 'white' : 'text.primary',
                    position: 'relative',
                    maxWidth: message.sender === 'user' ? '85%' : '85%',
                    width: 'fit-content',
                    marginLeft: message.sender === 'assistant' ? 0 : 'auto',
                    marginRight: message.sender === 'user' ? 0 : 'auto',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                  }}
                >
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      '& ul, & ol': {
                        pl: 2,
                        mb: 1,
                      },
                      '& li': {
                        mb: 0.5,
                      }
                    }}
                  >
                    {message.content}
                  </Typography>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    mt: 1,
                    pt: 1,
                    borderTop: '1px solid',
                    borderColor: message.sender === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  }}>
                    <Typography
                      variant="caption"
                      sx={{
                        opacity: 0.7,
                      }}
                    >
                      {message.timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => handleCopyMessage(message.content)}
                      sx={{ 
                        color: message.sender === 'user' ? 'white' : 'primary.main',
                        opacity: 0.5,
                        '&:hover': { opacity: 1 }
                      }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Paper>
                {message.sender === 'user' && (
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: 'secondary.light',
                      flexShrink: 0,
                    }}
                  >
                    <PersonIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                )}
              </Box>
            ))}
            
            {/* Starter Questions */}
            {showStarterSuggestions && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1, width: '100%' }}>
                {starterQuestions.map((question, index) => (
                  <Button
                    key={`starter-${index}-${question.slice(0, 48)}`}
                    variant="outlined"
                    size="small"
                    onClick={() => handleStarterQuestionClick(question)}
                    sx={{
                      alignSelf: 'flex-start',
                      textTransform: 'none',
                      borderRadius: 2,
                      borderColor: 'primary.light',
                      color: 'primary.main',
                      maxWidth: '85%',
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: 'primary.light',
                        color: 'primary.dark'
                      }
                    }}
                  >
                    {question}
                  </Button>
                ))}
              </Box>
            )}

            {isLoading && (
              <Box sx={{ display: 'flex', gap: 1, alignSelf: 'flex-start', width: '100%' }}>
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'primary.main',
                    flexShrink: 0,
                  }}
                >
                  <SmartToyIcon sx={{ fontSize: 18 }} />
                </Avatar>
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'white',
                    display: 'flex',
                    justifyContent: 'center',
                    maxWidth: '85%',
                  }}
                >
                  <CircularProgress size={20} thickness={4} />
                </Paper>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>

          <Divider />

          {/* Input */}
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              fullWidth
              placeholder="Type a message..."
              variant="outlined"
              size="small"
              value={newMessage}
              onChange={(e) =>
                setNewMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
              }
              inputProps={{ maxLength: MAX_MESSAGE_LENGTH }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isLoading}
              InputProps={{
                sx: { borderRadius: 3 },
                endAdornment: (
                  <InputAdornment position="end">
                    <Typography 
                      variant="caption" 
                      color="text.secondary"
                      sx={{ mr: 1 }}
                    >
                      {newMessage.length}/{MAX_MESSAGE_LENGTH}
                    </Typography>
                  </InputAdornment>
                ),
              }}
            />
            <IconButton
              color="primary"
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isLoading}
              sx={{
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
                '&.Mui-disabled': {
                  bgcolor: 'action.disabledBackground',
                  color: 'action.disabled',
                },
              }}
            >
              {isLoading ? <CircularProgress size={24} thickness={4} color="inherit" /> : <SendIcon />}
            </IconButton>
          </Box>
        </Paper>
      </Slide>

      {/* Copy Notification */}
      <Snackbar
        open={showCopyNotification}
        autoHideDuration={2000}
        onClose={() => setShowCopyNotification(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled">
          Message copied to clipboard
        </Alert>
      </Snackbar>
    </>
  );
};

export default ChatAssistant; 