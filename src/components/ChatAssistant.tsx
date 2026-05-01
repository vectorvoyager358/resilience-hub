import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import type { Challenge, User } from '../types';
import { getLoggedStreakForChallenge, getChallengeCalendarDayIndex } from '../utils/challengeProgress';
import { apiUrl } from '../utils/apiBase';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

// Initialize Gemini API in a secure way
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Gemini API key is not set. Please set VITE_GEMINI_API_KEY in your environment variables.');
}
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

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

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


/**
 * Retrieval (RAG): expects POST `/api/query-pinecone` on the Flask backend.
 * Route is not implemented in `pinecone.py` yet; failures fall back to empty matches.
 */
const getRelevantContext = async (query: string, userId: string) => {
  try {
    const response = await fetch(apiUrl('/api/query-pinecone'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        userId,
        query,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch context');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching context:', error);
    return { matches: [] }; // Return empty matches array on error
  }
};

interface ChatAssistantProps {
  userData: User;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ userData }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);



  // Get greeting based on time of day
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Generate personalized starter questions based on user's challenges
  const getPersonalizedStarterQuestions = () => {
    // Default questions if no challenges or fewer than 3 challenges
    const defaultQuestions = [
      "How can I stay motivated during my challenge?",
      "What are some tips for building resilience?",
      "How do I handle setbacks in my journey?"
    ];

    if (!userData?.challenges || userData.challenges.length === 0) {
      return defaultQuestions;
    }

    const personalQuestions = [];
    
    // Get a random challenge to generate question about
    const randomChallenge = userData.challenges[Math.floor(Math.random() * userData.challenges.length)];
    
    // If user has challenges with progress, create specific questions
    const hasStartedChallenges = userData.challenges.some((c: Challenge) => c.completedDays > 0);
    const hasHighProgressChallenges = userData.challenges.some((c: Challenge) => (c.completedDays / c.duration) >= 0.7);
    const hasLowProgressChallenges = userData.challenges.some((c: Challenge) => c.completedDays > 0 && (c.completedDays / c.duration) < 0.3);
    
    // Add specific questions based on challenges
    if (randomChallenge) {
      personalQuestions.push(`How can I improve my ${randomChallenge.name} challenge?`);
    }
    
    if (hasStartedChallenges) {
      personalQuestions.push("What should I do when I feel like skipping a day?");
    }
    
    if (hasHighProgressChallenges) {
      personalQuestions.push("How can I maintain my progress long-term?");
    }
    
    if (hasLowProgressChallenges) {
      personalQuestions.push("How can I build momentum with my challenges?");
    }
    
    // Ensure we have at least 3 questions by adding defaults if needed
    while (personalQuestions.length < 3) {
      const defaultQuestion = defaultQuestions.shift();
      if (defaultQuestion) {
        personalQuestions.push(defaultQuestion);
      } else {
        break; // Just in case we run out of default questions
      }
    }
    
    return personalQuestions;
  };

  // Create personalized welcome message
  const getPersonalizedWelcomeMessage = () => {
    const greeting = getTimeBasedGreeting();
    const name = userData?.name || 'there';
    
    let welcomeMessage = `${greeting}, ${name}! I'm your personal resilience assistant.`;
    
    // If user has challenges, add personalized progress info
    if (userData?.challenges && userData.challenges.length > 0) {
      const totalChallenges = userData.challenges.length;
      const activeChallenges = userData.challenges.filter(c => c.completedDays > 0).length;
      
      if (activeChallenges > 0) {
        welcomeMessage += ` You're working on ${activeChallenges} active ${activeChallenges === 1 ? 'challenge' : 'challenges'}.`;
        
        // Find most progressed challenge
        const mostProgressed = [...userData.challenges].sort((a, b) => 
          (b.completedDays / b.duration) - (a.completedDays / a.duration)
        )[0];
        
        if (mostProgressed && (mostProgressed.completedDays / mostProgressed.duration) > 0.5) {
          welcomeMessage += ` You're making great progress with your ${mostProgressed.name} challenge!`;
        }
      } else {
        welcomeMessage += ` You have ${totalChallenges} ${totalChallenges === 1 ? 'challenge' : 'challenges'} set up.`;
      }
    }
    
    welcomeMessage += ` How can I help you today?`;
    return welcomeMessage;
  };

  const starterQuestions = useMemo(() => getPersonalizedStarterQuestions(), [userData?.challenges]);

  useEffect(() => {
    if (open && messages.length === 0) {
      // Add welcome message when opened for the first time
      try {
        setMessages([
          {
            id: Date.now().toString(),
            content: getPersonalizedWelcomeMessage(),
            sender: 'assistant',
            timestamp: new Date()
          }
        ]);
      } catch (error) {
        console.error("Error setting welcome message:", error);
        setHasError(true);
      }
    }
  }, [open, userData?.name, messages.length, userData?.challenges]);

  useEffect(() => {
    try {
      // Scroll to bottom of messages
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error("Error scrolling to bottom:", error);
    }
  }, [messages]);

  // Modify handleSendMessage to use RAG
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsLoading(true);

    try {
      if (!API_KEY) {
        throw new Error('Gemini API key is not configured.');
      }

      // Get relevant context from Pinecone
      const relevantContext = await getRelevantContext(newMessage, userData.uid);
      
      const today = new Date();
      const todayKey = getLocalDateKey(today);
      
      // Create context from user data
      const userDataContext = {
        name: userData?.name || 'User',
        challenges: (userData?.challenges || []).map(c => {
          // Get today's day number for this challenge
          const todayDayNum = getChallengeCalendarDayIndex(c);
          // Check if the challenge has a note for today's day number
          const hasLoggedToday = c.notes && c.notes[todayDayNum] !== undefined;
          
          return {
            name: c.name,
            duration: c.duration,
            completedDays: c.completedDays,
            progress: Math.floor((c.completedDays / c.duration) * 100),
            streak: getLoggedStreakForChallenge(c),
            hasLoggedToday: hasLoggedToday,
            lastLoggedDate: c.notes ? 
              Object.keys(c.notes)
                .sort((a, b) => parseInt(b) - parseInt(a))
                .map(dayNum => {
                  const date = new Date(c.startDate);
                  date.setDate(date.getDate() + parseInt(dayNum) - 1);
                  return date.toISOString();
                })[0] || null 
              : null
          };
        }),
        hasReflectionToday: Boolean(userData?.dailyNotes && userData.dailyNotes[todayKey]),
        todayNote: userData?.dailyNotes && userData.dailyNotes[todayKey] ? userData.dailyNotes[todayKey] : null,
        timeOfDay: getTimeBasedGreeting().split(' ')[1].toLowerCase(), // morning, afternoon, or evening
        previousMessages: messages.slice(-4).map(m => ({ role: m.sender, content: m.content })),
        // Organize notes by recency
        notes: {
          today: userData?.dailyNotes && userData.dailyNotes[todayKey] ? {
            content: userData.dailyNotes[todayKey],
            dateFormatted: today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          } : null,
          // Convert to array of {date, content} objects, sorted by date (recent first, excluding today)
          previous: userData?.dailyNotes ? 
            Object.entries(userData.dailyNotes)
              .filter(([dateKey]) => dateKey !== todayKey)
              .map(([dateKey, content]) => {
                const noteDate = new Date(dateKey);
                return {
                  content,
                  dateKey,
                  dateFormatted: noteDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
                  daysAgo: Math.floor((today.getTime() - noteDate.getTime()) / (1000 * 60 * 60 * 24))
                };
              })
              .sort((a, b) => a.daysAgo - b.daysAgo) 
            : [],
        },
        challengeNotes: (userData?.challenges || []).reduce((acc: Record<string, unknown>, challenge: Challenge) => {
          if (challenge.notes) {
            acc[challenge.id] = challenge.notes;
          }
          return acc;
        }, {}),
        currentDate: new Date().toISOString(),
        currentDateFormatted: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        relevantHistory: relevantContext ? relevantContext.matches : [], // Add retrieved context
      };

      // Modify the prompt to include retrieved context
      const prompt = `You are a personal resilience coach assistant. The user's name is ${userData?.name || 'there'}. 
      Today's date is ${new Date().toLocaleDateString()}.
      
      Relevant past context:
      ${(
        (relevantContext?.matches as unknown as Array<{ content?: unknown; metadata?: { type?: unknown; date?: unknown } }> | undefined) ??
        []
      )
        .map((match) => {
          const content = typeof match.content === 'string' ? match.content : '';
          const t = match.metadata?.type;
          const typeLabel = typeof t === 'string' ? t : 'context';
          const d = match.metadata?.date;
          const dateStr = typeof d === 'string' ? d : '';
          const when = dateStr ? ` (${new Date(dateStr).toLocaleDateString()})` : '';
          return `- ${typeLabel}: ${content}${when}`;
        })
        .join('\n') || 'No relevant past context found.'}
      
      Current user data: ${JSON.stringify(userDataContext)}
      
      The user said: ${newMessage}
      
      Provide a helpful, encouraging, and personalized response that references relevant past experiences and progress when appropriate.
      Keep your response under 200 words and friendly in tone.`;

      const response = await fetch(`${API_URL}?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 250,
            topK: 40,
            topP: 0.95,
            stopSequences: []
          }
        })
      });

      const data = await response.json();
      
      if (data.candidates && data.candidates[0]?.content?.parts) {
        const plainTextResponse = convertMarkdownToPlainText(data.candidates[0].content.parts[0].text);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: plainTextResponse,
          sender: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error with Gemini API:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I'm having trouble connecting right now. Please try again later.",
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStarterQuestionClick = (question: string) => {
    setNewMessage(question);
    handleSendMessage();
  };

  const handleNewChat = () => {
    setMessages([]);
    setNewMessage('');
    // Trigger welcome message again
    setMessages([
      {
        id: Date.now().toString(),
        content: getPersonalizedWelcomeMessage(),
        sender: 'assistant',
        timestamp: new Date()
      }
    ]);
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
            {messages.length === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1, width: '100%' }}>
                {starterQuestions.map((question, index) => (
                  <Button
                    key={index}
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
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => {
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
                      {newMessage.length}/200
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