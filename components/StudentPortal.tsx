
import React, { useState, useEffect } from 'react';
import { Wifi, Search, GraduationCap, Lock, CheckCircle, Clock, AlertTriangle, Loader2, XCircle, CheckCircle2, ChevronRight, Fingerprint, RefreshCw } from 'lucide-react';
import { meshService } from '../services/mesh';
import { Question, StudentResponse } from '../types';
import AnimatedBackground from './AnimatedBackground';

const StudentPortal: React.FC = () => {
  const [joined, setJoined] = useState(false);
  const [searching, setSearching] = useState(false);
  const [instructorId, setInstructorId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answered, setAnswered] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isAcked, setIsAcked] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [endTime, setEndTime] = useState<string | null>(null);

  const [violations, setViolations] = useState(0);
  const [isFocused, setIsFocused] = useState(true);
  const [isRestored, setIsRestored] = useState(false);
  const [signalStatus, setSignalStatus] = useState<'stable' | 'offline'>('stable');

  // Persistence: Save to localStorage
  useEffect(() => {
    if (joined || studentName || instructorId) {
      localStorage.setItem('PEERMESH_STUDENT_SESSION', JSON.stringify({
        joined, studentName, instructorId, violations
      }));
    }
  }, [joined, studentName, instructorId, violations]);

  useEffect(() => {
    const handleIntegrityChange = (focused: boolean) => {
      setIsFocused(focused);
      if (!focused && joined) {
        setViolations(prev => {
          const newCount = prev + 1;
          meshService.broadcast({
            type: 'INTEGRITY',
            payload: { violations: newCount, isFocused: false }
          });
          return newCount;
        });
      } else if (focused && joined) {
        meshService.broadcast({
          type: 'INTEGRITY',
          payload: { violations: violations, isFocused: true }
        });
      }
    };

    const onVisibilityChange = () => handleIntegrityChange(!document.hidden);
    const onBlur = () => handleIntegrityChange(false);
    const onFocus = () => handleIntegrityChange(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    meshService.onMessage((senderId, message) => {
      if (message.type === 'QUESTION') {
        setCurrentQuestion(message.payload);
        setAnswered(false);
        setSelectedIdx(null);
        setTimeLeft(message.payload.timeLimit || 30);
        setIsAcked(false);
      } else if (message.type === 'HEARTBEAT' && message.payload.status === 'COMPLETED') {
        setExamFinished(true);
        setCurrentQuestion(null);
      } else if (message.type === 'ACK') {
        console.log('Received ACK from instructor:', message.payload);
        setIsAcked(true);
      } else if (message.type === 'RESULTS') {
        setExamFinished(true);
        setResultData(message.payload);
      } else if (message.type === 'SESSION_ENDED') {
        localStorage.removeItem('PEERMESH_STUDENT_SESSION');
        setEndTime(message.payload.endTime);
        setSessionEnded(true);
      }
    });

    // Restoration: Auto-reconnect
    const restoreSession = async () => {
      const saved = localStorage.getItem('PEERMESH_STUDENT_SESSION');
      if (saved && !isRestored) {
        try {
          const data = JSON.parse(saved);
          setStudentName(data.studentName);
          setInstructorId(data.instructorId);
          setViolations(data.violations);

          if (data.joined && data.instructorId && data.studentName) {
            setSearching(true);
            await meshService.init();
            await meshService.connectToInstructor(data.instructorId);
            meshService.broadcast({
              type: 'JOIN',
              payload: { name: data.studentName }
            });
            setJoined(true);
            setSearching(false);
          }
          setIsRestored(true);
        } catch (e) {
          console.error('Failed to restore student session', e);
        }
      }
    };

    restoreSession();

    const signalTimer = setInterval(() => {
      setSignalStatus(meshService.isDisconnected() ? 'offline' : 'stable');
    }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      clearInterval(signalTimer);
    };
  }, [joined, violations, isRestored]);

  useEffect(() => {
    let timer: any;
    if (currentQuestion && !answered && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [currentQuestion, answered, timeLeft]);

  const handleJoin = async () => {
    if (!instructorId || !studentName) return;
    setSearching(true);
    try {
      await meshService.init();
      await meshService.connectToInstructor(instructorId);
      meshService.broadcast({
        type: 'JOIN',
        payload: { name: studentName }
      });
      setJoined(true);
    } catch (err: any) {
      console.error('Failed to join mesh:', err);
      let errorMsg = 'Could not connect to instructor.';
      if (err.message.includes('Could not connect to peer')) {
        errorMsg = 'Instructor ID not found or they are offline. Please double-check the ID.';
      } else if (err.message.includes('timed out')) {
        errorMsg = 'Connection timed out. \n\nTips:\n1. Ensure Teacher & Students are on the SAME WiFi / Hotspot.\n2. In Hotspot mode, verify "Limit connected devices" is not blocking you.\n3. If no internet is available, ensure the Teacher is using "Local Mode" (ID starting with LOCAL-).';
      }
      alert(errorMsg);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (idx: number) => {
    if (!currentQuestion) return;
    setSelectedIdx(idx);
    setAnswered(true);
    const response: StudentResponse = {
      studentId: meshService.getPeerId() || 'unknown',
      studentName: studentName,
      questionId: currentQuestion.id,
      selectedOption: idx,
      timestamp: Date.now(),
      isCorrect: idx === currentQuestion.correctIndex
    };
    meshService.broadcast({
      type: 'RESPONSE',
      payload: response
    });
  };

  if (sessionEnded) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 md:space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-slate-100 text-center space-y-6 md:space-y-8">
          <div className="w-16 h-16 md:w-24 md:h-24 bg-rose-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <XCircle size={32} className="text-rose-600 md:w-12 md:h-12" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl md:text-4xl font-black text-slate-900">Session Ended</h2>
            <p className="text-slate-500 text-base md:text-lg px-2">
              The instructor closed this session at <span className="text-indigo-600 font-bold">{endTime || 'unknown time'}</span>.
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 md:py-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-base md:text-lg shadow-xl shadow-indigo-100 hover:scale-105 transition-transform active:scale-95"
          >
            OK - Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (examFinished) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 md:space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-slate-100 text-center space-y-6 md:space-y-8">
          <div className="w-16 h-16 md:w-24 md:h-24 bg-indigo-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
            {resultData?.published ? <CheckCircle size={32} className="text-indigo-600 md:w-12 md:h-12" /> : <GraduationCap size={32} className="text-indigo-600 md:w-12 md:h-12" />}
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl md:text-4xl font-black text-slate-900">Exam Finished!</h2>
            <p className="text-slate-500 text-lg">
              {resultData?.published
                ? "Congratulations! Your results are now available."
                : "Great job! Please wait while the instructor finalizes the results."}
            </p>
          </div>

          {resultData?.published && (
            <div className="space-y-6">
              {(() => {
                const myResults = resultData.allResults?.find((s: any) => s.id === meshService.getPeerId());
                return (
                  <div className="bg-indigo-600 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] text-white shadow-xl shadow-indigo-100">
                    <p className="text-[10px] md:text-xs font-black uppercase tracking-widest opacity-70 mb-1">Your Performance</p>
                    <div className="flex items-baseline gap-2 justify-center">
                      <p className="text-4xl md:text-6xl font-black">{myResults?.percentage || 0}%</p>
                      <p className="text-sm font-bold opacity-60">Accuracy</p>
                    </div>
                    <div className="flex items-center justify-center gap-4 mt-4 text-[10px] font-black uppercase tracking-widest text-indigo-100">
                      <span className="bg-white/10 px-3 py-1 rounded-full">{myResults?.correct || 0} Correct</span>
                      <span className="bg-white/10 px-3 py-1 rounded-full">{myResults?.wrong || 0} Wrong</span>
                    </div>
                  </div>
                );
              })()}

              <div className="text-left space-y-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest px-4">Class Leaderboard</h3>
                <div className="space-y-2">
                  {resultData.leaderboard.map((s: any, i: number) => (
                    <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border ${i === 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {i + 1}
                        </span>
                        <p className="font-bold text-slate-700">{s.name}</p>
                      </div>
                      <p className="font-mono font-black text-indigo-600">{s.score} pts</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!resultData?.published && (
            <div className="p-8 bg-slate-50 border border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center gap-4">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" />
              </div>
              <p className="text-slate-500 font-medium">Waiting for result publication...</p>
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
          >
            Return to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="relative">
        <AnimatedBackground variant="student" intensity="subtle" />

        <div className="relative z-10 max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white/95 backdrop-blur-2xl p-6 rounded-3xl shadow-sm border border-slate-100 text-center space-y-6">
            <div className="w-16 h-16 bg-amber-50/50 rounded-full flex items-center justify-center mx-auto">
              <Wifi size={24} className="text-amber-600 animate-pulse" />
            </div>

            <div className="space-y-4 pt-2">
              <input
                type="text"
                placeholder="Name"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-sm font-semibold"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Mesh ID"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-sm font-mono uppercase tracking-widest text-center"
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
              />
              <button
                onClick={handleJoin}
                disabled={searching || !instructorId || !studentName}
                className="w-full py-3.5 bg-amber-500 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 transition-all flex items-center justify-center gap-2 disabled:opacity-20 shadow-md"
              >
                {searching ? (
                  <>
                    <Loader2 className="animate-spin" size={20} /> Connecting...
                  </>
                ) : (
                  <>
                    Join Exam
                  </>
                )}
              </button>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center justify-center gap-3 opacity-50">
                <span className="flex items-center gap-1">Secure Mesh</span>
                <span>•</span>
                <span className="flex items-center gap-1">Protocol v1.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Security Check Overlay */}
      {!isFocused && (
        <div className="fixed inset-0 z-[100] bg-rose-900/90 backdrop-blur-md flex items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="max-w-md space-y-6">
            <div className="w-24 h-24 bg-rose-500 rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-rose-500/50">
              <AlertTriangle size={48} className="text-white animate-bounce" />
            </div>
            <h2 className="text-3xl font-black text-white">Integrity Warning!</h2>
            <p className="text-rose-100 text-lg">
              You have left the exam window. This event has been reported to the invigilator.
            </p>
            <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/20 inline-block">
              <p className="text-white font-bold">Violations Recorded: {violations}</p>
            </div>
            <p className="text-rose-200 text-sm animate-pulse">
              Please click anywhere to return to the exam.
            </p>
          </div>
        </div>
      )}

      {/* Student Status Bar */}
      <div className="relative z-10 bg-slate-900 text-white px-5 py-2.5 rounded-2xl flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center font-black text-[10px]">
            {studentName[0]}
          </div>
          <p className="text-[11px] font-black uppercase tracking-tight">Active Exam</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black ${timeLeft < 10 ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
            <Clock size={12} />
            {timeLeft}s
          </div>
          <button
            onClick={() => {
              if (confirm('Leave this exam session?')) {
                localStorage.removeItem('PEERMESH_STUDENT_SESSION');
                window.location.reload();
              }
            }}
            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>

      {/* Portalized Question View (Bottom Sheet) */}
      {currentQuestion && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end overflow-hidden animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />

          <div className="relative bg-white rounded-t-[2.5rem] shadow-2xl max-w-2xl mx-auto w-full animate-in slide-in-from-bottom-full duration-500 ease-out flex flex-col max-h-[95vh] border-t border-white/20">
            {/* Grab Handle */}
            <div className="flex justify-center p-4">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
            </div>

            <div className="overflow-y-auto px-6 pb-12 pt-2 scrollbar-none">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-800 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-900/30">
                    <Fingerprint size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Secure Protocol</p>
                    <p className="text-sm font-bold text-slate-800 tracking-tight">Question Terminal</p>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all ${timeLeft < 10 ? 'border-rose-100 bg-rose-50 text-rose-600 shadow-rose-100' : 'border-blue-100 bg-blue-50 text-blue-800'}`}>
                  <Clock size={16} className={timeLeft < 10 ? 'animate-pulse' : ''} />
                  <span className="font-mono font-black text-xl leading-none">{timeLeft}s</span>
                </div>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl font-black text-slate-900 leading-[1.2] tracking-tight">
                  {currentQuestion.text}
                </h2>

                <div className="grid gap-2">
                  {currentQuestion.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => !answered && handleSubmit(idx)}
                      disabled={answered}
                      className={`relative flex items-center justify-between p-4 rounded-xl border transition-all active:scale-[0.98] ${selectedIdx === idx
                        ? 'border-amber-500 bg-amber-50 shadow-sm'
                        : 'border-slate-100 bg-slate-50'
                        } ${answered && selectedIdx !== idx ? 'opacity-30 grayscale' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs transition-all ${selectedIdx === idx ? 'bg-amber-500 text-white' : 'bg-white text-slate-400'}`}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className={`font-bold text-sm ${selectedIdx === idx ? 'text-amber-900' : 'text-slate-600'}`}>
                          {opt}
                        </span>
                      </div>
                      {selectedIdx === idx && <CheckCircle2 className="text-amber-600" size={18} />}
                    </button>
                  ))}
                </div>

                {answered && (
                  <div className={`mt-8 p-6 rounded-[2rem] flex items-center gap-4 animate-in zoom-in slide-in-from-top-4 duration-500 shadow-sm border ${isAcked ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'
                    }`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0 ${isAcked ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                      {isAcked ? <CheckCircle size={24} /> : <Loader2 size={24} className="animate-spin" />}
                    </div>
                    <div>
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-60">Status: {isAcked ? 'VERIFIED' : 'PENDING'}</p>
                      <p className="font-bold text-lg leading-tight">
                        {isAcked ? 'ACK Received: Response Saved' : 'Broadcasting Answer...'}
                      </p>
                    </div>
                  </div>
                )}

                {!answered && timeLeft === 0 && (
                  <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-[2rem] flex items-center gap-4 animate-in zoom-in duration-300">
                    <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-200">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <p className="font-black text-[10px] uppercase tracking-widest text-rose-400">System Alert</p>
                      <p className="font-bold text-rose-900 text-lg">Question Expired</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Roster & Waiting State */}
      {!currentQuestion && (
        <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center space-y-3 animate-in fade-in duration-500">
          <Loader2 className="animate-spin text-indigo-500 mx-auto" size={24} />
          <div className="space-y-0.5">
            <p className="font-black text-slate-800 uppercase tracking-tight text-sm">Awaiting Question</p>
            <p className="text-[10px] font-medium text-slate-400">Scanning mesh for next pulse...</p>
          </div>
        </div>
      )}

      {/* Security Tip */}
      <div className="p-4 bg-slate-100 rounded-2xl flex items-start gap-3 opacity-60">
        <Lock size={16} className="text-slate-500 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-tight">
          Integrity Lock active. Minimizing this app will alert the invigilator and invalidate your session. Stay focused.
        </p>
      </div>

    </div>
  );
};

export default StudentPortal;
