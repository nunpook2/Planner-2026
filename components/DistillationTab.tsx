import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { DistillationLog, Tester } from '../types';
import { 
    getDistillationLogs, 
    addDistillationLog, 
    updateDistillationLog, 
    deleteDistillationLog,
    getChemicalPrices,
    saveChemicalPrices,
    getTesters,
    addTester,
    updateTester
} from '../services/dataService';
import { REAL_LAB_ROSTER, getStaffProfile, isValidStaffName, isMachineOrDocId } from '../utils/staffUtils';
import { 
    BeakerIcon, RefreshIcon, PlusIcon, TrashIcon, PencilIcon, 
    SearchIcon, DownloadIcon, CheckCircleIcon, XCircleIcon, 
    CurrencyDollarIcon, CalendarIcon, UserGroupIcon
} from './common/Icons';

declare const XLSX: any;

interface DistillationTabProps {
    testers: Tester[];
    onDataUpdated?: () => void;
}

export interface LinkedOperatorOption {
    id: string;
    value: string;          // Value stored in recorderName (e.g. 'เบน', 'พรทักข์')
    shortName: string;      // e.g. 'เบน', 'พรทักข์'
    fullLabel: string;      // e.g. 'คุณเบน (Ben) — ผู้ช่วยห้องปฏิบัติการ'
    teamGroup: 'assistants' | 'testers' | 'custom';
    role: string;
    enName: string;
}

interface RecordedChemicalSummary {
    name: string;
    count: number;
    totalIn: number;
    totalOut: number;
    avgYield: number;
    totalSaved: number;
    lastDate: string;
}

const CHEMICAL_COLOR_PALETTES = [
    {
        badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
        activePill: 'bg-indigo-600 text-white border-indigo-600 shadow-xs',
        cardBorder: 'border-indigo-200/90 dark:border-indigo-900/60 hover:border-indigo-400',
        cardActive: 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20',
        accentDot: 'bg-indigo-500',
        accentText: 'text-indigo-600 dark:text-indigo-400'
    },
    {
        badge: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
        activePill: 'bg-cyan-600 text-white border-cyan-600 shadow-xs',
        cardBorder: 'border-cyan-200/90 dark:border-cyan-900/60 hover:border-cyan-400',
        cardActive: 'bg-cyan-50/70 dark:bg-cyan-950/40 border-cyan-500 ring-2 ring-cyan-500/20',
        accentDot: 'bg-cyan-500',
        accentText: 'text-cyan-600 dark:text-cyan-400'
    },
    {
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        activePill: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
        cardBorder: 'border-emerald-200/90 dark:border-emerald-900/60 hover:border-emerald-400',
        cardActive: 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20',
        accentDot: 'bg-emerald-500',
        accentText: 'text-emerald-600 dark:text-emerald-400'
    },
    {
        badge: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
        activePill: 'bg-violet-600 text-white border-violet-600 shadow-xs',
        cardBorder: 'border-violet-200/90 dark:border-violet-900/60 hover:border-violet-400',
        cardActive: 'bg-violet-50/70 dark:bg-violet-950/40 border-violet-500 ring-2 ring-violet-500/20',
        accentDot: 'bg-violet-500',
        accentText: 'text-violet-600 dark:text-violet-400'
    },
    {
        badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        activePill: 'bg-amber-600 text-white border-amber-600 shadow-xs',
        cardBorder: 'border-amber-200/90 dark:border-amber-900/60 hover:border-amber-400',
        cardActive: 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/20',
        accentDot: 'bg-amber-500',
        accentText: 'text-amber-600 dark:text-amber-400'
    },
    {
        badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        activePill: 'bg-rose-600 text-white border-rose-600 shadow-xs',
        cardBorder: 'border-rose-200/90 dark:border-rose-900/60 hover:border-rose-400',
        cardActive: 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20',
        accentDot: 'bg-rose-500',
        accentText: 'text-rose-600 dark:text-rose-400'
    }
];

