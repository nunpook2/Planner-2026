
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

// --- CONSTANTS ---
const COL_DUE_WIDTH = 60;
const COL_RID_WIDTH = 190;
const HEADER_THEMES = [
    { name: 'Indigo', headerBg: 'bg-indigo-700', headerText: 'text-white', borderColor: 'border-indigo-500', subHeaderBg: 'bg-indigo-50 dark:bg-indigo-900/40', subHeaderText: 'text-indigo-950 dark:text-indigo-50' },
    { name: 'Emerald', headerBg: 'bg-emerald-700', headerText: 'text-white', borderColor: 'border-emerald-500', subHeaderBg: 'bg-emerald-50 dark:bg-indigo-900/40', subHeaderText: 'text-emerald-950 dark:text-emerald-50' },
    { name: 'Amber', headerBg: 'bg-amber-600', headerText: 'text-white', borderColor: 'border-amber-400', subHeaderBg: 'bg-amber-50 dark:bg-indigo-900/40', subHeaderText: 'text-amber-950 dark:text-amber-50' },
    { name: 'Rose', headerBg: 'bg-rose-700', headerText: 'text-white', borderColor: 'border-rose-500', subHeaderBg: 'bg-rose-50 dark:bg-indigo-900/40', subHeaderText: 'text-rose-950 dark:text-rose-50' },
    { name: 'Cyan', headerBg: 'bg-cyan-700', headerText: 'text-white', borderColor: 'border-cyan-500', subHeaderBg: 'bg-cyan-50 dark:bg-indigo-900/40', subHeaderText: 'text-cyan-950 dark:text-cyan-50' },
    { name: 'Violet', headerBg: 'bg-violet-700', headerText: 'text-white', borderColor: 'border-violet-500', subHeaderBg: 'bg-violet-50 dark:bg-indigo-900/40', subHeaderText: 'text-violet-950 dark:text-violet-50' },
];

