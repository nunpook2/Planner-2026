import React, { useState, useMemo } from 'react';
import type { Equipment, EquipmentSubComponent, TrackingWorkflowStatus, Tester, BreakdownRecord, PMDetails, CalDetails } from '../types';
import { 
    saveEquipment, deleteEquipment, reconcileEquipmentStandards, resetToMasterEquipments,
    normalizeEquipmentNo, sortEquipmentsNaturally 
} from '../services/dataService';
import { MASTER_EQUIPMENT_OWNERS } from '../services/masterEquipments';
import { 
    PlusIcon, SearchIcon, PencilIcon, TrashIcon, CheckCircleIcon, 
    XCircleIcon, AlertTriangleIcon, ChevronDownIcon, ClockIcon, SparklesIcon,
    RefreshIcon 
} from './common/Icons';
import { 
    MONTH_KEYS, MONTH_INFO_MAP, normalizeMonth, formatMonthName, formatFrequency,
    inferEquipmentSetGroup, getMultiYearCycleStatus
} from '../utils/monthUtils';
import EquipmentHistoryModal from './EquipmentHistoryModal';

interface EquipmentTabProps {
    equipments?: Equipment[];
    testers?: Tester[];
    onEquipmentUpdated: () => void;
}

/**
 * Helper to extract all months (Jan..Dec) where a PM or Calibration is planned,
 * accounting for multiple entries and annual frequency (e.g. 2x/year every 6 months).
 */
export function getMonthsForPlan(details?: PMDetails | CalDetails, fallbackMonth?: string): Set<string> {
    const months = new Set<string>();
    if (!details && !fallbackMonth) return months;

    const lastVal = (details as any)?.lastPM ?? (details as any)?.lastCal;
    const nextVal = (details as any)?.nextPM ?? (details as any)?.nextCal;
    const explicitVal = (lastVal !== undefined && String(lastVal).trim() !== '')
        ? lastVal
        : (nextVal !== undefined && String(nextVal).trim() !== '')
            ? nextVal
            : fallbackMonth;

    const rawStr = String(explicitVal ?? '').trim();
    const lower = rawStr.toLowerCase();
    if (
        !rawStr ||
        rawStr === '-' ||
        lower === 'n/a' ||
        lower === 'none' ||
        lower === 'ไม่มี' ||
        String(details?.freqYear ?? '').trim() === '-' ||
        details?.freqYear === 0
    ) {
        return months;
    }

    if (rawStr.includes(',') || (rawStr.includes('/') && !rawStr.includes('/20') && !rawStr.includes('/25'))) {
        const parts = rawStr.split(/[,/]/);
        for (const part of parts) {
            const norm = normalizeMonth(part);
            if (norm) months.add(norm);
        }
    } else {
        const norm = normalizeMonth(rawStr);
        if (norm) months.add(norm);
    }

    const freq = typeof details?.freqYear === 'number' ? details.freqYear : parseFloat(String(details?.freqYear || '1'));
    if (!isNaN(freq) && freq > 1 && months.size === 1) {
        const baseMonths = Array.from(months);
        for (const base of baseMonths) {
            const baseIdx = MONTH_KEYS.indexOf(base as any);
            if (baseIdx !== -1) {
                if (freq === 2) {
                    months.add(MONTH_KEYS[(baseIdx + 6) % 12]);
                } else if (freq === 3) {
                    months.add(MONTH_KEYS[(baseIdx + 4) % 12]);
                    months.add(MONTH_KEYS[(baseIdx + 8) % 12]);
                } else if (freq === 4) {
                    for (let step = 1; step < 4; step++) {
                        months.add(MONTH_KEYS[(baseIdx + step * 3) % 12]);
                    }
                } else if (freq === 12) {
                    MONTH_KEYS.forEach(m => months.add(m));
                }
            }
        }
    }

    return months;
}

