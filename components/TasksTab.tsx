
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Tester, CategorizedTask, DailySchedule, RawTask, AssignedTask, TestMapping } from '../types';
import { TaskCategory, TaskStatus } from '../types';
import { 
    getCategorizedTasks, 
    getDailySchedule, 
    addAssignedTask, 
    deleteCategorizedTask, 
    updateCategorizedTask,
    assignItemsToPrepare,
    getTestMappings,
    addCategorizedTask as saveCategorizedTask,
} from '../services/dataService';
import { CheckCircleIcon, ChevronDownIcon, TrashIcon, AlertTriangleIcon, RefreshIcon, PlusIcon, DragHandleIcon, DownloadIcon, ArrowUturnLeftIcon, ChatBubbleLeftEllipsisIcon, SparklesIcon, XCircleIcon, BeakerIcon } from './common/Icons';

declare const XLSX: any;

// --- HEADER THEMES ---
const HEADER_THEMES = [
    { name: 'Indigo', headerBg: 'bg-indigo-700', headerText: 'text-white', borderColor: 'border-indigo-500', subHeaderBg: 'bg-indigo-50 dark:bg-indigo-900/40', subHeaderText: 'text-indigo-950 dark:text-indigo-50' },
    { name: 'Emerald', headerBg: 'bg-emerald-700', headerText: 'text-white', borderColor: 'border-emerald-500', subHeaderBg: 'bg-emerald-50 dark:bg-indigo-900/40', subHeaderText: 'text-emerald-950 dark:text-emerald-50' },
    { name: 'Amber', headerBg: 'bg-amber-600', headerText: 'text-white', borderColor: 'border-amber-400', subHeaderBg: 'bg-amber-50 dark:bg-indigo-900/40', subHeaderText: 'text-amber-950 dark:text-amber-50' },
    { name: 'Rose', headerBg: 'bg-rose-700', headerText: 'text-white', borderColor: 'border-rose-500', subHeaderBg: 'bg-rose-50 dark:bg-indigo-900/40', subHeaderText: 'text-rose-950 dark:text-rose-50' },
    { name: 'Cyan', headerBg: 'bg-cyan-700', headerText: 'text-white', borderColor: 'border-cyan-500', subHeaderBg: 'bg-cyan-50 dark:bg-indigo-900/40', subHeaderText: 'text-cyan-950 dark:text-cyan-50' },
    { name: 'Violet', headerBg: 'bg-violet-700', headerText: 'text-white', borderColor: 'border-violet-500', subHeaderBg: 'bg-violet-50 dark:bg-indigo-900/40', subHeaderText: 'text-violet-950 dark:text-violet-50' },
];

const COL_DUE_WIDTH = 60;
const COL_RID_WIDTH = 180; // ลดเหลือ 180px

// --- UTILITY FUNCTIONS ---
const getTaskValue = (task: RawTask, headerType: string): any => {
    if (!task) return '';
    const keys = Object.keys(task);
    const target = headerType.toLowerCase().trim();
    if (target === 'due date' || target === 'due') {
        const priorities = ['due date', 'due finish', 'due', 'deadline', 'requested date', 'target date', 'target'];
        for (const p of priorities) {
            const match = keys.find(k => k.toLowerCase().trim() === p);
            if (match && task[match] !== undefined && task[match] !== null && task[match] !== '') return task[match];
        }
        return '';
    }
    let matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    if (!matchedKey) {
        if (target === 'description') matchedKey = keys.find(k => ['desc', 'test name', 'testname', 'item'].includes(k.toLowerCase().trim()));
        if (target === 'variant') matchedKey = keys.find(k => ['var', 'method', 'condition'].includes(k.toLowerCase().trim()));
        if (target === 'sample name') matchedKey = keys.find(k => ['sample', 'samplename', 'sample_name'].includes(k.toLowerCase().trim()));
        if (target === 'quantity') matchedKey = keys.find(k => ['qty', 'quantity', 'amount'].includes(k.toLowerCase().trim()));
    }
    return matchedKey ? task[matchedKey] : '';
};

const getDueDateTimestamp = (tasks: RawTask[]): number => {
    let minTime = Infinity;
    for (const t of tasks) {
        const val = getTaskValue(t, 'due date');
        if (val) {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                const time = date.getTime();
                if (time < minTime) minTime = time;
            }
        }
    }
    return minTime;
};

const getSpecialStatus = (task: RawTask, category: string) => {
    const allContent = Object.values(task).map(v => String(v).toLowerCase()).join(' ');
    const lowerCategory = category.toLowerCase();
    return {
        isInProcess: lowerCategory === 'inprocess' || allContent.includes('in process'),
        isSprint: allContent.includes('sprint'),
        isUrgent: lowerCategory === 'urgent' || allContent.includes('urgent'),
        isLSP: allContent.includes('lsp'),
        isReturned: task.isReturned === true
    };
};

const getTaskGridColumnKey = (task: RawTask, mappings: TestMapping[]): string | null => {
    const taskDesc = String(getTaskValue(task, 'Description')).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const taskVar = String(getTaskValue(task, 'Variant')).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const specificMatch = mappings.find(m => m.description.toLowerCase().normalize('NFC').replace(/\s+/g, '') === taskDesc && m.variant.toLowerCase().normalize('NFC').replace(/\s+/g, '') === taskVar);
    if (specificMatch) return `${specificMatch.headerGroup}|${specificMatch.headerSub}`;
    return null;
};

