
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AssignedTask, RawTask, DistillationLog, Tester, AssignedPrepareTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, 
    updateAssignedTask, 
    getAssignedPrepareTasks,
    logResolutionEntries,
    getResolutionHistory,
    getDistillationLogs,
    addDistillationLog,
    updateDistillationLog,
    deleteDistillationLog
} from '../services/dataService';
import { 
    AlertTriangleIcon, CheckCircleIcon, 
    RefreshIcon, BeakerIcon, CalendarIcon,
    XCircleIcon, UserGroupIcon, DownloadIcon,
    SparklesIcon, PlusIcon, TrashIcon, ArrowUpIcon,
    ClipboardListIcon, PencilIcon, ChevronDownIcon,
    DatabaseIcon, SearchIcon, ClockIcon
} from './common/Icons';

declare const XLSX: any;

const CHEMICAL_OPTIONS = ['Methanol', 'Ethanol', 'Hexane', 'Acetone', 'Acetonitrile', 'Isopropanol', 'Xylene', 'Toluene'];

interface FlattenedNotOkTask {
    docId: string;
    originalDoc: AssignedTask;
    task: RawTask;
    taskIndex: number;
}

interface GroupedByRequest {
    requestId: string;
    earliestDate: string;
    category: string;
    oldestDays: number;
    tasksByDescription: Record<string, FlattenedNotOkTask[]>;
    allTasks: FlattenedNotOkTask[];
}

interface AnalystPerformance {
    name: string;
    backlogCount: number;
    activeMaxDays: number;
    historicalAvgDays: number;
    historicalCount: number;
    severity: 'low' | 'medium' | 'high';
}

interface OverPlanContribution {
    personName: string;
    date: string;
    requestId: string;
    testDesc: string;
    variant: string;
    qty: number;
    isPrep: boolean;
    status: string;
}

