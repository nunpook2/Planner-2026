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
import { MONTH_KEYS, MONTH_INFO_MAP, normalizeMonth, formatMonthName, formatFrequency } from '../utils/monthUtils';
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
    
    const rawMonths = [
        (details as any)?.nextCal || (details as any)?.nextPM,
        (details as any)?.lastCal || (details as any)?.lastPM,
        fallbackMonth
    ].filter(Boolean);

    for (const raw of rawMonths) {
        const rawStr = String(raw).trim();
        if (!rawStr || rawStr === '-' || rawStr.toLowerCase() === 'n/a') continue;
        
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
    }

    const freq = typeof details?.freqYear === 'number' ? details.freqYear : parseFloat(String(details?.freqYear || '1'));
    if (!isNaN(freq) && freq > 1 && months.size > 0) {
        const baseMonths = Array.from(months);
        for (const base of baseMonths) {
            const baseIdx = MONTH_KEYS.indexOf(base as any);
            if (baseIdx !== -1) {
                if (freq === 2) {
                    months.add(MONTH_KEYS[(baseIdx + 6) % 12]);
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
    
    // Accordion states:
    // 1. Expanded sub-components for primary equipments
    const [expandedEquipIds, setExpandedEquipIds] = useState<Set<string>>(new Set());
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
            const hasUnnormalizedOrJunk = propEquipments.some(e => {
                const rawNo = String(e.equipmentNo || '').trim();
                const clean = normalizeEquipmentNo(rawNo);
                return !clean || clean !== rawNo || rawNo.toUpperCase().includes('PDF');
            });
            const owners = new Set(propEquipments.map(e => String(e.owner || '').trim()).filter(Boolean));
            const isSingleOwner = owners.size <= 2 && propEquipments.length > 3;
            const isSmallList = propEquipments.length <= 25;

            if (hasUnnormalizedOrJunk || isSingleOwner || isSmallList) {
                reconcileEquipmentStandards().then(fixed => {
                    if (fixed && fixed.length > 0) {
                        setEquipments(fixed);
                        onEquipmentUpdated();
                    }
                }).catch(e => console.warn('Auto reconciliation caught:', e));
            }
        } else {
            loadData();
        }
    }, [propEquipments]);

    const loadData = async () => {
        const { getEquipments } = await import('../services/dataService');
        const data = await getEquipments();
        setEquipments(data || []);
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

            // Category filter
            const pmMonths = getMonthsForPlan(eq.pm, eq.pmMonth);
            const calMonths = getMonthsForPlan(eq.cal, eq.calMonth);
            const hasPM = pmMonths.size > 0;
            const hasCal = calMonths.size > 0;

            if (filterCategory === 'pm' && !hasPM) return false;
            if (filterCategory === 'cal' && !hasCal) return false;
            if (filterCategory === 'both' && (!hasPM || !hasCal)) return false;

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
    }, [equipments, searchQuery, filterCategory, filterOwner, filterMonth, filterWorkflow]);

    // Monthly Plan Statistics across all 70 primary + 91 sub equipments
    const monthlyStats = useMemo(() => {
        const stats: Record<string, { pm: number; cal: number; totalMachines: Set<string> }> = {};
        MONTH_KEYS.forEach(m => {
            stats[m] = { pm: 0, cal: 0, totalMachines: new Set() };
        });

        equipments.forEach(eq => {
            const rawNo = String(eq.equipmentNo || '').trim();
            if (!rawNo || rawNo.includes('/')) return;

            const pmMonths = getMonthsForPlan(eq.pm, eq.pmMonth);
            const calMonths = getMonthsForPlan(eq.cal, eq.calMonth);

            pmMonths.forEach(m => {
                if (stats[m]) {
                    stats[m].pm++;
                    stats[m].totalMachines.add(eq.id);
                }
            });
            calMonths.forEach(m => {
                if (stats[m]) {
                    stats[m].cal++;
                    stats[m].totalMachines.add(eq.id);
                }
            });

            // Include sub-equipments in monthly statistics
            (eq.subEquipments || []).forEach(sub => {
                const subPMMonths = getMonthsForPlan(sub.pm);
                const subCalMonths = getMonthsForPlan(sub.cal);
                subPMMonths.forEach(m => {
                    if (stats[m]) {
                        stats[m].pm++;
                        stats[m].totalMachines.add(sub.id || `${eq.id}_sub`);
                    }
                });
                subCalMonths.forEach(m => {
                    if (stats[m]) {
                        stats[m].cal++;
                        stats[m].totalMachines.add(sub.id || `${eq.id}_sub`);
                    }
                });
            });
        });

        return stats;
    }, [equipments]);

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
        const newSub: EquipmentSubComponent = {
            id: editingSub.sub.id || `sub_${Date.now()}`,
            equipmentNo: cleanSubNo,
            equipmentName: editingSub.sub.equipmentName.trim(),
            owner: (editingSub.sub.owner || parentEq.owner || 'PORNTHAK').trim(),
            pm: {
                freqYear: editingSub.sub.pm?.freqYear || 1,
                lastPM: normalizeMonth(editingSub.sub.pm?.lastPM) || 'Jan',
                nextPM: normalizeMonth(editingSub.sub.pm?.nextPM) || 'Jan',
                pmBy: editingSub.sub.pm?.pmBy || 'Vender',
                items: editingSub.sub.pm?.items || '',
                tolerance: editingSub.sub.pm?.tolerance || ''
            },
            cal: {
                freqYear: editingSub.sub.cal?.freqYear || 1,
                lastCal: normalizeMonth(editingSub.sub.cal?.lastCal) || 'Jan',
                nextCal: normalizeMonth(editingSub.sub.cal?.nextCal) || 'Jan',
                calBy: editingSub.sub.cal?.calBy || 'Vender',
                items: editingSub.sub.cal?.items || '',
                tolerance: editingSub.sub.cal?.tolerance || ''
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
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            {filteredEquipments.length} เครื่องหลัก · {equipments.reduce((sum, e) => sum + (e.subEquipments?.length || 0), 0)} เครื่องพ่วงย่อย
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowGuide(!showGuide)}
                            className="text-xs font-bold text-slate-600 hover:text-indigo-600 dark:text-slate-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-base-800 transition-colors cursor-pointer border border-slate-200 dark:border-base-700"
                        >
                            <span>💡 วิธีใช้งานตารางปฏิทิน</span>
                            <span className="text-[10px]">{showGuide ? '▲' : '▼'}</span>
                        </button>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
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
                            <span>📌 รูปแบบตารางปฏิทินแผนแม่บท (Yearly Calendar Matrix):</span>
                            <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">ปิด ✕</button>
                        </div>
                        <ul className="text-slate-600 dark:text-slate-300 space-y-1 font-medium text-xs">
                            <li>• <strong>รหัสเครื่องมือ & ชื่อเครื่องหลัก:</strong> อยู่ 2 คอลัมน์ซ้าย ตรึงไว้ไม่เลื่อนหลุดสายตาเมื่อเลื่อนดูเดือนต่าง ๆ</li>
                            <li>• <strong>กล่องปฏิทิน 12 เดือน:</strong> แสดงเครื่องที่มีแผน PM (สีน้ำเงิน) และแผน Cal (สีเขียว) วางอยู่ในเดือนที่กำหนดอย่างชัดเจน</li>
                            <li>• <strong>เครื่องพ่วงย่อย (Sub):</strong> กดปุ่มลูกศร <code>▼</code> หน้าเครื่องหลัก เพื่อกางแถวเครื่องพ่วงย่อยออกมาดูปฏิทินของชิ้นย่อยได้ตรงเดือน</li>
                            <li>• <strong>การดูรายละเอียด:</strong> กดที่กล่อง PM / Cal ในเดือนนั้น หรือกดปุ่ม <code>🔍 รายละเอียด</code> เพื่อขยายอ่านสเปก รายการตรวจ และสเต็ปงานโดยไม่ต้องเปิดตารางยาวให้รกตา</li>
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

                {/* MONTHLY SUMMARY STRIP (12 MONTHS CARDS) */}
                <div className="pt-2 border-t border-slate-100 dark:border-base-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <span>📅 ภาพรวมแผนประจำปี 12 เดือน</span>
                            <span className="text-[11px] font-normal text-slate-400">(คลิกที่เดือนเพื่อกรองดูเฉพาะเครื่องในเดือนนั้น)</span>
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
                            const hasEvents = stat.pm > 0 || stat.cal > 0;

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
                            placeholder="ค้นหารหัสเครื่องมือ (เช่น PDS-1001), ชื่อเครื่อง, ผู้รับผิดชอบ, Vendor..."
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
                            className="w-full px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all text-center"
                        >
                            {expandedEquipIds.size > 0 ? '▲ ย่อเครื่องพ่วงทั้งหมด' : '▼ ขยายเครื่องพ่วงทั้งหมด'}
                        </button>
                    </div>
                </div>
            </div>

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
                                <th className="px-3 py-3 min-w-[120px] max-w-[140px] sticky left-8 bg-slate-100 dark:bg-base-950 z-30 font-extrabold uppercase tracking-tight">
                                    รหัสเครื่อง
                                </th>

                                {/* Col 3: Name & Owner (Sticky Left) */}
                                <th className="px-3 py-3 min-w-[200px] max-w-[260px] sticky left-[150px] bg-slate-100 dark:bg-base-950 z-30 font-extrabold uppercase tracking-tight shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                                    ชื่อเครื่องมือ & ผู้ดูแล
                                </th>

                                {/* 12 Monthly Calendar Columns */}
                                {MONTH_KEYS.map((mKey) => {
                                    const info = MONTH_INFO_MAP[mKey];
                                    const isCurrent = currentMonthKey === mKey;
                                    const isFilterActive = filterMonth === mKey;

                                    return (
                                        <th
                                            key={mKey}
                                            className={`px-2 py-2.5 min-w-[92px] max-w-[110px] text-center border-l border-slate-200 dark:border-base-800 ${
                                                isFilterActive
                                                    ? 'bg-indigo-100/80 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200'
                                                    : isCurrent
                                                        ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                                                        : ''
                                            }`}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className="font-extrabold text-[11px] flex items-center gap-1">
                                                    <span>{info.thShort}</span>
                                                    {isCurrent && <span className="text-[8px] text-indigo-600 font-bold">●</span>}
                                                </span>
                                                <span className="text-[9px] font-mono text-slate-400 lowercase">
                                                    {info.key}
                                                </span>
                                            </div>
                                        </th>
                                    );
                                })}

                                {/* Actions & Details Button */}
                                <th className="px-3 py-3 min-w-[130px] text-right font-extrabold uppercase tracking-tight border-l border-slate-200 dark:border-base-800">
                                    รายละเอียด
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

                                    return (
                                        <React.Fragment key={`${eq.id || 'eq'}_${idx}`}>
                                            {/* PRIMARY EQUIPMENT ROW */}
                                            <tr className={`hover:bg-slate-50/80 dark:hover:bg-base-800/50 transition-colors ${
                                                isDetailExpanded ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                                            }`}>
                                                {/* Col 1: Expand Sub-components Chevron */}
                                                <td className="px-2 py-3 text-center sticky left-0 bg-white dark:bg-base-900 z-20">
                                                    {subCount > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandSubs(eq.id)}
                                                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-base-800 transition-colors"
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
                                                    <div className="flex items-center gap-1.5">
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
                                                <td className="px-3 py-3 sticky left-[150px] bg-white dark:bg-base-900 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                                                    <div className="flex flex-col min-w-[190px] max-w-[250px]">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-extrabold text-slate-900 dark:text-white text-xs line-clamp-1" title={eq.equipmentName}>
                                                                {eq.equipmentName}
                                                            </span>
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

                                                {/* 12 MONTH CALENDAR CELLS */}
                                                {MONTH_KEYS.map((mKey) => {
                                                    const hasPM = primaryPMMonths.has(mKey);
                                                    const hasCal = primaryCalMonths.has(mKey);

                                                    // Check if any sub-components have events in this month
                                                    const subsInMonth = (eq.subEquipments || []).filter(s => {
                                                        const sPM = getMonthsForPlan(s.pm);
                                                        const sCal = getMonthsForPlan(s.cal);
                                                        return sPM.has(mKey) || sCal.has(mKey);
                                                    });

                                                    return (
                                                        <td
                                                            key={mKey}
                                                            className={`px-1.5 py-2.5 text-center border-l border-slate-100 dark:border-base-800 align-top ${
                                                                filterMonth === mKey ? 'bg-indigo-50/40 dark:bg-indigo-950/30' : ''
                                                            }`}
                                                        >
                                                            <div className="flex flex-col gap-1 min-h-[38px] justify-center">
                                                                {/* PM Box in Month */}
                                                                {hasPM && (
                                                                    <div
                                                                        onClick={() => setInspectionTarget({ equipment: eq, highlightType: 'pm', highlightMonth: mKey })}
                                                                        className="px-1.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 border border-indigo-200/90 dark:border-indigo-800 rounded-md text-[10px] font-bold cursor-pointer transition-all shadow-2xs hover:scale-102 text-left"
                                                                        title={`PM ${eq.equipmentNo} ในเดือน ${mKey} (คลิกดูรายละเอียด)`}
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="font-black text-indigo-700 dark:text-indigo-300">🛠️ PM</span>
                                                                            <span className="text-[9px] text-slate-500 font-mono">{eq.pm?.pmBy || 'Vender'}</span>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Cal Box in Month */}
                                                                {hasCal && (
                                                                    <div
                                                                        onClick={() => setInspectionTarget({ equipment: eq, highlightType: 'cal', highlightMonth: mKey })}
                                                                        className="px-1.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-200/90 dark:border-emerald-800 rounded-md text-[10px] font-bold cursor-pointer transition-all shadow-2xs hover:scale-102 text-left"
                                                                        title={`Cal ${eq.equipmentNo} ในเดือน ${mKey} (คลิกดูรายละเอียด)`}
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="font-black text-emerald-700 dark:text-emerald-300">🎯 Cal</span>
                                                                            {eq.trackingStatus?.result === 'Pass' ? (
                                                                                <span className="text-[9px] font-black text-emerald-600">✓</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-slate-500 font-mono">{eq.cal?.calBy || 'Vender'}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Sub-components indicator if subs collapsed */}
                                                                {!isSubsExpanded && subsInMonth.length > 0 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleExpandSubs(eq.id)}
                                                                        className="w-full text-center text-[9px] font-bold text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-base-800 rounded px-1 py-0.5 border border-dashed border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer"
                                                                        title={`มี ${subsInMonth.length} เครื่องพ่วงย่อยในเดือนนี้ คลิกเพื่อกางดู`}
                                                                    >
                                                                        +{subsInMonth.length} พ่วง
                                                                    </button>
                                                                )}

                                                                {/* Empty Cell */}
                                                                {!hasPM && !hasCal && (!subsInMonth.length || isSubsExpanded) && (
                                                                    <span className="text-slate-200 dark:text-base-800 text-center font-bold text-xs select-none">
                                                                        ·
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}

                                                {/* Col 16: Actions & Details Expansion Button */}
                                                <td className="px-3 py-3 text-right whitespace-nowrap border-l border-slate-100 dark:border-base-800">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandDetail(eq.id)}
                                                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 border shadow-2xs cursor-pointer ${
                                                                isDetailExpanded
                                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'
                                                            }`}
                                                            title="คลิกเพื่อขยายดูรายละเอียดข้อกำหนด รายการตรวจ และสเต็ปงาน"
                                                        >
                                                            <span>{isDetailExpanded ? '▲ ซ่อน' : '🔍 รายละเอียด'}</span>
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

                                            {/* NESTED SUB-COMPONENTS ROWS (ALIGNED TO THE 12 MONTH CALENDAR) */}
                                            {isSubsExpanded && (eq.subEquipments || []).map((sub, sIdx) => {
                                                const subPMMonths = getMonthsForPlan(sub.pm);
                                                const subCalMonths = getMonthsForPlan(sub.cal);

                                                return (
                                                    <tr key={sub.id || sIdx} className="bg-slate-50/70 dark:bg-base-950/40 hover:bg-slate-100/70 dark:hover:bg-base-800/40 transition-colors border-l-2 border-indigo-500">
                                                        {/* Sub Chevron */}
                                                        <td className="px-2 py-2 text-center text-indigo-500 font-extrabold text-xs sticky left-0 bg-slate-50/90 dark:bg-base-950/90 z-20">
                                                            ↳
                                                        </td>

                                                        {/* Sub Equipment No */}
                                                        <td className="px-3 py-2 whitespace-nowrap sticky left-8 bg-slate-50/90 dark:bg-base-950/90 z-20">
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
                                                        </td>

                                                        {/* Sub Name & Sub Owner */}
                                                        <td className="px-3 py-2 sticky left-[150px] bg-slate-50/90 dark:bg-base-950/90 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                                                            <div className="flex flex-col min-w-[190px] max-w-[250px]">
                                                                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate" title={sub.equipmentName}>
                                                                    {sub.equipmentName}
                                                                </span>
                                                                <select
                                                                    value={sub.owner || eq.owner || 'PORNTHAK'}
                                                                    onChange={(e) => handleQuickChangeOwner(eq.id, e.target.value, true, sub.id)}
                                                                    className="text-[10px] font-semibold bg-transparent text-slate-500 hover:text-slate-800 cursor-pointer outline-none border-b border-dashed border-slate-300 dark:border-base-700 max-w-[120px] truncate"
                                                                >
                                                                    {availableOwners.map(o => (
                                                                        <option key={o} value={o}>👤 {o}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </td>

                                                        {/* Sub Monthly Calendar Cells */}
                                                        {MONTH_KEYS.map((mKey) => {
                                                            const subHasPM = subPMMonths.has(mKey);
                                                            const subHasCal = subCalMonths.has(mKey);

                                                            return (
                                                                <td
                                                                    key={mKey}
                                                                    className={`px-1.5 py-1.5 text-center border-l border-slate-100 dark:border-base-800 align-top ${
                                                                        filterMonth === mKey ? 'bg-indigo-50/40 dark:bg-indigo-950/30' : ''
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-col gap-0.5 min-h-[30px] justify-center">
                                                                        {subHasPM && (
                                                                            <div 
                                                                                onClick={() => setInspectionTarget({ equipment: eq, subComponent: sub, highlightType: 'pm', highlightMonth: mKey })}
                                                                                className="px-1 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border border-indigo-200 rounded text-[9px] font-bold cursor-pointer hover:scale-102 transition-all"
                                                                                title={`PM ${sub.equipmentNo}`}
                                                                            >
                                                                                🛠️ PM
                                                                            </div>
                                                                        )}
                                                                        {subHasCal && (
                                                                            <div 
                                                                                onClick={() => setInspectionTarget({ equipment: eq, subComponent: sub, highlightType: 'cal', highlightMonth: mKey })}
                                                                                className="px-1 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-200 rounded text-[9px] font-bold cursor-pointer hover:scale-102 transition-all"
                                                                                title={`Cal ${sub.equipmentNo}`}
                                                                            >
                                                                                🎯 Cal
                                                                            </div>
                                                                        )}
                                                                        {!subHasPM && !subHasCal && (
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
                                                                    className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded text-[10px] font-bold border border-slate-200"
                                                                >
                                                                    6 สเต็ป
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingSub({ parentEqId: eq.id, isNew: false, sub: { ...sub } });
                                                                        setIsSubModalOpen(true);
                                                                    }}
                                                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded"
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
                                                                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
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

                                                                <div className="flex items-center gap-2">
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
                                                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                                                            <span>เดือนที่กำหนด:</span>
                                                                            <strong className="text-indigo-700 dark:text-indigo-300 font-bold">{formatMonthName(eq.pm?.lastPM || eq.pm?.nextPM, 'short')}</strong>
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
                                                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                                                            <span>เดือนที่กำหนด:</span>
                                                                            <strong className="text-emerald-700 dark:text-emerald-300 font-bold">{formatMonthName(eq.cal?.lastCal || eq.cal?.nextCal, 'short')}</strong>
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
                                        <span className="text-slate-400 block text-[10px]">กำหนดเดือน:</span>
                                        <span className="font-bold">{formatMonthName((inspectionTarget.subComponent?.pm || inspectionTarget.equipment.pm)?.lastPM, 'short')}</span>
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
                                        <span className="text-slate-400 block text-[10px]">กำหนดเดือน:</span>
                                        <span className="font-bold">{formatMonthName((inspectionTarget.subComponent?.cal || inspectionTarget.equipment.cal)?.lastCal, 'short')}</span>
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
                                            value={editingEquip.pm?.lastPM || 'Nov'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                pm: { ...(editingEquip.pm || {}), lastPM: e.target.value, nextPM: e.target.value }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        >
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">ความถี่ (ครั้ง/ปี)</label>
                                        <input
                                            type="number"
                                            value={editingEquip.pm?.freqYear ?? 1}
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
                                            value={editingEquip.cal?.lastCal || 'Nov'}
                                            onChange={e => setEditingEquip({
                                                ...editingEquip,
                                                cal: { ...(editingEquip.cal || {}), lastCal: e.target.value, nextCal: e.target.value }
                                            })}
                                            className="w-full p-1.5 bg-white dark:bg-base-900 border rounded-lg font-bold"
                                        >
                                            {MONTH_KEYS.map(m => (
                                                <option key={m} value={m}>{formatMonthName(m, 'short')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block">ความถี่ (ครั้ง/ปี)</label>
                                        <input
                                            type="number"
                                            value={editingEquip.cal?.freqYear ?? 1}
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
                                        value={editingSub.sub.pm?.lastPM || 'Jan'}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: {
                                                ...editingSub.sub,
                                                pm: { ...(editingSub.sub.pm || { freqYear: 1 }), lastPM: e.target.value, nextPM: e.target.value }
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
                                        value={editingSub.sub.cal?.lastCal || 'Jan'}
                                        onChange={e => setEditingSub({
                                            ...editingSub,
                                            sub: {
                                                ...editingSub.sub,
                                                cal: { ...(editingSub.sub.cal || { freqYear: 1 }), lastCal: e.target.value, nextCal: e.target.value }
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
