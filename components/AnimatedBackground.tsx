
import React, { useEffect, useRef, useState } from 'react';
import './AnimatedBackground.css';

interface AnimatedBackgroundProps {
    variant?: 'landing' | 'instructor' | 'student';
    intensity?: 'subtle' | 'moderate' | 'dynamic';
}

// Educational icon SVG paths
const educationIcons = [
    // Book (open)
    {
        id: 'book',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
        ),
        color: 'gold',
    },

    // Graduation cap
    {
        id: 'graduation',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
        ),
        color: 'cyan',
    },

    // Atom
    {
        id: 'atom',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" fill="currentColor" />
                <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z" />
                <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5z" />
            </svg>
        ),
        color: 'white',
    },

    // Light bulb
    {
        id: 'lightbulb',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
            </svg>
        ),
        color: 'gold',
    },

    // Ruler & Compass
    {
        id: 'ruler',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                <polyline points="7.5 19.79 7.5 14.6 3 12" />
                <polyline points="21 12 16.5 14.6 16.5 19.79" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
        ),
        color: 'cyan',
    },

    // DNA Helix
    {
        id: 'dna',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 15c.6.5 1.2 1 2.5 1C7 16 7 14 9.5 14c2.5 0 2.5 2 5 2c2.5 0 2.5-2 5-2c1.3 0 1.9.5 2.5 1" />
                <path d="M2 9c.6-.5 1.2-1 2.5-1C7 8 7 10 9.5 10c2.5 0 2.5-2 5-2c2.5 0 2.5 2 5 2c1.3 0 1.9-.5 2.5-1" />
                <path d="M5 3L3.5 5.5A7.01 7.01 0 0 0 3 10c0 1.66.46 3.22 1.27 4.55L5 18.5" />
                <path d="M19 21l1.5-2.5A7.01 7.01 0 0 0 21 14c0-1.66-.46-3.22-1.27-4.55L19 5.5" />
                <line x1="9" y1="3" x2="9" y2="6" />
                <line x1="9" y1="18" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="6" />
                <line x1="15" y1="18" x2="15" y2="21" />
            </svg>
        ),
        color: 'white',
    },

    // Microscope
    {
        id: 'microscope',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18h8" />
                <path d="M3 22h18" />
                <path d="M14 22a7 7 0 1 0 0-14h-1" />
                <path d="M9 14h2" />
                <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
                <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
            </svg>
        ),
        color: 'gold',
    },

    // Telescope
    {
        id: 'telescope',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 10 4.72 20.55a1 1 0 0 0 .9 1.45h4.76a1 1 0 0 0 .9-1.45L6 10Z" />
                <path d="M10 2v8" />
                <path d="M14 18v4" />
                <path d="M14 14l6-6" />
                <circle cx="14" cy="14" r="2" />
                <circle cx="20" cy="8" r="2" />
            </svg>
        ),
        color: 'cyan',
    },

    // Pencil
    {
        id: 'pencil',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
        ),
        color: 'white',
    },

    // Calculator
    {
        id: 'calculator',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="16" y1="14" x2="16" y2="18" />
                <path d="M16 10h.01" />
                <path d="M12 10h.01" />
                <path d="M8 10h.01" />
                <path d="M12 14h.01" />
                <path d="M8 14h.01" />
                <path d="M12 18h.01" />
                <path d="M8 18h.01" />
            </svg>
        ),
        color: 'gold',
    },

    // Globe
    {
        id: 'globe',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
        ),
        color: 'cyan',
    },

    // Test tube
    {
        id: 'testtube',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 2v17.5A2.5 2.5 0 0 0 11.5 22v0A2.5 2.5 0 0 0 14 19.5V2" />
                <path d="M9 2h5" />
                <path d="M9 16h5" />
            </svg>
        ),
        color: 'white',
    },

    // Chart/Graph
    {
        id: 'chart',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
        ),
        color: 'gold',
    },

    // Palette
    {
        id: 'palette',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
        ),
        color: 'cyan',
    },

    // Gear/Engineering
    {
        id: 'gear',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.25m4.25 4.24l4.24 4.25M1 12h6m6 0h6m-12.36.36l4.24-4.25m4.25-4.24l4.24-4.25" />
            </svg>
        ),
        color: 'white',
    },

    // Musical note
    {
        id: 'music',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
            </svg>
        ),
        color: 'gold',
    },

    // Notepad
    {
        id: 'notepad',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l5.586 5.586M9 9L3.414 3.414M1 21h5v-5" />
            </svg>
        ),
        color: 'cyan',
    },

    // Trophy
    {
        id: 'trophy',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
        ),
        color: 'gold',
    },

    // Rocket
    {
        id: 'rocket',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
            </svg>
        ),
        color: 'white',
    },

    // Brain
    {
        id: 'brain',
        svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
            </svg>
        ),
        color: 'cyan',
    },
];

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
    variant = 'landing',
    intensity = 'subtle',
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });

    // Generate random positions and properties for icons
    const iconInstances = React.useMemo(() => {
        // Significantly increased icon counts for better coverage
        const count = intensity === 'subtle' ? 80 : intensity === 'moderate' ? 100 : 120;
        const instances = [];

        for (let i = 0; i < count; i++) {
            const icon = educationIcons[Math.floor(Math.random() * educationIcons.length)];

            // Better distribution strategy: ensure icons spread across entire viewport
            // Use grid-based distribution with randomization for natural look
            const gridSize = Math.ceil(Math.sqrt(count));
            const gridX = (i % gridSize) / gridSize;
            const gridY = Math.floor(i / gridSize) / gridSize;

            // Add randomization to grid position for organic placement
            const randomOffsetX = (Math.random() - 0.5) * (100 / gridSize);
            const randomOffsetY = (Math.random() - 0.5) * (100 / gridSize);

            instances.push({
                ...icon,
                id: `${icon.id}-${i}`,
                left: Math.min(95, Math.max(5, (gridX * 100) + randomOffsetX)), // Keep within 5-95%
                top: Math.min(95, Math.max(5, (gridY * 100) + randomOffsetY)),  // Keep within 5-95%
                size: 15 + Math.random() * 50, // 15px to 65px (wider range)
                opacity: 0.08 + Math.random() * 0.17, // 0.08 to 0.25 (more variety)
                rotation: Math.random() * 360,
                duration: 25 + Math.random() * 50, // 25s to 75s (more variation)
                delay: Math.random() * -30, // Longer stagger for natural flow
                animationType: Math.floor(Math.random() * 5) + 1, // 1-5 different float animations
            });
        }

        return instances;
    }, [intensity]);

    // Parallax effect on scroll
    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            const scrollX = window.scrollX;

            setParallaxOffset({
                x: scrollX * 0.1,
                y: scrollY * 0.1,
            });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Parallax effect on device tilt (mobile)
    useEffect(() => {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (event.gamma && event.beta) {
                setParallaxOffset({
                    x: event.gamma * 0.5, // Left-right tilt
                    y: event.beta * 0.5,  // Front-back tilt
                });
            }
        };

        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, []);

    // Color mapping based on variant
    const colorMap = {
        gold: variant === 'landing' ? '#f59e0b' : variant === 'instructor' ? '#3b82f6' : '#f59e0b',
        cyan: '#06b6d4',
        white: 'rgba(255, 255, 255, 0.8)',
    };

    return (
        <div
            ref={containerRef}
            className="animated-background"
            style={{
                transform: `translate(${parallaxOffset.x}px, ${parallaxOffset.y}px)`,
            }}
        >
            {iconInstances.map((icon) => (
                <div
                    key={icon.id}
                    className={`floating-icon float-${icon.animationType}`}
                    style={{
                        left: `${icon.left}%`,
                        top: `${icon.top}%`,
                        width: `${icon.size}px`,
                        height: `${icon.size}px`,
                        opacity: icon.opacity,
                        transform: `rotate(${icon.rotation}deg)`,
                        animationDuration: `${icon.duration}s`,
                        animationDelay: `${icon.delay}s`,
                        color: colorMap[icon.color as keyof typeof colorMap],
                    }}
                >
                    {icon.svg}
                </div>
            ))}
        </div>
    );
};

export default AnimatedBackground;
