
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import type { Tester, AssignedTask, RawTask, ShiftReport, DailySchedule, AssignedPrepareTask, CategorizedTask, AppSettings, HighValueCheck } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, getShiftReport, saveShiftReport, getDailySchedule, getAssignedPrepareTasks, getCategorizedTasks,
} from '../services/dataService';
import { 
    CheckCircleIcon, AlertTriangleIcon, 
    UserGroupIcon, RefreshIcon, 
    BeakerIcon, CalendarIcon,
    SunIcon, MoonIcon, DownloadIcon,
    XCircleIcon, SparklesIcon,
    TrashIcon, ChatAlt2Icon, SpeakerWaveIcon
} from './common/Icons';

declare const XLSX: any;

const ALL_PERSONNEL_ID = 'unified_view_all';

interface SampleDetail {
    name: string;
    qty: string;
    detail: string;
    status: string;
    reason?: string;
    isManual: boolean;
    isPrep?: boolean;
    isOverPlan?: boolean;
}

interface SummaryItemStats {
    desc: string; 
    total: number; 
    done: number; 
    failed: number; 
    returned: number;
    priorityStatus: 'lsp' | 'sprint' | 'urgent' | 'pocat' | 'normal';
    isManual: boolean;
    isPrepGroup?: boolean;
    hasOverPlanItems?: boolean;
    samples: SampleDetail[];
}

interface PersonStats {
    id: string;
    name: string;
    role: 'ANLST' | 'ASST';
    pendingTasks: number;
    summary: Record<string, SummaryItemStats>;
}

interface DashboardTabProps {
    testers: Tester[];
    selectedDate: string;
    onDateChange: (date: string) => void;
    selectedShift: 'day' | 'night';
    onShiftChange: (shift: 'day' | 'night') => void;
    appSettings?: AppSettings | null;
}

