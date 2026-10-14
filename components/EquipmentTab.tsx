import React, { useState, useMemo } from 'react';
import type { Equipment, EquipmentSubComponent, TrackingWorkflowStatus, Tester } from '../types';
import { saveEquipment, deleteEquipment } from '../services/dataService';
import { 
    PlusIcon, SearchIcon, PencilIcon, TrashIcon, CheckCircleIcon, 
    XCircleIcon, AlertTriangleIcon, ChevronDownIcon, ClockIcon, SparklesIcon 
} from './common/Icons';
import { MONTH_KEYS, MONTH_INFO_MAP, normalizeMonth, formatMonthName, formatFrequency, isToleranceString } from '../utils/monthUtils';

interface EquipmentTabProps {
    testers?: Tester[];
    onEquipmentUpdated: () => void;
}

export const EquipmentTab: React.FC<EquipmentTabProps> = ({ onEquipmentUpdated }) => {
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState<'all' | 'pm' | 'cal'>('all');
    const [filterOwner, setFilterOwner] = useState<string>('all');
    const [filterMonth, setFilterMonth] = useState<string>('all');
    const [filterWorkflow, setFilterWorkflow] = useState<string>('all');
    
    // Accordion state: Set of equipment IDs that are expanded to view sub-components
    const [expandedEquipIds, setExpandedEquipIds] = useState<Set<string>>(new Set(['eq-pdf-1-001', 'eq-pds-1001', 'eq-pds-1004']));
    
    // Modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingEquip, setEditingEquip] = useState<Partial<Equipment> | null>(null);

    // Sub-equipment modal state
    const [isSubModalOpen, setIsSubModalOpen] = useState(false);
    const [editingSub, setEditingSub] = useState<{
        parentEqId: string;
        sub: Partial<EquipmentSubComponent>;
        isNew: boolean;
    } | null>(null);

    // Delete confirmation state (avoiding window.confirm)
    const [deleteConfirm, setDeleteConfirm] = useState<{
        type: 'primary' | 'sub';
        id: string;
        parentId?: string;
        name: string;
    } | null>(null);

    // Tracking workflow modal state
    const [activeTrackingTarget, setActiveTrackingTarget] = useState<{
        equipmentId: string;
        subId?: string;
        equipmentNo: string;
        equipmentName: string;
        trackingStatus: TrackingWorkflowStatus;
    } | null>(null);

    // Initial load
    React.useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const { getEquipments } = await import('../services/dataService');
        const data = await getEquipments();
        setEquipments(data || []);
    };

    const toggleExpand = (id: string) => {
        setExpandedEquipIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Filtered equipments (PRIMARY ONLY: no '/' in equipmentNo) sorted naturally (PDF 1-001 ... PDS-1004)
    const filteredEquipments = useMemo(() => {
        const list = (equipments || []).filter(eq => {
            if (!eq) return false;
            const eqNo = String(eq.equipmentNo || eq.code || eq.name || '');
            if (!eqNo) return false;

            // Must be primary machine (no '/' in equipmentNo)
            const isPrimary = !eqNo.includes('/');
            if (!isPrimary) return false;

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchPrimary = (
                    eqNo.toLowerCase().includes(q) ||
                    String(eq.equipmentName || eq.name || '').toLowerCase().includes(q) ||
                    String(eq.owner || '').toLowerCase().includes(q) ||
                    String(eq.pm?.items || '').toLowerCase().includes(q) ||
                    String(eq.cal?.items || '').toLowerCase().includes(q)
                );
                const matchSub = (eq.subEquipments || []).some(sub => 
                    sub && (
                        String(sub.equipmentNo || '').toLowerCase().includes(q) ||
                        String(sub.equipmentName || '').toLowerCase().includes(q) ||
                        String(sub.owner || '').toLowerCase().includes(q)
                    )
                );
                if (!matchPrimary && !matchSub) return false;
            }

            // Category filter
            if (filterCategory === 'pm') {
                const hasPM = eq.pm && eq.pm.lastPM && eq.pm.lastPM !== '-';
                if (!hasPM) return false;
            } else if (filterCategory === 'cal') {
                const hasCal = eq.cal && eq.cal.lastCal && eq.cal.lastCal !== '-';
                if (!hasCal) return false;
            }

            // Owner filter
            if (filterOwner !== 'all') {
                if (String(eq.owner || '').toLowerCase() !== filterOwner.toLowerCase()) return false;
            }

            // Month filter
            if (filterMonth !== 'all') {
                const pmM = normalizeMonth(eq.pm?.lastPM || eq.pm?.nextPM);
                const calM = normalizeMonth(eq.cal?.lastCal || eq.cal?.nextCal);
                if (pmM !== filterMonth && calM !== filterMonth) return false;
            }

            // Workflow filter
            if (filterWorkflow !== 'all') {
                const st = eq.trackingStatus || {
                    quotationRequested: false, prIssued: false, vendorScheduled: false,
                    certReceived: false, certDelivered: false, result: 'Pending'
                };
                if (filterWorkflow === 'done' && st.result !== 'Pass') return false;
                if (filterWorkflow === 'pending_pr' && st.prIssued) return false;
                if (filterWorkflow === 'pending_sched' && (!st.prIssued || st.vendorScheduled)) return false;
                if (filterWorkflow === 'pending_cert' && (!st.vendorScheduled || st.certReceived)) return false;
            }

            return true;
        });

        // Natural sort from PDF 1-001 ... PDF 1-005, PDS-1001 ... PDS-1004
        return list.sort((a, b) => {
            const noA = String(a.equipmentNo || '').trim();
            const noB = String(b.equipmentNo || '').trim();
            return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [equipments, searchQuery, filterCategory, filterOwner, filterMonth, filterWorkflow]);

    // Unique owners for filter dropdown
    const availableOwners = useMemo(() => {
        const set = new Set<string>();
        (equipments || []).forEach(eq => {
            if (eq?.owner) set.add(eq.owner);
            (eq?.subEquipments || []).forEach(s => { if (s?.owner) set.add(s.owner); });
        });
        return Array.from(set).sort();
    }, [equipments]);

    // Handle Quick Step Update
    const handleSaveTrackingStatus = async (status: TrackingWorkflowStatus) => {
        if (!activeTrackingTarget) return;
        const { equipmentId, subId } = activeTrackingTarget;

        const updatedEquipments = equipments.map(eq => {
            if (eq.id === equipmentId) {
                if (!subId) {
                    return { ...eq, trackingStatus: status };
                } else {
                    const updatedSubs = (eq.subEquipments || []).map(sub => 
                        sub.id === subId ? { ...sub, trackingStatus: status } : sub
                    );
                    return { ...eq, subEquipments: updatedSubs };
                }
            }
            return eq;
        });

        setEquipments(updatedEquipments);
        const targetEq = updatedEquipments.find(e => e.id === equipmentId);
        if (targetEq) {
            await saveEquipment(targetEq);
        }
        setActiveTrackingTarget(null);
        onEquipmentUpdated();
    };

    // Execute delete confirmation
    const handleConfirmDelete = async () => {
        if (!deleteConfirm) return;
        if (deleteConfirm.type === 'primary') {
            await deleteEquipment(deleteConfirm.id);
        } else if (deleteConfirm.parentId) {
            const parent = equipments.find(e => e.id === deleteConfirm.parentId);
            if (parent) {
                const updated = {
                    ...parent,
                    subEquipments: (parent.subEquipments || []).filter(s => s.id !== deleteConfirm.id)
                };
                await saveEquipment(updated);
            }
        }
        setDeleteConfirm(null);
        await loadData();
        onEquipmentUpdated();
    };

    // Save Primary Equipment
    const handleSaveEquipment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEquip?.equipmentNo || !editingEquip?.equipmentName) return;

        const cleanNo = editingEquip.equipmentNo.trim();
        const newRecord: Equipment = {
            id: editingEquip.id || `eq_${Date.now()}`,
            equipmentNo: cleanNo,
            equipmentName: editingEquip.equipmentName.trim(),
            name: editingEquip.equipmentName.trim(),
            code: cleanNo,
            owner: editingEquip.owner || 'PORNTHAK',
            department: editingEquip.department || 'PCRD Lab',
            location: editingEquip.location || '',
            status: 'ready',
            pm: {
                freqYear: editingEquip.pm?.freqYear || 1,
                lastPM: normalizeMonth(editingEquip.pm?.lastPM) || 'Nov',
                nextPM: normalizeMonth(editingEquip.pm?.nextPM) || 'Nov',
                pmBy: editingEquip.pm?.pmBy || 'Vender',
                items: editingEquip.pm?.items || 'ตามรายการ Vender',
                tolerance: editingEquip.pm?.tolerance || 'Pass/Fail'
            },
            cal: {
                freqYear: editingEquip.cal?.freqYear || 1,
                lastCal: normalizeMonth(editingEquip.cal?.lastCal) || 'Nov',
                nextCal: normalizeMonth(editingEquip.cal?.nextCal) || 'Nov',
                calBy: editingEquip.cal?.calBy || 'Vender',
                items: editingEquip.cal?.items || 'ตามรายการ Vender',
                tolerance: editingEquip.cal?.tolerance || 'Pass/Fail'
            },
            trackingStatus: editingEquip.trackingStatus || {
                quotationRequested: false,
                prIssued: false,
                vendorScheduled: false,
                certReceived: false,
                certDelivered: false,
                result: 'Pending'
            },
            subEquipments: editingEquip.subEquipments || []
        };

        await saveEquipment(newRecord);
        await loadData();
        setIsEditModalOpen(false);
        setEditingEquip(null);
        onEquipmentUpdated();
    };

    // Save Sub-Equipment
    const handleSaveSubEquipment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSub || !editingSub.sub.equipmentNo || !editingSub.sub.equipmentName) return;

        const parentEq = equipments.find(e => e.id === editingSub.parentEqId);
        if (!parentEq) return;

        const subData: EquipmentSubComponent = {
            id: editingSub.sub.id || `sub_${Date.now()}`,
            equipmentNo: editingSub.sub.equipmentNo.trim(),
            equipmentName: editingSub.sub.equipmentName.trim(),
            owner: editingSub.sub.owner || parentEq.owner,
            pm: {
                freqYear: editingSub.sub.pm?.freqYear || 1,
                lastPM: normalizeMonth(editingSub.sub.pm?.lastPM) || parentEq.pm?.lastPM || 'Jan',
                nextPM: normalizeMonth(editingSub.sub.pm?.nextPM) || parentEq.pm?.nextPM || 'Jan',
                pmBy: editingSub.sub.pm?.pmBy || 'Vender',
                items: editingSub.sub.pm?.items || '',
                tolerance: editingSub.sub.pm?.tolerance || ''
            },
            cal: {
                freqYear: editingSub.sub.cal?.freqYear || 1,
                lastCal: normalizeMonth(editingSub.sub.cal?.lastCal) || parentEq.cal?.lastCal || 'Jan',
                nextCal: normalizeMonth(editingSub.sub.cal?.nextCal) || parentEq.cal?.nextCal || 'Jan',
                calBy: editingSub.sub.cal?.calBy || 'Vender',
                items: editingSub.sub.cal?.items || '',
                tolerance: editingSub.sub.cal?.tolerance || ''
            },
            trackingStatus: editingSub.sub.trackingStatus || {
                quotationRequested: false, prIssued: false, vendorScheduled: false,
                certReceived: false, certDelivered: false, result: 'Pending'
            }
        };

        let updatedSubs: EquipmentSubComponent[];
        if (editingSub.isNew) {
            updatedSubs = [...(parentEq.subEquipments || []), subData];
        } else {
            updatedSubs = (parentEq.subEquipments || []).map(s => s.id === subData.id ? subData : s);
        }

        await saveEquipment({ ...parentEq, subEquipments: updatedSubs });
        await loadData();
        setIsSubModalOpen(false);
        setEditingSub(null);
        setExpandedEquipIds(prev => new Set([...prev, parentEq.id]));
        onEquipmentUpdated();
    };

    // Helper for step progress count
    const getStepProgress = (st: TrackingWorkflowStatus) => {
        let count = 0;
        if (st.quotationRequested) count++;
        if (st.prIssued) count++;
        if (st.vendorScheduled) count++;
        if (st.certReceived) count++;
        if (st.certDelivered) count++;
        if (st.result === 'Pass') count++;
        return { completed: count, percent: Math.round((count / 6) * 100) };
    };

    return (
        <div className="space-y-6 animate-fade-in w-full">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-base-900 p-6 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary-600 bg-primary-50 dark:bg-primary-950/40 px-2.5 py-1 rounded-full">
                            PM & Calibration Master System
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                            {filteredEquipments.length} เครื่องหลักในระบบ
                        </span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        รายชื่อเครื่องมือ แผน PM & Calibration (Master List)
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                        ฐานข้อมูลทะเบียนเครื่องมือหลักและเครื่องพ่วงย่อย พร้อมปุ่มแก้ไขข้อมูล รายละเอียดเกณฑ์ยอมรับ และอัปเดตสเต็ป 1-6
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={() => {
                            setEditingEquip({
                                equipmentNo: '',
                                equipmentName: '',
                                owner: 'PORNTHAK',
                                pm: { freqYear: 1, lastPM: 'Nov', nextPM: 'Nov', pmBy: 'Vender', items: 'ตามรายการ Vender', tolerance: 'Pass/Fail' },
                                cal: { freqYear: 1, lastCal: 'Nov', nextCal: 'Nov', calBy: 'Vender', items: 'ตามรายการ Vender', tolerance: 'Pass/Fail' },
                                trackingStatus: { quotationRequested: false, prIssued: false, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' },
                                subEquipments: []
                            });
                            setIsEditModalOpen(true);
                        }}
                        className="px-5 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-primary-500/20 transition-all active:scale-95"
                    >
                        <PlusIcon className="h-4 w-4" />
                        <span>เพิ่มเครื่องมือหลักใหม่</span>
                    </button>
                </div>
            </div>

            {/* SYSTEM GUIDE BANNER (EXPLAINS WHAT EACH TAB DOES) */}
            <div className="bg-slate-50 dark:bg-base-950/40 p-4 rounded-2xl border border-slate-200/80 dark:border-base-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                    <span className="text-lg">💡</span>
                    <div className="space-y-0.5">
                        <span className="font-black text-slate-800 dark:text-white">
                            คำแนะนำการใช้งานระบบและการแก้ไขข้อมูล:
                        </span>
                        <p className="text-slate-500 text-[11px]">
                            • <strong>หน้ารายชื่อเครื่องมือ (หน้านี้):</strong> สำหรับแก้ไขข้อมูลเครื่องมือ (กดไอคอนดินสอ ✏️), เพิ่มเครื่องพ่วงย่อย (กด + Sub), และดูภาพรวม<br />
                            • <strong>หน้าแผนประจำปี (Annual Plan):</strong> สำหรับดูปฏิทิน 12 เดือนและระบบเตือนเตรียมตัวล่วงหน้า 1-2 เดือน (ขอ Quotation, ออก PR)<br />
                            • <strong>หน้ากระดานติดตาม (Workflow):</strong> สำหรับติดตามและเลื่อนขั้นตอน 6 สเต็ปของแต่ละเครื่องแบบคัมบัง
                        </p>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Search */}
                    <div className="md:col-span-4 relative">
                        <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัสเครื่อง, ชื่อเครื่อง, ผู้รับผิดชอบ..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary-500 dark:text-white"
                        />
                    </div>

                    {/* Category */}
                    <div className="md:col-span-2">
                        <select
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value as any)}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                        >
                            <option value="all">หมวดหมู่ทั้งหมด</option>
                            <option value="pm">เฉพาะที่มี PM</option>
                            <option value="cal">เฉพาะที่มี Calibration</option>
                        </select>
                    </div>

                    {/* Owner */}
                    <div className="md:col-span-2">
                        <select
                            value={filterOwner}
                            onChange={e => setFilterOwner(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                        >
                            <option value="all">พนักงานที่ดูแล (ทั้งหมด)</option>
                            {availableOwners.map(owner => (
                                <option key={owner} value={owner}>{owner}</option>
                            ))}
                        </select>
                    </div>

                    {/* Month */}
                    <div className="md:col-span-2">
                        <select
                            value={filterMonth}
                            onChange={e => setFilterMonth(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                        >
                            <option value="all">เดือนที่กำหนด (ทั้งหมด)</option>
                            {MONTH_KEYS.map(m => (
                                <option key={m} value={m}>{formatMonthName(m, 'badge')}</option>
                            ))}
                        </select>
                    </div>

                    {/* Workflow status */}
                    <div className="md:col-span-2">
                        <select
                            value={filterWorkflow}
                            onChange={e => setFilterWorkflow(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                        >
                            <option value="all">สถานะขั้นตอน (ทั้งหมด)</option>
                            <option value="pending_pr">รอออก PR</option>
                            <option value="pending_sched">รอนัดหมาย Vendor</option>
                            <option value="pending_cert">รอรับใบเซอร์</option>
                            <option value="done">ผลการ Cal ผ่านแล้ว</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* MASTER EQUIPMENT LIST TABLE */}
            <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 dark:bg-base-950/80 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-base-200 dark:border-base-800">
                            <tr>
                                <th className="px-3 py-3.5 w-10 text-center">พ่วง</th>
                                <th className="px-4 py-3.5">Equipment No.</th>
                                <th className="px-4 py-3.5">ชื่อเครื่องมือ</th>
                                <th className="px-4 py-3.5">ผู้รับผิดชอบ</th>
                                <th className="px-4 py-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 border-l border-r border-indigo-100 dark:border-indigo-900/60 min-w-[210px]">
                                    <div className="flex items-center gap-1.5 font-black text-indigo-700 dark:text-indigo-300">
                                        <span className="p-0.5 bg-indigo-100 dark:bg-indigo-900/80 rounded text-xs">🛠️</span>
                                        <span>แผน PM (บำรุงรักษา)</span>
                                    </div>
                                    <div className="text-[9px] font-bold text-indigo-500/90 dark:text-indigo-400 mt-0.5 normal-case">
                                        ความถี่ • เดือนที่ทำ • ผู้ดำเนินการ • รายการ
                                    </div>
                                </th>
                                <th className="px-4 py-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 border-r border-emerald-100 dark:border-emerald-900/60 min-w-[240px]">
                                    <div className="flex items-center gap-1.5 font-black text-emerald-700 dark:text-emerald-300">
                                        <span className="p-0.5 bg-emerald-100 dark:bg-emerald-900/80 rounded text-xs">🎯</span>
                                        <span>แผน Calibration (สอบเทียบ)</span>
                                    </div>
                                    <div className="text-[9px] font-bold text-emerald-500/90 dark:text-emerald-400 mt-0.5 normal-case">
                                        ความถี่ • เดือนที่ทำ • ผู้ดำเนินการ • เกณฑ์ยอมรับ
                                    </div>
                                </th>
                                <th className="px-4 py-3.5">สถานะดำเนินงาน (6 สเต็ป)</th>
                                <th className="px-4 py-3.5 text-right">จัดการ</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 dark:divide-base-800 font-medium">
                            {filteredEquipments.map((eq, idx) => {
                                const subCount = eq.subEquipments?.length || 0;
                                const isExpanded = expandedEquipIds.has(eq.id);
                                const progress = getStepProgress(eq.trackingStatus || {});

                                return (
                                    <React.Fragment key={`${eq.id || 'eq'}_${idx}`}>
                                        <tr className="hover:bg-slate-50/70 dark:hover:bg-base-800/40 transition-colors">
                                            {/* Expand/Collapse Toggle */}
                                            <td className="px-3 py-3 text-center">
                                                {subCount > 0 ? (
                                                    <button
                                                        onClick={() => toggleExpand(eq.id)}
                                                        className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-base-800 transition-colors"
                                                        title={isExpanded ? 'ย่อเครื่องพ่วงย่อย' : 'ขยายดูเครื่องพ่วงย่อย'}
                                                    >
                                                        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-base-700 text-xs">-</span>
                                                )}
                                            </td>

                                            {/* Equipment No */}
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-black text-slate-900 dark:text-white text-xs px-2.5 py-1 bg-slate-100 dark:bg-base-800 rounded-lg border border-slate-200 dark:border-base-700">
                                                        {eq.equipmentNo}
                                                    </span>
                                                    {subCount > 0 && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-md">
                                                            +{subCount} เครื่องพ่วง
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Equipment Name */}
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                                                            {eq.equipmentName}
                                                        </span>
                                                        {(eq.status === 'issue' || eq.breakdownStatus?.isBroken) && (
                                                            <span className="text-[9px] font-black px-1.5 py-0.2 bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 rounded-md">
                                                                🚨 เครื่องเสีย
                                                            </span>
                                                        )}
                                                    </div>
                                                    {eq.location && (
                                                        <span className="text-[10px] text-slate-400 font-semibold">{eq.location}</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Custodian/Owner */}
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200/50">
                                                    👤 {eq.owner}
                                                </span>
                                            </td>

                                            {/* PM Details */}
                                            <td className="px-4 py-3 bg-indigo-50/15 dark:bg-indigo-950/10 border-l border-r border-indigo-100/40 dark:border-indigo-900/20">
                                                {eq.pm && eq.pm.lastPM && eq.pm.lastPM !== '-' ? (
                                                    <div className="space-y-1.5 text-xs">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-[10px] px-2 py-0.5 bg-indigo-100/90 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 rounded-md border border-indigo-200/50">
                                                                🔄 {formatFrequency(eq.pm.freqYear)}
                                                            </span>
                                                            <span className="font-black text-indigo-600 dark:text-indigo-400">
                                                                📅 {formatMonthName(eq.pm.lastPM, 'badge')}
                                                            </span>
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-base-800 rounded text-slate-600 dark:text-slate-300">
                                                                {eq.pm.pmBy || 'Vender'}
                                                            </span>
                                                        </div>
                                                        {eq.pm.items && (
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 max-w-xs" title={eq.pm.items}>
                                                                🛠️ {eq.pm.items}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-xs italic">-</span>
                                                )}
                                            </td>

                                            {/* Cal Details */}
                                            <td className="px-4 py-3 bg-emerald-50/15 dark:bg-emerald-950/10 border-r border-emerald-100/40 dark:border-emerald-900/20">
                                                {eq.cal && eq.cal.lastCal && eq.cal.lastCal !== '-' ? (
                                                    <div className="space-y-1.5 text-xs">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-[10px] px-2 py-0.5 bg-emerald-100/90 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 rounded-md border border-emerald-200/50">
                                                                🔄 {formatFrequency(eq.cal.freqYear)}
                                                            </span>
                                                            <span className="font-black text-emerald-600 dark:text-emerald-400">
                                                                🎯 {formatMonthName(eq.cal.lastCal, 'badge')}
                                                            </span>
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-base-800 rounded text-slate-600 dark:text-slate-300">
                                                                {eq.cal.calBy || 'Vender'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-md border border-amber-200/60" title="เกณฑ์การยอมรับ (Tolerance)">
                                                                ⚖️ เกณฑ์: {eq.cal.tolerance || eq.pm?.tolerance || 'Pass/Fail'}
                                                            </span>
                                                        </div>
                                                        {eq.cal.items && eq.cal.items !== eq.pm?.items && (
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-xs" title={eq.cal.items}>
                                                                🔬 {eq.cal.items}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : subCount > 0 && (eq.subEquipments || []).some(s => s.cal && s.cal.lastCal && s.cal.lastCal !== '-') ? (
                                                    <div className="space-y-1 text-xs">
                                                        <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-md border border-amber-200/60">
                                                            📦 มีสอบเทียบใน {subCount} เครื่องพ่วงย่อย (Weight / Piston)
                                                        </span>
                                                        <button
                                                            onClick={() => toggleExpand(eq.id)}
                                                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                                        >
                                                            {isExpanded ? '▲ ซ่อนรายการย่อย' : '▼ คลิกดูรายละเอียดสอบเทียบชิ้นย่อย'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-xs italic">-</span>
                                                )}
                                            </td>

                                            {/* Workflow Stepper */}
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => setActiveTrackingTarget({
                                                        equipmentId: eq.id,
                                                        equipmentNo: eq.equipmentNo,
                                                        equipmentName: eq.equipmentName,
                                                        trackingStatus: eq.trackingStatus || {
                                                            quotationRequested: false, prIssued: false, vendorScheduled: false,
                                                            certReceived: false, certDelivered: false, result: 'Pending'
                                                        }
                                                    })}
                                                    className="w-full text-left p-2 rounded-xl bg-slate-50 dark:bg-base-950/40 hover:bg-primary-50 dark:hover:bg-primary-950/30 border border-slate-200 dark:border-base-800 transition-all group/btn"
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-bold text-slate-500 group-hover/btn:text-primary-600">
                                                            {progress.completed}/6 สเต็ป ({progress.percent}%)
                                                        </span>
                                                        {eq.trackingStatus?.result === 'Pass' ? (
                                                            <span className="text-[9px] font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">PASS</span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold text-slate-400">คลิกอัปเดต ❯</span>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-6 gap-1">
                                                        <div className={`h-1.5 rounded-full ${eq.trackingStatus?.quotationRequested ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} title="1. Quotation" />
                                                        <div className={`h-1.5 rounded-full ${eq.trackingStatus?.prIssued ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} title="2. PR" />
                                                        <div className={`h-1.5 rounded-full ${eq.trackingStatus?.vendorScheduled ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} title="3. Scheduled" />
                                                        <div className={`h-1.5 rounded-full ${eq.trackingStatus?.certReceived ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} title="4. Cert Recv" />
                                                        <div className={`h-1.5 rounded-full ${eq.trackingStatus?.certDelivered ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} title="5. Cert Handover" />
                                                        <div className={`h-1.5 rounded-full ${eq.trackingStatus?.result === 'Pass' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-base-800'}`} title="6. Result" />
                                                    </div>
                                                </button>
                                            </td>

                                            {/* Action buttons */}
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => {
                                                            const nextSubNum = (eq.subEquipments?.length || 0) + 1;
                                                            const formatted = nextSubNum < 10 ? `0${nextSubNum}` : `${nextSubNum}`;
                                                            setEditingSub({
                                                                parentEqId: eq.id,
                                                                isNew: true,
                                                                sub: {
                                                                    equipmentNo: `${eq.equipmentNo}/${formatted}`,
                                                                    equipmentName: '',
                                                                    owner: eq.owner,
                                                                    pm: { freqYear: 1, lastPM: eq.pm?.lastPM || 'Jan', nextPM: eq.pm?.nextPM || 'Jan', pmBy: 'Vender', items: '', tolerance: '' },
                                                                    cal: { freqYear: 1, lastCal: eq.cal?.lastCal || 'Jan', nextCal: eq.cal?.nextCal || 'Jan', calBy: 'Vender', items: '', tolerance: '' },
                                                                    trackingStatus: { quotationRequested: false, prIssued: false, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' }
                                                                }
                                                            });
                                                            setIsSubModalOpen(true);
                                                        }}
                                                        className="px-2 py-1 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1"
                                                        title="เพิ่มเครื่องพ่วงย่อย (+ Sub)"
                                                    >
                                                        <PlusIcon className="h-3 w-3" />
                                                        <span>Sub</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingEquip(eq);
                                                            setIsEditModalOpen(true);
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                        title="แก้ไขข้อมูลเครื่องหลัก"
                                                    >
                                                        <PencilIcon className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirm({
                                                            type: 'primary',
                                                            id: eq.id,
                                                            name: `${eq.equipmentNo} - ${eq.equipmentName}`
                                                        })}
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="ลบเครื่องมือ"
                                                    >
                                                        <TrashIcon className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* EXPANDED SUB-EQUIPMENT ROWS (NESTED UNDER PRIMARY) */}
                                        {isExpanded && (eq.subEquipments || []).map((sub, sIdx) => {
                                            const subProgress = getStepProgress(sub.trackingStatus || {});
                                            return (
                                                <tr key={sub.id || sIdx} className="bg-indigo-50/20 dark:bg-indigo-950/15 border-l-4 border-indigo-500 hover:bg-indigo-50/40 transition-colors">
                                                    <td className="px-3 py-2.5 text-center text-indigo-400 font-bold text-xs">
                                                        ↳
                                                    </td>

                                                    <td className="px-4 py-2.5 pl-6 whitespace-nowrap">
                                                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs px-2 py-0.5 bg-white dark:bg-base-900 rounded border border-indigo-200 dark:border-indigo-900">
                                                            {sub.equipmentNo}
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-2.5">
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                                                            {sub.equipmentName}
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400 font-medium">
                                                        {sub.owner}
                                                    </td>

                                                    <td className="px-4 py-2.5 bg-indigo-50/20 dark:bg-indigo-950/20 border-l border-r border-indigo-100/40 dark:border-indigo-900/20">
                                                        {sub.pm && sub.pm.lastPM && sub.pm.lastPM !== '-' ? (
                                                            <div className="space-y-1 text-xs">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="font-bold text-[9px] px-1.5 py-0.2 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded">
                                                                        🔄 {formatFrequency(sub.pm.freqYear)}
                                                                    </span>
                                                                    <span className="font-bold text-indigo-600 text-xs">
                                                                        📅 {formatMonthName(sub.pm.lastPM, 'badge')}
                                                                    </span>
                                                                </div>
                                                                {sub.pm.items && <p className="text-[10px] text-slate-500 truncate max-w-xs">{sub.pm.items}</p>}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 text-xs">-</span>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-2.5 bg-emerald-50/20 dark:bg-emerald-950/20 border-r border-emerald-100/40 dark:border-emerald-900/20">
                                                        {sub.cal && sub.cal.lastCal && sub.cal.lastCal !== '-' ? (
                                                            <div className="space-y-1 text-xs">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="font-bold text-[9px] px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded">
                                                                        🔄 {formatFrequency(sub.cal.freqYear)}
                                                                    </span>
                                                                    <span className="font-bold text-emerald-600 text-xs">
                                                                        🎯 {formatMonthName(sub.cal.lastCal, 'badge')}
                                                                    </span>
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-slate-100 dark:bg-base-800 rounded text-slate-600">
                                                                        {sub.cal.calBy || 'Vender'}
                                                                    </span>
                                                                </div>
                                                                {(sub.cal.tolerance || sub.pm?.tolerance) && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded border border-amber-200/60 inline-block">
                                                                        ⚖️ เกณฑ์: {sub.cal.tolerance || sub.pm?.tolerance}
                                                                    </span>
                                                                )}
                                                                {sub.cal.items && <p className="text-[10px] text-slate-500 truncate max-w-xs">{sub.cal.items}</p>}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 text-xs">-</span>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-2.5">
                                                        <button
                                                            onClick={() => setActiveTrackingTarget({
                                                                equipmentId: eq.id,
                                                                subId: sub.id,
                                                                equipmentNo: sub.equipmentNo,
                                                                equipmentName: sub.equipmentName,
                                                                trackingStatus: sub.trackingStatus || {
                                                                    quotationRequested: false, prIssued: false, vendorScheduled: false,
                                                                    certReceived: false, certDelivered: false, result: 'Pending'
                                                                }
                                                            })}
                                                            className="w-full text-left p-1.5 rounded-lg bg-white dark:bg-base-900 border border-indigo-100 dark:border-indigo-900 hover:border-indigo-400 transition-all"
                                                        >
                                                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                                                                <span>{subProgress.completed}/6 สเต็ป</span>
                                                                {sub.trackingStatus?.result === 'Pass' && <span className="text-emerald-600 font-black">PASS</span>}
                                                            </div>
                                                            <div className="grid grid-cols-6 gap-1">
                                                                <div className={`h-1 rounded-full ${sub.trackingStatus?.quotationRequested ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} />
                                                                <div className={`h-1 rounded-full ${sub.trackingStatus?.prIssued ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} />
                                                                <div className={`h-1 rounded-full ${sub.trackingStatus?.vendorScheduled ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} />
                                                                <div className={`h-1 rounded-full ${sub.trackingStatus?.certReceived ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} />
                                                                <div className={`h-1 rounded-full ${sub.trackingStatus?.certDelivered ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-base-800'}`} />
                                                                <div className={`h-1 rounded-full ${sub.trackingStatus?.result === 'Pass' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-base-800'}`} />
                                                            </div>
                                                        </button>
                                                    </td>

                                                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingSub({
                                                                        parentEqId: eq.id,
                                                                        isNew: false,
                                                                        sub: { ...sub }
                                                                    });
                                                                    setIsSubModalOpen(true);
                                                                }}
                                                                className="p-1 text-slate-400 hover:text-primary-600 rounded transition-colors"
                                                                title="แก้ไขเครื่องพ่วงย่อย"
                                                            >
                                                                <PencilIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteConfirm({
                                                                    type: 'sub',
                                                                    id: sub.id,
                                                                    parentId: eq.id,
                                                                    name: `${sub.equipmentNo} - ${sub.equipmentName}`
                                                                })}
                                                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                                                title="ลบเครื่องพ่วงย่อย"
                                                            >
                                                                <TrashIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}

                            {filteredEquipments.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-slate-400 italic">
                                        ไม่พบข้อมูลเครื่องมือตามเงื่อนไขที่เลือก สามารถกดปุ่ม "เพิ่มเครื่องมือหลักใหม่" หรือนำเข้าผ่านแท็บ นำเข้าข้อมูล (Import)
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* DELETE CONFIRMATION MODAL */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-fade-in">
                    <div className="bg-white dark:bg-base-900 rounded-3xl p-6 max-w-sm w-full border border-base-200 dark:border-base-800 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-rose-600">
                            <AlertTriangleIcon className="h-6 w-6" />
                            <h3 className="font-black text-base text-slate-900 dark:text-white">
                                ยืนยันการลบข้อมูล
                            </h3>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            คุณต้องการลบ <strong>"{deleteConfirm.name}"</strong> {deleteConfirm.type === 'primary' ? 'และเครื่องพ่วงย่อยทั้งหมด' : ''} ใช่หรือไม่?
                        </p>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md"
                            >
                                ลบข้อมูลทันที
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TRACKING WORKFLOW UPDATE MODAL (6-STEP PIPELINE) */}
            {activeTrackingTarget && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto animate-fade-in" onClick={() => setActiveTrackingTarget(null)}>
                    <div className="relative my-auto bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl p-6 md:p-8 w-full max-w-xl border border-base-200 dark:border-base-800 space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-primary-600">
                                    Tracking Status Workflow (6 ขั้นตอน)
                                </span>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                                    {activeTrackingTarget.equipmentNo} - {activeTrackingTarget.equipmentName}
                                </h3>
                            </div>
                            <button onClick={() => setActiveTrackingTarget(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-base-800">
                                <XCircleIcon className="h-6 w-6 text-slate-400" />
                            </button>
                        </div>

                        {/* Interactive Steps Form */}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveTrackingStatus(activeTrackingTarget.trackingStatus);
                            }}
                            className="space-y-4"
                        >
                            {/* Step 1: Quotation */}
                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTrackingTarget.trackingStatus.quotationRequested}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, quotationRequested: e.target.checked }
                                        })}
                                        className="w-5 h-5 text-primary-600 rounded-lg focus:ring-primary-500"
                                    />
                                    <div>
                                        <span className="font-bold text-sm text-slate-800 dark:text-white block">1. ขอใบเสนอราคา (Quotation) จาก Vendor</span>
                                        <span className="text-[11px] text-slate-400">ส่งคำขอหรือได้รับใบเสนอราคาจาก Vendor แล้ว</span>
                                    </div>
                                </label>
                                {activeTrackingTarget.trackingStatus.quotationRequested && (
                                    <span className="text-[10px] font-black px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg">เรียบร้อย</span>
                                )}
                            </div>

                            {/* Step 2: PR */}
                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={activeTrackingTarget.trackingStatus.prIssued}
                                            onChange={e => setActiveTrackingTarget({
                                                ...activeTrackingTarget,
                                                trackingStatus: { ...activeTrackingTarget.trackingStatus, prIssued: e.target.checked }
                                            })}
                                            className="w-5 h-5 text-primary-600 rounded-lg focus:ring-primary-500"
                                        />
                                        <div>
                                            <span className="font-bold text-sm text-slate-800 dark:text-white block">2. แจ้งออกใบ PR (Purchase Requisition)</span>
                                            <span className="text-[11px] text-slate-400">ขออนุมัติจัดซื้อจัดจ้าง/เปิดใบสั่งซื้อในระบบ</span>
                                        </div>
                                    </label>
                                    {activeTrackingTarget.trackingStatus.prIssued && (
                                        <span className="text-[10px] font-black px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg">ออก PR แล้ว</span>
                                    )}
                                </div>
                                <div className="pl-8 pt-1 flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500">เลขที่ PR:</span>
                                    <input
                                        type="text"
                                        placeholder="เช่น PR-69-10042"
                                        value={activeTrackingTarget.trackingStatus.prNo || ''}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, prNo: e.target.value }
                                        })}
                                        className="px-3 py-1 bg-white dark:bg-base-900 border rounded-lg text-xs font-semibold flex-1"
                                    />
                                </div>
                            </div>

                            {/* Step 3: Schedule Date */}
                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={activeTrackingTarget.trackingStatus.vendorScheduled}
                                            onChange={e => setActiveTrackingTarget({
                                                ...activeTrackingTarget,
                                                trackingStatus: { ...activeTrackingTarget.trackingStatus, vendorScheduled: e.target.checked }
                                            })}
                                            className="w-5 h-5 text-primary-600 rounded-lg focus:ring-primary-500"
                                        />
                                        <div>
                                            <span className="font-bold text-sm text-slate-800 dark:text-white block">3. นัดหมาย Vendor เข้ามาดำเนินการหน้างาน</span>
                                            <span className="text-[11px] text-slate-400">ยืนยันวันเข้าทำงานของช่าง/ผู้ให้บริการ</span>
                                        </div>
                                    </label>
                                </div>
                                <div className="pl-8 pt-1 flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500">วันที่นัดหมาย:</span>
                                    <input
                                        type="date"
                                        value={activeTrackingTarget.trackingStatus.scheduledDate || ''}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, scheduledDate: e.target.value }
                                        })}
                                        className="px-3 py-1 bg-white dark:bg-base-900 border rounded-lg text-xs font-semibold"
                                    />
                                </div>
                            </div>

                            {/* Step 4: Cert Received */}
                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTrackingTarget.trackingStatus.certReceived}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, certReceived: e.target.checked }
                                        })}
                                        className="w-5 h-5 text-primary-600 rounded-lg focus:ring-primary-500"
                                    />
                                    <div>
                                        <span className="font-bold text-sm text-slate-800 dark:text-white block">4. รับใบเซอร์ (Certificate) จาก Vendor</span>
                                        <span className="text-[11px] text-slate-400">ได้รับเอกสาร Certificate ฉบับจริงหรือ PDF แล้ว</span>
                                    </div>
                                </label>
                                {activeTrackingTarget.trackingStatus.certReceived && (
                                    <span className="text-[10px] font-black px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg">รับแล้ว</span>
                                )}
                            </div>

                            {/* Step 5: Cert Delivered */}
                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTrackingTarget.trackingStatus.certDelivered}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, certDelivered: e.target.checked }
                                        })}
                                        className="w-5 h-5 text-primary-600 rounded-lg focus:ring-primary-500"
                                    />
                                    <div>
                                        <span className="font-bold text-sm text-slate-800 dark:text-white block">5. ส่งมอบใบเซอร์ให้พนักงานที่ดูแล</span>
                                        <span className="text-[11px] text-slate-400">ส่งต่อใบเซอร์ให้เจ้าของเครื่องมือตรวจสอบผล</span>
                                    </div>
                                </label>
                                {activeTrackingTarget.trackingStatus.certDelivered && (
                                    <span className="text-[10px] font-black px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg">ส่งมอบแล้ว</span>
                                )}
                            </div>

                            {/* Step 6: Final Result */}
                            <div className="p-3.5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 space-y-2">
                                <span className="font-bold text-sm text-slate-800 dark:text-white block">
                                    6. สรุปผลการ Cal / PM (Pass / Fail / Action Required)
                                </span>
                                <div className="grid grid-cols-4 gap-2">
                                    {(['Pending', 'Pass', 'Fail', 'Action Required'] as const).map(res => (
                                        <button
                                            key={res}
                                            type="button"
                                            onClick={() => setActiveTrackingTarget({
                                                ...activeTrackingTarget,
                                                trackingStatus: { ...activeTrackingTarget.trackingStatus, result: res }
                                            })}
                                            className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                                activeTrackingTarget.trackingStatus.result === res
                                                    ? res === 'Pass' ? 'bg-emerald-600 text-white border-emerald-600'
                                                    : res === 'Fail' ? 'bg-rose-600 text-white border-rose-600'
                                                    : res === 'Action Required' ? 'bg-amber-600 text-white border-amber-600'
                                                    : 'bg-primary-600 text-white border-primary-600'
                                                    : 'bg-white dark:bg-base-900 text-slate-600 border-slate-200'
                                            }`}
                                        >
                                            {res}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setActiveTrackingTarget(null)}
                                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-md"
                                >
                                    บันทึกสถานะ
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT/CREATE PRIMARY EQUIPMENT MODAL */}
            {isEditModalOpen && editingEquip && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto animate-fade-in" onClick={() => setIsEditModalOpen(false)}>
                    <div className="relative my-auto bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl p-6 md:p-8 w-full max-w-2xl border border-base-200 dark:border-base-800 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-primary-600">Equipment Setup</span>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                    {editingEquip.id ? 'แก้ไขเครื่องมือหลัก' : 'เพิ่มเครื่องมือหลักใหม่'}
                                </h3>
                            </div>
                            <button onClick={() => setIsEditModalOpen(false)} className="p-2 rounded-full hover:bg-slate-100">
                                <XCircleIcon className="h-6 w-6 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEquipment} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Equipment Number (ห้ามมี /) *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="เช่น PDS-1001"
                                        value={editingEquip.equipmentNo || ''}
                                        onChange={e => setEditingEquip({ ...editingEquip, equipmentNo: e.target.value })}
                                        className="w-full mt-1 p-3 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">พนักงานที่ดูแล (Owner) *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="เช่น PORNTHAK หรือ Channarong"
                                        value={editingEquip.owner || ''}
                                        onChange={e => setEditingEquip({ ...editingEquip, owner: e.target.value })}
                                        className="w-full mt-1 p-3 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">ชื่อเครื่องมือ (Equipment Name) *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="เช่น FTIR Tensor37, Melt Flow Index"
                                    value={editingEquip.equipmentName || ''}
                                    onChange={e => setEditingEquip({ ...editingEquip, equipmentName: e.target.value })}
                                    className="w-full mt-1 p-3 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                                />
                            </div>

                            {/* PM Section */}
                            <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                                <h4 className="font-black text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                                    🛠️ ข้อมูล Preventive Maintenance (PM)
                                </h4>
                                <div className="grid grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ความถี่ PM (ครั้ง/ปี)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น 1 หรือ 2"
                                            value={editingEquip.pm?.freqYear ?? 1}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pm: { ...editingEquip.pm, freqYear: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">เดือนที่ทำ PM</label>
                                        <select
                                            value={normalizeMonth(editingEquip.pm?.lastPM) || 'Nov'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pm: { ...editingEquip.pm, lastPM: e.target.value, nextPM: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        >
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'full')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ผู้รับผิดชอบ PM</label>
                                        <select
                                            value={editingEquip.pm?.pmBy || 'Vender'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pm: { ...editingEquip.pm, pmBy: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        >
                                            <option value="Vender">Vender (ภายนอก)</option>
                                            <option value="Owner">Owner (ทำเองภายใน)</option>
                                            <option value="-">-</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">เกณฑ์ PM</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น Pass/Fail"
                                            value={editingEquip.pm?.tolerance || ''}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pm: { ...editingEquip.pm, tolerance: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400">รายการที่ต้องปฏิบัติ (PM Items)</label>
                                    <textarea
                                        rows={2}
                                        placeholder="ระบุขั้นตอนการบำรุงรักษา หรือตามรายการ Vender"
                                        value={editingEquip.pm?.items || ''}
                                        onChange={e => setEditingEquip({
                                            ...editingEquip,
                                            pm: { ...editingEquip.pm, items: e.target.value }
                                        })}
                                        className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                    />
                                </div>
                            </div>

                            {/* Cal Section */}
                            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 space-y-3">
                                <h4 className="font-black text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                    🎯 ข้อมูล Calibration (Cal)
                                </h4>
                                <div className="grid grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ความถี่ Cal (ครั้ง/ปี)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น 1 หรือ 2"
                                            value={editingEquip.cal?.freqYear ?? 1}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                cal: { ...editingEquip.cal, freqYear: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">เดือนที่ทำ Cal</label>
                                        <select
                                            value={normalizeMonth(editingEquip.cal?.lastCal) || 'Nov'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                cal: { ...editingEquip.cal, lastCal: e.target.value, nextCal: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        >
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'full')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ผู้รับผิดชอบ Cal</label>
                                        <select
                                            value={editingEquip.cal?.calBy || 'Vender'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                cal: { ...editingEquip.cal, calBy: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        >
                                            <option value="Vender">Vender (ภายนอก)</option>
                                            <option value="Owner">Owner (ทำเองภายใน)</option>
                                            <option value="-">-</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">เกณฑ์ยอมรับ (Tolerance)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น ± 5°C, ±0.5%"
                                            value={editingEquip.cal?.tolerance || ''}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                cal: { ...editingEquip.cal, tolerance: e.target.value }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400">รายการที่ต้องสอบเทียบ (Cal Items)</label>
                                    <textarea
                                        rows={2}
                                        placeholder="ระบุจุดสอบเทียบ หรือตามรายการ Vender"
                                        value={editingEquip.cal?.items || ''}
                                        onChange={e => setEditingEquip({
                                            ...editingEquip,
                                            cal: { ...editingEquip.cal, items: e.target.value }
                                        })}
                                        className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-md"
                                >
                                    บันทึกเครื่องมือ
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT/CREATE SUB-EQUIPMENT MODAL */}
            {isSubModalOpen && editingSub && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto animate-fade-in" onClick={() => setIsSubModalOpen(false)}>
                    <div className="relative my-auto bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl p-6 md:p-8 w-full max-w-lg border border-base-200 dark:border-base-800 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Sub-Equipment Setup</span>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                    {editingSub.isNew ? 'เพิ่มเครื่องพ่วงย่อย (+ Sub)' : 'แก้ไขเครื่องพ่วงย่อย'}
                                </h3>
                            </div>
                            <button onClick={() => setIsSubModalOpen(false)} className="p-2 rounded-full hover:bg-slate-100">
                                <XCircleIcon className="h-6 w-6 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSubEquipment} className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">รหัสเครื่องพ่วง (มี /) *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="เช่น PDS-1001/02"
                                        value={editingSub.sub.equipmentNo || ''}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: { ...editingSub.sub, equipmentNo: e.target.value }
                                        })}
                                        className="w-full mt-1 p-2.5 bg-slate-50 dark:bg-base-950/40 border rounded-xl font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">ผู้ดูแล (Owner)</label>
                                    <input
                                        type="text"
                                        placeholder="ผู้รับผิดชอบ"
                                        value={editingSub.sub.owner || ''}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: { ...editingSub.sub, owner: e.target.value }
                                        })}
                                        className="w-full mt-1 p-2.5 bg-slate-50 dark:bg-base-950/40 border rounded-xl font-bold"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">ชื่อเครื่องพ่วงย่อย *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="เช่น Specae-Heater (BC2) หรือ Weight 400 g"
                                    value={editingSub.sub.equipmentName || ''}
                                    onChange={e => setEditingSub({
                                        ...editingSub,
                                        sub: { ...editingSub.sub, equipmentName: e.target.value }
                                    })}
                                    className="w-full mt-1 p-2.5 bg-slate-50 dark:bg-base-950/40 border rounded-xl font-bold"
                                />
                            </div>

                            {/* PM Section for Sub-Equipment */}
                            <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 space-y-2.5">
                                <h4 className="font-black text-[11px] uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                                    🛠️ ข้อมูล Preventive Maintenance (PM)
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ความถี่ PM (ครั้ง/ปี)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น 1 หรือ 2"
                                            value={editingSub.sub.pm?.freqYear ?? 1}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, pm: { ...editingSub.sub.pm, freqYear: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">เดือนที่ทำ PM</label>
                                        <select
                                            value={normalizeMonth(editingSub.sub.pm?.lastPM) || 'Jan'}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, pm: { ...editingSub.sub.pm, lastPM: e.target.value, nextPM: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        >
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'full')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ผู้รับผิดชอบ PM</label>
                                        <select
                                            value={editingSub.sub.pm?.pmBy || 'Vender'}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, pm: { ...editingSub.sub.pm, pmBy: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        >
                                            <option value="Vender">Vender (ภายนอก)</option>
                                            <option value="Owner">Owner (ภายใน)</option>
                                            <option value="-">-</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400">รายการ PM (Items)</label>
                                    <input
                                        type="text"
                                        placeholder="รายละเอียดการบำรุงรักษา"
                                        value={editingSub.sub.pm?.items || ''}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: { ...editingSub.sub, pm: { ...editingSub.sub.pm, items: e.target.value } }
                                        })}
                                        className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                    />
                                </div>
                            </div>

                            {/* Cal Section for Sub-Equipment */}
                            <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 space-y-2.5">
                                <h4 className="font-black text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                    🎯 ข้อมูล Calibration (Cal)
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ความถี่ Cal (ครั้ง/ปี)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น 1 หรือ 2"
                                            value={editingSub.sub.cal?.freqYear ?? 1}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, cal: { ...editingSub.sub.cal, freqYear: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">เดือนที่ทำ Cal</label>
                                        <select
                                            value={normalizeMonth(editingSub.sub.cal?.lastCal) || 'Jan'}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, cal: { ...editingSub.sub.cal, lastCal: e.target.value, nextCal: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs font-bold"
                                        >
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'full')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">ผู้รับผิดชอบ Cal</label>
                                        <select
                                            value={editingSub.sub.cal?.calBy || 'Vender'}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, cal: { ...editingSub.sub.cal, calBy: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        >
                                            <option value="Vender">Vender (ภายนอก)</option>
                                            <option value="Owner">Owner (ภายใน)</option>
                                            <option value="-">-</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">เกณฑ์ยอมรับ (Tolerance)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น ± 5°C, ±0.5%"
                                            value={editingSub.sub.cal?.tolerance || ''}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, cal: { ...editingSub.sub.cal, tolerance: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">รายการสอบเทียบ (Cal Items)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น Weight หรือ Temp 3 จุด"
                                            value={editingSub.sub.cal?.items || ''}
                                            onChange={e => setEditingSub({
                                                ...editingSub,
                                                sub: { ...editingSub.sub, cal: { ...editingSub.sub.cal, items: e.target.value } }
                                            })}
                                            className="w-full mt-1 p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t">
                                <button
                                    type="button"
                                    onClick={() => setIsSubModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md"
                                >
                                    บันทึกเครื่องพ่วง
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EquipmentTab;
