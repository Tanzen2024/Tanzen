import React from 'react';

export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* Outline of T with slight background */}
        <path d="M15 25 H85 V45 H60 V85 H40 V45 H15 Z" fill="currentColor" fillOpacity="0.1" />
        
        {/* Network lines matching the design */}
        <line x1="15" y1="25" x2="40" y2="45" />
        <line x1="15" y1="45" x2="50" y2="25" />
        <line x1="85" y1="25" x2="60" y2="45" />
        <line x1="85" y1="45" x2="50" y2="25" />
        <line x1="50" y1="25" x2="50" y2="45" />
        
        <line x1="40" y1="45" x2="60" y2="85" />
        <line x1="60" y1="45" x2="40" y2="85" />
        <line x1="40" y1="65" x2="60" y2="65" />
        
        {/* Nodes */}
        <circle cx="15" cy="25" r="5" fill="currentColor" />
        <circle cx="50" cy="25" r="5" fill="currentColor" />
        <circle cx="85" cy="25" r="5" fill="currentColor" />
        
        <circle cx="15" cy="45" r="5" fill="currentColor" />
        <circle cx="40" cy="45" r="5" fill="currentColor" />
        <circle cx="60" cy="45" r="5" fill="currentColor" />
        <circle cx="85" cy="45" r="5" fill="currentColor" />
        
        <circle cx="40" cy="65" r="5" fill="currentColor" />
        <circle cx="60" cy="65" r="5" fill="currentColor" />
        
        <circle cx="40" cy="85" r="5" fill="currentColor" />
        <circle cx="60" cy="85" r="5" fill="currentColor" />
      </g>
    </svg>
  );
}
