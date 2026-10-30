import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { DistillationLog, Tester } from '../types';
import { 
    getDistillationLogs, 
    addDistillationLog, 
    updateDistillationLog, 
    deleteDistillationLog,
    getChemicalPrices,
    saveChemicalPrices 
} from '../services/dataService';
import { 
    BeakerIcon, RefreshIcon, PlusIcon, TrashIcon, PencilIcon, 
    SearchIcon, DownloadIcon, CheckCircleIcon, XCircleIcon, 
    CurrencyDollarIcon, CalendarIcon, ChevronDownIcon
} from './common/Icons';

declare const XLSX: any;

const STANDARD_CHEMICALS = [
    'Ethanol',
    'Methanol',
    'Hexane',
    'Acetone',
    'Acetonitrile',
    'Isopropanol',
    'Xylene',
    'Toluene'
];

interface DistillationTabProps {
    testers: Tester[];
    onDataUpdated?: () => void;
}

export const DistillationTab: React.FC<DistillationTabProps> = ({ testers, onDataUpdated }) => {
    const [logs, setLogs] = useState<DistillationLog[]>([]);
    const [chemicalPrices, setChemicalPrices] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selectedChemical, setSelectedChemical] = useState<string>('ALL');
    const [dateFilter, setDateFilter] = useState<'all' | 'month' | '7days' | '30days'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

    // Modal States
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<DistillationLog | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DistillationLog | null>(null);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

    // Form inputs
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formChemical, setFormChemical] = useState('Ethanol');
    const [formOperator, setFormOperator] = useState('');
    const [formInputAmount, setFormInputAmount] = useState('5000');
    const [formOutputAmount, setFormOutputAmount] = useState('4800');
    const [formNotes, setFormNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Chemical price inputs
    const [tempPrices, setTempPrices] = useState<Record<string, string>>({});

    const showToast = useCallback((text: string, isError = false) => {
        setToastMessage({ text, isError });
        setTimeout(() => setToastMessage(null), 3500);
    }, []);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fetchedLogs, fetchedPrices] = await Promise.all([
                getDistillationLogs(),
                getChemicalPrices()
            ]);
            setLogs(fetchedLogs);
            setChemicalPrices(fetchedPrices);
        } catch (err) {
            console.error('Error fetching distillation logs:', err);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', true);
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Available chemical list (merge standard with custom from logs)
    const allChemicals = useMemo(() => {
        const set = new Set<string>(STANDARD_CHEMICALS);
        logs.forEach(l => {
            if (l.chemicalName) set.add(l.chemicalName.trim());
        });
        return Array.from(set);
    }, [logs]);

    // Filtered logs
    const filteredLogs = useMemo(() => {
        const now = new Date();
        const currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM
        const q = searchQuery.toLowerCase().trim();

        return logs.filter(log => {
            // Chemical filter
            if (selectedChemical !== 'ALL' && log.chemicalName.toLowerCase() !== selectedChemical.toLowerCase()) {
                return false;
            }

            // Date filter
            if (dateFilter === 'month') {
                if (!log.date.startsWith(currentMonthPrefix)) return false;
            } else if (dateFilter === '7days') {
                const logTime = new Date(log.date).getTime();
                const diffDays = (now.getTime() - logTime) / (1000 * 3600 * 24);
                if (diffDays > 7 || diffDays < 0) return false;
            } else if (dateFilter === '30days') {
                const logTime = new Date(log.date).getTime();
                const diffDays = (now.getTime() - logTime) / (1000 * 3600 * 24);
                if (diffDays > 30 || diffDays < 0) return false;
            }

            // Search query (operator, chemical, notes)
            if (q) {
                const matchOp = log.recorderName?.toLowerCase().includes(q);
                const matchChem = log.chemicalName?.toLowerCase().includes(q);
                const matchNotes = log.notes?.toLowerCase().includes(q);
                if (!matchOp && !matchChem && !matchNotes) return false;
            }

            return true;
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [logs, selectedChemical, dateFilter, searchQuery]);

    // Summary KPIs based on filtered logs
    const kpiSummary = useMemo(() => {
        let totalIn = 0;
        let totalOut = 0;
        let totalCostSaved = 0;

        filteredLogs.forEach(l => {
            const inAmt = Number(l.inputAmount) || 0;
            const outAmt = Number(l.outputAmount) || 0;
            totalIn += inAmt;
            totalOut += outAmt;

            const pricePerLiter = chemicalPrices[l.chemicalName] || 350;
            totalCostSaved += (outAmt / 1000) * pricePerLiter;
        });

        const avgYield = totalIn > 0 ? (totalOut / totalIn) * 100 : 0;

        return {
            totalIn,
            totalOut,
            avgYield,
            totalCostSaved,
            batchCount: filteredLogs.length
        };
    }, [filteredLogs, chemicalPrices]);

    // Open add modal
    const handleOpenAddModal = () => {
        setEditingLog(null);
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormChemical(selectedChemical !== 'ALL' ? selectedChemical : (allChemicals[0] || 'Ethanol'));
        setFormOperator(testers[0]?.name || 'เบน');
        setFormInputAmount('5000');
        setFormOutputAmount('4800');
        setFormNotes('');
        setIsFormModalOpen(true);
    };

    // Open edit modal
    const handleOpenEditModal = (log: DistillationLog) => {
        setEditingLog(log);
        setFormDate(log.date);
        setFormChemical(log.chemicalName);
        setFormOperator(log.recorderName);
        setFormInputAmount(String(log.inputAmount));
        setFormOutputAmount(String(log.outputAmount));
        setFormNotes(log.notes || '');
        setIsFormModalOpen(true);
    };

    // Calculate live yield for modal
    const liveYield = useMemo(() => {
        const inp = parseFloat(formInputAmount) || 0;
        const out = parseFloat(formOutputAmount) || 0;
        if (inp <= 0) return 0;
        return Number(((out / inp) * 100).toFixed(1));
    }, [formInputAmount, formOutputAmount]);

    // Save batch log (add or update)
    const handleSaveBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        const inputAmount = parseFloat(formInputAmount) || 0;
        const outputAmount = parseFloat(formOutputAmount) || 0;

        if (!formChemical.trim()) {
            showToast('กรุณาระบุสารเคมีที่กลั่น', true);
            return;
        }
        if (!formOperator.trim()) {
            showToast('กรุณาระบุชื่อผู้ทำการกลั่น', true);
            return;
        }
        if (inputAmount <= 0) {
            showToast('ปริมาณสารตั้งต้นต้องมากกว่า 0 ml', true);
            return;
        }
        if (outputAmount < 0) {
            showToast('ปริมาณสารที่กลั่นได้ต้องไม่ติดลบ', true);
            return;
        }

        const yieldPercent = Number(((outputAmount / inputAmount) * 100).toFixed(1));

        setIsSubmitting(true);
        try {
            if (editingLog && editingLog.id) {
                await updateDistillationLog(editingLog.id, {
                    chemicalName: formChemical.trim(),
                    inputAmount,
                    outputAmount,
                    yieldPercent,
                    date: formDate,
                    recorderName: formOperator.trim(),
                    notes: formNotes.trim()
                });
                showToast(`อัปเดตบันทึกการกลั่น ${formChemical} เรียบร้อยแล้ว`);
            } else {
                await addDistillationLog({
                    chemicalName: formChemical.trim(),
                    inputAmount,
                    outputAmount,
                    yieldPercent,
                    date: formDate,
                    recorderName: formOperator.trim(),
                    notes: formNotes.trim()
                });
                showToast(`บันทึกการกลั่น ${formChemical} สำเร็จ (Yield ${yieldPercent}%)`);
            }
            setIsFormModalOpen(false);
            await fetchData();
            if (onDataUpdated) onDataUpdated();
        } catch (err) {
            console.error('Error saving distillation log:', err);
            showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', true);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete batch log
    const handleDeleteBatch = async () => {
        if (!deleteTarget || !deleteTarget.id) return;
        try {
            await deleteDistillationLog(deleteTarget.id);
            showToast(`ลบบันทึกการกลั่น ${deleteTarget.chemicalName} วันที่ ${deleteTarget.date} แล้ว`);
            setDeleteTarget(null);
            await fetchData();
            if (onDataUpdated) onDataUpdated();
        } catch (err) {
            console.error('Error deleting distillation log:', err);
            showToast('ไม่สามารถลบรายการได้', true);
        }
    };

    // Open price configuration modal
    const handleOpenPriceModal = () => {
        const initialPrices: Record<string, string> = {};
        allChemicals.forEach(chem => {
            initialPrices[chem] = String(chemicalPrices[chem] || 350);
        });
        setTempPrices(initialPrices);
        setIsPriceModalOpen(true);
    };

    // Save chemical prices
    const handleSavePrices = async (e: React.FormEvent) => {
        e.preventDefault();
        const updated: Record<string, number> = {};
        Object.entries(tempPrices).forEach(([chem, val]) => {
            const num = parseFloat(val) || 0;
            if (num > 0) updated[chem] = num;
        });

        try {
            await saveChemicalPrices(updated);
            setChemicalPrices(updated);
            showToast('บันทึกราคาสารเคมีเรียบร้อยแล้ว');
            setIsPriceModalOpen(false);
        } catch (err) {
            console.error('Error saving chemical prices:', err);
            showToast('ไม่สามารถบันทึกราคาสารเคมีได้', true);
        }
    };

    // Export to Excel
    const handleExportExcel = () => {
        if (typeof XLSX === 'undefined') {
            showToast('ไม่พบโมดูล XLSX ในระบบ', true);
            return;
        }

        try {
            const wb = XLSX.utils.book_new();

            // Format rows
            const excelRows = filteredLogs.map((log, index) => {
                const price = chemicalPrices[log.chemicalName] || 350;
                const costSaved = ((log.outputAmount || 0) / 1000) * price;
                return {
                    'ลำดับ (No.)': index + 1,
                    'วันที่กลั่น (Date)': log.date,
                    'ชื่อสารเคมี (Chemical)': log.chemicalName,
                    'ผู้ทำการกลั่น (Operator)': log.recorderName,
                    'ปริมาณ Input (ml)': log.inputAmount,
                    'ปริมาณ Output (ml)': log.outputAmount,
                    'เปอร์เซ็นต์ Yield (%)': `${log.yieldPercent}%`,
                    'ราคาต่อลิตร (฿/L)': price,
                    'มูลค่าที่ประหยัดได้ (฿)': Number(costSaved.toFixed(2)),
                    'หมายเหตุ (Notes)': log.notes || '-'
                };
            });

            const ws = XLSX.utils.json_to_sheet(excelRows);
            XLSX.utils.book_append_sheet(wb, ws, 'Distillation_Logs');

            const filename = `Chemical_Distillation_Log_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, filename);
            showToast(`ส่งออกไฟล์ Excel เรียบร้อย: ${filename}`);
        } catch (err) {
            console.error('Error exporting to Excel:', err);
            showToast('เกิดข้อผิดพลาดในการส่งออก Excel', true);
        }
    };

    return (
        <div className="flex-1 w-full bg-slate-50/70 dark:bg-base-950 min-h-screen pb-16 font-sans">
            {/* Toast Notification */}
            {toastMessage && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-xs font-bold transition-all animate-bounce ${
                    toastMessage.isError 
                        ? 'bg-rose-600 text-white' 
                        : 'bg-emerald-600 text-white'
                }`}>
                    {toastMessage.isError ? <XCircleIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* Header Area */}
            <div className="bg-white dark:bg-base-900 border-b border-slate-200/90 dark:border-base-800 px-6 py-5">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-primary-700 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                            <BeakerIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                                    บันทึกการกลั่นสารเคมี (Chemical Distillation Log)
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    Solvent Recovery
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                                บันทึกการรีไซเคิลสารเคมี คำนวณปริมาณ Input/Output, เปอร์เซ็นต์ Yield และประเมินมูลค่าประหยัดต้นทุนแล็บ
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            onClick={handleOpenPriceModal}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 hover:bg-slate-50 dark:hover:bg-base-750 transition-all shadow-2xs"
                        >
                            <CurrencyDollarIcon className="w-4 h-4 text-emerald-600" />
                            <span>ตั้งค่าราคาสารเคมี (฿/L)</span>
                        </button>

                        <button
                            onClick={handleExportExcel}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 hover:bg-slate-50 dark:hover:bg-base-750 transition-all shadow-2xs"
                        >
                            <DownloadIcon className="w-4 h-4 text-indigo-600" />
                            <span>ส่งออก Excel</span>
                        </button>

                        <button
                            onClick={handleOpenAddModal}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 active:scale-95"
                        >
                            <PlusIcon className="w-4 h-4" />
                            <span>+ บันทึกรอบกลั่นใหม่</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 pt-6 space-y-6">
                {/* 4 Metric KPI Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Total Input */}
                    <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border border-slate-200/90 dark:border-base-800 shadow-2xs relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                สารตั้งต้นทั้งหมด (Input)
                            </span>
                            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                <BeakerIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                {kpiSummary.totalIn.toLocaleString()}
                            </span>
                            <span className="text-xs font-bold text-slate-400">ml</span>
                            <span className="text-[11px] font-semibold text-slate-500">
                                ({(kpiSummary.totalIn / 1000).toFixed(1)} ลิตร)
                            </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400 font-medium">
                            รวมทั้งหมด {kpiSummary.batchCount} รอบการกลั่น
                        </div>
                    </div>

                    {/* Card 2: Purified Output */}
                    <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border border-slate-200/90 dark:border-base-800 shadow-2xs relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                กลั่นได้บริสุทธิ์ (Output)
                            </span>
                            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400">
                                <RefreshIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 tracking-tight">
                                {kpiSummary.totalOut.toLocaleString()}
                            </span>
                            <span className="text-xs font-bold text-slate-400">ml</span>
                            <span className="text-[11px] font-semibold text-slate-500">
                                ({(kpiSummary.totalOut / 1000).toFixed(1)} ลิตร)
                            </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400 font-medium">
                            สารเคมีที่หมุนเวียนกลับมาใช้ซ้ำได้
                        </div>
                    </div>

                    {/* Card 3: Recovery Efficiency (% Yield) */}
                    <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border border-slate-200/90 dark:border-base-800 shadow-2xs relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                ประสิทธิภาพเฉลี่ย (% Yield)
                            </span>
                            <div className={`p-2 rounded-xl ${
                                kpiSummary.avgYield >= 95 
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' 
                                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                            }`}>
                                <CheckCircleIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className={`text-2xl font-black tracking-tight ${
                                kpiSummary.avgYield >= 95 
                                    ? 'text-emerald-600 dark:text-emerald-400' 
                                    : 'text-amber-600 dark:text-amber-400'
                            }`}>
                                {kpiSummary.avgYield.toFixed(1)}%
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                kpiSummary.avgYield >= 95 
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                            }`}>
                                {kpiSummary.avgYield >= 95 ? 'ผ่านเกณฑ์มาตรฐาน (≥95%)' : 'ต่ำกว่าเกณฑ์ (<95%)'}
                            </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400 font-medium">
                            เกณฑ์สเปกแล็บ: Recovery ≥ 95.0%
                        </div>
                    </div>

                    {/* Card 4: Cost Saved (฿) */}
                    <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border border-slate-200/90 dark:border-base-800 shadow-2xs relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                มูลค่าที่ประหยัดได้ (Cost Saved)
                            </span>
                            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                <CurrencyDollarIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                ฿{kpiSummary.totalCostSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400 font-medium">
                            คำนวณตามราคาซื้อจริงต่อลิตร
                        </div>
                    </div>
                </div>

                {/* Filters & Search Toolbar */}
                <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border border-slate-200/90 dark:border-base-800 shadow-2xs space-y-3.5">
                    {/* Chemical Species Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                            สารเคมี:
                        </span>
                        <button
                            onClick={() => setSelectedChemical('ALL')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                selectedChemical === 'ALL'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-base-750'
                            }`}
                        >
                            ทั้งหมด ({logs.length})
                        </button>
                        {allChemicals.map(chem => {
                            const count = logs.filter(l => l.chemicalName.toLowerCase() === chem.toLowerCase()).length;
                            return (
                                <button
                                    key={chem}
                                    onClick={() => setSelectedChemical(chem)}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                                        selectedChemical === chem
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-base-750'
                                    }`}
                                >
                                    <span>{chem}</span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                        selectedChemical === chem ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-base-700 text-slate-600 dark:text-slate-300'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Secondary Filters: Date Range + Search */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-base-800">
                        {/* Time filter buttons */}
                        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                                ช่วงเวลา:
                            </span>
                            <button
                                onClick={() => setDateFilter('all')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    dateFilter === 'all'
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-base-800'
                                }`}
                            >
                                ทุกช่วงเวลา
                            </button>
                            <button
                                onClick={() => setDateFilter('month')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    dateFilter === 'month'
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-base-800'
                                }`}
                            >
                                เดือนนี้
                            </button>
                            <button
                                onClick={() => setDateFilter('30days')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    dateFilter === '30days'
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-base-800'
                                }`}
                            >
                                30 วันล่าสุด
                            </button>
                            <button
                                onClick={() => setDateFilter('7days')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    dateFilter === '7days'
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-base-800'
                                }`}
                            >
                                7 วันล่าสุด
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="relative w-full sm:w-72">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="ค้นหาคนกลั่น, สารเคมี, หมายเหตุ..."
                                className="w-full pl-9 pr-3.5 py-1.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <XCircleIcon className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Ledger Data Table */}
                <div className="bg-white dark:bg-base-900 rounded-2xl border border-slate-200/90 dark:border-base-800 shadow-2xs overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-base-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                                ตารางประวัติบันทึกการกลั่นสารเคมี (Distillation Ledger)
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-400">
                                {filteredLogs.length} รายการ
                            </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                            เรียงลำดับจากวันที่ล่าสุด
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/80 dark:bg-base-850 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-base-800">
                                    <th className="px-4 py-3">วันที่กลั่น (Date)</th>
                                    <th className="px-4 py-3">สารเคมี (Chemical)</th>
                                    <th className="px-4 py-3">ผู้ทำการกลั่น (Operator)</th>
                                    <th className="px-4 py-3 text-right">สารตั้งต้น (Input)</th>
                                    <th className="px-4 py-3 text-right">สารที่ได้ (Output)</th>
                                    <th className="px-4 py-3 text-center">ประสิทธิภาพ (% Yield)</th>
                                    <th className="px-4 py-3 text-right">ประหยัดได้ (฿)</th>
                                    <th className="px-4 py-3">หมายเหตุ</th>
                                    <th className="px-4 py-3 text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-base-800/80 text-xs">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={9} className="py-16 text-center text-slate-400 font-bold">
                                            <div className="flex flex-col items-center gap-2">
                                                <RefreshIcon className="w-6 h-6 animate-spin text-indigo-500" />
                                                <span>กำลังโหลดข้อมูลบันทึกการกลั่น...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="py-16 text-center text-slate-400 font-bold">
                                            <div className="flex flex-col items-center gap-2">
                                                <BeakerIcon className="w-10 h-10 text-slate-300 dark:text-base-700" />
                                                <span>ไม่พบรายการบันทึกการกลั่นสารเคมีตามเงื่อนไขที่เลือก</span>
                                                <button
                                                    onClick={handleOpenAddModal}
                                                    className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-all"
                                                >
                                                    + บันทึกรอบแรกตอนนี้
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map(log => {
                                        const price = chemicalPrices[log.chemicalName] || 350;
                                        const costSaved = ((log.outputAmount || 0) / 1000) * price;
                                        const isPassYield = log.yieldPercent >= 95;

                                        return (
                                            <tr 
                                                key={log.id} 
                                                className="hover:bg-slate-50/70 dark:hover:bg-base-850/50 transition-colors"
                                            >
                                                {/* Date */}
                                                <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                                                        <span>{log.date}</span>
                                                    </div>
                                                </td>

                                                {/* Chemical */}
                                                <td className="px-4 py-3.5">
                                                    <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 whitespace-nowrap">
                                                        {log.chemicalName}
                                                    </span>
                                                </td>

                                                {/* Operator (คนกลั่น) */}
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-base-750 flex items-center justify-center text-[10px] font-black text-slate-700 dark:text-slate-200">
                                                            {log.recorderName ? log.recorderName.charAt(0) : '?'}
                                                        </div>
                                                        <span className="font-bold text-slate-900 dark:text-slate-100">
                                                            {log.recorderName || '-'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Input */}
                                                <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                    {log.inputAmount.toLocaleString()} <span className="text-[10px] text-slate-400">ml</span>
                                                </td>

                                                {/* Output */}
                                                <td className="px-4 py-3.5 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                                                    {log.outputAmount.toLocaleString()} <span className="text-[10px] text-slate-400">ml</span>
                                                </td>

                                                {/* Yield % */}
                                                <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                                                            isPassYield
                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                                                : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                                        }`}>
                                                            {log.yieldPercent}%
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Cost Saved */}
                                                <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                    ฿{costSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>

                                                {/* Notes */}
                                                <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={log.notes || ''}>
                                                    {log.notes || '-'}
                                                </td>

                                                {/* Actions */}
                                                <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => handleOpenEditModal(log)}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-base-800 transition-all"
                                                            title="แก้ไขรายการ"
                                                        >
                                                            <PencilIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTarget(log)}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
                                                            title="ลบรายการ"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal: Add / Edit Distillation Log */}
            {isFormModalOpen && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setIsFormModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-base-750 w-full max-w-lg overflow-hidden animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-base-800 flex items-center justify-between bg-slate-50/60 dark:bg-base-850">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                                    <BeakerIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                                        {editingLog ? 'แก้ไขบันทึกการกลั่นสารเคมี' : 'บันทึกการกลั่นสารเคมีรอบใหม่'}
                                    </h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        กรอกข้อมูลการกลั่นตัวทำละลายเพื่อคำนวณ Yield และอัตราการคืนสาร
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsFormModalOpen(false)}
                                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <XCircleIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveBatch} className="p-6 space-y-4">
                            {/* Date & Chemical */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                        วันที่ทำการกลั่น *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={formDate}
                                        onChange={e => setFormDate(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                        ชนิดสารเคมี (Chemical) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        list="chemical-suggestions"
                                        value={formChemical}
                                        onChange={e => setFormChemical(e.target.value)}
                                        placeholder="เช่น Ethanol, Methanol..."
                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    />
                                    <datalist id="chemical-suggestions">
                                        {allChemicals.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                            </div>

                            {/* Operator (คนกลั่น) */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                    ผู้ทำการกลั่น (Operator / คนกลั่น) *
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        list="operator-suggestions"
                                        value={formOperator}
                                        onChange={e => setFormOperator(e.target.value)}
                                        placeholder="ระบุชื่อผู้ทำการกลั่น เช่น เบน, โต้, ทีม..."
                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    />
                                    <datalist id="operator-suggestions">
                                        {testers.map(t => <option key={t.id} value={t.name} />)}
                                        <option value="เบน" />
                                        <option value="โต้" />
                                        <option value="ทีม" />
                                        <option value="กิตติศักดิ์" />
                                        <option value="ชัยกร" />
                                    </datalist>
                                </div>
                            </div>

                            {/* Input Amount (ml) & Output Amount (ml) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                        ปริมาณสารตั้งต้น Input (ml) *
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        min="1"
                                        value={formInputAmount}
                                        onChange={e => setFormInputAmount(e.target.value)}
                                        placeholder="5000"
                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                        ปริมาณที่กลั่นได้ Output (ml) *
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        min="0"
                                        value={formOutputAmount}
                                        onChange={e => setFormOutputAmount(e.target.value)}
                                        placeholder="4800"
                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Live Yield Preview Card */}
                            <div className={`p-4 rounded-2xl flex items-center justify-between border transition-all ${
                                liveYield >= 95
                                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                                    : 'bg-amber-50/80 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                            }`}>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-wider opacity-75">
                                        คำนวณเปอร์เซ็นต์ Yield ทันที:
                                    </div>
                                    <div className="text-xs font-bold mt-0.5">
                                        {liveYield >= 95 ? '✓ ผ่านเกณฑ์มาตรฐานการกลั่นแล็บ' : '⚠ ต่ำกว่าเกณฑ์มาตรฐาน 95%'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black tracking-tight">
                                        {liveYield}%
                                    </div>
                                    <div className="text-[10px] opacity-75 font-mono">
                                        ({formOutputAmount || 0} / {formInputAmount || 0}) × 100
                                    </div>
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                    หมายเหตุรอบการกลั่น (Notes)
                                </label>
                                <textarea
                                    rows={2}
                                    value={formNotes}
                                    onChange={e => setFormNotes(e.target.value)}
                                    placeholder="ระบุวัตถุประสงค์ เช่น นำกลับมาใช้ล้างเครื่องแก้ว, ผลตรวจสอบความบริสุทธิ์..."
                                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400"
                                />
                            </div>

                            {/* Modal Actions */}
                            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsFormModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-base-800 transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
                                >
                                    {isSubmitting ? 'กำลังบันทึก...' : (editingLog ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Configure Chemical Prices */}
            {isPriceModalOpen && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setIsPriceModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-base-750 w-full max-w-lg overflow-hidden animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-base-800 flex items-center justify-between bg-slate-50/60 dark:bg-base-850">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                    <CurrencyDollarIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                                        ตั้งค่าราคาสารเคมีต่อลิตร (฿ / Liter)
                                    </h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        ใช้คำนวณมูลค่าต้นทุนที่ประหยัดได้จริงจากการกลั่นหมุนเวียน
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsPriceModalOpen(false)}
                                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <XCircleIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSavePrices} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                                {allChemicals.map(chem => (
                                    <div key={chem} className="p-3 bg-slate-50 dark:bg-base-800 rounded-xl border border-slate-200/80 dark:border-base-700 space-y-1">
                                        <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                                            <span>{chem}</span>
                                            <span className="text-[10px] text-slate-400 font-normal">บาท/L</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={tempPrices[chem] ?? '350'}
                                            onChange={e => setTempPrices({ ...tempPrices, [chem]: e.target.value })}
                                            className="w-full px-3 py-1.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-lg text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsPriceModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-base-800 transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
                                >
                                    บันทึกราคา
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Confirm Delete */}
            {deleteTarget && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setDeleteTarget(null)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-base-750 w-full max-w-sm overflow-hidden p-6 text-center space-y-4 animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
                            <TrashIcon className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                                ยืนยันการลบบันทึกการกลั่น?
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                คุณต้องการลบรายการกลั่น <span className="font-bold text-rose-600">{deleteTarget.chemicalName}</span> วันที่ {deleteTarget.date} (Output {deleteTarget.outputAmount} ml) หรือไม่?
                            </p>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-base-800 transition-all"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleDeleteBatch}
                                className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md shadow-rose-600/20"
                            >
                                ยืนยันลบ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DistillationTab;
