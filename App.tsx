
import React, { useState, useEffect } from 'react';
import InstructorDashboard from './components/InstructorDashboard';
import StudentPortal from './components/StudentPortal';
import UserGuide from './components/UserGuide';
import AnimatedBackground from './components/AnimatedBackground';
import { ShieldCheck, UserCircle2, GraduationCap, Wifi, Bluetooth, Radio, HelpCircle } from 'lucide-react';

const App: React.FC = () => {
  const [role, setRole] = useState<'none' | 'instructor' | 'student'>('none');
  const [showGuide, setShowGuide] = useState(false);

  if (role === 'none') {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6 safe-area-top overflow-hidden">
        <AnimatedBackground variant="landing" intensity="subtle" />

        <div className="relative z-10 w-full max-w-lg md:max-w-4xl space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">

          {/* Minimal Header - Text Only */}
          <div className="text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-white tracking-tighter leading-tight pb-2">
                PeerMesh
              </h1>
              <p className="text-slate-400 font-medium text-sm md:text-base tracking-widest uppercase">
                Advanced P2P Exam Protocol
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-6">

            {/* Instructor Selection */}
            <button
              onClick={() => setRole('instructor')}
              className="group relative overflow-hidden bg-white/5 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 hover:border-blue-400/50 transition-all hover:bg-white/10 text-left w-full"
            >
              <div className="flex flex-col h-full justify-between space-y-4">
                <div className="p-3 bg-blue-500/10 w-fit rounded-2xl group-hover:bg-blue-500/20 transition-colors">
                  <ShieldCheck size={32} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Instructor</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">Create exams & monitor results offline.</p>
                </div>
                <div className="flex gap-3 text-slate-600 pt-2 opacity-50">
                  <Wifi size={16} />
                  <Bluetooth size={16} />
                </div>
              </div>
            </button>

            {/* Student Selection */}
            <button
              onClick={() => setRole('student')}
              className="group relative overflow-hidden bg-white/5 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 hover:border-amber-400/50 transition-all hover:bg-white/10 text-left w-full"
            >
              <div className="flex flex-col h-full justify-between space-y-4">
                <div className="p-3 bg-amber-500/10 w-fit rounded-2xl group-hover:bg-amber-500/20 transition-colors">
                  <UserCircle2 size={32} className="text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Student</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">Join mesh & take exams instantly.</p>
                </div>
                <div className="flex gap-3 text-slate-600 pt-2 opacity-50">
                  <GraduationCap size={16} />
                  <span className="text-[10px] font-mono border border-current px-1 rounded">P2P</span>
                </div>
              </div>
            </button>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative flex flex-col">
      <nav className="sticky top-0 z-50 glass border-b border-slate-200 px-6 py-4 flex justify-between items-center safe-area-top backdrop-blur-xl bg-white/80">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-blue-800 to-blue-900 p-1.5 rounded-lg shadow">
            <Radio size={20} className="text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-900 to-cyan-600">
            PeerMesh
          </span>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-2 text-sm font-bold text-blue-800 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100"
          >
            <HelpCircle size={16} />
            <span className="hidden sm:inline">Guide</span>
          </button>
          <button
            onClick={() => setRole('none')}
            className="text-sm font-medium text-slate-500 hover:text-blue-800 flex items-center gap-2 px-2 transition-colors"
          >
            Switch Role
          </button>
        </div>
      </nav>

      {showGuide && <UserGuide onClose={() => setShowGuide(false)} />}

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 safe-area-bottom">
        {role === 'instructor' ? <InstructorDashboard /> : <StudentPortal />}
      </main>
    </div>
  );
};

export default App;