// --- UTILITIES ---
const excelDateToJSDate = (serial: any): Date | null => {
    if (!serial) return null;
    if (typeof serial === 'number') {
        const date = new Date((serial - 25569) * 86400 * 1000);
        return isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(serial);
    return isNaN(date.getTime()) ? null : date;
};

const getTaskValue = (task: RawTask, headerType: string): any => {
    if (!task) return '';
    const keys = Object.keys(task);
    const target = headerType.toLowerCase().trim();
    
    if (target === 'due date' || target === 'due') {
        const priorities = ['due date', 'due finish', 'due', 'deadline', 'requested date', 'target date'];
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
        const date = excelDateToJSDate(val);
        if (date) {
            const time = date.getTime();
            if (time < minTime) minTime = time;
        }
    }
    return minTime;
};

const getSpecialStatus = (task: RawTask, category: string) => {
    const allContent = Object.values(task).map(v => String(v).toLowerCase()).join(' ');
    const lowerCategory = category.toLowerCase();
    return {
        isPoCat: lowerCategory === 'pocat' || allContent.includes('po cat'),
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
            <div className="bg-white dark:bg-base-800 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-lg m-4 space-y-6 animate-slide-in-up border border-white/20 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600"><ChatBubbleLeftEllipsisIcon className="h-6 w-6" /></div>
                    <h3 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">Mission Briefing</h3>
                </div>
                <textarea autoFocus value={val} onChange={e => setVal(e.target.value)} placeholder="Instructions..." rows={5} className="w-full p-5 bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none dark:text-white font-bold text-[15px] resize-none transition-all"/>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="px-6 py-3 text-[11px] font-black text-base-400 hover:text-base-800 dark:hover:text-white uppercase tracking-widest transition-colors">Cancel</button>
                    <button onClick={() => onConfirm(val)} className="px-8 py-3.5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:brightness-110 transition-all uppercase tracking-widest text-[11px]">Save</button>
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
                <div className="flex items-center gap-4 mb-2"><div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600"><PlusIcon className="h-6 w-6" /></div><h2 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">Add Manual Template</h2></div>
                <div className="space-y-4">
                    <input type="text" value={jobId} onChange={e => setJobId(e.target.value)} placeholder="Request ID (e.g. M-01)" className="w-full p-4 bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-2xl outline-none dark:text-white font-bold text-sm"/>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description..." rows={3} className="w-full p-4 bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-2xl outline-none dark:text-white font-bold text-sm resize-none"/>
                    <input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Quantity" className="w-full p-4 bg-base-50 dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-2xl outline-none dark:text-white font-bold text-sm"/>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onClose} className="px-6 py-3 text-[11px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest transition-colors">Cancel</button>
                    <button onClick={() => onSave({ jobId, description, quantity })} disabled={isProcessing || !jobId.trim() || !description.trim()} className="px-8 py-3.5 bg-primary-600 text-white font-black rounded-2xl shadow-xl hover:brightness-110 transition-all uppercase tracking-widest text-[11px] disabled:opacity-50">Create Template</button>
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
                    <ul className="divide-y-2 divide-base-100 dark:divide-base-700">
                        {[...personnel.assistants, ...personnel.testers].map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-base-50 dark:hover:bg-base-700 transition-colors">
                                <div className="flex flex-col"><span className="font-black text-sm text-base-800 dark:text-base-100">{p.name}</span><span className="text-[9px] uppercase font-bold text-base-400">{p.team === 'assistants_4_2' ? 'Assistant' : 'Tester'}</span></div>
                                <button onClick={() => onAssign(p)} disabled={isProcessing} className="px-5 py-2 text-xs font-black bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-600 text-base-800 dark:text-white rounded-xl hover:bg-base-50 transition-all uppercase tracking-widest">Assign</button>
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
    
    const anchorDocId = items[0].sourceDocId;
    const isExpanded = expandedCell?.headerKey === headerKey && expandedCell?.docId === anchorDocId;
    
    const selectedForThisCell = items.filter(item => selectedItems[item.sourceDocId]?.has(item.originalIndex));
    const numSelected = selectedForThisCell.length;
    const itemCount = items.length;

    const hasAwaitingPrep = items.some(item => item.task.preparationStatus === 'Awaiting Preparation');
    const hasPrepared = items.some(item => item.task.preparationStatus === 'Prepared' || item.task.preparationStatus === 'Ready for Testing');
    const hasReturned = items.some(item => item.task.isReturned);
    const hasPlannerNote = items.some(item => item.task.plannerNote);
    const areAllSelected = items.length > 0 && numSelected === items.length;

    const toggleAll = (checked: boolean) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            items.forEach(item => {
                const currentSet = new Set(next[item.sourceDocId] || []);
                // If not assigning to prep, we block items that are currently in prep from being selected
                const isLockDisabled = !isAssigningToPrepare && item.task.preparationStatus === 'Awaiting Preparation';
                if (checked && !isLockDisabled) currentSet.add(item.originalIndex); 
                else currentSet.delete(item.originalIndex);
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
        <td className={`p-0 align-top transition-all relative border border-base-300 dark:border-base-700 ${isGroupEnd ? 'border-r-2 border-r-base-400 dark:border-r-base-600' : ''} ${isExpanded ? 'bg-white dark:bg-base-800 ring-2 ring-primary-500 shadow-2xl z-[80] rounded-sm' : 'hover:bg-base-100/50 dark:hover:bg-base-700/50'}`}>
            <div className="p-1 text-center cursor-pointer h-full flex flex-col justify-center min-h-[46px] relative" onClick={() => setExpandedCell(isExpanded ? null : { docId: anchorDocId, headerKey })}>
                <div className="flex flex-col items-center">
                    <span className={`font-black text-[18px] tracking-tighter leading-none ${numSelected > 0 ? 'text-white bg-primary-600 rounded-md px-1.5 py-0.5 shadow-sm' : cellTextColor}`}>
                        {numSelected > 0 ? `${numSelected}/${itemCount}` : itemCount}
                    </span>
                    <div className="flex justify-center gap-1 mt-1">
                        {hasReturned && <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-sm animate-pulse"></div>}
                        {hasPlannerNote && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm"></div>}
                        {hasAwaitingPrep && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm"></div>}
                        {hasPrepared && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm"></div>}
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="absolute top-full left-0 min-w-[440px] bg-white dark:bg-base-900 border-2 border-primary-500 dark:border-primary-400 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] rounded-b-[2.5rem] overflow-hidden z-[90] animate-fade-in origin-top-left">
                    <div className="p-4 bg-base-50 dark:bg-base-800 border-b-2 dark:border-base-700 flex justify-between items-center shrink-0">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-base-400 leading-none mb-1">Deployment Detail</span>
                            <span className="text-[11px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest">{headerKey.split('|')[1] || headerKey}</span>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase cursor-pointer text-primary-700 dark:text-primary-300 bg-white dark:bg-base-900 px-3 py-1.5 rounded-xl border border-primary-100 dark:border-primary-800 shadow-sm">
                            <input type="checkbox" className="h-4 w-4 rounded" checked={areAllSelected} onChange={e => toggleAll(e.target.checked)}/> Select All
                        </label>
                    </div>
                    <div className="max-h-96 overflow-y-auto overscroll-contain custom-scrollbar bg-white dark:bg-base-900">
                        <table className="w-full border-collapse">
                            <tbody className="divide-y divide-base-50 dark:divide-base-800">
                                {items.map(({ task, originalIndex, sourceDocId }) => {
                                    const isLocked = !isAssigningToPrepare && task.preparationStatus === 'Awaiting Preparation';
                                    const isReady = task.preparationStatus === 'Prepared' || task.preparationStatus === 'Ready for Testing';
                                    const isPrepAwaiting = task.preparationStatus === 'Awaiting Preparation';

                                    return (
                                        <tr key={`${sourceDocId}-${originalIndex}`} className={`bg-white dark:bg-base-900 hover:bg-primary-50/20 transition-colors ${isLocked ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                                            <td className="p-4 w-12 text-center" onClick={e => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox" 
                                                    disabled={isLocked}
                                                    className={`h-5 w-5 rounded cursor-pointer border-2 border-base-300 dark:border-base-600 text-primary-600 focus:ring-primary-500 ${isLocked ? 'cursor-not-allowed bg-base-100' : ''}`} 
                                                    checked={selectedItems[sourceDocId]?.has(originalIndex) || false} 
                                                    onChange={e => handleSelectItem(sourceDocId, originalIndex, e.target.checked)}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <div className="flex justify-between items-start mb-1 gap-4">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-[15px] uppercase truncate tracking-tight text-base-900 dark:text-white leading-tight">{String(getTaskValue(task, 'Sample Name'))}</span>
                                                            {isPrepAwaiting && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black rounded-lg uppercase tracking-widest border border-amber-200">Awaiting Prep</span>}
                                                            {isReady && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black rounded-lg uppercase tracking-widest border border-emerald-200">Ready</span>}
                                                        </div>
                                                        {task.isReturned && (
                                                            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl mt-1.5">
                                                                <div className="flex items-center gap-1.5"><AlertTriangleIcon className="h-3 w-3 text-red-500" /><span className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest italic">Aborted By {task.returnedBy || 'Staff'}</span></div>
                                                                <span className="text-[11px] font-bold text-red-800 dark:text-red-200 leading-tight block mt-1">Reason: {task.returnReason || 'N/A'}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                                        <button onClick={(e) => { e.stopPropagation(); setNoteEditor({ docId: sourceDocId, index: originalIndex, text: task.plannerNote || '' }); }} className={`p-2 rounded-xl transition-all border-2 ${task.plannerNote ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg animate-pulse' : 'bg-base-50 dark:bg-base-955 border-base-100 dark:border-base-800 text-base-300 hover:text-base-600 hover:border-indigo-300'}`} title="Edit Note"><ChatBubbleLeftEllipsisIcon className="h-4 w-4" /></button>
                                                        <div className="px-2.5 py-1 bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-xl text-[11px] font-black border border-primary-100 dark:border-primary-800">x{String(getTaskValue(task, 'Quantity'))}</div>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] font-bold text-indigo-500/80 dark:text-indigo-400/80 truncate">{String(getTaskValue(task, 'Variant'))}</p>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </td>
    );
};

const TasksTab: React.FC<{ testers: Tester[]; refreshKey: number; selectedDate: string; onDateChange: (date: string) => void; selectedShift: 'day' | 'night'; onShiftChange: (shift: 'day' | 'night') => void; }> = ({ testers, refreshKey, selectedDate, onDateChange, selectedShift, onShiftChange }) => {
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
            const [tasks, dailySchedule, mappings] = await Promise.all([getCategorizedTasks(), getDailySchedule(selectedDate), getTestMappings()]);
            setCategorizedTasks(tasks.sort((a,b) => (a.order ?? Infinity) - (b.order ?? Infinity)));
            setSchedule(dailySchedule);
            setTestMappings(mappings);
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
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
        } catch (e) { setNotification({ message: "Error", isError: true }); }
    };

    const gridHeaders = useMemo(() => {
        const groupMinOrders: Record<string, number> = {};
        testMappings.forEach(m => { if (!m.headerGroup) return; const c = groupMinOrders[m.headerGroup] ?? Infinity; if ((m.order ?? Infinity) < c) groupMinOrders[m.headerGroup] = m.order ?? Infinity; });
        const groupsContent: Record<string, { key: string; order: number }[]> = {};
        testMappings.forEach(m => {
            if (!m.headerGroup || !m.headerSub) return;
            if (!groupsContent[m.headerGroup]) groupsContent[m.headerGroup] = [];
            const key = `${m.headerGroup}|${m.headerSub}`;
            const ex = groupsContent[m.headerGroup].find(x => x.key === key);
            const mOrd = m.order ?? Infinity;
            if (!ex) groupsContent[m.headerGroup].push({ key, order: mOrd });
            else if (mOrd < ex.order) ex.order = mOrd;
        });
        const sortedGroups = Object.keys(groupsContent).sort((a, b) => (groupMinOrders[a] ?? Infinity) - (groupMinOrders[b] ?? Infinity));
        return sortedGroups.map(gn => [gn, groupsContent[gn].sort((a, b) => a.order - b.order).map(x => x.key)] as [string, string[]]);
    }, [testMappings]);

    const groupedByNormalizedId = useMemo<Record<string, { displayId: string, docs: CategorizedTask[] }>>(() => {
        const groups: Record<string, { displayId: string, docs: CategorizedTask[] }> = {};
        categorizedTasks.forEach(doc => {
            const rawId = String(doc.id || '').trim();
            if (!rawId) return;
            const normalizedKey = rawId.toLowerCase().replace(/^rs1-/, '');
            if (!groups[normalizedKey]) {
                groups[normalizedKey] = { displayId: rawId, docs: [] };
            }
            groups[normalizedKey].docs.push(doc);
        });
        return groups;
    }, [categorizedTasks]);

    const gridData = useMemo(() => {
        const rows: any[] = [];
        const activeCat = activeCategory.toLowerCase();
        const search = filterRequestId.toLowerCase().trim();

        Object.values(groupedByNormalizedId).forEach(({ displayId: rid, docs: taskDocs }) => {
            if (taskDocs.length === 0) return;
            const isManual = taskDocs.some(g => (g.category || '').toLowerCase() === 'manual');
            if (isManual) return; 

            const matchesSearch = !search || rid.toLowerCase().includes(search);
            const matchesCategory = activeCat === 'all' || taskDocs.some(g => (g.category || '').toLowerCase() === activeCat);

            if (matchesSearch && matchesCategory) {
                const row = {
                    requestId: rid,
                    cells: {} as Record<string, { task: RawTask; originalIndex: number; sourceDocId: string }[]>,
                    unmappedItems: [] as { task: RawTask; originalIndex: number; sourceDocId: string }[],
                    minDueDate: Infinity,
                    totalItemCount: 0,
                    isPoCat: false, isSprint: false, isUrgent: false, isLSP: false, isReturned: false,
                    seenKeys: new Set<string>()
                };

                taskDocs.forEach(doc => {
                    const groupDate = getDueDateTimestamp(doc.tasks);
                    if (groupDate < row.minDueDate) row.minDueDate = groupDate;

                    doc.tasks.forEach((task, index) => {
                        const itemKey = task._id || `${doc.docId}-${index}`;
                        if (row.seenKeys.has(itemKey)) return;
                        row.seenKeys.add(itemKey);
                        row.totalItemCount++;

                        const spec = getSpecialStatus(task, doc.category);
                        if (spec.isPoCat) row.isPoCat = true;
                        if (spec.isSprint) row.isSprint = true;
                        if (spec.isUrgent) row.isUrgent = true;
                        if (spec.isLSP) row.isLSP = true;
                        if (spec.isReturned) row.isReturned = true;

                        const item = { task, originalIndex: index, sourceDocId: doc.docId! };
                        const colKey = getTaskGridColumnKey(task, testMappings);
                        if (colKey) {
                            if (!row.cells[colKey]) row.cells[colKey] = [];
                            row.cells[colKey].push(item);
                        } else {
                            row.unmappedItems.push(item);
                        }
                    });
                });
                rows.push(row);
            }
        });
        return rows.sort((a, b) => a.minDueDate - b.minDueDate);
    }, [groupedByNormalizedId, activeCategory, filterRequestId, testMappings]);

    const manualTasksList = useMemo(() => {
        const activeCat = activeCategory.toLowerCase();
        if (activeCat !== 'all' && activeCat !== 'manual') return [];
        return categorizedTasks.filter(t => (t.category || '').toLowerCase() === 'manual');
    }, [categorizedTasks, activeCategory]);

    const activeColumnKeys = useMemo(() => {
        if (!hideEmptyColumns) return gridHeaders.flatMap(([, subKeys]) => subKeys);
        const activeKeys = new Set<string>();
        gridData.forEach(row => Object.keys(row.cells).forEach(k => { if (row.cells[k].length > 0) activeKeys.add(k); }));
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
        const findByIds = (ids: string[]) => (ids || []).map(id => testers.find(t => t.id === id)).filter((t): t is Tester => !!t);
        if (!schedule) return { testers: [], assistants: [] };
        const shiftTesters = selectedShift === 'day' ? schedule.dayShiftTesters : schedule.nightShiftTesters;
        const shiftAssistants = selectedShift === 'day' ? schedule.dayShiftAssistants : schedule.nightShiftAssistants;
        return { testers: findByIds(shiftTesters), assistants: findByIds(shiftAssistants) };
    }, [schedule, testers, selectedShift]);

    const handleConfirmAssignment = async (selectedPerson: Tester) => {
        if (isAssigning) return;
        const assignmentsByDocId: Record<string, number[]> = {};
        for (const docId in selectedItems) if (selectedItems[docId].size > 0) assignmentsByDocId[docId] = Array.from(selectedItems[docId]);
        if (Object.keys(assignmentsByDocId).length === 0) return;
        setIsAssigning(true);
        try {
            for (const docId in assignmentsByDocId) {
                const originalTaskGroup = categorizedTasks.find(t => t.docId === docId);
                const selectedIndices = assignmentsByDocId[docId];
                if (!originalTaskGroup) continue;
                
                if (isAssigningToPrepare && originalTaskGroup.category.toLowerCase() !== 'manual') {
                    await assignItemsToPrepare(originalTaskGroup, selectedIndices, selectedPerson, selectedDate, selectedShift);
                } else if (!isAssigningToPrepare) {
                    const itemsToAssign = selectedIndices.map(index => {
                        const t = { ...originalTaskGroup.tasks[index] };
                        if (originalTaskGroup.category.toLowerCase() === 'manual') t._id = Math.random().toString(36).substring(2) + Date.now().toString(36);
                        delete t.isReturned; delete t.returnReason; delete t.returnedBy; delete t.status; delete t.notOkReason; delete t.preparationStatus;
                        return t;
                    });
                    await addAssignedTask({ requestId: originalTaskGroup.id, tasks: itemsToAssign, category: originalTaskGroup.category, testerId: selectedPerson.id, testerName: selectedPerson.name, assignedDate: selectedDate, shift: selectedShift, status: TaskStatus.Pending });
                    const remainingItems = originalTaskGroup.tasks.filter((_, index) => !selectedIndices.includes(index));
                    if (remainingItems.length > 0) await updateCategorizedTask(docId, { tasks: remainingItems });
                    else await deleteCategorizedTask(docId);
                }
            }
            setNotification({ message: "Assigned Successfully." });
            setSelectedItems({});
            setExpandedCell(null);
            fetchData();
        } catch (err) { setNotification({ message: "Failed", isError: true }); } finally { setIsAssigning(false); setIsModalOpen(false); }
    };

    const handleSaveManualTask = async (data: { jobId: string; description: string; quantity: string }) => {
        setIsSavingManual(true);
        try {
            const manualTask: RawTask = { _id: Math.random().toString(36).substring(2) + Date.now().toString(36), 'Request ID': data.jobId, 'Description': data.description, 'Quantity': data.quantity, 'Sample Name': data.jobId, 'ManualEntry': true };
            await saveCategorizedTask({ id: data.jobId, category: TaskCategory.Manual, tasks: [manualTask] });
            setNotification({ message: "Template Created." });
            setIsManualModalOpen(false);
            fetchData();
        } catch (err) { setNotification({ message: "Failed", isError: true }); } finally { setIsSavingManual(false); }
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

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 animate-slide-in-up relative overflow-hidden">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            <AssignmentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAssign={handleConfirmAssignment} personnel={onShiftPersonnel} isPreparation={isAssigningToPrepare} selectedItemCount={totalSelectedCount} isProcessing={isAssigning}/>
            <ManualTaskModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onSave={handleSaveManualTask} isProcessing={isSavingManual} />
            <NoteModal isOpen={!!noteEditor} onClose={() => setNoteEditor(null)} initialNote={noteEditor?.text || ''} onConfirm={(val) => { if(noteEditor) handleUpdatePlannerNote(noteEditor.docId, noteEditor.index, val); }} />

            <div className="flex-shrink-0 space-y-3 px-4 pt-2">
                <div className="flex justify-between items-center"><h2 className="text-3xl font-black text-base-950 dark:text-base-50 tracking-tighter">Queue Deployment</h2><button onClick={() => setHideEmptyColumns(!hideEmptyColumns)} className={`px-5 py-2 text-[10px] font-black rounded-xl transition-all border-2 uppercase tracking-widest flex items-center gap-2 shadow-md ${hideEmptyColumns ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white dark:bg-base-800 text-base-500 border-base-200'}`}>{hideEmptyColumns ? <CheckCircleIcon className="h-4 w-4" /> : <div className="w-4 h-4 rounded border-2 border-base-300"></div>}Hide Empty Columns</button></div>
                <div className="p-5 bg-white/80 dark:bg-base-800/80 rounded-3xl border-2 border-white dark:border-base-700 shadow-xl space-y-5 backdrop-blur-md">
                    <div className="flex flex-wrap gap-2.5">
                        {['all', 'pocat', 'urgent', 'normal', 'manual'].map(c => (
                            <button key={c} onClick={() => setActiveCategory(c)} className={`px-5 py-2 text-xs font-black rounded-xl transition-all border-2 uppercase tracking-[0.1em] shadow-md ${activeCategory === c ? 'bg-primary-700 text-white border-primary-600' : 'bg-white dark:bg-base-800 text-base-800 dark:text-base-100 border-base-200 dark:border-base-700'}`}>
                                {c === 'all' ? 'Show All' : c === 'pocat' ? 'Po cat' : c.toUpperCase()} <span className="ml-2 px-2 py-0.5 rounded-lg text-[10px] bg-base-100 dark:bg-base-900 text-primary-600">{categorizedTasks.filter(t => c === 'all' ? true : (t.category || '').toLowerCase() === c).length}</span>
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
                        <button onClick={() => setSelectedItems({})} className="px-6 py-3.5 text-[11px] font-black text-white/60 hover:text-white uppercase tracking-widest transition-colors">Clear All</button>
                        {activeCategory !== 'manual' && <button onClick={() => { setIsAssigningToPrepare(true); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-8 py-3.5 text-[11px] font-black bg-amber-400 text-amber-950 rounded-2xl hover:bg-amber-300 uppercase disabled:opacity-30 transition-all border-b-4 border-amber-600">Move To Preparation</button>}
                        <button onClick={() => { setIsAssigningToPrepare(false); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-8 py-3.5 text-[11px] font-black bg-white text-primary-900 rounded-2xl hover:bg-base-100 uppercase disabled:opacity-30 transition-all border-b-4 border-base-300">Assign Missions</button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col mx-4 mb-4 bg-white dark:bg-base-900 rounded-[2.5rem] border-2 border-base-200 dark:border-base-800 shadow-2xl overflow-hidden relative">
                 {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-base-500 font-black gap-4 uppercase bg-base-50 dark:bg-base-955"><RefreshIcon className="animate-spin h-14 w-14 text-primary-500"/>Syncing...</div>
                 ) : (
                    <div className="flex-1 overflow-auto custom-scrollbar bg-white dark:bg-base-955">
                        {gridData.length > 0 && (
                            <table className="min-w-full text-xs text-left border-collapse table-fixed relative">
                                <thead className="bg-[#0f172a] text-white sticky top-0 z-[60]">
                                    <tr>
                                        <th rowSpan={2} style={{ width: `${COL_DUE_WIDTH}px` }} className="px-5 py-5 font-black uppercase border-r border-white/10 sticky left-0 z-[70] bg-[#0f172a] text-center text-[10px]">Due</th>
                                        <th rowSpan={2} style={{ width: `${COL_RID_WIDTH}px` }} className="px-5 py-5 font-black uppercase border-r-4 border-primary-500/50 sticky left-[60px] z-[70] bg-[#0f172a] text-center shadow-[12px_0_20px_-8px_rgba(0,0,0,0.5)]">ID & ITEMS</th>
                                        {activeGridHeaders.map(([group, subKeys], i) => <th key={group} colSpan={subKeys.length} className={`px-4 py-4 font-black text-center border-b border-r border-white/10 uppercase ${HEADER_THEMES[i % HEADER_THEMES.length].headerBg}`}>{group}</th>)}
                                        <th rowSpan={2} className="px-6 py-5 font-black uppercase bg-slate-800 w-48 text-center border-l border-white/10">Unmapped</th>
                                    </tr>
                                    <tr>{activeGridHeaders.flatMap(([group, subKeys], i) => subKeys.map(key => <th key={key} className={`p-3 font-black text-[10px] text-center border-b border-r border-white/5 uppercase w-24 ${HEADER_THEMES[i % HEADER_THEMES.length].subHeaderBg} ${HEADER_THEMES[i % HEADER_THEMES.length].subHeaderText}`}>{key.split('|')[1]}</th>))}</tr>
                                </thead>
                                <tbody className="divide-y-2 divide-base-100 dark:divide-base-800">
                                    {gridData.map(row => (
                                        <tr key={row.requestId} className="hover:bg-primary-50/30 group">
                                            <td className="p-1 border-r border-base-200 dark:border-base-800 bg-white dark:bg-[#1e293b]/20 sticky left-0 z-40 text-center">{row.minDueDate === Infinity ? '---' : <span className="font-black text-slate-900 dark:text-white">{(new Date(row.minDueDate)).getDate()}/{(new Date(row.minDueDate)).getMonth()+1}</span>}</td>
                                            <td className="px-4 py-4 border-r-4 border-primary-500/30 bg-white dark:bg-[#111827] sticky left-[60px] z-40 shadow-[12px_0px_25px_-10px_rgba(0,0,0,0.2)]">
                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <div className="flex items-center justify-between"><span className="tracking-tighter text-[15px] font-black truncate leading-none uppercase text-base-950 dark:text-base-50">{row.requestId.replace(/^RS1-/, '')}</span><span className="px-2 py-0.5 bg-base-100 dark:bg-base-800 text-[10px] font-black rounded-lg text-base-400">#{row.totalItemCount}</span></div>
                                                    <div className="flex flex-nowrap gap-1 mt-1 overflow-x-auto no-scrollbar">
                                                        {row.isPoCat && <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[7px] rounded-md uppercase font-black shrink-0">PC</span>}
                                                        {row.isLSP && <span className="px-1.5 py-0.5 bg-cyan-600 text-white text-[7px] rounded-md uppercase font-black shrink-0">LSP</span>}
                                                        {row.isSprint && <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[7px] rounded-md uppercase font-black shrink-0">SPR</span>}
                                                        {row.isUrgent && <span className="px-1.5 py-0.5 bg-red-600 text-white text-[7px] rounded-md uppercase font-black shrink-0">URG</span>}
                                                        {row.isReturned && <span className="px-1.5 py-0.5 bg-amber-600 text-white text-[7px] rounded-md uppercase font-black shrink-0">RET</span>}
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
                        {manualTasksList.length > 0 && (
                            <div className="space-y-4 p-8">
                                <div className="flex items-center gap-3 ml-2"><PlusIcon className="h-5 w-5 text-purple-600" /><h3 className="text-xl font-black uppercase">Manual Mission Queue</h3></div>
                                <div className="grid grid-cols-1 gap-4">
                                    {manualTasksList.map((group) => (
                                        <div key={group.docId} className="bg-white dark:bg-base-800 border-2 border-purple-100 dark:border-purple-900/30 rounded-[2rem] shadow-lg p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                            <div className="flex items-center gap-5 flex-grow"><div className="h-14 w-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center font-black text-sm shrink-0">M</div><div className="min-w-0 flex-grow"><span className="text-lg font-black">{group.id}</span><div className="mt-1">{group.tasks.map((t, ti) => <div key={ti} className="flex items-center gap-3"><p className="text-[14px] font-bold text-slate-600 dark:text-slate-400">{String(getTaskValue(t, 'Description'))}</p><span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-black rounded-lg">x{String(getTaskValue(t, 'Quantity'))}</span></div>)}</div></div></div>
                                            <div className="flex items-center gap-3 shrink-0"><div className="flex items-center gap-2">{group.tasks.map((_, ti) => <input key={ti} type="checkbox" disabled={isAssigningToPrepare} className="h-6 w-6 rounded-xl text-primary-600 cursor-pointer disabled:opacity-20" checked={selectedItems[group.docId!]?.has(ti) || false} onChange={e => handleSelectItem(group.docId!, ti, e.target.checked)}/>)}<span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assign</span></div><button onClick={() => { if(confirm('Delete template?')) deleteCategorizedTask(group.docId!).then(fetchData); }} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"><TrashIcon className="h-6 w-6" /></button></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {gridData.length === 0 && manualTasksList.length === 0 && !isLoading && <div className="flex flex-col items-center justify-center py-32 opacity-20 text-slate-300 flex-1"><BeakerIcon className="h-24 w-24 mb-4" /><span className="text-xl font-black uppercase tracking-[0.5em]">No Missions in Queue</span></div>}
                    </div>
                 )}
            </div>
            <div className="px-4 py-2 bg-base-50 dark:bg-base-955 border-t border-base-200 dark:border-base-800 text-[9px] font-bold text-base-400 text-center uppercase tracking-widest">Hierarchy: Po cat &gt; LSP &gt; Sprint &gt; Urgent &gt; Normal</div>
        </div>
    );
};
export default TasksTab;
