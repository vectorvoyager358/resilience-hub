import { keyframes } from '@mui/system';

export const LIVELY_MENU_FAB_HOVER_CYCLE = '5s';

const LIVELY_MENU_FAB_GRADIENT_STOPS =
  '#157a72, #1fa89a, #2ec4b6, #6dd9ce, #b8f0ea, #ff9f1c, #ffc266, #e76f51, #f4a594, #2ec4b6, #157a72';

export const livelyMenuFabIconCounter = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
`;

const livelyMenuFabHoverLively = keyframes`
  0% {
    background-position: 0% 50%;
    border-radius: 50%;
    transform: rotate(0deg) scale(1);
    box-shadow: 0 6px 18px rgba(46, 196, 182, 0.42);
  }
  9% {
    background-position: 18% 62%;
    border-radius: 12% 88% 18% 82% / 82% 18% 82% 18%;
    transform: rotate(32deg) scale(1.04);
    box-shadow: 0 8px 20px rgba(31, 168, 154, 0.4);
  }
  18% {
    background-position: 36% 88%;
    border-radius: 10px;
    transform: rotate(65deg) scale(1.08);
    box-shadow: 0 10px 24px rgba(21, 122, 114, 0.45);
  }
  27% {
    background-position: 55% 95%;
    border-radius: 50% 50% 4% 50%;
    transform: rotate(98deg) scale(1.06);
    box-shadow: 0 9px 22px rgba(255, 159, 28, 0.42);
  }
  36% {
    background-position: 72% 72%;
    border-radius: 38% 62% 62% 38% / 62% 38% 38% 62%;
    transform: rotate(130deg) scale(1.07);
    box-shadow: 0 10px 26px rgba(255, 194, 102, 0.38);
  }
  45% {
    background-position: 88% 48%;
    border-radius: 6px 22px 6px 22px;
    transform: rotate(162deg) scale(1.05);
    box-shadow: 0 8px 22px rgba(231, 111, 81, 0.4);
  }
  55% {
    background-position: 100% 40%;
    border-radius: 42%;
    transform: rotate(198deg) scale(1.08);
    box-shadow: 0 10px 24px rgba(244, 165, 148, 0.38);
  }
  64% {
    background-position: 82% 18%;
    border-radius: 50% 12% 50% 12% / 12% 50% 12% 50%;
    transform: rotate(234deg) scale(1.06);
    box-shadow: 0 9px 23px rgba(46, 196, 182, 0.4);
  }
  73% {
    background-position: 58% 8%;
    border-radius: 4px;
    transform: rotate(270deg) scale(1.07);
    box-shadow: 0 10px 25px rgba(109, 217, 206, 0.42);
  }
  82% {
    background-position: 32% 22%;
    border-radius: 55% 45% 52% 48% / 48% 52% 45% 55%;
    transform: rotate(306deg) scale(1.05);
    box-shadow: 0 8px 21px rgba(255, 159, 28, 0.4);
  }
  91% {
    background-position: 12% 42%;
    border-radius: 28px 8px 28px 8px;
    transform: rotate(338deg) scale(1.03);
    box-shadow: 0 7px 19px rgba(21, 122, 114, 0.38);
  }
  100% {
    background-position: 0% 50%;
    border-radius: 50%;
    transform: rotate(360deg) scale(1);
    box-shadow: 0 6px 18px rgba(46, 196, 182, 0.42);
  }
`;

/** Shared by chat FAB (assistant) and dashboard hamburger FAB. */
export const livelyMenuFabSx = {
  backgroundImage: `linear-gradient(128deg, ${LIVELY_MENU_FAB_GRADIENT_STOPS})`,
  backgroundSize: '420% 420%',
  backgroundPosition: '0% 50%',
  backgroundColor: 'transparent',
  transition: 'box-shadow 0.35s ease, filter 0.35s ease',
  boxShadow: '0 6px 15px rgba(46, 196, 182, 0.35)',
  '&:hover': {
    animation: `${livelyMenuFabHoverLively} ${LIVELY_MENU_FAB_HOVER_CYCLE} ease-in-out infinite`,
    filter: 'brightness(1.05)',
  },
  '& .MuiSvgIcon-root': {
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.22))',
  },
  '&:hover .MuiSvgIcon-root': {
    animation: `${livelyMenuFabIconCounter} ${LIVELY_MENU_FAB_HOVER_CYCLE} linear infinite`,
  },
  '&:hover .menu-fab-letter': {
    display: 'inline-block',
    animation: `${livelyMenuFabIconCounter} ${LIVELY_MENU_FAB_HOVER_CYCLE} linear infinite`,
  },
  '@media (prefers-reduced-motion: reduce)': {
    backgroundImage: 'linear-gradient(135deg, #2ec4b6 0%, #6dd9ce 45%, #ff9f1c 100%)',
    backgroundSize: '100% 100%',
    transition: 'none',
    '&:hover': {
      animation: 'none',
      filter: 'none',
      transform: 'scale(1.04)',
    },
    '&:hover .MuiSvgIcon-root': {
      animation: 'none',
    },
    '&:hover .menu-fab-letter': {
      animation: 'none',
    },
  },
} as const;