const getTaskValue = (task: RawTask, header: string): string | number => {
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

const getPriorityStatus = (task: RawTask, category: TaskCategory): 'lsp' | 'sprint' | 'urgent' | 'pocat' | 'normal' => {
    const allContent = Object.values(task).map(v => String(v).toLowerCase()).join(' ');
    const cat = String(category).toLowerCase();
    if (allContent.includes('lsp')) return 'lsp';
    if (allContent.includes('sprint')) return 'sprint';
    if (cat === 'urgent' || allContent.includes('urgent')) return 'urgent';
    if (cat === 'pocat' || allContent.includes('po cat')) return 'pocat';
    return 'normal';
};

const ReportEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    report: ShiftReport | null;
    onSave: (report: ShiftReport) => void;
    date: string;
    shift: 'day' | 'night';
    appSettings: AppSettings | null;
}> = ({ isOpen, onClose, report, onSave, date, shift, appSettings }) => {
    const [wasteLevel, setWasteLevel] = useState<'low' | 'medium' | 'high'>('low');
    const [note, setNote] = useState('');
    const [highValueChecks, setHighValueChecks] = useState<HighValueCheck[]>([]);

    useEffect(() => {
        if (isOpen) {
            setWasteLevel(report?.wasteLevel || 'low');
            setNote(report?.infrastructureNote || '');
            
            // Prepare initial highValueChecks
            const activeAssets = appSettings?.highValueAssets?.filter(a => a.isActive) || [];
            const existingChecks = report?.highValueChecks || [];
            
            const initialChecks = activeAssets.map(asset => {
                const existing = existingChecks.find(c => c.assetId === asset.id);
                return {
                    assetId: asset.id,
                    assetName: asset.name,
                    assetCode: asset.code,
                    cabinet: asset.cabinet,
                    isPresent: existing ? existing.isPresent : true,
                    status: existing ? existing.status : 'normal',
                    note: existing ? existing.note : '',
                    checkedAt: existing ? existing.checkedAt : new Date().toISOString(),
                    trackQuantity: asset.trackQuantity || false,
                    initialQuantity: asset.initialQuantity || 1,
                    currentQuantity: existing && existing.currentQuantity !== undefined ? existing.currentQuantity : (asset.initialQuantity || 1),
                    isConsumable: asset.isConsumable || false
                };
            });
            setHighValueChecks(initialChecks);
        }
    }, [isOpen, report, appSettings]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[110] animate-fade-in p-2 md:p-4" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-w-[96vw] lg:max-w-7xl h-[95vh] lg:h-[92vh] overflow-hidden flex flex-col border border-white/20 transition-all duration-300" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-8 py-6 border-b border-base-100 dark:border-base-800 flex justify-between items-center bg-base-50/50 dark:bg-base-950/40 shrink-0">
                    <div className="flex items-center gap-4">
                        <span className="p-3 bg-primary-50 dark:bg-primary-950/30 text-primary-600 rounded-2xl">
                            <BeakerIcon className="h-7 w-7" />
                        </span>
                        <div>
                            <h3 className="text-2xl md:text-3xl font-black tracking-tighter text-base-955 dark:text-white">Lab Shift Handover & Verification</h3>
                            <p className="text-xs font-bold text-base-400 uppercase tracking-widest mt-1">
                                {date} <span className="mx-2 text-base-200">|</span> <span className="text-primary-600">{shift.toUpperCase()} SHIFT</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-base-200 dark:hover:bg-base-700 rounded-full transition-colors">
                        <XCircleIcon className="h-8 w-8 text-base-400"/>
                    </button>
                </div>
                
                {/* Scrollable Content Body */}
                <div className="p-6 md:p-8 overflow-y-auto flex-1 no-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start h-full">
                        
                        {/* LEFT COLUMN: Zone 1 (Waste) & Zone 3 (Notes) */}
                        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-0">
                            
                            {/* Zone 1: Lab Waste Status */}
                            <div className="bg-base-50/30 dark:bg-base-950/20 p-6 rounded-[2rem] border border-base-100 dark:border-base-800 space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="p-2 bg-rose-50 dark:bg-rose-950/30 text-rose-600 rounded-xl">
                                        <TrashIcon className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-base-400">Zone 1: Lab Waste Status</h4>
                                        <p className="text-[11px] text-base-400 mt-0.5">ระบุปริมาณขยะเคมีและขยะชีวภาพประจำกะ</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-3">
                                    {(['low', 'medium', 'high'] as const).map(lv => (
                                        <button 
                                            key={lv} 
                                            onClick={() => setWasteLevel(lv)} 
                                            className={`relative group px-6 py-4 rounded-2xl border-2 transition-all duration-300 text-left flex items-center justify-between ${
                                                wasteLevel === lv 
                                                    ? lv === 'low' 
                                                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/10' 
                                                        : lv === 'medium' 
                                                            ? 'bg-amber-500 border-amber-300 text-white shadow-lg shadow-amber-500/10' 
                                                            : 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/10' 
                                                    : 'bg-white dark:bg-base-800 border-base-100 dark:border-base-700 text-base-500 hover:border-base-300 hover:bg-base-50/50'
                                            }`}
                                        >
                                            <div className="flex flex-col">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${wasteLevel === lv ? 'text-white/60' : 'text-base-400'}`}>
                                                    Level Status
                                                </span>
                                                <span className="text-lg font-black uppercase tracking-tight mt-0.5">
                                                    {lv === 'low' ? 'Low / Safe' : lv === 'medium' ? 'Medium / Full' : 'High / Overflow'}
                                                </span>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                                wasteLevel === lv ? 'bg-white border-transparent' : 'border-base-200 bg-transparent'
                                            }`}>
                                                {wasteLevel === lv && (
                                                    <CheckCircleIcon className={`h-4 w-4 ${
                                                        lv === 'low' ? 'text-emerald-600' : lv === 'medium' ? 'text-amber-500' : 'text-red-600'
                                                    }`} />
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Zone 3: Operational Notes */}
                            <div className="bg-base-50/30 dark:bg-base-950/20 p-6 rounded-[2rem] border border-base-100 dark:border-base-800 space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="p-2 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 rounded-xl">
                                        <ChatAlt2Icon className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-base-400">Zone 3: Handover Notes</h4>
                                        <p className="text-[11px] text-base-400 mt-0.5">บันทึกเหตุการณ์สำคัญ ข้อควรระวัง หรือสิ่งที่ต้องฝากกะถัดไป</p>
                                    </div>
                                </div>
                                
                                <textarea 
                                    value={note} 
                                    onChange={e => setNote(e.target.value)} 
                                    placeholder="เขียนบันทึกส่งมอบกะ เช่น ปัญหาเครื่องมือขัดข้อง สารเคมีหมด หรือแจ้งเตือนความสะอาดพิเศษ..." 
                                    rows={4} 
                                    className="w-full p-4 bg-white dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white resize-none transition-all placeholder:text-base-400"
                                />
                            </div>
                        </div>
                        
                        {/* RIGHT COLUMN: Zone 2 (High Value Assets list in dual column grid) */}
                        <div className="lg:col-span-8 space-y-6 lg:border-l lg:border-base-100 lg:dark:border-base-800 lg:pl-8 flex flex-col h-full min-h-[50vh]">
                            <div className="flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-2xl">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                        </svg>
                                    </span>
                                    <div>
                                        <h4 className="text-base font-black uppercase tracking-[0.2em] text-base-955 dark:text-white">Zone 2: อุปกรณ์มูลค่าสูง ({highValueChecks.length} รายการ)</h4>
                                        <p className="text-xs text-base-400 mt-0.5">ตรวจนับสิ่งของและตรวจสอบสภาพอุปกรณ์ในตู้พิเศษเพื่อความถูกต้องครบถ้วน</p>
                                    </div>
                                </div>
                            </div>

                            {highValueChecks.length === 0 ? (
                                <div className="p-12 text-center bg-base-50/50 dark:bg-base-800 rounded-[2rem] border-2 border-dashed border-base-100 dark:border-base-700 flex-1 flex flex-col items-center justify-center">
                                    <p className="text-base font-bold text-base-400">ยังไม่มีการตั้งค่าอุปกรณ์มูลค่าสูงในเมนูตั้งค่าระบบ</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto pr-2 flex-1 max-h-[58vh] lg:max-h-[64vh] no-scrollbar">
                                    {highValueChecks.map((check, index) => {
                                        const asset = appSettings?.highValueAssets?.find(a => a.id === check.assetId);
                                        const isQtyMismatched = check.trackQuantity && !check.isConsumable && (check.currentQuantity !== undefined ? check.currentQuantity : (check.initialQuantity || 1)) < (check.initialQuantity || 1);
                                        const isCardAbnormal = !check.isPresent || check.status === 'abnormal' || isQtyMismatched;
                                        return (
                                            <div 
                                                key={check.assetId} 
                                                className={`p-5 rounded-[2rem] border-2 transition-all duration-300 space-y-4 flex flex-col justify-between shadow-sm ${
                                                    isCardAbnormal
                                                        ? 'bg-rose-50/40 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/40 shadow-md shadow-rose-500/5' 
                                                        : 'bg-white dark:bg-base-800 border-base-100 dark:border-base-700 hover:border-base-200 dark:hover:border-base-600'
                                                }`}
                                            >
                                                <div className="flex items-start gap-4">
                                                    {asset?.photo ? (
                                                        <img 
                                                            src={asset.photo} 
                                                            alt={check.assetName} 
                                                            className="w-24 h-24 rounded-2xl object-cover border-2 border-base-100 dark:border-base-700 shrink-0 shadow-md" 
                                                            referrerPolicy="no-referrer" 
                                                        />
                                                    ) : (
                                                        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/20 dark:to-indigo-950/45 text-indigo-600 dark:text-indigo-400 flex flex-col items-center justify-center font-black shrink-0 border border-indigo-150 dark:border-indigo-900/40">
                                                            <span className="text-lg tracking-wider">{check.assetCode}</span>
                                                            <span className="text-[9px] text-indigo-400 uppercase tracking-widest mt-1">NO IMAGE</span>
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-grow">
                                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 block uppercase tracking-widest">
                                                            {check.assetCode}
                                                        </span>
                                                        <h5 className="font-extrabold text-sm md:text-base text-base-900 dark:text-base-50 leading-snug mt-0.5 block break-words" title={check.assetName}>
                                                            {check.assetName}
                                                        </h5>
                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            <span className="inline-block bg-base-100 dark:bg-base-900 px-3 py-1 rounded-full text-xs text-base-500 dark:text-base-400 font-bold border border-base-200/50 dark:border-base-750">
                                                                📍 ตู้เก็บ: {check.cabinet}
                                                            </span>
                                                            {check.trackQuantity && (
                                                                <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                                                    check.isConsumable 
                                                                        ? 'bg-orange-50 dark:bg-orange-950/25 text-orange-600 dark:text-orange-400 border-orange-200/50 dark:border-orange-900/30' 
                                                                        : 'bg-primary-50 dark:bg-primary-950/25 text-primary-600 dark:text-primary-400 border-primary-200/50 dark:border-primary-900/30'
                                                                }`}>
                                                                    {check.isConsumable ? '♻️ สิ้นเปลือง' : '⚖️ นับถ้วนหน้า'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 pt-3 border-t-2 border-base-50 dark:border-base-750">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {/* Storage presence state selector OR Quantity counter */}
                                                        {check.trackQuantity ? (
                                                            <div>
                                                                <span className="text-[10px] font-black text-base-400 dark:text-base-500 uppercase tracking-widest block mb-1 text-center">
                                                                    จำนวน (ตรวจนับ)
                                                                </span>
                                                                <div className="flex items-center justify-between p-1 bg-base-50 dark:bg-base-900 rounded-xl border border-base-150 dark:border-base-700 h-[38px]">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const updated = [...highValueChecks];
                                                                            const current = updated[index].currentQuantity ?? updated[index].initialQuantity ?? 1;
                                                                            const nextQty = Math.max(0, current - 1);
                                                                            updated[index].currentQuantity = nextQty;
                                                                            updated[index].isPresent = nextQty > 0;
                                                                            setHighValueChecks(updated);
                                                                        }}
                                                                        className="w-8 h-8 flex items-center justify-center text-sm font-black text-base-500 hover:bg-base-200 dark:hover:bg-base-800 rounded-lg transition-all"
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <div className="flex items-baseline justify-center gap-0.5 min-w-0 px-1">
                                                                        <span className={`text-sm font-black ${isQtyMismatched ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-base-900 dark:text-white'}`}>
                                                                            {check.currentQuantity ?? check.initialQuantity ?? 1}
                                                                        </span>
                                                                        <span className="text-[10px] text-base-400 font-bold">
                                                                            /{check.initialQuantity ?? 1}
                                                                        </span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const updated = [...highValueChecks];
                                                                            const current = updated[index].currentQuantity ?? updated[index].initialQuantity ?? 1;
                                                                            const nextQty = current + 1;
                                                                            updated[index].currentQuantity = nextQty;
                                                                            updated[index].isPresent = nextQty > 0;
                                                                            setHighValueChecks(updated);
                                                                        }}
                                                                        className="w-8 h-8 flex items-center justify-center text-sm font-black text-base-500 hover:bg-base-200 dark:hover:bg-base-800 rounded-lg transition-all"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <span className="text-[10px] font-black text-base-400 dark:text-base-500 uppercase tracking-widest block mb-1.5 text-center">
                                                                    สถานะจัดเก็บ
                                                                </span>
                                                                <div className="flex p-1 bg-base-50 dark:bg-base-900 rounded-xl border border-base-150 dark:border-base-700">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const updated = [...highValueChecks];
                                                                            updated[index].isPresent = true;
                                                                            setHighValueChecks(updated);
                                                                        }}
                                                                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                                                                            check.isPresent 
                                                                                ? 'bg-emerald-600 text-white shadow-md' 
                                                                                : 'text-base-400 hover:text-base-700 dark:hover:text-base-300'
                                                                        }`}
                                                                    >
                                                                        อยู่ครบ
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const updated = [...highValueChecks];
                                                                            updated[index].isPresent = false;
                                                                            setHighValueChecks(updated);
                                                                        }}
                                                                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                                                                            !check.isPresent 
                                                                                ? 'bg-rose-600 text-white shadow-md' 
                                                                                : 'text-base-400 hover:text-base-700 dark:hover:text-base-300'
                                                                        }`}
                                                                    >
                                                                        ไม่อยู่
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Physical status condition toggles */}
                                                        <div>
                                                            <span className="text-[10px] font-black text-base-400 dark:text-base-500 uppercase tracking-widest block mb-1.5 text-center">
                                                                สภาพอุปกรณ์
                                                            </span>
                                                            <div className="flex p-1 bg-base-50 dark:bg-base-900 rounded-xl border border-base-150 dark:border-base-700">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updated = [...highValueChecks];
                                                                        updated[index].status = 'normal';
                                                                        setHighValueChecks(updated);
                                                                    }}
                                                                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                                                                        check.status === 'normal' 
                                                                            ? 'bg-emerald-600 text-white shadow-md' 
                                                                            : 'text-base-400 hover:text-base-700 dark:hover:text-base-300'
                                                                    }`}
                                                                >
                                                                    ปกติ
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updated = [...highValueChecks];
                                                                        updated[index].status = 'abnormal';
                                                                        setHighValueChecks(updated);
                                                                    }}
                                                                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                                                                        check.status === 'abnormal' 
                                                                            ? 'bg-amber-500 text-white shadow-md' 
                                                                            : 'text-base-400 hover:text-base-700 dark:hover:text-base-300'
                                                                    }`}
                                                                >
                                                                    ชำรุด
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <input
                                                        type="text"
                                                        value={check.note}
                                                        onChange={e => {
                                                            const updated = [...highValueChecks];
                                                            updated[index].note = e.target.value;
                                                            setHighValueChecks(updated);
                                                        }}
                                                        placeholder="ระบุโน้ต/สาเหตุเพิ่มเติม..."
                                                        className="w-full p-3 bg-base-50 dark:bg-base-900 border border-base-100 dark:border-base-700 rounded-xl text-xs font-bold outline-none text-base-700 dark:text-base-200 placeholder:text-base-400 focus:border-indigo-400 dark:focus:border-indigo-900"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
                
                {/* Footer Buttons */}
                <div className="p-8 border-t border-base-100 dark:border-base-800 bg-base-50/35 dark:bg-base-950/20 flex flex-col sm:flex-row gap-4 items-center justify-end shrink-0">
                    <button 
                        onClick={onClose} 
                        className="w-full sm:w-auto px-8 py-3.5 text-xs font-black text-base-400 hover:text-base-800 dark:hover:text-base-200 uppercase tracking-widest transition-colors order-2 sm:order-1"
                    >
                        Discard Changes
                    </button>
                    <button 
                        onClick={() => onSave({ id: `${date}_${shift}`, date, shift, instruments: [], wasteLevel, cleanliness: 'good', infrastructureNote: note, cleanlinessNote: '', highValueChecks })} 
                        className="w-full sm:w-auto px-10 py-4 bg-primary-600 text-white font-black rounded-2xl shadow-xl shadow-primary-500/10 hover:brightness-110 transition-all uppercase tracking-[0.2em] text-[12px] border-b-4 border-primary-800 order-1 sm:order-2"
                    >
                        Commit Lab Report
                    </button>
                </div>
            </div>
        </div>
    );
};

const DashboardTab: React.FC<DashboardTabProps> = ({ testers, selectedDate, onDateChange, selectedShift, onShiftChange, appSettings }) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [returnedPool, setReturnedPool] = useState<CategorizedTask[]>([]);
    const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(ALL_PERSONNEL_ID);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

    const handleAudioSummary = async () => {
        setIsGeneratingAudio(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Step 1: Generate the script
            let prompt = `Create a concise, professional summary script for a 1-minute audio briefing in Thai for the following shift data. Focus on key metrics, special tasks, and any issues. Do not include markdown formatting or bullet points, just the spoken text.
            
            Date: ${selectedDate}, Shift: ${selectedShift}
            Global Stats: Total ${globalStats.total}, Done ${globalStats.done}, Urgent ${globalStats.urgent}, Sprint ${globalStats.sprint}, LSP ${globalStats.lsp}.
            Waste Level: ${shiftReport?.wasteLevel || 'Not set'}.
            `;

            processedPersonnel.forEach(p => {
                const total = Object.values(p.summary).reduce((acc: number, s: any) => acc + s.total, 0);
                const done = Object.values(p.summary).reduce((acc: number, s: any) => acc + s.done, 0);
                if (total > 0) prompt += `\n- ${p.name}: ${done}/${total} tasks.`;
            });

            const scriptResponse = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
            });
            const scriptText = scriptResponse.text || "No script generated.";

            // Step 2: Convert to Audio
            const audioResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: scriptText }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: 'Kore' },
                        },
                    },
                },
            });

            const base64Audio = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
                audio.play();
                setNotification({ message: "Playing Audio Summary...", isError: false });
            } else {
                throw new Error("No audio data received");
            }

        } catch (error) {
            console.error("Audio Summary failed", error);
            setNotification({ message: "Failed to generate audio summary", isError: true });
        } finally {
            setIsGeneratingAudio(false);
        }
    };

    const handleAiSummary = async () => {
        setIsGeneratingSummary(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            let prompt = `Summarize the shift work for ${selectedDate} ${selectedShift} shift in Thai language.
            
            Global Stats:
            - Total Tasks: ${globalStats.total}
            - Done: ${globalStats.done}
            - Urgent: ${globalStats.urgent}
            - Sprint: ${globalStats.sprint}
            - LSP: ${globalStats.lsp}
            - PoCat: ${globalStats.poCat}
            
            Waste Level: ${shiftReport?.wasteLevel || 'Not set'}
            
            Personnel Activity:
            `;

            processedPersonnel.forEach(p => {
                prompt += `\n- ${p.name} (${p.role}):\n`;
                Object.values(p.summary).forEach((s: any) => {
                    prompt += `  - ${s.desc}: ${s.done}/${s.total} (Status: ${s.priorityStatus})\n`;
                    if (s.hasOverPlanItems) prompt += `    * Over Plan items present\n`;
                });
            });

            prompt += `\nPlease provide a concise summary in Thai covering:
            1. Who worked and what they did.
            2. Overall performance (met plan or not).
            3. Special tasks summary (Urgent/Sprint/LSP).
            4. Waste level status.
            5. Any pending issues.`;

            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
            });
            setAiSummary(response.text || "No summary generated.");
        } catch (error) {
            console.error("AI Summary failed", error);
            setNotification({ message: "Failed to generate AI summary", isError: true });
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const fetchData = useCallback(async () => {
        setIsFetching(true);
        try {
            const [assigned, pool, report, dailySched, prepared] = await Promise.all([ getAssignedTasks(), getCategorizedTasks(), getShiftReport(selectedDate, selectedShift), getDailySchedule(selectedDate), getAssignedPrepareTasks() ]);
            setAssignedTasks((assigned || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setPrepareTasks((prepared || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setReturnedPool((pool || []).filter(t => t.isReturnedPool === true)); 
            setSchedule(dailySched);
            setShiftReport(report);
        } catch (e) { console.error(e); } finally { setIsFetching(false); }
    }, [selectedDate, selectedShift]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const globalStats = useMemo(() => {
        let total = 0, done = 0, poCat = 0, lsp = 0, sprint = 0, urgent = 0;
        const processGroup = (groupTasks: RawTask[], category: TaskCategory) => {
             groupTasks.forEach(t => {
                const taskQty = parseTaskQty(t);
                total += taskQty;
                const priority = getPriorityStatus(t, category);
                if (priority === 'lsp') lsp += taskQty;
                else if (priority === 'sprint') sprint += taskQty;
                else if (priority === 'urgent') urgent += taskQty;
                else if (priority === 'pocat') poCat += taskQty;
                if (t.status === TaskStatus.Done || t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing') done += taskQty;
            });
        };
        assignedTasks.forEach(g => {
            if (g.testerId === 'legacy_data_fix') return;
            processGroup(g.tasks, g.category);
        });
        prepareTasks.forEach(g => {
            if (g.assistantId === 'legacy_data_fix') return;
            processGroup(g.tasks, g.category);
        });
        returnedPool.forEach(g => {
            if (g.testerId === 'legacy_data_fix' || g.assistantId === 'legacy_data_fix') return;
            const docDate = g.returnedDate;
            if (g.shift === selectedShift && docDate === selectedDate) {
                const returnedItemsOnly = g.tasks.filter(t => t.isReturned);
                processGroup(returnedItemsOnly, g.category);
            }
        });
        return { total, done, poCat, lsp, sprint, urgent, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
    }, [assignedTasks, prepareTasks, returnedPool, selectedDate, selectedShift]);

    const processedPersonnel = useMemo(() => {
        const stats: Record<string, PersonStats> = {};
        if (schedule) {
            const activeShiftIds = selectedShift === 'day' ? [...(schedule.dayShiftTesters || []), ...(schedule.dayShiftAssistants || [])] : [...(schedule.nightShiftTesters || []), ...(schedule.nightShiftAssistants || [])];
            activeShiftIds.forEach(id => {
                const testerObj = testers.find(t => t.id === id);
                if (testerObj) {
                    const isAssistant = testerObj.team === 'assistants_4_2';
                    stats[testerObj.id] = { id: testerObj.id, name: testerObj.name, role: isAssistant ? 'ASST' : 'ANLST', pendingTasks: 0, summary: {} };
                }
            });
        }
        
        const addActivity = (targetPersonId: string, task: RawTask, cat: TaskCategory, isReady: boolean, isPrep: boolean = false) => {
            const safeId = targetPersonId || 'Unknown';
            if (!stats[safeId]) {
                const testerObj = testers.find(t => t.id === safeId);
                if (testerObj) {
                    const isAssistant = testerObj.team === 'assistants_4_2';
                    stats[testerObj.id] = { id: testerObj.id, name: testerObj.name, role: isAssistant ? 'ASST' : 'ANLST', pendingTasks: 0, summary: {} };
                } else {
                    const name = safeId === 'legacy_data_fix' ? 'งาน Manual' : safeId;
                    stats[safeId] = { id: safeId, name: name, role: 'SYSTEM', pendingTasks: 0, summary: {} };
                }
            }
            const person = stats[safeId];
            const taskQty = parseTaskQty(task);
            const isOverPlan = task.isOverPlan === true;
            const priority = isPrep ? 'normal' : getPriorityStatus(task, cat);
            const rawDesc = String(getTaskValue(task, 'Description') || 'General Task');
            const desc = isPrep ? `[PREP] ${rawDesc}` : rawDesc;
            const status = isReady ? 'done' : (task.status === TaskStatus.NotOK ? 'failed' : (task.isReturned ? 'returned' : 'pending'));
            if (status !== 'done') person.pendingTasks += taskQty;
            const summaryKey = `${person.id}_${desc}`;
            if (!person.summary[summaryKey]) {
                person.summary[summaryKey] = { desc, total: 0, done: 0, failed: 0, returned: 0, priorityStatus: priority, isManual: task.ManualEntry === true || cat === TaskCategory.Manual, isPrepGroup: isPrep, samples: [] };
            }
            const item = person.summary[summaryKey];
            item.total += taskQty;
            if (status === 'done') item.done += taskQty;
            if (status === 'failed') item.failed += taskQty;
            if (status === 'returned') item.returned += taskQty;
            if (isOverPlan) item.hasOverPlanItems = true;
            if (!isPrep) {
                const priorities = ['lsp', 'sprint', 'urgent', 'pocat', 'normal'];
                if (priorities.indexOf(priority) < priorities.indexOf(item.priorityStatus)) item.priorityStatus = priority;
            }
            item.samples.push({ name: String(getTaskValue(task, 'Sample Name') || 'N/A'), qty: String(taskQty), detail: String(getTaskValue(task, 'Variant') || '-'), status: status, isManual: item.isManual, isPrep: isPrep, isOverPlan: isOverPlan, reason: task.notOkReason || task.returnReason || undefined });
        };
        assignedTasks.forEach(g => {
            (g.tasks || []).forEach(t => {
                const isDone = t.status === TaskStatus.Done || t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing';
                addActivity(g.testerId, t, g.category, isDone, false);
            });
        });
        prepareTasks.forEach(g => {
            (g.tasks || []).forEach(t => { 
                const isDone = t.status === TaskStatus.Done || t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing'; 
                addActivity(g.assistantId, t, g.category, isDone, true); 
            });
        });
        returnedPool.forEach(g => {
            const docDate = g.returnedDate;
            if (g.shift === selectedShift && docDate === selectedDate) {
                const isPrep = g.isPrep === true;
                (g.tasks || []).forEach(t => { 
                    if (t.isReturned) {
                        const returnedByName = t.returnedBy || g.returnedBy || 'Unknown';
                        const person = testers.find(tester => tester.name.trim().toLowerCase() === String(returnedByName).trim().toLowerCase());
                        const targetId = person ? person.id : returnedByName;
                        const isDone = t.status === TaskStatus.Done || t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing';
                        addActivity(targetId, t, g.category, isDone, isPrep); 
                    }
                });
            }
        });
        return Object.values(stats)
            .filter(p => p.id !== 'legacy_data_fix')
            .sort((a, b) => b.pendingTasks - a.pendingTasks);
    }, [assignedTasks, prepareTasks, returnedPool, schedule, testers, selectedShift, selectedDate]);

    const activePerson = useMemo(() => {
        if (!selectedPersonId || selectedPersonId === ALL_PERSONNEL_ID) return null;
        return processedPersonnel.find(p => p.id === selectedPersonId) || null;
    }, [processedPersonnel, selectedPersonId]);

    const handleSaveReport = async (report: ShiftReport) => {
        try { await saveShiftReport(report); fetchData(); setNotification({ message: "Lab report committed successfully.", isError: false }); setIsReportModalOpen(false); } catch (e) { setNotification({ message: "Failed to save report.", isError: true }); }
    };

    const handleExport = () => {
        const exportData = processedPersonnel.flatMap(person => (Object.values(person.summary) as SummaryItemStats[]).flatMap((sum: SummaryItemStats) => sum.samples.map(sample => ({ 'Staff Name': person.name, 'Work Type': sample.isPrep ? 'Preparation' : 'Testing', 'Mission Desc': sum.desc, 'Sample Name': sample.name, 'Qty': sample.qty, 'Details': sample.detail, 'Status': sample.status, 'Over Plan': sample.isOverPlan ? 'YES' : 'NO', 'Issue/Reason': sample.reason || '-' }))));
        const ws = XLSX.utils.json_to_sheet(exportData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Shift Summary"); XLSX.writeFile(wb, `ShiftSummary_${selectedDate}_${selectedShift}.xlsx`);
    };

    const wasteTheme = useMemo(() => {
        const level = shiftReport?.wasteLevel || 'none';
        switch(level) {
            case 'high': return { bg: 'bg-red-600', text: 'text-red-50', badge: 'bg-red-955 text-red-400', glow: 'shadow-[0_20px_50px_-10px_rgba(220,38,38,0.5)]', label: 'Over Capacity', display: 'HIGH' };
            case 'medium': return { bg: 'bg-amber-500', text: 'text-amber-50', badge: 'bg-amber-955 text-amber-300', glow: 'shadow-[0_20px_50px_-10px_rgba(245,158,11,0.5)]', label: 'Limited Space', display: 'MEDIUM' };
            case 'low': return { bg: 'bg-emerald-600', text: 'text-emerald-50', badge: 'bg-emerald-955 text-emerald-400', glow: 'shadow-[0_20px_50px_-10px_rgba(16,185,129,0.5)]', label: 'Optimal', display: 'LOW' };
            default: return { bg: 'bg-white dark:bg-base-900', text: 'text-base-400 dark:text-base-500', badge: 'bg-base-100 dark:bg-base-800 text-base-400', glow: 'shadow-none', label: 'Not Set', display: 'N/A' };
        }
    }, [shiftReport]);

    const highValueStatusTheme = useMemo(() => {
        const checks = shiftReport?.highValueChecks || [];
        if (!shiftReport || checks.length === 0) {
            return {
                bg: 'bg-white dark:bg-base-800 border border-base-100 dark:border-base-700 text-base-400 dark:text-base-500 hover:bg-base-50',
                text: 'text-base-400 dark:text-base-500',
                display: 'รอการตรวจสอบ'
            };
        }
        const hasIssue = checks.some(c => {
            const isQtyMismatched = c.trackQuantity && !c.isConsumable && (c.currentQuantity !== undefined ? c.currentQuantity : (c.initialQuantity || 1)) < (c.initialQuantity || 1);
            return !c.isPresent || c.status === 'abnormal' || isQtyMismatched;
        });
        if (hasIssue) {
            return {
                bg: 'bg-red-50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-900/30 text-red-900 dark:text-red-300 animate-pulse',
                text: 'text-red-600 dark:text-red-400',
                display: 'พบสิ่งผิดปกติ!'
            };
        }
        return {
            bg: 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border border-transparent',
            text: 'text-white',
            display: 'ปกติ / ปลอดภัย'
        };
    }, [shiftReport]);

    const renderPersonnelBoardCard = (person: PersonStats) => {
        const missions = Object.entries(person.summary);
        if (missions.length === 0) return null;
        const totalDone = missions.reduce((acc: number, [_, s]) => acc + s.done, 0);
        const totalAll = missions.reduce((acc: number, [_, s]) => acc + s.total, 0);
        const isCompleted = totalDone === totalAll && totalAll > 0;
        const totalOverPlanCount = missions.reduce((acc: number, [_, s]) => acc + (s.samples ? s.samples.filter(x => x.isOverPlan).length : 0), 0);

        return (
            <div key={person.id} className="bg-white dark:bg-base-900 rounded-[2.5rem] border-2 border-base-200 dark:border-base-800 shadow-xl overflow-hidden flex flex-col h-full hover:border-indigo-500 transition-all duration-300 animate-fade-in group relative">
                {/* HIGH IMPACT OVER PLAN BADGE */}
                {totalOverPlanCount > 0 && (
                    <div className="absolute top-0 right-0 z-10 px-4 py-1.5 bg-gradient-to-l from-indigo-600 to-violet-600 text-white rounded-bl-3xl shadow-xl animate-pulse ring-2 ring-indigo-400/30">
                        <div className="flex flex-col items-center leading-none">
                            <span className="text-[14px] font-black tracking-tighter">⚡ +{totalOverPlanCount}</span>
                            <span className="text-[7px] font-black uppercase tracking-[0.2em] mt-0.5">OVER PLAN</span>
                        </div>
                    </div>
                )}

                <div className={`px-6 py-4 flex items-center justify-between border-b-2 border-base-50 dark:border-base-800 ${person.role === 'ASST' ? 'bg-amber-50/30 dark:bg-amber-900/10' : 'bg-primary-50/30 dark:bg-primary-900/10'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-black text-white shadow-lg ${person.role === 'ASST' ? 'person-avatar assistant' : person.role === 'SYSTEM' ? 'person-avatar system' : 'person-avatar'}`}>
                            {person.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h4 className="text-[16px] font-black text-base-955 dark:text-base-50 uppercase tracking-tighter leading-none">{person.name}</h4>
                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] mt-1 block ${person.role === 'ASST' ? 'text-amber-600' : person.role === 'SYSTEM' ? 'text-emerald-600' : 'text-primary-600'}`}>
                                {person.role === 'ASST' ? 'Assistant' : person.role === 'SYSTEM' ? 'System' : 'Analyst'}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end pr-10">
                        <div className={`text-[20px] font-black tracking-tighter ${isCompleted ? 'text-emerald-600' : 'text-primary-700'}`}>
                            {totalDone}<span className="text-base-300 mx-0.5 font-normal text-sm">/</span>{totalAll}
                        </div>
                    </div>
                </div>

                <div className="w-full h-1.5 bg-base-100 dark:bg-base-800 overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${isCompleted ? 'bg-emerald-500' : 'bg-primary-600'}`} style={{width: totalAll > 0 ? `${(totalDone/totalAll)*100}%` : '0%'}}></div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar max-h-[500px]">
                    {(missions as [string, SummaryItemStats][]).map(([key, sum]) => {
                        const isSumComplete = sum.done === sum.total;
                        const hasSumError = sum.failed > 0 || sum.returned > 0;
                        return (
                            <div key={key} className={`p-4 rounded-2xl border-2 transition-all ${sum.hasOverPlanItems ? 'bg-indigo-50/20 border-indigo-200/50 shadow-sm' : isSumComplete ? 'bg-emerald-50/10 border-emerald-100/50' : hasSumError ? 'bg-red-50/10 border-red-100 shadow-md' : 'bg-base-50/30 dark:bg-base-800/40 border-base-100 dark:border-base-700'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col pr-2">
                                        <h5 className={`text-[13px] font-black leading-tight uppercase ${isSumComplete ? 'text-emerald-900/40' : 'text-base-955 dark:text-base-100'}`}>
                                            {sum.desc}
                                        </h5>
                                        {sum.hasOverPlanItems && <span className="text-[7px] font-black text-indigo-600 uppercase tracking-widest mt-1 animate-pulse">⚡ OVER PLAN MISSION</span>}
                                    </div>
                                    <span className={`text-[13px] font-black shrink-0 ${isSumComplete ? 'text-emerald-600/50' : hasSumError ? 'text-red-600' : 'text-primary-600'}`}>
                                        {sum.done}/{sum.total}
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    {sum.samples.map((s, si) => {
                                        const isSampleActioned = s.status === 'done' || s.status === 'failed' || s.status === 'returned';
                                        return (
                                            <div key={si} className="flex flex-col gap-1">
                                                <div className={`flex items-center justify-between text-[11px] font-bold p-1 rounded ${s.isOverPlan ? 'bg-indigo-50 dark:bg-indigo-900/10 border-l-2 border-indigo-400' : ''}`}>
                                                    <div className="flex items-center gap-1 min-w-0">
                                                        <span className={`px-1.5 py-0.5 rounded bg-base-100 dark:bg-base-700 text-[9px] font-black`}>x{s.qty}</span>
                                                        <span className={`truncate max-w-[120px] uppercase ${isSampleActioned ? 'opacity-40' : 'text-base-700 dark:text-base-300'}`}>{s.name}</span>
                                                        {s.isOverPlan && <span className="text-[10px] text-indigo-600 animate-pulse-subtle shrink-0" title="Over Plan Item">⚡</span>}
                                                    </div>
                                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase ${
                                                        s.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 
                                                        s.status === 'failed' ? 'bg-red-600 text-white shadow-lg animate-pulse' : 
                                                        s.status === 'returned' ? 'bg-orange-600 text-white shadow-lg animate-pulse' : 'text-base-400'
                                                    }`}>
                                                        {s.status}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="px-6 py-3 bg-base-50/50 dark:bg-base-800/30 text-center">
                    <button onClick={() => setSelectedPersonId(person.id)} className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-600 hover:text-primary-700 transition-colors">View Performance Profile</button>
                </div>
            </div>
        );
    };

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col animate-fade-in overflow-hidden p-3 bg-base-50/50 dark:bg-base-955 font-sans relative">
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .person-avatar { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); }
                .person-avatar.assistant { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); }
                .person-avatar.unified { background: linear-gradient(135deg, #0f172a 0%, #334155 100%); }
                .person-avatar.system { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
                .active-glow { box-shadow: 0 0 25px -5px rgba(99, 102, 241, 0.4); }
                @keyframes achievement-pulse { 0% { text-shadow: 0 0 5px #4f46e5; transform: scale(1); } 50% { text-shadow: 0 0 15px #06b6d4; transform: scale(1.05); } 100% { text-shadow: 0 0 5px #4f46e5; transform: scale(1); } }
                .neon-achievement-text { animation: achievement-pulse 2s ease-in-out infinite; font-weight: 900; letter-spacing: -0.05em; }
                @keyframes waste-pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }
                .waste-pulse-active { animation: waste-pulse 2s ease-in-out infinite; }
            `}</style>

            <ReportEditorModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} report={shiftReport} onSave={handleSaveReport} date={selectedDate} shift={selectedShift} appSettings={appSettings || null} />
            {aiSummary && (
                <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[120] p-4 animate-fade-in" onClick={() => setAiSummary(null)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-white/20 max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-base-100 dark:border-base-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl"><SparklesIcon className="h-6 w-6"/></div>
                                <div>
                                    <h3 className="text-2xl font-black text-base-955 dark:text-white tracking-tighter">AI Shift Summary</h3>
                                    <p className="text-[10px] font-bold text-base-400 uppercase tracking-widest">Generated Intelligence Report</p>
                                </div>
                            </div>
                            <button onClick={() => setAiSummary(null)} className="p-2 hover:bg-base-200 dark:hover:bg-base-700 rounded-full transition-colors"><XCircleIcon className="h-6 w-6 text-base-400"/></button>
                        </div>
                        <div className="p-8 overflow-y-auto custom-scrollbar">
                            <div className="prose prose-indigo dark:prose-invert max-w-none">
                                <p className="whitespace-pre-wrap text-base-700 dark:text-base-300 font-medium leading-relaxed">{aiSummary}</p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-base-100 dark:border-base-800 bg-base-50 dark:bg-base-800/50 flex justify-end">
                            <button onClick={() => setAiSummary(null)} className="px-8 py-3 bg-base-900 dark:bg-white text-white dark:text-base-900 font-black rounded-xl uppercase tracking-widest text-xs hover:scale-105 transition-transform">Close Report</button>
                        </div>
                    </div>
                </div>
            )}
            {notification && ( <div className={`fixed bottom-10 right-10 z-[110] px-6 py-4 rounded-2xl shadow-2xl animate-slide-in-up flex items-center gap-3 font-black text-xs uppercase tracking-widest ${notification.isError ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}> <CheckCircleIcon className="h-5 w-5" /> {notification.message} </div> )}

            <div className="flex-grow grid grid-cols-12 gap-5 h-full relative overflow-hidden">
                <aside className="col-span-1 flex flex-col bg-white dark:bg-base-900 rounded-[2rem] border border-base-200 dark:border-base-800 shadow-xl overflow-hidden h-full backdrop-blur-md">
                    <div className="flex-grow overflow-y-auto no-scrollbar p-3 space-y-3">
                        <button onClick={() => setSelectedPersonId(ALL_PERSONNEL_ID)} title="Combined Dashboard" className={`w-full h-12 rounded-2xl flex items-center justify-center transition-all duration-300 border-2 ${selectedPersonId === ALL_PERSONNEL_ID ? 'bg-base-955 border-base-800 text-white shadow-xl' : 'bg-base-50 dark:bg-base-800 border-transparent text-base-400 hover:border-base-200'}`}><SparklesIcon className="h-6 w-6" /></button>
                        <div className="h-px bg-base-100 dark:bg-base-800"></div>
                        {processedPersonnel.map(person => { const isActive = selectedPersonId === person.id; return ( <button key={person.id} onClick={() => setSelectedPersonId(person.id)} title={person.name} className={`w-full h-12 rounded-2xl flex items-center justify-center text-[12px] font-black shadow-inner transition-all border-2 ${isActive ? 'bg-primary-600 text-white border-primary-500 shadow-lg active-glow' : 'bg-base-50 dark:bg-base-800 text-base-400 border-transparent hover:border-base-200'}`}>{person.name.substring(0, 2).toUpperCase()}</button> ); })}
                    </div>
                    <div className="p-3 border-t border-base-100 dark:border-base-800"><button onClick={fetchData} className="w-full h-12 rounded-2xl bg-base-50 dark:bg-base-800 flex items-center justify-center text-base-400"><RefreshIcon className={`h-5 w-5 ${isFetching ? 'animate-spin text-primary-600' : ''}`}/></button></div>
                </aside>

                <div className="col-span-11 flex flex-col min-w-0 bg-white dark:bg-base-900 rounded-[3rem] border border-base-200 dark:border-base-800 shadow-2xl overflow-hidden relative backdrop-blur-xl h-full">
                    <div className="px-8 py-6 border-b border-base-100 dark:border-base-800 flex flex-col gap-6 bg-base-50/30 dark:bg-base-800/10 shrink-0 sticky top-0 z-20 backdrop-blur-xl">
                        <div className="flex justify-between items-center">
                            <div><h2 className="text-3xl font-black text-base-955 dark:text-white tracking-tighter leading-none italic">Shift Intelligence</h2><p className="text-[11px] text-base-400 font-black uppercase tracking-[0.4em] mt-2">Laboratory Performance Board</p></div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-4 bg-white dark:bg-base-800 p-2 rounded-[2rem] border-2 border-base-100 dark:border-base-700 shadow-inner"><div className="relative group px-4 border-r dark:border-base-700"><CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-600" /><input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="bg-transparent border-none text-[13px] font-black focus:ring-0 cursor-pointer pl-6 py-2 dark:text-white" /></div><div className="flex gap-2 p-1"><button onClick={() => onShiftChange('day')} className={`flex items-center gap-2.5 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedShift === 'day' ? 'bg-amber-500 text-white shadow-lg' : 'text-base-400 hover:text-amber-600'}`}><SunIcon className="h-4 w-4" /> Day</button><button onClick={() => onShiftChange('night')} className={`flex items-center gap-2.5 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedShift === 'night' ? 'bg-indigo-700 text-white shadow-lg' : 'text-base-400 hover:text-indigo-700'}`}><MoonIcon className="h-4 w-4" /> Night</button></div></div>
                                <button onClick={handleExport} className="p-4 bg-white dark:bg-base-800 hover:bg-base-50 rounded-2xl border-2 border-base-100 dark:border-base-700 shadow-sm text-base-500"><DownloadIcon className="h-6 w-6"/></button>
                                <button onClick={handleAiSummary} disabled={isGeneratingSummary} className="p-4 bg-white dark:bg-base-800 hover:bg-base-50 rounded-2xl border-2 border-base-100 dark:border-base-700 shadow-sm text-primary-600 disabled:opacity-50 transition-all active:scale-95" title="Generate AI Summary">
                                    <ChatAlt2Icon className={`h-6 w-6 ${isGeneratingSummary ? 'animate-bounce' : ''}`}/>
                                </button>
                                <button onClick={handleAudioSummary} disabled={isGeneratingAudio} className="p-4 bg-white dark:bg-base-800 hover:bg-base-50 rounded-2xl border-2 border-base-100 dark:border-base-700 shadow-sm text-rose-600 disabled:opacity-50 transition-all active:scale-95" title="Generate Audio Briefing">
                                    <SpeakerWaveIcon className={`h-6 w-6 ${isGeneratingAudio ? 'animate-pulse' : ''}`}/>
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-9 gap-4">
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-primary-600 uppercase tracking-widest mb-1">Global Success</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.percent}%</span><span className="text-[11px] font-bold text-base-400">({globalStats.done}/{globalStats.total})</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Po Cat Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.poCat}</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-cyan-600 uppercase tracking-widest mb-1">LSP Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.lsp}</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Sprint Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-base-955 dark:text-white">{globalStats.sprint}</span></div></div>
                            <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-100 dark:border-base-700 shadow-sm flex flex-col justify-center"><span className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Urgent Units</span><div className="flex items-baseline gap-2"><span className="text-2xl font-black text-red-600">{globalStats.urgent}</span></div></div>
                            
                            {/* Waste Status Button: Spans 2 cols on desktop, very spacious and clean */}
                            <button 
                                onClick={() => setIsReportModalOpen(true)} 
                                className={`col-span-1 xl:col-span-2 rounded-2xl p-5 shadow-xl border-2 transition-all flex flex-col justify-between text-left ${wasteTheme.bg} border-transparent active:scale-[0.98] hover:scale-[1.02] duration-200 min-h-[90px] relative overflow-hidden group ${shiftReport?.wasteLevel === 'high' ? 'waste-pulse-active' : ''}`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${wasteTheme.text} opacity-90`}>
                                        Waste Status
                                    </span>
                                    <TrashIcon className={`h-5 w-5 ${wasteTheme.text} opacity-80 group-hover:scale-110 transition-transform`} />
                                </div>
                                <div className="mt-2">
                                    <span className={`text-2xl lg:text-3xl font-black tracking-tight ${wasteTheme.text}`}>
                                        {wasteTheme.display}
                                    </span>
                                </div>
                            </button>

                            {/* Storage Status Button: Spans 2 cols on desktop, very spacious and clean */}
                            <button 
                                onClick={() => setIsReportModalOpen(true)} 
                                className={`col-span-1 xl:col-span-2 rounded-2xl p-5 shadow-xl border-2 transition-all flex flex-col justify-between text-left ${highValueStatusTheme.bg} border-transparent active:scale-[0.98] hover:scale-[1.02] duration-200 min-h-[90px] relative overflow-hidden group`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${highValueStatusTheme.text} opacity-90`}>
                                        ตู้จัดเก็บพิเศษ
                                    </span>
                                    <CheckCircleIcon className={`h-5 w-5 ${highValueStatusTheme.text} opacity-80 group-hover:scale-110 transition-transform`} />
                                </div>
                                <div className="mt-2">
                                    <span className={`text-lg lg:text-xl font-black tracking-tight ${highValueStatusTheme.text} block truncate`}>
                                        {highValueStatusTheme.display}
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar p-8">
                        {selectedPersonId === ALL_PERSONNEL_ID ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                                {processedPersonnel.filter(p => Object.keys(p.summary).length > 0).map(person => renderPersonnelBoardCard(person))}
                                {processedPersonnel.every(p => Object.keys(p.summary).length === 0) && ( <div className="col-span-full py-40 text-center opacity-10 flex flex-col items-center"> <BeakerIcon className="h-32 w-32 mb-6" /> <span className="text-2xl font-black uppercase tracking-[0.5em]">No Active Missions</span> </div> )}
                            </div>
                        ) : (
                            <div className="max-w-6xl mx-auto">
                                {activePerson ? (
                                    <div className="animate-fade-in">
                                        <div className="flex items-center justify-between mb-8 px-6 py-6 bg-white dark:bg-base-900 rounded-[2.5rem] border-2 border-base-100 dark:border-base-800 shadow-xl overflow-hidden relative">
                                            {/* LARGE ACHIEVEMENT WATERMARK */}
                                            {(Object.values(activePerson.summary) as SummaryItemStats[]).some((s: SummaryItemStats) => s.samples && s.samples.some(x => x.isOverPlan)) && (
                                                <div className="absolute right-[-20px] top-[20px] rotate-12 opacity-5 pointer-events-none">
                                                    <span className="text-[120px] font-black italic uppercase">OVER PLAN</span>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-6">
                                                <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center text-2xl font-black text-white shadow-2xl ${activePerson.role === 'ASST' ? 'person-avatar assistant' : activePerson.role === 'SYSTEM' ? 'person-avatar system' : 'person-avatar'}`}> {activePerson.name.substring(0, 2).toUpperCase()} </div>
                                                <div>
                                                    <h3 className="text-4xl font-black text-base-955 dark:text-white tracking-tighter uppercase leading-none">{activePerson.name}</h3>
                                                    <span className={`text-xs font-black uppercase tracking-[0.4em] mt-3 block ${activePerson.role === 'ASST' ? 'text-amber-600' : activePerson.role === 'SYSTEM' ? 'text-emerald-600' : 'text-primary-600'}`}>Mission Integrity Analysis</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-black text-base-400 uppercase tracking-widest mb-1">Success Rate</span>
                                                <span className="text-4xl font-black text-primary-700"> {(Object.values(activePerson.summary) as SummaryItemStats[]).reduce((acc: number, s: SummaryItemStats) => acc + s.done, 0)} <span className="text-base-200 mx-1 font-normal">/</span> {(Object.values(activePerson.summary) as SummaryItemStats[]).reduce((acc: number, s: SummaryItemStats) => acc + s.total, 0)} </span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {(Object.entries(activePerson.summary) as [string, SummaryItemStats][]).map(([key, sum]) => (
                                                <div key={key} className={`bg-white dark:bg-base-900 rounded-[2rem] border-2 p-8 shadow-lg transition-all ${sum.hasOverPlanItems ? 'border-indigo-400 dark:border-indigo-800' : 'border-base-100 dark:border-base-800'}`}>
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div className="flex flex-col pr-4">
                                                            <h4 className="text-xl font-black uppercase text-base-955 dark:text-white leading-tight">{sum.desc}</h4>
                                                            {sum.hasOverPlanItems && <span className="text-[11px] font-black bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-1.5 rounded-full uppercase tracking-[0.2em] mt-3 w-fit neon-achievement-text shadow-lg">⚡ OVER PLAN MISSION</span>}
                                                        </div>
                                                        <span className="text-2xl font-black text-primary-600">{sum.done}/{sum.total}</span>
                                                    </div>
                                                    <div className="space-y-4">
                                                        {sum.samples.map((s, si) => (
                                                            <div key={si} className={`flex flex-col p-4 rounded-2xl border transition-all ${s.isOverPlan ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-400 shadow-md transform scale-[1.02]' : 'bg-base-50/50 dark:bg-base-800/50 border-base-100 dark:border-base-700'}`}>
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className={`px-2 py-1 rounded bg-white dark:bg-base-700 text-[11px] font-black shadow-sm ${s.isOverPlan ? 'text-indigo-600' : ''}`}>x{s.qty}</span>
                                                                        <span className={`text-[15px] font-black uppercase text-base-900 dark:text-base-100 truncate ${s.isOverPlan ? 'text-indigo-900 dark:text-indigo-200' : ''}`}>{s.name}</span>
                                                                        {s.isOverPlan && <span className="text-[12px] font-black text-indigo-600 animate-pulse shrink-0">⚡</span>}
                                                                    </div>
                                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${ s.status === 'done' ? 'bg-emerald-100 text-emerald-700' : s.status === 'failed' ? 'bg-red-600 text-white animate-pulse' : s.status === 'returned' ? 'bg-orange-600 text-white animate-pulse' : 'text-base-400' }`}> {s.status} </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : ( <div className="py-40 text-center opacity-10 flex flex-col items-center"> <BeakerIcon className="h-32 w-32 mb-6" /> <span className="text-2xl font-black uppercase tracking-[0.5em]">Personnel data not found</span> </div> )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
export default DashboardTab;
