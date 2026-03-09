'use client';

import React, { useEffect, useState, useRef } from 'react';
import { CardColor } from '../types';
import { serverSummarizeForSharing, serverGetVisualAssetData, serverGenerateCartoonImage, VisualAssetData } from '@/lib/gemini-server';
import { updateChatCacheAction } from '@/app/actions/analytics-actions';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  content: string | undefined;
  loading: boolean;
  loadingHighlight: string | null;
  loadingMessage?: string;
  color: CardColor;
  onShare?: (platform: string) => void;
  onLogImageGeneration?: () => void;
  onLogFeedback?: (rating: number, comment: string) => void;
  chatCode?: string | null;
  userId?: string | null;
}

const LOGO_URL = "https://madaduhcom.wpcomstaging.com/wp-content/uploads/2026/02/logo-psychologist.png";

// Social Icons
const WhatsappIcon = () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>;
const TelegramIcon = () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>;
const FacebookIcon = () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;
const LinkedinIcon = () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>;
const CopyIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;

const colorStyles: Record<CardColor, { headerBg: string; headerText: string; iconBg: string; btnHover: string }> = {
  blue: { headerBg: 'bg-blue-600', headerText: 'text-white', iconBg: 'bg-blue-500', btnHover: 'hover:bg-blue-50' },
  purple: { headerBg: 'bg-purple-600', headerText: 'text-white', iconBg: 'bg-purple-500', btnHover: 'hover:bg-purple-50' },
  green: { headerBg: 'bg-emerald-600', headerText: 'text-white', iconBg: 'bg-emerald-500', btnHover: 'hover:bg-emerald-50' },
  red: { headerBg: 'bg-rose-600', headerText: 'text-white', iconBg: 'bg-rose-500', btnHover: 'hover:bg-rose-50' },
  yellow: { headerBg: 'bg-amber-500', headerText: 'text-white', iconBg: 'bg-amber-400', btnHover: 'hover:bg-amber-50' },
  teal: { headerBg: 'bg-teal-600', headerText: 'text-white', iconBg: 'bg-teal-500', btnHover: 'hover:bg-teal-50' },
  pink: { headerBg: 'bg-pink-600', headerText: 'text-white', iconBg: 'bg-pink-500', btnHover: 'hover:bg-pink-50' },
  cyan: { headerBg: 'bg-cyan-600', headerText: 'text-white', iconBg: 'bg-cyan-500', btnHover: 'hover:bg-cyan-50' },
  orange: { headerBg: 'bg-orange-500', headerText: 'text-white', iconBg: 'bg-orange-400', btnHover: 'hover:bg-orange-50' },
  indigo: { headerBg: 'bg-indigo-600', headerText: 'text-white', iconBg: 'bg-indigo-500', btnHover: 'hover:bg-indigo-50' },
  slate: { headerBg: 'bg-slate-700', headerText: 'text-white', iconBg: 'bg-slate-600', btnHover: 'hover:bg-slate-100' },
};

const PrivacyNotice = ({ text }: { text: string }) => (
  <div className="mb-8 bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex gap-4 items-start shadow-sm animate-fadeIn">
    <div className="bg-emerald-500 text-white p-2.5 rounded-xl shrink-0 shadow-sm">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    </div>
    <div className="text-right">
      <h4 className="font-bold text-emerald-800 text-sm mb-1">הערת פרטיות ואנונימיות</h4>
      <p className="text-emerald-700 text-xs leading-relaxed opacity-90">{text}</p>
    </div>
  </div>
);

