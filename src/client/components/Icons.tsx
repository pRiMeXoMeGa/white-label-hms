import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  dining: () => (
    <Svg>
      <path d="M4 17h16M6 17a6 6 0 0 1 12 0M12 8V6M10 6h4M3 20h18" />
    </Svg>
  ),
  laundry: () => (
    <Svg>
      <path d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z" />
    </Svg>
  ),
  housekeeping: () => (
    <Svg>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </Svg>
  ),
  amenity: () => (
    <Svg>
      <rect x="3" y="7" width="18" height="11" rx="5" />
      <path d="M7 12h10" />
    </Svg>
  ),
  maintenance: () => (
    <Svg>
      <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z" />
    </Svg>
  ),
  spa: () => (
    <Svg>
      <path d="M12 20c-4 0-8-3-8-7 3 0 6 1.5 8 4 2-2.5 5-4 8-4 0 4-4 7-8 7zM12 17c-2-3-2-7 0-11 2 4 2 8 0 11z" />
    </Svg>
  ),
  transfer: () => (
    <Svg>
      <path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M5 11h14" />
      <circle cx="8" cy="13.5" r=".6" />
      <circle cx="16" cy="13.5" r=".6" />
    </Svg>
  ),
  info: () => (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  ),
  bill: () => (
    <Svg>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />
    </Svg>
  ),
  home: () => (
    <Svg>
      <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />
    </Svg>
  ),
  grid: () => (
    <Svg>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </Svg>
  ),
  back: () => (
    <Svg>
      <path d="M15 5 8 12l7 7" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;
