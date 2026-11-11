import React, { useState, useEffect, useMemo } from 'react';
import type { Equipment, BreakdownRecord, BreakdownStage, BreakdownActionLog } from '../types';
import { saveEquipment, normalizeEquipmentNo } from '../services/dataService';
import { 
    AlertTriangleIcon, CheckCircleIcon, ClockIcon, SearchIcon, 
    PlusIcon, PencilIcon, DocumentTextIcon, 
    XCircleIcon
} from './common/Icons';
import EquipmentHistoryModal from './EquipmentHistoryModal';

interface BreakdownTabProps {
    equipments: Equipment[];
    onEquipmentUpdated: () => void;
}

const STAGES: { stage: BreakdownStage; stepNumber: number; title: string; shortTitle: string; desc: string; badgeColor: string; activeColor: string }[] = [
    { stage: 'reported', stepNumber: 1, title: '1. รับแจ้งอาการเสีย', shortTitle: '1. รับแจ้ง', desc: 'ลงทะเบียนรับแจ้งเครื่องมือชำรุด', badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800', activeColor: 'bg-rose-600 text-white border-rose-600' },
    { stage: 'investigating', stepNumber: 2, title: '2. ตรวจสอบ/หาสาเหตุ', shortTitle: '2. หาสาเหตุ', desc: 'ตรวจสอบอาการและวินิจฉัยปัญหา', badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800', activeColor: 'bg-amber-600 text-white border-amber-600' },
    { stage: 'quotation_repair', stepNumber: 3, title: '3. ขอใบเสนอราคาซ่อม', shortTitle: '3. ขอราคา', desc: 'ติดต่อ Vendor/ผู้จำหน่ายขอราคาอะไหล่', badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800', activeColor: 'bg-sky-600 text-white border-sky-600' },
    { stage: 'pr_repair', stepNumber: 4, title: '4. ออกใบ PR ซ่อม/อนุมัติงบ', shortTitle: '4. ออก PR', desc: 'เปิดใบสั่งซื้อในระบบจัดซื้อ', badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200 dark:border-violet-800', activeColor: 'bg-violet-600 text-white border-violet-600' },
    { stage: 'repairing', stepNumber: 5, title: '5. กำลังดำเนินการซ่อม', shortTitle: '5. ซ่อมอยู่', desc: 'ช่างเข้าหน้างานหรือส่งซ่อมศูนย์', badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800', activeColor: 'bg-indigo-600 text-white border-indigo-600' },
    { stage: 'repaired_verified', stepNumber: 6, title: '6. ตรวจรับ & เครื่องปกติแล้ว', shortTitle: '6. ปกติแล้ว', desc: 'ซ่อมเสร็จ ทดสอบผ่าน พร้อมใช้งาน', badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', activeColor: 'bg-emerald-600 text-white border-emerald-600' }
];

const CODE_RANGES: { key: string; label: string; min: number; max: number }[] = [
    { key: 'all', label: 'ทุกรหัส (ทั้งหมด)', min: 0, max: 99999 },
    { key: '1001_1015', label: 'PDS-1001 – 1015', min: 1001, max: 1015 },
    { key: '1016_1030', label: 'PDS-1016 – 1030', min: 1016, max: 1030 },
    { key: '1031_1045', label: 'PDS-1031 – 1045', min: 1031, max: 1045 },
    { key: '1046_plus', label: 'PDS-1046 ขึ้นไป', min: 1046, max: 99999 }
];

// Helper to sort equipment naturally (PDS-1001, PDS-1002 ... PDS-1064)
const naturalEquipmentCompare = (a: Equipment, b: Equipment): number => {
    const noA = normalizeEquipmentNo(String(a.equipmentNo || a.code || '')) || String(a.equipmentNo || '').trim();
    const noB = normalizeEquipmentNo(String(b.equipmentNo || b.code || '')) || String(b.equipmentNo || '').trim();
    const matchA = noA.match(/(\d+)/);
    const matchB = noB.match(/(\d+)/);
    const numA = matchA ? parseInt(matchA[1], 10) : 0;
    const numB = matchB ? parseInt(matchB[1], 10) : 0;
    if (numA !== numB) return numA - numB;
    return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
};

const getEquipmentNumberNumeric = (eq: Equipment): number => {
    const no = normalizeEquipmentNo(String(eq.equipmentNo || eq.code || '')) || String(eq.equipmentNo || '');
    const m = no.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : 0;
};

// Helper for calculating downtime days
const getDaysDown = (reportedDate?: string): number => {
    if (!reportedDate) return 0;
    try {
        const rep = new Date(reportedDate).getTime();
        const now = new Date().getTime();
        const diffDays = Math.max(0, Math.floor((now - rep) / (1000 * 60 * 60 * 24)));
        return diffDays;
    } catch {
        return 0;
    }
};

const isEquipmentBroken = (eq?: Equipment | null): boolean => {
    if (!eq) return false;
    if (eq.breakdownStatus && eq.breakdownStatus.isBroken === false && eq.status === 'ready') {
        return false;
    }
    return eq.status === 'issue' || Boolean(eq.breakdownStatus?.isBroken);
};

export const BreakdownTab: React.FC<BreakdownTabProps> = ({ equipments, onEquipmentUpdated }) => {
    // Optimistic local state synced with props.equipments so saving status updates UI in 0ms
    const [localEquipments, setLocalEquipments] = useState<Equipment[]>(equipments || []);

    useEffect(() => {
        if (equipments && equipments.length > 0) {
            setLocalEquipments(equipments);
        }
    }, [equipments]);

    // Filters & Display modes
    const [viewFilter, setViewFilter] = useState<'all' | 'broken_only' | 'normal_only'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<string>('all');
    const [selectedCodeRange, setSelectedCodeRange] = useState<string>('all');
    const [displayDensity, setDisplayDensity] = useState<'table' | 'cards' | 'matrix'>('table');

    // Drill-down selection (clicked machine)
    const [inspectedEquipmentId, setInspectedEquipmentId] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState<'why_red' | 'actions_done'>('why_red');
    const [isFullScreenInspection, setIsFullScreenInspection] = useState<boolean>(false);

    // Quick action log entry state
    const [newActionNote, setNewActionNote] = useState('');
    const [newActionActor, setNewActionActor] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    // Modals & Feedback
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedEquipmentForReport, setSelectedEquipmentForReport] = useState<string>('');
    const [isEditIncidentModalOpen, setIsEditIncidentModalOpen] = useState(false);
    const [activeIncidentForEdit, setActiveIncidentForEdit] = useState<BreakdownRecord | null>(null);
    const [editModalStatusMode, setEditModalStatusMode] = useState<'broken' | 'resolved'>('broken');
    const [editModalStage, setEditModalStage] = useState<BreakdownStage>('reported');
    const [editModalResolutionNote, setEditModalResolutionNote] = useState<string>('');
    const [isResolving, setIsResolving] = useState(false);
    const [resolveSuccessMessage, setResolveSuccessMessage] = useState<string | null>(null);

    // Dedicated equipment history logbook modal state
    const [historyModalEq, setHistoryModalEq] = useState<Equipment | null>(null);

    // Helper to update a single equipment in local state + persist to storage/Firestore
    const applyAndSaveEquipment = async (updated: Equipment) => {
        setLocalEquipments(prev =>
            prev.map(item =>
                item.id === updated.id || normalizeEquipmentNo(item.equipmentNo) === normalizeEquipmentNo(updated.equipmentNo)
                    ? updated
                    : item
            )
        );
        await saveEquipment(updated);
        onEquipmentUpdated();
    };

    // Filter PRIMARY ONLY equipments (strictly no '/' in equipmentNo) & SORT NUMERICALLY FROM LOW TO HIGH
    const primaryEquipments = useMemo(() => {
        const filtered = (localEquipments || []).filter(eq => {
            if (!eq) return false;
            const eqNo = String(eq.equipmentNo || eq.code || eq.name || '');
            return eqNo && !eqNo.includes('/');
        });
        return [...filtered].sort(naturalEquipmentCompare);
    }, [localEquipments]);

    // Broken equipments
    const brokenEquipments = useMemo(() => {
        return primaryEquipments.filter(eq => isEquipmentBroken(eq));
    }, [primaryEquipments]);

    // Normal equipments
    const normalEquipments = useMemo(() => {
        return primaryEquipments.filter(eq => !isEquipmentBroken(eq));
    }, [primaryEquipments]);

    // Keep inspected equipment in sync
    const currentInspected = useMemo(() => {
        if (!inspectedEquipmentId) return null;
        return primaryEquipments.find(e => e.id === inspectedEquipmentId || e.equipmentNo === inspectedEquipmentId) || null;
    }, [inspectedEquipmentId, primaryEquipments]);

    // Unique owners list for filter
    const ownersList = useMemo(() => {
        const set = new Set<string>();
        primaryEquipments.forEach(eq => {
            if (eq.owner && eq.owner.trim()) set.add(eq.owner.trim());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [primaryEquipments]);

    // Executive Metrics
    const kpi = useMemo(() => {
        const total = primaryEquipments.length;
        const broken = brokenEquipments.length;
        const ready = total - broken;
        const availabilityRate = total > 0 ? Math.round((ready / total) * 100) : 100;

        let pendingPR = 0;
        let underRepair = 0;
        let criticalImpact = 0;

        brokenEquipments.forEach(eq => {
            const inc = eq.breakdownStatus?.currentIncident;
            if (inc) {
                if (inc.stage === 'pr_repair' || inc.stage === 'quotation_repair') pendingPR++;
                if (inc.stage === 'repairing') underRepair++;
                if (inc.impactLevel === 'Critical') criticalImpact++;
            } else {
                pendingPR++;
            }
        });

        return {
            total,
            ready,
            broken,
            availabilityRate,
            pendingPR,
            underRepair,
            criticalImpact
        };
    }, [primaryEquipments, brokenEquipments]);

    // Filtered display list strictly preserving numerical order from lowest to highest
    const displayList = useMemo(() => {
        let list: Equipment[] = [];
        if (viewFilter === 'broken_only') {
            list = brokenEquipments;
        } else if (viewFilter === 'normal_only') {
            list = normalEquipments;
        } else {
            list = [...primaryEquipments];
        }

        const rangeObj = CODE_RANGES.find(r => r.key === selectedCodeRange);

        return list.filter(eq => {
            if (selectedOwner !== 'all' && eq.owner !== selectedOwner) {
                return false;
            }
            if (rangeObj && rangeObj.key !== 'all') {
                const num = getEquipmentNumberNumeric(eq);
                if (num < rangeObj.min || num > rangeObj.max) return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const no = String(eq.equipmentNo || '').toLowerCase();
                const name = String(eq.equipmentName || '').toLowerCase();
                const owner = String(eq.owner || '').toLowerCase();
                const loc = String(eq.location || eq.department || '').toLowerCase();
                const sym = String(eq.breakdownStatus?.currentIncident?.symptom || '').toLowerCase();
                return no.includes(q) || name.includes(q) || owner.includes(q) || loc.includes(q) || sym.includes(q);
            }
            return true;
        });
    }, [viewFilter, brokenEquipments, normalEquipments, primaryEquipments, selectedOwner, selectedCodeRange, searchQuery]);

    // Build a resolved Equipment object cleanly
    const buildResolvedEquipment = (eq: Equipment, customNote?: string, updatedInc?: BreakdownRecord): Equipment => {
        const curInc = updatedInc || eq.breakdownStatus?.currentIncident;
        const resolveDate = new Date().toISOString().split('T')[0];
        const finalNote = (customNote || curInc?.resolutionNote || '').trim() || 'ตรวจรับการซ่อมแซมสมบูรณ์ เครื่องกลับคืนสู่สภาพพร้อมใช้งานปกติ 100%';

        const closeLog: BreakdownActionLog = {
            id: `log_res_${Date.now()}`,
            date: resolveDate,
            action: `บันทึกซ่อมเสร็จและคืนสภาพพร้อมใช้งานปกติ: ${finalNote}`,
            actor: curInc?.reportedBy || eq.owner || 'เจ้าหน้าที่',
            stage: 'repaired_verified'
        };

        const resolvedIncident: BreakdownRecord = curInc ? {
            ...curInc,
            stage: 'repaired_verified',
            resolvedDate: resolveDate,
            resolutionNote: finalNote,
            actionLogs: [closeLog, ...(curInc.actionLogs || [])]
        } : {
            id: `inc_res_${Date.now()}`,
            equipmentId: eq.id,
            equipmentNo: eq.equipmentNo,
            equipmentName: eq.equipmentName,
            reportedDate: resolveDate,
            reportedBy: eq.owner,
            symptom: 'แก้ไขและตรวจสอบสภาพเรียบร้อยแล้ว',
            impactLevel: 'Low',
            stage: 'repaired_verified',
            resolvedDate: resolveDate,
            resolutionNote: finalNote,
            actionLogs: [closeLog]
        };

        const updated: Equipment = {
            ...eq,
            status: 'ready',
            breakdownStatus: {
                isBroken: false,
                history: [resolvedIncident, ...(eq.breakdownStatus?.history || [])]
            }
        };
        delete (updated.breakdownStatus as any).currentIncident;
        return updated;
    };

    // Resolve Breakdown (Mark Fixed & Return to Green 🟢)
    const handleResolveBreakdown = async (eq: Equipment, customNote?: string) => {
        if (!eq) return;
        setIsResolving(true);
        try {
            const updated = buildResolvedEquipment(eq, customNote);
            await applyAndSaveEquipment(updated);
            setIsEditIncidentModalOpen(false);
            setResolveSuccessMessage(`✅ บันทึกสำเร็จ: เครื่องมือ ${eq.equipmentNo} (${eq.equipmentName}) กลับสู่สถานะ "🟢 ปกติพร้อมใช้งาน" เรียบร้อยแล้ว`);
            setTimeout(() => setResolveSuccessMessage(null), 6000);
        } catch (err) {
            console.error("Error resolving breakdown:", err);
            setResolveSuccessMessage("เกิดข้อผิดพลาดในการบันทึกคืนสภาพ: " + (err as Error).message);
        } finally {
            setIsResolving(false);
        }
    };

    // Set specific stage (1-6) directly from the interactive stepper
    const handleSetStage = async (eq: Equipment, targetStage: BreakdownStage) => {
        if (targetStage === 'repaired_verified') {
            await handleResolveBreakdown(eq, 'ผ่านการตรวจรับขั้นที่ 6 และคืนสภาพพร้อมใช้งานตามปกติ');
            return;
        }

        const curInc = eq.breakdownStatus?.currentIncident;
        const stageObj = STAGES.find(s => s.stage === targetStage);
        const dateStr = new Date().toISOString().split('T')[0];

        const autoLog: BreakdownActionLog = {
            id: `log_${Date.now()}`,
            date: dateStr,
            action: `อัปเดตขั้นตอนการซ่อมเป็น: ${stageObj ? stageObj.title : targetStage}`,
            actor: curInc?.reportedBy || eq.owner || 'เจ้าหน้าที่',
            stage: targetStage
        };

        const updatedIncident: BreakdownRecord = curInc ? {
            ...curInc,
            stage: targetStage,
            actionLogs: [autoLog, ...(curInc.actionLogs || [])]
        } : {
            id: `inc_${Date.now()}`,
            equipmentId: eq.id,
            equipmentNo: eq.equipmentNo,
            equipmentName: eq.equipmentName,
            reportedDate: dateStr,
            reportedBy: eq.owner,
            symptom: 'อยู่ระหว่างดำเนินการซ่อมบำรุง',
            impactLevel: 'Moderate',
            stage: targetStage,
            actionLogs: [autoLog]
        };

        const updated: Equipment = {
            ...eq,
            status: 'issue',
            breakdownStatus: {
                ...eq.breakdownStatus,
                isBroken: true,
                currentIncident: updatedIncident,
                history: eq.breakdownStatus?.history || []
            }
        };
        await applyAndSaveEquipment(updated);
        setResolveSuccessMessage(`อัปเดตสถานะเครื่อง ${eq.equipmentNo} เป็น "${stageObj?.shortTitle || targetStage}" เรียบร้อยแล้ว`);
        setTimeout(() => setResolveSuccessMessage(null), 4000);
    };

    // Advance Stage to Next Step
    const handleAdvanceStage = async (eq: Equipment) => {
        const curInc = eq.breakdownStatus?.currentIncident;
        const stageOrder: BreakdownStage[] = ['reported', 'investigating', 'quotation_repair', 'pr_repair', 'repairing', 'repaired_verified'];
        const curIdx = curInc ? stageOrder.indexOf(curInc.stage) : 0;
        if (curIdx < stageOrder.length - 1) {
            const nextStage = stageOrder[curIdx + 1];
            await handleSetStage(eq, nextStage);
        }
    };

    // Add Action Note to Incident Timeline
    const handleAddActionLog = async (eq: Equipment) => {
        if (!newActionNote.trim()) return;
        const curInc = eq.breakdownStatus?.currentIncident;
        if (!curInc) return;

        setIsSavingLog(true);
        try {
            const newLog: BreakdownActionLog = {
                id: `log_${Date.now()}`,
                date: new Date().toISOString().split('T')[0],
                action: newActionNote.trim(),
                actor: newActionActor.trim() || curInc.reportedBy || 'เจ้าหน้าที่',
                stage: curInc.stage
            };

            const updatedIncident: BreakdownRecord = {
                ...curInc,
                actionLogs: [newLog, ...(curInc.actionLogs || [])]
            };

            const updated: Equipment = {
                ...eq,
                status: 'issue',
                breakdownStatus: {
                    ...eq.breakdownStatus,
                    isBroken: true,
                    currentIncident: updatedIncident,
                    history: eq.breakdownStatus?.history || []
                }
            };

            await applyAndSaveEquipment(updated);
            setNewActionNote('');
        } finally {
            setIsSavingLog(false);
        }
    };

    // Handle Report New Breakdown
    const handleReportBreakdown = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const equipId = formData.get('equipmentId') as string;
        const target = primaryEquipments.find(eq => eq.id === equipId);
        if (!target) return;

        const symptom = formData.get('symptom') as string;
        const reportedDate = (formData.get('reportedDate') as string) || new Date().toISOString().split('T')[0];
        const reportedBy = (formData.get('reportedBy') as string) || target.owner;

        const initialLog: BreakdownActionLog = {
            id: `log_${Date.now()}`,
            date: reportedDate,
            action: `บันทึกแจ้งเครื่องเสีย: ${symptom}`,
            actor: reportedBy,
            stage: 'reported'
        };

        const newIncident: BreakdownRecord = {
            id: `inc_${Date.now()}`,
            equipmentId: target.id,
            equipmentNo: target.equipmentNo,
            equipmentName: target.equipmentName,
            reportedDate: reportedDate,
            reportedBy: reportedBy,
            symptom: symptom,
            rootCause: (formData.get('rootCause') as string) || '',
            impactLevel: (formData.get('impactLevel') as any) || 'Critical',
            stage: 'reported',
            vendorOrTechnician: (formData.get('vendorOrTechnician') as string) || '',
            targetResolutionDate: (formData.get('targetResolutionDate') as string) || '',
            resolutionNote: '',
            actionLogs: [initialLog]
        };

        const updated: Equipment = {
            ...target,
            status: 'issue',
            breakdownStatus: {
                isBroken: true,
                currentIncident: newIncident,
                history: target.breakdownStatus?.history || []
            }
        };

        await applyAndSaveEquipment(updated);
        setIsReportModalOpen(false);
        setInspectedEquipmentId(updated.id);
        setDetailTab('why_red');
        setResolveSuccessMessage(`🚨 บันทึกแจ้งเครื่องเสีย ${target.equipmentNo} (${target.equipmentName}) เรียบร้อยแล้ว`);
        setTimeout(() => setResolveSuccessMessage(null), 5000);
    };

    const openEditIncidentModal = (eq: Equipment) => {
        const inc = eq.breakdownStatus?.currentIncident || {
            id: `inc_${Date.now()}`,
            equipmentId: eq.id,
            equipmentNo: eq.equipmentNo,
            equipmentName: eq.equipmentName,
            reportedDate: new Date().toISOString().split('T')[0],
            reportedBy: eq.owner,
            symptom: 'แจ้งซ่อมบำรุง',
            impactLevel: 'Moderate',
            stage: 'reported'
        };
        setActiveIncidentForEdit(inc);
        setEditModalStatusMode('broken');
        setEditModalStage(inc.stage || 'reported');
        setEditModalResolutionNote(inc.resolutionNote || 'ซ่อมเสร็จสมบูรณ์ ทดสอบการทำงานผ่านเกณฑ์ พร้อมใช้งาน 100%');
        setIsEditIncidentModalOpen(true);
    };

    return (
        <div className="space-y-5 pb-12 animate-fade-in">
            {/* SUCCESS TOAST BANNER */}
            {resolveSuccessMessage && (
                <div className="bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-between gap-3 animate-fade-in border border-emerald-400">
                    <div className="flex items-center gap-2.5 text-xs md:text-sm font-black">
                        <CheckCircleIcon className="h-5 w-5 shrink-0 text-white" />
                        <span>{resolveSuccessMessage}</span>
                    </div>
                    <button 
                        type="button"
                        onClick={() => setResolveSuccessMessage(null)}
                        className="text-xs font-bold bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded-lg cursor-pointer shrink-0"
                    >
                        รับทราบ
                    </button>
                </div>
            )}

            {/* SECTION 1: HEADER & EXECUTIVE KPI CARDS */}
            <div className="bg-white dark:bg-base-900 rounded-2xl border border-slate-200/90 dark:border-base-800 shadow-2xs overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 dark:border-base-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-50/80 via-white to-rose-50/30 dark:from-base-900 dark:via-base-900 dark:to-rose-950/10">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                Equipment Status & Repair Center
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                เรียงตามรหัส PDS-1001 ➔ ลำดับสุดท้าย
                            </span>
                        </div>
                        <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                            ศูนย์ควบคุมสถานะเครื่องเสีย & ติดตามงานซ่อมบำรุง 6 ขั้นตอน
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            ตรวจสอบเครื่องที่กำลังแจ้งซ่อม อัปเดตความคืบหน้า และกด <strong className="text-emerald-600 dark:text-emerald-400">“บันทึกว่าเครื่องปกติแล้ว”</strong> เพื่อคืนสภาพพร้อมใช้งานได้ทันที
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                const firstNormal = normalEquipments[0] || primaryEquipments[0];
                                if (firstNormal) setSelectedEquipmentForReport(firstNormal.id);
                                setIsReportModalOpen(true);
                            }}
                            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-rose-600/20 active:scale-95 cursor-pointer"
                        >
                            <PlusIcon className="h-4 w-4" />
                            <span>+ แจ้งเครื่องมือเสีย / ชำรุดใหม่</span>
                        </button>
                    </div>
                </div>

                {/* 4 Color-Coded Interactive KPI Filter Cards */}
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 bg-slate-50/40 dark:bg-base-950/30">
                    {/* Card 1: Total Machines */}
                    <button
                        type="button"
                        onClick={() => setViewFilter('all')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                            viewFilter === 'all'
                                ? 'bg-white dark:bg-base-900 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                                : 'bg-white/90 dark:bg-base-900/80 border-slate-200/90 dark:border-base-800 hover:border-indigo-300'
                        }`}
                    >
                        <div>
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                                1. เครื่องมือหลักทั้งหมด
                            </span>
                            <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpi.total}</span>
                                <span className="text-xs font-bold text-slate-400">เครื่อง</span>
                            </div>
                            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold mt-1 block">
                                คลิกเพื่อดูทั้งหมด ❯
                            </span>
                        </div>
                        <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-lg font-black text-indigo-600">
                            📊
                        </div>
                    </button>

                    {/* Card 2: Broken / Under Repair */}
                    <button
                        type="button"
                        onClick={() => setViewFilter('broken_only')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                            viewFilter === 'broken_only'
                                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/25 shadow-sm'
                                : kpi.broken > 0
                                    ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 hover:border-rose-400'
                                    : 'bg-white dark:bg-base-900 border-slate-200 dark:border-base-800'
                        }`}
                    >
                        <div>
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                                2. แจ้งเสีย / กำลังซ่อม
                            </span>
                            <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
                                <span className={`text-2xl font-black ${kpi.broken > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {kpi.broken}
                                </span>
                                <span className="text-xs font-bold text-rose-500">เครื่อง</span>
                            </div>
                            <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-1 block">
                                {kpi.broken > 0 ? 'คลิกกรองเฉพาะเครื่องเสีย ❯' : 'ไม่มีเครื่องค้างซ่อม'}
                            </span>
                        </div>
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg ${
                            kpi.broken > 0
                                ? 'bg-rose-600 text-white shadow-sm shadow-rose-500/30 animate-pulse'
                                : 'bg-slate-100 dark:bg-base-800 text-slate-400'
                        }`}>
                            🚨
                        </div>
                    </button>

                    {/* Card 3: Normal / Ready */}
                    <button
                        type="button"
                        onClick={() => setViewFilter('normal_only')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                            viewFilter === 'normal_only'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                                : 'bg-white/90 dark:bg-base-900/80 border-slate-200/90 dark:border-base-800 hover:border-emerald-400'
                        }`}
                    >
                        <div>
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                                3. ปกติพร้อมใช้งาน
                            </span>
                            <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
                                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{kpi.ready}</span>
                                <span className="text-xs font-bold text-slate-400">เครื่อง</span>
                            </div>
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1 block">
                                คลิกกรองเครื่องปกติ ❯
                            </span>
                        </div>
                        <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-lg">
                            🟢
                        </div>
                    </button>

                    {/* Card 4: Availability Rate */}
                    <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-base-800 bg-white dark:bg-base-900 flex items-center justify-between">
                        <div className="flex-1 pr-3">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                                4. ความพร้อมใช้งาน (Uptime)
                            </span>
                            <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpi.availabilityRate}%</span>
                                <span className="text-[11px] font-bold text-emerald-600">พร้อมใช้</span>
                            </div>
                            <div className="mt-2 w-full bg-slate-100 dark:bg-base-800 h-2 rounded-full overflow-hidden flex">
                                <div style={{ width: `${kpi.availabilityRate}%` }} className="bg-emerald-500 h-full transition-all duration-300" />
                                <div style={{ width: `${100 - kpi.availabilityRate}%` }} className="bg-rose-500 h-full transition-all duration-300" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 2: PINNED PRIORITY PANEL FOR BROKEN MACHINES (แสดงเครื่องที่เสียอยู่ด้านบนสุดให้จัดการและกดบันทึกว่าปกติได้ทันที) */}
            {brokenEquipments.length > 0 && viewFilter !== 'normal_only' && (
                <div className="bg-rose-50/70 dark:bg-rose-950/20 rounded-2xl border-2 border-rose-300 dark:border-rose-900/80 p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-200/80 dark:border-rose-900/60 pb-3">
                        <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-xs font-black flex items-center gap-1.5 shadow-xs">
                                <AlertTriangleIcon className="h-4 w-4" />
                                <span>ด่วน! รายการเครื่องมือที่กำลังแจ้งเสีย / ซ่อมอยู่ ({brokenEquipments.length} เครื่อง)</span>
                            </span>
                            <span className="text-xs text-rose-800 dark:text-rose-200 font-bold hidden md:inline">
                                • กดปุ่มสีเขียว “บันทึกว่าเครื่องปกติแล้ว” เพื่อปิดงานซ่อมและคืนสถานะพร้อมใช้ได้ทันที
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                        {brokenEquipments.map(eq => {
                            const inc = eq.breakdownStatus?.currentIncident;
                            const stageObj = STAGES.find(s => s.stage === inc?.stage) || STAGES[0];
                            const daysDown = getDaysDown(inc?.reportedDate);

                            return (
                                <div
                                    key={eq.id}
                                    className="bg-white dark:bg-base-900 rounded-2xl border border-rose-200 dark:border-rose-800/80 p-4 shadow-xs flex flex-col justify-between gap-3 hover:border-rose-400 transition-all"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-rose-600 text-white">
                                                    {eq.equipmentNo}
                                                </span>
                                                <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold border ${stageObj.badgeColor}`}>
                                                    ขั้นที่ {stageObj.stepNumber}/6: {stageObj.shortTitle}
                                                </span>
                                                <span className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400">
                                                    ⏱️ หยุด {daysDown} วัน
                                                </span>
                                            </div>
                                            <span className="text-[11px] font-bold text-slate-500">
                                                👤 ผู้ดูแล: <strong className="text-slate-800 dark:text-slate-200">{eq.owner}</strong>
                                            </span>
                                        </div>

                                        <div>
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                                                {eq.equipmentName}
                                            </h4>
                                            <p className="text-xs font-bold text-rose-700 dark:text-rose-300 mt-1 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 rounded-xl border border-rose-100 dark:border-rose-900/50">
                                                ⚠️ อาการเสีย: {inc?.symptom || 'อยู่ระหว่างตรวจสอบอาการผิดปกติ'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t border-slate-100 dark:border-base-800 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setInspectedEquipmentId(eq.id);
                                                    setDetailTab('why_red');
                                                }}
                                                className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 hover:bg-slate-200 dark:bg-base-800 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
                                            >
                                                🔍 ดูรายละเอียด / อัปเดตขั้นซ่อม
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setInspectedEquipmentId(eq.id);
                                                    openEditIncidentModal(eq);
                                                }}
                                                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer flex items-center gap-1"
                                            >
                                                <PencilIcon className="w-3.5 h-3.5" />
                                                <span>แก้ไข</span>
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={isResolving}
                                            onClick={() => handleResolveBreakdown(eq)}
                                            className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white shadow-sm shadow-emerald-600/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                                        >
                                            <CheckCircleIcon className="w-4 h-4" />
                                            <span>บันทึกว่าเครื่องปกติแล้ว 🟢</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* SECTION 3: SYSTEMATIC FILTER & QUICK FINDER TOOLBAR */}
            <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-slate-200/90 dark:border-base-800 shadow-2xs space-y-3.5">
                {/* Row 1: Search + Owner Filter + Status Filter + View Switcher */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <SearchIcon className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="ค้นหาด่วน: รหัส PDS-1001, ชื่อเครื่องมือ, ชื่อผู้ดูแล, สถานที่ตั้ง, อาการเสีย..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                                <XCircleIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Owner / Custodian Filter */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-extrabold text-slate-400 uppercase">👤 ผู้ดูแล:</span>
                            <select
                                value={selectedOwner}
                                onChange={e => setSelectedOwner(e.target.value)}
                                className="px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white cursor-pointer"
                            >
                                <option value="all">ผู้ดูแลทั้งหมด ({ownersList.length} คน)</option>
                                {ownersList.map(owner => (
                                    <option key={owner} value={owner}>{owner}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter Segmented Buttons */}
                        <div className="flex bg-slate-100 dark:bg-base-800 p-1 rounded-xl border border-slate-200/70 dark:border-base-700">
                            <button
                                type="button"
                                onClick={() => setViewFilter('all')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    viewFilter === 'all'
                                        ? 'bg-white dark:bg-base-900 text-slate-900 dark:text-white shadow-2xs font-black'
                                        : 'text-slate-600 dark:text-slate-400'
                                }`}
                            >
                                ทั้งหมด ({kpi.total})
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewFilter('broken_only')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    viewFilter === 'broken_only'
                                        ? 'bg-rose-600 text-white shadow-2xs font-black'
                                        : 'text-rose-600 dark:text-rose-400'
                                }`}
                            >
                                🚨 เครื่องเสีย ({kpi.broken})
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewFilter('normal_only')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    viewFilter === 'normal_only'
                                        ? 'bg-emerald-600 text-white shadow-2xs font-black'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                            >
                                🟢 ปกติ ({kpi.ready})
                            </button>
                        </div>

                        {/* View Mode Switcher */}
                        <div className="flex bg-slate-100 dark:bg-base-800 p-1 rounded-xl border border-slate-200/70 dark:border-base-700">
                            <button
                                type="button"
                                onClick={() => setDisplayDensity('table')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    displayDensity === 'table'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                }`}
                            >
                                ☰ ตารางระบบ
                            </button>
                            <button
                                type="button"
                                onClick={() => setDisplayDensity('cards')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    displayDensity === 'cards'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                }`}
                            >
                                🗂️ การ์ด
                            </button>
                            <button
                                type="button"
                                onClick={() => setDisplayDensity('matrix')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    displayDensity === 'matrix'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                }`}
                            >
                                🎛️ ผังรวม
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row 2: Quick Code Range Jump Pills (ช่วยให้หาเครื่องตามช่วงรหัส PDS ได้ง่ายขึ้น) */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-base-800 flex-wrap">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                            🔢 ช่วงรหัสเครื่องมือ:
                        </span>
                        {CODE_RANGES.map(range => (
                            <button
                                key={range.key}
                                type="button"
                                onClick={() => setSelectedCodeRange(range.key)}
                                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                    selectedCodeRange === range.key
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                }`}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>

                    {(viewFilter !== 'all' || selectedOwner !== 'all' || selectedCodeRange !== 'all' || searchQuery) && (
                        <button
                            type="button"
                            onClick={() => {
                                setViewFilter('all');
                                setSelectedOwner('all');
                                setSelectedCodeRange('all');
                                setSearchQuery('');
                            }}
                            className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                        >
                            ✕ ล้างตัวกรองทั้งหมด
                        </button>
                    )}
                </div>
            </div>

            {/* SECTION 4: MAIN EQUIPMENT STATUS DIRECTORY */}
            <div className="bg-white dark:bg-base-900 p-5 rounded-2xl border border-slate-200/90 dark:border-base-800 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-base-800 pb-3">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                            ทะเบียนสถานะเครื่องมือหลัก ({displayList.length} เครื่อง)
                        </h3>
                        <span className="text-xs text-slate-400 font-medium">
                            • คลิกที่แถวเพื่อดูรายละเอียด หรือกดปุ่มเปลี่ยนสถานะได้โดยตรง
                        </span>
                    </div>
                </div>

                {/* VIEW 1: SYSTEMATIC TABLE VIEW (DEFAULT FOR CLARITY & EASY SCANNING) */}
                {displayDensity === 'table' && (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-base-800">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-base-950/80 border-b border-slate-200 dark:border-base-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    <th className="py-3 px-3.5 w-14 text-center">ลำดับ</th>
                                    <th className="py-3 px-3.5 w-32">รหัสเครื่อง</th>
                                    <th className="py-3 px-4">ชื่อเครื่องมือวิทยาศาสตร์ & รายละเอียด</th>
                                    <th className="py-3 px-3.5 w-36">สถานที่ตั้ง</th>
                                    <th className="py-3 px-3.5 w-36">ผู้รับผิดชอบ</th>
                                    <th className="py-3 px-4 w-48 text-center">สถานะปัจจุบัน</th>
                                    <th className="py-3 px-4 w-56 text-right">การจัดการสถานะ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/60 dark:divide-base-800 text-xs">
                                {displayList.map((eq, idx) => {
                                    const isBroken = isEquipmentBroken(eq);
                                    const incident = eq.breakdownStatus?.currentIncident;
                                    const stageObj = STAGES.find(s => s.stage === incident?.stage) || STAGES[0];
                                    const daysDown = isBroken ? getDaysDown(incident?.reportedDate) : 0;

                                    return (
                                        <tr
                                            key={eq.id || `eq_${idx}`}
                                            onClick={() => {
                                                setInspectedEquipmentId(eq.id);
                                                setDetailTab('why_red');
                                                setIsFullScreenInspection(false);
                                            }}
                                            className={`transition-colors cursor-pointer group ${
                                                isBroken
                                                    ? 'bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100/70 dark:hover:bg-rose-950/50'
                                                    : 'hover:bg-slate-50/90 dark:hover:bg-base-850/60'
                                            }`}
                                        >
                                            <td className="px-3.5 py-3 font-mono font-bold text-slate-400 text-center tabular-nums">
                                                {String(idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-3.5 py-3 whitespace-nowrap">
                                                <span className={`font-mono font-black text-xs px-2.5 py-1 rounded-lg inline-block ${
                                                    isBroken
                                                        ? 'bg-rose-600 text-white shadow-2xs'
                                                        : 'bg-slate-100 dark:bg-base-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-base-700'
                                                }`}>
                                                    {eq.equipmentNo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className={`font-extrabold text-sm ${
                                                    isBroken ? 'text-rose-950 dark:text-rose-100' : 'text-slate-900 dark:text-white'
                                                }`}>
                                                    {eq.equipmentName}
                                                </div>
                                                {isBroken && incident && (
                                                    <div className="flex items-center gap-2 flex-wrap mt-1">
                                                        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                                            ⚠️ อาการ: {incident.symptom}
                                                        </span>
                                                        <span className={`px-2 py-0.2 rounded text-[10px] font-extrabold border ${stageObj.badgeColor}`}>
                                                            {stageObj.shortTitle}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-slate-500">
                                                            (หยุด {daysDown} วัน)
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3.5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 font-medium">
                                                📍 {eq.location || eq.department || 'PCRD Lab'}
                                            </td>
                                            <td className="px-3.5 py-3 whitespace-nowrap text-slate-700 dark:text-slate-200 font-bold">
                                                👤 {eq.owner}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-center">
                                                {isBroken ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-600 text-white shadow-2xs">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                                        <span>🚨 ชำรุด / กำลังซ่อม</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        <span>🟢 ปกติพร้อมใช้งาน</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                {isBroken ? (
                                                    <div className="inline-flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            disabled={isResolving}
                                                            onClick={() => handleResolveBreakdown(eq)}
                                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-[11px] font-black shadow-xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                                                            title="คลิกเพื่อบันทึกว่าเครื่องปกติแล้วทันที"
                                                        >
                                                            <CheckCircleIcon className="h-3.5 w-3.5" />
                                                            <span>บันทึกว่าปกติแล้ว 🟢</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setInspectedEquipmentId(eq.id);
                                                                setDetailTab('why_red');
                                                            }}
                                                            className="px-2.5 py-1.5 bg-white dark:bg-base-800 hover:bg-slate-100 border border-slate-200 dark:border-base-700 text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-bold cursor-pointer"
                                                        >
                                                            ดูเคส ❯
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedEquipmentForReport(eq.id);
                                                                setIsReportModalOpen(true);
                                                            }}
                                                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                                                        >
                                                            แจ้งเสีย
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setHistoryModalEq(eq)}
                                                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40 transition-all cursor-pointer"
                                                        >
                                                            ประวัติ ❯
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* VIEW 2: CARDS DENSITY MODE */}
                {displayDensity === 'cards' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                        {displayList.map((eq, idx) => {
                            const isBroken = isEquipmentBroken(eq);
                            const incident = eq.breakdownStatus?.currentIncident;
                            const daysDown = isBroken ? getDaysDown(incident?.reportedDate) : 0;

                            return (
                                <div
                                    key={eq.id || `eq_${idx}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        setInspectedEquipmentId(eq.id);
                                        setDetailTab('why_red');
                                        setIsFullScreenInspection(false);
                                    }}
                                    className={`relative p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between group cursor-pointer select-none ${
                                        isBroken
                                            ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 ring-2 ring-rose-500/30 shadow-sm'
                                            : 'bg-slate-50/50 dark:bg-base-950/40 border-slate-200/90 dark:border-base-800/90 hover:bg-white dark:hover:bg-base-800 hover:border-emerald-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2 w-full pb-2 border-b border-slate-200/40 dark:border-base-800/40">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[10px] font-mono font-bold text-slate-400">
                                                #{String(idx + 1).padStart(2, '0')}
                                            </span>
                                            <span className={`font-mono font-black text-xs px-2.5 py-0.5 rounded-lg ${
                                                isBroken ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-base-800 text-slate-800 dark:text-slate-200'
                                            }`}>
                                                {eq.equipmentNo}
                                            </span>
                                        </div>

                                        {isBroken ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white flex items-center gap-1">
                                                <span>🚨 ชำรุด</span>
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                🟢 ปกติ
                                            </span>
                                        )}
                                    </div>

                                    <div className="my-2.5 w-full flex-1">
                                        <h4 className={`text-sm font-black break-words leading-snug ${
                                            isBroken ? 'text-rose-950 dark:text-rose-100' : 'text-slate-900 dark:text-white'
                                        }`}>
                                            {eq.equipmentName}
                                        </h4>
                                        <p className="text-[11px] text-slate-500 mt-1">
                                            📍 {eq.location || eq.department || 'Lab'} • 👤 {eq.owner}
                                        </p>
                                        {isBroken && incident?.symptom && (
                                            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1.5 line-clamp-2">
                                                ⚠️ {incident.symptom}
                                            </p>
                                        )}
                                    </div>

                                    <div className="w-full pt-2.5 border-t border-slate-200/50 dark:border-base-800 flex items-center justify-between text-[11px]">
                                        {isBroken ? (
                                            <div className="flex items-center gap-1.5 w-full justify-between" onClick={e => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    disabled={isResolving}
                                                    onClick={() => handleResolveBreakdown(eq)}
                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-[11px] font-black shadow-xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                                                >
                                                    <CheckCircleIcon className="h-3.5 w-3.5" />
                                                    <span>บันทึกว่าปกติแล้ว 🟢</span>
                                                </button>
                                                <span className="text-rose-600 font-bold text-[10px]">
                                                    หยุด {daysDown} วัน
                                                </span>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-emerald-600 font-bold">พร้อมใช้งานปกติ</span>
                                                <span className="font-bold text-slate-400 group-hover:text-indigo-600">ดูข้อมูล ❯</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* VIEW 3: MATRIX BOARD MODE */}
                {displayDensity === 'matrix' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2.5">
                        {displayList.map((eq, idx) => {
                            const isBroken = isEquipmentBroken(eq);

                            return (
                                <div
                                    key={eq.id || `eq_${idx}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        setInspectedEquipmentId(eq.id);
                                        setDetailTab('why_red');
                                        setIsFullScreenInspection(false);
                                    }}
                                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer select-none ${
                                        isBroken
                                            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-400 dark:border-rose-700 ring-2 ring-rose-500/30 shadow-xs'
                                            : 'bg-slate-50/70 dark:bg-base-950/50 border-slate-200 dark:border-base-800 hover:border-emerald-400 hover:bg-white dark:hover:bg-base-850'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        <span className={`font-mono font-black text-[11px] px-2 py-0.5 rounded-md ${
                                            isBroken ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-base-800 text-slate-900 dark:text-slate-100'
                                        }`}>
                                            {eq.equipmentNo}
                                        </span>
                                        <span className="text-xs">{isBroken ? '🚨' : '🟢'}</span>
                                    </div>
                                    <p className={`text-xs font-extrabold line-clamp-2 mt-2 leading-tight ${
                                        isBroken ? 'text-rose-950 dark:text-rose-100' : 'text-slate-800 dark:text-slate-200'
                                    }`}>
                                        {eq.equipmentName}
                                    </p>
                                    <div className="mt-2 pt-1.5 border-t border-slate-200/50 dark:border-base-800 flex items-center justify-between text-[10px]">
                                        <span className="text-slate-400 truncate max-w-[75px]">{eq.owner}</span>
                                        {isBroken ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleResolveBreakdown(eq);
                                                }}
                                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-black text-[9px] cursor-pointer"
                                            >
                                                ปกติแล้ว 🟢
                                            </button>
                                        ) : (
                                            <span className="text-emerald-600 font-bold">ปกติ</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {displayList.length === 0 && (
                    <div className="py-12 text-center space-y-2">
                        <CheckCircleIcon className="h-8 w-8 text-slate-300 mx-auto" />
                        <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                            ไม่พบเครื่องมือที่ตรงกับเงื่อนไขการค้นหา
                        </h4>
                        <p className="text-xs text-slate-400">
                            ลองเปลี่ยนคำค้นหาหรือกดปุ่มล้างตัวกรองด้านบน
                        </p>
                    </div>
                )}
            </div>

            {/* EXECUTIVE DRILL-DOWN INSPECTION MODAL */}
            {currentInspected && (
                <div 
                    className={`fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in ${
                        isFullScreenInspection ? 'p-0' : 'p-3 md:p-6'
                    }`}
                    onClick={() => setInspectedEquipmentId(null)}
                >
                    <div 
                        className={`relative bg-white dark:bg-base-900 border border-slate-200 dark:border-base-800 shadow-2xl flex flex-col transition-all overflow-hidden ${
                            isFullScreenInspection 
                                ? 'w-full h-full rounded-none' 
                                : 'w-full max-w-4xl max-h-[92vh] rounded-[2rem]'
                        }`}
                        onClick={e => e.stopPropagation()}
                    >
                        {(() => {
                            const isBroken = isEquipmentBroken(currentInspected);
                            const incident = currentInspected.breakdownStatus?.currentIncident;
                            const daysDown = isBroken ? getDaysDown(incident?.reportedDate) : 0;
                            const currentStageObj = STAGES.find(s => s.stage === incident?.stage) || STAGES[0];

                            return (
                                <>
                                    {/* MODAL TOP BAR */}
                                    <div className={`p-5 md:p-6 border-b flex items-start justify-between gap-4 ${
                                        isBroken
                                            ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
                                            : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
                                    }`}>
                                        <div className="space-y-1.5 flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`font-mono font-black text-xs px-2.5 py-1 rounded-xl shadow-xs ${
                                                    isBroken ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                                                }`}>
                                                    {currentInspected.equipmentNo}
                                                </span>

                                                {isBroken ? (
                                                    <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white flex items-center gap-1.5 shadow-sm">
                                                        <AlertTriangleIcon className="h-3.5 w-3.5" />
                                                        <span>🚨 สถานะ: ชำรุด / กำลังซ่อม ({currentStageObj.shortTitle})</span>
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1.5">
                                                        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" />
                                                        <span>🟢 สถานะ: พร้อมใช้งานตามปกติ 100%</span>
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white break-words leading-snug">
                                                {currentInspected.equipmentName}
                                            </h3>

                                            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
                                                <span>👤 ผู้รับผิดชอบ: <strong>{currentInspected.owner}</strong></span>
                                                <span>📍 สถานที่: <strong>{currentInspected.location || currentInspected.department || 'Lab'}</strong></span>
                                                {isBroken && incident && (
                                                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                                                        ⏱️ เครื่องหยุดทำงานมาแล้ว {daysDown} วัน (แจ้งเมื่อ {incident.reportedDate})
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Window Controls */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setHistoryModalEq(currentInspected)}
                                                className="px-3 py-1.5 bg-white dark:bg-base-800 hover:bg-slate-100 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-base-700 flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                                            >
                                                <span>📜 แฟ้มประวัติ</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsFullScreenInspection(!isFullScreenInspection)}
                                                className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-base-800 text-slate-500 transition-all text-xs font-bold cursor-pointer"
                                            >
                                                {isFullScreenInspection ? '🗗 ย่อจอ' : '🗖 เต็มจอ'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setInspectedEquipmentId(null)}
                                                className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-base-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all cursor-pointer"
                                            >
                                                <XCircleIcon className="h-6 w-6" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* SECTION TABS FOR DEEP-DIVE */}
                                    {isBroken ? (
                                        <div className="flex border-b border-slate-200 dark:border-base-800 bg-slate-50/70 dark:bg-base-950/40 px-6">
                                            <button
                                                type="button"
                                                onClick={() => setDetailTab('why_red')}
                                                className={`py-3 px-4 font-black text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                                                    detailTab === 'why_red'
                                                        ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                                                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                                }`}
                                            >
                                                <AlertTriangleIcon className="h-4 w-4" />
                                                <span>1. อาการเสีย & ขั้นตอนการซ่อม 6 ขั้น</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDetailTab('actions_done')}
                                                className={`py-3 px-4 font-black text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                                                    detailTab === 'actions_done'
                                                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                                                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                                }`}
                                            >
                                                <DocumentTextIcon className="h-4 w-4" />
                                                <span>2. ไทม์ไลน์การดำเนินการ ({(incident?.actionLogs || []).length} รายการ)</span>
                                            </button>
                                        </div>
                                    ) : null}

                                    {/* MODAL BODY */}
                                    <div className="p-5 md:p-6 overflow-y-auto space-y-5 flex-1">
                                        {/* RESOLVE CALLOUT BANNER FOR BROKEN EQUIPMENT */}
                                        {isBroken && (
                                            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border-2 border-emerald-400 dark:border-emerald-700 rounded-2xl flex items-center justify-between gap-4 flex-wrap shadow-xs">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-2xl p-2 bg-emerald-100 dark:bg-emerald-900/60 rounded-xl shrink-0">✅</span>
                                                    <div>
                                                        <h5 className="text-xs md:text-sm font-black text-emerald-950 dark:text-emerald-100">
                                                            ซ่อมเสร็จแล้วใช่หรือไม่? กดเพื่อบันทึกว่าเครื่องปกติพร้อมใช้งานทันที
                                                        </h5>
                                                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                                                            ระบบจะบันทึกประวัติการซ่อมโดยอัตโนมัติ และเปลี่ยนสถานะเครื่องกลับเป็น <strong className="underline">🟢 ปกติพร้อมใช้งาน (Ready 100%)</strong>
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={isResolving}
                                                    onClick={() => handleResolveBreakdown(currentInspected)}
                                                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-md shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer shrink-0"
                                                >
                                                    <CheckCircleIcon className="h-4 w-4" />
                                                    <span>{isResolving ? 'กำลังบันทึก...' : 'บันทึกว่าเครื่องปกติแล้ว 🟢'}</span>
                                                </button>
                                            </div>
                                        )}

                                        {/* INTERACTIVE 6-STEP PROGRESS BAR (คลิกเลือกขั้นตอนหรือคลิกขั้นที่ 6 เพื่อคืนสภาพปกติได้เลย!) */}
                                        {isBroken && (
                                            <div className="bg-slate-50 dark:bg-base-950/50 p-4 rounded-2xl border border-slate-200 dark:border-base-800 space-y-3">
                                                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                                                    <span className="font-black text-slate-800 dark:text-white">
                                                        ความคืบหน้าการซ่อม 6 ขั้นตอน (คลิกที่ขั้นตอนเพื่อเปลี่ยนสถานะได้ทันที):
                                                    </span>
                                                    <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-lg">
                                                        ปัจจุบัน: {currentStageObj.title}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                                                    {STAGES.map((st) => {
                                                        const isPassed = st.stepNumber < currentStageObj.stepNumber;
                                                        const isCurrent = st.stepNumber === currentStageObj.stepNumber;
                                                        const isStep6 = st.stage === 'repaired_verified';

                                                        return (
                                                            <button
                                                                key={st.stage}
                                                                type="button"
                                                                onClick={() => handleSetStage(currentInspected, st.stage)}
                                                                className={`p-2.5 rounded-xl text-center border transition-all text-xs flex flex-col justify-between cursor-pointer active:scale-95 ${
                                                                    isCurrent
                                                                        ? `${st.activeColor} shadow-md ring-2 ring-rose-500/20`
                                                                        : isPassed
                                                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                                                                        : isStep6
                                                                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-600 hover:text-white'
                                                                        : 'bg-white dark:bg-base-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-base-800 hover:border-indigo-400'
                                                                }`}
                                                            >
                                                                <div className="text-[11px] font-black">
                                                                    {isPassed ? '✓ ' : ''}{st.shortTitle}
                                                                </div>
                                                                <div className="text-[9px] mt-1 line-clamp-1 opacity-85">
                                                                    {st.desc}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {isBroken && incident ? (
                                            <>
                                                {detailTab === 'why_red' && (
                                                    <div className="space-y-4 animate-fade-in">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                                            <div className="bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-4 rounded-2xl space-y-1.5">
                                                                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-black text-xs">
                                                                    <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                                                                    <span>อาการเสียที่ตรวจพบ (Symptom):</span>
                                                                </div>
                                                                <p className="text-sm font-bold text-slate-900 dark:text-rose-100 leading-relaxed">
                                                                    {incident.symptom || 'ไม่ระบุอาการเสีย'}
                                                                </p>
                                                            </div>

                                                            <div className="bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-800 p-4 rounded-2xl space-y-1.5">
                                                                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-black text-xs">
                                                                    <SearchIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                                                    <span>สาเหตุความผิดปกติ (Root Cause):</span>
                                                                </div>
                                                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                                                                    {incident.rootCause || 'กำลังอยู่ระหว่างการตรวจสอบและวินิจฉัยโดยช่างผู้เชี่ยวชาญ'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                                            <div className="p-3 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800">
                                                                <span className="text-[10px] font-black uppercase text-slate-400 block">ผู้แจ้ง & วันที่แจ้ง</span>
                                                                <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                                                                    {incident.reportedBy || currentInspected.owner} ({incident.reportedDate})
                                                                </p>
                                                            </div>
                                                            <div className="p-3 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800">
                                                                <span className="text-[10px] font-black uppercase text-slate-400 block">ช่าง / Vendor ผู้ซ่อม</span>
                                                                <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                                                                    {incident.vendorOrTechnician || 'รอระบุช่างผู้ซ่อม'}
                                                                </p>
                                                            </div>
                                                            <div className="p-3 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800">
                                                                <span className="text-[10px] font-black uppercase text-slate-400 block">ใบเสนอราคา / PR</span>
                                                                <p className="font-mono font-bold text-slate-800 dark:text-white mt-0.5">
                                                                    {[incident.quotationNo, incident.repairPrNo].filter(Boolean).join(' / ') || '-'}
                                                                </p>
                                                            </div>
                                                            <div className="p-3 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800">
                                                                <span className="text-[10px] font-black uppercase text-slate-400 block">กำหนดเสร็จคาดการณ์</span>
                                                                <p className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                                                                    {incident.targetResolutionDate || 'รอกำหนดวัน'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {detailTab === 'actions_done' && (
                                                    <div className="space-y-4 animate-fade-in">
                                                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                                                            {incident.actionLogs && incident.actionLogs.length > 0 ? (
                                                                incident.actionLogs.map((log, lIdx) => (
                                                                    <div 
                                                                        key={log.id || `log_${lIdx}`}
                                                                        className="p-3 bg-white dark:bg-base-950/60 rounded-xl border border-slate-200 dark:border-base-800 flex items-start gap-3 shadow-2xs"
                                                                    >
                                                                        <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                                                                                {log.action}
                                                                            </p>
                                                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                                                                                <span>📅 {log.date}</span>
                                                                                {log.actor && <span>• 👤 {log.actor}</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <div className="p-4 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 text-center text-xs text-slate-400">
                                                                    ยังไม่มีบันทึกรายละเอียดเพิ่มเติม
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="p-3 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 space-y-2">
                                                            <span className="text-[10px] font-black uppercase text-slate-500 block">
                                                                + เพิ่มบันทึกความคืบหน้าการซ่อม (Add Progress Note)
                                                            </span>
                                                            <div className="flex flex-col sm:flex-row gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="เช่น ช่างเปลี่ยนอะไหล่และทดสอบเบื้องต้นแล้ว..."
                                                                    value={newActionNote}
                                                                    onChange={e => setNewActionNote(e.target.value)}
                                                                    className="flex-1 px-3 py-1.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="ผู้บันทึก"
                                                                    value={newActionActor}
                                                                    onChange={e => setNewActionActor(e.target.value)}
                                                                    className="w-32 px-2.5 py-1.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddActionLog(currentInspected)}
                                                                    disabled={isSavingLog || !newActionNote.trim()}
                                                                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                                                                >
                                                                    {isSavingLog ? 'กำลังบันทึก...' : 'บันทึกความคืบหน้า'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            /* NORMAL EQUIPMENT DETAILS VIEW */
                                            <div className="space-y-4 animate-fade-in">
                                                <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                                                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-black text-xs">
                                                        <CheckCircleIcon className="h-4 w-4" />
                                                        <span>เครื่องมือนี้อยู่ในสถานะปกติและพร้อมใช้งานตามมาตรฐาน (🟢 Ready 100%)</span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 pl-6 leading-relaxed">
                                                        ไม่พบรายการแจ้งชำรุดที่ค้างอยู่ในระบบ แผนการสอบเทียบ (Calibration) และแผนบำรุงรักษา (PM) เป็นไปตามกำหนดการ
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                    <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                        <span className="text-[10px] font-bold text-slate-400 block">แผนบำรุงรักษา (PM)</span>
                                                        <p className="font-bold text-slate-800 dark:text-white">
                                                            เดือนที่กำหนด: {currentInspected.pm?.lastPM || '-'} • ความถี่ {currentInspected.pm?.freqYear || '-'} ครั้ง/ปี
                                                        </p>
                                                    </div>
                                                    <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                        <span className="text-[10px] font-bold text-slate-400 block">แผนสอบเทียบ (Calibration)</span>
                                                        <p className="font-bold text-slate-800 dark:text-white">
                                                            เดือนที่กำหนด: {currentInspected.cal?.lastCal || '-'} • ความถี่ {currentInspected.cal?.freqYear || '-'} ครั้ง/ปี
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedEquipmentForReport(currentInspected.id);
                                                            setIsReportModalOpen(true);
                                                        }}
                                                        className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-rose-200 dark:border-rose-900 transition-all cursor-pointer"
                                                    >
                                                        <AlertTriangleIcon className="h-4 w-4" />
                                                        <span>🚨 พบปัญหาในเครื่องนี้? คลิกเพื่อบันทึกแจ้งเครื่องเสีย</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* FOOTER ACTIONS */}
                                    <div className="p-4 bg-slate-50 dark:bg-base-950/60 border-t border-slate-200 dark:border-base-800 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            {isBroken && (
                                                <button
                                                    type="button"
                                                    onClick={() => openEditIncidentModal(currentInspected)}
                                                    className="px-3.5 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                                                >
                                                    <PencilIcon className="h-3.5 w-3.5 text-indigo-600" />
                                                    <span>แก้ไขข้อมูล / เปลี่ยนสถานะเป็นเครื่องปกติ</span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isBroken && currentStageObj.stepNumber < 6 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleAdvanceStage(currentInspected)}
                                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm cursor-pointer"
                                                >
                                                    <span>⏩ เลื่อนสู่ขั้นถัดไป</span>
                                                </button>
                                            )}

                                            {isBroken && (
                                                <button
                                                    type="button"
                                                    disabled={isResolving}
                                                    onClick={() => handleResolveBreakdown(currentInspected)}
                                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-emerald-500/20 cursor-pointer"
                                                >
                                                    <CheckCircleIcon className="h-4 w-4" />
                                                    <span>{isResolving ? 'กำลังบันทึก...' : '✅ บันทึกว่าเครื่องปกติแล้ว (Resolve)'}</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => setInspectedEquipmentId(null)}
                                                className="px-4 py-2 bg-slate-200 dark:bg-base-800 hover:bg-slate-300 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-all cursor-pointer"
                                            >
                                                ปิดหน้าต่าง
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* REPORT BREAKDOWN MODAL */}
            {isReportModalOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in"
                    onClick={() => setIsReportModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <h3 className="text-base font-black text-rose-600 flex items-center gap-2">
                                <AlertTriangleIcon className="h-5 w-5" />
                                <span>บันทึกแจ้งเครื่องมือชำรุด / เสีย</span>
                            </h3>
                            <button type="button" onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleReportBreakdown} className="space-y-3.5 text-xs">
                            <div className="space-y-1">
                                <label className="font-bold text-slate-700 dark:text-slate-300">เลือกเครื่องมือหลัก *</label>
                                <select
                                    name="equipmentId"
                                    value={selectedEquipmentForReport}
                                    onChange={e => setSelectedEquipmentForReport(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                    required
                                >
                                    {primaryEquipments.map(eq => (
                                        <option key={eq.id} value={eq.id}>
                                            {eq.equipmentNo} - {eq.equipmentName} ({eq.owner})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-slate-700 dark:text-slate-300">อาการเสียที่พบ (Symptom) *</label>
                                <textarea
                                    name="symptom"
                                    required
                                    rows={2}
                                    placeholder="เช่น เปิดไม่ติด, หัววัด Error, เซนเซอร์ไม่ทำงาน..."
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-slate-700 dark:text-slate-300">สาเหตุเบื้องต้น (ถ้าทราบ)</label>
                                <input
                                    type="text"
                                    name="rootCause"
                                    placeholder="เช่น ตัวบอร์ดเสื่อมสภาพ, ไฟกระชาก..."
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">ระดับผลกระทบ</label>
                                    <select
                                        name="impactLevel"
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                    >
                                        <option value="Critical">🔴 วิกฤต (Critical - หยุดทดสอบ)</option>
                                        <option value="Moderate">🟡 ปานกลาง (Moderate)</option>
                                        <option value="Low">🟢 เล็กน้อย (Low)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">วันที่แจ้งเสีย</label>
                                    <input
                                        type="date"
                                        name="reportedDate"
                                        defaultValue={new Date().toISOString().split('T')[0]}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">ผู้แจ้ง</label>
                                    <input
                                        type="text"
                                        name="reportedBy"
                                        placeholder="ชื่อผู้แจ้ง"
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">ช่าง / บริษัทผู้ซ่อม</label>
                                    <input
                                        type="text"
                                        name="vendorOrTechnician"
                                        placeholder="เช่น Service Bruker"
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsReportModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md shadow-rose-500/20 cursor-pointer"
                                >
                                    บันทึกแจ้งเสีย
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT INCIDENT & MACHINE STATUS MODAL (รองรับการเลือกเปลี่ยนสถานะเป็น "เครื่องปกติแล้ว" แล้วกดบันทึกได้ทันที!) */}
            {isEditIncidentModalOpen && activeIncidentForEdit && currentInspected && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in"
                    onClick={() => setIsEditIncidentModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-xl w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[92vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <PencilIcon className="h-5 w-5 text-indigo-600" />
                                    <span>แก้ไขสถานะและข้อมูลการซ่อม ({currentInspected.equipmentNo})</span>
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">{currentInspected.equipmentName}</p>
                            </div>
                            <button type="button" onClick={() => setIsEditIncidentModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <form 
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const form = new FormData(e.currentTarget);

                                const updatedIncident: BreakdownRecord = {
                                    ...activeIncidentForEdit,
                                    symptom: (form.get('symptom') as string) || activeIncidentForEdit.symptom,
                                    rootCause: (form.get('rootCause') as string) || '',
                                    impactLevel: (form.get('impactLevel') as any) || activeIncidentForEdit.impactLevel,
                                    stage: editModalStatusMode === 'resolved' ? 'repaired_verified' : editModalStage,
                                    quotationNo: (form.get('quotationNo') as string) || '',
                                    repairPrNo: (form.get('repairPrNo') as string) || '',
                                    costEstimate: Number(form.get('costEstimate')) || undefined,
                                    vendorOrTechnician: (form.get('vendorOrTechnician') as string) || '',
                                    targetResolutionDate: (form.get('targetResolutionDate') as string) || '',
                                    resolutionNote: editModalResolutionNote.trim()
                                };

                                // If user selected "เครื่องปกติพร้อมใช้งานแล้ว" OR Stage 6 ('repaired_verified'), resolve immediately!
                                if (editModalStatusMode === 'resolved' || editModalStage === 'repaired_verified') {
                                    const resolvedEq = buildResolvedEquipment(
                                        currentInspected,
                                        editModalResolutionNote.trim() || 'ซ่อมเสร็จสมบูรณ์และคืนสภาพพร้อมใช้งานปกติ 100%',
                                        updatedIncident
                                    );
                                    await applyAndSaveEquipment(resolvedEq);
                                    setIsEditIncidentModalOpen(false);
                                    setResolveSuccessMessage(`✅ บันทึกสำเร็จ: เครื่องมือ ${currentInspected.equipmentNo} เปลี่ยนสถานะเป็น "🟢 ปกติพร้อมใช้งาน" เรียบร้อยแล้ว`);
                                    setTimeout(() => setResolveSuccessMessage(null), 6000);
                                    return;
                                }

                                const updatedEq: Equipment = {
                                    ...currentInspected,
                                    status: 'issue',
                                    breakdownStatus: {
                                        ...currentInspected.breakdownStatus,
                                        isBroken: true,
                                        currentIncident: updatedIncident,
                                        history: currentInspected.breakdownStatus?.history || []
                                    }
                                };

                                await applyAndSaveEquipment(updatedEq);
                                setIsEditIncidentModalOpen(false);
                                setResolveSuccessMessage(`บันทึกการแก้ไขข้อมูลซ่อมเครื่อง ${currentInspected.equipmentNo} เรียบร้อยแล้ว`);
                                setTimeout(() => setResolveSuccessMessage(null), 4000);
                            }}
                            className="space-y-4 text-xs"
                        >
                            {/* STEP 1: STATUS SELECTOR (กำลังซ่อม VS เครื่องปกติแล้ว) */}
                            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-700 space-y-2.5">
                                <label className="font-black text-slate-800 dark:text-white block">
                                    1. เลือกสถานะเครื่องมือปัจจุบัน *
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditModalStatusMode('broken');
                                            if (editModalStage === 'repaired_verified') setEditModalStage('repairing');
                                        }}
                                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                                            editModalStatusMode === 'broken'
                                                ? 'bg-rose-600 text-white border-rose-600 shadow-sm font-black'
                                                : 'bg-white dark:bg-base-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-base-700'
                                        }`}
                                    >
                                        <span className="text-base">🚨</span>
                                        <div>
                                            <div className="text-xs font-black">ยังชำรุด / อยู่ระหว่างซ่อม</div>
                                            <div className={`text-[10px] ${editModalStatusMode === 'broken' ? 'text-rose-100' : 'text-slate-400'}`}>
                                                อัปเดตขั้นตอนและรายละเอียดการซ่อม
                                            </div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditModalStatusMode('resolved');
                                            setEditModalStage('repaired_verified');
                                        }}
                                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                                            editModalStatusMode === 'resolved'
                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm font-black'
                                                : 'bg-white dark:bg-base-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-base-700 hover:border-emerald-400'
                                        }`}
                                    >
                                        <span className="text-base">🟢</span>
                                        <div>
                                            <div className="text-xs font-black">เครื่องปกติพร้อมใช้งานแล้ว</div>
                                            <div className={`text-[10px] ${editModalStatusMode === 'resolved' ? 'text-emerald-100' : 'text-slate-400'}`}>
                                                ปิดงานซ่อมและคืนสภาพปกติ 100%
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {editModalStatusMode === 'broken' ? (
                                    <div className="pt-2">
                                        <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                            ขั้นตอนการซ่อมปัจจุบัน (Stage 1–6)
                                        </label>
                                        <select
                                            value={editModalStage}
                                            onChange={e => {
                                                const val = e.target.value as BreakdownStage;
                                                setEditModalStage(val);
                                                if (val === 'repaired_verified') {
                                                    setEditModalStatusMode('resolved');
                                                }
                                            }}
                                            className="w-full px-3 py-2 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl font-bold text-slate-900 dark:text-white"
                                        >
                                            {STAGES.map(st => (
                                                <option key={st.stage} value={st.stage}>
                                                    {st.title} — {st.desc}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="pt-2 space-y-1">
                                        <label className="font-bold text-emerald-700 dark:text-emerald-300 block">
                                            บันทึกสรุปผลการซ่อม / การตรวจรับคืนสภาพปกติ
                                        </label>
                                        <input
                                            type="text"
                                            value={editModalResolutionNote}
                                            onChange={e => setEditModalResolutionNote(e.target.value)}
                                            placeholder="เช่น เปลี่ยนอะไหล่เรียบร้อย ทดสอบผ่านเกณฑ์ พร้อมใช้งาน 100%"
                                            className="w-full px-3 py-2 bg-white dark:bg-base-900 border border-emerald-300 dark:border-emerald-700 rounded-xl font-bold text-slate-900 dark:text-white"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-slate-700 dark:text-slate-300">อาการเสีย</label>
                                <textarea
                                    name="symptom"
                                    defaultValue={activeIncidentForEdit.symptom}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-slate-700 dark:text-slate-300">สาเหตุความผิดปกติ</label>
                                <input
                                    type="text"
                                    name="rootCause"
                                    defaultValue={activeIncidentForEdit.rootCause || ''}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">ระดับผลกระทบ</label>
                                    <select
                                        name="impactLevel"
                                        defaultValue={activeIncidentForEdit.impactLevel}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                    >
                                        <option value="Critical">Critical (วิกฤต)</option>
                                        <option value="Moderate">Moderate (ปานกลาง)</option>
                                        <option value="Low">Low (เล็กน้อย)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">ผู้ซ่อม / Vendor</label>
                                    <input
                                        type="text"
                                        name="vendorOrTechnician"
                                        defaultValue={activeIncidentForEdit.vendorOrTechnician || ''}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">เลขที่ใบเสนอราคา</label>
                                    <input
                                        type="text"
                                        name="quotationNo"
                                        defaultValue={activeIncidentForEdit.quotationNo || ''}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">เลขที่ PR ซ่อม</label>
                                    <input
                                        type="text"
                                        name="repairPrNo"
                                        defaultValue={activeIncidentForEdit.repairPrNo || ''}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-bold text-slate-700 dark:text-slate-300">ค่าใช้จ่าย (บาท)</label>
                                    <input
                                        type="number"
                                        name="costEstimate"
                                        defaultValue={activeIncidentForEdit.costEstimate || ''}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-slate-700 dark:text-slate-300">กำหนดแล้วเสร็จคาดการณ์</label>
                                <input
                                    type="date"
                                    name="targetResolutionDate"
                                    defaultValue={activeIncidentForEdit.targetResolutionDate || ''}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                />
                            </div>

                            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsEditIncidentModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className={`px-5 py-2 text-white rounded-xl font-black shadow-md cursor-pointer ${
                                        editModalStatusMode === 'resolved'
                                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                            : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                                    }`}
                                >
                                    {editModalStatusMode === 'resolved'
                                        ? '✅ บันทึกว่าเครื่องปกติพร้อมใช้งานแล้ว'
                                        : '💾 บันทึกการแก้ไขข้อมูลซ่อม'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DEDICATED EQUIPMENT HISTORY & LOGBOOK MODAL */}
            <EquipmentHistoryModal
                isOpen={!!historyModalEq}
                equipment={historyModalEq}
                allEquipments={localEquipments}
                onSelectEquipment={(eq) => setHistoryModalEq(eq)}
                onClose={() => setHistoryModalEq(null)}
                onSaveEquipment={async (updated: Equipment) => {
                    await applyAndSaveEquipment(updated);
                    setHistoryModalEq(updated);
                }}
            />
        </div>
    );
};

export default BreakdownTab;
