import React, { useState, useMemo } from 'react';
import type { Equipment, TrackingWorkflowStatus, StageEvidenceRecord } from '../types';
import { saveEquipment } from '../services/dataService';
import { 
    CheckCircleIcon, ClockIcon, SearchIcon, AlertTriangleIcon, 
    PencilIcon, BoxIcon, RefreshIcon, ChevronDownIcon, CalendarIcon 
} from './common/Icons';
import { MONTH_KEYS, MONTH_INFO_MAP, formatMonthName, normalizeMonth } from '../utils/monthUtils';

interface WorkflowTabProps {
    equipments: Equipment[];
    onEquipmentUpdated: () => void;
}

const STAGES = [
    { id: 1, key: 'quotationRequested', title: '1. ขอ Quotation', desc: 'ขอใบเสนอราคาจาก Vendor', color: 'from-blue-500 to-indigo-600' },
    { id: 2, key: 'prIssued', title: '2. ออกใบ PR / PO', desc: 'เปิด PR & อนุมัติงบ PO', color: 'from-amber-500 to-orange-600' },
    { id: 3, key: 'vendorScheduled', title: '3. นัดหมาย Vendor', desc: 'นัดหมายวันเวลาช่างเข้าหน้างาน', color: 'from-purple-500 to-violet-600' },
    { id: 4, key: 'certReceived', title: '4. รับใบ Cert & Report', desc: 'รับ Certificate จาก Vendor', color: 'from-cyan-500 to-blue-600' },
    { id: 5, key: 'certDelivered', title: '5. ส่งมอบให้ผู้ดูแล', desc: 'ส่งใบเซอร์ให้เจ้าของเครื่อง', color: 'from-teal-500 to-emerald-600' },
    { id: 6, key: 'result', title: '6. สรุปผลการประเมิน', desc: 'Pass / Fail / Action Required', color: 'from-emerald-500 to-green-600' }
];

interface WorkflowItem {
    id: string;
    parentId?: string;
    isSub: boolean;
    equipmentNo: string;
    equipmentName: string;
    owner: string;
    location?: string;
    department?: string;
    month: string;
    assignee: string;
    trackingStatus: TrackingWorkflowStatus;
}

