
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Tester, CategorizedTask, DailySchedule, RawTask, AssignedTask, TestMapping, AssignedPrepareTask } from '../types';
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
    getAssignedTasks,
    getAssignedPrepareTasks,
    firestore
} from '../services/dataService';
import { CheckCircleIcon, ChevronDownIcon, TrashIcon, AlertTriangleIcon, RefreshIcon, PlusIcon, DownloadIcon, ChatBubbleLeftEllipsisIcon, BeakerIcon, XCircleIcon, SearchIcon, PencilIcon, ClipboardListIcon, SparklesIcon } from './common/Icons';

declare const XLSX: any;

// --- CONSTANTS ---
const COL_DUE_WIDTH = 42;
const COL_RID_WIDTH = 150;

const HEADER_THEMES = [
    { name: 'Indigo', headerBg: 'bg-indigo-50', headerText: 'text-indigo-900', borderColor: 'border-indigo-100', subHeaderBg: 'bg-indigo-600', subHeaderText: 'text-white' },
    { name: 'Emerald', headerBg: 'bg-emerald-50', headerText: 'text-emerald-900', borderColor: 'border-emerald-100', subHeaderBg: 'bg-emerald-600', subHeaderText: 'text-white' },
    { name: 'Amber', headerBg: 'bg-amber-50', headerText: 'text-amber-900', borderColor: 'border-amber-100', subHeaderBg: 'bg-amber-500', subHeaderText: 'text-white' },
    { name: 'Rose', headerBg: 'bg-rose-50', headerText: 'text-rose-900', borderColor: 'border-rose-100', subHeaderBg: 'bg-rose-600', subHeaderText: 'text-white' },
    { name: 'Cyan', headerBg: 'bg-cyan-50', headerText: 'text-cyan-900', borderColor: 'border-cyan-100', subHeaderBg: 'bg-cyan-600', subHeaderText: 'text-white' },
    { name: 'Violet', headerBg: 'bg-violet-50', headerText: 'text-violet-900', borderColor: 'border-violet-100', subHeaderBg: 'bg-violet-600', subHeaderText: 'text-white' },
];

const CATEGORY_STYLES: Record<string, { active: string, inactive: string, badge: string, dot: string }> = {
    all: { 
        active: 'bg-indigo-600 text-white border-indigo-400 shadow-md', 
        inactive: 'bg-white dark:bg-base-800 text-slate-500 border-slate-200 dark:border-white/5 hover:border-indigo-400', 
        badge: 'bg-indigo-50 dark:bg-base-955 text-indigo-700',
        dot: 'bg-slate-400'
    },
    pocat: { 
        active: 'bg-orange-500 text-white border-orange-300 shadow-md', 
        inactive: 'bg-orange-50/50 dark:bg-orange-900/10 text-orange-600 dark:text-orange-400 border-orange-200 hover:border-orange-400', 
        badge: 'bg-orange-100 dark:bg-orange-955 text-orange-700',
        dot: 'bg-orange-500'
    },
    urgent: { 
        active: 'bg-red-600 text-white border-red-400 shadow-md', 
        inactive: 'bg-red-50/50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-200 hover:border-red-400', 
        badge: 'bg-red-100 dark:bg-red-955 text-red-700',
        dot: 'bg-red-600'
    },
    normal: { 
        active: 'bg-blue-600 text-white border-blue-400 shadow-md', 
        inactive: 'bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 border-blue-200 hover:border-blue-400', 
        badge: 'bg-blue-100 dark:bg-base-955 text-blue-700',
        dot: 'bg-blue-600'
    },
    manual: { 
        active: 'bg-purple-600 text-white border-purple-400 shadow-md', 
        inactive: 'bg-purple-50/50 dark:bg-purple-900/10 text-purple-600 dark:text-purple-400 border-purple-200 hover:border-purple-400', 
        badge: 'bg-purple-100 dark:bg-base-955 text-purple-700',
        dot: 'bg-purple-600'
    }
};

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
        if (target === 'description') matchedKey = keys.find(k => ['description', 'desc', 'test name', 'testname', 'item'].includes(k.toLowerCase().trim()));
        if (target === 'variant') matchedKey = keys.find(k => ['variant', 'var', 'method', 'condition'].includes(k.toLowerCase().trim()));
        if (target === 'sample name') matchedKey = keys.find(k => ['sample name', 'sample', 'samplename', 'sample_name'].includes(k.toLowerCase().trim()));
        if (target === 'quantity') matchedKey = keys.find(k => ['quantity', 'qty', 'amount'].includes(k.toLowerCase().trim()));
        if (target === 'remark (requester)') matchedKey = keys.find(k => ['remark (requester)', 'remark', 'customer remark'].includes(k.toLowerCase().trim()));
        if (target === 'note to planer') matchedKey = keys.find(k => ['note to planer', 'note to planner', 'planner note'].includes(k.toLowerCase().trim()));
        if (target === 'additional information') matchedKey = keys.find(k => ['additional information', 'additional info', 'extra info'].includes(k.toLowerCase().trim()));
        if (target === 'testing condition') matchedKey = keys.find(k => ['testing condition', 'condition'].includes(k.toLowerCase().trim()));
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
    return minTime === Infinity ? Date.now() : minTime;
};

const getTaskGridColumnKey = (task: RawTask, mappings: TestMapping[]): string | null => {
    const taskDesc = String(getTaskValue(task, 'Description')).normalize('NFC').toLowerCase().replace(/\s+/g, '');
    const taskVar = String(getTaskValue(task, 'Variant')).normalize('NFC').toLowerCase().replace(/\s+/g, '');
    
    const specificMatch = mappings.find(m => 
        m.description.normalize('NFC').toLowerCase().replace(/\s+/g, '') === taskDesc && 
        m.variant.normalize('NFC').toLowerCase().replace(/\s+/g, '') === taskVar
    );
    
    if (specificMatch) return `${specificMatch.headerGroup}|${specificMatch.headerSub}`;
    return null;
};

// Helper to generate a unique signature for a task item to detect duplicates across imports
const getTaskSignature = (reqId: string, task: RawTask): string => {
    const desc = String(getTaskValue(task, 'Description') || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const variant = String(getTaskValue(task, 'Variant') || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const sample = String(getTaskValue(task, 'Sample Name') || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanReqId = reqId ? reqId.trim().toUpperCase() : 'NO_ID';
    
    return `${cleanReqId}|${desc}|${variant}|${sample}`;
};

// --- SUB-COMPONENTS ---
const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => { const timer = setTimeout(onDismiss, 3000); return () => clearTimeout(timer); }, [onDismiss]);
    return (
        <div className={`fixed top-24 right-8 py-4 px-8 rounded-2xl shadow-2xl flex items-center gap-4 animate-fade-in z-[120] border-2 backdrop-blur-xl ${isError ? 'bg-red-50/90 border-red-200 text-red-700' : 'bg-emerald-50/90 border-emerald-200 text-emerald-700'}`}>
            {isError ? <AlertTriangleIcon className="h-6 w-6" /> : <CheckCircleIcon className="h-6 w-6" />}
            <span className="font-black text-sm uppercase tracking-wider">{message}</span>
        </div>
    );
};

const CustomerRemarkModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    requestId: string;
    remarks: { source: string, text: string }[];
}> = ({ isOpen, onClose, requestId, remarks }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/70 backdrop-blur-md flex items-center justify-center z-[150] p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 flex flex-col animate-slide-in-up" onClick={e => e.stopPropagation()}>
                <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500 rounded-xl text-white shadow-lg"><ClipboardListIcon className="h-5 w-5"/></div>
                        <div>
                            <h3 className="text-xl font-black text-base-955 dark:text-white uppercase tracking-tighter leading-none">{requestId}</h3>
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">Customer Requirements</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-amber-100 rounded-xl transition-all"><XCircleIcon className="h-6 w-6 text-amber-400"/></button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {remarks.length > 0 ? remarks.map((r, i) => (
                        <div key={i} className="p-4 bg-base-50 dark:bg-base-800 rounded-2xl border-l-4 border-amber-500 shadow-sm">
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1 block">{r.source}</span>
                            <p className="text-sm font-bold text-base-800 dark:text-base-200 leading-relaxed italic">"{r.text}"</p>
                        </div>
                    )) : (
                        <div className="py-10 text-center opacity-20"><ClipboardListIcon className="h-12 w-12 mx-auto mb-2"/><p className="text-xs font-black uppercase">No specific remarks found</p></div>
                    )}
                </div>
                <div className="p-4 bg-base-50 dark:bg-base-800/50 border-t border-base-100 dark:border-base-700 flex justify-center">
                    <button onClick={onClose} className="px-8 py-3 bg-white dark:bg-base-700 text-base-500 dark:text-base-300 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-sm hover:bg-base-100">Dismiss</button>
                </div>
            </div>
        </div>
    );
};

const AddManualTaskModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (rid: string, desc: string, qty: string) => void; isProcessing: boolean }> = ({ isOpen, onClose, onSave, isProcessing }) => {
    const [rid, setRid] = useState('');
    const [desc, setDesc] = useState('');
    const [qty, setQty] = useState('1');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[110] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl p-10 w-full max-w-lg m-4 space-y-6 border border-white/20" onClick={e => e.stopPropagation()}>
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter leading-none">Initialize Manual Mission</h2>
                    <p className="text-sm font-bold text-base-400 italic">Create a recurring manual task template</p>
                </div>
                <div className="space-y-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-base-400 ml-2 tracking-widest">Request ID (รหัสงาน)</label><input type="text" value={rid} onChange={e => setRid(e.target.value.toUpperCase())} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-black text-sm dark:text-white placeholder:text-base-300" placeholder="E.G. AD-HOC-01"/></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-base-400 ml-2 tracking-widest">Description (รายละเอียดงาน)</label><input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-black text-sm dark:text-white placeholder:text-base-300" placeholder="E.G. Cleaning Instrument..."/></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-base-400 ml-2 tracking-widest">Quantity (จำนวนตัวอย่าง)</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-black text-sm dark:text-white"/></div>
                </div>
                <div className="flex flex-col gap-2 pt-4">
                    <button onClick={() => { onSave(rid, desc, qty); setRid(''); setDesc(''); setQty('1'); }} disabled={isProcessing || !rid || !desc} className="w-full py-5 bg-indigo-600 border-indigo-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-indigo-700 transition-all disabled:opacity-50">Deploy to Pool</button>
                    <button onClick={onClose} disabled={isProcessing} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Discard</button>
                </div>
            </div>
        </div>
    );
};

const EditManualTaskModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (updatedTask: RawTask) => void; task: RawTask | null; isProcessing: boolean }> = ({ isOpen, onClose, onSave, task, isProcessing }) => {
    const [formData, setFormData] = useState<RawTask>({});
    useEffect(() => { if (isOpen && task) setFormData({ ...task }); }, [isOpen, task]);
    if (!isOpen || !task) return null;

    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[110] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl p-10 w-full max-w-xl m-4 space-y-6 border border-white/20" onClick={e => e.stopPropagation()}>
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter leading-none">Modify Manual Task</h2>
                    <p className="text-sm font-bold text-base-400">Update persistent mission parameters</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-base-400 ml-2 tracking-widest">Description</label><input type="text" value={formData.Description || ''} onChange={e => setFormData({...formData, Description: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white"/></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-base-400 ml-2 tracking-widest">Variant / Method</label><input type="text" value={formData.Variant || ''} onChange={e => setFormData({...formData, Variant: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white"/></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-base-400 ml-2 tracking-widest">Sample Name</label><input type="text" value={formData['Sample Name'] || ''} onChange={e => setFormData({...formData, ['Sample Name']: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white"/></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-base-400 ml-2 tracking-widest">Quantity</label><input type="text" value={formData.Quantity || ''} onChange={e => setFormData({...formData, Quantity: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white"/></div>
                </div>
                <div className="flex flex-col gap-2 pt-4">
                    <button onClick={() => onSave(formData)} disabled={isProcessing} className="w-full py-5 bg-primary-600 border-primary-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-primary-700 transition-all">Save Changes</button>
                    <button onClick={onClose} disabled={isProcessing} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Discard</button>
                </div>
            </div>
        </div>
    );
};

