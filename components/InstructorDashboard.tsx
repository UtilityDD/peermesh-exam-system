
import React, { useState, useEffect, useRef } from 'react';
import { generateQuestions } from '../services/gemini';
import { meshService, MeshMessage } from '../services/mesh';
import { Question, ExamStatus, ConnectionMode, Student, StudentResponse } from '../types';
import AnimatedBackground from './AnimatedBackground';
import {
  Plus, Play, Pause, ChevronRight, Users,
  BarChart3, Settings, Wifi, Bluetooth, Zap,
  QrCode, Loader2, CheckCircle2, XCircle, Copy, Clock,
  Edit2, Trash2, Save, X, RefreshCw, Signal
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

  const [editingQIndex, setEditingQIndex] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
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
    setStatus(ExamStatus.STARTING);
    setLoading(false);
  };

  const useManualQuestions = () => {
    setQuestions(DEFAULT_QUESTIONS);
    setStatus(ExamStatus.STARTING);
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
    if (peerId) navigator.clipboard.writeText(peerId);
  };

  return (
    <div className="relative space-y-8 animate-in fade-in duration-500">
      <AnimatedBackground variant="instructor" intensity="subtle" />

      {/* Header Info */}
      <div className="relative z-10 flex flex-col gap-4 w-full">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Exam Controller</h1>
            <p className="text-sm md:text-base text-slate-500">Manage your active mesh session</p>
          </div>
          {status !== ExamStatus.IDLE && (
            <button
              onClick={openEndSessionModal}
              title="End Session"
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-full transition-all shadow-sm active:scale-95 flex-shrink-0"
            >
              <div className="relative flex items-center justify-center w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-600"></span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600">Live</span>
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex-shrink-0">
            <div className="flex items-center gap-2 px-2 md:px-3 py-1.5 bg-blue-50 text-blue-900 rounded-xl text-xs md:text-sm font-semibold">
              <div className="w-2 h-2 bg-blue-800 rounded-full animate-pulse flex-shrink-0" />
              <span className="hidden sm:inline">{connMode}</span>
            </div>
            <select
              className="text-xs md:text-sm bg-transparent outline-none pr-1 max-w-[120px]"
              value={connMode}
              onChange={(e) => setConnMode(e.target.value as ConnectionMode)}
            >
              {Object.values(ConnectionMode).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {peerId && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                onClick={refreshMesh}
                title="Restart Mesh"
                className="p-2 text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg transition-colors flex-shrink-0"
              >
                <RefreshCw size={14} className={signalStatus === 'offline' ? 'animate-spin text-rose-500' : ''} />
              </button>
              <button
                onClick={copyId}
                className="flex items-center gap-2 px-2 md:px-3 py-1 text-xs font-mono bg-blue-50 text-blue-900 rounded-lg hover:bg-blue-100 border border-blue-100 flex-1 min-w-0 overflow-hidden"
                title={peerId}
              >
                <span className="truncate">ID: {peerId}</span>
                <Copy size={12} className="flex-shrink-0" />
              </button>
            </div>
          )}
        </div>
      </div>

      {status === ExamStatus.IDLE && (
        <div className="relative z-10 max-w-2xl mx-auto bg-white/95 backdrop-blur-xl p-10 rounded-[2rem] shadow-2xl border border-slate-100 text-center space-y-6">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <Plus size={40} className="text-blue-800" />
          </div>
          <h2 className="text-2xl font-bold">New Mesh Exam</h2>
          <p className="text-slate-500">Enter a topic and let AI prepare your question bank instantly.</p>
          <div className="relative">
            <input
              type="text"
              placeholder="e.g. Modern Physics, React Hooks, World History..."
              className="w-full pl-6 pr-32 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button
              onClick={handleCreateExam}
              disabled={loading || !topic}
              className="absolute right-2 top-2 bottom-2 bg-blue-800 text-white px-6 rounded-xl font-semibold hover:bg-blue-900 disabled:opacity-50 transition-colors flex items-center gap-2 shadow"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
              Generate
            </button>
          </div>
          <div className="pt-2">
            <button
              onClick={useManualQuestions}
              className="text-sm text-blue-800 font-medium hover:underline flex items-center gap-1 mx-auto"
            >
              <Zap size={14} /> Skip AI and use Manual Test Questions
            </button>
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
                <div className="text-center py-6 space-y-8 animate-in fade-in zoom-in duration-500">
                  <div className="space-y-2 px-2">
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900">Waiting for Students...</h2>
                    <p className="text-sm md:text-base text-slate-500">Share the Mesh ID below with your students to join.</p>
                  </div>

                  <div className="flex flex-col items-center gap-4 px-2 w-full">
                    <div className="w-full max-w-full md:max-w-sm bg-indigo-50 border-2 border-dashed border-indigo-200 p-4 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] relative group mx-auto">
                      <p className="text-[10px] md:text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Your Mesh ID</p>
                      <div className="text-xl md:text-4xl font-mono font-black text-indigo-600 tracking-tighter col-span-full break-all leading-tight">
                        {peerId || 'Initializing...'}
                      </div>
                      <button
                        onClick={copyId}
                        className="absolute -right-2 -top-2 md:-right-4 md:-top-4 bg-white shadow-lg border border-slate-100 p-2 md:p-3 rounded-xl md:rounded-2xl text-indigo-600 hover:scale-110 transition-transform"
                      >
                        <Copy size={20} className="md:w-6 md:h-6" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-2xl mx-auto px-2">
                    <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 text-center">
                      <Users className="text-indigo-600 mx-auto mb-2 w-5 h-5 md:w-6 md:h-6" />
                      <p className="text-lg md:text-xl font-bold">{students.length}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Connected</p>
                    </div>
                    <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 text-center">
                      <Wifi className="text-emerald-600 mx-auto mb-2 w-5 h-5 md:w-6 md:h-6" />
                      <p className="text-lg md:text-xl font-bold">Stable</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Mesh Link</p>
                    </div>
                    <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 text-center col-span-2 md:col-span-1">
                      <QrCode className="text-orange-600 mx-auto mb-2 w-5 h-5 md:w-6 md:h-6" />
                      <p className="text-lg md:text-xl font-bold">{questions.length}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Question Bank</p>
                    </div>
                  </div>

                  {/* Advanced Session Options */}
                  <div className="max-w-2xl mx-auto px-2">
                    <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm space-y-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest text-left ml-2">Advanced Session Config</h3>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <button
                          onClick={() => setIsAutomated(!isAutomated)}
                          className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${isAutomated ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isAutomated ? 'bg-indigo-600 text-white' : 'bg-slate-200'}`}>
                              <Clock size={16} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold">Automated Mode</p>
                              <p className="text-[10px] opacity-70">Timed Transitions</p>
                            </div>
                          </div>
                          <div className={`w-10 h-6 rounded-full relative transition-colors ${isAutomated ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isAutomated ? 'translate-x-5' : 'translate-x-1'}`} />
                          </div>
                        </button>

                        <button
                          onClick={() => setIsRandomizedSequence(!isRandomizedSequence)}
                          className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${isRandomizedSequence ? 'border-violet-600 bg-violet-50 shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isRandomizedSequence ? 'bg-violet-600 text-white' : 'bg-slate-200'}`}>
                              <Zap size={16} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold">Random Sequence</p>
                              <p className="text-[10px] opacity-70">Per-Student Order</p>
                            </div>
                          </div>
                          <div className={`w-10 h-6 rounded-full relative transition-colors ${isRandomizedSequence ? 'bg-violet-600' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isRandomizedSequence ? 'translate-x-5' : 'translate-x-1'}`} />
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 text-left max-w-2xl mx-auto border-t border-slate-100 pt-8 px-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Question Preview & Timing</h3>
                      <button
                        onClick={() => openEditor(null)}
                        className="text-[10px] font-black uppercase text-indigo-600 border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-50 flex items-center gap-1.6"
                      >
                        <Plus size={12} /> New Question
                      </button>
                    </div>
                    <div className="space-y-2">
                      {questions.map((q, idx) => (
                        <div key={q.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 gap-3">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase">Question {idx + 1}</p>
                            <p className="text-sm font-medium text-slate-700 truncate">{q.text}</p>
                          </div>
                          <div className="flex items-center self-end sm:self-auto gap-3">
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg md:rounded-xl border border-slate-200">
                              <Clock size={12} className="text-slate-400" />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateQuestionTime(q.id, Math.max(10, (q.timeLimit || 30) - 10))}
                                  className="text-indigo-600 hover:bg-indigo-50 w-6 h-6 rounded flex items-center justify-center font-bold"
                                >
                                  -
                                </button>
                                <span className="text-sm font-bold w-8 text-center">{q.timeLimit || 30}s</span>
                                <button
                                  onClick={() => updateQuestionTime(q.id, (q.timeLimit || 30) + 10)}
                                  className="text-indigo-600 hover:bg-indigo-50 w-6 h-6 rounded flex items-center justify-center font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditor(idx)}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => deleteQuestion(idx)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-2">
                    <button
                      onClick={startExam}
                      disabled={students.length === 0}
                      className="w-full max-w-md mx-auto flex items-center justify-center gap-3 bg-green-600 text-white px-6 py-4 md:px-8 md:py-5 rounded-2xl md:rounded-[2rem] hover:bg-green-700 transition-all font-black text-lg md:text-xl shadow-xl shadow-green-200 disabled:opacity-50 disabled:grayscale"
                    >
                      <Play size={24} className="md:w-7 md:h-7" fill="currentColor" /> Start Exam Now
                    </button>
                  </div>

                  {students.length === 0 && (
                    <p className="text-sm text-rose-500 font-bold animate-pulse">
                      At least one student must be connected to start.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                    {isAutomated ? 'Automated Pulse Active' : `Question ${currentQ + 1} of ${questions.length}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {isAutomated && (
                      <span className="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg animate-pulse">
                        Auto
                      </span>
                    )}
                    {isRandomizedSequence && (
                      <span className="bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">
                        Random
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {status === ExamStatus.ACTIVE && (isAutomated ? (
                <div className="text-center py-12 space-y-6">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto border-4 border-indigo-100">
                    <Clock className="text-indigo-600 animate-spin-slow" size={32} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900 uppercase">Automation Engaged</h2>
                    <p className="text-slate-500 max-w-sm mx-auto">The mesh is handling individual deliveries. Track student terminal progress in the sidebar.</p>
                  </div>
                </div>
              ) : questions[currentQ] && (
                <div className="space-y-4 md:space-y-6">
                  <h3 className="text-lg md:text-2xl font-bold leading-tight">{questions[currentQ].text}</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {questions[currentQ].options.map((opt, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border-2 flex items-center justify-between ${idx === questions[currentQ].correctIndex
                          ? 'border-green-200 bg-green-50'
                          : 'border-slate-100 bg-slate-50'
                          }`}
                      >
                        <span className="font-medium text-slate-700">{opt}</span>
                        {idx === questions[currentQ].correctIndex && <CheckCircle2 className="text-green-600" size={20} />}
                      </div>
                    ))}
                  </div>

                  {/* Instant Actions */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-100">
                    <button
                      onClick={() => openEditor(currentQ)}
                      className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-all active:scale-95"
                    >
                      <Edit2 size={16} /> Edit Current Question
                    </button>
                    <button
                      onClick={() => openEditor(null)}
                      className="flex-1 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 py-3 rounded-xl font-bold transition-all border border-indigo-100 active:scale-95"
                    >
                      <Plus size={16} /> Add Instant Question
                    </button>
                  </div>
                </div>
              ))}

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
              <div className="h-48 md:h-64 w-full text-[10px] md:text-xs">
                <ResponsiveContainer width="100%" height="100%">
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

      {/* End Session Confirmation Modal */}
      {showEndSessionModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowEndSessionModal(false)} />

          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-8 duration-500">
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur">
                  <XCircle size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-black">End Session?</h2>
                  <p className="text-xs text-rose-100 opacity-90 uppercase tracking-widest font-bold">Active Session Termination</p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              <div className="space-y-3">
                <p className="text-slate-700 font-medium leading-relaxed">
                  Are you sure you want to end this session?
                </p>
                <div className="bg-rose-50 border-2 border-rose-100 rounded-2xl p-4">
                  <p className="text-sm text-rose-800 font-bold flex items-start gap-2">
                    <span className="text-rose-500 text-lg">⚠️</span>
                    <span>All {students.length} connected student{students.length !== 1 ? 's' : ''} will be disconnected immediately.</span>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndSessionModal(false)}
                  className="flex-1 px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmEndSession();
                    setShowEndSessionModal(false);
                  }}
                  className="flex-1 px-6 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-rose-200 active:scale-95"
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

