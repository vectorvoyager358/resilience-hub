import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  Fade,
  Zoom,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert
} from '@mui/material';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ClearIcon from '@mui/icons-material/Clear';
import DateRangeIcon from '@mui/icons-material/DateRange';
import { Challenge, User } from '../types';
import ChatAssistant from '../components/ChatAssistant';
import { useAuth } from '../contexts/AuthContext';
import { getUserData } from '../services/firestore';
import { normalizeUserChallenges } from '../utils/challengeProgress';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`notes-tabpanel-${index}`}
      aria-labelledby={`notes-tab-${index}`}
      {...other}
      style={{ padding: '20px 0' }}
    >
      {value === index && (
        <Box>
          {children}
        </Box>
      )}
    </div>
  );
};

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

const NotesHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [selectedChallenge, setSelectedChallenge] = useState<string>('');
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [selectedNote, setSelectedNote] = useState<{ date: Date; note: string } | null>(null);
  
  const clearDateFilters = () => {
    setStartDateStr('');
    setEndDateStr('');
    setIsFiltering(false);
  };

  const applyDateFilters = () => {
    setIsFiltering(true);
  };
  
  // Filter challenges for the dropdown
  const challengeOptions = userData?.challenges.map(challenge => ({
    id: challenge.id,
    name: challenge.name
  })) || [];

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadUserData = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        const unsubscribeFunc = await getUserData(currentUser.uid)
          .then((data) => {
            if (data) {
              setUserData(normalizeUserChallenges(data));
            }
            setLoading(false);
            return undefined;
          })
          .catch((err) => {
            console.error('Error loading user data:', err);
            setError('Failed to load notes history. Please try again.');
            setLoading(false);
            return undefined;
          });

        if (unsubscribeFunc) {
          unsubscribe = unsubscribeFunc;
        }
      } catch (err) {
        console.error('Error in loadUserData:', err);
        setError('Failed to load notes history. Please try again.');
        setLoading(false);
      }
    };

    loadUserData();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  useEffect(() => {
    if (!userData?.name && !loading) {
      navigate('/dashboard');
    } else if (challengeOptions.length > 0 && !selectedChallenge) {
      setSelectedChallenge(challengeOptions[0].id);
    }
  }, [userData, navigate, challengeOptions, selectedChallenge, loading]);

  // Get the selected challenge
  const getSelectedChallenge = (): Challenge | undefined => {
    return userData?.challenges.find(challenge => challenge.id === selectedChallenge);
  };

  const handleChangeTab = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };
  
  // Get sorted and filtered daily notes
  const getSortedDailyNotes = () => {
    return Object.entries(userData?.dailyNotes || {})
      .filter(([date]) => {
        if (!isFiltering) return true;
        // Parse as local date
        const [year, month, day] = date.split('-');
        const noteDate = new Date(Number(year), Number(month) - 1, Number(day));
        let isAfterStart = true;
        let isBeforeEnd = true;
        if (startDateStr) {
          const [sy, sm, sd] = startDateStr.split('-');
          const startDate = new Date(Number(sy), Number(sm) - 1, Number(sd));
          startDate.setHours(0, 0, 0, 0);
          isAfterStart = noteDate >= startDate;
        }
        if (endDateStr) {
          const [ey, em, ed] = endDateStr.split('-');
          const endDate = new Date(Number(ey), Number(em) - 1, Number(ed));
          endDate.setHours(23, 59, 59, 999);
          isBeforeEnd = noteDate <= endDate;
        }
        return isAfterStart && isBeforeEnd;
      })
      .sort(([dateA], [dateB]) => {
        // Parse as local date
        const [yA, mA, dA] = dateA.split('-');
        const [yB, mB, dB] = dateB.split('-');
        return new Date(Number(yB), Number(mB) - 1, Number(dB)).getTime() - new Date(Number(yA), Number(mA) - 1, Number(dA)).getTime();
      })
      .map(([dateStr, note]) => {
        // Parse as local date
        const [year, month, day] = dateStr.split('-');
        return {
          dateStr,
          date: new Date(Number(year), Number(month) - 1, Number(day)),
          note
        };
      });
  };

  // Get filtered challenge notes
  const getFilteredChallengeNotes = () => {
    const challenge = getSelectedChallenge();
    if (!challenge) return [];

    return Object.entries(challenge.notes || {})
      .sort(([dayA], [dayB]) => Number(dayB) - Number(dayA))
      .filter(([day]) => {
        if (!isFiltering) return true;
        // Calculate the actual date from the challenge start date and day number
        const dayNumber = parseInt(day);
        const challengeStartDate = new Date(challenge.startDate);
        const noteDate = new Date(challengeStartDate);
        noteDate.setHours(0, 0, 0, 0);
        noteDate.setDate(challengeStartDate.getDate() + (dayNumber - 1));
        // Format noteDate as YYYY-MM-DD
        const noteDateKey = `${noteDate.getFullYear()}-${String(noteDate.getMonth() + 1).padStart(2, '0')}-${String(noteDate.getDate()).padStart(2, '0')}`;
        let isAfterStart = true;
        let isBeforeEnd = true;
        if (startDateStr) {
          // Compare as YYYY-MM-DD
          isAfterStart = noteDateKey >= startDateStr;
        }
        if (endDateStr) {
          isBeforeEnd = noteDateKey <= endDateStr;
        }
        return isAfterStart && isBeforeEnd;
      })
      .map(([day, note]) => {
        // Calculate the actual date from the challenge start date and day number
        const dayNumber = parseInt(day);
        const challengeStartDate = new Date(challenge.startDate);
        const noteDate = new Date(challengeStartDate);
        noteDate.setHours(0, 0, 0, 0);
        noteDate.setDate(challengeStartDate.getDate() + (dayNumber - 1));
        return {
          day,
          note,
          date: noteDate
        };
      });
  };

  const handleRetry = () => {
    setLoading(true);
    setError(null);
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
          onClick={handleRetry}
        >
          Retry
        </Button>
      </Container>
    );
  }

  if (!userData || !userData.name) {
    return null;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 0 }}>
        <Paper
          sx={{
            p: 3,
            mb: 3,
            mt: 0,
            borderRadius: 3,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
          }}
        >
          <Box
            sx={{ 
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'stretch', sm: 'center' },
              gap: 2
            }}
          >
            <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
              <DateRangeIcon color="primary" />
              Date Range Filter
            </Typography>
            
            <Stack 
              direction={{ xs: 'column', md: 'row' }} 
              spacing={2} 
              sx={{ flexGrow: 1, maxWidth: { xs: '100%', md: '650px' } }}
            >
              <TextField
                label="Start Date"
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <CalendarMonthIcon color="action" sx={{ mr: 1, fontSize: '1.2rem' }} />
                  ),
                }}
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Date"
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <CalendarMonthIcon color="action" sx={{ mr: 1, fontSize: '1.2rem' }} />
                  ),
                }}
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  variant="contained" 
                  color="primary" 
                  onClick={applyDateFilters}
                  startIcon={<FilterAltIcon />}
                  disabled={!startDateStr && !endDateStr}
                  sx={{ minWidth: '100px' }}
                >
                  Filter
                </Button>
                <Button 
                  variant="outlined" 
                  color="primary" 
                  onClick={clearDateFilters}
                  startIcon={<ClearIcon />}
                  disabled={!isFiltering && !startDateStr && !endDateStr}
                >
                  Clear
                </Button>
              </Box>
            </Stack>
          </Box>
        </Paper>

        <Paper 
          sx={{ 
            width: '100%', 
            mb: 4, 
            borderRadius: 3, 
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
          }}
        >
          <Tabs
            value={tabValue}
            onChange={handleChangeTab}
            indicatorColor="primary"
            textColor="primary"
            sx={{
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0'
              },
              '& .MuiTab-root': {
                fontWeight: 600,
                textTransform: 'none',
                minHeight: 60,
                fontSize: { xs: '0.92rem', sm: '1rem' },
                px: { xs: 0.5, sm: 2 },
                minWidth: 0,
                flex: 1,
                maxWidth: '100%',
              }
            }}
            centered
          >
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                  <CalendarMonthIcon fontSize="small" sx={{ fontSize: { xs: 18, sm: 20 } }} />
                  <span style={{ fontSize: 'inherit', whiteSpace: 'nowrap' }}>Daily Reflections</span>
                </Box>
              } 
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                  <FitnessCenterIcon fontSize="small" sx={{ fontSize: { xs: 18, sm: 20 } }} />
                  <span style={{ fontSize: 'inherit', whiteSpace: 'nowrap' }}>Challenge Notes</span>
                </Box>
              } 
            />
          </Tabs>

          <TabPanel value={tabValue} index={0}>
            {getSortedDailyNotes().length > 0 || isFiltering ? (
              <>
                {getSortedDailyNotes().length > 0 ? (
                  <Grid container spacing={3} sx={{ px: { xs: 2, md: 3 } }}>
                    {getSortedDailyNotes().map(({ dateStr, date, note }, index) => (
                      <Grid item xs={12} sm={6} md={4} key={dateStr}>
                        <Zoom in={true} style={{ transitionDelay: `${index * 100}ms` }}>
                          <Card 
                            sx={{ 
                              height: '100%',
                              transition: 'all 0.3s ease',
                              cursor: 'pointer',
                              '&:hover': {
                                transform: 'translateY(-5px)',
                                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)'
                              }
                            }}
                            onClick={() => setSelectedNote({ date, note })}
                          >
                            <CardContent>
                              <Stack 
                                direction="row" 
                                spacing={1.5} 
                                alignItems="center"
                                sx={{ mb: 2 }}
                              >
                                <Avatar 
                                  sx={{ 
                                    bgcolor: 'primary.light', 
                                    width: 40, 
                                    height: 40 
                                  }}
                                >
                                  <CalendarMonthIcon />
                                </Avatar>
                                <Box>
                                  <Typography 
                                    variant="subtitle1" 
                                    fontWeight={600}
                                    gutterBottom
                                    sx={{ lineHeight: 1.2 }}
                                  >
                                    {date.toLocaleDateString(undefined, { 
                                      month: 'short', 
                                      day: 'numeric' 
                                    })}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {date.toLocaleDateString(undefined, { 
                                      weekday: 'long',
                                      year: 'numeric'
                                    })}
                                  </Typography>
                                </Box>
                                <Chip 
                                  label="Daily Reflection" 
                                  size="small" 
                                  color="primary"
                                  variant="outlined"
                                  sx={{ ml: 'auto', height: 24, borderRadius: 1 }}
                                />
                              </Stack>
                              <Divider sx={{ my: 1.5 }} />
                              <Typography 
                                variant="body2" 
                                color="text.secondary"
                                sx={{ 
                                  whiteSpace: 'pre-wrap',
                                  pt: 1,
                                  lineHeight: 1.6,
                                  maxHeight: 200,
                                  overflow: 'hidden',
                                  position: 'relative',
                                  '&:after': {
                                    content: '""',
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: '50px',
                                    background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))'
                                  }
                                }}
                              >
                                {note}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Zoom>
                      </Grid>
                    ))}
                  </Grid>
                ) : (
                  <Box 
                    sx={{ 
                      textAlign: 'center', 
                      py: 6,
                      px: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 70,
                        height: 70,
                        bgcolor: 'rgba(58, 134, 255, 0.1)',
                        color: 'primary.main'
                      }}
                    >
                      <CalendarMonthIcon sx={{ fontSize: 40 }} />
                    </Avatar>
                    <Typography variant="h6">No reflections found in this date range</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
                      Try selecting a different date range or add more daily reflections.
                    </Typography>
                    <Button 
                      variant="outlined"
                      color="primary"
                      onClick={clearDateFilters}
                      startIcon={<ClearIcon />}
                      sx={{
                        mt: 2,
                        borderRadius: 2,
                      }}
                    >
                      Clear Filters
                    </Button>
                  </Box>
                )}
              </>
            ) : (
              <Box 
                sx={{ 
                  textAlign: 'center', 
                  py: 8,
                  px: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2
                }}
              >
                <Avatar
                  sx={{
                    width: 70,
                    height: 70,
                    bgcolor: 'rgba(58, 134, 255, 0.1)',
                    color: 'primary.main'
                  }}
                >
                  <EditNoteIcon sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h6">No daily reflections yet</Typography>
              </Box>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box 
              sx={{ 
                mb: 3,
                maxWidth: 400,
                mx: 'auto'
              }}
            >
              <FormControl fullWidth variant="outlined">
                <InputLabel id="challenge-select-label">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <FilterAltIcon fontSize="small" />
                    <span>Select Challenge</span>
                  </Box>
                </InputLabel>
                <Select
                  labelId="challenge-select-label"
                  value={selectedChallenge}
                  onChange={(e) => setSelectedChallenge(e.target.value as string)}
                  label="Select Challenge"
                  sx={{ 
                    borderRadius: 2,
                    '& .MuiSelect-select': {
                      display: 'flex',
                      alignItems: 'center',
                    }
                  }}
                >
                  {challengeOptions.map(challenge => (
                    <MenuItem key={challenge.id} value={challenge.id}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar 
                          sx={{ 
                            width: 24, 
                            height: 24, 
                            bgcolor: 'secondary.main',
                            fontSize: '0.7rem'
                          }}
                        >
                          <FitnessCenterIcon sx={{ fontSize: 14 }} />
                        </Avatar>
                        {challenge.name}
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {selectedChallenge && getSelectedChallenge() ? (
              <Fade in={true} timeout={500}>
                <Box>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 2, 
                      mb: 3, 
                      borderRadius: 2,
                      bgcolor: 'rgba(58, 134, 255, 0.03)',
                      border: '1px solid rgba(58, 134, 255, 0.1)'
                    }}
                  >
                    <Typography 
                      variant="h6" 
                      gutterBottom
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        fontWeight: 600
                      }}
                    >
                      <Avatar 
                        sx={{ 
                          width: 32, 
                          height: 32, 
                          bgcolor: 'secondary.main',
                          fontSize: '0.8rem'
                        }}
                      >
                        <FitnessCenterIcon sx={{ fontSize: 18 }} />
                      </Avatar>
                      {getSelectedChallenge()?.name}
                      <Chip 
                        label={getSelectedChallenge()?.completedDays === getSelectedChallenge()?.duration
                          ? `${getSelectedChallenge()?.completedDays}/${getSelectedChallenge()?.duration} Complete! 🏆`
                          : `${getSelectedChallenge()?.completedDays}/${getSelectedChallenge()?.duration} days`} 
                        size="small" 
                        color={getSelectedChallenge()?.completedDays === getSelectedChallenge()?.duration ? "success" : "primary"} 
                        variant={getSelectedChallenge()?.completedDays === getSelectedChallenge()?.duration ? "filled" : "outlined"}
                        sx={{ 
                          ml: 1, 
                          height: 24, 
                          borderRadius: 1,
                          fontWeight: getSelectedChallenge()?.completedDays === getSelectedChallenge()?.duration ? 600 : 400
                        }}
                      />
                    </Typography>
                  </Paper>
                  
                  {getFilteredChallengeNotes().length > 0 ? (
                    <Grid container spacing={2}>
                      {getFilteredChallengeNotes().map(({ day, note, date }, index) => (
                        <Grid item xs={12} key={day}>
                          <Zoom in={true} style={{ transitionDelay: `${index * 100}ms` }}>
                            <Paper 
                              sx={{ 
                                p: 2, 
                                borderRadius: 2, 
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                                  transform: 'translateY(-2px)'
                                }
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                                <Chip 
                                  label={`Day ${day} of ${getSelectedChallenge()?.duration} ✅`} 
                                  color="success" 
                                  sx={{ 
                                    borderRadius: 1,
                                    fontWeight: 600
                                  }}
                                />
                                <Divider orientation="vertical" flexItem sx={{ mx: 2 }} />
                                <Typography variant="caption" color="text.secondary">
                                  {date.toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </Typography>
                              </Box>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  whiteSpace: 'pre-wrap',
                                  lineHeight: 1.6,
                                  color: 'text.secondary'
                                }}
                              >
                                {note?.content}
                              </Typography>
                            </Paper>
                          </Zoom>
                        </Grid>
                      ))}
                    </Grid>
                  ) : (
                    <Box 
                      sx={{ 
                        textAlign: 'center', 
                        py: 6,
                        px: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 70,
                          height: 70,
                          bgcolor: 'rgba(131, 56, 236, 0.1)',
                          color: 'secondary.main'
                        }}
                      >
                        <EditNoteIcon sx={{ fontSize: 40 }} />
                      </Avatar>
                      {isFiltering ? (
                        <>
                          <Typography variant="h6">No challenge notes in this date range</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
                            Try selecting a different date range or another challenge.
                          </Typography>
                          <Button 
                            variant="outlined"
                            color="primary"
                            onClick={clearDateFilters}
                            startIcon={<ClearIcon />}
                            sx={{
                              mt: 2,
                              borderRadius: 2,
                            }}
                          >
                            Clear Filters
                          </Button>
                        </>
                      ) : (
                        <>
                          <Typography variant="h6">No notes for this challenge yet</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
                            Notes will appear here as you complete days and add reflections to your challenge.
                          </Typography>
                        </>
                      )}
                    </Box>
                  )}
                </Box>
              </Fade>
            ) : (
              <Typography variant="body1" sx={{ textAlign: 'center', py: 4 }}>
                Please select a challenge to view its notes.
              </Typography>
            )}
          </TabPanel>
        </Paper>
      </Box>

      {/* Full Note Dialog */}
      <Dialog
        open={Boolean(selectedNote)}
        onClose={() => setSelectedNote(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        {selectedNote && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                  <CalendarMonthIcon fontSize="small" />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    Daily Reflection
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedNote.date.toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </Typography>
                </Box>
              </Stack>
            </DialogTitle>
            <DialogContent>
              <Typography 
                variant="body1" 
                sx={{ 
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.8,
                  color: 'text.secondary',
                  mt: 2
                }}
              >
                {selectedNote.note}
              </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
              <Button 
                onClick={() => setSelectedNote(null)}
                variant="contained"
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Add the ChatAssistant component */}
      <ErrorBoundary>
        <ChatAssistant userData={userData} />
      </ErrorBoundary>
    </Container>
  );
};

export default NotesHistoryPage; 