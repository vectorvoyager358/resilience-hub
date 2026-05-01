import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Tooltip,
  Stack,
  Paper,
  Alert,
  Menu,
  MenuItem,
  Avatar,
  Chip,
  LinearProgress,
  Fade,
  Zoom,
  Tabs,
  Tab,
  CircularProgress,
  Fab,
  Grow,
  ButtonBase,
  InputAdornment
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditNoteIcon from '@mui/icons-material/EditNote';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import StarIcon from '@mui/icons-material/Star';
import DateRangeIcon from '@mui/icons-material/DateRange';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SchoolIcon from '@mui/icons-material/School';
import SpaIcon from '@mui/icons-material/Spa';
import PsychologyIcon from '@mui/icons-material/Psychology';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import FavoriteIcon from '@mui/icons-material/Favorite';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import NightlightIcon from '@mui/icons-material/Nightlight';
import BrushIcon from '@mui/icons-material/Brush';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import CodeIcon from '@mui/icons-material/Code';
import PaletteIcon from '@mui/icons-material/Palette';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import MobileOffIcon from '@mui/icons-material/MobileOff';
import PrayIcon from '@mui/icons-material/Accessibility';
import CleanHandsIcon from '@mui/icons-material/CleanHands';
import ToothbrushIcon from '@mui/icons-material/Sanitizer';
import ShowerIcon from '@mui/icons-material/Shower';
import VapeFreeBrushIcon from '@mui/icons-material/SmokeFree';
import SelfDisciplineIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import BlockIcon from '@mui/icons-material/Block';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import LocalDrinkIcon from '@mui/icons-material/LocalDrink';
import HotelIcon from '@mui/icons-material/Hotel';
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Challenge, User } from '../types';
import TypingAnimation from '../components/TypingAnimation';
import ChatAssistant from '../components/ChatAssistant';
import { useAuth } from '../contexts/AuthContext';
import { getUserData, updateChallenges, updateDailyNotes, createUserDocument } from '../services/firestore';
import useMediaQuery from '@mui/material/useMediaQuery';
import NotesHistoryPage from './NotesHistoryPage';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Fuse from 'fuse.js';
import PeopleIcon from '@mui/icons-material/People';
import { tryUpsertToPinecone, tryDeleteFromPinecone } from '../utils/api';
import { upsertChallengeData, upsertNoteData, upsertDailyReflection } from '../services/pinecone';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { updatePineconeNote } from '../utils/api';
import { Note } from '../types';
import { syncChallengeCompletedDays, getChallengeCalendarDayIndex, isChallengePastCalendarDuration, formatChallengeWindowEndCalendarDisplay, normalizeUserChallenges, getLoggedStreakForChallenge } from '../utils/challengeProgress';

interface MilestoneAchievement {
  percentage: number;
  icon: JSX.Element;
  title: string;
  description: string;
  color: string;
}

const milestones: MilestoneAchievement[] = [
  {
    percentage: 0,
    icon: <FitnessCenterIcon />,
    title: "First Step",
    description: "You've started your journey! The hardest part is beginning.",
    color: "#00b4d8"
  },
  {
    percentage: 0,
    icon: <LocalFireDepartmentIcon />,
    title: "Comeback Champion",
    description: "Welcome back! Getting back on track shows true resilience.",
    color: "#ff9f1c"
  },
  {
    percentage: 7,
    icon: <LocalFireDepartmentIcon />,
    title: "Week Champion",
    description: "A full week of dedication! You're building strong habits.",
    color: "#f9844a"
  },
  {
    percentage: 25,
    icon: <StarIcon />,
    title: "Getting Started",
    description: "You're building momentum!",
    color: "#2ec4b6"
  },
  {
    percentage: 50,
    icon: <MilitaryTechIcon />,
    title: "Halfway There",
    description: "Keep pushing forward!",
    color: "#ff9f1c"
  },
  {
    percentage: 75,
    icon: <WorkspacePremiumIcon />,
    title: "Almost There",
    description: "The finish line is in sight!",
    color: "#e76f51"
  },
  {
    percentage: 100,
    icon: <EmojiEventsIcon />,
    title: "Challenge Complete",
    description: "You've done it! Incredible work!",
    color: "#2a9d8f"
  }
];




function toTitleCase(str: string) {
  return str.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ErrorBoundary component to catch errors in child components
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null; // Render nothing if there's an error
    }
    return this.props.children;
  }
}

// Scroll restoration component to ensure page starts at top
const ScrollToTop: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  return null;
};

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Define categories with keywords and icons
const iconCategories = [
  { 
    category: "walking",
    keywords: ["walk", "walking", "steps", "step", "10k", "5k", "run", "running", "jog", "jogging", "hike", "hiking", "stroll", "trek"], 
    weight: 1,
    icon: <DirectionsWalkIcon /> 
  },
  { 
    category: "dental",
    keywords: ["brush", "brushing", "teeth", "tooth", "floss", "dental", "oral", "mouthwash", "toothpaste"], 
    weight: 1,
    icon: <ToothbrushIcon /> 
  },
  { 
    category: "hydration",
    keywords: ["water", "hydrate", "hydration", "drink", "fluid", "liquids", "h2o", "beverage", "thirst"], 
    weight: 1,
    icon: <LocalDrinkIcon /> 
  },
  { 
    category: "reading",
    keywords: ["read", "reading", "book", "books", "pages", "novel", "literature", "articles", "stories", "ebook"], 
    weight: 1,
    icon: <MenuBookIcon /> 
  },
  { 
    category: "meditation",
    keywords: ["meditate", "meditation", "mindful", "mindfulness", "breath", "breathing", "relax", "calm", "zen", "peace", "still", "presence"], 
    weight: 1,
    icon: <SelfImprovementIcon /> 
  },
  { 
    category: "fitness",
    keywords: ["workout", "gym", "exercise", "fitness", "training", "pushup", "pushups", "squat", "lift", "weights", "cardio", "muscle", "strength", "train"], 
    weight: 1,
    icon: <FitnessCenterIcon /> 
  },
  { 
    category: "sleep",
    keywords: ["sleep", "bed", "rest", "nap", "early", "night", "bedtime", "snooze", "slumber", "zzzz"], 
    weight: 1,
    icon: <HotelIcon /> 
  },
  { 
    category: "shower",
    keywords: ["shower", "bath", "wash", "cold shower", "bathing", "cleanse", "ice bath", "plunge"], 
    weight: 1,
    icon: <ShowerIcon /> 
  },
  { 
    category: "gratitude",
    keywords: ["gratitude", "thankful", "thank", "appreciate", "appreciation", "grateful", "blessing", "content"], 
    weight: 1,
    icon: <FavoriteIcon /> 
  },
  { 
    category: "journaling",
    keywords: ["journal", "journaling", "write", "writing", "diary", "note", "log", "reflect", "reflection", "document"], 
    weight: 1,
    icon: <EditNoteIcon /> 
  },
  { 
    category: "learning",
    keywords: ["learn", "learning", "study", "studying", "education", "course", "language", "practice", "skill", "knowledge", "tutorial", "lesson", "class"], 
    weight: 1,
    icon: <EmojiObjectsIcon /> 
  },
  { 
    category: "prayer",
    keywords: ["prayer", "pray", "spiritual", "worship", "faith", "devotion", "church", "religious", "temple", "mosque", "meditate"], 
    weight: 1,
    icon: <WbSunnyIcon /> 
  },
  { 
    category: "abstinence", 
    keywords: ["quit", "stop", "abstain", "nofap", "discipline", "avoid", "refrain", "resist", "temptation", "addiction", "habit"], 
    weight: 1,
    icon: <VisibilityOffIcon /> 
  },
  { 
    category: "diet",
    keywords: ["food", "eat", "eating", "diet", "nutrition", "meal", "healthy", "vegetables", "cooking", "calories", "fasting", "fast"], 
    weight: 1,
    icon: <RestaurantIcon /> 
  },
  { 
    category: "social",
    keywords: ["friend", "family", "social", "connect", "relationship", "talk", "message", "call", "visit", "conversation"], 
    weight: 1,
    icon: <PeopleIcon /> 
  },
  { 
    category: "coding",
    keywords: ["code", "coding", "program", "programming", "develop", "development", "software", "app", "website", "javascript", "python", "java"], 
    weight: 1,
    icon: <CodeIcon /> 
  },
  { 
    category: "creative",
    keywords: ["art", "draw", "paint", "creative", "craft", "design", "music", "sing", "play", "instrument", "create"], 
    weight: 1,
    icon: <PaletteIcon /> 
  },
];

// Create a flattened array of all keywords for fuzzy searching
const allKeywords = iconCategories.flatMap(category => 
  category.keywords.map(keyword => ({
    keyword,
    category: category.category,
    weight: category.weight || 1
  }))
);

// Advanced options for better fuzzy matching
const fuseOptions = {
  includeScore: true,
  keys: ['keyword'],
  // Lowering threshold for more precise matching
  threshold: 0.3, 
  // Add location and distance factors to improve matching
  location: 0,
  distance: 100,
  // Add weight to control which fields matter more in scoring
  fieldNormWeight: 1,
  // Use advanced weighted search for better results
  useExtendedSearch: true,
  // Sort results by score
  shouldSort: true,
  // Find all matches but limit to top 3
  findAllMatches: true,
  // Token separators for better word matching
  tokenize: true,
  matchAllTokens: false,
  // Support for multiple identical matches
  includeMatches: true,
  minMatchCharLength: 2
};

// Initialize Fuse instance for fuzzy matching
const fuse = new Fuse(allKeywords, fuseOptions);

// Helper function to preprocess challenge name for better matching
function preprocessChallengeName(name: string): string {
  if (!name) return '';
  
  // Convert to lowercase
  let processed = name.toLowerCase();
  
  // Remove common words that don't help with matching
  const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'for', 'with', 'at', 'by', 'to', 'challenge'];
  stopWords.forEach(word => {
    processed = processed.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ');
  });
  
  // Remove extra whitespace
  processed = processed.replace(/\s+/g, ' ').trim();
  
  return processed;
}

