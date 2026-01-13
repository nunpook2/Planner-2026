
import React, { useState, useEffect, useMemo } from 'react';
import type { AssignedTask, RawTask } from '../types';
import { TaskStatus } from '../types';
import { 
    getAssignedTasks, 
    updateAssignedTask, 
    deleteAssignedTask,
    logResolutionEntries,
    getResolutionHistory
} from '../services/dataService';
import { 
    AlertTriangleIcon, CheckCircleIcon, 
    RefreshIcon, BeakerIcon, CalendarIcon,
    XCircleIcon, UserGroupIcon, DownloadIcon,
    SparklesIcon
} from './common/Icons';

declare const XLSX: any;

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

const QualityDashboard: React.FC<{ onResolve: () => void }> = ({ onResolve }) => {
    const [allAssigned, setAllAssigned] = useState<AssignedTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [searchAnalyst, setSearchAnalyst] = useState('');
    const [notification, setNotification] = useState<{message: string, isError?: boolean, isWarning?: boolean} | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean, 
        targetItems: FlattenedNotOkTask[] | null,
        title: string,
        description: string
    }>({ isOpen: false, targetItems: null, title: '', description: '' });

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await getAssignedTasks();
            setAllAssigned(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getDaysDiff = (assignedDate: string) => {
        if (!assignedDate) return 0;
        const start = new Date(assignedDate);
        const today = new Date();
        start.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diffTime = Math.abs(today.getTime() - start.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return days === 0 ? 1 : days;
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
            let severity: 'low' | 'medium' | 'high' = 'low';
            if (data.max >= 4 || data.count >= 15) severity = 'high';
            else if (data.max >= 2 || data.count >= 5) severity = 'medium';

            return {
                name,
                backlogCount: data.count,
                avgDays: avg,
                maxDays: data.max,
                severity
            };
        }).sort((a, b) => b.backlogCount - a.backlogCount);
    }, [allAssigned]);

    const groupedData: GroupedByRequest[] = useMemo(() => {
        const groups: Record<string, GroupedByRequest> = {};
        const searchLower = searchAnalyst.toLowerCase().trim();
        
        allAssigned.forEach(doc => {
            const analystMatch = !searchLower || doc.testerName.toLowerCase().includes(searchLower);
            
            (doc.tasks || []).forEach((t, idx) => {
                if (t.status === TaskStatus.NotOK && analystMatch) {
                    if (!groups[doc.requestId]) {
                        groups[doc.requestId] = {
                            requestId: doc.requestId,
                            earliestDate: doc.assignedDate,
                            category: doc.category,
                            oldestDays: 0,
                            tasksByDescription: {},
                            allTasks: []
                        };
                    }
                    
                    const desc = String(t.Description || 'General Task');
                    if (!groups[doc.requestId].tasksByDescription[desc]) {
                        groups[doc.requestId].tasksByDescription[desc] = [];
                    }
                    
                    const item: FlattenedNotOkTask = {
                        docId: doc.id,
                        originalDoc: doc,
                        task: t,
                        taskIndex: idx
                    };

                    groups[doc.requestId].tasksByDescription[desc].push(item);
                    groups[doc.requestId].allTasks.push(item);
                    
                    const days = getDaysDiff(doc.assignedDate);
                    if (days > groups[doc.requestId].oldestDays) {
                        groups[doc.requestId].oldestDays = days;
                    }
                    
                    if (doc.assignedDate < groups[doc.requestId].earliestDate) {
                        groups[doc.requestId].earliestDate = doc.assignedDate;
                    }
                }
            });
        });
        
        return Object.values(groups).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));
    }, [allAssigned, searchAnalyst]);

    const handleBatchResolve = async (targets: FlattenedNotOkTask[]) => {
        try {
            const historyEntries = targets.map(t => ({
                testerName: t.originalDoc.testerName,
                requestId: t.originalDoc.requestId,
                sampleName: String(t.task['Sample Name'] || 'N/A'),
                description: String(t.task['Description'] || 'N/A'),
                assignedDate: t.originalDoc.assignedDate,
                resolvedDate: new Date().toISOString().split('T')[0],
                daysToResolve: getDaysDiff(t.originalDoc.assignedDate),
                failureReason: t.task.notOkReason || 'N/A',
                category: t.originalDoc.category
            }));

            await logResolutionEntries(historyEntries);

            const byDocId: Record<string, { originalDoc: AssignedTask, indicesToRemove: number[] }> = {};
            targets.forEach(t => {
                if (!byDocId[t.docId]) {
                    byDocId[t.docId] = { originalDoc: t.originalDoc, indicesToRemove: [] };
                }
                byDocId[t.docId].indicesToRemove.push(t.taskIndex);
            });

            for (const docId in byDocId) {
                const { originalDoc, indicesToRemove } = byDocId[docId];
                const updatedTasks = originalDoc.tasks.filter((_, idx) => !indicesToRemove.includes(idx));
                if (updatedTasks.length > 0) {
                    await updateAssignedTask(originalDoc.id, { tasks: updatedTasks });
                } else {
                    await deleteAssignedTask(originalDoc.id);
                }
            }
            
            setNotification({ message: "Incident resolved and logged." });
            fetchData();
            onResolve();
        } catch (e) {
            setNotification({ message: "Update failed.", isError: true });
        } finally {
            setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' });
        }
    };

    const handleExportPerformance = async () => {
        setIsExporting(true);
        try {
            const history = await getResolutionHistory();
            if (history.length === 0) {
                setNotification({ message: "ยังไม่มีประวัติการปิดงานในระบบ (No data to export)", isWarning: true });
                return;
            }

            const ws = XLSX.utils.json_to_sheet(history.map(h => ({
                'Analyst': h.testerName,
                'Request ID': h.requestId,
                'Sample Name': h.sampleName,
                'Test Item': h.description,
                'Assigned Date': h.assignedDate,
                'Resolved Date': h.resolvedDate,
                'Days to Resolve (KPI)': h.daysToResolve,
                'Failure Reason': h.failureReason,
                'Category': h.category,
                'Record Timestamp': h.timestamp
            })));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Resolution Performance Log");
            XLSX.writeFile(wb, `Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
            setNotification({ message: "Performance log exported." });
        } catch (e) {
            setNotification({ message: "Export failed.", isError: true });
        } finally {
            setIsExporting(false);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 p-4 animate-slide-in-up relative overflow-hidden bg-base-50/10 dark:bg-transparent font-sans">
            {notification && (
                <div className={`fixed top-24 right-8 px-6 py-4 rounded-2xl shadow-2xl z-[150] animate-fade-in flex items-center gap-3 font-black text-xs uppercase tracking-widest ${
                    notification.isError ? 'bg-red-600 text-white' : 
                    notification.isWarning ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                }`}>
                    {notification.isError ? <XCircleIcon className="h-5 w-5" /> : 
                     notification.isWarning ? <AlertTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                    {notification.message}
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.isOpen && confirmModal.targetItems && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[200] p-4 animate-fade-in" onClick={() => setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' })}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden p-10 text-center space-y-6 border border-white/20" onClick={e => e.stopPropagation()}>
                        <div className="w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner bg-emerald-50 text-emerald-600">
                            <CheckCircleIcon className="h-10 w-10" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-base-900 dark:text-white uppercase tracking-tighter leading-none">{confirmModal.title}</h3>
                            <p className="text-base-500 mt-4 text-[15px] font-bold leading-relaxed px-2">
                                ยืนยันการปิดงานค้างสำหรับ <span className="text-emerald-600 font-black">"{confirmModal.description}"</span><br/>
                                รายการนี้จะถูกบันทึกประวัติการปิดงาน (Performance Log) และลบออกจากกระดานงานค้าง
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 pt-4">
                            <button onClick={() => handleBatchResolve(confirmModal.targetItems!)} className="w-full py-5 bg-emerald-600 border-emerald-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-emerald-700 active:scale-95 transition-all">Confirm & Resolve</button>
                            <button onClick={() => setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' })} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOP ANALYTICS SECTION */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 shrink-0 h-[380px]">
                {/* Left Card: Summary (Compact col-span-2) */}
                <div className="xl:col-span-2 bg-white dark:bg-base-900 rounded-[2.5rem] p-6 border border-base-200 dark:border-base-800 shadow-xl flex flex-col justify-between overflow-hidden">
                    <div>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-2xl font-black text-base-955 dark:text-base-50 tracking-tighter uppercase leading-none">Hub</h2>
                                <p className="text-base-400 font-black uppercase tracking-[0.2em] text-[8px] mt-1">Quality Center</p>
                            </div>
                            <button 
                                onClick={handleExportPerformance}
                                disabled={isExporting}
                                className="p-2.5 bg-base-50 dark:bg-base-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-base-400 hover:text-primary-600 rounded-xl transition-all shadow-sm border border-base-100 dark:border-base-700 group"
                            >
                                <DownloadIcon className={`h-5 w-5 ${isExporting ? 'animate-bounce' : 'group-hover:scale-110'}`} />
                            </button>
                        </div>

                        <div className="relative group mb-4">
                            <input 
                                type="text" 
                                placeholder="Find..." 
                                value={searchAnalyst}
                                onChange={e => setSearchAnalyst(e.target.value)}
                                className="w-full pl-10 pr-8 py-3 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-black text-xs focus:border-primary-500 transition-all shadow-inner"
                            />
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base-300 group-focus-within:text-primary-500"><UserGroupIcon className="h-4 w-4" /></div>
                        </div>
                    </div>

                    <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30 flex flex-col items-center justify-center text-center">
                         <span className="text-[9px] font-black text-red-800 dark:text-red-400 uppercase tracking-widest mb-1">Global Backlog</span>
                         <span className="text-4xl font-black text-red-600 leading-none">{groupedData.reduce((acc, g) => acc + g.allTasks.length, 0)}</span>
                    </div>
                </div>

                {/* Right Card: Performance Matrix (Wide col-span-10) */}
                <div className="xl:col-span-10 bg-white dark:bg-base-900 rounded-[2.5rem] p-6 border border-base-200 dark:border-base-800 shadow-xl flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center mb-6 px-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary-600 rounded-xl shadow-lg text-white"><SparklesIcon className="h-4 w-4" /></div>
                            <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-base-400">Backlog Intelligence Matrix</h3>
                        </div>
                        <button onClick={fetchData} className="p-2 text-base-300 hover:text-primary-600 transition-colors"><RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
                    </div>

                    <div className="flex-grow flex min-h-0">
                        {/* Static Row Labels - SHARPENED CONTRAST */}
                        <div className="w-32 flex flex-col justify-between py-4 border-r-2 border-base-100 dark:border-base-800 shrink-0 bg-base-50/30 dark:bg-base-955/20 rounded-l-3xl">
                            <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] h-12 flex items-center px-4">NAME</span>
                            <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] h-14 flex items-center px-4">BACKLOG</span>
                            <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] h-10 flex items-center px-4 border-y border-base-50 dark:border-base-800/50">AVG. AGE</span>
                            <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] h-10 flex items-center px-4">OLDEST</span>
                            <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] h-12 flex items-center px-4 border-t border-base-50 dark:border-base-800/50">ALERT</span>
                        </div>

                        {/* Horizontal Scroll Personnel Cards */}
                        <div className="flex-grow overflow-x-auto no-scrollbar flex gap-4 px-6 py-2">
                            {performanceData.length === 0 ? (
                                <div className="flex-grow flex items-center justify-center italic text-base-300 font-black opacity-30 tracking-[0.5em] uppercase">No Backlog Data Recorded</div>
                            ) : performanceData.map((p) => {
                                const isFiltering = searchAnalyst && p.name.toLowerCase().includes(searchAnalyst.toLowerCase());
                                const severity = 
                                    p.severity === 'high' ? { label: 'CRITICAL', bg: 'bg-red-600', text: 'text-red-700' } :
                                    p.severity === 'medium' ? { label: 'WARNING', bg: 'bg-amber-500', text: 'text-amber-700' } :
                                    { label: 'HEALTHY', bg: 'bg-emerald-600', text: 'text-emerald-700' };

                                return (
                                    <div 
                                        key={p.name}
                                        onClick={() => setSearchAnalyst(isFiltering ? '' : p.name)}
                                        className={`w-48 shrink-0 flex flex-col justify-between p-5 rounded-[2.2rem] border-2 transition-all cursor-pointer group
                                            ${isFiltering ? 'bg-primary-50 border-primary-500 shadow-[0_15px_30px_-10px_rgba(99,102,241,0.3)]' : 'bg-white dark:bg-base-800 border-base-100 dark:border-base-700 hover:border-primary-300 hover:shadow-lg'}
                                        `}
                                    >
                                        {/* Row 1: Name - SHARP BLACK */}
                                        <div className="h-12 flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[13px] shadow-sm transition-colors ${isFiltering ? 'bg-primary-600 text-white' : 'bg-slate-900 dark:bg-slate-700 text-white'}`}>
                                                {p.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className={`text-[14px] font-black uppercase tracking-tight truncate leading-tight ${isFiltering ? 'text-primary-700' : 'text-slate-900 dark:text-base-50'}`}>
                                                {p.name.split(' ')[0]}
                                            </span>
                                        </div>

                                        {/* Row 2: Backlog Units - HUGE & SHARP */}
                                        <div className="h-14 flex flex-col justify-center border-y-2 border-base-50 dark:border-base-800/50 my-2 bg-base-50/30 dark:bg-black/10 rounded-xl px-2">
                                            <div className="flex items-baseline gap-1">
                                                <span className={`text-4xl font-black tracking-tighter ${p.backlogCount >= 10 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>{p.backlogCount}</span>
                                                <span className="text-[10px] font-black text-base-400 uppercase tracking-widest">Units</span>
                                            </div>
                                        </div>

                                        {/* Row 3: Avg Age - HIGH CONTRAST */}
                                        <div className="h-10 flex items-center gap-3">
                                            <span className={`text-[16px] font-black min-w-[35px] ${p.avgDays >= 4 ? 'text-red-600' : 'text-slate-900 dark:text-base-200'}`}>{p.avgDays}D</span>
                                            <div className="flex-grow h-2.5 bg-base-100 dark:bg-base-955 rounded-full overflow-hidden border border-base-200 dark:border-base-800">
                                                <div className={`h-full transition-all duration-1000 ${p.avgDays >= 4 ? 'bg-red-600' : 'bg-emerald-600'}`} style={{ width: `${Math.min(p.avgDays * 25, 100)}%` }}></div>
                                            </div>
                                        </div>

                                        {/* Row 4: Oldest - LEGIBLE SHARP TEXT */}
                                        <div className="h-10 flex items-center">
                                            <div className={`px-4 py-1.5 rounded-xl font-black text-[12px] shadow-inner w-full text-center border-2 ${p.maxDays >= 4 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-800 dark:bg-base-955 dark:border-base-700 dark:text-base-100'}`}>
                                                Max {p.maxDays} Days
                                            </div>
                                        </div>

                                        {/* Row 5: Alert Badge - SOLID BOLD */}
                                        <div className="h-10 flex items-center">
                                            <span className={`px-3 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-xl w-full text-center ${severity.bg} border-b-4 border-black/20 animate-pulse-subtle`}>
                                                {severity.label}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* List Content Area */}
            <div className="flex-grow min-h-0 bg-white dark:bg-base-900 rounded-[3rem] border border-base-200 dark:border-base-800 shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex-grow flex items-center justify-center"><RefreshIcon className="h-12 w-12 animate-spin text-primary-200" /></div>
                ) : groupedData.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center opacity-10 text-center py-20">
                        <CheckCircleIcon className="h-32 w-32 mb-6 text-emerald-500" />
                        <span className="text-2xl font-black uppercase tracking-[0.5em] text-base-400">System Integrity Confirmed</span>
                    </div>
                ) : (
                    <div className="flex-grow overflow-y-auto no-scrollbar p-6 space-y-6">
                        {groupedData.map((reqGroup) => {
                            const getAgingColor = (days: number) => {
                                if (days <= 1) return 'bg-emerald-500 text-white';
                                if (days <= 3) return 'bg-amber-500 text-white';
                                return 'bg-red-600 text-white animate-pulse shadow-lg';
                            };

                            return (
                                <div key={reqGroup.requestId} className="space-y-3 animate-fade-in">
                                    <div className="flex items-center gap-4 px-6 py-4 bg-slate-900 text-white rounded-[2rem] shadow-xl border border-slate-800">
                                        <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center shadow-lg shrink-0"><BeakerIcon className="h-6 w-6 text-white" /></div>
                                        <div className="flex-grow min-w-0">
                                            <div className="flex flex-wrap items-center gap-4">
                                                <h3 className="text-2xl font-black uppercase tracking-tighter leading-none truncate">{reqGroup.requestId}</h3>
                                                <span className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-black text-[10px] uppercase shadow-lg border border-red-500">{reqGroup.allTasks.length} FAILURES</span>
                                                <div className={`px-4 py-1.5 rounded-full font-black text-[11px] uppercase tracking-widest flex items-center gap-2 border border-white/20 ${getAgingColor(reqGroup.oldestDays)}`}>
                                                    Max Aging: {reqGroup.oldestDays} Days
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 mt-2">
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Deployment: {reqGroup.category}</span>
                                                <div className="w-1 h-1 rounded-full bg-white/20"></div>
                                                <span className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] flex items-center gap-1.5 truncate"><CalendarIcon className="h-3 w-3" /> Initial Assign: {formatDate(reqGroup.earliestDate)}</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setConfirmModal({ isOpen: true, targetItems: reqGroup.allTasks, title: 'Close Entire Request?', description: reqGroup.requestId })}
                                            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-black rounded-[1.2rem] text-[10px] uppercase tracking-widest transition-all border border-white/5 active:scale-95 shadow-inner"
                                        >
                                            Resolve All
                                        </button>
                                    </div>

                                    <div className="space-y-4 pl-4">
                                        {Object.entries(reqGroup.tasksByDescription).map(([description, items]) => (
                                            <div key={description} className="space-y-2">
                                                <div className="flex justify-between items-center px-5 py-2.5 border-l-4 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-r-2xl">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-[15px] font-black text-emerald-955 dark:text-emerald-100 uppercase tracking-tight">{description}</h4>
                                                        <span className="px-2 py-0.5 bg-white dark:bg-base-800 text-[10px] font-black text-emerald-600 rounded-lg border border-emerald-100 dark:border-emerald-700">{items.length} units</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setConfirmModal({ isOpen: true, targetItems: items, title: 'Resolve Test Group?', description })}
                                                        className="text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-700 tracking-widest px-4 py-1.5 bg-white dark:bg-base-800 rounded-xl shadow-sm border border-emerald-100 transition-all hover:shadow-md active:scale-95"
                                                    >
                                                        Resolve Sub-Group
                                                    </button>
                                                </div>

                                                <div className="space-y-2">
                                                    {items.map((it, idx) => {
                                                        const daysPending = getDaysDiff(it.originalDoc.assignedDate);
                                                        const isCritical = daysPending >= 4;
                                                        
                                                        return (
                                                            <div key={idx} className={`group/row flex items-center gap-4 bg-white dark:bg-base-800/30 border-2 ${isCritical ? 'border-red-100' : 'border-base-50 dark:border-base-700'} py-3 px-6 rounded-[1.8rem] hover:border-primary-200 dark:hover:border-primary-900 transition-all shadow-sm`}>
                                                                {/* Analyst Detail */}
                                                                <div className="flex items-center gap-4 w-60 shrink-0 border-r border-base-100 dark:border-base-700 pr-4">
                                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[13px] shadow-lg ${isCritical ? 'bg-red-600 text-white' : 'bg-primary-600 text-white'}`}>
                                                                        {it.originalDoc.testerName.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <span className="text-[15px] font-black text-slate-900 dark:text-base-100 uppercase truncate block leading-none">{it.originalDoc.testerName}</span>
                                                                        <span className="text-[9px] font-black text-base-400 uppercase tracking-widest mt-1.5 block">{formatDate(it.originalDoc.assignedDate)} • {it.originalDoc.shift.toUpperCase()}</span>
                                                                    </div>
                                                                </div>

                                                                {/* Aging */}
                                                                <div className={`shrink-0 w-24 flex flex-col items-center justify-center p-3 rounded-2xl border-2 ${daysPending >= 4 ? 'bg-red-50 border-red-200' : daysPending >= 2 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                                                    <span className={`text-[18px] font-black leading-none ${daysPending >= 4 ? 'text-red-700' : daysPending >= 2 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                                        {daysPending}D
                                                                    </span>
                                                                    <span className="text-[8px] font-black uppercase tracking-widest mt-1 text-base-400">Backlog</span>
                                                                </div>

                                                                {/* Sample Detail */}
                                                                <div className="w-64 shrink-0 px-2 flex items-center gap-3">
                                                                    <div className="min-w-0">
                                                                        <span className="text-[15px] font-black text-slate-900 dark:text-base-50 uppercase truncate block leading-none tracking-tight">{String(it.task['Sample Name'] || 'N/A')}</span>
                                                                        <div className="flex gap-2 mt-1.5">
                                                                            <span className="text-[9px] font-black text-base-500 uppercase tracking-widest bg-base-50 dark:bg-base-955 px-2 py-1 rounded-lg border border-base-100 dark:border-base-800">V: {String(it.task.Variant || '-')}</span>
                                                                            <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-lg border border-primary-100 dark:border-primary-800">Q: {String(it.task.Quantity || '1')}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Issue Detail - VERY SHARP RED TEXT */}
                                                                <div className="flex-grow bg-slate-50 dark:bg-red-955/10 px-6 py-3 rounded-2xl border-2 border-red-100/50 dark:border-red-900/30 border-l-4 border-l-red-600 relative overflow-hidden flex items-center gap-4 shadow-inner">
                                                                    <AlertTriangleIcon className="h-5 w-5 text-red-600 shrink-0" />
                                                                    <p className="text-[15px] font-black text-red-700 dark:text-red-400 leading-snug italic truncate" title={it.task.notOkReason || ''}>
                                                                        "{it.task.notOkReason || 'Reported as Not OK by analyst.'}"
                                                                    </p>
                                                                </div>

                                                                {/* Action */}
                                                                <div className="shrink-0">
                                                                    <button 
                                                                        onClick={() => setConfirmModal({ isOpen: true, targetItems: [it], title: 'Resolve Specific Item?', description: String(it.task['Sample Name'] || description) })}
                                                                        className="w-12 h-12 bg-base-50 dark:bg-base-700 text-base-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900 rounded-2xl transition-all shadow-sm border-2 border-transparent hover:border-emerald-100 flex items-center justify-center group/btn active:scale-90"
                                                                    >
                                                                        <CheckCircleIcon className="h-8 w-8 group-hover/btn:scale-110 transition-transform" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="px-8 text-[9px] font-black text-base-300 text-center uppercase tracking-[0.8em] pb-1 shrink-0">Quality Intelligence Hub • Version 2.9 Core</div>
        </div>
    );
};

export default QualityDashboard;
