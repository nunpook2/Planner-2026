
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AssignedTask, RawTask, DistillationLog, Tester } from '../types';
import { TaskStatus } from '../types';
import { 
    getAssignedTasks, 
    updateAssignedTask, 
    deleteAssignedTask,
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
    ClipboardListIcon, PencilIcon, ChevronDownIcon
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
    avgDays: number;
    maxDays: number;
    severity: 'low' | 'medium' | 'high';
}

const PremiumScatterPlot: React.FC<{ 
    data: DistillationLog[]; 
    chemical: string;
}> = ({ data, chemical }) => {
    const padding = { top: 20, right: 35, bottom: 45, left: 65 };
    const width = 600;
    const height = 200;

    const maxVol = useMemo(() => {
        const vols = data.map(d => d.outputAmount);
        const max = vols.length > 0 ? Math.max(...vols) : 1000;
        return Math.ceil(max / 100) * 100 || 1000;
    }, [data]);

    const points = useMemo(() => {
        return data.map(d => ({
            x: padding.left + ((d.outputAmount / maxVol) * (width - padding.left - padding.right)),
            y: height - padding.bottom - ((d.yieldPercent / 100) * (height - padding.top - padding.bottom)),
            val: d.outputAmount,
            yield: d.yieldPercent,
            date: d.date,
            operator: d.recorderName,
            color: d.yieldPercent >= 95 ? '#10b981' : '#ef4444'
        }));
    }, [data, maxVol, width, height, padding]);

    const y95 = useMemo(() => {
        return height - padding.bottom - ((95 / 100) * (height - padding.top - padding.bottom));
    }, [height, padding]);

    return (
        <div className="w-full h-full flex flex-col items-center justify-center overflow-visible">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                <line 
                    x1={padding.left} 
                    y1={y95} 
                    x2={width - padding.right} 
                    y2={y95} 
                    stroke="#ef4444" 
                    strokeWidth="2" 
                    strokeDasharray="5 3" 
                    opacity="0.5"
                />
                <text x={width - padding.right + 5} y={y95 + 4} fill="#ef4444" fontSize="11" fontWeight="900">95% TARGET</text>

                {[0, 50, 100].map(y => {
                    const yPos = height - padding.bottom - ((y/100) * (height - padding.top - padding.bottom));
                    return (
                        <g key={y}>
                            <line x1={padding.left} y1={yPos} x2={width - padding.right} y2={yPos} stroke="#f1f5f9" strokeWidth="1" />
                            <text x={padding.left - 12} y={yPos + 5} textAnchor="end" fill="#64748b" fontSize="12" fontWeight="900">{y}%</text>
                        </g>
                    );
                })}

                {[0, 0.5, 1].map(ratio => {
                    const val = (ratio * maxVol).toFixed(0);
                    const xPos = padding.left + (ratio * (width - padding.left - padding.right));
                    return (
                        <g key={ratio}>
                            <text x={xPos} y={height - padding.bottom + 25} textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="900">{val}ml</text>
                        </g>
                    );
                })}

                <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="2" />
                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="2" />

                {points.map((p, i) => {
                    const isTooHigh = p.y < 60;
                    const tooltipY = isTooHigh ? p.y + 20 : p.y - 65;
                    const tooltipX = Math.min(p.x, width - 150);

                    return (
                        <g key={i} className="group/dot">
                            <circle cx={p.x} cy={p.y} r="7" fill={p.color} className="transition-all duration-200 group-hover/dot:r-10 cursor-help shadow-lg" stroke="white" strokeWidth="2" />
                            <g className="opacity-0 group-hover/dot:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                                <rect x={tooltipX + 10} y={tooltipY} width="140" height="55" rx="12" fill="#0f172a" />
                                <text x={tooltipX + 22} y={tooltipY + 22} fill="white" fontSize="14" fontWeight="900">{p.val}ml • {p.yield.toFixed(1)}%</text>
                                <text x={tooltipX + 22} y={tooltipY + 40} fill="#94a3b8" fontSize="10" fontWeight="900" className="uppercase tracking-widest">{p.operator}</text>
                            </g>
                        </g>
                    );
                })}
            </svg>
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
                <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">
                        {editTarget ? 'Edit Registry' : 'Log Registry'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-all"><XCircleIcon className="h-6 w-6 text-slate-400" /></button>
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
                                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg outline-none focus:border-indigo-500 transition-all shadow-inner"
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
                            <input type="text" inputMode="decimal" value={inputVal} onChange={handleNumericChange(setInputVal)} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg outline-none focus:border-indigo-500" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Output (ml)</label>
                            <input type="text" inputMode="decimal" value={outputVal} onChange={handleNumericChange(setOutputVal)} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg outline-none focus:border-indigo-500" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Operator (คนกลั่น)</label>
                        <select 
                            value={user} 
                            onChange={e => setUser(e.target.value)} 
                            className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner appearance-none"
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
                <div className="px-10 py-8 border-t border-slate-100 flex gap-4 bg-slate-50/50">
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
    const [activeSubTab, setActiveSubTab] = useState<'issues' | 'distillation'>('issues');
    const [allAssigned, setAllAssigned] = useState<AssignedTask[]>([]);
    const [distLogs, setDistLogs] = useState<DistillationLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchAnalyst, setSearchAnalyst] = useState('');
    const [isDistModalOpen, setIsDistModalOpen] = useState(false);
    const [selectedChemical, setSelectedChemical] = useState<string | null>(null);
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, targetItems: FlattenedNotOkTask[] | null, title: string, description: string }>({ isOpen: false, targetItems: null, title: '', description: '' });
    const [distDeleteConfirm, setDistDeleteConfirm] = useState<DistillationLog | null>(null);
    const [editTarget, setEditTarget] = useState<DistillationLog | null>(null);
    
    // NEW: Date Filter States
    const [distDateFilter, setDistDateFilter] = useState<'all' | 'week' | 'month' | 'specific'>('all');
    const [specificMonth, setSpecificMonth] = useState(new Date().toISOString().slice(0, 7)); // Format YYYY-MM

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [assigned, dist] = await Promise.all([ getAssignedTasks(), getDistillationLogs() ]);
            setAllAssigned(assigned || []);
            setDistLogs(dist || []);
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

    const performanceData = useMemo(() => {
        const stats: Record<string, { count: number, totalDays: number, max: number }> = {};
        allAssigned.forEach(doc => {
            const notOkTasks = (doc.tasks || []).filter(t => t.status === TaskStatus.NotOK);
            if (notOkTasks.length > 0) {
                const days = getDaysDiff(doc.assignedDate);
                if (!stats[doc.testerName]) stats[doc.testerName] = { count: 0, totalDays: 0, max: 0 };
                stats[doc.testerName].count += notOkTasks.length;
                stats[doc.testerName].totalDays += (days * notOkTasks.length);
                if (days > stats[doc.testerName].max) stats[doc.testerName].max = days;
            }
        });
        return Object.entries(stats).map(([name, data]): AnalystPerformance => {
            const avg = Math.round(data.totalDays / data.count);
            let severity: 'low' | 'medium' | 'high' = data.max >= 5 ? 'high' : data.max >= 3 ? 'medium' : 'low';
            return { name, backlogCount: data.count, avgDays: avg, maxDays: data.max, severity };
        }).sort((a, b) => b.backlogCount - a.backlogCount);
    }, [allAssigned]);

    const groupedIssuesData: GroupedByRequest[] = useMemo(() => {
        const groups: Record<string, GroupedByRequest> = {};
        const searchLower = searchAnalyst.toLowerCase().trim();
        allAssigned.forEach(doc => {
            const analystMatch = !searchLower || doc.testerName.toLowerCase().includes(searchLower);
            (doc.tasks || []).forEach((t, idx) => {
                if (t.status === TaskStatus.NotOK && analystMatch) {
                    if (!groups[doc.requestId]) groups[doc.requestId] = { requestId: doc.requestId, earliestDate: doc.assignedDate, category: doc.category, oldestDays: 0, tasksByDescription: {}, allTasks: [] };
                    const desc = String(t.Description || 'General Task');
                    if (!groups[doc.requestId].tasksByDescription[desc]) groups[doc.requestId].tasksByDescription[desc] = [];
                    const item: FlattenedNotOkTask = { docId: doc.id, originalDoc: doc, task: t, taskIndex: idx };
                    groups[doc.requestId].tasksByDescription[desc].push(item);
                    groups[doc.requestId].allTasks.push(item);
                    const days = getDaysDiff(doc.assignedDate);
                    if (days > groups[doc.requestId].oldestDays) groups[doc.requestId].oldestDays = days;
                    if (doc.assignedDate < groups[doc.requestId].earliestDate) groups[doc.requestId].earliestDate = doc.assignedDate;
                }
            });
        });
        return Object.values(groups).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));
    }, [allAssigned, searchAnalyst]);

    // UPDATED: Filtered DistLogs with Specific Month support
    const filteredDistLogsByTime = useMemo(() => {
        if (distDateFilter === 'all') return distLogs;
        
        if (distDateFilter === 'specific') {
            return distLogs.filter(log => log.date.startsWith(specificMonth));
        }

        const now = new Date();
        const threshold = new Date();
        if (distDateFilter === 'week') threshold.setDate(now.getDate() - 7);
        if (distDateFilter === 'month') threshold.setMonth(now.getMonth() - 1);
        
        return distLogs.filter(log => {
            const logDate = new Date(log.date);
            return logDate >= threshold;
        });
    }, [distLogs, distDateFilter, specificMonth]);

    const distSummary = useMemo(() => {
        const acc: Record<string, { totalOut: number, avgYield: number, count: number, lastOp: string, lastDate: string }> = {};
        filteredDistLogsByTime.forEach(log => {
            if (!acc[log.chemicalName]) acc[log.chemicalName] = { totalOut: 0, avgYield: 0, count: 0, lastOp: '', lastDate: '0000-00-00' };
            const s = acc[log.chemicalName];
            s.totalOut += log.outputAmount;
            s.avgYield += log.yieldPercent;
            s.count++;
            if (log.date > s.lastDate) { s.lastDate = log.date; s.lastOp = log.recorderName; }
        });
        return Object.entries(acc).map(([name, stats]) => {
            const yieldVal = stats.avgYield / stats.count;
            return {
                name, total: stats.totalOut, yield: yieldVal, lastOp: stats.lastOp, lastDate: stats.lastDate,
                yieldColor: yieldVal >= 95 ? 'text-emerald-600' : 'text-rose-600',
                barColor: yieldVal >= 95 ? 'bg-emerald-500' : 'bg-rose-500'
            };
        }).sort((a, b) => b.total - a.total);
    }, [filteredDistLogsByTime]);

    const filteredLogsForGraph = useMemo(() => {
        if (!selectedChemical) return [];
        return filteredDistLogsByTime.filter(log => log.chemicalName === selectedChemical);
    }, [filteredDistLogsByTime, selectedChemical]);

    const handleBatchResolve = async (targets: FlattenedNotOkTask[]) => {
        try {
            const historyEntries = targets.map(t => ({
                testerName: t.originalDoc.testerName, requestId: t.originalDoc.requestId, sampleName: String(t.task['Sample Name'] || 'N/A'),
                description: String(t.task['Description'] || 'N/A'), assignedDate: t.originalDoc.assignedDate, resolvedDate: new Date().toISOString().split('T')[0],
                daysToResolve: getDaysDiff(t.originalDoc.assignedDate), failureReason: t.task.notOkReason || 'N/A', category: t.originalDoc.category
            }));
            await logResolutionEntries(historyEntries);
            const byDocId: Record<string, { originalDoc: AssignedTask, indicesToRemove: number[] }> = {};
            targets.forEach(t => {
                if (!byDocId[t.docId]) byDocId[t.docId] = { originalDoc: t.originalDoc, indicesToRemove: [] };
                byDocId[t.docId].indicesToRemove.push(t.taskIndex);
            });
            for (const docId in byDocId) {
                const { originalDoc, indicesToRemove } = byDocId[docId];
                const updatedTasks = originalDoc.tasks.filter((_, idx) => !indicesToRemove.includes(idx));
                if (updatedTasks.length > 0) await updateAssignedTask(originalDoc.id, { tasks: updatedTasks });
                else await deleteAssignedTask(originalDoc.id);
            }
            setNotification({ message: "Task resolved." }); fetchData(); onResolve();
        } catch (e) { setNotification({ message: "Failed.", isError: true }); }
        finally { setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' }); }
    };

    const handleSaveDistLog = async (log: Omit<DistillationLog, 'id' | 'createdAt'>, id?: string) => {
        try { 
            if (id) {
                await updateDistillationLog(id, log);
                setNotification({ message: "Record updated." }); 
            } else {
                await addDistillationLog(log);
                setNotification({ message: "New batch logged." }); 
            }
            setIsDistModalOpen(false); 
            setEditTarget(null);
            fetchData(); 
        } catch (e) { 
            setNotification({ message: "Action failed", isError: true }); 
        }
    };

    const handleEditStart = (log: DistillationLog) => {
        setEditTarget(log);
        setIsDistModalOpen(true);
    };

    const handleDeleteDist = async () => {
        if (!distDeleteConfirm?.id) return;
        try { 
            await deleteDistillationLog(distDeleteConfirm.id); 
            setNotification({ message: "Record removed." }); 
            setDistDeleteConfirm(null); 
            fetchData(); 
        } catch (e) { 
            setNotification({ message: "Failed to delete", isError: true }); 
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const getFilterLabel = () => {
        if (distDateFilter === 'all') return 'SYSTEM LIFETIME';
        if (distDateFilter === 'week') return 'LAST 7 DAYS';
        if (distDateFilter === 'month') return 'LAST 30 DAYS';
        if (distDateFilter === 'specific') {
            const [y, m] = specificMonth.split('-');
            return new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
        }
        return '';
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] animate-slide-in-up relative overflow-hidden bg-white font-sans">
            {notification && (
                <div className="fixed bottom-10 right-10 px-6 py-4 rounded-2xl shadow-2xl z-[150] animate-slide-in-up flex items-center gap-3 font-black text-xs uppercase tracking-widest bg-indigo-600 text-white border border-white/20">
                    <CheckCircleIcon className="h-5 w-5" /> {notification.message}
                </div>
            )}

            <DistillationFormModal 
                isOpen={isDistModalOpen} 
                onClose={() => { setIsDistModalOpen(false); setEditTarget(null); }} 
                onSave={handleSaveDistLog} 
                testers={testers} 
                defaultChemical={selectedChemical}
                editTarget={editTarget}
                allChemicals={allChemicals}
            />

            {confirmModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-10 text-center space-y-6 border border-white" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner"><CheckCircleIcon className="h-8 w-8" /></div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic">Resolve Task?</h3>
                            <p className="text-slate-500 mt-4 text-[15px] font-bold">ยืนยันการเคลียร์งาน <span className="text-emerald-600">"{confirmModal.description}"</span></p>
                        </div>
                        <div className="flex flex-col gap-2 pt-2">
                            <button onClick={() => handleBatchResolve(confirmModal.targetItems!)} className="w-full py-4 bg-emerald-600 text-white font-black rounded-xl shadow-lg uppercase text-[11px] tracking-widest active:scale-95">Confirm</button>
                            <button onClick={() => setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' })} className="w-full py-2 text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {distDeleteConfirm && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[210] p-4 animate-fade-in" onClick={() => setDistDeleteConfirm(null)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-sm:max-w-[320px] max-w-sm overflow-hidden p-10 text-center space-y-6 border border-white" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-600 shadow-inner"><TrashIcon className="h-8 w-8" /></div>
                        <div>
                            <h3 className="text-xl font-black text-slate-955 dark:text-white uppercase tracking-tighter italic">Wipe Record?</h3>
                            <p className="text-base-400 mt-2 text-xs font-bold leading-relaxed">ข้อมูลประวัตินี้จะถูกลบถาวรและไม่สามารถกู้คืนได้</p>
                        </div>
                        <div className="flex flex-col gap-2 pt-4">
                            <button onClick={handleDeleteDist} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl hover:bg-red-700 uppercase text-[10px] tracking-widest">Confirm Wipe</button>
                            <button onClick={() => setDistDeleteConfirm(null)} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-slate-900 uppercase">Keep It</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center px-10 py-6 shrink-0 bg-white border-b border-slate-100 z-10">
                <div className="flex items-center gap-12">
                    <div>
                        <h2 className="text-4xl font-black text-base-900 dark:text-base-100 tracking-tighter uppercase leading-none italic">Intelligence</h2>
                        <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px] mt-2">Resource & Quality Center</p>
                    </div>
                    <div className="flex p-1.5 bg-slate-100 rounded-[1.8rem] border border-slate-200">
                        <button onClick={() => setActiveSubTab('issues')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.4rem] text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'issues' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}><AlertTriangleIcon className="h-5 w-5" /> Issues</button>
                        <button onClick={() => setActiveSubTab('distillation')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.4rem] text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'distillation' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}><BeakerIcon className="h-5 w-5" /> Recovery</button>
                    </div>
                </div>
                {activeSubTab === 'distillation' && (
                    <div className="flex items-center gap-4">
                        <div className="flex items-center p-1 bg-slate-50 border-2 border-slate-100 rounded-2xl shadow-inner mr-2">
                            <button onClick={() => setDistDateFilter('week')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${distDateFilter === 'week' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>7 Days</button>
                            <button onClick={() => setDistDateFilter('month')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${distDateFilter === 'month' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>30 Days</button>
                            <button onClick={() => setDistDateFilter('all')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${distDateFilter === 'all' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>All Time</button>
                            <div className="w-px h-6 bg-slate-200 mx-2"></div>
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${distDateFilter === 'specific' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                                <button onClick={() => setDistDateFilter('specific')} className="text-[9px] font-black uppercase tracking-widest">By Month:</button>
                                <input 
                                    type="month" 
                                    value={specificMonth} 
                                    onChange={(e) => {
                                        setSpecificMonth(e.target.value);
                                        setDistDateFilter('specific');
                                    }}
                                    className={`bg-transparent border-none text-[10px] font-black outline-none cursor-pointer ${distDateFilter === 'specific' ? 'text-white' : 'text-slate-500'}`}
                                />
                            </div>
                        </div>
                        <button onClick={() => setIsDistModalOpen(true)} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all border-b-4 border-indigo-800"><PlusIcon className="h-5 w-5" /> New Batch Log</button>
                    </div>
                )}
            </div>

            <div className="flex-grow overflow-hidden flex flex-col p-6 bg-slate-50/10">
                {activeSubTab === 'issues' ? (
                    <>
                        <div className="grid grid-cols-12 gap-6 h-[280px] shrink-0 mb-6">
                            <div className="col-span-3 bg-white rounded-[3rem] p-8 border border-slate-200 shadow-xl flex flex-col justify-between">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 ml-1">Personnel Filter</h3>
                                    <div className="relative group">
                                        <input type="text" placeholder="Personnel..." value={searchAnalyst} onChange={e => setSearchAnalyst(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black text-sm transition-all focus:border-indigo-500 shadow-inner" />
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500"><UserGroupIcon className="h-5 w-5" /></div>
                                    </div>
                                </div>
                                <div className="p-8 bg-indigo-50 rounded-[2rem] text-center border border-indigo-100 shadow-inner">
                                    <span className="text-[10px] font-black text-indigo-800 uppercase tracking-widest block mb-1">Issue Pool</span>
                                    <span className="text-6xl font-black text-indigo-600 tracking-tighter leading-none">{groupedIssuesData.reduce((acc, g) => acc + g.allTasks.length, 0)}</span>
                                </div>
                            </div>
                            <div className="col-span-9 bg-white rounded-[3rem] p-8 border border-slate-200 shadow-xl overflow-hidden flex flex-col">
                                <div className="flex justify-between items-center mb-6"><h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400">Analyst Backlog Tracking</h3><button onClick={fetchData} className="p-2 text-slate-300 hover:text-indigo-600"><RefreshIcon className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`} /></button></div>
                                <div className="flex-grow flex overflow-x-auto no-scrollbar gap-5 py-2">
                                    {performanceData.map(p => {
                                        const isFiltering = searchAnalyst && p.name.toLowerCase().includes(searchAnalyst.toLowerCase());
                                        const severityCol = p.severity === 'high' ? 'bg-rose-600' : p.severity === 'medium' ? 'bg-amber-500' : 'bg-emerald-600';
                                        return (
                                            <div key={p.name} onClick={() => setSearchAnalyst(isFiltering ? '' : p.name)} className={`min-w-[220px] shrink-0 flex flex-col justify-between p-6 rounded-[2.5rem] border-2 transition-all duration-300 cursor-pointer ${isFiltering ? 'bg-indigo-50 border-indigo-500 scale-[1.03] shadow-2xl' : 'bg-white border-slate-50 hover:border-indigo-100 shadow-md'}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[13px] shrink-0 ${isFiltering ? 'bg-indigo-600 text-white' : 'bg-base-900 text-white'}`}>{p.name.charAt(0)}</div>
                                                    <span className="text-[13px] font-black uppercase whitespace-normal leading-tight">{p.name}</span>
                                                </div>
                                                <div className="my-4"><div className="flex items-baseline gap-2"><span className={`text-4xl font-black tracking-tighter ${p.backlogCount >= 10 ? 'text-rose-600' : 'text-base-900'}`}>{p.backlogCount}</span><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">UNITS</span></div></div>
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`text-[14px] font-black ${p.severity === 'high' ? 'text-rose-600' : p.severity === 'medium' ? 'text-amber-500' : 'text-emerald-600'}`}>{p.maxDays}D</span>
                                                        <div className="flex-grow h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${severityCol} transition-all duration-1000`} style={{ width: `${Math.min(p.maxDays * 20, 100)}%` }}></div></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto no-scrollbar space-y-3 px-1 pb-10">
                            {groupedIssuesData.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-10 text-center py-24"><CheckCircleIcon className="h-24 w-24 mb-6 text-emerald-500" /><span className="text-2xl font-black uppercase tracking-[0.5em]">Systems Stable</span></div>
                            ) : groupedIssuesData.map((reqGroup) => (
                                <div key={reqGroup.requestId} className="space-y-2 animate-fade-in">
                                    <div className="flex items-center gap-5 px-6 py-3 bg-base-900 text-white rounded-[2rem] shadow-xl border border-slate-800">
                                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shrink-0"><BeakerIcon className="h-5 w-5" /></div>
                                        <div className="flex-grow min-w-0 flex items-center gap-6">
                                            <h3 className="text-xl font-black uppercase tracking-tighter italic leading-none">{reqGroup.requestId}</h3>
                                            <span className="px-3 py-1 bg-rose-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest shadow-md">{reqGroup.allTasks.length} FAIL</span>
                                            <div className={`px-4 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2.5 border border-white/10 ${reqGroup.oldestDays >= 5 ? 'bg-rose-600' : reqGroup.oldestDays >= 3 ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                                                <CalendarIcon className="h-4 w-4" /> {reqGroup.oldestDays}D AGED
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setConfirmModal({ isOpen: true, targetItems: reqGroup.allTasks, title: 'Batch?', description: reqGroup.requestId })} 
                                            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest transition-all border border-emerald-500 shadow-lg"
                                        >
                                            Resolve Group
                                        </button>
                                    </div>
                                    <div className="space-y-1.5 pl-8">
                                        {Object.entries(reqGroup.tasksByDescription).map(([description, items]) => (
                                            <div key={description} className="space-y-1.5">
                                                {items.map((it, idx) => {
                                                    const days = getDaysDiff(it.originalDoc.assignedDate);
                                                    const agingColor = days >= 5 ? 'text-rose-600' : days >= 3 ? 'text-amber-500' : 'text-emerald-600';
                                                    const agingBg = days >= 5 ? 'bg-rose-50' : days >= 3 ? 'bg-amber-50' : 'bg-emerald-50';
                                                    
                                                    return (
                                                        <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-[1.5rem] border-2 border-slate-100 hover:border-indigo-100 transition-all shadow-sm group">
                                                            <div className="flex items-center gap-3 w-52 shrink-0 border-r-2 border-slate-50 pr-3">
                                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[12px] bg-indigo-600 text-white shadow-md">{it.originalDoc.testerName.charAt(0)}</div>
                                                                <div className="min-w-0"><span className="text-[13px] font-black text-slate-900 uppercase truncate block leading-none">{it.originalDoc.testerName}</span><span className="text-[9px] font-black text-slate-400 uppercase mt-1 block italic tracking-widest">{formatDate(it.originalDoc.assignedDate)}</span></div>
                                                            </div>
                                                            <div className="flex-grow min-w-0 flex items-center gap-6">
                                                                <div className={`shrink-0 w-20 flex flex-col items-center justify-center p-2 rounded-xl border-2 ${agingBg} border-transparent shadow-inner`}><span className={`text-2xl font-black tracking-tighter leading-none ${agingColor}`}>{days}D</span></div>
                                                                <div className="flex-grow min-w-0"><span className="text-[16px] font-black text-slate-900 uppercase truncate block tracking-tighter leading-tight">{String(it.task['Sample Name'] || 'N/A')}</span><p className="text-[10px] font-bold text-rose-600 italic mt-0.5 truncate">ERR: "{it.task.notOkReason}"</p></div>
                                                            </div>
                                                            <button onClick={() => setConfirmModal({ isOpen: true, targetItems: [it], title: 'Resolve?', description: String(it.task['Sample Name']) })} className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-md group-hover:scale-105 active:scale-90"><CheckCircleIcon className="h-6 w-6"/></button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex gap-6 shrink-0 h-[220px] mb-6">
                            <div className="w-[50%] bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-xl flex flex-col overflow-hidden relative">
                                <div className="relative z-10 flex justify-between items-center mb-5 px-2">
                                    <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-[0.3em] italic">Species Deployment Ribbon</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Filtered By: {getFilterLabel()}</span>
                                        <BeakerIcon className="h-6 w-6 text-indigo-500" />
                                    </div>
                                </div>

                                <div className="flex-grow overflow-x-auto no-scrollbar flex gap-4 items-center px-2 pb-2">
                                    {distSummary.length === 0 ? (
                                        <div className="flex-grow flex items-center justify-center italic text-slate-300 font-black tracking-widest uppercase text-sm text-center">No Batches Logged in {getFilterLabel()}</div>
                                    ) : distSummary.map(s => {
                                        const isSelected = selectedChemical === s.name;
                                        return (
                                            <button key={s.name} onClick={() => setSelectedChemical(s.name)} className={`shrink-0 h-28 px-6 rounded-[2rem] border-2 transition-all duration-300 flex flex-col justify-center relative overflow-hidden text-left min-w-[180px] ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_15px_30px_-10px_rgba(79,70,229,0.5)] scale-[1.05]' : 'bg-white border-slate-100 hover:border-indigo-200 shadow-md'}`}>
                                                <span className={`text-[10px] font-black uppercase tracking-widest opacity-70 mb-2 truncate`}>{s.name}</span>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-3xl font-black leading-none">{s.total.toFixed(0)}</span>
                                                    <span className="text-[10px] font-bold opacity-70">ml</span>
                                                    <span className={`ml-auto text-sm font-black ${isSelected ? 'text-indigo-200' : s.yieldColor}`}>{s.yield.toFixed(0)}%</span>
                                                </div>
                                                <div className={`h-2 w-full rounded-full mt-3 overflow-hidden ${isSelected ? 'bg-indigo-900/40' : 'bg-slate-100'}`}><div className={`h-full transition-all duration-1000 ${isSelected ? 'bg-white' : s.barColor}`} style={{ width: `${Math.min(s.yield, 100)}%` }}></div></div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex-grow bg-white rounded-[2.5rem] p-6 text-slate-900 shadow-xl flex items-center justify-between border border-slate-200 relative overflow-hidden group">
                                <div className="shrink-0 space-y-3 mr-6">
                                    <h3 className="text-[13px] font-black tracking-[0.2em] uppercase italic text-slate-900 leading-none">Yield Intelligence</h3>
                                    <div className="px-5 py-2.5 bg-indigo-50 rounded-2xl border-2 border-indigo-100 text-[11px] font-black text-indigo-700 uppercase tracking-widest shadow-inner">
                                        Focus: <span className="text-lg tracking-tighter ml-1">{selectedChemical || '---'}</span>
                                    </div>
                                </div>
                                <div className="flex-grow h-full bg-slate-50/70 rounded-[2rem] border-2 border-slate-100 p-4 overflow-hidden shadow-inner">
                                    {selectedChemical ? <PremiumScatterPlot data={filteredLogsForGraph} chemical={selectedChemical} /> : <div className="flex items-center justify-center h-full opacity-20 text-sm font-black uppercase tracking-widest">Select Species from Ribbon</div>}
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl">
                            <div className="px-10 py-5 border-b border-slate-100 bg-slate-50/40 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-4">
                                    <ClipboardListIcon className="h-6 w-6 text-indigo-600" />
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 italic">History Ledger ({getFilterLabel()})</h3>
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white px-5 py-2 rounded-full border border-slate-100 shadow-sm">{filteredDistLogsByTime.length} Filtered Records</span>
                            </div>
                            <div className="flex-grow overflow-y-auto no-scrollbar pb-10">
                                <table className="min-w-full text-left border-separate border-spacing-0">
                                    <thead className="sticky top-0 bg-white/95 backdrop-blur-md text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 z-10">
                                        <tr><th className="px-10 py-5">Date</th><th className="px-10 py-5">Species</th><th className="px-10 py-5">Input</th><th className="px-10 py-5">Output</th><th className="px-10 py-5">Yield</th><th className="px-10 py-5">Operator</th><th className="px-10 py-5 text-center">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredDistLogsByTime.map(log => {
                                            const isLowYield = log.yieldPercent < 95;
                                            return (
                                                <tr key={log.id} className={`group transition-all duration-300 ${selectedChemical === log.chemicalName ? 'bg-indigo-50/40' : 'hover:bg-slate-50/50'}`}>
                                                    <td className="px-10 py-4"><span className="text-[14px] font-black text-slate-500">{log.date}</span></td>
                                                    <td className="px-10 py-4"><span className="text-xl font-black uppercase text-base-900 dark:text-base-100 tracking-tighter italic">{log.chemicalName}</span></td>
                                                    <td className="px-10 py-4"><span className="text-[16px] font-bold text-slate-600">{log.inputAmount.toFixed(0)} <span className="text-[10px] font-normal opacity-40">ml</span></span></td>
                                                    <td className="px-10 py-4"><span className="text-[18px] font-black text-base-900">{log.outputAmount.toFixed(0)} <span className="text-[10px] font-normal opacity-40">ml</span></span></td>
                                                    <td className="px-10 py-4">
                                                        <div className="flex items-center gap-6">
                                                            <span className={`text-[18px] font-black w-16 ${!isLowYield ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                {log.yieldPercent.toFixed(1)}%
                                                            </span>
                                                            <div className="flex-grow max-w-[100px] h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                                                <div className={`h-full transition-all duration-1000 ${!isLowYield ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(log.yieldPercent, 100)}%` }}></div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-10 py-4"><div className="flex items-center gap-4"><div className="w-9 h-9 rounded-xl bg-base-900 flex items-center justify-center text-[10px] font-black text-white shadow-md">{log.recorderName.substring(0,2).toUpperCase()}</div><span className="text-[14px] font-black text-slate-700 uppercase truncate max-w-[140px]">{log.recorderName}</span></div></td>
                                                    <td className="px-10 py-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => handleEditStart(log)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm" title="Edit record"><PencilIcon className="h-5 w-5" /></button>
                                                            <button onClick={() => setDistDeleteConfirm(log)} className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all shadow-sm" title="Remove record"><TrashIcon className="h-5 w-5" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredDistLogsByTime.length === 0 && (
                                            <tr><td colSpan={7} className="py-24 text-center opacity-10 text-2xl font-black uppercase tracking-widest">No Batches in this Time Range</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
            <div className="px-10 text-[9px] font-black text-slate-300 text-center uppercase tracking-[1em] pb-4 shrink-0 opacity-40 italic">Quality Protocol • Security Layer V2.9.4 Active</div>
        </div>
    );
};

export default QualityDashboard;