export const DistillationTab: React.FC<DistillationTabProps> = ({ testers: propTesters, onDataUpdated }) => {
    const [logs, setLogs] = useState<DistillationLog[]>([]);
    const [dbTesters, setDbTesters] = useState<Tester[]>(propTesters || []);
    const [chemicalPrices, setChemicalPrices] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);

    // Table filters
    const [selectedChemical, setSelectedChemical] = useState<string>('ALL');
    const [selectedOperatorFilter, setSelectedOperatorFilter] = useState<string>('ALL');
    const [dateFilter, setDateFilter] = useState<'all' | 'month' | '7days' | '30days'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

    // Modal States
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<DistillationLog | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DistillationLog | null>(null);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

    // Form inputs inside Add/Edit Modal
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formChemical, setFormChemical] = useState('');
    const [isCustomChemicalMode, setIsCustomChemicalMode] = useState(false);
    const [customChemicalName, setCustomChemicalName] = useState('');
    const [customChemicalPrice, setCustomChemicalPrice] = useState('350');

    const [formOperator, setFormOperator] = useState('');
    const [isAddingNewPerson, setIsAddingNewPerson] = useState(false);
    const [newPersonName, setNewPersonName] = useState('');
    const [newPersonTeam, setNewPersonTeam] = useState<'assistants_4_2' | 'testers_3_3'>('assistants_4_2');
    const [isSavingPerson, setIsSavingPerson] = useState(false);

    const [formInputAmount, setFormInputAmount] = useState('5000');
    const [formOutputAmount, setFormOutputAmount] = useState('4800');
    const [formNotes, setFormNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Chemical price inputs in Price Modal
    const [tempPrices, setTempPrices] = useState<Record<string, string>>({});
    const [newPriceChemName, setNewPriceChemName] = useState('');
    const [newPriceChemVal, setNewPriceChemVal] = useState('350');

    const showToast = useCallback((text: string, isError = false) => {
        setToastMessage({ text, isError });
        setTimeout(() => setToastMessage(null), 3500);
    }, []);

    useEffect(() => {
        if (propTesters && propTesters.length > 0) {
            setDbTesters(propTesters);
        }
    }, [propTesters]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fetchedLogs, fetchedPrices, fetchedTesters] = await Promise.all([
                getDistillationLogs(),
                getChemicalPrices(),
                getTesters().catch(() => [])
            ]);
            setLogs(fetchedLogs);
            setChemicalPrices(fetchedPrices);
            if (fetchedTesters && fetchedTesters.length > 0) {
                setDbTesters(fetchedTesters);
            }
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

    // Build unified, deduplicated Personnel List linked to the central database (analysts + REAL_LAB_ROSTER)
    const linkedStaffList = useMemo<LinkedOperatorOption[]>(() => {
        const map = new Map<string, LinkedOperatorOption>();

        const assistantsRoster = REAL_LAB_ROSTER.filter(s => s.team.includes('Assistants') || s.team.includes('4:2'));
        const testersRoster = REAL_LAB_ROSTER.filter(s => !s.team.includes('Assistants') && !s.team.includes('4:2'));

        [...assistantsRoster, ...testersRoster].forEach(prof => {
            const canonicalKey = prof.key.toLowerCase();
            const isAsst = prof.team.includes('Assistants') || prof.team.includes('4:2');
            map.set(canonicalKey, {
                id: prof.docId || prof.key,
                value: prof.thShort,
                shortName: prof.thShort,
                fullLabel: `${prof.thName} (${prof.enName}) — ${prof.role}`,
                teamGroup: isAsst ? 'assistants' : 'testers',
                role: prof.role,
                enName: prof.enName
            });
        });

        dbTesters.forEach(t => {
            const rawName = (t.name || '').trim();
            if (!rawName && !t.id) return;

            const prof = getStaffProfile(rawName || t.id, dbTesters);
            const canonicalKey = prof.key.toLowerCase();

            if (map.has(canonicalKey)) {
                const existing = map.get(canonicalKey)!;
                map.set(canonicalKey, {
                    ...existing,
                    id: t.id || existing.id
                });
            } else if (rawName && !isMachineOrDocId(rawName) && isValidStaffName(rawName)) {
                const cleanShort = rawName.replace(/^คุณ/, '').trim();
                const isAsst = t.team === 'assistants_4_2';
                map.set(cleanShort.toLowerCase(), {
                    id: t.id,
                    value: cleanShort,
                    shortName: cleanShort,
                    fullLabel: `คุณ${cleanShort} — ${isAsst ? 'ผู้ช่วยห้องปฏิบัติการ (4:2)' : 'นักวิเคราะห์ (3:3)'}`,
                    teamGroup: isAsst ? 'assistants' : 'testers',
                    role: isAsst ? 'ผู้ช่วยห้องปฏิบัติการ' : 'นักวิเคราะห์ (Analyst)',
                    enName: cleanShort
                });
            }
        });

        logs.forEach(l => {
            const rawOp = (l.recorderName || '').trim();
            if (!rawOp) return;
            const prof = getStaffProfile(rawOp, dbTesters);
            const canonicalKey = prof.key.toLowerCase();
            if (!map.has(canonicalKey) && !map.has(rawOp.toLowerCase())) {
                const cleanShort = rawOp.replace(/^คุณ/, '').trim();
                map.set(cleanShort.toLowerCase(), {
                    id: `log_${cleanShort}`,
                    value: cleanShort,
                    shortName: cleanShort,
                    fullLabel: `คุณ${cleanShort} — เจ้าหน้าที่ห้องปฏิบัติการ`,
                    teamGroup: 'custom',
                    role: 'เจ้าหน้าที่ห้องปฏิบัติการ',
                    enName: cleanShort
                });
            }
        });

        return Array.from(map.values());
    }, [dbTesters, logs]);

    const resolveOperatorDisplay = useCallback((rawRecorderName: string) => {
        if (!rawRecorderName) {
            return { shortName: '-', thName: '-', enName: '', role: '', canonicalKey: '' };
        }
        const prof = getStaffProfile(rawRecorderName, dbTesters);
        return {
            shortName: prof.thShort,
            thName: prof.thName,
            enName: prof.enName,
            role: prof.role,
            canonicalKey: prof.key.toLowerCase()
        };
    }, [dbTesters]);

    // STRICTLY ONLY CHEMICALS THAT HAVE BEEN RECORDED IN LOGS ("แสดงเฉพาะสารที่เคยมีบันทึกไว้เท่านั้น จะได้ไม่รก และหาง่าย")
    const recordedChemicalsSummary = useMemo<RecordedChemicalSummary[]>(() => {
        const map = new Map<string, { name: string; count: number; totalIn: number; totalOut: number; totalSaved: number; lastDate: string }>();

        logs.forEach(l => {
            const rawName = (l.chemicalName || '').trim();
            if (!rawName) return;
            const key = rawName.toLowerCase();
            const inAmt = Number(l.inputAmount) || 0;
            const outAmt = Number(l.outputAmount) || 0;
            const price = chemicalPrices[rawName] || 350;
            const saved = (outAmt / 1000) * price;

            const existing = map.get(key);
            if (existing) {
                existing.count += 1;
                existing.totalIn += inAmt;
                existing.totalOut += outAmt;
                existing.totalSaved += saved;
                if ((l.date || '') > existing.lastDate) {
                    existing.lastDate = l.date || '';
                }
            } else {
                map.set(key, {
                    name: rawName,
                    count: 1,
                    totalIn: inAmt,
                    totalOut: outAmt,
                    totalSaved: saved,
                    lastDate: l.date || ''
                });
            }
        });

        return Array.from(map.values())
            .map(item => ({
                ...item,
                avgYield: item.totalIn > 0 ? Number(((item.totalOut / item.totalIn) * 100).toFixed(1)) : 0
            }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [logs, chemicalPrices]);

    const recordedChemicalNames = useMemo(() => {
        return recordedChemicalsSummary.map(c => c.name);
    }, [recordedChemicalsSummary]);

    // Map each recorded chemical to a consistent semantic color palette
    const getChemicalPalette = useCallback((chemName: string) => {
        const idx = recordedChemicalNames.findIndex(c => c.toLowerCase() === (chemName || '').toLowerCase());
        const safeIdx = idx >= 0 ? idx : Math.abs((chemName || '').charCodeAt(0) || 0);
        return CHEMICAL_COLOR_PALETTES[safeIdx % CHEMICAL_COLOR_PALETTES.length];
    }, [recordedChemicalNames]);

    // Filtered logs for table & KPIs
    const filteredLogs = useMemo(() => {
        const now = new Date();
        const currentMonthPrefix = now.toISOString().slice(0, 7);
        const q = searchQuery.toLowerCase().trim();

        return logs.filter(log => {
            if (selectedChemical !== 'ALL' && log.chemicalName.toLowerCase() !== selectedChemical.toLowerCase()) {
                return false;
            }

            if (selectedOperatorFilter !== 'ALL') {
                const logOp = resolveOperatorDisplay(log.recorderName);
                const filterOp = resolveOperatorDisplay(selectedOperatorFilter);
                if (logOp.canonicalKey !== filterOp.canonicalKey && log.recorderName.trim() !== selectedOperatorFilter.trim()) {
                    return false;
                }
            }

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

            if (q) {
                const opInfo = resolveOperatorDisplay(log.recorderName);
                const matchOp =
                    log.recorderName?.toLowerCase().includes(q) ||
                    opInfo.thName.toLowerCase().includes(q) ||
                    opInfo.enName.toLowerCase().includes(q) ||
                    opInfo.shortName.toLowerCase().includes(q);
                const matchChem = log.chemicalName?.toLowerCase().includes(q);
                const matchNotes = log.notes?.toLowerCase().includes(q);
                if (!matchOp && !matchChem && !matchNotes) return false;
            }

            return true;
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [logs, selectedChemical, selectedOperatorFilter, dateFilter, searchQuery, resolveOperatorDisplay]);

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

    // Open Add Modal
    const handleOpenAddModal = (preselectChem?: string) => {
        setEditingLog(null);
        setFormDate(new Date().toISOString().split('T')[0]);
        const hasRecorded = recordedChemicalNames.length > 0;
        setIsCustomChemicalMode(!hasRecorded);
        setCustomChemicalName('');
        setCustomChemicalPrice('350');

        const initialChem = preselectChem || (selectedChemical !== 'ALL' ? selectedChemical : (recordedChemicalNames[0] || ''));
        setFormChemical(initialChem);

        const defaultOp = selectedOperatorFilter !== 'ALL'
            ? selectedOperatorFilter
            : (linkedStaffList[0]?.value || 'เบน');
        setFormOperator(defaultOp);
        setIsAddingNewPerson(false);
        setNewPersonName('');

        setFormInputAmount('5000');
        setFormOutputAmount('4800');
        setFormNotes('');
        setIsFormModalOpen(true);
    };

    // Open Edit Modal
    const handleOpenEditModal = (log: DistillationLog) => {
        setEditingLog(log);
        setFormDate(log.date);
        setIsCustomChemicalMode(false);
        setCustomChemicalName('');
        setFormChemical(log.chemicalName);

        const resolved = resolveOperatorDisplay(log.recorderName);
        const matchedOption = linkedStaffList.find(
            opt => opt.value.toLowerCase() === log.recorderName?.trim().toLowerCase() ||
                   opt.shortName.toLowerCase() === resolved.shortName.toLowerCase()
        );
        setFormOperator(matchedOption ? matchedOption.value : (log.recorderName || linkedStaffList[0]?.value || ''));
        setIsAddingNewPerson(false);
        setNewPersonName('');

        setFormInputAmount(String(log.inputAmount));
        setFormOutputAmount(String(log.outputAmount));
        setFormNotes(log.notes || '');
        setIsFormModalOpen(true);
    };

    // Add a new person directly to the central database (`analysts` collection)
    const handleQuickAddPersonToDatabase = async () => {
        const cleanName = newPersonName.trim();
        if (!cleanName) {
            showToast('กรุณากรอกชื่อพนักงานที่ต้องการเพิ่ม', true);
            return;
        }
        setIsSavingPerson(true);
        try {
            const added = await addTester(cleanName);
            await updateTester(added.id, {
                name: cleanName,
                team: newPersonTeam,
                requiresProficiencyCheck: false
            });
            const updatedTesters = await getTesters().catch(() => [...dbTesters, { id: added.id, name: cleanName, team: newPersonTeam }]);
            setDbTesters(updatedTesters);
            const shortClean = cleanName.replace(/^คุณ/, '').trim();
            setFormOperator(shortClean);
            setIsAddingNewPerson(false);
            setNewPersonName('');
            if (onDataUpdated) onDataUpdated();
            showToast(`เพิ่มรายชื่อ "${cleanName}" ลงในฐานข้อมูลบุคลากรเรียบร้อยแล้ว`);
        } catch (err) {
            console.error('Error adding person to database:', err);
            const shortClean = cleanName.replace(/^คุณ/, '').trim();
            setDbTesters(prev => [...prev, { id: `local_${Date.now()}`, name: shortClean, team: newPersonTeam }]);
            setFormOperator(shortClean);
            setIsAddingNewPerson(false);
            setNewPersonName('');
            showToast(`เลือกผู้กลั่น "${cleanName}" เรียบร้อยแล้ว`);
        } finally {
            setIsSavingPerson(false);
        }
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

        const finalChemical = isCustomChemicalMode ? customChemicalName.trim() : formChemical.trim();
        const finalOperator = formOperator.trim();

        if (!finalChemical) {
            showToast('กรุณาเลือกหรือระบุชนิดสารเคมีที่กลั่น', true);
            return;
        }
        if (!finalOperator) {
            showToast('กรุณาเลือกผู้ทำการกลั่นจากฐานข้อมูล', true);
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
            if (isCustomChemicalMode && finalChemical) {
                const parsedPrice = parseFloat(customChemicalPrice) || 350;
                const updatedPrices = { ...chemicalPrices, [finalChemical]: parsedPrice };
                await saveChemicalPrices(updatedPrices);
                setChemicalPrices(updatedPrices);
            }

            if (editingLog && editingLog.id) {
                await updateDistillationLog(editingLog.id, {
                    chemicalName: finalChemical,
                    inputAmount,
                    outputAmount,
                    yieldPercent,
                    date: formDate,
                    recorderName: finalOperator,
                    notes: formNotes.trim()
                });
                showToast(`อัปเดตบันทึกการกลั่น ${finalChemical} (ผู้กลั่น: ${finalOperator}) เรียบร้อยแล้ว`);
            } else {
                await addDistillationLog({
                    chemicalName: finalChemical,
                    inputAmount,
                    outputAmount,
                    yieldPercent,
                    date: formDate,
                    recorderName: finalOperator,
                    notes: formNotes.trim()
                });
                if (selectedChemical !== 'ALL' && selectedChemical.toLowerCase() !== finalChemical.toLowerCase()) {
                    setSelectedChemical('ALL');
                }
                showToast(`บันทึกการกลั่น ${finalChemical} สำเร็จ (Yield ${yieldPercent}% · ผู้กลั่น: ${finalOperator})`);
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
            if (selectedChemical.toLowerCase() === deleteTarget.chemicalName.toLowerCase()) {
                const remainingSameChem = logs.filter(
                    l => l.id !== deleteTarget.id && l.chemicalName.toLowerCase() === deleteTarget.chemicalName.toLowerCase()
                );
                if (remainingSameChem.length === 0) {
                    setSelectedChemical('ALL');
                }
            }
            showToast(`ลบบันทึกการกลั่น ${deleteTarget.chemicalName} วันที่ ${deleteTarget.date} แล้ว`);
            setDeleteTarget(null);
            await fetchData();
            if (onDataUpdated) onDataUpdated();
        } catch (err) {
            console.error('Error deleting distillation log:', err);
            showToast('ไม่สามารถลบรายการได้', true);
        }
    };

    // Open price configuration modal (only recorded chemicals shown so it is never cluttered)
    const handleOpenPriceModal = () => {
        const initialPrices: Record<string, string> = {};
        recordedChemicalNames.forEach(chem => {
            initialPrices[chem] = String(chemicalPrices[chem] || 350);
        });
        setTempPrices(initialPrices);
        setNewPriceChemName('');
        setNewPriceChemVal('350');
        setIsPriceModalOpen(true);
    };

    const handleAddChemInPriceModal = () => {
        const clean = newPriceChemName.trim();
        if (!clean) return;
        setTempPrices(prev => ({
            ...prev,
            [clean]: String(parseFloat(newPriceChemVal) || 350)
        }));
        setNewPriceChemName('');
        setNewPriceChemVal('350');
    };

    const handleSavePrices = async (e: React.FormEvent) => {
        e.preventDefault();
        const updated: Record<string, number> = { ...chemicalPrices };
        Object.entries(tempPrices).forEach(([chem, val]) => {
            const num = parseFloat(String(val)) || 0;
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

            const excelRows = filteredLogs.map((log, index) => {
                const price = chemicalPrices[log.chemicalName] || 350;
                const costSaved = ((log.outputAmount || 0) / 1000) * price;
                const opInfo = resolveOperatorDisplay(log.recorderName);
                return {
                    'ลำดับ (No.)': index + 1,
                    'วันที่กลั่น (Date)': log.date,
                    'ชื่อสารเคมี (Chemical)': log.chemicalName,
                    'ผู้ทำการกลั่น (Operator)': `${opInfo.thName}${opInfo.enName ? ` (${opInfo.enName})` : ''}`,
                    'ตำแหน่ง (Role)': opInfo.role || '-',
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

    const assistantsGroup = useMemo(() => linkedStaffList.filter(s => s.teamGroup === 'assistants'), [linkedStaffList]);
    const testersGroup = useMemo(() => linkedStaffList.filter(s => s.teamGroup === 'testers'), [linkedStaffList]);
    const customGroup = useMemo(() => linkedStaffList.filter(s => s.teamGroup === 'custom'), [linkedStaffList]);

    return (
        <div className="flex-1 w-full space-y-5 pb-14 font-sans animate-fade-in">
            {/* Toast Notification */}
            {toastMessage && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-xs font-bold transition-all ${
                    toastMessage.isError 
                        ? 'bg-rose-600 text-white' 
                        : 'bg-emerald-600 text-white'
                }`}>
                    {toastMessage.isError ? <XCircleIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* SECTION 1: SYSTEM HEADER & PRIMARY ACTION BAR */}
            <div className="bg-white dark:bg-base-900 rounded-2xl border border-slate-200/90 dark:border-base-800 shadow-2xs overflow-hidden">
                <div className="px-6 py-5 bg-gradient-to-r from-indigo-50/70 via-white to-cyan-50/50 dark:from-base-900 dark:via-base-900 dark:to-indigo-950/20 border-b border-slate-100 dark:border-base-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                            <BeakerIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                    ระบบบันทึกการกลั่นสารเคมี (Chemical Distillation Log)
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    Solvent Recovery
                                </span>
                                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    🔗 เชื่อมฐานข้อมูลบุคลากร ({linkedStaffList.length} คน)
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                                แสดงเฉพาะสารเคมีที่มีประวัติการบันทึกจริง ({recordedChemicalNames.length} ชนิด) เพื่อให้ค้นหาง่าย เป็นระเบียบ ไม่รกตา
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={handleOpenPriceModal}
                            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 hover:bg-slate-50 dark:hover:bg-base-750 transition-all shadow-2xs cursor-pointer"
                        >
                            <CurrencyDollarIcon className="w-4 h-4 text-emerald-600" />
                            <span>ตั้งค่าราคาสาร (฿/L)</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleExportExcel}
                            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 hover:bg-slate-50 dark:hover:bg-base-750 transition-all shadow-2xs cursor-pointer"
                        >
                            <DownloadIcon className="w-4 h-4 text-indigo-600" />
                            <span>ส่งออก Excel</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleOpenAddModal()}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
                        >
                            <PlusIcon className="w-4 h-4" />
                            <span>+ บันทึกการกลั่นสารเคมี</span>
                        </button>
                    </div>
                </div>

                {/* 4 Proportional Color-Coded KPI Cards */}
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/40 dark:bg-base-950/30">
                    {/* KPI 1: Input */}
                    <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border-l-4 border-l-indigo-500 border border-slate-200/90 dark:border-base-800 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                1. สารตั้งต้นใช้กลั่น (Input)
                            </span>
                            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                <BeakerIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2 font-mono tabular-nums">
                            <span className="text-2xl font-black text-slate-900 dark:text-white">
                                {kpiSummary.totalIn.toLocaleString()}
                            </span>
                            <span className="text-xs font-bold text-slate-400">ml</span>
                            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                                ({(kpiSummary.totalIn / 1000).toFixed(1)} L)
                            </span>
                        </div>
                        <div className="mt-1.5 text-[11px] text-slate-400 font-medium">
                            จากบันทึกทั้งหมด {kpiSummary.batchCount} รอบการกลั่น
                        </div>
                    </div>

                    {/* KPI 2: Output */}
                    <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border-l-4 border-l-cyan-500 border border-slate-200/90 dark:border-base-800 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                                2. กลั่นได้บริสุทธิ์ (Output)
                            </span>
                            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400">
                                <RefreshIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2 font-mono tabular-nums">
                            <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
                                {kpiSummary.totalOut.toLocaleString()}
                            </span>
                            <span className="text-xs font-bold text-slate-400">ml</span>
                            <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                                ({(kpiSummary.totalOut / 1000).toFixed(1)} L)
                            </span>
                        </div>
                        <div className="mt-1.5 text-[11px] text-slate-400 font-medium">
                            ปริมาณสารบริสุทธิ์ที่นำกลับมาใช้ซ้ำได้
                        </div>
                    </div>

                    {/* KPI 3: % Yield */}
                    <div className={`bg-white dark:bg-base-900 rounded-2xl p-4 border-l-4 ${
                        kpiSummary.avgYield >= 95 ? 'border-l-emerald-500' : 'border-l-amber-500'
                    } border border-slate-200/90 dark:border-base-800 shadow-2xs`}>
                        <div className="flex items-center justify-between">
                            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
                                kpiSummary.avgYield >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                            }`}>
                                3. ประสิทธิภาพ (% Yield)
                            </span>
                            <div className={`p-2 rounded-xl ${
                                kpiSummary.avgYield >= 95 
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' 
                                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                            }`}>
                                <CheckCircleIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2 font-mono tabular-nums">
                            <span className={`text-2xl font-black ${
                                kpiSummary.avgYield >= 95 
                                    ? 'text-emerald-600 dark:text-emerald-400' 
                                    : 'text-amber-600 dark:text-amber-400'
                            }`}>
                                {kpiSummary.avgYield.toFixed(1)}%
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-sans font-extrabold ${
                                kpiSummary.avgYield >= 95 
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                            }`}>
                                {kpiSummary.avgYield >= 95 ? 'ผ่านเกณฑ์ (≥95%)' : 'ต่ำกว่าเกณฑ์ (<95%)'}
                            </span>
                        </div>
                        <div className="mt-1.5 text-[11px] text-slate-400 font-medium">
                            เกณฑ์มาตรฐานห้องปฏิบัติการ ≥ 95.0%
                        </div>
                    </div>

                    {/* KPI 4: Cost Saved */}
                    <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border-l-4 border-l-teal-500 border border-slate-200/90 dark:border-base-800 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-extrabold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                                4. มูลค่าที่ประหยัดได้
                            </span>
                            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
                                <CurrencyDollarIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1.5 font-mono tabular-nums">
                            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
                                ฿{kpiSummary.totalCostSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="mt-1.5 text-[11px] text-slate-400 font-medium">
                            คำนวณตามราคาสารเคมีต่อลิตร
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 2: RECORDED CHEMICALS SUMMARY CARDS (แสดงเฉพาะสารที่เคยบันทึกไว้ แยกเป็นสัดส่วน มีสีสัน กดกรองได้ทันที) */}
            {recordedChemicalsSummary.length > 0 && (
                <div className="bg-white dark:bg-base-900 rounded-2xl p-5 border border-slate-200/90 dark:border-base-800 shadow-2xs space-y-3.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                                🧪 สรุปแยกตามสารเคมีที่เคยบันทึกไว้ ({recordedChemicalsSummary.length} ชนิด)
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                                • คลิกที่การ์ดสารเคมีเพื่อกรองดูเฉพาะสารนั้น หรือคลิกซ้ำเพื่อดูทั้งหมด
                            </span>
                        </div>
                        {selectedChemical !== 'ALL' && (
                            <button
                                type="button"
                                onClick={() => setSelectedChemical('ALL')}
                                className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                                แสดงสารเคมีทั้งหมด ({logs.length} รายการ)
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                        {recordedChemicalsSummary.map((chemItem) => {
                            const palette = getChemicalPalette(chemItem.name);
                            const isSelected = selectedChemical.toLowerCase() === chemItem.name.toLowerCase();
                            const pricePerLiter = chemicalPrices[chemItem.name] || 350;

                            return (
                                <button
                                    key={chemItem.name}
                                    type="button"
                                    onClick={() => setSelectedChemical(isSelected ? 'ALL' : chemItem.name)}
                                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                                        isSelected
                                            ? palette.cardActive
                                            : `bg-slate-50/50 dark:bg-base-950/40 ${palette.cardBorder}`
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2 w-full">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${palette.accentDot}`} />
                                            <span className="font-black text-sm text-slate-900 dark:text-white truncate">
                                                {chemItem.name}
                                            </span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${palette.badge}`}>
                                            {chemItem.count} รอบ
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-base-800 w-full font-mono tabular-nums">
                                        <div>
                                            <span className="text-[10px] font-sans font-bold text-slate-400 block">กลั่นได้สะสม</span>
                                            <span className={`text-xs font-black ${palette.accentText}`}>
                                                {(chemItem.totalOut / 1000).toFixed(1)} ลิตร
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-sans font-bold text-slate-400 block">เฉลี่ย Yield</span>
                                            <span className={`text-xs font-black ${chemItem.avgYield >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {chemItem.avgYield}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                                        <span>ราคา ฿{pricePerLiter}/L</span>
                                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                            ประหยัด ฿{Math.round(chemItem.totalSaved).toLocaleString()}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* SECTION 3: CLEAN, SYSTEMATIC FILTER & SEARCH BAR */}
            <div className="bg-white dark:bg-base-900 rounded-2xl p-4 border border-slate-200/90 dark:border-base-800 shadow-2xs space-y-3.5">
                {/* Row 1: Recorded Chemicals Filter Pills ONLY */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                        เลือกสารเคมีที่เคยบันทึก:
                    </span>
                    <button
                        type="button"
                        onClick={() => setSelectedChemical('ALL')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                            selectedChemical === 'ALL'
                                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                                : 'bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                    >
                        ทั้งหมด ({logs.length})
                    </button>

                    {recordedChemicalsSummary.map(chemItem => {
                        const isSelected = selectedChemical.toLowerCase() === chemItem.name.toLowerCase();
                        const palette = getChemicalPalette(chemItem.name);
                        return (
                            <button
                                type="button"
                                key={chemItem.name}
                                onClick={() => setSelectedChemical(isSelected ? 'ALL' : chemItem.name)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                                    isSelected
                                        ? palette.activePill
                                        : 'bg-white dark:bg-base-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-base-700 hover:border-indigo-400'
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : palette.accentDot}`} />
                                <span>{chemItem.name}</span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                                    isSelected ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-base-700 text-slate-600 dark:text-slate-300'
                                }`}>
                                    {chemItem.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Row 2: Operator Dropdown + Date Period + Search */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-base-800">
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Operator Filter Linked to Personnel Database */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0">
                                👤 ผู้ทำการกลั่น:
                            </span>
                            <select
                                value={selectedOperatorFilter}
                                onChange={e => setSelectedOperatorFilter(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                            >
                                <option value="ALL">ทุกคนในฐานข้อมูล ({linkedStaffList.length} คน)</option>
                                {assistantsGroup.length > 0 && (
                                    <optgroup label="👥 ทีมผู้ช่วยห้องปฏิบัติการ (Assistants 4:2)">
                                        {assistantsGroup.map(op => (
                                            <option key={op.id} value={op.value}>{op.fullLabel}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {testersGroup.length > 0 && (
                                    <optgroup label="🔬 ทีมนักวิเคราะห์ (Testers 3:3)">
                                        {testersGroup.map(op => (
                                            <option key={op.id} value={op.value}>{op.fullLabel}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {customGroup.length > 0 && (
                                    <optgroup label="📋 รายชื่ออื่นๆ ในประวัติ">
                                        {customGroup.map(op => (
                                            <option key={op.id} value={op.value}>{op.fullLabel}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        {/* Time filter buttons */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-base-800 p-1 rounded-xl border border-slate-200/70 dark:border-base-700">
                            {[
                                { key: 'all', label: 'ทุกช่วงเวลา' },
                                { key: 'month', label: 'เดือนนี้' },
                                { key: '30days', label: '30 วันล่าสุด' },
                                { key: '7days', label: '7 วันล่าสุด' }
                            ].map(item => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => setDateFilter(item.key as any)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        dateFilter === item.key
                                            ? 'bg-white dark:bg-base-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-black'
                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full lg:w-72">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="ค้นหาชื่อคนกลั่น, สารเคมี, หมายเหตุ..."
                            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            >
                                <XCircleIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* SECTION 4: DISTILLATION LEDGER TABLE */}
            <div className="bg-white dark:bg-base-900 rounded-2xl border border-slate-200/90 dark:border-base-800 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-base-800 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                            ตารางประวัติบันทึกการกลั่นสารเคมี (Distillation Ledger)
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            แสดง {filteredLogs.length} รายการ
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        {(selectedChemical !== 'ALL' || selectedOperatorFilter !== 'ALL' || dateFilter !== 'all' || searchQuery) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedChemical('ALL');
                                    setSelectedOperatorFilter('ALL');
                                    setDateFilter('all');
                                    setSearchQuery('');
                                }}
                                className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                            >
                                ✕ ล้างตัวกรองทั้งหมด
                            </button>
                        )}
                        <span className="text-[11px] text-slate-400 font-medium">
                            เรียงลำดับจากวันที่บันทึกล่าสุด
                        </span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/90 dark:bg-base-850 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-base-800">
                                <th className="px-3.5 py-3 w-12 text-center">#</th>
                                <th className="px-4 py-3">วันที่กลั่น</th>
                                <th className="px-4 py-3">สารเคมี (Chemical)</th>
                                <th className="px-4 py-3">ผู้ทำการกลั่น (Operator)</th>
                                <th className="px-4 py-3 text-right">สารตั้งต้น (Input)</th>
                                <th className="px-4 py-3 text-right">กลั่นได้ (Output)</th>
                                <th className="px-4 py-3 text-center">ประสิทธิภาพ (% Yield)</th>
                                <th className="px-4 py-3 text-right">ประหยัดได้ (฿)</th>
                                <th className="px-4 py-3">หมายเหตุ</th>
                                <th className="px-4 py-3 text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-base-800/80 text-xs">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center text-slate-400 font-bold">
                                        <div className="flex flex-col items-center gap-2">
                                            <RefreshIcon className="w-6 h-6 animate-spin text-indigo-500" />
                                            <span>กำลังโหลดข้อมูลบันทึกการกลั่น...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center text-slate-400 font-bold">
                                        <div className="flex flex-col items-center gap-2">
                                            <BeakerIcon className="w-10 h-10 text-slate-300 dark:text-base-700" />
                                            <span>ไม่พบรายการบันทึกการกลั่นสารเคมีตามเงื่อนไขที่เลือก</span>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenAddModal()}
                                                className="mt-2 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer"
                                            >
                                                + บันทึกรอบการกลั่นใหม่ทันที
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log, idx) => {
                                    const price = chemicalPrices[log.chemicalName] || 350;
                                    const costSaved = ((log.outputAmount || 0) / 1000) * price;
                                    const isPassYield = log.yieldPercent >= 95;
                                    const opProfile = resolveOperatorDisplay(log.recorderName);
                                    const palette = getChemicalPalette(log.chemicalName);

                                    return (
                                        <tr 
                                            key={log.id || idx} 
                                            className="hover:bg-slate-50/80 dark:hover:bg-base-850/50 transition-colors"
                                        >
                                            {/* Row Number */}
                                            <td className="px-3.5 py-3.5 text-center font-mono font-bold text-slate-400 tabular-nums">
                                                {idx + 1}
                                            </td>

                                            {/* Date */}
                                            <td className="px-4 py-3.5 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums">
                                                <div className="flex items-center gap-1.5">
                                                    <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                                                    <span>{log.date}</span>
                                                </div>
                                            </td>

                                            {/* Chemical */}
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${palette.badge}`}>
                                                    <span className={`w-2 h-2 rounded-full ${palette.accentDot}`} />
                                                    <span>{log.chemicalName}</span>
                                                </span>
                                            </td>

                                            {/* Operator */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2 whitespace-nowrap">
                                                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-[11px] font-black text-indigo-700 dark:text-indigo-300 shrink-0">
                                                        {opProfile.shortName ? opProfile.shortName.charAt(0) : '?'}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-extrabold text-slate-900 dark:text-slate-100">
                                                                {opProfile.thName}
                                                            </span>
                                                            {opProfile.enName && opProfile.enName.toLowerCase() !== opProfile.shortName.toLowerCase() && (
                                                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300">
                                                                    {opProfile.enName}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {opProfile.role && (
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                                                {opProfile.role}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Input */}
                                            <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                                                {log.inputAmount.toLocaleString()} <span className="text-[10px] text-slate-400">ml</span>
                                            </td>

                                            {/* Output */}
                                            <td className="px-4 py-3.5 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400 whitespace-nowrap tabular-nums">
                                                {log.outputAmount.toLocaleString()} <span className="text-[10px] text-slate-400">ml</span>
                                            </td>

                                            {/* Yield % */}
                                            <td className="px-4 py-3.5 text-center whitespace-nowrap font-mono tabular-nums">
                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${
                                                    isPassYield
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                                }`}>
                                                    {log.yieldPercent}%
                                                </span>
                                            </td>

                                            {/* Cost Saved */}
                                            <td className="px-4 py-3.5 text-right font-mono font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap tabular-nums">
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
                                                        type="button"
                                                        onClick={() => handleOpenEditModal(log)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-base-800 transition-all cursor-pointer"
                                                        title="แก้ไขรายการ"
                                                    >
                                                        <PencilIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteTarget(log)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
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

            {/* MODAL: ADD / EDIT DISTILLATION LOG (เฉพาะสารที่เคยบันทึกไว้ + ไม่มีปุ่มทางลัดชื่อคนแบบรกตา) */}
            {isFormModalOpen && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
                    onClick={() => setIsFormModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-base-750 w-full max-w-xl overflow-hidden animate-fade-in my-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-base-800 flex items-center justify-between bg-gradient-to-r from-indigo-50/70 to-cyan-50/40 dark:from-base-850 dark:to-base-850">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                                    <BeakerIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                                        {editingLog ? 'แก้ไขบันทึกการกลั่นสารเคมี' : 'บันทึกการกลั่นสารเคมีรอบใหม่'}
                                    </h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        กรอกข้อมูลเป็นลำดับ 1–3 เพื่อบันทึกผลการกลั่นลงระบบ
                                    </p>
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={() => setIsFormModalOpen(false)}
                                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            >
                                <XCircleIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveBatch} className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
                            {/* STEP 1: SELECT CHEMICAL (แสดงเฉพาะสารที่เคยมีบันทึกไว้เท่านั้น + ปุ่มเพิ่มสารใหม่กรณีต้องการเพิ่ม) */}
                            <div className="space-y-2.5 p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <label className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">1</span>
                                        <span>เลือกชนิดสารเคมีที่กลั่น (เฉพาะสารที่เคยบันทึกไว้) *</span>
                                    </label>
                                    {recordedChemicalNames.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setIsCustomChemicalMode(prev => !prev)}
                                            className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                        >
                                            {isCustomChemicalMode ? '← กลับไปเลือกจากสารที่เคยบันทึก' : '+ เพิ่มสารเคมีชนิดใหม่'}
                                        </button>
                                    )}
                                </div>

                                {!isCustomChemicalMode && recordedChemicalNames.length > 0 ? (
                                    <div className="space-y-2.5">
                                        {/* Selectable cards for previously recorded chemicals only */}
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {recordedChemicalsSummary.map(chemItem => {
                                                const isSelected = formChemical.toLowerCase() === chemItem.name.toLowerCase();
                                                const price = chemicalPrices[chemItem.name] || 350;
                                                return (
                                                    <button
                                                        key={chemItem.name}
                                                        type="button"
                                                        onClick={() => setFormChemical(chemItem.name)}
                                                        className={`px-3 py-2.5 rounded-xl text-xs font-extrabold border text-left transition-all cursor-pointer flex items-center justify-between ${
                                                            isSelected
                                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-800'
                                                                : 'bg-white dark:bg-base-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-base-700 hover:border-indigo-400'
                                                        }`}
                                                    >
                                                        <span className="truncate">{chemItem.name}</span>
                                                        <span className={`text-[10px] font-mono ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                                                            ฿{price}/L
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <select
                                            value={formChemical}
                                            onChange={e => {
                                                if (e.target.value === '__CUSTOM__') {
                                                    setIsCustomChemicalMode(true);
                                                } else {
                                                    setFormChemical(e.target.value);
                                                }
                                            }}
                                            className="w-full px-3.5 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-extrabold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                        >
                                            {recordedChemicalsSummary.map(c => (
                                                <option key={c.name} value={c.name}>
                                                    {c.name} — เคยบันทึก {c.count} รอบ (ราคาอ้างอิง ฿{chemicalPrices[c.name] || 350}/ลิตร)
                                                </option>
                                            ))}
                                            <option value="__CUSTOM__">+ พิมพ์เพิ่มสารเคมีชนิดใหม่...</option>
                                        </select>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                                        <div className="sm:col-span-2">
                                            <label className="text-[10px] font-bold text-slate-500 block mb-1">ชื่อสารเคมีชนิดใหม่ *</label>
                                            <input
                                                type="text"
                                                value={customChemicalName}
                                                onChange={e => setCustomChemicalName(e.target.value)}
                                                placeholder="เช่น Acetone, Hexane, Ethanol..."
                                                className="w-full px-3.5 py-2 bg-white dark:bg-base-800 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 block mb-1">ราคาต่อลิตร (฿/L)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={customChemicalPrice}
                                                onChange={e => setCustomChemicalPrice(e.target.value)}
                                                className="w-full px-3.5 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 outline-none"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* STEP 2: SELECT OPERATOR LINKED TO PERSONNEL DATABASE (ไม่มีปุ่มทางลัดกดด่วนให้รกตา) */}
                            <div className="space-y-2.5 p-4 rounded-2xl bg-slate-50 dark:bg-base-850 border border-slate-200/80 dark:border-base-800">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <label className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">2</span>
                                        <UserGroupIcon className="w-4 h-4 text-indigo-600" />
                                        <span>เลือกผู้ทำการกลั่น (เชื่อมฐานข้อมูลบุคลากร Lab) *</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingNewPerson(prev => !prev)}
                                        className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                    >
                                        {isAddingNewPerson ? '← กลับไปเลือกจากรายชื่อในฐานข้อมูล' : '+ เพิ่มชื่อคนใหม่เข้าฐานข้อมูล'}
                                    </button>
                                </div>

                                {!isAddingNewPerson ? (
                                    <select
                                        value={formOperator}
                                        onChange={e => {
                                            if (e.target.value === '__ADD_NEW_PERSON__') {
                                                setIsAddingNewPerson(true);
                                            } else {
                                                setFormOperator(e.target.value);
                                            }
                                        }}
                                        className="w-full px-3.5 py-2.5 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-extrabold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                    >
                                        {assistantsGroup.length > 0 && (
                                            <optgroup label="👥 ทีมผู้ช่วยห้องปฏิบัติการ (Assistants 4:2)">
                                                {assistantsGroup.map(op => (
                                                    <option key={op.id} value={op.value}>
                                                        {op.fullLabel}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {testersGroup.length > 0 && (
                                            <optgroup label="🔬 ทีมนักวิเคราะห์ (Testers 3:3)">
                                                {testersGroup.map(op => (
                                                    <option key={op.id} value={op.value}>
                                                        {op.fullLabel}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {customGroup.length > 0 && (
                                            <optgroup label="📋 รายชื่ออื่นๆ ในระบบ">
                                                {customGroup.map(op => (
                                                    <option key={op.id} value={op.value}>
                                                        {op.fullLabel}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        <option value="__ADD_NEW_PERSON__">+ เพิ่มชื่อพนักงานใหม่เข้าฐานข้อมูล...</option>
                                    </select>
                                ) : (
                                    <div className="p-3 bg-white dark:bg-base-900 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2.5">
                                        <div className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                                            ➕ เพิ่มรายชื่อพนักงานใหม่ลงฐานข้อมูลกลาง
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <div className="sm:col-span-2">
                                                <input
                                                    type="text"
                                                    value={newPersonName}
                                                    onChange={e => setNewPersonName(e.target.value)}
                                                    placeholder="กรอกชื่อพนักงาน..."
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                                                />
                                            </div>
                                            <div>
                                                <select
                                                    value={newPersonTeam}
                                                    onChange={e => setNewPersonTeam(e.target.value as any)}
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                                                >
                                                    <option value="assistants_4_2">ทีมผู้ช่วย (4:2)</option>
                                                    <option value="testers_3_3">ทีมนักวิเคราะห์ (3:3)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setIsAddingNewPerson(false)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isSavingPerson}
                                                onClick={handleQuickAddPersonToDatabase}
                                                className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                                            >
                                                {isSavingPerson ? 'กำลังบันทึก...' : '✓ บันทึกลงฐานข้อมูล & เลือกทันที'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* STEP 3: DATE, INPUT AMOUNT (ml) & OUTPUT AMOUNT (ml) */}
                            <div className="space-y-3 p-4 rounded-2xl bg-slate-50/70 dark:bg-base-850/60 border border-slate-200/80 dark:border-base-800">
                                <label className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">3</span>
                                    <span>ระบุวันที่และปริมาณสารเคมีที่กลั่น *</span>
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">วันที่ทำการกลั่น *</label>
                                        <input
                                            type="date"
                                            required
                                            value={formDate}
                                            onChange={e => setFormDate(e.target.value)}
                                            className="w-full px-3 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">สารตั้งต้น Input (ml) *</label>
                                        <input
                                            type="number"
                                            step="any"
                                            required
                                            min="1"
                                            value={formInputAmount}
                                            onChange={e => setFormInputAmount(e.target.value)}
                                            placeholder="5000"
                                            className="w-full px-3 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">กลั่นได้ Output (ml) *</label>
                                        <input
                                            type="number"
                                            step="any"
                                            required
                                            min="0"
                                            value={formOutputAmount}
                                            onChange={e => setFormOutputAmount(e.target.value)}
                                            placeholder="4800"
                                            className="w-full px-3 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>
                                </div>

                                {/* Live Yield Preview */}
                                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                                    liveYield >= 95
                                        ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60'
                                        : 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60'
                                }`}>
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                        ประสิทธิภาพการกลั่น (% Yield คำนวณอัตโนมัติ):
                                    </span>
                                    <span className={`text-base font-mono font-black ${
                                        liveYield >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                                    }`}>
                                        {liveYield}% {liveYield >= 95 ? '✓ ผ่านเกณฑ์' : '⚠️ ต่ำกว่า 95%'}
                                    </span>
                                </div>

                                <div className="space-y-1 pt-1">
                                    <label className="text-[11px] font-bold text-slate-500">หมายเหตุเพิ่มเติม (Notes)</label>
                                    <input
                                        type="text"
                                        value={formNotes}
                                        onChange={e => setFormNotes(e.target.value)}
                                        placeholder="เช่น กลั่นรอบเช้า สารใสบริสุทธิ์พร้อมใช้งาน..."
                                        className="w-full px-3.5 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsFormModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-base-800 hover:bg-slate-200 transition-all cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                                >
                                    {isSubmitting ? 'กำลังบันทึก...' : editingLog ? '💾 บันทึกการแก้ไข' : '✓ บันทึกข้อมูลการกลั่น'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Delete Confirmation */}
            {deleteTarget && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setDeleteTarget(null)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-base-750 w-full max-w-md p-6 space-y-4 animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                                <TrashIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                                    ยืนยันการลบข้อมูลการกลั่น
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    คุณต้องการลบบันทึกการกลั่น <span className="font-bold text-slate-800 dark:text-slate-200">{deleteTarget.chemicalName}</span> วันที่ <span className="font-bold text-slate-800 dark:text-slate-200">{deleteTarget.date}</span> ใช่หรือไม่?
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-base-800 hover:bg-slate-200 transition-all cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteBatch}
                                className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-sm cursor-pointer"
                            >
                                ลบรายการ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Chemical Price Configuration (เฉพาะสารที่เคยมีบันทึกไว้เท่านั้น) */}
            {isPriceModalOpen && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setIsPriceModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-base-750 w-full max-w-md overflow-hidden animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-base-800 flex items-center justify-between bg-slate-50/60 dark:bg-base-850">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                    <CurrencyDollarIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                                        ตั้งค่าราคาสารเคมีที่เคยบันทึก (บาท / ลิตร)
                                    </h3>
                                    <p className="text-[11px] text-slate-500">
                                        ใช้คำนวณมูลค่าการประหยัดงบประมาณ (Cost Saved)
                                    </p>
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={() => setIsPriceModalOpen(false)}
                                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            >
                                <XCircleIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSavePrices} className="p-6 space-y-4">
                            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                                {Object.keys(tempPrices).length === 0 ? (
                                    <div className="text-center py-6 text-xs text-slate-400 font-bold">
                                        ยังไม่มีสารเคมีที่เคยบันทึกไว้
                                    </div>
                                ) : (
                                    Object.keys(tempPrices).map(chem => (
                                        <div key={chem} className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-base-800/60 px-3.5 py-2 rounded-xl border border-slate-200/70 dark:border-base-750">
                                            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                                                {chem}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-slate-400">฿</span>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={tempPrices[chem] ?? '350'}
                                                    onChange={e => setTempPrices(prev => ({ ...prev, [chem]: e.target.value }))}
                                                    className="w-24 px-2.5 py-1 text-right bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-lg text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                />
                                                <span className="text-[10px] font-bold text-slate-400">/ ลิตร</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-base-800 space-y-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                    + เพิ่มราคาสารเคมีชนิดอื่น
                                </span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newPriceChemName}
                                        onChange={e => setNewPriceChemName(e.target.value)}
                                        placeholder="ชื่อสารเคมี..."
                                        className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white outline-none"
                                    />
                                    <input
                                        type="number"
                                        value={newPriceChemVal}
                                        onChange={e => setNewPriceChemVal(e.target.value)}
                                        placeholder="350"
                                        className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-lg text-xs font-mono font-bold text-emerald-600 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddChemInPriceModal}
                                        className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-slate-200 dark:bg-base-700 text-slate-800 dark:text-white hover:bg-indigo-600 hover:text-white transition-all cursor-pointer"
                                    >
                                        เพิ่ม
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsPriceModalOpen(false)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-base-800 hover:bg-slate-200 transition-all cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-sm cursor-pointer"
                                >
                                    บันทึกราคาสารเคมี
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DistillationTab;
