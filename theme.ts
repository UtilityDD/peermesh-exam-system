// Theme configuration for PeerMesh
// Trust & Discipline Theme - Forest Green + Sand + Ink Black

export const theme = {
    // Primary colors
    primary: {
        main: '#2e7d32',      // Forest Green (Trust)
        light: '#4ade80',     // Fresh Green
        dark: '#14532d',      // Deep Forest
    },

    // Secondary colors
    secondary: {
        main: '#f59e0b',      // Amber (retained for highlights)
        light: '#fbbf24',     // Lighter amber
        dark: '#d97706',      // Deep amber
    },

    // Accent color
    accent: {
        main: '#06b6d4',      // Cyan (retained for contrast)
        light: '#22d3ee',     // Light cyan
        dark: '#0891b2',      // Deep cyan
    },

    // Role-specific colors
    instructor: {
        main: '#1e3a8a',      // Navy (trust, authority)
        gradient: 'from-blue-900 via-blue-800 to-indigo-900',
    },

    student: {
        main: '#f59e0b',      // Gold (achievement, energy)
        gradient: 'from-amber-500 via-orange-500 to-amber-600',
    },

    // Status colors
    success: '#10b981',     // Green
    warning: '#f59e0b',     // Gold (matches secondary)
    error: '#ef4444',       // Red
    info: '#06b6d4',        // Cyan (matches accent)

    // Neutral colors
    slate: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
    },

    // Background gradients
    gradients: {
        landing: 'bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-800',
        instructor: 'bg-gradient-to-br from-blue-900 via-blue-800 to-slate-800',
        student: 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700',
    },

    // Animation settings
    animation: {
        intensity: 'subtle',  // subtle | moderate | dynamic
        iconCount: 35,        // Number of floating icons
        speedMultiplier: 1,   // 1 = normal, 2 = double speed, 0.5 = half speed
    },
};

export type Theme = typeof theme;
