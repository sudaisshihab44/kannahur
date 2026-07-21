import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Maximize2, Minimize2, HeartPulse, Sparkles, ArrowRight, Bell, Tv } from 'lucide-react';
import { Token, TokenStatus, QueueSettings, Doctor } from '../types';

interface TVDisplayProps {
  tokens: Token[];
  settings: QueueSettings;
  doctors?: Doctor[];
  onBackToApp?: () => void;
}

const getPriorityWeight = (priority: string | undefined): number => {
  if (!priority) return 0;
  switch (priority) {
    case 'VIP': return 4;
    case 'Person with Disability': return 3;
    case 'Pregnant Woman': return 2;
    case 'Senior Citizen': return 1;
    case 'Normal':
    default:
      return 0;
  }
};

export default function TVDisplay({ tokens, settings, doctors = [], onBackToApp }: TVDisplayProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCalledIdRef = useRef<string | null>(null);

  // Active called tokens, sorted by most recently called
  const calledTokens = tokens
    .filter(t => t.status === TokenStatus.CALLED)
    .sort((a, b) => new Date(b.calledAt || "").getTime() - new Date(a.calledAt || "").getTime());

  const currentActive = calledTokens[0] || null;
  const otherCalled = calledTokens.slice(1, 4);

  // Upcoming waiting list (next 5 tokens)
  const upNextTokens = tokens
    .filter(t => t.status === TokenStatus.WAITING)
    .sort((a, b) => {
      const weightA = getPriorityWeight(a.priority);
      const weightB = getPriorityWeight(b.priority);
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .slice(0, 5);

  // Speech synthesis for voice calls when current active token changes
  useEffect(() => {
    if (currentActive && isAudioEnabled && lastCalledIdRef.current !== currentActive.id) {
      lastCalledIdRef.current = currentActive.id;
      
      // Delay slightly to prevent browser double-trigger issues
      const timeout = setTimeout(() => {
        try {
          if ('speechSynthesis' in window) {
            // Cancel current speech
            window.speechSynthesis.cancel();
            
            // Format spelling for spelling out prefixes clearly (e.g. G-E-N 0-0-2)
            const prefixSpelled = currentActive.tokenNumber.split('-')[0].split('').join(' ');
            const numberSpelled = currentActive.tokenNumber.split('-')[1];
            
            const text = `Attention please. Token number ${prefixSpelled} ${numberSpelled}, patient ${currentActive.patientName}, please proceed to ${currentActive.doctorName}'s consultation room.`;
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9; // Friendly slower rate
            utterance.pitch = 1.0;
            
            // Try to find a nice female English voice if available
            const voices = window.speechSynthesis.getVoices();
            const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
            if (englishVoice) {
              utterance.voice = englishVoice;
            }
            
            window.speechSynthesis.speak(utterance);
          }
        } catch (err) {
          console.warn("Speech synthesis failed or blocked by autoplay permissions:", err);
        }
      }, 600);

      return () => clearTimeout(timeout);
    }
  }, [currentActive, isAudioEnabled]);

  // Fullscreen trigger
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error(`Error trying to enable fullscreen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-between relative overflow-hidden"
    >
      {/* Premium ambient backdrop glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top TV Header Panel */}
      <header className="p-6 bg-slate-900/60 border-b border-slate-800/80 backdrop-blur-md flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          {settings.hospitalInfo.logoUrl ? (
            <img 
              src={settings.hospitalInfo.logoUrl} 
              alt="Hospital Logo" 
              referrerPolicy="no-referrer"
              className="w-14 h-14 object-contain rounded-xl bg-white p-1 shadow-md"
            />
          ) : (
            <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg animate-pulse">
              <HeartPulse className="h-8 w-8" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight text-white flex items-center gap-2">
              {settings.hospitalInfo.name}
              <span className="text-xs px-2.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full font-sans font-semibold border border-blue-500/30">
                Live Queue Monitor
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">{settings.hospitalInfo.tagline}</p>
          </div>
        </div>

        {/* Controls Overlay */}
        <div className="flex items-center gap-2.5">
          {onBackToApp && !isFullscreen && (
            <button
              onClick={onBackToApp}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-colors"
            >
              Exit Display
            </button>
          )}

          <button
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            className={`p-2.5 rounded-xl border transition-all ${
              isAudioEnabled 
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 hover:bg-blue-600/30' 
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
            title={isAudioEnabled ? "Mute Voice Alerts" : "Enable Voice Alerts"}
          >
            {isAudioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Main Board Grid split 60/40 */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-5 gap-6 z-10">
        
        {/* Left Side: Currently Serving (Big Display) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="flex-1 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden">
            
            {/* Top row of current card */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-400 animate-bounce" />
                <span className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                  Currently Serving / Now Calling
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Huge center number */}
            {currentActive ? (
              <div className="my-8 text-center space-y-4">
                <div className="inline-block bg-blue-500/10 border border-blue-500/20 px-8 py-2 rounded-2xl text-blue-400 text-xs font-semibold uppercase tracking-widest">
                  {currentActive.departmentName}
                </div>
                
                {/* Active Token Callout Box */}
                <div className="text-8xl sm:text-9xl font-display font-extrabold text-white tracking-tight animate-pulse select-text selection:bg-blue-500">
                  {currentActive.tokenNumber}
                </div>

                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-100">
                    {currentActive.doctorName}
                  </h2>
                  <p className="text-sm text-slate-400 font-medium uppercase tracking-wide">
                    Room {doctors.find(d => d.id === currentActive.doctorId)?.roomNumber || (currentActive.departmentId === "dep-1" ? "101" : currentActive.departmentId === "dep-2" ? "204" : currentActive.departmentId === "dep-3" ? "302" : "G-12")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="my-12 text-center py-16 space-y-3">
                <Tv className="h-16 w-16 text-slate-600 mx-auto" />
                <h3 className="text-xl font-bold text-slate-400">All Consultations Active</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Reception has completed all called tokens. Waiting for the next queue activation.
                </p>
              </div>
            )}

            {/* Footer details showing patient reference */}
            {currentActive && (
              <div className="pt-4 border-t border-slate-800/80 flex justify-between items-center text-xs text-slate-400">
                <span>Patient Reference: <strong className="text-slate-200">{currentActive.patientName}</strong></span>
                <span>Type: <strong className={currentActive.priority && currentActive.priority !== "Normal" ? "text-red-400 font-bold" : "text-blue-400"}>{currentActive.priority && currentActive.priority !== "Normal" ? currentActive.priority.toUpperCase() : "Standard Care"}</strong></span>
              </div>
            )}
          </div>

          {/* Sub Panel: Other Active Rooms */}
          <div className="grid grid-cols-3 gap-4">
            {otherCalled.length > 0 ? (
              otherCalled.map((t) => (
                <div key={t.id} className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">
                      {t.departmentName}
                    </span>
                    <span className="text-xl font-display font-bold text-blue-400 mt-1 block">
                      {t.tokenNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-300 font-semibold truncate block">{t.doctorName}</span>
                    <span className="text-[10px] text-slate-500 font-mono uppercase block">Active Lounge</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 py-4 text-center text-xs text-slate-600 bg-slate-900/10 border border-dashed border-slate-800 rounded-2xl">
                No secondary active rooms currently calling.
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Up Next (Waiting List) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/80">
                <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Up Next / Waiting List
                </span>
                <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide">
                  Estimated Queue
                </span>
              </div>

              <div className="space-y-3.5">
                {upNextTokens.length > 0 ? (
                  upNextTokens.map((t, index) => (
                    <div 
                      key={t.id} 
                      className={`p-3.5 rounded-2xl flex justify-between items-center transition-all ${
                        t.priority && t.priority !== 'Normal' 
                          ? 'bg-red-500/10 border border-red-500/30' 
                          : 'bg-slate-900/60 border border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-mono w-4 text-center">
                          {index + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg font-display font-extrabold tracking-tight text-white">
                              {t.tokenNumber}
                            </span>
                            {t.priority && t.priority !== 'Normal' && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-md font-bold uppercase tracking-wider">
                                {t.priority}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 truncate block max-w-[140px]">
                            {t.doctorName}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-200 font-medium block">
                          {t.departmentName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono uppercase block">
                          Waiting
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-16 text-center space-y-2">
                    <Sparkles className="h-8 w-8 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-400">All caught up!</p>
                    <p className="text-xs text-slate-500">
                      No general patient tokens are currently in queue.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick overview metric */}
            <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-4 text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Waiting</span>
                <span className="text-2xl font-display font-bold text-white mt-0.5 block">
                  {tokens.filter(t => t.status === TokenStatus.WAITING).length}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Average Wait</span>
                <span className="text-2xl font-display font-bold text-teal-400 mt-0.5 block">
                  ~14 mins
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Animated Scrolling Announcements Marquee ticker */}
      <footer className="bg-slate-900 border-t border-slate-800/80 py-3.5 z-10 flex items-center relative overflow-hidden h-14">
        <div className="px-6 bg-slate-900 z-20 font-bold text-xs text-amber-400 flex items-center gap-1.5 uppercase tracking-wider shrink-0 border-r border-slate-800">
          <Sparkles className="h-4 w-4 text-amber-400" />
          Notice:
        </div>
        
        {/* Continuous ticker animation using simple CSS marquee */}
        <div className="w-full relative overflow-hidden flex items-center">
          <div className="whitespace-nowrap flex gap-12 animate-marquee inline-block text-xs text-slate-300 font-medium tracking-wide">
            {settings.announcements.map((ann, index) => (
              <span key={ann.id || index} className="flex items-center gap-2">
                <span>{ann.text}</span>
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
              </span>
            ))}
            {/* Repeat list once for a smooth infinite scroll feel */}
            {settings.announcements.map((ann, index) => (
              <span key={`dup-${ann.id || index}`} className="flex items-center gap-2">
                <span>{ann.text}</span>
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
              </span>
            ))}
          </div>
        </div>
      </footer>

      {/* Inline styles for custom infinite marquee scroll animation */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 35s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
