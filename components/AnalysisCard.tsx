'use client';

import React from 'react';
import { CardColor } from '../types';

interface AnalysisCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: CardColor;
  index?: number;
  disabled?: boolean;
  disabledReason?: string;
}

const colorStyles: Record<CardColor, { 
    bg: string;
    border: string;
    iconBg: string;
    iconColor: string;
    shadow: string;
    glow: string;
}> = {
  purple: {
    bg: 'bg-purple-50/50',
    border: 'border-purple-100',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    shadow: 'hover:shadow-purple-200/50',
    glow: 'group-hover:from-purple-500/10',
  },
  red: {
    bg: 'bg-rose-50/50',
    border: 'border-rose-100',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    shadow: 'hover:shadow-rose-200/50',
    glow: 'group-hover:from-rose-500/10',
  },
  orange: {
    bg: 'bg-orange-50/50',
    border: 'border-orange-100',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    shadow: 'hover:shadow-orange-200/50',
    glow: 'group-hover:from-orange-500/10',
  },
  green: {
    bg: 'bg-emerald-50/50',
    border: 'border-emerald-100',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    shadow: 'hover:shadow-emerald-200/50',
    glow: 'group-hover:from-emerald-500/10',
  },
  // Fallbacks
  blue: { bg: 'bg-blue-50/50', border: 'border-blue-100', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', shadow: 'hover:shadow-blue-200/50', glow: 'group-hover:from-blue-500/10' },
  yellow: { bg: 'bg-amber-50/50', border: 'border-amber-100', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', shadow: 'hover:shadow-amber-200/50', glow: 'group-hover:from-amber-500/10' },
  teal: { bg: 'bg-teal-50/50', border: 'border-teal-100', iconBg: 'bg-teal-100', iconColor: 'text-teal-600', shadow: 'hover:shadow-teal-200/50', glow: 'group-hover:from-teal-500/10' },
  pink: { bg: 'bg-pink-50/50', border: 'border-pink-100', iconBg: 'bg-pink-100', iconColor: 'text-pink-600', shadow: 'hover:shadow-pink-200/50', glow: 'group-hover:from-pink-500/10' },
  cyan: { bg: 'bg-cyan-50/50', border: 'border-cyan-100', iconBg: 'bg-cyan-100', iconColor: 'text-cyan-600', shadow: 'hover:shadow-cyan-200/50', glow: 'group-hover:from-cyan-500/10' },
  indigo: { bg: 'bg-indigo-50/50', border: 'border-indigo-100', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', shadow: 'hover:shadow-indigo-200/50', glow: 'group-hover:from-indigo-500/10' },
  slate: { bg: 'bg-slate-50/50', border: 'border-slate-100', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', shadow: 'hover:shadow-slate-200/50', glow: 'group-hover:from-slate-500/10' },
};

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ 
  title, 
  description,
  icon, 
  onClick,
  color,
  index = 0,
  disabled = false,
  disabledReason
}) => {
  const theme = colorStyles[color] || colorStyles.blue;

  if (disabled) {
    return (
      <div 
        style={{ animationDelay: `${index * 100}ms` }}
        className={`
          relative w-full text-right overflow-hidden
          p-8 rounded-[2rem]
          bg-gray-50 border-2 border-gray-200
          flex flex-col gap-5
          opacity-70 cursor-not-allowed
          animate-fadeInUp
        `}
      >
          <div className="flex items-start justify-between w-full relative z-10">
              <div className={`
                  p-4 rounded-2xl
                  bg-gray-200 text-gray-400
                  shadow-sm ring-1 ring-white
              `}>
                  <div className="w-8 h-8 grayscale">
                  {React.isValidElement(icon) 
                      ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-8 h-8" })
                      : icon}
                  </div>
              </div>
          </div>

          <div className="relative z-10 space-y-3">
              <h3 className="text-2xl font-black text-gray-400 tracking-tight">
                  {title}
              </h3>
              <p className="text-gray-400 text-base leading-relaxed font-medium pl-2">
                  {description}
              </p>
              {disabledReason && (
                <div className="mt-4 p-3 bg-gray-200 rounded-xl text-xs font-bold text-gray-500 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {disabledReason}
                </div>
              )}
          </div>
      </div>
    );
  }

  return (
    <button 
      onClick={onClick}
      style={{ animationDelay: `${index * 100}ms` }}
      className={`
        relative group w-full text-right overflow-hidden
        p-8 rounded-[2rem] transition-all duration-300 ease-out
        bg-white border-2 ${theme.border}
        shadow-lg hover:shadow-xl ${theme.shadow}
        hover:-translate-y-1.5
        flex flex-col gap-5
        animate-fadeInUp
      `}
    >
        {/* Background Decorative Blob */}
        <div className={`
            absolute -right-20 -top-20 w-64 h-64 rounded-full blur-3xl opacity-0 
            transition-opacity duration-500 group-hover:opacity-100
            bg-gradient-to-br ${theme.glow} to-transparent pointer-events-none
        `}></div>

        <div className="flex items-start justify-between w-full relative z-10">
            <div className={`
                p-4 rounded-2xl transition-all duration-300
                ${theme.iconBg} ${theme.iconColor}
                group-hover:scale-110 group-hover:rotate-3
                shadow-sm ring-1 ring-white
            `}>
                <div className="w-8 h-8">
                {React.isValidElement(icon) 
                    ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-8 h-8" })
                    : icon}
                </div>
            </div>
            
            <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                opacity-0 group-hover:opacity-100 transition-all duration-300 
                transform translate-x-4 group-hover:translate-x-0
                bg-slate-50 text-slate-400
            `}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
            </div>
        </div>

        <div className="relative z-10 space-y-3">
            <h3 className="text-2xl font-black text-slate-800 tracking-tight group-hover:text-slate-900 transition-colors">
                {title}
            </h3>
            <p className="text-slate-500 text-base leading-relaxed font-medium pl-2 group-hover:text-slate-600 transition-colors">
                {description}
            </p>
        </div>
        
        {/* Bottom bar indicator */}
        <div className={`absolute bottom-0 left-0 h-1.5 w-full transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-right ${theme.iconColor.replace('text', 'bg')}`}></div>
    </button>
  );
};
