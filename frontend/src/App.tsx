/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { initAxiomSession, sendAxiomMessage, parseSynthesisText, isDiagnosticComplete } from './axiomApiClient';
import { 
  User, 
  Settings, 
  Compass, 
  ShieldCheck, 
  ArrowRight,
  Menu,
  X,
  Play,
  Zap,
  BarChart3,
  Briefcase,
  Users2,
  ListTodo,
  Calendar,
  MoreHorizontal,
  ChevronRight,
  MessageSquare,
  Sparkles,
  QrCode,
  Plus,
  Target,
  LogOut,
  CreditCard,
  CheckCircle2,
  Check,
  AlertCircle,
  Camera,
  Download,
  Heart,
  Fingerprint,
  ArrowUpRight,
  ShieldAlert,
  Eye,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCodeSVG from 'react-qr-code';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// --- Firebase Init ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- Types ---
type AppMode = 'candidate' | 'recruiter';
type CandidateTab = 'espace' | 'adn' | 'prisme' | 'horizon';
type RecruiterTab = 'dashboard' | 'candidates' | 'managers' | 'postes' | 'offres' | 'pricing';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: AppMode;
  photoURL?: string;
  adn?: any;
}

// --- Mock Data ---
const REAL_PROFILE_DATA = {
  name: "James",
  mouvement: "Ce qui te fait avancer, ce n'est ni la compétition brute ni la reconnaissance sociale. C'est le moment où tu vois l'effet direct de ce que tu transmets : quand quelqu'un comprend, progresse, réussit grâce à toi.",
  temps: "Tu fonctionnes par phases d'intensité, activées par un cadre clair. Sans structure ou sans retour, ton énergie retombe — non par manque de capacité, mais par absence de déclencheur.",
  valeurs: "Tu agis d'abord en fonction de ce qui te semble juste. L'agressivité, la pression mal gérée et les jeux d'ego te coupent net.",
  projections: "Attiré par des univers complexes, tu valorises les figures agissant dans l'ombre avec du recul. Maîtrise silencieuse des systèmes plutôt que domination spectaculaire.",
  forces: "Rendre accessible ce qui est complexe, installer un climat de confiance, faire progresser les autres sans les écraser.",
  limites: "Besoin d'un cadre externe ; l'automotivation pure te coûte. C'est une lucidité qui est une vraie force si prise en compte.",
  positionnement: "Pédagogue-structurant : quelqu'un qui comprend, explique, accompagne, puis organise.",
  lecture_globale: "Une architecture dominée par la transmission et la stratégie, habitée par une quête de justesse plus que de performance brute.",
  boosters: [
    { label: "Transmission", value: 95 },
    { label: "Impact Humain", value: 88 },
    { label: "Structure Claire", value: 82 }
  ],
  freins: [
    { label: "Jeux d'Ego", value: 75 },
    { label: "Agressivité", value: 90 },
    { label: "Flou Stratégique", value: 65 }
  ],
  skills_data: [
    { subject: 'Logique', A: 92, fullMark: 100 },
    { subject: 'Empathie', A: 85, fullMark: 100 },
    { subject: 'Adaptabilité', A: 78, fullMark: 100 },
    { subject: 'Transmission', A: 95, fullMark: 100 },
    { subject: 'Stratégie', A: 88, fullMark: 100 },
    { subject: 'Patience', A: 90, fullMark: 100 },
  ]
};

const MATCHING_DATA = {
  verdict: "ALIGNEMENT CONDITIONNEL",
  verdictColor: "#3b82f6",
  pourquoi: "Ton moteur repose sur l'impact humain et la transmission, pas sur la vente frontale répétée. Le poste peut devenir cohérent si l'exposition commerciale est acceptée comme un passage nécessaire.",
  metier: "Tu n'as pas rejeté la vente, mais ce n'est pas ce qui te motive naturellement.",
  duree: "Tu peux tenir si un cadre clair et des responsabilités visibles structurent ton effort.",
  coherence: "Alignement possible entre ton besoin d'impact collectif et la logique long terme du portefeuille."
};

const MOCK_JOBS = [
  "Data Engineer", "Courtier en Énergie", "Product Designer", "Sales Manager", 
  "Expert Cybersécurité", "Hacker Éthique", "Chef de Projet IT", 
  "Consultant Stratégie", "Responsable RH", "Architecte Cloud"
];

const MOCK_MANAGERS = [
  { id: 1, initial: 'SM', name: 'Sophie Martin', role: 'Technique' },
  { id: 2, initial: 'TD', name: 'Thomas Dubois', role: 'Produit' },
  { id: 3, initial: 'ED', name: 'Edhy', role: 'Direction' },
];

// --- Shared Components ---
const Logo = ({ size = "default", className = "" }: { size?: "small" | "default" | "large"; className?: string }) => (
  <div className={`flex items-center gap-2 select-none pointer-events-none ${className}`}>
    <div className={`font-serif font-black tracking-tighter text-slate-900 flex items-center ${size === "large" ? "text-4xl" : size === "small" ? "text-base" : "text-2xl"}`}>
      <span className="text-reveliom-purple">R</span>EVELIOM
    </div>
  </div>
);

