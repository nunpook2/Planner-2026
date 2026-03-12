
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AssignedTask, RawTask, DistillationLog, Tester, AssignedPrepareTask, LabRoom, EnvironmentLog } from '../types';
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
    deleteDistillationLog,
    getLabRooms,
    addLabRoom,
    updateLabRoom,
    deleteLabRoom,
    getEnvironmentLogs,
    addEnvironmentLog,
    deleteEnvironmentLog,
    getChemicalPrices,
    saveChemicalPrices
} from '../services/dataService';
import { 
    AlertTriangleIcon, CheckCircleIcon, 
    RefreshIcon, BeakerIcon, CalendarIcon,
    XCircleIcon, UserGroupIcon, DownloadIcon,
    SparklesIcon, PlusIcon, TrashIcon, ArrowUpIcon,
    ClipboardListIcon, PencilIcon, ChevronDownIcon,
    DatabaseIcon, SearchIcon, ClockIcon, ThermometerIcon,
    CurrencyDollarIcon
} from './common/Icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

declare const XLSX: any;

const CHEMICAL_OPTIONS = ['Methanol', 'Ethanol', 'Hexane', 'Acetone', 'Acetonitrile', 'Isopropanol', 'Xylene', 'Toluene'];

const DoubleConfirmDeleteButton = ({ 
    onDelete, 
    baseClass, 
    confirmClass, 
    iconClass = "h-3 w-3" 
}: { 
    onDelete: () => void, 
    baseClass: string, 
    confirmClass: string,
    iconClass?: string
}) => {
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        if (isConfirming) {
            const timer = setTimeout(() => setIsConfirming(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [isConfirming]);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isConfirming) {
            onDelete();
            setIsConfirming(false);
        } else {
            setIsConfirming(true);
        }
    };

    return (
        <button 
            onClick={handleClick} 
            className={`${baseClass} ${isConfirming ? confirmClass : ''} transition-all duration-200`}
            title={isConfirming ? "Click again to confirm" : "Delete"}
        >
            {isConfirming ? <CheckCircleIcon className={iconClass} /> : <TrashIcon className={iconClass} />}
        </button>
    );
};

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

const ChemicalPriceModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (prices: Record<string, number>) => void;
    currentPrices: Record<string, number>;
    chemicals: string[];
}> = ({ isOpen, onClose, onSave, currentPrices, chemicals }) => {
    const [prices, setPrices] = useState<Record<string, number>>(currentPrices);

    useEffect(() => {
        if (isOpen) setPrices(currentPrices);
    }, [isOpen, currentPrices]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(prices);
    };

    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="px-10 py-8 border-b border-slate-100 dark:border-base-800 bg-slate-50/50 dark:bg-base-950 shrink-0">
                    <h2 className="text-2xl font-black tracking-tighter text-slate-800 dark:text-base-100 flex items-center gap-3"><DatabaseIcon className="h-8 w-8 text-emerald-500" /> Chemical Prices</h2>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-2">Set price per liter (฿) for cost savings calculation</p>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                    <div className="p-10 space-y-6 overflow-y-auto custom-scrollbar">
                        {chemicals.map(chem => (
                            <div key={chem} className="flex flex-col gap-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">{chem}</label>
                                <div className="relative">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-black">฿</span>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        min="0"
                                        value={prices[chem] || ''} 
                                        onChange={e => setPrices({...prices, [chem]: parseFloat(e.target.value) || 0})}
                                        className="w-full pl-10 pr-6 py-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl text-[14px] font-bold focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                                        placeholder="0.00"
                                    />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black uppercase tracking-widest">/ L</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-8 border-t border-slate-100 dark:border-base-800 bg-slate-50/50 dark:bg-base-950 flex justify-end gap-4 shrink-0">
                        <button type="button" onClick={onClose} className="px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 dark:hover:bg-base-800 transition-all">Cancel</button>
                        <button type="submit" className="px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 transition-all">Save Prices</button>
                    </div>
                </form>
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

const RoomConfigModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (room: Omit<LabRoom, 'id'>, id?: string) => void;
    editTarget: LabRoom | null;
}> = ({ isOpen, onClose, onSave, editTarget }) => {
    const [name, setName] = useState('');
    const [timeSlots, setTimeSlots] = useState<string[]>(['09:00', '13:00']);
    const [desc, setDesc] = useState('');
    const [newTime, setNewTime] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (editTarget) {
                setName(editTarget.name);
                setTimeSlots(editTarget.monitorTimeSlots || []);
                setDesc(editTarget.description || '');
            } else {
                setName('');
                setTimeSlots(['09:00', '13:00']);
                setDesc('');
            }
        }
    }, [isOpen, editTarget]);

    const PREDEFINED_TIMES = [
        '08:00', '09:00', '10:00', '11:00', '12:00', 
        '13:00', '14:00', '15:00', '16:00', '17:00', 
        '18:00', '19:00', '20:00'
    ];

    const toggleTimeSlot = (time: string) => {
        if (timeSlots.includes(time)) {
            setTimeSlots(timeSlots.filter(t => t !== time));
        } else {
            setTimeSlots([...timeSlots, time].sort());
        }
    };

    const addTimeSlot = () => {
        if (newTime && !timeSlots.includes(newTime)) {
            const updated = [...timeSlots, newTime].sort();
            setTimeSlots(updated);
            setNewTime('');
        }
    };

    const removeTimeSlot = (time: string) => {
        setTimeSlots(timeSlots.filter(t => t !== time));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in">
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white" onClick={e => e.stopPropagation()}>
                <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50 dark:bg-base-800">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none italic">
                        {editTarget ? 'Edit Room' : 'New Lab Room'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-base-700 rounded-xl transition-all"><XCircleIcon className="h-6 w-6 text-slate-400" /></button>
                </div>
                <div className="p-10 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Room Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-black text-lg outline-none focus:border-indigo-500 dark:text-white" placeholder="e.g. Lab 101" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Monitor Schedule (Times)</label>
                        
                        {/* Predefined Times Grid */}
                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {PREDEFINED_TIMES.map(time => (
                                <button
                                    key={time}
                                    onClick={() => toggleTimeSlot(time)}
                                    className={`py-2 rounded-xl text-xs font-black transition-all ${
                                        timeSlots.includes(time) 
                                        ? 'bg-indigo-600 text-white shadow-md scale-105' 
                                        : 'bg-slate-100 dark:bg-base-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-base-700'
                                    }`}
                                >
                                    {time}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2 mb-3 items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase mr-2">Custom:</span>
                            <input 
                                type="time" 
                                value={newTime} 
                                onChange={e => setNewTime(e.target.value)} 
                                className="flex-1 p-2 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-xl font-bold text-xs outline-none focus:border-indigo-500 dark:text-white" 
                            />
                            <button onClick={addTimeSlot} disabled={!newTime} className="px-3 py-2 bg-indigo-100 text-indigo-600 rounded-xl font-black hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-50"><PlusIcon className="h-4 w-4" /></button>
                        </div>

                        <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-50 dark:bg-base-800 rounded-2xl border border-slate-100 dark:border-base-700">
                            {timeSlots.length > 0 ? timeSlots.map(t => (
                                <span key={t} className="px-3 py-1 bg-white dark:bg-base-900 text-indigo-600 border border-indigo-100 dark:border-base-700 rounded-lg text-xs font-black flex items-center gap-2 shadow-sm">
                                    {t}
                                    <button onClick={() => removeTimeSlot(t)} className="hover:text-rose-500"><XCircleIcon className="h-3 w-3" /></button>
                                </span>
                            )) : (
                                <span className="text-xs text-slate-400 italic w-full text-center py-1">No times selected</span>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Description</label>
                        <input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500 dark:text-white" />
                    </div>
                </div>
                <div className="px-10 py-8 border-t border-slate-100 dark:border-base-700 flex gap-4 bg-slate-50/50 dark:bg-base-900">
                    <button 
                        onClick={() => onSave({ name, monitorTimeSlots: timeSlots, description: desc }, editTarget?.id)} 
                        disabled={!name}
                        className="flex-1 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs disabled:opacity-50"
                    >
                        Save Configuration
                    </button>
                    <button onClick={onClose} className="px-8 py-5 text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const EnvironmentLogModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (log: Omit<EnvironmentLog, 'id'>, id?: string) => void;
    testers: Tester[];
    roomId: string;
    roomName: string;
    editTarget: EnvironmentLog | null;
    timeSlots: string[];
    labRooms: LabRoom[];
}> = ({ isOpen, onClose, onSave, testers, roomId, roomName, editTarget, timeSlots, labRooms }) => {
    const [temp, setTemp] = useState('');
    const [hum, setHum] = useState('');
    const [user, setUser] = useState('');
    const [note, setNote] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('');
    const [selectedRoom, setSelectedRoom] = useState(roomId);

    useEffect(() => {
        if (isOpen) {
            if (editTarget) {
                setTemp(editTarget.temperature.toString());
                setHum(editTarget.humidity.toString());
                setUser(editTarget.recorderName);
                setNote(editTarget.note || '');
                const d = new Date(editTarget.timestamp);
                setDate(d.toISOString().split('T')[0]);
                const h = d.getHours().toString().padStart(2, '0');
                const m = d.getMinutes().toString().padStart(2, '0');
                setTime(`${h}:${m}`);
                setSelectedRoom(editTarget.roomId);
            } else {
                setTemp('');
                setHum('');
                setUser('');
                setNote('');
                setDate(new Date().toISOString().split('T')[0]);
                setSelectedRoom(roomId);
                
                // Determine time slots based on selected room
                const currentRoom = labRooms.find(r => r.id === (editTarget ? editTarget.roomId : roomId));
                const slots = currentRoom?.monitorTimeSlots || timeSlots;

                if (slots && slots.length > 0) {
                    setTime(slots[0]);
                } else {
                    const now = new Date();
                    const h = now.getHours().toString().padStart(2, '0');
                    const m = now.getMinutes().toString().padStart(2, '0');
                    setTime(`${h}:${m}`);
                }
            }
        }
    }, [isOpen, editTarget, roomId, labRooms]);

    // Update time slots when room changes
    const currentRoomObj = labRooms.find(r => r.id === selectedRoom);
    const availableTimeSlots = currentRoomObj?.monitorTimeSlots || [];

    useEffect(() => {
        if (!editTarget && availableTimeSlots.length > 0 && !availableTimeSlots.includes(time)) {
             setTime(availableTimeSlots[0]);
        }
    }, [selectedRoom, availableTimeSlots]);


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in">
            <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white" onClick={e => e.stopPropagation()}>
                <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50 dark:bg-base-800">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none italic">
                        {editTarget ? 'Edit Reading' : 'Log Environment'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-base-700 rounded-xl transition-all"><XCircleIcon className="h-6 w-6 text-slate-400" /></button>
                </div>
                <div className="p-10 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Target Location</label>
                        <select 
                            value={selectedRoom} 
                            onChange={e => setSelectedRoom(e.target.value)} 
                            className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-black text-lg outline-none focus:border-indigo-500 shadow-inner appearance-none dark:text-white text-center text-indigo-600 uppercase tracking-tight"
                            disabled={!!editTarget}
                        >
                            <option value="" disabled>-- Select Room --</option>
                            {labRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500 dark:text-white text-center" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Time Slot</label>
                            {availableTimeSlots && availableTimeSlots.length > 0 ? (
                                <select value={time} onChange={e => setTime(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500 dark:text-white appearance-none text-center">
                                    {availableTimeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            ) : (
                                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500 dark:text-white text-center" />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Temp (°C)</label>
                            <input type="number" step="0.1" value={temp} onChange={e => setTemp(e.target.value)} className="w-full p-5 bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-100 dark:border-rose-800 rounded-2xl font-black text-2xl text-rose-600 outline-none focus:border-rose-500 text-center" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Humidity (%)</label>
                            <input type="number" step="0.1" value={hum} onChange={e => setHum(e.target.value)} className="w-full p-5 bg-cyan-50 dark:bg-cyan-900/20 border-2 border-cyan-100 dark:border-cyan-800 rounded-2xl font-black text-2xl text-cyan-600 outline-none focus:border-cyan-500 text-center" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Recorder</label>
                        <select 
                            value={user} 
                            onChange={e => setUser(e.target.value)} 
                            className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner appearance-none dark:text-white"
                        >
                            <option value="">-- Select Personnel --</option>
                            {testers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Note (Optional)</label>
                        <input type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-base-800 border-2 border-slate-100 dark:border-base-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500 dark:text-white" />
                    </div>
                </div>
                <div className="px-10 py-8 border-t border-slate-100 dark:border-base-700 flex gap-4 bg-slate-50/50 dark:bg-base-900">
                    <button 
                        onClick={() => onSave({ 
                            roomId: selectedRoom, roomName: currentRoomObj?.name || roomName, temperature: parseFloat(temp), humidity: parseFloat(hum), timestamp: `${date}T${time}:00`, recorderName: user, note 
                        }, editTarget?.id)} 
                        disabled={!user || !temp || !hum || !date || !time || !selectedRoom}
                        className="flex-1 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs disabled:opacity-50"
                    >
                        {editTarget ? 'Update Reading' : 'Log Reading'}
                    </button>
                    <button onClick={onClose} className="px-8 py-5 text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest">Discard</button>
                </div>
            </div>
        </div>
    );
};

const QualityDashboard: React.FC<{ onResolve: () => void, testers: Tester[] }> = ({ onResolve, testers }) => {
    const [activeSubTab, setActiveSubTab] = useState<'issues' | 'distillation' | 'overplan' | 'environment'>('issues');
    const [issuesMode, setIssuesMode] = useState<'active' | 'history'>('active');
    const [allAssigned, setAllAssigned] = useState<AssignedTask[]>([]);
    const [allPrepared, setAllPrepared] = useState<AssignedPrepareTask[]>([]);
    const [distLogs, setDistLogs] = useState<DistillationLog[]>([]);
    const [chemicalPrices, setChemicalPrices] = useState<Record<string, number>>({});
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [labRooms, setLabRooms] = useState<LabRoom[]>([]);
    const [envLogs, setEnvLogs] = useState<EnvironmentLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isResolving, setIsResolving] = useState(false);
    const [searchAnalyst, setSearchAnalyst] = useState('');
    const [isDistModalOpen, setIsDistModalOpen] = useState(false);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const [selectedChemical, setSelectedChemical] = useState<string | null>(null);
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, targetItems: FlattenedNotOkTask[] | null, title: string, description: string }>({ isOpen: false, targetItems: null, title: '', description: '' });
    const [distDeleteConfirm, setDistDeleteConfirm] = useState<DistillationLog | null>(null);
    const [editTarget, setEditTarget] = useState<DistillationLog | null>(null);
    
    // ENVIRONMENT STATE
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
    const [isEnvLogModalOpen, setIsEnvLogModalOpen] = useState(false);
    const [envEditTarget, setEnvEditTarget] = useState<EnvironmentLog | null>(null);
    const [roomEditTarget, setRoomEditTarget] = useState<LabRoom | null>(null);
    
    // OVER PLAN INTERACTIVE STATE
    const [selectedOverPlanAnalyst, setSelectedOverPlanAnalyst] = useState<string | null>(null);

    // Date Filter States
    const [distDateFilter, setDistDateFilter] = useState<'all' | 'week' | 'month' | 'specific'>('all');
    const [specificMonth, setSpecificMonth] = useState(new Date().toISOString().slice(0, 7)); 

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [assigned, prepared, dist, history, rooms, envs, prices] = await Promise.all([ 
                getAssignedTasks(), 
                getAssignedPrepareTasks(),
                getDistillationLogs(),
                getResolutionHistory(),
                getLabRooms(),
                getEnvironmentLogs(),
                getChemicalPrices()
            ]);
            setAllAssigned(assigned || []);
            setAllPrepared(prepared || []);
            setDistLogs(dist || []);
            setHistoryLogs(history || []);
            setLabRooms(rooms || []);
            setEnvLogs(envs || []);
            setChemicalPrices(prices || {});
            
            // Auto-select first chemical if none selected
            if (!selectedChemical && dist.length > 0) {
                setSelectedChemical(dist[0].chemicalName);
            } else if (!selectedChemical && dist.length === 0) {
                setSelectedChemical(CHEMICAL_OPTIONS[0]);
            }

            // Auto-select first room
            if (!selectedRoomId && rooms && rooms.length > 0) {
                setSelectedRoomId(rooms[0].id);
            }
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    }, [selectedChemical, selectedRoomId]);

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

    // --- RECOVERY ANALYTICS ---
    const filteredDistLogsByTime = useMemo(() => {
        if (distDateFilter === 'all') return distLogs;
        if (distDateFilter === 'specific') return distLogs.filter(log => log.date.startsWith(specificMonth));
        const now = new Date(); const threshold = new Date();
        if (distDateFilter === 'week') threshold.setDate(now.getDate() - 7);
        if (distDateFilter === 'month') threshold.setMonth(now.getMonth() - 1);
        return distLogs.filter(log => new Date(log.date) >= threshold);
    }, [distLogs, distDateFilter, specificMonth]);

    // NEW: Recovery Statistics scoped to SELECTED CHEMICAL only
    const recoveryStats = useMemo(() => {
        const scopedLogs = filteredDistLogsByTime.filter(log => log.chemicalName === selectedChemical);
        const totalIn = scopedLogs.reduce((acc, log) => acc + log.inputAmount, 0);
        const totalOut = scopedLogs.reduce((acc, log) => acc + log.outputAmount, 0);
        const avgYield = scopedLogs.length > 0 ? (totalOut / totalIn) * 100 : 0;
        const pricePerLiter = selectedChemical ? (chemicalPrices[selectedChemical] || 0) : 0;
        const costSaved = (totalOut / 1000) * pricePerLiter; // Assuming outputAmount is in mL
        return { totalIn, totalOut, avgYield, count: scopedLogs.length, pricePerLiter, costSaved };
    }, [filteredDistLogsByTime, selectedChemical, chemicalPrices]);

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

    const handleBatchResolve = async (targets: FlattenedNotOkTask[]) => {
        setIsResolving(true);
        try {
            const historyEntries = targets.map(t => ({
                testerName: t.originalDoc.testerName, 
                requestId: t.originalDoc.requestId, 
                sampleName: String(getTaskValue(t.task, 'Sample Name') || 'N/A'),
                description: String(getTaskValue(t.task, 'Description') || 'N/A'), 
                assignedDate: t.originalDoc.assignedDate, 
                resolvedDate: new Date().toISOString().split('T')[0],
                daysToResolve: getDaysDiff(t.originalDoc.assignedDate), 
                failureReason: t.task.notOkReason || 'N/A', 
                category: t.originalDoc.category
            }));
            
            await logResolutionEntries(historyEntries);
            
            const docGroups: Record<string, { originalDoc: AssignedTask, items: FlattenedNotOkTask[] }> = {};
            targets.forEach(t => {
                if (!docGroups[t.docId]) docGroups[t.docId] = { originalDoc: t.originalDoc, items: [] };
                docGroups[t.docId].items.push(t);
            });

            for (const docId in docGroups) {
                const group = docGroups[docId];
                const indicesToUpdate = group.items.map(it => it.taskIndex);
                const updatedTasks = group.originalDoc.tasks.map((task, idx) => 
                    indicesToUpdate.includes(idx) ? { ...task, status: TaskStatus.Done, plannerNote: "[RESOLVED]" } : task
                );
                await updateAssignedTask(docId, { tasks: updatedTasks });
            }

            setNotification({ message: "Mission resolved successfully (Done)." }); 
            fetchData(); 
            onResolve();
        } catch (e) { 
            console.error(e);
            setNotification({ message: "Resolution failed.", isError: true }); 
        } finally { 
            setIsResolving(false);
            setConfirmModal({ isOpen: false, targetItems: null, title: '', description: '' }); 
        }
    };

    const handleSaveDistLog = async (log: Omit<DistillationLog, 'id' | 'createdAt'>, id?: string) => {
        try { 
            if (id) { await updateDistillationLog(id, log); setNotification({ message: "Record updated." }); } 
            else { await addDistillationLog(log); setNotification({ message: "New batch logged." }); }
            setIsDistModalOpen(false); setEditTarget(null); fetchData(); 
        } catch (e) { setNotification({ message: "Action failed", isError: true }); }
    };

    const handleSavePrices = async (prices: Record<string, number>) => {
        try {
            await saveChemicalPrices(prices);
            setNotification({ message: "Chemical prices updated." });
            setIsPriceModalOpen(false);
            fetchData();
        } catch (e) {
            setNotification({ message: "Failed to save prices", isError: true });
        }
    };

    const handleEditStart = (log: DistillationLog) => { setEditTarget(log); setIsDistModalOpen(true); };
    const handleDeleteDist = async () => {
        if (!distDeleteConfirm?.id) return;
        try { await deleteDistillationLog(distDeleteConfirm.id); setNotification({ message: "Record removed." }); setDistDeleteConfirm(null); fetchData(); } catch (e) { setNotification({ message: "Failed to delete", isError: true }); }
    };

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

            // 4. Environment Logs Sheet
            const envData = envLogs.map(log => ({
                'Timestamp': new Date(log.timestamp).toLocaleString(),
                'Room': log.roomName,
                'Temperature (°C)': log.temperature,
                'Humidity (%)': log.humidity,
                'Recorder': log.recorderName,
                'Note': log.note
            }));
            const wsEnv = XLSX.utils.json_to_sheet(envData);
            XLSX.utils.book_append_sheet(wb, wsEnv, "Environment Logs");

            XLSX.writeFile(wb, `Intelligence_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
            setNotification({ message: "Master Report Downloaded Successfully" });
        } catch (error) {
            console.error(error);
            setNotification({ message: "Export Failed", isError: true });
        }
    };

    // ENVIRONMENT HANDLERS
    const handleSaveRoom = async (room: Omit<LabRoom, 'id'>, id?: string) => {
        try {
            if (id) { await updateLabRoom(id, room); setNotification({ message: "Room config updated." }); }
            else { await addLabRoom(room); setNotification({ message: "New room added." }); }
            setIsRoomModalOpen(false); setRoomEditTarget(null); fetchData();
        } catch (e) { setNotification({ message: "Action failed", isError: true }); }
    };

    const handleDeleteRoom = async (id: string) => {
        try { await deleteLabRoom(id); setNotification({ message: "Room deleted." }); setSelectedRoomId(null); fetchData(); } 
        catch (e) { setNotification({ message: "Failed to delete", isError: true }); }
    };

    const handleSaveEnvLog = async (log: Omit<EnvironmentLog, 'id'>, id?: string) => {
        try {
            if (id) {
                 await deleteEnvironmentLog(id);
            }
            await addEnvironmentLog(log);
            
            setNotification({ message: "Reading logged." });
            setIsEnvLogModalOpen(false); setEnvEditTarget(null); fetchData();
        } catch (e) { setNotification({ message: "Action failed", isError: true }); }
    };

    const handleDeleteEnvLog = async (id: string) => {
        try { await deleteEnvironmentLog(id); setNotification({ message: "Reading deleted." }); fetchData(); } 
        catch (e) { setNotification({ message: "Failed to delete", isError: true }); }
    };

    const filteredEnvLogs = useMemo(() => {
        if (!selectedRoomId) return [];
        return envLogs.filter(l => l.roomId === selectedRoomId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [envLogs, selectedRoomId]);

    const chartData = useMemo(() => {
        const dataMap: Record<string, any> = {};
        envLogs.forEach(log => {
            const key = log.timestamp;
            if (!dataMap[key]) dataMap[key] = { timestamp: key };
            const room = labRooms.find(r => r.id === log.roomId);
            if (room) {
                dataMap[key][`${room.name}_temp`] = log.temperature;
                dataMap[key][`${room.name}_hum`] = log.humidity;
            }
        });
        return Object.values(dataMap).sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [envLogs, labRooms]);

    const currentRoom = useMemo(() => labRooms.find(r => r.id === selectedRoomId), [labRooms, selectedRoomId]);

    const roomAverages = useMemo(() => {
        return labRooms.map(room => {
            const roomLogs = envLogs.filter(l => l.roomId === room.id);
            if (roomLogs.length === 0) return { ...room, avgTemp: null, avgHum: null, latestTemp: null, latestHum: null, lastUpdated: null };
            
            const sumTemp = roomLogs.reduce((acc, l) => acc + l.temperature, 0);
            const sumHum = roomLogs.reduce((acc, l) => acc + l.humidity, 0);
            
            const sorted = [...roomLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            const latest = sorted[0];

            return {
                ...room,
                avgTemp: (sumTemp / roomLogs.length).toFixed(1),
                avgHum: (sumHum / roomLogs.length).toFixed(1),
                latestTemp: latest.temperature,
                latestHum: latest.humidity,
                lastUpdated: latest.timestamp
            };
        });
    }, [labRooms, envLogs]);

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

            {/* CONFIRM RESOLVE MODAL */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[220] p-4 animate-fade-in" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20 p-10 text-center space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-[2rem] flex items-center justify-center mx-auto text-emerald-600 shadow-inner">
                            <CheckCircleIcon className="h-10 w-10" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter">Confirm Resolution</h3>
                            <p className="text-base-500 mt-4 text-[15px] font-bold leading-relaxed px-2">
                                Are you sure you want to resolve <span className="text-emerald-600">"{confirmModal.description}"</span>? 
                                <br/>Status will be set to <span className="font-black text-slate-800">DONE</span>.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 pt-4">
                            <button 
                                onClick={() => handleBatchResolve(confirmModal.targetItems || [])} 
                                disabled={isResolving}
                                className="w-full py-5 bg-emerald-600 border-emerald-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-emerald-700 transition-all disabled:opacity-50"
                            >
                                {isResolving ? 'Resolving Mission...' : 'Resolve Now'}
                            </button>
                            <button 
                                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
                                className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest"
                            >
                                Keep Active
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRM DELETE DISTILLATION MODAL */}
            {distDeleteConfirm && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-md flex items-center justify-center z-[220] p-4 animate-fade-in" onClick={() => setDistDeleteConfirm(null)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20 p-10 text-center space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 rounded-[2rem] flex items-center justify-center mx-auto text-rose-600 shadow-inner">
                            <TrashIcon className="h-10 w-10" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter">Wipe Record?</h3>
                            <p className="text-base-500 mt-4 text-[15px] font-bold leading-relaxed px-2">
                                Permanent removal of <span className="text-rose-600">"{distDeleteConfirm.chemicalName}"</span> log on <span className="font-bold">{distDeleteConfirm.date}</span>.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 pt-4">
                            <button onClick={handleDeleteDist} className="w-full py-5 bg-rose-600 border-rose-800 text-white font-black rounded-2xl shadow-xl uppercase text-[11px] tracking-widest border-b-4 hover:bg-rose-700 transition-all">Destroy Forever</button>
                            <button onClick={() => setDistDeleteConfirm(null)} className="w-full py-3 text-[10px] font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Abort</button>
                        </div>
                    </div>
                </div>
            )}

            <DistillationFormModal isOpen={isDistModalOpen} onClose={() => { setIsDistModalOpen(false); setEditTarget(null); }} onSave={handleSaveDistLog} testers={testers} defaultChemical={selectedChemical} editTarget={editTarget} allChemicals={allChemicals} />
            <ChemicalPriceModal isOpen={isPriceModalOpen} onClose={() => setIsPriceModalOpen(false)} onSave={handleSavePrices} currentPrices={chemicalPrices} chemicals={allChemicals} />

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
                        <button onClick={() => setActiveSubTab('environment')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.4rem] text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'environment' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}><ThermometerIcon className="h-5 w-5" /> Environment</button>
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
                        {activeSubTab === 'environment' && (
                            <button onClick={() => setIsEnvLogModalOpen(true)} disabled={!selectedRoomId} className="flex items-center gap-3 px-8 py-4 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all border-b-4 border-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"><PlusIcon className="h-5 w-5" /> Log Reading</button>
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
                                                        <button onClick={() => setConfirmModal({ isOpen: true, targetItems: reqGroup.allTasks, title: 'Batch Resolve?', description: `Request Group ${reqGroup.requestId}` })} className="px-6 py-2.5 bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest active:scale-95 transition-transform">Resolve Group</button>
                                                    </div>
                                                    <div className="space-y-1.5 pl-8">
                                                        {Object.entries(reqGroup.tasksByDescription).map(([key, items]) => (
                                                            items.map((it, idx) => (
                                                                <div key={idx} className="flex items-center gap-4 bg-white p-4 rounded-[1.5rem] border-2 border-slate-100 hover:border-indigo-100 transition-all shadow-sm">
                                                                    <div className="flex-grow min-w-0">
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className="text-[16px] font-black text-slate-900 uppercase truncate block tracking-tighter">
                                                                                {String(getTaskValue(it.task, 'Sample Name') || 'N/A')}
                                                                            </span>
                                                                            <span className="text-[10px] font-bold text-indigo-600 uppercase">
                                                                                {String(getTaskValue(it.task, 'Description') || '-')}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 mt-0.5">
                                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">
                                                                                {String(getTaskValue(it.task, 'Variant') || '-')}
                                                                            </span>
                                                                            <span className="text-[9px] font-bold text-rose-600">
                                                                                ERR: "{it.task.notOkReason}"
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <button onClick={() => setConfirmModal({ isOpen: true, targetItems: [it], title: 'Resolve Mission?', description: String(getTaskValue(it.task, 'Sample Name')) })} className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-md active:scale-90"><CheckCircleIcon className="h-6 w-6"/></button>
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

                {activeSubTab === 'distillation' && (
                    <div className="h-full flex flex-col gap-6 animate-fade-in overflow-hidden">
                        {/* NEW: Chemical Selection Bar for scoped stats */}
                        <div className="flex gap-2 items-center justify-between p-2 bg-slate-100 dark:bg-base-900 rounded-[2rem] border border-slate-200 dark:border-base-800 shadow-inner overflow-x-auto no-scrollbar shrink-0">
                            <div className="flex gap-2 items-center">
                                {allChemicals.map(chem => (
                                    <button 
                                        key={chem}
                                        onClick={() => setSelectedChemical(chem)}
                                        className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all shrink-0 ${selectedChemical === chem ? 'bg-white dark:bg-base-800 text-indigo-600 shadow-md ring-2 ring-indigo-500/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                    >
                                        {chem}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => setIsPriceModalOpen(true)}
                                className="px-6 py-2.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full text-[11px] font-black uppercase tracking-widest hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all shrink-0 flex items-center gap-2"
                            >
                                <CurrencyDollarIcon className="w-4 h-4" /> Set Prices
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
                            <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden flex flex-col justify-center border-b-8 border-indigo-800">
                                <div className="absolute top-0 right-0 p-6 opacity-20"><BeakerIcon className="w-24 h-24" /></div>
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-200 mb-2">Resource Input ({selectedChemical})</span>
                                <span className="text-5xl font-black tracking-tighter italic">{recoveryStats.totalIn.toLocaleString()} <span className="text-sm font-bold opacity-60">ML</span></span>
                            </div>
                            <div className="bg-cyan-600 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden flex flex-col justify-center border-b-8 border-cyan-800">
                                <div className="absolute top-0 right-0 p-6 opacity-20"><ArrowUpIcon className="w-24 h-24" /></div>
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-200 mb-2">Purified Output ({selectedChemical})</span>
                                <span className="text-5xl font-black tracking-tighter italic">{recoveryStats.totalOut.toLocaleString()} <span className="text-sm font-bold opacity-60">ML</span></span>
                            </div>
                            <div className={`rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden flex flex-col justify-center border-b-8 ${recoveryStats.avgYield >= 95 ? 'bg-emerald-600 border-emerald-800' : 'bg-amber-500 border-amber-700'}`}>
                                <div className="absolute top-0 right-0 p-6 opacity-20"><RefreshIcon className="w-24 h-24" /></div>
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50 mb-2">Recovery Efficiency ({selectedChemical})</span>
                                <span className="text-5xl font-black tracking-tighter italic">{recoveryStats.avgYield.toFixed(1)} <span className="text-sm font-bold opacity-60">%</span></span>
                            </div>
                            <div className="bg-emerald-500 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden flex flex-col justify-center border-b-8 border-emerald-700">
                                <div className="absolute top-0 right-0 p-6 opacity-20"><CurrencyDollarIcon className="w-24 h-24" /></div>
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-200 mb-2">Cost Saved ({selectedChemical})</span>
                                <span className="text-5xl font-black tracking-tighter italic">฿{recoveryStats.costSaved.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                        </div>

                        <div className="flex-grow bg-white dark:bg-base-900 rounded-[3rem] border-2 border-slate-100 dark:border-base-800 shadow-xl overflow-hidden flex flex-col">
                            <div className="px-10 py-6 border-b border-slate-100 dark:border-base-800 bg-slate-50/50 dark:bg-base-955 flex justify-between items-center shrink-0">
                                <h3 className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-400 flex items-center gap-3 italic"><DatabaseIcon className="h-5 w-5" /> Chemical Recovery Ledger</h3>
                                <div className="flex items-center gap-4">
                                    <span className="px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest">{filteredDistLogsByTime.length} Batches Processed</span>
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto custom-scrollbar">
                                <table className="min-w-full text-left">
                                    <thead className="sticky top-0 bg-white/95 dark:bg-base-900/95 backdrop-blur-md text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-base-800 z-10">
                                        <tr>
                                            <th className="px-10 py-5">Assigned Date</th>
                                            <th className="px-10 py-5">Species</th>
                                            <th className="px-10 py-5">Input/Output</th>
                                            <th className="px-10 py-5">Yield</th>
                                            <th className="px-10 py-5">Personnel</th>
                                            <th className="px-10 py-5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-base-800">
                                        {filteredDistLogsByTime.length > 0 ? filteredDistLogsByTime.map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-base-800 transition-all group">
                                                <td className="px-10 py-5"><span className="text-[13px] font-black text-slate-400">{log.date}</span></td>
                                                <td className="px-10 py-5"><span className="px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl text-[12px] font-black uppercase tracking-tighter border border-indigo-100 dark:border-indigo-800">{log.chemicalName}</span></td>
                                                <td className="px-10 py-5">
                                                    <div className="flex flex-col">
                                                        <span className="text-[14px] font-bold text-slate-800 dark:text-base-100 italic">In: {log.inputAmount} ml</span>
                                                        <span className="text-[14px] font-bold text-indigo-600 dark:text-indigo-400 italic">Out: {log.outputAmount} ml</span>
                                                    </div>
                                                </td>
                                                <td className="px-10 py-5"><span className={`text-xl font-black tracking-tighter ${log.yieldPercent >= 95 ? 'text-emerald-600' : 'text-amber-500'}`}>{log.yieldPercent}%</span></td>
                                                <td className="px-10 py-5"><span className="text-[12px] font-black text-slate-500 uppercase">{log.recorderName}</span></td>
                                                <td className="px-10 py-5 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => handleEditStart(log)} className="p-3 bg-white dark:bg-base-800 border border-slate-100 dark:border-base-700 rounded-xl text-slate-300 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm"><PencilIcon className="h-5 w-5" /></button>
                                                        <button onClick={() => setDistDeleteConfirm(log)} className="p-3 bg-white dark:bg-base-800 border border-slate-100 dark:border-base-700 rounded-xl text-slate-300 hover:text-rose-600 hover:border-rose-100 transition-all shadow-sm"><TrashIcon className="h-5 w-5" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={6} className="py-32 text-center opacity-10 flex flex-col items-center"><BeakerIcon className="h-24 w-24 mb-4" /><span className="text-2xl font-black uppercase tracking-[0.5em]">No Recovery Cycles Logged</span></td></tr>
                                        )}
                                    </tbody>
                                </table>
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

                {activeSubTab === 'environment' && (
                    <div className="h-full flex flex-col gap-6 animate-fade-in overflow-hidden">
                        {/* Real-time Averages & Room Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 shrink-0 overflow-x-auto pb-2 px-1">
                            {roomAverages.map(room => (
                                <div 
                                    key={room.id}
                                    onClick={() => setSelectedRoomId(room.id)}
                                    className={`relative overflow-hidden rounded-[2rem] p-5 cursor-pointer transition-all duration-300 border-2 ${selectedRoomId === room.id ? 'border-emerald-500 shadow-[0_8px_30px_-5px_rgba(16,185,129,0.3)] bg-white dark:bg-base-900 scale-[1.02] z-10' : 'border-slate-200 dark:border-base-800 bg-white dark:bg-base-900 shadow-sm hover:shadow-md hover:border-emerald-300'}`}
                                >
                                    {selectedRoomId === room.id && <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/5 to-transparent blur-xl z-0"></div>}
                                    
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-5">
                                            <h4 className={`text-sm font-black uppercase tracking-widest ${selectedRoomId === room.id ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>{room.name}</h4>
                                            {selectedRoomId === room.id && (
                                                <div className="flex gap-1">
                                                    <div onClick={(e) => { e.stopPropagation(); setRoomEditTarget(room); setIsRoomModalOpen(true); }} className="p-1.5 bg-slate-100 dark:bg-base-800 hover:bg-slate-200 rounded-full cursor-pointer text-slate-400 hover:text-indigo-600 transition-colors"><PencilIcon className="h-3 w-3" /></div>
                                                    <DoubleConfirmDeleteButton 
                                                        onDelete={() => handleDeleteRoom(room.id)} 
                                                        baseClass="p-1.5 bg-slate-100 dark:bg-base-800 hover:bg-rose-100 text-slate-400 hover:text-rose-500 rounded-full cursor-pointer flex items-center justify-center transition-colors" 
                                                        confirmClass="bg-rose-500 text-white hover:bg-rose-600 hover:text-white"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-rose-50/50 dark:bg-rose-900/10 rounded-2xl p-3 border border-rose-100/50 dark:border-rose-800/30 flex flex-col items-center justify-center text-center">
                                                <span className="text-[9px] font-black text-rose-400 uppercase tracking-[0.2em] mb-1 flex items-center gap-1"><ThermometerIcon className="h-3 w-3" /> Avg Temp</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className={`text-2xl font-black tracking-tighter ${room.avgTemp ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300'}`}>{room.avgTemp || '--'}</span>
                                                    <span className="text-xs font-bold text-slate-400">°C</span>
                                                </div>
                                            </div>
                                            <div className="bg-cyan-50/50 dark:bg-cyan-900/10 rounded-2xl p-3 border border-cyan-100/50 dark:border-cyan-800/30 flex flex-col items-center justify-center text-center">
                                                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em] mb-1 flex items-center gap-1"><BeakerIcon className="h-3 w-3" /> Avg Hum</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className={`text-2xl font-black tracking-tighter ${room.avgHum ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-300'}`}>{room.avgHum || '--'}</span>
                                                    <span className="text-xs font-bold text-slate-400">%</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-base-800 flex justify-between items-center">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                {room.lastUpdated ? `Last: ${new Date(room.lastUpdated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'No data'}
                                            </span>
                                            <span className="text-[9px] font-black text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md uppercase tracking-widest">
                                                {room.monitorTimeSlots?.length || 0} Slots
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            
                            {/* Add Room Button */}
                            <div 
                                onClick={() => { setRoomEditTarget(null); setIsRoomModalOpen(true); }}
                                className="rounded-[2rem] p-5 cursor-pointer transition-all duration-300 border-2 border-dashed border-slate-200 dark:border-base-700 bg-white/50 dark:bg-base-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 flex flex-col items-center justify-center min-h-[160px]"
                            >
                                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-base-800 shadow-sm flex items-center justify-center text-emerald-500 mb-2">
                                    <PlusIcon className="h-5 w-5" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Add New Room</span>
                            </div>
                        </div>

                        {/* Charts Section - ALWAYS VISIBLE NOW (Combined) */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0 h-[300px]">
                            <div className="bg-white dark:bg-base-900 rounded-[2.5rem] p-6 border-2 border-slate-100 dark:border-base-800 shadow-xl flex flex-col relative overflow-hidden">
                                <div className="flex justify-between items-center mb-4 px-2">
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-400 flex items-center gap-2"><ThermometerIcon className="h-4 w-4" /> Temperature Overview (°C)</h3>
                                    <span className="text-[9px] font-black bg-rose-50 text-rose-600 px-2 py-1 rounded-lg uppercase">Target: 20-25°C</span>
                                </div>
                                <div className="flex-grow w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                            <XAxis dataKey="timestamp" tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'})} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                            <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                            <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} labelFormatter={(t) => new Date(t).toLocaleString()} />
                                            <ReferenceLine y={25} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Max (25°C)', position: 'insideTopRight', fill: '#f43f5e', fontSize: 10, fontWeight: 'bold' }} />
                                            <ReferenceLine y={20} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Min (20°C)', position: 'insideBottomRight', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} />
                                            {labRooms.map((room, i) => (
                                                <Line 
                                                    key={room.id}
                                                    type="monotone" 
                                                    dataKey={`${room.name}_temp`}
                                                    name={room.name}
                                                    stroke={`hsl(${i * 60}, 70%, 50%)`} 
                                                    strokeWidth={3} 
                                                    dot={{r: 3}} 
                                                    activeDot={{r: 6}} 
                                                    connectNulls
                                                />
                                            ))}
                                            <Legend />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-base-900 rounded-[2.5rem] p-6 border-2 border-slate-100 dark:border-base-800 shadow-xl flex flex-col relative overflow-hidden">
                                <div className="flex justify-between items-center mb-4 px-2">
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 flex items-center gap-2"><BeakerIcon className="h-4 w-4" /> Humidity Overview (%)</h3>
                                    <span className="text-[9px] font-black bg-cyan-50 text-cyan-600 px-2 py-1 rounded-lg uppercase">Target: 40-60%</span>
                                </div>
                                <div className="flex-grow w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                            <XAxis dataKey="timestamp" tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'})} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                            <YAxis domain={[0, 100]} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                            <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} labelFormatter={(t) => new Date(t).toLocaleString()} />
                                            <ReferenceLine y={60} stroke="#06b6d4" strokeDasharray="3 3" label={{ value: 'Max (60%)', position: 'insideTopRight', fill: '#06b6d4', fontSize: 10, fontWeight: 'bold' }} />
                                            <ReferenceLine y={40} stroke="#06b6d4" strokeDasharray="3 3" label={{ value: 'Min (40%)', position: 'insideBottomRight', fill: '#06b6d4', fontSize: 10, fontWeight: 'bold' }} />
                                            {labRooms.map((room, i) => (
                                                <Line 
                                                    key={room.id}
                                                    type="monotone" 
                                                    dataKey={`${room.name}_hum`}
                                                    name={room.name}
                                                    stroke={`hsl(${i * 60 + 180}, 70%, 50%)`} 
                                                    strokeWidth={3} 
                                                    dot={{r: 3}} 
                                                    activeDot={{r: 6}} 
                                                    connectNulls
                                                />
                                            ))}
                                            <Legend />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {selectedRoomId && currentRoom ? (
                            <>
                                {/* Data Table */}
                                <div className="flex-grow bg-white dark:bg-base-900 rounded-[3rem] border-2 border-slate-100 dark:border-base-800 shadow-xl overflow-hidden flex flex-col">
                                    <div className="px-10 py-6 border-b border-slate-100 dark:border-base-800 bg-slate-50/50 dark:bg-base-955 flex justify-between items-center shrink-0">
                                        <div className="flex flex-col">
                                            <h3 className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-400 flex items-center gap-3 italic"><DatabaseIcon className="h-5 w-5" /> Environment Log: {currentRoom.name}</h3>
                                            <span className="text-[10px] font-bold text-slate-400 ml-8 mt-1">Schedule: {currentRoom.monitorTimeSlots?.join(', ') || 'None'}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest">{filteredEnvLogs.length} Readings</span>
                                        </div>
                                    </div>
                                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                                        <table className="min-w-full text-left">
                                            <thead className="sticky top-0 bg-white/95 dark:bg-base-900/95 backdrop-blur-md text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-base-800 z-10">
                                                <tr>
                                                    <th className="px-10 py-5">Timestamp</th>
                                                    <th className="px-10 py-5">Temp (°C)</th>
                                                    <th className="px-10 py-5">Humidity (%)</th>
                                                    <th className="px-10 py-5">Recorder</th>
                                                    <th className="px-10 py-5">Note</th>
                                                    <th className="px-10 py-5 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-base-800">
                                                {filteredEnvLogs.length > 0 ? filteredEnvLogs.map((log) => (
                                                    <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-base-800 transition-all group">
                                                        <td className="px-10 py-5"><span className="text-[13px] font-black text-slate-400">{new Date(log.timestamp).toLocaleString()}</span></td>
                                                        <td className="px-10 py-5"><span className="text-[14px] font-bold text-rose-500">{log.temperature}°C</span></td>
                                                        <td className="px-10 py-5"><span className="text-[14px] font-bold text-cyan-500">{log.humidity}%</span></td>
                                                        <td className="px-10 py-5"><span className="text-[12px] font-black text-slate-500 uppercase">{log.recorderName}</span></td>
                                                        <td className="px-10 py-5"><span className="text-[12px] text-slate-400 italic">{log.note || '-'}</span></td>
                                                        <td className="px-10 py-5 text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={() => { setEnvEditTarget(log); setIsEnvLogModalOpen(true); }} className="p-3 bg-white dark:bg-base-800 border border-slate-100 dark:border-base-700 rounded-xl text-slate-300 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm"><PencilIcon className="h-5 w-5" /></button>
                                                                <DoubleConfirmDeleteButton 
                                                                    onDelete={() => handleDeleteEnvLog(log.id)} 
                                                                    baseClass="p-3 bg-white dark:bg-base-800 border border-slate-100 dark:border-base-700 rounded-xl text-slate-300 hover:text-rose-600 hover:border-rose-100 transition-all shadow-sm flex items-center justify-center" 
                                                                    confirmClass="bg-rose-500 text-white border-rose-500 hover:bg-rose-600 hover:border-rose-600 hover:text-white"
                                                                    iconClass="h-5 w-5"
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan={6} className="py-32 text-center opacity-10 flex flex-col items-center"><ThermometerIcon className="h-24 w-24 mb-4" /><span className="text-2xl font-black uppercase tracking-[0.5em]">No Readings Logged</span></td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center opacity-20">
                                <ThermometerIcon className="h-32 w-32 mb-6 text-slate-400" />
                                <span className="text-2xl font-black uppercase tracking-[0.5em] text-slate-400">Select or Create a Room</span>
                            </div>
                        )}
                        
                        <RoomConfigModal isOpen={isRoomModalOpen} onClose={() => setIsRoomModalOpen(false)} onSave={handleSaveRoom} editTarget={roomEditTarget} />
                        <EnvironmentLogModal isOpen={isEnvLogModalOpen} onClose={() => setIsEnvLogModalOpen(false)} onSave={handleSaveEnvLog} testers={testers} roomId={selectedRoomId || ''} roomName={currentRoom?.name || ''} editTarget={envEditTarget} timeSlots={currentRoom?.monitorTimeSlots || []} labRooms={labRooms} />
                    </div>
                )}
            </div>
            <div className="px-10 text-[9px] font-black text-slate-300 text-center uppercase tracking-[1.5em] pb-4 shrink-0 opacity-40 italic">System Logic • Intelligence Master V2.9.9 Active</div>
        </div>
    );
};

export default QualityDashboard;
