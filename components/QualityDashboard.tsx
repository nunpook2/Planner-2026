
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

    const groupedData: GroupedByRequest[] = useMemo(() => {
        const groups: Record<string, GroupedByRequest> = {};
        
        allAssigned.forEach(doc => {
            (doc.tasks || []).forEach((t, idx) => {
                if (t.status === TaskStatus.NotOK) {
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
    }, [allAssigned]);

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
            
            setNotification({ message: "Incident(s) resolved." });
            fetchData();
            onResolve();
        } catch (e) {
            setNotification({ message: "Sync error.", isError: true });
        } finally {
            setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' });
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: '2-digit' };
        return new Date(dateStr).toLocaleDateString('en-GB', options);
    };

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
                <div className="fixed inset-0 bg-base-900/95 backdrop-blur-xl flex items-center justify-center z-[200] p-4 animate-fade-in" onClick={() => setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' })}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden p-10 text-center space-y-6 border border-white/20" onClick={e => e.stopPropagation()}>
                        <div className="w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner bg-emerald-50 text-emerald-600">
                            <CheckCircleIcon className="h-10 w-10" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter leading-none">{confirmModal.title}</h3>
                            <p className="text-base-500 mt-4 text-[15px] font-bold leading-relaxed px-2">
                                ยืนยันการปิดงาน <span className="text-emerald-600 font-black">"{confirmModal.description}"</span><br/>
                                ตรวจสอบแล้วว่าปัญหาได้รับการแก้ไขจริง?
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 pt-4">
                            <button 
                                onClick={() => handleBatchResolve(confirmModal.targetItems!)}
                                className="w-full py-5 bg-emerald-600 border-emerald-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-emerald-700 active:scale-95 transition-all"
                            >
                                Confirm & Resolve
                            </button>
                            <button onClick={() => setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' })} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Keep for Investigation</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Compact Top Header */}
            <div className="flex justify-between items-center px-4 shrink-0">
                <div>
                    <h2 className="text-3xl font-black text-base-955 dark:text-base-50 tracking-tighter uppercase leading-none">Quality Intelligence</h2>
                    <p className="text-base-400 font-black uppercase tracking-[0.4em] text-[9px] mt-1.5">Mission Critical Failure Stream</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-5 py-2.5 bg-white dark:bg-base-900 border border-base-100 dark:border-base-800 rounded-2xl shadow-sm flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-base-400 uppercase tracking-widest">Active Failures</span>
                            <span className="text-xl font-black text-red-600 leading-none">{groupedData.reduce((acc, g) => acc + g.allTasks.length, 0)}</span>
                        </div>
                        <div className="p-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-500"><AlertTriangleIcon className="h-5 w-5" /></div>
                    </div>
                    <button onClick={fetchData} className="p-3.5 bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-2xl text-base-400 hover:text-primary-600 transition-all shadow-sm">
                        <RefreshIcon className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-grow min-h-0 bg-white dark:bg-base-900 rounded-[3rem] border border-base-200 dark:border-base-800 shadow-xl overflow-hidden flex flex-col backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex-grow flex items-center justify-center"><RefreshIcon className="h-12 w-12 animate-spin text-primary-200" /></div>
                ) : groupedData.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center opacity-10 text-center py-20">
                        <CheckCircleIcon className="h-32 w-32 mb-6 text-emerald-500" />
                        <span className="text-2xl font-black uppercase tracking-[0.5em] text-base-400">All Systems Clear</span>
                    </div>
                ) : (
                    <div className="flex-grow overflow-y-auto no-scrollbar p-6 space-y-8">
                        {groupedData.map((reqGroup) => (
                            <div key={reqGroup.requestId} className="bg-base-50/20 dark:bg-base-955/20 border border-base-100 dark:border-base-800 rounded-[2.5rem] shadow-sm overflow-hidden animate-fade-in group">
                                {/* Request Row Header */}
                                <div className="px-8 py-5 bg-white dark:bg-base-900 border-b border-base-100 dark:border-base-800 flex justify-between items-center">
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-[1.2rem] bg-primary-600 flex items-center justify-center text-white shadow-lg">
                                            <BeakerIcon className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-base-955 dark:text-white uppercase tracking-tight leading-none">{reqGroup.requestId}</h3>
                                            <div className="flex items-center gap-3 mt-2">
                                                <span className="text-[9px] font-black text-base-400 uppercase tracking-widest bg-base-50 dark:bg-base-800 px-2 py-0.5 rounded border border-base-100 dark:border-base-700">CAT: {reqGroup.category}</span>
                                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                                                    <CalendarIcon className="h-3 w-3" /> {formatDate(reqGroup.earliestDate)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-xl font-black text-[11px] uppercase border border-red-100 dark:border-red-900/50">
                                            {reqGroup.allTasks.length} Pending Actions
                                        </div>
                                    </div>
                                </div>

                                {/* Test Groups within Request */}
                                <div className="p-6 space-y-8">
                                    {Object.entries(reqGroup.tasksByDescription).map(([description, items]) => (
                                        <div key={description} className="space-y-4">
                                            <div className="flex justify-between items-center px-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                                                    <h4 className="text-base font-black text-base-955 dark:text-base-100 uppercase tracking-tight">{description}</h4>
                                                    <span className="px-2 py-0.5 bg-base-100 dark:bg-base-800 text-[10px] font-black text-base-400 rounded-lg">{items.length} units</span>
                                                </div>
                                                <button 
                                                    onClick={() => setConfirmModal({ isOpen: true, targetItems: items, title: 'Resolve Category?', description: description })}
                                                    className="px-6 py-2 bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase tracking-[0.1em] hover:brightness-110 shadow-lg shadow-emerald-500/20 border-b-4 border-emerald-800 transition-all active:scale-95"
                                                >
                                                    Resolve Category Group
                                                </button>
                                            </div>

                                            {/* Item Cards Grid */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                                {items.map((it, idx) => (
                                                    <div key={idx} className="group/item relative bg-white dark:bg-base-900 border-2 border-base-100 dark:border-base-800 rounded-[1.8rem] p-5 flex flex-col gap-4 hover:border-emerald-300 dark:hover:border-emerald-900/50 transition-all shadow-md">
                                                        <div className="flex justify-between items-start">
                                                            <div className="min-w-0">
                                                                <span className="text-[10px] font-black text-base-400 uppercase tracking-widest block mb-1">Sample Name</span>
                                                                <span className="text-[15px] font-black text-base-955 dark:text-base-50 uppercase truncate block leading-none">{String(it.task['Sample Name'] || 'N/A')}</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => setConfirmModal({ isOpen: true, targetItems: [it], title: 'Resolve Single Unit?', description: String(it.task['Sample Name'] || description) })}
                                                                className="p-3 bg-base-50 dark:bg-base-800 text-base-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-2xl transition-all shadow-sm border border-transparent hover:border-emerald-100"
                                                                title="Clear this unit"
                                                            >
                                                                <CheckCircleIcon className="h-5 w-5" />
                                                            </button>
                                                        </div>

                                                        {/* Prominent Analyst Display */}
                                                        <div className="flex items-center gap-3 bg-primary-50 dark:bg-primary-900/20 p-3 rounded-2xl border border-primary-100 dark:border-primary-800/50">
                                                            <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center text-[12px] font-black shadow-lg">
                                                                {it.originalDoc.testerName.charAt(0)}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="text-[8px] font-black text-primary-500 uppercase tracking-[0.2em] block">Assigned Analyst</span>
                                                                <span className="text-[13px] font-black text-primary-955 dark:text-primary-300 uppercase truncate block leading-none mt-0.5">{it.originalDoc.testerName}</span>
                                                            </div>
                                                        </div>

                                                        <div className="bg-red-50/50 dark:bg-red-955/10 px-4 py-3 rounded-2xl border border-red-100 dark:border-red-900/30 relative overflow-hidden">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <AlertTriangleIcon className="h-3 w-3 text-red-500" />
                                                                <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">Failure Report</span>
                                                            </div>
                                                            <p className="text-[13px] font-bold text-red-955 dark:text-red-100 leading-snug italic line-clamp-2">
                                                                "{it.task.notOkReason || 'Unknown error.'}"
                                                            </p>
                                                        </div>

                                                        <div className="flex justify-between items-center pt-1 px-1 border-t border-base-50 dark:border-base-800 pt-3 mt-auto">
                                                            <div className="flex gap-3 text-[9px] font-black text-base-400 uppercase tracking-widest">
                                                                <span className="text-indigo-500">{String(it.task.Variant || '-')}</span>
                                                                <span className="text-base-300">QTY: {String(it.task.Quantity || '1')}</span>
                                                            </div>
                                                            <span className="text-[8px] font-black text-base-200 uppercase tracking-[0.2em]">{it.task._id?.slice(-6).toUpperCase()}</span>
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
            <div className="px-6 text-[9px] font-black text-base-300 text-center uppercase tracking-[0.5em] pb-2">Operational Integrity Matrix • Final Quality Clearance Stream</div>
        </div>
    );
};

export default QualityDashboard;