// Function to get an icon for a challenge based on advanced fuzzy matching
function getChallengeIcon(challengeName: string) {
  if (!challengeName) return <PsychologyIcon />;
  
  // Preprocess the challenge name
  const processedName = preprocessChallengeName(challengeName);
  
  // If nothing left after preprocessing
  if (!processedName) return <PsychologyIcon />;
  
  // Extract key words/tokens for individual matching
  const words = processedName.split(' ').filter(word => word.length > 2);
  
  // For very short inputs, search directly
  if (words.length === 0 || (words.length === 1 && words[0].length < 4)) {
    const result = fuse.search(processedName);
    if (result.length > 0) {
      const bestMatch = result[0].item;
      const matchedCategory = bestMatch.category;
      const categoryEntry = iconCategories.find(c => c.category === matchedCategory);
      if (categoryEntry) return categoryEntry.icon;
    }
    return <PsychologyIcon />;
  }
  
  // For longer inputs, try both whole phrase and individual important words
  const directResult = fuse.search(processedName);
  
  // Also search each word separately to find the most relevant match
  const wordResults = words.map(word => ({
    word,
    results: fuse.search(word)
  })).filter(result => result.results.length > 0);
  
  // Rank matches by score and pick the best category
  const categoryScores: Record<string, number> = {};
  
  // Add direct phrase match scores (weighted more heavily)
  directResult.slice(0, 3).forEach(result => {
    const category = result.item.category;
    const score = 1 - (result.score || 0.5); // Convert to 0-1 range where 1 is best
    categoryScores[category] = (categoryScores[category] || 0) + (score * 2); // Weight phrase matches higher
  });
  
  // Add individual word match scores
  wordResults.forEach(wordResult => {
    const topMatch = wordResult.results[0];
    if (topMatch) {
      const category = topMatch.item.category;
      const score = 1 - (topMatch.score || 0.5);
      categoryScores[category] = (categoryScores[category] || 0) + score;
    }
  });
  
  // Find the category with the highest score
  let bestCategory = '';
  let highestScore = 0;
  
  Object.entries(categoryScores).forEach(([category, score]) => {
    if (score > highestScore) {
      highestScore = score;
      bestCategory = category;
    }
  });
  
  // If we found a good match
  if (bestCategory && highestScore > 0.3) {
    const categoryEntry = iconCategories.find(c => c.category === bestCategory);
    if (categoryEntry) return categoryEntry.icon;
  }
  
  // Fallback to default
  return <PsychologyIcon />;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [userData, setUserData] = useState<User>({ 
    uid: currentUser?.uid || '', 
    name: '', 
    challenges: [], 
    dailyNotes: {} 
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasShownWelcome, setHasShownWelcome] = useState(() => {
    return sessionStorage.getItem('hasShownWelcome') === 'true';
  });
  const [openDialog, setOpenDialog] = useState(false);
  const [dailyNoteDialog, setDailyNoteDialog] = useState(false);
  const [editLogDialog, setEditLogDialog] = useState(false);
  const [newChallenge, setNewChallenge] = useState({ name: '', duration: '' });
  const [note, setNote] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editChallengeId, setEditChallengeId] = useState<string | null>(null);
  const [editLogDay, setEditLogDay] = useState<number | null>(null);
  const [dailyNote, setDailyNote] = useState('');
  const [challengeIdForNote, setChallengeIdForNote] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [challengeToDelete, setChallengeToDelete] = useState<string | null>(null);
  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false);
  const [showMilestone, setShowMilestone] = useState<{
    challengeId: string;
    milestone: MilestoneAchievement;
  } | null>(null);
  const [updateDurationDialog, setUpdateDurationDialog] = useState(false);
  const [newDuration, setNewDuration] = useState<string>('');
  const [currentTab, setCurrentTab] = useState(0);
  const [isFirstVisit, setIsFirstVisit] = useState(() => {
    return !localStorage.getItem('hasVisitedDashboard');
  });
  const [lastKnownDate, setLastKnownDate] = useState<string>(localStorage.getItem('lastKnownDate') || getLocalDateKey());
  const today = useMemo(() => {
    const now = new Date();
    return getLocalDateKey(now);
  }, []);

  const activeChallenges = useMemo(
    () => userData.challenges.filter((c) => !isChallengePastCalendarDuration(c)),
    [userData.challenges, lastKnownDate]
  );

  const archivedChallenges = useMemo(
    () => userData.challenges.filter((c) => isChallengePastCalendarDuration(c)),
    [userData.challenges, lastKnownDate]
  );
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedChallengeForNote, setSelectedChallengeForNote] = useState<Challenge | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [editTodayNoteDialogOpen, setEditTodayNoteDialogOpen] = useState(false);
  const [editTodayNote, setEditTodayNote] = useState('');
  const [editTodayChallengeId, setEditTodayChallengeId] = useState<string | null>(null);
  const [previewChallenge, setPreviewChallenge] = useState<Challenge | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cellDialogOpen, setCellDialogOpen] = useState(false);
  const [cellDialogContent, setCellDialogContent] = useState<{date: string, note?: string} | null>(null);
  const isMobile = useMediaQuery('(max-width:600px)');
  const [deleteAllNotesDialogOpen, setDeleteAllNotesDialogOpen] = useState(false);
  const [deleteLogDialogOpen, setDeleteLogDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<{ challengeId: string; day: number } | null>(null);

  const handleSignOut = () => {
    setSignOutDialogOpen(true);
  };

  const confirmSignOut = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const menuActions = [
    { icon: <AddIcon />, name: 'Add Challenge', onClick: () => setOpenDialog(true) },
    { icon: <AccountCircleIcon />, name: 'Profile', onClick: () => navigate('/profile') },
    { icon: <DeleteIcon />, name: 'Delete All Daily Reflection Notes', onClick: () => setDeleteAllNotesDialogOpen(true), color: 'error' },
    { icon: <DeleteIcon />, name: 'Delete All Challenges', onClick: () => setResetDialogOpen(true), color: 'error' },
    { icon: <LogoutIcon />, name: 'Sign Out', onClick: handleSignOut }
  ];

  // Add this function around line 615, just before loadUserData
  const upsertHistoricalData = async (userData: User) => {
    try {
      console.log('Starting historical data upload...'); // Add this
      // Upsert historical challenges
      if (userData.challenges) {
        console.log(`Uploading ${userData.challenges.length} challenges...`); // Add this
        for (const challenge of userData.challenges) {
          console.log(`Upserting challenge: ${challenge.name}`); // Add this
          await upsertChallengeData(userData.uid, challenge);
          
          // Upsert historical notes for each challenge
          if (challenge.notes) {
            console.log(`Upserting ${Object.keys(challenge.notes).length} notes for challenge ${challenge.name}`); // Add this
            for (const [dayNumber, noteObj] of Object.entries(challenge.notes)) {
              // noteObj is of type Note
              await upsertNoteData(userData.uid, challenge.id, parseInt(dayNumber), noteObj.content);
            }
          }
        }
      }

      // Upsert historical daily reflections
      if (userData.dailyNotes) {
        console.log(`Upserting ${Object.keys(userData.dailyNotes).length} daily reflections...`); // Add this
        for (const [date, reflection] of Object.entries(userData.dailyNotes)) {
          await upsertDailyReflection(userData.uid, date, reflection);
        }
      }
      console.log('Historical data upload complete!'); // Add this
    } catch (error) {
      console.error('Error upserting historical data:', error);
    }
  };

  // Load user data from Firestore
  useEffect(() => {
    const loadUserData = async () => {
      if (!currentUser?.uid) {
        navigate('/login');
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const raw = userDoc.data() as User;
          setUserData(normalizeUserChallenges(raw));
        } else {
          // Initialize user data if it doesn't exist
          const initialData: User = {
            uid: currentUser.uid,
            name: currentUser.displayName || '',
            challenges: [],
            dailyNotes: {}
          };
          await createUserDocument(currentUser.uid, initialData);
          setUserData(initialData);
        }
      } catch (err) {
        console.error('Error loading user data:', err);
        setError('Failed to load dashboard data. Please try refreshing the page.');
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!hasShownWelcome) {
      sessionStorage.setItem('hasShownWelcome', 'true');
      setHasShownWelcome(true);
    }
  }, [hasShownWelcome]);

  // Function to get formatted date string
  const getFormattedDate = useCallback(() => {
    const now = new Date();
    return now.toLocaleDateString(undefined, { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }, []);

  // Function to check if a date is today (unused but kept for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _isToday = (date: string): boolean => {
    return date === today;
  };
  const hasMarkedTodayComplete = useCallback((challenge: Challenge): boolean => {
    const todayDayNumber = getChallengeCalendarDayIndex(challenge);
    const n = challenge.notes[`${todayDayNumber}`];
    const content = typeof n?.content === 'string' ? n.content : '';
    return content.trim().length > 0;
  }, []);

  // Helper to get the current day for a challenge (capped at challenge duration)
  const getCurrentDayForChallenge = (challenge: Challenge) => {
    const dayNumber = getChallengeCalendarDayIndex(challenge);
    return Math.min(dayNumber, challenge.duration);
  };


  // Function to check and show milestone achievements
  const checkMilestoneAchievement = (challenge: Challenge) => {
    const currentPercentage = Math.floor((challenge.completedDays / challenge.duration) * 100);
    
    // Check for day-specific milestones first
    if (challenge.completedDays === 1) {
      setShowMilestone({
        challengeId: challenge.id,
        milestone: {
          ...milestones[0],
          percentage: currentPercentage // Update with current progress
        }
      });
      return;
    }

    // Check for comeback (streak = 1 but not first day)
    const streak = getLoggedStreakForChallenge(challenge);
    if (streak === 1 && challenge.completedDays > 1) {
      // This is a comeback after breaking a streak
      setShowMilestone({
        challengeId: challenge.id,
        milestone: {
          ...milestones[1],
          percentage: currentPercentage // Update with current progress
        }
      });
      return;
    }

    if (challenge.completedDays === 7) {
      setShowMilestone({
        challengeId: challenge.id,
        milestone: {
          ...milestones[2], // Now at index 2 since we added comeback
          percentage: currentPercentage // Update with current progress
        }
      });
      return;
    }

    // Then check percentage-based milestones
    const achievedMilestone = milestones
      .slice(3) // Skip the day-based and comeback milestones
      .reverse()
      .find(m => currentPercentage >= m.percentage);

    if (achievedMilestone) {
      setShowMilestone({
        challengeId: challenge.id,
        milestone: {
          ...achievedMilestone,
          percentage: currentPercentage // Update with current progress
        }
      });
    }
  };

  // Mark a challenge as complete for today (calendar slot = days since start + 1)
  const handleMarkComplete = async (challengeId: string) => {
    if (!currentUser) return;
    const challenge = userData.challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    if (!note.trim()) {
      alert('Add a note before marking today complete.');
      return;
    }

    const todayDayNumber = getChallengeCalendarDayIndex(challenge);

    if (todayDayNumber < 1 || todayDayNumber > challenge.duration) {
      alert('You are outside this challenge’s day range. Extend the duration in settings if you need more time.');
      return;
    }

    if (hasMarkedTodayComplete(challenge)) {
      alert("You've already marked today's challenge as complete. Come back tomorrow!");
      return;
    }

    try {
      const vectorId = await tryUpsertToPinecone({
        userId: currentUser.uid,
        type: 'note',
        content: note,
        metadata: {
          challengeId,
          dayNumber: todayDayNumber,
          challengeName: challenge.name,
          completionDate: new Date().toISOString(),
        }
      });

      const updatedChallenges = userData.challenges.map(chItem => {
        if (chItem.id !== challengeId) return chItem;
        const merged: Challenge = {
          ...chItem,
          notes: {
            ...(chItem.notes as Record<string, Note>),
            [`${todayDayNumber}`]: {
              content: note.trim(),
              ...(vectorId ? { vectorId } : {}),
            },
          },
        };
        return syncChallengeCompletedDays(merged);
      });

      await updateChallenges(currentUser.uid, updatedChallenges);

      const fresh = updatedChallenges.find(c => c.id === challengeId);

      setUserData(prev => ({
        ...prev,
        challenges: updatedChallenges,
      }));

      setNote('');
      setChallengeIdForNote(null);

      if (fresh) {
        checkMilestoneAchievement(fresh);
        await upsertChallengeData(currentUser.uid, fresh);
      }
    } catch (error) {
      console.error('Error marking challenge complete:', error);
      alert('Could not save today. Please try again.');
    }
  };

  const handleDeleteChallenge = (challengeId: string) => {
    setChallengeToDelete(challengeId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteChallenge = async () => {
    if (!currentUser || !challengeToDelete) return;

    const idToRemove = challengeToDelete;
    const updatedChallenges = userData.challenges.filter(
      challenge => challenge.id !== idToRemove
    );

    try {
      await updateChallenges(currentUser.uid, updatedChallenges);
    } catch (error) {
      console.error('[DELETE CHALLENGE] Firestore:', error);
      alert('Could not delete challenge from your account. Please try again.');
      return;
    }

    setUserData(prev => ({
      ...prev,
      challenges: updatedChallenges,
    }));

    await tryDeleteFromPinecone({
      userId: currentUser.uid,
      type: 'challenge' as 'challenge',
      challengeId: idToRemove,
    });

    await tryDeleteFromPinecone({
      prefix: `${currentUser.uid}-note-${idToRemove}-`,
    });

    setDeleteDialogOpen(false);
    setChallengeToDelete(null);
  };

  
  const handleOpenLogMenu = (event: React.MouseEvent<HTMLButtonElement>, challengeId: string) => {
    event.stopPropagation(); // Prevent event bubbling
    setMenuAnchorEl(event.currentTarget);
    setSelectedChallengeId(challengeId);
  };

  const handleCloseLogMenu = () => {
    setMenuAnchorEl(null);
    setSelectedChallengeId(null);
  };

  // Open log edit dialog for a specific day
  const handleEditLog = () => {
    if (!selectedChallengeId) return;
    
    const challenge = userData.challenges.find(c => c.id === selectedChallengeId);
    if (!challenge) return;
    
    // Find the most recently completed day
    const completedDays = Object.keys(challenge.notes)
      .map(day => parseInt(day, 10))
      .sort((a, b) => b - a);
    
    if (completedDays.length === 0) {
      alert("No completed days to edit");
      return;
    }
    
    const dayToEdit = completedDays[0];
    
    setEditChallengeId(selectedChallengeId);
    setEditLogDay(dayToEdit);
    setEditNote(challenge.notes[`${dayToEdit}`]?.content || '');
    setEditLogDialog(true);
    handleCloseLogMenu();
  };

  // Delete a log entry for a specific day
  const handleDeleteLog = () => {
    if (!selectedChallengeId) return;
    const challenge = userData.challenges.find(c => c.id === selectedChallengeId);
    if (!challenge) {
      console.error('Challenge not found:', selectedChallengeId);
      return;
    }
    
    // Find the most recently completed day
    const completedDays = Object.keys(challenge.notes)
      .map(day => parseInt(day, 10))
      .sort((a, b) => b - a);
    
    if (completedDays.length === 0) {
      alert("No completed days to delete");
      return;
    }
    
    const dayToDelete = completedDays[0];
    
    setLogToDelete({ challengeId: selectedChallengeId, day: dayToDelete });
    setDeleteLogDialogOpen(true);
    handleCloseLogMenu();
  };

  // Confirm deletion of a log entry
  const confirmDeleteLog = async () => {
    if (!logToDelete || !currentUser?.uid) {
      console.error('[PINECONE][DELETE LOG] Missing required data:', { 
        logToDelete, 
        uid: currentUser?.uid 
      });
      setDeleteLogDialogOpen(false);
      setLogToDelete(null);
      return;
    }
    
    try {
      console.log('[PINECONE][DELETE LOG] Starting log deletion process:', {
        logToDelete,
        userId: currentUser.uid,
        timestamp: new Date().toISOString()
      });

      // Find the challenge to update
      const challengeToUpdate = userData.challenges.find(c => c.id === logToDelete.challengeId);
      
      if (!challengeToUpdate) {
        console.error('[PINECONE][DELETE LOG] Challenge not found for deletion:', {
          challengeId: logToDelete.challengeId,
          availableChallenges: userData.challenges.map(c => c.id)
        });
        setDeleteLogDialogOpen(false);
        setLogToDelete(null);
        return;
      }

      const dayKey = `${logToDelete.day}`;
      const rawDeletedNote = challengeToUpdate.notes[dayKey];
      const deletedVectorId =
        typeof rawDeletedNote === 'object' &&
        rawDeletedNote &&
        typeof (rawDeletedNote as Note).vectorId === 'string' &&
        (rawDeletedNote as Note).vectorId
          ? (rawDeletedNote as Note).vectorId
          : undefined;

      const updatedChallenges = userData.challenges.map(challenge => {
        if (challenge.id === logToDelete.challengeId) {
          const newNotes = { ...challenge.notes };
          delete newNotes[dayKey];
          return syncChallengeCompletedDays({
            ...challenge,
            notes: newNotes as Record<string, Note>,
          });
        }
        return challenge;
      });

      console.log('[PINECONE][DELETE LOG] Persisting removal to Firestore (source of truth)');

      await updateChallenges(currentUser.uid, updatedChallenges);

      setUserData(prev => ({
        ...prev,
        challenges: updatedChallenges,
      }));

      const refreshed = updatedChallenges.find(c => c.id === logToDelete.challengeId);
      if (refreshed) {
        await upsertChallengeData(currentUser.uid, refreshed);
      }

      if (deletedVectorId) {
        await tryDeleteFromPinecone({ vectorId: deletedVectorId });
      }

      console.log('[PINECONE][DELETE LOG] Firestore committed; optional vector delete best-effort');
    } catch (error) {
      console.error('[PINECONE][DELETE LOG] Error:', error);
    }
    
    setDeleteLogDialogOpen(false);
    setLogToDelete(null);
  };

  // Save an edited log entry
  const handleSaveEditedLog = async () => {
    if (!currentUser || !editChallengeId || editLogDay === null) return;

    // 1. Find the old vectorId (if you store it in Firestore, use that)
    // If not, construct a prefix to match all possible vectors for this note
    const vectorPrefix = `${currentUser.uid}-note-${editChallengeId}-${editLogDay}`;

    // 2–3. Best-effort Pinecone refresh (Firestore above is source of truth)
    await tryDeleteFromPinecone({ prefix: vectorPrefix });

    const challenge = userData.challenges.find(c => c.id === editChallengeId);
    if (challenge) {
      const oldNoteObj = challenge?.notes[editLogDay];
      if (oldNoteObj?.vectorId) {
        await tryDeleteFromPinecone({ vectorId: oldNoteObj.vectorId });
      }
      const newVectorId =
        (await tryUpsertToPinecone({
          userId: currentUser.uid,
          type: 'note',
          content: editNote,
          metadata: {
            challengeId: editChallengeId,
            challengeName: challenge.name,
            dayNumber: editLogDay,
            updateDate: new Date().toISOString(),
          }
        })) ?? oldNoteObj?.vectorId;
      const updatedChallenges = userData.challenges.map(challenge => {
        if (challenge.id === editChallengeId) {
          return syncChallengeCompletedDays({
            ...challenge,
            notes: {
              ...challenge.notes,
              [`${editLogDay}`]: {
                content: editNote,
                ...(newVectorId ? { vectorId: newVectorId } : {}),
              }
            } as Record<string, Note>,
          });
        }
        return challenge;
      });
      await updateChallenges(currentUser.uid, updatedChallenges);
      const fresh = updatedChallenges.find(c => c.id === editChallengeId);
      if (fresh) {
        await upsertChallengeData(currentUser.uid, fresh);
      }
      setUserData(prev => ({ ...prev, challenges: updatedChallenges }));
    }

    setEditLogDialog(false);
    setEditChallengeId(null);
    setEditLogDay(null);
    setEditNote('');
  };

  const handleDeleteAllChallenges = async () => {
    if (!currentUser) return;

    try {
      await updateChallenges(currentUser.uid, []);
      setUserData(prev => ({
        ...prev,
        challenges: []
      }));
      setIsFirstVisit(true);
      setResetDialogOpen(false);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting all challenges:', error);
    }
  };

  const handleDailyNoteSubmit = async () => {
    if (!currentUser) return;
    const todayKey = getLocalDateKey();
    const updatedDailyNotes = {
      ...userData.dailyNotes,
      [todayKey]: dailyNote
    };
    try {
      await updateDailyNotes(currentUser.uid, updatedDailyNotes);
      setUserData(prev => ({
        ...prev,
        dailyNotes: updatedDailyNotes
      }));

      await upsertDailyReflection(currentUser.uid, todayKey, dailyNote);

    } catch (error) {
      console.error('Error updating daily note:', error);
    }
    setDailyNoteDialog(false);
  };

  const handleUpdateDuration = async () => {
    if (!currentUser || !selectedChallengeId || !newDuration) return;
    
    const updatedDuration = parseInt(newDuration);

    if (updatedDuration < 10) {
      alert("Challenge duration must be at least 10 days");
      return;
    }

    if (updatedDuration > 365) {
      alert("Challenge duration cannot be more than 365 days");
      return;
    }

    const selectedChallenge = userData.challenges.find(c => c.id === selectedChallengeId);
    if (!selectedChallenge) return;

    if (updatedDuration < selectedChallenge.completedDays) {
      alert("New duration cannot be less than completed days");
      return;
    }

    const updatedChallenges = userData.challenges.map(challenge => {
      if (challenge.id === selectedChallengeId) {
        return syncChallengeCompletedDays({
          ...challenge,
          duration: updatedDuration,
        });
      }
      return challenge;
    });

    try {
      await updateChallenges(currentUser.uid, updatedChallenges);
      setUserData(prev => ({
        ...prev,
        challenges: updatedChallenges
      }));

      // Use local updatedChallenges for Pinecone upsert
      const updatedChallenge = updatedChallenges.find(c => c.id === selectedChallengeId);
      if (updatedChallenge) {
        await upsertChallengeData(currentUser.uid, updatedChallenge);
        console.log('[PINECONE][UPSERT CHALLENGE] Updated duration in Pinecone:', updatedChallenge);
      }
    } catch (error) {
      console.error('Error updating challenge duration:', error);
    }

    setUpdateDurationDialog(false);
    setNewDuration('');
  };

  // Calculate challenge streaks and percentages
  const getProgressPercentage = (challenge: Challenge): number => {
    return Math.floor((challenge.completedDays / challenge.duration) * 100);
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleDeleteDailyNote = async () => {
    if (!currentUser) return;
    const todayKey = getLocalDateKey();
    const updatedDailyNotes = { ...userData.dailyNotes };
    delete updatedDailyNotes[todayKey];

    try {
      await updateDailyNotes(currentUser.uid, updatedDailyNotes);
    } catch (error) {
      console.error('Error deleting daily note from Firestore:', error);
      return;
    }

    setUserData(prev => ({
      ...prev,
      dailyNotes: updatedDailyNotes,
    }));
    setDeleteNoteDialogOpen(false);

    await tryDeleteFromPinecone({
      vectorId: `reflection_${todayKey}`,
    });
  };

  // Handler for opening note dialog (unused but kept for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleOpenNoteDialog = (challenge: Challenge) => {
    setSelectedChallengeForNote(challenge);
    setNoteDialogOpen(true);
  };

  const handleCloseNoteDialog = () => {
    setNoteDialogOpen(false);
    setSelectedChallengeForNote(null);
  };

  const handleSaveNoteAndComplete = async () => {
    if (!selectedChallengeForNote) return;
    if (!currentUser) return;

    const challenge = userData.challenges.find(c => c.id === selectedChallengeForNote.id);
    if (!challenge) return;

    if (!note.trim()) {
      alert('Add a note before saving.');
      return;
    }

    const todayDayNumber = getChallengeCalendarDayIndex(challenge);

    if (todayDayNumber < 1 || todayDayNumber > challenge.duration) {
      alert('You are outside this challenge’s day range. Extend the duration if you need more time.');
      return;
    }

    if (hasMarkedTodayComplete(challenge)) {
      alert("You've already marked today's challenge as complete.");
      return;
    }

    try {
      const vectorId = await tryUpsertToPinecone({
        userId: currentUser.uid,
        type: 'note',
        content: note,
        metadata: {
          challengeId: selectedChallengeForNote.id,
          dayNumber: todayDayNumber,
          challengeName: selectedChallengeForNote.name,
          completionDate: new Date().toISOString(),
        }
      });

      const updatedChallenges = userData.challenges.map(c => {
        if (c.id !== selectedChallengeForNote.id) return c;
        return syncChallengeCompletedDays({
          ...c,
          notes: {
            ...(c.notes as Record<string, Note>),
            [`${todayDayNumber}`]: {
              content: note.trim(),
              ...(vectorId ? { vectorId } : {}),
            },
          },
        });
      });

      await updateChallenges(currentUser.uid, updatedChallenges);

      const fresh = updatedChallenges.find(c => c.id === selectedChallengeForNote.id);

      setUserData(prev => ({
        ...prev,
        challenges: updatedChallenges,
      }));

      setNoteDialogOpen(false);
      setNote('');
      setChallengeIdForNote(null);
      setSelectedChallengeForNote(null);

      if (fresh) {
        checkMilestoneAchievement(fresh);
        await upsertChallengeData(currentUser.uid, fresh);
      }
    } catch (error) {
      console.error('Error saving note and completing challenge:', error);
      alert('Could not save. Please try again.');
    }
  };

  // Edit today's note through pencil icon
  const handleOpenEditTodayNoteDialog = (challenge: Challenge) => {
    // Only proceed if we have completed the challenge for today
    if (!hasMarkedTodayComplete(challenge)) {
      alert("You haven't marked today's challenge as complete yet");
      return;
    }
    
    setEditTodayChallengeId(challenge.id);
    
    // Get today's day number for this challenge
    const todayDayNumber = getChallengeCalendarDayIndex(challenge);
    
    // Get the existing note for today
    const existingNote = challenge.notes[`${todayDayNumber}`]?.content || '';
    setEditTodayNote(existingNote);
    
    setEditTodayNoteDialogOpen(true);
  };

  // Save the edited note for today
  const handleSaveEditTodayNote = async () => {
    if (!currentUser || !editTodayChallengeId) return;
    
    const challenge = userData.challenges.find(c => c.id === editTodayChallengeId);
    if (!challenge) return;
    
    const todayDayNumber = getChallengeCalendarDayIndex(challenge);

    const prevVectorId =
      challenge.notes[`${todayDayNumber}`]?.vectorId ?? '';

    const updatedChallenges = userData.challenges.map(c => {
      if (c.id === editTodayChallengeId) {
        return syncChallengeCompletedDays({
          ...c,
          notes: {
            ...(c.notes as Record<string, Note>),
            [`${todayDayNumber}`]: {
              content: editTodayNote.trim(),
              vectorId: prevVectorId,
            },
          },
        });
      }
      return c;
    });
    
    try {
      // Update Firestore
      await updateChallenges(currentUser.uid, updatedChallenges);
      
      // Update Pinecone
      await updatePineconeNote({
        userId: currentUser.uid,
        type: 'note',
        id: `${editTodayChallengeId}_day${todayDayNumber}`,
        content: editTodayNote,
        oldVectorId: prevVectorId || undefined,
        metadata: {
          challengeId: editTodayChallengeId,
          challengeName: challenge.name,
          dayNumber: todayDayNumber,
          updateDate: new Date().toISOString(),
        }
      });

      // Update local state
      setUserData(prev => ({ ...prev, challenges: updatedChallenges }));
      
      setEditTodayNoteDialogOpen(false);
      setEditTodayChallengeId(null);
      setEditTodayNote('');
    } catch (error) {
      console.error('Error saving today\'s note:', error);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleDeleteAllDailyNotes = async () => {
    if (!currentUser) return;
    try {
      await updateDailyNotes(currentUser.uid, {});
      setUserData(prev => ({ ...prev, dailyNotes: {} }));
      setDeleteAllNotesDialogOpen(false);
    } catch (error) {
      console.error('Error deleting all daily notes:', error);
    }
  };

  // Effect to check for date change
  useEffect(() => {
    const checkDateChange = () => {
      const now = new Date();
      const currentDate = getLocalDateKey(now);
      
      if (currentDate !== lastKnownDate) {
        console.log('Date changed:', { lastKnownDate, currentDate });
        localStorage.setItem('lastKnownDate', currentDate);
        setLastKnownDate(currentDate);
        
        setUserData(prevData => ({
          ...prevData,
          challenges: prevData.challenges.map(challenge => ({
            ...challenge,
          }))
        }));
      }
    };

    const interval = setInterval(checkDateChange, 60000);
    checkDateChange();
    return () => clearInterval(interval);
  }, [lastKnownDate]);

  const handleAddChallenge = async () => {
    if (!currentUser) return;

    // Enforce unique challenge names (case-insensitive)
    const nameExists = userData.challenges.some(
      c => c.name.trim().toLowerCase() === newChallenge.name.trim().toLowerCase()
    );
    if (nameExists) {
      alert('A challenge with this name already exists. Please choose a unique name.');
      return;
    }

    if (parseInt(newChallenge.duration) > 365) {
      alert("Challenge duration cannot be more than 365 days");
      return;
    }

    const challenge: Challenge = {
      id: Date.now().toString(),
      name: newChallenge.name,
      duration: parseInt(newChallenge.duration),
      startDate: new Date().toISOString(),
      completedDays: 0,
      notes: {}
    };

    const updatedChallenges = [...userData.challenges, challenge];
    
    try {
      await updateChallenges(currentUser.uid, updatedChallenges);
      setUserData(prev => ({
        ...prev,
        challenges: updatedChallenges
      }));

      // After challenge is created successfully
      await upsertChallengeData(currentUser.uid, challenge);

    } catch (error) {
      console.error('Error adding challenge:', error);
    }

    setOpenDialog(false);
    setNewChallenge({ name: '', duration: '' });
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, challengeId: string) => {
    setChallengeIdForNote(challengeId);
    setNote(e.target.value);
  };

  if (loading) {
    return (
      <Container sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh' 
      }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        gap: 2
      }}>
        <Alert severity="error">{error}</Alert>
        <Button 
          variant="contained" 
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </Container>
    );
  }

  if (!userData.name) {
    return null;
  }

  return (
    <Container 
      maxWidth="lg" 
      sx={{ 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        pb: 10, // Add padding at bottom to make room for menu
        position: 'relative'
      }}
    >
      <ScrollToTop />
      
      {/* Fixed Header Section */}
      <Box 
        sx={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          bgcolor: 'background.default',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
          transition: 'backdrop-filter 0.3s, background 0.3s',
          backdropFilter: scrolled ? 'blur(3px)' : 'none',
          background: scrolled ? 'rgba(255,255,255,0.85)' : 'background.default',
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ py: { xs: 2, sm: 3 } }}>
            <Fade in={true} timeout={800}>
              <Box>
                {/* Header - Simplified without action buttons */}
                <Grid container spacing={2} alignItems="center">
                  {/* Avatar and Welcome message */}
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar 
                        sx={{ 
                          bgcolor: '#2ec4b6', 
                          width: 40, 
                          height: 40,
                          boxShadow: '0 4px 10px rgba(46, 196, 182, 0.3)'
                        }}
                      >
                        <LocalFireDepartmentIcon />
                      </Avatar>
                      {!isFirstVisit ? (
                        <Typography variant="h5" component="h1" 
                          sx={{ 
                            fontWeight: 700,
                            background: 'linear-gradient(90deg, #2ec4b6, #ff9f1c)',
                            backgroundClip: 'text',
                            textFillColor: 'transparent',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' }
                          }}
                        >
                          Welcome, {toTitleCase(userData.name)}!
                        </Typography>
                      ) : (
                        <Box 
                          component="h1"
                          sx={{ 
                            fontWeight: 700,
                            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
                            m: 0,
                            background: 'linear-gradient(90deg, #2ec4b6, #ff9f1c)',
                            backgroundClip: 'text',
                            textFillColor: 'transparent',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                          }}
                        >
                          <TypingAnimation
                            text={`Welcome, ${toTitleCase(userData.name)}!`}
                            delay={500}
                            speed={50}
                          />
                        </Box>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Fade>
          </Box>

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={currentTab} 
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                '& .MuiTab-root': {
                  minWidth: { xs: 100, sm: 120 },
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: { xs: '0.875rem', sm: '1rem' },
                }
              }}
            >
              <Tab 
                label="Active Challenges" 
              />
              <Tab 
                label="Info" 
              />
              <Tab 
                label="Notes History" 
              />
              <Tab 
                label="Archives" 
              />
            </Tabs>
          </Box>
        </Container>
      </Box>

      {/* Scrollable Content Section */}
      <Box 
        sx={{ 
          flexGrow: 1,
          mt: { xs: '140px', sm: '150px' }, // Reduced from 180px/200px
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Tab Panels */}
        {currentTab === 0 && (
          <Grid container spacing={3}>
            {/* Daily Note Card - Moved to top */}
            <Grid item xs={12}>
              <Paper 
                elevation={3} 
                sx={{ 
                  p: 3, 
                  mb: 3, // Reduced from mb: 4
                  borderRadius: 3, 
                  background: 'linear-gradient(135deg, rgba(46, 196, 182, 0.03) 0%, rgba(249, 132, 74, 0.03) 100%)',
                  border: '1px solid rgba(46, 196, 182, 0.1)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                  '&:hover': {
                    boxShadow: '0 8px 32px 0 rgba(46,196,182,0.16)',
                    transform: 'translateY(-2px) scale(1.02)',
                    background: 'linear-gradient(135deg, #e0fcff 0%, #f8fafc 100%)',
                  }
                }}
              >
                <Box sx={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', opacity: 0.03 }}>
                  <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <path d="M0,0 L100,0 L100,100 Z" fill="#2ec4b6" />
                  </svg>
                </Box>
                <Box 
                    sx={{ 
                      display: 'flex',
                    flexDirection: 'column',
                    mb: 2, 
                    gap: { xs: 0.5, sm: 0 }
                    }}
                  >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <EditNoteIcon sx={{ color: '#2ec4b6', fontSize: { xs: 22, sm: 28 }, mr: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.25rem' }, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Today&apos;s Reflection
                    </Typography>
                    {userData.dailyNotes && userData.dailyNotes[today] && (
                      <Box sx={{ display: 'flex', gap: 1, ml: 1 }}>
                    <Tooltip title="Edit Reflection">
                      <IconButton 
                        size="small" 
                        color="primary"
                            onClick={() => {
                              setDailyNote(userData.dailyNotes[today] || '');
                              setDailyNoteDialog(true);
                            }}
                      >
                        <EditNoteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Reflection">
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => setDeleteNoteDialogOpen(true)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                    )}
                  </Box>
                  <Typography 
                    component="span" 
                    variant="caption" 
                    sx={{ 
                      color: 'text.secondary',
                      fontWeight: 400,
                      fontSize: { xs: '0.98rem', sm: '1rem' },
                      mt: 0.5,
                      ml: { xs: 4, sm: 0 },
                      display: 'block'
                    }}
                  >
                    {getFormattedDate()}
                  </Typography>
                </Box>
                {userData.dailyNotes && userData.dailyNotes[today] ? (
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.7,
                      color: 'text.secondary',
                      position: 'relative',
                      zIndex: 1
                    }}
                  >
                    {userData.dailyNotes[today]}
                  </Typography>
                ) : (
                  <Button
                    variant="outlined"
                    startIcon={<EditNoteIcon />}
                    onClick={() => {
                      setDailyNote(userData.dailyNotes[today] || '');
                      setDailyNoteDialog(true);
                    }}
                    sx={{ 
                      width: '100%',
                      py: 2,
                      borderStyle: 'dashed',
                      color: 'text.secondary'
                    }}
                  >
                    Add your reflection for today
                  </Button>
                )}
              </Paper>
            </Grid>

            {/* Challenge Cards */}
            {/* Challenge Cards (active only) */}
            {activeChallenges.map((challenge, index) => (
              <Zoom 
                in={true} 
                style={{ transitionDelay: `${index * 100}ms` }}
                key={challenge.id}
              >
                <Grid item xs={12} sm={6} md={4} className="animate-in">
                  <Card sx={{ 
                    height: '100%', 
                    display: 'flex', 
                    flexDirection: 'column',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #e3f6f5 100%)',
                    boxShadow: '0 4px 24px 0 rgba(46,196,182,0.08)',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    borderRadius: 4,
                    '&:hover': {
                      boxShadow: '0 8px 32px 0 rgba(46,196,182,0.16)',
                      transform: 'translateY(-2px) scale(1.02)',
                      background: 'linear-gradient(135deg, #e0fcff 0%, #f8fafc 100%)',
                    }
                  }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Avatar 
                            sx={{ 
                              width: 32, 
                              height: 32, 
                              bgcolor: 'secondary.main',
                              fontSize: '0.8rem'
                            }}
                          >
                            {getChallengeIcon(challenge.name)}
                          </Avatar>
                          <Typography 
                            variant="h6" 
                            sx={{ fontWeight: 600, fontSize: '1.1rem' }}
                          >
                            {challenge.name}
                          </Typography>
                        </Box>
                        <Box>
                          {hasMarkedTodayComplete(challenge) ? (
                            <Tooltip title="Challenge Options">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={(e) => handleOpenLogMenu(e, challenge.id)}
                                sx={{ mr: 1 }}
                              >
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                          <Tooltip title="Delete Challenge">
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => handleDeleteChallenge(challenge.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                      
                      <Box sx={{ mb: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <Typography color="text.secondary" variant="body2">
                            Progress:
                          </Typography>
                          <Typography 
                            fontWeight={600} 
                            variant="body2"
                            color={getProgressPercentage(challenge) >= 100 ? 'success.main' : 'primary.main'}
                          >
                            {getProgressPercentage(challenge)}%
                          </Typography>
                          {getProgressPercentage(challenge) >= 100 && (
                            <Chip 
                              icon={<EmojiEventsIcon />} 
                              label="Completed!" 
                              size="small" 
                              color="success" 
                              sx={{ height: 24 }}
                            />
                          )}
                        </Stack>
                        
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min(getProgressPercentage(challenge), 100)} 
                          sx={{ 
                            height: 8, 
                            borderRadius: 4,
                            mb: 2,
                            bgcolor: 'rgba(0,0,0,0.05)',
                            '& .MuiLinearProgress-bar': {
                              background: getProgressPercentage(challenge) >= 100 
                                ? 'linear-gradient(90deg, #2a9d8f, #2ec4b6)' 
                                : 'linear-gradient(90deg, #f9844a, #ff9f1c)'
                            }
                          }}
                        />
                        
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                            <Chip
                              label={hasMarkedTodayComplete(challenge)
                                ? `Day ${getCurrentDayForChallenge(challenge)} of ${challenge.duration} ✅`
                                : `Day ${getCurrentDayForChallenge(challenge)} of ${challenge.duration}`}
                              size="small"
                              color={hasMarkedTodayComplete(challenge) ? 'success' : 'primary'}
                              variant={hasMarkedTodayComplete(challenge) ? 'filled' : 'outlined'}
                              sx={{ borderRadius: 1, height: 28, fontWeight: hasMarkedTodayComplete(challenge) ? 600 : 400 }}
                            />
                          
                          {(() => {
                            const streak = getLoggedStreakForChallenge(challenge);
                            return (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1 }}>
                                <LocalFireDepartmentIcon sx={{ color: streak > 0 ? 'orange' : 'grey.400', fontSize: 20 }} />
                                <Typography variant="body2" fontWeight={600} color={streak > 0 ? 'orange' : 'text.secondary'}>
                                  {streak > 0 ? `${streak}-day streak` : 'No streak'}
                                </Typography>
                              </Box>
                            );
                          })()}
                          <Tooltip title="Update Duration">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => {
                                setSelectedChallengeId(challenge.id);
                                setNewDuration(challenge.duration.toString());
                                setUpdateDurationDialog(true);
                              }}
                            >
                              <DateRangeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                        
                        {/* Add start and end dates */}
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Start: {new Date(challenge.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            End: {formatChallengeWindowEndCalendarDisplay(challenge)}
                          </Typography>
                        </Stack>
                      </Box>
                      
                      {hasMarkedTodayComplete(challenge) && (
                        <Alert 
                          icon={<CheckCircleIcon fontSize="inherit" />}
                          severity="success" 
                          sx={{ 
                            mt: 2, 
                            fontSize: '0.8rem',
                            borderRadius: 2,
                            '& .MuiAlert-icon': {
                              opacity: 1,
                              color: 'success.main'
                            }
                          }}
                        >
                          <b>ONE DAY AT A TIME! ✅</b>
                        </Alert>
                      )}
                    </CardContent>
                    <CardActions sx={{ p: 2, pt: 0, display: 'flex', alignItems: 'center' }}>
                      {hasMarkedTodayComplete(challenge) ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                          <Box sx={{ mr: 1, flex: 1 }}>
                            <Typography variant="body2" color="text.secondary" noWrap sx={{ fontStyle: 'italic' }}>
                              {challenge.notes[`${getChallengeCalendarDayIndex(challenge)}`]?.content
                                ? challenge.notes[`${getChallengeCalendarDayIndex(challenge)}`]?.content.length > 30
                                  ? challenge.notes[`${getChallengeCalendarDayIndex(challenge)}`]?.content.substring(0, 30) + '...'
                                  : challenge.notes[`${getChallengeCalendarDayIndex(challenge)}`]?.content
                                : 'Note not added'
                              }
                            </Typography>
                          </Box>
                          <Tooltip title="Edit today's note">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handleOpenEditTodayNoteDialog(challenge)}
                            >
                              <EditNoteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                          <Box 
                            component="textarea" 
                            placeholder="Add a note..." 
                            value={challengeIdForNote === challenge.id ? note : ''} 
                            onChange={(e) => handleNoteChange(e, challenge.id)}
                            rows={1}
                            sx={{ 
                              flex: 1,
                              mr: 1, 
                              p: 1.5,
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              fontSize: '16px',
                              minHeight: '30px',    // optional: ensures a decent starting height
                              maxHeight: '120px',   // optional: limits the height
                              resize: 'none', // optional: allows user to resize vertically
                              overflow: 'auto', 
                              lineHeight: 1.5,
                              boxSizing: 'border-box',
                              '&:focus': {
                                outline: 'none',
                                borderColor: 'primary.main'
                              },
                              '::placeholder': {
                                fontStyle: 'italic', // <-- This makes the placeholder italic
                                color: 'text.secondary', // Optional: use theme's secondary text color
                                opacity: 1, // Ensures the color is applied
                              }
                            }}
                            onInput={e => {
                              e.currentTarget.style.height = '40px'; // Reset to min height
                              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                            }}
                          />
                          <Button
                            size="medium"
                            variant="contained"
                            color="primary"
                            onClick={() => handleMarkComplete(challenge.id)}
                            disabled={
                              challengeIdForNote !== challenge.id ||
                              !note.trim() ||
                              getChallengeCalendarDayIndex(challenge) < 1 ||
                              getChallengeCalendarDayIndex(challenge) > challenge.duration
                            }
                            sx={{ 
                              whiteSpace: 'nowrap',
                              minWidth: 'auto',
                              px: 1.5
                            }}
                          >
                            <CheckCircleIcon sx={{ mr: 0.5 }} fontSize="small" /> 
                            Done
                          </Button>
                        </Box>
                      )}
                    </CardActions>
                  </Card>
                </Grid>
              </Zoom>
            ))}
            {activeChallenges.length === 0 && userData.challenges.length > 0 && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  No challenge is currently within days 1 through its duration (today is past the last day for each one).{' '}
                  Open <Box component="span" sx={{ fontWeight: 700 }}>Archives</Box>, or start a new challenge from the + menu.
                </Alert>
              </Grid>
            )}
          </Grid>
        )}
        {currentTab === 1 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Active challenges are listed first; ones whose calendar window has ended appear after. Click a card for details.
            </Typography>
            {userData.challenges.length === 0 ? (
              <Paper
                sx={{
                  p: 4,
                  textAlign: 'center',
                  borderRadius: 3,
                  bgcolor: 'background.default',
                  border: '1px dashed',
                  borderColor: 'divider',
                }}
              >
                <Typography color="text.secondary">No challenges yet. Add one from the + menu.</Typography>
              </Paper>
            ) : (
            <Grid container spacing={3}>
              {[...userData.challenges]
                .sort((a, b) => {
                  const aPast = isChallengePastCalendarDuration(a);
                  const bPast = isChallengePastCalendarDuration(b);
                  if (aPast === bPast) return 0;
                  return aPast ? 1 : -1;
                })
                .map((challenge) => {
                const streak = getLoggedStreakForChallenge(challenge);
                const pastWindow = isChallengePastCalendarDuration(challenge);
                const fullyFilled = challenge.completedDays >= challenge.duration;
                return (
                  <Grid item xs={12} sm={6} md={4} key={challenge.id}>
                    <Paper
                      elevation={4}
                      sx={{
                        p: 0,
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #e3f6f5 100%)',
                        boxShadow: '0 4px 24px 0 rgba(46,196,182,0.08)',
                        transition: 'box-shadow 0.2s, transform 0.2s',
                        '&:hover': {
                          boxShadow: '0 8px 32px 0 rgba(46,196,182,0.16)',
                          transform: 'translateY(-2px) scale(1.02)',
                          background: 'linear-gradient(135deg, #e0fcff 0%, #f8fafc 100%)',
                        },
                      }}
                      onClick={() => { setPreviewChallenge(challenge); setPreviewOpen(true); }}
                    >
                      <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 3, pb: 2 }}>
                        <Avatar sx={{
                          bgcolor: fullyFilled ? 'success.main' : pastWindow ? 'grey.600' : 'primary.main',
                          color: 'white',
                          width: 48,
                          height: 48,
                          fontSize: 28,
                          boxShadow: '0 2px 8px 0 rgba(46,196,182,0.10)',
                        }}>
                          {getChallengeIcon(challenge.name)}
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                            <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary', fontSize: '1.15rem' }}>
                              {challenge.name}
                            </Typography>
                            {fullyFilled ? (
                              <Chip label="All days logged" size="small" color="success" sx={{ height: 22 }} />
                            ) : pastWindow ? (
                              <Chip label="Window ended" size="small" color="warning" variant="outlined" sx={{ height: 22 }} />
                            ) : (
                              <Chip label="Active window" size="small" variant="outlined" color="primary" sx={{ height: 22 }} />
                            )}
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            Days completed: <b>{challenge.completedDays}</b> / {challenge.duration}
                          </Typography>
                          <Chip
                            label={streak > 0 ? `Streak: ${streak} day${streak > 1 ? 's' : ''}` : 'No streak'}
                            color={streak > 0 ? 'warning' : 'default'}
                            size="small"
                            icon={<LocalFireDepartmentIcon sx={{ color: streak > 0 ? 'orange' : 'grey.400' }} />}
                            sx={{ fontWeight: 600, bgcolor: streak > 0 ? 'rgba(255,193,7,0.12)' : 'grey.100', color: streak > 0 ? 'orange' : 'text.secondary', mt: 0.5 }}
                          />
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Start: {new Date(challenge.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              End: {formatChallengeWindowEndCalendarDisplay(challenge)}
                            </Typography>
                          </Stack>
                        </Box>
                      </Stack>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
            )}
          </Box>
        )}
        {currentTab === 2 && (
          <Box sx={{ mt: 4 }}>
            <NotesHistoryPage />
          </Box>
        )}
        {currentTab === 3 && (
          <Box sx={{ mt: 4 }}>
            {archivedChallenges.length === 0 ? (
              <Paper
                sx={{
                  p: 4,
                  textAlign: 'center',
                  borderRadius: 3,
                  bgcolor: 'background.default',
                  border: '1px dashed',
                  borderColor: 'divider',
                }}
              >
                <Typography color="text.secondary">
                  Nothing here yet. A 10‑day challenge appears after calendar day 11 (even if you only logged some days)—while you&apos;re still on days 1–10 it stays under Active Challenges.
                </Typography>
              </Paper>
            ) : (
              <Grid container spacing={3}>
                {archivedChallenges.map((challenge) => {
                  const streak = getLoggedStreakForChallenge(challenge);
                  const fullyFilled = challenge.completedDays >= challenge.duration;
                  return (
                    <Grid item xs={12} sm={6} md={4} key={challenge.id}>
                      <Paper
                        elevation={4}
                        sx={{
                          p: 0,
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: fullyFilled
                            ? 'linear-gradient(135deg, #f0fdf9 0%, #e8f5f4 100%)'
                            : 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                          boxShadow: '0 4px 24px 0 rgba(46,196,182,0.12)',
                          border: fullyFilled
                            ? '1px solid rgba(46,196,182,0.2)'
                            : '1px solid rgba(0,0,0,0.08)',
                          transition: 'box-shadow 0.2s, transform 0.2s',
                          '&:hover': {
                            boxShadow: '0 8px 32px 0 rgba(46,196,182,0.2)',
                            transform: 'translateY(-2px) scale(1.02)',
                          },
                        }}
                        onClick={() => { setPreviewChallenge(challenge); setPreviewOpen(true); }}
                      >
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 3, pb: 2 }}>
                          <Avatar sx={{
                            bgcolor: fullyFilled ? 'success.main' : 'grey.600',
                            color: 'white',
                            width: 48,
                            height: 48,
                            fontSize: 28,
                            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.12)',
                          }}>
                            {getChallengeIcon(challenge.name)}
                          </Avatar>
                          <Box sx={{ flexGrow: 1 }}>
                            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                              <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary', fontSize: '1.15rem' }}>
                                {challenge.name}
                              </Typography>
                              {fullyFilled ? (
                                <Chip label="All days logged" size="small" color="success" sx={{ height: 22 }} />
                              ) : (
                                <Chip label="Window ended" size="small" color="warning" variant="outlined" sx={{ height: 22 }} />
                              )}
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              Days completed:{' '}
                              <b>{challenge.completedDays}</b> / {challenge.duration}
                            </Typography>
                            <Chip
                              label={streak > 0 ? `Streak: ${streak} day${streak > 1 ? 's' : ''}` : 'No streak'}
                              color={streak > 0 ? 'warning' : 'default'}
                              size="small"
                              icon={<LocalFireDepartmentIcon sx={{ color: streak > 0 ? 'orange' : 'grey.400' }} />}
                              sx={{ fontWeight: 600, bgcolor: streak > 0 ? 'rgba(255,193,7,0.12)' : 'grey.100', color: streak > 0 ? 'orange' : 'text.secondary', mt: 0.5 }}
                            />
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                              <Typography variant="caption" color="text.secondary">
                                Start: {new Date(challenge.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                End: {formatChallengeWindowEndCalendarDisplay(challenge)}
                              </Typography>
                            </Stack>
                          </Box>
                        </Stack>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Box>
        )}
        <Dialog
          open={previewOpen && !!previewChallenge}
          onClose={() => setPreviewOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle>
            <Typography variant="h6" fontWeight={700}>{previewChallenge?.name}</Typography>
          </DialogTitle>
          <DialogContent>
            {previewChallenge && (
              <Box sx={{ mt: 2 }}>
                <Grid container spacing={1}>
                  {Array.from({ length: previewChallenge.duration }).map((_, i) => {
                    const dayNum = i + 1;
                    const startDate = new Date(previewChallenge.startDate);
                    const cellDate = new Date(startDate.getTime());
                    cellDate.setDate(startDate.getDate() + i);
                    const isLogged = Boolean(
                      previewChallenge.notes[`${dayNum}`]?.content?.trim()
                    );
                    const note = previewChallenge.notes[`${dayNum}`];
                    const tooltipContent = note
                      ? (<Box sx={{p:1}}><Typography variant="caption" fontWeight={600}>{cellDate.toLocaleDateString()}</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap'}}>{note.content}</Typography></Box>)
                      : cellDate.toLocaleDateString();
                    return (
                      <Grid item xs={2} sm={1} key={dayNum}>
                        {isMobile ? (
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              bgcolor: isLogged ? 'primary.main' : 'background.paper',
                              color: isLogged ? 'common.white' : 'text.secondary',
                              borderRadius: 2.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '1.05rem',
                              cursor: 'pointer',
                              border: isLogged ? '2.5px solid #2ec4b6' : '1.5px solid #e0e0e0',
                              boxShadow: isLogged ? '0 2px 8px 0 rgba(46,196,182,0.10)' : 'none',
                              transition: 'background 0.2s, color 0.2s, box-shadow 0.2s',
                              '&:active': {
                                boxShadow: '0 0 0 2px #2ec4b6',
                              },
                            }}
                            onClick={() => { setCellDialogContent({date: cellDate.toLocaleDateString(), note: note?.content || ''}); setCellDialogOpen(true); }}
                          >
                            {dayNum}
                          </Box>
                        ) : (
                          <Tooltip title={tooltipContent} arrow>
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                bgcolor: isLogged ? 'primary.main' : 'background.paper',
                                color: isLogged ? 'common.white' : 'text.secondary',
                                borderRadius: 2.5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '1.05rem',
                                cursor: 'pointer',
                                border: isLogged ? '2.5px solid #2ec4b6' : '1.5px solid #e0e0e0',
                                boxShadow: isLogged ? '0 2px 8px 0 rgba(46,196,182,0.10)' : 'none',
                                transition: 'background 0.2s, color 0.2s, box-shadow 0.2s',
                                '&:hover': {
                                  boxShadow: isLogged ? '0 0 0 2px #2ec4b6' : '0 0 0 2px #e0e0e0',
                                  bgcolor: isLogged ? 'primary.dark' : 'grey.100',
                                },
                              }}
                            >
                              {dayNum}
                            </Box>
                          </Tooltip>
                        )}
                      </Grid>
                    );
                  })}
                </Grid>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 3, mb: 1 }}>
                  <Box sx={{ width: 24, height: 24, bgcolor: 'primary.main', borderRadius: 1, border: '2px solid #2ec4b6', mr: 1 }} />
                  <Typography variant="body2" color="text.secondary">Logged Day</Typography>
                  <Box sx={{ width: 24, height: 24, bgcolor: 'background.paper', borderRadius: 1, border: '1.5px solid #e0e0e0', ml: 3, mr: 1 }} />
                  <Typography variant="body2" color="text.secondary">Not Logged</Typography>
                </Stack>
              </Box>
            )}
          </DialogContent>
        </Dialog>

        {/* Empty state when no challenges */}
        {userData.challenges.length === 0 && currentTab === 0 && (
          <Fade in={true} timeout={800}>
            <Paper
              sx={{
                textAlign: 'center',
                py: 6,
                px: 4,
                mt: 4,
                borderRadius: 3,
                bgcolor: 'rgba(58, 134, 255, 0.03)',
                border: '1px dashed rgba(58, 134, 255, 0.3)'
              }}
            >
              <Avatar
                sx={{
                  width: 60,
                  height: 60,
                  bgcolor: 'primary.main',
                  margin: '0 auto',
                  mb: 2
                }}
              >
                <FitnessCenterIcon />
              </Avatar>
              <Typography variant="h6" gutterBottom>
                No Challenges Yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: '400px', mx: 'auto' }}>
                Start building resilience by adding your first challenge.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenDialog(true)}
              >
                Add Your First Challenge
              </Button>
            </Paper>
          </Fade>
        )}

        {/* Log Options Menu */}
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleCloseLogMenu}
          PaperProps={{
            elevation: 3,
            sx: { borderRadius: 2, minWidth: 180 }
          }}
        >
          {/* Removed Edit Note button from menu */}
          <MenuItem onClick={handleDeleteLog} sx={{ py: 1.5 }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1, color: 'error.main' }} />
            Remove Log
          </MenuItem>
        </Menu>

        {/* Daily Note Dialog */}
        <Dialog 
          open={dailyNoteDialog} 
          onClose={() => setDailyNoteDialog(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 3 }
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <EditNoteIcon fontSize="small" />
              </Avatar>
              <Typography variant="h6" fontWeight={600} component="span">
                Daily Reflection - {getFormattedDate()}
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
              Record your thoughts, reflections, and how you felt today about your challenges.
            </Typography>
            <TextField
              id="daily-reflection"
              name="dailyReflection"
              autoFocus
              fullWidth
              multiline
              minRows={8}
              maxRows={15}
              variant="outlined"
              placeholder="How was your day? What did you learn? How did you feel?"
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'rgba(0, 0, 0, 0.01)'
                }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setDailyNoteDialog(false)}>Cancel</Button>
            <Button onClick={handleDailyNoteSubmit} variant="contained" color="primary">
              Save
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete all challenges */}
        <Dialog
          open={resetDialogOpen}
          onClose={() => setResetDialogOpen(false)}
          PaperProps={{
            sx: { borderRadius: 3, maxWidth: '500px', width: '100%' }
          }}
        >
          <DialogTitle sx={{ color: 'error.main' }}>Delete all challenges?</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This cannot be undone.
            </Alert>
            <Typography>
              This removes every challenge and its logged days from your account.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setResetDialogOpen(false)} variant="outlined">Cancel</Button>
            <Button onClick={handleDeleteAllChallenges} color="error" variant="contained">
              Delete all challenges
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Challenge Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          PaperProps={{
            sx: { borderRadius: 3, maxWidth: '500px', width: '100%' }
          }}
        >
          <DialogTitle sx={{ pb: 0 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'error.light', width: 32, height: 32 }}>
                <WarningAmberIcon fontSize="small" />
              </Avatar>
              <Typography variant="h6" fontWeight={600} component="span">Delete Challenge</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
              This action cannot be undone!
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Are you sure you want to delete this challenge? All progress and notes will be permanently lost.
            </Typography>
            {challengeToDelete && (
              <Paper 
                elevation={0} 
                sx={{ 
                  p: 2, 
                  mt: 3,
                  borderRadius: 2,
                  bgcolor: 'rgba(0,0,0,0.02)',
                  border: '1px solid rgba(0,0,0,0.08)'
                }}
              >
                <Typography variant="body2" fontWeight={600}>
                  {userData.challenges.find(c => c.id === challengeToDelete)?.name}
                </Typography>
              </Paper>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button 
              onClick={() => setDeleteDialogOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmDeleteChallenge} 
              variant="contained" 
              color="error"
              startIcon={<DeleteIcon />}
            >
              Delete Challenge
            </Button>
          </DialogActions>
        </Dialog>

        {/* Add Challenge Dialog */}
        <Dialog 
          open={openDialog} 
          onClose={() => setOpenDialog(false)}
          PaperProps={{
            sx: { borderRadius: 3, maxWidth: '500px', width: '100%' }
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <FitnessCenterIcon fontSize="small" />
              </Avatar>
              <Typography variant="h6" fontWeight={600} component="span">Add New Challenge</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Define a new challenge to build your resilience muscles.
            </Typography>
            <TextField
              id="add-challenge-name"
              name="challengeName"
              margin="dense"
              label="Challenge Name"
              fullWidth
              value={newChallenge.name}
              onChange={(e) => setNewChallenge({ ...newChallenge, name: e.target.value.slice(0, 30) })}
              sx={{ mb: 2 }}
              inputProps={{ maxLength: 30 }}
              helperText={`${newChallenge.name.length}/30 characters`}
            />
            <TextField
              id="add-challenge-duration"
              name="challengeDuration"
              margin="dense"
              label="Duration (days)"
              type="number"
              fullWidth
              value={newChallenge.duration}
              onChange={(e) => setNewChallenge({ ...newChallenge, duration: e.target.value })}
              inputProps={{ min: 10, max: 365 }}
              helperText="Challenge duration must be between 10 and 365 days"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleAddChallenge} 
              variant="contained" 
              disabled={!newChallenge.name || !newChallenge.duration || parseInt(newChallenge.duration) < 10 || parseInt(newChallenge.duration) > 365}
            >
              Add Challenge
            </Button>
          </DialogActions>
        </Dialog>

        {/* Milestone Achievement Dialog */}
        <Dialog
          open={Boolean(showMilestone)}
          onClose={() => setShowMilestone(null)}
          PaperProps={{
            sx: { 
              borderRadius: 3,
              maxWidth: '400px',
              width: '100%',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8faff 100%)',
              position: 'relative',
              overflow: 'hidden'
            }
          }}
        >
          {showMilestone && (
            <>
              <Box 
                sx={{ 
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '150px',
                  height: '150px',
                  background: `radial-gradient(circle at top right, ${showMilestone.milestone.color}15, transparent 70%)`,
                  zIndex: 0
                }}
              />
              <DialogContent sx={{ textAlign: 'center', py: 4, position: 'relative', zIndex: 1 }}>
                <Zoom in={true}>
                  <Avatar
                    sx={{
                      width: 80,
                      height: 80,
                      bgcolor: `${showMilestone.milestone.color}15`,
                      color: showMilestone.milestone.color,
                      margin: '0 auto 16px',
                      border: `2px solid ${showMilestone.milestone.color}40`,
                    }}
                  >
                    {showMilestone.milestone.icon}
                  </Avatar>
                </Zoom>
                <Fade in={true} timeout={1000}>
                  <Box>
                    <Typography 
                      variant="h5" 
                      gutterBottom 
                      sx={{ 
                        fontWeight: 700,
                        color: showMilestone.milestone.color
                      }}
                    >
                      {showMilestone.milestone.title}
                    </Typography>
                    <Typography 
                      variant="h6" 
                      gutterBottom
                      sx={{ fontWeight: 600 }}
                    >
                      {showMilestone.milestone.percentage}% Complete!
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      {showMilestone.milestone.description}
                    </Typography>
                    <Typography 
                      variant="body2" 
                      color="text.secondary" 
                      sx={{ mt: 2, fontStyle: 'italic' }}
                    >
                      {userData.challenges.find(c => c.id === showMilestone.challengeId)?.name}
                    </Typography>
                  </Box>
                </Fade>
              </DialogContent>
              <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
                <Button 
                  onClick={() => setShowMilestone(null)}
                  variant="contained"
                  sx={{
                    bgcolor: showMilestone.milestone.color,
                    '&:hover': {
                      bgcolor: `${showMilestone.milestone.color}dd`
                    }
                  }}
                >
                  Keep Going!
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>

        {/* Update Duration Dialog */}
        <Dialog
          open={updateDurationDialog}
          onClose={() => setUpdateDurationDialog(false)}
          PaperProps={{
            sx: { borderRadius: 3, maxWidth: '500px', width: '100%' }
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <DateRangeIcon fontSize="small" />
              </Avatar>
              <Typography variant="h6" fontWeight={600} component="span">Update Challenge Duration</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Set a new duration for your challenge. The duration must be at least 10 days and cannot be more than 365 days.
            </Typography>
            <TextField
              id="update-challenge-duration"
              name="updateChallengeDuration"
              autoFocus
              fullWidth
              type="number"
              label="New Duration (days)"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              inputProps={{ min: 10, max: 365 }}
              helperText="Duration must be between 10 and 365 days"
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setUpdateDurationDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleUpdateDuration}
              variant="contained"
              disabled={!newDuration || parseInt(newDuration) < 10 || parseInt(newDuration) > 365}
            >
              Update Duration
            </Button>
          </DialogActions>
        </Dialog>

        {/* Sign Out Dialog */}
        <Dialog
          open={signOutDialogOpen}
          onClose={() => setSignOutDialogOpen(false)}
          PaperProps={{
            sx: { borderRadius: 3, maxWidth: '500px', width: '100%' }
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <LogoutIcon fontSize="small" />
              </Avatar>
              <Typography variant="h6" fontWeight={600} component="span">Sign Out</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              Are you sure you want to sign out? You can always sign back in later with your name.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setSignOutDialogOpen(false)} variant="outlined">
              Cancel
            </Button>
            <Button onClick={confirmSignOut} variant="contained" color="primary" startIcon={<LogoutIcon />}>
              Sign Out
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Note Confirmation Dialog */}
        <Dialog
          open={deleteNoteDialogOpen}
          onClose={() => setDeleteNoteDialogOpen(false)}
          PaperProps={{
            sx: { borderRadius: 3 }
          }}
        >
          <DialogTitle>
            <Typography variant="h6" fontWeight={600} component="span">Delete Daily Reflection</Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1">
              Are you sure you want to delete today&apos;s reflection? This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setDeleteNoteDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleDeleteDailyNote} 
              variant="contained" 
              color="error"
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Add Note Dialog */}
        <Dialog
          open={noteDialogOpen}
          onClose={handleCloseNoteDialog}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 3 }
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <EditNoteIcon fontSize="small" />
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight={600} component="span">
                  Add Note for Challenge
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedChallengeForNote?.name}
                </Typography>
              </Box>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
              Write your thoughts, progress, and reflections about today&apos;s challenge.
            </Typography>
            <TextField
              id="add-note-dialog"
              name="addNoteDialog"
              autoFocus
              fullWidth
              multiline
              minRows={8}
              maxRows={15}
              variant="outlined"
              placeholder="How did you do today? What challenges did you face? What did you learn?"
              value={note}
              onChange={(e) => selectedChallengeForNote && handleNoteChange(e, selectedChallengeForNote.id)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'rgba(0, 0, 0, 0.01)'
                }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleCloseNoteDialog}>Cancel</Button>
            <Button 
              onClick={handleSaveNoteAndComplete}
              variant="contained" 
              color="primary"
              disabled={
                !selectedChallengeForNote ||
                !note.trim() ||
                (() => {
                  const c = userData.challenges.find(x => x.id === selectedChallengeForNote!.id);
                  if (!c) return true;
                  const d = getChallengeCalendarDayIndex(c);
                  if (d < 1 || d > c.duration) return true;
                  const prev = (c.notes[`${d}`]?.content ?? '').trim();
                  return note.trim() === prev;
                })()
              }
            >
              Save & Complete Challenge
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Today's Note Dialog */}
        <Dialog
          open={editTodayNoteDialogOpen}
          onClose={() => setEditTodayNoteDialogOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <EditNoteIcon fontSize="small" />
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight={600} component="span">
                  Edit Today&apos;s Note for <i>{userData.challenges.find(c => c.id === editTodayChallengeId)?.name}</i> Challenge
                </Typography>
              </Box>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
              Record your thoughts, reflections, and how you felt today.
            </Typography>
            <TextField
              id="edit-today-note"
              name="editTodayNote"
              autoFocus
              fullWidth
              multiline
              minRows={8}
              maxRows={15}
              variant="outlined"
              placeholder="How did you do today? What challenges did you face? What did you learn?"
              value={editTodayNote}
              onChange={(e) => setEditTodayNote(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'rgba(0, 0, 0, 0.01)'
                }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setEditTodayNoteDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveEditTodayNote}
              variant="contained" 
              color="primary"
              disabled={
                !editTodayNote.trim() ||
                (() => {
                  const c = userData.challenges.find(x => x.id === editTodayChallengeId);
                  if (!c || !editTodayChallengeId) return false;
                  const d = getChallengeCalendarDayIndex(c);
                  const prev = (c.notes[`${d}`]?.content ?? '').trim();
                  return prev === editTodayNote.trim();
                })()
              }
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      
      {/* Custom Menu */}
      <ClickAwayListener onClickAway={() => { if (menuOpen) setMenuOpen(false); }}>
      <Box
        sx={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 1
        }}
      >
        {menuOpen && (
          <Grow in={menuOpen}>
            <Paper
              elevation={3}
              sx={{
                mb: 2,
                borderRadius: 2,
                overflow: 'hidden',
                background: 'white'
              }}
            >
              <Stack spacing={1} sx={{ p: 1 }}>
                {menuActions.map((action) => (
                  <ButtonBase
                    key={action.name}
                    onClick={() => {
                      setMenuOpen(false);
                      action.onClick();
                    }}
                    sx={{
                      width: '100%',
                      borderRadius: 1,
                      overflow: 'hidden',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: action.color === 'error' ? 'error.light' : 'primary.light',
                      }
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        width: '100%',
                        color: action.color === 'error' ? 'error.main' : 'primary.main',
                        '&:hover': {
                          color: action.color === 'error' ? 'white' : 'white',
                        }
                      }}
                    >
                      {action.icon}
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          minWidth: 120
                        }}
                      >
                        {action.name}
                      </Typography>
                    </Box>
                  </ButtonBase>
                ))}
              </Stack>
            </Paper>
          </Grow>
        )}
        
        <Fab
          color="primary"
          onClick={() => setMenuOpen(!menuOpen)}
          sx={{
            width: 56,
            height: 56,
            background: 'linear-gradient(135deg, #2ec4b6, #2a9d8f)',
            '&:hover': {
              background: 'linear-gradient(135deg, #2a9d8f, #2ec4b6)'
            },
            boxShadow: '0 4px 20px rgba(46, 196, 182, 0.3)',
          }}
        >
          <MenuIcon />
        </Fab>
      </Box>
      </ClickAwayListener>
      
      {/* Wrap ChatAssistant in ErrorBoundary */}
      <ErrorBoundary>
        <ChatAssistant userData={userData} />
      </ErrorBoundary>

      

      {isMobile && (
        <Dialog open={cellDialogOpen && !!cellDialogContent} onClose={() => setCellDialogOpen(false)}>
          <DialogTitle>{cellDialogContent?.date}</DialogTitle>
          <DialogContent>
            {cellDialogContent?.note ? (
              <Typography variant="body1" sx={{whiteSpace:'pre-wrap'}}>{cellDialogContent.note}</Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">No note for this day.</Typography>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete All Daily Reflection Notes Dialog */}
      <Dialog
        open={deleteAllNotesDialogOpen}
        onClose={() => setDeleteAllNotesDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, maxWidth: '500px', width: '100%' } }}
      >
        <DialogTitle sx={{ color: 'error.main' }}>Delete All Daily Reflection Notes</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography>
            Are you sure you want to delete <b>all</b> your daily reflection notes? This will permanently remove all your daily reflections.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDeleteAllNotesDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleDeleteAllDailyNotes} color="error" variant="contained" startIcon={<DeleteIcon />}>
            Delete All Notes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Log Confirmation Dialog */}
      <Dialog
        open={deleteLogDialogOpen}
        onClose={() => setDeleteLogDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, maxWidth: '500px', width: '100%' } }}
      >
        <DialogTitle sx={{ color: 'error.main' }}>Remove Log</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography>
            Are you sure you want to remove this log? This will delete the note for the day and reduce your completed days count.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDeleteLogDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={confirmDeleteLog} color="error" variant="contained" startIcon={<DeleteIcon />}>
            Remove Log
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DashboardPage; 