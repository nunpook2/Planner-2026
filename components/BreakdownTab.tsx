import React, { useState, useMemo } from 'react';
import type { Equipment, BreakdownRecord, BreakdownStage, BreakdownActionLog } from '../types';
import { saveEquipment } from '../services/dataService';
import { 
    AlertTriangleIcon, CheckCircleIcon, ClockIcon, SearchIcon, 
    PlusIcon, PencilIcon, DocumentTextIcon, RefreshIcon, 
    XCircleIcon, BeakerIcon, InformationCircleIcon
} from './common/Icons';

interface BreakdownTabProps {
    equipments: Equipment[];
    onEquipmentUpdated: () => void;
}

const STAGES: { stage: BreakdownStage; stepNumber: number; title: string; shortTitle: string; desc: string; badgeColor: string }[] = [
    { stage: 'reported', stepNumber: 1, title: '1. รับแจ้งอาการเสีย', shortTitle: '1. รับแจ้ง', desc: 'ลงทะเบียนรับแจ้งเครื่องมือชำรุด', badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
    { stage: 'investigating', stepNumber: 2, title: '2. ตรวจสอบ/หาสาเหตุ', shortTitle: '2. หาสาเหตุ', desc: 'ตรวจสอบอาการและวินิจฉัยปัญหา', badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
    { stage: 'quotation_repair', stepNumber: 3, title: '3. ขอใบเสนอราคาซ่อม', shortTitle: '3. ขอราคา', desc: 'ติดต่อ Vendor/ผู้จำหน่ายขอราคาอะไหล่', badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
    { stage: 'pr_repair', stepNumber: 4, title: '4. ออกใบ PR ซ่อม/อนุมัติงบ', shortTitle: '4. ออก PR', desc: 'เปิดใบสั่งซื้อในระบบจัดซื้อ', badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' },
    { stage: 'repairing', stepNumber: 5, title: '5. กำลังดำเนินการซ่อม', shortTitle: '5. ซ่อมอยู่', desc: 'ช่างเข้าหน้างานหรือส่งซ่อมศูนย์', badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' },
    { stage: 'repaired_verified', stepNumber: 6, title: '6. ตรวจรับ & พร้อมใช้งาน', shortTitle: '6. ตรวจรับเสร็จ', desc: 'ทดสอบระบบ ตรวจรับ และเปิดใช้งาน', badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' }
];

// Helper to sort equipment naturally (e.g. PDF 1-001, PDF 1-002, 1-003, PDS-1001, PDS-1002...)
const naturalEquipmentCompare = (a: Equipment, b: Equipment): number => {
    const noA = String(a.equipmentNo || a.code || a.name || '').trim();
    const noB = String(b.equipmentNo || b.code || b.name || '').trim();
    return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
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

export const BreakdownTab: React.FC<BreakdownTabProps> = ({ equipments, onEquipmentUpdated }) => {
    // Filters & Display modes
    const [viewFilter, setViewFilter] = useState<'all' | 'broken_only' | 'normal_only'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDept, setSelectedDept] = useState<string>('all');
    const [displayDensity, setDisplayDensity] = useState<'matrix' | 'table' | 'cards'>('matrix'); // 'matrix' = Single-Screen Board, 'table' = Full-width Table, 'cards' = Detailed Cards
    
    // Drill-down selection (clicked machine)
    const [inspectedEquipment, setInspectedEquipment] = useState<Equipment | null>(null);
    const [detailTab, setDetailTab] = useState<'why_red' | 'actions_done'>('why_red');
    const [isFullScreenInspection, setIsFullScreenInspection] = useState<boolean>(false);
    
    // Quick action log entry state
    const [newActionNote, setNewActionNote] = useState('');
    const [newActionActor, setNewActionActor] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    // Modals
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedEquipmentForReport, setSelectedEquipmentForReport] = useState<string>('');
    const [isEditIncidentModalOpen, setIsEditIncidentModalOpen] = useState(false);
    const [activeIncidentForEdit, setActiveIncidentForEdit] = useState<BreakdownRecord | null>(null);

    // Filter PRIMARY ONLY equipments (strictly no '/' in equipmentNo) & SORT NUMERICALLY FROM LOW TO HIGH
    const primaryEquipments = useMemo(() => {
        const filtered = (equipments || []).filter(eq => {
            if (!eq) return false;
            const eqNo = String(eq.equipmentNo || eq.code || eq.name || '');
            return eqNo && !eqNo.includes('/');
        });
        return [...filtered].sort(naturalEquipmentCompare);
    }, [equipments]);

    // Broken equipments
    const brokenEquipments = useMemo(() => {
        return primaryEquipments.filter(eq => eq.status === 'issue' || eq.breakdownStatus?.isBroken);
    }, [primaryEquipments]);

    // Normal equipments
    const normalEquipments = useMemo(() => {
        return primaryEquipments.filter(eq => eq.status !== 'issue' && !eq.breakdownStatus?.isBroken);
    }, [primaryEquipments]);

    // Keep inspected equipment in sync
    const currentInspected = useMemo(() => {
        if (!inspectedEquipment) return null;
        return primaryEquipments.find(e => e.id === inspectedEquipment.id) || inspectedEquipment;
    }, [inspectedEquipment, primaryEquipments]);

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

    // Department list
    const departments = useMemo(() => {
        const set = new Set<string>();
        primaryEquipments.forEach(eq => {
            if (eq.department) set.add(eq.department);
        });
        return Array.from(set);
    }, [primaryEquipments]);

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

        return list.filter(eq => {
            if (selectedDept !== 'all' && eq.department !== selectedDept) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const no = String(eq.equipmentNo || '').toLowerCase();
                const name = String(eq.equipmentName || '').toLowerCase();
                const owner = String(eq.owner || '').toLowerCase();
                return no.includes(q) || name.includes(q) || owner.includes(q);
            }
            return true;
        });
    }, [viewFilter, brokenEquipments, normalEquipments, primaryEquipments, selectedDept, searchQuery]);

    // Resolve Breakdown (Mark Fixed & Return to Green 🟢)
    const handleResolveBreakdown = async (eq: Equipment) => {
        const curInc = eq.breakdownStatus?.currentIncident;
        const resolveDate = new Date().toISOString().split('T')[0];

        const resolvedIncident: BreakdownRecord = curInc ? {
            ...curInc,
            stage: 'repaired_verified',
            resolvedDate: resolveDate,
            resolutionNote: curInc.resolutionNote || 'ตรวจรับการซ่อมแซมสมบูรณ์ เครื่องกลับคืนสู่สภาพพร้อมใช้งานปกติ'
        } : {
            id: `inc_res_${Date.now()}`,
            equipmentId: eq.id,
            equipmentNo: eq.equipmentNo,
            equipmentName: eq.equipmentName,
            reportedDate: resolveDate,
            reportedBy: eq.owner,
            symptom: 'แก้ไขแล้ว',
            impactLevel: 'Low',
            stage: 'repaired_verified',
            resolvedDate: resolveDate,
            resolutionNote: 'ตรวจรับการซ่อมแซมสมบูรณ์ เครื่องกลับคืนสู่สภาพพร้อมใช้งานปกติ'
        };

        const updated: Equipment = {
            ...eq,
            status: 'ready',
            breakdownStatus: {
                isBroken: false,
                currentIncident: undefined,
                history: [resolvedIncident, ...(eq.breakdownStatus?.history || [])]
            }
        };

        await saveEquipment(updated);
        setInspectedEquipment(null);
        onEquipmentUpdated();
    };

    // Advance Stage to Next Step
    const handleAdvanceStage = async (eq: Equipment) => {
        const curInc = eq.breakdownStatus?.currentIncident;
        if (!curInc) return;

        const stageOrder: BreakdownStage[] = ['reported', 'investigating', 'quotation_repair', 'pr_repair', 'repairing', 'repaired_verified'];
        const curIdx = stageOrder.indexOf(curInc.stage);
        if (curIdx < stageOrder.length - 1) {
            const nextStage = stageOrder[curIdx + 1];
            const stageObj = STAGES.find(s => s.stage === nextStage);
            const dateStr = new Date().toISOString().split('T')[0];

            const autoLog: BreakdownActionLog = {
                id: `log_${Date.now()}`,
                date: dateStr,
                action: `เปลี่ยนสถานะเป็น: ${stageObj ? stageObj.title : nextStage}`,
                actor: curInc.reportedBy || 'เจ้าหน้าที่',
                stage: nextStage
            };

            const existingLogs = curInc.actionLogs || [];
            const updatedIncident: BreakdownRecord = {
                ...curInc,
                stage: nextStage,
                actionLogs: [autoLog, ...existingLogs]
            };

            const updated: Equipment = {
                ...eq,
                status: 'issue',
                breakdownStatus: {
                    ...eq.breakdownStatus,
                    isBroken: true,
                    currentIncident: updatedIncident
                }
            };
            await saveEquipment(updated);
            if (inspectedEquipment?.id === eq.id) {
                setInspectedEquipment(updated);
            }
            onEquipmentUpdated();
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
                breakdownStatus: {
                    ...eq.breakdownStatus,
                    isBroken: true,
                    currentIncident: updatedIncident
                }
            };

            await saveEquipment(updated);
            setNewActionNote('');
            if (inspectedEquipment?.id === eq.id) {
                setInspectedEquipment(updated);
            }
            onEquipmentUpdated();
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

        await saveEquipment(updated);
        setIsReportModalOpen(false);
        setInspectedEquipment(updated);
        setDetailTab('why_red');
        onEquipmentUpdated();
    };

    return (
        <div className="space-y-4 animate-fade-in w-full">
            {/* EXECUTIVE CONTROL HEADER & KPI SUMMARY BAR */}
            <div className="bg-white dark:bg-base-900 px-5 py-4 rounded-3xl border border-slate-200/90 dark:border-base-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/60 px-2.5 py-0.5 rounded-full border border-primary-200/50">
                            Executive Overview
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                            ผังสถานะเครื่องมือภาพรวมหน้าจอเดียว (เรียงตามหมายเลขน้อยไปหามาก)
                        </span>
                    </div>
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                            เครื่องมือ
                        </h2>
                        <span className="text-xs font-bold text-slate-500">
                            ทั้งหมด {primaryEquipments.length} เครื่อง
                        </span>
                    </div>
                </div>

                {/* EXECUTIVE AT-A-GLANCE STATUS METRICS */}
                <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                    {/* Normal Status Metric */}
                    <button
                        onClick={() => setViewFilter(viewFilter === 'normal_only' ? 'all' : 'normal_only')}
                        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-all text-left ${
                            viewFilter === 'normal_only'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-400 ring-2 ring-emerald-500/20'
                                : 'bg-slate-50/80 dark:bg-base-800/80 border-slate-200 dark:border-base-700 hover:border-emerald-300'
                        }`}
                        title="คลิกกรองดูเฉพาะเครื่องปกติ"
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <div>
                            <div className="text-[10px] font-bold text-slate-400 leading-tight">ปกติพร้อมใช้</div>
                            <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                                {kpi.ready} เครื่อง <span className="text-[10px] font-bold text-slate-400">({kpi.availabilityRate}%)</span>
                            </div>
                        </div>
                    </button>

                    {/* Abnormal Alert Metric */}
                    <button
                        onClick={() => setViewFilter(viewFilter === 'broken_only' ? 'all' : 'broken_only')}
                        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-all text-left ${
                            kpi.broken > 0
                                ? viewFilter === 'broken_only'
                                    ? 'bg-rose-100/90 dark:bg-rose-950/70 border-rose-500 ring-2 ring-rose-500/30'
                                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 hover:border-rose-400'
                                : 'bg-slate-50/80 dark:bg-base-800/80 border-slate-200 dark:border-base-700 opacity-60'
                        }`}
                        title="คลิกกรองดูเฉพาะเครื่องที่ผิดปกติ"
                    >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${kpi.broken > 0 ? 'bg-rose-600 animate-ping' : 'bg-slate-300'}`} />
                        <div>
                            <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 leading-tight">
                                🚨 ผิดปกติ / ชำรุด
                            </div>
                            <div className="text-sm font-black text-rose-600 dark:text-rose-400 leading-tight">
                                {kpi.broken} เครื่อง {kpi.broken > 0 && <span className="text-[10px] font-bold underline ml-1">กดเพื่อดู</span>}
                            </div>
                        </div>
                    </button>

                    {/* Report New Breakdown Button */}
                    <button
                        onClick={() => {
                            setSelectedEquipmentForReport(primaryEquipments[0]?.id || '');
                            setIsReportModalOpen(true);
                        }}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-base-800 dark:hover:bg-base-700 text-white font-bold rounded-2xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                        <PlusIcon className="h-3.5 w-3.5 text-rose-400" />
                        <span>แจ้งเครื่องเสีย</span>
                    </button>
                </div>
            </div>

            {/* EXECUTIVE FILTER & DENSITY TOOLBAR */}
            <div className="bg-white dark:bg-base-900 px-4 py-2.5 rounded-2xl border border-slate-200/90 dark:border-base-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                {/* Status Toggle Filters */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-base-800 rounded-xl border border-slate-200 dark:border-base-700 shrink-0">
                    <button
                        onClick={() => setViewFilter('all')}
                        className={`px-3 py-1 rounded-lg font-black transition-all ${
                            viewFilter === 'all'
                                ? 'bg-white dark:bg-base-700 text-slate-900 dark:text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                        }`}
                    >
                        แสดงทั้งหมด ({primaryEquipments.length})
                    </button>
                    <button
                        onClick={() => setViewFilter('broken_only')}
                        className={`px-3 py-1 rounded-lg font-black transition-all flex items-center gap-1.5 ${
                            viewFilter === 'broken_only'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                        }`}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        <span>เฉพาะเครื่องผิดปกติ ({brokenEquipments.length})</span>
                    </button>
                    <button
                        onClick={() => setViewFilter('normal_only')}
                        className={`px-3 py-1 rounded-lg font-black transition-all flex items-center gap-1.5 ${
                            viewFilter === 'normal_only'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        }`}
                    >
                        <span>เฉพาะเครื่องปกติ ({normalEquipments.length})</span>
                    </button>
                </div>

                {/* Search & Department Selector */}
                <div className="flex items-center gap-2 flex-1 max-w-lg">
                    <div className="relative flex-1">
                        <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัส เช่น PDF 1-001, PDS-1001..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-primary-500"
                        />
                    </div>

                    {departments.length > 0 && (
                        <select
                            value={selectedDept}
                            onChange={e => setSelectedDept(e.target.value)}
                            className="px-2.5 py-1.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white shrink-0 focus:outline-hidden"
                        >
                            <option value="all">ทุกห้องปฏิบัติการ/แผนก</option>
                            {departments.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    )}

                    {/* Density Toggle */}
                    <div className="flex p-0.5 bg-slate-100 dark:bg-base-800 rounded-xl border border-slate-200 dark:border-base-700 shrink-0">
                        <button
                            onClick={() => setDisplayDensity('matrix')}
                            className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] ${
                                displayDensity === 'matrix'
                                    ? 'bg-white dark:bg-base-700 text-slate-900 dark:text-white shadow-xs font-black'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                            title="ผังตารางบอร์ด แสดงชื่อเต็มทุกเครื่อง"
                        >
                            ผังบอร์ด
                        </button>
                        <button
                            onClick={() => setDisplayDensity('table')}
                            className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] ${
                                displayDensity === 'table'
                                    ? 'bg-white dark:bg-base-700 text-slate-900 dark:text-white shadow-xs font-black'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                            title="ผังแถวตารางกว้างเต็มจอ แสดงชื่อเต็มชัดเจน"
                        >
                            ผังตารางเต็มจอ
                        </button>
                        <button
                            onClick={() => setDisplayDensity('cards')}
                            className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] ${
                                displayDensity === 'cards'
                                    ? 'bg-white dark:bg-base-700 text-slate-900 dark:text-white shadow-xs font-black'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                            title="ผังการ์ดพร้อมข้อมูลสังเขป"
                        >
                            ผังการ์ด
                        </button>
                    </div>
                </div>
            </div>

            {/* EXECUTIVE STATUS BOARD (FULL-WIDTH OVERVIEW - NO TRUNCATION, FULL EQUIPMENT NAMES) */}
            <div className="bg-white dark:bg-base-900 p-4 md:p-5 rounded-3xl border border-slate-200/90 dark:border-base-800 shadow-sm space-y-3 w-full">
                {/* Matrix Legend & Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-base-800 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800 dark:text-white tracking-tight">
                            ผังสถานะเครื่องมือหลักทั้งหมด ({displayList.length} เครื่อง)
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline-block">
                            • จัดเรียงตามลำดับตัวเลข 1-001 ขึ้นไป (แสดงชื่อเต็มชัดเจน ไม่มีจุดไข่ปลา คลิกที่เครื่องเพื่อดูรายละเอียด)
                        </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span>ปกติ ({kpi.ready})</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                            <span>ผิดปกติ ({kpi.broken})</span>
                        </span>
                    </div>
                </div>

                {/* VIEW 1: MATRIX / GRID BOARD (RESPONSIVE FULL-WIDTH, COMPLETE FULL NAME DISPLAY) */}
                {displayDensity === 'matrix' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                        {displayList.map((eq, idx) => {
                            const isBroken = eq.status === 'issue' || eq.breakdownStatus?.isBroken;

                            return (
                                <button
                                    key={eq.id || `eq_${idx}`}
                                    onClick={() => {
                                        setInspectedEquipment(eq);
                                        setDetailTab('why_red');
                                        setIsFullScreenInspection(false);
                                    }}
                                    className={`relative p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between group active:scale-98 ${
                                        isBroken
                                            ? 'bg-rose-50/95 dark:bg-rose-950/40 border-rose-400 dark:border-rose-800 ring-2 ring-rose-500/40 shadow-sm shadow-rose-500/10 hover:shadow-md hover:border-rose-500'
                                            : 'bg-slate-50/60 dark:bg-base-950/40 border-slate-200/90 dark:border-base-800/90 hover:bg-white dark:hover:bg-base-800 hover:border-emerald-300 dark:hover:border-emerald-700/60 hover:shadow-xs'
                                    }`}
                                    title={`${eq.equipmentNo}: ${eq.equipmentName} - คลิกเพื่อดูรายละเอียด`}
                                >
                                    {/* Top Row: Index + Equipment No + Status Beacon */}
                                    <div className="flex items-center justify-between gap-1.5 w-full pb-1.5 border-b border-slate-200/50 dark:border-base-800/50">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                                                #{String(idx + 1).padStart(2, '0')}
                                            </span>
                                            <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                                                isBroken ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-base-800 text-slate-900 dark:text-slate-100'
                                            }`}>
                                                {eq.equipmentNo}
                                            </span>
                                        </div>

                                        {/* Status Badge */}
                                        {isBroken ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white flex items-center gap-1 animate-pulse shrink-0">
                                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                                <span>ผิดปกติ</span>
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1 shrink-0">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                <span>ปกติ</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Middle: FULL EQUIPMENT NAME (NO TRUNCATION, NO ELLIPSIS, CLEAR & BEAUTIFUL) */}
                                    <div className="my-2.5 w-full flex-1">
                                        <h4 className={`text-xs md:text-sm font-black break-words leading-snug ${
                                            isBroken ? 'text-rose-950 dark:text-rose-100' : 'text-slate-900 dark:text-white'
                                        }`}>
                                            {eq.equipmentName}
                                        </h4>
                                        <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1.5 flex-wrap">
                                            <span>📍 {eq.location || eq.department || 'Lab'}</span>
                                            <span>•</span>
                                            <span>👤 {eq.owner}</span>
                                        </div>
                                    </div>

                                    {/* Bottom: Action hint */}
                                    <div className="w-full pt-1.5 border-t border-slate-200/50 dark:border-base-800/60 flex items-center justify-between text-[10px]">
                                        {isBroken ? (
                                            <span className="font-bold text-rose-600 dark:text-rose-400">
                                                🚨 ดูสาเหตุ & สิ่งที่ทำไปแล้ว
                                            </span>
                                        ) : (
                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                🟢 พร้อมใช้งาน
                                            </span>
                                        )}
                                        <span className="font-bold text-slate-400 group-hover:text-primary-600 text-[10px]">
                                            เจาะลึก ❯
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* VIEW 2: FULL-WIDTH EXECUTIVE TABLE (100% WIDTH, FULL EQUIPMENT NAME, INSTANT SCANNABILITY) */}
                {displayDensity === 'table' && (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-base-800">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 dark:bg-base-950/80 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-base-800">
                                <tr>
                                    <th className="px-3 py-3 w-12 text-center">ลำดับ</th>
                                    <th className="px-3.5 py-3 w-32 whitespace-nowrap">รหัสเครื่อง</th>
                                    <th className="px-4 py-3 min-w-[320px]">ชื่อเต็มเครื่องมือ (Full Equipment Name)</th>
                                    <th className="px-3.5 py-3 w-44 whitespace-nowrap">สถานที่ / ห้องปฏิบัติการ</th>
                                    <th className="px-3.5 py-3 w-36 whitespace-nowrap">ผู้รับผิดชอบ</th>
                                    <th className="px-4 py-3 w-36 whitespace-nowrap text-center">สถานะภาพรวม</th>
                                    <th className="px-3.5 py-3 w-28 text-right whitespace-nowrap">เจาะลึก</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-base-800 font-medium">
                                {displayList.map((eq, idx) => {
                                    const isBroken = eq.status === 'issue' || eq.breakdownStatus?.isBroken;
                                    return (
                                        <tr
                                            key={eq.id || `eq_${idx}`}
                                            onClick={() => {
                                                setInspectedEquipment(eq);
                                                setDetailTab('why_red');
                                                setIsFullScreenInspection(false);
                                            }}
                                            className={`cursor-pointer transition-colors group ${
                                                isBroken
                                                    ? 'bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100/80 dark:hover:bg-rose-900/40'
                                                    : 'hover:bg-slate-50 dark:hover:bg-base-800/50'
                                            }`}
                                        >
                                            <td className="px-3 py-3 text-center font-mono font-bold text-slate-400 text-[11px]">
                                                {String(idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-3.5 py-3 whitespace-nowrap">
                                                <span className={`font-mono font-black text-xs px-2.5 py-1 rounded-lg ${
                                                    isBroken ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-base-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-base-700'
                                                }`}>
                                                    {eq.equipmentNo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`font-black text-xs md:text-sm break-words leading-snug ${
                                                    isBroken ? 'text-rose-900 dark:text-rose-200' : 'text-slate-900 dark:text-white'
                                                }`}>
                                                    {eq.equipmentName}
                                                </span>
                                            </td>
                                            <td className="px-3.5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 text-xs">
                                                📍 {eq.location || eq.department || 'Lab'}
                                            </td>
                                            <td className="px-3.5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                                                👤 {eq.owner}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-center">
                                                {isBroken ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-600 text-white animate-pulse shadow-xs">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                                        <span>🚨 ผิดปกติ</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        <span>🟢 ปกติพร้อมใช้</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3.5 py-3 text-right whitespace-nowrap">
                                                <span className="text-xs font-bold text-primary-600 dark:text-primary-400 group-hover:underline">
                                                    คลิกเจาะลึก ❯
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* VIEW 3: CARDS DENSITY MODE (DETAILED CARDS WITH FULL NAME) */}
                {displayDensity === 'cards' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                        {displayList.map((eq, idx) => {
                            const isBroken = eq.status === 'issue' || eq.breakdownStatus?.isBroken;
                            const incident = eq.breakdownStatus?.currentIncident;
                            const daysDown = isBroken ? getDaysDown(incident?.reportedDate) : 0;

                            return (
                                <button
                                    key={eq.id || `eq_${idx}`}
                                    onClick={() => {
                                        setInspectedEquipment(eq);
                                        setDetailTab('why_red');
                                        setIsFullScreenInspection(false);
                                    }}
                                    className={`relative p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between group active:scale-98 ${
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
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white flex items-center gap-1 animate-pulse">
                                                <span>🚨 ชำรุด</span>
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                🟢 พร้อมใช้
                                            </span>
                                        )}
                                    </div>

                                    <div className="my-2.5 w-full flex-1">
                                        <h4 className={`text-sm font-black break-words leading-snug ${
                                            isBroken ? 'text-rose-950 dark:text-rose-100' : 'text-slate-900 dark:text-white'
                                        }`}>
                                            {eq.equipmentName}
                                        </h4>
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            📍 {eq.location || eq.department || 'Lab'} • 👤 {eq.owner}
                                        </p>
                                    </div>

                                    <div className="w-full pt-2 border-t border-slate-200/50 dark:border-base-800 flex items-center justify-between text-[11px]">
                                        {isBroken ? (
                                            <span className="text-rose-600 font-bold">
                                                หยุดทำงาน {daysDown} วัน
                                            </span>
                                        ) : (
                                            <span className="text-emerald-600 font-medium">
                                                สถานะพร้อมใช้งานปกติ
                                            </span>
                                        )}
                                        <span className="font-bold text-slate-400 group-hover:text-primary-600">
                                            คลิกเจาะลึก ❯
                                        </span>
                                    </div>
                                </button>
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
                            ลองเปลี่ยนคำค้นหาหรือตัวกรองด้านบน
                        </p>
                    </div>
                )}
            </div>

            {/* EXECUTIVE DRILL-DOWN INSPECTION DRAWER / DEDICATED VIEW */}
            {/* ("แค่กดเข้าไปแล้วมันก็จะขยายขึ้นมาให้เห็น หรือกดเข้าไปแล้วไปอีกหน้าหนึ่งเพื่อไปดูว่ามันแดงอะไร มีรายละเอียดว่าทำอะไรไปกับเครื่องนี้แล้วบ้าง") */}
            {currentInspected && (
                <div 
                    className={`fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in ${
                        isFullScreenInspection ? 'p-0' : 'p-3 md:p-6'
                    }`}
                    onClick={() => setInspectedEquipment(null)}
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
                            const isBroken = currentInspected.status === 'issue' || currentInspected.breakdownStatus?.isBroken;
                            const incident = currentInspected.breakdownStatus?.currentIncident;
                            const daysDown = isBroken ? getDaysDown(incident?.reportedDate) : 0;
                            const currentStageObj = STAGES.find(s => s.stage === incident?.stage) || STAGES[0];

                            return (
                                <>
                                    {/* DRAWER TOP BAR: Machine Identity & Quick Actions */}
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
                                                    <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white flex items-center gap-1.5 shadow-sm shadow-rose-500/20 animate-pulse">
                                                        <AlertTriangleIcon className="h-3.5 w-3.5" />
                                                        <span>🚨 สถานะ: ผิดปกติ / ชำรุด (Breakdown)</span>
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1.5">
                                                        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" />
                                                        <span>🟢 สถานะ: พร้อมใช้งานตามปกติ 100%</span>
                                                    </span>
                                                )}

                                                {isBroken && incident?.impactLevel && (
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                                        incident.impactLevel === 'Critical' ? 'bg-rose-700 text-white' :
                                                        incident.impactLevel === 'Moderate' ? 'bg-amber-500 text-white' :
                                                        'bg-slate-600 text-white'
                                                    }`}>
                                                        ระดับผลกระทบ: {incident.impactLevel}
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
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => setIsFullScreenInspection(!isFullScreenInspection)}
                                                className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-base-800 text-slate-500 transition-all text-xs font-bold"
                                                title={isFullScreenInspection ? 'ย่อหน้าต่าง' : 'ขยายเต็มหน้าจอ'}
                                            >
                                                {isFullScreenInspection ? '🗗 ย่อจอ' : '🗖 เต็มจอ'}
                                            </button>
                                            <button
                                                onClick={() => setInspectedEquipment(null)}
                                                className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-base-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all"
                                                title="ปิดหน้าต่าง"
                                            >
                                                <XCircleIcon className="h-6 w-6" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* SECTION TABS FOR DEEP-DIVE (สองหัวข้อตามที่ผู้บริหารต้องการ) */}
                                    {isBroken ? (
                                        <div className="flex border-b border-slate-200 dark:border-base-800 bg-slate-50/70 dark:bg-base-950/40 px-6">
                                            <button
                                                onClick={() => setDetailTab('why_red')}
                                                className={`py-3 px-4 font-black text-xs border-b-2 transition-all flex items-center gap-2 ${
                                                    detailTab === 'why_red'
                                                        ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                                                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                                }`}
                                            >
                                                <AlertTriangleIcon className="h-4 w-4" />
                                                <span>1. มันแดงอะไร? (สาเหตุ & อาการที่ผิดปกติ)</span>
                                            </button>
                                            <button
                                                onClick={() => setDetailTab('actions_done')}
                                                className={`py-3 px-4 font-black text-xs border-b-2 transition-all flex items-center gap-2 ${
                                                    detailTab === 'actions_done'
                                                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                                                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                                }`}
                                            >
                                                <DocumentTextIcon className="h-4 w-4" />
                                                <span>2. ทำอะไรไปกับเครื่องนี้แล้วบ้าง? (ไทม์ไลน์ & ประวัติที่ทำไปแล้ว {(incident?.actionLogs || []).length} รายการ)</span>
                                            </button>
                                        </div>
                                    ) : null}

                                    {/* MODAL / DRAWER BODY */}
                                    <div className="p-5 md:p-6 overflow-y-auto space-y-5 flex-1">
                                        {isBroken && incident ? (
                                            <>
                                                {/* TAB 1: มันแดงอะไร? (สาเหตุ & อาการ) */}
                                                {detailTab === 'why_red' && (
                                                    <div className="space-y-4 animate-fade-in">
                                                        {/* Symptom Card */}
                                                        <div className="bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-4 rounded-2xl space-y-2">
                                                            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-black text-xs">
                                                                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                                                                <span>อาการเสียที่ตรวจพบ (Symptom):</span>
                                                            </div>
                                                            <p className="text-sm font-bold text-slate-900 dark:text-rose-100 pl-6 leading-relaxed">
                                                                {incident.symptom || 'ไม่ระบุอาการเสีย'}
                                                            </p>
                                                        </div>

                                                        {/* Root Cause Card */}
                                                        <div className="bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-800 p-4 rounded-2xl space-y-2">
                                                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-black text-xs">
                                                                <SearchIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                                                <span>สาเหตุความผิดปกติที่วินิจฉัยได้ (Root Cause):</span>
                                                            </div>
                                                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 pl-6 leading-relaxed">
                                                                {incident.rootCause || 'กำลังอยู่ระหว่างการตรวจสอบและวินิจฉัยทางเทคนิคโดยช่างผู้เชี่ยวชาญ'}
                                                            </p>
                                                        </div>

                                                        {/* Meta Details Grid */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                                                    ผู้รายงาน & วันที่แจ้งเสีย
                                                                </span>
                                                                <p className="font-bold text-slate-800 dark:text-white">
                                                                    {incident.reportedBy || currentInspected.owner} • {incident.reportedDate}
                                                                </p>
                                                            </div>

                                                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                                                    ช่าง / ผู้จำหน่ายที่รับผิดชอบซ่อม
                                                                </span>
                                                                <p className="font-bold text-slate-800 dark:text-white">
                                                                    {incident.vendorOrTechnician || 'Bruker Service Engineer'}
                                                                </p>
                                                            </div>

                                                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                                                    กำหนดแล้วเสร็จคาดการณ์ (Target Date)
                                                                </span>
                                                                <p className="font-bold text-indigo-600 dark:text-indigo-400">
                                                                    {incident.targetResolutionDate || 'กำลังจัดทำแผน'}
                                                                </p>
                                                            </div>

                                                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                                                    สถานะปัจจุบันในกระบวนการ 6 ขั้นตอน
                                                                </span>
                                                                <p className="font-black text-rose-600">
                                                                    {currentStageObj.title}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Quick link button to switch to actions tab */}
                                                        <div className="pt-2">
                                                            <button
                                                                onClick={() => setDetailTab('actions_done')}
                                                                className="w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all border border-indigo-200 dark:border-indigo-900"
                                                            >
                                                                <span>ดูรายละเอียดว่าทำอะไรไปกับเครื่องนี้แล้วบ้าง ❯</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* TAB 2: ทำอะไรไปกับเครื่องนี้แล้วบ้าง? (ไทม์ไลน์ & ประวัติ) */}
                                                {detailTab === 'actions_done' && (
                                                    <div className="space-y-5 animate-fade-in">
                                                        {/* 6-STEP VISUAL WORKFLOW PROGRESS BAR */}
                                                        <div className="bg-slate-50 dark:bg-base-950/50 p-4 rounded-2xl border border-slate-200 dark:border-base-800 space-y-3">
                                                            <div className="flex items-center justify-between text-xs">
                                                                <span className="font-black text-slate-800 dark:text-white uppercase tracking-wider">
                                                                    ความคืบหน้ากระบวนการ 6 ขั้นตอน
                                                                </span>
                                                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-lg">
                                                                    ขั้นตอนปัจจุบัน: {currentStageObj.shortTitle}
                                                                </span>
                                                            </div>

                                                            {/* Stepper Buttons */}
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                                                                {STAGES.map((st) => {
                                                                    const isPassed = st.stepNumber < currentStageObj.stepNumber;
                                                                    const isCurrent = st.stepNumber === currentStageObj.stepNumber;

                                                                    return (
                                                                        <div
                                                                            key={st.stage}
                                                                            className={`p-2 rounded-xl text-center border transition-all text-xs flex flex-col justify-between ${
                                                                                isCurrent
                                                                                    ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30'
                                                                                    : isPassed
                                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                                                                    : 'bg-white dark:bg-base-900 text-slate-400 border-slate-200 dark:border-base-800 opacity-60'
                                                                            }`}
                                                                        >
                                                                            <div className="text-[10px] font-bold">
                                                                                {isPassed ? '✓ ' : ''}{st.shortTitle}
                                                                            </div>
                                                                            <div className="text-[9px] mt-1 line-clamp-1 opacity-80">
                                                                                {st.desc}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* PROCUREMENT & ORDER INFO */}
                                                        {(incident.quotationNo || incident.repairPrNo || incident.costEstimate) && (
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-indigo-50/60 dark:bg-indigo-950/30 p-3.5 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/40">
                                                                <div>
                                                                    <span className="text-[10px] font-bold text-slate-400 block">เลขที่ใบเสนอราคา</span>
                                                                    <span className="font-mono font-black text-slate-800 dark:text-white">
                                                                        {incident.quotationNo || '-'}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-[10px] font-bold text-slate-400 block">เลขที่ PR ซ่อม</span>
                                                                    <span className="font-mono font-black text-slate-800 dark:text-white">
                                                                        {incident.repairPrNo || '-'}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-[10px] font-bold text-slate-400 block">ประมาณการค่าใช้จ่าย</span>
                                                                    <span className="font-black text-indigo-600 dark:text-indigo-400">
                                                                        {incident.costEstimate ? `฿${incident.costEstimate.toLocaleString()}` : '-'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* CHRONOLOGICAL ACTION TIMELINE (สิ่งที่ทำไปแล้ว) */}
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                                                    <ClockIcon className="h-4 w-4 text-indigo-600" />
                                                                    <span>บันทึกประวัติสิ่งที่ได้ดำเนินการไปแล้ว (Action Timeline)</span>
                                                                </h4>
                                                                <span className="text-[10px] text-slate-400 font-bold">
                                                                    {(incident.actionLogs || []).length} บันทึก
                                                                </span>
                                                            </div>

                                                            {/* Action Log Entries */}
                                                            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
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
                                                                        ยังไม่มีบันทึกรายละเอียดเพิ่มเติม สามารถเพิ่มบันทึกด้านล่างได้ทันที
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* QUICK ADD ACTION NOTE FORM */}
                                                            <div className="p-3 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 space-y-2">
                                                                <span className="text-[10px] font-black uppercase text-slate-500 block">
                                                                    + เพิ่มบันทึกความคืบหน้าใหม่ (Add Progress Note)
                                                                </span>
                                                                <div className="flex flex-col sm:flex-row gap-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="เช่น ติดต่อ Vendor แล้ว ช่างจะเข้าตรวจอะไหล่วันพุธนี้..."
                                                                        value={newActionNote}
                                                                        onChange={e => setNewActionNote(e.target.value)}
                                                                        className="flex-1 px-3 py-1.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="ผู้ดำเนินการ"
                                                                        value={newActionActor}
                                                                        onChange={e => setNewActionActor(e.target.value)}
                                                                        className="w-28 px-2.5 py-1.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleAddActionLog(currentInspected)}
                                                                        disabled={isSavingLog || !newActionNote.trim()}
                                                                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shrink-0"
                                                                    >
                                                                        {isSavingLog ? 'กำลังบันทึก...' : 'บันทึก'}
                                                                    </button>
                                                                </div>
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
                                                        <span>เครื่องมือนี้อยู่ในสถานะปกติและพร้อมใช้งานตามมาตรฐาน</span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 pl-6 leading-relaxed">
                                                        ไม่พบรายการแจ้งชำรุดหรือข้อผิดพลาดในระบบ แผนการสอบเทียบ (Calibration) และแผนบำรุงรักษา (PM) เป็นไปตามกำหนดการ
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                    <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                        <span className="text-[10px] font-bold text-slate-400 block">แผนบำรุงรักษา (PM)</span>
                                                        <p className="font-bold text-slate-800 dark:text-white">
                                                            รอบถัดไป: {currentInspected.pm?.nextPM || 'ตามแผน'} • ความถี่ {currentInspected.pm?.freqYear || 1} ครั้ง/ปี
                                                        </p>
                                                    </div>
                                                    <div className="p-3.5 bg-slate-50 dark:bg-base-950/30 rounded-xl border border-slate-200 dark:border-base-800 space-y-1">
                                                        <span className="text-[10px] font-bold text-slate-400 block">แผนสอบเทียบ (Calibration)</span>
                                                        <p className="font-bold text-slate-800 dark:text-white">
                                                            รอบถัดไป: {currentInspected.cal?.nextCal || 'ตามแผน'} • ความถี่ {currentInspected.cal?.freqYear || 1} ครั้ง/ปี
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-slate-100 dark:border-base-800">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedEquipmentForReport(currentInspected.id);
                                                            setIsReportModalOpen(true);
                                                        }}
                                                        className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-rose-200 dark:border-rose-900 transition-all"
                                                    >
                                                        <AlertTriangleIcon className="h-4 w-4" />
                                                        <span>🚨 พบปัญหาในเครื่องนี้? บันทึกแจ้งเครื่องเสีย</span>
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
                                                    onClick={() => {
                                                        setActiveIncidentForEdit(incident || null);
                                                        setIsEditIncidentModalOpen(true);
                                                    }}
                                                    className="px-3 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                                                >
                                                    <PencilIcon className="h-3.5 w-3.5 text-slate-400" />
                                                    <span>แก้ไขรายละเอียด</span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isBroken && currentStageObj.stepNumber < 6 && (
                                                <button
                                                    onClick={() => handleAdvanceStage(currentInspected)}
                                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                                                >
                                                    <span>⏩ เลื่อนสู่ขั้นถัดไป</span>
                                                </button>
                                            )}

                                            {isBroken && (
                                                <button
                                                    onClick={() => handleResolveBreakdown(currentInspected)}
                                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-emerald-500/20"
                                                >
                                                    <CheckCircleIcon className="h-4 w-4" />
                                                    <span>✅ ซ่อมเสร็จแล้ว & คืนสภาพพร้อมใช้ (Resolve)</span>
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setInspectedEquipment(null)}
                                                className="px-4 py-2 bg-slate-200 dark:bg-base-800 hover:bg-slate-300 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-all"
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
                            <button onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleReportBreakdown} className="space-y-3.5 text-xs">
                            <div className="space-y-1">
                                <label className="font-bold text-slate-700 dark:text-slate-300">เลือกเครื่องมือหลัก</label>
                                <select
                                    name="equipmentId"
                                    value={selectedEquipmentForReport}
                                    onChange={e => setSelectedEquipmentForReport(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                    required
                                >
                                    {primaryEquipments.map(eq => (
                                        <option key={eq.id} value={eq.id}>
                                            {eq.equipmentNo} - {eq.equipmentName} ({eq.department})
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
                                    className="px-4 py-2 bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md shadow-rose-500/20"
                                >
                                    บันทึกแจ้งเสีย
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT INCIDENT MODAL */}
            {isEditIncidentModalOpen && activeIncidentForEdit && currentInspected && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in"
                    onClick={() => setIsEditIncidentModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <PencilIcon className="h-5 w-5 text-indigo-600" />
                                <span>แก้ไขรายละเอียดข้อมูลการซ่อม</span>
                            </h3>
                            <button onClick={() => setIsEditIncidentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <form 
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const form = new FormData(e.currentTarget);
                                const updatedIncident: BreakdownRecord = {
                                    ...activeIncidentForEdit,
                                    symptom: form.get('symptom') as string,
                                    rootCause: form.get('rootCause') as string,
                                    impactLevel: form.get('impactLevel') as any,
                                    quotationNo: form.get('quotationNo') as string,
                                    repairPrNo: form.get('repairPrNo') as string,
                                    costEstimate: Number(form.get('costEstimate')) || undefined,
                                    vendorOrTechnician: form.get('vendorOrTechnician') as string,
                                    targetResolutionDate: form.get('targetResolutionDate') as string
                                };

                                const updatedEq: Equipment = {
                                    ...currentInspected,
                                    breakdownStatus: {
                                        ...currentInspected.breakdownStatus,
                                        isBroken: true,
                                        currentIncident: updatedIncident
                                    }
                                };

                                await saveEquipment(updatedEq);
                                setInspectedEquipment(updatedEq);
                                setIsEditIncidentModalOpen(false);
                                onEquipmentUpdated();
                            }}
                            className="space-y-3.5 text-xs"
                        >
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
                                        <option value="Critical">Critical</option>
                                        <option value="Moderate">Moderate</option>
                                        <option value="Low">Low</option>
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
                                    className="px-4 py-2 bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
                                >
                                    บันทึกการแก้ไข
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BreakdownTab;
