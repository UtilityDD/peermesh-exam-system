
import React from 'react';
import { HelpCircle, Wifi, Signal, Globe, Zap, X, ChevronRight, Info } from 'lucide-react';

interface UserGuideProps {
    onClose: () => void;
}

const UserGuide: React.FC<UserGuideProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={onClose} />

            <div className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-8 duration-500 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-indigo-600 p-6 md:p-8 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl">
                            <HelpCircle size={28} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight">User Protocol</h2>
                            <p className="text-xs text-indigo-100/70 font-bold uppercase tracking-widest">Connectivity & Usage Guide</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 scrollbar-none">

                    {/* Method 1: Local WiFi */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-indigo-600">
                            <Wifi size={24} className="shrink-0" />
                            <h3 className="text-xl font-black uppercase tracking-tighter">1. Local WiFi (Same Network)</h3>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3">
                            <p className="text-slate-600 font-medium leading-relaxed">
                                Connect all phones to the same home or office WiFi. This is the fastest way to sync questions.
                            </p>
                            <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-2xl border border-amber-100 text-amber-800 text-sm">
                                <Info size={16} className="mt-0.5 shrink-0" />
                                <p><b>Important:</b> Ensure "AP Isolation" or "Guest Mode" is OFF in your router settings, otherwise phones cannot see each other.</p>
                            </div>
                        </div>
                    </section>

                    {/* Method 2: Mobile Hotspot */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-pink-600">
                            <Signal size={24} className="shrink-0" />
                            <h3 className="text-xl font-black uppercase tracking-tighter">2. Mobile Hotspot (Reliable)</h3>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3">
                            <p className="text-slate-600 font-medium leading-relaxed">
                                If the WiFi router blocks connections, the Teacher can turn on their <b>Mobile Hotspot</b>. Students then connect to that hotspot.
                            </p>
                            <ul className="space-y-2">
                                <li className="flex items-center gap-2 text-sm text-slate-500">
                                    <ChevronRight size={14} className="text-pink-500" /> Works even without cellular data (Handled via Local Mesh).
                                </li>
                                <li className="flex items-center gap-2 text-sm text-slate-500">
                                    <ChevronRight size={14} className="text-pink-500" /> Best for classroom environments.
                                </li>
                            </ul>
                        </div>
                    </section>

                    {/* Method 3: Global Internet */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-emerald-600">
                            <Globe size={24} className="shrink-0" />
                            <h3 className="text-xl font-black uppercase tracking-tighter">3. Global Internet (Remote)</h3>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                            <p className="text-slate-600 font-medium leading-relaxed">
                                Students can join from anywhere in the world! Just share your <b>Mesh ID</b> via WhatsApp or SMS.
                            </p>
                        </div>
                    </section>

                    {/* Usage Guide */}
                    <section className="pt-6 border-t border-slate-100 space-y-6">
                        <h3 className="text-2xl font-black text-slate-800">Quick Start Flow</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-indigo-50/50 p-5 rounded-3xl border border-indigo-100">
                                <p className="text-indigo-600 font-black text-xs uppercase mb-2">As Instructor</p>
                                <p className="text-slate-600 text-sm">Create an exam, share your ID, and wait for students in the Live Roster before starting.</p>
                            </div>
                            <div className="bg-pink-50/50 p-5 rounded-3xl border border-pink-100">
                                <p className="text-pink-600 font-black text-xs uppercase mb-2">As Student</p>
                                <p className="text-slate-600 text-sm">Enter the ID and your name. Keep the app focused to avoid integrity alerts.</p>
                            </div>
                        </div>
                    </section>

                </div>

                {/* Footer */}
                <div className="p-6 md:p-8 bg-slate-50 border-t border-slate-100 shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95"
                    >
                        Got it! Ready to Mesh
                    </button>
                </div>

            </div>
        </div>
    );
};

export default UserGuide;
