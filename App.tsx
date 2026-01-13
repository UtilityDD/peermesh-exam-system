
import React, { useState, useEffect } from 'react';
import InstructorDashboard from './components/InstructorDashboard';
import StudentPortal from './components/StudentPortal';
import UserGuide from './components/UserGuide';
import { ShieldCheck, UserCircle2, GraduationCap, Wifi, Bluetooth, Radio, HelpCircle } from 'lucide-react';

const App: React.FC = () => {
  const [role, setRole] = useState<'none' | 'instructor' | 'student'>('none');
  const [showGuide, setShowGuide] = useState(false);

  if (role === 'none') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-4 safe-area-top">
        <div className="max-w-4xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

          {/* Logo Section */}
          <div className="flex flex-col items-center space-y-4 mb-8">
            <div className="w-24 h-24 md:w-32 md:h-32 bg-white/10 backdrop-blur-xl p-4 rounded-[2.5rem] border border-white/20 shadow-2xl overflow-hidden group">
              <img
                src="/logo.png"
                alt="PeerMesh Logo"
                className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
              />
            </div>
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter">PeerMesh</h1>
              <p className="text-indigo-100/60 font-medium tracking-widest uppercase text-[10px] md:text-sm">Advanced P2P Exam Protocol</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">

            {/* Instructor Selection */}
            <button
              onClick={() => setRole('instructor')}
              className="group relative overflow-hidden bg-white p-8 rounded-3xl shadow-2xl transition-all hover:-translate-y-2 hover:shadow-indigo-500/25 flex flex-col items-center text-center space-y-4"
            >
              <div className="p-4 bg-indigo-100 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <ShieldCheck size={48} className="text-indigo-600 group-hover:text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">I'm an Instructor</h2>
              <p className="text-slate-500">Create exams, manage students, and monitor results in real-time across multiple offline channels.</p>
              <div className="pt-4 flex gap-3 text-slate-400">
                <Wifi size={20} />
                <Bluetooth size={20} />
                <Radio size={20} />
              </div>
            </button>

            {/* Student Selection */}
            <button
              onClick={() => setRole('student')}
              className="group relative overflow-hidden bg-white p-8 rounded-3xl shadow-2xl transition-all hover:-translate-y-2 hover:shadow-pink-500/25 flex flex-col items-center text-center space-y-4"
            >
              <div className="p-4 bg-pink-100 rounded-2xl group-hover:bg-pink-600 group-hover:text-white transition-colors">
                <UserCircle2 size={48} className="text-pink-600 group-hover:text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">I'm a Student</h2>
              <p className="text-slate-500">Join a classroom mesh, receive questions instantly, and submit answers even without internet.</p>
              <div className="pt-4 flex gap-3 text-slate-400">
                <GraduationCap size={20} />
                <div className="px-2 py-0.5 bg-slate-100 rounded text-xs font-semibold">AUTO-DISCOVERY</div>
              </div>
            </button>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative flex flex-col">
      <nav className="sticky top-0 z-50 glass border-b border-slate-200 px-6 py-4 flex justify-between items-center safe-area-top">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Radio size={20} className="text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
            PeerMesh
          </span>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            <HelpCircle size={16} />
            <span className="hidden sm:inline">Guide</span>
          </button>
          <button
            onClick={() => setRole('none')}
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-2 px-2"
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
