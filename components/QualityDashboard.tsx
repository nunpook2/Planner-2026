
import React, { useState, useEffect, useMemo } from 'react';
import type { AssignedTask, RawTask } from '../types';
import { TaskStatus } from '../types';
import { 
    getAssignedTasks, 
    updateAssignedTask, 
    deleteAssignedTask
} from '../services/dataService';
import { 
    AlertTriangleIcon, CheckCircleIcon, 
    RefreshIcon, BeakerIcon, CalendarIcon,
    XCircleIcon, UserGroupIcon
} from './common/Icons';

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
    tasksByDescription: Record<string, FlattenedNotOkTask[]>;
    allTasks: FlattenedNotOkTask[];
}

const QualityDashboard: React.FC<{ onResolve: () => void }> = ({ onResolve }) => {
    const [allAssigned, setAllAssigned] = useState<AssignedTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchAnalyst, setSearchAnalyst] = useState('');
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
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

    // Statistics for the Chart - Total counts per person
    const statsByAnalyst = useMemo(() => {
        const stats: Record<string, number> = {};
        allAssigned.forEach(doc => {
            const notOkCount = (doc.tasks || []).filter(t => t.status === TaskStatus.NotOK).length;
            if (notOkCount > 0) {
                stats[doc.testerName] = (stats[doc.testerName] || 0) + notOkCount;
            }
        });
        return Object.entries(stats).sort((a, b) => b[1] - a[1]);
    }, [allAssigned]);

    const groupedData: GroupedByRequest[] = useMemo(() => {
        const groups: Record<string, GroupedByRequest> = {};
        const searchLower = searchAnalyst.toLowerCase().trim();
        
        allAssigned.forEach(doc => {
            // Check if this document belongs to the filtered analyst
            const analystMatch = !searchLower || doc.testerName.toLowerCase().includes(searchLower);
            
            (doc.tasks || []).forEach((t, idx) => {
                if (t.status === TaskStatus.NotOK && analystMatch) {
                    if (!groups[doc.requestId]) {
                        groups[doc.requestId] = {
                            requestId: doc.requestId,
                            earliestDate: doc.assignedDate,
                            category: doc.category,
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
            
            setNotification({ message: "Incident resolved." });
            fetchData();
            onResolve();
        } catch (e) {
            setNotification({ message: "Update failed.", isError: true });
        } finally {
            setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' });
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const maxIncidents = Math.max(...statsByAnalyst.map(s => s[1]), 1);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 p-4 animate-slide-in-up relative overflow-hidden bg-base-50/10 dark:bg-transparent font-sans">
            {notification && (
                <div className={`fixed top-24 right-8 px-6 py-4 rounded-2xl shadow-2xl z-[150] animate-fade-in flex items-center gap-3 font-black text-xs uppercase tracking-widest ${notification.isError ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                    {notification.isError ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
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
                                รายการนี้จะถูกลบออกจากกระดานงานค้าง
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 pt-4">
                            <button onClick={() => handleBatchResolve(confirmModal.targetItems!)} className="w-full py-5 bg-emerald-600 border-emerald-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-emerald-700 active:scale-95 transition-all">Confirm & Resolve</button>
                            <button onClick={() => setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' })} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Dashboard: Stats & Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 shrink-0">
                <div className="xl:col-span-4 bg-white dark:bg-base-900 rounded-[2.5rem] p-6 border border-base-200 dark:border-base-800 shadow-xl flex flex-col justify-between">
                    <div>
                        <h2 className="text-3xl font-black text-base-900 dark:text-base-50 tracking-tighter uppercase leading-none">Quality Hub</h2>
                        <p className="text-base-400 font-black uppercase tracking-[0.4em] text-[9px] mt-1.5">Deviation Stream Management</p>
                    </div>

                    <div className="mt-6 space-y-4">
                        <div className="relative group">
                            <input 
                                type="text" 
                                placeholder="Filter by Analyst..." 
                                value={searchAnalyst}
                                onChange={e => setSearchAnalyst(e.target.value)}
                                className="w-full pl-10 pr-10 py-3 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-black text-xs focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                            />
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base-300 group-focus-within:text-primary-500 transition-colors"><UserGroupIcon className="h-4 w-4" /></div>
                            {searchAnalyst && (
                                <button onClick={() => setSearchAnalyst('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-base-400 hover:text-red-500 transition-colors">
                                    <XCircleIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center justify-between px-2">
                             <div className="flex items-center gap-2">
                                <AlertTriangleIcon className="h-5 w-5 text-red-600" />
                                <span className="text-[10px] font-black text-base-400 uppercase tracking-widest">Active Incidents</span>
                             </div>
                             <span className="text-3xl font-black text-red-600 leading-none">{groupedData.reduce((acc, g) => acc + g.allTasks.length, 0)}</span>
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-8 bg-white dark:bg-base-900 rounded-[2.5rem] p-6 border border-base-200 dark:border-base-800 shadow-xl overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-4 px-2">
                        <div className="flex items-center gap-3">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-base-400">Workload Chart (Click to Filter)</h3>
                            {searchAnalyst && <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-[8px] font-black rounded-full uppercase tracking-widest animate-pulse">Filtering: {searchAnalyst}</span>}
                        </div>
                        <button onClick={fetchData} className="p-2 text-base-300 hover:text-primary-600 transition-colors"><RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
                    </div>
                    <div className="flex-grow overflow-x-auto no-scrollbar pb-2">
                        <div className="flex items-end gap-5 h-full min-w-max px-4">
                            {statsByAnalyst.slice(0, 15).map(([name, count]) => {
                                const isCurrentFilter = searchAnalyst && name.toLowerCase().includes(searchAnalyst.toLowerCase());
                                return (
                                    <div 
                                        key={name} 
                                        onClick={() => setSearchAnalyst(isCurrentFilter ? '' : name)}
                                        className="flex flex-col items-center group w-20 cursor-pointer"
                                    >
                                        <div className="relative w-full flex flex-col items-center">
                                            {/* Data Label on top of bar */}
                                            <span className={`text-[12px] font-black mb-1.5 transition-all ${isCurrentFilter ? 'text-primary-600 scale-125' : 'text-red-600 group-hover:scale-110'}`}>
                                                {count}
                                            </span>
                                            <div 
                                                className={`w-12 rounded-t-2xl transition-all duration-500 shadow-lg ${isCurrentFilter ? 'bg-gradient-to-t from-primary-700 to-primary-500 shadow-primary-500/40' : 'bg-red-500/30 dark:bg-red-900/20 group-hover:bg-red-500/50'}`}
                                                style={{ height: `${(count / maxIncidents) * 110 + 10}px`, minHeight: '12px' }}
                                            ></div>
                                        </div>
                                        {/* Analyst Name Label */}
                                        <span className={`mt-3 text-[11px] font-black uppercase tracking-tight truncate w-full text-center py-1 rounded-lg transition-colors ${isCurrentFilter ? 'text-white bg-primary-600 px-2' : 'text-base-500 dark:text-base-400 group-hover:text-base-900 dark:group-hover:text-white'}`}>
                                            {name.split(' ')[0]}
                                        </span>
                                    </div>
                                );
                            })}
                            {statsByAnalyst.length === 0 && (
                                <div className="h-full w-full flex items-center justify-center opacity-10 font-black uppercase tracking-[0.5em] text-base-400">Zero Failures Detected</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* List Content: Grouped by Request ID */}
            <div className="flex-grow min-h-0 bg-white dark:bg-base-900 rounded-[3rem] border border-base-200 dark:border-base-800 shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex-grow flex items-center justify-center"><RefreshIcon className="h-12 w-12 animate-spin text-primary-200" /></div>
                ) : groupedData.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center opacity-10 text-center py-20">
                        <CheckCircleIcon className="h-32 w-32 mb-6 text-emerald-500" />
                        <span className="text-2xl font-black uppercase tracking-[0.5em] text-base-400">Clear System</span>
                    </div>
                ) : (
                    <div className="flex-grow overflow-y-auto no-scrollbar p-6 space-y-12">
                        {groupedData.map((reqGroup) => (
                            <div key={reqGroup.requestId} className="space-y-4 animate-fade-in">
                                {/* Header Section for Request ID - Using high contrast slate-900 */}
                                <div className="flex items-center gap-4 px-8 py-5 bg-slate-900 text-white rounded-[2.5rem] shadow-2xl border border-slate-800">
                                    <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center shadow-lg"><BeakerIcon className="h-6 w-6 text-white" /></div>
                                    <div className="flex-grow">
                                        <div className="flex items-center gap-4">
                                            <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">{reqGroup.requestId}</h3>
                                            <span className="px-3 py-1 bg-red-600 text-white rounded-lg font-black text-[10px] uppercase shadow-lg shadow-red-500/20">{reqGroup.allTasks.length} FAILURES</span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2">
                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">CAT: {reqGroup.category}</span>
                                            <div className="w-1 h-1 rounded-full bg-white/20"></div>
                                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2"><CalendarIcon className="h-3 w-3" /> First Incident: {formatDate(reqGroup.earliestDate)}</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setConfirmModal({ isOpen: true, targetItems: reqGroup.allTasks, title: 'Close Entire Request?', description: reqGroup.requestId })}
                                        className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all border border-white/10"
                                    >
                                        Resolve All ({reqGroup.allTasks.length})
                                    </button>
                                </div>

                                <div className="space-y-10 pl-6">
                                    {Object.entries(reqGroup.tasksByDescription).map(([description, items]) => (
                                        <div key={description} className="space-y-4">
                                            <div className="flex justify-between items-center px-4 py-2.5 border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-r-2xl">
                                                <div className="flex items-center gap-3">
                                                    <h4 className="text-base font-black text-emerald-900 dark:text-emerald-100 uppercase tracking-tight">{description}</h4>
                                                    <span className="px-2 py-0.5 bg-white dark:bg-base-800 text-[10px] font-bold text-emerald-600 rounded-lg shadow-sm border border-emerald-100 dark:border-emerald-700">{items.length} units</span>
                                                </div>
                                                <button 
                                                    onClick={() => setConfirmModal({ isOpen: true, targetItems: items, title: 'Resolve Test Group?', description })}
                                                    className="text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-700 tracking-widest px-4 py-1.5 bg-white dark:bg-base-800 rounded-xl shadow-sm border border-emerald-100 dark:border-emerald-700 hover:scale-105 active:scale-95 transition-all"
                                                >
                                                    Resolve Group
                                                </button>
                                            </div>

                                            <div className="space-y-2 px-2">
                                                {items.map((it, idx) => (
                                                    <div key={idx} className="group/row flex items-center gap-5 bg-white dark:bg-base-800/40 border-2 border-base-100 dark:border-base-700 p-5 rounded-3xl hover:border-red-300 dark:hover:border-red-900 transition-all shadow-md">
                                                        <div className="flex items-center gap-4 w-64 shrink-0 border-r-2 border-base-100 dark:border-base-700 pr-4">
                                                            <div className="w-11 h-11 rounded-2xl bg-primary-600 flex items-center justify-center text-white font-black text-[14px] shadow-lg">
                                                                {it.originalDoc.testerName.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="text-[9px] font-black text-primary-500 uppercase tracking-[0.2em] block mb-0.5">Analyst</span>
                                                                <span className="text-[15px] font-black text-base-900 dark:text-primary-300 uppercase truncate block leading-none">{it.originalDoc.testerName}</span>
                                                                <span className="text-[9px] font-bold text-base-400 uppercase tracking-widest mt-1.5 block">{formatDate(it.originalDoc.assignedDate)} • {it.originalDoc.shift.toUpperCase()}</span>
                                                            </div>
                                                        </div>

                                                        <div className="w-72 shrink-0 px-2">
                                                            <span className="text-[10px] font-black text-base-400 uppercase tracking-widest block mb-1">Sample</span>
                                                            <span className="text-[17px] font-black text-base-900 dark:text-base-50 uppercase truncate block leading-tight">{String(it.task['Sample Name'] || 'N/A')}</span>
                                                            <div className="flex gap-2 mt-2">
                                                                <span className="text-[9px] font-black text-base-500 uppercase tracking-widest bg-base-50 dark:bg-base-900 px-2 py-0.5 rounded-lg border border-base-100 dark:border-base-700">V: {String(it.task.Variant || '-')}</span>
                                                                <span className="text-[9px] font-black text-base-500 uppercase tracking-widest bg-base-50 dark:bg-base-900 px-2 py-0.5 rounded-lg border border-base-100 dark:border-base-700">Q: {String(it.task.Quantity || '1')}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex-grow bg-red-50 dark:bg-red-900/10 px-6 py-3.5 rounded-3xl border border-red-100 dark:border-red-900/30 relative overflow-hidden group-hover/row:bg-red-100 transition-colors">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <AlertTriangleIcon className="h-3.5 w-3.5 text-red-500" />
                                                                <span className="text-[9px] font-black text-red-600 uppercase tracking-[0.3em]">Failure Reason</span>
                                                            </div>
                                                            <p className="text-[14px] font-bold text-red-900 dark:text-red-100 leading-snug italic" title={it.task.notOkReason || ''}>
                                                                "{it.task.notOkReason || 'No specific reason reported.'}"
                                                            </p>
                                                        </div>

                                                        <div className="shrink-0 pl-3">
                                                            <button 
                                                                onClick={() => setConfirmModal({ isOpen: true, targetItems: [it], title: 'Resolve Specific Item?', description: String(it.task['Sample Name'] || description) })}
                                                                className="w-14 h-14 bg-base-50 dark:bg-base-700 text-base-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900 rounded-[1.2rem] transition-all shadow-sm border-2 border-transparent hover:border-emerald-100 flex items-center justify-center group/btn"
                                                            >
                                                                <CheckCircleIcon className="h-7 w-7 group-hover/btn:scale-110 transition-transform" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="px-8 text-[9px] font-black text-base-300 text-center uppercase tracking-[0.6em] pb-1">Quality Intelligence Network • Operational Integrity Assurance</div>
        </div>
    );
};

export default QualityDashboard;