// --- SUB-COMPONENTS ---
const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => { const timer = setTimeout(onDismiss, 3000); return () => clearTimeout(timer); }, [onDismiss]);
    return (
        <div className={`fixed top-24 right-8 py-3 px-6 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in z-[100] border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {isError ? <AlertTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
            <span className="font-bold text-sm">{message}</span>
        </div>
    );
};

const NoteModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: (val: string) => void; initialNote: string }> = ({ isOpen, onClose, onConfirm, initialNote }) => {
    const [val, setVal] = useState(initialNote);
    useEffect(() => { if (isOpen) setVal(initialNote); }, [isOpen, initialNote]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[110] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-800 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-lg m-4 space-y-6 animate-slide-in-up border border-white/20" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600"><ChatBubbleLeftEllipsisIcon className="h-6 w-6" /></div>
                    <h3 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">Mission Briefing</h3>
                </div>
                <textarea 
                    autoFocus 
                    value={val} 
                    onChange={e => setVal(e.target.value)} 
                    placeholder="Enter specific instructions for analysts..." 
                    rows={5}
                    className="w-full p-5 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none dark:text-white font-bold text-[15px] resize-none transition-all"
                />
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="px-6 py-3 text-[11px] font-black text-base-400 hover:text-base-800 dark:hover:text-white uppercase tracking-widest transition-colors">Cancel</button>
                    <button onClick={() => onConfirm(val)} className="px-8 py-3.5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest text-[11px]">Save Mission</button>
                </div>
            </div>
        </div>
    );
};

const ManualTaskModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (task: { jobId: string; description: string; quantity: string }) => void; isProcessing: boolean }> = ({ isOpen, onClose, onSave, isProcessing }) => {
    const [jobId, setJobId] = useState('');
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState('1');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-[2rem] shadow-2xl p-8 w-full max-w-md m-4 space-y-5 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600"><PlusIcon className="h-6 w-6" /></div>
                    <h2 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">Add Manual Template</h2>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-base-400 mb-1.5 ml-1">Manual Request ID (e.g. M-01)</label>
                        <input type="text" value={jobId} onChange={e => setJobId(e.target.value)} placeholder="M-2024-XXX" className="w-full p-4 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all"/>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-base-400 mb-1.5 ml-1">Mission Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Clean glassware..." rows={3} className="w-full p-4 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all resize-none"/>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-base-400 mb-1.5 ml-1">Default Quantity</label>
                        <input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all"/>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onClose} className="px-6 py-3 text-[11px] font-black text-base-400 hover:text-base-800 dark:hover:text-white uppercase tracking-widest transition-colors">Cancel</button>
                    <button onClick={() => onSave({ jobId, description, quantity })} disabled={isProcessing || !jobId.trim() || !description.trim()} className="px-8 py-3.5 bg-primary-600 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest text-[11px] disabled:opacity-50">{isProcessing ? 'Saving...' : 'Create Template'}</button>
                </div>
            </div>
        </div>
    );
};

const AssignmentModal: React.FC<{ isOpen: boolean; onClose: () => void; onAssign: (person: Tester) => void; personnel: { testers: Tester[]; assistants: Tester[] }; isPreparation: boolean; selectedItemCount: number; isProcessing: boolean; }> = ({ isOpen, onClose, onAssign, personnel, isPreparation, selectedItemCount, isProcessing }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className={`h-2 w-20 rounded-full mx-auto mb-2 ${isPreparation ? 'bg-amber-400' : 'bg-primary-50'}`}></div>
                <h2 className="text-xl font-black text-base-900 dark:text-base-100 text-center tracking-tight">{isPreparation ? "Assign for Preparation" : "Assign for Testing"}</h2>
                <p className="text-sm font-bold text-base-600 dark:text-base-400 text-center">Assigning <span className={`font-black ${isPreparation ? 'text-amber-600' : 'text-primary-600'}`}>{selectedItemCount} items</span></p>
                <div className="border-2 border-base-100 dark:border-base-700 rounded-xl bg-base-50 dark:bg-base-900/50 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="sticky top-0 bg-base-100 dark:bg-base-800 px-4 py-2 font-black text-[10px] uppercase tracking-[0.2em] text-base-500 border-b-2 dark:border-base-700">Staff Personnel</div>
                    <ul className="divide-y-2 divide-base-100 dark:divide-base-700">
                        {[...personnel.assistants, ...personnel.testers].map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-base-50 dark:hover:bg-base-700 transition-colors">
                                <div className="flex flex-col">
                                    <span className="font-black text-sm text-base-800 dark:text-base-100">{p.name}</span>
                                    <span className="text-[9px] uppercase font-bold text-base-400">{p.team === 'assistants_4_2' ? 'Assistant' : 'Tester'}</span>
                                </div>
                                <button onClick={() => onAssign(p)} disabled={isProcessing} className="px-5 py-2 text-xs font-black bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-600 text-base-800 dark:text-white rounded-xl hover:bg-base-50 transition-all disabled:opacity-50 uppercase tracking-widest">Assign</button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="pt-2 flex justify-center"><button onClick={onClose} className="px-6 py-2.5 text-xs font-black text-base-400 hover:text-base-800 transition-colors uppercase tracking-[0.2em]">Cancel</button></div>
            </div>
        </div>
    );
};

const ExpandableCell: React.FC<{ 
    headerKey: string; 
    items: { task: RawTask; originalIndex: number; sourceDocId: string }[]; 
    isGroupEnd?: boolean;
    expandedCell: { docId: string; headerKey: string } | null;
    setExpandedCell: (val: { docId: string; headerKey: string } | null) => void;
    selectedItems: Record<string, Set<number>>;
    handleSelectItem: (docId: string, taskIndex: number, isChecked: boolean) => void;
    setSelectedItems: React.Dispatch<React.SetStateAction<Record<string, Set<number>>>>;
    isAssigningToPrepare: boolean;
    setNoteEditor: (val: { docId: string, index: number, text: string } | null) => void;
}> = ({ 
    headerKey, items, isGroupEnd, expandedCell, setExpandedCell, 
    selectedItems, handleSelectItem, setSelectedItems, 
    isAssigningToPrepare, setNoteEditor 
}) => {
    if (!items || items.length === 0) return <td className={`p-0 align-top border border-base-300 dark:border-base-700 ${isGroupEnd ? 'border-r-2 border-r-base-400 dark:border-r-base-600' : ''}`}></td>;
    const primaryDocId = items[0].sourceDocId; 
    const isExpanded = expandedCell?.docId === primaryDocId && expandedCell?.headerKey === headerKey;
    const selectedForThisCell = items.filter(item => selectedItems[item.sourceDocId]?.has(item.originalIndex));
    const numSelected = selectedForThisCell.length;
    const hasAwaitingPrep = items.some(item => item.task.preparationStatus === 'Awaiting Preparation');
    const hasPrepared = items.some(item => item.task.preparationStatus === 'Prepared' || item.task.preparationStatus === 'Ready for Testing');
    const hasReturned = items.some(item => item.task.isReturned);
    const hasPlannerNote = items.some(item => item.task.plannerNote);
    const areAllSelected = items.length > 0 && numSelected === items.length;
    const itemCount = items.length;

    const toggleAll = (checked: boolean) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            items.forEach(item => {
                const currentSet = new Set(next[item.sourceDocId] || []);
                const isLockDisabled = !isAssigningToPrepare && item.task.preparationStatus === 'Awaiting Preparation';
                if (checked && !isLockDisabled) currentSet.add(item.originalIndex); else currentSet.delete(item.originalIndex);
                next[item.sourceDocId] = currentSet;
            });
            return next;
        });
    };

    let cellTextColor = 'text-primary-700 dark:text-primary-400';
    if (hasReturned) cellTextColor = 'text-red-600 dark:text-red-500 font-black';
    else if (hasAwaitingPrep) cellTextColor = 'text-amber-600 dark:text-amber-500';
    else if (hasPrepared) cellTextColor = 'text-emerald-600 dark:text-emerald-500';

    return (
        <td className={`p-0 align-top transition-all relative border border-base-300 dark:border-base-700 ${isGroupEnd ? 'border-r-2 border-r-base-400 dark:border-r-base-600' : ''} ${isExpanded ? 'bg-white dark:bg-base-800 ring-2 ring-primary-500 shadow-xl z-20 rounded-sm' : 'hover:bg-base-100/50 dark:hover:bg-base-700/50'}`}>
            <div className="p-1 text-center cursor-pointer h-full flex flex-col justify-center min-h-[46px] relative" onClick={() => setExpandedCell(isExpanded ? null : { docId: primaryDocId, headerKey })}>
                <span className={`font-black text-[18px] tracking-tighter leading-none ${numSelected > 0 ? 'text-primary-800 dark:text-primary-200 bg-primary-100 dark:bg-primary-900/40 rounded px-1' : cellTextColor}`}>
                    {numSelected > 0 ? numSelected : itemCount}
                </span>
                <div className="flex justify-center gap-1 mt-1">
                    {hasReturned && <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-sm animate-pulse"></div>}
                    {hasPlannerNote && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm"></div>}
                    {hasAwaitingPrep && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm"></div>}
                    {hasPrepared && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm"></div>}
                </div>
            </div>
            {isExpanded && (
                <div className="absolute top-full left-0 min-w-[420px] bg-white dark:bg-base-900 border-2 border-primary-500 dark:border-primary-400 shadow-2xl rounded-b-[2rem] overflow-hidden z-50 animate-fade-in origin-top-left">
                    <div className="p-4 bg-base-50 dark:bg-base-800 border-b-2 dark:border-base-700 flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em]">Deployment Detail</span>
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase cursor-pointer text-primary-700 dark:text-primary-300">
                            <input type="checkbox" className="h-4 w-4 rounded" checked={areAllSelected} onChange={e => toggleAll(e.target.checked)}/> Select All
                        </label>
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                        <table className="w-full">
                            <tbody className="divide-y divide-base-50 dark:divide-base-800">
                                {items.map(({ task, originalIndex, sourceDocId }) => (
                                    <tr key={`${sourceDocId}-${originalIndex}`} className="bg-white dark:bg-base-900 hover:bg-base-50/50">
                                        <td className="p-4 w-12 text-center">
                                            <input type="checkbox" className="h-5 w-5 rounded" checked={selectedItems[sourceDocId]?.has(originalIndex) || false} onChange={e => handleSelectItem(sourceDocId, originalIndex, e.target.checked)}/>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-black text-[14px] uppercase">{String(getTaskValue(task, 'Sample Name'))}</span>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setNoteEditor({ docId: sourceDocId, index: originalIndex, text: task.plannerNote || '' }); }} 
                                                        className={`p-1.5 rounded-lg transition-all ${task.plannerNote ? 'bg-indigo-600 text-white shadow-lg animate-pulse' : 'bg-base-100 text-base-400 hover:text-indigo-600'}`}
                                                        title="Edit Mission Note"
                                                    >
                                                        <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
                                                    </button>
                                                    <span className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-lg text-[10px] font-black">x{String(getTaskValue(task, 'Quantity'))}</span>
                                                </div>
                                            </div>
                                            <p className="text-[11px] font-bold text-indigo-500">{String(getTaskValue(task, 'Variant'))}</p>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </td>
    );
};

const TasksTab: React.FC<{ 
    testers: Tester[]; 
    refreshKey: number; 
    selectedDate: string;
    onDateChange: (date: string) => void;
    selectedShift: 'day' | 'night';
    onShiftChange: (shift: 'day' | 'night') => void;
}> = ({ testers, refreshKey, selectedDate, onDateChange, selectedShift, onShiftChange }) => {
    const [categorizedTasks, setCategorizedTasks] = useState<CategorizedTask[]>([]);
    const [testMappings, setTestMappings] = useState<TestMapping[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [filterRequestId, setFilterRequestId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [isAssigningToPrepare, setIsAssigningToPrepare] = useState(false); 
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
    const [selectedItems, setSelectedItems] = useState<Record<string, Set<number>>>({});
    const [expandedCell, setExpandedCell] = useState<{ docId: string; headerKey: string } | null>(null);
    const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [isSavingManual, setIsSavingManual] = useState(false);
    const [noteEditor, setNoteEditor] = useState<{ docId: string, index: number, text: string } | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [tasks, dailySchedule, mappings] = await Promise.all([
                getCategorizedTasks(),
                getDailySchedule(selectedDate),
                getTestMappings(),
            ]);
            setCategorizedTasks(tasks.sort((a,b) => (a.order ?? Infinity) - (b.order ?? Infinity)));
            setSchedule(dailySchedule);
            setTestMappings(mappings);
        } catch (error: any) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

    const handleUpdatePlannerNote = async (docId: string, itemIndex: number, note: string) => {
        try {
            const taskGroup = categorizedTasks.find(t => t.docId === docId);
            if (!taskGroup) return;
            const updatedTasks = [...taskGroup.tasks];
            updatedTasks[itemIndex] = { ...updatedTasks[itemIndex], plannerNote: note.trim() || null };
            await updateCategorizedTask(docId, { tasks: updatedTasks });
            setNotification({ message: "Mission briefed." });
            setNoteEditor(null);
            fetchData();
        } catch (e) {
            setNotification({ message: "Failed to save note.", isError: true });
        }
    };

    const gridHeaders = useMemo(() => {
        const groupMinOrders: Record<string, number> = {};
        testMappings.forEach(m => {
            if (!m.headerGroup) return;
            const currentMin = groupMinOrders[m.headerGroup] ?? Infinity;
            if ((m.order ?? Infinity) < currentMin) groupMinOrders[m.headerGroup] = m.order ?? Infinity;
        });
        const groupsContent: Record<string, { key: string; order: number }[]> = {};
        testMappings.forEach(m => {
            if (!m.headerGroup || !m.headerSub) return;
            if (!groupsContent[m.headerGroup]) groupsContent[m.headerGroup] = [];
            const compositeKey = `${m.headerGroup}|${m.headerSub}`;
            const existingSub = groupsContent[m.headerGroup].find(x => x.key === compositeKey);
            const mappingOrder = m.order ?? Infinity;
            if (!existingSub) groupsContent[m.headerGroup].push({ key: compositeKey, order: mappingOrder });
            else if (mappingOrder < existingSub.order) existingSub.order = mappingOrder;
        });
        const sortedGroupNames = Object.keys(groupsContent).sort((a, b) => (groupMinOrders[a] ?? Infinity) - (groupMinOrders[b] ?? Infinity));
        return sortedGroupNames.map(groupName => {
            const sortedSubs = groupsContent[groupName].sort((a, b) => a.order - b.order).map(x => x.key);
            return [groupName, sortedSubs] as [string, string[]];
        });
    }, [testMappings]);

    const filteredTasks = useMemo(() => {
        return categorizedTasks.filter(task => {
            const taskCat = (task.category || '').toLowerCase();
            const activeCat = activeCategory.toLowerCase();
            
            if (taskCat === 'manual') return activeCategory === 'all' || activeCat === 'manual';
            
            const categoryMatch = activeCategory === 'all' || taskCat === activeCat;
            const idMatch = filterRequestId === '' || task.id.toLowerCase().includes(filterRequestId.toLowerCase());
            return categoryMatch && idMatch; 
        });
    }, [categorizedTasks, activeCategory, filterRequestId]);

    const gridData = useMemo(() => {
        const mergedRows: Record<string, {
            requestId: string; 
            cells: Record<string, { task: RawTask; originalIndex: number; sourceDocId: string }[]>;
            unmappedItems: { task: RawTask; originalIndex: number; sourceDocId: string }[]; 
            minDueDate: number;
            isInProcess: boolean; isSprint: boolean; isUrgent: boolean; isLSP: boolean; isReturned: boolean;
            seenIds: Set<string>;
        }> = {};
        
        filteredTasks.forEach(taskGroup => {
            if (taskGroup.category.toLowerCase() === 'manual') return;
            const rid = taskGroup.id;
            if (!mergedRows[rid]) {
                mergedRows[rid] = { 
                    requestId: rid, cells: {}, unmappedItems: [], minDueDate: Infinity,
                    isInProcess: false, isSprint: false, isUrgent: false, isLSP: false, isReturned: false,
                    seenIds: new Set<string>()
                };
            }
            const row = mergedRows[rid];
            const groupDate = getDueDateTimestamp(taskGroup.tasks);
            if (groupDate < row.minDueDate) row.minDueDate = groupDate;
            
            taskGroup.tasks.forEach((task, index) => {
                const taskId = task._id || `${task['Sample Name']}-${task['Description']}-${task['Variant']}`;
                if (row.seenIds.has(taskId)) return;
                row.seenIds.add(taskId);
                
                const spec = getSpecialStatus(task, taskGroup.category);
                if (spec.isInProcess) row.isInProcess = true;
                if (spec.isSprint) row.isSprint = true;
                if (spec.isUrgent) row.isUrgent = true;
                if (spec.isLSP) row.isLSP = true;
                if (spec.isReturned) row.isReturned = true;
                
                const item = { task, originalIndex: index, sourceDocId: taskGroup.docId! };
                const columnKey = getTaskGridColumnKey(task, testMappings);
                if (columnKey) {
                    if (!row.cells[columnKey]) row.cells[columnKey] = [];
                    row.cells[columnKey].push(item);
                } else {
                    row.unmappedItems.push(item);
                }
            });
        });
        return Object.values(mergedRows).sort((a, b) => a.minDueDate - b.minDueDate);
    }, [filteredTasks, testMappings]);

    const manualTasksList = useMemo(() => {
        return filteredTasks.filter(t => t.category.toLowerCase() === 'manual');
    }, [filteredTasks]);

    const activeColumnKeys = useMemo(() => {
        if (!hideEmptyColumns) return gridHeaders.flatMap(([, subKeys]) => subKeys);
        const activeKeys = new Set<string>();
        gridData.forEach(row => Object.keys(row.cells).forEach(key => { if (row.cells[key].length > 0) activeKeys.add(key); }));
        return gridHeaders.flatMap(([, subKeys]) => subKeys).filter(k => activeKeys.has(k));
    }, [gridHeaders, gridData, hideEmptyColumns]);

    const activeGridHeaders = useMemo(() => {
        if (!hideEmptyColumns) return gridHeaders;
        return gridHeaders.map(([group, subKeys]) => {
            const activeSubs = subKeys.filter(k => activeColumnKeys.includes(k));
            return [group, activeSubs] as [string, string[]];
        }).filter(([, subKeys]) => subKeys.length > 0);
    }, [gridHeaders, activeColumnKeys, hideEmptyColumns]);

    const lastKeysOfGroups = useMemo(() => new Set(activeGridHeaders.map(([_, subKeys]) => subKeys[subKeys.length - 1])), [activeGridHeaders]);

    const onShiftPersonnel = useMemo(() => {
        const findByIds = (ids: string[]) => ids.map(id => testers.find(t => t.id === id)).filter((t): t is Tester => !!t);
        if (!schedule) return { testers: [], assistants: [] };
        const shiftTesters = selectedShift === 'day' ? schedule.dayShiftTesters : schedule.nightShiftTesters;
        const shiftAssistants = selectedShift === 'day' ? schedule.dayShiftAssistants : schedule.nightShiftAssistants;
        return { testers: findByIds(shiftTesters), assistants: findByIds(shiftAssistants) };
    }, [schedule, testers, selectedShift]);

    const handleConfirmAssignment = async (selectedPerson: Tester) => {
        if (isAssigning) return;
        const assignmentsByDocId: Record<string, number[]> = {};
        for (const docId in selectedItems) if (selectedItems[docId].size > 0) assignmentsByDocId[docId] = [...selectedItems[docId]];
        if (Object.keys(assignmentsByDocId).length === 0) return;
        setIsAssigning(true);
        try {
            for (const docId in assignmentsByDocId) {
                const originalTask = categorizedTasks.find(t => t.docId === docId);
                const selectedIndices = assignmentsByDocId[docId];
                if (!originalTask) continue;
                if (isAssigningToPrepare && originalTask.category.toLowerCase() !== 'manual') {
                    await assignItemsToPrepare(originalTask, selectedIndices, selectedPerson, selectedDate, selectedShift);
                } else if (!isAssigningToPrepare) {
                    const itemsToAssign = selectedIndices.map(index => {
                        const t = { ...originalTask.tasks[index] };
                        if (originalTask.category.toLowerCase() === 'manual') {
                             t._id = Math.random().toString(36).substring(2) + Date.now().toString(36);
                        }
                        delete t.isReturned;
                        return t;
                    });
                    await addAssignedTask({ requestId: originalTask.id, tasks: itemsToAssign, category: originalTask.category, testerId: selectedPerson.id, testerName: selectedPerson.name, assignedDate: selectedDate, shift: selectedShift, status: TaskStatus.Pending });
                    if (originalTask.category.toLowerCase() !== 'manual') {
                        const remainingItems = originalTask.tasks.filter((_, index) => !selectedIndices.includes(index));
                        if (remainingItems.length > 0) await updateCategorizedTask(docId, { tasks: remainingItems }); else await deleteCategorizedTask(docId);
                    }
                }
            }
            setNotification({ message: "Missions Assigned Successfully." });
            setSelectedItems({});
        } catch (err) { setNotification({ message: "Failed to assign.", isError: true }); } finally { setIsAssigning(false); setIsModalOpen(false); fetchData(); }
    };

    const handleSaveManualTask = async (data: { jobId: string; description: string; quantity: string }) => {
        setIsSavingManual(true);
        try {
            const manualTask: RawTask = {
                _id: Math.random().toString(36).substring(2) + Date.now().toString(36),
                'Request ID': data.jobId,
                'Description': data.description,
                'Quantity': data.quantity,
                'Sample Name': data.jobId, 
                'ManualEntry': true
            };
            await saveCategorizedTask({ id: data.jobId, category: TaskCategory.Manual, tasks: [manualTask] });
            setNotification({ message: "Manual Template Created." });
            setIsManualModalOpen(false);
            fetchData();
        } catch (err) { setNotification({ message: "Failed.", isError: true }); } finally { setIsSavingManual(false); }
    };

    const handleDeleteTask = async (docId: string) => {
        if (!confirm('Permanently remove this mission template?')) return;
        try { await deleteCategorizedTask(docId); setNotification({ message: "Template removed." }); fetchData(); } catch (e) { setNotification({ message: "Delete failed.", isError: true }); }
    };

    const handleSelectItem = useCallback((docId: string, taskIndex: number, isChecked: boolean) => {
        setSelectedItems(prev => {
            const newSelection = { ...prev };
            const currentSet = new Set(newSelection[docId] || []);
            if (isChecked) currentSet.add(taskIndex); else currentSet.delete(taskIndex);
            newSelection[docId] = currentSet;
            return newSelection;
        });
    }, []);

    const totalSelectedCount = useMemo(() => Object.values(selectedItems).reduce((acc: number, set: Set<number>) => acc + set.size, 0), [selectedItems]);

    const renderDueDateCell = (timestamp: number) => {
        if (timestamp === Infinity) return <div className="text-[11px] text-base-300 text-center italic">---</div>;
        const date = new Date(timestamp);
        return (
            <div className="flex flex-col items-center justify-center leading-none">
                <span className="text-[14px] font-black tracking-tighter">{date.getDate().toString().padStart(2, '0')}/{(date.getMonth()+1).toString().padStart(2,'0')}</span>
            </div>
        );
    };

    const categoryList = ['all', 'inprocess', 'urgent', 'normal', 'manual'];

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 animate-slide-in-up relative overflow-hidden">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            <AssignmentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAssign={handleConfirmAssignment} personnel={onShiftPersonnel} isPreparation={isAssigningToPrepare} selectedItemCount={totalSelectedCount} isProcessing={isAssigning}/>
            <ManualTaskModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onSave={handleSaveManualTask} isProcessing={isSavingManual} />
            <NoteModal isOpen={!!noteEditor} onClose={() => setNoteEditor(null)} initialNote={noteEditor?.text || ''} onConfirm={(val) => { if(noteEditor) handleUpdatePlannerNote(noteEditor.docId, noteEditor.index, val); }} />

            <div className="flex-shrink-0 space-y-3 px-4 pt-2">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-black text-base-950 dark:text-base-50 tracking-tighter">Queue Deployment</h2>
                    <div className="flex items-center gap-3">
                        {/* ปุ่มติ๊ก Hide คอลัมน์ที่หายไป */}
                        <button 
                            onClick={() => setHideEmptyColumns(!hideEmptyColumns)}
                            className={`px-5 py-2 text-[10px] font-black rounded-xl transition-all border-2 uppercase tracking-widest flex items-center gap-2 shadow-md ${hideEmptyColumns ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white dark:bg-base-800 text-base-500 border-base-200'}`}
                        >
                            {hideEmptyColumns ? <CheckCircleIcon className="h-4 w-4" /> : <div className="w-4 h-4 rounded border-2 border-base-300"></div>}
                            Hide Empty Columns
                        </button>
                        {activeCategory === 'manual' && (
                            <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase hover:bg-indigo-700 shadow-xl active:scale-95 border-b-4 border-indigo-800"><PlusIcon className="h-4 w-4" /> Add Manual Template</button>
                        )}
                    </div>
                </div>
                <div className="p-5 bg-white/80 dark:bg-base-800/80 rounded-3xl border-2 border-white dark:border-base-700 shadow-xl space-y-5 backdrop-blur-md">
                    <div className="flex flex-wrap gap-2.5">
                        {categoryList.map(c => (
                            <button key={c} onClick={() => setActiveCategory(c)} className={`px-5 py-2 text-xs font-black rounded-xl transition-all border-2 uppercase tracking-[0.1em] shadow-md ${activeCategory === c ? 'bg-primary-700 text-white border-primary-600' : 'bg-white dark:bg-base-800 text-base-800 dark:text-base-100 border-base-200 dark:border-base-700'}`}>
                                {c === 'all' ? 'Show All' : c === 'inprocess' ? 'In Process' : c.toUpperCase()} <span className="ml-2 px-2 py-0.5 rounded-lg text-[10px] bg-base-100 dark:bg-base-900 text-primary-600">{categorizedTasks.filter(t => c === 'all' ? true : (t.category || '').toLowerCase() === c).length}</span>
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t-2 border-base-100 dark:border-base-700 pt-5">
                        <input type="text" placeholder="Search Request ID..." value={filterRequestId} onChange={e => setFilterRequestId(e.target.value)} className="md:col-span-2 p-4 rounded-2xl bg-base-50 dark:bg-base-955 border-2 border-base-200 dark:border-base-700 text-[15px] font-black outline-none"/>
                        <input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="w-full p-4 rounded-2xl bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 font-black text-[15px] outline-none"/>
                        <select value={selectedShift} onChange={e => onShiftChange(e.target.value as any)} className="w-full p-4 rounded-2xl bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 font-black text-[15px] uppercase outline-none"><option value="day">Day Shift (08:00)</option><option value="night">Night Shift (20:00)</option></select>
                    </div>
                </div>
                <div className="p-4 bg-primary-800 rounded-3xl flex justify-between items-center shadow-2xl sticky top-0 z-30">
                    <div className="flex items-center gap-5 px-4"><span className="text-[11px] font-black text-white/60 uppercase tracking-[0.3em]">Selection</span><span className="text-4xl font-black text-white leading-none">{totalSelectedCount}</span></div>
                    <div className="flex gap-3">
                        {activeCategory !== 'manual' && (
                            <button onClick={() => { setIsAssigningToPrepare(true); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-8 py-3.5 text-[11px] font-black bg-amber-400 text-amber-950 rounded-2xl hover:bg-amber-300 uppercase disabled:opacity-30 transition-all border-b-4 border-amber-600">Move To Preparation</button>
                        )}
                        <button onClick={() => { setIsAssigningToPrepare(false); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-8 py-3.5 text-[11px] font-black bg-white text-primary-900 rounded-2xl hover:bg-base-100 uppercase disabled:opacity-30 transition-all border-b-4 border-base-300">Assign Missions</button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col mx-4 mb-4 bg-white dark:bg-base-900 rounded-[2.5rem] border-2 border-base-200 dark:border-base-800 shadow-2xl overflow-hidden relative">
                 {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-base-500 font-black gap-4 uppercase bg-base-50 dark:bg-base-950">
                        <RefreshIcon className="animate-spin h-14 w-14 text-primary-500"/>Syncing...
                    </div>
                 ) : (
                    <div className="flex-1 overflow-auto custom-scrollbar bg-white dark:bg-base-950">
                        {activeCategory !== 'manual' && (gridData.length > 0) && (
                            <table className="min-w-full text-xs text-left border-collapse table-fixed relative">
                                <thead className="bg-[#0f172a] text-white sticky top-0 z-[60]">
                                    <tr>
                                        <th rowSpan={2} style={{ width: `${COL_DUE_WIDTH}px` }} className="px-5 py-5 font-black uppercase border-r border-white/10 sticky left-0 z-[70] bg-[#0f172a] text-center">Due</th>
                                        <th rowSpan={2} style={{ width: `${COL_RID_WIDTH}px` }} className="px-5 py-5 font-black uppercase border-r-4 border-primary-500/50 sticky left-[60px] z-[70] bg-[#0f172a] text-center shadow-[12px_0_20px_-8px_rgba(0,0,0,0.5)]">Request ID & Status</th>
                                        {activeGridHeaders.map(([group, subKeys], i) => (
                                            <th key={group} colSpan={subKeys.length} className={`px-4 py-4 font-black text-center border-b border-r border-white/10 uppercase ${HEADER_THEMES[i % HEADER_THEMES.length].headerBg}`}>{group}</th>
                                        ))}
                                        <th rowSpan={2} className="px-6 py-5 font-black uppercase bg-slate-800 w-48 text-center border-l border-white/10">Unmapped</th>
                                    </tr>
                                    <tr>
                                        {activeGridHeaders.flatMap(([group, subKeys], i) => subKeys.map(key => <th key={key} className={`p-3 font-black text-[10px] text-center border-b border-r border-white/5 uppercase w-24 ${HEADER_THEMES[i % HEADER_THEMES.length].subHeaderBg} ${HEADER_THEMES[i % HEADER_THEMES.length].subHeaderText}`}>{key.split('|')[1]}</th>))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y-2 divide-base-100 dark:divide-base-800">
                                    {gridData.map(row => (
                                        <tr key={row.requestId} className="hover:bg-primary-50/30 group">
                                            <td className="p-1 border-r border-base-200 dark:border-base-800 bg-white dark:bg-base-950 sticky left-0 z-40 text-center">{renderDueDateCell(row.minDueDate)}</td>
                                            <td className="px-4 py-4 font-black text-base-950 dark:text-base-50 border-r-4 border-primary-500/30 bg-white dark:bg-[#111827] sticky left-[60px] z-40 shadow-[12px_0px_25px_-10px_rgba(0,0,0,0.2)] min-w-[180px]">
                                                <div className="flex flex-col gap-2 min-w-0">
                                                    <span className="tracking-tighter text-[15px] truncate leading-none uppercase">{row.requestId.replace(/^RS1-/, '')}</span>
                                                    <div className="flex flex-nowrap gap-1.5 mt-1 overflow-x-auto no-scrollbar">
                                                        {row.isInProcess && <span className="px-2 py-0.5 bg-fuchsia-700 text-white text-[7px] rounded-md uppercase font-black shadow-sm animate-pulse leading-none ring-1 ring-fuchsia-400 shrink-0">In Process</span>}
                                                        {row.isLSP && <span className="px-2 py-0.5 bg-cyan-600 text-white text-[7px] rounded-md uppercase font-black shadow-sm ring-1 ring-cyan-400/50 leading-none shrink-0">LSP</span>}
                                                        {row.isSprint && <span className="px-2 py-0.5 bg-rose-500 text-white text-[7px] rounded-md uppercase font-black shadow-sm ring-1 ring-rose-400/50 leading-none shrink-0">Sprint</span>}
                                                        {row.isUrgent && <span className="px-2 py-0.5 bg-red-600 text-white text-[7px] rounded-md uppercase font-black shadow-sm ring-1 ring-red-400/50 leading-none shrink-0">Urgent</span>}
                                                        {row.isReturned && <span className="px-2 py-0.5 bg-amber-600 text-white text-[7px] rounded-md uppercase font-black shadow-sm leading-none shrink-0">Returned</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            {activeColumnKeys.map(header => <ExpandableCell key={header} headerKey={header} items={row.cells[header] || []} isGroupEnd={lastKeysOfGroups.has(header)} expandedCell={expandedCell} setExpandedCell={setExpandedCell} selectedItems={selectedItems} handleSelectItem={handleSelectItem} setSelectedItems={setSelectedItems} isAssigningToPrepare={isAssigningToPrepare} setNoteEditor={setNoteEditor} />)}
                                            <ExpandableCell headerKey="unmapped" items={row.unmappedItems} expandedCell={expandedCell} setExpandedCell={setExpandedCell} selectedItems={selectedItems} handleSelectItem={handleSelectItem} setSelectedItems={setSelectedItems} isAssigningToPrepare={isAssigningToPrepare} setNoteEditor={setNoteEditor} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {(activeCategory === 'all' || activeCategory === 'manual') && manualTasksList.length > 0 && (
                            <div className="space-y-4 p-8">
                                <div className="flex items-center gap-3 ml-2">
                                    <div className="p-2 bg-purple-100 text-purple-600 rounded-xl"><PlusIcon className="h-5 w-5" /></div>
                                    <h3 className="text-xl font-black text-base-950 dark:text-base-50 tracking-tight uppercase">Manual Mission Queue (Templates)</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {manualTasksList.map((group) => (
                                        <div key={group.docId} className="bg-white dark:bg-base-800 border-2 border-purple-100 dark:border-purple-900/30 rounded-[2rem] shadow-lg hover:border-purple-400 transition-all">
                                            <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                                <div className="flex items-center gap-5 flex-grow">
                                                    <div className="h-14 w-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center font-black text-sm shrink-0">M</div>
                                                    <div className="min-w-0 flex-grow">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{group.id}</span>
                                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[9px] font-black rounded-lg uppercase">Template</span>
                                                        </div>
                                                        <div className="mt-1 space-y-1">
                                                            {group.tasks.map((t, ti) => (
                                                                <div key={ti} className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                                    <p className="text-[14px] font-bold text-slate-600 dark:text-slate-400">{String(getTaskValue(t, 'Description'))}</p>
                                                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-black rounded-lg">QTY: {String(getTaskValue(t, 'Quantity'))}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <div className="flex items-center gap-2">
                                                        {group.tasks.map((_, ti) => (
                                                            <input 
                                                                key={ti} 
                                                                type="checkbox" 
                                                                disabled={isAssigningToPrepare}
                                                                className={`h-6 w-6 rounded-xl text-primary-600 focus:ring-0 ${isAssigningToPrepare ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'}`} 
                                                                checked={selectedItems[group.docId!]?.has(ti) || false} 
                                                                onChange={e => handleSelectItem(group.docId!, ti, e.target.checked)}
                                                            />
                                                        ))}
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{isAssigningToPrepare ? 'Prep N/A' : 'Assign'}</span>
                                                    </div>
                                                    <button onClick={() => handleDeleteTask(group.docId!)} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"><TrashIcon className="h-6 w-6" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {gridData.length === 0 && manualTasksList.length === 0 && !isLoading && (
                            <div className="flex flex-col items-center justify-center py-32 opacity-20 text-slate-300 flex-1"><BeakerIcon className="h-24 w-24 mb-4" /><span className="text-xl font-black uppercase tracking-[0.5em]">No Missions in Queue</span></div>
                        )}
                    </div>
                 )}
            </div>
            <div className="px-4 py-2 bg-base-50 dark:bg-base-950 border-t border-base-200 dark:border-base-800 text-[9px] font-bold text-base-400 text-center uppercase tracking-widest">
                {'Hierarchy: In Process > LSP > Sprint > Urgent > Normal'}
            </div>
        </div>
    );
};
export default TasksTab;
