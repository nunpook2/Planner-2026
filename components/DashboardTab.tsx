
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Tester, AssignedTask, RawTask, ShiftReport, DailySchedule, AssignedPrepareTask, CategorizedTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, getShiftReport, saveShiftReport, getDailySchedule, getAssignedPrepareTasks, getCategorizedTasks,
    updateCategorizedTask
} from '../services/dataService';
import { 
    CheckCircleIcon, AlertTriangleIcon, 
    UserGroupIcon, RefreshIcon, 
    BeakerIcon, CalendarIcon,
    SunIcon, MoonIcon, DownloadIcon,
    ChevronDownIcon, SparklesIcon,
    TrashIcon, CogIcon, PlusIcon, XCircleIcon,
    ClipboardListIcon
} from './common/Icons';

declare const XLSX: any;

const ALL_PERSONNEL_ID = 'unified_view_all';

interface SampleDetail {
    name: string;
    qty: string;
    detail: string;
    status: string;
    reason?: string;
    isManual: boolean;
    isPrep?: boolean;
}

interface SummaryItemStats {
    desc: string; 
    total: number; 
    done: number; 
    failed: number; 
    returned: number;
    priorityStatus: 'lsp' | 'sprint' | 'urgent' | 'pocat' | 'normal';
    isManual: boolean;
    isPrepGroup?: boolean;
    samples: SampleDetail[];
}

interface PersonStats {
    id: string;
    name: string;
    role: 'ANLST' | 'ASST';
    pendingTasks: number;
    summary: Record<string, SummaryItemStats>;
}

interface DashboardTabProps {
    testers: Tester[];
    selectedDate: string;
    onDateChange: (date: string) => void;
    selectedShift: 'day' | 'night';
    onShiftChange: (shift: 'day' | 'night') => void;
}

const getTaskValue = (task: RawTask, header: string): string | number => {
    const keys = Object.keys(task);
    const target = header.toLowerCase().trim();
    const matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    return matchedKey ? task[matchedKey] : '';
};

const getPriorityStatus = (task: RawTask, category: TaskCategory): 'lsp' | 'sprint' | 'urgent' | 'pocat' | 'normal' => {
    const allContent = Object.values(task).map(v => String(v).toLowerCase()).join(' ');
    const cat = String(category).toLowerCase();

    if (allContent.includes('lsp')) return 'lsp';
    if (allContent.includes('sprint')) return 'sprint';
    if (cat === 'urgent' || allContent.includes('urgent')) return 'urgent';
    if (cat === 'pocat' || allContent.includes('po cat')) return 'pocat';
    
    return 'normal';
};

const ReportEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    report: ShiftReport | null;
    onSave: (report: ShiftReport) => void;
    date: string;
    shift: 'day' | 'night';
}> = ({ isOpen, onClose, report, onSave, date, shift }) => {
    const [wasteLevel, setWasteLevel] = useState<'low' | 'medium' | 'high'>('low');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (isOpen) {
            setWasteLevel(report?.wasteLevel || 'low');
            setNote(report?.infrastructureNote || '');
        }
    }, [isOpen, report]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[110] animate-fade-in p-4" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-white/20" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-base-100 dark:border-base-800 flex justify-between items-center">
                    <div>
                        <h3 className="text-2xl font-black tracking-tighter text-base-955 dark:text-white">Lab Waste Status</h3>
                        <p className="text-[10px] font-bold text-base-400 uppercase tracking-widest mt-1">{date} | {shift.toUpperCase()} SHIFT</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-base-200 dark:hover:bg-base-700 rounded-full transition-colors"><XCircleIcon className="h-6 w-6 text-base-400"/></button>
                </div>
                
                <div className="p-8 space-y-10">
                    <div className="space-y-6">
                        <div className="flex flex-col items-center gap-2 mb-4">
                             <TrashIcon className="h-8 w-8 text-primary-500 mb-2" />
                             <h4 className="text-xs font-black uppercase tracking-[0.4em] text-base-400">Select Current Level</h4>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4">
                            {(['low', 'medium', 'high'] as const).map(lv => (
                                <button 
                                    key={lv} 
                                    onClick={() => setWasteLevel(lv)} 
                                    className={`relative group px-8 py-6 rounded-[2rem] border-2 transition-all duration-500 text-left flex items-center justify-between
                                        ${wasteLevel === lv 
                                            ? lv === 'low' ? 'bg-emerald-600 border-emerald-400 text-white shadow-[0_20px_40px_-10px_rgba(16,185,129,0.5)] scale-[1.02]' 
                                              : lv === 'medium' ? 'bg-amber-500 border-amber-300 text-white shadow-[0_20px_40px_-10px_rgba(245,158,11,0.5)] scale-[1.02]'
                                              : 'bg-red-600 border-red-400 text-white shadow-[0_20px_40px_-10px_rgba(220,38,38,0.5)] scale-[1.02]'
                                            : 'bg-base-50 dark:bg-base-800 border-base-100 dark:border-base-700 text-base-400 hover:border-base-300 hover:bg-white'
                                        }
                                    `}
                                >
                                    <div className="flex flex-col">
                                        <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${wasteLevel === lv ? 'text-white/60' : 'text-base-400'}`}>Level Status</span>
                                        <span className="text-2xl font-black uppercase tracking-tighter">{lv === 'low' ? 'Low / Safe' : lv === 'medium' ? 'Medium / Full' : 'High / Overflow'}</span>
                                    </div>
                                    <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all ${wasteLevel === lv ? 'bg-white border-white/20' : 'border-base-200 bg-transparent'}`}>
                                        {wasteLevel === lv && <CheckCircleIcon className={`h-5 w-5 ${lv === 'low' ? 'text-emerald-600' : lv === 'medium' ? 'text-amber-500' : 'text-red-600'}`} />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-400 ml-4">Operational Notes</h4>
                        <textarea 
                            value={note} 
                            onChange={e => setNote(e.target.value)} 
                            placeholder="Add mission-critical notes about waste or environment..." 
                            rows={3} 
                            className="w-full p-6 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[2rem] text-sm font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white resize-none transition-all"
                        />
                    </div>
                </div>

                <div className="p-8 border-t border-base-100 dark:border-base-800 flex flex-col gap-3">
                    <button onClick={() => onSave({ 
                        id: `${date}_${shift}`, date, shift, instruments: [], wasteLevel, cleanliness: 'good', infrastructureNote: note, cleanlinessNote: '' 
                    })} className="w-full py-5 bg-primary-600 text-white font-black rounded-[1.5rem] shadow-xl hover:brightness-110 transition-all uppercase tracking-[0.2em] text-[12px] border-b-4 border-primary-800">Commit Lab Report</button>
                    <button onClick={onClose} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest transition-colors">Discard Changes</button>
                </div>
            </div>
        </div>
    );
};

const DashboardTab: React.FC<DashboardTabProps> = ({ 
    testers, 
    selectedDate, 
    onDateChange, 
    selectedShift, 
    onShiftChange 
}) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [returnedPool, setReturnedPool] = useState<CategorizedTask[]>([]);
    const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(ALL_PERSONNEL_ID);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        setIsFetching(true);
        try {
            const [assigned, pool, report, dailySched, prepared] = await Promise.all([
                getAssignedTasks(), getCategorizedTasks(), getShiftReport(selectedDate, selectedShift), getDailySchedule(selectedDate), getAssignedPrepareTasks()
            ]);
            setAssignedTasks((assigned || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setPrepareTasks((prepared || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setReturnedPool((pool || []).filter(t => t.isReturnedPool === true)); 
            setSchedule(dailySched);
            setShiftReport(report);
        } catch (e) { 
            console.error(e);
        } finally {
            setIsFetching(false);
        }
    }, [selectedDate, selectedShift]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const globalStats = useMemo(() => {
        let total = 0, done = 0, poCat = 0, lsp = 0, sprint = 0, urgent = 0;
        assignedTasks.forEach(group => {
            total += group.tasks.length;
            group.tasks.forEach(t => {
                const priority = getPriorityStatus(t, group.category);
                if (priority === 'lsp') lsp++;
                else if (priority === 'sprint') sprint++;
                else if (priority === 'urgent') urgent++;
                else if (priority === 'pocat') poCat++;
                if (t.status === TaskStatus.Done) done++;
            });
        });
        return { total, done, poCat, lsp, sprint, urgent, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
    }, [assignedTasks]);

    const processedPersonnel = useMemo(() => {
        const stats: Record<string, PersonStats> = {};
        if (schedule) {
            const activeShiftIds = selectedShift === 'day' 
                ? [...(schedule.dayShiftTesters || []), ...(schedule.dayShiftAssistants || [])]
                : [...(schedule.nightShiftTesters || []), ...(schedule.nightShiftAssistants || [])];
            activeShiftIds.forEach(id => {
                const testerObj = testers.find(t => t.id === id);
                if (testerObj) {
                    const isAssistant = testerObj.team === 'assistants_4_2';
                    stats[testerObj.id] = { id: testerObj.id, name: testerObj.name, role: isAssistant ? 'ASST' : 'ANLST', pendingTasks: 0, summary: {} };
                }
            });
        }
        
        const addActivity = (targetPersonId: string, task: RawTask, cat: TaskCategory, isReady: boolean, isPrep: boolean = false) => {
            if (!stats[targetPersonId]) return; 
            const person = stats[targetPersonId];
            const priority = isPrep ? 'normal' : getPriorityStatus(task, cat);
            const rawDesc = String(getTaskValue(task, 'Description') || 'General Task');
            const desc = isPrep ? `[PREP] ${rawDesc}` : rawDesc;
            const status = isReady ? 'done' : (task.status === TaskStatus.NotOK ? 'failed' : (task.isReturned ? 'returned' : 'pending'));
            
            if (status !== 'done') person.pendingTasks++;
            
            const summaryKey = `${person.id}_${desc}`;
            
            if (!person.summary[summaryKey]) {
                person.summary[summaryKey] = { desc, total: 0, done: 0, failed: 0, returned: 0, priorityStatus: priority, isManual: task.ManualEntry === true || cat === TaskCategory.Manual, isPrepGroup: isPrep, samples: [] };
            }
            const item = person.summary[summaryKey];
            item.total++;
            if (status === 'done') item.done++;
            if (status === 'failed') item.failed++;
            if (status === 'returned') item.returned++;
            
            if (!isPrep) {
                const priorities = ['lsp', 'sprint', 'urgent', 'pocat', 'normal'];
                if (priorities.indexOf(priority) < priorities.indexOf(item.priorityStatus)) item.priorityStatus = priority;
            }
            
            item.samples.push({ name: String(getTaskValue(task, 'Sample Name') || 'N/A'), qty: String(getTaskValue(task, 'Quantity') || '1'), detail: String(getTaskValue(task, 'Variant') || '-'), status: status, isManual: item.isManual, isPrep: isPrep, reason: task.notOkReason || task.returnReason || undefined });
        };

        assignedTasks.forEach(g => (g.tasks || []).forEach(t => addActivity(g.testerId, t, g.category, t.status === TaskStatus.Done, false)));
        prepareTasks.forEach(g => (g.tasks || []).forEach(t => {
            const isDone = t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing';
            addActivity(g.assistantId, t, g.category, isDone, true);
        }));

        return Object.values(stats).sort((a, b) => b.pendingTasks - a.pendingTasks);
    }, [assignedTasks, prepareTasks, schedule, testers, selectedShift]);

    const activePerson = useMemo(() => {
        if (!selectedPersonId || selectedPersonId === ALL_PERSONNEL_ID) return null;
        return processedPersonnel.find(p => p.id === selectedPersonId) || null;
    }, [processedPersonnel, selectedPersonId]);

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const handleSaveReport = async (report: ShiftReport) => {
        try {
            await saveShiftReport(report); fetchData(); setNotification({ message: "Lab report committed successfully.", isError: false }); setIsReportModalOpen(false);
        } catch (e) { setNotification({ message: "Failed to save report.", isError: true }); }
    };

    const handleExport = () => {
        const exportData = processedPersonnel.flatMap(person => Object.values(person.summary).flatMap((sum: SummaryItemStats) => sum.samples.map(sample => ({ 'Staff Name': person.name, 'Work Type': sample.isPrep ? 'Preparation' : 'Testing', 'Mission Desc': sum.desc, 'Sample Name': sample.name, 'Qty': sample.qty, 'Details': sample.detail, 'Status': sample.status, 'Issue/Reason': sample.reason || '-' }))));
        const ws = XLSX.utils.json_to_sheet(exportData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Shift Summary"); XLSX.writeFile(wb, `ShiftSummary_${selectedDate}_${selectedShift}.xlsx`);
    };

    const wasteTheme = useMemo(() => {
        const level = shiftReport?.wasteLevel || 'none';
        switch(level) {
            case 'high': return { bg: 'bg-red-600', text: 'text-red-50', badge: 'bg-red-950 text-red-400', glow: 'shadow-[0_20px_50px_-10px_rgba(220,38,38,0.5)]', label: 'Over Capacity', display: 'HIGH' };
            case 'medium': return { bg: 'bg-amber-500', text: 'text-amber-50', badge: 'bg-amber-950 text-amber-300', glow: 'shadow-[0_20px_50px_-10px_rgba(245,158,11,0.5)]', label: 'Limited Space', display: 'MEDIUM' };
            case 'low': return { bg: 'bg-emerald-600', text: 'text-emerald-50', badge: 'bg-emerald-950 text-emerald-400', glow: 'shadow-[0_20px_50px_-10px_rgba(16,185,129,0.5)]', label: 'Optimal', display: 'LOW' };
            default: return { bg: 'bg-white dark:bg-base-900', text: 'text-base-400 dark:text-base-500', badge: 'bg-base-100 dark:bg-base-800 text-base-400', glow: 'shadow-none', label: 'Not Set', display: 'N/A' };
        }
    }, [shiftReport]);

    const renderPersonnelSection = (person: PersonStats) => {
        const missions = Object.entries(person.summary);
        if (missions.length === 0) return null;

        const totalDone = Object.values(person.summary).reduce((acc, s) => acc + s.done, 0);
        const totalAll = Object.values(person.summary).reduce((acc, s) => acc + s.total, 0);

        return (
            <div key={person.id} className="relative group/person mb-12 animate-fade-in">
                {/* Visual Anchor Bar */}
                <div className={`absolute -left-3 top-0 bottom-0 w-1.5 rounded-full transition-all duration-500 ${person.role === 'ASST' ? 'bg-amber-500 group-hover/person:w-2' : 'bg-primary-600 group-hover/person:w-2'}`}></div>
                
                {/* Section Header */}
                <div className="sticky top-0 z-[15] px-4 py-2 mb-4 bg-white/95 dark:bg-base-900/95 backdrop-blur-md rounded-2xl border border-base-200 dark:border-base-800 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[11px] font-black text-white shadow-lg ${person.role === 'ASST' ? 'person-avatar assistant' : 'person-avatar'}`}>
                            {person.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h4 className="text-[16px] font-black text-base-955 dark:text-base-50 uppercase tracking-tighter leading-none">{person.name}</h4>
                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] mt-1 block ${person.role === 'ASST' ? 'text-amber-600' : 'text-primary-600'}`}>
                                {person.role === 'ASST' ? 'Assistant Ops' : 'Analyst Ops'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-base-400 uppercase tracking-widest">Load Performance</span>
                            <span className={`text-[15px] font-black ${totalDone === totalAll ? 'text-emerald-600' : 'text-primary-600'}`}>
                                {totalDone} <span className="text-base-300 mx-0.5 font-normal">/</span> {totalAll}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Missions Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-1">
                    {missions.map(([key, sum]) => {
                        const isComplete = sum.done === sum.total;
                        const hasError = sum.failed > 0 || sum.returned > 0;
                        const isExpanded = expandedGroups.has(key);
                        
                        return (
                            <div key={key} className={`group/mission rounded-[1.8rem] border-2 transition-all duration-300 flex flex-col overflow-hidden ${isComplete ? 'bg-emerald-50/5 border-emerald-100/30' : hasError ? 'bg-red-50/5 border-red-100/30 shadow-md' : 'bg-white dark:bg-base-800 border-base-100 dark:border-base-700 hover:border-primary-500/30 hover:shadow-xl'}`}>
                                <button onClick={() => toggleGroup(key)} className="w-full text-left p-5 flex flex-col gap-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                                            {sum.isPrepGroup && <span className="bg-amber-500 text-white px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest border-b-2 border-amber-700">PREP</span>}
                                            {!sum.isPrepGroup && sum.priorityStatus !== 'normal' && (
                                                <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest text-white border-b-2 ${
                                                    sum.priorityStatus === 'lsp' ? 'bg-cyan-600 border-cyan-800' : 
                                                    sum.priorityStatus === 'sprint' ? 'bg-rose-600 border-rose-800' : 
                                                    sum.priorityStatus === 'urgent' ? 'bg-red-500 border-red-800' : 'bg-orange-500 border-orange-800'
                                                }`}>{sum.priorityStatus}</span>
                                            )}
                                        </div>
                                        <div className={`text-[18px] font-black tracking-tighter ${isComplete ? 'text-emerald-700' : hasError ? 'text-red-600' : 'text-primary-700'}`}>
                                            {sum.done}<span className="text-base-300 mx-0.5 font-normal text-xs">/</span>{sum.total}
                                        </div>
                                    </div>
                                    
                                    <h3 className={`text-[13px] font-black tracking-tight uppercase line-clamp-2 leading-tight ${isComplete ? 'text-emerald-900/50' : 'text-base-955 dark:text-white'}`}>
                                        {sum.desc}
                                    </h3>

                                    <div className="w-full h-1 bg-base-100 dark:bg-base-700 rounded-full overflow-hidden mt-1">
                                        <div className={`h-full transition-all duration-1000 ${isComplete ? 'bg-emerald-500' : hasError ? 'bg-red-500' : 'bg-primary-500'}`} style={{width: `${(sum.done/sum.total)*100}%`}}></div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-[8px] font-black text-base-300 uppercase tracking-widest">{isExpanded ? 'Hide Details' : 'View Mission List'}</span>
                                        <ChevronDownIcon className={`h-3 w-3 text-base-300 transition-transform duration-500 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
                                    </div>
                                </button>
                                
                                {isExpanded && (
                                    <div className="px-3 pb-4 space-y-1.5 animate-fade-in bg-base-50/20 dark:bg-black/10 border-t border-base-50 dark:border-base-700 pt-3">
                                        {sum.samples.map((s, si) => (
                                            <div key={si} className="flex flex-col p-2.5 bg-white dark:bg-base-900/60 rounded-xl border border-base-50 dark:border-base-800 gap-1 shadow-sm">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-[11px] font-black text-base-955 dark:text-base-50 uppercase tracking-tight truncate flex-grow mr-2">{s.name}</span>
                                                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest shrink-0 ${s.status === 'done' ? 'bg-emerald-600 text-white' : s.status === 'failed' ? 'bg-red-600 text-white' : 'bg-base-100 dark:bg-base-800 text-base-500'}`}>
                                                        {s.status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.5 rounded-lg text-[7px] font-black ${s.isPrep ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>x{s.qty}</span>
                                                    <span className="text-[9px] font-bold text-base-400 uppercase truncate flex-grow">{s.detail}</span>
                                                </div>
                                                {s.reason && (
                                                    <div className="mt-1 flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white rounded-lg animate-pulse">
                                                        <AlertTriangleIcon className="h-2.5 w-2.5" />
                                                        <span className="text-[7px] font-black uppercase truncate">{s.reason}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col animate-fade-in overflow-hidden p-3 bg-base-50/50 dark:bg-base-955 font-sans relative">
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .person-avatar { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); }
                .person-avatar.assistant { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); }
                .person-avatar.unified { background: linear-gradient(135deg, #0f172a 0%, #334155 100%); }
                .active-glow { box-shadow: 0 0 20px -5px rgba(99, 102, 241, 0.4); }
                @keyframes waste-pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }
                .waste-pulse-active { animation: waste-pulse 2s ease-in-out infinite; }
            `}</style>

            <ReportEditorModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} report={shiftReport} onSave={handleSaveReport} date={selectedDate} shift={selectedShift} />

            <div className="flex-grow grid grid-cols-12 gap-4 h-full relative overflow-hidden">
                <aside className="col-span-3 flex flex-col bg-white/40 dark:bg-base-900/40 rounded-[2.5rem] border border-white dark:border-base-800 shadow-sm overflow-hidden h-full backdrop-blur-md">
                    <div className="p-4 border-b border-white dark:border-base-800 bg-white/20 flex justify-between items-center shrink-0">
                        <h3 className="text-[10px] font-black text-base-400 uppercase tracking-[0.4em] ml-1">Duty Ops</h3>
                        <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse shadow-sm"></div>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto no-scrollbar p-2.5 space-y-1.5 min-h-0">
                        <button 
                            onClick={() => setSelectedPersonId(ALL_PERSONNEL_ID)} 
                            className={`w-full group flex items-center gap-3 p-3 rounded-[1.3rem] transition-all duration-300 border text-left ${selectedPersonId === ALL_PERSONNEL_ID ? 'bg-base-900 border-base-800 text-white shadow-lg scale-[1.02]' : 'bg-white/40 dark:bg-base-900/40 hover:bg-white dark:hover:bg-base-800 border-transparent hover:border-base-200 dark:hover:border-base-700'}`}
                        >
                            <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-black shadow-inner person-avatar unified ring-white/10 ${selectedPersonId === ALL_PERSONNEL_ID ? 'ring-2' : ''}`}>
                                <SparklesIcon className="h-4 w-4" />
                            </div>
                            <div className="flex-grow min-w-0">
                                <span className={`block text-[14px] font-black tracking-tight leading-tight ${selectedPersonId === ALL_PERSONNEL_ID ? 'text-white' : 'text-base-800 dark:text-base-100'}`}>Unified View</span>
                                <span className={`text-[8px] font-bold uppercase tracking-widest mt-1 block ${selectedPersonId === ALL_PERSONNEL_ID ? 'text-white/60' : 'text-base-400'}`}>All Personnel</span>
                            </div>
                        </button>

                        <div className="h-px bg-base-200 dark:bg-base-800 mx-2 my-1"></div>

                        {processedPersonnel.map(person => {
                            const isActive = selectedPersonId === person.id;
                            const isAssistant = person.role === 'ASST';
                            return (
                                <button key={person.id} onClick={() => setSelectedPersonId(person.id)} className={`w-full group flex items-center gap-3 p-3 rounded-[1.3rem] transition-all duration-300 border text-left ${isActive ? 'bg-gradient-to-r from-primary-600 to-indigo-600 border-primary-500 text-white shadow-lg active-glow scale-[1.02]' : 'bg-white/40 dark:bg-base-900/40 hover:bg-white dark:hover:bg-base-800 border-transparent hover:border-base-200 dark:hover:border-base-700'}`}>
                                    <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-black shadow-inner ${isAssistant ? 'person-avatar assistant' : 'person-avatar'} ${isActive ? 'ring-2 ring-white/40' : 'text-white'}`}>{person.name.substring(0, 2).toUpperCase()}</div>
                                    <div className="flex-grow min-w-0"><span className={`block text-[14px] font-black tracking-tight leading-tight ${isActive ? 'text-white' : 'text-base-800 dark:text-base-100'}`}>{person.name}</span><span className={`text-[8px] font-bold uppercase tracking-widest mt-1 block ${isActive ? 'text-white/60' : 'text-base-400'}`}>{isAssistant ? 'Assistant' : 'Analyst'}</span></div>
                                    {person.pendingTasks > 0 && <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-black ${isActive ? 'bg-white text-primary-600 shadow-md' : 'bg-primary-50 text-white shadow-sm'}`}>{person.pendingTasks}</div>}
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <div className="col-span-9 flex flex-col min-w-0 bg-white/60 dark:bg-base-900/60 rounded-[2.5rem] border border-white dark:border-base-800 shadow-2xl overflow-hidden relative backdrop-blur-xl h-full">
                    <div className="px-8 py-5 border-b border-white dark:border-base-800 flex justify-between items-center bg-white/40 dark:bg-base-800/10 backdrop-blur-xl shrink-0 sticky top-0 z-20">
                        <div className="flex items-center gap-8">
                            <div>
                                <h2 className="text-2xl font-black text-base-955 dark:text-white tracking-tighter leading-none">Shift Intelligence</h2>
                                <p className="text-[10px] text-base-400 font-black uppercase tracking-[0.3em] mt-1.5">Mission Performance Analysis</p>
                            </div>
                            <div className="flex items-center gap-3 bg-white/60 dark:bg-base-800/60 p-1.5 rounded-[1.4rem] border border-white dark:border-base-700 shadow-inner">
                                <div className="relative group px-2 border-r dark:border-base-700"><CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-500" /><input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="bg-transparent border-none text-[11px] font-black focus:ring-0 cursor-pointer pl-6 py-1.5 dark:text-white" /></div>
                                <div className="flex gap-1 p-0.5"><button onClick={() => onShiftChange('day')} className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedShift === 'day' ? 'bg-amber-500 text-white shadow-lg' : 'text-base-400 hover:text-amber-500'}`}><SunIcon className="h-3 w-3" /> Day</button><button onClick={() => onShiftChange('night')} className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedShift === 'night' ? 'bg-indigo-600 text-white shadow-lg' : 'text-base-400 hover:text-indigo-600'}`}><MoonIcon className="h-3 w-3" /> Night</button></div>
                            </div>
                        </div>
                        <div className="flex gap-2.5"><button onClick={handleExport} title="Export Excel" className="p-3 bg-white dark:bg-base-800 hover:bg-base-50 rounded-2xl transition-all border border-base-100 dark:border-base-700 shadow-sm text-base-500"><DownloadIcon className="h-5 w-5"/></button><button onClick={fetchData} className="p-3 bg-white dark:bg-base-800 hover:bg-primary-50 rounded-2xl transition-all border border-base-100 dark:border-base-700 shadow-sm text-base-400"><RefreshIcon className={`h-5 w-5 ${isFetching ? 'animate-spin text-primary-500' : ''}`}/></button></div>
                    </div>

                    <div className="flex-grow overflow-y-auto no-scrollbar p-8">
                        <div className="max-w-7xl mx-auto space-y-6 pb-20">
                            {/* KPI Grid */}
                            <div className="grid grid-cols-6 gap-3">
                                <div className="col-span-1 bg-white dark:bg-base-800 rounded-[1.8rem] border border-primary-500/10 p-4 shadow-lg flex flex-col justify-between">
                                    <h4 className="text-[9px] font-black text-primary-600 uppercase tracking-widest mb-2">Success Rate</h4>
                                    <div className="flex items-end justify-between mb-1">
                                        <span className="text-2xl font-black text-base-955 dark:text-white tracking-tighter leading-none">{globalStats.done}<span className="text-base-300 mx-0.5 font-medium text-base">/</span>{globalStats.total}</span>
                                        <span className="text-[10px] font-black text-primary-600">{globalStats.percent}%</span>
                                    </div>
                                    <div className="w-full h-1 bg-primary-100 dark:bg-base-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary-600" style={{width: `${globalStats.percent}%`}}></div>
                                    </div>
                                </div>

                                <div className="col-span-1 bg-white dark:bg-base-800 rounded-[1.8rem] border border-cyan-500/10 p-4 shadow-lg">
                                    <h4 className="text-[9px] font-black text-cyan-600 uppercase tracking-widest mb-2">LSP Status</h4>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-3xl font-black text-cyan-600 tracking-tighter leading-none">{globalStats.lsp}</span>
                                        <span className="text-[8px] font-bold text-base-400 uppercase tracking-tighter">Units</span>
                                    </div>
                                </div>

                                <div className="col-span-1 bg-white dark:bg-base-800 rounded-[1.8rem] border border-rose-500/10 p-4 shadow-lg">
                                    <h4 className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-2">Sprint Track</h4>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-3xl font-black text-rose-600 tracking-tighter leading-none">{globalStats.sprint}</span>
                                        <span className="text-[8px] font-bold text-base-400 uppercase tracking-tighter">Fast</span>
                                    </div>
                                </div>

                                <div className="col-span-1 bg-white dark:bg-base-800 rounded-[1.8rem] border border-red-500/10 p-4 shadow-lg">
                                    <h4 className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-2">Urgent Alert</h4>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className={`text-3xl font-black tracking-tighter leading-none ${globalStats.urgent > 0 ? 'text-red-600' : 'text-base-400'}`}>{globalStats.urgent}</span>
                                        <span className="text-[8px] font-bold text-base-400 uppercase tracking-tighter">Missions</span>
                                    </div>
                                </div>

                                <div className="col-span-1 bg-white dark:bg-base-800 rounded-[1.8rem] border border-orange-500/10 p-4 shadow-lg">
                                    <h4 className="text-[9px] font-black text-orange-600 uppercase tracking-widest mb-2">Po Cat Load</h4>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-3xl font-black text-orange-600 tracking-tighter leading-none">{globalStats.poCat}</span>
                                        <span className="text-[8px] font-bold text-base-400 uppercase tracking-tighter">Ops</span>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => setIsReportModalOpen(true)}
                                    className={`col-span-1 rounded-[1.8rem] border transition-all duration-300 overflow-hidden relative group text-left flex flex-col justify-between p-4 shadow-xl ${wasteTheme.bg} border-transparent ${wasteTheme.glow} ${shiftReport?.wasteLevel === 'high' ? 'waste-pulse-active' : ''}`}
                                >
                                    <div className="absolute top-0 right-0 w-12 h-12 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl"></div>
                                    <div className="flex justify-between items-start">
                                        <h4 className={`text-[9px] font-black uppercase tracking-[0.2em] ${wasteTheme.text} opacity-80`}>Waste Status</h4>
                                        <CogIcon className={`h-3 w-3 ${wasteTheme.text} opacity-50 group-hover:rotate-90 transition-transform`} />
                                    </div>
                                    <div className="flex items-baseline gap-1 mt-auto">
                                        <span className={`text-3xl font-black tracking-tighter leading-none ${wasteTheme.text} drop-shadow-sm`}>{wasteTheme.display}</span>
                                        <span className={`text-[8px] font-bold uppercase tracking-tighter opacity-80 ${wasteTheme.text}`}>{shiftReport?.wasteLevel === 'high' ? 'ALERT' : 'LEVEL'}</span>
                                    </div>
                                </button>
                            </div>

                            <div className="space-y-12">
                                <div className="flex items-center gap-3 ml-2">
                                    <ClipboardListIcon className="h-5 w-5 text-primary-500"/>
                                    <h3 className="text-[11px] font-black text-primary-600 uppercase tracking-[0.4em]">
                                        {selectedPersonId === ALL_PERSONNEL_ID ? 'Full Shift Deployment Registry' : 'Analyst Performance Log'}
                                    </h3>
                                </div>
                                
                                {selectedPersonId === ALL_PERSONNEL_ID ? (
                                    processedPersonnel.filter(p => Object.keys(p.summary).length > 0).map(person => renderPersonnelSection(person))
                                ) : (
                                    activePerson ? renderPersonnelSection(activePerson) : (
                                        <div className="flex flex-col items-center justify-center opacity-10 text-base-300 py-20">
                                            <UserGroupIcon className="h-24 w-24 mb-4" />
                                            <span className="text-xl font-black uppercase tracking-[0.5em] text-base-400">Mission Log Empty</span>
                                        </div>
                                    )
                                )}

                                {selectedPersonId === ALL_PERSONNEL_ID && processedPersonnel.every(p => Object.keys(p.summary).length === 0) && (
                                    <div className="py-20 text-center opacity-10 flex flex-col items-center">
                                        <BeakerIcon className="h-20 w-20 mb-4" />
                                        <span className="text-sm font-black uppercase tracking-[0.5em]">No Missions Assigned this Shift</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {notification && (<div className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-10 py-5 rounded-[2.5rem] shadow-2xl z-[200] animate-slide-in-up flex items-center gap-4 border-2 backdrop-blur-3xl bg-white/10 ${notification.isError ? 'bg-red-600 border-red-400 text-white' : 'bg-emerald-600 border-emerald-400 text-white'}`}><CheckCircleIcon className="h-5 w-5"/><span className="font-black text-sm uppercase tracking-widest">{notification.message}</span></div>)}
        </div>
    );
};

export default DashboardTab;
