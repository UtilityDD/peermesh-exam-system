
import React, { useState, useEffect, useRef } from 'react';
import { generateQuestions } from '../services/gemini';
import { meshService, MeshMessage } from '../services/mesh';
import { Question, ExamStatus, ConnectionMode, Student, StudentResponse } from '../types';
import AnimatedBackground from './AnimatedBackground';
import {
  Plus, Play, Pause, ChevronRight, Users,
  BarChart3, Settings, Wifi, Bluetooth, Zap,
  QrCode, Loader2, CheckCircle2, XCircle, Copy, Clock,
  Edit2, Trash2, Save, X, RefreshCw, Signal,
  MessageCircle, Mail, FileQuestion, Smartphone, Check,
  Upload, HelpCircle, Shuffle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const InstructorDashboard: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);

  // Utility to shuffle options while maintaining correct answer reference
  const shuffleQuestion = (q: Question): Question => {
    const optionsWithMeta = q.options.map((text, index) => ({
      text,
      isCorrect: index === q.correctIndex
    }));

    // Fisher-Yates Shuffle
    for (let i = optionsWithMeta.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optionsWithMeta[i], optionsWithMeta[j]] = [optionsWithMeta[j], optionsWithMeta[i]];
    }

    return {
      ...q,
      options: optionsWithMeta.map(o => o.text),
      correctIndex: optionsWithMeta.findIndex(o => o.isCorrect)
    };
  };
  const [status, setStatus] = useState<ExamStatus>(ExamStatus.IDLE);
  const [currentQ, setCurrentQ] = useState(0);
  const [connMode, setConnMode] = useState<ConnectionMode>(ConnectionMode.WIFI);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [isRestored, setIsRestored] = useState(false);
  const [isAutomated, setIsAutomated] = useState(false);
  const [isRandomizedSequence, setIsRandomizedSequence] = useState(false);
  const [studentQueues, setStudentQueues] = useState<Record<string, Question[]>>({});
  const [studentCurrentIdx, setStudentCurrentIdx] = useState<Record<string, number>>({});
  const [signalStatus, setSignalStatus] = useState<'stable' | 'weak' | 'offline'>('stable');
  const isMeshReady = !!peerId;

  const [editingQIndex, setEditingQIndex] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [setupMode, setSetupMode] = useState<'choice' | 'manual' | 'ai' | null>(null);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSetupLocked, setIsSetupLocked] = useState(false);
  const [examStartTime, setExamStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [editForm, setEditForm] = useState<Partial<Question>>({
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    timeLimit: 30
  });

  const questionsRef = useRef<Question[]>([]);
  const currentQRef = useRef(0);
  const statusRef = useRef<ExamStatus>(ExamStatus.IDLE);
  const isAutomatedRef = useRef(false);
  const isRandomizedSequenceRef = useRef(false);

  useEffect(() => {
    questionsRef.current = questions;
    currentQRef.current = currentQ;
    statusRef.current = status;
    isAutomatedRef.current = isAutomated;
    isRandomizedSequenceRef.current = isRandomizedSequence;
  }, [questions, currentQ, status, isAutomated, isRandomizedSequence]);

  // Persistence: Save to localStorage
  useEffect(() => {
    if (status !== ExamStatus.IDLE) {
      const sessionData = {
        topic, questions, status, currentQ, peerId, students, responses
      };
      localStorage.setItem('PEERMESH_SESSION', JSON.stringify(sessionData));
    }
  }, [topic, questions, status, currentQ, peerId, students, responses]);

  // Restoration: Load from localStorage
  useEffect(() => {
    const initMesh = async (existingId?: string) => {
      const id = await meshService.init(existingId);
      setPeerId(id);

      meshService.onMessage((senderId, message) => {
        // ... message handling (unchanged)
        if (message.type === 'JOIN') {
          console.log('Student joined:', senderId, message.payload.name);
          const newStudent: Student = {
            id: senderId,
            name: message.payload.name,
            status: 'online',
            score: 0,
            violations: 0,
            isFocused: true
          };
          setStudents(prev => {
            if (prev.find(s => s.id === senderId)) return prev;
            return [...prev, newStudent];
          });

          // Handle late joins during active session
          if (statusRef.current === ExamStatus.ACTIVE) {
            handleManualJoinDuringActive(senderId);
          }
        } else if (message.type === 'RESPONSE') {
          const resp = message.payload as StudentResponse;
          setResponses(prev => [...prev, resp]);
          setStudents(prev => prev.map(s => {
            if (s.id === resp.studentId) {
              return { ...s, score: s.score + (resp.isCorrect ? 10 : 0), status: 'done' };
            }
            return s;
          }));
          // Send acknowledgement
          meshService.send(senderId, { type: 'ACK', payload: { questionId: resp.questionId } });
        } else if (message.type === 'INTEGRITY') {
          const { violations, isFocused } = message.payload;
          setStudents(prev => prev.map(s => {
            if (s.id === senderId) {
              return { ...s, violations, isFocused };
            }
            return s;
          }));
          // Send acknowledgement for integrity as well
          meshService.send(senderId, { type: 'ACK', payload: { type: 'INTEGRITY' } });
        }
      });
    };

    const saved = localStorage.getItem('PEERMESH_SESSION');
    if (saved && !isRestored) {
      try {
        const data = JSON.parse(saved);
        setTopic(data.topic);
        setQuestions(data.questions);
        setStatus(data.status);
        setCurrentQ(data.currentQ);
        setStudents(data.students);
        setResponses(data.responses);
        initMesh(data.peerId);
        setIsRestored(true);
        return;
      } catch (e) {
        console.error('Failed to restore session', e);
      }
    }

    initMesh();
  }, [isRestored]);

  // Real-time clock and elapsed time tracker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Network monitoring
  useEffect(() => {
    const timer = setInterval(() => {
      if (meshService.isDisconnected()) {
        setSignalStatus('offline');
      } else {
        setSignalStatus('stable');
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const refreshMesh = async () => {
    if (confirm('Restart mesh signaling? This might clear connected students but helps fix "ID Not Found" issues.')) {
      meshService.destroy();
      const id = await meshService.init();
      setPeerId(id);
    }
  };

  const DEFAULT_QUESTIONS: Question[] = [
    {
      id: 'm1',
      text: 'What is the primary benefit of P2P networking in PeerMesh?',
      options: ['Higher Cost', 'Offline Connectivity', 'Centralized Control', 'Slower Speed'],
      correctIndex: 1,
      timeLimit: 30
    },
    {
      id: 'm2',
      text: 'Which technology is used for real-time signaling in this app?',
      options: ['PHP', 'PeerJS (WebRTC)', 'FTP', 'SQL'],
      correctIndex: 1,
      timeLimit: 45
    },
    {
      id: 'm3',
      text: 'What does PWA stand for?',
      options: ['Permanent Web App', 'Power Web App', 'Progressive Web App', 'Private Web App'],
      correctIndex: 2,
      timeLimit: 20
    }
  ];

  const handleCreateExam = async () => {
    if (!topic) return;
    setLoading(true);
    const qs = await generateQuestions(topic, 5);
    setQuestions(qs);
    setSetupMode('manual');
    setLoading(false);
  };

  const useManualQuestions = () => {
    setQuestions(DEFAULT_QUESTIONS);
    setSetupMode('manual');
    setTopic('Manual Test Session');
  };

  const openEditor = (index: number | null) => {
    if (index !== null) {
      setEditForm({ ...questions[index] });
      setEditingQIndex(index);
    } else {
      setEditForm({
        id: `q-${Date.now()}`,
        text: '',
        options: ['', '', '', ''],
        correctIndex: 0,
        timeLimit: 30
      });
      setEditingQIndex(null);
    }
    setShowEditor(true);
  };

  const saveQuestion = () => {
    if (!editForm.text || editForm.options?.some(o => !o)) return;

    setQuestions(prev => {
      const newQs = [...prev];
      if (editingQIndex !== null) {
        newQs[editingQIndex] = editForm as Question;
      } else {
        newQs.push(editForm as Question);
      }
      return newQs;
    });

    // If we're editing the CURRENT question while it's active, re-broadcast it (randomized per student)
    if (status === ExamStatus.ACTIVE && editingQIndex === currentQ) {
      students.forEach(s => {
        meshService.send(s.id, {
          type: 'QUESTION',
          payload: shuffleQuestion(editForm as Question)
        });
      });
    }

    setShowEditor(false);
  };

  const deleteQuestion = (index: number) => {
    if (confirm('Delete this question?')) {
      setQuestions(prev => prev.filter((_, i) => i !== index));
    }
  };

  const startExam = () => {
    setStatus(ExamStatus.ACTIVE);
    setExamStartTime(Date.now());
    if (isAutomated) {
      startAutomatedExam();
    } else {
      setCurrentQ(0);
      broadcastQuestion(0);
    }
  };

  const startAutomatedExam = () => {
    const newQueues: Record<string, Question[]> = {};
    const newIndices: Record<string, number> = {};

    students.forEach(student => {
      // Shuffle the entire question set for this student if randomized sequence is enabled
      const studentBank = isRandomizedSequence
        ? [...questions].sort(() => Math.random() - 0.5)
        : [...questions];

      const shuffledBank = studentBank.map(q => shuffleQuestion(q));
      newQueues[student.id] = shuffledBank;
      newIndices[student.id] = 0;

      // Send the first question
      pushNextAutomated(student.id, shuffledBank, 0);
    });

    setStudentQueues(newQueues);
    setStudentCurrentIdx(newIndices);
  };

  const pushNextAutomated = (studentId: string, bank: Question[], idx: number) => {
    if (idx < bank.length) {
      const q = bank[idx];
      meshService.send(studentId, {
        type: 'QUESTION',
        payload: q
      });

      setStudentCurrentIdx(prev => ({ ...prev, [studentId]: idx }));

      // Schedule next question
      const timer = (q.timeLimit || 30) * 1000;
      setTimeout(() => {
        pushNextAutomated(studentId, bank, idx + 1);
      }, timer);
    } else {
      // Last question finished for this student
      meshService.send(studentId, {
        type: 'HEARTBEAT',
        payload: { status: 'COMPLETED' }
      });
      // We could also check if ALL students are finished to set global status
    }
  };

  const handleManualJoinDuringActive = (studentId: string) => {
    if (isAutomatedRef.current) {
      // Start the automated flow for this late-comer
      const studentBank = isRandomizedSequenceRef.current
        ? [...questionsRef.current].sort(() => Math.random() - 0.5)
        : [...questionsRef.current];
      const shuffledBank = studentBank.map(q => shuffleQuestion(q));
      setStudentQueues(prev => ({ ...prev, [studentId]: shuffledBank }));
      pushNextAutomated(studentId, shuffledBank, 0);
    } else {
      meshService.send(studentId, {
        type: 'QUESTION',
        payload: shuffleQuestion(questionsRef.current[currentQRef.current])
      });
    }
  };

  const nextQuestion = () => {
    if (currentQ < questions.length - 1) {
      const nextIdx = currentQ + 1;
      setCurrentQ(nextIdx);
      broadcastQuestion(nextIdx);
    } else {
      setStatus(ExamStatus.COMPLETED);
      meshService.broadcast({ type: 'HEARTBEAT', payload: { status: 'COMPLETED' } });
    }
  };

  const publishResults = (instantly: boolean) => {
    meshService.broadcast({
      type: 'RESULTS',
      payload: {
        published: instantly,
        leaderboard: students
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(s => ({ name: s.name, score: s.score })),
        message: instantly ? 'Results published!' : 'Results will be published shortly.'
      }
    });
    if (instantly) {
      alert('Results have been pushed to all students!');
    } else {
      alert('Students have been notified to wait for results.');
    }
  };

  const openEndSessionModal = () => {
    setShowEndSessionModal(true);
  };

  const confirmEndSession = () => {
    const endTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meshService.broadcast({ type: 'SESSION_ENDED', payload: { endTime } });
    // Small timeout to ensure PeerJS sends the message before the page reloads
    setTimeout(() => {
      localStorage.removeItem('PEERMESH_SESSION');
      window.location.reload();
    }, 500);
  };

  const resetSession = () => {
    if (confirm('Are you sure you want to start a completely new session? This will clear all current progress.')) {
      meshService.destroy();
      localStorage.removeItem('PEERMESH_SESSION');
      window.location.reload();
    }
  };

  const updateQuestionTime = (id: string, newTime: number) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, timeLimit: newTime } : q));
  };

  const broadcastQuestion = (index: number) => {
    // Send a uniquely shuffled version to each student
    students.forEach(s => {
      meshService.send(s.id, {
        type: 'QUESTION',
        payload: shuffleQuestion(questions[index])
      });
    });
  };

  const simulateResponse = (studentId: string, qId: string) => {
    const isCorrect = Math.random() > 0.3;
    const newResponse: StudentResponse = {
      studentId,
      studentName: students.find(s => s.id === studentId)?.name || 'Unknown',
      questionId: qId,
      selectedOption: Math.floor(Math.random() * 4),
      timestamp: Date.now(),
      isCorrect
    };
    setResponses(prev => [...prev, newResponse]);
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return { ...s, score: s.score + (isCorrect ? 10 : 0), status: 'done' };
      }
      return s;
    }));
  };

  const currentResponses = responses.filter(r => r.questionId === questions[currentQ]?.id);
  const statsData = questions.map((q, idx) => {
    const qResponses = responses.filter(r => r.questionId === q.id);
    const correctCount = qResponses.filter(r => r.isCorrect).length;
    return {
      name: `Q${idx + 1}`,
      correct: correctCount,
      total: qResponses.length || 1,
      percentage: (correctCount / (qResponses.length || 1)) * 100
    };
  });

  const copyId = () => {
    if (peerId) {
      navigator.clipboard.writeText(peerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatElapsedTime = () => {
    if (!examStartTime) return "00:00";
    const diff = Math.floor((currentTime.getTime() - examStartTime) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeRemaining = () => {
    if (!examStartTime || questions.length === 0) return "--:--";
    const totalDuration = questions.reduce((sum, q) => sum + (q.timeLimit || 30), 0);
    const elapsed = Math.floor((currentTime.getTime() - examStartTime) / 1000);
    const remaining = Math.max(0, totalDuration - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        let importedQs: Question[] = [];
        if (file.name.endsWith('.json')) {
          importedQs = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').filter(line => line.trim());
          importedQs = lines.map((line, i) => {
            const [text, ...rest] = line.split(',');
            const timeLimit = parseInt(rest.pop()?.trim() || '30');
            const correctIndex = parseInt(rest.pop()?.trim() || '0');
            const options = rest.map(o => o.trim()).filter(o => o);
            return {
              id: `import-${Date.now()}-${i}`,
              text: text.trim(),
              options: options.slice(0, 4),
              correctIndex,
              timeLimit
            } as Question;
          });
        }

        if (importedQs.length > 0) {
          setQuestions(prev => [...prev, ...importedQs]);
          alert(`Successfully imported ${importedQs.length} questions!`);
        }
      } catch (err) {
        alert('Failed to parse file. Please check the format guide.');
        console.error(err);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  return (
    <div className="relative space-y-8 animate-in fade-in duration-500">
      <AnimatedBackground variant="instructor" intensity="subtle" />

      {/* Header Info */}
      <div className="relative z-10 flex items-center justify-between w-full bg-white/50 backdrop-blur-md p-4 rounded-[1.5rem] border border-white/50 shadow-sm">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 truncate">Exam Controller</h1>
            {status !== ExamStatus.IDLE && (
              <button
                onClick={openEndSessionModal}
                title="End Session"
                className="flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 border border-rose-100 rounded-full hover:bg-rose-100 transition-all active:scale-95 animate-in fade-in zoom-in duration-300"
              >
                <div className="relative flex items-center justify-center w-1.5 h-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1 w-1 bg-rose-600"></span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-tight text-rose-600">Live</span>
              </button>
            )}
          </div>
          <p className="text-[10px] md:text-xs text-slate-500 font-medium">Manage Mesh Session</p>
        </div>

        {/* Header Controls (Visible only when session is active and not showing card-based controls) */}
        {(status !== ExamStatus.IDLE && status !== ExamStatus.STARTING) && (
          <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-500">
            <div className="hidden sm:flex items-center gap-2 bg-white/80 p-1 rounded-xl border border-slate-100">
              <select
                className="text-[10px] font-bold bg-transparent outline-none px-2 cursor-pointer text-indigo-600"
                value={connMode}
                onChange={(e) => setConnMode(e.target.value as ConnectionMode)}
              >
                <option value={ConnectionMode.WIFI}>Wi-Fi</option>
                <option value={ConnectionMode.HOTSPOT}>Hotspot</option>
              </select>
            </div>
            {peerId && (
              <button
                onClick={copyId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-[10px] shadow-lg shadow-indigo-100"
              >
                <span className="font-mono">{peerId.slice(0, 4)}...</span>
                <Copy size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {status === ExamStatus.IDLE && (
        <div className="relative z-10 max-w-lg mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

          {/* 1. Connection & ID Section */}
          <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[1.5rem] shadow-lg border border-white/50 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 rounded-lg">
                  {connMode === ConnectionMode.WIFI ? <Wifi size={16} className="text-indigo-600" /> : <Smartphone size={16} className="text-indigo-600" />}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Mode</h3>
                  <select
                    value={connMode}
                    onChange={(e) => setConnMode(e.target.value as ConnectionMode)}
                    className="text-[10px] text-slate-500 bg-transparent outline-none cursor-pointer hover:text-indigo-600 transition-colors font-bold"
                  >
                    <option value={ConnectionMode.WIFI}>Wi-Fi / LAN</option>
                    <option value={ConnectionMode.HOTSPOT}>Personal Hotspot</option>
                  </select>
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full ${isMeshReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            </div>

            <div className="space-y-3">
              <div className="text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Mesh ID</p>
                <div className="bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200 font-mono text-lg font-black text-slate-800 break-all select-all">
                  {peerId || '...'}
                </div>
              </div>

              {/* Share Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <a
                  href={`whatsapp://send?text=Join%20my%20PeerMesh%20Exam!%20ID:%20${peerId}`}
                  className="flex flex-col items-center justify-center gap-1 p-2 bg-[#25D366]/5 hover:bg-[#25D366]/10 text-[#25D366] rounded-xl transition-colors border border-[#25D366]/10"
                >
                  <MessageCircle size={18} />
                  <span className="text-[9px] font-bold">WhatsApp</span>
                </a>
                <a
                  href={`mailto:?subject=PeerMesh Exam ID&body=Join using Mesh ID: ${peerId}`}
                  className="flex flex-col items-center justify-center gap-1 p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors border border-blue-100"
                >
                  <Mail size={18} />
                  <span className="text-[9px] font-bold">Email</span>
                </a>
                <button
                  onClick={copyId}
                  className="flex flex-col items-center justify-center gap-1 p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors border border-slate-200"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  <span className="text-[9px] font-bold">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Primary Actions / Question Setup */}
          <div className="space-y-4">
            {!setupMode ? (
              <button
                onClick={() => setSetupMode('choice')}
                className="w-full bg-white p-5 rounded-[2rem] shadow-xl border border-slate-100 hover:border-indigo-200 hover:shadow-2xl transition-all group text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
                    <FileQuestion size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Setup Questions</h3>
                    <p className="text-xs text-slate-500">Create manually or generate with AI</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
              </button>
            ) : setupMode === 'choice' ? (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <button
                  onClick={() => setSetupMode('manual')}
                  className="flex flex-col items-center gap-3 p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-indigo-600 hover:bg-indigo-50 transition-all text-slate-700 group"
                >
                  <div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-indigo-100 group-hover:text-indigo-600">
                    <Edit2 size={24} />
                  </div>
                  <span className="font-bold">Manual Setting</span>
                </button>
                <button
                  onClick={() => setSetupMode('ai')}
                  className="flex flex-col items-center gap-3 p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-indigo-600 hover:bg-indigo-50 transition-all text-slate-700 group"
                >
                  <div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-indigo-100 group-hover:text-indigo-600">
                    <Zap size={24} />
                  </div>
                  <span className="font-bold">AI Mode</span>
                </button>
              </div>
            ) : setupMode === 'ai' ? (
              <div className="animate-in fade-in slide-in-from-top-2 bg-indigo-50 p-4 rounded-3xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-widest">AI Generator</h4>
                  <button onClick={() => setSetupMode('choice')} className="text-[10px] text-indigo-400 hover:text-indigo-600 font-bold">Back</button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="Enter topic (e.g. Physics)"
                    className="w-full px-4 py-3 bg-white rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
                    onKeyDown={e => e.key === 'Enter' && handleCreateExam()}
                  />
                  <button
                    onClick={handleCreateExam}
                    disabled={loading}
                    className="absolute right-2 top-2 bottom-2 bg-indigo-600 text-white px-3 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={14} /> : 'Generate'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white/90 backdrop-blur-md p-4 rounded-[2rem] border border-slate-100 shadow-xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between px-2">
                  <h3 className="font-black text-slate-900 flex items-center gap-2">
                    <FileQuestion size={18} className="text-indigo-600" />
                    Question List
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowImportGuide(true)}
                      title="Import Guide"
                      disabled={isSetupLocked}
                      className={`p-1.5 transition-colors ${isSetupLocked ? 'opacity-30 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600'}`}
                    >
                      <HelpCircle size={16} />
                    </button>
                    <label className={`p-1.5 bg-indigo-50 text-indigo-600 rounded-lg transition-colors shadow-sm ${isSetupLocked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-indigo-100 cursor-pointer'}`}>
                      <Upload size={16} />
                      <input type="file" accept=".json,.csv" className="hidden" onChange={handleImportFile} disabled={isSetupLocked} />
                    </label>
                    <button
                      onClick={() => openEditor(null)}
                      disabled={isSetupLocked}
                      className={`p-1.5 bg-indigo-600 text-white rounded-lg transition-colors shadow-lg shadow-indigo-100 ${isSetupLocked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {questions.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 italic text-sm">
                      No questions added yet.
                    </div>
                  ) : (
                    questions.map((q, idx) => (
                      <div key={q.id} className="group bg-slate-50 p-3 rounded-xl border border-slate-100 hover:border-indigo-100 transition-all">
                        <div className="flex justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 line-clamp-2">{q.text}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-1">
                                <Clock size={10} /> {q.timeLimit}s
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">{q.options.length} options</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditor(idx)} className="p-1.5 bg-white text-slate-600 rounded-lg hover:text-indigo-600 border border-slate-200 shadow-sm"><Edit2 size={12} /></button>
                            <button onClick={() => deleteQuestion(idx)} className="p-1.5 bg-white text-rose-500 rounded-lg hover:bg-rose-50 border border-rose-100 shadow-sm"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setIsSetupLocked(false);
                      setSetupMode('choice');
                    }}
                    className="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-2xl font-bold text-xs"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setIsSetupLocked(!isSetupLocked)}
                    disabled={questions.length === 0}
                    className={`flex-[2] py-3 rounded-2xl font-extrabold text-xs shadow-lg transition-all ${isSetupLocked
                      ? 'bg-amber-100 text-amber-700 shadow-amber-50'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-100'
                      } disabled:opacity-50`}
                  >
                    {isSetupLocked ? 'Unlock Setup' : 'Lock & Finalize'}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setStatus(ExamStatus.STARTING)}
              disabled={!isSetupLocked}
              className={`w-full p-5 rounded-[2rem] shadow-xl transition-all text-left flex items-center justify-between animate-in fade-in slide-in-from-bottom-4 ${isSetupLocked
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-1'
                : 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'
                }`}
            >
              <div className="flex items-center gap-4">
                <div className="relative p-3 bg-black/5 rounded-2xl">
                  <Play size={24} fill="currentColor" className={isSetupLocked ? 'text-white' : 'text-slate-300'} />
                  {students.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-5 w-5 bg-white text-emerald-600 text-[10px] items-center justify-center font-black">
                        {students.length}
                      </span>
                    </span>
                  )}
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${isSetupLocked ? 'text-white' : 'text-slate-400'}`}>Start Exam Now</h3>
                  <p className={`text-xs font-medium ${isSetupLocked ? 'text-emerald-100 opacity-90' : 'text-slate-400'}`}>
                    {!isSetupLocked ? 'Step 1: Lock questions first' : students.length === 0 ? 'Ready: Students can join the waiting room' : 'Ready: Click to enter waiting room'}
                  </p>
                </div>
              </div>
              <ChevronRight size={20} className={isSetupLocked ? 'text-emerald-200' : 'text-slate-300'} />
            </button>

            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                Real-time Student Mesh Active
              </p>
            </div>
          </div>

        </div>
      )}

      {status !== ExamStatus.IDLE && (
        <div className="relative z-10 grid lg:grid-cols-3 gap-8">

          {/* Main Controller Area */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-4 md:p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                  Question {currentQ + 1} of {questions.length}
                </span>
                {status === ExamStatus.ACTIVE && (
                  <div className="flex items-center gap-4">
                    <button className="p-2 text-slate-400 hover:text-indigo-600"><Pause size={20} /></button>
                    <button
                      onClick={nextQuestion}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Next <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>

              {status === ExamStatus.STARTING && (
                <div className="text-center py-4 space-y-12 animate-in fade-in zoom-in duration-500">
                  {/* Tiny minimalist ID headern */}
                  <div className="inline-flex items-center gap-4 bg-white/40 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-200/50 shadow-sm mx-auto">
                    <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
                      <span className="text-[9px] font-black text-slate-400 ppercase tracking-tighter">MESH ID</span>
                      <span className="font-mono text-xs font-black text-indigo-600 tracking-tighter">{peerId}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={`whatsapp://send?text=Join%20my%20PeerMesh%20Exam!%20ID:%20${peerId}`} className="p-1 text-[#25D366] hover:bg-[#25D366]/10 rounded-md transition-colors">
                        <MessageCircle size={14} />
                      </a>
                      <a href={`mailto:?subject=PeerMesh Exam ID&body=Join using Mesh ID: ${peerId}`} className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition-colors">
                        <Mail size={14} />
                      </a>
                      <button onClick={copyId} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="relative w-40 h-40 mx-auto">
                      <div className="absolute inset-0 border-2 border-indigo-200 rounded-full animate-ping opacity-20"></div>
                      <div className="absolute inset-8 border-2 border-indigo-300 rounded-full animate-ping delay-150 opacity-10"></div>
                      <div className="relative z-10 w-full h-full bg-gradient-to-br from-indigo-50 to-white rounded-full flex items-center justify-center border border-indigo-100 shadow-inner">
                        <Users size={56} className="text-indigo-600 opacity-90" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Awaiting students...</h2>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">{questions.length} Questions Loaded & Locked</p>
                    </div>
                  </div>

                  {/* 2. Start Action */}
                  <div className="max-w-lg mx-auto space-y-3">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 rounded-full">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Connected Students</span>
                      <div className="flex items-center gap-1.5">
                        <Users size={14} className="text-indigo-600" />
                        <span className="text-sm font-black text-slate-900">{students.length}</span>
                      </div>
                    </div>

                    <button
                      onClick={startExam}
                      className="w-full relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white p-5 rounded-[1.5rem] shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                      <div className="relative z-10 flex items-center justify-center gap-2">
                        <Play size={24} fill="currentColor" />
                        <div className="text-left">
                          <span className="block text-xl font-black tracking-tight">Begin Session</span>
                          <span className="block text-[9px] text-indigo-100 opacity-80 uppercase tracking-widest font-bold">
                            {isAutomated ? 'Automated Flow' : 'Manual Control'}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Advanced Session Options Toggle */}
                  <div className="max-w-md mx-auto">
                    <details className="group">
                      <summary className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 cursor-pointer hover:text-indigo-600 transition-colors list-none">
                        <Settings size={12} /> Advanced Options <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="mt-2 bg-white/50 border border-slate-100 p-3 rounded-xl shadow-sm text-left animate-in slide-in-from-top-1">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setIsAutomated(!isAutomated)}
                            className={`p-2 rounded-lg border text-[9px] font-bold transition-all ${isAutomated ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                          >
                            Timer: {isAutomated ? 'ON' : 'OFF'}
                          </button>
                          <button
                            onClick={() => setIsRandomizedSequence(!isRandomizedSequence)}
                            className={`p-2 rounded-lg border text-[9px] font-bold transition-all ${isRandomizedSequence ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                          >
                            Random: {isRandomizedSequence ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>

                </div>
              )}

              {status === ExamStatus.ACTIVE && (
                <div className="space-y-6 animate-in fade-in duration-700">
                  {/* Persistent tiny header during exam too */}
                  <div className="flex items-center justify-between px-6 py-2 bg-slate-50/50 rounded-xl border border-slate-100/50 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black text-slate-400 ppercase tracking-tighter">MESH</span>
                      <span className="font-mono text-[10px] font-black text-indigo-600">{peerId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={copyId} className="p-1 text-slate-400 hover:text-indigo-600">
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* High-Info Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Local Time</span>
                      <div className="flex items-center gap-2 text-indigo-600">
                        <Clock size={16} />
                        <span className="text-xl font-black font-mono">
                          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Elapsed Time</span>
                      <div className="flex items-center gap-2 text-slate-900">
                        <RefreshCw size={16} className="animate-spin-slow" />
                        <span className="text-xl font-black font-mono">{formatElapsedTime()}</span>
                      </div>
                    </div>

                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Live Students</span>
                      <div className="flex items-center gap-2 text-emerald-700">
                        <Users size={16} />
                        <span className="text-lg font-black">{students.filter(s => s.status === 'live').length}</span>
                      </div>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Time Remaining</span>
                      <div className="flex items-center gap-2 text-amber-700">
                        <Clock size={16} />
                        <span className="text-lg font-black font-mono">{formatTimeRemaining()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator Tabs */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className={`flex-1 flex items-center justify-between px-5 py-3 rounded-2xl border transition-all ${isAutomated ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isAutomated ? 'bg-white/20' : 'bg-slate-200'}`}>
                          <Zap size={16} />
                        </div>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${isAutomated ? 'opacity-80' : 'text-slate-400'}`}>Automation</p>
                          <p className="text-xs font-bold">{isAutomated ? 'Auto Mode ON' : 'Manual Push'}</p>
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${isAutomated ? 'bg-white animate-pulse' : 'bg-slate-300'}`} />
                    </div>

                    <div className={`flex-1 flex items-center justify-between px-5 py-3 rounded-2xl border transition-all ${isRandomizedSequence ? 'bg-violet-600 border-violet-700 text-white shadow-lg shadow-violet-100' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isRandomizedSequence ? 'bg-white/20' : 'bg-slate-200'}`}>
                          <Shuffle size={16} />
                        </div>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${isRandomizedSequence ? 'opacity-80' : 'text-slate-400'}`}>Sequence</p>
                          <p className="text-xs font-bold">{isRandomizedSequence ? 'Randomized' : 'Sequential'}</p>
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${isRandomizedSequence ? 'bg-white' : 'bg-slate-300'}`} />
                    </div>
                  </div>

                  {/* Dynamic View based on Automation */}
                  <div className="mt-8">
                    {isAutomated ? (
                      <div className="text-center py-12 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                        <div className="relative w-24 h-24 mx-auto">
                          <div className="absolute inset-0 bg-indigo-400 rounded-full animate-ping opacity-10"></div>
                          <div className="relative z-10 w-full h-full bg-indigo-50 rounded-full flex items-center justify-center border-2 border-indigo-100">
                            <RefreshCw size={40} className="text-indigo-600 animate-spin-slow" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h2 className="text-2xl font-black text-slate-900 tracking-tight">System Pushing Mesh</h2>
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-4 py-1.5 rounded-full inline-block">Question {currentQ + 1} of {questions.length}</p>
                          <p className="text-xs text-slate-500 max-w-[300px] mx-auto leading-relaxed mt-4">The mesh system is delivering questions individually. Watch live student terminal progress in the roster.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                          <div>
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">Manual Track Controller</span>
                            <h3 className="text-2xl font-black text-slate-900 mt-2">Current Question</h3>
                          </div>
                          <button
                            onClick={nextQuestion}
                            className="group flex items-center gap-3 bg-indigo-600 text-white px-8 py-4 rounded-2xl hover:bg-indigo-700 transition-all font-black shadow-xl shadow-indigo-100"
                          >
                            Broadcast Next <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                          </button>
                        </div>

                        {questions[currentQ] && (
                          <div className="space-y-6">
                            <h3 className="text-xl font-bold text-slate-800 leading-tight">{questions[currentQ].text}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {questions[currentQ].options.map((opt, idx) => (
                                <div
                                  key={idx}
                                  className={`p-5 rounded-2xl border-2 flex items-center justify-between transition-all ${idx === questions[currentQ].correctIndex
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : 'border-slate-50 bg-slate-50 text-slate-400'
                                    }`}
                                >
                                  <span className="font-bold">{opt}</span>
                                  {idx === questions[currentQ].correctIndex && (
                                    <div className="p-1 bg-emerald-500 text-white rounded-full">
                                      <Check size={12} />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {status === ExamStatus.COMPLETED && (
                <div className="text-center py-12 space-y-8 animate-in fade-in zoom-in duration-700">
                  <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-100/50">
                    <CheckCircle2 size={48} className="text-green-600" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black text-slate-900">Exam Concluded!</h2>
                    <p className="text-slate-500">All questions have been delivered. What would you like to do next?</p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto">
                    <button
                      onClick={() => publishResults(true)}
                      className="group flex flex-col items-center gap-3 p-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2rem] transition-all shadow-xl shadow-indigo-100"
                    >
                      <Zap size={24} className="group-hover:scale-110 transition-transform" />
                      <div>
                        <p className="font-bold">Publish Instantly</p>
                        <p className="text-[10px] text-indigo-100 uppercase font-black">Students see scores now</p>
                      </div>
                    </button>

                    <button
                      onClick={() => publishResults(false)}
                      className="group flex flex-col items-center gap-3 p-6 bg-white border-2 border-slate-100 hover:border-indigo-200 text-slate-700 rounded-[2rem] transition-all"
                    >
                      <Clock size={24} className="text-indigo-600 group-hover:scale-110 transition-transform" />
                      <div>
                        <p className="font-bold">Hold Results</p>
                        <p className="text-[10px] text-slate-400 uppercase font-black">"Waiting" msg to students</p>
                      </div>
                    </button>
                  </div>

                  <button
                    onClick={resetSession}
                    className="mt-4 px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform"
                  >
                    Start New Exam
                  </button>
                </div>
              )}
            </div>

            {/* Live Analytics Heatmap */}
            <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm md:text-lg font-bold flex items-center gap-2">
                  <BarChart3 size={18} className="text-indigo-600 md:w-5 md:h-5" />
                  Performance Heatmap
                </h3>
              </div>
              <div className="h-48 md:h-64 w-full text-[10px] md:text-xs min-h-[192px]">
                {statsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <BarChart data={statsData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="percentage" name="Correct %" radius={[10, 10, 0, 0]}>
                        {statsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.percentage < 50 ? '#f43f5e' : entry.percentage < 80 ? '#fbbf24' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                    <BarChart3 size={32} className="opacity-20" />
                    <p className="font-medium">No results data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Student Roster Sidebar */}
          <div className="lg:col-span-1 relative z-10">
            <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-lg border border-slate-100 sticky top-4">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900">Connected</h2>
                  <p className="text-xs text-slate-500 font-mono">{students.length}/{students.length} Online</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <Users size={16} className="text-emerald-600" />
                  <span className="font-black text-lg text-emerald-700">{students.length}</span>
                </div>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 pr-2">
                {students.map(s => {
                  const studentResponses = responses.filter(r => r.studentId === s.id);
                  const correctAnswers = studentResponses.filter(r => r.isCorrect).length;
                  const accuracy = studentResponses.length > 0
                    ? Math.round((correctAnswers / studentResponses.length) * 100)
                    : 0;

                  return (
                    <div
                      key={s.id}
                      className={`group p-3 md:p-4 rounded-2xl border-2 transition-all duration-300 hover:shadow-md ${s.status === 'live'
                        ? 'border-indigo-100 bg-gradient-to-br from-indigo-50 to-white'
                        : s.status === 'done'
                          ? 'border-emerald-100 bg-emerald-50/50'
                          : 'border-slate-100 bg-slate-50'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center font-black text-white uppercase flex-shrink-0 ${s.status === 'live'
                          ? 'bg-indigo-600'
                          : s.status === 'done'
                            ? 'bg-emerald-600'
                            : 'bg-slate-300'
                          }`}>
                          {s.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm md:text-base font-bold text-slate-900 truncate" title={s.name}>{s.name}</p>
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex-shrink-0 ${s.status === 'live'
                              ? 'bg-indigo-600 text-white'
                              : s.status === 'done'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-600'
                              }`}>
                              {s.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2 gap-2">
                            <div className="flex items-center gap-2">
                              <BarChart3 size={12} className="text-slate-400 flex-shrink-0" />
                              <span className="text-xs font-mono font-bold text-slate-600">{s.score}pts</span>
                            </div>
                            {studentResponses.length > 0 && (
                              <div className="text-xs text-slate-500 font-medium">
                                {accuracy}% <span className="text-[10px]">acc</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {students.length === 0 && (
                  <div className="text-center py-8 md:py-12 text-slate-400">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No students connected</p>
                    <p className="text-xs mt-1">Share Mesh ID to invite</p>
                  </div>
                )}
              </div>

              {connMode === ConnectionMode.PANIC && (
                <div className="mt-8 p-4 bg-orange-50 border border-orange-200 rounded-2xl text-center space-y-4">
                  <p className="text-xs font-bold text-orange-800 uppercase">Panic Mode Active</p>
                  <div className="bg-white p-3 rounded-xl mx-auto inline-block border-2 border-slate-100">
                    <QrCode size={120} className="text-slate-800" />
                  </div>
                  <p className="text-[10px] text-orange-700 leading-tight">Students scan this QR to receive Question {currentQ + 1} directly if network fails.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Question Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 md:p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowEditor(false)} />

          <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-8 duration-500">
            <div className="bg-indigo-600 p-4 md:p-6 text-white flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <div className="p-2 bg-white/20 rounded-xl flex-shrink-0">
                  {editingQIndex !== null ? <Edit2 size={18} className="md:w-5 md:h-5" /> : <Plus size={18} className="md:w-5 md:h-5" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-xl font-black truncate">{editingQIndex !== null ? 'Edit Question' : 'New Question'}</h2>
                  <p className="text-[10px] md:text-xs text-indigo-100 opacity-80 uppercase tracking-widest font-bold">Manual Draft</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditor(false)}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors flex-shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 md:p-8 space-y-4 md:space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]  scrollbar-thin scrollbar-thumb-slate-200">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Question Text</label>
                <textarea
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-lg font-bold min-h-[100px]"
                  placeholder="Enter your question here..."
                  value={editForm.text}
                  onChange={e => setEditForm(prev => ({ ...prev, text: e.target.value }))}
                />
              </div>

              <div className="grid gap-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Answer Options</label>
                {editForm.options?.map((opt, idx) => (
                  <div key={idx} className="flex gap-3">
                    <button
                      onClick={() => setEditForm(prev => ({ ...prev, correctIndex: idx }))}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-black transition-all border-2 ${editForm.correctIndex === idx
                        ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-100'
                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-emerald-200'
                        }`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </button>
                    <input
                      type="text"
                      className={`flex-1 px-5 py-3 rounded-xl border-2 transition-all outline-none font-medium ${editForm.correctIndex === idx ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100 bg-slate-50 focus:border-indigo-200'
                        }`}
                      placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                      value={opt}
                      onChange={e => {
                        const newOpts = [...(editForm.options || [])];
                        newOpts[idx] = e.target.value;
                        setEditForm(prev => ({ ...prev, options: newOpts }));
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Time Limit</label>
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                      <Clock size={16} className="text-slate-400" />
                      <input
                        type="number"
                        className="w-12 bg-transparent font-black text-indigo-600 outline-none"
                        value={editForm.timeLimit}
                        onChange={e => setEditForm(prev => ({ ...prev, timeLimit: parseInt(e.target.value) }))}
                      />
                      <span className="text-xs font-bold text-slate-400 uppercase">Sec</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={saveQuestion}
                  className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-1 transition-all flex items-center gap-2"
                >
                  <Save size={20} />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Guide Modal */}
      {showImportGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <button
                onClick={() => setShowImportGuide(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                title="Close Guide"
              >
                <X size={24} className="text-slate-400" />
              </button>
            </div>

            <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <FileQuestion size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Import Format Guide</h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">JSON & CSV Template</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              <section className="space-y-2">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                  CSV Format Instructions
                </h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-[10px] space-y-1">
                  <p className="text-indigo-600 font-bold">Question, Opt1, Opt2, Opt3, Opt4, CorrectIdx, Time</p>
                  <p className="text-slate-500 italic border-t border-slate-200 pt-1 mt-1">Example Line:</p>
                  <p className="text-slate-800">What is PeerMesh?,A browser,P2P App,Game,OS,1,30</p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-purple-600 rounded-full" />
                  JSON Sample Format
                </h3>
                <div className="bg-slate-900 p-4 rounded-xl font-mono text-[10px] text-indigo-300 overflow-x-auto">
                  <pre>{JSON.stringify([{
                    text: "Question Sample",
                    options: ["A", "B", "C", "D"],
                    correctIndex: 0,
                    timeLimit: 30
                  }], null, 2)}</pre>
                </div>
              </section>

              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-xs text-emerald-700 font-medium">
                  💡 **Pro Tip**: Use 0-3 for index (0=first option). Time is in seconds.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowImportGuide(false)}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* End Session Confirmation Modal */}
      {showEndSessionModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowEndSessionModal(false)} />
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-8 duration-500">
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur">
                  <XCircle size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white">End Session?</h2>
                  <p className="text-xs text-rose-100 opacity-90 uppercase tracking-widest font-bold">Session Termination</p>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <p className="text-slate-600 font-medium">
                  Are you sure you want to end this session? This will disconnect all {students.length} students.
                </p>
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl">
                  <p className="text-xs text-rose-800 font-bold">⚠️ Warning: All current exam progress will be cleared.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowEndSessionModal(false)}
                  className="py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmEndSession}
                  className="py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-rose-200 transition-all active:scale-95"
                >
                  End Session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstructorDashboard;