const getTaskValue = (task: RawTask, header: string): any => {
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

// --- CHART & VISUAL COMPONENTS ---

const AchievementLeaderboard: React.FC<{ 
    data: { name: string, value: number }[],
    selectedName: string | null,
    onSelect: (name: string) => void
}> = ({ data, selectedName, onSelect }) => {
    const maxVal = Math.max(...data.map(d => d.value), 1);
    return (
        <div className="space-y-6 py-6">
            {data.map((item, i) => {
                const isSelected = selectedName === item.name;
                return (
                    <div 
                        key={i} 
                        onClick={() => onSelect(item.name)}
                        className={`flex items-center gap-6 group cursor-pointer p-2 rounded-3xl transition-all duration-300 ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 scale-[1.02]' : 'hover:bg-slate-50 dark:hover:bg-base-800/40'}`}
                    >
                        <div className="w-28 shrink-0 text-right">
                            <span className={`text-[12px] font-black uppercase tracking-tighter truncate block transition-colors ${isSelected ? 'text-indigo-600' : 'text-slate-800 dark:text-slate-100 group-hover:text-indigo-600'}`}>
                                {item.name}
                            </span>
                        </div>
                        <div className={`flex-grow h-12 bg-slate-100 dark:bg-base-955 rounded-2xl overflow-hidden relative shadow-inner border transition-all duration-500 ${isSelected ? 'border-cyan-400 ring-2 ring-cyan-400/20' : 'border-slate-200 dark:border-base-800'}`}>
                            <div 
                                className={`h-full bg-gradient-to-r from-cyan-400 via-indigo-600 to-violet-600 transition-all duration-1000 ease-out flex items-center justify-end px-4 relative ${isSelected ? 'brightness-110 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'group-hover:brightness-110'}`}
                                style={{ width: `${(item.value / maxVal) * 100}%` }}
                            >
                                <div className={`absolute inset-0 bg-white/10 transition-opacity ${isSelected ? 'opacity-30' : 'opacity-0 group-hover:opacity-100'}`}></div>
                                <span className="text-[11px] font-black text-white drop-shadow-md z-10">{item.value} UNITS</span>
                            </div>
                        </div>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 shadow-lg scale-110' : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800'}`}>
                            <span className={`text-[14px] font-black ${isSelected ? 'text-white' : 'text-indigo-700 dark:text-indigo-400'}`}>#{i + 1}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const PerformancePulseChart: React.FC<{ data: { date: string, value: number }[] }> = ({ data }) => {
    const sortedData = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const height = 140;
    const width = 600;
    const padding = 20;

    const points = useMemo(() => {
        if (sortedData.length < 2) return "";
        const step = (width - padding * 2) / (sortedData.length - 1);
        return sortedData.map((d, i) => `${padding + i * step},${height - padding - (d.value / maxVal) * (height - padding * 2)}`).join(" ");
    }, [sortedData, maxVal, width, height, padding]);

    const areaPoints = useMemo(() => {
        if (sortedData.length < 2) return "";
        const step = (width - padding * 2) / (sortedData.length - 1);
        const p = sortedData.map((d, i) => `${padding + i * step},${height - padding - (d.value / maxVal) * (height - padding * 2)}`).join(" ");
        return `${padding},${height - padding} ${p} ${width - padding},${height - padding}`;
    }, [sortedData, maxVal, width, height, padding]);

    return (
        <div className="w-full h-full p-4 flex flex-col justify-center">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible drop-shadow-xl">
                <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                </defs>
                <polygon points={areaPoints} fill="url(#areaGrad)" className="animate-fade-in" />
                <polyline points={points} fill="none" stroke="url(#lineGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="animate-slide-in-up" />
                {sortedData.map((d, i) => {
                    const step = (width - padding * 2) / (sortedData.length - 1);
                    const x = padding + i * step;
                    const y = height - padding - (d.value / maxVal) * (height - padding * 2);
                    return (
                        <g key={i} className="group/dot">
                            <circle cx={x} cy={y} r="4" fill="white" stroke="#4f46e5" strokeWidth="2" className="transition-all group-hover/dot:r-6 cursor-help" />
                        </g>
                    );
                })}
            </svg>
            <div className="flex justify-between mt-4 px-2">
                {sortedData.length > 0 && (
                    <>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sortedData[0].date.split('-').slice(1).join('/')}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TIMELINE TREND</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sortedData[sortedData.length-1].date.split('-').slice(1).join('/')}</span>
                    </>
                )}
            </div>
        </div>
    );
};

const DistillationFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (log: Omit<DistillationLog, 'id' | 'createdAt'>, id?: string) => void;
    testers: Tester[];
    defaultChemical: string | null;
    editTarget: DistillationLog | null;
    allChemicals: string[];
}> = ({ isOpen, onClose, onSave, testers, defaultChemical, editTarget, allChemicals }) => {
    const [chem, setChem] = useState('');
    const [inputVal, setInputVal] = useState<string>('0');
    const [outputVal, setOutputVal] = useState<string>('0');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [user, setUser] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (editTarget) {
                setChem(editTarget.chemicalName);
                setInputVal(editTarget.inputAmount.toString());
                setOutputVal(editTarget.outputAmount.toString());
                setDate(editTarget.date);
                setUser(editTarget.recorderName);
            } else {
                setChem(defaultChemical || allChemicals[0] || CHEMICAL_OPTIONS[0]);
                setInputVal('0');
                setOutputVal('0');
                setDate(new Date().toISOString().split('T')[0]);
                setUser('');
            }
        }
    }, [isOpen, editTarget, defaultChemical, allChemicals]);

    const yieldVal = useMemo(() => {
        const input = parseFloat(inputVal) || 0;
        const output = parseFloat(outputVal) || 0;
        return (input > 0 ? (output / input) * 100 : 0).toFixed(1);
    }, [inputVal, outputVal]);

    if (!isOpen) return null;

    const handleNumericChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) setter(val);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in">
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white" onClick={e => e.stopPropagation()}>
                <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50 dark:bg-base-800">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none italic">
                        {editTarget ? 'Edit Registry' : 'Log Registry'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-base-700 rounded-xl transition-all"><XCircleIcon className="h-6 w-6 text-slate-400" /></button>
                </div>
                <div className="p-10 space-y-8">
                    <div className="space-y-2 relative">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Species (สารเคมี)</label>
                        <div className="relative group">
                            <input 
                                type="text"
                                list="chem-options-list-modal"
                                value={chem} 
                                onChange={e => setChem(e.target.value)} 
                                className="w-full p-5 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-black text-lg outline-none focus:border-indigo-500 transition-all shadow-inner dark:text-white"
                                placeholder="เลือกหรือพิมพ์ชื่อสาร..."
                            />
                            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                                <ChevronDownIcon className="h-6 w-6" />
                            </div>
                        </div>
                        <datalist id="chem-options-list-modal">
                            {allChemicals.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Input (ml)</label>
                            <input type="text" inputMode="decimal" value={inputVal} onChange={handleNumericChange(setInputVal)} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl font-black text-lg outline-none focus:border-indigo-500 dark:text-white" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Output (ml)</label>
                            <input type="text" inputMode="decimal" value={outputVal} onChange={handleNumericChange(setOutputVal)} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl font-black text-lg outline-none focus:border-indigo-500 dark:text-white" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Operator (คนกลั่น)</label>
                        <select 
                            value={user} 
                            onChange={e => setUser(e.target.value)} 
                            className="w-full p-5 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner appearance-none dark:text-white"
                        >
                            <option value="">-- เลือกผู้กลั่น --</option>
                            {testers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className={`p-8 rounded-[2rem] flex justify-between items-center shadow-2xl transition-colors duration-500 ${Number(yieldVal) >= 95 ? 'bg-indigo-600' : 'bg-rose-600'}`}>
                        <span className="text-[12px] font-black text-white/70 uppercase tracking-widest">Yield Efficiency</span>
                        <span className="text-4xl font-black text-white">{yieldVal}%</span>
                    </div>
                </div>
                <div className="px-10 py-8 border-t border-slate-100 dark:border-base-700 flex gap-4 bg-slate-50/50 dark:bg-base-900">
                    <button 
                        onClick={() => onSave({ 
                            chemicalName: chem, inputAmount: parseFloat(inputVal) || 0, outputAmount: parseFloat(outputVal) || 0, yieldPercent: Number(yieldVal), date, recorderName: user 
                        }, editTarget?.id)} 
                        disabled={!user || !chem}
                        className="flex-1 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs disabled:opacity-50"
                    >
                        {editTarget ? 'Update Record' : 'Commit Record'}
                    </button>
                    <button onClick={onClose} className="px-8 py-5 text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest">Discard</button>
                </div>
            </div>
        </div>
    );
};

const QualityDashboard: React.FC<{ onResolve: () => void, testers: Tester[] }> = ({ onResolve, testers }) => {
    const [activeSubTab, setActiveSubTab] = useState<'issues' | 'distillation' | 'overplan'>('issues');
    const [issuesMode, setIssuesMode] = useState<'active' | 'history'>('active');
    const [allAssigned, setAllAssigned] = useState<AssignedTask[]>([]);
    const [allPrepared, setAllPrepared] = useState<AssignedPrepareTask[]>([]);
    const [distLogs, setDistLogs] = useState<DistillationLog[]>([]);
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchAnalyst, setSearchAnalyst] = useState('');
    const [isDistModalOpen, setIsDistModalOpen] = useState(false);
    const [selectedChemical, setSelectedChemical] = useState<string | null>(null);
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, targetItems: FlattenedNotOkTask[] | null, title: string, description: string }>({ isOpen: false, targetItems: null, title: '', description: '' });
    const [distDeleteConfirm, setDistDeleteConfirm] = useState<DistillationLog | null>(null);
    const [editTarget, setEditTarget] = useState<DistillationLog | null>(null);
    
    // OVER PLAN INTERACTIVE STATE
    const [selectedOverPlanAnalyst, setSelectedOverPlanAnalyst] = useState<string | null>(null);

    // Date Filter States
    const [distDateFilter, setDistDateFilter] = useState<'all' | 'week' | 'month' | 'specific'>('all');
    const [specificMonth, setSpecificMonth] = useState(new Date().toISOString().slice(0, 7)); 

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [assigned, prepared, dist, history] = await Promise.all([ 
                getAssignedTasks(), 
                getAssignedPrepareTasks(),
                getDistillationLogs(),
                getResolutionHistory()
            ]);
            setAllAssigned(assigned || []);
            setAllPrepared(prepared || []);
            setDistLogs(dist || []);
            setHistoryLogs(history || []);
            if (!selectedChemical && dist.length > 0) setSelectedChemical(dist[0].chemicalName);
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    }, [selectedChemical]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const allChemicals = useMemo(() => {
        const historical = distLogs.map(l => l.chemicalName);
        const unique = Array.from(new Set([...CHEMICAL_OPTIONS, ...historical]));
        return unique.sort();
    }, [distLogs]);

    const getDaysDiff = (assignedDate: string) => {
        if (!assignedDate) return 0;
        const start = new Date(assignedDate);
        const today = new Date();
        start.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
        return Math.max(1, Math.ceil(Math.abs(today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    };

    // --- OVER PLAN ANALYTICS ---
    const overPlanData = useMemo(() => {
        const results: OverPlanContribution[] = [];
        const filterThreshold = distDateFilter === 'week' ? 7 : distDateFilter === 'month' ? 30 : 999;
        const now = new Date();
        now.setHours(0,0,0,0);

        const isWithinFilter = (dateStr: string) => {
            if (distDateFilter === 'all') return true;
            if (distDateFilter === 'specific') return dateStr.startsWith(specificMonth);
            const d = new Date(dateStr);
            const diff = Math.ceil(Math.abs(now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            return diff <= filterThreshold;
        };
        
        // Execution
        allAssigned.forEach(doc => {
            if (!isWithinFilter(doc.assignedDate)) return;
            doc.tasks.forEach(t => {
                if (t.isOverPlan) {
                    results.push({
                        personName: doc.testerName, date: doc.assignedDate, requestId: doc.requestId,
                        testDesc: String(getTaskValue(t, 'Description') || 'Test'),
                        variant: String(getTaskValue(t, 'Variant') || '-'),
                        qty: parseTaskQty(t), isPrep: false, status: t.status || 'Pending'
                    });
                }
            });
        });

        // Preparation
        allPrepared.forEach(doc => {
            if (!isWithinFilter(doc.assignedDate)) return;
            doc.tasks.forEach(t => {
                if (t.isOverPlan) {
                    results.push({
                        personName: doc.assistantName, date: doc.assignedDate, requestId: doc.requestId,
                        testDesc: String(getTaskValue(t, 'Description') || 'Prep'),
                        variant: String(getTaskValue(t, 'Variant') || '-'),
                        qty: parseTaskQty(t), isPrep: true, status: t.preparationStatus === 'Prepared' ? 'Ready' : 'Pending'
                    });
                }
            });
        });

        return results.sort((a, b) => b.date.localeCompare(a.date));
    }, [allAssigned, allPrepared, distDateFilter, specificMonth]);

    const overPlanLeaderboard = useMemo(() => {
        const stats: Record<string, number> = {};
        overPlanData.forEach(d => { stats[d.personName] = (stats[d.personName] || 0) + d.qty; });
        return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [overPlanData]);

    const filteredOverPlanDataForTable = useMemo(() => {
        if (!selectedOverPlanAnalyst) return overPlanData;
        return overPlanData.filter(d => d.personName === selectedOverPlanAnalyst);
    }, [overPlanData, selectedOverPlanAnalyst]);

    const overPlanTimeline = useMemo(() => {
        const stats: Record<string, number> = {};
        overPlanData.forEach(d => { stats[d.date] = (stats[d.date] || 0) + d.qty; });
        return Object.entries(stats).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    }, [overPlanData]);

    const totalOverPlanUnits = useMemo(() => overPlanData.reduce((acc, curr) => acc + curr.qty, 0), [overPlanData]);

    // Issues Logic
    const performanceData = useMemo(() => {
        const stats: Record<string, { currentCount: number, activeMaxDays: number }> = {};
        const historyStats: Record<string, { totalDays: number, count: number }> = {};
        allAssigned.forEach(doc => {
            const notOkTasks = (doc.tasks || []).filter(t => t.status === TaskStatus.NotOK);
            if (notOkTasks.length > 0) {
                const days = getDaysDiff(doc.assignedDate);
                if (!stats[doc.testerName]) stats[doc.testerName] = { currentCount: 0, activeMaxDays: 0 };
                stats[doc.testerName].currentCount += notOkTasks.length;
                if (days > stats[doc.testerName].activeMaxDays) stats[doc.testerName].activeMaxDays = days;
            }
        });
        historyLogs.forEach(h => {
            if (!historyStats[h.testerName]) historyStats[h.testerName] = { totalDays: 0, count: 0 };
            historyStats[h.testerName].totalDays += (Number(h.daysToResolve) || 0);
            historyStats[h.testerName].count++;
        });
        const mergedNames = new Set([...Object.keys(stats), ...Object.keys(historyStats)]);
        return Array.from(mergedNames).map(name => {
            const current = stats[name] || { currentCount: 0, activeMaxDays: 0 };
            const hist = historyStats[name] || { totalDays: 0, count: 0 };
            const histAvg = hist.count > 0 ? Math.round(hist.totalDays / hist.count) : 0;
            let severity: 'low' | 'medium' | 'high' = 'low';
            if (current.activeMaxDays >= 4) severity = 'high'; else if (current.activeMaxDays >= 2) severity = 'medium';
            return { name, backlogCount: current.currentCount, activeMaxDays: current.activeMaxDays, historicalAvgDays: histAvg, historicalCount: hist.count, severity } as AnalystPerformance;
        }).sort((a, b) => b.backlogCount - a.backlogCount);
    }, [allAssigned, historyLogs]);

    const groupedIssuesData: GroupedByRequest[] = useMemo(() => {
        const groups: Record<string, GroupedByRequest> = {};
        const searchLower = searchAnalyst.toLowerCase().trim();
        allAssigned.forEach(doc => {
            const analystMatch = !searchLower || doc.testerName.toLowerCase().includes(searchLower);
            (doc.tasks || []).forEach((t, idx) => {
                if (t.status === TaskStatus.NotOK && analystMatch) {
                    if (!groups[doc.requestId]) groups[doc.requestId] = { requestId: doc.requestId, earliestDate: doc.assignedDate, category: doc.category, oldestDays: 0, tasksByDescription: {}, allTasks: [] };
                    const desc = String(getTaskValue(t, 'Description') || 'General Task');
                    const variant = String(getTaskValue(t, 'Variant') || '');
                    const uniqueKey = `${desc}__${variant}`;
                    if (!groups[doc.requestId].tasksByDescription[uniqueKey]) groups[doc.requestId].tasksByDescription[uniqueKey] = [];
                    const item: FlattenedNotOkTask = { docId: doc.id, originalDoc: doc, task: t, taskIndex: idx };
                    groups[doc.requestId].tasksByDescription[uniqueKey].push(item);
                    groups[doc.requestId].allTasks.push(item);
                    const days = getDaysDiff(doc.assignedDate);
                    if (days > groups[doc.requestId].oldestDays) groups[doc.requestId].oldestDays = days;
                    if (doc.assignedDate < groups[doc.requestId].earliestDate) groups[doc.requestId].earliestDate = doc.assignedDate;
                }
            });
        });
        return Object.values(groups).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));
    }, [allAssigned, searchAnalyst]);

    const filteredDistLogsByTime = useMemo(() => {
        if (distDateFilter === 'all') return distLogs;
        if (distDateFilter === 'specific') return distLogs.filter(log => log.date.startsWith(specificMonth));
        const now = new Date(); const threshold = new Date();
        if (distDateFilter === 'week') threshold.setDate(now.getDate() - 7);
        if (distDateFilter === 'month') threshold.setMonth(now.getMonth() - 1);
        return distLogs.filter(log => new Date(log.date) >= threshold);
    }, [distLogs, distDateFilter, specificMonth]);

    const handleBatchResolve = async (targets: FlattenedNotOkTask[]) => {
        try {
            const historyEntries = targets.map(t => ({
                testerName: t.originalDoc.testerName, requestId: t.originalDoc.requestId, sampleName: String(getTaskValue(t.task, 'Sample Name') || 'N/A'),
                description: String(getTaskValue(t.task, 'Description') || 'N/A'), assignedDate: t.originalDoc.assignedDate, resolvedDate: new Date().toISOString().split('T')[0],
                daysToResolve: getDaysDiff(t.originalDoc.assignedDate), failureReason: t.task.notOkReason || 'N/A', category: t.originalDoc.category
            }));
            await logResolutionEntries(historyEntries);
            for (const t of targets) {
                const updatedTasks = t.originalDoc.tasks.map((task, idx) => idx === t.taskIndex ? { ...task, status: TaskStatus.Done, plannerNote: "[RESOLVED]" } : task);
                await updateAssignedTask(t.originalDoc.id, { tasks: updatedTasks });
            }
            setNotification({ message: "Task marked as Resolved (Done)." }); fetchData(); onResolve();
        } catch (e) { setNotification({ message: "Failed.", isError: true }); }
        finally { setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' }); }
    };

    const handleSaveDistLog = async (log: Omit<DistillationLog, 'id' | 'createdAt'>, id?: string) => {
        try { 
            if (id) { await updateDistillationLog(id, log); setNotification({ message: "Record updated." }); } 
            else { await addDistillationLog(log); setNotification({ message: "New batch logged." }); }
            setIsDistModalOpen(false); setEditTarget(null); fetchData(); 
        } catch (e) { setNotification({ message: "Action failed", isError: true }); }
    };

    const handleEditStart = (log: DistillationLog) => { setEditTarget(log); setIsDistModalOpen(true); };
    const handleDeleteDist = async () => {
        if (!distDeleteConfirm?.id) return;
        try { await deleteDistillationLog(distDeleteConfirm.id); setNotification({ message: "Record removed." }); setDistDeleteConfirm(null); fetchData(); } catch (e) { setNotification({ message: "Failed to delete", isError: true }); }
    };

    // --- NEW MASTER EXPORT FUNCTION ---
    const handleExportComprehensiveReport = () => {
        try {
            const wb = XLSX.utils.book_new();

            // 1. Resolution History Sheet
            const resolutionData = historyLogs.map(log => ({
                'Resolved Date': log.resolvedDate || log.timestamp?.split('T')[0],
                'Analyst': log.testerName,
                'Request ID': log.requestId,
                'Sample Name': log.sampleName,
                'Description': log.description,
                'Category': log.category,
                'Days to Resolve': log.daysToResolve,
                'Failure Reason': log.failureReason
            }));
            const wsRes = XLSX.utils.json_to_sheet(resolutionData);
            XLSX.utils.book_append_sheet(wb, wsRes, "Resolution History");

            // 2. Recovery Logs Sheet
            const recoveryData = distLogs.map(log => ({
                'Date': log.date,
                'Chemical': log.chemicalName,
                'Input (ml)': log.inputAmount,
                'Output (ml)': log.outputAmount,
                'Yield (%)': log.yieldPercent,
                'Operator': log.recorderName,
                'Logged At': log.createdAt
            }));
            const wsRec = XLSX.utils.json_to_sheet(recoveryData);
            XLSX.utils.book_append_sheet(wb, wsRec, "Chemical Recovery");

            // 3. Over Plan Ledger Sheet
            const overPlanMaster = overPlanData.map(log => ({
                'Assigned Date': log.date,
                'Personnel': log.personName,
                'Request ID': log.requestId,
                'Type': log.isPrep ? 'Preparation' : 'Testing',
                'Test Item': log.testDesc,
                'Variant': log.variant,
                'Units (Qty)': log.qty,
                'Final Status': log.status
            }));
            const wsOver = XLSX.utils.json_to_sheet(overPlanMaster);
            XLSX.utils.book_append_sheet(wb, wsOver, "Over Plan Achievement");

            // Save Workbook
            XLSX.writeFile(wb, `Intelligence_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
            setNotification({ message: "Master Report Downloaded Successfully" });
        } catch (error) {
            console.error(error);
            setNotification({ message: "Export Failed", isError: true });
        }
    };

    const totalIssuesCount = groupedIssuesData.reduce((acc, g) => acc + g.allTasks.length, 0);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] animate-fade-in relative overflow-hidden bg-white font-sans">
            <style>{`
                @keyframes neon-pulse { 
                    0% { text-shadow: 0 0 5px #4f46e5, 0 0 10px #4f46e5, 0 0 20px #06b6d4; }
                    50% { text-shadow: 0 0 10px #4f46e5, 0 0 20px #a855f7, 0 0 40px #06b6d4; }
                    100% { text-shadow: 0 0 5px #4f46e5, 0 0 10px #4f46e5, 0 0 20px #06b6d4; }
                }
                .neon-glow-overplan { animation: neon-pulse 2s ease-in-out infinite; }
            `}</style>

            {notification && (
                <div className="fixed bottom-10 right-10 px-6 py-4 rounded-2xl shadow-2xl z-[150] animate-slide-in-up flex items-center gap-3 font-black text-xs uppercase tracking-widest bg-indigo-600 text-white border border-white/20">
                    <CheckCircleIcon className="h-5 w-5" /> {notification.message}
                </div>
            )}

            <DistillationFormModal isOpen={isDistModalOpen} onClose={() => { setIsDistModalOpen(false); setEditTarget(null); }} onSave={handleSaveDistLog} testers={testers} defaultChemical={selectedChemical} editTarget={editTarget} allChemicals={allChemicals} />

            <div className="flex justify-between items-center px-10 py-6 shrink-0 bg-white border-b border-slate-100 z-10">
                <div className="flex items-center gap-12">
                    <div>
                        <h2 className="text-4xl font-black text-base-900 dark:text-base-100 tracking-tighter uppercase leading-none italic">Intelligence</h2>
                        <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px] mt-2">Resource & Quality Center</p>
                    </div>
                    <div className="flex p-1.5 bg-slate-100 rounded-[1.8rem] border border-slate-200 shadow-inner">
                        <button onClick={() => setActiveSubTab('issues')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.4rem] text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'issues' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}><AlertTriangleIcon className="h-5 w-5" /> Issues</button>
                        <button onClick={() => setActiveSubTab('distillation')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.4rem] text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'distillation' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}><BeakerIcon className="h-5 w-5" /> Recovery</button>
                        <button onClick={() => setActiveSubTab('overplan')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.4rem] text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'overplan' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}><SparklesIcon className="h-5 w-5" /> Over Plan</button>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    {(activeSubTab === 'distillation' || activeSubTab === 'overplan') && (
                        <div className="flex items-center p-1 bg-slate-50 dark:bg-base-900 border-2 border-slate-100 dark:border-base-800 rounded-2xl shadow-inner mr-2">
                            <button onClick={() => setDistDateFilter('week')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${distDateFilter === 'week' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>7 Days</button>
                            <button onClick={() => setDistDateFilter('month')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${distDateFilter === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>30 Days</button>
                            <button onClick={() => setDistDateFilter('all')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${distDateFilter === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>All Time</button>
                        </div>
                    )}
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExportComprehensiveReport}
                            className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-base-800 border-2 border-indigo-100 dark:border-indigo-900/50 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-50 transition-all active:scale-95"
                            title="Download Multi-Sheet Intelligence Report"
                        >
                            <DownloadIcon className="h-5 w-5" /> Export Intelligence
                        </button>
                        
                        {activeSubTab === 'distillation' && (
                            <button onClick={() => setIsDistModalOpen(true)} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all border-b-4 border-indigo-800"><PlusIcon className="h-5 w-5" /> New Batch Log</button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-hidden flex flex-col p-6 bg-slate-50/10">
                {activeSubTab === 'issues' && (
                    <div className="flex h-full gap-6">
                        <div className="w-[320px] shrink-0 bg-white rounded-[3rem] border border-slate-200 shadow-xl flex flex-col overflow-hidden">
                            <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Analyst Tracking</h3>
                                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[9px] font-black uppercase tracking-wider">{totalIssuesCount} Issues</span>
                                </div>
                                <div className="relative group">
                                    <input type="text" placeholder="Filter Analyst..." value={searchAnalyst} onChange={e => setSearchAnalyst(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-slate-100 rounded-2xl outline-none font-bold text-xs transition-all focus:border-indigo-500 shadow-sm" />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon className="h-4 w-4" /></div>
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-5 bg-slate-50/30">
                                {performanceData.map(p => {
                                    const isSelected = searchAnalyst === p.name;
                                    const severityColor = p.severity === 'high' ? 'text-rose-600' : p.severity === 'medium' ? 'text-amber-500' : 'text-emerald-600';
                                    const ageColor = p.activeMaxDays >= 4 ? 'bg-rose-600' : p.activeMaxDays >= 2 ? 'bg-amber-500' : 'bg-emerald-500';
                                    return (
                                        <div key={p.name} onClick={() => setSearchAnalyst(isSelected ? '' : p.name)} className={`p-5 rounded-[2rem] border-[3px] transition-all cursor-pointer relative overflow-hidden group shadow-lg ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white scale-[1.02]' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                                            <div className="flex justify-between items-start mb-4 relative z-10">
                                                <div><span className={`text-[16px] font-black uppercase block leading-none tracking-tight ${isSelected ? 'text-white' : 'text-slate-800'}`}>{p.name}</span></div>
                                                {p.activeMaxDays > 0 && <div className={`px-3 py-1.5 rounded-xl font-black uppercase text-white shadow-md ${ageColor} flex flex-col items-center leading-none`}><span className="text-[18px]">{p.activeMaxDays}D</span></div>}
                                            </div>
                                            <div className="flex items-end gap-3 relative z-10 mb-4"><div className="flex items-baseline gap-2"><span className={`text-6xl font-black leading-none tracking-tighter ${isSelected ? 'text-white' : severityColor}`}>{p.backlogCount}</span></div></div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex-grow flex flex-col bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden">
                            <div className="flex-grow overflow-y-auto no-scrollbar p-6 bg-slate-50/30">
                                {issuesMode === 'active' ? (
                                    groupedIssuesData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center opacity-10 text-center"><CheckCircleIcon className="h-24 w-24 mb-6 text-emerald-500" /><span className="text-2xl font-black uppercase tracking-[0.5em]">Systems Stable</span></div>
                                    ) : (
                                        <div className="space-y-4">
                                            {groupedIssuesData.map((reqGroup) => (
                                                <div key={reqGroup.requestId} className="space-y-2 animate-fade-in">
                                                    <div className="flex items-center gap-5 px-6 py-3 bg-base-900 text-white rounded-[2rem] shadow-xl border border-slate-800">
                                                        <h3 className="text-xl font-black uppercase tracking-tighter italic leading-none">{reqGroup.requestId}</h3>
                                                        <div className="flex-grow"></div>
                                                        <button onClick={() => setConfirmModal({ isOpen: true, targetItems: reqGroup.allTasks, title: 'Batch?', description: reqGroup.requestId })} className="px-6 py-2.5 bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest">Resolve Group</button>
                                                    </div>
                                                    <div className="space-y-1.5 pl-8">
                                                        {Object.entries(reqGroup.tasksByDescription).map(([key, items]) => (
                                                            items.map((it, idx) => (
                                                                <div key={idx} className="flex items-center gap-4 bg-white p-4 rounded-[1.5rem] border-2 border-slate-100 hover:border-indigo-100 transition-all shadow-sm">
                                                                    <div className="flex-grow min-w-0"><span className="text-[16px] font-black text-slate-900 uppercase truncate block tracking-tighter">{String(getTaskValue(it.task, 'Sample Name') || 'N/A')}</span><p className="text-[10px] font-bold text-rose-600 italic">ERR: "{it.task.notOkReason}"</p></div>
                                                                    <button onClick={() => setConfirmModal({ isOpen: true, targetItems: [it], title: 'Resolve?', description: String(getTaskValue(it.task, 'Sample Name')) })} className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-md"><CheckCircleIcon className="h-6 w-6"/></button>
                                                                </div>
                                                            ))
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                ) : (
                                    <table className="w-full text-left">
                                        <thead className="bg-white sticky top-0 shadow-sm"><tr>{['Analyst', 'Request ID', 'Sample', 'Resolution', 'Reason'].map(h => <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr></thead>
                                        <tbody className="divide-y divide-slate-50">{historyLogs.map((log, i) => <tr key={i} className="hover:bg-slate-50"><td className="px-6 py-4 font-black text-slate-800 text-[11px]">{log.testerName}</td><td className="px-6 py-4 text-[12px] font-bold text-indigo-600">{log.requestId}</td><td className="px-6 py-4 text-[12px]">{log.sampleName}</td><td className="px-6 py-4"><span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-100">{log.daysToResolve} Days</span></td><td className="px-6 py-4 text-[11px] text-rose-600 italic">{log.failureReason}</td></tr>)}</tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeSubTab === 'overplan' && (
                    <div className="h-full flex flex-col gap-6 animate-fade-in overflow-hidden">
                        {/* HERO OVER PLAN ACHIEVEMENTS SECTION */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0 h-[220px]">
                            <div className="bg-gradient-to-br from-indigo-700 via-indigo-900 to-black rounded-[3rem] p-8 text-white shadow-2xl relative overflow-hidden flex flex-col justify-center border-[4px] border-indigo-500/30">
                                <div className="absolute top-0 right-0 p-6 opacity-20"><SparklesIcon className="w-32 h-32 text-cyan-400 neon-glow-overplan" /></div>
                                <span className="text-[14px] font-black uppercase tracking-[0.6em] text-cyan-400 mb-3 neon-glow-overplan">Over Plan Achievements</span>
                                <div className="flex items-baseline gap-5">
                                    <span className="text-8xl font-black tracking-tighter leading-none">{totalOverPlanUnits}</span>
                                    <span className="text-xl font-bold uppercase tracking-widest text-indigo-300">Over Plan Units</span>
                                </div>
                            </div>
                            <div className="lg:col-span-2 bg-white dark:bg-base-900 rounded-[3rem] p-6 border-2 border-slate-100 dark:border-base-800 shadow-xl flex flex-col overflow-hidden relative">
                                <div className="absolute top-6 left-6 flex items-center gap-3"><ClockIcon className="h-5 w-5 text-indigo-500"/><h3 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em]">Over Plan Timeline Pulse</h3></div>
                                <div className="flex-grow mt-8">{overPlanTimeline.length > 0 ? <PerformancePulseChart data={overPlanTimeline} /> : <div className="h-full flex items-center justify-center opacity-10 text-xl font-black uppercase">No Trend Data</div>}</div>
                            </div>
                        </div>

                        <div className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-6 overflow-hidden">
                            {/* LEADERBOARD (NOW INTERACTIVE FILTER) */}
                            <div className="lg:col-span-2 bg-white dark:bg-base-900 rounded-[3rem] p-8 border-2 border-slate-100 dark:border-base-800 shadow-xl flex flex-col overflow-hidden">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[13px] font-black text-slate-800 dark:text-white uppercase tracking-[0.3em] flex items-center gap-3 italic"><UserGroupIcon className="h-6 w-6 text-indigo-600" /> Over Plan Champions</h3>
                                    {selectedOverPlanAnalyst && (
                                        <button 
                                            onClick={() => setSelectedOverPlanAnalyst(null)}
                                            className="px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black rounded-lg hover:bg-rose-600 hover:text-white transition-all uppercase tracking-widest"
                                        >
                                            Reset View
                                        </button>
                                    )}
                                </div>
                                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                                    {overPlanLeaderboard.length > 0 ? (
                                        <AchievementLeaderboard 
                                            data={overPlanLeaderboard} 
                                            selectedName={selectedOverPlanAnalyst}
                                            onSelect={(name) => setSelectedOverPlanAnalyst(selectedOverPlanAnalyst === name ? null : name)}
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
                                            <SparklesIcon className="h-10 w-10 mb-4" />
                                            <span className="text-xs font-black uppercase tracking-widest text-center">Tracking Contributions...</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* JOURNAL LEDGER (NOW FILTERED BY LEADERBOARD) */}
                            <div className="lg:col-span-3 bg-white dark:bg-base-900 rounded-[3rem] border-2 border-slate-100 dark:border-base-800 shadow-2xl overflow-hidden flex flex-col">
                                <div className="px-10 py-5 border-b border-slate-100 dark:border-base-800 bg-slate-50/50 dark:bg-base-955 flex justify-between items-center shrink-0">
                                    <div className="flex items-center gap-4">
                                        <DatabaseIcon className={`h-6 w-6 ${selectedOverPlanAnalyst ? 'text-indigo-600' : 'text-cyan-600'}`} />
                                        <h3 className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-400 italic">
                                            {selectedOverPlanAnalyst ? `Journal: ${selectedOverPlanAnalyst}` : "Over Plan Achievement Journal"}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {selectedOverPlanAnalyst && (
                                            <button 
                                                onClick={() => setSelectedOverPlanAnalyst(null)}
                                                className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                                                title="Clear analyst filter"
                                            >
                                                <XCircleIcon className="h-5 w-5" />
                                            </button>
                                        )}
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest bg-indigo-600 px-5 py-2 rounded-full shadow-lg neon-glow-overplan">
                                            {filteredOverPlanDataForTable.length} Records
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-y-auto no-scrollbar pb-10">
                                    <table className="min-w-full text-left border-separate border-spacing-0">
                                        <thead className="sticky top-0 bg-white/95 dark:bg-base-900/95 backdrop-blur-md text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-base-800 z-10">
                                            <tr>
                                                <th className="px-10 py-5">Timestamp</th>
                                                <th className="px-10 py-5">Personnel</th>
                                                <th className="px-10 py-5">Assignment</th>
                                                <th className="px-10 py-5 text-right">Over Plan Units</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-base-800">
                                            {filteredOverPlanDataForTable.length > 0 ? filteredOverPlanDataForTable.map((log, i) => (
                                                <tr key={i} className="hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 transition-all duration-300 group">
                                                    <td className="px-10 py-4"><span className="text-[14px] font-black text-slate-400 dark:text-base-500">{log.date}</span></td>
                                                    <td className="px-10 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[11px] font-black text-white shadow-lg group-hover:scale-110 transition-transform">
                                                                {log.personName.charAt(0)}
                                                            </div>
                                                            <span className="text-[15px] font-black text-slate-800 dark:text-base-100 uppercase tracking-tight">{log.personName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-10 py-4">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[15px] font-black text-indigo-600 tracking-tighter">{log.requestId}</span>
                                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${log.isPrep ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'}`}>{log.isPrep ? 'PREP' : 'TEST'}</span>
                                                            </div>
                                                            <span className="text-[12px] font-bold text-slate-400 uppercase truncate max-w-[220px]">{log.testDesc}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-10 py-4 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-3xl font-black text-indigo-700 dark:text-indigo-400 tracking-tighter">x{log.qty}</span>
                                                            <span className="text-[8px] font-black text-indigo-300 uppercase tracking-[0.2em]">Over Plan Gained</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={4} className="py-32 text-center opacity-10 flex flex-col items-center"><SparklesIcon className="h-20 w-20 mb-4" /><span className="text-xl font-black uppercase tracking-[0.5em]">No Records Logged</span></td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="px-10 text-[9px] font-black text-slate-300 text-center uppercase tracking-[1.5em] pb-4 shrink-0 opacity-40 italic">System Logic • Intelligence Master V2.9.9 Active</div>
        </div>
    );
};

export default QualityDashboard;