const AssignmentModal: React.FC<{ isOpen: boolean; onClose: () => void; onAssign: (person: Tester) => void; personnel: { testers: Tester[]; assistants: Tester[] }; schedule: DailySchedule | null; shift: 'day' | 'night'; isPreparation: boolean; selectedItemCount: number; isProcessing: boolean; }> = ({ isOpen, onClose, onAssign, personnel, schedule, shift, isPreparation, selectedItemCount, isProcessing }) => {
    const filteredPersonnelList = useMemo(() => {
        if (!schedule) return [];
        const scheduledIds = shift === 'day' ? [...(schedule.dayShiftTesters || []), ...(schedule.dayShiftAssistants || [])] : [...(schedule.nightShiftTesters || []), ...(schedule.nightShiftAssistants || [])];
        const scheduledSet = new Set(scheduledIds);
        return [...personnel.testers, ...personnel.assistants].filter(p => scheduledSet.has(p.id));
    }, [schedule, shift, personnel]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-[3rem] shadow-2xl p-8 w-full max-w-lg m-4 space-y-6 border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tight uppercase leading-none">{isPreparation ? "Assign Preparation" : "Assign Testing Mission"}</h2>
                    <p className="text-sm font-bold text-base-500">Scheduled for: <span className="text-primary-600 uppercase">{shift} Shift</span></p>
                    <div className="inline-block px-4 py-1 bg-primary-50 dark:bg-primary-900/30 rounded-full"><span className="text-xs font-black text-primary-700 dark:text-primary-400 uppercase tracking-widest">{selectedItemCount} Items Selected</span></div>
                </div>
                <div className="border-2 border-base-100 dark:border-base-700 rounded-[2rem] bg-base-50 dark:bg-base-900/50 max-h-[50vh] overflow-y-auto custom-scrollbar">
                    {filteredPersonnelList.length > 0 ? (
                        <ul className="divide-y-2 divide-base-100 dark:divide-base-700">
                            {filteredPersonnelList.map(p => (
                                <li key={p.id} className="flex justify-between items-center p-4 hover:bg-white dark:hover:bg-base-800 transition-all group">
                                    <div className="flex flex-col"><span className="font-black text-[15px] text-base-800 dark:text-base-100">{p.name}</span><span className={`text-[9px] uppercase font-black tracking-widest ${p.team === 'assistants_4_2' ? 'text-amber-600' : 'text-primary-600'}`}>{p.team === 'assistants_4_2' ? 'Assistant' : 'Analyst'}</span></div>
                                    <button onClick={() => onAssign(p)} disabled={isProcessing} className="px-6 py-2.5 text-[10px] font-black bg-white dark:bg-base-900 border-2 border-base-200 dark:border-base-600 text-base-800 dark:text-white rounded-xl hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all uppercase tracking-widest shadow-sm active:scale-95">Select</button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="p-12 text-center space-y-4"><AlertTriangleIcon className="h-10 w-10 text-base-300 mx-auto" /><p className="text-xs font-bold text-base-400 leading-relaxed px-4">No staff scheduled in the Roster for this date and shift.</p></div>
                    )}
                </div>
                <div className="pt-2 flex justify-center"><button onClick={onClose} className="px-10 py-3 text-[10px] font-black text-base-400 hover:text-base-800 transition-colors uppercase tracking-[0.3em]">Cancel Assignment</button></div>
            </div>
        </div>
    );
};

const DeleteConfirmationModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void; label: string; isProcessing: boolean; }> = ({ isOpen, onClose, onConfirm, label, isProcessing }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/90 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden p-10 text-center space-y-6 border border-white/20" onClick={e => e.stopPropagation()}>
                <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-[2rem] flex items-center justify-center mx-auto text-red-600 shadow-inner"><TrashIcon className="h-10 w-10" /></div>
                <div><h3 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter territory-leading-none">Confirm Deletion</h3><p className="text-base-500 mt-4 text-[15px] font-bold leading-relaxed px-2">Are you sure you want to remove <span className="text-red-600">"{label}"</span>? This action will permanently erase the item.</p></div>
                <div className="flex flex-col gap-2 pt-4"><button onClick={onConfirm} disabled={isProcessing} className="w-full py-5 bg-red-600 border-red-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-red-700 transition-all disabled:opacity-50">{isProcessing ? 'Processing...' : 'Delete Permanently'}</button><button onClick={onClose} disabled={isProcessing} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Cancel</button></div>
            </div>
        </div>
    );
};

const ExpandableCell: React.FC<{ 
    headerKey: string; 
    items: { task: RawTask; originalIndex: number; sourceDocId: string; requestId: string; isItemActiveInOps?: boolean; isItemDoneInOps?: boolean }[]; 
    isGroupEnd?: boolean;
    expandedCell: { docId: string; headerKey: string } | null;
    setExpandedCell: (val: { docId: string; headerKey: string } | null) => void;
    selectedItems: Record<string, Set<string>>; 
    handleSelectItem: (docId: string, taskId: string, isChecked: boolean) => void;
    setSelectedItems: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
    isAssigningToPrepare: boolean;
    setNoteEditor: (val: any) => void;
    onInitiateDelete: (docId: string, index: number, label: string) => void;
    onInitiateEdit?: (docId: string, index: number, task: RawTask) => void;
}> = ({ headerKey, items, isGroupEnd, expandedCell, setExpandedCell, selectedItems, handleSelectItem, setSelectedItems, isAssigningToPrepare, setNoteEditor, onInitiateDelete, onInitiateEdit }) => {
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Reset confirmation when dropdown closes
    useEffect(() => {
        if (expandedCell?.headerKey !== headerKey) setConfirmDeleteId(null);
    }, [expandedCell, headerKey]);

    if (items.length === 0) return <td className={`p-0 align-top border border-base-200 dark:border-base-700 ${isGroupEnd ? 'border-r-2 border-r-slate-200 dark:border-r-base-600' : ''}`}></td>;
    
    const anchorDocId = items[0].sourceDocId;
    const isExpanded = expandedCell?.headerKey === headerKey && expandedCell?.docId === anchorDocId;
    const selectedForThisCell = items.filter(item => selectedItems[item.sourceDocId]?.has(item.task._id!));
    const numSelected = selectedForThisCell.length;
    const itemCount = items.length;
    const hasInPrep = items.some(item => item.task.preparationStatus === 'Awaiting Preparation');
    const hasPrepared = items.some(item => item.task.preparationStatus === 'Prepared' || item.task.preparationStatus === 'Ready for Testing');
    const hasReturned = items.some(item => item.task.isReturned);
    const hasActiveOps = items.some(item => item.isItemActiveInOps); // Check item level
    const hasDoneOps = items.some(item => item.isItemDoneInOps); // Check if completed
    const areAllSelected = itemCount > 0 && numSelected === itemCount;

    const toggleAll = (checked: boolean) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            items.forEach(item => {
                const currentSet = new Set(next[item.sourceDocId] || []);
                if (checked) currentSet.add(item.task._id!); 
                else currentSet.delete(item.task._id!);
                next[item.sourceDocId] = currentSet;
            });
            return next;
        });
    };

    let cellTextColor = 'text-primary-955 dark:text-primary-300 font-black';
    if (hasReturned) cellTextColor = 'text-purple-700 dark:text-purple-400 font-black';
    else if (hasInPrep) cellTextColor = 'text-amber-600 dark:text-amber-500 font-black';
    else if (hasPrepared) cellTextColor = 'text-emerald-700 dark:text-emerald-500 font-black';

    return (
        <td className={`p-0 align-top transition-all relative border border-base-200 dark:border-base-700 ${isGroupEnd ? 'border-r-2 border-r-slate-200 dark:border-r-base-600' : ''} ${isExpanded ? 'bg-white dark:bg-base-800 ring-2 ring-indigo-500 z-[80]' : 'hover:bg-indigo-50/20'}`}>
            <div className={`p-0.5 text-center cursor-pointer h-full flex flex-col justify-center min-h-[38px] relative`} onClick={() => setExpandedCell(isExpanded ? null : { docId: anchorDocId, headerKey })}>
                <div className="flex flex-col items-center">
                    <span className={`font-black text-[18px] tracking-tighter leading-none ${numSelected > 0 ? 'text-white bg-indigo-600 rounded-md px-1.5 py-0.5' : cellTextColor}`}>
                        {numSelected > 0 ? `${numSelected}/${itemCount}` : itemCount}
                    </span>
                    <div className="flex justify-center gap-1 mt-0.5">
                        {hasReturned && <div className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></div>}
                        {hasInPrep && <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>}
                        {hasPrepared && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                        {hasActiveOps && !hasDoneOps && <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-sm animate-pulse"></div>}
                        {hasDoneOps && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm"></div>}
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="absolute top-full left-0 min-w-[440px] bg-white dark:bg-base-900 border-2 border-indigo-500 shadow-2xl rounded-b-[2rem] overflow-hidden z-[90] animate-fade-in origin-top-left" onClick={e => e.stopPropagation()}>
                    <div className="p-4 bg-indigo-50 dark:bg-base-800 border-b-2 border-indigo-100 dark:border-base-700 flex justify-between items-center shrink-0">
                        <span className="text-[11px] font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest">{headerKey.split('|')[1] || headerKey}</span>
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase cursor-pointer text-indigo-800 dark:text-primary-200"><input type="checkbox" className="h-4 w-4 rounded" checked={areAllSelected} onChange={e => toggleAll(e.target.checked)}/> Select All</label>
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar bg-white dark:bg-base-955">
                        <table className="w-full border-collapse">
                            <tbody className="divide-y divide-base-100 dark:divide-base-800">
                                {items.map(({ task, originalIndex, sourceDocId, isItemActiveInOps, isItemDoneInOps }) => {
                                    const isReady = task.preparationStatus === 'Prepared' || task.preparationStatus === 'Ready for Testing';
                                    const isInPrep = task.preparationStatus === 'Awaiting Preparation';
                                    const sampleLabel = String(getTaskValue(task, 'Sample Name'));
                                    const isReturned = task.isReturned;
                                    
                                    return (
                                        <tr key={task._id} className={`bg-white dark:bg-base-900 hover:bg-indigo-50/40 ${isItemActiveInOps ? 'bg-purple-50/20' : ''} ${isItemDoneInOps ? 'bg-emerald-50/30' : ''}`}>
                                            <td className="p-4 w-12 text-center"><input type="checkbox" className="h-5 w-5 rounded cursor-pointer border-2 border-base-300 dark:border-base-600 text-indigo-600" checked={selectedItems[sourceDocId]?.has(task._id!) || false} onChange={e => handleSelectItem(sourceDocId, task._id!, e.target.checked)}/></td>
                                            <td className="p-4">
                                                <div className="flex justify-between items-start mb-1 gap-4">
                                                    <div className={`flex flex-col gap-1 min-w-0 flex-grow`}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-[15px] uppercase truncate text-base-955 dark:text-white leading-tight tracking-tight">{sampleLabel}</span>
                                                            {isReady && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[8px] font-black rounded uppercase tracking-widest border border-emerald-300">Ready</span>}
                                                            {isInPrep && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[8px] font-black rounded uppercase tracking-widest border border-amber-300">In Prep</span>}
                                                            {isReturned && <span className="px-2 py-0.5 bg-rose-600 text-white text-[8px] font-black rounded uppercase tracking-widest animate-pulse shadow-sm">Returned</span>}
                                                            {isItemActiveInOps && !isItemDoneInOps && <span className="px-2 py-0.5 bg-purple-600 text-white text-[8px] font-black rounded uppercase tracking-widest shadow-sm cursor-help" title="Item is currently in ops. Selecting this will clone it for a Repeat Test.">ON OPS</span>}
                                                            {isItemDoneInOps && <span className="px-2 py-0.5 bg-emerald-600 text-white text-[8px] font-black rounded uppercase tracking-widest shadow-sm cursor-help" title="Item completed previously. Selecting this will clone it for a Repeat Test.">COMPLETED</span>}
                                                        </div>
                                                        <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">{String(getTaskValue(task, 'Variant'))}</p>
                                                        
                                                        {/* RETURN ALERT BOX FOR PLANNER */}
                                                        {isReturned && (
                                                            <div className="mt-2 p-2 bg-rose-50 border border-rose-100 rounded-xl flex gap-2 items-start shadow-sm animate-fade-in">
                                                                <AlertTriangleIcon className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                                                                <div className="flex flex-col">
                                                                    <span className="text-[9px] font-black text-rose-800 uppercase tracking-widest mb-0.5">Rejected by {task.returnedBy || 'Staff'}</span>
                                                                    <p className="text-[10px] font-bold text-rose-600 leading-tight italic">"{task.returnReason || 'No reason provided'}"</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {onInitiateEdit && <button onClick={() => onInitiateEdit(sourceDocId, originalIndex, task)} className="p-2 bg-base-50 dark:bg-base-955 border-base-200 rounded-lg text-base-400 hover:text-indigo-600 transition-all"><PencilIcon className="h-4.5 w-4.5"/></button>}
                                                        <button onClick={() => setNoteEditor({ docId: sourceDocId, index: originalIndex, text: task.plannerNote || '' })} className={`p-2 rounded-lg border ${task.plannerNote ? 'bg-indigo-600 border-indigo-400 text-white shadow-md' : 'bg-base-50 dark:bg-base-955 border-base-200 text-base-400'}`}><ChatBubbleLeftEllipsisIcon className="h-4.5 w-4.5" /></button>
                                                        
                                                        {/* 2-CLICK DELETE FOR INDIVIDUAL ITEM */}
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (confirmDeleteId === task._id) {
                                                                    onInitiateDelete(sourceDocId, originalIndex, sampleLabel);
                                                                    setConfirmDeleteId(null);
                                                                } else {
                                                                    setConfirmDeleteId(task._id!);
                                                                    setTimeout(() => setConfirmDeleteId(null), 4000);
                                                                }
                                                            }} 
                                                            className={`p-2 rounded-lg transition-all border ${
                                                                confirmDeleteId === task._id 
                                                                    ? 'bg-red-600 border-red-400 text-white animate-pulse' 
                                                                    : 'bg-base-50 dark:bg-base-955 border-base-200 text-base-400 hover:text-red-600'
                                                            }`}
                                                            title={confirmDeleteId === task._id ? "Click again to confirm delete" : "Delete item"}
                                                        >
                                                            {confirmDeleteId === task._id ? <TrashIcon className="h-4.5 w-4.5"/> : <XCircleIcon className="h-4.5 w-4.5"/>}
                                                        </button>
                                                        
                                                        <div className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100 rounded-lg text-[11px] font-black border border-indigo-100">x{String(getTaskValue(task, 'Quantity'))}</div>
                                                    </div>
                                                </div>
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
    const [assignedGlobal, setAssignedGlobal] = useState<AssignedTask[]>([]); 
    const [testMappings, setTestMappings] = useState<TestMapping[]>([]);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [filterRequestId, setFilterRequestId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAddManualModalOpen, setIsAddManualModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ docId: string, index: number, label: string } | null>(null);
    const [editTask, setEditTask] = useState<{ docId: string, index: number, task: RawTask } | null>(null);
    const [isAssigningToPrepare, setIsAssigningToPrepare] = useState(false); 
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
    const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>({});
    const [expandedCell, setExpandedCell] = useState<{ docId: string; headerKey: string } | null>(null);
    const [hideEmptyColumns, setHideEmptyColumns] = useState(true);
    const [isAssigning, setIsAssigning] = useState(false);
    const [noteEditor, setNoteEditor] = useState<{ docId: string, index: number, text: string } | null>(null);
    const [activeRemarks, setActiveRemarks] = useState<{ id: string, list: {source: string, text: string}[] } | null>(null);
    const [batchDeleteStage, setBatchDeleteStage] = useState(0);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [tasks, mappings, allAssigned, dailySched] = await Promise.all([
                getCategorizedTasks(), 
                getTestMappings(),
                getAssignedTasks(),
                getDailySchedule(selectedDate)
            ]);
            setAssignedGlobal(allAssigned || []);
            setCategorizedTasks(tasks);
            setTestMappings(mappings);
            setSchedule(dailySched);
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
    }, [selectedDate]);

    useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

    const handleSelectItem = useCallback((docId: string, taskId: string, isChecked: boolean) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            const currentSet = new Set(next[docId] || []);
            if (isChecked) currentSet.add(taskId);
            else currentSet.delete(taskId);
            next[docId] = currentSet;
            return next;
        });
    }, []);

    const assignedStateGlobal = useMemo(() => {
        const ids = new Set<string>();
        assignedGlobal.forEach(a => a.tasks.forEach(t => { if (t._id) ids.add(t._id); }));
        return { ids };
    }, [assignedGlobal]);

    // Create a Set of signatures for all currently assigned tasks (Item Level)
    const assignedItemSignatures = useMemo(() => {
        const sigs = new Map<string, TaskStatus>();
        assignedGlobal.forEach(doc => {
            if(doc.tasks) {
                doc.tasks.forEach(t => {
                    const sig = getTaskSignature(doc.requestId, t);
                    // Use status from assigned task, default to Pending if missing
                    sigs.set(sig, t.status || TaskStatus.Pending);
                });
            }
        });
        return sigs;
    }, [assignedGlobal]);

    // Calculate count of completed items visible in the grid
    const completedItemsCount = useMemo(() => {
        let count = 0;
        categorizedTasks.forEach(doc => {
            doc.tasks.forEach(t => {
                const sig = getTaskSignature(doc.id, t);
                const status = assignedItemSignatures.get(sig);
                if (status === TaskStatus.Done) {
                    count++;
                }
            });
        });
        return count;
    }, [categorizedTasks, assignedItemSignatures]);

    // Request-Level duplicate check (Only if multiple documents for same RequestID exist in POOL)
    const duplicateRequestIds = useMemo(() => {
        const idCounts: Record<string, number> = {};
        categorizedTasks.forEach(doc => {
            if (doc.category !== TaskCategory.Manual && doc.id) {
                const rid = doc.id.trim().toUpperCase();
                idCounts[rid] = (idCounts[rid] || 0) + 1;
            }
        });
        const duplicates = new Set<string>();
        Object.entries(idCounts).forEach(([rid, count]) => {
            if (count > 1) duplicates.add(rid);
        });
        return duplicates;
    }, [categorizedTasks]);

    // ... [inventoryAudit, categoryTotals, gridHeaders, manualTasksFlattened, selectedItemCount, handleAddManualMission, handleDeleteConfirm, handleAutoCleanCompleted, handleBatchForceDone, handleMergeDuplicates, handleBatchWipe, handleSaveTaskEdit Logic remains same] ...
    
    // REDEFINE THESE HOOKS IF THEY ARE MISSING IN CONTEXT BUT THEY SHOULD BE HERE FROM PREVIOUS FILE
    const inventoryAudit = useMemo(() => {
        let totalDBItems = 0;
        let visibleInGrid = 0;
        let assignedToStaff = 0;
        const seenIds = new Set<string>();
        categorizedTasks.forEach(doc => {
            doc.tasks.forEach(task => {
                if (task._id && seenIds.has(task._id)) return;
                if (task._id) seenIds.add(task._id);
                totalDBItems++;
                const isAssigned = task._id && assignedStateGlobal.ids.has(task._id);
                if (isAssigned && doc.category !== TaskCategory.Manual) assignedToStaff++;
                else visibleInGrid++;
            });
        });
        return { totalDBItems, visibleInGrid, assignedToStaff };
    }, [categorizedTasks, assignedStateGlobal]);

    const categoryTotals = useMemo(() => {
        const counts: Record<string, number> = { all: 0, pocat: 0, urgent: 0, normal: 0, manual: 0 };
        const localAssignedIds = assignedStateGlobal.ids;
        const seenIds = new Set<string>();
        categorizedTasks.forEach(doc => {
            const cat = doc.category.toLowerCase();
            doc.tasks.forEach(task => {
                if (task._id && seenIds.has(task._id)) return;
                if (task._id) seenIds.add(task._id);
                const isAssigned = task._id && localAssignedIds.has(task._id);
                if (isAssigned && cat !== 'manual') return;
                counts.all++;
                if (counts[cat] !== undefined) counts[cat]++;
            });
        });
        return counts;
    }, [categorizedTasks, assignedStateGlobal]);

    const gridHeaders = useMemo(() => {
        const groupsMap = new Map<string, string[]>();
        testMappings.forEach(m => {
            if (!m.headerGroup || !m.headerSub) return;
            if (!groupsMap.has(m.headerGroup)) groupsMap.set(m.headerGroup, []);
            const key = `${m.headerGroup}|${m.headerSub}`;
            if (!groupsMap.get(m.headerGroup)!.includes(key)) groupsMap.get(m.headerGroup)!.push(key);
        });
        return Array.from(groupsMap.entries());
    }, [testMappings]);

    const manualTasksFlattened = useMemo(() => {
        const flat: { docId: string; id: string; task: RawTask; index: number }[] = [];
        categorizedTasks.forEach(doc => {
            if (doc.category === TaskCategory.Manual) {
                doc.tasks.forEach((task, index) => flat.push({ docId: doc.docId!, id: doc.id, task, index }));
            }
        });
        return flat;
    }, [categorizedTasks]);

    const selectedItemCount = useMemo(() => Object.values(selectedItems).reduce((acc: number, s: Set<string>) => acc + s.size, 0), [selectedItems]);

    const handleAddManualMission = async (rid: string, desc: string, qty: string) => {
        setIsAssigning(true);
        try {
            const newTask: RawTask = { _id: Math.random().toString(36).substring(2) + Date.now(), Description: desc, Quantity: qty, 'Sample Name': desc, Variant: 'Manual Mission', ManualEntry: true };
            await saveCategorizedTask({ id: rid, category: TaskCategory.Manual, tasks: [newTask], createdAt: new Date().toISOString() });
            setNotification({ message: "Manual mission created." });
            fetchData();
            setIsAddManualModalOpen(false);
        } catch (e) { setNotification({ message: "Failed to create mission", isError: true }); } finally { setIsAssigning(false); }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteConfirm) return;
        setIsAssigning(true);
        try {
            const { docId, index, label } = deleteConfirm;
            const doc = categorizedTasks.find(d => d.docId === docId);
            if (!doc) throw new Error("Document not found");
            const updatedTasks = doc.tasks.filter((_, idx) => idx !== index);
            if (updatedTasks.length > 0) await updateCategorizedTask(docId, { tasks: updatedTasks });
            else await deleteCategorizedTask(docId);
            setNotification({ message: `Successfully deleted "${label}"` });
            fetchData();
        } catch (e) { setNotification({ message: "Failed to delete task.", isError: true }); } finally { setIsAssigning(false); setDeleteConfirm(null); }
    };

    const handleAutoCleanCompleted = async () => {
        if (completedItemsCount === 0) return;
        setIsAssigning(true);
        try {
            const batch = firestore.batch();
            let deleteCount = 0;
            categorizedTasks.forEach(doc => {
                const originalTasks = doc.tasks;
                const remainingTasks = originalTasks.filter(task => {
                    const sig = getTaskSignature(doc.id, task);
                    const status = assignedItemSignatures.get(sig);
                    return status !== TaskStatus.Done;
                });
                if (remainingTasks.length !== originalTasks.length) {
                    deleteCount += (originalTasks.length - remainingTasks.length);
                    if (remainingTasks.length === 0) batch.delete(firestore.collection('categorizedTasks').doc(doc.docId));
                    else batch.update(firestore.collection('categorizedTasks').doc(doc.docId), { tasks: remainingTasks });
                }
            });
            if (deleteCount > 0) { await batch.commit(); setNotification({ message: `Successfully cleaned ${deleteCount} completed items from the grid.` }); fetchData(); } else { setNotification({ message: "No items to clean." }); }
        } catch (e) { setNotification({ message: "Failed to clean completed tasks.", isError: true }); } finally { setIsAssigning(false); }
    };

    const handleBatchForceDone = async () => {
        if (selectedItemCount === 0) return;
        setIsAssigning(true);
        try {
            const batch = firestore.batch();
            const assignments: Record<string, RawTask[]> = {};
            const docsToUpdate = new Map<string, RawTask[]>();
            for (const docId in selectedItems) {
                const ids = selectedItems[docId]; if (!ids || ids.size === 0) continue;
                const original = categorizedTasks.find(t => t.docId === docId); if (!original) continue;
                const selectedTasks = original.tasks.filter(t => ids.has(t._id!));
                selectedTasks.forEach(t => { 
                    const clean = { ...t }; delete clean.status; delete clean.preparationStatus; clean.status = TaskStatus.Done;
                    if (original.category === 'manual') clean._id = Math.random().toString(36).substring(2) + Date.now().toString(36);
                    if (!assignments[original.id]) assignments[original.id] = []; assignments[original.id].push(clean);
                });
                const remainingTasks = original.tasks.filter(t => !ids.has(t._id!));
                docsToUpdate.set(docId, remainingTasks);
            }
            for (const [rid, tasks] of Object.entries(assignments)) {
                batch.set(firestore.collection('assignedTasks').doc(), { requestId: rid, tasks, category: categorizedTasks.find(c => c.id === rid)?.category || 'normal', testerId: 'legacy_data_fix', testerName: 'Legacy / Manual Done', assignedDate: selectedDate, shift: selectedShift, status: TaskStatus.Done });
            }
            for (const [docId, remaining] of docsToUpdate.entries()) {
                if (remaining.length === 0) batch.delete(firestore.collection('categorizedTasks').doc(docId));
                else batch.update(firestore.collection('categorizedTasks').doc(docId), { tasks: remaining });
            }
            await batch.commit(); setSelectedItems({}); setExpandedCell(null); fetchData(); setNotification({ message: `Successfully marked ${selectedItemCount} items as Done.` });
        } catch (e) { setNotification({ message: "Failed to mark items as done.", isError: true }); } finally { setIsAssigning(false); }
    };

    const handleMergeDuplicates = async (requestId: string) => {
        setIsAssigning(true);
        try {
            const targetDocs = categorizedTasks.filter(d => d.id === requestId && d.category !== TaskCategory.Manual);
            if (targetDocs.length < 2) { setNotification({ message: "No duplicates found to merge." }); return; }
            const uniqueTasksMap = new Map<string, RawTask>();
            targetDocs.forEach(doc => { doc.tasks.forEach(task => { const sig = getTaskSignature(requestId, task); if (!uniqueTasksMap.has(sig)) uniqueTasksMap.set(sig, task); }); });
            const mergedTasks = Array.from(uniqueTasksMap.values());
            const batch = firestore.batch();
            targetDocs.forEach(doc => batch.delete(firestore.collection('categorizedTasks').doc(doc.docId)));
            const newDocRef = firestore.collection('categorizedTasks').doc();
            batch.set(newDocRef, { id: requestId, category: targetDocs[0].category, tasks: mergedTasks, createdAt: new Date().toISOString() });
            await batch.commit(); fetchData(); setNotification({ message: `Merged ${targetDocs.length} records into 1 clean record.` });
        } catch (e) { console.error(e); setNotification({ message: "Merge failed.", isError: true }); } finally { setIsAssigning(false); }
    };

    const handleBatchWipe = async () => {
        if (selectedItemCount === 0) return;
        setIsAssigning(true);
        try {
            const batch = firestore.batch();
            const docsToUpdate = new Map<string, RawTask[]>();
            categorizedTasks.forEach(doc => {
                const selectedIdsInDoc = selectedItems[doc.docId!] || new Set();
                if (selectedIdsInDoc.size > 0) {
                    const remainingTasks = doc.tasks.filter(t => !selectedIdsInDoc.has(t._id!));
                    docsToUpdate.set(doc.docId!, remainingTasks);
                }
            });
            for (const [docId, remaining] of docsToUpdate.entries()) {
                if (remaining.length === 0) batch.delete(firestore.collection('categorizedTasks').doc(docId));
                else batch.update(firestore.collection('categorizedTasks').doc(docId), { tasks: remaining });
            }
            await batch.commit(); setSelectedItems({}); setBatchDeleteStage(0); fetchData(); setNotification({ message: `Permanently deleted ${selectedItemCount} items.` });
        } catch (e) { setNotification({ message: "Failed to wipe selected tasks.", isError: true }); } finally { setIsAssigning(false); }
    };

    const handleSaveTaskEdit = async (updatedTask: RawTask) => {
        if (!editTask) return;
        setIsAssigning(true);
        try {
            const doc = categorizedTasks.find(d => d.docId === editTask.docId);
            if (!doc) throw new Error("Document not found");
            const updatedTasks = [...doc.tasks];
            updatedTasks[editTask.index] = updatedTask;
            await updateCategorizedTask(editTask.docId, { tasks: updatedTasks });
            setNotification({ message: "Task updated successfully." });
            fetchData();
        } catch (e) { setNotification({ message: "Failed to update task.", isError: true }); } finally { setIsAssigning(false); setEditTask(null); }
    };

    const gridData = useMemo(() => {
        const rows: any[] = [];
        const activeCat = activeCategory.toLowerCase();
        const search = filterRequestId.toLowerCase().trim();

        // Group by normalized ID
        const groupedByRid = categorizedTasks.reduce((acc, doc) => { 
            const k = doc.id.toLowerCase().replace(/^rs1-/, ''); 
            if (!acc[k]) acc[k] = { rid: doc.id, docs: [] }; 
            acc[k].docs.push(doc); return acc; 
        }, {} as any);

        Object.entries(groupedByRid).forEach(([_, group]: any) => {
            const filteredDocs = activeCat === 'all' 
                ? group.docs.filter((d: any) => d.category !== TaskCategory.Manual) 
                : group.docs.filter((d: any) => d.category.toLowerCase() === activeCat && d.category !== TaskCategory.Manual);
            
            if (filteredDocs.length === 0) return;
            if (search && !group.rid.toLowerCase().includes(search)) return;

            const isDuplicateRow = duplicateRequestIds.has(group.rid.trim().toUpperCase());

            const row = { requestId: group.rid, cells: {} as any, unmappedItems: [] as any, minDueDate: Infinity, itemCount: 0, availableItems: 0, isPoCat: false, isUrgent: false, isManual: false, isDuplicateRow: isDuplicateRow, customerRemarks: [] as {source: string, text: string}[] };
            
            const seenTaskIdsInRow = new Set<string>();
            const uniqueRemarkTexts = new Set<string>();

            filteredDocs.forEach((doc: any) => {
                if (doc.category === 'pocat') row.isPoCat = true;
                if (doc.category === 'urgent') row.isUrgent = true;
                
                doc.tasks.forEach((task: any, index: number) => {
                    if (task._id && seenTaskIdsInRow.has(task._id)) return;
                    if (task._id) seenTaskIdsInRow.add(task._id);

                    const itemSignature = getTaskSignature(group.rid, task);
                    const activeStatus = assignedItemSignatures.get(itemSignature);
                    const isItemActiveInOps = activeStatus !== undefined;
                    const isItemDoneInOps = activeStatus === TaskStatus.Done;

                    const isFullyAssigned = task._id && assignedStateGlobal.ids.has(task._id);
                    if (isFullyAssigned) return;

                    const dateVal = getDueDateTimestamp([task]);
                    if (dateVal < row.minDueDate) row.minDueDate = dateVal;
                    row.itemCount++;
                    if (task.preparationStatus !== 'Awaiting Preparation') row.availableItems++;
                    
                    const fields = [{ key: 'Remark (Requester)', label: 'Request Remark' }, { key: 'Note to planer', label: 'Planer Note (Cust)' }, { key: 'Additional Information', label: 'Extra Info' }, { key: 'Testing Condition', label: 'Cust Condition' }];
                    fields.forEach(f => {
                        const val = String(getTaskValue(task, f.key) || '').trim();
                        if (val && val !== '-' && val.toLowerCase() !== 'n/a' && !uniqueRemarkTexts.has(val)) {
                            uniqueRemarkTexts.add(val);
                            row.customerRemarks.push({ source: f.label, text: val });
                        }
                    });

                    // Pass isItemActiveInOps and isItemDoneInOps to the cell renderer
                    const item = { task, originalIndex: index, sourceDocId: doc.docId!, requestId: group.rid, isItemActiveInOps, isItemDoneInOps };
                    const colKey = getTaskGridColumnKey(task, testMappings);
                    if (colKey) { if (!row.cells[colKey]) row.cells[colKey] = []; row.cells[colKey].push(item); } 
                    else { row.unmappedItems.push(item); }
                });
            });
            if (row.itemCount > 0) rows.push(row);
        });
        return rows.sort((a, b) => a.minDueDate - b.minDueDate);
    }, [categorizedTasks, activeCategory, filterRequestId, testMappings, assignedStateGlobal, duplicateRequestIds, assignedItemSignatures]);

    const activeColumnKeys = useMemo(() => {
        const keys = gridHeaders.flatMap(([, sk]) => sk);
        if (!hideEmptyColumns) return keys;
        const used = new Set<string>();
        gridData.forEach(r => Object.keys(r.cells).forEach(k => used.add(k)));
        return keys.filter(k => used.has(k));
    }, [gridHeaders, gridData, hideEmptyColumns]);

    const lastKeysOfGroups = useMemo(() => {
        const lastKeys = new Set<string>();
        gridHeaders.forEach(([, subKeys]) => {
            const visibleInGroup = subKeys.filter(k => activeColumnKeys.includes(k));
            if (visibleInGroup.length > 0) lastKeys.add(visibleInGroup[visibleInGroup.length-1]);
        });
        return lastKeys;
    }, [gridHeaders, activeColumnKeys]);

    const handleConfirmAssignment = async (person: Tester) => {
        if (isAssigning) return;
        if (selectedItemCount === 0) return;
        setIsAssigning(true);
        try {
            const batch = firestore.batch();
            const assignments: Record<string, RawTask[]> = {};
            
            // Logic to update pool (remove assigned items)
            const poolUpdates: Map<string, RawTask[]> = new Map();
            const poolDeletes: string[] = [];

            for (const docId in selectedItems) {
                const ids = selectedItems[docId]; if (!ids || ids.size === 0) continue;
                const original = categorizedTasks.find(t => t.docId === docId); if (!original) continue;
                const selectedTasks = original.tasks.filter(t => ids.has(t._id!));
                
                if (isAssigningToPrepare && original.category !== 'manual') {
                    const indices = original.tasks.map((t, i) => ids.has(t._id!) ? i : -1).filter(i => i !== -1);
                    await assignItemsToPrepare(original, indices, person, selectedDate, selectedShift);
                } else {
                    selectedTasks.forEach(t => { 
                        const clean = { ...t }; 
                        delete clean.status; 
                        delete clean.preparationStatus;
                        
                        // AUTO-CLONE LOGIC FOR REPEAT TESTS
                        // Generate new ID if:
                        // 1. It is a Manual task (always unique instance)
                        // 2. It has a signature match with an existing active/done task (Repeat Test)
                        // 3. Or just always for safety when moving from Pool to Assignment to break link?
                        //    SAFE MODE: Always regenerate ID when assigning from pool to ensure data separation.
                        clean._id = Math.random().toString(36).substring(2) + Date.now().toString(36);
                        
                        if (!assignments[original.id]) assignments[original.id] = []; 
                        assignments[original.id].push(clean);
                    });

                    // Prepare pool cleanup (remove selected items from source doc)
                    // NEW CHANGE: Only update pool if category is NOT Manual
                    if (original.category !== TaskCategory.Manual) {
                        const remainingTasks = original.tasks.filter(t => !ids.has(t._id!));
                        if (remainingTasks.length === 0) {
                            poolDeletes.push(docId);
                        } else {
                            poolUpdates.set(docId, remainingTasks);
                        }
                    }
                }
            }

            if (!isAssigningToPrepare) {
                // Save assignments
                for (const [rid, tasks] of Object.entries(assignments)) {
                    batch.set(firestore.collection('assignedTasks').doc(), { 
                        requestId: rid, 
                        tasks, 
                        category: categorizedTasks.find(c => c.id === rid)?.category || 'normal', 
                        testerId: person.id, 
                        testerName: person.name, 
                        assignedDate: selectedDate, 
                        shift: selectedShift, 
                        status: 'Pending' 
                    });
                }
                
                // Cleanup Pool
                poolDeletes.forEach(did => batch.delete(firestore.collection('categorizedTasks').doc(did)));
                poolUpdates.forEach((tasks, did) => batch.update(firestore.collection('categorizedTasks').doc(did), { tasks }));
            }
            
            await batch.commit(); 
            setSelectedItems({}); 
            setExpandedCell(null); 
            fetchData(); 
            setNotification({ message: "Assignment Complete." });
        } catch (e) { 
            console.error(e);
            setNotification({ message: "Error in assignment", isError: true }); 
        } finally { 
            setIsAssigning(false); 
            setIsModalOpen(false); 
        }
    };

    const handleExportGrid = () => {
        if (!gridData || gridData.length === 0) return;
        const row1 = ["Due Date", "Request ID"];
        const row2 = ["", ""];
        activeColumnKeys.forEach(key => { const [group, sub] = key.split('|'); row1.push(group); row2.push(sub); });
        row1.push("Unmapped"); row2.push("Items");
        const dataRows = gridData.map(row => {
            const dateStr = new Date(row.minDueDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
            const reqId = row.requestId.replace(/^RS1-/, '');
            const rowArray = [dateStr, reqId];
            activeColumnKeys.forEach(key => {
                const items = row.cells[key] || [];
                if (items.length > 0) {
                    const cellContent = items.map(item => {
                        const sample = String(getTaskValue(item.task, 'Sample Name')).trim();
                        const qty = String(getTaskValue(item.task, 'Quantity')).trim();
                        return `${sample} (x${qty})`;
                    }).join('\r\n');
                    rowArray.push(cellContent);
                } else { rowArray.push(""); }
            });
            if (row.unmappedItems && row.unmappedItems.length > 0) {
                const unmappedContent = row.unmappedItems.map(item => {
                    const sample = String(getTaskValue(item.task, 'Sample Name')).trim();
                    const qty = String(getTaskValue(item.task, 'Quantity')).trim();
                    const variant = String(getTaskValue(item.task, 'Variant')).trim();
                    return `[${variant}] ${sample} (x${qty})`;
                }).join('\r\n');
                rowArray.push(unmappedContent);
            } else { rowArray.push(""); }
            return rowArray;
        });
        const wsData = [row1, row2, ...dataRows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wscols = [{wch: 10}, {wch: 20}];
        activeColumnKeys.forEach(() => wscols.push({wch: 30})); wscols.push({wch: 40});
        ws['!cols'] = wscols;
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Task Grid"); XLSX.writeFile(wb, `TaskGrid_Export_${selectedDate}_${Date.now()}.xlsx`);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] space-y-2 animate-slide-in-up relative overflow-hidden bg-white/50 dark:bg-base-955">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            <AssignmentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAssign={handleConfirmAssignment} personnel={{ testers: testers.filter(t => t.team !== 'assistants_4_2'), assistants: testers.filter(t => t.team === 'assistants_4_2') }} schedule={schedule} shift={selectedShift} isPreparation={isAssigningToPrepare} selectedItemCount={selectedItemCount} isProcessing={isAssigning}/>
            <DeleteConfirmationModal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={handleDeleteConfirm} label={deleteConfirm?.label || ''} isProcessing={isAssigning} />
            <EditManualTaskModal isOpen={!!editTask} onClose={() => setEditTask(null)} onSave={handleSaveTaskEdit} task={editTask?.task || null} isProcessing={isAssigning} />
            <AddManualTaskModal isOpen={isAddManualModalOpen} onClose={() => setIsAddManualModalOpen(false)} onSave={handleAddManualMission} isProcessing={isAssigning} />
            <CustomerRemarkModal isOpen={!!activeRemarks} onClose={() => setActiveRemarks(null)} requestId={activeRemarks?.id || ''} remarks={activeRemarks?.list || []} />

            {/* REFINED LIGHT SUMMARY SECTION */}
            <div className="px-6 space-y-2 shrink-0 mt-4">
                <div className="flex items-center justify-between p-4 bg-white dark:bg-base-900 rounded-2xl border border-indigo-100 dark:border-white/5 shadow-md">
                    <div className="flex items-center gap-10 ml-4">
                        <div className="flex flex-col"><span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Global Storage</span><span className="text-xl font-black text-slate-900 dark:text-white leading-none tracking-tighter">{inventoryAudit.totalDBItems} <span className="text-[10px] text-slate-400 ml-1 font-bold">REQS</span></span></div>
                        <div className="w-px h-8 bg-indigo-50 dark:bg-white/10"></div>
                        <div className="flex flex-col"><span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1">Available Missions</span><span className="text-xl font-black text-slate-900 dark:text-white leading-none tracking-tighter">{inventoryAudit.visibleInGrid}</span></div>
                        <div className="w-px h-8 bg-indigo-50 dark:bg-white/10"></div>
                        <div className="flex flex-col"><span className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">Deployed Assets</span><span className="text-xl font-black text-slate-900 dark:text-white leading-none tracking-tighter">{inventoryAudit.assignedToStaff}</span></div>
                    </div>
                    <div className="flex gap-2 pr-2">
                        {completedItemsCount > 0 && (
                            <button onClick={handleAutoCleanCompleted} className="px-5 py-2.5 bg-emerald-600 text-white text-[10px] font-black rounded-xl hover:bg-emerald-700 transition-all uppercase tracking-widest flex items-center gap-2 shadow-lg active:scale-95 border-b-4 border-emerald-800 animate-pulse-subtle">
                                <TrashIcon className="h-4 w-4" /> Clean Completed ({completedItemsCount})
                            </button>
                        )}
                        {activeCategory === 'manual' && (
                            <button onClick={() => setIsAddManualModalOpen(true)} className="px-5 py-2.5 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all uppercase tracking-widest flex items-center gap-2 shadow-sm active:scale-95"><PlusIcon className="h-4 w-4" /> New Template</button>
                        )}
                        <button onClick={handleExportGrid} className="px-5 py-2.5 bg-white dark:bg-base-800 border border-slate-200 dark:border-white/5 rounded-xl text-base-500 hover:text-indigo-600 shadow-sm transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest active:scale-95" title="Export Current Grid"><DownloadIcon className="h-4 w-4" /> Export Grid</button>
                        <button onClick={() => setHideEmptyColumns(!hideEmptyColumns)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hideEmptyColumns ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-white dark:bg-base-800 text-slate-400 border border-slate-200 dark:border-white/5 shadow-sm'}`}>{hideEmptyColumns ? 'Standard View' : 'Compact View'}</button>
                        <button onClick={fetchData} className="p-2.5 bg-white dark:bg-base-800 border border-slate-200 dark:border-white/5 rounded-xl text-indigo-500 hover:text-indigo-700 transition-all shadow-sm active:scale-90"><RefreshIcon className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
                    </div>
                </div>

                {/* CATEGORY & HUB */}
                <div className="p-2 bg-white/70 dark:bg-base-900/40 backdrop-blur-xl rounded-2xl border border-white dark:border-white/10 shadow-sm flex items-center gap-3">
                    <div className="flex items-center gap-1 p-1 bg-indigo-50/50 dark:bg-black/20 rounded-xl flex-grow overflow-x-auto no-scrollbar">
                        {['all', 'pocat', 'urgent', 'normal', 'manual'].map(c => {
                            const isActive = activeCategory === c;
                            const style = CATEGORY_STYLES[c];
                            return (
                                <button 
                                    key={c} 
                                    onClick={() => setActiveCategory(c)} 
                                    className={`relative flex items-center gap-2 px-5 py-2 rounded-lg border-2 transition-all duration-300 min-w-[105px] shrink-0 font-black uppercase tracking-widest text-[10px] ${isActive ? style.active : style.inactive} active:scale-95`}
                                >
                                    <div className={`w-1 h-1 rounded-full ${style.dot} ${isActive ? 'animate-pulse ring-2 ring-white/50' : 'opacity-40'}`}></div>
                                    {c}
                                    <div className={`ml-auto px-1.5 py-0.5 rounded-md text-[8px] font-black shadow-inner transition-all ${isActive ? 'bg-black/20' : style.badge}`}>{categoryTotals[c] || 0}</div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="h-8 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>

                    {/* SELECTION INTERFACE */}
                    <div className={`flex items-center gap-3 transition-all duration-500 shrink-0 ${selectedItemCount > 0 ? 'opacity-100' : 'opacity-20'}`}>
                        <div className="flex flex-col items-center justify-center px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg border border-indigo-200 dark:border-indigo-800 shadow-inner min-w-[70px]">
                            <span className="text-[7px] font-black text-indigo-500 uppercase tracking-widest leading-none mb-0.5">Focus</span>
                            <span className="text-xl font-black text-indigo-900 dark:text-white leading-none">{selectedItemCount}</span>
                        </div>
                        
                        {selectedItemCount > 0 ? (
                            <div className="flex gap-1 animate-fade-in shrink-0 items-center">
                                <button onClick={() => { setIsAssigningToPrepare(true); setIsModalOpen(true); }} className="px-4 py-2.5 bg-amber-500 text-white text-[9px] font-black rounded-lg hover:bg-amber-600 uppercase shadow-sm transition-all border-b-2 border-amber-700 active:scale-95">Assign Prep</button>
                                <button onClick={() => { setIsAssigningToPrepare(false); setIsModalOpen(true); }} className="px-4 py-2.5 bg-indigo-600 text-white text-[9px] font-black rounded-lg hover:bg-indigo-700 uppercase shadow-sm transition-all border-b-2 border-indigo-800 active:scale-95">Assign Test</button>
                                
                                {/* NEW MARK DONE BUTTON FOR GHOST TASKS */}
                                <button 
                                    onClick={handleBatchForceDone}
                                    className="px-4 py-2.5 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 uppercase shadow-sm transition-all border-b-2 border-emerald-800 active:scale-95 flex items-center gap-1"
                                    title="Force Mark Ghost Tasks as Done (Prevents re-import duplicates)"
                                >
                                    <CheckCircleIcon className="h-3.5 w-3.5" /> Mark Done
                                </button>

                                <button 
                                    onClick={() => {
                                        if (batchDeleteStage === 0) {
                                            setBatchDeleteStage(1);
                                            setTimeout(() => setBatchDeleteStage(0), 4000); 
                                        } else {
                                            handleBatchWipe();
                                        }
                                    }}
                                    className={`px-4 py-2.5 rounded-lg text-[9px] font-black uppercase shadow-sm transition-all border-b-2 active:scale-90 ${batchDeleteStage === 1 ? 'bg-red-600 text-white border-red-800 animate-pulse' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
                                >
                                    {batchDeleteStage === 1 ? 'Confirm Wipe?' : 'Wipe Focus'}
                                </button>

                                <button onClick={() => { setSelectedItems({}); setBatchDeleteStage(0); }} className="p-2 text-slate-300 hover:text-indigo-500 transition-all active:rotate-90" title="Clear Selection"><XCircleIcon className="h-5 w-5"/></button>
                            </div>
                        ) : (
                            <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest ml-2 italic">No assets focused</div>
                        )}
                    </div>

                    <div className="h-8 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>

                    <div className="flex items-center gap-2 shrink-0 pr-1">
                        <div className="relative group w-40">
                            <input 
                                type="text" 
                                placeholder="Search ID..." 
                                value={filterRequestId} 
                                onChange={e => setFilterRequestId(e.target.value)} 
                                className="w-full pl-8 pr-2 py-2 bg-indigo-50/50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 rounded-lg text-[10px] font-bold dark:text-white outline-none focus:border-indigo-500 transition-all shadow-inner"
                            />
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-300 group-focus-within:text-indigo-500"><SearchIcon className="h-3 w-3" /></div>
                        </div>
                        
                        <div className="flex bg-indigo-50/50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 rounded-lg overflow-hidden shadow-inner shrink-0">
                            <input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="px-3 py-2 bg-transparent border-none text-[10px] font-black dark:text-white outline-none cursor-pointer" />
                            <div className="w-px bg-indigo-100 dark:bg-white/10 my-1"></div>
                            <select value={selectedShift} onChange={e => onShiftChange(e.target.value as any)} className="px-3 py-2 bg-transparent border-none text-[9px] font-black uppercase dark:text-white outline-none cursor-pointer tracking-widest"><option value="day" className="bg-white dark:bg-base-900">Day</option><option value="night" className="bg-white dark:bg-base-900">Night</option></select>
                        </div>
                    </div>
                </div>
            </div>

            {/* GRID TABLE SECTION */}
            <div className="flex-1 min-h-0 mx-6 mb-6 bg-white dark:bg-base-900 rounded-[2rem] border border-slate-200 dark:border-base-800 shadow-xl overflow-hidden flex flex-col relative">
                <div className="flex-1 overflow-auto custom-scrollbar bg-white dark:bg-base-955">
                    {activeCategory === 'manual' ? (
                        <div className="p-8">
                            <div className="overflow-hidden rounded-2xl border border-indigo-100 dark:border-indigo-900/30 shadow-md">
                                <table className="w-full text-left border-collapse">
                                    {/* Manual Task Table Implementation... (same as before) */}
                                    <thead className="bg-indigo-600 text-white">
                                        <tr>
                                            <th className="p-4 w-16 text-center border-r border-white/10"><input type="checkbox" className="h-5 w-5 rounded" onChange={e => {
                                                const checked = e.target.checked;
                                                setSelectedItems(prev => {
                                                    const next = { ...prev };
                                                    manualTasksFlattened.forEach(item => {
                                                        const currentSet = new Set(next[item.docId] || []);
                                                        if (checked) currentSet.add(item.task._id!);
                                                        else currentSet.delete(item.task._id!);
                                                        next[item.docId] = currentSet;
                                                    });
                                                    return next;
                                                });
                                            }} /></th>
                                            <th className="p-5 font-black uppercase text-[12px] tracking-[0.2em] border-r border-white/10 w-64">Request ID</th>
                                            <th className="p-5 font-black uppercase text-[12px] tracking-[0.2em]">Description</th>
                                            <th className="p-5 font-black uppercase text-[12px] tracking-[0.2em] w-24 text-center border-l border-white/10">Units</th>
                                            <th className="p-5 font-black uppercase text-[12px] tracking-[0.2em] w-32 text-center border-l border-white/10">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-base-100 dark:divide-base-800 bg-white dark:bg-base-900">
                                        {manualTasksFlattened.map(({ docId, id, task, index }) => (
                                            <tr key={`${docId}_${task._id}`} className="hover:bg-indigo-50/20 transition-colors">
                                                <td className="p-4 text-center border-r border-base-100 dark:border-base-800"><input type="checkbox" className="h-5 w-5 rounded border-2 border-indigo-200 text-indigo-600" checked={selectedItems[docId]?.has(task._id!) || false} onChange={e => handleSelectItem(docId, task._id!, e.target.checked)}/></td>
                                                <td className="p-5 font-black text-indigo-700 dark:text-indigo-400 text-xl tracking-tighter uppercase border-r border-base-100 dark:border-base-800">{id}</td>
                                                <td className="p-5"><div className="flex flex-col"><span className="font-black text-lg text-base-955 dark:text-base-50 uppercase leading-none tracking-tight">{task.Description}</span><span className="text-[10px] font-bold text-base-400 mt-2 uppercase italic">{task.Variant}</span></div></td>
                                                <td className="p-5 text-center border-l border-base-100 dark:border-base-800"><span className="inline-block px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-black rounded-lg text-lg shadow-inner">x{task.Quantity}</span></td>
                                                <td className="p-5 text-center border-l border-base-100 dark:border-base-800"><div className="flex justify-center gap-2"><button onClick={() => setEditTask({ docId, index, task })} className="p-2.5 bg-base-50 dark:bg-base-800 border rounded-xl text-base-400 hover:text-indigo-600"><PencilIcon className="h-5 w-5" /></button><button onClick={() => setDeleteConfirm({ docId, index, label: task.Description! })} className="p-2.5 bg-base-50 dark:bg-base-800 border rounded-xl text-base-400 hover:text-red-600"><TrashIcon className="h-5 w-5" /></button></div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        gridData.length > 0 ? (
                            <table className="min-w-full text-xs text-left border-separate border-spacing-0 table-fixed relative">
                                <thead className="sticky top-0 z-[60]">
                                    <tr className="bg-slate-50 text-slate-900">
                                        <th rowSpan={2} style={{ width: `${COL_DUE_WIDTH}px` }} className="p-1 font-black uppercase border-r border-base-100 sticky left-0 z-[70] bg-slate-50 text-center text-[9px]">Due</th>
                                        <th rowSpan={2} style={{ width: `${COL_RID_WIDTH}px` }} className="p-1 font-black uppercase border-r-2 border-indigo-400 sticky left-[42px] z-[70] bg-slate-50 text-center text-[9px] tracking-tight shadow-sm">Request ID</th>
                                        {gridHeaders.map(([group, subKeys], i) => {
                                            const visibleInGroup = subKeys.filter(k => activeColumnKeys.includes(k));
                                            return visibleInGroup.length > 0 ? ( <th key={group} colSpan={visibleInGroup.length} className={`px-1 py-1 font-black text-center border-b border-r border-base-100 uppercase tracking-[0.2em] text-[9px] ${HEADER_THEMES[i % HEADER_THEMES.length].headerBg} ${HEADER_THEMES[i % HEADER_THEMES.length].headerText}`}>{group}</th> ) : null;
                                        })}
                                        <th rowSpan={2} className="px-1 py-1 font-black uppercase bg-slate-100 text-slate-500 w-24 text-center border-l border-base-200 text-[8px] tracking-widest shadow-inner">Unmapped</th>
                                    </tr>
                                    <tr className="bg-slate-50">{gridHeaders.flatMap(([group, subKeys], i) => subKeys.filter(k => activeColumnKeys.includes(k)).map(key => ( <th key={key} className={`p-1 font-black text-[11px] text-center border-b border-r border-base-100 uppercase w-14 shadow-inner ${HEADER_THEMES[i % HEADER_THEMES.length].subHeaderBg} text-white`}>{key.split('|')[1]}</th> )) )}</tr>
                                </thead>
                                <tbody className="divide-y divide-base-100 dark:divide-base-800">
                                    {gridData.map(row => (
                                        <tr key={row.requestId} className={`group transition-colors ${row.isDuplicateRow ? 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500' : 'hover:bg-indigo-50/20'}`}>
                                            <td className="p-0.5 border-r border-base-200 bg-white dark:bg-base-955 sticky left-0 z-40 text-center font-black text-slate-800 text-[9px] leading-tight">{`${(new Date(row.minDueDate)).getDate()}/${(new Date(row.minDueDate)).getMonth()+1}`}</td>
                                            <td className={`px-2 py-2 border-r-2 border-indigo-400 bg-white dark:bg-base-900 sticky left-[42px] z-40 shadow-sm`}>
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1 min-w-0">
                                                            <span className={`text-[13px] font-black uppercase leading-none tracking-tighter truncate ${row.isDuplicateRow ? 'text-red-600' : 'text-base-955 dark:text-base-50'}`}>{row.requestId.replace(/^RS1-/, '')}</span>
                                                            {row.customerRemarks.length > 0 && (
                                                                <button 
                                                                    onClick={() => setActiveRemarks({ id: row.requestId, list: row.customerRemarks })}
                                                                    className="shrink-0 p-1 bg-amber-100 text-amber-600 rounded-md hover:bg-amber-600 hover:text-white transition-all animate-pulse-subtle"
                                                                    title="View Customer Remarks"
                                                                >
                                                                    <ClipboardListIcon className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <span className="text-[8px] font-black text-slate-400 shrink-0">#{row.availableItems}/{row.itemCount}</span>
                                                    </div>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {row.isDuplicateRow && (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="px-1 py-0.5 bg-red-600 text-white text-[6px] rounded-sm font-black animate-pulse">DUPLICATE SOURCE</span>
                                                                <button onClick={(e) => { e.stopPropagation(); handleMergeDuplicates(row.requestId); }} className="px-2 py-0.5 bg-white border border-red-200 text-red-600 text-[8px] font-bold rounded hover:bg-red-50 shadow-sm flex items-center gap-1">
                                                                    <SparklesIcon className="h-3 w-3"/> Fix / Merge
                                                                </button>
                                                            </div>
                                                        )}
                                                        {row.isPoCat && <span className="px-1 py-0.5 bg-orange-600 text-white text-[6px] rounded-sm font-black">PO</span>}
                                                        {row.isUrgent && <span className="px-1 py-0.5 bg-red-600 text-white text-[6px] rounded-sm font-black">URG</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            {activeColumnKeys.map(header => <ExpandableCell key={header} headerKey={header} items={row.cells[header] || []} isGroupEnd={lastKeysOfGroups.has(header)} expandedCell={expandedCell} setExpandedCell={setExpandedCell} selectedItems={selectedItems} handleSelectItem={handleSelectItem} setSelectedItems={setSelectedItems} isAssigningToPrepare={isAssigningToPrepare} setNoteEditor={setNoteEditor} onInitiateDelete={(d, i, l) => setDeleteConfirm({ docId: d, index: i, label: l })} />)}
                                            <ExpandableCell headerKey="unmapped" items={row.unmappedItems} isGroupEnd={false} expandedCell={expandedCell} setExpandedCell={setExpandedCell} selectedItems={selectedItems} handleSelectItem={handleSelectItem} setSelectedItems={setSelectedItems} isAssigningToPrepare={isAssigningToPrepare} setNoteEditor={setNoteEditor} onInitiateDelete={(d, i, l) => setDeleteConfirm({ docId: d, index: i, label: l })} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="py-40 text-center opacity-10 flex flex-col items-center"><BeakerIcon className="h-24 w-24 mb-6" /><span className="text-2xl font-black uppercase tracking-[0.5em]">Fleet Standby - No Missions</span></div>
                        )
                    )}
                </div>
            </div>
            <div className="px-8 text-[9px] font-black text-base-300 text-center uppercase tracking-[0.8em] pb-3 shrink-0">Operational Intelligence Grid • System V2.9.4 Core</div>
        </div>
    );
};

export default TasksTab;
