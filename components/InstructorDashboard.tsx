
import React, { useState, useEffect, useRef } from 'react';
import { generateQuestions } from '../services/gemini';
import { meshService, MeshMessage } from '../services/mesh';
import { Question, ExamStatus, ConnectionMode, Student, StudentResponse } from '../types';
import {
  Plus, Play, Pause, ChevronRight, Users,
  BarChart3, Settings, Wifi, Bluetooth, Zap,
  QrCode, Loader2, CheckCircle2, XCircle, Copy, Clock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const InstructorDashboard: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [status, setStatus] = useState<ExamStatus>(ExamStatus.IDLE);
  const [currentQ, setCurrentQ] = useState(0);
  const [connMode, setConnMode] = useState<ConnectionMode>(ConnectionMode.WIFI);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [isRestored, setIsRestored] = useState(false);

  const questionsRef = useRef<Question[]>([]);
  const currentQRef = useRef(0);
  const statusRef = useRef<ExamStatus>(ExamStatus.IDLE);

  useEffect(() => {
    questionsRef.current = questions;
    currentQRef.current = currentQ;
    statusRef.current = status;
  }, [questions, currentQ, status]);

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

          // If exam is already active, send the current question to this specific student
          if (statusRef.current === ExamStatus.ACTIVE && questionsRef.current[currentQRef.current]) {
            console.log('Sending current question to new student:', senderId);
            meshService.send(senderId, {
              type: 'QUESTION',
              payload: questionsRef.current[currentQRef.current]
            });
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

  const startExam = () => {
    setStatus(ExamStatus.ACTIVE);
    setCurrentQ(0);
    broadcastQuestion(0);
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

  const resetSession = () => {
    if (confirm('Are you sure you want to end this session? All student devices will be disconnected.')) {
      const endTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meshService.broadcast({ type: 'SESSION_ENDED', payload: { endTime } });
      // Small timeout to ensure PeerJS sends the message before the page reloads
      setTimeout(() => {
        localStorage.removeItem('PEERMESH_SESSION');
        window.location.reload();
      }, 500);
    }
  };

  const updateQuestionTime = (id: string, newTime: number) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, timeLimit: newTime } : q));
  };

  const broadcastQuestion = (index: number) => {
    meshService.broadcast({
      type: 'QUESTION',
      payload: questions[index]
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
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Exam Controller</h1>
            <p className="text-slate-500">Manage your active mesh session</p>
          </div>
          {status !== ExamStatus.IDLE && (
            <button
              onClick={resetSession}
              className="mt-1 text-xs bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 border border-slate-200"
            >
              <XCircle size={14} /> Clear Session
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-semibold">
              <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
              {connMode}
            </div>
            <select
              className="text-sm bg-transparent outline-none pr-2"
              value={connMode}
              onChange={(e) => setConnMode(e.target.value as ConnectionMode)}
            >
              {Object.values(ConnectionMode).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {peerId && (
            <button
              onClick={copyId}
              className="flex items-center gap-2 px-3 py-1 text-xs font-mono bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
            >
              ID: {peerId} <Copy size={12} />
            </button>
          )}
        </div>
      </div>

      {status === ExamStatus.IDLE && (
        <div className="max-w-2xl mx-auto bg-white p-10 rounded-[2rem] shadow-xl border border-slate-100 text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
            <Plus size={40} className="text-indigo-600" />
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
              className="absolute right-2 top-2 bottom-2 bg-indigo-600 text-white px-6 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
              Generate
            </button>
          </div>
          <div className="pt-2">
            <button
              onClick={useManualQuestions}
              className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1 mx-auto"
            >
              <Zap size={14} /> Skip AI and use Manual Test Questions
            </button>
          </div>
        </div>
      )}

      {status !== ExamStatus.IDLE && (
        <div className="grid lg:grid-cols-3 gap-8">

          {/* Main Controller Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
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
                  <div className="space-y-2">
                    <h2 className="text-3xl font-black text-slate-900">Waiting for Students...</h2>
                    <p className="text-slate-500">Share the Mesh ID below with your students to let them join the session.</p>
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-indigo-50 border-2 border-dashed border-indigo-200 p-8 rounded-[2.5rem] relative group">
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Your Mesh ID</p>
                      <div className="text-4xl font-mono font-black text-indigo-600 tracking-tighter">
                        {peerId || 'Initializing...'}
                      </div>
                      <button
                        onClick={copyId}
                        className="absolute -right-4 -top-4 bg-white shadow-lg border border-slate-100 p-3 rounded-2xl text-indigo-600 hover:scale-110 transition-transform"
                      >
                        <Copy size={24} />
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <Users className="text-indigo-600 mx-auto mb-2" size={24} />
                      <p className="text-xl font-bold">{students.length}</p>
                      <p className="text-xs text-slate-500 uppercase font-bold">Connected</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <Wifi className="text-emerald-600 mx-auto mb-2" size={24} />
                      <p className="text-xl font-bold">Stable</p>
                      <p className="text-xs text-slate-500 uppercase font-bold">Mesh Link</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <QrCode className="text-orange-600 mx-auto mb-2" size={24} />
                      <p className="text-xl font-bold">{questions.length}</p>
                      <p className="text-xs text-slate-500 uppercase font-bold">Question Bank</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-left max-w-2xl mx-auto border-t border-slate-100 pt-8">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Question Preview & Timing</h3>
                    <div className="space-y-3">
                      {questions.map((q, idx) => (
                        <div key={q.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-xs text-slate-400 font-bold mb-0.5">QUESTION {idx + 1}</p>
                            <p className="text-sm font-medium text-slate-700 truncate">{q.text}</p>
                          </div>
                          <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                            <Clock size={14} className="text-slate-400" />
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
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={startExam}
                    disabled={students.length === 0}
                    className="w-full max-w-md mx-auto flex items-center justify-center gap-3 bg-green-600 text-white px-8 py-5 rounded-[2rem] hover:bg-green-700 transition-all font-black text-xl shadow-xl shadow-green-200 disabled:opacity-50 disabled:grayscale"
                  >
                    <Play size={28} fill="currentColor" /> Start Exam Now
                  </button>

                  {students.length === 0 && (
                    <p className="text-sm text-rose-500 font-bold animate-pulse">
                      At least one student must be connected to start.
                    </p>
                  )}
                </div>
              )}

              {status === ExamStatus.ACTIVE && questions[currentQ] && (
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold leading-tight">{questions[currentQ].text}</h3>
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
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <BarChart3 size={20} className="text-indigo-600" />
                  Group Performance Heatmap
                </h3>
              </div>
              <div className="h-64 w-full">
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

          {/* Right Sidebar - Student Status */}
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 sticky top-24">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Users size={20} className="text-indigo-600" />
                  Live Roster
                </h3>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg font-bold">
                  {students.length} Joined
                </span>
              </div>

              <div className="space-y-3">
                {students.map(s => {
                  const studentResp = currentResponses.find(r => r.studentId === s.id);
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-200 flex items-center justify-center font-bold text-indigo-700">
                          {s.name ? s.name[0] : '?'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            {s.name}
                            {s.violations > 0 && (
                              <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded text-[10px] font-black animate-pulse">
                                {s.violations} ERR
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-slate-500">{s.score} pts</p>
                            {!s.isFocused && (
                              <span className="flex items-center gap-1 text-[10px] text-rose-500 font-bold uppercase">
                                <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                                Unfocused
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!studentResp && status === ExamStatus.ACTIVE && (
                          <button
                            onClick={() => simulateResponse(s.id, questions[currentQ].id)}
                            className="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                          >
                            Simulate
                          </button>
                        )}
                        {studentResp ? (
                          studentResp.isCorrect ? <CheckCircle2 className="text-green-500" size={18} /> : <XCircle className="text-rose-500" size={18} />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" />
                        )}
                      </div>
                    </div>
                  );
                })}
                {students.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-4">Waiting for students to join...</p>
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

    </div>
  );
};

export default InstructorDashboard;