const SnippetRenderer = ({ text }: { text: string }) => {
  if (!text) return null;
  const cleanText = text.replace(/^"|"$/g, '').trim().replace(/\\n/g, '\n');
  const lines = cleanText.split(/\r?\n/).filter(l => l.trim().length > 0);
  
  const colors = [
    'bg-blue-50 text-blue-900 border-blue-100',
    'bg-purple-50 text-purple-900 border-purple-100',
    'bg-rose-50 text-rose-900 border-rose-100',
    'bg-amber-50 text-amber-900 border-amber-100',
    'bg-emerald-50 text-emerald-900 border-emerald-100',
    'bg-cyan-50 text-cyan-900 border-cyan-100',
  ];

  const speakerColorMap: Record<string, string> = {};
  let nextColorIdx = 0;

  const parsedLines = lines.map(line => {
    const match = line.match(/^\[?([^\]:]+)\]?:\s*(.+)$/);
    if (match) {
      const speaker = match[1].trim();
      const content = match[2].trim();
      
      if (!speakerColorMap[speaker]) {
        speakerColorMap[speaker] = colors[nextColorIdx % colors.length];
        nextColorIdx++;
      }
      return { speaker, content, color: speakerColorMap[speaker], isMsg: true };
    }
    return { content: line, isMsg: false };
  });

  return (
    <div className="w-full max-w-lg mx-auto space-y-4 text-right" dir="rtl">
      {parsedLines.map((item, idx) => (
        <div key={idx} className={`flex flex-col ${item.isMsg ? 'items-start' : 'items-center'} animate-fadeIn`} style={{ animationDelay: `${idx * 150}ms` }}>
            {item.isMsg ? (
                <div className={`relative px-5 py-4 rounded-2xl rounded-tr-none border shadow-sm ${item.color} w-full md:w-auto md:max-w-[90%]`}>
                    <div className="text-xs font-bold opacity-70 mb-1.5">{item.speaker}</div>
                    <div className="text-sm font-medium leading-relaxed">{item.content}</div>
                </div>
            ) : (
                <div className="text-slate-400 text-xs italic bg-white px-3 py-1 rounded-full border border-slate-100">{item.content}</div>
            )}
        </div>
      ))}
      <div className="text-center pt-6 opacity-60">
        <span className="inline-block px-4 py-1.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-full border border-slate-200 shadow-sm">
            קטע מתוך השיחה (אקראי)
        </span>
      </div>
    </div>
  );
};

const MarkdownRenderer = ({ text }: { text: string }) => {
  if (!text) return null;

  const parseInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-slate-900 bg-yellow-50 px-1 rounded">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-3 mb-6 marker:text-slate-400">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      elements.push(<div key={`spacer-${i}`} className="h-4" />);
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="text-xl font-bold text-slate-800 mt-6 mb-3">{parseInline(trimmed.slice(4))}</h3>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">{parseInline(trimmed.slice(3))}</h2>);
    } 
    else if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
       const content = trimmed.replace(/^[\*\-\•]\s+/, '');
       listItems.push(<li key={`li-${i}`} className="leading-relaxed pl-2">{parseInline(content)}</li>);
    } 
    else {
      flushList();
      elements.push(<p key={`p-${i}`} className="mb-4 leading-relaxed text-slate-700">{parseInline(trimmed)}</p>);
    }
  });

  flushList();

  return (
    <div className="markdown-body text-right" dir="rtl">
      {elements}
    </div>
  );
};

