
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Tester, AssignedTask, RawTask, CategorizedTask, AssignedPrepareTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, updateAssignedTask, deleteAssignedTask, 
    getAssignedPrepareTasks, markItemAsPrepared, 
    addCategorizedTask, unassignTaskToPool, updateAssignedPrepareTask,
    resetItemPreparation,
    deleteAssignedPrepareTask,
    getCategorizedTasks,
    forceRecallTask
} from '../services/dataService';
import { 
    CheckCircleIcon, XCircleIcon, ArrowUturnLeftIcon, 
    RefreshIcon, AlertTriangleIcon, BeakerIcon, 
    ClipboardListIcon, CalendarIcon, UserGroupIcon, DownloadIcon,
    ChatBubbleLeftEllipsisIcon, SearchIcon
} from './common/Icons';

declare const XLSX: any;

const LockIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0V10.5m-2.25 1.333v4.63c0 .46.36.843.81.913a21.18 21.18 0 0 0 10.88 0c.45-.07.81-.453.81-.913v-4.63c0-.46-.36-.843-.81-.913a21.18 21.18 0 0 0-10.88 0c-.45.07-.81.453-.81.913Z" />
    </svg>
);

const UnlockIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 11.25h16.5m-16.5 0a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25h16.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25M12 15.75h.007v.008H12v-.008Z" />
    </svg>
);

interface ScheduleTabProps {
    testers: Tester[];
    onTasksUpdated: () => void;
    selectedDate: string;
    onDateChange: (date: string) => void;
    selectedShift: 'day' | 'night';
    onShiftChange: (shift: 'day' | 'night') => void;
}

const MissionLookupModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<{
        assigned: (AssignedTask | AssignedPrepareTask)[];
        inPool: CategorizedTask[];
    } | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const [assigned, prepare, pool] = await Promise.all([
                getAssignedTasks(),
                getAssignedPrepareTasks(),
                getCategorizedTasks()
            ]);

            const query = searchQuery.toLowerCase().trim();
            const filterById = (items: any[]) => items.filter(item => 
                String(item.requestId || item.id || '').toLowerCase().includes(query)
            );

            setResults({
                assigned: [...filterById(assigned), ...filterById(prepare)].sort((a, b) => b.assignedDate.localeCompare(a.assignedDate)),
                inPool: filterById(pool)
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/95 backdrop-blur-xl flex items-center justify-center z-[200] p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-white/10" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-base-100 dark:border-base-800 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary-600 rounded-2xl shadow-lg text-white"><SearchIcon className="h-6 w-6" /></div>
                        <div>
                            <h3 className="text-2xl font-black text-base-955 dark:text-white tracking-tighter uppercase leading-none">Mission Finder</h3>
                            <p className="text-[10px] font-black text-base-400 uppercase tracking-[0.3em] mt-2">Global Request Tracking System</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-base-100 dark:hover:bg-base-800 rounded-2xl transition-colors"><XCircleIcon className="h-6 w-6 text-base-300" /></button>
                </div>

                <div className="p-8 bg-base-50/50 dark:bg-base-800/20 shrink-0">
                    <div className="relative group">
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="Enter Request ID (e.g. RS1-12345)..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className="w-full pl-14 pr-32 py-5 bg-white dark:bg-base-900 border-2 border-base-200 dark:border-base-700 rounded-[2rem] outline-none font-black text-lg focus:ring-8 focus:ring-primary-500/10 focus:border-primary-500 transition-all shadow-xl"
                        />
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-base-300 group-focus-within:text-primary-500"><SearchIcon className="h-6 w-6" /></div>
                        <button 
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="absolute right-3 top-1/2 -translate-y-1/2 px-8 py-3 bg-primary-600 text-white font-black rounded-2xl uppercase text-[11px] tracking-widest hover:bg-primary-700 transition-all shadow-lg disabled:opacity-50"
                        >
                            {isSearching ? 'Searching...' : 'Locate'}
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-8 custom-scrollbar space-y-8">
                    {results ? (
                        <>
                            {results.assigned.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-primary-500 uppercase tracking-[0.4em] ml-4">Deployment History</h4>
                                    <div className="grid gap-3">
                                        {results.assigned.map((entry, idx) => {
                                            const isPrep = 'assistantName' in entry;
                                            const staffName = isPrep ? (entry as AssignedPrepareTask).assistantName : (entry as AssignedTask).testerName;
                                            const isDone = isPrep 
                                                ? entry.tasks.every(t => t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing')
                                                : (entry as AssignedTask).status === TaskStatus.Done;

                                            return (
                                                <div key={idx} className="flex items-center gap-6 p-6 bg-white dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-[2rem] shadow-md hover:border-primary-300 transition-all group">
                                                    <div className="flex flex-col items-center gap-1 shrink-0 w-20">
                                                        <span className="text-[10px] font-black text-base-400 uppercase">{entry.shift.toUpperCase()}</span>
                                                        <span className="text-[16px] font-black text-base-900 dark:text-base-100">{entry.assignedDate.split('-').reverse().slice(0,2).join('/')}</span>
                                                    </div>
                                                    <div className="w-px h-10 bg-base-100 dark:bg-base-800"></div>
                                                    <div className="flex-grow min-w-0">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[17px] font-black text-base-955 dark:text-base-50 uppercase tracking-tighter">{entry.requestId}</span>
                                                            <span className={`px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${isPrep ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>{isPrep ? 'PREPARATION' : 'TESTING'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <UserGroupIcon className="h-3.5 w-3.5 text-base-300" />
                                                            <span className="text-[12px] font-bold text-base-600 dark:text-base-400 uppercase">{staffName}</span>
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 flex items-center gap-3">
                                                        <span className="text-[10px] font-black text-base-400 uppercase">{entry.tasks.length} items</span>
                                                        <div className={`px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest ${isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-base-100 dark:bg-base-800 text-base-400 animate-pulse'}`}>
                                                            {isDone ? 'COMPLETED' : 'IN PROGRESS'}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {results.inPool.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-[0.4em] ml-4">Unassigned Queue</h4>
                                    <div className="grid gap-3">
                                        {results.inPool.map((entry, idx) => (
                                            <div key={idx} className="flex items-center gap-6 p-6 bg-orange-50/30 dark:bg-orange-955/10 border-2 border-orange-100 dark:border-orange-900/30 rounded-[2rem] shadow-sm">
                                                <div className="flex-grow min-w-0">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[17px] font-black text-orange-955 dark:text-orange-100 uppercase tracking-tighter">{entry.id}</span>
                                                        <span className={`px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest bg-orange-200 text-orange-800`}>AWAITING ASSIGNMENT</span>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-orange-600/70 mt-1 uppercase">Stored in {entry.category} pool</p>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-4">
                                                    <span className="text-[10px] font-black text-orange-400 uppercase">{entry.tasks.length} items pending</span>
                                                    <div className="w-10 h-10 rounded-full bg-white dark:bg-base-900 flex items-center justify-center text-orange-500 shadow-sm"><AlertTriangleIcon className="h-5 w-5" /></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {results.assigned.length === 0 && results.inPool.length === 0 && (
                                <div className="py-20 text-center opacity-30 flex flex-col items-center">
                                    <BeakerIcon className="h-20 w-20 mb-4" />
                                    <span className="text-lg font-black uppercase tracking-[0.3em]">No data found for this Request ID</span>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-20 text-center opacity-10 flex flex-col items-center">
                            <BeakerIcon className="h-32 w-32 mb-6" />
                            <span className="text-2xl font-black uppercase tracking-[0.5em]">Global Database Ready</span>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-base-50 dark:bg-base-800/40 text-center border-t border-base-100 dark:border-base-800">
                    <p className="text-[9px] font-black text-base-300 uppercase tracking-[0.5em]">Mission Integrity Monitoring active • End-to-end trace established</p>
                </div>
            </div>
        </div>
    );
};

const LocalModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (inputValue?: string) => void;
    title: string;
    message: string;
    initialValue?: string;
    showInput?: boolean;
    isTextArea?: boolean;
    inputPlaceholder?: string;
    confirmText?: string;
    confirmColor?: string;
    icon?: React.ReactNode;
    preventOutsideClick?: boolean;
    isReadOnly?: boolean;
}> = ({ 
    isOpen, onClose, onConfirm, title, message, initialValue = '', showInput, 
    isTextArea, inputPlaceholder, confirmText = "Confirm", 
    confirmColor = "bg-primary-600", icon, preventOutsideClick = false,
    isReadOnly = false
}) => {
    const [val, setVal] = useState('');
    
    useEffect(() => { 
        if (isOpen) {
            setVal(initialValue); 
        }
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in" 
            onClick={!preventOutsideClick ? onClose : undefined}
        >
            <div className="bg-white dark:bg-base-800 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] p-8 w-full max-w-lg m-4 space-y-6 animate-slide-in-up border border-white/20 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${confirmColor.includes('red') || confirmColor.includes('orange') ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {icon || <ChatBubbleLeftEllipsisIcon className="h-6 w-6" />}
                    </div>
                    <h3 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">{title}</h3>
                </div>

                {message && <p className="text-sm font-medium text-base-600 dark:text-base-300 leading-relaxed whitespace-pre-wrap px-1">{message}</p>}
                
                {showInput && (
                    <div className="relative group">
                        {isTextArea ? (
                            <textarea 
                                autoFocus={!isReadOnly}
                                readOnly={isReadOnly}
                                value={val} 
                                onChange={e => setVal(e.target.value)} 
                                placeholder={inputPlaceholder} 
                                rows={5}
                                className={`w-full p-5 bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none dark:text-white font-bold text-[15px] resize-none transition-all ${isReadOnly ? 'cursor-default border-transparent ring-0' : ''}`}
                            />
                        ) : (
                            <input 
                                autoFocus={!isReadOnly}
                                readOnly={isReadOnly}
                                type="text" 
                                value={val} 
                                onChange={e => setVal(e.target.value)} 
                                placeholder={inputPlaceholder} 
                                className={`w-full p-4 bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all ${isReadOnly ? 'cursor-default border-transparent ring-0' : ''}`} 
                                onKeyDown={e => { if (e.key === 'Enter' && val.trim() && !isReadOnly) onConfirm(val); }} 
                            />
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-4 pt-2">
                    <button onClick={onClose} className="px-6 py-3 text-[11px] font-black text-base-400 hover:text-base-800 dark:hover:text-white uppercase tracking-widest transition-colors">Close</button>
                    {(showInput || confirmText) && !isReadOnly && (
                        <button 
                            onClick={() => onConfirm(val)} 
                            className={`px-8 py-3.5 text-[11px] font-black text-white rounded-2xl shadow-xl uppercase tracking-widest ${confirmColor} hover:brightness-110`}
                        >
                            {confirmText}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const getTaskValue = (task: RawTask, header: string): any => {
    const keys = Object.keys(task);
    const target = header.toLowerCase().trim();
    // Special mapping for common variations
    if (target === 'quantity' || target === 'qty') {
        const qtyKey = keys.find(k => ['quantity', 'qty', 'amount', 'units'].includes(k.toLowerCase().trim()));
        if (qtyKey) return task[qtyKey];
    }
    const matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    return matchedKey ? task[matchedKey] : '';
};

const getPriorityLabel = (category: string, tasks: RawTask[]): string => {
    const allContent = tasks.map(t => Object.values(t).map(v => String(v).toLowerCase()).join(' ')).join(' ');
    if (category.toLowerCase() === 'pocat' || allContent.includes('po cat')) return 'Po cat';
    if (allContent.includes('lsp')) return 'LSP';
    if (allContent.includes('sprint')) return 'Sprint';
    if (category.toLowerCase() === 'urgent' || allContent.includes('urgent')) return 'Urgent';
    return 'Normal';
};

const PriorityBadge: React.FC<{ category: string, tasks: RawTask[] }> = ({ category, tasks }) => {
    const allContent = tasks.map(t => Object.values(t).map(v => String(v).toLowerCase()).join(' ')).join(' ');
    const isPoCat = category.toLowerCase() === 'pocat' || allContent.includes('po cat');
    const isLSP = allContent.includes('lsp');
    const isSprint = allContent.includes('sprint');
    const isUrgent = category.toLowerCase() === 'urgent' || allContent.includes('urgent');

    return (
        <div className="flex gap-1.5 ml-2">
            {isPoCat && <span className="px-2 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-lg uppercase tracking-wider shadow-lg shadow-orange-500/20">Po cat</span>}
            {isLSP && <span className="px-2 py-0.5 bg-cyan-600 text-white text-[9px] font-black rounded-lg uppercase tracking-wider shadow-lg shadow-cyan-500/20">LSP</span>}
            {isSprint && <span className="px-2 py-0.5 bg-rose-600 text-white text-[9px] font-black rounded-lg uppercase tracking-wider shadow-lg shadow-rose-500/20">Sprint</span>}
            {isUrgent && <span className="px-2 py-0.5 bg-red-600 text-white text-[9px] font-black rounded-lg uppercase tracking-wider shadow-lg shadow-red-500/20">Urgent</span>}
        </div>
    );
};

const ScheduleTab: React.FC<ScheduleTabProps> = ({ 
    testers, 
    onTasksUpdated, 
    selectedDate, 
    onDateChange, 
    selectedShift, 
    onShiftChange 
}) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [activePersonId, setActivePersonId] = useState<string>('');
    const [isPlannerAuthorized, setIsPlannerAuthorized] = useState<boolean>(false);
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);
    const [isLookupOpen, setIsLookupOpen] = useState(false);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean; title: string; message: string; initialValue?: string; showInput?: boolean; isTextArea?: boolean; inputPlaceholder?: string; confirmText?: string; confirmColor?: string; icon?: React.ReactNode; onConfirm: (val?: string) => void; preventOutsideClick?: boolean; isReadOnly?: boolean;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const fetchData = async () => {
        try {
            const [assigned, prepared] = await Promise.all([ getAssignedTasks(), getAssignedPrepareTasks() ]);
            setAssignedTasks(assigned.filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setPrepareTasks(prepared.filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchData(); }, [selectedDate, selectedShift, activePersonId]);
    useEffect(() => { if (notification) { const t = setTimeout(() => setNotification(null), 3000); return () => clearTimeout(t); } }, [notification]);

    const activePerson = testers.find(t => t.id === activePersonId);
    const personTasks = assignedTasks.filter(t => t.testerId === activePersonId);
    const personPrepTasks = prepareTasks.filter(t => t.assistantId === activePersonId);

    const groupedPersonTasks = useMemo(() => {
        const groups: Record<string, { requestId: string, category: TaskCategory, items: { task: RawTask, sourceGroup: AssignedTask, index: number }[] }> = {};
        personTasks.forEach(group => {
            const effectiveId = group.category === TaskCategory.Manual ? 'AD-HOC-TASKS' : group.requestId;
            const displayId = group.category === TaskCategory.Manual ? 'MANUAL TASKS' : group.requestId;
            if (!groups[effectiveId]) groups[effectiveId] = { requestId: displayId, category: group.category, items: [] };
            group.tasks.forEach((task, idx) => groups[effectiveId].items.push({ task, sourceGroup: group, index: idx }));
        });
        return Object.values(groups).sort((a, b) => a.requestId.localeCompare(b.requestId));
    }, [personTasks]);

    const groupedPrepTasks = useMemo(() => {
        const groups: Record<string, { requestId: string, category: TaskCategory, items: { task: RawTask, sourceGroup: AssignedPrepareTask, index: number }[] }> = {};
        personPrepTasks.forEach(group => {
            const effectiveId = group.category === TaskCategory.Manual ? 'MANUAL-PREP' : group.requestId;
            const displayId = group.category === TaskCategory.Manual ? 'MANUAL PREP' : group.requestId;
            if (!groups[effectiveId]) groups[effectiveId] = { requestId: displayId, category: group.category, items: [] };
            group.tasks.forEach((task, idx) => groups[effectiveId].items.push({ task, sourceGroup: group, index: idx }));
        });
        return Object.values(groups).sort((a, b) => a.requestId.localeCompare(b.requestId));
    }, [personPrepTasks]);

    const handleUpdateStatus = async (group: AssignedTask, itemIndex: number, newStatus: TaskStatus, reason: string | null = null) => {
        const updatedItems = [...group.tasks];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], status: newStatus, notOkReason: reason };
        await updateAssignedTask(group.id, { tasks: updatedItems });
        fetchData();
    };

    const handleUpdateNote = async (type: 'exec' | 'prep', group: any, itemIndex: number, note: string) => {
        const updatedItems = [...group.tasks];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], plannerNote: note.trim() || null };
        if (type === 'exec') {
            await updateAssignedTask(group.id, { tasks: updatedItems });
        } else {
            await updateAssignedPrepareTask(group.id, { tasks: updatedItems });
        }
        fetchData();
        setModalConfig(p => ({ ...p, isOpen: false }));
        setNotification({ message: "Instruction Updated", isError: false });
    };

    const handleNoteClick = (type: 'exec' | 'prep', group: any, itemIndex: number) => {
        const currentNote = group.tasks[itemIndex].plannerNote || '';
        const isAuthorized = isPlannerAuthorized;

        // Allow personnel to see the note if it exists, even if locked
        if (!isAuthorized && !currentNote) {
            setNotification({ message: "Mission Briefing is empty.", isError: false });
            return;
        }

        setModalConfig({
            isOpen: true, 
            title: isAuthorized ? "Planner Mission Briefing" : "Mission Briefing", 
            message: isAuthorized ? "Edit specific instructions for this mission:" : "Special instructions provided by Planner:", 
            initialValue: currentNote,
            showInput: true, 
            isTextArea: true,
            isReadOnly: !isAuthorized,
            inputPlaceholder: "Enter detailed instructions...", 
            confirmText: isAuthorized ? "Save Mission" : "Close", 
            confirmColor: "bg-indigo-600",
            preventOutsideClick: true,
            onConfirm: (note) => {
                if (isAuthorized) {
                    handleUpdateNote(type, group, itemIndex, note || '');
                } else {
                    setModalConfig(p => ({ ...p, isOpen: false }));
                }
            }
        });
    };

    const handleViewQualityIssue = (reason: string) => {
        setModalConfig({
            isOpen: true,
            title: "Quality Issue Details",
            message: reason,
            showInput: false,
            confirmColor: "bg-red-600",
            icon: <AlertTriangleIcon className="h-6 w-6" />,
            onConfirm: () => setModalConfig(p => ({ ...p, isOpen: false }))
        });
    };

    const handleNotOkClick = (group: AssignedTask, itemIndex: number) => {
        setModalConfig({
            isOpen: true, title: "Report Quality Issue", message: "Why is this task Not OK?", initialValue: '', showInput: true, inputPlaceholder: "Reason...", confirmText: "Mark Not OK", confirmColor: "bg-red-600",
            onConfirm: async (reason) => {
                if (!reason) return;
                await handleUpdateStatus(group, itemIndex, TaskStatus.NotOK, reason);
                setModalConfig(p => ({ ...p, isOpen: false }));
            }
        });
    };

    const handleMarkPrepared = async (group: AssignedPrepareTask, itemIndex: number) => {
        await markItemAsPrepared(group, itemIndex);
        fetchData();
    };

    const handleResetPrep = async (group: AssignedPrepareTask, itemIndex: number) => {
        if (!isPlannerAuthorized) {
            setNotification({ message: "Status Reset Locked", isError: true });
            return;
        }
        await resetItemPreparation(group, itemIndex);
        fetchData();
    };

    const handleCorrectionReturn = async (group: AssignedTask, itemIndex: number) => {
        if (!isPlannerAuthorized) return; // Protected action
        const item = group.tasks[itemIndex];
        if (!item._id) return;
        await forceRecallTask(item._id);
        fetchData(); 
        onTasksUpdated();
        setNotification({ message: "Task Recalled (Quick)", isError: false });
    };

    const handlePrepReturn = async (group: AssignedPrepareTask, itemIndex: number) => {
        setModalConfig({
            isOpen: true, 
            title: "Abort Preparation", 
            message: "คุณต้องการคืนรายการงานเตรียมชิ้นนี้กลับไปที่คิว (Pool) เพื่อจัดสรรใหม่ใช่หรือไม่?", 
            initialValue: '',
            showInput: true, 
            inputPlaceholder: "ระบุเหตุผลการคืนงานเตรียม...", 
            confirmText: "คืนงานรายชิ้น", 
            confirmColor: "bg-orange-600",
            preventOutsideClick: true,
            onConfirm: async (reason) => {
                if (!reason) return;
                const item = group.tasks[itemIndex];
                if (!item._id) return;
                await forceRecallTask(item._id, reason, group.assistantName);
                fetchData(); 
                onTasksUpdated(); 
                setModalConfig(p => ({ ...p, isOpen: false }));
                setNotification({ message: "Item returned to pool", isError: false });
            }
        });
    };

    const handleTesterReturn = async (group: AssignedTask, itemIndex: number) => {
        setModalConfig({
            isOpen: true, 
            title: "Abort Mission", 
            message: "Why return this task to the pool?", 
            initialValue: '',
            showInput: true, 
            inputPlaceholder: "Reason...", 
            confirmText: "Abort", 
            confirmColor: "bg-orange-600",
            preventOutsideClick: true,
            onConfirm: async (reason) => {
                if (!reason) return;
                const item = group.tasks[itemIndex];
                if (!item._id) return;
                await forceRecallTask(item._id, reason, group.testerName);
                fetchData(); 
                onTasksUpdated(); 
                setModalConfig(p => ({ ...p, isOpen: false }));
                setNotification({ message: "Task returned with remark", isError: false });
            }
        });
    };
    
    const handleExport = () => {
        const exportDate = selectedDate;
        const [y, m, d] = exportDate.split('-');
        const dateDisplay = `${d}-${m}-${y.substring(2)}`;
        
        const combinedRawAssignments: { personnel: string; requestId: string; task: RawTask; taskType: string; priority: string }[] = [];
        
        assignedTasks.forEach(group => {
            const priority = getPriorityLabel(group.category, group.tasks);
            group.tasks.forEach(task => {
                combinedRawAssignments.push({ 
                    personnel: group.testerName, 
                    requestId: group.requestId, 
                    task, 
                    taskType: 'งานทดสอบ (Testing)',
                    priority
                });
            });
        });

        prepareTasks.forEach(group => {
            const priority = getPriorityLabel(group.category, group.tasks);
            group.tasks.forEach(task => {
                combinedRawAssignments.push({ 
                    personnel: group.assistantName, 
                    requestId: group.requestId, 
                    task, 
                    taskType: 'งานเตรียมตัวอย่าง (Preparation)',
                    priority
                });
            });
        });

        const hierarchy: Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, { count: number; remark: string }>>>>>>> = {};

        combinedRawAssignments.forEach(({ personnel, requestId, task, taskType, priority }) => {
            const desc = String(getTaskValue(task, 'Description') || 'General Task').trim();
            const variant = String(getTaskValue(task, 'Variant') || '-').trim();
            const remark = task.plannerNote || '';
            const qVal = getTaskValue(task, 'Quantity');
            // Correctly parse quantity from task data (numeric or string)
            const taskQty = typeof qVal === 'number' ? qVal : (parseInt(String(qVal)) || 1);
            
            if (!hierarchy[personnel]) hierarchy[personnel] = {};
            if (!hierarchy[personnel][exportDate]) hierarchy[personnel][exportDate] = {};
            if (!hierarchy[personnel][exportDate][requestId]) hierarchy[personnel][exportDate][requestId] = {};
            if (!hierarchy[personnel][exportDate][requestId][priority]) hierarchy[personnel][exportDate][requestId][priority] = {};
            if (!hierarchy[personnel][exportDate][requestId][priority][taskType]) hierarchy[personnel][exportDate][requestId][priority][taskType] = {};
            if (!hierarchy[personnel][exportDate][requestId][priority][taskType][desc]) hierarchy[personnel][exportDate][requestId][priority][taskType][desc] = {};
            
            if (!hierarchy[personnel][exportDate][requestId][priority][taskType][desc][variant]) {
                hierarchy[personnel][exportDate][requestId][priority][taskType][desc][variant] = { count: 0, remark: remark };
            }
            
            // Increment by actual quantity value instead of always adding 1
            hierarchy[personnel][exportDate][requestId][priority][taskType][desc][variant].count += taskQty;
            
            const currentObj = hierarchy[personnel][exportDate][requestId][priority][taskType][desc][variant];
            if (remark && !currentObj.remark) {
                currentObj.remark = remark;
            } else if (remark && currentObj.remark && !currentObj.remark.includes(remark)) {
                currentObj.remark += `; ${remark}`;
            }
        });

        const rows: any[][] = [];
        rows.push(["Tester", "Plantodate", "Request ID", "ลำดับความสำคัญ", "ประเภทงาน", "รายการทดสอบ", "Variant", "Remark", "Total"]);

        let grandTotal = 0;
        const sortedTesters = Object.keys(hierarchy).sort();

        sortedTesters.forEach((tester) => {
            const testerDates = hierarchy[tester];
            Object.keys(testerDates).forEach((date) => {
                const reqIds = testerDates[date];
                const sortedReqIds = Object.keys(reqIds).sort();
                
                sortedReqIds.forEach((reqId, rIdx) => {
                    const priorities = reqIds[reqId];
                    const sortedPriorities = Object.keys(priorities).sort();

                    sortedPriorities.forEach((priority, pIdx) => {
                        const taskTypes = priorities[priority];
                        const sortedTaskTypes = Object.keys(taskTypes).sort();

                        sortedTaskTypes.forEach((taskType, tyIdx) => {
                            const descs = taskTypes[taskType];
                            const sortedDescs = Object.keys(descs).sort();
                            
                            sortedDescs.forEach((desc, dsIdx) => {
                                const variants = descs[desc];
                                const sortedVariants = Object.keys(variants).sort();

                                sortedVariants.forEach((variant, vIdx) => {
                                    const { count, remark } = variants[variant];
                                    grandTotal += count;

                                    const row: any[] = [];
                                    row[0] = (rIdx === 0 && pIdx === 0 && tyIdx === 0 && dsIdx === 0 && vIdx === 0) ? tester : "";
                                    row[1] = (rIdx === 0 && pIdx === 0 && tyIdx === 0 && dsIdx === 0 && vIdx === 0) ? dateDisplay : "";
                                    row[2] = (pIdx === 0 && tyIdx === 0 && dsIdx === 0 && vIdx === 0) ? reqId : "";
                                    row[3] = (tyIdx === 0 && dsIdx === 0 && vIdx === 0) ? priority : "";
                                    row[4] = (dsIdx === 0 && vIdx === 0) ? taskType : "";
                                    row[5] = (vIdx === 0) ? desc : "";
                                    row[6] = variant;
                                    row[7] = remark;
                                    row[8] = count;

                                    rows.push(row);
                                });
                            });
                        });
                    });
                });
            });
            rows.push([]);
        });

        rows.push(["Grand Total", "", "", "", "", "", "", "", grandTotal]);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [ { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 25 }, { wch: 35 }, { wch: 25 }, { wch: 45 }, { wch: 8 } ];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Mission Summary"); XLSX.writeFile(wb, `ShiftMissionSummary_${exportDate}_${selectedShift}.xlsx`);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-3 p-3 overflow-hidden">
            <style>{`
                .person-avatar { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); }
                .person-avatar.assistant { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); }
                .active-glow { box-shadow: 0 0 20px -5px rgba(99, 102, 241, 0.4); }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                @keyframes red-ring-pulse { 0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.3); transform: scale(1); } 70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); transform: scale(1.05); } 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); transform: scale(1); } }
                .luxury-red-pulse { animation: red-ring-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            `}</style>
            
            <LocalModal isOpen={modalConfig.isOpen} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} onConfirm={modalConfig.onConfirm} title={modalConfig.title} message={modalConfig.message} initialValue={modalConfig.initialValue} showInput={modalConfig.showInput} isTextArea={modalConfig.isTextArea} isReadOnly={modalConfig.isReadOnly} inputPlaceholder={modalConfig.inputPlaceholder} confirmText={modalConfig.confirmText} confirmColor={modalConfig.confirmColor} icon={modalConfig.icon} preventOutsideClick={modalConfig.preventOutsideClick} />
            <MissionLookupModal isOpen={isLookupOpen} onClose={() => setIsLookupOpen(false)} />

            {notification && <div className={`fixed bottom-10 right-10 z-[110] px-6 py-4 rounded-2xl shadow-2xl animate-slide-in-up flex items-center gap-3 font-black text-xs uppercase tracking-widest ${notification.isError ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}><CheckCircleIcon className="h-5 w-5" />{notification.message}</div>}

            <div className="flex-grow grid grid-cols-12 gap-4 h-full relative overflow-hidden">
                <div className="col-span-3 bg-white/40 dark:bg-base-900/40 rounded-[2.5rem] border border-white dark:border-base-800 shadow-sm flex flex-col overflow-hidden backdrop-blur-md h-full">
                    <div className="p-4 border-b border-white dark:border-base-800 bg-white/20 flex justify-between items-center shrink-0">
                        <h3 className="text-[10px] font-black text-base-400 uppercase tracking-[0.4em] ml-1">Duty Roster</h3>
                        <div className="flex gap-1.5">
                            <button onClick={() => setIsLookupOpen(true)} title="Mission Lookup" className="p-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all shadow-md active:scale-95"><SearchIcon className="h-4 w-4" /></button>
                            <button onClick={() => setIsPlannerAuthorized(!isPlannerAuthorized)} title={isPlannerAuthorized ? "Planner Tools: Unlocked" : "Planner Tools: Locked"} className={`p-2 rounded-xl transition-all shadow-sm border ${isPlannerAuthorized ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white dark:bg-base-800 border-base-200 dark:border-base-700 text-base-400 hover:text-indigo-600'}`}>
                                {isPlannerAuthorized ? <UnlockIcon className="h-4 w-4" /> : <LockIcon className="h-4 w-4" />}
                            </button>
                            <button onClick={handleExport} title="Export Summary" className="p-2 bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-xl hover:bg-base-50 transition-colors shadow-sm"><DownloadIcon className="h-4 w-4 text-base-500" /></button>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar p-2.5 space-y-1.5">
                        {testers.filter(t => assignedTasks.some(at => at.testerId === t.id) || prepareTasks.some(pt => pt.assistantId === t.id)).map(tester => {
                            const isActive = activePersonId === tester.id;
                            const isAssistant = tester.team === 'assistants_4_2';
                            const count = assignedTasks.filter(at => at.testerId === tester.id).reduce((acc, g) => acc + g.tasks.length, 0) + prepareTasks.filter(pt => pt.assistantId === tester.id).reduce((acc, g) => acc + g.tasks.length, 0);
                            return (
                                <button key={tester.id} onClick={() => setActivePersonId(tester.id)} className={`w-full group flex items-center gap-3 p-3 rounded-[1.3rem] transition-all duration-300 border text-left ${isActive ? 'bg-gradient-to-r from-primary-600 to-indigo-600 border-primary-500 text-white shadow-lg active-glow scale-[1.02]' : 'bg-white/40 dark:bg-base-900/40 hover:bg-white dark:hover:bg-base-800 border-transparent hover:border-base-200 dark:hover:border-base-700'}`}>
                                    <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-black shadow-inner ${isAssistant ? 'person-avatar assistant' : 'person-avatar'} ${isActive ? 'ring-2 ring-white/40' : 'text-white'}`}>{tester.name.substring(0, 2).toUpperCase()}</div>
                                    <div className="flex-grow min-w-0"><span className={`block text-[14px] font-black tracking-tight truncate leading-none ${isActive ? 'text-white' : 'text-base-800 dark:text-base-100'}`}>{tester.name}</span><span className={`text-[8px] font-bold uppercase tracking-widest mt-1 ${isActive ? 'text-white/60' : 'text-base-400'}`}>{isAssistant ? 'Assistant' : 'Analyst'}</span></div>
                                    {count > 0 && <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black ${isActive ? 'bg-white text-primary-600 shadow-md' : 'bg-primary-50 text-white'}`}>{count}</div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="col-span-9 bg-white/60 dark:bg-base-900/60 rounded-[2rem] border border-white dark:border-base-800 shadow-2xl flex flex-col overflow-hidden relative backdrop-blur-xl h-full">
                    <div className="px-8 py-4 border-b border-white dark:border-base-800 flex justify-between items-center bg-white/40 dark:bg-base-800/10 shrink-0 sticky top-0 z-10 backdrop-blur-md">
                        <div className="flex items-center gap-5">
                            {activePerson ? (
                                <>
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-base font-black text-white shadow-xl ${activePerson.team === 'assistants_4_2' ? 'person-avatar assistant' : 'person-avatar'}`}>{activePerson.name.substring(0, 2).toUpperCase()}</div>
                                    <div>
                                        <h2 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter leading-none">{activePerson.name}</h2>
                                        <p className="text-[10px] text-base-400 font-bold uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">Operational Tasks Control{isPlannerAuthorized && <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[8px] font-black tracking-widest">PLANNER MODE</span>}</p>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-3 text-base-300 italic font-bold text-sm tracking-widest uppercase"><UserGroupIcon className="h-5 w-5" /> Select Personnel</div>
                            )}
                        </div>
                        <div className="flex gap-2.5 bg-white/60 dark:bg-base-800/60 p-2 rounded-2xl border border-white dark:border-base-700 shadow-inner relative"><input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="bg-transparent border-none text-[12px] font-black focus:ring-0 cursor-pointer p-1 min-w-[140px] dark:text-white" /><select value={selectedShift} onChange={e => onShiftChange(e.target.value as any)} className="bg-transparent border-none text-[10px] font-black focus:ring-0 cursor-pointer p-1 uppercase dark:text-white tracking-widest"><option value="day">Day Shift</option><option value="night">Night Shift</option></select></div>
                    </div>

                    <div className="flex-grow overflow-y-auto no-scrollbar p-8 space-y-8">
                        {!activePerson ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-10 text-center py-20"><BeakerIcon className="h-24 w-24 mb-4 text-base-300" /><p className="text-xl font-black uppercase tracking-[0.5em] text-base-400">Select Personnel to Track</p></div>
                        ) : (
                            <>
                                {groupedPrepTasks.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2.5 ml-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-md"></div><h4 className="text-[11px] font-black text-amber-600 uppercase tracking-[0.2em]">Preparation Mission Group</h4></div>
                                        {groupedPrepTasks.map(group => (
                                            <div key={group.requestId} className="bg-amber-50/20 dark:bg-amber-900/10 rounded-[1.8rem] border-2 border-amber-100 dark:border-amber-900/30 overflow-hidden shadow-sm">
                                                <div className="px-6 py-4 bg-amber-900/90 text-white border-b border-amber-800 flex justify-between items-center backdrop-blur-sm">
                                                    <div className="flex items-center"><span className="text-[20px] font-black uppercase tracking-tighter leading-none">{group.requestId}</span><PriorityBadge category={group.category} tasks={group.items.map(i => i.task)} /></div>
                                                </div>
                                                <div className="p-3 space-y-2">
                                                    {group.items.map((item, idx) => {
                                                        const isPrepared = item.task.preparationStatus === 'Prepared' || item.task.preparationStatus === 'Ready for Testing';
                                                        const hasPlannerNote = !!item.task.plannerNote;
                                                        const desc = String(getTaskValue(item.task, 'Description') || 'General Task').trim();
                                                        const variant = String(getTaskValue(item.task, 'Variant') || '').trim();
                                                        const qty = String(getTaskValue(item.task, 'Quantity') || '1').trim();
                                                        const sampleName = String(getTaskValue(item.task, 'Sample Name') || '').trim();
                                                        return (
                                                            <div key={idx} className={`flex items-center justify-between p-4 rounded-[1.2rem] border transition-all ${isPrepared ? 'bg-emerald-50/20 border-emerald-100' : 'bg-white dark:bg-base-800/80 border-amber-100 dark:border-amber-900/20 shadow-sm'}`}>
                                                                <div className="flex items-center gap-4">
                                                                    <button onClick={() => handleNoteClick('prep', item.sourceGroup, item.index)} className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg border-2 ${hasPlannerNote ? 'bg-red-600 border-red-400 text-white luxury-red-pulse' : 'bg-base-50 dark:bg-base-955 border-base-100 dark:border-base-800 text-base-300 hover:text-base-600 hover:border-indigo-300'}`} title={hasPlannerNote ? "Read Mission Instruction" : "Add Mission Briefing"}><ChatBubbleLeftEllipsisIcon className="h-5 w-5" /></button>
                                                                </div>
                                                                <div className="flex-grow min-w-0 flex flex-row items-center gap-5 ml-2">
                                                                    <div className="flex flex-col flex-grow">
                                                                        <div className={`font-black uppercase leading-tight line-clamp-2 ${isPrepared ? 'text-emerald-800 opacity-60' : 'text-base-955 dark:text-base-100'} text-[16px]`}>{desc}</div>
                                                                        {variant && variant !== 'Manual Mission' && <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase mt-0.5 tracking-wider italic">{variant}</div>}
                                                                    </div>
                                                                    <div className="flex flex-shrink-0 items-center gap-3">
                                                                        <div className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-[12px] font-black text-amber-800 border border-amber-200">x{qty}</div>
                                                                        {sampleName && sampleName !== 'N/A' && <div className="px-3 py-1 bg-base-100 dark:bg-base-700/50 rounded-xl text-[12px] font-black text-base-800 dark:text-base-200 border border-base-200 dark:border-base-600 uppercase truncate max-w-[150px]">S: {sampleName}</div>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-row items-center gap-2 flex-shrink-0 ml-5 flex">
                                                                    {isPrepared ? (
                                                                        <button onClick={() => handleResetPrep(item.sourceGroup, item.index)} className={`px-4 py-2 text-[10px] font-black uppercase rounded-xl transition-all flex items-center gap-2 border-2 shadow-sm ${isPlannerAuthorized ? 'bg-base-100 dark:bg-base-800 text-base-700 dark:text-base-300 border-base-200 hover:bg-white' : 'bg-base-50 text-base-300 border-base-100 cursor-not-allowed opacity-50'}`}><RefreshIcon className="h-4 w-4" /> Reset</button>
                                                                    ) : (
                                                                        <button onClick={() => handleMarkPrepared(item.sourceGroup, item.index)} className="px-6 py-2.5 bg-amber-500 text-white font-black rounded-[1.2rem] shadow-xl uppercase text-[10px] tracking-widest hover:bg-amber-600 hover:scale-105 transition-all active:scale-95 border-b-4 border-amber-700">Mark Ready</button>
                                                                    )}
                                                                    <button onClick={() => handlePrepReturn(item.sourceGroup, item.index)} className="p-2.5 bg-white dark:bg-base-800 text-orange-600 dark:text-orange-400 border-2 border-orange-100 dark:border-orange-900/50 rounded-xl shadow-sm hover:bg-orange-50 transition-all" title="Abort Preparation Item (Return to Pool)"><ArrowUturnLeftIcon className="h-5 w-5" /></button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {groupedPersonTasks.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2.5 ml-1"><div className="w-2.5 h-2.5 rounded-full bg-primary-500 shadow-md animate-pulse"></div><h4 className="text-[11px] font-black text-primary-600 uppercase tracking-[0.2em]">Active Execution Mission</h4></div>
                                        {groupedPersonTasks.map(group => (
                                            <div key={group.requestId} className="bg-white/60 dark:bg-base-955/40 rounded-[2rem] border-2 border-base-200 dark:border-base-800 overflow-hidden shadow-lg">
                                                <div className="px-6 py-4 bg-base-900 text-white border-b border-indigo-900/50 flex justify-between items-center">
                                                    <div className="flex items-center"><span className="text-[22px] font-black uppercase tracking-tighter leading-none">{group.requestId}</span><PriorityBadge category={group.category} tasks={group.items.map(i => i.task)} /></div>
                                                </div>
                                                <div className="p-3 space-y-2.5">
                                                    {group.items.map((item, idx) => {
                                                        const isDone = item.task.status === TaskStatus.Done;
                                                        const isNotOk = item.task.status === TaskStatus.NotOK;
                                                        const isActioned = isDone || isNotOk;
                                                        const hasPlannerNote = !!item.task.plannerNote;
                                                        const desc = String(getTaskValue(item.task, 'Description') || 'General Task').trim();
                                                        const variant = String(getTaskValue(item.task, 'Variant') || '').trim();
                                                        const qty = String(getTaskValue(item.task, 'Quantity') || '1').trim();
                                                        const sampleName = String(getTaskValue(item.task, 'Sample Name') || '').trim();
                                                        return (
                                                            <div key={idx} className={`p-4 rounded-[1.3rem] border-2 transition-all duration-500 flex items-center justify-between gap-4 ${isDone ? 'bg-emerald-50/40 border-emerald-100 shadow-sm' : isNotOk ? 'bg-red-50/40 border-red-100 shadow-sm' : 'bg-white dark:bg-base-900 border-base-100 dark:border-base-700 shadow-md hover:border-primary-300'}`}>
                                                                <div className="flex items-center gap-4">
                                                                    <button onClick={() => handleNoteClick('exec', item.sourceGroup, item.index)} className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg border-2 ${hasPlannerNote ? 'bg-red-600 border-red-400 text-white luxury-red-pulse' : 'bg-base-50 dark:bg-base-955 border-base-100 dark:border-base-800 text-base-300 hover:text-base-600 hover:border-indigo-300'}`} title={hasPlannerNote ? "Read Mission Instruction" : "Add Mission Briefing"}><ChatBubbleLeftEllipsisIcon className="h-5 w-5" /></button>
                                                                </div>
                                                                <div className="flex-grow min-w-0 flex flex-row items-center gap-5 ml-2">
                                                                    <div className="flex flex-col flex-grow">
                                                                        <div className={`font-black uppercase leading-tight line-clamp-2 ${isDone ? 'text-emerald-800 opacity-60' : isNotOk ? 'text-red-800 opacity-60' : 'text-base-955 dark:text-base-100'} text-[16px]`}>{desc}</div>
                                                                        {variant && variant !== 'Manual Mission' && <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase mt-0.5 tracking-wider italic">{variant}</div>}
                                                                    </div>
                                                                    <div className="flex flex-shrink-0 items-center gap-3">
                                                                        <div className={`px-2.5 py-1 rounded-xl text-[12px] font-black border flex-shrink-0 ${isDone ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : isNotOk ? 'bg-red-100 border-red-200 text-red-700' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>x{qty}</div>
                                                                        {sampleName && sampleName !== 'N/A' && <div className={`px-3 py-1 rounded-xl text-[12px] font-black border uppercase truncate max-w-[180px] flex-shrink-0 ${isDone ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700/50' : isNotOk ? 'bg-red-50/50 border-red-200 text-red-700/50' : 'bg-indigo-100/30 border-indigo-100 text-indigo-955 dark:text-indigo-200'}`}>S: {sampleName}</div>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-row items-center gap-2 flex-shrink-0 ml-5">
                                                                    {!isActioned ? (
                                                                        <div className="flex gap-2">
                                                                            <button onClick={() => handleUpdateStatus(item.sourceGroup, item.index, TaskStatus.Done)} className="px-6 py-2.5 bg-emerald-600 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[11px] hover:bg-emerald-700 hover:scale-105 transition-all active:scale-95 border-b-4 border-emerald-800">DONE</button>
                                                                            <button onClick={() => handleNotOkClick(item.sourceGroup, item.index)} className="px-6 py-2.5 bg-red-600 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[11px] hover:bg-red-700 hover:scale-105 transition-all active:scale-95 border-b-4 border-red-800">NOT OK</button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-2">
                                                                            <button onClick={() => isPlannerAuthorized && handleUpdateStatus(item.sourceGroup, item.index, TaskStatus.Pending)} disabled={!isPlannerAuthorized} className={`px-4 py-2 text-[10px] font-black uppercase rounded-xl transition-all flex items-center gap-2.5 border-2 shadow-sm ${isPlannerAuthorized ? 'bg-base-100 dark:bg-base-800 text-base-700 dark:text-base-300 border-base-200 hover:bg-white' : 'bg-base-50 text-base-300 border-base-100 cursor-not-allowed opacity-50'}`}><RefreshIcon className="h-4 w-4" /> Reset Status</button>
                                                                            {isNotOk && item.task.notOkReason && (<button onClick={() => handleViewQualityIssue(item.task.notOkReason!)} className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center luxury-red-pulse shadow-lg border border-red-400" title="Click to view Quality Issue Detail"><AlertTriangleIcon className="h-5 w-5" /></button>)}
                                                                        </div>
                                                                    )}
                                                                    <div className="flex gap-2">
                                                                        {isPlannerAuthorized && (<button onClick={() => handleCorrectionReturn(item.sourceGroup, item.index)} className="p-2.5 bg-white dark:bg-base-800 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-100 dark:border-indigo-900/50 rounded-xl shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center shadow-indigo-100 animate-fade-in" title="Planner Quick Recall"><ArrowUturnLeftIcon className="h-5 w-5" /></button>)}
                                                                        <button onClick={() => handleTesterReturn(item.sourceGroup, item.index)} className="p-2.5 bg-white dark:bg-base-800 text-orange-600 dark:text-orange-400 border-2 border-orange-100 dark:border-orange-900/50 rounded-xl shadow-sm hover:bg-orange-50 transition-all flex items-center justify-center shadow-orange-100" title="Tester Mission Abort"><AlertTriangleIcon className="h-5 w-5" /></button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleTab;
