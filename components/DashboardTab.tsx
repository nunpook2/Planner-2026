
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Tester, AssignedTask, RawTask, ShiftReport, DailySchedule, AssignedPrepareTask, CategorizedTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, getShiftReport, saveShiftReport, getDailySchedule, getAssignedPrepareTasks, getCategorizedTasks,
} from '../services/dataService';
import { 
    CheckCircleIcon, AlertTriangleIcon, 
    UserGroupIcon, RefreshIcon, 
    BeakerIcon, CalendarIcon,
    SunIcon, MoonIcon, DownloadIcon,
    XCircleIcon, SparklesIcon,
    TrashIcon
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
    isOverPlan?: boolean;
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
    hasOverPlanItems?: boolean;
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

const parseTaskQty = (task: RawTask): number => {
    const val = getTaskValue(task, 'Quantity');
    if (typeof val === 'number') return val;
    if (!val) return 1;
    const match = String(val).match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : 1;
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
    useEffect(() => { if (isOpen) { setWasteLevel(report?.wasteLevel || 'low'); setNote(report?.infrastructureNote || ''); } }, [isOpen, report]);
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
                                <button key={lv} onClick={() => setWasteLevel(lv)} className={`relative group px-8 py-6 rounded-[2rem] border-2 transition-all duration-500 text-left flex items-center justify-between ${wasteLevel === lv ? lv === 'low' ? 'bg-emerald-600 border-emerald-400 text-white shadow-[0_20px_40px_-10px_rgba(16,185,129,0.5)] scale-[1.02]' : lv === 'medium' ? 'bg-amber-500 border-amber-300 text-white shadow-[0_20px_40px_-10px_rgba(245,158,11,0.5)] scale-[1.02]' : 'bg-red-600 border-red-400 text-white shadow-[0_20px_40px_-10px_rgba(220,38,38,0.5)] scale-[1.02]' : 'bg-base-50 dark:bg-base-800 border-base-100 dark:border-base-700 text-base-400 hover:border-base-300 hover:bg-white'}`}>
                                    <div className="flex flex-col"><span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${wasteLevel === lv ? 'text-white/60' : 'text-base-400'}`}>Level Status</span><span className="text-2xl font-black uppercase tracking-tighter">{lv === 'low' ? 'Low / Safe' : lv === 'medium' ? 'Medium / Full' : 'High / Overflow'}</span></div>
                                    <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all ${wasteLevel === lv ? 'bg-white border-white/20' : 'border-base-200 bg-transparent'}`}>{wasteLevel === lv && <CheckCircleIcon className={`h-5 w-5 ${lv === 'low' ? 'text-emerald-600' : lv === 'medium' ? 'text-amber-500' : 'text-red-600'}`} />}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3"><h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-400 ml-4">Operational Notes</h4><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add mission-critical notes about waste or environment..." rows={3} className="w-full p-6 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[2rem] text-sm font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white resize-none transition-all"/></div>
                </div>
                <div className="p-8 border-t border-base-100 dark:border-base-800 flex flex-col gap-3">
                    <button onClick={() => onSave({ id: `${date}_${shift}`, date, shift, instruments: [], wasteLevel, cleanliness: 'good', infrastructureNote: note, cleanlinessNote: '' })} className="w-full py-5 bg-primary-600 text-white font-black rounded-[1.5rem] shadow-xl hover:brightness-110 transition-all uppercase tracking-[0.2em] text-[12px] border-b-4 border-primary-800">Commit Lab Report</button>
                    <button onClick={onClose} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest transition-colors">Discard Changes</button>
                </div>
            </div>
        </div>
    );
};