export const AnalysisModal: React.FC<AnalysisModalProps> = ({ 
  isOpen, onClose, title, icon, content, loading, loadingHighlight, loadingMessage, color, onShare, onLogImageGeneration, onLogFeedback, chatCode, userId 
}) => {
  const styles = colorStyles[color] || colorStyles.blue;
  const [shareHubState, setShareHubState] = useState<'closed' | 'version' | 'platform' | 'visual_preview'>('closed');
  const [selectedShareText, setSelectedShareText] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);
  const [visualData, setVisualData] = useState<VisualAssetData | null>(null);
  const [visualAssetUrl, setVisualAssetUrl] = useState<string | null>(null);
  const [composedImageUrl, setComposedImageUrl] = useState<string | null>(null);
  const [copyingImage, setCopyingImage] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const displayContent = content?.replace(/^\[PRIVACY_NOTICE\].*\n\n/, "") || "";
  const privacyNoticeText = content?.match(/^\[PRIVACY_NOTICE\] (.*)\n\n/)?.[1] || "";
  
  const showLoading = loading || !displayContent;

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else {
      document.body.style.overflow = 'unset';
      setShareHubState('closed');
      setVisualAssetUrl(null);
      setComposedImageUrl(null);
      setFeedbackRating(null);
      setFeedbackComment('');
      setFeedbackSubmitted(false);
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const handleFeedbackSubmit = () => {
    if (feedbackRating !== null && onLogFeedback) {
        onLogFeedback(feedbackRating, feedbackComment);
        setFeedbackSubmitted(true);
    }
  };

  const constructShareableText = (bodyText: string) => {
    const branding = `\n\n🧠 הניתוח באדיבות 'הדודה' - בינה מלאכותית שמנתחת צ'אטים וחושפת תובנות עמוקות.\nנסו בעצמכם כאן: ${window.location.href}`;
    const privacy = privacyNoticeText ? `\n\n🔒 ${privacyNoticeText}` : "";
    return `${title}\n\n${bodyText}\n----------------${branding}${privacy}`;
  };

  const handleCopyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setShowCopiedTooltip(true);
    if (onShare) onShare('clipboard');
    setTimeout(() => setShowCopiedTooltip(false), 2000);
  };

  const handleSocialShare = (platform: 'whatsapp' | 'telegram' | 'facebook' | 'linkedin') => {
    if (onShare) onShare(platform);
    const text = selectedShareText;
    const url = window.location.href;
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);

    let shareUrl = '';
    
    switch(platform) {
        case 'whatsapp':
            shareUrl = `https://wa.me/?text=${encodedText}`; 
            break;
        case 'telegram':
            shareUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`;
            break;
        case 'linkedin':
            shareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodedText}`;
            break;
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyCanvasToClipboard = async () => {
    if (!canvasRef.current) return;
    setCopyingImage(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, 'image/png', 1.0));
      if (blob) {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        setShowCopiedTooltip(true);
        if (onShare) onShare('image_clipboard');
        setTimeout(() => setShowCopiedTooltip(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy image:', err);
      alert('לא ניתן היה להעתיק את התמונה אוטומטית. נסה להוריד אותה במקום.');
    } finally {
      setCopyingImage(false);
    }
  };

  const handleVersionSelect = async (version: 'original' | 'abbreviated' | 'cartoon_image') => {
    if (version === 'original') {
      setSelectedShareText(constructShareableText(displayContent));
      setShareHubState('platform');
    } else if (version === 'abbreviated') {
      setIsSummarizing(true);
      try {
        const summary = await serverSummarizeForSharing(displayContent);
        if (chatCode && userId) {
          updateChatCacheAction(userId, chatCode, 'summary_for_sharing', summary).catch(e => console.error('Failed to log summary', e));
        }
        setSelectedShareText(constructShareableText(summary));
        setShareHubState('platform');
      } catch { alert("אירעה שגיאה בסיכום."); }
      finally { setIsSummarizing(false); }
    } else if (version === 'cartoon_image') {
      setIsSummarizing(true);
      try {
        const vData = await serverGetVisualAssetData(displayContent, title);
        if (chatCode && userId) {
          updateChatCacheAction(userId, chatCode, 'visual_asset_data', vData).catch(e => console.error('Failed to log visual data', e));
        }
        setVisualData(vData);
        const url = await serverGenerateCartoonImage(vData.visualPrompt);
        if (onLogImageGeneration) onLogImageGeneration();
        setVisualAssetUrl(url);
        setShareHubState('visual_preview');
      } catch (e: any) { 
        console.error("Image generation error:", e);
        alert(`שגיאה ביצירת התמונה: ${e.message || "נא לנסות שוב מאוחר יותר"}`); 
      }
      finally { setIsSummarizing(false); }
    }
  };

  useEffect(() => {
    if (shareHubState === 'visual_preview' && visualAssetUrl && visualData && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = visualAssetUrl;

      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      logoImg.src = LOGO_URL;

      Promise.all([
        new Promise((resolve) => { img.onload = resolve; }),
        new Promise((resolve) => { logoImg.onload = resolve; logoImg.onerror = resolve; })
      ]).then(() => {
        const size = 1080;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        
        // Draw Logo on Canvas
        const logoSize = 120;
        const logoPadding = 40;
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoPadding + logoSize/2, logoPadding + logoSize/2, logoSize/2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logoImg, logoPadding, logoPadding, logoSize, logoSize);
        ctx.restore();
        
        ctx.textAlign = 'center';
        ctx.direction = 'rtl';
        ctx.fillStyle = 'white';
        // Add text strokes and shadows for readability
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'black';
        ctx.font = '900 68px Heebo, sans-serif';
        ctx.strokeText(visualData.headline, size / 2, 110);
        ctx.fillText(visualData.headline, size / 2, 110);
        ctx.shadowBlur = 0; 
        
        const overlayHeight = 540; 
        
        ctx.textAlign = 'right';
        ctx.direction = 'rtl';
        ctx.fillStyle = 'white';
        ctx.font = '700 42px Heebo, sans-serif';
        ctx.textBaseline = 'top';
        
        // Setup shadow for points
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 15;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'black';
        
        const padding = 100;
        const maxWidth = size - (padding * 2);
        const lineHeight = 60;
        const gapBetweenPoints = 35;
        let currentY = size - overlayHeight + 65;

        const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
          const words = text.split(/\s+/);
          const lines = [];
          let currentLine = '';

          for (let n = 0; n < words.length; n++) {
            const testLine = currentLine + (currentLine ? ' ' : '') + words[n];
            const testWidth = context.measureText(testLine).width;
            if (testWidth > maxWidth && n > 0) {
              lines.push(currentLine);
              currentLine = words[n];
            } else {
              currentLine = testLine;
            }
          }
          lines.push(currentLine);
          return lines;
        };

        visualData.points.forEach((point) => {
          const wrappedLines = wrapText(ctx, point, maxWidth - 60);
          wrappedLines.forEach((line, index) => {
            const prefix = index === 0 ? '• ' : '   ';
            ctx.strokeText(prefix + line, size - padding, currentY);
            ctx.fillText(prefix + line, size - padding, currentY);
            currentY += lineHeight;
          });
          currentY += gapBetweenPoints;
        });
        
        ctx.font = '300 24px Heebo, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        ctx.strokeText('בוצע באמצעות "הדודה" - ניתוח אנונימי', size / 2, size - 50);
        ctx.fillText('בוצע באמצעות "הדודה" - ניתוח אנונימי', size / 2, size - 50);

        setComposedImageUrl(canvas.toDataURL('image/png'));
      });
    }
  }, [shareHubState, visualAssetUrl, visualData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fadeIn cursor-pointer" onClick={onClose} />
      <div className="relative bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl flex flex-col overflow-hidden animate-slideUp">
        <div className={`p-6 flex items-center justify-between shrink-0 shadow-md z-10 ${styles.headerBg} ${styles.headerText}`}>
           <div className="flex items-center gap-4">
              <img src={LOGO_URL} className="w-12 h-12 rounded-full border-2 border-white/50 shadow-sm" alt="Logo" />
              <div className={`p-2.5 rounded-xl ${styles.iconBg} bg-opacity-30 backdrop-blur-md shadow-inner`}>
                <div className="text-white w-8 h-8">{icon}</div>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h2>
           </div>
           <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition-colors cursor-pointer">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-50 relative">
           {showLoading ? (
             <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-8 animate-fadeIn">
                <div className="h-16 w-16 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin"></div>
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800 min-h-[32px]" dir="rtl">
                    {loadingMessage || 'ה-AI מנתח...'}
                    {loadingMessage && <span className="animate-pulse">_</span>}
                  </h3>
                </div>
                {loadingHighlight && (
                  <div className="w-full">
                     <SnippetRenderer text={loadingHighlight} />
                  </div>
                )}
             </div>
           ) : (
             <div className="max-w-4xl mx-auto animate-fadeIn text-right" dir="rtl">
                <div className="flex justify-center mb-6">
                   <img src={LOGO_URL} className="w-20 h-20 opacity-90 object-contain rounded-full" alt="Logo" />
                </div>
                {privacyNoticeText && <PrivacyNotice text={privacyNoticeText} />}
                <MarkdownRenderer text={displayContent} />
                
                {/* Feedback Section */}
                {!feedbackSubmitted ? (
                    <div className="mt-12 mb-8 p-8 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-3xl text-center shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500"></div>
                        <h4 className="text-2xl font-black text-slate-800 mb-2">עד כמה הניתוח היה מדויק?</h4>
                        <p className="text-slate-500 text-sm mb-8">דרגו אותנו מ-1 עד 9</p>
                        
                        <div className="relative max-w-md mx-auto mb-8 px-4" dir="ltr">
                            <div className="flex justify-between text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">
                                <span>ממש לא</span>
                                <span>בול פגיעה</span>
                            </div>
                            
                            <div className="relative h-12 flex items-center justify-center">
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="9" 
                                    step="1"
                                    value={feedbackRating !== null ? feedbackRating : 5} 
                                    onChange={(e) => setFeedbackRating(parseInt(e.target.value))}
                                    className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all z-20 relative slider-custom"
                                    style={{
                                        background: `linear-gradient(to right, #818cf8 0%, #6366f1 ${((feedbackRating !== null ? feedbackRating : 5) - 1) / 8 * 100}%, #e2e8f0 ${((feedbackRating !== null ? feedbackRating : 5) - 1) / 8 * 100}%, #e2e8f0 100%)`
                                    }}
                                />
                                <div className="absolute inset-0 flex justify-between px-1 pointer-events-none z-10 items-center">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                        <div key={n} className={`w-1 h-1 rounded-full ${feedbackRating !== null && feedbackRating >= n ? 'bg-indigo-200' : 'bg-slate-300'}`}></div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="mt-4 h-12">
                                <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-xl font-black shadow-sm transition-all transform duration-300 ${
                                    feedbackRating === null ? 'bg-slate-100 text-slate-400 scale-90' :
                                    feedbackRating < 4 ? 'bg-red-100 text-red-600 rotate-[-6deg] scale-100' :
                                    feedbackRating < 7 ? 'bg-amber-100 text-amber-600 rotate-[0deg] scale-110' :
                                    'bg-emerald-100 text-emerald-600 rotate-[6deg] scale-125'
                                }`}>
                                    {feedbackRating !== null ? feedbackRating : 5}
                                </span>
                            </div>
                        </div>

                        {feedbackRating !== null && (
                            <div className="animate-fadeIn space-y-4 max-w-md mx-auto">
                                <textarea
                                    value={feedbackComment}
                                    onChange={(e) => setFeedbackComment(e.target.value)}
                                    placeholder="ספרו לנו עוד... מה אהבתם? מה חסר? (אופציונלי)"
                                    className="w-full p-4 rounded-2xl border-2 border-indigo-100 focus:border-indigo-400 focus:ring-0 outline-none text-right min-h-[100px] bg-white shadow-inner resize-none transition-all"
                                    dir="rtl"
                                />
                                <button 
                                    onClick={handleFeedbackSubmit}
                                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 cursor-pointer"
                                >
                                    שלח משוב
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mt-12 mb-8 p-6 bg-green-50 border border-green-100 rounded-2xl text-center animate-fadeIn">
                        <div className="text-green-600 font-bold text-lg mb-2">תודה על המשוב!</div>
                        <p className="text-green-700 text-sm">הדעה שלכם חשובה לנו ועוזרת לנו להשתפר.</p>
                    </div>
                )}

                <div className="mt-8 flex justify-center">
                   <button onClick={() => setShareHubState('version')} className="px-12 py-4 rounded-full font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-xl cursor-pointer">שתף תוצאות</button>
                </div>
             </div>
           )}
        </div>

        {shareHubState !== 'closed' && (
          <div className="absolute inset-0 z-30 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fadeIn overflow-y-auto">
            <button onClick={() => setShareHubState('closed')} className="absolute top-6 left-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            
            {shareHubState === 'version' ? (
                <div className="w-full max-w-lg text-center space-y-6">
                    <h3 className="text-3xl font-black text-slate-800">איך תרצו לשתף?</h3>
                    <div className="grid grid-cols-1 gap-3">
                        <button onClick={() => handleVersionSelect('original')} className="p-4 bg-slate-50 border rounded-2xl text-right flex justify-between items-center cursor-pointer"><span className="font-bold">הניתוח המלא</span><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                        <button onClick={() => handleVersionSelect('abbreviated')} className="p-4 bg-slate-50 border rounded-2xl text-right flex justify-between items-center cursor-pointer"><span className="font-bold">גרסה מקוצרת</span><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <button onClick={() => handleVersionSelect('cartoon_image')} disabled={isSummarizing} className="p-4 bg-amber-50 border rounded-2xl text-right flex justify-between items-center relative cursor-pointer">
                          {isSummarizing && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><div className="h-4 w-4 border-2 border-amber-500 border-t-transparent animate-spin rounded-full"></div></div>}
                          <span className="font-bold">מי אני - בתמונה</span>
                        </button>
                    </div>
                </div>
            ) : shareHubState === 'visual_preview' ? (
                <div className="w-full max-w-lg text-center space-y-6">
                    <h3 className="text-2xl font-black text-slate-800">הנה התמונה שלך!</h3>
                    <div className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl bg-black border-4 border-white flex items-center justify-center">
                        {composedImageUrl ? (
                           <img src={composedImageUrl} alt="Generated Card" className="w-full h-full object-contain" />
                        ) : (
                           <div className="flex flex-col items-center justify-center text-white space-y-2">
                             <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                             <span className="text-sm">מעבד תמונה...</span>
                           </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                         <button 
                            onClick={handleCopyCanvasToClipboard} 
                            disabled={copyingImage || !composedImageUrl}
                            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 relative overflow-hidden cursor-pointer"
                         >
                            {copyingImage && <div className="absolute inset-0 bg-indigo-900/40 animate-pulse" />}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            <span>{showCopiedTooltip ? 'הועתק!' : 'העתק תמונה'}</span>
                         </button>
                         <button 
                            onClick={() => { if(canvasRef.current) { const link = document.createElement('a'); link.download = 'psychologist_card.png'; link.href = canvasRef.current.toDataURL(); link.click(); } }} 
                            disabled={!composedImageUrl}
                            className="w-full py-4 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer"
                         >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span>הורד ושתף</span>
                         </button>
                    </div>
                    <button onClick={() => setShareHubState('version')} className="text-slate-400 text-xs font-bold underline cursor-pointer">בחר גרסה אחרת</button>
                </div>
            ) : (
              <div className="w-full max-w-lg space-y-6 text-center">
                  <h3 className="text-2xl font-black text-slate-800">שתף את הניתוח</h3>
                  
                  {/* Copy Button */}
                  <button onClick={() => handleCopyText(selectedShareText)} className="w-full py-5 rounded-3xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-lg relative flex items-center justify-center gap-3 transition-colors border border-slate-200 cursor-pointer">
                    <CopyIcon />
                    {showCopiedTooltip ? "הועתק ללוח!" : "העתק טקסט ללוח"}
                  </button>

                  <div className="grid grid-cols-2 gap-4">
                     <button onClick={() => handleSocialShare('whatsapp')} className="p-4 rounded-2xl bg-[#25D366] text-white flex flex-col items-center justify-center gap-2 hover:bg-[#20bd5a] transition-colors shadow-sm cursor-pointer">
                       <WhatsappIcon />
                       <span className="font-bold text-sm">WhatsApp</span>
                     </button>
                     <button onClick={() => handleSocialShare('telegram')} className="p-4 rounded-2xl bg-[#0088cc] text-white flex flex-col items-center justify-center gap-2 hover:bg-[#0077b5] transition-colors shadow-sm cursor-pointer">
                       <TelegramIcon />
                       <span className="font-bold text-sm">Telegram</span>
                     </button>
                     <button onClick={() => handleSocialShare('facebook')} className="p-4 rounded-2xl bg-[#1877F2] text-white flex flex-col items-center justify-center gap-2 hover:bg-[#166fe5] transition-colors shadow-sm cursor-pointer">
                       <FacebookIcon />
                       <span className="font-bold text-sm">Facebook</span>
                     </button>
                     <button onClick={() => handleSocialShare('linkedin')} className="p-4 rounded-2xl bg-[#0A66C2] text-white flex flex-col items-center justify-center gap-2 hover:bg-[#004182] transition-colors shadow-sm cursor-pointer">
                       <LinkedinIcon />
                       <span className="font-bold text-sm">LinkedIn</span>
                     </button>
                  </div>
                  
                  <div className="p-4 bg-slate-50 border rounded-xl text-xs text-slate-500 leading-relaxed text-right">
                    💡 <b>טיפ:</b> בוואטסאפ וטלגרם הטקסט המלא יועתק אוטומטית. בפייסבוק ולינקדאין ייתכן שתצטרכו להדביק את הטקסט ידנית (השתמשו בכפתור ההעתקה למעלה).
                  </div>

                  <button onClick={() => setShareHubState('version')} className="text-slate-400 text-xs font-bold underline mt-4 cursor-pointer">חזרה לבחירת גרסה</button>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out both; }
      `}</style>
    </div>
  );
};