export const EquipmentTab: React.FC<EquipmentTabProps> = ({ equipments: propEquipments, testers, onEquipmentUpdated }) => {
    const [equipments, setEquipments] = useState<Equipment[]>(propEquipments || []);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState<'all' | 'pm' | 'cal' | 'both'>('all');
    const [filterOwner, setFilterOwner] = useState<string>('all');
    const [filterMonth, setFilterMonth] = useState<string>('all');
    const [filterWorkflow, setFilterWorkflow] = useState<string>('all');
    
    // Multi-Year & Alternating Set (A/B) Planning State
    const [planningYear, setPlanningYear] = useState<number>(2026);
    const [filterSetCycle, setFilterSetCycle] = useState<'all' | 'due_this_year' | 'standby_this_year' | 'off_cycle' | 'set_a' | 'set_b'>('all');
    const [isRotationModalOpen, setIsRotationModalOpen] = useState<boolean>(false);
    const [selectedRotationEqId, setSelectedRotationEqId] = useState<string>('');

    // Drag-and-Drop, Click-to-Move (Quick Move), and Batch Group Move State
    const [dragPayload, setDragPayload] = useState<{
        eqId: string;
        subId?: string;
        equipmentNo: string;
        equipmentName: string;
        fromMonth: string;
        planType: 'pm' | 'cal' | 'both';
        hasSubEquipments: boolean;
        isGroupBadge?: boolean;
    } | null>(null);
    const [dragOverCell, setDragOverCell] = useState<{ eqId: string; subId?: string; month: string } | null>(null);

    // Click-to-Move mode (New alternative to dragging: click badge -> click destination month cell!)
    const [isQuickMoveMode, setIsQuickMoveMode] = useState<boolean>(false);
    const [quickMoveSource, setQuickMoveSource] = useState<{
        eqId: string;
        subId?: string;
        equipmentNo: string;
        equipmentName: string;
        fromMonth: string;
        planType: 'pm' | 'cal' | 'both';
        hasSubEquipments: boolean;
        includeSubs: boolean;
    } | null>(null);

    // Follow-up offer banner after moving a Primary Equipment that has sub-equipments
    const [recentPrimaryMoveOffer, setRecentPrimaryMoveOffer] = useState<{
        equipment: Equipment;
        toMonth: string;
        planType: 'pm' | 'cal' | 'both';
    } | null>(null);

    const [batchMoveModal, setBatchMoveModal] = useState<{
        equipment: Equipment;
        toMonth: string;
        planType: 'pm' | 'cal' | 'both';
        scope: 'all' | 'primary_only' | 'subs_all' | 'set_a' | 'set_b' | 'custom';
        selectedSubIds: Set<string>;
        includePrimaryInCustom: boolean;
    } | null>(null);

    // Accordion states:
    // 1. Expanded sub-components for primary equipments (auto-expanded on first load so all 162 items are visible)
    const [expandedEquipIds, setExpandedEquipIds] = useState<Set<string>>(new Set());
    const hasAutoExpandedRef = React.useRef(false);
    // 2. Expanded inline details drawer for equipment
    const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(new Set());

    const [isReconciling, setIsReconciling] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    
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

    // Full Detail Modal State (Triggered when clicking a specific month box or clicking "ดูรายละเอียดเจาะลึก")
    const [inspectionTarget, setInspectionTarget] = useState<{
        equipment: Equipment;
        subComponent?: EquipmentSubComponent;
        highlightType?: 'pm' | 'cal';
        highlightMonth?: string;
    } | null>(null);

    // Delete confirmation state
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

    // Quick resolve breakdown state in EquipmentTab
    const [equipmentToResolve, setEquipmentToResolve] = useState<Equipment | null>(null);
    const [isResolvingQuick, setIsResolvingQuick] = useState(false);
    const [resolveToast, setResolveToast] = useState<string | null>(null);

    // Dedicated equipment history & service logbook modal state
    const [selectedEquipmentForHistory, setSelectedEquipmentForHistory] = useState<Equipment | null>(null);

    const activeEquipmentForHistory = useMemo(() => {
        if (!selectedEquipmentForHistory) return null;
        return equipments.find(e => e.id === selectedEquipmentForHistory.id || e.equipmentNo === selectedEquipmentForHistory.equipmentNo) || selectedEquipmentForHistory;
    }, [selectedEquipmentForHistory, equipments]);

    // Current real-world month key (e.g. 'Oct')
    const currentMonthKey = useMemo(() => {
        const monthIndex = new Date().getMonth(); // 0..11
        return MONTH_KEYS[monthIndex];
    }, []);

    // Initial load and sync with parent props
    React.useEffect(() => {
        if (propEquipments && propEquipments.length > 0) {
            setEquipments(propEquipments);
            if (!hasAutoExpandedRef.current) {
                hasAutoExpandedRef.current = true;
                setExpandedEquipIds(new Set(
                    propEquipments
                        .filter(e => e.subEquipments && e.subEquipments.length > 0)
                        .map(e => e.id)
                ));
            }
        } else {
            loadData();
        }
    }, [propEquipments]);

    const loadData = async () => {
        const { getEquipments } = await import('../services/dataService');
        const data = await getEquipments();
        const list = data || [];
        setEquipments(list);
        if (!hasAutoExpandedRef.current && list.length > 0) {
            hasAutoExpandedRef.current = true;
            setExpandedEquipIds(new Set(
                list
                    .filter(e => e.subEquipments && e.subEquipments.length > 0)
                    .map(e => e.id)
            ));
        }
    };

    // Quick change owner right from the table
    const handleQuickChangeOwner = async (equipmentId: string, newOwner: string, isSub?: boolean, subId?: string) => {
        const targetEq = equipments.find(e => e.id === equipmentId);
        if (!targetEq) return;
        try {
            const { saveEquipment } = await import('../services/dataService');
            if (!isSub) {
                const updated: Equipment = { ...targetEq, owner: newOwner.trim() };
                await saveEquipment(updated);
            } else if (subId) {
                const updatedSubs = (targetEq.subEquipments || []).map(s => s.id === subId ? { ...s, owner: newOwner.trim() } : s);
                const updated: Equipment = { ...targetEq, subEquipments: updatedSubs };
                await saveEquipment(updated);
            }
            await loadData();
            onEquipmentUpdated();
            setResolveToast(`เปลี่ยนผู้รับผิดชอบเป็น "${newOwner}" เรียบร้อยแล้ว`);
            setTimeout(() => setResolveToast(null), 3500);
        } catch (err: any) {
            setResolveToast(`เกิดข้อผิดพลาด: ${err?.message || err}`);
        }
    };

    const handleResolveEquipmentInTab = async (eq: Equipment) => {
        if (!eq) return;
        setIsResolvingQuick(true);
        try {
            const { saveEquipment } = await import('../services/dataService');
            const curInc = eq.breakdownStatus?.currentIncident;
            const resolveDate = new Date().toISOString().split('T')[0];

            const resolvedIncident: BreakdownRecord = curInc ? {
                ...curInc,
                stage: 'repaired_verified',
                resolvedDate: resolveDate,
                resolutionNote: curInc.resolutionNote || 'ตรวจรับการซ่อมแซมสมบูรณ์ เครื่องกลับคืนสู่สภาพพร้อมใช้งานปกติ 100%'
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
                resolutionNote: 'ตรวจรับการซ่อมแซมสมบูรณ์ เครื่องกลับคืนสู่สภาพพร้อมใช้งานปกติ 100%'
            };

            const updated: Equipment = {
                ...eq,
                status: 'ready',
                breakdownStatus: {
                    isBroken: false,
                    history: [resolvedIncident, ...(eq.breakdownStatus?.history || [])]
                }
            };

            await saveEquipment(updated);
            await loadData();
            setEquipmentToResolve(null);
            onEquipmentUpdated();
            setResolveToast(`คืนสภาพเครื่องมือ "${eq.equipmentNo}" พร้อมใช้งานปกติ 100% เรียบร้อยแล้ว`);
            setTimeout(() => setResolveToast(null), 4000);
        } catch (e: any) {
            setResolveToast("เกิดข้อผิดพลาดในการคืนสภาพ: " + (e?.message || e));
        } finally {
            setIsResolvingQuick(false);
        }
    };

    // Helper to check if a sub-equipment matches the current Set / Multi-Year Cycle filter
    const matchesSetCycleFilter = (
        itemName: string,
        explicitSetGroup?: string,
        pm?: PMDetails,
        cal?: CalDetails
    ): boolean => {
        if (filterSetCycle === 'all') return true;
        const setG = inferEquipmentSetGroup(itemName, explicitSetGroup);
        if (filterSetCycle === 'set_a') return setG === 'A';
        if (filterSetCycle === 'set_b') return setG === 'B';

        const pmCycle = getMultiYearCycleStatus(pm, planningYear, setG);
        const calCycle = getMultiYearCycleStatus(cal, planningYear, setG);
        const hasPM = getMonthsForPlan(pm).size > 0;
        const hasCal = getMonthsForPlan(cal).size > 0;

        const isDue = (hasPM && pmCycle.isDueInYear) || (hasCal && calCycle.isDueInYear);
        const isOffCycle = (hasPM && !pmCycle.isDueInYear) || (hasCal && !calCycle.isDueInYear);

        if (filterSetCycle === 'due_this_year') return isDue;
        if (filterSetCycle === 'off_cycle' || filterSetCycle === 'standby_this_year') return isOffCycle;
        return true;
    };

    // Filtered Primary Equipments with natural sorting
    const filteredEquipments = useMemo(() => {
        const list = equipments.filter(eq => {
            const rawNo = String(eq.equipmentNo || '').trim();
            const cleanNo = normalizeEquipmentNo(rawNo);
            if (!cleanNo || cleanNo.includes('/')) return false;

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchPrimary = (
                    rawNo.toLowerCase().includes(q) ||
                    cleanNo.toLowerCase().includes(q) ||
                    String(eq.equipmentName || eq.name || '').toLowerCase().includes(q) ||
                    String(eq.owner || '').toLowerCase().includes(q) ||
                    String(eq.pm?.items || '').toLowerCase().includes(q) ||
                    String(eq.cal?.items || '').toLowerCase().includes(q) ||
                    String(eq.contactVender || '').toLowerCase().includes(q)
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

            // Category filter (checks both primary and sub-equipments)
            const pmMonths = getMonthsForPlan(eq.pm, eq.pmMonth);
            const calMonths = getMonthsForPlan(eq.cal, eq.calMonth);
            const hasSubPM = (eq.subEquipments || []).some(s => getMonthsForPlan(s.pm).size > 0);
            const hasSubCal = (eq.subEquipments || []).some(s => getMonthsForPlan(s.cal).size > 0);
            const hasPM = pmMonths.size > 0 || hasSubPM;
            const hasCal = calMonths.size > 0 || hasSubCal;

            if (filterCategory === 'pm' && !hasPM) return false;
            if (filterCategory === 'cal' && !hasCal) return false;
            if (filterCategory === 'both' && (!hasPM || !hasCal)) return false;

            // Set A/B & Multi-Year Cycle filter
            if (filterSetCycle !== 'all') {
                const primarySetMatch = matchesSetCycleFilter(eq.equipmentName, eq.setGroup, eq.pm, eq.cal);
                const subSetMatch = (eq.subEquipments || []).some(s =>
                    matchesSetCycleFilter(s.equipmentName, s.setGroup, s.pm, s.cal)
                );
                if (!primarySetMatch && !subSetMatch) return false;
            }

            // Owner filter
            if (filterOwner !== 'all') {
                const primaryMatch = String(eq.owner || '').toLowerCase() === filterOwner.toLowerCase();
                const subMatch = (eq.subEquipments || []).some(s => String(s.owner || '').toLowerCase() === filterOwner.toLowerCase());
                if (!primaryMatch && !subMatch) return false;
            }

            // Month filter
            if (filterMonth !== 'all') {
                const matchPrimaryMonth = pmMonths.has(filterMonth) || calMonths.has(filterMonth);
                const matchSubMonth = (eq.subEquipments || []).some(s => {
                    const sPMMonths = getMonthsForPlan(s.pm);
                    const sCalMonths = getMonthsForPlan(s.cal);
                    return sPMMonths.has(filterMonth) || sCalMonths.has(filterMonth);
                });
                if (!matchPrimaryMonth && !matchSubMonth) return false;
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

        return sortEquipmentsNaturally(list);
    }, [equipments, searchQuery, filterCategory, filterSetCycle, planningYear, filterOwner, filterMonth, filterWorkflow]);

    // Monthly Plan Statistics across all 70 primary + 92 sub equipments (accounting for selected planningYear)
    const monthlyStats = useMemo(() => {
        const stats: Record<string, { pm: number; cal: number; offCycle: number; totalMachines: Set<string> }> = {};
        MONTH_KEYS.forEach(m => {
            stats[m] = { pm: 0, cal: 0, offCycle: 0, totalMachines: new Set() };
        });

        equipments.forEach(eq => {
            const rawNo = String(eq.equipmentNo || '').trim();
            if (!rawNo || rawNo.includes('/')) return;

            const pmMonths = getMonthsForPlan(eq.pm, eq.pmMonth);
            const calMonths = getMonthsForPlan(eq.cal, eq.calMonth);
            const eqPMCycle = getMultiYearCycleStatus(eq.pm, planningYear, eq.setGroup);
            const eqCalCycle = getMultiYearCycleStatus(eq.cal, planningYear, eq.setGroup);

            pmMonths.forEach(m => {
                if (stats[m]) {
                    if (eqPMCycle.isDueInYear) {
                        stats[m].pm++;
                        stats[m].totalMachines.add(eq.id);
                    } else {
                        stats[m].offCycle++;
                    }
                }
            });
            calMonths.forEach(m => {
                if (stats[m]) {
                    if (eqCalCycle.isDueInYear) {
                        stats[m].cal++;
                        stats[m].totalMachines.add(eq.id);
                    } else {
                        stats[m].offCycle++;
                    }
                }
            });

            // Include sub-equipments in monthly statistics
            (eq.subEquipments || []).forEach(sub => {
                const subPMMonths = getMonthsForPlan(sub.pm);
                const subCalMonths = getMonthsForPlan(sub.cal);
                const subPMCycle = getMultiYearCycleStatus(sub.pm, planningYear, sub.setGroup);
                const subCalCycle = getMultiYearCycleStatus(sub.cal, planningYear, sub.setGroup);

                subPMMonths.forEach(m => {
                    if (stats[m]) {
                        if (subPMCycle.isDueInYear) {
                            stats[m].pm++;
                            stats[m].totalMachines.add(sub.id || `${eq.id}_sub`);
                        } else {
                            stats[m].offCycle++;
                        }
                    }
                });
                subCalMonths.forEach(m => {
                    if (stats[m]) {
                        if (subCalCycle.isDueInYear) {
                            stats[m].cal++;
                            stats[m].totalMachines.add(sub.id || `${eq.id}_sub`);
                        } else {
                            stats[m].offCycle++;
                        }
                    }
                });
            });
        });

        return stats;
    }, [equipments, planningYear]);

    // Available Owners for filtering & assignments
    const availableOwners = useMemo(() => {
        const set = new Set<string>();
        Object.values(MASTER_EQUIPMENT_OWNERS).forEach(o => {
            if (o && o !== 'PDF' && o !== 'EQ-UNKNOWN') set.add(o.trim());
        });
        (testers || []).forEach(t => { if (t?.name) set.add(t.name.trim()); });
        (equipments || []).forEach(eq => {
            if (eq?.owner && eq.owner !== 'PDF' && eq.owner !== 'EQ-UNKNOWN') set.add(eq.owner.trim());
            (eq?.subEquipments || []).forEach(s => { if (s?.owner && s.owner !== 'PDF') set.add(s.owner.trim()); });
        });
        return Array.from(set).filter(Boolean).sort();
    }, [equipments, testers]);

    // Auto-align equipment codes & responsible owners
    const handleAutoAlignStandards = async () => {
        setIsReconciling(true);
        try {
            const reconciled = await reconcileEquipmentStandards();
            setEquipments(reconciled);
            setResolveToast(`จัดระเบียบรหัสเครื่องมือ และอัปเดตผู้รับผิดชอบตามไฟล์ Master Plan เรียบร้อยแล้ว (${reconciled.length} รายการเครื่องมือหลัก)`);
            onEquipmentUpdated();
        } catch (err: any) {
            setResolveToast("เกิดข้อผิดพลาดในการจัดระเบียบ: " + (err.message || ''));
        } finally {
            setIsReconciling(false);
        }
    };

    // Force reload 100% data from the user's uploaded master file
    const handleResetMaster = async () => {
        setIsReconciling(true);
        try {
            const fresh = await resetToMasterEquipments();
            setEquipments(fresh);
            const totalSubs = fresh.reduce((sum, e) => sum + (e.subEquipments?.length || 0), 0);
            setResolveToast(`ดึงข้อมูล Master Plan จากไฟล์แนบสำเร็จ 100% (${fresh.length} เครื่องหลัก และ ${totalSubs} เครื่องพ่วงย่อย ครบทุกรายการพร้อมผู้รับผิดชอบที่ถูกต้อง)`);
            onEquipmentUpdated();
        } catch (err: any) {
            setResolveToast("เกิดข้อผิดพลาดในการโหลด Master Plan: " + (err.message || ''));
        } finally {
            setIsReconciling(false);
        }
    };

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
        const isReady = editingEquip.status === 'ready' || !editingEquip.status;

        const oldEq = editingEquip.id ? equipments.find(item => item.id === editingEquip.id) : null;
        const oldNo = oldEq?.equipmentNo ? String(oldEq.equipmentNo).trim() : '';
        let subs = editingEquip.subEquipments || [];
        if (oldNo && cleanNo !== oldNo) {
            subs = subs.map(sub => {
                const subNo = String(sub.equipmentNo || '').trim();
                if (subNo.startsWith(oldNo + '/')) {
                    return {
                        ...sub,
                        equipmentNo: subNo.replace(oldNo + '/', cleanNo + '/')
                    };
                }
                return sub;
            });
        }

        const newRecord: Equipment = {
            id: editingEquip.id || `eq_${Date.now()}`,
            equipmentNo: cleanNo,
            equipmentName: editingEquip.equipmentName.trim(),
            name: editingEquip.equipmentName.trim(),
            code: cleanNo,
            owner: (editingEquip.owner || 'PORNTHAK').trim(),
            department: editingEquip.department || 'PCRD Lab',
            location: editingEquip.location || '',
            status: isReady ? 'ready' : 'issue',
            breakdownStatus: isReady ? {
                isBroken: false,
                history: editingEquip.breakdownStatus?.currentIncident ? [
                    {
                        ...editingEquip.breakdownStatus.currentIncident,
                        stage: 'repaired_verified',
                        resolvedDate: new Date().toISOString().split('T')[0],
                        resolutionNote: 'ตรวจรับการซ่อมแซมสมบูรณ์ คืนสภาพพร้อมใช้งานปกติ 100%'
                    },
                    ...(editingEquip.breakdownStatus?.history || [])
                ] : (editingEquip.breakdownStatus?.history || [])
            } : (editingEquip.breakdownStatus || {
                isBroken: true,
                currentIncident: {
                    id: `inc_${Date.now()}`,
                    equipmentId: editingEquip.id || '',
                    equipmentNo: cleanNo,
                    equipmentName: editingEquip.equipmentName.trim(),
                    reportedDate: new Date().toISOString().split('T')[0],
                    reportedBy: (editingEquip.owner || 'PORNTHAK').trim(),
                    symptom: 'ระบุสถานะชำรุดจากการตั้งค่า',
                    impactLevel: 'Moderate',
                    stage: 'reported'
                },
                history: []
            }),
            ...(editingEquip.setGroup ? { setGroup: editingEquip.setGroup } : {}),
            pm: (() => {
                const rawPM = String(editingEquip.pm?.lastPM ?? '').trim();
                const isNoPM = !rawPM || rawPM === '-' || editingEquip.pm?.freqYear === '-' || editingEquip.pm?.freqYear === 0;
                const cleanPM = isNoPM ? '-' : (normalizeMonth(rawPM) || '-');
                return {
                    freqYear: cleanPM === '-' ? '-' : (Number(editingEquip.pm?.freqYear) || 1),
                    lastPM: cleanPM,
                    nextPM: cleanPM,
                    pmBy: editingEquip.pm?.pmBy || 'Vender',
                    items: editingEquip.pm?.items || 'ตามรายการ Vender',
                    tolerance: editingEquip.pm?.tolerance || 'Pass/Fail',
                    ...(editingEquip.pm?.intervalYears ? { intervalYears: Number(editingEquip.pm.intervalYears) } : {}),
                    ...(editingEquip.pm?.baseYear ? { baseYear: Number(editingEquip.pm.baseYear) } : {})
                };
            })(),
            cal: (() => {
                const rawCal = String(editingEquip.cal?.lastCal ?? '').trim();
                const isNoCal = !rawCal || rawCal === '-' || editingEquip.cal?.freqYear === '-' || editingEquip.cal?.freqYear === 0;
                const cleanCal = isNoCal ? '-' : (normalizeMonth(rawCal) || '-');
                return {
                    freqYear: cleanCal === '-' ? '-' : (Number(editingEquip.cal?.freqYear) || 1),
                    lastCal: cleanCal,
                    nextCal: cleanCal,
                    calBy: editingEquip.cal?.calBy || 'Vender',
                    items: editingEquip.cal?.items || 'ตามรายการ Vender',
                    tolerance: editingEquip.cal?.tolerance || 'Pass/Fail',
                    ...(editingEquip.cal?.intervalYears ? { intervalYears: Number(editingEquip.cal.intervalYears) } : {}),
                    ...(editingEquip.cal?.baseYear ? { baseYear: Number(editingEquip.cal.baseYear) } : {})
                };
            })(),
            pmMonth: (() => {
                const rawPM = String(editingEquip.pm?.lastPM ?? '').trim();
                const isNoPM = !rawPM || rawPM === '-' || editingEquip.pm?.freqYear === '-' || editingEquip.pm?.freqYear === 0;
                return isNoPM ? '-' : (normalizeMonth(rawPM) || '-');
            })(),
            calMonth: (() => {
                const rawCal = String(editingEquip.cal?.lastCal ?? '').trim();
                const isNoCal = !rawCal || rawCal === '-' || editingEquip.cal?.freqYear === '-' || editingEquip.cal?.freqYear === 0;
                return isNoCal ? '-' : (normalizeMonth(rawCal) || '-');
            })(),
            trackingStatus: editingEquip.trackingStatus || {
                quotationRequested: false,
                prIssued: false,
                vendorScheduled: false,
                certReceived: false,
                certDelivered: false,
                result: 'Pending'
            },
            subEquipments: subs
        };

        if (isReady && (newRecord.breakdownStatus as any)?.currentIncident) {
            delete (newRecord.breakdownStatus as any).currentIncident;
        }

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

        const parentEq = equipments.find(item => item.id === editingSub.parentEqId);
        if (!parentEq) return;

        const cleanSubNo = editingSub.sub.equipmentNo.trim();
        const rawSubPM = String(editingSub.sub.pm?.lastPM ?? '').trim();
        const isNoSubPM = !rawSubPM || rawSubPM === '-' || editingSub.sub.pm?.freqYear === '-' || editingSub.sub.pm?.freqYear === 0;
        const cleanSubPM = isNoSubPM ? '-' : (normalizeMonth(rawSubPM) || '-');

        const rawSubCal = String(editingSub.sub.cal?.lastCal ?? '').trim();
        const isNoSubCal = !rawSubCal || rawSubCal === '-' || editingSub.sub.cal?.freqYear === '-' || editingSub.sub.cal?.freqYear === 0;
        const cleanSubCal = isNoSubCal ? '-' : (normalizeMonth(rawSubCal) || '-');

        const newSub: EquipmentSubComponent = {
            id: editingSub.sub.id || `sub_${Date.now()}`,
            equipmentNo: cleanSubNo,
            equipmentName: editingSub.sub.equipmentName.trim(),
            owner: (editingSub.sub.owner || parentEq.owner || 'PORNTHAK').trim(),
            ...(editingSub.sub.setGroup ? { setGroup: editingSub.sub.setGroup } : {}),
            pm: {
                freqYear: cleanSubPM === '-' ? '-' : (Number(editingSub.sub.pm?.freqYear) || 1),
                lastPM: cleanSubPM,
                nextPM: cleanSubPM,
                pmBy: editingSub.sub.pm?.pmBy || 'Vender',
                items: editingSub.sub.pm?.items || '',
                tolerance: editingSub.sub.pm?.tolerance || '',
                ...(editingSub.sub.pm?.intervalYears ? { intervalYears: Number(editingSub.sub.pm.intervalYears) } : {}),
                ...(editingSub.sub.pm?.baseYear ? { baseYear: Number(editingSub.sub.pm.baseYear) } : {})
            },
            cal: {
                freqYear: cleanSubCal === '-' ? '-' : (Number(editingSub.sub.cal?.freqYear) || 1),
                lastCal: cleanSubCal,
                nextCal: cleanSubCal,
                calBy: editingSub.sub.cal?.calBy || 'Vender',
                items: editingSub.sub.cal?.items || '',
                tolerance: editingSub.sub.cal?.tolerance || '',
                ...(editingSub.sub.cal?.intervalYears ? { intervalYears: Number(editingSub.sub.cal.intervalYears) } : {}),
                ...(editingSub.sub.cal?.baseYear ? { baseYear: Number(editingSub.sub.cal.baseYear) } : {})
            },
            trackingStatus: editingSub.sub.trackingStatus || {
                quotationRequested: false,
                prIssued: false,
                vendorScheduled: false,
                certReceived: false,
                certDelivered: false,
                result: 'Pending'
            }
        };

        let updatedSubs = parentEq.subEquipments ? [...parentEq.subEquipments] : [];
        if (editingSub.isNew) {
            updatedSubs.push(newSub);
        } else {
            updatedSubs = updatedSubs.map(s => s.id === newSub.id ? newSub : s);
        }

        await saveEquipment({ ...parentEq, subEquipments: updatedSubs });
        await loadData();
        setIsSubModalOpen(false);
        setEditingSub(null);
        setExpandedEquipIds(prev => new Set([...prev, parentEq.id]));
        onEquipmentUpdated();
    };

    // Quick change PM/Cal month or cancel ('-') with immediate optimistic UI update
    const handleQuickChangePlanMonth = async (
        eqId: string,
        planType: 'pm' | 'cal',
        newMonthValue: string,
        isSub: boolean = false,
        subId?: string
    ): Promise<Equipment | null> => {
        const targetEq = equipments.find(e => e.id === eqId);
        if (!targetEq) return null;

        const cleanMonth = (!newMonthValue || newMonthValue === '-') ? '-' : (normalizeMonth(newMonthValue) || '-');
        const updatedEq: Equipment = { ...targetEq };

        if (isSub && subId && updatedEq.subEquipments) {
            updatedEq.subEquipments = updatedEq.subEquipments.map(s => {
                if (s.id !== subId) return s;
                if (planType === 'pm') {
                    return {
                        ...s,
                        pm: {
                            ...(s.pm || { pmBy: 'Vender', items: '', tolerance: '' }),
                            freqYear: cleanMonth === '-' ? '-' : (Number(s.pm?.freqYear) || 1),
                            lastPM: cleanMonth,
                            nextPM: cleanMonth
                        }
                    };
                } else {
                    return {
                        ...s,
                        cal: {
                            ...(s.cal || { calBy: 'Vender', items: '', tolerance: '' }),
                            freqYear: cleanMonth === '-' ? '-' : (Number(s.cal?.freqYear) || 1),
                            lastCal: cleanMonth,
                            nextCal: cleanMonth
                        }
                    };
                }
            });
        } else {
            if (planType === 'pm') {
                updatedEq.pmMonth = cleanMonth;
                updatedEq.pm = {
                    ...(updatedEq.pm || { pmBy: 'Vender', items: 'ตามรายการ Vender', tolerance: 'Pass/Fail' }),
                    freqYear: cleanMonth === '-' ? '-' : (Number(updatedEq.pm?.freqYear) || 1),
                    lastPM: cleanMonth,
                    nextPM: cleanMonth
                };
            } else {
                updatedEq.calMonth = cleanMonth;
                updatedEq.cal = {
                    ...(updatedEq.cal || { calBy: 'Vender', items: 'ตามรายการ Vender', tolerance: 'Pass/Fail' }),
                    freqYear: cleanMonth === '-' ? '-' : (Number(updatedEq.cal?.freqYear) || 1),
                    lastCal: cleanMonth,
                    nextCal: cleanMonth
                };
            }
        }

        // Optimistic immediate update so UI moves in 0ms without waiting for network
        setEquipments(prev => prev.map(item => item.id === updatedEq.id ? updatedEq : item));

        if (inspectionTarget && inspectionTarget.equipment.id === eqId) {
            const refreshedSub = isSub && subId
                ? updatedEq.subEquipments?.find(s => s.id === subId)
                : undefined;
            setInspectionTarget({
                ...inspectionTarget,
                equipment: updatedEq,
                subComponent: refreshedSub,
                highlightMonth: cleanMonth === '-' ? undefined : cleanMonth
            });
        }

        await saveEquipment(updatedEq);
        onEquipmentUpdated();
        return updatedEq;
    };

    // Open Batch Group Move Modal for an equipment (pre-filled with target month)
    const openBatchMoveForEquipment = (
        eq: Equipment,
        defaultMonth?: string,
        defaultPlanType: 'pm' | 'cal' | 'both' = 'both'
    ) => {
        const resolvedMonth = defaultMonth === '-'
            ? '-'
            : (normalizeMonth(defaultMonth || eq.cal?.lastCal || eq.pm?.lastPM || (eq.subEquipments?.[0]?.cal?.lastCal) || 'Jan') || 'Jan');
        const allSubIds = new Set((eq.subEquipments || []).map(s => s.id));
        setBatchMoveModal({
            equipment: eq,
            toMonth: resolvedMonth,
            planType: defaultPlanType,
            scope: (eq.subEquipments?.length || 0) > 0 ? 'all' : 'primary_only',
            selectedSubIds: allSubIds,
            includePrimaryInCustom: true
        });
    };

    // Move all sub-equipments of a primary equipment to match the primary's newly moved month in 1 click
    const handleMoveAllSubsToMonth = async (eq: Equipment, targetMonth: string, planType: 'pm' | 'cal' | 'both') => {
        const cleanMonth = (!targetMonth || targetMonth === '-') ? '-' : (normalizeMonth(targetMonth) || '-');
        const currentEq = equipments.find(e => e.id === eq.id) || eq;
        if (!currentEq.subEquipments || currentEq.subEquipments.length === 0) return;

        const updatedSubs = currentEq.subEquipments.map(sub => {
            const nextSub = { ...sub };
            const subHadPM = getMonthsForPlan(sub.pm).size > 0;
            if (planType === 'pm' || (planType === 'both' && subHadPM)) {
                nextSub.pm = {
                    ...(sub.pm || { pmBy: 'Vender', items: '', tolerance: '' }),
                    freqYear: cleanMonth === '-' ? '-' : (Number(sub.pm?.freqYear) || 1),
                    lastPM: cleanMonth,
                    nextPM: cleanMonth
                };
            }
            if (planType === 'cal' || planType === 'both') {
                nextSub.cal = {
                    ...(sub.cal || { calBy: 'Vender', items: '', tolerance: '' }),
                    freqYear: cleanMonth === '-' ? '-' : (Number(sub.cal?.freqYear) || 1),
                    lastCal: cleanMonth,
                    nextCal: cleanMonth
                };
            }
            return nextSub;
        });

        const updatedEq: Equipment = { ...currentEq, subEquipments: updatedSubs };
        setEquipments(prev => prev.map(item => item.id === updatedEq.id ? updatedEq : item));
        setRecentPrimaryMoveOffer(null);

        await saveEquipment(updatedEq);
        onEquipmentUpdated();

        const destLabel = cleanMonth === '-' ? 'ยกเลิกแผน (-)' : `เดือน ${formatMonthName(cleanMonth, 'short')}`;
        setResolveToast(`ย้ายเครื่องพ่วงย่อยทั้งหมด (${updatedSubs.length} รายการ) ของ "${currentEq.equipmentNo}" ตามไปที่ ${destLabel} สำเร็จ`);
        setTimeout(() => setResolveToast(null), 4000);
    };

    // Handle dropping a dragged PM / Cal / Group badge onto a Month Column (mKey or '-')
    const handleCalendarCellDrop = async (targetMonth: string) => {
        const payload = dragPayload;
        setDragPayload(null);
        setDragOverCell(null);
        if (!payload) return;

        const sourceEq = equipments.find(e => e.id === payload.eqId);
        if (!sourceEq) return;

        const cleanTarget = (!targetMonth || targetMonth === '-') ? '-' : (normalizeMonth(targetMonth) || '-');
        if (cleanTarget === payload.fromMonth && !payload.isGroupBadge) return;

        // Case 1: User dragged the "+N พ่วง" group badge -> open Batch Move Modal pre-set to cleanTarget
        if (payload.isGroupBadge) {
            openBatchMoveForEquipment(sourceEq, cleanTarget, 'both');
            return;
        }

        // Case 2: User dragged a specific Sub-Equipment's PM or Cal badge -> move that sub-equipment immediately!
        if (payload.subId) {
            const pType = payload.planType === 'pm' ? 'pm' : 'cal';
            await handleQuickChangePlanMonth(sourceEq.id, pType, cleanTarget, true, payload.subId);
            const mLabel = cleanTarget === '-' ? 'ยกเลิกแผน (-)' : formatMonthName(cleanTarget, 'short');
            setResolveToast(`✅ ย้ายแผน ${pType.toUpperCase()} ของเครื่องพ่วง "${payload.equipmentNo}" ไปที่ ${mLabel} เรียบร้อยแล้ว`);
            setTimeout(() => setResolveToast(null), 4000);
            return;
        }

        // Case 3: User dragged a Primary Equipment's PM or Cal badge -> move the Primary Equipment IMMEDIATELY!
        // And if it has sub-equipments, show a 1-click banner asking if they want to move sub-equipments too.
        const pType = payload.planType === 'pm' ? 'pm' : 'cal';
        const updatedPrimary = await handleQuickChangePlanMonth(sourceEq.id, pType, cleanTarget, false);
        const mLabel = cleanTarget === '-' ? 'ยกเลิกแผน (-)' : formatMonthName(cleanTarget, 'short');

        if (updatedPrimary && (updatedPrimary.subEquipments?.length || 0) > 0) {
            setRecentPrimaryMoveOffer({
                equipment: updatedPrimary,
                toMonth: cleanTarget,
                planType: pType
            });
        } else {
            setResolveToast(`✅ ย้ายแผน ${pType.toUpperCase()} ของ "${sourceEq.equipmentNo}" ไปที่ ${mLabel} เรียบร้อยแล้ว`);
            setTimeout(() => setResolveToast(null), 4000);
        }
    };

    // Execute Click-to-Move (Quick Move) when user clicks a badge and then clicks a destination month
    const handleExecuteQuickMove = async (targetMonth: string) => {
        if (!quickMoveSource) return;
        const src = quickMoveSource;
        setQuickMoveSource(null);

        const sourceEq = equipments.find(e => e.id === src.eqId);
        if (!sourceEq) return;

        const cleanTarget = (!targetMonth || targetMonth === '-') ? '-' : (normalizeMonth(targetMonth) || '-');
        const mLabel = cleanTarget === '-' ? 'ยกเลิกแผน (-)' : formatMonthName(cleanTarget, 'short');

        if (src.subId) {
            const pType = src.planType === 'pm' ? 'pm' : 'cal';
            await handleQuickChangePlanMonth(sourceEq.id, pType, cleanTarget, true, src.subId);
            setResolveToast(`✅ ย้ายแผน ${pType.toUpperCase()} ของ "${src.equipmentNo}" ไปที่ ${mLabel} สำเร็จ`);
            setTimeout(() => setResolveToast(null), 4000);
            return;
        }

        const pType = src.planType === 'pm' ? 'pm' : 'cal';
        const updatedPrimary = await handleQuickChangePlanMonth(sourceEq.id, pType, cleanTarget, false);

        if (updatedPrimary && (updatedPrimary.subEquipments?.length || 0) > 0) {
            if (src.includeSubs) {
                await handleMoveAllSubsToMonth(updatedPrimary, cleanTarget, pType);
            } else {
                setRecentPrimaryMoveOffer({
                    equipment: updatedPrimary,
                    toMonth: cleanTarget,
                    planType: pType
                });
            }
        } else {
            setResolveToast(`✅ ย้ายแผน ${pType.toUpperCase()} ของ "${sourceEq.equipmentNo}" ไปที่ ${mLabel} สำเร็จ`);
            setTimeout(() => setResolveToast(null), 4000);
        }
    };

    // Execute Batch Move across Primary + Selected Sub-Equipments (or Set A / Set B)
    const handleExecuteBatchMove = async () => {
        if (!batchMoveModal) return;
        const { equipment, toMonth, planType, scope, selectedSubIds, includePrimaryInCustom } = batchMoveModal;
        const cleanMonth = (!toMonth || toMonth === '-') ? '-' : (normalizeMonth(toMonth) || '-');

        const shouldMovePrimary =
            scope === 'all' ||
            scope === 'primary_only' ||
            (scope === 'custom' && includePrimaryInCustom);

        const shouldMoveSub = (sub: EquipmentSubComponent): boolean => {
            if (scope === 'primary_only') return false;
            if (scope === 'all' || scope === 'subs_all') return true;
            const setG = inferEquipmentSetGroup(sub.equipmentName, sub.setGroup);
            if (scope === 'set_a') return setG === 'A';
            if (scope === 'set_b') return setG === 'B';
            if (scope === 'custom') return selectedSubIds.has(sub.id);
            return false;
        };

        const currentEq = equipments.find(e => e.id === equipment.id) || equipment;
        const updatedEq: Equipment = { ...currentEq };
        let movedCount = 0;

        if (shouldMovePrimary) {
            movedCount++;
            if (planType === 'pm' || planType === 'both') {
                updatedEq.pmMonth = cleanMonth;
                updatedEq.pm = {
                    ...(updatedEq.pm || { pmBy: 'Vender', items: 'ตามรายการ Vender', tolerance: 'Pass/Fail' }),
                    freqYear: cleanMonth === '-' ? '-' : (Number(updatedEq.pm?.freqYear) || 1),
                    lastPM: cleanMonth,
                    nextPM: cleanMonth
                };
            }
            if (planType === 'cal' || planType === 'both') {
                updatedEq.calMonth = cleanMonth;
                updatedEq.cal = {
                    ...(updatedEq.cal || { calBy: 'Vender', items: 'ตามรายการ Vender', tolerance: 'Pass/Fail' }),
                    freqYear: cleanMonth === '-' ? '-' : (Number(updatedEq.cal?.freqYear) || 1),
                    lastCal: cleanMonth,
                    nextCal: cleanMonth
                };
            }
        }

        if (updatedEq.subEquipments && updatedEq.subEquipments.length > 0) {
            updatedEq.subEquipments = updatedEq.subEquipments.map(sub => {
                if (!shouldMoveSub(sub)) return sub;
                movedCount++;
                const nextSub = { ...sub };
                const subHadPM = getMonthsForPlan(sub.pm).size > 0;
                if (planType === 'pm' || (planType === 'both' && subHadPM)) {
                    nextSub.pm = {
                        ...(sub.pm || { pmBy: 'Vender', items: '', tolerance: '' }),
                        freqYear: cleanMonth === '-' ? '-' : (Number(sub.pm?.freqYear) || 1),
                        lastPM: cleanMonth,
                        nextPM: cleanMonth
                    };
                }
                if (planType === 'cal' || planType === 'both') {
                    nextSub.cal = {
                        ...(sub.cal || { calBy: 'Vender', items: '', tolerance: '' }),
                        freqYear: cleanMonth === '-' ? '-' : (Number(sub.cal?.freqYear) || 1),
                        lastCal: cleanMonth,
                        nextCal: cleanMonth
                    };
                }
                return nextSub;
            });
        }

        // Optimistic immediate UI update
        setEquipments(prev => prev.map(item => item.id === updatedEq.id ? updatedEq : item));
        setBatchMoveModal(null);
        setRecentPrimaryMoveOffer(null);

        await saveEquipment(updatedEq);
        onEquipmentUpdated();

        const destLabel = cleanMonth === '-' ? 'ยกเลิกแผน (-)' : `เดือน ${formatMonthName(cleanMonth, 'short')}`;
        setResolveToast(`✅ ย้ายแผนของชุดเครื่องมือ "${equipment.equipmentNo}" จำนวน ${movedCount} รายการ ไปยัง ${destLabel} สำเร็จ`);
        setTimeout(() => setResolveToast(null), 4000);
    };

    // Open Multi-Year & Set A/B Rotation Manager Modal
    const openRotationManager = (targetEq?: Equipment) => {
        if (targetEq) {
            setSelectedRotationEqId(targetEq.id);
        } else if (!selectedRotationEqId) {
            const sieveOrDensity = equipments.find(e =>
                e.equipmentNo === 'PDS-1009' || e.equipmentNo === 'PDS-1007' || (e.subEquipments?.length || 0) > 1
            ) || equipments[0];
            if (sieveOrDensity) setSelectedRotationEqId(sieveOrDensity.id);
        }
        setIsRotationModalOpen(true);
    };

    // Apply a 1-click Multi-Year / Set A-B Rotation Preset to the selected equipment
    const handleApplyRotationPreset = async (
        eq: Equipment,
        preset: 'every_year' | 'ab_2yr_b2026_a2027' | 'ab_2yr_a2026_b2027' | 'all_2yr_2026' | 'all_2yr_2027' | 'all_3yr_2026'
    ) => {
        const updatedEq: Equipment = { ...eq };

        const applyRule = (cal: CalDetails | undefined, intervalYears: number, baseYear: number): CalDetails => ({
            ...(cal || { calBy: 'Vender', items: 'ตามรายการ Vender', tolerance: 'Pass/Fail', lastCal: 'Jan', nextCal: 'Jan', freqYear: 1 }),
            intervalYears,
            baseYear
        });

        if (preset === 'every_year') {
            if (updatedEq.cal) updatedEq.cal = applyRule(updatedEq.cal, 1, 2026);
            if (updatedEq.subEquipments) {
                updatedEq.subEquipments = updatedEq.subEquipments.map(s => ({
                    ...s,
                    cal: s.cal ? applyRule(s.cal, 1, 2026) : s.cal
                }));
            }
        } else if (preset === 'ab_2yr_b2026_a2027' || preset === 'ab_2yr_a2026_b2027') {
            const yearForA = preset === 'ab_2yr_a2026_b2027' ? 2026 : 2027;
            const yearForB = preset === 'ab_2yr_a2026_b2027' ? 2027 : 2026;
            if (updatedEq.subEquipments) {
                updatedEq.subEquipments = updatedEq.subEquipments.map((s, idx) => {
                    const detected = inferEquipmentSetGroup(s.equipmentName, s.setGroup);
                    const group = detected || (idx < Math.ceil((updatedEq.subEquipments?.length || 1) / 2) ? 'A' : 'B');
                    const targetYear = group === 'A' ? yearForA : yearForB;
                    return {
                        ...s,
                        setGroup: group,
                        cal: applyRule(s.cal, 2, targetYear)
                    };
                });
            } else {
                const group = inferEquipmentSetGroup(updatedEq.equipmentName, updatedEq.setGroup) || 'A';
                updatedEq.setGroup = group;
                updatedEq.cal = applyRule(updatedEq.cal, 2, group === 'A' ? yearForA : yearForB);
            }
        } else {
            const interval = preset === 'all_3yr_2026' ? 3 : 2;
            const baseYear = preset === 'all_2yr_2027' ? 2027 : 2026;
            if (updatedEq.cal && getMonthsForPlan(updatedEq.cal).size > 0) {
                updatedEq.cal = applyRule(updatedEq.cal, interval, baseYear);
            }
            if (updatedEq.subEquipments) {
                updatedEq.subEquipments = updatedEq.subEquipments.map(s => ({
                    ...s,
                    cal: applyRule(s.cal, interval, baseYear)
                }));
            }
        }

        await saveEquipment(updatedEq);
        await loadData();
        onEquipmentUpdated();
        setResolveToast(`บันทึกตั้งค่ารอบปีและชุดสลับ A/B ของ "${eq.equipmentNo} - ${eq.equipmentName}" เรียบร้อยแล้ว`);
        setTimeout(() => setResolveToast(null), 4000);
    };

    // Update individual item's Set (A/B/None), Interval Years (1/2/3), or Base Year (2025..2028)
    const handleUpdateSingleItemCycle = async (
        eq: Equipment,
        isSub: boolean,
        subId: string | undefined,
        updates: { setGroup?: string; intervalYears?: number; baseYear?: number }
    ) => {
        const updatedEq: Equipment = { ...eq };
        if (!isSub) {
            if (updates.setGroup !== undefined) updatedEq.setGroup = updates.setGroup;
            updatedEq.cal = {
                ...(updatedEq.cal || { calBy: 'Vender', items: '', tolerance: 'Pass/Fail', lastCal: 'Jan', nextCal: 'Jan', freqYear: 1 }),
                ...(updates.intervalYears !== undefined ? { intervalYears: updates.intervalYears } : {}),
                ...(updates.baseYear !== undefined ? { baseYear: updates.baseYear } : {})
            };
        } else if (subId && updatedEq.subEquipments) {
            updatedEq.subEquipments = updatedEq.subEquipments.map(s => {
                if (s.id !== subId) return s;
                return {
                    ...s,
                    ...(updates.setGroup !== undefined ? { setGroup: updates.setGroup } : {}),
                    cal: {
                        ...(s.cal || { calBy: 'Vender', items: '', tolerance: 'Pass/Fail', lastCal: 'Jan', nextCal: 'Jan', freqYear: 1 }),
                        ...(updates.intervalYears !== undefined ? { intervalYears: updates.intervalYears } : {}),
                        ...(updates.baseYear !== undefined ? { baseYear: updates.baseYear } : {})
                    }
                };
            });
        }
        await saveEquipment(updatedEq);
        await loadData();
        onEquipmentUpdated();
    };

    // Toggle expand/collapse sub-equipments
    const toggleExpandSubs = (eqId: string) => {
        setExpandedEquipIds(prev => {
            const next = new Set(prev);
            if (next.has(eqId)) next.delete(eqId);
            else next.add(eqId);
            return next;
        });
    };

    // Toggle expand/collapse inline details drawer
    const toggleExpandDetail = (eqId: string) => {
        setExpandedDetailIds(prev => {
            const next = new Set(prev);
            if (next.has(eqId)) next.delete(eqId);
            else next.add(eqId);
            return next;
        });
    };

    const getStepProgress = (st: TrackingWorkflowStatus) => {
        let count = 0;
        if (st?.quotationRequested) count++;
        if (st?.prIssued) count++;
        if (st?.vendorScheduled) count++;
        if (st?.certReceived) count++;
        if (st?.certDelivered) count++;
        if (st?.result === 'Pass') count++;
        return { completed: count, percent: Math.round((count / 6) * 100) };
    };

    return (
        <div className="space-y-4 animate-fade-in w-full text-slate-800 dark:text-slate-100">
            {/* TOP CONTROL COCKPIT */}
            <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-slate-200 dark:border-base-800 shadow-2xs space-y-3.5">
                {/* Row 1: Title, counts, guide button, and primary action buttons */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                            <span>📋 ทะเบียนเครื่องมือ & แผนแม่บท</span>
                            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                                (Calendar Register)
                            </span>
                        </h2>
                        <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            รวม {filteredEquipments.length + filteredEquipments.reduce((sum, e) => sum + (e.subEquipments?.length || 0), 0)} เครื่อง ({filteredEquipments.length} เครื่องหลัก + {filteredEquipments.reduce((sum, e) => sum + (e.subEquipments?.length || 0), 0)} เครื่องพ่วงย่อย)
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowGuide(!showGuide)}
                            className="text-xs font-bold text-slate-600 hover:text-indigo-600 dark:text-slate-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-base-800 transition-colors cursor-pointer border border-slate-200 dark:border-base-700"
                        >
                            <span>💡 วิธีลากย้ายเดือน & สลับชุด A/B</span>
                            <span className="text-[10px]">{showGuide ? '▲' : '▼'}</span>
                        </button>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => {
                                setIsQuickMoveMode(prev => !prev);
                                if (isQuickMoveMode) setQuickMoveSource(null);
                            }}
                            className={`px-3 py-1.5 font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border ${
                                isQuickMoveMode || quickMoveSource
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/25 ring-2 ring-amber-300'
                                    : 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                            }`}
                            title="โหมดจิ้มย้ายเดือนด่วน (ไม่ต้องลากเมาส์): คลิกที่ป้าย PM หรือ Cal แล้วคลิกเลือกเดือนปลายทางได้ทันที 100% แม่นยำ"
                        >
                            <span>⚡ {isQuickMoveMode || quickMoveSource ? 'โหมดจิ้มย้ายเดือน: เปิดอยู่ (คลิกป้าย PM/Cal ได้เลย)' : 'โหมดจิ้มย้ายเดือนด่วน (ไม่ต้องลาก)'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => openRotationManager()}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-purple-500/20 cursor-pointer"
                            title="ตั้งค่าเครื่องมือที่ผลัดกันใช้งาน ชุด A / ชุด B หรือรอบ Cal ทุก 2-3 ปี"
                        >
                            <span>🔄 ตั้งค่าสลับชุด A/B & รอบหลายปี</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleResetMaster}
                            disabled={isReconciling}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer disabled:opacity-50"
                            title="ดึงข้อมูล Master Plan จากไฟล์แนบเข้ามา 100%"
                        >
                            <SparklesIcon className={`h-3.5 w-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                            <span>⚡ ซิงค์ Master 100%</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleAutoAlignStandards}
                            disabled={isReconciling}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-amber-300 dark:border-amber-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            title="จัดระเบียบรหัสเครื่องมือและผู้รับผิดชอบ"
                        >
                            <RefreshIcon className={`h-3.5 w-3.5 text-amber-700 ${isReconciling ? 'animate-spin' : ''}`} />
                            <span>🔄 จัดรหัส</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (equipments.length > 0) {
                                    const defaultEq = equipments.find(e => !e.equipmentNo?.includes('/') && (e.status === 'issue' || e.breakdownStatus?.isBroken)) 
                                        || equipments.find(e => !e.equipmentNo?.includes('/')) 
                                        || equipments[0];
                                    setSelectedEquipmentForHistory(defaultEq);
                                }
                            }}
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800 transition-all active:scale-95 cursor-pointer"
                        >
                            <ClockIcon className="h-3.5 w-3.5" />
                            <span>📜 สมุดประวัติ</span>
                        </button>

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
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                            <PlusIcon className="h-3.5 w-3.5" />
                            <span>+ เพิ่มเครื่องหลักใหม่</span>
                        </button>
                    </div>
                </div>

                {/* Guide popup */}
                {showGuide && (
                    <div className="bg-slate-50 dark:bg-base-950 p-3.5 rounded-xl border border-slate-200 dark:border-base-800 text-xs animate-fade-in space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                            <span>📌 คู่มือการย้ายเดือนแบบแม่นยำ 100% (ทั้งแบบจิ้มย้าย 2 คลิก & ลากวางล็อกคอลัมน์) และการจัดการชุดสลับ A/B:</span>
                            <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">ปิด ✕</button>
                        </div>
                        <ul className="text-slate-600 dark:text-slate-300 space-y-1 font-medium text-xs">
                            <li>• <strong>⚡ วิธีที่ 1: โหมดจิ้มย้ายเดือนด่วน (เสถียรและแม่นยำ 100% ไม่ต้องลากเมาส์):</strong> คลิกที่ปุ่ม <code>⇄</code> บนกล่อง <code>🛠️ PM</code> หรือ <code>🎯 Cal</code> (หรือเปิดปุ่ม <strong>โหมดจิ้มย้ายเดือนด่วน</strong> ด้านบน) จากนั้นคลิกเลือกเดือนปลายทาง <code>[👉 ย้ายมา ...]</code> ในแถวเดียวกัน หรือจากแถบเลือกเดือนด้านบนได้ทันที!</li>
                            <li>• <strong>✋ วิธีที่ 2: ลากวางแบบล็อกคอลัมน์อัตโนมัติ (Column-Locked Drag & Drop):</strong> ลากกล่อง <code>🛠️ PM</code> หรือ <code>🎯 Cal</code> ไปปล่อยที่คอลัมน์เดือนไหนก็ได้ (แม้เมาส์ขยับขึ้นลงข้ามแถว ระบบจะล็อกเครื่องมือต้นทางให้อัตโนมัติและย้ายเข้าเดือนที่ปล่อยเมาส์ทันทีโดยไม่เพี้ยนตำแหน่ง)</li>
                            <li>• <strong>⇄ ย้ายยกชุด / เลือกเฉพาะชุด A หรือ B:</strong> ลากป้าย <code>+N พ่วง</code> หรือกดปุ่ม <code>⇄ ย้ายยกชุด</code> เพื่อเลือกย้ายพร้อมกันทั้งเครื่องหลัก+พ่วง, เฉพาะชุด A หรือเฉพาะชุด B</li>
                        </ul>
                    </div>
                )}

                {/* Resolve Toast */}
                {resolveToast && (
                    <div className="p-2.5 bg-emerald-600 text-white rounded-xl flex items-center justify-between gap-2 shadow-sm animate-fade-in text-xs font-bold">
                        <div className="flex items-center gap-2">
                            <CheckCircleIcon className="h-4 w-4 shrink-0" />
                            <span>{resolveToast}</span>
                        </div>
                        <button onClick={() => setResolveToast(null)} className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 rounded-md text-[10px]">✕</button>
                    </div>
                )}

                {/* 1-CLICK FOLLOW-UP BANNER AFTER MOVING PRIMARY MACHINE WITH SUB-EQUIPMENTS */}
                {recentPrimaryMoveOffer && (
                    <div className="p-3 bg-indigo-950 text-white rounded-xl border border-indigo-400 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-fade-in text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-emerald-500 text-white font-black rounded text-[11px]">✓ ย้ายเครื่องหลักสำเร็จ</span>
                            <span>
                                ย้าย <strong>{recentPrimaryMoveOffer.equipment.equipmentNo}</strong> ไปที่เดือน{' '}
                                <strong className="text-amber-300 underline">
                                    {recentPrimaryMoveOffer.toMonth === '-' ? 'ยกเลิกแผน (-)' : formatMonthName(recentPrimaryMoveOffer.toMonth, 'short')}
                                </strong>{' '}
                                แล้ว — เครื่องนี้มีเครื่องพ่วงย่อย <strong>{recentPrimaryMoveOffer.equipment.subEquipments?.length || 0} รายการ</strong> ต้องการย้ายตามไปด้วยไหม?
                            </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <button
                                type="button"
                                onClick={() => handleMoveAllSubsToMonth(
                                    recentPrimaryMoveOffer.equipment,
                                    recentPrimaryMoveOffer.toMonth,
                                    recentPrimaryMoveOffer.planType
                                )}
                                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs cursor-pointer transition-all shadow-sm"
                            >
                                ⚡ ย้ายเครื่องพ่วงทั้งหมด ({recentPrimaryMoveOffer.equipment.subEquipments?.length}) ตามไปเดือน {recentPrimaryMoveOffer.toMonth === '-' ? '-' : formatMonthName(recentPrimaryMoveOffer.toMonth, 'short')} ทันที
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const eq = recentPrimaryMoveOffer.equipment;
                                    const tm = recentPrimaryMoveOffer.toMonth;
                                    const pt = recentPrimaryMoveOffer.planType;
                                    setRecentPrimaryMoveOffer(null);
                                    openBatchMoveForEquipment(eq, tm, pt);
                                }}
                                className="px-2.5 py-1.5 bg-indigo-800 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs border border-indigo-500 cursor-pointer"
                            >
                                ⇄ เลือกเฉพาะชุด A / B
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecentPrimaryMoveOffer(null)}
                                className="px-2 py-1 text-indigo-300 hover:text-white font-bold text-xs cursor-pointer"
                            >
                                ปิด ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* PLANNING YEAR SWITCHER & ENTERPRISE SET A/B BAR */}
                <div className="p-2.5 bg-slate-50/90 dark:bg-base-950/80 rounded-xl border border-slate-200/80 dark:border-base-800 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <span>🗓️ ปีแผนงานสอบเทียบ (Planning Year):</span>
                        </span>
                        <div className="inline-flex items-center bg-white dark:bg-base-900 p-0.5 rounded-xl border border-slate-200 dark:border-base-700 shadow-2xs">
                            {[2025, 2026, 2027, 2028].map(yr => {
                                const isActive = planningYear === yr;
                                return (
                                    <button
                                        key={yr}
                                        type="button"
                                        onClick={() => setPlanningYear(yr)}
                                        className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                                            isActive
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-base-800'
                                        }`}
                                    >
                                        <span>ปี {yr}</span>
                                        {yr === 2026 && (
                                            <span className={`text-[9px] px-1 rounded ${isActive ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'}`}>
                                                ปัจจุบัน
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            (คลิกสลับปีเพื่อตรวจสอบตารางผลัดกันส่ง Cal ระหว่าง <strong className="text-indigo-600 dark:text-indigo-400">ชุด A</strong> และ <strong className="text-purple-600 dark:text-purple-400">ชุด B</strong>)
                        </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-500">มุมมองชุดสลับ:</span>
                        <select
                            value={filterSetCycle}
                            onChange={e => setFilterSetCycle(e.target.value as any)}
                            className="px-2.5 py-1 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-lg text-xs font-extrabold text-slate-800 dark:text-white outline-none cursor-pointer"
                        >
                            <option value="all">📋 แสดงทุกชุด (ทั้งที่ส่งปี {planningYear} & ชุดเว้นรอบ)</option>
                            <option value="due_this_year">🟢 เฉพาะที่ถึงรอบส่ง Cal ในปี {planningYear}</option>
                            <option value="standby_this_year">⏸️ เฉพาะชุดเว้นรอบในปี {planningYear} (ชุดใช้งานสลับ)</option>
                            <option value="set_a">🅰️ เฉพาะเครื่องมือ ชุด A (Set A)</option>
                            <option value="set_b">🅱️ เฉพาะเครื่องมือ ชุด B (Set B)</option>
                        </select>
                    </div>
                </div>

                {/* MONTHLY SUMMARY STRIP (12 MONTHS CARDS) */}
                <div className="pt-2 border-t border-slate-100 dark:border-base-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                        <span className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <span>📅 ภาพรวมแผนประจำปี {planningYear} (12 เดือน)</span>
                            <span className="text-[11px] font-normal text-slate-400">(คลิกที่เดือนเพื่อกรอง · ลากวางข้ามเดือน · หรือกด ⇄ บนป้าย PM/Cal เพื่อจิ้มย้ายเดือนทันที)</span>
                        </span>
                        {filterMonth !== 'all' && (
                            <button 
                                onClick={() => setFilterMonth('all')}
                                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                            >
                                ✕ ล้างการกรองเดือน ({MONTH_INFO_MAP[filterMonth]?.thShort || filterMonth})
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                        {MONTH_KEYS.map((mKey) => {
                            const info = MONTH_INFO_MAP[mKey];
                            const stat = monthlyStats[mKey];
                            const isSelected = filterMonth === mKey;
                            const isCurrent = currentMonthKey === mKey;
                            const hasEvents = stat.pm > 0 || stat.cal > 0 || stat.offCycle > 0;

                            return (
                                <button
                                    key={mKey}
                                    type="button"
                                    onClick={() => setFilterMonth(isSelected ? 'all' : mKey)}
                                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                        isSelected 
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : isCurrent
                                                ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-slate-900 dark:text-white ring-1 ring-indigo-400'
                                                : hasEvents
                                                    ? 'bg-slate-50 dark:bg-base-950 border-slate-200 dark:border-base-800 hover:border-indigo-300'
                                                    : 'bg-white dark:bg-base-900 border-slate-100 dark:border-base-850 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[11px] font-extrabold ${isSelected ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                                            {info.thShort}
                                        </span>
                                        {isCurrent && !isSelected && (
                                            <span className="text-[8px] font-bold text-indigo-600 dark:text-indigo-400">📍</span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-col text-[10px] leading-tight">
                                        {stat.pm > 0 && (
                                            <span className={isSelected ? 'text-indigo-100 font-bold' : 'text-indigo-600 dark:text-indigo-400 font-extrabold'}>
                                                🛠️ {stat.pm}
                                            </span>
                                        )}
                                        {stat.cal > 0 && (
                                            <span className={isSelected ? 'text-emerald-100 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-extrabold'}>
                                                🎯 {stat.cal}
                                            </span>
                                        )}
                                        {stat.offCycle > 0 && (
                                            <span className={isSelected ? 'text-amber-100 font-bold text-[9px]' : 'text-amber-600 dark:text-amber-400 font-bold text-[9px]'} title={`เว้นรอบสอบเทียบในปี ${planningYear} จำนวน ${stat.offCycle} รายการ`}>
                                                ⏸️ เว้น {stat.offCycle}
                                            </span>
                                        )}
                                        {!hasEvents && (
                                            <span className="text-[9px] text-slate-400 italic">ว่าง</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* SEARCH & FILTER CONTROLS */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 pt-2 border-t border-slate-100 dark:border-base-800">
                    <div className="md:col-span-5 relative">
                        <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัสเครื่องมือ (เช่น PDS-1009, Sieve, Float A/B), ชื่อเครื่อง, ผู้รับผิดชอบ..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-base-950 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white outline-none"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <select
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-base-950 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none"
                        >
                            <option value="all">แผนทั้งหมด (PM & Cal)</option>
                            <option value="pm">เฉพาะที่มีแผน PM</option>
                            <option value="cal">เฉพาะที่มีแผน Cal</option>
                            <option value="both">มีทั้ง PM และ Cal</option>
                        </select>
                    </div>

                    <div className="md:col-span-2">
                        <select
                            value={filterOwner}
                            onChange={e => setFilterOwner(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-base-950 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none"
                        >
                            <option value="all">ผู้ดูแล (ทุกคน)</option>
                            {availableOwners.map(owner => (
                                <option key={owner} value={owner}>{owner}</option>
                            ))}
                        </select>
                    </div>

                    <div className="md:col-span-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (expandedEquipIds.size > 0) setExpandedEquipIds(new Set());
                                else setExpandedEquipIds(new Set(filteredEquipments.map(e => e.id)));
                            }}
                            className="w-full px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                        >
                            {expandedEquipIds.size > 0 ? '▲ ย่อเครื่องพ่วงทั้งหมด' : '▼ ขยายเครื่องพ่วงทั้งหมด'}
                        </button>
                    </div>
                </div>
            </div>

            {/* STICKY QUICK-MOVE BAR (CLICK-TO-MOVE WITHOUT DRAGGING - 100% STABLE) */}
            {quickMoveSource && (
                <div className="sticky top-2 z-40 bg-amber-950/95 text-white p-3.5 rounded-2xl border-2 border-amber-400 shadow-2xl space-y-2.5 animate-fade-in">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black rounded-md">
                                ⚡ โหมดจิ้มย้ายเดือนทันใจ
                            </span>
                            <span>กำลังเลือกย้ายแผน</span>
                            <span className="px-2 py-0.5 bg-amber-800 text-amber-100 font-black rounded">
                                {quickMoveSource.planType === 'pm' ? '🛠️ PM' : quickMoveSource.planType === 'cal' ? '🎯 Cal' : '🛠️ PM + 🎯 Cal'}
                            </span>
                            <span>ของ</span>
                            <span className="font-mono font-black bg-white/15 px-2 py-0.5 rounded text-amber-200">
                                {quickMoveSource.equipmentNo}
                            </span>
                            <span className="font-bold text-slate-200">({quickMoveSource.equipmentName})</span>
                            <span className="text-amber-300">
                                จากเดือน <strong>{formatMonthName(quickMoveSource.fromMonth, 'short')}</strong> 👉 คลิกเลือกเดือนปลายทางด้านล่าง หรือคลิกในช่องเดือนของแถวได้ทันที:
                            </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            {quickMoveSource.hasSubEquipments && !quickMoveSource.subId && (
                                <label className="flex items-center gap-1.5 text-xs font-extrabold text-amber-200 cursor-pointer bg-amber-900/80 px-2.5 py-1 rounded-lg border border-amber-500/60">
                                    <input
                                        type="checkbox"
                                        checked={quickMoveSource.includeSubs}
                                        onChange={e => setQuickMoveSource(prev => prev ? { ...prev, includeSubs: e.target.checked } : null)}
                                        className="rounded accent-amber-400"
                                    />
                                    <span>ย้ายเครื่องพ่วงย่อยทั้งหมดตามไปด้วย</span>
                                </label>
                            )}
                            <button
                                type="button"
                                onClick={() => setQuickMoveSource(null)}
                                className="px-2.5 py-1 bg-amber-900 hover:bg-amber-800 text-amber-200 rounded-lg text-xs font-bold cursor-pointer"
                            >
                                ยกเลิก ✕
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-7 md:grid-cols-13 gap-1.5">
                        {MONTH_KEYS.map(mKey => {
                            const isFrom = quickMoveSource.fromMonth === mKey;
                            return (
                                <button
                                    key={mKey}
                                    type="button"
                                    onClick={() => handleExecuteQuickMove(mKey)}
                                    className={`py-1.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                                        isFrom
                                            ? 'bg-amber-900/50 text-amber-300 border-amber-700 opacity-60'
                                            : 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-white shadow-sm hover:scale-105'
                                    }`}
                                >
                                    <div>{MONTH_INFO_MAP[mKey].thShort}</div>
                                    <div className="text-[9px] font-mono opacity-75">{mKey}</div>
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => handleExecuteQuickMove('-')}
                            className="py-1.5 px-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white border border-rose-300 transition-all cursor-pointer shadow-sm"
                            title="ยกเลิกแผน PM/Cal (-)"
                        >
                            <div>🗑️ ยกเลิก</div>
                            <div className="text-[9px] opacity-80">(- ไม่มี -)</div>
                        </button>
                    </div>
                </div>
            )}

            {/* DRAG-AND-DROP ACTIVE HELPER BAR & CANCEL DROP ZONE */}
            {dragPayload && (
                <div className="sticky top-2 z-40 bg-indigo-950/95 text-white p-3 rounded-2xl border-2 border-indigo-400 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-2.5 text-xs">
                        <span className="text-lg">✋</span>
                        <div>
                            <span className="font-black text-indigo-200">
                                กำลังลากย้ายแผน {dragPayload.planType === 'pm' ? '🛠️ PM' : dragPayload.planType === 'cal' ? '🎯 Cal' : '🛠️ PM + 🎯 Cal'}:
                            </span>{' '}
                            <span className="font-mono font-extrabold bg-indigo-800 px-2 py-0.5 rounded text-white">
                                {dragPayload.equipmentNo}
                            </span>{' '}
                            <span className="font-bold text-slate-200">{dragPayload.equipmentName}</span>
                            <p className="text-[11px] text-indigo-300">
                                ปล่อยเมาส์ลงในคอลัมน์เดือน (ม.ค. – ธ.ค.) ที่ต้องการได้เลย — ระบบล็อกแถวเครื่องมือนี้ให้อัตโนมัติแม้เมาส์เลื่อนข้ามบรรทัด!
                            </p>
                        </div>
                    </div>

                    {/* Drop Zone to Cancel Plan (-) */}
                    <div
                        onDragOver={e => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverCell?.month !== '-') {
                                setDragOverCell({ eqId: dragPayload.eqId, subId: dragPayload.subId, month: '-' });
                            }
                        }}
                        onDrop={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCalendarCellDrop('-');
                        }}
                        className={`px-4 py-2 rounded-xl border-2 border-dashed text-xs font-black transition-all cursor-pointer shrink-0 ${
                            dragOverCell?.month === '-'
                                ? 'bg-rose-600 border-white text-white scale-105 shadow-lg'
                                : 'bg-rose-950/80 border-rose-400 text-rose-200 hover:bg-rose-900'
                        }`}
                    >
                        🗑️ ลากมาวางที่นี่เพื่อยกเลิกแผน (- ไม่มี PM/Cal -)
                    </div>
                </div>
            )}

            {/* THE 12-MONTH CALENDAR MATRIX TABLE */}
            <div className="bg-white dark:bg-base-900 rounded-2xl border border-slate-200 dark:border-base-800 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        {/* Table Header */}
                        <thead className="bg-slate-100/95 dark:bg-base-950/95 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-base-800 sticky top-0 z-30 backdrop-blur-xs">
                            <tr>
                                {/* Col 1: Expand chevron */}
                                <th className="px-2 py-3 w-8 text-center sticky left-0 bg-slate-100 dark:bg-base-950 z-30">
                                    <span className="sr-only">พ่วง</span>
                                </th>

                                {/* Col 2: Equipment No (Sticky Left) */}
                                <th className="px-3 py-3 min-w-[125px] max-w-[145px] sticky left-8 bg-slate-100 dark:bg-base-950 z-30 font-extrabold uppercase tracking-tight">
                                    รหัสเครื่อง
                                </th>

                                {/* Col 3: Name & Owner (Sticky Left) */}
                                <th className="px-3 py-3 min-w-[210px] max-w-[270px] sticky left-[155px] bg-slate-100 dark:bg-base-950 z-30 font-extrabold uppercase tracking-tight shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                                    ชื่อเครื่องมือ & ผู้ดูแล
                                </th>

                                {/* 12 Monthly Calendar Columns (Also valid Drop Targets for the dragged item!) */}
                                {MONTH_KEYS.map((mKey) => {
                                    const info = MONTH_INFO_MAP[mKey];
                                    const isCurrent = currentMonthKey === mKey;
                                    const isFilterActive = filterMonth === mKey;
                                    const isColumnDragOver = Boolean(dragPayload && dragOverCell?.month === mKey);

                                    return (
                                        <th
                                            key={mKey}
                                            onDragOver={e => {
                                                if (!dragPayload) return;
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = 'move';
                                                if (dragOverCell?.month !== mKey) {
                                                    setDragOverCell({ eqId: dragPayload.eqId, subId: dragPayload.subId, month: mKey });
                                                }
                                            }}
                                            onDrop={e => {
                                                if (!dragPayload) return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleCalendarCellDrop(mKey);
                                            }}
                                            className={`px-2 py-2.5 min-w-[96px] max-w-[115px] text-center border-l border-slate-200 dark:border-base-800 transition-colors ${
                                                isColumnDragOver
                                                    ? 'bg-indigo-600 text-white ring-2 ring-inset ring-amber-300'
                                                    : isFilterActive
                                                        ? 'bg-indigo-100/80 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200'
                                                        : isCurrent
                                                            ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                                                            : ''
                                            }`}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className="font-extrabold text-[11px] flex items-center gap-1">
                                                    <span>{info.thShort}</span>
                                                    {isCurrent && !isColumnDragOver && <span className="text-[8px] text-indigo-600 font-bold">●</span>}
                                                </span>
                                                <span className={`text-[9px] font-mono lowercase ${isColumnDragOver ? 'text-indigo-100 font-bold' : 'text-slate-400'}`}>
                                                    {isColumnDragOver ? 'ปล่อยที่นี่' : info.key}
                                                </span>
                                            </div>
                                        </th>
                                    );
                                })}

                                {/* Actions & Details Button */}
                                <th className="px-3 py-3 min-w-[175px] text-right font-extrabold uppercase tracking-tight border-l border-slate-200 dark:border-base-800">
                                    ย้ายชุด / รายละเอียด
                                </th>
                            </tr>
                        </thead>

                        {/* Table Body */}
                        <tbody className="divide-y divide-slate-100 dark:divide-base-800 font-medium">
                            {filteredEquipments.length === 0 ? (
                                <tr>
                                    <td colSpan={16} className="p-8 text-center text-slate-400 dark:text-slate-500 font-semibold text-xs">
                                        ไม่พบรายการเครื่องมือที่ตรงกับเงื่อนไขการค้นหา
                                    </td>
                                </tr>
                            ) : (
                                filteredEquipments.map((eq, idx) => {
                                    const subCount = eq.subEquipments?.length || 0;
                                    const isSubsExpanded = expandedEquipIds.has(eq.id);
                                    const isDetailExpanded = expandedDetailIds.has(eq.id);
                                    const progress = getStepProgress(eq.trackingStatus || {});

                                    const primaryPMMonths = getMonthsForPlan(eq.pm, eq.pmMonth);
                                    const primaryCalMonths = getMonthsForPlan(eq.cal, eq.calMonth);
                                    const primarySetGroup = inferEquipmentSetGroup(eq.equipmentName, eq.setGroup);
                                    const primaryPMCycle = getMultiYearCycleStatus(eq.pm, planningYear, primarySetGroup);
                                    const primaryCalCycle = getMultiYearCycleStatus(eq.cal, planningYear, primarySetGroup);

                                    // Check if this equipment has Set A / Set B sub-equipments
                                    const setASubCount = (eq.subEquipments || []).filter(s => inferEquipmentSetGroup(s.equipmentName, s.setGroup) === 'A').length;
                                    const setBSubCount = (eq.subEquipments || []).filter(s => inferEquipmentSetGroup(s.equipmentName, s.setGroup) === 'B').length;
                                    const hasAlternatingSets = setASubCount > 0 && setBSubCount > 0;

                                    const isPrimaryRowBeingDragged = Boolean(dragPayload && dragPayload.eqId === eq.id && !dragPayload.subId);
                                    const isPrimaryRowQuickMoveActive = Boolean(quickMoveSource && quickMoveSource.eqId === eq.id && !quickMoveSource.subId);

                                    return (
                                        <React.Fragment key={`${eq.id || 'eq'}_${idx}`}>
                                            {/* PRIMARY EQUIPMENT ROW */}
                                            <tr className={`hover:bg-slate-50/80 dark:hover:bg-base-800/50 transition-colors ${
                                                isPrimaryRowBeingDragged || isPrimaryRowQuickMoveActive
                                                    ? 'bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-inset ring-amber-400'
                                                    : isDetailExpanded
                                                        ? 'bg-indigo-50/30 dark:bg-indigo-950/20'
                                                        : ''
                                            }`}>
                                                {/* Col 1: Expand Sub-components Chevron */}
                                                <td className="px-2 py-3 text-center sticky left-0 bg-white dark:bg-base-900 z-20">
                                                    {subCount > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandSubs(eq.id)}
                                                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-base-800 transition-colors cursor-pointer"
                                                            title={isSubsExpanded ? 'ย่อเครื่องพ่วงย่อย' : `ขยายดู ${subCount} เครื่องพ่วงย่อย`}
                                                        >
                                                            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-200 ${isSubsExpanded ? 'rotate-180' : ''}`} />
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-300 dark:text-base-800 text-[10px]">·</span>
                                                    )}
                                                </td>

                                                {/* Col 2: Equipment No (Sticky Left) */}
                                                <td className="px-3 py-3 whitespace-nowrap sticky left-8 bg-white dark:bg-base-900 z-20">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-mono font-extrabold text-slate-900 dark:text-white text-xs px-2 py-0.5 bg-slate-100 dark:bg-base-800 rounded-md border border-slate-300 dark:border-base-700">
                                                            {normalizeEquipmentNo(eq.equipmentNo) || eq.equipmentNo}
                                                        </span>
                                                        {subCount > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExpandSubs(eq.id)}
                                                                className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 px-1.5 py-0.5 rounded cursor-pointer border border-indigo-200 dark:border-indigo-800"
                                                                title={`มี ${subCount} เครื่องพ่วงย่อย คลิกเพื่อเปิด/ปิด`}
                                                            >
                                                                +{subCount}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Col 3: Name & Owner (Sticky Left) */}
                                                <td className="px-3 py-3 sticky left-[155px] bg-white dark:bg-base-900 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                                                    <div className="flex flex-col min-w-[200px] max-w-[260px]">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-extrabold text-slate-900 dark:text-white text-xs line-clamp-1" title={eq.equipmentName}>
                                                                {eq.equipmentName}
                                                            </span>
                                                            {primarySetGroup && (
                                                                <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${
                                                                    primarySetGroup === 'A'
                                                                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200'
                                                                        : 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200'
                                                                }`}>
                                                                    ชุด {primarySetGroup}
                                                                </span>
                                                            )}
                                                            {hasAlternatingSets && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openRotationManager(eq)}
                                                                    className="text-[9px] font-black px-1.5 py-0.2 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-200 rounded border border-purple-300 dark:border-purple-700 cursor-pointer"
                                                                    title="เครื่องมือนี้มีทั้งชุด A และชุด B คลิกเพื่อตั้งค่าผลัดกันส่ง Cal"
                                                                >
                                                                    🔄 ชุด A({setASubCount}) / B({setBSubCount})
                                                                </button>
                                                            )}
                                                            {(eq.status === 'issue' || eq.breakdownStatus?.isBroken) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEquipmentToResolve(eq)}
                                                                    className="text-[10px] font-black px-1.5 py-0.2 bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200 rounded border border-rose-300"
                                                                    title="เครื่องเสีย คลิกเพื่อคืนสภาพพร้อมใช้งาน 🟢"
                                                                >
                                                                    🚨 เสีย
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <select
                                                                value={eq.owner || 'PORNTHAK'}
                                                                onChange={(e) => handleQuickChangeOwner(eq.id, e.target.value)}
                                                                className="text-[11px] font-bold bg-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer outline-none border-b border-dashed border-slate-300 dark:border-base-700 max-w-[130px] truncate"
                                                                title="คลิกเพื่อเปลี่ยนผู้รับผิดชอบ"
                                                            >
                                                                {availableOwners.map(o => (
                                                                    <option key={o} value={o}>👤 {o}</option>
                                                                ))}
                                                            </select>
                                                            {eq.location && (
                                                                <span className="text-[10px] text-slate-400 truncate">
                                                                    · {eq.location}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 12 MONTH CALENDAR CELLS (COLUMN-LOCKED DRAG & DROP + 1-CLICK QUICK MOVE) */}
                                                {MONTH_KEYS.map((mKey) => {
                                                    const hasPM = primaryPMMonths.has(mKey);
                                                    const hasCal = primaryCalMonths.has(mKey);

                                                    // Check sub-components in this month (split into Due in planningYear vs Standby/Off-cycle in planningYear)
                                                    const subsInMonthAll = (eq.subEquipments || []).filter(s => {
                                                        const sPM = getMonthsForPlan(s.pm);
                                                        const sCal = getMonthsForPlan(s.cal);
                                                        return sPM.has(mKey) || sCal.has(mKey);
                                                    });

                                                    const subsDueInMonth = subsInMonthAll.filter(s => {
                                                        const sSet = inferEquipmentSetGroup(s.equipmentName, s.setGroup);
                                                        const sPMDue = getMonthsForPlan(s.pm).has(mKey) && getMultiYearCycleStatus(s.pm, planningYear, sSet).isDueInYear;
                                                        const sCalDue = getMonthsForPlan(s.cal).has(mKey) && getMultiYearCycleStatus(s.cal, planningYear, sSet).isDueInYear;
                                                        return sPMDue || sCalDue;
                                                    });

                                                    const subsOffCycleInMonth = subsInMonthAll.filter(s => !subsDueInMonth.includes(s));

                                                    // Highlight target cell when dragging over this month column
                                                    const isDropTarget = Boolean(
                                                        dragPayload &&
                                                        dragOverCell?.month === mKey &&
                                                        (dragPayload.eqId === eq.id || dragOverCell?.eqId === eq.id)
                                                    );

                                                    return (
                                                        <td
                                                            key={mKey}
                                                            onDragOver={e => {
                                                                if (!dragPayload) return;
                                                                e.preventDefault();
                                                                e.dataTransfer.dropEffect = 'move';
                                                                if (dragOverCell?.month !== mKey || dragOverCell?.eqId !== eq.id || dragOverCell?.subId !== undefined) {
                                                                    setDragOverCell({ eqId: eq.id, month: mKey });
                                                                }
                                                            }}
                                                            onDrop={e => {
                                                                if (!dragPayload) return;
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleCalendarCellDrop(mKey);
                                                            }}
                                                            className={`px-1.5 py-2.5 text-center border-l border-slate-100 dark:border-base-800 align-top transition-colors ${
                                                                isDropTarget
                                                                    ? 'bg-indigo-100/95 dark:bg-indigo-900/70 ring-2 ring-inset ring-indigo-600'
                                                                    : isPrimaryRowQuickMoveActive && quickMoveSource?.fromMonth !== mKey
                                                                        ? 'bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/90 cursor-pointer'
                                                                        : filterMonth === mKey
                                                                            ? 'bg-indigo-50/40 dark:bg-indigo-950/30'
                                                                            : ''
                                                            }`}
                                                        >
                                                            <div className="flex flex-col gap-1 min-h-[38px] justify-center">
                                                                {/* 1-CLICK TARGET BUTTON WHEN THIS PRIMARY ROW IS IN QUICK-MOVE MODE */}
                                                                {isPrimaryRowQuickMoveActive && quickMoveSource && quickMoveSource.fromMonth !== mKey && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={e => {
                                                                            e.stopPropagation();
                                                                            handleExecuteQuickMove(mKey);
                                                                        }}
                                                                        className="w-full py-1 px-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-md text-[10px] shadow-xs border border-amber-600 cursor-pointer transition-all hover:scale-105"
                                                                        title={`คลิกเพื่อย้าย ${quickMoveSource.planType.toUpperCase()} มาที่เดือน ${MONTH_INFO_MAP[mKey].thShort}`}
                                                                    >
                                                                        👉 ย้ายมา {MONTH_INFO_MAP[mKey].thShort}
                                                                    </button>
                                                                )}

                                                                {/* PM Box in Month */}
                                                                {hasPM && (
                                                                    primaryPMCycle.isDueInYear ? (
                                                                        <div
                                                                            draggable
                                                                            onDragStart={e => {
                                                                                e.stopPropagation();
                                                                                e.dataTransfer.effectAllowed = 'move';
                                                                                try { e.dataTransfer.setData('text/plain', `${eq.id}:pm:${mKey}`); } catch (_) {}
                                                                                setDragPayload({
                                                                                    eqId: eq.id,
                                                                                    equipmentNo: eq.equipmentNo,
                                                                                    equipmentName: eq.equipmentName,
                                                                                    fromMonth: mKey,
                                                                                    planType: 'pm',
                                                                                    hasSubEquipments: subCount > 0
                                                                                });
                                                                            }}
                                                                            onDragEnd={() => {
                                                                                setDragPayload(null);
                                                                                setDragOverCell(null);
                                                                            }}
                                                                            onClick={() => {
                                                                                if (isQuickMoveMode) {
                                                                                    setQuickMoveSource({
                                                                                        eqId: eq.id,
                                                                                        equipmentNo: eq.equipmentNo,
                                                                                        equipmentName: eq.equipmentName,
                                                                                        fromMonth: mKey,
                                                                                        planType: 'pm',
                                                                                        hasSubEquipments: subCount > 0,
                                                                                        includeSubs: false
                                                                                    });
                                                                                } else {
                                                                                    setInspectionTarget({ equipment: eq, highlightType: 'pm', highlightMonth: mKey });
                                                                                }
                                                                            }}
                                                                            className={`px-1.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 border rounded-md text-[10px] font-bold cursor-grab active:cursor-grabbing transition-all shadow-2xs hover:scale-102 text-left select-none ${
                                                                                quickMoveSource?.eqId === eq.id && !quickMoveSource?.subId && quickMoveSource?.planType === 'pm'
                                                                                    ? 'ring-2 ring-amber-400 border-amber-500'
                                                                                    : 'border-indigo-200/90 dark:border-indigo-800'
                                                                            }`}
                                                                            title={`ลากกล่องนี้ไปวางเดือนอื่น หรือกดปุ่ม ⇄ เพื่อจิ้มย้ายเดือน PM ของ ${eq.equipmentNo}`}
                                                                        >
                                                                            <div className="flex items-center justify-between gap-1">
                                                                                <span className="font-black text-indigo-700 dark:text-indigo-300">🛠️ PM</span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={e => {
                                                                                        e.stopPropagation();
                                                                                        setQuickMoveSource({
                                                                                            eqId: eq.id,
                                                                                            equipmentNo: eq.equipmentNo,
                                                                                            equipmentName: eq.equipmentName,
                                                                                            fromMonth: mKey,
                                                                                            planType: 'pm',
                                                                                            hasSubEquipments: subCount > 0,
                                                                                            includeSubs: false
                                                                                        });
                                                                                    }}
                                                                                    className="px-1 py-0.2 bg-indigo-200/80 hover:bg-amber-400 text-indigo-900 hover:text-slate-950 rounded text-[9px] font-black cursor-pointer transition-colors"
                                                                                    title="คลิกเพื่อจิ้มย้ายเดือน PM ทันทีโดยไม่ต้องลากเมาส์"
                                                                                >
                                                                                    ⇄
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div
                                                                            onClick={() => openRotationManager(eq)}
                                                                            className="px-1.5 py-1 bg-slate-100/80 dark:bg-base-800/70 text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-base-700 rounded-md text-[9px] font-bold cursor-pointer text-left"
                                                                            title={`เว้นรอบ PM ในปี ${planningYear} (ครบกำหนดปี ${primaryPMCycle.nextDueYear}) คลิกเพื่อตั้งค่ารอบปี`}
                                                                        >
                                                                            <div>⏸️ เว้น PM ปี {planningYear}</div>
                                                                            <div className="text-[8px] text-amber-600 dark:text-amber-400 font-extrabold">รอบหน้า: ปี {primaryPMCycle.nextDueYear}</div>
                                                                        </div>
                                                                    )
                                                                )}

                                                                {/* Cal Box in Month */}
                                                                {hasCal && (
                                                                    primaryCalCycle.isDueInYear ? (
                                                                        <div
                                                                            draggable
                                                                            onDragStart={e => {
                                                                                e.stopPropagation();
                                                                                e.dataTransfer.effectAllowed = 'move';
                                                                                try { e.dataTransfer.setData('text/plain', `${eq.id}:cal:${mKey}`); } catch (_) {}
                                                                                setDragPayload({
                                                                                    eqId: eq.id,
                                                                                    equipmentNo: eq.equipmentNo,
                                                                                    equipmentName: eq.equipmentName,
                                                                                    fromMonth: mKey,
                                                                                    planType: 'cal',
                                                                                    hasSubEquipments: subCount > 0
                                                                                });
                                                                            }}
                                                                            onDragEnd={() => {
                                                                                setDragPayload(null);
                                                                                setDragOverCell(null);
                                                                            }}
                                                                            onClick={() => {
                                                                                if (isQuickMoveMode) {
                                                                                    setQuickMoveSource({
                                                                                        eqId: eq.id,
                                                                                        equipmentNo: eq.equipmentNo,
                                                                                        equipmentName: eq.equipmentName,
                                                                                        fromMonth: mKey,
                                                                                        planType: 'cal',
                                                                                        hasSubEquipments: subCount > 0,
                                                                                        includeSubs: false
                                                                                    });
                                                                                } else {
                                                                                    setInspectionTarget({ equipment: eq, highlightType: 'cal', highlightMonth: mKey });
                                                                                }
                                                                            }}
                                                                            className={`px-1.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border rounded-md text-[10px] font-bold cursor-grab active:cursor-grabbing transition-all shadow-2xs hover:scale-102 text-left select-none ${
                                                                                quickMoveSource?.eqId === eq.id && !quickMoveSource?.subId && quickMoveSource?.planType === 'cal'
                                                                                    ? 'ring-2 ring-amber-400 border-amber-500'
                                                                                    : 'border-emerald-200/90 dark:border-emerald-800'
                                                                            }`}
                                                                            title={`ลากกล่องนี้ไปวางเดือนอื่น หรือกดปุ่ม ⇄ เพื่อจิ้มย้ายเดือน Cal ของ ${eq.equipmentNo}`}
                                                                        >
                                                                            <div className="flex items-center justify-between gap-1">
                                                                                <span className="font-black text-emerald-700 dark:text-emerald-300">🎯 Cal</span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={e => {
                                                                                        e.stopPropagation();
                                                                                        setQuickMoveSource({
                                                                                            eqId: eq.id,
                                                                                            equipmentNo: eq.equipmentNo,
                                                                                            equipmentName: eq.equipmentName,
                                                                                            fromMonth: mKey,
                                                                                            planType: 'cal',
                                                                                            hasSubEquipments: subCount > 0,
                                                                                            includeSubs: false
                                                                                        });
                                                                                    }}
                                                                                    className="px-1 py-0.2 bg-emerald-200/80 hover:bg-amber-400 text-emerald-900 hover:text-slate-950 rounded text-[9px] font-black cursor-pointer transition-colors"
                                                                                    title="คลิกเพื่อจิ้มย้ายเดือน Cal ทันทีโดยไม่ต้องลากเมาส์"
                                                                                >
                                                                                    ⇄
                                                                                </button>
                                                                            </div>
                                                                            {primaryCalCycle.intervalYears > 1 && (
                                                                                <div className="text-[8px] text-emerald-700 dark:text-emerald-300 font-extrabold mt-0.5">
                                                                                    รอบ {primaryCalCycle.intervalYears} ปี · ส่งปีนี้
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div
                                                                            draggable
                                                                            onDragStart={e => {
                                                                                e.stopPropagation();
                                                                                e.dataTransfer.effectAllowed = 'move';
                                                                                try { e.dataTransfer.setData('text/plain', `${eq.id}:cal:${mKey}`); } catch (_) {}
                                                                                setDragPayload({
                                                                                    eqId: eq.id,
                                                                                    equipmentNo: eq.equipmentNo,
                                                                                    equipmentName: eq.equipmentName,
                                                                                    fromMonth: mKey,
                                                                                    planType: 'cal',
                                                                                    hasSubEquipments: subCount > 0
                                                                                });
                                                                            }}
                                                                            onDragEnd={() => {
                                                                                setDragPayload(null);
                                                                                setDragOverCell(null);
                                                                            }}
                                                                            onClick={() => openRotationManager(eq)}
                                                                            className="px-1.5 py-1 bg-amber-50/70 hover:bg-amber-100/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800 rounded-md text-[9px] font-bold cursor-grab active:cursor-grabbing text-left select-none"
                                                                            title={`เว้นรอบส่ง Cal ในปี ${planningYear} (ส่งรอบถัดไปปี ${primaryCalCycle.nextDueYear}) คลิกเพื่อตั้งค่าชุดสลับ A/B`}
                                                                        >
                                                                            <div className="flex items-center justify-between">
                                                                                <span>⏸️ เว้นปี {planningYear}</span>
                                                                                {primarySetGroup && <span className="font-black">ชุด {primarySetGroup}</span>}
                                                                            </div>
                                                                            <div className="text-[8px] text-amber-700 dark:text-amber-300 font-extrabold">
                                                                                👉 Cal ปี {primaryCalCycle.nextDueYear}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                )}

                                                                {/* Sub-components indicator if subs collapsed (Draggable as a whole group!) */}
                                                                {!isSubsExpanded && subsInMonthAll.length > 0 && (
                                                                    <div
                                                                        draggable
                                                                        onDragStart={e => {
                                                                            e.stopPropagation();
                                                                            e.dataTransfer.effectAllowed = 'move';
                                                                            try { e.dataTransfer.setData('text/plain', `${eq.id}:group:${mKey}`); } catch (_) {}
                                                                            setDragPayload({
                                                                                eqId: eq.id,
                                                                                equipmentNo: eq.equipmentNo,
                                                                                equipmentName: `${eq.equipmentName} (+${subsInMonthAll.length} พ่วง)`,
                                                                                fromMonth: mKey,
                                                                                planType: 'both',
                                                                                hasSubEquipments: true,
                                                                                isGroupBadge: true
                                                                            });
                                                                        }}
                                                                        onDragEnd={() => {
                                                                            setDragPayload(null);
                                                                            setDragOverCell(null);
                                                                        }}
                                                                        onClick={() => toggleExpandSubs(eq.id)}
                                                                        className="w-full text-center text-[9px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 bg-slate-100 dark:bg-base-800 rounded px-1 py-0.5 border border-dashed border-slate-300 hover:border-indigo-400 transition-colors cursor-grab active:cursor-grabbing select-none"
                                                                        title={`มี ${subsInMonthAll.length} เครื่องพ่วงย่อยในเดือนนี้ (คลิกเพื่อกางดู หรือลากกล่องนี้ไปวางเดือนอื่นเพื่อย้ายยกชุด)`}
                                                                    >
                                                                        {subsDueInMonth.length > 0 && (
                                                                            <div className="text-emerald-700 dark:text-emerald-300 font-extrabold">
                                                                                +{subsDueInMonth.length} พ่วง (ส่งปีนี้)
                                                                            </div>
                                                                        )}
                                                                        {subsOffCycleInMonth.length > 0 && (
                                                                            <div className="text-amber-700 dark:text-amber-400 font-bold text-[8px]">
                                                                                ⏸️ {subsOffCycleInMonth.length} พ่วง (เว้นรอบ)
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Empty Cell */}
                                                                {!hasPM && !hasCal && (!subsInMonthAll.length || isSubsExpanded) && !(isPrimaryRowQuickMoveActive && quickMoveSource?.fromMonth !== mKey) && (
                                                                    <span className="text-slate-200 dark:text-base-800 text-center font-bold text-xs select-none">
                                                                        ·
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}

                                                {/* Col 16: Batch Move & Details Expansion Buttons */}
                                                <td className="px-3 py-3 text-right whitespace-nowrap border-l border-slate-100 dark:border-base-800">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openBatchMoveForEquipment(eq)}
                                                            className="px-2 py-1 text-[11px] font-extrabold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-200 dark:border-amber-800 transition-all cursor-pointer shadow-2xs"
                                                            title="ย้ายเดือนทั้งชุด (เครื่องหลัก + เครื่องพ่วง) หรือเลือกย้ายเฉพาะชุด A / ชุด B"
                                                        >
                                                            ⇄ {subCount > 0 ? 'ย้ายยกชุด' : 'ย้ายเดือน'}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandDetail(eq.id)}
                                                            className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 border shadow-2xs cursor-pointer ${
                                                                isDetailExpanded
                                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'
                                                            }`}
                                                            title="คลิกเพื่อขยายดูรายละเอียดข้อกำหนด รายการตรวจ และสเต็ปงาน"
                                                        >
                                                            <span>{isDetailExpanded ? '▲ ซ่อน' : '🔍 ดู'}</span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedEquipmentForHistory(eq)}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-base-800 rounded-lg transition-colors cursor-pointer"
                                                            title="เปิดสมุดประวัติเครื่อง"
                                                        >
                                                            <ClockIcon className="h-3.5 w-3.5" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingEquip(eq);
                                                                setIsEditModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-base-800 rounded-lg transition-colors cursor-pointer"
                                                            title="แก้ไขข้อมูลเครื่องหลัก"
                                                        >
                                                            <PencilIcon className="h-3.5 w-3.5" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteConfirm({
                                                                type: 'primary',
                                                                id: eq.id,
                                                                name: `${eq.equipmentNo} - ${eq.equipmentName}`
                                                            })}
                                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                            title="ลบเครื่องมือ"
                                                        >
                                                            <TrashIcon className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* NESTED SUB-COMPONENTS ROWS (ALIGNED TO THE 12 MONTH CALENDAR + COLUMN-LOCKED DRAG & DROP + QUICK MOVE + SET A/B) */}
                                            {isSubsExpanded && (eq.subEquipments || []).map((sub, sIdx) => {
                                                const subPMMonths = getMonthsForPlan(sub.pm);
                                                const subCalMonths = getMonthsForPlan(sub.cal);
                                                const subSetGroup = inferEquipmentSetGroup(sub.equipmentName, sub.setGroup);
                                                const subPMCycle = getMultiYearCycleStatus(sub.pm, planningYear, subSetGroup);
                                                const subCalCycle = getMultiYearCycleStatus(sub.cal, planningYear, subSetGroup);

                                                // Respect Set/Cycle filter inside expanded sub-rows so Planner can focus on Set A / Set B or Due This Year
                                                if (filterSetCycle === 'set_a' && subSetGroup !== 'A') return null;
                                                if (filterSetCycle === 'set_b' && subSetGroup !== 'B') return null;
                                                if (filterSetCycle === 'due_this_year') {
                                                    const hasAnyDue = (subPMMonths.size > 0 && subPMCycle.isDueInYear) || (subCalMonths.size > 0 && subCalCycle.isDueInYear);
                                                    if (!hasAnyDue) return null;
                                                }
                                                if (filterSetCycle === 'standby_this_year') {
                                                    const hasAnyOff = (subPMMonths.size > 0 && !subPMCycle.isDueInYear) || (subCalMonths.size > 0 && !subCalCycle.isDueInYear);
                                                    if (!hasAnyOff) return null;
                                                }

                                                const isSubRowBeingDragged = Boolean(dragPayload && dragPayload.eqId === eq.id && dragPayload.subId === sub.id);
                                                const isSubRowQuickMoveActive = Boolean(quickMoveSource && quickMoveSource.eqId === eq.id && quickMoveSource.subId === sub.id);

                                                return (
                                                    <tr
                                                        key={sub.id || sIdx}
                                                        className={`transition-colors border-l-2 border-indigo-500 ${
                                                            isSubRowBeingDragged || isSubRowQuickMoveActive
                                                                ? 'bg-amber-50/80 dark:bg-amber-950/35 ring-2 ring-inset ring-amber-400'
                                                                : 'bg-slate-50/70 dark:bg-base-950/40 hover:bg-slate-100/70 dark:hover:bg-base-800/40'
                                                        }`}
                                                    >
                                                        {/* Sub Chevron */}
                                                        <td className="px-2 py-2 text-center text-indigo-500 font-extrabold text-xs sticky left-0 bg-slate-50/90 dark:bg-base-950/90 z-20">
                                                            ↳
                                                        </td>

                                                        {/* Sub Equipment No */}
                                                        <td className="px-3 py-2 whitespace-nowrap sticky left-8 bg-slate-50/90 dark:bg-base-950/90 z-20">
                                                            <div className="flex items-center gap-1">
                                                                <span
                                                                    onClick={() => {
                                                                        setEditingSub({
                                                                            parentEqId: eq.id,
                                                                            isNew: false,
                                                                            sub: { ...sub }
                                                                        });
                                                                        setIsSubModalOpen(true);
                                                                    }}
                                                                    className="font-mono font-bold text-indigo-900 dark:text-indigo-200 text-xs px-2 py-0.5 bg-white dark:bg-base-900 rounded border border-indigo-200 dark:border-indigo-800 shadow-2xs cursor-pointer hover:border-indigo-400 transition-colors"
                                                                    title="คลิกเพื่อแก้ไขเครื่องพ่วงย่อยนี้"
                                                                >
                                                                    {normalizeEquipmentNo(sub.equipmentNo) || sub.equipmentNo}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* Sub Name, Set A/B Badge & Sub Owner */}
                                                        <td className="px-3 py-2 sticky left-[155px] bg-slate-50/90 dark:bg-base-950/90 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                                                            <div className="flex flex-col min-w-[200px] max-w-[260px]">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate" title={sub.equipmentName}>
                                                                        {sub.equipmentName}
                                                                    </span>
                                                                    {subSetGroup && (
                                                                        <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${
                                                                            subSetGroup === 'A'
                                                                                ? 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200'
                                                                                : 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200'
                                                                        }`}>
                                                                            ชุด {subSetGroup}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <select
                                                                        value={sub.owner || eq.owner || 'PORNTHAK'}
                                                                        onChange={(e) => handleQuickChangeOwner(eq.id, e.target.value, true, sub.id)}
                                                                        className="text-[10px] font-semibold bg-transparent text-slate-500 hover:text-slate-800 cursor-pointer outline-none border-b border-dashed border-slate-300 dark:border-base-700 max-w-[120px] truncate"
                                                                    >
                                                                        {availableOwners.map(o => (
                                                                            <option key={o} value={o}>👤 {o}</option>
                                                                        ))}
                                                                    </select>
                                                                    {subCalCycle.intervalYears > 1 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openRotationManager(eq)}
                                                                            className={`text-[9px] font-extrabold px-1 rounded cursor-pointer ${
                                                                                subCalCycle.isDueInYear
                                                                                    ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                                    : 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300'
                                                                            }`}
                                                                            title="คลิกเพื่อปรับรอบปีและชุดสลับ A/B"
                                                                        >
                                                                            {subCalCycle.isDueInYear ? `🟢 ส่งปี ${planningYear}` : `⏸️ ส่งปี ${subCalCycle.nextDueYear}`}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Sub Monthly Calendar Cells (COLUMN-LOCKED DRAG & DROP + QUICK MOVE) */}
                                                        {MONTH_KEYS.map((mKey) => {
                                                            const subHasPM = subPMMonths.has(mKey);
                                                            const subHasCal = subCalMonths.has(mKey);
                                                            const isSubDropTarget = Boolean(
                                                                dragPayload &&
                                                                dragOverCell?.month === mKey &&
                                                                ((dragPayload.eqId === eq.id && dragPayload.subId === sub.id) ||
                                                                 (dragOverCell?.eqId === eq.id && dragOverCell?.subId === sub.id))
                                                            );

                                                            return (
                                                                <td
                                                                    key={mKey}
                                                                    onDragOver={e => {
                                                                        if (!dragPayload) return;
                                                                        e.preventDefault();
                                                                        e.dataTransfer.dropEffect = 'move';
                                                                        if (dragOverCell?.month !== mKey || dragOverCell?.eqId !== eq.id || dragOverCell?.subId !== sub.id) {
                                                                            setDragOverCell({ eqId: eq.id, subId: sub.id, month: mKey });
                                                                        }
                                                                    }}
                                                                    onDrop={e => {
                                                                        if (!dragPayload) return;
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleCalendarCellDrop(mKey);
                                                                    }}
                                                                    className={`px-1.5 py-1.5 text-center border-l border-slate-100 dark:border-base-800 align-top transition-colors ${
                                                                        isSubDropTarget
                                                                            ? 'bg-indigo-100/95 dark:bg-indigo-900/70 ring-2 ring-inset ring-indigo-600'
                                                                            : isSubRowQuickMoveActive && quickMoveSource?.fromMonth !== mKey
                                                                                ? 'bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/90 cursor-pointer'
                                                                                : filterMonth === mKey
                                                                                    ? 'bg-indigo-50/40 dark:bg-indigo-950/30'
                                                                                    : ''
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-col gap-0.5 min-h-[30px] justify-center">
                                                                        {/* 1-CLICK TARGET BUTTON WHEN THIS SUB-EQUIPMENT ROW IS IN QUICK-MOVE MODE */}
                                                                        {isSubRowQuickMoveActive && quickMoveSource && quickMoveSource.fromMonth !== mKey && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={e => {
                                                                                    e.stopPropagation();
                                                                                    handleExecuteQuickMove(mKey);
                                                                                }}
                                                                                className="w-full py-0.5 px-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded text-[9px] shadow-xs border border-amber-600 cursor-pointer transition-all hover:scale-105"
                                                                            >
                                                                                👉 {MONTH_INFO_MAP[mKey].thShort}
                                                                            </button>
                                                                        )}

                                                                        {subHasPM && (
                                                                            subPMCycle.isDueInYear ? (
                                                                                <div 
                                                                                    draggable
                                                                                    onDragStart={e => {
                                                                                        e.stopPropagation();
                                                                                        e.dataTransfer.effectAllowed = 'move';
                                                                                        try { e.dataTransfer.setData('text/plain', `${eq.id}:${sub.id}:pm:${mKey}`); } catch (_) {}
                                                                                        setDragPayload({
                                                                                            eqId: eq.id,
                                                                                            subId: sub.id,
                                                                                            equipmentNo: sub.equipmentNo,
                                                                                            equipmentName: sub.equipmentName,
                                                                                            fromMonth: mKey,
                                                                                            planType: 'pm',
                                                                                            hasSubEquipments: false
                                                                                        });
                                                                                    }}
                                                                                    onDragEnd={() => {
                                                                                        setDragPayload(null);
                                                                                        setDragOverCell(null);
                                                                                    }}
                                                                                    onClick={() => {
                                                                                        if (isQuickMoveMode) {
                                                                                            setQuickMoveSource({
                                                                                                eqId: eq.id,
                                                                                                subId: sub.id,
                                                                                                equipmentNo: sub.equipmentNo,
                                                                                                equipmentName: sub.equipmentName,
                                                                                                fromMonth: mKey,
                                                                                                planType: 'pm',
                                                                                                hasSubEquipments: false,
                                                                                                includeSubs: false
                                                                                            });
                                                                                        } else {
                                                                                            setInspectionTarget({ equipment: eq, subComponent: sub, highlightType: 'pm', highlightMonth: mKey });
                                                                                        }
                                                                                    }}
                                                                                    className="px-1 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border border-indigo-200 rounded text-[9px] font-bold cursor-grab active:cursor-grabbing hover:scale-102 transition-all select-none flex items-center justify-between gap-0.5"
                                                                                    title={`ลากไปวางเดือนอื่น หรือกด ⇄ เพื่อจิ้มย้ายเดือน PM ของ ${sub.equipmentNo}`}
                                                                                >
                                                                                    <span>🛠️ PM</span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={e => {
                                                                                            e.stopPropagation();
                                                                                            setQuickMoveSource({
                                                                                                eqId: eq.id,
                                                                                                subId: sub.id,
                                                                                                equipmentNo: sub.equipmentNo,
                                                                                                equipmentName: sub.equipmentName,
                                                                                                fromMonth: mKey,
                                                                                                planType: 'pm',
                                                                                                hasSubEquipments: false,
                                                                                                includeSubs: false
                                                                                            });
                                                                                        }}
                                                                                        className="px-1 bg-indigo-200/80 hover:bg-amber-400 text-indigo-900 hover:text-slate-950 rounded text-[8px] font-black cursor-pointer"
                                                                                        title="คลิกเพื่อจิ้มย้ายเดือน PM ทันที"
                                                                                    >
                                                                                        ⇄
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <div
                                                                                    onClick={() => openRotationManager(eq)}
                                                                                    className="px-1 py-0.5 bg-slate-100 dark:bg-base-800 text-slate-500 border border-dashed border-slate-300 rounded text-[8px] font-bold cursor-pointer"
                                                                                >
                                                                                    ⏸️ PM ปี {subPMCycle.nextDueYear}
                                                                                </div>
                                                                            )
                                                                        )}
                                                                        {subHasCal && (
                                                                            subCalCycle.isDueInYear ? (
                                                                                <div 
                                                                                    draggable
                                                                                    onDragStart={e => {
                                                                                        e.stopPropagation();
                                                                                        e.dataTransfer.effectAllowed = 'move';
                                                                                        try { e.dataTransfer.setData('text/plain', `${eq.id}:${sub.id}:cal:${mKey}`); } catch (_) {}
                                                                                        setDragPayload({
                                                                                            eqId: eq.id,
                                                                                            subId: sub.id,
                                                                                            equipmentNo: sub.equipmentNo,
                                                                                            equipmentName: sub.equipmentName,
                                                                                            fromMonth: mKey,
                                                                                            planType: 'cal',
                                                                                            hasSubEquipments: false
                                                                                        });
                                                                                    }}
                                                                                    onDragEnd={() => {
                                                                                        setDragPayload(null);
                                                                                        setDragOverCell(null);
                                                                                    }}
                                                                                    onClick={() => {
                                                                                        if (isQuickMoveMode) {
                                                                                            setQuickMoveSource({
                                                                                                eqId: eq.id,
                                                                                                subId: sub.id,
                                                                                                equipmentNo: sub.equipmentNo,
                                                                                                equipmentName: sub.equipmentName,
                                                                                                fromMonth: mKey,
                                                                                                planType: 'cal',
                                                                                                hasSubEquipments: false,
                                                                                                includeSubs: false
                                                                                            });
                                                                                        } else {
                                                                                            setInspectionTarget({ equipment: eq, subComponent: sub, highlightType: 'cal', highlightMonth: mKey });
                                                                                        }
                                                                                    }}
                                                                                    className="px-1 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-200 rounded text-[9px] font-bold cursor-grab active:cursor-grabbing hover:scale-102 transition-all select-none flex items-center justify-between gap-0.5"
                                                                                    title={`ลากไปวางเดือนอื่น หรือกด ⇄ เพื่อจิ้มย้ายเดือน Cal ของ ${sub.equipmentNo}`}
                                                                                >
                                                                                    <span>
                                                                                        🎯 Cal
                                                                                        {subSetGroup && <span className="ml-0.5 text-[8px] font-black opacity-85">({subSetGroup})</span>}
                                                                                    </span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={e => {
                                                                                            e.stopPropagation();
                                                                                            setQuickMoveSource({
                                                                                                eqId: eq.id,
                                                                                                subId: sub.id,
                                                                                                equipmentNo: sub.equipmentNo,
                                                                                                equipmentName: sub.equipmentName,
                                                                                                fromMonth: mKey,
                                                                                                planType: 'cal',
                                                                                                hasSubEquipments: false,
                                                                                                includeSubs: false
                                                                                            });
                                                                                        }}
                                                                                        className="px-1 bg-emerald-200/80 hover:bg-amber-400 text-emerald-900 hover:text-slate-950 rounded text-[8px] font-black cursor-pointer"
                                                                                        title="คลิกเพื่อจิ้มย้ายเดือน Cal ทันที"
                                                                                    >
                                                                                        ⇄
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <div
                                                                                    draggable
                                                                                    onDragStart={e => {
                                                                                        e.stopPropagation();
                                                                                        e.dataTransfer.effectAllowed = 'move';
                                                                                        try { e.dataTransfer.setData('text/plain', `${eq.id}:${sub.id}:cal:${mKey}`); } catch (_) {}
                                                                                        setDragPayload({
                                                                                            eqId: eq.id,
                                                                                            subId: sub.id,
                                                                                            equipmentNo: sub.equipmentNo,
                                                                                            equipmentName: sub.equipmentName,
                                                                                            fromMonth: mKey,
                                                                                            planType: 'cal',
                                                                                            hasSubEquipments: false
                                                                                        });
                                                                                    }}
                                                                                    onDragEnd={() => {
                                                                                        setDragPayload(null);
                                                                                        setDragOverCell(null);
                                                                                    }}
                                                                                    onClick={() => openRotationManager(eq)}
                                                                                    className="px-1 py-0.5 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-dashed border-amber-300 dark:border-amber-800 rounded text-[8px] font-extrabold cursor-grab active:cursor-grabbing select-none"
                                                                                    title={`ชุดใช้งานสลับ: เว้นส่ง Cal ในปี ${planningYear} · ส่งรอบถัดไปปี ${subCalCycle.nextDueYear}`}
                                                                                >
                                                                                    ⏸️ เว้น · Cal ปี {subCalCycle.nextDueYear}
                                                                                </div>
                                                                            )
                                                                        )}
                                                                        {!subHasPM && !subHasCal && !(isSubRowQuickMoveActive && quickMoveSource?.fromMonth !== mKey) && (
                                                                            <span className="text-slate-200 dark:text-base-850 text-center text-[10px]">·</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}

                                                        {/* Sub Actions */}
                                                        <td className="px-3 py-2 text-right whitespace-nowrap border-l border-slate-100 dark:border-base-800">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openRotationManager(eq)}
                                                                    className="px-1.5 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 rounded text-[9px] font-bold border border-purple-200 dark:border-purple-800 cursor-pointer"
                                                                    title="ตั้งค่าชุด A/B หรือรอบสอบเทียบ 2-3 ปี"
                                                                >
                                                                    🔄 รอบปี
                                                                </button>
                                                                <button
                                                                    type="button"
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
                                                                    className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded text-[10px] font-bold border border-slate-200 cursor-pointer"
                                                                >
                                                                    6 สเต็ป
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingSub({ parentEqId: eq.id, isNew: false, sub: { ...sub } });
                                                                        setIsSubModalOpen(true);
                                                                    }}
                                                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                                                                >
                                                                    <PencilIcon className="h-3 w-3" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDeleteConfirm({
                                                                        type: 'sub',
                                                                        id: sub.id,
                                                                        parentId: eq.id,
                                                                        name: `${sub.equipmentNo} - ${sub.equipmentName}`
                                                                    })}
                                                                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                                                >
                                                                    <TrashIcon className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* INLINE DETAILED DRAWER FOR THIS EQUIPMENT */}
                                            {isDetailExpanded && (
                                                <tr className="bg-slate-50/90 dark:bg-base-950/70 border-b-2 border-indigo-500">
                                                    <td colSpan={16} className="p-4">
                                                        <div className="bg-white dark:bg-base-900 rounded-xl border border-slate-200 dark:border-base-800 p-4 shadow-sm space-y-4 animate-fade-in">
                                                            {/* Drawer Header */}
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-base-800">
                                                                <div className="flex items-center gap-2.5">
                                                                    <span className="font-mono font-black text-sm px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800">
                                                                        {eq.equipmentNo}
                                                                    </span>
                                                                    <div>
                                                                        <h4 className="font-black text-slate-900 dark:text-white text-sm">
                                                                            {eq.equipmentName}
                                                                        </h4>
                                                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                            <span>ผู้รับผิดชอบ: <strong className="text-slate-800 dark:text-slate-200">{eq.owner}</strong></span>
                                                                            {eq.location && <span>· สถานที่: <strong className="text-slate-800 dark:text-slate-200">{eq.location}</strong></span>}
                                                                            <span>· ความคืบหน้า 6 สเต็ป: <strong className="text-indigo-600">{progress.completed}/6 ({progress.percent}%)</strong></span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openBatchMoveForEquipment(eq)}
                                                                        className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 rounded-lg text-xs font-extrabold border border-amber-200 cursor-pointer"
                                                                    >
                                                                        ⇄ ย้ายเดือนทั้งชุด / เลือกชุดย่อย
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openRotationManager(eq)}
                                                                        className="px-3 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200 rounded-lg text-xs font-extrabold border border-purple-200 cursor-pointer"
                                                                    >
                                                                        🔄 ตั้งค่าชุดสลับ A/B & รอบปี
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const existingNumbers = (eq.subEquipments || []).map(s => {
                                                                                const parts = String(s.equipmentNo || '').split('/');
                                                                                const last = parts[parts.length - 1];
                                                                                const num = parseInt(last, 10);
                                                                                return isNaN(num) ? 0 : num;
                                                                            });
                                                                            const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers, 0) : 0;
                                                                            const nextSubNum = maxNum + 1;
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
                                                                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200 rounded-lg text-xs font-bold border border-indigo-200 cursor-pointer"
                                                                    >
                                                                        + เพิ่มเครื่องพ่วงย่อย
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSelectedEquipmentForHistory(eq)}
                                                                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-slate-200 rounded-lg text-xs font-bold border border-slate-200 cursor-pointer"
                                                                    >
                                                                        📜 ประวัติ
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Drawer Content: 3 Columns Grid */}
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                                                {/* Column 1: แผน PM */}
                                                                <div className="p-3 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="font-extrabold text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                                                                            <span>🛠️</span>
                                                                            <span>แผนบำรุงรักษา (PM)</span>
                                                                        </span>
                                                                        <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                                                                            {formatFrequency(eq.pm?.freqYear)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="space-y-1 text-xs">
                                                                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                                                            <span>เดือนที่กำหนด:</span>
                                                                            <select
                                                                                value={normalizeMonth(eq.pm?.lastPM || eq.pm?.nextPM) || '-'}
                                                                                onChange={e => handleQuickChangePlanMonth(eq.id, 'pm', e.target.value, false)}
                                                                                className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-base-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-0.5 cursor-pointer"
                                                                            >
                                                                                <option value="-">- ไม่มี PM (ยกเลิก) -</option>
                                                                                {MONTH_KEYS.map(m => (
                                                                                    <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                                                            <span>ผู้ดำเนินการ:</span>
                                                                            <strong>{eq.pm?.pmBy || 'Vender'}</strong>
                                                                        </div>
                                                                        <div className="pt-1 border-t border-indigo-100/80 dark:border-indigo-900/40">
                                                                            <span className="text-slate-500 block text-[11px] mb-0.5">รายการตรวจสอบ PM:</span>
                                                                            <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line text-xs font-medium bg-white/70 dark:bg-base-950 p-2 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                                                                                {eq.pm?.items || 'ตามรายการมาตรฐานของ Vendor'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Column 2: แผน Calibration */}
                                                                <div className="p-3 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="font-extrabold text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                                                                            <span>🎯</span>
                                                                            <span>แผนสอบเทียบ (Calibration)</span>
                                                                        </span>
                                                                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                                                                            {formatFrequency(eq.cal?.freqYear)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="space-y-1 text-xs">
                                                                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                                                            <span>เดือนที่กำหนด:</span>
                                                                            <select
                                                                                value={normalizeMonth(eq.cal?.lastCal || eq.cal?.nextCal) || '-'}
                                                                                onChange={e => handleQuickChangePlanMonth(eq.id, 'cal', e.target.value, false)}
                                                                                className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-base-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-0.5 cursor-pointer"
                                                                            >
                                                                                <option value="-">- ไม่มี Cal (ยกเลิก) -</option>
                                                                                {MONTH_KEYS.map(m => (
                                                                                    <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                                                            <span>ผู้ดำเนินการ:</span>
                                                                            <strong>{eq.cal?.calBy || 'Vender'}</strong>
                                                                        </div>
                                                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                                                            <span>เกณฑ์ยอมรับ (Tolerance):</span>
                                                                            <strong className="text-amber-700 dark:text-amber-400 font-bold">{eq.cal?.tolerance || eq.pm?.tolerance || 'Pass/Fail'}</strong>
                                                                        </div>
                                                                        <div className="pt-1 border-t border-emerald-100/80 dark:border-emerald-900/40">
                                                                            <span className="text-slate-500 block text-[11px] mb-0.5">รายการสอบเทียบ:</span>
                                                                            <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line text-xs font-medium bg-white/70 dark:bg-base-950 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                                                                {eq.cal?.items || 'ตามรายการและมาตรฐาน Calibration Certificate'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Column 3: 6-Step Workflow Status */}
                                                                <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1">
                                                                            <span>📋</span>
                                                                            <span>สถานะการติดตาม 6 สเต็ป</span>
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setActiveTrackingTarget({
                                                                                equipmentId: eq.id,
                                                                                equipmentNo: eq.equipmentNo,
                                                                                equipmentName: eq.equipmentName,
                                                                                trackingStatus: eq.trackingStatus || {
                                                                                    quotationRequested: false, prIssued: false, vendorScheduled: false,
                                                                                    certReceived: false, certDelivered: false, result: 'Pending'
                                                                                }
                                                                            })}
                                                                            className="text-[10px] font-extrabold text-indigo-600 hover:underline cursor-pointer"
                                                                        >
                                                                            แก้ไขสเต็ป ❯
                                                                        </button>
                                                                    </div>
                                                                    <div className="space-y-1.5 text-xs">
                                                                        <div className="flex items-center justify-between text-[11px]">
                                                                            <span>1. ขอใบเสนอราคา (Quotation):</span>
                                                                            <span className={eq.trackingStatus?.quotationRequested ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                                                                                {eq.trackingStatus?.quotationRequested ? '✓ เรียบร้อย' : 'รอดำเนินการ'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[11px]">
                                                                            <span>2. แจ้งออกใบ PR:</span>
                                                                            <span className={eq.trackingStatus?.prIssued ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                                                                                {eq.trackingStatus?.prIssued ? (eq.trackingStatus.prNo ? `✓ ${eq.trackingStatus.prNo}` : '✓ ออกแล้ว') : 'รอดำเนินการ'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[11px]">
                                                                            <span>3. นัดหมาย Vendor:</span>
                                                                            <span className={eq.trackingStatus?.vendorScheduled ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                                                                                {eq.trackingStatus?.vendorScheduled ? (eq.trackingStatus.scheduledDate ? `✓ ${eq.trackingStatus.scheduledDate}` : '✓ นัดแล้ว') : 'รอดำเนินการ'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[11px]">
                                                                            <span>4. รับใบเซอร์:</span>
                                                                            <span className={eq.trackingStatus?.certReceived ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                                                                                {eq.trackingStatus?.certReceived ? '✓ รับแล้ว' : 'รอดำเนินการ'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[11px]">
                                                                            <span>5. ส่งมอบใบเซอร์:</span>
                                                                            <span className={eq.trackingStatus?.certDelivered ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                                                                                {eq.trackingStatus?.certDelivered ? '✓ ส่งมอบแล้ว' : 'รอดำเนินการ'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200 dark:border-base-800">
                                                                            <span>6. สรุปผลการตรวจรับ:</span>
                                                                            <span className={`font-black ${
                                                                                eq.trackingStatus?.result === 'Pass' ? 'text-emerald-600' :
                                                                                eq.trackingStatus?.result === 'Fail' ? 'text-rose-600' : 'text-amber-600'
                                                                            }`}>
                                                                                {eq.trackingStatus?.result || 'Pending'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* FULL DETAIL INSPECTION MODAL (When clicking any Month Box or Machine) */}
            {inspectionTarget && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in"
                    onClick={() => setInspectionTarget(null)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-2xl">
                                    {inspectionTarget.highlightType === 'cal' ? '🎯' : '🛠️'}
                                </span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-extrabold text-sm px-2 py-0.5 bg-slate-100 dark:bg-base-800 rounded">
                                            {inspectionTarget.subComponent?.equipmentNo || inspectionTarget.equipment.equipmentNo}
                                        </span>
                                        {inspectionTarget.highlightMonth && (
                                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded">
                                                ประจำเดือน {formatMonthName(inspectionTarget.highlightMonth, 'short')}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-black text-base text-slate-900 dark:text-white mt-0.5">
                                        {inspectionTarget.subComponent?.equipmentName || inspectionTarget.equipment.equipmentName}
                                    </h3>
                                </div>
                            </div>
                            <button
                                onClick={() => setInspectionTarget(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Details content */}
                        <div className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-base-950 rounded-xl">
                                <div>
                                    <span className="text-slate-400 block text-[11px]">ผู้รับผิดชอบดูแล:</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                        {inspectionTarget.subComponent?.owner || inspectionTarget.equipment.owner}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[11px]">สถานที่ / ตำแหน่ง:</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                        {inspectionTarget.equipment.location || 'ห้องปฏิบัติการหลัก'}
                                    </span>
                                </div>
                            </div>

                            {/* Plan detail */}
                            <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                                <h4 className="font-bold text-indigo-900 dark:text-indigo-200">
                                    🛠️ แผนบำรุงรักษา (Preventive Maintenance - PM)
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">ความถี่:</span>
                                        <span className="font-bold">{formatFrequency((inspectionTarget.subComponent?.pm || inspectionTarget.equipment.pm)?.freqYear)}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">กำหนดเดือน (ย้าย/ยกเลิกได้):</span>
                                        <select
                                            value={normalizeMonth((inspectionTarget.subComponent?.pm || inspectionTarget.equipment.pm)?.lastPM) || '-'}
                                            onChange={e => handleQuickChangePlanMonth(
                                                inspectionTarget.equipment.id,
                                                'pm',
                                                e.target.value,
                                                !!inspectionTarget.subComponent,
                                                inspectionTarget.subComponent?.id
                                            )}
                                            className="mt-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-200 bg-white dark:bg-base-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1 cursor-pointer w-full"
                                        >
                                            <option value="-">- ไม่มี PM (ยกเลิก) -</option>
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">ผู้ดำเนินการ:</span>
                                        <span className="font-bold">{(inspectionTarget.subComponent?.pm || inspectionTarget.equipment.pm)?.pmBy || 'Vender'}</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] mb-0.5">รายการงานที่ทำ:</span>
                                    <p className="p-2 bg-white dark:bg-base-900 rounded border border-indigo-100 dark:border-indigo-900/30 whitespace-pre-line font-medium">
                                        {(inspectionTarget.subComponent?.pm || inspectionTarget.equipment.pm)?.items || 'ตามรายการมาตรฐานของ Vendor'}
                                    </p>
                                </div>
                            </div>

                            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/40 space-y-2">
                                <h4 className="font-bold text-emerald-900 dark:text-emerald-200">
                                    🎯 แผนสอบเทียบ (Calibration - Cal)
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">ความถี่:</span>
                                        <span className="font-bold">{formatFrequency((inspectionTarget.subComponent?.cal || inspectionTarget.equipment.cal)?.freqYear)}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">กำหนดเดือน (ย้าย/ยกเลิกได้):</span>
                                        <select
                                            value={normalizeMonth((inspectionTarget.subComponent?.cal || inspectionTarget.equipment.cal)?.lastCal) || '-'}
                                            onChange={e => handleQuickChangePlanMonth(
                                                inspectionTarget.equipment.id,
                                                'cal',
                                                e.target.value,
                                                !!inspectionTarget.subComponent,
                                                inspectionTarget.subComponent?.id
                                            )}
                                            className="mt-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-200 bg-white dark:bg-base-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-1 cursor-pointer w-full"
                                        >
                                            <option value="-">- ไม่มี Cal (ยกเลิก) -</option>
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">เกณฑ์ยอมรับ (Tolerance):</span>
                                        <span className="font-bold text-amber-700 dark:text-amber-300">
                                            {(inspectionTarget.subComponent?.cal || inspectionTarget.equipment.cal)?.tolerance || 'Pass/Fail'}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] mb-0.5">รายการสอบเทียบ:</span>
                                    <p className="p-2 bg-white dark:bg-base-900 rounded border border-emerald-100 dark:border-emerald-900/30 whitespace-pre-line font-medium">
                                        {(inspectionTarget.subComponent?.cal || inspectionTarget.equipment.cal)?.items || 'ตามรายการ Calibration'}
                                    </p>
                                </div>
                            </div>

                            {inspectionTarget.equipment.contactVender && (
                                <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl space-y-1">
                                    <span className="font-bold text-slate-700 dark:text-slate-300 block">📞 ข้อมูลการติดต่อ Vendor:</span>
                                    <p className="text-slate-600 dark:text-slate-400 whitespace-pre-line text-xs font-mono">
                                        {inspectionTarget.equipment.contactVender}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-base-800">
                            <button
                                type="button"
                                onClick={() => {
                                    const eq = inspectionTarget.equipment;
                                    setInspectionTarget(null);
                                    setSelectedEquipmentForHistory(eq);
                                }}
                                className="px-4 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200 rounded-xl font-bold hover:bg-indigo-100"
                            >
                                📜 ดูสมุดประวัติเครื่อง
                            </button>
                            <button
                                type="button"
                                onClick={() => setInspectionTarget(null)}
                                className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold"
                            >
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TRACKING 6-STEP WORKFLOW MODAL */}
            {activeTrackingTarget && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in"
                    onClick={() => setActiveTrackingTarget(null)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    อัปเดตกระดานติดตาม 6 สเต็ป
                                </h3>
                                <p className="text-xs text-slate-500 font-bold">
                                    {activeTrackingTarget.equipmentNo} - {activeTrackingTarget.equipmentName}
                                </p>
                            </div>
                            <button onClick={() => setActiveTrackingTarget(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">✕</button>
                        </div>

                        <form 
                            onSubmit={e => {
                                e.preventDefault();
                                handleSaveTrackingStatus(activeTrackingTarget.trackingStatus);
                            }}
                            className="space-y-3"
                        >
                            {/* Step 1 */}
                            <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTrackingTarget.trackingStatus.quotationRequested}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, quotationRequested: e.target.checked }
                                        })}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="font-bold text-xs text-slate-800 dark:text-white block">1. ขอใบเสนอราคา (Quotation) จาก Vendor</span>
                                        <span className="text-[11px] text-slate-400">ส่งคำขอหรือได้รับใบเสนอราคาจาก Vendor แล้ว</span>
                                    </div>
                                </label>
                                {activeTrackingTarget.trackingStatus.quotationRequested && (
                                    <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">เรียบร้อย</span>
                                )}
                            </div>

                            {/* Step 2 */}
                            <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={activeTrackingTarget.trackingStatus.prIssued}
                                            onChange={e => setActiveTrackingTarget({
                                                ...activeTrackingTarget,
                                                trackingStatus: { ...activeTrackingTarget.trackingStatus, prIssued: e.target.checked }
                                            })}
                                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div>
                                            <span className="font-bold text-xs text-slate-800 dark:text-white block">2. แจ้งออกใบ PR (Purchase Requisition)</span>
                                            <span className="text-[11px] text-slate-400">ขออนุมัติจัดซื้อ/เปิดใบสั่งซื้อในระบบ</span>
                                        </div>
                                    </label>
                                    {activeTrackingTarget.trackingStatus.prIssued && (
                                        <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">ออกแล้ว</span>
                                    )}
                                </div>
                                <div className="pl-8 flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500">เลขที่ PR:</span>
                                    <input
                                        type="text"
                                        placeholder="เช่น PR-69-10042"
                                        value={activeTrackingTarget.trackingStatus.prNo || ''}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, prNo: e.target.value }
                                        })}
                                        className="px-3 py-1 bg-white dark:bg-base-900 border rounded-lg text-xs font-semibold flex-1 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Step 3 */}
                            <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 space-y-2">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTrackingTarget.trackingStatus.vendorScheduled}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, vendorScheduled: e.target.checked }
                                        })}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="font-bold text-xs text-slate-800 dark:text-white block">3. นัดหมาย Vendor เข้ามาหน้างาน</span>
                                        <span className="text-[11px] text-slate-400">ยืนยันวันเข้าทำงานของช่าง</span>
                                    </div>
                                </label>
                                <div className="pl-8 flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500">วันที่นัด:</span>
                                    <input
                                        type="date"
                                        value={activeTrackingTarget.trackingStatus.scheduledDate || ''}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, scheduledDate: e.target.value }
                                        })}
                                        className="px-3 py-1 bg-white dark:bg-base-900 border rounded-lg text-xs font-semibold outline-none"
                                    />
                                </div>
                            </div>

                            {/* Step 4 */}
                            <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTrackingTarget.trackingStatus.certReceived}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, certReceived: e.target.checked }
                                        })}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="font-bold text-xs text-slate-800 dark:text-white block">4. รับใบเซอร์ (Certificate) จาก Vendor</span>
                                        <span className="text-[11px] text-slate-400">ได้รับเอกสาร Certificate ฉบับจริงแล้ว</span>
                                    </div>
                                </label>
                                {activeTrackingTarget.trackingStatus.certReceived && (
                                    <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">รับแล้ว</span>
                                )}
                            </div>

                            {/* Step 5 */}
                            <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTrackingTarget.trackingStatus.certDelivered}
                                        onChange={e => setActiveTrackingTarget({
                                            ...activeTrackingTarget,
                                            trackingStatus: { ...activeTrackingTarget.trackingStatus, certDelivered: e.target.checked }
                                        })}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="font-bold text-xs text-slate-800 dark:text-white block">5. ส่งมอบใบเซอร์ให้พนักงานดูแล</span>
                                        <span className="text-[11px] text-slate-400">ส่งต่อใบเซอร์ให้เจ้าของเครื่องมือ</span>
                                    </div>
                                </label>
                                {activeTrackingTarget.trackingStatus.certDelivered && (
                                    <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">ส่งมอบแล้ว</span>
                                )}
                            </div>

                            {/* Step 6 */}
                            <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 space-y-2">
                                <span className="font-bold text-xs text-slate-800 dark:text-white block">
                                    6. สรุปผลการตรวจรับ Cal / PM
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
                                            className={`py-1.5 rounded-xl text-xs font-bold border transition-all ${
                                                activeTrackingTarget.trackingStatus.result === res
                                                    ? res === 'Pass' ? 'bg-emerald-600 text-white border-emerald-600'
                                                    : res === 'Fail' ? 'bg-rose-600 text-white border-rose-600'
                                                    : res === 'Action Required' ? 'bg-amber-600 text-white border-amber-600'
                                                    : 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'bg-white dark:bg-base-900 text-slate-600 border-slate-200'
                                            }`}
                                        >
                                            {res}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setActiveTrackingTarget(null)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
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
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto animate-fade-in"
                    onClick={() => setIsEditModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-xl w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <h3 className="text-base font-black text-slate-900 dark:text-white">
                                {editingEquip.id ? 'แก้ไขข้อมูลเครื่องมือหลัก' : 'เพิ่มเครื่องมือหลักใหม่'}
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">✕</button>
                        </div>

                        <form onSubmit={handleSaveEquipment} className="space-y-3.5 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Equipment No. (รหัสเครื่อง)</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="เช่น PDS-1001"
                                        value={editingEquip.equipmentNo || ''}
                                        onChange={e => setEditingEquip({ ...editingEquip, equipmentNo: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">ผู้รับผิดชอบดูแล</label>
                                    <select
                                        value={editingEquip.owner || 'PORNTHAK'}
                                        onChange={e => setEditingEquip({ ...editingEquip, owner: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-bold"
                                    >
                                        {availableOwners.map(o => (
                                            <option key={o} value={o}>👤 {o}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">ชื่อเครื่องมือ (Equipment Name)</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="เช่น FTIR Tensor37, Melt Flow Index..."
                                    value={editingEquip.equipmentName || ''}
                                    onChange={e => setEditingEquip({ ...editingEquip, equipmentName: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-bold"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">สถานที่ตั้ง (Location)</label>
                                    <input
                                        type="text"
                                        placeholder="เช่น Lab 1, BC2, PCRD..."
                                        value={editingEquip.location || ''}
                                        onChange={e => setEditingEquip({ ...editingEquip, location: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">สถานะความพร้อม</label>
                                    <select
                                        value={editingEquip.status || 'ready'}
                                        onChange={e => setEditingEquip({ ...editingEquip, status: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-bold"
                                    >
                                        <option value="ready">🟢 พร้อมใช้งานปกติ (Ready)</option>
                                        <option value="issue">🚨 ชำรุด/แจ้งซ่อม (Issue)</option>
                                    </select>
                                </div>
                            </div>

                            {/* PM Settings */}
                            <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                                <h4 className="font-bold text-indigo-900 dark:text-indigo-200">🛠️ แผน PM (บำรุงรักษา)</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">เดือนที่ทำ PM</label>
                                        <select
                                            value={normalizeMonth(editingEquip.pm?.lastPM) || '-'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pmMonth: e.target.value,
                                                pm: {
                                                    ...(editingEquip.pm || {}),
                                                    freqYear: e.target.value === '-' ? '-' : (Number(editingEquip.pm?.freqYear) || 1),
                                                    lastPM: e.target.value,
                                                    nextPM: e.target.value
                                                }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        >
                                            <option value="-">- ไม่มี PM (ยกเลิก) -</option>
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">ความถี่ (ครั้ง/ปี)</label>
                                        <input
                                            type="number"
                                            value={editingEquip.pm?.freqYear === '-' ? 0 : (editingEquip.pm?.freqYear ?? 1)}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pm: { ...(editingEquip.pm || {}), freqYear: parseInt(e.target.value, 10) || 1 }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">ผู้ทำ PM</label>
                                        <input
                                            type="text"
                                            value={editingEquip.pm?.pmBy || 'Vender'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pm: { ...(editingEquip.pm || {}), pmBy: e.target.value }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 block">รายการที่ทำ PM</label>
                                    <textarea
                                        rows={2}
                                        value={editingEquip.pm?.items || ''}
                                        onChange={e => setEditingEquip({
                                            ...editingEquip,
                                            pm: { ...(editingEquip.pm || {}), items: e.target.value }
                                        })}
                                        className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg"
                                        placeholder="เช่น ตรวจสอบความสะอาด หล่อลื่นแกน..."
                                    />
                                </div>
                            </div>

                            {/* Cal Settings */}
                            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/40 space-y-2">
                                <h4 className="font-bold text-emerald-900 dark:text-emerald-200">🎯 แผน Cal (สอบเทียบ)</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">เดือนที่สอบเทียบ</label>
                                        <select
                                            value={normalizeMonth(editingEquip.cal?.lastCal) || '-'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                calMonth: e.target.value,
                                                cal: {
                                                    ...(editingEquip.cal || {}),
                                                    freqYear: e.target.value === '-' ? '-' : (Number(editingEquip.cal?.freqYear) || 1),
                                                    lastCal: e.target.value,
                                                    nextCal: e.target.value
                                                }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        >
                                            <option value="-">- ไม่มี Cal (ยกเลิก) -</option>
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">ความถี่ (ครั้ง/ปี)</label>
                                        <input
                                            type="number"
                                            value={editingEquip.cal?.freqYear === '-' ? 0 : (editingEquip.cal?.freqYear ?? 1)}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                cal: { ...(editingEquip.cal || {}), freqYear: parseInt(e.target.value, 10) || 1 }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">เกณฑ์ยอมรับ (Tolerance)</label>
                                        <input
                                            type="text"
                                            value={editingEquip.cal?.tolerance || 'Pass/Fail'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                cal: { ...(editingEquip.cal || {}), tolerance: e.target.value }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 block">รายการที่สอบเทียบ</label>
                                    <textarea
                                        rows={2}
                                        value={editingEquip.cal?.items || ''}
                                        onChange={e => setEditingEquip({
                                            ...editingEquip,
                                            cal: { ...(editingEquip.cal || {}), items: e.target.value }
                                        })}
                                        className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg"
                                        placeholder="เช่น อุณหภูมิ, แรงดึง, น้ำหนัก..."
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md cursor-pointer"
                                >
                                    บันทึกเครื่องมือหลัก
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT/CREATE SUB-EQUIPMENT MODAL */}
            {isSubModalOpen && editingSub && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto animate-fade-in"
                    onClick={() => setIsSubModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <h3 className="text-base font-black text-slate-900 dark:text-white">
                                {editingSub.isNew ? 'เพิ่มเครื่องพ่วงย่อย (+ Sub)' : 'แก้ไขเครื่องพ่วงย่อย'}
                            </h3>
                            <button onClick={() => setIsSubModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">✕</button>
                        </div>

                        <form onSubmit={handleSaveSubEquipment} className="space-y-3.5 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">รหัสเครื่องพ่วงย่อย</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingSub.sub.equipmentNo || ''}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: { ...editingSub.sub, equipmentNo: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">ผู้รับผิดชอบดูแล</label>
                                    <select
                                        value={editingSub.sub.owner || 'PORNTHAK'}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: { ...editingSub.sub, owner: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-bold"
                                    >
                                        {availableOwners.map(o => (
                                            <option key={o} value={o}>👤 {o}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">ชื่อเครื่องพ่วงย่อย</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="เช่น Specae-Heater (BC2), Weight 400 g..."
                                    value={editingSub.sub.equipmentName || ''}
                                    onChange={e => setEditingSub({
                                        ...editingSub,
                                        sub: { ...editingSub.sub, equipmentName: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border rounded-xl font-bold"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-2.5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 space-y-1.5">
                                    <span className="font-bold text-indigo-900 dark:text-indigo-200 block text-[11px]">🛠️ เดือน PM:</span>
                                    <select
                                        value={normalizeMonth(editingSub.sub.pm?.lastPM) || '-'}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: {
                                                ...editingSub.sub,
                                                pm: {
                                                    ...(editingSub.sub.pm || {}),
                                                    freqYear: e.target.value === '-' ? '-' : (Number(editingSub.sub.pm?.freqYear) || 1),
                                                    lastPM: e.target.value,
                                                    nextPM: e.target.value
                                                }
                                            }
                                        })}
                                        className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                    >
                                        <option value="-">- ไม่มี PM -</option>
                                        {MONTH_KEYS.map(m => (
                                            <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="p-2.5 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 space-y-1.5">
                                    <span className="font-bold text-emerald-900 dark:text-emerald-200 block text-[11px]">🎯 เดือน Cal:</span>
                                    <select
                                        value={normalizeMonth(editingSub.sub.cal?.lastCal) || '-'}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: {
                                                ...editingSub.sub,
                                                cal: {
                                                    ...(editingSub.sub.cal || {}),
                                                    freqYear: e.target.value === '-' ? '-' : (Number(editingSub.sub.cal?.freqYear) || 1),
                                                    lastCal: e.target.value,
                                                    nextCal: e.target.value
                                                }
                                            }
                                        })}
                                        className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                    >
                                        <option value="-">- ไม่มี Cal -</option>
                                        {MONTH_KEYS.map(m => (
                                            <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Set A/B & Multi-Year Cycle Settings for Sub-Equipment */}
                            <div className="p-2.5 bg-purple-50/50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/40 grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[10px] font-bold text-purple-900 dark:text-purple-200 block mb-1">กลุ่มชุดสลับ (Set A/B)</label>
                                    <select
                                        value={inferEquipmentSetGroup(editingSub.sub.equipmentName, editingSub.sub.setGroup) || 'None'}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: { ...editingSub.sub, setGroup: e.target.value }
                                        })}
                                        className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                    >
                                        <option value="None">- ไม่แบ่งชุด -</option>
                                        <option value="A">🅰️ ชุด A (Set A)</option>
                                        <option value="B">🅱️ ชุด B (Set B)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-purple-900 dark:text-purple-200 block mb-1">รอบปีที่ส่ง Cal</label>
                                    <select
                                        value={editingSub.sub.cal?.intervalYears || 1}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: {
                                                ...editingSub.sub,
                                                cal: { ...(editingSub.sub.cal || {}), intervalYears: parseInt(e.target.value, 10) || 1 }
                                            }
                                        })}
                                        className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                    >
                                        <option value={1}>ส่งทุกปี (1 ปี/ครั้ง)</option>
                                        <option value={2}>ทุก 2 ปี (สลับปีเว้นปี)</option>
                                        <option value={3}>ทุก 3 ปี (3 ปี/ครั้ง)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-purple-900 dark:text-purple-200 block mb-1">ปีตั้งต้นที่ส่ง Cal</label>
                                    <select
                                        value={editingSub.sub.cal?.baseYear || 2026}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: {
                                                ...editingSub.sub,
                                                cal: { ...(editingSub.sub.cal || {}), baseYear: parseInt(e.target.value, 10) || 2026 }
                                            }
                                        })}
                                        className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                    >
                                        <option value={2025}>ปีคี่ (2025, 2027...)</option>
                                        <option value={2026}>ปีคู่ (2026, 2028...)</option>
                                        <option value={2027}>เริ่มปี 2027</option>
                                        <option value={2028}>เริ่มปี 2028</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">เกณฑ์ยอมรับ (Tolerance)</label>
                                <input
                                    type="text"
                                    value={editingSub.sub.cal?.tolerance || editingSub.sub.pm?.tolerance || ''}
                                    onChange={e => setEditingSub({
                                        ...editingSub,
                                        sub: {
                                            ...editingSub.sub,
                                            cal: { ...(editingSub.sub.cal || {}), tolerance: e.target.value },
                                            pm: { ...(editingSub.sub.pm || {}), tolerance: e.target.value }
                                        }
                                    })}
                                    placeholder="เช่น ± 5 °C, ± 5 um..."
                                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-base-950 border rounded-xl font-bold"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsSubModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md cursor-pointer"
                                >
                                    บันทึกเครื่องพ่วงย่อย
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SMART BATCH GROUP MOVE & SET A/B MOVE MODAL */}
            {batchMoveModal && (
                <div
                    className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center z-[125] p-4 animate-fade-in"
                    onClick={() => setBatchMoveModal(null)}
                >
                    <div
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[92vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-600 rounded-2xl border border-amber-200 dark:border-amber-800">
                                    ⇄
                                </span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-extrabold text-xs px-2 py-0.5 bg-slate-100 dark:bg-base-800 rounded border border-slate-300 dark:border-base-700">
                                            {batchMoveModal.equipment.equipmentNo}
                                        </span>
                                        <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded">
                                            ย้ายเดือนแบบยกชุด / เลือกชุดย่อย
                                        </span>
                                    </div>
                                    <h3 className="font-black text-base text-slate-900 dark:text-white mt-0.5">
                                        {batchMoveModal.equipment.equipmentName}
                                    </h3>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setBatchMoveModal(null)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Step 1: Choose Target Month (or Cancel Plan) */}
                        <div className="space-y-2">
                            <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block">
                                1. เลือกเดือนปลายทางที่ต้องการย้ายไป (หรือเลือกยกเลิกแผน):
                            </label>
                            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                                {MONTH_KEYS.map(m => {
                                    const active = batchMoveModal.toMonth === m;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setBatchMoveModal({ ...batchMoveModal, toMonth: m })}
                                            className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                                                active
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm scale-102'
                                                    : 'bg-slate-50 dark:bg-base-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-base-800 hover:border-indigo-300'
                                            }`}
                                        >
                                            <div>{MONTH_INFO_MAP[m].thShort}</div>
                                            <div className={`text-[9px] font-mono ${active ? 'text-indigo-200' : 'text-slate-400'}`}>{m}</div>
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => setBatchMoveModal({ ...batchMoveModal, toMonth: '-' })}
                                    className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer col-span-2 ${
                                        batchMoveModal.toMonth === '-'
                                            ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                            : 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                                    }`}
                                >
                                    🗑️ ยกเลิกแผน (-)
                                </button>
                            </div>
                        </div>

                        {/* Step 2: Choose Plan Type (PM / Cal / Both) */}
                        <div className="space-y-2">
                            <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block">
                                2. เลือกประเภทแผนที่ต้องการย้าย:
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'both', label: '🛠️ PM + 🎯 Cal พร้อมกัน', desc: 'ย้ายทั้งแผน PM และ Cal (แนะนำ)' },
                                    { id: 'pm', label: '🛠️ เฉพาะแผน PM', desc: 'ย้ายเฉพาะเดือนทำ PM' },
                                    { id: 'cal', label: '🎯 เฉพาะแผน Cal', desc: 'ย้ายเฉพาะเดือนส่งสอบเทียบ' },
                                ].map(opt => {
                                    const active = batchMoveModal.planType === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setBatchMoveModal({ ...batchMoveModal, planType: opt.id as any })}
                                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                                active
                                                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-500 text-indigo-950 dark:text-white ring-1 ring-indigo-500'
                                                    : 'bg-slate-50 dark:bg-base-950 border-slate-200 dark:border-base-800 text-slate-700 dark:text-slate-300'
                                            }`}
                                        >
                                            <div className="text-xs font-black">{opt.label}</div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Step 3: Choose Scope (All / Primary Only / Set A / Set B / Custom Checkboxes) */}
                        {(batchMoveModal.equipment.subEquipments?.length || 0) > 0 && (() => {
                            const subs = batchMoveModal.equipment.subEquipments || [];
                            const setACount = subs.filter(s => inferEquipmentSetGroup(s.equipmentName, s.setGroup) === 'A').length;
                            const setBCount = subs.filter(s => inferEquipmentSetGroup(s.equipmentName, s.setGroup) === 'B').length;

                            return (
                                <div className="space-y-2.5">
                                    <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block">
                                        3. เลือกขอบเขตเครื่องมือในชุดที่จะย้าย ({subs.length} เครื่องพ่วงย่อย):
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {[
                                            { id: 'all', label: `📦 ย้ายทั้งชุด (หลัก + พ่วง ${subs.length})`, show: true },
                                            { id: 'primary_only', label: '🖥️ เฉพาะเครื่องหลักเท่านั้น', show: true },
                                            { id: 'subs_all', label: `🔗 เฉพาะเครื่องพ่วงทั้งหมด (${subs.length})`, show: true },
                                            { id: 'set_a', label: `🅰️ เฉพาะชุด A (${setACount} รายการ)`, show: setACount > 0 },
                                            { id: 'set_b', label: `🅱️ เฉพาะชุด B (${setBCount} รายการ)`, show: setBCount > 0 },
                                            { id: 'custom', label: '☑️ ติ๊กเลือกรายการย่อยเอง...', show: true },
                                        ].filter(o => o.show).map(opt => {
                                            const active = batchMoveModal.scope === opt.id;
                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => setBatchMoveModal({ ...batchMoveModal, scope: opt.id as any })}
                                                    className={`p-2 rounded-xl border text-left text-xs font-extrabold transition-all cursor-pointer ${
                                                        active
                                                            ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-950 dark:text-amber-200 ring-1 ring-amber-500'
                                                            : 'bg-slate-50 dark:bg-base-950 border-slate-200 dark:border-base-800 text-slate-700 dark:text-slate-300'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Custom Checklist when scope === 'custom' */}
                                    {batchMoveModal.scope === 'custom' && (
                                        <div className="p-3 bg-slate-50 dark:bg-base-950 rounded-2xl border border-slate-200 dark:border-base-800 space-y-2 max-h-56 overflow-y-auto">
                                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-base-800">
                                                <label className="flex items-center gap-2 text-xs font-extrabold cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={batchMoveModal.includePrimaryInCustom}
                                                        onChange={e => setBatchMoveModal({
                                                            ...batchMoveModal,
                                                            includePrimaryInCustom: e.target.checked
                                                        })}
                                                        className="w-4 h-4 rounded text-indigo-600"
                                                    />
                                                    <span>รวมเครื่องหลัก ({batchMoveModal.equipment.equipmentNo} - {batchMoveModal.equipment.equipmentName})</span>
                                                </label>
                                                <div className="flex items-center gap-2 text-[11px]">
                                                    <button
                                                        type="button"
                                                        onClick={() => setBatchMoveModal({
                                                            ...batchMoveModal,
                                                            selectedSubIds: new Set(subs.map(s => s.id))
                                                        })}
                                                        className="text-indigo-600 font-bold hover:underline cursor-pointer"
                                                    >
                                                        เลือกพ่วงทั้งหมด
                                                    </button>
                                                    <span>·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setBatchMoveModal({
                                                            ...batchMoveModal,
                                                            selectedSubIds: new Set()
                                                        })}
                                                        className="text-slate-500 font-bold hover:underline cursor-pointer"
                                                    >
                                                        ล้างทั้งหมด
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                {subs.map(sub => {
                                                    const checked = batchMoveModal.selectedSubIds.has(sub.id);
                                                    const setG = inferEquipmentSetGroup(sub.equipmentName, sub.setGroup);
                                                    return (
                                                        <label
                                                            key={sub.id}
                                                            className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border text-xs cursor-pointer ${
                                                                checked
                                                                    ? 'bg-white dark:bg-base-900 border-indigo-300 dark:border-indigo-700 font-bold'
                                                                    : 'bg-transparent border-slate-200 dark:border-base-800 opacity-75'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 truncate">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={e => {
                                                                        const next = new Set(batchMoveModal.selectedSubIds);
                                                                        if (e.target.checked) next.add(sub.id);
                                                                        else next.delete(sub.id);
                                                                        setBatchMoveModal({ ...batchMoveModal, selectedSubIds: next });
                                                                    }}
                                                                    className="w-3.5 h-3.5 rounded text-indigo-600"
                                                                />
                                                                <span className="font-mono text-[11px] text-indigo-700 dark:text-indigo-300">{sub.equipmentNo}</span>
                                                                <span className="truncate">{sub.equipmentName}</span>
                                                            </div>
                                                            {setG && (
                                                                <span className={`text-[9px] font-black px-1.5 rounded shrink-0 ${
                                                                    setG === 'A' ? 'bg-indigo-100 text-indigo-800' : 'bg-purple-100 text-purple-800'
                                                                }`}>
                                                                    ชุด {setG}
                                                                </span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-base-800">
                            <span className="text-xs text-slate-500 font-medium">
                                เป้าหมายปลายทาง:{' '}
                                <strong className="text-indigo-600 dark:text-indigo-400">
                                    {batchMoveModal.toMonth === '-' ? 'ยกเลิกแผน (-)' : `เดือน ${formatMonthName(batchMoveModal.toMonth, 'short')} (${batchMoveModal.toMonth})`}
                                </strong>
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBatchMoveModal(null)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExecuteBatchMove}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer active:scale-95 transition-all"
                                >
                                    ✅ ยืนยันย้ายเดือนตามที่เลือก
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ENTERPRISE ISO/IEC 17025 ALTERNATING SET A/B & MULTI-YEAR ROTATION MANAGER MODAL */}
            {isRotationModalOpen && (() => {
                const targetEq = equipments.find(e => e.id === selectedRotationEqId) || equipments[0];
                const multiSetCandidates = equipments.filter(e =>
                    e.equipmentNo === 'PDS-1009' ||
                    e.equipmentNo === 'PDS-1007' ||
                    (e.subEquipments || []).some(s => inferEquipmentSetGroup(s.equipmentName, s.setGroup) !== null) ||
                    (e.subEquipments?.length || 0) > 0
                );

                return (
                    <div
                        className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center z-[125] p-4 animate-fade-in"
                        onClick={() => setIsRotationModalOpen(false)}
                    >
                        <div
                            className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-5xl w-full border border-slate-200 dark:border-base-800 space-y-4 max-h-[92vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between border-b pb-3 border-slate-100 dark:border-base-800">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl p-2.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-2xl">
                                        🔄
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800">
                                                ISO/IEC 17025 Split-Set & Multi-Year Calibration Matrix
                                            </span>
                                            <span className="text-xs font-bold text-slate-500">
                                                มาตรฐานระบบบริหารแผนสอบเทียบระดับโรงงาน (SAP PM / Maximo Standard)
                                            </span>
                                        </div>
                                        <h3 className="font-black text-base text-slate-900 dark:text-white mt-0.5">
                                            ระบบจัดการเครื่องมือผลัดกันใช้งาน (ชุด A / ชุด B) และเครื่องมือที่ไม่ได้ส่ง Cal ทุกปี (รอบ 2–3 ปี)
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsRotationModalOpen(false)}
                                    className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Best Practice Explanation Banner for Planner */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-base-950 p-3.5 rounded-2xl border border-slate-200 dark:border-base-800 text-xs">
                                <div className="p-2.5 bg-white dark:bg-base-900 rounded-xl border border-slate-200/80 dark:border-base-800">
                                    <div className="font-black text-indigo-700 dark:text-indigo-300 mb-1">
                                        1️⃣ หลักการ Split-Set Rotation (ชุด A / ชุด B)
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        เครื่องมือที่มีหลายชิ้นเป็นชุด เช่น <strong>Test Sieve (ชุด A 17 อัน / ชุด B 17 อัน)</strong> หรือ <strong>Density Float (ชุด A / ชุด B)</strong> ระบบใหญ่จะผูก <strong>รอบส่ง 2 ปี (Biennial)</strong> โดยให้ <strong>ปีคู่ส่งชุดหนึ่ง และปีคี่ส่งอีกชุดหนึ่ง</strong> เพื่อไม่ให้ห้องแล็บต้องหยุดงานตอนส่ง Cal
                                    </p>
                                </div>
                                <div className="p-2.5 bg-white dark:bg-base-900 rounded-xl border border-slate-200/80 dark:border-base-800">
                                    <div className="font-black text-emerald-700 dark:text-emerald-300 mb-1">
                                        2️⃣ แยกสีในปฏิทินชัดเจน ไม่ให้ Planner สับสน
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        ชุดที่ <strong>ถึงรอบต้องส่งในปีที่เลือก</strong> จะแสดงกล่องสีเขียว <span className="px-1 bg-emerald-100 text-emerald-800 rounded font-bold">🎯 Cal (A/B)</span> และนับเข้ายอดงานประจำเดือน ส่วนชุดที่ <strong>ไม่ได้ส่งในปีนั้น</strong> จะขึ้นป้ายเส้นประ <span className="px-1 bg-amber-100 text-amber-800 rounded font-bold">⏸️ เว้นปี 2026 · Cal ปี 2027</span>
                                    </p>
                                </div>
                                <div className="p-2.5 bg-white dark:bg-base-900 rounded-xl border border-slate-200/80 dark:border-base-800">
                                    <div className="font-black text-purple-700 dark:text-purple-300 mb-1">
                                        3️⃣ ตารางพยากรณ์ล่วงหน้า 4 ปี (2025–2028)
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        ด้านล่างแสดงตารางเทียบ 4 ปีข้างกัน (<strong>2025 | 2026 | 2027 | 2028</strong>) ให้เห็นทันทีว่าชุดไหนส่งปีไหน และกดปุ่มลัดตั้งค่าทั้งชุดได้ในคลิกเดียว
                                    </p>
                                </div>
                            </div>

                            {/* Equipment Selector + Quick Jump Pills for Sieve / Density */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-indigo-50/50 dark:bg-indigo-950/30 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">เลือกเครื่องมือที่ต้องการตั้งค่ารอบสลับ:</span>
                                    <select
                                        value={targetEq?.id || ''}
                                        onChange={e => setSelectedRotationEqId(e.target.value)}
                                        className="px-3 py-1.5 bg-white dark:bg-base-900 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer"
                                    >
                                        {equipments.map(e => (
                                            <option key={e.id} value={e.id}>
                                                {e.equipmentNo} — {e.equipmentName} {(e.subEquipments?.length || 0) > 0 ? `(มี ${e.subEquipments?.length} พ่วงย่อย)` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-bold text-slate-500">ปุ่มลัดชุด A/B หลัก:</span>
                                    {multiSetCandidates.slice(0, 5).map(cand => (
                                        <button
                                            key={cand.id}
                                            type="button"
                                            onClick={() => setSelectedRotationEqId(cand.id)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer ${
                                                targetEq?.id === cand.id
                                                    ? 'bg-purple-600 text-white border-purple-600'
                                                    : 'bg-white dark:bg-base-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-base-700 hover:border-purple-400'
                                            }`}
                                        >
                                            {cand.equipmentNo} ({cand.equipmentName.slice(0, 18)})
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {targetEq && (
                                <>
                                    {/* 1-Click Rotation Preset Buttons */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                ⚡ ตั้งค่ารอบส่งสอบเทียบอัตโนมัติทั้งชุดสำหรับ <span className="text-indigo-600">{targetEq.equipmentNo} ({targetEq.equipmentName})</span>:
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleApplyRotationPreset(targetEq, 'ab_2yr_b2026_a2027')}
                                                className="p-2.5 rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50/70 hover:bg-purple-100 dark:bg-purple-950/50 text-left transition-all cursor-pointer"
                                            >
                                                <div className="text-xs font-black text-purple-900 dark:text-purple-200">🔄 สลับ A/B (ปี 2026 ส่งชุด B)</div>
                                                <div className="text-[10px] text-purple-700 dark:text-purple-300 mt-0.5">
                                                    รอบ 2 ปี: ปีคู่ (2026, 2028) ส่งชุด B · ปีคี่ (2025, 2027) ส่งชุด A (ตามประวัติ Sieve ล่าสุด)
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleApplyRotationPreset(targetEq, 'ab_2yr_a2026_b2027')}
                                                className="p-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/50 text-left transition-all cursor-pointer"
                                            >
                                                <div className="text-xs font-black text-indigo-900 dark:text-indigo-200">🔄 สลับ A/B (ปี 2026 ส่งชุด A)</div>
                                                <div className="text-[10px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                                                    รอบ 2 ปี: ปีคู่ (2026, 2028) ส่งชุด A · ปีคี่ (2025, 2027) ส่งชุด B
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleApplyRotationPreset(targetEq, 'all_2yr_2026')}
                                                className="p-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 hover:bg-amber-100 dark:bg-amber-950/50 text-left transition-all cursor-pointer"
                                            >
                                                <div className="text-xs font-black text-amber-900 dark:text-amber-200">📅 ส่งทุก 2 ปี (เริ่มส่งปี 2026)</div>
                                                <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                                                    ส่งปี 2026 → เว้นปี 2027 → ส่งอีกทีปี 2028
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleApplyRotationPreset(targetEq, 'all_3yr_2026')}
                                                className="p-2.5 rounded-xl border border-teal-300 dark:border-teal-800 bg-teal-50/70 hover:bg-teal-100 dark:bg-teal-950/50 text-left transition-all cursor-pointer"
                                            >
                                                <div className="text-xs font-black text-teal-900 dark:text-teal-200">🗓️ ส่งทุก 3 ปี (เริ่มส่งปี 2026)</div>
                                                <div className="text-[10px] text-teal-700 dark:text-teal-300 mt-0.5">
                                                    ส่งปี 2026 → เว้นปี 2027–2028 → ส่งปี 2029
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleApplyRotationPreset(targetEq, 'every_year')}
                                                className="p-2.5 rounded-xl border border-slate-300 dark:border-base-700 bg-slate-50 hover:bg-slate-100 dark:bg-base-950 text-left transition-all cursor-pointer"
                                            >
                                                <div className="text-xs font-black text-slate-800 dark:text-slate-200">🟢 ส่งทุกปีตามปกติ (1 ปี/ครั้ง)</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    ส่งสอบเทียบทุกปีทั้งชุด A และชุด B
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 4-YEAR MULTI-YEAR TIMELINE MATRIX TABLE (2025 | 2026 | 2027 | 2028) */}
                                    <div className="border border-slate-200 dark:border-base-800 rounded-2xl overflow-hidden">
                                        <div className="max-h-[380px] overflow-y-auto">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead className="bg-slate-100 dark:bg-base-950 text-slate-700 dark:text-slate-200 sticky top-0 z-10 border-b border-slate-200 dark:border-base-800">
                                                    <tr>
                                                        <th className="p-2.5 font-extrabold">รหัส / ชื่อรายการ</th>
                                                        <th className="p-2.5 font-extrabold text-center">เดือนแผน Cal</th>
                                                        <th className="p-2.5 font-extrabold text-center">ชุด (Set A/B)</th>
                                                        <th className="p-2.5 font-extrabold text-center">ความถี่รอบปี</th>
                                                        <th className="p-2.5 font-extrabold text-center">ปีตั้งต้น</th>
                                                        {[2025, 2026, 2027, 2028].map(yr => (
                                                            <th
                                                                key={yr}
                                                                className={`p-2.5 font-black text-center border-l border-slate-200 dark:border-base-800 ${
                                                                    planningYear === yr ? 'bg-indigo-100/80 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200' : ''
                                                                }`}
                                                            >
                                                                ปี {yr} {yr === 2026 ? '(ปีนี้)' : ''}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-base-800">
                                                    {/* Primary row if it has Cal or no subs */}
                                                    {(getMonthsForPlan(targetEq.cal, targetEq.calMonth).size > 0 || (targetEq.subEquipments?.length || 0) === 0) && (() => {
                                                        const pSet = inferEquipmentSetGroup(targetEq.equipmentName, targetEq.setGroup);
                                                        const pMonth = normalizeMonth(targetEq.cal?.lastCal || targetEq.cal?.nextCal) || '-';
                                                        const pInterval = targetEq.cal?.intervalYears || 1;
                                                        const pBaseYear = targetEq.cal?.baseYear || 2026;

                                                        return (
                                                            <tr className="bg-indigo-50/20 dark:bg-indigo-950/10 font-bold">
                                                                <td className="p-2.5">
                                                                    <span className="font-mono text-indigo-700 dark:text-indigo-300 mr-1.5">{targetEq.equipmentNo}</span>
                                                                    <span>{targetEq.equipmentName} (เครื่องหลัก)</span>
                                                                </td>
                                                                <td className="p-2.5 text-center font-mono">{pMonth}</td>
                                                                <td className="p-2.5 text-center">
                                                                    <select
                                                                        value={pSet || 'None'}
                                                                        onChange={e => handleUpdateSingleItemCycle(targetEq, false, undefined, { setGroup: e.target.value })}
                                                                        className="px-2 py-1 bg-white dark:bg-base-900 border rounded-lg text-[11px] font-bold"
                                                                    >
                                                                        <option value="None">- ไม่แบ่ง -</option>
                                                                        <option value="A">🅰️ ชุด A</option>
                                                                        <option value="B">🅱️ ชุด B</option>
                                                                    </select>
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <select
                                                                        value={pInterval}
                                                                        onChange={e => handleUpdateSingleItemCycle(targetEq, false, undefined, { intervalYears: parseInt(e.target.value, 10) })}
                                                                        className="px-2 py-1 bg-white dark:bg-base-900 border rounded-lg text-[11px] font-bold"
                                                                    >
                                                                        <option value={1}>ทุก 1 ปี</option>
                                                                        <option value={2}>ทุก 2 ปี (ปีเว้นปี)</option>
                                                                        <option value={3}>ทุก 3 ปี</option>
                                                                    </select>
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <select
                                                                        value={pBaseYear}
                                                                        onChange={e => handleUpdateSingleItemCycle(targetEq, false, undefined, { baseYear: parseInt(e.target.value, 10) })}
                                                                        className="px-2 py-1 bg-white dark:bg-base-900 border rounded-lg text-[11px] font-bold"
                                                                    >
                                                                        <option value={2025}>2025 (ปีคี่)</option>
                                                                        <option value={2026}>2026 (ปีคู่)</option>
                                                                        <option value={2027}>2027</option>
                                                                        <option value={2028}>2028</option>
                                                                    </select>
                                                                </td>
                                                                {[2025, 2026, 2027, 2028].map(yr => {
                                                                    const st = getMultiYearCycleStatus(targetEq.cal, yr, pSet);
                                                                    return (
                                                                        <td key={yr} className="p-2 text-center border-l border-slate-100 dark:border-base-800">
                                                                            {st.isDueInYear ? (
                                                                                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 rounded-md text-[10px] font-black border border-emerald-300">
                                                                                    🟢 ส่ง Cal ({pMonth})
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 rounded-md text-[10px] font-bold border border-dashed border-amber-300">
                                                                                    ⏸️ เว้นรอบ (ใช้งาน)
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })()}

                                                    {/* Sub-equipment rows */}
                                                    {(targetEq.subEquipments || []).map(sub => {
                                                        const sSet = inferEquipmentSetGroup(sub.equipmentName, sub.setGroup);
                                                        const sMonth = normalizeMonth(sub.cal?.lastCal || sub.cal?.nextCal) || '-';
                                                        const sInterval = sub.cal?.intervalYears || 1;
                                                        const sBaseYear = sub.cal?.baseYear || (sSet === 'A' && sInterval > 1 ? 2025 : 2026);

                                                        return (
                                                            <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-base-800/40">
                                                                <td className="p-2.5">
                                                                    <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 mr-1.5">{sub.equipmentNo}</span>
                                                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{sub.equipmentName}</span>
                                                                </td>
                                                                <td className="p-2.5 text-center font-mono font-bold">{sMonth}</td>
                                                                <td className="p-2.5 text-center">
                                                                    <select
                                                                        value={sSet || 'None'}
                                                                        onChange={e => handleUpdateSingleItemCycle(targetEq, true, sub.id, { setGroup: e.target.value })}
                                                                        className={`px-2 py-1 rounded-lg text-[11px] font-black border ${
                                                                            sSet === 'A'
                                                                                ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                                                                                : sSet === 'B'
                                                                                    ? 'bg-purple-50 text-purple-800 border-purple-300'
                                                                                    : 'bg-white text-slate-600 border-slate-200'
                                                                        }`}
                                                                    >
                                                                        <option value="None">- ไม่แบ่ง -</option>
                                                                        <option value="A">🅰️ ชุด A</option>
                                                                        <option value="B">🅱️ ชุด B</option>
                                                                    </select>
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <select
                                                                        value={sInterval}
                                                                        onChange={e => handleUpdateSingleItemCycle(targetEq, true, sub.id, { intervalYears: parseInt(e.target.value, 10) })}
                                                                        className="px-2 py-1 bg-white dark:bg-base-900 border rounded-lg text-[11px] font-bold"
                                                                    >
                                                                        <option value={1}>ทุก 1 ปี</option>
                                                                        <option value={2}>ทุก 2 ปี (สลับปี)</option>
                                                                        <option value={3}>ทุก 3 ปี</option>
                                                                    </select>
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <select
                                                                        value={sBaseYear}
                                                                        onChange={e => handleUpdateSingleItemCycle(targetEq, true, sub.id, { baseYear: parseInt(e.target.value, 10) })}
                                                                        className="px-2 py-1 bg-white dark:bg-base-900 border rounded-lg text-[11px] font-bold"
                                                                    >
                                                                        <option value={2025}>2025 (ปีคี่)</option>
                                                                        <option value={2026}>2026 (ปีคู่)</option>
                                                                        <option value={2027}>2027</option>
                                                                        <option value={2028}>2028</option>
                                                                    </select>
                                                                </td>
                                                                {[2025, 2026, 2027, 2028].map(yr => {
                                                                    const st = getMultiYearCycleStatus(sub.cal, yr, sSet);
                                                                    return (
                                                                        <td key={yr} className="p-2 text-center border-l border-slate-100 dark:border-base-800">
                                                                            {st.isDueInYear ? (
                                                                                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 rounded-md text-[10px] font-black border border-emerald-300">
                                                                                    🟢 ส่ง Cal ({sMonth})
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 rounded-md text-[10px] font-bold border border-dashed border-amber-300">
                                                                                    ⏸️ เว้นรอบ (ชุดสลับ)
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-base-800">
                                <span className="text-xs text-slate-500">
                                    💡 ทันทีที่ตั้งค่า ระบบจะแสดงป้าย <strong>ชุด A / ชุด B</strong> และแยกสถานะ <strong>🟢 ถึงรอบส่งปีนี้</strong> กับ <strong>⏸️ เว้นรอบ (Cal ปีหน้า)</strong> บนตารางปฏิทิน 12 เดือนโดยอัตโนมัติ
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsRotationModalOpen(false)}
                                    className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black cursor-pointer"
                                >
                                    เสร็จสิ้น / ปิดหน้าต่าง
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* DELETE CONFIRMATION MODAL */}
            {deleteConfirm && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-fade-in"
                    onClick={() => setDeleteConfirm(null)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-200 dark:border-base-800 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-3xl p-2 bg-rose-50 text-rose-600 rounded-2xl">🗑️</span>
                            <div>
                                <h3 className="font-black text-slate-900 dark:text-white text-base">ยืนยันการลบรายการ</h3>
                                <p className="text-xs text-slate-500 font-bold">{deleteConfirm.name}</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                            คุณแน่ใจหรือไม่ว่าต้องการลบรายการเครื่องมือนี้? การกระทำนี้ไม่สามารถย้อนกลับได้
                        </p>
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-base-800">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                            >
                                ยืนยันลบ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QUICK RESOLVE BREAKDOWN MODAL */}
            {equipmentToResolve && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in"
                    onClick={() => setEquipmentToResolve(null)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 rounded-3xl p-6 shadow-2xl max-w-md w-full border border-slate-200 dark:border-base-800 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-3xl p-2.5 bg-emerald-100 dark:bg-emerald-950/60 rounded-2xl">🟢</span>
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">คืนสภาพเครื่องมือพร้อมใช้งาน</h3>
                                <p className="text-xs text-slate-500 font-bold">{equipmentToResolve.equipmentNo} - {equipmentToResolve.equipmentName}</p>
                            </div>
                        </div>

                        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 space-y-1.5 text-xs">
                            <p className="text-emerald-950 dark:text-emerald-200 font-bold">
                                ยืนยันว่าเครื่องมือนี้ได้รับการ <strong>ซ่อมแซมเสร็จสมบูรณ์ ตรวจรับเรียบร้อยแล้ว</strong> ใช่หรือไม่?
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                                ระบบจะปิดงานซ่อม บันทึกลงประวัติ และเปลี่ยนสถานะเครื่องกลับเป็น <strong className="underline">พร้อมใช้งานตามปกติ (Ready 100%)</strong> ทันที
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-base-800">
                            <button
                                type="button"
                                onClick={() => setEquipmentToResolve(null)}
                                className="px-4 py-2.5 bg-slate-100 dark:bg-base-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                disabled={isResolvingQuick}
                                onClick={() => handleResolveEquipmentInTab(equipmentToResolve)}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                            >
                                {isResolvingQuick ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>กำลังบันทึก...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircleIcon className="h-4 w-4" />
                                        <span>✅ ยืนยันคืนสภาพพร้อมใช้งาน (Resolve)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DEDICATED EQUIPMENT HISTORY & LOGBOOK MODAL */}
            <EquipmentHistoryModal
                isOpen={!!activeEquipmentForHistory}
                equipment={activeEquipmentForHistory}
                allEquipments={equipments.filter(e => !e.equipmentNo?.includes('/'))}
                onSelectEquipment={(eq) => setSelectedEquipmentForHistory(eq)}
                onClose={() => setSelectedEquipmentForHistory(null)}
                onSaveEquipment={async (updated: Equipment) => {
                    const { saveEquipment } = await import('../services/dataService');
                    await saveEquipment(updated);
                    await loadData();
                    setSelectedEquipmentForHistory(updated);
                    onEquipmentUpdated();
                }}
            />
        </div>
    );
};

export default EquipmentTab;