export const WorkflowTab: React.FC<WorkflowTabProps> = ({ equipments, onEquipmentUpdated }) => {
    // View modes:
    // 'summary' = Executive Monthly PM Summary & Appointment Schedule (หน้าต่างสรุปแผนประจำเดือน & นัดหมาย)
    // 'fixed_table' = Fixed Left Equipment Matrix with Stage Evidence (ตารางฟิกซ์เครื่องมือไว้ด้านซ้าย)
    // 'kanban' = Standard Kanban Board
    const [viewMode, setViewMode] = useState<'summary' | 'fixed_table' | 'kanban'>('summary');
    
    // Month filter - default to current month or 'all'
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterOwner, setFilterOwner] = useState<string>('all');
    const [filterAssignee, setFilterAssignee] = useState<'all' | 'Vender' | 'Owner'>('all');
    const [filterAppointmentStatus, setFilterAppointmentStatus] = useState<string>('all');
    
    // Active editing item for the modal
    const [editingItem, setEditingItem] = useState<WorkflowItem | null>(null);
    const [activeModalStage, setActiveModalStage] = useState<number>(3); // Default to Stage 3 (Vendor Appointment)
    const [newEvidenceNote, setNewEvidenceNote] = useState<string>('');

    // Flatten all items from equipments + subEquipments
    const allItems: WorkflowItem[] = useMemo(() => {
        const list: WorkflowItem[] = [];

        (equipments || []).forEach(eq => {
            if (!eq) return;
            const pmMonth = normalizeMonth(eq.pm?.lastPM || eq.pm?.nextPM);
            const calMonth = normalizeMonth(eq.cal?.lastCal || eq.cal?.nextCal);
            const displayMonth = pmMonth || calMonth || 'Oct';

            list.push({
                id: eq.id,
                isSub: false,
                equipmentNo: eq.equipmentNo,
                equipmentName: eq.equipmentName,
                owner: eq.owner || 'Unassigned',
                location: eq.location || 'Main Lab',
                department: eq.department || 'Lab',
                month: displayMonth,
                assignee: eq.pm?.pmBy || eq.cal?.calBy || 'Vender',
                trackingStatus: eq.trackingStatus || {
                    quotationRequested: false, prIssued: false, vendorScheduled: false,
                    certReceived: false, certDelivered: false, result: 'Pending'
                }
            });

            (eq.subEquipments || []).forEach(sub => {
                if (!sub) return;
                const subPMMonth = normalizeMonth(sub.pm?.lastPM || sub.pm?.nextPM);
                const subCalMonth = normalizeMonth(sub.cal?.lastCal || sub.cal?.nextCal);
                list.push({
                    id: sub.id,
                    parentId: eq.id,
                    isSub: true,
                    equipmentNo: sub.equipmentNo,
                    equipmentName: sub.equipmentName,
                    owner: sub.owner || eq.owner || 'Unassigned',
                    location: eq.location || 'Main Lab',
                    department: eq.department || 'Lab',
                    month: subPMMonth || subCalMonth || displayMonth,
                    assignee: sub.pm?.pmBy || sub.cal?.calBy || 'Vender',
                    trackingStatus: sub.trackingStatus || {
                        quotationRequested: false, prIssued: false, vendorScheduled: false,
                        certReceived: false, certDelivered: false, result: 'Pending'
                    }
                });
            });
        });

        // Sort naturally by equipment number
        return list.sort((a, b) => a.equipmentNo.localeCompare(b.equipmentNo, undefined, { numeric: true, sensitivity: 'base' }));
    }, [equipments]);

    // Count equipment by month
    const countByMonth = useMemo(() => {
        const map: Record<string, number> = {};
        MONTH_KEYS.forEach(m => { map[m] = 0; });
        allItems.forEach(item => {
            const m = normalizeMonth(item.month);
            if (m && map[m] !== undefined) {
                map[m]++;
            }
        });
        return map;
    }, [allItems]);

    // Filter items
    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            // Month filter
            if (selectedMonth !== 'all') {
                const itemM = normalizeMonth(item.month);
                if (itemM !== selectedMonth) return false;
            }

            // Owner filter
            if (filterOwner !== 'all' && item.owner.toLowerCase() !== filterOwner.toLowerCase()) {
                return false;
            }

            // Assignee filter
            if (filterAssignee !== 'all' && item.assignee.toLowerCase() !== filterAssignee.toLowerCase()) {
                return false;
            }

            // Appointment status filter
            if (filterAppointmentStatus !== 'all') {
                const apptStatus = item.trackingStatus.appointmentStatus || 
                    (item.trackingStatus.scheduledDate ? 'confirmed' : 'pending_contact');
                if (filterAppointmentStatus === 'has_date' && !item.trackingStatus.scheduledDate) return false;
                if (filterAppointmentStatus === 'no_date' && !!item.trackingStatus.scheduledDate) return false;
                if (filterAppointmentStatus === 'waiting_date' && apptStatus !== 'waiting_confirmation') return false;
                if (filterAppointmentStatus === 'postponed' && apptStatus !== 'postponed') return false;
            }

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const match = item.equipmentNo.toLowerCase().includes(q) ||
                    item.equipmentName.toLowerCase().includes(q) ||
                    item.owner.toLowerCase().includes(q) ||
                    (item.location || '').toLowerCase().includes(q) ||
                    (item.trackingStatus.prNo || '').toLowerCase().includes(q) ||
                    (item.trackingStatus.scheduledDate || '').toLowerCase().includes(q) ||
                    (item.trackingStatus.vendorName || '').toLowerCase().includes(q);
                if (!match) return false;
            }

            return true;
        });
    }, [allItems, selectedMonth, filterOwner, filterAssignee, filterAppointmentStatus, searchQuery]);

    // Unique owners
    const ownersList = useMemo(() => {
        const s = new Set<string>();
        allItems.forEach(i => { if (i.owner) s.add(i.owner); });
        return Array.from(s).sort();
    }, [allItems]);

    // Executive Metrics for the currently selected month / view
    const executiveMetrics = useMemo(() => {
        const items = filteredItems;
        const total = items.length;
        
        let hasAppointmentDate = 0;
        let waitingAppointment = 0;
        let postponed = 0;
        let inQuotationOrPR = 0;
        let certReceivedCount = 0;
        let completed = 0;

        items.forEach(it => {
            const st = it.trackingStatus;
            if (st.scheduledDate) {
                hasAppointmentDate++;
            } else if (st.appointmentStatus === 'waiting_confirmation' || (st.prIssued && !st.vendorScheduled)) {
                waitingAppointment++;
            }

            if (st.appointmentStatus === 'postponed') {
                postponed++;
            }

            if (!st.prIssued || (st.quotationRequested && !st.prIssued)) {
                inQuotationOrPR++;
            }

            if (st.certReceived) {
                certReceivedCount++;
            }

            if (st.certDelivered || st.result === 'Pass') {
                completed++;
            }
        });

        // Collect confirmed upcoming appointments
        const upcomingAppointments = items
            .filter(it => !!it.trackingStatus.scheduledDate)
            .sort((a, b) => (a.trackingStatus.scheduledDate || '').localeCompare(b.trackingStatus.scheduledDate || ''));

        // Collect machines awaiting appointment dates
        const awaitingAppointments = items.filter(it => 
            !it.trackingStatus.scheduledDate && 
            (it.trackingStatus.prIssued || it.trackingStatus.appointmentStatus === 'waiting_confirmation')
        );

        return {
            total,
            hasAppointmentDate,
            waitingAppointment,
            postponed,
            inQuotationOrPR,
            certReceivedCount,
            completed,
            upcomingAppointments,
            awaitingAppointments
        };
    }, [filteredItems]);

    // Determine current stage number (1..6)
    const getItemCurrentStage = (st: TrackingWorkflowStatus): number => {
        if (st.result === 'Pass' || st.certDelivered) return 6;
        if (st.certReceived) return 5; // waiting for handover
        if (st.vendorScheduled || st.scheduledDate) return 4; // waiting for cert
        if (st.prIssued) return 3; // waiting for vendor scheduling
        if (st.quotationRequested) return 2; // waiting for PR
        return 1; // waiting for Quotation
    };

    // Save tracking status directly to DB
    const updateItemTrackingStatus = async (item: WorkflowItem, newStatus: TrackingWorkflowStatus) => {
        if (!item.isSub) {
            const target = equipments.find(e => e.id === item.id);
            if (target) {
                await saveEquipment({ ...target, trackingStatus: newStatus });
            }
        } else if (item.parentId) {
            const parent = equipments.find(e => e.id === item.parentId);
            if (parent) {
                const updatedSubs = (parent.subEquipments || []).map(s => 
                    s.id === item.id ? { ...s, trackingStatus: newStatus } : s
                );
                await saveEquipment({ ...parent, subEquipments: updatedSubs });
            }
        }
        onEquipmentUpdated();
    };

    // Quick advance stage
    const handleAdvanceStage = async (item: WorkflowItem) => {
        const st = item.trackingStatus;
        const currentStage = getItemCurrentStage(st);
        const nextStatus: TrackingWorkflowStatus = { ...st };

        if (currentStage === 1) {
            nextStatus.quotationRequested = true;
            nextStatus.quotationStatus = 'received';
        } else if (currentStage === 2) {
            nextStatus.prIssued = true;
            nextStatus.prStatus = 'po_approved';
        } else if (currentStage === 3) {
            nextStatus.vendorScheduled = true;
            nextStatus.appointmentStatus = 'confirmed';
        } else if (currentStage === 4) {
            nextStatus.certReceived = true;
            nextStatus.certStatus = 'received';
        } else if (currentStage === 5) {
            nextStatus.certDelivered = true;
        } else if (currentStage === 6) {
            nextStatus.result = 'Pass';
        }

        await updateItemTrackingStatus(item, nextStatus);
    };

    // Quick revert stage
    const handleRevertStage = async (item: WorkflowItem) => {
        const st = item.trackingStatus;
        const currentStage = getItemCurrentStage(st);
        const nextStatus: TrackingWorkflowStatus = { ...st };

        if (currentStage === 6) { nextStatus.result = 'Pending'; nextStatus.certDelivered = false; }
        else if (currentStage === 5) { nextStatus.certReceived = false; nextStatus.certStatus = 'waiting'; }
        else if (currentStage === 4) { nextStatus.vendorScheduled = false; nextStatus.appointmentStatus = 'pending_contact'; }
        else if (currentStage === 3) { nextStatus.prIssued = false; nextStatus.prStatus = 'pending'; }
        else if (currentStage === 2) { nextStatus.quotationRequested = false; nextStatus.quotationStatus = 'not_requested'; }

        await updateItemTrackingStatus(item, nextStatus);
    };

    // Add evidence log note to active editing item
    const handleAddEvidenceNote = () => {
        if (!editingItem || !newEvidenceNote.trim()) return;

        const currentEvidences = editingItem.trackingStatus.evidences || [];
        const newRecord: StageEvidenceRecord = {
            stageId: activeModalStage,
            title: STAGES.find(s => s.id === activeModalStage)?.title || `Stage ${activeModalStage}`,
            date: new Date().toISOString().split('T')[0],
            details: newEvidenceNote.trim(),
            updatedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
        };

        setEditingItem({
            ...editingItem,
            trackingStatus: {
                ...editingItem.trackingStatus,
                evidences: [newRecord, ...currentEvidences]
            }
        });
        setNewEvidenceNote('');
    };

    return (
        <div className="space-y-5 animate-fade-in w-full">
            {/* EXECUTIVE CONTROL HEADER */}
            <div className="bg-white dark:bg-base-900 p-5 lg:p-6 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary-600 bg-primary-50 dark:bg-primary-950/40 px-2.5 py-1 rounded-full border border-primary-200/50">
                            PM & Calibration Stage Monitor
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-base-800 px-2 py-0.5 rounded-full">
                            แสดง {filteredItems.length} จาก {allItems.length} เครื่อง
                        </span>
                        {selectedMonth !== 'all' && (
                            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                                🗓️ กรองเฉพาะเดือน: {MONTH_INFO_MAP[selectedMonth]?.fullDisplay || selectedMonth}
                            </span>
                        )}
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        กระดานติดตาม 6 ขั้นตอน & บันทึกหลักฐานวันนัดหมาย
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                        ฟิกซ์เครื่องมือไว้ด้านซ้ายเพื่อความชัดเจน ตรวจสอบหลักฐานใบเสนอราคา/PR วันนัดหมายช่างเข้าปฏิบัติงาน และใบรับรองได้ครบถ้วน
                    </p>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-base-800 rounded-2xl border border-slate-200 dark:border-base-700 self-start md:self-auto shrink-0">
                    <button
                        onClick={() => setViewMode('summary')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                            viewMode === 'summary' 
                                ? 'bg-white dark:bg-base-700 text-primary-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                        }`}
                        title="สรุปภาพรวมผู้บริหาร & ตารางวันนัดหมายช่างประจำเดือน"
                    >
                        <span>📊</span>
                        <span>สรุปแผน & นัดหมาย</span>
                    </button>
                    <button
                        onClick={() => setViewMode('fixed_table')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                            viewMode === 'fixed_table' 
                                ? 'bg-white dark:bg-base-700 text-primary-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                        }`}
                        title="ตารางติดตามสเตจแบบฟิกซ์เครื่องมือไว้ด้านซ้าย"
                    >
                        <span>📌</span>
                        <span>ตาราง 6 สเตจ (ฟิกซ์ซ้าย)</span>
                    </button>
                    <button
                        onClick={() => setViewMode('kanban')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                            viewMode === 'kanban' 
                                ? 'bg-white dark:bg-base-700 text-primary-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                        }`}
                        title="กระดานคัมบังแยกตามขั้นตอน 1-6"
                    >
                        <span>📋</span>
                        <span>กระดานคัมบัง</span>
                    </button>
                </div>
            </div>

            {/* MONTH SELECTOR BAR (แถบเลือกดูในแต่ละเดือน เพื่อลดจำนวนข้อมูลที่เยอะ) */}
            <div className="bg-white dark:bg-base-900 p-3 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-2 px-1">
                    <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5 text-primary-500" />
                        เลือกดูตามเดือน (Month Filter):
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                        คลิกเพื่อกรองเฉพาะเครื่องมือที่มีแผนในเดือนนั้นๆ
                    </span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    <button
                        onClick={() => setSelectedMonth('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                            selectedMonth === 'all'
                                ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25 ring-2 ring-primary-500/20'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-base-800 text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        ทั้งหมด ({allItems.length})
                    </button>

                    {MONTH_KEYS.map(m => {
                        const count = countByMonth[m] || 0;
                        const info = MONTH_INFO_MAP[m];
                        const isSelected = selectedMonth === m;
                        return (
                            <button
                                key={m}
                                onClick={() => setSelectedMonth(m)}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
                                    isSelected
                                        ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25 font-black ring-2 ring-primary-500/20'
                                        : count > 0 
                                            ? 'bg-slate-50 hover:bg-slate-100 dark:bg-base-800/80 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-base-700' 
                                            : 'bg-slate-50/50 dark:bg-base-900 text-slate-400 border border-transparent opacity-60'
                                }`}
                            >
                                <span>{info?.thShort || m}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                                    isSelected 
                                        ? 'bg-white/20 text-white' 
                                        : count > 0 
                                            ? 'bg-primary-100 text-primary-800 dark:bg-primary-950/60 dark:text-primary-300' 
                                            : 'bg-slate-200/70 text-slate-500 dark:bg-base-700'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* FILTER & SEARCH TOOLBAR */}
            <div className="bg-white dark:bg-base-900 p-3.5 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <div className="relative min-w-[220px] flex-1 max-w-sm">
                        <SearchIcon className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัสเครื่อง, ชื่อเครื่อง, บริษัทช่าง, เลขที่ PR/PO..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary-500 dark:text-white"
                        />
                    </div>

                    <select
                        value={filterOwner}
                        onChange={e => setFilterOwner(e.target.value)}
                        className="px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                    >
                        <option value="all">👤 พนักงานที่ดูแล (ทั้งหมด)</option>
                        {ownersList.map(o => (
                            <option key={o} value={o}>{o}</option>
                        ))}
                    </select>

                    <select
                        value={filterAppointmentStatus}
                        onChange={e => setFilterAppointmentStatus(e.target.value)}
                        className="px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                    >
                        <option value="all">🗓️ สถานะวันนัดหมาย (ทั้งหมด)</option>
                        <option value="has_date">✅ มีวันนัดหมายแล้ว</option>
                        <option value="no_date">⚠️ ยังไม่มีวันนัดหมาย</option>
                        <option value="waiting_date">⏳ อยู่ในขั้นนัดหมาย (รอคอนเฟิร์ม)</option>
                        <option value="postponed">🔄 ขอเลื่อนนัดหมาย</option>
                    </select>

                    <select
                        value={filterAssignee}
                        onChange={e => setFilterAssignee(e.target.value as any)}
                        className="px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                    >
                        <option value="all">🏢 ผู้ปฏิบัติงาน (ทั้งหมด)</option>
                        <option value="Vender">เฉพาะ Vendor</option>
                        <option value="Owner">เฉพาะ Owner ภายใน</option>
                    </select>
                </div>

                {(searchQuery || filterOwner !== 'all' || filterAppointmentStatus !== 'all' || selectedMonth !== 'all') && (
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            setFilterOwner('all');
                            setFilterAppointmentStatus('all');
                            setSelectedMonth('all');
                        }}
                        className="text-xs font-bold text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0"
                    >
                        ล้างตัวกรองทั้งหมด ✕
                    </button>
                )}
            </div>

            {/* ========================================================================= */}
            {/* VIEW 1: EXECUTIVE MONTHLY PM & APPOINTMENT SUMMARY (หน้าต่างสรุปประจำเดือน) */}
            {/* ========================================================================= */}
            {viewMode === 'summary' && (
                <div className="space-y-5">
                    {/* Month Banner & Executive KPIs */}
                    <div className="bg-gradient-to-br from-slate-900 via-primary-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden">
                        <div className="relative z-10 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary-400 bg-white/10 px-2.5 py-1 rounded-full">
                                        Executive Monthly Overview
                                    </span>
                                    <h3 className="text-xl md:text-2xl font-black mt-1">
                                        สรุปแผน PM ประจำเดือน: {selectedMonth === 'all' ? 'ภาพรวมทุกเดือน (All Months)' : MONTH_INFO_MAP[selectedMonth]?.fullDisplay}
                                    </h3>
                                    <p className="text-xs text-slate-300 font-medium">
                                        ภาพรวมความพร้อมเครื่องมือ วันนัดหมายช่างเข้าหน้างาน และสเต็ปที่ต้องเร่งรัดติดตาม
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-3xl font-black text-white">{executiveMetrics.total}</span>
                                    <span className="text-xs font-bold text-slate-400 ml-1.5">เครื่องตามแผน</span>
                                </div>
                            </div>

                            {/* 5 KPI Metric Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                {/* Card 1: ได้วันนัดหมายแล้ว */}
                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 hover:border-emerald-400/50 transition-all">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-300">ได้วันนัดหมายแล้ว</span>
                                        <span className="p-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs">🗓️</span>
                                    </div>
                                    <div className="text-2xl font-black text-emerald-400 mt-1">
                                        {executiveMetrics.hasAppointmentDate}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        ยืนยันคิวช่างเข้าหน้างาน
                                    </span>
                                </div>

                                {/* Card 2: รอนัดหมาย / ยังไม่ได้วัน */}
                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 hover:border-amber-400/50 transition-all">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-300">รอนัด / ยังไม่ได้วัน</span>
                                        <span className="p-1 bg-amber-500/20 text-amber-400 rounded-lg text-xs">⏳</span>
                                    </div>
                                    <div className="text-2xl font-black text-amber-400 mt-1">
                                        {executiveMetrics.waitingAppointment}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        อยู่ในขั้นนัดแต่ยังไม่ได้วัน
                                    </span>
                                </div>

                                {/* Card 3: ขอเลื่อนนัด */}
                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 hover:border-rose-400/50 transition-all">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-300">ขอเลื่อนนัด</span>
                                        <span className="p-1 bg-rose-500/20 text-rose-400 rounded-lg text-xs">🔄</span>
                                    </div>
                                    <div className="text-2xl font-black text-rose-400 mt-1">
                                        {executiveMetrics.postponed}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        รอประสานงานวันใหม่
                                    </span>
                                </div>

                                {/* Card 4: รับใบ Cert แล้ว */}
                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 hover:border-cyan-400/50 transition-all">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-300">รับใบ Cert แล้ว</span>
                                        <span className="p-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs">📜</span>
                                    </div>
                                    <div className="text-2xl font-black text-cyan-400 mt-1">
                                        {executiveMetrics.certReceivedCount}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        ผ่านการตรวจเช็คหน้างาน
                                    </span>
                                </div>

                                {/* Card 5: เสร็จสมบูรณ์ & ส่งมอบ */}
                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 hover:border-primary-400/50 transition-all">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-300">เสร็จสิ้น & ส่งมอบ</span>
                                        <span className="p-1 bg-primary-500/20 text-primary-400 rounded-lg text-xs">✓</span>
                                    </div>
                                    <div className="text-2xl font-black text-primary-400 mt-1">
                                        {executiveMetrics.completed}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        ส่งมอบเครื่องให้ผู้ดูแลแล้ว
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TWO-COLUMN EXECUTIVE DASHBOARD: SCHEDULE TIMELINE vs ACTION REQUIRED */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Section A: กำหนดการนัดหมายช่างที่ได้วันแล้ว (Confirmed Appointments Calendar) */}
                        <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 p-5 shadow-sm space-y-3.5">
                            <div className="flex items-center justify-between border-b border-base-200 dark:border-base-800 pb-3">
                                <div>
                                    <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                                        Confirmed Appointments
                                    </span>
                                    <h4 className="text-base font-black text-slate-900 dark:text-white mt-1 flex items-center gap-2">
                                        <span>🗓️ กำหนดการช่างเข้าปฏิบัติงาน</span>
                                        <span className="text-xs font-bold text-emerald-600">({executiveMetrics.upcomingAppointments.length} รายการ)</span>
                                    </h4>
                                </div>
                                <span className="text-[11px] font-bold text-slate-400">เรียงตามวันนัดหมาย</span>
                            </div>

                            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
                                {executiveMetrics.upcomingAppointments.length > 0 ? (
                                    executiveMetrics.upcomingAppointments.map((item, idx) => {
                                        const st = item.trackingStatus;
                                        return (
                                            <div 
                                                key={`appt_${item.id}_${idx}`}
                                                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-base-950/50 border border-slate-200/80 dark:border-base-800 hover:border-primary-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                                            >
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono font-black text-xs rounded-md border border-emerald-300/40">
                                                            📅 {st.scheduledDate || 'ระบุวันแล้ว'}
                                                        </span>
                                                        {st.scheduledTime && (
                                                            <span className="text-[10px] font-bold text-slate-500">
                                                                ⏰ {st.scheduledTime}
                                                            </span>
                                                        )}
                                                        <span className="font-mono font-black text-xs text-slate-900 dark:text-white px-1.5 py-0.5 bg-slate-200/70 dark:bg-base-800 rounded">
                                                            {item.equipmentNo}
                                                        </span>
                                                    </div>
                                                    <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                                                        {item.equipmentName}
                                                    </h5>
                                                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                                                        <span>🏢 {st.vendorName || 'บ. Vendor'}</span>
                                                        {st.technicianName && <span>👤 ช่าง: {st.technicianName}</span>}
                                                        {st.vendorContact && <span>📞 {st.vendorContact}</span>}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(3);
                                                    }}
                                                    className="px-3 py-1.5 bg-white dark:bg-base-800 hover:bg-primary-50 dark:hover:bg-primary-950/40 text-primary-600 rounded-xl text-xs font-bold border border-slate-200 dark:border-base-700 shadow-sm transition-all self-end sm:self-center shrink-0"
                                                >
                                                    ดูหลักฐาน / อัปเดต ❯
                                                </button>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-base-800 rounded-2xl text-slate-400 space-y-1">
                                        <p className="text-xs font-bold">ยังไม่มีรายการที่ได้วันนัดหมายในเดือนนี้</p>
                                        <p className="text-[10px]">คลิก "บันทึกหลักฐาน" ในเครื่องมือด้านขวาเพื่อใส่วันนัดหมายช่าง</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Section B: เร่งรัดติดตาม - รายการที่ยังไม่ได้วันนัด หรือขอเลื่อนนัด */}
                        <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 p-5 shadow-sm space-y-3.5">
                            <div className="flex items-center justify-between border-b border-base-200 dark:border-base-800 pb-3">
                                <div>
                                    <span className="text-[10px] font-black uppercase text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                                        Action Required: Awaiting Date
                                    </span>
                                    <h4 className="text-base font-black text-slate-900 dark:text-white mt-1 flex items-center gap-2">
                                        <span>⚠️ รายการที่ต้องเร่งรัดวันนัดหมาย</span>
                                        <span className="text-xs font-bold text-amber-600">({executiveMetrics.awaitingAppointments.length} เครื่อง)</span>
                                    </h4>
                                </div>
                                <span className="text-[11px] font-bold text-slate-400">ยังไม่ได้วันนัด</span>
                            </div>

                            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
                                {executiveMetrics.awaitingAppointments.length > 0 ? (
                                    executiveMetrics.awaitingAppointments.map((item, idx) => {
                                        const st = item.trackingStatus;
                                        return (
                                            <div 
                                                key={`await_${item.id}_${idx}`}
                                                className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 hover:border-amber-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                                            >
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono font-black text-xs text-amber-900 dark:text-amber-200 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/60 rounded">
                                                            {item.equipmentNo}
                                                        </span>
                                                        <span className="text-[10px] font-black text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-full">
                                                            {st.appointmentStatus === 'postponed' ? '🔄 ขอเลื่อนนัด' : '⏳ รอคอนเฟิร์มวันช่าง'}
                                                        </span>
                                                        {st.prNo && (
                                                            <span className="text-[10px] font-bold text-slate-500">
                                                                PR: {st.prNo}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                                                        {item.equipmentName}
                                                    </h5>
                                                    <div className="text-[10px] text-slate-500 font-medium flex items-center gap-2">
                                                        <span>👤 ผู้ดูแล: {item.owner}</span>
                                                        <span>📍 {item.location}</span>
                                                        {st.appointmentNote && (
                                                            <span className="text-amber-700 font-semibold truncate max-w-xs">
                                                                หมายเหตุ: {st.appointmentNote}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(3);
                                                    }}
                                                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md shadow-amber-500/20 transition-all self-end sm:self-center shrink-0"
                                                >
                                                    + ใส่วันนัดหมาย ❯
                                                </button>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-base-800 rounded-2xl text-slate-400 space-y-1">
                                        <p className="text-xs font-bold text-emerald-600">✓ ไม่มีรายการค้างนัดหมาย</p>
                                        <p className="text-[10px]">เครื่องมือที่มีแผนได้รับการประสานงานครบถ้วนแล้ว</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section C: Stage Pipeline Funnel Progress for Selected Month */}
                    <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 p-5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                                    ความคืบหน้ารายขั้นตอนทั้ง 6 สเต็ป (Stage Funnel Progress)
                                </h4>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    จำนวนเครื่องในแต่ละขั้นตอนของเดือน {selectedMonth === 'all' ? 'ทั้งหมด' : MONTH_INFO_MAP[selectedMonth]?.fullDisplay}
                                </p>
                            </div>
                            <button
                                onClick={() => setViewMode('fixed_table')}
                                className="text-xs font-black text-primary-600 hover:underline flex items-center gap-1"
                            >
                                <span>เปิดตารางตรวจสอบละเอียด (ฟิกซ์ซ้าย)</span>
                                <span>❯</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                            {STAGES.map(stage => {
                                const countInStage = filteredItems.filter(it => getItemCurrentStage(it.trackingStatus) === stage.id).length;
                                return (
                                    <div 
                                        key={stage.id}
                                        className="p-3 rounded-2xl bg-slate-50 dark:bg-base-950/60 border border-slate-200/80 dark:border-base-800 space-y-1 text-center"
                                    >
                                        <div className="text-[10px] font-black uppercase text-slate-400">Stage {stage.id}</div>
                                        <div className="text-xs font-black text-slate-800 dark:text-white truncate" title={stage.title}>
                                            {stage.title}
                                        </div>
                                        <div className="text-xl font-black text-primary-600">
                                            {countInStage}
                                        </div>
                                        <div className="text-[9px] text-slate-400 truncate">
                                            {stage.desc}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 2: FIXED LEFT EQUIPMENT MATRIX TABLE (ตารางฟิกซ์เครื่องมือไว้ด้านซ้าย) */}
            {/* ========================================================================= */}
            {(viewMode === 'fixed_table' || viewMode === 'summary') && (
                <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm overflow-hidden">
                    {/* Header bar of the table */}
                    <div className="p-4 border-b border-base-200 dark:border-base-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-base-950/40">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-xs text-primary-600 uppercase tracking-wider">
                                    Fixed-Left Tracking Matrix
                                </span>
                                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-slate-200/70 text-slate-700 dark:bg-base-800 dark:text-slate-300">
                                    {filteredItems.length} เครื่อง
                                </span>
                            </div>
                            <h3 className="font-black text-base text-slate-900 dark:text-white mt-0.5">
                                ตารางตรวจสอบขั้นตอน 1 - 6 (ฟิกซ์ชื่อเครื่องมือไว้ซ้ายสุด + รายละเอียดหลักฐาน)
                            </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">
                            💡 เลื่อนตารางไปทางขวา เครื่องมือด้านซ้ายจะถูกตรึงอยู่กับที่เสมอ คลิกที่สเต็ปเพื่ออัปเดตหลักฐาน
                        </p>
                    </div>

                    <div className="overflow-x-auto relative">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-100/80 dark:bg-base-950 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-base-200 dark:border-base-800">
                                <tr>
                                    {/* STICKY FIXED LEFT COLUMN: Equipment Info */}
                                    <th className="sticky left-0 z-30 bg-slate-100 dark:bg-base-950 px-4 py-3.5 min-w-[280px] max-w-[340px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-slate-200 dark:border-base-800">
                                        <div className="flex items-center justify-between">
                                            <span>เครื่องมือ (รหัส / ชื่อเต็ม / ผู้ดูแล)</span>
                                            <span className="text-[9px] text-primary-600 font-bold">📌 ฟิกซ์ซ้าย</span>
                                        </div>
                                    </th>

                                    {/* STAGE 1: Quotation */}
                                    <th className="px-3.5 py-3.5 min-w-[160px] text-center border-r border-slate-100 dark:border-base-800">
                                        <div className="font-black text-slate-800 dark:text-slate-200">1. ขอ Quotation</div>
                                        <div className="text-[9px] text-slate-400 font-normal">ใบเสนอราคา</div>
                                    </th>

                                    {/* STAGE 2: PR/PO */}
                                    <th className="px-3.5 py-3.5 min-w-[160px] text-center border-r border-slate-100 dark:border-base-800">
                                        <div className="font-black text-slate-800 dark:text-slate-200">2. ออก PR / PO</div>
                                        <div className="text-[9px] text-slate-400 font-normal">เปิด PR & อนุมัติงบ</div>
                                    </th>

                                    {/* STAGE 3: Vendor Scheduled Appointment */}
                                    <th className="px-4 py-3.5 min-w-[210px] text-center border-r border-slate-100 dark:border-base-800 bg-purple-50/40 dark:bg-purple-950/10">
                                        <div className="font-black text-purple-900 dark:text-purple-300 flex items-center justify-center gap-1">
                                            <span>🗓️ 3. นัดหมาย Vendor</span>
                                        </div>
                                        <div className="text-[9px] text-purple-600 dark:text-purple-400 font-bold">วันเวลาช่างเข้าหน้างาน</div>
                                    </th>

                                    {/* STAGE 4: Cert Received */}
                                    <th className="px-3.5 py-3.5 min-w-[170px] text-center border-r border-slate-100 dark:border-base-800">
                                        <div className="font-black text-slate-800 dark:text-slate-200">4. รับใบ Cert & Report</div>
                                        <div className="text-[9px] text-slate-400 font-normal">ผลตรวจจาก Vendor</div>
                                    </th>

                                    {/* STAGE 5: Delivered to Custodian */}
                                    <th className="px-3.5 py-3.5 min-w-[160px] text-center border-r border-slate-100 dark:border-base-800">
                                        <div className="font-black text-slate-800 dark:text-slate-200">5. ส่งมอบให้ผู้ดูแล</div>
                                        <div className="text-[9px] text-slate-400 font-normal">ส่งใบเซอร์ให้เจ้าของ</div>
                                    </th>

                                    {/* STAGE 6: Result & Sticker */}
                                    <th className="px-3.5 py-3.5 min-w-[150px] text-center border-r border-slate-100 dark:border-base-800">
                                        <div className="font-black text-slate-800 dark:text-slate-200">6. สรุปผลการประเมิน</div>
                                        <div className="text-[9px] text-slate-400 font-normal">Pass / Fail / Sticker</div>
                                    </th>

                                    {/* ACTION COLUMN */}
                                    <th className="px-4 py-3.5 text-right min-w-[130px]">
                                        จัดการหลักฐาน
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 dark:divide-base-800 font-medium">
                                {filteredItems.map((item, idx) => {
                                    const st = item.trackingStatus;

                                    return (
                                        <tr 
                                            key={`${item.id || 'wf'}_${idx}`} 
                                            className="hover:bg-slate-50/80 dark:hover:bg-base-800/40 transition-colors group"
                                        >
                                            {/* STICKY FIXED LEFT CELL: Full Name, Code, Custodian */}
                                            <td className="sticky left-0 z-20 bg-white dark:bg-base-900 group-hover:bg-slate-50/90 dark:group-hover:bg-base-800/90 px-4 py-3.5 min-w-[280px] max-w-[340px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-slate-200 dark:border-base-800 transition-colors">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                                                            item.isSub 
                                                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' 
                                                                : 'bg-slate-100 text-slate-900 dark:bg-base-800 dark:text-white'
                                                        }`}>
                                                            {item.equipmentNo}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-primary-600 bg-primary-50 dark:bg-primary-950/40 px-2 py-0.5 rounded-full">
                                                            {formatMonthName(item.month, 'short')}
                                                        </span>
                                                        {item.location && (
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                📍 {item.location}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Full Name wrapping cleanly - No Truncation! */}
                                                    <div className="font-bold text-slate-900 dark:text-white text-xs break-words leading-snug">
                                                        {item.equipmentName}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-medium flex items-center justify-between">
                                                        <span>👤 ผู้ดูแล: <span className="font-bold text-slate-700 dark:text-slate-300">{item.owner}</span></span>
                                                        <span className="text-[9px] text-slate-400">{item.assignee}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* STAGE 1: Quotation Cell */}
                                            <td className="px-3 py-3 text-center border-r border-slate-100 dark:border-base-800">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(1);
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border transition-all hover:shadow-sm"
                                                    style={{
                                                        backgroundColor: st.quotationRequested ? 'rgba(16, 185, 129, 0.08)' : 'rgba(241, 245, 249, 0.6)',
                                                        borderColor: st.quotationRequested ? 'rgba(16, 185, 129, 0.3)' : 'rgba(226, 232, 240, 0.8)'
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className={`text-[10px] font-black ${st.quotationRequested ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                                                            {st.quotationRequested ? '✓ ได้รับใบเสนอราคา' : '⚪ ยังไม่ได้รับ'}
                                                        </span>
                                                        <PencilIcon className="h-3 w-3 text-slate-300 group-hover:text-primary-500" />
                                                    </div>
                                                    {st.quotationNo && (
                                                        <div className="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate mt-0.5">
                                                            No: {st.quotationNo}
                                                        </div>
                                                    )}
                                                    {st.quotationAmount && (
                                                        <div className="text-[9px] font-semibold text-emerald-600 truncate">
                                                            ฿ {st.quotationAmount}
                                                        </div>
                                                    )}
                                                </button>
                                            </td>

                                            {/* STAGE 2: PR/PO Cell */}
                                            <td className="px-3 py-3 text-center border-r border-slate-100 dark:border-base-800">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(2);
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border transition-all hover:shadow-sm"
                                                    style={{
                                                        backgroundColor: st.prIssued ? 'rgba(16, 185, 129, 0.08)' : 'rgba(241, 245, 249, 0.6)',
                                                        borderColor: st.prIssued ? 'rgba(16, 185, 129, 0.3)' : 'rgba(226, 232, 240, 0.8)'
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className={`text-[10px] font-black ${st.prIssued ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                                                            {st.poNo ? '✓ PO อนุมัติแล้ว' : st.prIssued ? '✓ เปิด PR แล้ว' : '⚪ รอออก PR'}
                                                        </span>
                                                        <PencilIcon className="h-3 w-3 text-slate-300 group-hover:text-primary-500" />
                                                    </div>
                                                    {st.prNo && (
                                                        <div className="text-[9px] font-bold text-indigo-700 dark:text-indigo-400 truncate mt-0.5">
                                                            PR: {st.prNo}
                                                        </div>
                                                    )}
                                                    {st.poNo && (
                                                        <div className="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate">
                                                            PO: {st.poNo}
                                                        </div>
                                                    )}
                                                </button>
                                            </td>

                                            {/* STAGE 3: Vendor Appointment Cell (CRITICAL) */}
                                            <td className="px-3 py-3 text-center border-r border-slate-100 dark:border-base-800 bg-purple-50/20 dark:bg-purple-950/5">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(3);
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border transition-all hover:shadow-sm"
                                                    style={{
                                                        backgroundColor: st.scheduledDate 
                                                            ? 'rgba(147, 51, 234, 0.1)' 
                                                            : st.appointmentStatus === 'waiting_confirmation'
                                                                ? 'rgba(245, 158, 11, 0.1)'
                                                                : 'rgba(241, 245, 249, 0.6)',
                                                        borderColor: st.scheduledDate 
                                                            ? 'rgba(147, 51, 234, 0.4)' 
                                                            : st.appointmentStatus === 'waiting_confirmation'
                                                                ? 'rgba(245, 158, 11, 0.4)'
                                                                : 'rgba(226, 232, 240, 0.8)'
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className={`text-[10px] font-black ${
                                                            st.scheduledDate 
                                                                ? 'text-purple-700 dark:text-purple-300' 
                                                                : st.appointmentStatus === 'waiting_confirmation'
                                                                    ? 'text-amber-700 dark:text-amber-400'
                                                                    : 'text-slate-500'
                                                        }`}>
                                                            {st.scheduledDate 
                                                                ? `🗓️ นัด: ${st.scheduledDate}` 
                                                                : st.appointmentStatus === 'waiting_confirmation'
                                                                    ? '⏳ รอคอนเฟิร์มวัน'
                                                                    : st.appointmentStatus === 'postponed'
                                                                        ? '🔄 ขอเลื่อนนัด'
                                                                        : '⚪ รอนัดหมายช่าง'}
                                                        </span>
                                                        <PencilIcon className="h-3 w-3 text-purple-400" />
                                                    </div>
                                                    {st.vendorName && (
                                                        <div className="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate mt-0.5">
                                                            {st.vendorName}
                                                        </div>
                                                    )}
                                                    {st.technicianName && (
                                                        <div className="text-[9px] text-slate-500 truncate">
                                                            ช่าง: {st.technicianName}
                                                        </div>
                                                    )}
                                                </button>
                                            </td>

                                            {/* STAGE 4: Cert Received Cell */}
                                            <td className="px-3 py-3 text-center border-r border-slate-100 dark:border-base-800">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(4);
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border transition-all hover:shadow-sm"
                                                    style={{
                                                        backgroundColor: st.certReceived ? 'rgba(6, 182, 212, 0.08)' : 'rgba(241, 245, 249, 0.6)',
                                                        borderColor: st.certReceived ? 'rgba(6, 182, 212, 0.3)' : 'rgba(226, 232, 240, 0.8)'
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className={`text-[10px] font-black ${st.certReceived ? 'text-cyan-700 dark:text-cyan-400' : 'text-slate-500'}`}>
                                                            {st.certReceived ? '📜 รับใบ Cert แล้ว' : '⚪ รอใบ Cert'}
                                                        </span>
                                                        <PencilIcon className="h-3 w-3 text-slate-300" />
                                                    </div>
                                                    {st.certNo && (
                                                        <div className="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate mt-0.5">
                                                            Cert: {st.certNo}
                                                        </div>
                                                    )}
                                                    {st.certReceivedDate && (
                                                        <div className="text-[9px] text-slate-400">
                                                            {st.certReceivedDate}
                                                        </div>
                                                    )}
                                                </button>
                                            </td>

                                            {/* STAGE 5: Delivered Cell */}
                                            <td className="px-3 py-3 text-center border-r border-slate-100 dark:border-base-800">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(5);
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border transition-all hover:shadow-sm"
                                                    style={{
                                                        backgroundColor: st.certDelivered ? 'rgba(16, 185, 129, 0.08)' : 'rgba(241, 245, 249, 0.6)',
                                                        borderColor: st.certDelivered ? 'rgba(16, 185, 129, 0.3)' : 'rgba(226, 232, 240, 0.8)'
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className={`text-[10px] font-black ${st.certDelivered ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500'}`}>
                                                            {st.certDelivered ? '🤝 ส่งมอบแล้ว' : '⚪ รอมอบ'}
                                                        </span>
                                                        <PencilIcon className="h-3 w-3 text-slate-300" />
                                                    </div>
                                                    {st.recipientName && (
                                                        <div className="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate mt-0.5">
                                                            ผู้รับ: {st.recipientName}
                                                        </div>
                                                    )}
                                                    {st.certDeliveredDate && (
                                                        <div className="text-[9px] text-slate-400">
                                                            {st.certDeliveredDate}
                                                        </div>
                                                    )}
                                                </button>
                                            </td>

                                            {/* STAGE 6: Result Cell */}
                                            <td className="px-3 py-3 text-center border-r border-slate-100 dark:border-base-800">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(6);
                                                    }}
                                                    className={`w-full py-1.5 px-2 rounded-xl text-[10px] font-black transition-all shadow-sm ${
                                                        st.result === 'Pass' ? 'bg-emerald-600 text-white' :
                                                        st.result === 'Fail' ? 'bg-rose-600 text-white' :
                                                        st.result === 'Action Required' ? 'bg-amber-600 text-white' :
                                                        'bg-slate-100 dark:bg-base-800 text-slate-500 hover:bg-slate-200'
                                                    }`}
                                                >
                                                    {st.result || 'Pending'}
                                                    {st.calStickerAffixed && <span className="ml-1 text-[9px]">🏷️</span>}
                                                </button>
                                            </td>

                                            {/* ACTION: Edit Evidence Button */}
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setActiveModalStage(3);
                                                    }}
                                                    className="px-3 py-1.5 bg-slate-100 hover:bg-primary-50 dark:bg-base-800 dark:hover:bg-primary-950/40 text-slate-700 hover:text-primary-600 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-base-700 flex items-center gap-1.5 ml-auto"
                                                    title="เปิดหน้าต่างบันทึกหลักฐาน & วันนัดหมาย"
                                                >
                                                    <PencilIcon className="h-3.5 w-3.5" />
                                                    <span>บันทึกหลักฐาน</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 3: PIPELINE KANBAN VIEW (กระดานคัมบัง) */}
            {/* ========================================================================= */}
            {viewMode === 'kanban' && (
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 overflow-x-auto pb-4">
                    {STAGES.map(stage => {
                        const stageItems = filteredItems.filter(item => getItemCurrentStage(item.trackingStatus) === stage.id);

                        return (
                            <div 
                                key={stage.id} 
                                className="bg-slate-50/70 dark:bg-base-950/50 rounded-3xl border border-slate-200/80 dark:border-base-800 p-3.5 flex flex-col min-w-[250px] shadow-sm"
                            >
                                {/* Column Header */}
                                <div className="border-b border-slate-200/80 dark:border-base-800 pb-3 mb-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            Stage {stage.id}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white dark:bg-base-800 text-slate-700 dark:text-white shadow-sm border border-slate-200/60 dark:border-base-700">
                                            {stageItems.length}
                                        </span>
                                    </div>
                                    <h4 className="font-black text-slate-900 dark:text-white text-xs mt-0.5">
                                        {stage.title}
                                    </h4>
                                    <p className="text-[10px] text-slate-400 font-medium">
                                        {stage.desc}
                                    </p>
                                </div>

                                {/* Items Container */}
                                <div className="space-y-2.5 flex-1 min-h-[300px]">
                                    {stageItems.length > 0 ? (
                                        stageItems.map((item, idx) => {
                                            const st = item.trackingStatus;

                                            return (
                                                <div
                                                    key={`${item.id || 'wf'}_${idx}`}
                                                    className="bg-white dark:bg-base-900 rounded-2xl border border-slate-200/70 dark:border-base-800 p-3 shadow-sm hover:shadow-md transition-all space-y-2 group"
                                                >
                                                    <div className="flex items-start justify-between gap-1.5">
                                                        <div>
                                                            <div className="flex items-center gap-1">
                                                                <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                                                                    item.isSub ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-800 dark:bg-base-800 dark:text-white'
                                                                }`}>
                                                                    {item.equipmentNo}
                                                                </span>
                                                                <span className="text-[9px] font-bold text-primary-600">
                                                                    {formatMonthName(item.month, 'short')}
                                                                </span>
                                                            </div>
                                                            <h5 className="font-bold text-slate-900 dark:text-white text-xs mt-1 break-words">
                                                                {item.equipmentName}
                                                            </h5>
                                                        </div>

                                                        <button
                                                            onClick={() => {
                                                                setEditingItem(item);
                                                                setActiveModalStage(stage.id);
                                                            }}
                                                            className="p-1 text-slate-300 hover:text-primary-600 rounded-md transition-colors"
                                                            title="แก้ไขหลักฐานและข้อมูลขั้นตอน"
                                                        >
                                                            <PencilIcon className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>

                                                    {/* Evidence Badges */}
                                                    {st.scheduledDate ? (
                                                        <div className="text-[10px] font-black text-purple-700 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-md flex items-center justify-between">
                                                            <span>📅 นัด: {st.scheduledDate}</span>
                                                            {st.technicianName && <span className="font-normal text-[9px] truncate max-w-[80px]">{st.technicianName}</span>}
                                                        </div>
                                                    ) : st.appointmentStatus === 'waiting_confirmation' ? (
                                                        <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                                                            ⏳ รอคอนเฟิร์มวันช่าง
                                                        </div>
                                                    ) : null}

                                                    {st.prNo && (
                                                        <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md truncate">
                                                            PR: {st.prNo} {st.poNo ? `| PO: ${st.poNo}` : ''}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1">
                                                        <span>👤 {item.owner}</span>
                                                        <span>📍 {item.location}</span>
                                                    </div>

                                                    {/* Advance or Revert Buttons */}
                                                    <div className="pt-2 border-t border-slate-100 dark:border-base-800 flex items-center justify-between gap-1">
                                                        {stage.id > 1 ? (
                                                            <button
                                                                onClick={() => handleRevertStage(item)}
                                                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 text-slate-600 rounded-lg text-[10px] font-bold transition-all"
                                                                title="ย้อนกลับสเต็ปก่อนหน้า"
                                                            >
                                                                ❮ ย้อน
                                                            </button>
                                                        ) : <div />}

                                                        <button
                                                            onClick={() => {
                                                                setEditingItem(item);
                                                                setActiveModalStage(stage.id);
                                                            }}
                                                            className="text-[10px] text-slate-500 hover:text-primary-600 font-bold"
                                                        >
                                                            ใส่หลักฐาน
                                                        </button>

                                                        {stage.id < 6 ? (
                                                            <button
                                                                onClick={() => handleAdvanceStage(item)}
                                                                className="px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-[10px] font-black transition-all shadow-sm"
                                                                title="เลื่อนไปสเต็ปถัดไป"
                                                            >
                                                                เลื่อนขั้น ❯
                                                            </button>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black">
                                                                ✓ เสร็จสิ้น
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="h-full flex items-center justify-center p-6 text-center text-[11px] text-slate-300 dark:text-base-800 border-2 border-dashed border-slate-200 dark:border-base-800 rounded-2xl">
                                            ไม่มีรายการในสเต็ปนี้
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ========================================================================= */}
            {/* RICH STAGE EVIDENCE & APPOINTMENT MODAL (หน้าต่างบันทึกหลักฐาน & วันนัดหมาย) */}
            {/* ========================================================================= */}
            {editingItem && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in" 
                    onClick={() => setEditingItem(null)}
                >
                    <div 
                        className="relative my-auto bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]" 
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-5 border-b border-base-200 dark:border-base-800 bg-slate-50/70 dark:bg-base-950/60 flex items-center justify-between shrink-0">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-primary-600 uppercase tracking-wider bg-primary-50 dark:bg-primary-950/40 px-2 py-0.5 rounded-md">
                                        บันทึกหลักฐาน & ข้อมูลขั้นตอน PM/Calibration
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400">
                                        รอบเดือน: {formatMonthName(editingItem.month, 'full')}
                                    </span>
                                </div>
                                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-primary-700 dark:text-primary-400 bg-primary-100/50 dark:bg-primary-950/60 px-2 py-0.5 rounded">
                                        {editingItem.equipmentNo}
                                    </span>
                                    <span className="text-sm text-slate-800 dark:text-slate-200 font-bold">
                                        {editingItem.equipmentName}
                                    </span>
                                </h3>
                                <div className="text-xs text-slate-500 font-medium">
                                    👤 ผู้ดูแล: <span className="font-bold text-slate-700 dark:text-slate-300">{editingItem.owner}</span> | 📍 {editingItem.location}
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingItem(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-base-800"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Stage Switcher Tabs */}
                        <div className="flex items-center gap-1 px-5 pt-3 border-b border-base-200 dark:border-base-800 overflow-x-auto shrink-0 bg-white dark:bg-base-900">
                            {STAGES.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveModalStage(s.id)}
                                    className={`px-3 py-2 text-xs font-black rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
                                        activeModalStage === s.id
                                            ? 'text-primary-600 border-primary-600 bg-primary-50/50 dark:bg-primary-950/30'
                                            : 'text-slate-400 border-transparent hover:text-slate-700 hover:border-slate-300'
                                    }`}
                                >
                                    <span>{s.title}</span>
                                    {s.id === 3 && editingItem.trackingStatus.scheduledDate && (
                                        <span className="ml-1 text-[10px] text-emerald-500">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Modal Form Body */}
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                await updateItemTrackingStatus(editingItem, editingItem.trackingStatus);
                                setEditingItem(null);
                            }}
                            className="p-5 overflow-y-auto space-y-4 text-xs flex-1 scrollbar-thin"
                        >
                            {/* ========================================= */}
                            {/* STAGE 1: QUOTATION EVIDENCE */}
                            {/* ========================================= */}
                            {activeModalStage === 1 && (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 rounded-2xl">
                                        <h4 className="font-black text-blue-900 dark:text-blue-300 text-xs">
                                            1. สถานะการขอใบเสนอราคา (Quotation)
                                        </h4>
                                        <p className="text-[11px] text-blue-700/80 dark:text-blue-400 font-medium mt-0.5">
                                            ระบุสถานะว่าขอใบเสนอราคาแล้วหรือยัง ได้รับแล้วหรือยัง พร้อมยอดเงินและเลขที่เอกสาร
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            สถานะใบเสนอราคา:
                                        </label>
                                        <select
                                            value={editingItem.trackingStatus.quotationStatus || (editingItem.trackingStatus.quotationRequested ? 'received' : 'not_requested')}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: {
                                                        ...editingItem.trackingStatus,
                                                        quotationStatus: val,
                                                        quotationRequested: val === 'received' || val === 'requested_waiting'
                                                    }
                                                });
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                        >
                                            <option value="not_requested">⚪ ยังไม่ได้ขอใบเสนอราคา</option>
                                            <option value="requested_waiting">⏳ ขอใบเสนอราคาแล้ว (แต่ยังไม่ได้รับ)</option>
                                            <option value="received">✅ ได้รับใบเสนอราคาแล้ว (ครบถ้วน)</option>
                                            <option value="rejected">❌ ไม่ใช้ / ยกเลิก</option>
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                วันที่ขอใบเสนอราคา:
                                            </label>
                                            <input
                                                type="date"
                                                value={editingItem.trackingStatus.quotationDate || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, quotationDate: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                เลขที่ใบเสนอราคา (Quotation No.):
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น QT-2026-0041"
                                                value={editingItem.trackingStatus.quotationNo || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, quotationNo: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                ยอดเงินตามใบเสนอราคา (บาท):
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น 15,000 หรือ 24,500"
                                                value={editingItem.trackingStatus.quotationAmount || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, quotationAmount: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                แนบไฟล์ / อ้างอิงเอกสาร:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น ไฟล์ PDF / ลิงก์ Drive"
                                                value={editingItem.trackingStatus.quotationProof || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, quotationProof: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            หมายเหตุ / รายละเอียดการขอราคา:
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="เช่น ขอราคาเทียบ 2 เจ้า หรือ รอ Vendor ส่งใบเสนอราคาฉบับแก้ไข"
                                            value={editingItem.trackingStatus.quotationNote || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                trackingStatus: { ...editingItem.trackingStatus, quotationNote: e.target.value }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ========================================= */}
                            {/* STAGE 2: PR / PO EVIDENCE */}
                            {/* ========================================= */}
                            {activeModalStage === 2 && (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl">
                                        <h4 className="font-black text-amber-900 dark:text-amber-300 text-xs">
                                            2. สถานะใบ PR / PO (Purchase Request & PO)
                                        </h4>
                                        <p className="text-[11px] text-amber-700/80 dark:text-amber-400 font-medium mt-0.5">
                                            บันทึกเลขที่เปิด PR ในระบบจัดซื้อ และเลขที่ PO เมื่ออนุมัติงบเรียบร้อยแล้ว
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            สถานะการออก PR / PO:
                                        </label>
                                        <select
                                            value={editingItem.trackingStatus.prStatus || (editingItem.trackingStatus.prIssued ? 'pr_submitted' : 'pending')}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: {
                                                        ...editingItem.trackingStatus,
                                                        prStatus: val,
                                                        prIssued: val === 'pr_submitted' || val === 'po_approved'
                                                    }
                                                });
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                        >
                                            <option value="pending">⚪ รอดำเนินการขอเปิด PR</option>
                                            <option value="pr_submitted">⏳ เปิด PR ในระบบแล้ว (รออนุมัติ PO)</option>
                                            <option value="po_approved">✅ ได้รับ PO แล้ว (อนุมัติงบประมาณสำเร็จ)</option>
                                            <option value="rejected">❌ PR ไม่อนุมัติ / ยกเลิก</option>
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                เลขที่ใบ PR:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น PR-69-1002"
                                                value={editingItem.trackingStatus.prNo || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, prNo: e.target.value, prIssued: !!e.target.value.trim() }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                เลขที่ใบ PO:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น PO-69-0428"
                                                value={editingItem.trackingStatus.poNo || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, poNo: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                วันที่เปิด PR:
                                            </label>
                                            <input
                                                type="date"
                                                value={editingItem.trackingStatus.prDate || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, prDate: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                อ้างอิงเอกสาร / แนบใบ PR:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น เลขที่เอกสารอ้างอิง"
                                                value={editingItem.trackingStatus.prProof || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, prProof: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            หมายเหตุ PR / PO:
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="เช่น ส่งใบ PR ให้ฝ่ายจัดซื้อแล้ว รอเซ็นอนุมัติ"
                                            value={editingItem.trackingStatus.prNote || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                trackingStatus: { ...editingItem.trackingStatus, prNote: e.target.value }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ============================================================== */}
                            {/* STAGE 3: VENDOR APPOINTMENT EVIDENCE (KEY FOCUS FROM USER) */}
                            {/* ============================================================== */}
                            {activeModalStage === 3 && (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 rounded-2xl">
                                        <h4 className="font-black text-purple-900 dark:text-purple-300 text-xs flex items-center gap-1.5">
                                            <span>🗓️ 3. นัดหมาย Vendor & วันที่ช่างเข้าหน้างาน</span>
                                        </h4>
                                        <p className="text-[11px] text-purple-700/80 dark:text-purple-300 font-medium mt-0.5">
                                            ระบุว่านัดได้วันแล้วหรือยัง วันที่เท่าไหร่ ช่างชื่ออะไร หรืออยู่ในขั้นนัดหมายแต่ยังไม่ได้วัน/รอเลื่อน
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            สถานะการนัดหมาย Vendor:
                                        </label>
                                        <select
                                            value={editingItem.trackingStatus.appointmentStatus || (editingItem.trackingStatus.scheduledDate ? 'confirmed' : 'pending_contact')}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: {
                                                        ...editingItem.trackingStatus,
                                                        appointmentStatus: val,
                                                        vendorScheduled: val === 'confirmed' || !!editingItem.trackingStatus.scheduledDate
                                                    }
                                                });
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                        >
                                            <option value="pending_contact">⚪ ยังไม่ได้ติดต่อนัดหมาย</option>
                                            <option value="waiting_confirmation">⏳ อยู่ในขั้นนัดหมาย (ยังไม่ได้วันเลย / รอคอนเฟิร์มวัน)</option>
                                            <option value="confirmed">✅ ยืนยันวันนัดหมายแล้ว (ได้วันแน่นอนแล้ว)</option>
                                            <option value="postponed">🔄 ขอเลื่อนนัดหมาย (รอระบุวันใหม่)</option>
                                            <option value="completed">🛠️ ช่างเข้าตรวจเช็คหน้างานเสร็จแล้ว</option>
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-purple-50/30 dark:bg-purple-950/20 rounded-2xl border border-purple-100 dark:border-purple-900/40">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-purple-900 dark:text-purple-300 tracking-wider block mb-1">
                                                📅 วันที่ช่างนัดเข้ามาปฏิบัติงาน:
                                            </label>
                                            <input
                                                type="date"
                                                value={editingItem.trackingStatus.scheduledDate || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { 
                                                        ...editingItem.trackingStatus, 
                                                        scheduledDate: e.target.value,
                                                        vendorScheduled: !!e.target.value,
                                                        appointmentStatus: e.target.value ? 'confirmed' : editingItem.trackingStatus.appointmentStatus
                                                    }
                                                })}
                                                className="w-full px-3 py-2 bg-white dark:bg-base-900 border border-purple-200 dark:border-purple-800 rounded-xl font-bold text-slate-900 dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-purple-900 dark:text-purple-300 tracking-wider block mb-1">
                                                ⏰ ช่วงเวลานัดหมาย:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น 09:30 - 12:00 น. หรือ ช่วงบ่าย"
                                                value={editingItem.trackingStatus.scheduledTime || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, scheduledTime: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-white dark:bg-base-900 border border-purple-200 dark:border-purple-800 rounded-xl font-bold text-slate-900 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                บริษัท Vendor:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น บ. ยูนิเวอร์แซล คาลิเบรชั่น"
                                                value={editingItem.trackingStatus.vendorName || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, vendorName: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                ชื่อช่างผู้ดำเนินการ:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น ช่างวิชัย, ช่างสมเกียรติ"
                                                value={editingItem.trackingStatus.technicianName || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, technicianName: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                เบอร์ติดต่อช่าง / บริษัท:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น 081-xxx-xxxx"
                                                value={editingItem.trackingStatus.vendorContact || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, vendorContact: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            หมายเหตุการนัดหมาย / สาเหตุการเลื่อนวัน:
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="เช่น ช่างขอเลื่อนเนื่องจากรอชิ้นส่วนอะไหล่ หรือ แล็บเตรียมสารมาตรฐานพร้อมแล้ว"
                                            value={editingItem.trackingStatus.appointmentNote || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                trackingStatus: { ...editingItem.trackingStatus, appointmentNote: e.target.value }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ========================================= */}
                            {/* STAGE 4: CERT RECEIVED EVIDENCE */}
                            {/* ========================================= */}
                            {activeModalStage === 4 && (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-200/60 dark:border-cyan-900/40 rounded-2xl">
                                        <h4 className="font-black text-cyan-900 dark:text-cyan-300 text-xs">
                                            4. ใบ Cert & Service Report จาก Vendor
                                        </h4>
                                        <p className="text-[11px] text-cyan-700/80 dark:text-cyan-400 font-medium mt-0.5">
                                            บันทึกวันที่ได้รับใบรายงานสอบเทียบ/บำรุงรักษา และเลขที่ Certificate No.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                วันที่ได้รับใบ Cert:
                                            </label>
                                            <input
                                                type="date"
                                                value={editingItem.trackingStatus.certReceivedDate || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { 
                                                        ...editingItem.trackingStatus, 
                                                        certReceivedDate: e.target.value,
                                                        certReceived: !!e.target.value 
                                                    }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                เลขที่ใบ Cert (Certificate No.):
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="เช่น CAL-69-9921"
                                                value={editingItem.trackingStatus.certNo || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, certNo: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            ไฟล์แนบ / ลิงก์ใบ Cert:
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="เช่น ชื่อไฟล์ PDF หรือ URL เอกสาร"
                                            value={editingItem.trackingStatus.certProof || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                trackingStatus: { ...editingItem.trackingStatus, certProof: e.target.value }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            บันทึกผลการตรวจสอบใบ Cert:
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="เช่น ค่าความคลาดเคลื่อนอยู่ในเกณฑ์ หรือ มีข้อสังเกตเรื่อง..."
                                            value={editingItem.trackingStatus.certNote || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                trackingStatus: { ...editingItem.trackingStatus, certNote: e.target.value }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ========================================= */}
                            {/* STAGE 5: HANDOVER TO CUSTODIAN */}
                            {/* ========================================= */}
                            {activeModalStage === 5 && (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-900/40 rounded-2xl">
                                        <h4 className="font-black text-teal-900 dark:text-teal-300 text-xs">
                                            5. ส่งมอบใบ Cert ให้พนักงานผู้ดูแลเครื่อง
                                        </h4>
                                        <p className="text-[11px] text-teal-700/80 dark:text-teal-400 font-medium mt-0.5">
                                            ยืนยันการส่งมอบเอกสารและเครื่องมือกลับสู่สถานะพร้อมใช้งานในห้องแล็บ
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                วันที่ส่งมอบ:
                                            </label>
                                            <input
                                                type="date"
                                                value={editingItem.trackingStatus.certDeliveredDate || ''}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { 
                                                        ...editingItem.trackingStatus, 
                                                        certDeliveredDate: e.target.value,
                                                        certDelivered: !!e.target.value 
                                                    }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                ชื่อผู้รับมอบเครื่อง / ใบ Cert:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder={`เช่น ${editingItem.owner}`}
                                                value={editingItem.trackingStatus.recipientName || editingItem.owner}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, recipientName: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            หมายเหตุการส่งมอบ:
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="เช่น ส่งมอบเอกสารตัวจริงเรียบร้อย ทดสอบ Run Blank ผ่าน"
                                            value={editingItem.trackingStatus.deliveryNote || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                trackingStatus: { ...editingItem.trackingStatus, deliveryNote: e.target.value }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ========================================= */}
                            {/* STAGE 6: RESULT & STICKER */}
                            {/* ========================================= */}
                            {activeModalStage === 6 && (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-2xl">
                                        <h4 className="font-black text-emerald-900 dark:text-emerald-300 text-xs">
                                            6. สรุปผลการประเมิน & ติดสติกเกอร์ Cal/PM
                                        </h4>
                                        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 font-medium mt-0.5">
                                            ประเมินผล Pass / Fail พร้อมยืนยันการติดสติกเกอร์บนตัวเครื่อง
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                ผลการประเมิน:
                                            </label>
                                            <select
                                                value={editingItem.trackingStatus.result || 'Pending'}
                                                onChange={e => setEditingItem({
                                                    ...editingItem,
                                                    trackingStatus: { ...editingItem.trackingStatus, result: e.target.value as any }
                                                })}
                                                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-bold dark:text-white"
                                            >
                                                <option value="Pending">⏳ รอผลการประเมิน (Pending)</option>
                                                <option value="Pass">✓ ผ่านเกณฑ์มาตรฐาน (Pass)</option>
                                                <option value="Fail">✗ ไม่ผ่านเกณฑ์ (Fail)</option>
                                                <option value="Action Required">⚠️ ต้องดำเนินการแก้ไข (Action Required)</option>
                                            </select>
                                        </div>

                                        <div className="flex items-center gap-3 pt-6">
                                            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                                                <input
                                                    type="checkbox"
                                                    checked={!!editingItem.trackingStatus.calStickerAffixed}
                                                    onChange={e => setEditingItem({
                                                        ...editingItem,
                                                        trackingStatus: { ...editingItem.trackingStatus, calStickerAffixed: e.target.checked }
                                                    })}
                                                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                                />
                                                <span>🏷️ ติดสติกเกอร์ Cal/PM บนตัวเครื่องแล้ว</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                            บันทึกผลการประเมิน / ค่าวิเคราะห์:
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="เช่น ค่าความเที่ยงตรง ±0.2% อยู่ในเกณฑ์มาตรฐาน พร้อมใช้งานตามปกติ"
                                            value={editingItem.trackingStatus.resultNote || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                trackingStatus: { ...editingItem.trackingStatus, resultNote: e.target.value }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* TIMELINE / EVIDENCE NOTES TRAIL */}
                            <div className="pt-4 border-t border-base-200 dark:border-base-800 space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block">
                                    📝 เพิ่มบันทึกหลักฐาน / ความคืบหน้า (Evidence Log):
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="เช่น โทรประสานงาน Vendor แล้ว นัดยืนยันวันศุกร์นี้"
                                        value={newEvidenceNote}
                                        onChange={e => setNewEvidenceNote(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddEvidenceNote();
                                            }
                                        }}
                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl font-medium dark:text-white text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddEvidenceNote}
                                        disabled={!newEvidenceNote.trim()}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-base-700 dark:hover:bg-base-600 text-white rounded-xl font-bold text-xs disabled:opacity-40 transition-all shrink-0"
                                    >
                                        + เพิ่มบันทึก
                                    </button>
                                </div>

                                {editingItem.trackingStatus.evidences && editingItem.trackingStatus.evidences.length > 0 && (
                                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                        {editingItem.trackingStatus.evidences.map((ev, i) => (
                                            <div key={i} className="p-2.5 bg-slate-50 dark:bg-base-950/50 rounded-xl border border-slate-100 dark:border-base-800 text-[11px] flex items-start justify-between gap-2">
                                                <div>
                                                    <span className="font-bold text-primary-600 mr-2">[{ev.title}]</span>
                                                    <span className="text-slate-700 dark:text-slate-300">{ev.details}</span>
                                                </div>
                                                <span className="text-[10px] text-slate-400 shrink-0">{ev.date} {ev.updatedAt}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer Buttons */}
                            <div className="pt-4 border-t border-base-200 dark:border-base-800 flex items-center justify-between gap-2 sticky bottom-0 bg-white dark:bg-base-900 pb-1">
                                <button
                                    type="button"
                                    onClick={() => setEditingItem(null)}
                                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 text-slate-700 dark:text-white rounded-xl font-bold text-xs transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-black text-xs shadow-md shadow-primary-500/25 transition-all"
                                >
                                    บันทึกข้อมูลหลักฐาน
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkflowTab;