const DashboardTab: React.FC<DashboardTabProps> = ({ testers, selectedDate, onDateChange, selectedShift, onShiftChange }) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [returnedPool, setReturnedPool] = useState<CategorizedTask[]>([]);
    const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(ALL_PERSONNEL_ID);

    const fetchData = useCallback(async () => {
        setIsFetching(true);
        try {
            const [assigned, pool, report, dailySched, prepared] = await Promise.all([ getAssignedTasks(), getCategorizedTasks(), getShiftReport(selectedDate, selectedShift), getDailySchedule(selectedDate), getAssignedPrepareTasks() ]);
            setAssignedTasks((assigned || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setPrepareTasks((prepared || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setReturnedPool((pool || []).filter(t => t.isReturnedPool === true)); 
            setSchedule(dailySched);
            setShiftReport(report);
        } catch (e) { console.error(e); } finally { setIsFetching(false); }
    }, [selectedDate, selectedShift]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const globalStats = useMemo(() => {
        let total = 0, done = 0, poCat = 0, lsp = 0, sprint = 0, urgent = 0;
        const processGroup = (groupTasks: RawTask[], category: TaskCategory) => {
             groupTasks.forEach(t => {
                const taskQty = parseTaskQty(t);
                total += taskQty;
                const priority = getPriorityStatus(t, category);
                if (priority === 'lsp') lsp += taskQty;
                else if (priority === 'sprint') sprint += taskQty;
                else if (priority === 'urgent') urgent += taskQty;
                else if (priority === 'pocat') poCat += taskQty;
                if (t.status === TaskStatus.Done || t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing') done += taskQty;
            });
        };
        assignedTasks.forEach(g => processGroup(g.tasks, g.category));
        prepareTasks.forEach(g => processGroup(g.tasks, g.category));
        returnedPool.forEach(g => {
            const docDate = g.returnedDate;
            if (g.shift === selectedShift && docDate === selectedDate) {
                const returnedItemsOnly = g.tasks.filter(t => t.isReturned);
                processGroup(returnedItemsOnly, g.category);
            }
        });
        return { total, done, poCat, lsp, sprint, urgent, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
    }, [assignedTasks, prepareTasks, returnedPool, selectedDate, selectedShift]);

    const processedPersonnel = useMemo(() => {
        const stats: Record<string, PersonStats> = {};
        if (schedule) {
            const activeShiftIds = selectedShift === 'day' ? [...(schedule.dayShiftTesters || []), ...(schedule.dayShiftAssistants || [])] : [...(schedule.nightShiftTesters || []), ...(schedule.nightShiftAssistants || [])];
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
            const taskQty = parseTaskQty(task);
            const isOverPlan = task.isOverPlan === true;
            const priority = isPrep ? 'normal' : getPriorityStatus(task, cat);
            const rawDesc = String(getTaskValue(task, 'Description') || 'General Task');
            const desc = isPrep ? `[PREP] ${rawDesc}` : rawDesc;
            const status = isReady ? 'done' : (task.status === TaskStatus.NotOK ? 'failed' : (task.isReturned ? 'returned' : 'pending'));
            if (status !== 'done') person.pendingTasks += taskQty;
            const summaryKey = `${person.id}_${desc}`;
            if (!person.summary[summaryKey]) {
                person.summary[summaryKey] = { desc, total: 0, done: 0, failed: 0, returned: 0, priorityStatus: priority, isManual: task.ManualEntry === true || cat === TaskCategory.Manual, isPrepGroup: isPrep, samples: [] };
            }
            const item = person.summary[summaryKey];
            item.total += taskQty;
            if (status === 'done') item.done += taskQty;
            if (status === 'failed') item.failed += taskQty;
            if (status === 'returned') item.returned += taskQty;
            if (isOverPlan) item.hasOverPlanItems = true;
            if (!isPrep) {
                const priorities = ['lsp', 'sprint', 'urgent', 'pocat', 'normal'];
                if (priorities.indexOf(priority) < priorities.indexOf(item.priorityStatus)) item.priorityStatus = priority;
            }
            item.samples.push({ name: String(getTaskValue(task, 'Sample Name') || 'N/A'), qty: String(taskQty), detail: String(getTaskValue(task, 'Variant') || '-'), status: status, isManual: item.isManual, isPrep: isPrep, isOverPlan: isOverPlan, reason: task.notOkReason || task.returnReason || undefined });
        };
        assignedTasks.forEach(g => (g.tasks || []).forEach(t => addActivity(g.testerId, t, g.category, t.status === TaskStatus.Done, false)));
        prepareTasks.forEach(g => (g.tasks || []).forEach(t => { const isDone = t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing'; addActivity(g.assistantId, t, g.category, isDone, true); }));
        returnedPool.forEach(g => {
            const docDate = g.returnedDate;
            if (g.shift === selectedShift && docDate === selectedDate) {
                const person = testers.find(t => t.name.trim().toLowerCase() === String(g.returnedBy || '').trim().toLowerCase());
                if (person) {
                    const isPrep = g.isPrep === true;
                    (g.tasks || []).forEach(t => { if (t.isReturned && t.returnedBy === person.name) addActivity(person.id, t, g.category, false, isPrep); });
                }
            }
        });
        return Object.values(stats).sort((a, b) => b.pendingTasks - a.pendingTasks);
    }, [assignedTasks, prepareTasks, returnedPool, schedule, testers, selectedShift, selectedDate]);

    const activePerson = useMemo(() => {
        if (!selectedPersonId || selectedPersonId === ALL_PERSONNEL_ID) return null;
        return processedPersonnel.find(p => p.id === selectedPersonId) || null;
    }, [processedPersonnel, selectedPersonId]);

    const handleSaveReport = async (report: ShiftReport) => {
        try { await saveShiftReport(report); fetchData(); setNotification({ message: "Lab report committed successfully.", isError: false }); setIsReportModalOpen(false); } catch (e) { setNotification({ message: "Failed to save report.", isError: true }); }
    };

    const handleExport = () => {
        const exportData = processedPersonnel.flatMap(person => (Object.values(person.summary) as SummaryItemStats[]).flatMap((sum: SummaryItemStats) => sum.samples.map(sample => ({ 'Staff Name': person.name, 'Work Type': sample.isPrep ? 'Preparation' : 'Testing', 'Mission Desc': sum.desc, 'Sample Name': sample.name, 'Qty': sample.qty, 'Details': sample.detail, 'Status': sample.status, 'Over Plan': sample.isOverPlan ? 'YES' : 'NO', 'Issue/Reason': sample.reason || '-' }))));
        const ws = XLSX.utils.json_to_sheet(exportData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Shift Summary"); XLSX.writeFile(wb, `ShiftSummary_${selectedDate}_${selectedShift}.xlsx`);
    };

    const wasteTheme = useMemo(() => {
        const level = shiftReport?.wasteLevel || 'none';
        switch(level) {
            case 'high': return { bg: 'bg-red-600', text: 'text-red-50', badge: 'bg-red-955 text-red-400', glow: 'shadow-[0_20px_50px_-10px_rgba(220,38,38,0.5)]', label: 'Over Capacity', display: 'HIGH' };
            case 'medium': return { bg: 'bg-amber-500', text: 'text-amber-50', badge: 'bg-amber-955 text-amber-300', glow: 'shadow-[0_20px_50px_-10px_rgba(245,158,11,0.5)]', label: 'Limited Space', display: 'MEDIUM' };
            case 'low': return { bg: 'bg-emerald-600', text: 'text-emerald-50', badge: 'bg-emerald-955 text-emerald-400', glow: 'shadow-[0_20px_50px_-10px_rgba(16,185,129,0.5)]', label: 'Optimal', display: 'LOW' };
            default: return { bg: 'bg-white dark:bg-base-900', text: 'text-base-400 dark:text-base-500', badge: 'bg-base-100 dark:bg-base-800 text-base-400', glow: 'shadow-none', label: 'Not Set', display: 'N/A' };
        }
    }, [shiftReport]);

    const renderPersonnelBoardCard = (person: PersonStats) => {
        const missions = Object.entries(person.summary);
        if (missions.length === 0) return null;
        const totalDone = (Object.values(person.summary) as SummaryItemStats[]).reduce((acc: number, s: SummaryItemStats) => acc + s.done, 0);
        const totalAll = (Object.values(person.summary) as SummaryItemStats[]).reduce((acc: number, s: SummaryItemStats) => acc + s.total, 0);
        const isCompleted = totalDone === totalAll && totalAll > 0;
        const totalOverPlanCount = (Object.values(person.summary) as SummaryItemStats[]).reduce((acc: number, s: SummaryItemStats) => acc + (s.samples ? s.samples.filter(x => x.isOverPlan).length : 0), 0);

        return (
            <div key={person.id} className="bg-white dark:bg-base-900 rounded-[2.5rem] border-2 border-base-200 dark:border-base-800 shadow-xl overflow-hidden flex flex-col h-full hover:border-indigo-500 transition-all duration-300 animate-fade-in group relative">
                {/* HIGH IMPACT OVER PLAN BADGE */}
                {totalOverPlanCount > 0 && (
                    <div className="absolute top-0 right-0 z-10 px-4 py-1.5 bg-gradient-to-l from-indigo-600 to-violet-600 text-white rounded-bl-3xl shadow-xl animate-pulse ring-2 ring-indigo-400/30">
                        <div className="flex flex-col items-center leading-none">
                            <span className="text-[14px] font-black tracking-tighter">⚡ +{totalOverPlanCount}</span>
                            <span className="text-[7px] font-black uppercase tracking-[0.2em] mt-0.5">OVER PLAN</span>
                        </div>
                    </div>
                )}

                <div className={`px-6 py-4 flex items-center justify-between border-b-2 border-base-50 dark:border-base-800 ${person.role === 'ASST' ? 'bg-amber-50/30 dark:bg-amber-900/10' : 'bg-primary-50/30 dark:bg-primary-900/10'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-black text-white shadow-lg ${person.role === 'ASST' ? 'person-avatar assistant' : 'person-avatar'}`}>
                            {person.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h4 className="text-[16px] font-black text-base-955 dark:text-base-50 uppercase tracking-tighter leading-none">{person.name}</h4>
                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] mt-1 block ${person.role === 'ASST' ? 'text-amber-600' : 'text-primary-600'}`}>
                                {person.role === 'ASST' ? 'Assistant' : 'Analyst'}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end pr-10">
                        <div className={`text-[20px] font-black tracking-tighter ${isCompleted ? 'text-emerald-600' : 'text-primary-700'}`}>
                            {totalDone}<span className="text-base-300 mx-0.5 font-normal text-sm">/</span>{totalAll}
                        </div>
                    </div>
                </div>

                <div className="w-full h-1.5 bg-base-100 dark:bg-base-800 overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${isCompleted ? 'bg-emerald-500' : 'bg-primary-600'}`} style={{width: totalAll > 0 ? `${(totalDone/totalAll)*100}%` : '0%'}}></div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar max-h-[500px]">
                    {(missions as [string, SummaryItemStats][]).map(([key, sum]) => {
                        const isSumComplete = sum.done === sum.total;
                        const hasSumError = sum.failed > 0 || sum.returned > 0;
                        return (
                            <div key={key} className={`p-4 rounded-2xl border-2 transition-all ${sum.hasOverPlanItems ? 'bg-indigo-50/20 border-indigo-200/50 shadow-sm' : isSumComplete ? 'bg-emerald-50/10 border-emerald-100/50' : hasSumError ? 'bg-red-50/10 border-red-100 shadow-md' : 'bg-base-50/30 dark:bg-base-800/40 border-base-100 dark:border-base-700'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col pr-2">
                                        <h5 className={`text-[13px] font-black leading-tight uppercase ${isSumComplete ? 'text-emerald-900/40' : 'text-base-955 dark:text-base-100'}`}>
                                            {sum.desc}
                                        </h5>
                                        {sum.hasOverPlanItems && <span className="text-[7px] font-black text-indigo-600 uppercase tracking-widest mt-1 animate-pulse">⚡ OVER PLAN MISSION</span>}
                                    </div>
                                    <span className={`text-[13px] font-black shrink-0 ${isSumComplete ? 'text-emerald-600/50' : hasSumError ? 'text-red-600' : 'text-primary-600'}`}>
                                        {sum.done}/{sum.total}
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    {sum.samples.map((s, si) => {
                                        const isSampleActioned = s.status === 'done' || s.status === 'failed' || s.status === 'returned';
                                        return (
                                            <div key={si} className="flex flex-col gap-1">
                                                <div className={`flex items-center justify-between text-[11px] font-bold p-1 rounded ${s.isOverPlan ? 'bg-indigo-50 dark:bg-indigo-900/10 border-l-2 border-indigo-400' : ''}`}>
                                                    <div className="flex items-center gap-1 min-w-0">
                                                        <span className={`px-1.5 py-0.5 rounded bg-base-100 dark:bg-base-700 text-[9px] font-black`}>x{s.qty}</span>
                                                        <span className={`truncate max-w-[120px] uppercase ${isSampleActioned ? 'opacity-40' : 'text-base-700 dark:text-base-300'}`}>{s.name}</span>
                                                        {s.isOverPlan && <span className="text-[10px] text-indigo-600 animate-pulse-subtle shrink-0" title="Over Plan Item">⚡</span>}
                                                    </div>
                                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase ${
                                                        s.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 
                                                        s.status === 'failed' ? 'bg-red-600 text-white shadow-lg animate-pulse' : 
                                                        s.status === 'returned' ? 'bg-orange-600 text-white shadow-lg animate-pulse' : 'text-base-400'
                                                    }`}>
                                                        {s.status}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="px-6 py-3 bg-base-50/50 dark:bg-base-800/30 text-center">
                    <button onClick={() => setSelectedPersonId(person.id)} className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-600 hover:text-primary-700 transition-colors">View Performance Profile</button>
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
                .active-glow { box-shadow: 0 0 25px -5px rgba(99, 102, 241, 0.4); }
                @keyframes achievement-pulse { 0% { text-shadow: 0 0 5px #4f46e5; transform: scale(1); } 50% { text-shadow: 0 0 15px #06b6d4; transform: scale(1.05); } 100% { text-shadow: 0 0 5px #4f46e5; transform: scale(1); } }
                .neon-achievement-text { animation: achievement-pulse 2s ease-in-out infinite; font-weight: 900; letter-spacing: -0.05em; }
                @keyframes waste-pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }
                .waste-pulse-active { animation: waste-pulse 2s ease-in-out infinite; }
            `}</style>

            <ReportEditorModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} report={shiftReport} onSave={handleSaveReport} date={selectedDate} shift={selectedShift} />
            {notification && ( <div className={`fixed bottom-10 right-10 z-[110] px-6 py-4 rounded-2xl shadow-2xl animate-slide-in-up flex items-center gap-3 font-black text-xs uppercase tracking-widest ${notification.isError ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}> <CheckCircleIcon className="h-5 w-5" /> {notification.message} </div> )}

            <div className="flex-grow grid grid-cols-12 gap-5 h-full relative overflow-hidden">
                <aside className="col-span-1 flex flex-col bg-white dark:bg-base-900 rounded-[2rem] border border-base-200 dark:border-base-800 shadow-xl overflow-hidden h-full backdrop-blur-md">
                    <div className="flex-grow overflow-y-auto no-scrollbar p-3 space-y-3">
                        <button onClick={() => setSelectedPersonId(ALL_PERSONNEL_ID)} title="Combined Dashboard" className={`w-full h-12 rounded-2xl flex items-center justify-center transition-all duration-300 border-2 ${selectedPersonId === ALL_PERSONNEL_ID ? 'bg-base-955 border-base-800 text-white shadow-xl' : 'bg-base-50 dark:bg-base-800 border-transparent text-base-400 hover:border-base-200'}`}><SparklesIcon className="h-6 w-6" /></button>
                        <div className="h-px bg-base-100 dark:bg-base-800"></div>
                        {processedPersonnel.map(person => { const isActive = selectedPersonId === person.id; return ( <button key={person.id} onClick={() => setSelectedPersonId(person.id)} title={person.name} className={`w-full h-12 rounded-2xl flex items-center justify-center text-[12px] font-black shadow-inner transition-all border-2 ${isActive ? 'bg-primary-600 text-white border-primary-500 shadow-lg active-glow' : 'bg-base-50 dark:bg-base-800 text-base-400 border-transparent hover:border-base-200'}`}>{person.name.substring(0, 2).toUpperCase()}</button> ); })}
                    </div>
                    <div className="p-3 border-t border-base-100 dark:border-base-800"><button onClick={fetchData} className="w-full h-12 rounded-2xl bg-base-50 dark:bg-base-800 flex items-center justify-center text-base-400"><RefreshIcon className={`h-5 w-5 ${isFetching ? 'animate-spin text-primary-600' : ''}`}/></button></div>
                </aside>

                <div className="col-span-11 flex flex-col min-w-0 bg-white dark:bg-base-900 rounded-[3rem] border border-base-200 dark:border-base-800 shadow-2xl overflow-hidden relative backdrop-blur-xl h-full">
                    <div className="px-8 py-6 border-b border-base-100 dark:border-base-800 flex flex-col gap-6 bg-base-50/30 dark:bg-base-800/10 shrink-0 sticky top-0 z-20 backdrop-blur-xl">
                        <div className="flex justify-between items-center">
                            <div><h2 className="text-3xl font-black text-base-955 dark:text-white tracking-tighter leading-none italic">Shift Intelligence</h2><p className="text-[11px] text-base-400 font-black uppercase tracking-[0.4em] mt-2">Laboratory Performance Board</p></div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-4 bg-white dark:bg-base-800 p-2 rounded-[2rem] border-2 border-base-100 dark:border-base-700 shadow-inner"><div className="relative group px-4 border-r dark:border-base-700"><CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-600" /><input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="bg-transparent border-none text-[13px] font-black focus:ring-0 cursor-pointer pl-6 py-2 dark:text-white" /></div><div className="flex gap-2 p-1"><button onClick={() => onShiftChange('day')} className={`flex items-center gap-2.5 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedShift === 'day' ? 'bg-amber-500 text-white shadow-lg' : 'text-base-400 hover:text-amber-600'}`}><SunIcon className="h-4 w-4" /> Day</button><button onClick={() => onShiftChange('night')} className={`flex items-center gap-2.5 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedShift === 'night' ? 'bg-indigo-700 text-white shadow-lg' : 'text-base-400 hover:text-indigo-700'}`}><MoonIcon className="h-4 w-4" /> Night</button></div></div>
                                <button onClick={handleExport} className="p-4 bg-white dark:bg-base-800 hover:bg-base-50 rounded-2xl border-2 border-base-100 dark:border-base-700 shadow-sm text-base-500"><DownloadIcon className="h-6 w-6"/></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-6 gap-4">
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-primary-600 uppercase tracking-widest mb-1">Global Success</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.percent}%</span><span className="text-[11px] font-bold text-base-400">({globalStats.done}/{globalStats.total})</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Po Cat Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.poCat}</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-cyan-600 uppercase tracking-widest mb-1">LSP Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.lsp}</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Sprint Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.sprint}</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Urgent Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-red-600">{globalStats.urgent}</span></div></div>
                            <button onClick={() => setIsReportModalOpen(true)} className={`rounded-2xl p-4 shadow-xl border-2 transition-all flex flex-col justify-center ${wasteTheme.bg} border-transparent ${shiftReport?.wasteLevel === 'high' ? 'waste-pulse-active' : ''}`}><span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${wasteTheme.text} opacity-80`}>Waste Status</span><span className={`text-2xl font-black ${wasteTheme.text}`}>{wasteTheme.display}</span></button>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar p-8">
                        {selectedPersonId === ALL_PERSONNEL_ID ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                                {processedPersonnel.filter(p => Object.keys(p.summary).length > 0).map(person => renderPersonnelBoardCard(person))}
                                {processedPersonnel.every(p => Object.keys(p.summary).length === 0) && ( <div className="col-span-full py-40 text-center opacity-10 flex flex-col items-center"> <BeakerIcon className="h-32 w-32 mb-6" /> <span className="text-2xl font-black uppercase tracking-[0.5em]">No Active Missions</span> </div> )}
                            </div>
                        ) : (
                            <div className="max-w-6xl mx-auto">
                                {activePerson ? (
                                    <div className="animate-fade-in">
                                        <div className="flex items-center justify-between mb-8 px-6 py-6 bg-white dark:bg-base-900 rounded-[2.5rem] border-2 border-base-100 dark:border-base-800 shadow-xl overflow-hidden relative">
                                            {/* LARGE ACHIEVEMENT WATERMARK */}
                                            {(Object.values(activePerson.summary) as SummaryItemStats[]).some((s: SummaryItemStats) => s.samples && s.samples.some(x => x.isOverPlan)) && (
                                                <div className="absolute right-[-20px] top-[20px] rotate-12 opacity-5 pointer-events-none">
                                                    <span className="text-[120px] font-black italic uppercase">OVER PLAN</span>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-6">
                                                <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center text-2xl font-black text-white shadow-2xl ${activePerson.role === 'ASST' ? 'person-avatar assistant' : 'person-avatar'}`}> {activePerson.name.substring(0, 2).toUpperCase()} </div>
                                                <div>
                                                    <h3 className="text-4xl font-black text-base-955 dark:text-white tracking-tighter uppercase leading-none">{activePerson.name}</h3>
                                                    <span className={`text-xs font-black uppercase tracking-[0.4em] mt-3 block ${activePerson.role === 'ASST' ? 'text-amber-600' : 'text-primary-600'}`}>Mission Integrity Analysis</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-black text-base-400 uppercase tracking-widest mb-1">Success Rate</span>
                                                <span className="text-4xl font-black text-primary-700"> {(Object.values(activePerson.summary) as SummaryItemStats[]).reduce((acc: number, s: SummaryItemStats) => acc + s.done, 0)} <span className="text-base-200 mx-1 font-normal">/</span> {(Object.values(activePerson.summary) as SummaryItemStats[]).reduce((acc: number, s: SummaryItemStats) => acc + s.total, 0)} </span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {(Object.entries(activePerson.summary) as [string, SummaryItemStats][]).map(([key, sum]) => (
                                                <div key={key} className={`bg-white dark:bg-base-900 rounded-[2rem] border-2 p-8 shadow-lg transition-all ${sum.hasOverPlanItems ? 'border-indigo-400 dark:border-indigo-800' : 'border-base-100 dark:border-base-800'}`}>
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div className="flex flex-col pr-4">
                                                            <h4 className="text-xl font-black uppercase text-base-955 dark:text-white leading-tight">{sum.desc}</h4>
                                                            {sum.hasOverPlanItems && <span className="text-[11px] font-black bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-1.5 rounded-full uppercase tracking-[0.2em] mt-3 w-fit neon-achievement-text shadow-lg">⚡ OVER PLAN MISSION</span>}
                                                        </div>
                                                        <span className="text-2xl font-black text-primary-600">{sum.done}/{sum.total}</span>
                                                    </div>
                                                    <div className="space-y-4">
                                                        {sum.samples.map((s, si) => (
                                                            <div key={si} className={`flex flex-col p-4 rounded-2xl border transition-all ${s.isOverPlan ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-400 shadow-md transform scale-[1.02]' : 'bg-base-50/50 dark:bg-base-800/50 border-base-100 dark:border-base-700'}`}>
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className={`px-2 py-1 rounded bg-white dark:bg-base-700 text-[11px] font-black shadow-sm ${s.isOverPlan ? 'text-indigo-600' : ''}`}>x{s.qty}</span>
                                                                        <span className={`text-[15px] font-black uppercase text-base-900 dark:text-base-100 truncate ${s.isOverPlan ? 'text-indigo-900 dark:text-indigo-200' : ''}`}>{s.name}</span>
                                                                        {s.isOverPlan && <span className="text-[12px] font-black text-indigo-600 animate-pulse shrink-0">⚡</span>}
                                                                    </div>
                                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${ s.status === 'done' ? 'bg-emerald-100 text-emerald-700' : s.status === 'failed' ? 'bg-red-600 text-white animate-pulse' : s.status === 'returned' ? 'bg-orange-600 text-white animate-pulse' : 'text-base-400' }`}> {s.status} </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : ( <div className="py-40 text-center opacity-10 flex flex-col items-center"> <BeakerIcon className="h-32 w-32 mb-6" /> <span className="text-2xl font-black uppercase tracking-[0.5em]">Personnel data not found</span> </div> )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
export default DashboardTab;