const CircularProgress = ({ percent, size = 180, color = "#7B5BF5", label = "", textColor = "text-slate-900" }: { percent: number; size?: number; color?: string; label?: string; textColor?: string }) => {
  const radius = size * 0.45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  
  // Calculate responsive font size
  const fontSizeClass = size < 40 ? 'text-[8px]' : size < 60 ? 'text-[10px]' : size < 120 ? 'text-xl' : 'text-3xl';

  return (
    <div className="relative flex flex-col items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none" stroke="#f1f5f9" strokeWidth={size * 0.12}
          opacity={0.3}
        />
        <motion.circle
          cx={size/2} cy={size/2} r={radius}
          fill="none" stroke={color} strokeWidth={size * 0.12}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${fontSizeClass} font-serif font-black ${textColor} leading-none`}>{percent}%</span>
        {label && size >= 80 && <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mt-1">{label}</span>}
      </div>
    </div>
  );
};

const DiagnosticChat = ({ user, profile, onComplete, onExit }: { user: UserProfile; profile: any; onComplete: (adn: any, meta: { sessionId: string; completedAt: string }) => void; onExit: () => void }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [fsmStep, setFsmStep] = useState<string>('');
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Unique session per DiagnosticChat mount — ensures a fresh FSM session each time
  const sessionIdRef = useRef<string>(user.uid + '_' + Date.now());

  // PREAMBULE_TEXT supprimé — le préambule vient du moteur AXIOM (API)

  const parseName = (displayName: string) => {
    const parts = (displayName || '').trim().split(' ');
    return { firstName: parts[0] ?? 'Utilisateur', lastName: parts.slice(1).join(' ') || 'REVELIOM' };
  };

  // Initialize session
  useEffect(() => {
    const init = async () => {
      if (!user) return;
      setIsTyping(true);
      try {
        const { firstName, lastName } = parseName(user.displayName);
        const { response, step } = await initAxiomSession({
          sessionId: sessionIdRef.current,
          firstName,
          lastName,
          email: user.email,
        });
        if (response) setMessages([{ id: Date.now(), role: 'ai', text: response }]);
        setFsmStep(step);
      } catch (e) {
        console.error("AXIOM Init Error:", e);
        setMessages([{ id: Date.now(), role: 'ai', text: "Bienvenue dans REVELIOM. Une erreur s'est produite. Veuillez réessayer." }]);
      }
      setIsTyping(false);
    };
    init();
    return () => { abortRef.current?.abort(); };
  }, [user]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, streamingText]);

  // Envoie un événement FSM sans bulle utilisateur visible
  const sendEventSilent = (eventName: string) => {
    if (isTyping) return;
    abortRef.current?.abort();
    setIsTyping(true);
    setStreamingText("");
    let accumulated = "";
    abortRef.current = sendAxiomMessage(sessionIdRef.current, '', {
      onToken: (chunk) => { accumulated += chunk; setStreamingText(accumulated); },
      onDone: (event) => {
        const text = event.response || accumulated;
        setStreamingText("");
        if (text) setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text }]);
        setFsmStep(event.step);
        setIsTyping(false);
        if (isDiagnosticComplete(event.step)) {
          const synthese = parseSynthesisText(text);
          setTimeout(() => onComplete(synthese, { sessionId: sessionIdRef.current, completedAt: new Date().toISOString() }), 2500);
        }
      },
      onError: (msg) => {
        console.error("AXIOM Event Error:", msg);
        setStreamingText("");
        setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: "Une erreur s'est produite. Veuillez réessayer." }]);
        setIsTyping(false);
      },
    }, eventName);  // ← passe eventName comme eventOverride
  };

  const handleSendMessage = (userText: string) => {
    if (!userText.trim() || isTyping || !user) return;
    abortRef.current?.abort();
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: userText }]);
    setInputValue("");
    setIsTyping(true);
    setStreamingText("");
    let accumulated = "";
    abortRef.current = sendAxiomMessage(sessionIdRef.current, userText, {
      onToken: (chunk) => { accumulated += chunk; setStreamingText(accumulated); },
      onDone: (event) => {
        const text = event.response || accumulated;
        setStreamingText("");
        if (text) setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text }]);
        setFsmStep(event.step);
        setIsTyping(false);
        if (isDiagnosticComplete(event.step)) {
          const synthese = parseSynthesisText(text);
          setTimeout(() => onComplete(synthese, { sessionId: sessionIdRef.current, completedAt: new Date().toISOString() }), 2500);
        }
      },
      onError: (msg) => {
        console.error("AXIOM Stream Error:", msg);
        setStreamingText("");
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: "Une erreur s'est produite. Veuillez réessayer." }]);
        setIsTyping(false);
      },
    });
  };

  const extractChoices = (text: string) => {
    const regex = /^\s*([A-E])\.\s*(.*)$/gm;
    return Array.from(text.matchAll(regex)).map(m => ({ id: m[1], text: m[2] }));
  };

  const cleanMessage = (text: string) =>
    text
      .replace(/^.*PRÉAMBULE REVELIOM[^\n]*/im, '')   // ligne interne du prompt
      .replace(/^.*AFFICHAGE OBLIGATOIRE[^\n]*/im, '') // variante
      .replace(/^\s*[A-E]\.\s*.*$/gm, '')              // choix multiples inline
      .replace(/^[🔒🟢].*/gm, '')                      // marqueurs internes
      .trim();

  const isWaitingForStart = fsmStep === 'STEP_03_BLOC1';
  const isWaitingContinueBloc3 = fsmStep === 'STEP_WAIT_BLOC_3';
  const lastAiMsg = [...messages].reverse().find(m => m.role === 'ai');
  const activeText = streamingText || lastAiMsg?.text || "";
  const aiChoices = !isTyping && !isWaitingForStart && !isWaitingContinueBloc3 ? extractChoices(activeText) : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-white z-[120] flex flex-col overflow-hidden"
    >
      {/* Header immersif */}
      <header className="h-14 px-5 flex items-center justify-between border-b border-slate-100/80 shrink-0 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-reveliom-purple flex items-center justify-center text-white shadow-sm shadow-reveliom-purple/30">
            <Sparkles className="w-4 h-4 fill-current" />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-slate-900 tracking-tight leading-none">REVELIOM</span>
            <span className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">Diagnostic de profil</span>
          </div>
        </div>
        <button onClick={onExit} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all">
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Zone messages — style immersif ChatGPT */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar bg-[#F9F9FB] relative">
        {/* Halo atmosphérique violet — très subtil, donne la "bulle" REVELIOM */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(124,58,237,0.05)_0%,transparent_100%)]" />
        <div className="max-w-[680px] mx-auto px-4 py-8 space-y-8 relative">

          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={m.role === 'user'
                ? { opacity: 0, x: 20 }
                : { opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={m.role === 'user'
                ? { opacity: 1, x: 0 }
                : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={m.role === 'user'
                ? { duration: 0.3, ease: 'easeOut' }
                : { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start items-start gap-4'}`}
            >
              {m.role === 'ai' ? (
                <>
                  {/* Avatar REVELIOM */}
                  <div className="w-8 h-8 rounded-xl bg-reveliom-purple flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-reveliom-purple/30">
                    <span className="text-white text-[11px] font-black tracking-tight">R</span>
                  </div>
                  {/* Texte AI sans boîte — style conversationnel */}
                  <div className="flex-1 text-[15.5px] leading-[1.8] text-slate-800 pt-1">
                    {cleanMessage(m.text).split('\n').map((line, i) => {
                      if (line.trim() === '') return <div key={i} className="h-4" />;
                      const isMirror = /^[123]️⃣/.test(line);
                      if (isMirror) return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -16, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
                          className="my-3 px-4 py-3 bg-white border-l-[3px] border-reveliom-purple/60 rounded-r-xl text-slate-800 font-semibold text-[15px] leading-snug shadow-sm"
                        >
                          {line}
                        </motion.div>
                      );
                      return <p key={i} className="leading-[1.8]">{line}</p>;
                    })}
                  </div>
                </>
              ) : (
                /* Bulle utilisateur — sobre et lisible */
                <div className="max-w-[72%] bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-sm text-[15px] leading-[1.7]">
                  {cleanMessage(m.text).split('\n').map((line, i) => (
                    <p key={i} className={line.trim() === '' ? 'h-2' : ''}>{line}</p>
                  ))}
                </div>
              )}
            </motion.div>
          ))}

          {/* Streaming — même style AI */}
          {isTyping && streamingText && (
            <motion.div initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }} className="flex justify-start items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-reveliom-purple flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-reveliom-purple/30">
                <span className="text-white text-[11px] font-black tracking-tight">R</span>
              </div>
              <div className="flex-1 text-[15.5px] leading-[1.8] text-slate-800 pt-1">
                {cleanMessage(streamingText).split('\n').map((line, i) => {
                  if (line.trim() === '') return <div key={i} className="h-4" />;
                  const isMirror = /^[123]️⃣/.test(line);
                  if (isMirror) return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -16, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
                      className="my-3 px-4 py-3 bg-white border-l-[3px] border-reveliom-purple/60 rounded-r-xl text-slate-800 font-semibold text-[15px] leading-snug shadow-sm"
                    >
                      {line}
                    </motion.div>
                  );
                  return <p key={i} className="leading-[1.8]">{line}</p>;
                })}
                <span className="inline-block w-0.5 h-[1em] bg-reveliom-purple ml-0.5 animate-pulse align-middle" />
              </div>
            </motion.div>
          )}

          {/* Typing dots */}
          {isTyping && !streamingText && (
            <div className="flex justify-start items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-reveliom-purple flex items-center justify-center shrink-0 shadow-sm shadow-reveliom-purple/30">
                <span className="text-white text-[11px] font-black tracking-tight">R</span>
              </div>
              <div className="flex items-center gap-1.5 px-4 py-3.5 bg-white border border-slate-100 rounded-2xl rounded-tl-sm shadow-sm mt-0.5">
                {[0, 0.18, 0.36].map((delay, i) => (
                  <motion.span key={i} animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1, 0.8] }} transition={{ repeat: Infinity, duration: 1.3, delay }} className="w-2 h-2 bg-reveliom-purple/70 rounded-full" />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Footer immersif */}
      <footer className="px-4 pt-3 pb-5 border-t border-slate-100/80 bg-white/90 backdrop-blur-sm shrink-0">
        <div className="max-w-[680px] mx-auto flex flex-col gap-2.5">

          {/* Bouton démarrer (FSM wait_start_button) */}
          {isWaitingForStart && !isTyping && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{
                opacity: 1, y: 0,
                boxShadow: [
                  '0 8px 20px rgba(124,58,237,0.20)',
                  '0 8px 28px rgba(124,58,237,0.40)',
                  '0 8px 20px rgba(124,58,237,0.20)'
                ]
              }}
              transition={{
                opacity: { duration: 0.4 },
                y: { duration: 0.4 },
                boxShadow: { repeat: Infinity, duration: 2.6, ease: 'easeInOut' }
              }}
              onClick={() => sendEventSilent('START_BLOC_1')}
              className="w-full py-4 bg-reveliom-purple text-white rounded-2xl font-bold text-[15px] tracking-wide hover:bg-reveliom-purple/90 active:scale-[0.98] transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              Je commence mon profil
            </motion.button>
          )}

          {/* Bouton continuer vers BLOC 3 (après miroir 2B) */}
          {isWaitingContinueBloc3 && !isTyping && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{
                opacity: 1, y: 0,
                boxShadow: [
                  '0 8px 20px rgba(124,58,237,0.20)',
                  '0 8px 28px rgba(124,58,237,0.40)',
                  '0 8px 20px rgba(124,58,237,0.20)'
                ]
              }}
              transition={{
                opacity: { duration: 0.4 },
                y: { duration: 0.4 },
                boxShadow: { repeat: Infinity, duration: 2.6, ease: 'easeInOut' }
              }}
              onClick={() => sendEventSilent('START_BLOC_3')}
              className="w-full py-4 bg-reveliom-purple text-white rounded-2xl font-bold text-[15px] tracking-wide hover:bg-reveliom-purple/90 active:scale-[0.98] transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              Je commence mon profil
            </motion.button>
          )}

          {/* Choix multiples — cartes pleine largeur empilées */}
          {aiChoices.length > 0 && !isTyping && (
            <div className="flex flex-col gap-2">
              {aiChoices.map((choice, i) => (
                <motion.button
                  key={choice.id}
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.09, duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
                  onClick={() => handleSendMessage(choice.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200 hover:border-reveliom-purple hover:bg-reveliom-purple/[0.03] rounded-xl text-[14px] font-medium text-slate-700 hover:text-reveliom-purple transition-all text-left group active:scale-[0.99] shadow-sm"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-reveliom-purple/10 flex items-center justify-center text-[12px] font-bold text-slate-500 group-hover:text-reveliom-purple shrink-0 transition-all">{choice.id}</span>
                  <span className="flex-1 leading-snug">{choice.text}</span>
                </motion.button>
              ))}
            </div>
          )}

          {/* Input texte */}
          {!isWaitingForStart && !isWaitingContinueBloc3 && (
            <div className="relative mt-1">
              <input
                type="text"
                placeholder={aiChoices.length > 0 ? "Ou écrivez directement votre réponse..." : "Écrivez votre réponse..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
                disabled={isTyping}
                className="w-full pl-5 pr-14 py-3.5 bg-white border border-slate-200 focus:border-reveliom-purple/60 focus:ring-2 focus:ring-reveliom-purple/10 rounded-2xl text-[15px] outline-none transition-all disabled:opacity-40 placeholder:text-slate-400 shadow-sm"
              />
              <button
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isTyping}
                className="absolute right-2 top-2 bottom-2 px-3.5 bg-reveliom-purple text-white rounded-xl flex items-center justify-center hover:bg-reveliom-purple/90 active:scale-95 transition-all disabled:opacity-20"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </footer>
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mode, setMode] = useState<AppMode>('candidate');
  const [candidateTab, setCandidateTab] = useState<CandidateTab>('espace');
  const [recruiterTab, setRecruiterTab] = useState<RecruiterTab>('dashboard');
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showOfferCreator, setShowOfferCreator] = useState(false);
  const [showMatchingDetails, setShowMatchingDetails] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [showInvitationLink, setShowInvitationLink] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const docRef = doc(db, 'users', fbUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const profile = docSnap.data() as UserProfile;
          setUser({ ...profile, uid: fbUser.uid });
          setMode(profile.role);
        } else {
          // New user, stay in auth flow to select role
          setUser({ uid: fbUser.uid, email: fbUser.email || '', displayName: fbUser.displayName || '', role: 'candidate' });
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleRoleSelection = async (selectedRole: AppMode) => {
    if (!user) return;
    const newProfile = { ...user, role: selectedRole };
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setUser(newProfile);
    setMode(selectedRole);
  };

  const handleDiagnosticComplete = async (adn: any, meta?: { sessionId: string; completedAt: string }) => {
    if (!user) return;
    const updatedUser = { ...user, adn };
    // Sauvegarder l'ADN parsé dans le profil principal
    await setDoc(doc(db, 'users', user.uid), updatedUser);
    // Sauvegarder le diagnostic complet dans une sous-collection pour data analysis
    if (meta) {
      await setDoc(doc(db, 'users', user.uid, 'diagnostics', meta.sessionId), {
        adn,
        sessionId: meta.sessionId,
        completedAt: meta.completedAt,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
    }
    setUser(updatedUser);
    setShowDiagnostic(false);
    setCandidateTab('adn');
  };

  const handleUpdatePhoto = async (photoURL: string) => {
    if (!user) return;
    const updatedUser = { ...user, photoURL };
    await setDoc(doc(db, 'users', user.uid), updatedUser);
    setUser(updatedUser);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-reveliom-purple"></div>
      </div>
    );
  }

  if (!user || (user && !user.role)) {
    return <AuthOverlay onComplete={handleRoleSelection} user={user} />;
  }

  return (
    <div className="min-h-screen bg-reveliom-light selection:bg-reveliom-purple/20 flex flex-col antialiased">
      
      {/* Top Bar Navigation */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-[60] h-20 shrink-0 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">
            <Logo />

            <div className="flex items-center gap-4">
              {/* Perspective Toggle */}
              <div className="bg-slate-100 p-1 rounded-full flex gap-1 mr-4 border border-slate-200 shadow-inner">
                <button
                  onClick={() => setMode('candidate')}
                  className={`px-3 py-1.5 sm:px-5 sm:py-2 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'candidate' ? 'bg-white text-reveliom-purple shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Candidat
                </button>
                <button
                  onClick={() => setMode('recruiter')}
                  className={`px-3 py-1.5 sm:px-5 sm:py-2 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'recruiter' ? 'bg-white text-reveliom-purple shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Recruteur
                </button>
              </div>

              {mode === 'candidate' && (
                <button 
                  onClick={() => setShowDiagnostic(true)}
                  className="hidden sm:flex items-center gap-2 px-6 py-3 bg-reveliom-purple text-white text-sm font-bold rounded-full hover:shadow-lg transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Lancer le diagnostic
                </button>
              )}

              <div className="flex items-center gap-6">
                <div className="w-11 h-11 rounded-full border-2 border-slate-100 bg-white flex items-center justify-center p-0.5 cursor-pointer hover:border-reveliom-purple transition-all group overflow-hidden relative">
                  <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold font-serif uppercase overflow-hidden">
                     {user.displayName.substring(0, 2).toUpperCase()}
                  </div>
                  <button onClick={() => signOut(auth)} className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        
        {/* View Specific Sub-Navigation */}
        <div className="flex justify-center mb-10 overflow-x-auto no-scrollbar">
          <div className="inline-flex bg-white p-1 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 shrink-0">
            {mode === 'candidate' ? (
              <>
                <TabButton active={candidateTab === 'espace'} onClick={() => setCandidateTab('espace')}>Mon Espace</TabButton>
                <TabButton active={candidateTab === 'adn'} onClick={() => setCandidateTab('adn')}>Mon ADN</TabButton>
                <TabButton active={candidateTab === 'prisme'} onClick={() => setCandidateTab('prisme')}>Mon Prisme</TabButton>
                <TabButton active={candidateTab === 'horizon'} onClick={() => setCandidateTab('horizon')}>Mon Horizon</TabButton>
              </>
            ) : (
              <>
                <TabButton active={recruiterTab === 'dashboard'} onClick={() => setRecruiterTab('dashboard')}>Dashboard</TabButton>
                <TabButton active={recruiterTab === 'managers'} onClick={() => setRecruiterTab('managers')}>Managers</TabButton>
                <TabButton active={recruiterTab === 'postes'} onClick={() => setRecruiterTab('postes')}>Postes</TabButton>
                <TabButton active={recruiterTab === 'offres'} onClick={() => setRecruiterTab('offres')}>Offres</TabButton>
                <TabButton active={recruiterTab === 'candidates'} onClick={() => setRecruiterTab('candidates')}>Candidats</TabButton>
              </>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {mode === 'candidate' ? (
              <motion.div key="c-view" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {candidateTab === 'espace' && (
                  <CandidateEspace 
                    user={user} 
                    onLaunch={() => setShowDiagnostic(true)} 
                    onGoADN={() => setCandidateTab('adn')} 
                    onShowQR={() => setShowQRCode(true)}
                    onUpdatePhoto={handleUpdatePhoto}
                  />
                )}
                {candidateTab === 'adn' && <CandidateADN user={user} />}
                {candidateTab === 'prisme' && <CandidatePrisme user={user} />}
                {candidateTab === 'horizon' && <CandidateHorizon />}
              </motion.div>
            ) : (
              <motion.div key="r-view" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {recruiterTab === 'dashboard' && (
                  <RecruiterDashboard 
                    activeOfferIndex={activeOfferIndex} 
                    onOfferChange={setActiveOfferIndex}
                    onCandidateClick={(candidateData: any) => {
                      setSelectedCandidate(candidateData);
                      setShowMatchingDetails(true);
                    }} 
                    onGoToCandidates={() => setRecruiterTab('candidates')}
                  />
                )}
                {recruiterTab === 'candidates' && (
                  <RecruiterCandidates 
                    onCandidateClick={(candidateData: any) => {
                      setSelectedCandidate(candidateData);
                      setShowMatchingDetails(true);
                    }}
                  />
                )}
                {recruiterTab === 'offres' && (
                  <RecruiterOffres 
                    onCreate={() => setShowOfferCreator(true)} 
                    onSelectOffer={(idx) => { setActiveOfferIndex(idx); setRecruiterTab('dashboard'); }}
                    onShowLink={() => setShowInvitationLink(true)}
                  />
                )}
                {recruiterTab === 'managers' && <RecruiterManagers />}
                {recruiterTab === 'postes' && <RecruiterPostes />}
                {recruiterTab === 'pricing' && <RecruiterPricing />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Diagnostic Overlay */}
      <AnimatePresence>
        {showDiagnostic && <DiagnosticChat user={user} profile={user.adn} onComplete={handleDiagnosticComplete} onExit={() => setShowDiagnostic(false)} />}
      </AnimatePresence>

      {/* Offer Creator Overlay */}
      <AnimatePresence>
        {showOfferCreator && <OfferCreatorOverlay onExit={() => setShowOfferCreator(false)} />}
      </AnimatePresence>

      {/* Matching Details Overlay */}
      <AnimatePresence>
        {showMatchingDetails && selectedCandidate && (
          <MatchingDetailsOverlay 
            user={user} 
            candidate={selectedCandidate} 
            onExit={() => setShowMatchingDetails(false)} 
          />
        )}
      </AnimatePresence>

      {/* Invitation Link Overlay */}
      <AnimatePresence>
        {showInvitationLink && <InvitationLinkOverlay onExit={() => setShowInvitationLink(false)} />}
      </AnimatePresence>

      {/* QR Code Overlay */}
      <AnimatePresence>
        {showQRCode && <QRCodeOverlay user={user} onExit={() => setShowQRCode(false)} />}
      </AnimatePresence>

      <footer className="py-12 border-t border-slate-100 flex flex-col items-center gap-4 text-center shrink-0">
         <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-100 shadow-sm opacity-60">
            <ShieldCheck className="w-4 h-4 text-reveliom-purple" />
            <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase italic">Sectateur de données</span>
         </div>
         <p className="text-[10px] text-slate-400 font-medium tracking-tight">REVELIOM © 2026 • Technologie d'alignement humain</p>
      </footer>
    </div>
  );
}

// --- Sub-Components ---

function TabButton({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2.5 sm:px-7 sm:py-3 rounded-[1.2rem] text-xs sm:text-sm font-bold transition-all duration-500 min-w-[80px] sm:min-w-36 active:scale-95 ${active ? 'bg-reveliom-purple text-white shadow-lg shadow-reveliom-purple/20 ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-800'}`}
    >
      {children}
    </button>
  );
}

// --- CANDIDATE VIEWS ---

function CandidateEspace({ user, onLaunch, onGoADN, onShowQR, onUpdatePhoto }: { user: UserProfile; onLaunch: () => void; onGoADN: () => void; onShowQR: () => void; onUpdatePhoto: (url: string) => void }) {
  const adnPercent = user.adn ? 100 : 40;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onUpdatePhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Mirror Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-8 glass-card p-10 md:p-14 flex flex-col md:flex-row gap-12 items-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12 transition-transform duration-700 group-hover:rotate-45">
            <Compass className="w-64 h-64" />
          </div>

          <div className="relative group shrink-0">
             <div className="w-44 h-44 rounded-[3.5rem] overflow-hidden bg-slate-100 border-4 border-white shadow-2xl relative transition-transform duration-500 group-hover:scale-105">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <User className="w-16 h-16" />
                  </div>
                )}
                <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-sm">
                   <div className="flex flex-col items-center gap-2">
                      <Camera className="w-6 h-6 text-white" />
                      <span className="text-[8px] font-black uppercase text-white tracking-widest">Ma Surface</span>
                   </div>
                   <input type="file" className="hidden" accept="image/*" onChange={handlePhotoChange} />
                </label>
             </div>
             {/* Progress over photo */}
             <div className="absolute -bottom-2 -right-2 w-20 h-20 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl border-2 border-slate-50 z-10 transition-transform duration-500 group-hover:scale-110">
                <CircularProgress percent={adnPercent} label="ADN" size={64} textColor="text-reveliom-purple" />
             </div>
          </div>

          <div className="space-y-8 text-center md:text-left flex-1 relative z-10">
            <div className="space-y-4">
               <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-reveliom-purple/10 rounded-full border border-reveliom-purple/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-reveliom-purple animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-reveliom-purple">{user.adn ? "L'ADN est Scellé" : "Diagnostic en cours"}</span>
               </div>
               <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif font-black text-slate-900 leading-[1] tracking-tighter">
                  {user.displayName.split(' ')[0]}, <br />
                  <span className="text-reveliom-purple italic">faites rayonner votre vérité.</span>
               </h1>
               <p className="text-lg sm:text-xl text-slate-500 font-serif italic max-w-lg leading-relaxed">
                  "S'accepter, c'est comprendre ses moteurs profonds. Votre diagnostic REVELIOM est le miroir de votre puissance réelle."
               </p>
            </div>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
               <button onClick={onLaunch} className="px-10 py-5 bg-reveliom-purple text-white rounded-full font-black text-sm uppercase tracking-widest shadow-2xl shadow-reveliom-purple/40 hover:translate-y-[-4px] hover:shadow-reveliom-purple/60 transition-all active:scale-95 flex items-center gap-3">
                 {user.adn ? "Préciser mon ADN" : "Continuer mon voyage"}
                 <Zap className="w-4 h-4 fill-current" />
               </button>
               {user.adn && (
                 <button onClick={onGoADN} className="px-10 py-5 bg-white border-2 border-slate-100 text-slate-900 rounded-full font-black text-sm uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-3">
                   Consulter mon Miroir
                   <ArrowRight className="w-4 h-4" />
                 </button>
               )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-8">
           <motion.div
             onClick={onShowQR}
             whileHover={{ scale: 1.02 }}
             className="glass-card p-10 bg-slate-900 text-white flex flex-col items-center text-center justify-center h-full group cursor-pointer relative overflow-hidden transition-all duration-500"
           >
              <div className="absolute top-0 right-0 px-6 py-2 bg-reveliom-purple text-[10px] font-black uppercase tracking-[0.3em] transform rotate-45 translate-x-3 translate-y-1 shadow-2xl z-20">Signature Réelle</div>
              <div className="absolute inset-0 bg-gradient-to-br from-reveliom-purple/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* QR preview : flouté si profil complet, grisé+cadenas si pas encore fait */}
              <div className="relative mb-8 flex items-center justify-center">
                 <div className="absolute inset-0 bg-reveliom-purple blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
                 {user.adn ? (
                   /* Profil complet — vrai QR code flouté qui se déflou au hover */
                   <div className="relative z-10 transition-all duration-700 group-hover:scale-110">
                     <div className="filter blur-[4px] group-hover:blur-[2px] transition-all duration-500 opacity-80 group-hover:opacity-100 bg-white rounded-2xl p-3">
                       <QRCodeSVG
                         value={`${window.location.origin}?profil=${user.uid}`}
                         size={80}
                         fgColor="#7B5BF5"
                         bgColor="white"
                         level="M"
                       />
                     </div>
                     <motion.div
                       animate={{ scale: [1, 1.15, 1] }}
                       transition={{ repeat: Infinity, duration: 2 }}
                       className="absolute -top-2 -right-2 w-8 h-8 bg-reveliom-purple rounded-full flex items-center justify-center shadow-lg z-20"
                     >
                       <Lock className="w-3.5 h-3.5 text-white" />
                     </motion.div>
                   </div>
                 ) : (
                   /* Pas de profil — QR grisé avec cadenas */
                   <div className="relative z-10 opacity-30">
                     <div className="bg-slate-700 rounded-2xl p-3">
                       <QrCode className="w-20 h-20 text-slate-500" />
                     </div>
                     <motion.div
                       animate={{ scale: [1, 1.1, 1] }}
                       transition={{ repeat: Infinity, duration: 2 }}
                       className="absolute inset-0 flex items-center justify-center"
                     >
                       <Lock className="w-10 h-10 text-reveliom-purple/60" />
                     </motion.div>
                   </div>
                 )}
              </div>

              <h3 className="text-2xl font-serif font-black mb-4 relative z-10">Signature ADN REVELIOM</h3>
              <div className="space-y-6 relative z-10">
                 <p className="text-sm text-slate-400 font-serif italic max-w-[240px] leading-relaxed">
                    {user.adn
                      ? '"Ton QR code est prêt. Clique pour le débloquer et le mettre sur ton CV."'
                      : '"Votre Signature nécessite d\'abord la vérité de votre diagnostic."'}
                 </p>
                 <button className="px-8 py-4 bg-white text-slate-900 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-reveliom-purple hover:text-white transition-all transform group-hover:translate-y-[-2px]">
                   {user.adn ? 'Débloquer ma Signature' : 'Terminer le Diagnostic'}
                 </button>
              </div>
           </motion.div>
        </div>
      </div>

      {/* Secondary Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
         <DashboardFeature
            icon={<ShieldCheck className="w-6 h-6" />}
            title="Sanctuaire Éthique"
            desc="Vos moteurs sont votre propriété exclusive. Nul n'y accède sans votre QR Code."
         />
         <DashboardFeature
            icon={<Target className="w-6 h-6" />}
            title="Horizon du Succès"
            desc="Révélez les environnements qui amplifient votre énergie naturelle."
         />
         <DashboardFeature
            icon={<Zap className="w-6 h-6" />}
            title="Authenticité"
            desc="Remplacez le masque du CV par la certitude de votre architecture mentale."
         />
       </div>
    </div>
  );
}

function DashboardFeature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass-card p-7 sm:p-10 flex flex-col items-center text-center space-y-4 bg-white/40 hover:bg-white transition-all duration-500 group">
       <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-slate-400 shadow-sm border border-slate-50 transition-all group-hover:bg-reveliom-purple group-hover:text-white group-hover:scale-110 duration-500">
          {icon}
       </div>
       <h3 className="text-xl font-serif font-black text-slate-800 tracking-tight">{title}</h3>
       <p className="text-sm text-slate-400 font-medium leading-relaxed max-w-xs italic">{desc}</p>
    </div>
  );
}

function CandidateADNSignature({ user }: { user: UserProfile }) {
  const adn = user.adn || REAL_PROFILE_DATA;

  const prismeData = [
    { subject: 'IMPACT', A: adn.boosters?.[0]?.value || 85 },
    { subject: 'STRUCTURE', A: 80 },
    { subject: 'TRANSMISSION', A: adn.boosters?.[2]?.value || 90 },
    { subject: 'ADAPTATION', A: 75 },
    { subject: 'VISION', A: 82 },
    { subject: 'ANCRAGE', A: 78 },
  ];

  const firstLetter = user.displayName?.charAt(0) || 'U';

  const FINAL_TEXT_1 = `Si, en lisant ça, tu t'es dit :
👉 « oui… c'est exactement moi »

Alors on a fait notre boulot.

Et si tu prends 2 minutes pour nous dire ce que tu as ressenti — honnêtement, humainement —
ça nous aide énormément ❤️
On en a marre, nous aussi, de réduire les gens à des cases.

👉 Laisser ton retour, de manière totalement anonyme (2 minutes)
👉 https://tally.so/r/44JLbB`;

  const FINAL_TEXT_2 = `Ce que tu viens de lire, ce n'est pas un test.
Ce n'est pas une note.
Ce n'est pas un jugement.

🧠 C'est un miroir construit sur des bases solides,
pour refléter le plus fidèlement possible
comment tu fonctionnes vraiment dans le travail.

Pas ton CV.
Pas une image.
Pas ce que tu crois devoir dire.
Mais toi, dans la réalité.

💎 Ton profil a de la valeur.
Parce que ta façon de penser, d'agir et de tenir dans le temps a de la valeur.

Et quelque part…
il existe forcément un cadre,
un poste,
un environnement,
où ta façon d'être devient une force.

📌 Ce profil est le tien.
Tu peux le garder,
le partager,
le montrer à un employeur,
ou l'utiliser pour vérifier si une opportunité te correspond vraiment.

🔥 REVELIOM n'invente rien.
Il met en lumière ce qui est déjà là,
pour que tu puisses avancer avec lucidité,
et faire des choix plus justes.`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-12 py-8 sm:py-16 space-y-16 sm:space-y-24 text-left">
      {/* 1. ELITE ID SECTION - THE SIGNATURE */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
      >
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2.5rem] p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden shadow-sm">
           <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none">
              <Logo size="large" />
           </div>
           <div className="space-y-10 relative z-10">
              <div className="flex flex-wrap items-center gap-3">
                 <div className="px-3 py-1 bg-slate-900 text-white rounded-md text-[8px] font-black uppercase tracking-[0.3em]">V8.4 / CONFIDENTIAL</div>
                 <div className="px-3 py-1 border border-slate-200 text-slate-400 rounded-md text-[8px] font-black uppercase tracking-[0.3em]">ADN SIGNATURE PROTOCOL</div>
                 <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-md">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-emerald-600">Profil Certifié — Diagnostic V8</span>
                 </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-8 items-start sm:items-center">
                 <div className="relative">
                    <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl overflow-hidden border-4 border-white shadow-2xl relative z-10 bg-slate-100 flex items-center justify-center">
                       {user.photoURL ? (
                         <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                       ) : (
                         <span className="text-5xl font-serif font-black text-slate-300">{firstLetter}</span>
                       )}
                    </div>
                    {/* Vrai QR code brandé REVELIOM en overlay sur la photo */}
                    <div className="absolute -bottom-4 -right-4 w-14 h-14 bg-white rounded-xl shadow-lg border border-slate-100 flex items-center justify-center p-2 z-20">
                       <QRCodeSVG
                         value={`${window.location.origin}?profil=${user.uid}`}
                         size={40}
                         fgColor="#7B5BF5"
                         bgColor="white"
                         level="M"
                       />
                    </div>
                 </div>
                 <div className="space-y-2 flex-1">
                    <h1 className="text-5xl sm:text-7xl font-serif font-black text-slate-900 leading-none tracking-tighter">{user.displayName}</h1>
                    <div className="flex items-center gap-3 text-reveliom-purple">
                       <Fingerprint className="w-5 h-5 opacity-50" />
                       <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em]">ID: MIR-{user.displayName?.substring(0,3).toUpperCase()}-2026</span>
                    </div>
                 </div>
              </div>
              <div className="border-t border-slate-100 pt-10 mt-4 space-y-6">
                 <p className="text-2xl sm:text-4xl font-serif font-black italic text-slate-400 leading-tight">"{adn.positionnement}"</p>
                 <p className="text-base sm:text-lg text-slate-500 font-serif leading-relaxed italic max-w-2xl">
                    Le décodage architectural de {user.displayName} a été finalisé avec succés. Ce profil certifie la triangulation entre les moteurs cognitifs et les leviers d'action.
                 </p>
              </div>
           </div>
        </div>
        <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center relative group overflow-hidden">
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(124,58,237,0.05),transparent_70%)]" />
           <div className="relative z-10 w-full max-w-[280px] sm:max-w-full">
              <div className="text-center mb-6">
                 <span className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">Empreinte Cognitive</span>
                 <div className="h-px w-8 bg-reveliom-purple mx-auto mt-2" />
              </div>
              <PrismeDisplay data={prismeData} />
              <div className="mt-8 grid grid-cols-2 gap-4">
                 <div className="text-center p-3 bg-white rounded-2xl border border-slate-100 shadow-sm group-hover:border-reveliom-purple transition-colors">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Potentiel de Synergie</p>
                    <p className="text-xl font-serif font-black text-slate-900 italic">Élevé</p>
                    <p className="text-[6px] font-bold text-slate-300 uppercase mt-1">Calculé par MIR v8.4</p>
                 </div>
                 <div className="text-center p-3 bg-white rounded-2xl border border-slate-100 shadow-sm group-hover:border-reveliom-purple transition-colors">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Stabilité ADN</p>
                    <p className="text-xl font-serif font-black text-slate-900 italic">Optimale</p>
                    <p className="text-[6px] font-bold text-slate-300 uppercase mt-1">Triangulation complète</p>
                 </div>
              </div>
           </div>
           <div className="absolute top-6 right-6 flex flex-col items-end gap-1 opacity-50">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
              <span className="text-[6px] font-black uppercase text-slate-400 tracking-tighter">Verified Protocol</span>
           </div>
        </div>
      </motion.section>

      {/* BUSINESS CTA */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="bg-slate-900 rounded-[2.5rem] p-8 sm:p-14 text-white relative overflow-hidden shadow-xl border border-slate-800"
      >
         <div className="absolute top-0 right-0 w-80 h-80 bg-reveliom-purple/10 blur-[80px] rounded-full pointer-events-none" />
         <div className="absolute bottom-0 left-0 w-60 h-60 bg-reveliom-purple/5 blur-[60px] rounded-full pointer-events-none" />
         <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="space-y-5 text-center md:text-left max-w-xl">
               <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">
                  🎯 3 premiers matchings offerts
               </div>
               <h3 className="text-3xl sm:text-5xl font-serif font-black italic leading-tight">
                  100× plus puissant<br />
                  <span className="text-reveliom-purple underline decoration-reveliom-purple/30 underline-offset-8">qu'une lettre de motivation.</span>
               </h3>
               <p className="text-slate-400 text-sm font-serif italic leading-relaxed">
                  En 90 secondes, vous savez si <span className="text-white font-black not-italic">{user.displayName}</span> peut performer dans votre environnement. Pas une impression. Une architecture vérifiée.
               </p>
               <div className="flex flex-wrap gap-x-6 gap-y-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" />Aucun biais d'apparence</span>
                  <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" />Analyse cognitive validée</span>
                  <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" />Résultat en 3 min</span>
               </div>
            </div>
            <button className="shrink-0 px-10 py-6 bg-white text-slate-900 rounded-full font-black uppercase tracking-widest text-[10px] shadow-2xl transition-all hover:scale-105 hover:bg-reveliom-purple hover:text-white active:scale-95 flex items-center gap-4 group whitespace-nowrap">
               Lancer le Matching
               <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
            </button>
         </div>
      </motion.section>

      {/* ANALYTICAL CORE */}
      <section className="space-y-8">
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-3xl sm:text-4xl font-serif font-black text-slate-900">Architecture <span className="text-reveliom-purple italic">Profonde.</span></h2>
            <div className="flex items-center gap-4 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
               <ShieldCheck className="w-4 h-4" />
               <span className="text-[9px] font-black uppercase tracking-[0.3em]">Diagnostiques Validés par MIR Protocol</span>
            </div>
         </div>
         <div className="p-8 sm:p-12 bg-slate-900 rounded-[2.5rem] text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-[0.02] pointer-events-none"><Zap className="w-64 h-64" /></div>
            <div className="relative z-10 space-y-12">
               <p className="text-2xl sm:text-4xl font-serif font-black italic underline decoration-reveliom-purple/40 underline-offset-8 leading-tight max-w-4xl">{adn.lecture_globale}</p>
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-16 pt-10 border-t border-white/10">
                  {(adn.boosters || []).map((b: any, i: number) => (
                     <div key={i} className="space-y-4">
                        <div className="flex justify-between items-end">
                           <h4 className="text-[10px] font-black text-slate-400 tracking-[0.22em] uppercase">{b.label}</h4>
                           <span className="text-[10px] font-serif italic text-reveliom-purple opacity-40">Actif</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                           <motion.div initial={{ width: 0 }} whileInView={{ width: `${b.value}%` }} transition={{ duration: 1.5, delay: i * 0.1 }} className="h-full bg-reveliom-purple" />
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </section>

      {/* BENTO */}
      <section className="space-y-10">
         <div className="flex items-center gap-4">
            <h2 className="text-2xl sm:text-3xl font-serif font-black text-slate-900 tracking-tight">Environnements d'Impact</h2>
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300 italic">Triangulation terrain</span>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <BentoItem title="Mouvement" subtitle="Force de Marche" content={adn.mouvement} icon={<Zap />} delay={0.1} />
            <BentoItem title="Cycles" subtitle="Gestion Temps" content={adn.temps} icon={<Calendar />} delay={0.2} />
            <BentoItem title="Invariants" subtitle="Système Valeurs" content={adn.valeurs} icon={<ShieldCheck />} delay={0.3} />
            <BentoItem title="Aspirations" subtitle="Horizon Vision" content={adn.projections} icon={<Target />} delay={0.4} />
         </div>
      </section>

      {/* BALANCED TRUTH */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
         <div className="p-8 sm:p-10 bg-white border border-slate-100 rounded-[2.5rem] space-y-6 shadow-sm">
            <div className="inline-flex items-center gap-3 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100">
               <ArrowUpRight className="w-4 h-4" />Leviers de Puissance
            </div>
            <p className="text-xl sm:text-2xl font-serif font-black text-slate-900 leading-tight">{adn.forces}</p>
         </div>
         <div className="p-8 sm:p-10 bg-slate-50 border border-slate-100 rounded-[2.5rem] space-y-6">
            <div className="inline-flex items-center gap-3 px-3 py-1 bg-slate-900 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-800">
               <ShieldAlert className="w-4 h-4 text-reveliom-purple" />Vigilances ADN
            </div>
            <p className="text-xl sm:text-2xl font-serif font-black text-slate-500 italic leading-tight">{adn.limites}</p>
         </div>
      </section>

      {/* QR PARTAGE */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="bg-reveliom-purple/5 border border-reveliom-purple/15 rounded-[2.5rem] p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-8"
      >
         <div className="shrink-0 bg-white rounded-2xl p-4 shadow-md border border-reveliom-purple/10">
            <QRCodeSVG
              value={`${window.location.origin}?profil=${user.uid}`}
              size={96}
              fgColor="#7B5BF5"
              bgColor="white"
              level="M"
            />
         </div>
         <div className="space-y-3 text-center sm:text-left flex-1">
            <p className="font-black text-slate-900 text-xl">Partager ce profil</p>
            <p className="text-sm font-serif italic text-slate-400 leading-relaxed max-w-md">
               Flashez ce QR code ou copiez l'URL pour envoyer ce profil à n'importe quel recruteur. Il accède directement à cette page.
            </p>
            <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-100 rounded-full shadow-sm max-w-sm mx-auto sm:mx-0">
               <QrCode className="w-4 h-4 text-reveliom-purple shrink-0" />
               <span className="text-xs font-mono text-slate-500 truncate">{`${window.location.origin}?profil=${user.uid}`}</span>
            </div>
         </div>
      </motion.section>

      {/* SUB-FOOTER */}
      <section className="pt-16 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-start gap-12 sm:gap-20">
         <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-4">
               <Logo size="small" className="opacity-40" />
               <div className="h-px w-10 bg-reveliom-purple/20" />
               <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-400 italic">REVELIOM SIGNATURE V8.4</span>
            </div>
            <p className="text-lg sm:text-xl text-slate-500 font-serif leading-relaxed italic border-l-4 border-reveliom-purple/10 pl-6">
               "REVELIOM ne crée pas le talent, il expose la structure qui lui permet d'exister. Plus vous êtes proche de votre architecture, plus votre impact est inéluctable."
            </p>
         </div>
         <div className="bg-slate-900 p-8 sm:p-10 rounded-[2.5rem] border border-slate-800 space-y-8 flex flex-col justify-center shadow-lg relative overflow-hidden group w-full sm:min-w-[320px]">
            <div className="absolute bottom-0 right-0 p-8 opacity-[0.03] rotate-12"><Heart className="w-32 h-32 text-white fill-current" /></div>
            <p className="text-lg font-serif font-bold text-white relative z-10 leading-snug">Diagnostic utile ? <br />Aidez-nous à affiner le modèle.</p>
            <a href="https://tally.so/r/44JLbB" target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center justify-center px-6 py-4 bg-reveliom-purple text-white rounded-full font-black uppercase tracking-widest text-[9px] shadow-lg transition-all hover:bg-white hover:text-slate-900 group">
               Laissez un retour (2 min)
               <Heart className="w-3.5 h-3.5 ml-2 transition-transform group-hover:scale-125" />
            </a>
         </div>
      </section>

    </div>
  );
}

function CandidateADN({ user }: { user: UserProfile }) {
  const adn = user.adn || REAL_PROFILE_DATA;
  const name = user.displayName?.split(' ')[0] || 'Vous';

  return (
    <div className="max-w-6xl mx-auto space-y-0 text-left">

      {/* ── HERO : Dark manifesto ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative bg-slate-900 rounded-[2.5rem] p-10 sm:p-16 overflow-hidden mb-8"
      >
        {/* Ambient glow */}
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-reveliom-purple/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-20 -right-10 w-60 h-60 bg-reveliom-purple/10 blur-[80px] rounded-full pointer-events-none" />

        <div className="relative z-10 space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3 py-1 bg-reveliom-purple/20 text-reveliom-purple border border-reveliom-purple/30 rounded-full text-[9px] font-black uppercase tracking-[0.3em]">
              Profil certifié REVELIOM V8
            </div>
            <div className="px-3 py-1 bg-white/5 text-white/40 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-[0.3em]">
              ADN Scellé
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-white/40 text-sm font-black uppercase tracking-[0.4em]">{name}, voici qui vous êtes vraiment.</p>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-black text-white leading-[0.95] tracking-tighter">
              {adn.positionnement}
            </h1>
          </div>

          <div className="h-px w-16 bg-reveliom-purple" />

          <p className="text-xl sm:text-2xl font-serif italic text-white/70 leading-relaxed max-w-3xl">
            "{adn.lecture_globale}"
          </p>
        </div>
      </motion.div>

      {/* ── MOTEUR : Ce qui vous fait avancer ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
      >
        {/* Moteur — grande carte accentuée */}
        <div className="bg-reveliom-purple rounded-[2rem] p-10 sm:p-12 text-white space-y-6 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full blur-2xl" />
          <div className="relative z-10 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/60">Ce qui vous met en mouvement</span>
            </div>
            <p className="text-xl sm:text-2xl font-serif font-black leading-tight">
              {adn.mouvement}
            </p>
          </div>
        </div>

        {/* Cycles */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-10 sm:p-12 space-y-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-reveliom-purple" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Comment vous tenez dans le temps</span>
          </div>
          <p className="text-xl sm:text-2xl font-serif font-black text-slate-900 leading-tight">
            {adn.temps}
          </p>
        </div>
      </motion.div>

      {/* ── VALEURS + PROJECTIONS ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
      >
        <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-10 sm:p-12 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Vos valeurs en action</span>
          </div>
          <p className="text-xl sm:text-2xl font-serif font-black text-slate-900 leading-tight">
            {adn.valeurs}
          </p>
        </div>

        <div className="bg-white border border-slate-100 rounded-[2rem] p-10 sm:p-12 space-y-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
              <Target className="w-5 h-5 text-reveliom-purple" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Là où vous regardez</span>
          </div>
          <p className="text-xl sm:text-2xl font-serif font-black text-slate-900 leading-tight">
            {adn.projections}
          </p>
        </div>
      </motion.div>

      {/* ── FORCES : grande section pleine largeur dark ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
        className="bg-slate-900 rounded-[2rem] p-10 sm:p-14 mb-6 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.15),transparent_60%)] pointer-events-none" />
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-emerald-400">Vos forces réelles</span>
          </div>
          <p className="text-2xl sm:text-4xl font-serif font-black text-white leading-tight max-w-4xl">
            {adn.forces}
          </p>
        </div>
      </motion.div>

      {/* ── BOOSTERS : barres animées ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.25 }}
        className="bg-white border border-slate-100 rounded-[2rem] p-10 sm:p-14 shadow-sm mb-6 space-y-10"
      >
        <div className="space-y-2">
          <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Intensité de vos moteurs</span>
          <p className="text-slate-300 text-xs font-serif italic">Ces axes définissent comment votre énergie se manifeste concrètement.</p>
        </div>
        <div className="space-y-8">
          {(adn.boosters || []).map((b: any, i: number) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-black text-slate-900 uppercase tracking-widest">{b.label}</span>
                <span className="text-2xl font-serif font-black text-reveliom-purple">{b.value}<span className="text-sm text-slate-300 font-sans font-normal">/100</span></span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${b.value}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: i * 0.15, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-reveliom-purple to-purple-400 rounded-full"
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── LUCIDITÉ ADN (vigilances, reframed) ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="border border-slate-200 rounded-[2rem] p-10 sm:p-14 mb-8 space-y-5 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-reveliom-purple/5 blur-3xl rounded-full pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 block">Lucidité ADN</span>
            <span className="text-[8px] text-slate-300 font-serif italic">Connaître ses limites, c'est maîtriser son potentiel.</span>
          </div>
        </div>
        <p className="text-xl sm:text-2xl font-serif font-black text-slate-700 leading-tight relative z-10">
          {adn.limites}
        </p>
      </motion.div>

      {/* ── SEAL : pied de page certification ── */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.35 }}
        className="flex flex-col sm:flex-row items-center justify-between gap-8 pt-4 pb-8 border-t border-slate-100"
      >
        <div className="flex items-center gap-4">
          <Logo size="small" className="opacity-50" />
          <div className="h-8 w-px bg-slate-100" />
          <div className="space-y-0.5">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400">Profil généré par IA · Protocole MIR V8.4</p>
            <p className="text-[8px] font-serif italic text-slate-300">Ce miroir reflète ce qui est déjà là.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-6 py-3 bg-emerald-50 border border-emerald-100 rounded-full">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Diagnostic validé</span>
        </div>
      </motion.div>

    </div>
  );
}

function PrismeDisplay({ data, className = "" }: { data: any[]; className?: string }) {
  return (
    <div className={`w-full aspect-square relative ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <PolarGrid stroke="#e2e8f0" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: '#64748b', fontSize: 8, fontWeight: 800, letterSpacing: '0.05em' }}
          />
          <Radar name="Profil" dataKey="A" stroke="#7c3aed" strokeWidth={2} fill="#7c3aed" fillOpacity={0.15} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BentoItem({ title, subtitle, content, icon, className = "", delay = 0 }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.4 }}
      className={`p-6 sm:p-8 bg-white border border-slate-100 rounded-3xl shadow-sm transition-all hover:shadow-md relative overflow-hidden group flex flex-col justify-between ${className}`}
    >
      <div className="space-y-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center border border-slate-100 group-hover:bg-reveliom-purple group-hover:text-white transition-all duration-300">
             {React.cloneElement(icon as any, { className: "w-4 h-4" })}
          </div>
          <div className="flex flex-col">
             <span className="text-[7px] font-black uppercase tracking-[0.2em] text-reveliom-purple opacity-60">{subtitle}</span>
             <h4 className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{title}</h4>
          </div>
        </div>
        <p className="text-base sm:text-lg font-serif font-bold text-slate-900 leading-tight">{content}</p>
      </div>
    </motion.div>
  );
}

function ColumnInsight({ title, subtitle, content, icon }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-8 group"
    >
      <div className="space-y-2">
         <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:scale-110 group-hover:bg-reveliom-purple group-hover:text-white transition-all duration-500">
               {icon}
            </div>
            <div className="h-px flex-1 bg-slate-50" />
         </div>
         <h3 className="text-3xl font-serif font-bold text-slate-900 leading-none">{title}</h3>
         <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{subtitle}</p>
      </div>
      <p className="text-xl text-slate-600 font-serif leading-relaxed italic border-l-2 border-slate-100 pl-8 group-hover:border-reveliom-purple transition-colors duration-700">
        {content}
      </p>
    </motion.div>
  );
}

function CandidatePrisme({ user }: { user: UserProfile }) {
  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-serif font-bold text-slate-900">Le Prisme</h2>
        <p className="text-slate-400 font-medium font-serif italic">Structure psychologique profonde révélée par triangulation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
         <div className="h-[280px] sm:h-[420px] lg:h-[500px] glass-card p-6 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={REAL_PROFILE_DATA.skills_data}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                <Radar
                   name="Score"
                   dataKey="A"
                   stroke="#7B5BF5"
                   fill="#7B5BF5"
                   fillOpacity={0.15}
                   strokeWidth={3}
                />
              </RadarChart>
            </ResponsiveContainer>
         </div>

         <div className="space-y-6 text-left">
            {!user.adn && (
              <div className="p-6 bg-red-50 text-red-500 rounded-2xl flex items-start gap-4 text-sm font-medium border border-red-100 italic">
                <AlertCircle className="w-5 h-5 shrink-0" />
                Ces données sont issues d'un profil type. Terminez votre diagnostic pour une mesure réelle.
              </div>
            )}
            <div className="space-y-8">
               {REAL_PROFILE_DATA.skills_data.slice(0, 3).map(skill => (
                 <div key={skill.subject} className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                       <span className="text-slate-500">{skill.subject}</span>
                       <span className="text-reveliom-purple">{skill.A}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                       <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${skill.A}%` }}
                          transition={{ duration: 1, delay: 0.5 }}
                          className="h-full bg-reveliom-purple rounded-full"
                       />
                    </div>
                 </div>
               ))}
            </div>
            <div className="p-8 rounded-3xl bg-reveliom-light text-slate-500 italic text-sm font-serif leading-relaxed border border-slate-200/50">
              James présente une architecture dominée par la transmission et la stratégie.
            </div>
         </div>
      </div>
    </div>
  );
}

function CandidateHorizon() {
  return (
    <div className="max-w-3xl mx-auto py-20 text-center space-y-8">
       <div className="w-24 h-24 bg-reveliom-purple/5 rounded-full flex items-center justify-center text-reveliom-purple mx-auto animate-pulse">
         <Compass className="w-12 h-12" />
       </div>
       <div className="space-y-4">
         <h2 className="text-4xl font-serif font-black text-slate-900 italic">Horizon Indisponible.</h2>
         <p className="text-slate-400 font-serif text-lg italic leading-relaxed max-w-lg mx-auto">
           Cette partie sera bientôt accessible. Elle permettra de faire des matching avec des entreprises qui recrutent et vous correspondent en gros, mais ça ne sera pas dispo au début.
         </p>
       </div>
       <div className="pt-6">
          <span className="px-6 py-2 bg-slate-100 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400">En cours de calibration</span>
       </div>
    </div>
  );
}
// --- RECRUITER VIEWS ---

function RecruiterDashboard({ activeOfferIndex, onOfferChange, onCandidateClick, onGoToCandidates }: { activeOfferIndex: number, onOfferChange: (idx: number) => void, onCandidateClick: (data: any) => void, onGoToCandidates: () => void }) {
  const stats = [
    { label: 'Profils reçus', val: '680', percent: '100', icon: Users2 },
    { label: 'En contact', val: '459', percent: '68', active: true, icon: MessageSquare },
    { label: 'Alignements', val: '270', percent: '40', icon: Sparkles },
    { label: 'Intérêt Conf.', val: '98', percent: '14', icon: Calendar },
  ];

  const currentJob = MOCK_JOBS[activeOfferIndex];

  return (
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row justify-between items-center lg:items-end gap-12">
        <div className="text-center lg:text-left space-y-6 flex-1 w-full">
           <div className="space-y-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-reveliom-purple animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Vision</span>
             </div>
             <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-black text-slate-900 leading-[1.1] tracking-tighter transition-all">
               Vision : <span className="text-slate-400 italic block sm:inline">{currentJob}</span>
             </h2>
             <p className="text-slate-500 font-serif italic text-base sm:text-lg max-w-lg leading-relaxed mx-auto lg:mx-0">
               Analyse d'alignement en temps réel basée sur la triangulation comportementale.
             </p>
           </div>
           
           {/* Offer Selector */}
           <div className="flex flex-wrap justify-center lg:justify-start gap-2 pt-4">
              {MOCK_JOBS.slice(0, 5).map((job, idx) => (
                <button 
                  key={job}
                  onClick={() => onOfferChange(idx)}
                  className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${activeOfferIndex === idx ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                >
                  {job}
                </button>
              ))}
           </div>
        </div>
        <div className="w-full lg:w-auto bg-white border border-slate-100 rounded-[2rem] sm:rounded-[2.5rem] px-6 py-8 sm:px-12 sm:py-10 flex flex-col sm:flex-row items-center gap-8 sm:gap-12 shadow-sm transition-all">
           <div className="flex flex-col items-center">
              <CircularProgress percent={68} size={110} label="Flux total" />
           </div>
           <div className="hidden sm:block h-24 w-px bg-slate-50" />
           <div className="grid grid-cols-2 gap-x-8 sm:gap-x-12 gap-y-6 text-left w-full sm:w-auto">
              {stats.slice(0, 4).map(s => (
                <div key={s.label}>
                   <div className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300 mb-1">{s.label}</div>
                   <div className="text-lg sm:text-xl font-serif font-bold text-slate-900 leading-none">{s.val}</div>
                </div>
              ))}
           </div>
        </div>
      </div>

      <div className="space-y-8 pt-8">
         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-2 sm:px-6">
            <div className="space-y-1">
               <h3 className="text-xl sm:text-2xl font-serif font-bold text-slate-900">Pipeline d'Alignement</h3>
               <p className="text-[10px] text-slate-400 font-serif italic tracking-tight uppercase tracking-widest font-bold">Classé par score de triangulation</p>
            </div>
            <div className="flex items-center gap-4">
               <span className="flex items-center gap-2 text-[9px] sm:text-[10px] font-black text-green-500 uppercase tracking-widest bg-green-50 px-3 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Flux Constant</span>
            </div>
         </div>
         <div className="space-y-4 text-left">
            <CandidateRow 
               name="James" 
               status="Alignement Conditionnel" 
               score="74%" 
               color="#3b82f6" 
               meta="Pédagogue-structurant" 
               onClick={() => onCandidateClick({ name: 'James', score: '74%', meta: 'Pédagogue-structurant', adn: REAL_PROFILE_DATA })}
            />
            <CandidateRow 
               name="Alexandre M." 
               status="Aligné" 
               score="92%" 
               color="#7B5BF5" 
               meta="Innovation / Data Strategic" 
               onClick={() => onCandidateClick({ name: 'Alexandre M.', score: '92%', meta: 'Innovation / Data Strategic' })}
            />
         </div>
         <div className="flex justify-center pt-8">
            <button 
              onClick={onGoToCandidates}
              className="w-full sm:w-auto px-10 py-4 bg-slate-50 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-reveliom-purple/10 hover:text-reveliom-purple transition-all border border-slate-100 italic"
            >
               Accéder au suivi complet
            </button>
         </div>
      </div>
    </div>
  );
}

function CandidateRow({ name, status, score, color, meta, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`glass-card p-6 sm:px-10 flex flex-col sm:flex-row items-center justify-between group transition-all duration-300 ring-1 ring-slate-100 border-none hover:shadow-2xl hover:shadow-slate-200 ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
       <div className="flex items-center gap-8 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm overflow-hidden">
             <User className="w-6 h-6 text-slate-400 opacity-50" />
          </div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xl font-serif font-bold text-slate-800">{name}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-2 py-0.5 bg-slate-50 rounded border border-slate-100">{meta}</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                 <span className="text-xs font-bold text-slate-500 tracking-tight">{status}</span>
              </div>
          </div>
       </div>
       <div className="flex items-center gap-10 mt-6 sm:mt-0 w-full sm:w-auto justify-between border-t border-slate-50 pt-6 sm:pt-0 sm:border-none">
          <div className="text-right">
             <div className="text-2xl font-serif font-bold text-slate-900">{score}</div>
             <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Score Triangulation</div>
          </div>
          <button className="p-3 rounded-full bg-slate-100 text-slate-400 group-hover:bg-reveliom-purple group-hover:text-white transition-all duration-500 group-hover:rotate-z-[-10deg]">
             <ArrowRight className="w-5 h-5" />
          </button>
       </div>
    </div>
  );
}

function RecruiterOffres({ onCreate, onSelectOffer, onShowLink }: { onCreate: () => void, onSelectOffer: (idx: number) => void, onShowLink: () => void }) {
  return (
    <div className="space-y-12">
       <div className="flex flex-col md:flex-row justify-between items-end gap-6">
          <div className="space-y-4">
             <div className="space-y-2">
                <h2 className="text-4xl font-serif font-black text-slate-900 leading-tight">Mes Offres</h2>
                <div className="flex items-center gap-2">
                   <div className="w-8 h-px bg-reveliom-purple" />
                   <p className="text-slate-400 font-serif italic text-lg tracking-tight">Le point de rencontre entre Manager et Poste.</p>
                </div>
             </div>
             <div className="p-6 bg-reveliom-purple/5 rounded-2xl border border-reveliom-purple/10 max-w-2xl">
                <p className="text-sm text-reveliom-purple font-serif font-medium leading-relaxed italic">
                   L'offre est la fusion intelligente entre l'identité du manager et la vision du poste, créant le terrain d'entente idéal pour un recrutement durable et performant.
                </p>
             </div>
          </div>
          <button 
             onClick={onCreate}
             className="px-8 py-4 bg-slate-900 text-white rounded-full font-bold shadow-xl shadow-slate-900/10 hover:translate-y-[-2px] transition-all flex items-center gap-3 active:scale-95"
          >
             <Plus className="w-5 h-5" />
             Créer une offre
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {MOCK_JOBS.slice(0, 4).map((job, i) => (
             <div key={job} className="glass-card p-7 sm:p-10 space-y-8 group hover:border-reveliom-purple/20 transition-all">
                <div className="flex justify-between items-start">
                   <div 
                     onClick={() => onSelectOffer(i)}
                     className="w-12 h-12 rounded-2xl bg-reveliom-purple/5 flex items-center justify-center text-reveliom-purple group-hover:bg-reveliom-purple group-hover:text-white transition-all duration-500 cursor-pointer"
                   >
                      <Briefcase className="w-6 h-6" />
                   </div>
                   <div className="flex flex-col items-end gap-2">
                     <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[9px] font-black uppercase tracking-[0.2em]">Actif</span>
                     <button 
                       onClick={onShowLink}
                       className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-reveliom-purple transition-colors border border-slate-100"
                       title="Générer invitation"
                     >
                       <QrCode className="w-4 h-4" />
                     </button>
                   </div>
                </div>
                <div className="cursor-pointer" onClick={() => onSelectOffer(i)}>
                   <h3 className="text-xl font-serif font-bold text-slate-800 mb-1">{job}</h3>
                   <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      <Users2 className="w-3.5 h-3.5" />
                      {MOCK_MANAGERS[i % 3].name}
                   </div>
                </div>
                <div className="pt-6 border-t border-slate-50 flex items-center justify-between text-slate-400">
                   <div className="text-[10px] font-bold uppercase tracking-widest">12 Matchings</div>
                   <button className="p-2 hover:text-reveliom-purple transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
                </div>
             </div>
          ))}
       </div>
    </div>
  );
}

function RecruiterPostes() {
  return (
    <div className="space-y-12">
      <div className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="space-y-2">
           <h2 className="text-4xl font-serif font-black text-slate-900">Référentiel des Postes</h2>
           <p className="text-slate-400 font-serif font-medium text-lg italic">Définissez la réalité structurelle de vos métiers.</p>
        </div>
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 italic">
           <p className="text-sm text-slate-500 font-serif font-medium leading-relaxed">
              Définir précisément les attentes du poste permet un alignement parfait entre les compétences réelles et les besoins structurels. C'est le socle de la réussite opérationnelle.
           </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
         {MOCK_JOBS.map(job => (
           <div key={job} className="glass-card p-6 flex flex-col items-center text-center group cursor-pointer hover:bg-slate-900 hover:text-white transition-all duration-500">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 mb-4 group-hover:bg-slate-800 transition-all">
                <Briefcase className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest">{job}</h4>
           </div>
         ))}
         <div className="glass-card p-6 flex flex-col items-center justify-center text-center border-dashed border-2 border-slate-200 bg-transparent cursor-pointer hover:border-reveliom-purple group transition-all">
            <Plus className="w-6 h-6 text-slate-300 group-hover:text-reveliom-purple transition-colors" />
         </div>
      </div>
    </div>
  );
}

function RecruiterManagers() {
  return (
    <div className="space-y-12">
       <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="space-y-2">
             <h2 className="text-4xl font-serif font-black text-slate-900">Écosystème des Managers</h2>
             <p className="text-slate-400 font-serif font-medium text-lg italic">Comprenez qui conduit vos équipes vers le succès.</p>
          </div>
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 italic">
             <p className="text-sm text-slate-500 font-serif font-medium leading-relaxed">
                Comprendre le fonctionnement du manager est la clé pour assurer une compatibilité humaine et un leadership aligné. C'est ici que commence l'alignement humain stratégique.
             </p>
          </div>
       </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {MOCK_MANAGERS.map(m => (
          <div key={m.name} className="glass-card p-7 sm:p-12 flex flex-col items-center text-center group hover:translate-y-[-8px] transition-all duration-500">
             <div className="w-20 h-20 rounded-full bg-reveliom-purple/5 flex items-center justify-center mb-6 ring-1 ring-slate-100 shadow-inner group-hover:scale-110 transition-transform duration-700">
                <span className="text-3xl font-serif font-black text-reveliom-purple">{m.initial}</span>
             </div>
             <h3 className="text-xl font-serif font-bold text-slate-900 mb-1">{m.name}</h3>
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{m.role}</p>
          </div>
        ))}
        <div className="glass-card p-7 sm:p-12 flex flex-col items-center justify-center text-center border-dashed border-2 border-slate-200 bg-transparent group hover:border-reveliom-purple transition-all cursor-pointer">
           <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-reveliom-purple transition-colors">
              <Plus className="w-6 h-6" />
           </div>
        </div>
      </div>
    </div>
  );
}

function OfferCreatorOverlay({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState(1);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
       <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white w-full max-w-2xl rounded-[3rem] p-8 sm:p-12 space-y-10 relative overflow-hidden">
          <button onClick={onExit} className="absolute top-8 right-8 p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
          <div className="space-y-4 text-center">
             <div className="text-[10px] font-black uppercase tracking-[0.4em] text-reveliom-purple">Nouvelle Offre</div>
             <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900">{step === 1 ? "Choisir le Manager" : "Lier au Poste"}</h2>
          </div>
          <div className="space-y-4">
             {step === 1 ? (
               <div className="grid grid-cols-1 gap-4">
                  {MOCK_MANAGERS.map(m => (
                    <button key={m.id} onClick={() => setStep(2)} className="w-full p-6 bg-slate-50 border-2 border-transparent hover:border-reveliom-purple hover:bg-white rounded-3xl transition-all flex items-center justify-between group">
                       <span className="text-xl font-serif font-bold text-slate-800">{m.name}</span>
                       <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-reveliom-purple" />
                    </button>
                  ))}
               </div>
             ) : (
               <div className="grid grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {MOCK_JOBS.map(j => (
                    <button key={j} onClick={onExit} className="p-4 bg-slate-50 border-2 border-transparent hover:border-reveliom-purple hover:bg-white rounded-2xl transition-all text-xs font-bold uppercase tracking-widest text-slate-500">{j}</button>
                  ))}
               </div>
             )}
          </div>
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-300 pt-6">
             <span>Étape {step} sur 2</span>
             {step === 2 && <button onClick={() => setStep(1)} className="text-reveliom-purple">Retour</button>}
          </div>
       </motion.div>
    </motion.div>
  );
}

function AuthOverlay({ user, onComplete }: { user: UserProfile | null, onComplete: (role: AppMode) => void }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(user ? 'role' : 'login');

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setStep('role');
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--reveliom-light-purple),_transparent_40%),radial-gradient(circle_at_bottom_left,_#fdf2f8,_transparent_40%)]">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full glass-card p-12 space-y-10 text-center shadow-2xl relative overflow-hidden text-slate-900 leading-normal">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-reveliom-purple" />
        <div className="flex justify-center"><Logo /></div>
        
        {step === 'login' ? (
          <div className="space-y-8 pt-4">
            <div className="space-y-3">
               <h2 className="text-3xl font-serif font-black text-slate-900">Bienvenue dans la vérité.</h2>
               <p className="text-slate-400 font-serif italic">Connectez-vous pour commencer votre exploration.</p>
            </div>
            <button 
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-4 bg-slate-900 text-white rounded-full font-bold shadow-xl shadow-slate-900/10 flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
            >
              <GoogleIcon />
              {loading ? "Connexion..." : "Continuer avec Google"}
            </button>
          </div>
        ) : (
          <div className="space-y-8 pt-4">
            <div className="space-y-3">
               <h2 className="text-2xl font-serif font-bold text-slate-900">Qui êtes-vous ?</h2>
               <p className="text-sm text-slate-400 font-serif italic">Cette étape définit votre interface et vos outils.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <button onClick={() => onComplete('candidate')} className="p-8 bg-slate-50 border-2 border-transparent hover:border-reveliom-purple hover:bg-white rounded-3xl transition-all group flex flex-col items-center gap-4">
                  <User className="w-8 h-8 text-slate-300 group-hover:text-reveliom-purple transition-colors" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900">Candidat</span>
               </button>
               <button onClick={() => onComplete('recruiter')} className="p-8 bg-slate-50 border-2 border-transparent hover:border-reveliom-purple hover:bg-white rounded-3xl transition-all group flex flex-col items-center gap-4">
                  <ShieldCheck className="w-8 h-8 text-slate-300 group-hover:text-reveliom-purple transition-colors" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900">Recruteur</span>
               </button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest pt-4">Sécurisé par REVELIOM Sanctuaire</p>
      </motion.div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function RecruiterCandidates({ onCandidateClick }: { onCandidateClick: (data: any) => void }) {
  const [filterPoste, setFilterPoste] = useState('all');
  const [search, setSearch] = useState('');
  
  const candidates = [
    { id: 1, name: "James", poste: "Product Designer", profileCompleted: true, contacted: { status: "Oui", tool: "LinkedIn", reason: "Profil top" }, status: "Entretien", score: "74%", adn: REAL_PROFILE_DATA },
    { id: 2, name: "Alexandre M.", poste: "Lead Data", profileCompleted: true, contacted: { status: "Oui", tool: "Email", reason: "Match A+" }, status: "Offre", score: "92%" },
    { id: 3, name: "Sarah L.", poste: "Brand Manager", profileCompleted: false, contacted: { status: "Non" }, status: "Nouvelle", score: "88%" },
    { id: 4, name: "Thomas V.", poste: "Product Designer", profileCompleted: true, contacted: { status: "Oui", tool: "Téléphone", reason: "Follow-up" }, status: "Tests", score: "65%" },
    { id: 5, name: "Inès B.", poste: "Product Designer", profileCompleted: false, contacted: { status: "Non" }, status: "Nouvelle", score: "42%" },
  ];

  const filteredCandidates = candidates.filter(c => {
    const matchesPoste = filterPoste === 'all' || c.poste === filterPoste;
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    return matchesPoste && matchesSearch;
  });

  return (
    <div className="space-y-8">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-slate-50 p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 transition-all">
          <div className="space-y-4 flex-1 w-full">
             <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl font-serif font-black text-slate-900">Suivi Recrutement</h2>
                <p className="text-slate-400 font-serif italic text-xs sm:text-sm">Gestion simple et pragmatique du flux candidat.</p>
             </div>
             
             <div className="relative w-full max-w-sm">
                <input 
                   type="text"
                   placeholder="Rechercher un nom..."
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   className="w-full pl-6 pr-6 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-reveliom-purple/20 outline-none transition-all"
                />
             </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
             <select 
               value={filterPoste} 
               onChange={(e) => setFilterPoste(e.target.value)}
               className="w-full md:w-auto px-6 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-500 focus:ring-2 focus:ring-reveliom-purple/20 outline-none cursor-pointer transition-all"
             >
                <option value="all">Tous les postes</option>
                {Array.from(new Set(candidates.map(c => c.poste))).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
             </select>
          </div>
       </div>

       <div className="glass-card overflow-hidden border-none shadow-xl bg-white rounded-2xl">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
               <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 px-6">
                     <th className="py-5 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Candidat</th>
                     <th className="py-5 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Profil REVELIOM</th>
                     <th className="py-5 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Contacté ?</th>
                     <th className="py-5 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Statut</th>
                     <th className="py-5 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Action</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {filteredCandidates.map(c => (
                     <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="py-6 px-8">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                 <User className="w-5 h-5" />
                              </div>
                              <div>
                                 <div className="text-sm font-bold text-slate-900 leading-none mb-1">{c.name}</div>
                                 <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{c.poste}</div>
                              </div>
                           </div>
                        </td>
                        <td className="py-6 px-6 text-center">
                           {c.profileCompleted ? (
                             <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                <CheckCircle2 className="w-3 h-3" />
                                Complet
                             </div>
                           ) : (
                             <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                <AlertCircle className="w-3 h-3" />
                                Incomplet
                             </div>
                           )}
                        </td>
                        <td className="py-6 px-6">
                           {c.contacted.status === "Oui" ? (
                             <div className="space-y-1">
                                <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                   <MessageSquare className="w-3 h-3 text-reveliom-purple" />
                                   {c.contacted.tool}
                                </div>
                                <div className="text-[10px] font-serif italic text-slate-400">{c.contacted.reason}</div>
                             </div>
                           ) : (
                             <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Non contacté</span>
                           )}
                        </td>
                        <td className="py-6 px-6">
                           <span className="px-4 py-1.5 bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.1em] rounded-full">
                              {c.status}
                           </span>
                        </td>
                        <td className="py-6 px-8 text-right">
                           <button 
                             onClick={() => onCandidateClick(c)}
                             className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-reveliom-purple transition-all flex items-center gap-2 justify-end ml-auto group"
                           >
                              Voir Profil
                              <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                           </button>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
          </div>
          {filteredCandidates.length === 0 && (
            <div className="py-20 text-center space-y-4">
               <Users2 className="w-12 h-12 text-slate-100 mx-auto" />
               <p className="text-slate-300 font-serif italic">Aucun candidat ne correspond à cette recherche.</p>
            </div>
          )}
       </div>
    </div>
  );
}

function RecruiterPricing() {
  const plans = [
    { title: 'Essor', price: '290€', desc: 'Pour les petites structures en croissance.', features: ['1 Poste actif', 'Matches illimités', 'Sanctuaire standard'] },
    { title: 'Évidence', price: '890€', desc: 'Pour les équipes RH exigeantes.', features: ['5 Postes actifs', 'Triangulation avancée', 'Priorité diagnostic'], popular: true },
    { title: 'Axiom Labs', price: 'Contact', desc: 'Le sur-mesure pour les grands comptes.', features: ['Postes illimités', 'Lien API direct', 'Audit culturel'] }
  ];

  return (
    <div className="space-y-12 py-10">
       <div className="text-center space-y-4">
         <h2 className="text-4xl font-serif font-black text-slate-900">Le Plan d'Alignement.</h2>
         <p className="text-slate-400 font-serif italic text-lg tracking-tight">Choisissez la puissance de REVELIOM adaptée à votre flux.</p>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-slate-900 leading-normal">
          {plans.map(p => (
            <div key={p.title} className={`glass-card p-7 sm:p-12 space-y-8 relative overflow-hidden flex flex-col ${p.popular ? 'ring-2 ring-reveliom-purple shadow-2xl' : ''}`}>
               {p.popular && <div className="absolute top-0 right-0 px-4 py-1.5 bg-reveliom-purple text-white text-[9px] font-black uppercase tracking-widest rounded-bl-xl">Plus populaire</div>}
               <div className="space-y-2">
                  <h3 className="text-2xl font-serif font-bold text-slate-900">{p.title}</h3>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">{p.desc}</p>
               </div>
               <div className="text-4xl font-serif font-black text-slate-900">{p.price}<span className="text-sm font-medium text-slate-300">/mois</span></div>
               <ul className="space-y-4 pt-4 text-left border-t border-slate-50 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-slate-600 font-medium italic">
                       <CheckCircle2 className="w-4 h-4 text-green-500" />
                       {f}
                    </li>
                  ))}
               </ul>
               <button className={`w-full py-4 rounded-xl font-bold transition-all mt-8 ${p.popular ? 'bg-reveliom-purple text-white shadow-xl shadow-reveliom-purple/20' : 'bg-slate-50 text-slate-900 hover:bg-slate-100'}`}>
                  Choisir ce plan
               </button>
            </div>
          ))}
       </div>
    </div>
  );
}

function InvitationLinkOverlay({ onExit }: { onExit: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[110] flex items-center justify-center p-6 text-slate-900">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white max-w-md w-full rounded-[2.5rem] p-10 space-y-6 text-center relative">
         <button onClick={onExit} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
         <div className="w-16 h-16 bg-reveliom-purple/10 rounded-2xl flex items-center justify-center text-reveliom-purple mx-auto">
           <QrCode className="w-8 h-8" />
         </div>
         <div className="space-y-2">
           <h3 className="text-2xl font-serif font-bold text-slate-900">Lien d'invitation</h3>
           <p className="text-sm text-slate-400 leading-relaxed font-serif italic">Envoyez ce lien unique à votre candidat pour qu'il passe son diagnostic REVELIOM.</p>
         </div>
         <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
            <code className="text-[10px] font-bold text-slate-800 select-all">reveliom.io/invite/AXIOM-2026-JH</code>
            <button className="text-[10px] font-black uppercase text-reveliom-purple tracking-widest px-3 py-1 bg-white rounded-lg border border-reveliom-purple/10">Copier</button>
         </div>
         <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Le lien expire dans 7 jours</p>
      </motion.div>
    </motion.div>
  );
}

function MatchingDetailsOverlay({ user, candidate, onExit }: { user: UserProfile | null, candidate: any, onExit: () => void }) {
  const adn = candidate.adn || REAL_PROFILE_DATA;
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/90 backdrop-blur-3xl z-[200] flex items-center justify-center p-4 lg:p-12 overflow-hidden">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 40 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        className="bg-white max-w-6xl w-full h-full max-h-[95vh] rounded-[2rem] sm:rounded-[3rem] md:rounded-[4rem] flex flex-col shadow-[0_100px_200px_-50px_rgba(0,0,0,0.5)] overflow-hidden relative border-none"
      >
         <button onClick={onExit} className="absolute top-4 right-4 sm:top-10 sm:right-10 p-2 sm:p-4 text-slate-300 hover:text-slate-900 hover:bg-slate-50 transition-all rounded-full z-10"><X className="w-6 h-6 sm:w-8 sm:h-8" /></button>
         
         {/* Vertical Branding Rail */}
         <div className="absolute top-10 left-10 h-24 hidden sm:flex items-center">
            <div className="inline-flex flex-col items-center gap-1 opacity-20">
               <span className="text-[10px] font-black uppercase tracking-[0.5em] writing-vertical transform rotate-180">REVELIOM</span>
               <div className="w-px h-12 bg-slate-900" />
            </div>
         </div>

         <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50/30">
            {/* Header / Hero Section (THE MIRROR / TRUTH) */}
            <div className="p-6 sm:p-12 lg:px-24 pt-14 sm:pt-24 pb-10 sm:pb-20 flex flex-col lg:flex-row items-center gap-10 sm:gap-20 border-b border-slate-100 bg-white relative">
               <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12">
                  <Logo />
               </div>
               
               <div className="relative shrink-0 group">
                  <div className="w-32 h-32 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-[2rem] sm:rounded-[3.5rem] md:rounded-[4.5rem] bg-slate-50 border-4 sm:border-8 border-white flex items-center justify-center overflow-hidden shadow-[0_50px_100px_-30px_rgba(0,0,0,0.15)] group-hover:scale-105 transition-transform duration-700 relative">
                     {user?.uid === candidate.uid && user?.photoURL ? (
                       <img src={user.photoURL} className="w-full h-full object-cover opacity-100" />
                     ) : (
                       <User className="w-24 h-24 text-slate-200" />
                     )}
                     <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent flex items-end justify-center pb-6">
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.4em] drop-shadow-md">L'Humain Authentifié</span>
                     </div>
                  </div>
                  <div className="absolute -bottom-3 -right-3 sm:-bottom-6 sm:-right-6 w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-reveliom-purple rounded-xl sm:rounded-2xl md:rounded-[2.5rem] flex items-center justify-center shadow-2xl border-2 sm:border-4 border-white z-10 transition-transform duration-500 group-hover:scale-110">
                     <div className="flex flex-col items-center">
                        <span className="text-lg sm:text-3xl font-black text-white font-serif tracking-tighter leading-none">{candidate.score}</span>
                        <span className="text-[8px] font-black text-white/60 uppercase tracking-widest mt-1">ALIGNEMENT</span>
                     </div>
                  </div>
               </div>

               <div className="flex-1 text-center lg:text-left space-y-8">
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
                     <div className="px-6 py-2.5 bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.4em] rounded-full border border-slate-800 shadow-xl">
                        Moteur Interne Révélé
                     </div>
                     <span className="px-6 py-2.5 bg-blue-50 text-blue-600 text-[11px] font-black uppercase tracking-widest rounded-full border border-blue-100 italic">{candidate.status}</span>
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-serif font-black text-slate-900 tracking-tighter leading-[0.9]">
                      {candidate.name.split(' ')[0]} <br />
                      <span className="text-slate-200 italic">{candidate.name.split(' ').slice(1).join(' ')}</span>
                    </h2>
                  </div>
                  <p className="text-base sm:text-xl md:text-2xl lg:text-3xl font-serif font-black text-reveliom-purple italic leading-tight tracking-tight max-w-2xl">
                     "{adn.positionnement}"
                  </p>
               </div>
            </div>

            {/* THE ENGINE (MOTEURS & FREINS) */}
            <div className="p-6 sm:p-12 lg:px-24 bg-white border-b border-slate-100">
               <div className="max-w-4xl mx-auto space-y-16">
                  <div className="text-center space-y-2">
                     <h3 className="text-xs font-black uppercase tracking-[0.5em] text-slate-400">Architecture du Moteur</h3>
                     <p className="text-xl font-serif font-medium italic text-slate-900">"Ce qui le booste. Ce qui l'éteint."</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                     {/* Boosters */}
                     <div className="space-y-8">
                        <div className="flex items-center gap-4 mb-2">
                           <Zap className="w-5 h-5 text-reveliom-purple fill-current" />
                           <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 underline decoration-reveliom-purple decoration-4 underline-offset-8">Boosters de Performance</h4>
                        </div>
                        <div className="space-y-8">
                           {adn.boosters?.map((b: any) => (
                              <EngineGauge key={b.label} label={b.label} value={b.value} color="bg-reveliom-purple" />
                           ))}
                        </div>
                     </div>

                     {/* Brakes */}
                     <div className="space-y-8">
                        <div className="flex items-center gap-4 mb-2">
                           <AlertCircle className="w-5 h-5 text-orange-500 fill-current opacity-40" />
                           <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 underline decoration-slate-200 decoration-4 underline-offset-8">Points de Rupture</h4>
                        </div>
                        <div className="space-y-8">
                           {adn.freins?.map((f: any) => (
                              <EngineGauge key={f.label} label={f.label} value={f.value} color="bg-slate-400" />
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* THE MATCH (ACTION CENTER) */}
            <div className="p-10 sm:p-16 lg:p-32 flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(123,91,245,0.05),transparent_70%)]" />
               
               <motion.div 
                 initial={{ opacity: 0, scale: 0.9 }}
                 whileInView={{ opacity: 1, scale: 1 }}
                 viewport={{ once: true }}
                 className="relative z-10 flex flex-col items-center text-center space-y-12"
               >
                  <div className="space-y-4">
                     <h4 className="text-xs font-black uppercase tracking-[0.4em] text-reveliom-purple">Le Moment de Vérité</h4>
                     <p className="text-xl sm:text-3xl md:text-5xl font-serif font-black text-slate-900 italic max-w-2xl leading-[1.1]">
                        REVELIOM connaît l'issue. <br />
                        <span className="text-slate-300">Voulez-vous la déverrouiller ?</span>
                     </p>
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    className="group relative"
                  >
                     <div className="absolute inset-0 bg-reveliom-purple blur-3xl opacity-40 group-hover:opacity-60 transition-opacity animate-pulse" />
                     <div className="relative px-8 py-5 sm:px-12 sm:py-7 md:px-16 md:py-8 bg-gradient-to-r from-reveliom-purple to-reveliom-purple-dark text-white rounded-full font-black text-sm sm:text-base md:text-xl uppercase tracking-[0.2em] shadow-[0_30px_60px_-15px_rgba(123,91,245,0.6)] flex items-center gap-4 sm:gap-6 overflow-hidden transform-gpu border-t border-white/20">
                        <Zap className="w-8 h-8 fill-current" />
                        <span>Lancer le Match d'Alignement</span>
                        <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                     </div>
                  </motion.button>

                  <p className="text-sm font-serif italic text-slate-400 max-w-sm">
                     "Comparez instantanément les moteurs de {candidate.name.split(' ')[0]} avec votre propre architecture manager."
                  </p>
               </motion.div>
            </div>

            <div className="p-6 sm:p-12 lg:px-24 grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-20">
               {/* Left Detail Column */}
               <div className="lg:col-span-12 space-y-12">
                  {/* Synthesis Text - Exhaustive */}
                  <div className="space-y-6 bg-slate-50/50 p-5 sm:p-10 rounded-[1.5rem] sm:rounded-[3rem] border border-slate-100 relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-10 opacity-5">
                        <MessageSquare className="w-32 h-32" />
                     </div>
                     <h3 className="text-xs font-black uppercase tracking-[0.4em] text-reveliom-purple mb-8 flex items-center gap-3">
                        <Sparkles className="w-4 h-4" /> Analyse Sentimentale & Structurelle
                     </h3>
                     <p className="text-lg sm:text-2xl font-serif font-black leading-relaxed text-slate-800 italic relative z-10">
                        "{adn.lecture_globale || adn.positionnement}"
                     </p>
                  </div>

                  {/* DNA Grid - Exhaustive Insights */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 sm:gap-x-16 gap-y-8 sm:gap-y-12 border-t border-slate-100 pt-10 sm:pt-16">
                     <ExhaustivePoint title="Le Mouvement" content={adn.mouvement} icon={<Zap className="w-5 h-5 text-reveliom-purple" />} />
                     <ExhaustivePoint title="Rythme Temporel" content={adn.temps} icon={<Calendar className="w-5 h-5 text-reveliom-purple" />} />
                     <ExhaustivePoint title="Fondations Morales" content={adn.valeurs} icon={<ShieldCheck className="w-5 h-5 text-reveliom-purple" />} />
                     <ExhaustivePoint title="Projections Mentales" content={adn.projections} icon={<Compass className="w-5 h-5 text-reveliom-purple" />} />
                  </div>
               </div>

               {/* Right Logic Column */}
               <div className="lg:col-span-12 space-y-12">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                     <div className="h-[220px] sm:h-[320px] md:h-[400px] bg-slate-50/50 rounded-[1.5rem] sm:rounded-[2.5rem] p-5 sm:p-8 flex flex-col items-center justify-center border border-slate-100">
                        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-8">Triangulation des Soft Skills</div>
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={adn.skills_data || REAL_PROFILE_DATA.skills_data}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                            <Radar
                               name="James"
                               dataKey="A"
                               stroke="#7B5BF5"
                               fill="#7B5BF5"
                               fillOpacity={0.1}
                               strokeWidth={3}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                     </div>

                     <div className="space-y-10">
                        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">Pourquoi lui ?</h3>
                        <div className="space-y-8">
                           <div className="flex gap-6">
                              <div className="shrink-0 w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-serif font-black italic">!</div>
                              <div className="space-y-2">
                                 <h4 className="text-sm font-black uppercase text-slate-900 tracking-widest">Le Verdict AXIOM</h4>
                                 <p className="text-xl font-serif font-medium text-slate-500 italic leading-relaxed">{MATCHING_DATA.pourquoi}</p>
                              </div>
                           </div>
                           <div className="p-5 sm:p-8 bg-reveliom-purple text-white rounded-[2rem] sm:rounded-[3rem] space-y-4 shadow-2xl shadow-reveliom-purple/20">
                              <div className="text-[9px] font-black uppercase tracking-[0.4em] opacity-60">Conseil de Management</div>
                              <p className="text-lg font-serif font-bold italic leading-relaxed">
                                 "L'alignement est réel sur la structure de réflexion, mais James aura besoin d'une légitimité technique immédiate pour ne pas s'épuiser dans la posture commerciale."
                              </p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
            
            {/* Footer space */}
            <div className="p-8 sm:p-16 border-t border-slate-50 text-center opacity-30">
               <span className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400">Diagnostic Authentifié V8.0 • James x REVELIOM</span>
            </div>
         </div>
      </motion.div>
    </motion.div>
  );
}

function EngineGauge({ label, value, color }: { label: string; value: number; color: string; key?: any }) {
  return (
    <div className="space-y-4">
       <div className="flex justify-between items-end">
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">{label}</span>
          <span className="text-sm font-serif font-black italic text-slate-400">{value}%</span>
       </div>
       <div className="h-2.5 bg-slate-100/50 rounded-full overflow-hidden backdrop-blur-sm">
          <motion.div 
            initial={{ width: 0 }}
            whileInView={{ width: `${value}%` }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            className={`h-full ${color} rounded-full relative overflow-hidden`}
          >
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </motion.div>
       </div>
    </div>
  );
}

function ExhaustivePoint({ title, content, icon }: any) {
  return (
    <div className="space-y-4 group">
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-reveliom-purple group-hover:text-white transition-all duration-500">
                {icon}
             </div>
             <h4 className="text-xs font-black uppercase tracking-[0.3em] text-slate-900">{title}</h4>
          </div>
       </div>
       <p className="text-xl font-serif font-medium text-slate-500 italic leading-relaxed pl-14 border-l border-slate-50 py-2 group-hover:border-reveliom-purple transition-all duration-700">
          {content}
       </p>
    </div>
  );
}

function MatchingPoint({ icon, title, content }: { icon: React.ReactNode, title: string, content: string }) {
  return (
    <div className="flex gap-6 p-6 bg-slate-50 rounded-3xl border border-slate-100">
       <div className="shrink-0 w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
          {icon}
       </div>
       <div className="space-y-1">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</h4>
          <p className="text-sm font-serif font-medium text-slate-800 leading-relaxed italic">{content}</p>
       </div>
    </div>
  );
}

function QRCodeOverlay({ user, onExit }: { user: UserProfile; onExit: () => void }) {
  const isJames = user.email === "james.guerin.pro@gmail.com";
  const hasADN = user.adn || isJames;
  const [step, setStep] = useState(hasADN ? 1 : 0);
  const profileUrl = `${window.location.origin}?profil=${user.uid}`;
  const firstLetter = user.displayName?.charAt(0)?.toUpperCase() || 'R';

  const handleDownload = () => {
    // Générer PNG depuis le QR code SVG
    const svgEl = document.getElementById('reveliom-qr-download');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const SIZE = 512;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const link = document.createElement('a');
      link.download = `signature-reveliom-${user.displayName.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-white z-[250] overflow-y-auto"
    >
       {/* Background Ambience */}
       <div className="fixed inset-0 pointer-events-none opacity-40">
          <div className="absolute top-[10%] left-[15%] w-[40vw] h-[40vw] bg-reveliom-purple/10 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[15%] right-[10%] w-[35vw] h-[35vw] bg-reveliom-light/40 blur-[100px] rounded-full" />
       </div>

       <div className="min-h-screen w-full flex flex-col relative text-left">
          <header className="p-6 sm:p-10 flex justify-between items-center sticky top-0 z-[60] bg-white/50 backdrop-blur-xl">
             <div className="flex items-center gap-3">
                <Logo size="small" />
                <div className="hidden sm:block h-4 w-px bg-slate-200 mx-2" />
                <span className="hidden sm:block text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Signature ADN</span>
             </div>
             <button
               onClick={onExit}
               className="p-3 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-full transition-all"
             >
                <X className="w-5 h-5" />
             </button>
          </header>

          <div className="flex-1 w-full max-w-7xl mx-auto flex items-center justify-center p-6 sm:p-12">
            <AnimatePresence mode="wait">
                {/* STEP 0: LOCKED */}
                {!hasADN && step === 0 && (
                   <motion.div
                     key="locked"
                     initial={{ opacity: 0, scale: 0.98 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 1.02 }}
                     className="max-w-2xl text-center space-y-12"
                   >
                      <div className="relative inline-block">
                         <div className="absolute inset-0 bg-reveliom-purple/10 blur-3xl rounded-full" />
                         <div className="relative w-48 h-48 rounded-[3.5rem] bg-white border border-slate-100 flex items-center justify-center shadow-2xl">
                            <QrCode className="w-20 h-20 text-slate-100" />
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ repeat: Infinity, duration: 2 }}
                              className="absolute"
                            >
                               <Lock className="w-10 h-10 text-reveliom-purple/60" />
                            </motion.div>
                         </div>
                      </div>
                      <div className="space-y-6">
                         <h2 className="text-5xl sm:text-7xl font-serif font-black text-slate-900 leading-tight">
                            Portrait <span className="text-reveliom-purple italic">suspendu.</span>
                         </h2>
                         <p className="text-xl text-slate-500 font-serif italic leading-relaxed max-w-md mx-auto">
                            "Votre Signature nécessite la vérité de votre diagnostic pour être activée."
                         </p>
                      </div>
                      <button
                        onClick={onExit}
                        className="px-12 py-5 bg-reveliom-purple text-white rounded-full font-black uppercase tracking-widest text-[11px] shadow-xl hover:scale-105 transition-all"
                      >
                         Terminer le Diagnostic
                      </button>
                   </motion.div>
                )}

                {/* STEP 1: TON VRAI PROFIL — CE QUE LE RECRUTEUR VOIT */}
                {step === 1 && (() => {
                  const adn1 = user.adn || REAL_PROFILE_DATA;
                  return (
                   <motion.div
                     key="vision"
                     initial={{ opacity: 0, y: 30 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -30 }}
                     className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16 items-start"
                   >
                      {/* GAUCHE : Hook + CTA */}
                      <div className="space-y-10 lg:sticky lg:top-20">
                         <div className="space-y-5">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-reveliom-purple/5 rounded-full ring-1 ring-reveliom-purple/10">
                               <ShieldCheck className="w-4 h-4 text-reveliom-purple" />
                               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-reveliom-purple">Ce que voit le recruteur</span>
                            </div>
                            <h2 className="text-4xl sm:text-6xl font-serif font-black text-slate-900 leading-[0.95] tracking-tighter">
                               Ton profil.<br />
                               <span className="text-reveliom-purple italic font-light">100× mieux<br />qu'un CV.</span>
                            </h2>
                            <p className="text-base text-slate-500 font-serif italic leading-relaxed">
                               À droite, exactement ce qu'un recruteur voit en flashant ton QR code.<br />
                               <span className="text-slate-900 font-black not-italic">Aucune lettre de motivation ne peut rivaliser avec ça.</span>
                            </p>
                         </div>

                         <div className="space-y-4">
                            <button
                              onClick={() => setStep(2)}
                              className="group w-full px-10 py-6 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[11px] shadow-2xl hover:bg-reveliom-purple transition-all flex items-center justify-center gap-4"
                            >
                               Placer ce QR sur mon CV
                               <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                            </button>
                            <button
                              onClick={() => setStep(3)}
                              className="group w-full px-10 py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-full font-black uppercase tracking-widest text-[11px] hover:border-reveliom-purple hover:text-reveliom-purple transition-all flex items-center justify-center gap-3"
                            >
                               Voir mon profil en plein écran
                               <Eye className="w-4 h-4" />
                            </button>
                         </div>

                         {/* Proof points */}
                         <div className="border-t border-slate-100 pt-8 space-y-3">
                            {[
                              "Un recruteur lit tout ça en 90 secondes",
                              "Zéro biais d'apparence ou d'école",
                              "Produit après 40+ minutes de diagnostic réel",
                            ].map((t, i) => (
                              <div key={i} className="flex items-center gap-3">
                                 <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                 <p className="text-xs text-slate-400 font-serif italic">{t}</p>
                              </div>
                            ))}
                         </div>
                      </div>

                      {/* DROITE : VRAI PROFIL COMPLET (mini CandidateADNSignature) */}
                      <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="relative"
                      >
                         {/* Glow */}
                         <div className="absolute -inset-6 bg-reveliom-purple/8 blur-[60px] rounded-[3rem] pointer-events-none" />

                         <div className="relative rounded-[2.5rem] overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.18)] border border-slate-200 bg-white">

                            {/* ── HEADER DARK ── */}
                            <div className="bg-slate-900 p-6 sm:p-8 relative overflow-hidden">
                               <div className="absolute top-0 right-0 w-40 h-40 bg-reveliom-purple/20 blur-[60px] rounded-full pointer-events-none" />
                               <div className="relative z-10 space-y-5">
                                  {/* Badges */}
                                  <div className="flex flex-wrap gap-2">
                                     <div className="px-2.5 py-1 bg-white/10 text-white/60 rounded text-[7px] font-black uppercase tracking-[0.3em]">V8.4 / CONFIDENTIAL</div>
                                     <div className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded text-[7px] font-black uppercase tracking-[0.3em] border border-emerald-500/30">✓ Certifié REVELIOM</div>
                                  </div>
                                  {/* Identité */}
                                  <div className="flex items-center gap-4">
                                     <div className="relative shrink-0">
                                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 border-white/20 bg-slate-700 flex items-center justify-center">
                                           {user.photoURL
                                             ? <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                             : <span className="text-2xl font-serif font-black text-white/40">{firstLetter}</span>
                                           }
                                        </div>
                                        <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-white rounded-lg shadow-md p-0.5">
                                           <QRCodeSVG value={profileUrl} size={16} fgColor="#7B5BF5" bgColor="white" level="M" />
                                        </div>
                                     </div>
                                     <div className="flex-1 min-w-0">
                                        <p className="text-white font-black text-xl sm:text-2xl leading-none truncate">{user.displayName}</p>
                                        <p className="text-reveliom-purple/80 text-[10px] font-black uppercase tracking-widest mt-1">ID: MIR-{user.displayName?.substring(0,3).toUpperCase()}-2026</p>
                                     </div>
                                  </div>
                                  {/* Positionnement */}
                                  <p className="text-white/90 font-serif font-black italic text-base sm:text-lg leading-snug border-l-2 border-reveliom-purple/50 pl-4">
                                     "{adn1.positionnement}"
                                  </p>
                               </div>
                            </div>

                            {/* ── LECTURE GLOBALE ── */}
                            <div className="bg-slate-800 px-6 sm:px-8 py-5">
                               <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-2">Lecture globale</p>
                               <p className="text-white/80 text-sm font-serif italic leading-relaxed">{adn1.lecture_globale}</p>
                            </div>

                            {/* ── BOOSTERS ── */}
                            <div className="bg-white px-6 sm:px-8 py-6 space-y-4 border-b border-slate-100">
                               <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Moteurs actifs</p>
                               <div className="space-y-3">
                                  {(adn1.boosters || []).map((b: any, i: number) => (
                                    <div key={i} className="space-y-1.5">
                                       <div className="flex justify-between items-center">
                                          <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{b.label}</span>
                                          <span className="text-xs font-black text-reveliom-purple">{b.value}%</span>
                                       </div>
                                       <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                          <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${b.value}%` }}
                                            transition={{ duration: 1.2, delay: 0.5 + i * 0.15, ease: "easeOut" }}
                                            className="h-full bg-reveliom-purple rounded-full"
                                          />
                                       </div>
                                    </div>
                                  ))}
                               </div>
                            </div>

                            {/* ── FORCES & LIMITES ── */}
                            <div className="grid grid-cols-2 divide-x divide-slate-100">
                               <div className="px-5 py-5 space-y-2">
                                  <div className="flex items-center gap-1.5">
                                     <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                     <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600">Leviers</p>
                                  </div>
                                  <p className="text-xs text-slate-700 font-serif leading-relaxed">{adn1.forces}</p>
                               </div>
                               <div className="px-5 py-5 space-y-2 bg-slate-50/50">
                                  <div className="flex items-center gap-1.5">
                                     <ShieldAlert className="w-3.5 h-3.5 text-reveliom-purple shrink-0" />
                                     <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Vigilances</p>
                                  </div>
                                  <p className="text-xs text-slate-500 font-serif italic leading-relaxed">{adn1.limites}</p>
                               </div>
                            </div>

                            {/* ── MOTEUR ── */}
                            <div className="bg-reveliom-purple/5 border-t border-reveliom-purple/10 px-6 sm:px-8 py-5 space-y-2">
                               <div className="flex items-center gap-2">
                                  <Zap className="w-3.5 h-3.5 text-reveliom-purple" />
                                  <p className="text-[8px] font-black uppercase tracking-widest text-reveliom-purple">Ce qui le met en mouvement</p>
                               </div>
                               <p className="text-sm text-slate-700 font-serif italic leading-relaxed">{adn1.mouvement}</p>
                            </div>

                            {/* ── FOOTER CERTIF ── */}
                            <div className="px-6 sm:px-8 py-4 flex items-center justify-between border-t border-slate-100 bg-white">
                               <div className="flex items-center gap-2">
                                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Diagnostic REVELIOM V8 — Triangulation complète</span>
                               </div>
                               <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
                                  <QRCodeSVG value={profileUrl} size={32} fgColor="#7B5BF5" bgColor="white" level="M" />
                               </div>
                            </div>
                         </div>
                      </motion.div>
                   </motion.div>
                  );
                })()}

                {/* STEP 2: AVANT / APRÈS — UNE IMAGE VAUT 1000 MOTS */}
                {step === 2 && (
                   <motion.div
                     key="action"
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -20 }}
                     className="w-full max-w-7xl space-y-10"
                   >
                      {/* Titre */}
                      <div className="text-center space-y-3">
                         <h2 className="text-3xl sm:text-5xl font-serif font-black text-slate-900 leading-tight">
                            Remplace ta photo.<br />
                            <span className="text-reveliom-purple italic font-light">C'est tout.</span>
                         </h2>
                         <p className="text-slate-400 font-serif italic text-base">Le recruteur flashe le QR — ton profil complet s'ouvre en 2 secondes.</p>
                      </div>

                      {/* QR caché pour génération PNG */}
                      <div className="sr-only" aria-hidden="true">
                         <QRCodeSVG id="reveliom-qr-download" value={profileUrl} size={512} fgColor="#0f172a" bgColor="white" level="H" />
                      </div>

                      {/* AVANT / APRÈS */}
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 sm:gap-8 items-center">

                         {/* ── AVANT ── */}
                         <motion.div
                           initial={{ opacity: 0, x: -20 }}
                           animate={{ opacity: 1, x: 0 }}
                           transition={{ delay: 0.2 }}
                           className="relative"
                         >
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-slate-200 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                               AVANT
                            </div>
                            <div className="mt-4 bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden opacity-70">
                               {/* Header CV avec PHOTO */}
                               <div className="bg-slate-50 p-4 sm:p-5 flex items-start gap-3 border-b border-slate-100">
                                  {/* Photo classique */}
                                  <div className="relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-slate-200 flex items-center justify-center">
                                     <User className="w-8 h-8 text-slate-300" />
                                     {/* Croix rouge */}
                                     <div className="absolute inset-0 flex items-center justify-center">
                                        <X className="w-10 h-10 text-red-400 opacity-80 stroke-[2.5]" />
                                     </div>
                                  </div>
                                  <div className="flex-1 space-y-2 pt-1">
                                     <div className="h-4 w-28 bg-slate-200 rounded" />
                                     <div className="h-2.5 w-20 bg-slate-100 rounded" />
                                     <div className="flex gap-2 mt-2">
                                        <div className="h-2 w-14 bg-slate-100 rounded-full" />
                                        <div className="h-2 w-16 bg-slate-100 rounded-full" />
                                     </div>
                                  </div>
                               </div>
                               <div className="p-4 space-y-3">
                                  <div className="h-2.5 w-20 bg-slate-200 rounded" />
                                  <div className="space-y-1.5 pl-2 border-l-2 border-slate-100">
                                     <div className="h-2 w-full bg-slate-100 rounded" />
                                     <div className="h-2 w-5/6 bg-slate-100 rounded" />
                                     <div className="h-2 w-4/6 bg-slate-100 rounded" />
                                  </div>
                                  <div className="h-2.5 w-24 bg-slate-200 rounded mt-4" />
                                  <div className="flex flex-wrap gap-1.5">
                                     {["…", "…", "…"].map((s, i) => (
                                       <div key={i} className="px-2.5 py-0.5 bg-slate-100 rounded-full text-[7px] text-slate-300 font-black uppercase tracking-wider w-14" />
                                     ))}
                                  </div>
                               </div>
                               {/* Label bas */}
                               <div className="px-4 pb-3 text-[8px] font-black text-red-400/60 uppercase tracking-widest">CV standard — photo jugée en 3 secondes</div>
                            </div>
                         </motion.div>

                         {/* ── FLÈCHE ── */}
                         <motion.div
                           initial={{ opacity: 0, scale: 0.5 }}
                           animate={{ opacity: 1, scale: 1 }}
                           transition={{ delay: 0.5 }}
                           className="flex flex-col items-center gap-2 shrink-0"
                         >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-900 flex items-center justify-center shadow-xl">
                               <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest hidden sm:block">Remplace</span>
                         </motion.div>

                         {/* ── APRÈS ── */}
                         <motion.div
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           transition={{ delay: 0.35 }}
                           className="relative"
                         >
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-reveliom-purple text-white rounded-full text-[10px] font-black uppercase tracking-widest">
                               APRÈS
                            </div>
                            {/* Glow violet */}
                            <div className="absolute -inset-3 bg-reveliom-purple/15 blur-2xl rounded-3xl pointer-events-none" />
                            <div className="relative mt-4 bg-white rounded-2xl shadow-xl border-2 border-reveliom-purple overflow-hidden">
                               {/* Header CV avec QR */}
                               <div className="bg-gradient-to-r from-reveliom-purple/5 to-white p-4 sm:p-5 flex items-start gap-3 border-b border-reveliom-purple/10">
                                  {/* QR à la place de la photo */}
                                  <div className="relative shrink-0">
                                     <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg border-2 border-reveliom-purple bg-white p-1 shadow-md">
                                        <QRCodeSVG value={profileUrl} size={52} fgColor="#7B5BF5" bgColor="white" level="M" />
                                     </div>
                                     {/* Pulse ring */}
                                     <motion.div
                                       animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                                       transition={{ repeat: Infinity, duration: 2 }}
                                       className="absolute inset-0 rounded-lg border-2 border-reveliom-purple"
                                     />
                                  </div>
                                  <div className="flex-1 space-y-2 pt-1">
                                     <div className="h-4 w-28 bg-slate-800 rounded opacity-80" />
                                     <div className="h-2.5 w-20 bg-reveliom-purple/30 rounded" />
                                     <div className="flex gap-2 mt-2">
                                        <div className="h-2 w-14 bg-slate-100 rounded-full" />
                                        <div className="h-2 w-16 bg-slate-100 rounded-full" />
                                     </div>
                                  </div>
                               </div>
                               <div className="p-4 space-y-3">
                                  <div className="h-2.5 w-20 bg-slate-200 rounded" />
                                  <div className="space-y-1.5 pl-2 border-l-2 border-reveliom-purple/20">
                                     <div className="h-2 w-full bg-slate-100 rounded" />
                                     <div className="h-2 w-5/6 bg-slate-100 rounded" />
                                     <div className="h-2 w-4/6 bg-slate-100 rounded" />
                                  </div>
                                  <div className="h-2.5 w-24 bg-slate-200 rounded mt-4" />
                                  <div className="flex flex-wrap gap-1.5">
                                     {["…", "…", "…"].map((s, i) => (
                                       <div key={i} className="px-2.5 py-0.5 bg-reveliom-purple/10 rounded-full text-[7px] text-reveliom-purple font-black uppercase tracking-wider w-14" />
                                     ))}
                                  </div>
                               </div>
                               {/* Label bas — scan call to action */}
                               <div className="px-4 pb-3 flex items-center gap-2">
                                  <QrCode className="w-3 h-3 text-reveliom-purple" />
                                  <span className="text-[8px] font-black text-reveliom-purple uppercase tracking-widest">Scan → profil complet en 2 secondes</span>
                               </div>
                            </div>
                         </motion.div>
                      </div>

                      {/* CTA */}
                      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                         <button
                           onClick={handleDownload}
                           className="flex-1 sm:max-w-xs py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[11px] shadow-2xl hover:bg-reveliom-purple transition-all flex items-center justify-center gap-4"
                         >
                            <Download className="w-5 h-5" />
                            Télécharger mon QR code (PNG)
                         </button>
                         <button
                           onClick={() => setStep(3)}
                           className="flex-1 sm:max-w-xs py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-full font-black uppercase tracking-widest text-[11px] hover:border-reveliom-purple hover:text-reveliom-purple transition-all flex items-center justify-center gap-3"
                         >
                            Voir mon profil complet
                            <Eye className="w-4 h-4" />
                         </button>
                      </div>
                   </motion.div>
                )}

                {/* THE FINAL REVELATION */}
                {step === 3 && (
                   <motion.div
                     key="revelation"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     className="w-full"
                   >
                     <CandidateADNSignature user={user} />
                   </motion.div>
                )}
             </AnimatePresence>
          </div>
       </div>
    </motion.div>
  );
}

function TutorialPoint({ num, title, text }: { num: string; title: string; text: string }) {
  return (
    <div className="flex gap-6 items-start group">
       <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-400 font-black group-hover:bg-reveliom-purple group-hover:text-white transition-all duration-500 shadow-sm">
          {num}
       </div>
       <div className="space-y-2 pt-1 sm:pt-3">
          <h4 className="text-lg sm:text-xl font-serif font-black text-slate-900 group-hover:text-reveliom-purple transition-colors">{title}</h4>
          <p className="text-xs sm:text-base text-slate-400 leading-relaxed font-serif italic">{text}</p>
       </div>
    </div>
  );
}
