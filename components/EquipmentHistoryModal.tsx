import React, { useState, useMemo } from 'react';
import type { Equipment, EquipmentHistory, EquipmentHistoryType, BreakdownRecord } from '../types';
import { 
    XCircleIcon, PlusIcon, CheckCircleIcon, AlertTriangleIcon, 
    TrashIcon, CalendarIcon, CurrencyDollarIcon, DocumentTextIcon,
    DownloadIcon, SearchIcon, ClockIcon
} from './common/Icons';

interface EquipmentHistoryModalProps {
    isOpen: boolean;
    equipment: Equipment | null;
    allEquipments?: Equipment[];
    onSelectEquipment?: (eq: Equipment) => void;
    onClose: () => void;
    onSaveEquipment: (updated: Equipment) => Promise<void>;
}

// Unified item representing either a custom history record or a breakdown workflow record
interface UnifiedHistoryItem {
    id: string;
    source: 'custom_history' | 'breakdown_history' | 'active_breakdown';
    date: string;
    type: EquipmentHistoryType;
    title: string;
    description: string;
    symptom?: string;
    rootCause?: string;
    partsReplaced?: string;
    technician: string;
    vendor?: string;
    cost?: number;
    docRef?: string;
    result: string;
    resolutionNote?: string;
    actionLogs?: { id: string; date: string; action: string; actor?: string; stage?: string }[];
    originalCustom?: EquipmentHistory;
    originalBreakdown?: BreakdownRecord;
}

export const EquipmentHistoryModal: React.FC<EquipmentHistoryModalProps> = ({
    isOpen,
    equipment,
    allEquipments,
    onSelectEquipment,
    onClose,
    onSaveEquipment
}) => {
    const [selectedTab, setSelectedTab] = useState<'all' | 'breakdown' | 'repair' | 'pm_cal' | 'note'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddFormOpen, setIsAddFormOpen] = useState(false);
    const [isPrintMode, setIsPrintMode] = useState(false);
    const [viewDensity, setViewDensity] = useState<'detailed' | 'compact'>('detailed');
    const [isSaving, setIsSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Form state for adding new history record
    const [formType, setFormType] = useState<EquipmentHistoryType>('repair');
    const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [formTitle, setFormTitle] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formSymptom, setFormSymptom] = useState('');
    const [formRootCause, setFormRootCause] = useState('');
    const [formPartsReplaced, setFormPartsReplaced] = useState('');
    const [formTechnician, setFormTechnician] = useState('');
    const [formVendor, setFormVendor] = useState('');
    const [formCost, setFormCost] = useState('');
    const [formDocRef, setFormDocRef] = useState('');
    const [formResult, setFormResult] = useState<'Resolved' | 'Pass' | 'In Progress' | 'Action Required'>('Resolved');
    const [formResolutionNote, setFormResolutionNote] = useState('');

    // Compile all history items from both equipment.history and breakdownStatus
    const unifiedHistory: UnifiedHistoryItem[] = useMemo(() => {
        if (!equipment) return [];
        const items: UnifiedHistoryItem[] = [];

        // 1. From equipment.history
        if (Array.isArray(equipment.history)) {
            equipment.history.forEach(h => {
                items.push({
                    id: h.id,
                    source: 'custom_history',
                    date: h.date || '',
                    type: h.type || 'repair',
                    title: h.title || h.description || 'บันทึกประวัติเครื่องมือ',
                    description: h.description || '',
                    symptom: h.symptom,
                    rootCause: h.rootCause,
                    partsReplaced: h.partsReplaced,
                    technician: h.technician || 'ไม่ระบุผู้ทำ',
                    vendor: h.vendor,
                    cost: h.cost,
                    docRef: h.docRef,
                    result: h.result || 'Resolved',
                    resolutionNote: h.resolutionNote,
                    originalCustom: h
                });
            });
        }

        // 2. From breakdownStatus.history (Past resolved incidents)
        if (Array.isArray(equipment.breakdownStatus?.history)) {
            equipment.breakdownStatus.history.forEach(b => {
                items.push({
                    id: b.id,
                    source: 'breakdown_history',
                    date: b.resolvedDate || b.reportedDate || '',
                    type: 'breakdown',
                    title: `แจ้งซ่อม & คืนสภาพ: ${b.symptom || 'ชำรุด'}`,
                    description: b.resolutionNote || b.symptom || '',
                    symptom: b.symptom,
                    rootCause: b.rootCause,
                    technician: b.vendorOrTechnician || b.reportedBy || 'ฝ่ายช่าง / วิศวกร',
                    vendor: b.vendorOrTechnician,
                    cost: b.costEstimate,
                    docRef: [b.repairPrNo, b.quotationNo].filter(Boolean).join(' / '),
                    result: 'Resolved',
                    resolutionNote: b.resolutionNote,
                    actionLogs: b.actionLogs,
                    originalBreakdown: b
                });
            });
        }

        // 3. From breakdownStatus.currentIncident (Active incident in progress)
        if (equipment.breakdownStatus?.isBroken && equipment.breakdownStatus.currentIncident) {
            const cur = equipment.breakdownStatus.currentIncident;
            items.push({
                id: cur.id,
                source: 'active_breakdown',
                date: cur.reportedDate || '',
                type: 'breakdown',
                title: `🚨 กำลังแจ้งซ่อม: ${cur.symptom || 'เครื่องชำรุด'}`,
                description: cur.rootCause || 'กำลังอยู่ระหว่างดำเนินการซ่อมและจัดหาอะไหล่',
                symptom: cur.symptom,
                rootCause: cur.rootCause,
                technician: cur.vendorOrTechnician || cur.reportedBy || 'รอช่างดำเนินการ',
                vendor: cur.vendorOrTechnician,
                cost: cur.costEstimate,
                docRef: [cur.repairPrNo, cur.quotationNo].filter(Boolean).join(' / '),
                result: 'In Progress',
                resolutionNote: cur.resolutionNote,
                actionLogs: cur.actionLogs,
                originalBreakdown: cur
            });
        }

        // Sort descending by date
        return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [equipment]);

    // Statistics
    const stats = useMemo(() => {
        let totalCost = 0;
        let breakdownCount = 0;
        let pmCalCount = 0;
        let repairCount = 0;

        unifiedHistory.forEach(item => {
            if (item.cost) totalCost += Number(item.cost) || 0;
            if (item.type === 'breakdown') breakdownCount++;
            else if (item.type === 'pm' || item.type === 'calibration') pmCalCount++;
            else if (item.type === 'repair') repairCount++;
        });

        return {
            total: unifiedHistory.length,
            totalCost,
            breakdownCount,
            pmCalCount,
            repairCount
        };
    }, [unifiedHistory]);

    // Filtered items
    const filteredItems = useMemo(() => {
        return unifiedHistory.filter(item => {
            // Category filter
            if (selectedTab === 'breakdown' && item.type !== 'breakdown') return false;
            if (selectedTab === 'repair' && item.type !== 'repair') return false;
            if (selectedTab === 'pm_cal' && item.type !== 'pm' && item.type !== 'calibration') return false;
            if (selectedTab === 'note' && item.type !== 'note' && item.type !== 'inspection') return false;

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = item.title.toLowerCase().includes(q);
                const matchDesc = item.description.toLowerCase().includes(q);
                const matchTech = item.technician.toLowerCase().includes(q);
                const matchDoc = (item.docRef || '').toLowerCase().includes(q);
                const matchParts = (item.partsReplaced || '').toLowerCase().includes(q);
                return matchTitle || matchDesc || matchTech || matchDoc || matchParts;
            }

            return true;
        });
    }, [unifiedHistory, selectedTab, searchQuery]);

    if (!isOpen || !equipment) return null;

    const handleCreateHistory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formTitle.trim()) return;

        setIsSaving(true);
        try {
            const newEntry: EquipmentHistory = {
                id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                date: formDate,
                type: formType,
                title: formTitle.trim(),
                description: formDescription.trim(),
                symptom: formSymptom.trim() || undefined,
                rootCause: formRootCause.trim() || undefined,
                partsReplaced: formPartsReplaced.trim() || undefined,
                technician: formTechnician.trim() || 'เจ้าหน้าที่ประจำห้องปฏิบัติการ',
                vendor: formVendor.trim() || undefined,
                cost: formCost ? Number(formCost) : undefined,
                docRef: formDocRef.trim() || undefined,
                result: formResult,
                resolutionNote: formResolutionNote.trim() || undefined,
                createdAt: new Date().toISOString()
            };

            const updatedHistory = [newEntry, ...(equipment.history || [])];
            const shouldResolveMachine =
                (equipment.status === 'issue' || equipment.breakdownStatus?.isBroken) &&
                (formResult === 'Resolved' || formResult === 'Pass');

            const curInc = equipment.breakdownStatus?.currentIncident;
            const resolvedBreakdownHistory = shouldResolveMachine && curInc
                ? [
                      {
                          ...curInc,
                          stage: 'repaired_verified' as const,
                          resolvedDate: formDate,
                          resolutionNote: formResolutionNote.trim() || formDescription.trim() || 'ซ่อมเสร็จและคืนสภาพพร้อมใช้งานปกติ 100%'
                      },
                      ...(equipment.breakdownStatus?.history || [])
                  ]
                : (equipment.breakdownStatus?.history || []);

            const updatedEquipment: Equipment = {
                ...equipment,
                ...(shouldResolveMachine
                    ? {
                          status: 'ready',
                          breakdownStatus: {
                              isBroken: false,
                              history: resolvedBreakdownHistory
                          }
                      }
                    : {}),
                history: updatedHistory
            };

            await onSaveEquipment(updatedEquipment);
            
            // Reset form
            setFormTitle('');
            setFormDescription('');
            setFormSymptom('');
            setFormRootCause('');
            setFormPartsReplaced('');
            setFormTechnician('');
            setFormVendor('');
            setFormCost('');
            setFormDocRef('');
            setFormResolutionNote('');
            setIsAddFormOpen(false);

            setToastMessage(
                shouldResolveMachine
                    ? "✅ บันทึกประวัติและคืนสภาพเครื่องเป็นปกติพร้อมใช้งาน (Ready 100%) เรียบร้อยแล้ว"
                    : "✅ บันทึกประวัติเครื่องมือเรียบร้อยแล้ว"
            );
            setTimeout(() => setToastMessage(null), 4000);
        } catch (err) {
            console.error("Failed to save history:", err);
            setToastMessage("เกิดข้อผิดพลาดในการบันทึก: " + (err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCustomHistory = async (historyId: string) => {
        if (!confirm("คุณต้องการลบบันทึกประวัตินี้ใช่หรือไม่?")) return;

        try {
            const updatedHistory = (equipment.history || []).filter(h => h.id !== historyId);
            const updatedEquipment: Equipment = {
                ...equipment,
                history: updatedHistory
            };
            await onSaveEquipment(updatedEquipment);
            setToastMessage("ลบบันทึกประวัติเรียบร้อยแล้ว");
            setTimeout(() => setToastMessage(null), 3000);
        } catch (err) {
            console.error("Failed to delete history:", err);
        }
    };

    const getTypeBadge = (type: EquipmentHistoryType) => {
        switch (type) {
            case 'breakdown':
                return {
                    label: '🚨 แจ้งซ่อม / ชำรุด (Breakdown)',
                    bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
                };
            case 'repair':
                return {
                    label: '🛠️ ซ่อมแซม & อะไหล่ (Repair & Parts)',
                    bg: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900/60'
                };
            case 'calibration':
                return {
                    label: '🎯 สอบเทียบ (Calibration)',
                    bg: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
                };
            case 'pm':
                return {
                    label: '🔄 บำรุงรักษาเชิงป้องกัน (PM)',
                    bg: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/60'
                };
            case 'inspection':
                return {
                    label: '🔍 ตรวจเช็คสภาพ (Inspection)',
                    bg: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900/60'
                };
            case 'note':
            default:
                return {
                    label: '📝 บันทึกทั่วไป (General Log)',
                    bg: 'bg-slate-100 text-slate-800 dark:bg-base-800 dark:text-slate-200 border-slate-200 dark:border-base-700'
                };
        }
    };

    const isBroken = equipment.status === 'issue' || equipment.breakdownStatus?.isBroken;

    const handleExportBackup = () => {
        if (!equipment) return;
        const backupData = {
            equipmentNo: equipment.equipmentNo,
            equipmentName: equipment.equipmentName,
            owner: equipment.owner,
            department: equipment.department || 'PCRD Lab',
            location: equipment.location,
            exportedAt: new Date().toISOString(),
            status: isBroken ? 'Broken/Under Repair' : 'Ready 100%',
            totalRecords: unifiedHistory.length,
            records: unifiedHistory.map((item, idx) => ({
                caseNumber: unifiedHistory.length - idx,
                source: item.source,
                date: item.date,
                type: item.type,
                title: item.title,
                description: item.description,
                symptom: item.symptom || null,
                rootCause: item.rootCause || null,
                partsReplaced: item.partsReplaced || null,
                technician: item.technician,
                vendor: item.vendor || null,
                cost: item.cost || 0,
                docRef: item.docRef || null,
                result: item.result,
                resolutionNote: item.resolutionNote || null
            }))
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Backup_History_${equipment.equipmentNo}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToastMessage(`📥 สำรองข้อมูลประวัติเครื่องมือ ${equipment.equipmentNo} เรียบร้อยแล้ว (${unifiedHistory.length} รายการ)`);
        setTimeout(() => setToastMessage(null), 4000);
    };

    return (
        <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[120] p-2 sm:p-4 md:p-6 overflow-y-auto animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-base-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-base-800 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* MODAL HEADER: Equipment Identity & Overview */}
                <div className="p-5 md:p-6 border-b border-slate-100 dark:border-base-800 bg-slate-50/70 dark:bg-base-950/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-xs px-2.5 py-1 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                                {equipment.equipmentNo}
                            </span>
                            {isBroken ? (
                                <div className="inline-flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white animate-pulse shadow-xs">
                                        <AlertTriangleIcon className="h-3.5 w-3.5" />
                                        <span>🚨 สถานะ: ชำรุด/แจ้งซ่อมอยู่</span>
                                    </span>
                                    <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={async () => {
                                            setIsSaving(true);
                                            try {
                                                const resolveDate = new Date().toISOString().split('T')[0];
                                                const curInc = equipment.breakdownStatus?.currentIncident;
                                                const resolvedInc = curInc
                                                    ? {
                                                          ...curInc,
                                                          stage: 'repaired_verified' as const,
                                                          resolvedDate: resolveDate,
                                                          resolutionNote: curInc.resolutionNote || 'ตรวจรับการซ่อมแซมสมบูรณ์ เครื่องกลับคืนสู่สภาพพร้อมใช้งานปกติ 100%'
                                                      }
                                                    : null;
                                                const updatedEq: Equipment = {
                                                    ...equipment,
                                                    status: 'ready',
                                                    breakdownStatus: {
                                                        isBroken: false,
                                                        history: resolvedInc
                                                            ? [resolvedInc, ...(equipment.breakdownStatus?.history || [])]
                                                            : (equipment.breakdownStatus?.history || [])
                                                    }
                                                };
                                                await onSaveEquipment(updatedEq);
                                                setToastMessage(`✅ บันทึกว่าเครื่อง ${equipment.equipmentNo} ปกติพร้อมใช้งานแล้ว (Ready 100%)`);
                                                setTimeout(() => setToastMessage(null), 4000);
                                            } finally {
                                                setIsSaving(false);
                                            }
                                        }}
                                        className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                                    >
                                        <CheckCircleIcon className="h-3.5 w-3.5" />
                                        <span>บันทึกว่าเครื่องปกติแล้ว 🟢</span>
                                    </button>
                                </div>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>🟢 สถานะ: พร้อมใช้งานตามปกติ 100%</span>
                                </span>
                            )}

                            {/* Machine Switcher dropdown if allEquipments provided */}
                            {allEquipments && allEquipments.length > 1 && (
                                <div className="flex items-center gap-1.5 bg-white dark:bg-base-900 px-2.5 py-1 rounded-xl border border-indigo-200 dark:border-indigo-900/60 shadow-2xs">
                                    <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400">สลับเครื่อง:</span>
                                    <select
                                        value={equipment.id || equipment.equipmentNo}
                                        onChange={(e) => {
                                            const target = allEquipments.find(item => item.id === e.target.value || item.equipmentNo === e.target.value);
                                            if (target && onSelectEquipment) {
                                                onSelectEquipment(target);
                                            }
                                        }}
                                        className="text-xs font-bold bg-transparent text-slate-800 dark:text-slate-100 cursor-pointer focus:outline-hidden max-w-[200px] truncate"
                                    >
                                        {allEquipments.map(item => {
                                            const isItemBroken = item.status === 'issue' || item.breakdownStatus?.isBroken;
                                            const count = (item.history?.length || 0) + (item.breakdownStatus?.history?.length || 0) + (item.breakdownStatus?.currentIncident ? 1 : 0);
                                            return (
                                                <option key={item.id || item.equipmentNo} value={item.id || item.equipmentNo}>
                                                    {item.equipmentNo} - {item.equipmentName} {isItemBroken ? '🚨[เสีย]' : ''} ({count} ประวัติ)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            )}

                            <span className="text-xs text-slate-400 font-bold hidden sm:inline">
                                • แฟ้มประวัติเครื่องมือ & แบ็คอัพ (Logbook & Backup)
                            </span>
                        </div>

                        <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white break-words">
                            {equipment.equipmentName}
                        </h3>

                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
                            <span>👤 ผู้ดูแล: <strong>{equipment.owner}</strong></span>
                            <span>📍 สถานที่: <strong>{equipment.location || equipment.department || 'PCRD Lab'}</strong></span>
                            {equipment.pm?.freqYear && (
                                <span>🔄 PM: <strong>{equipment.pm.freqYear} ครั้ง/ปี (เดือน {equipment.pm.lastPM})</strong></span>
                            )}
                            {equipment.cal?.freqYear && (
                                <span>🎯 Cal: <strong>{equipment.cal.freqYear} ครั้ง/ปี (เดือน {equipment.cal.lastCal})</strong></span>
                            )}
                        </div>
                    </div>

                    {/* Window Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setIsAddFormOpen(!isAddFormOpen)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer ${
                                isAddFormOpen 
                                    ? 'bg-slate-200 text-slate-800 hover:bg-slate-300' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                            }`}
                        >
                            <PlusIcon className="h-4 w-4" />
                            <span>{isAddFormOpen ? 'ปิดฟอร์ม' : '+ เพิ่มบันทึกประวัติ'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleExportBackup}
                            className="px-3 py-2 bg-white dark:bg-base-800 hover:bg-slate-100 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-base-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="ดาวน์โหลดไฟล์สำรองข้อมูลประวัติเครื่องนี้ (.JSON) สำหรับแบ็คอัพออฟไลน์"
                        >
                            <DownloadIcon className="h-4 w-4 text-indigo-500" />
                            <span>สำรองไฟล์ (JSON)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsPrintMode(!isPrintMode)}
                            className="px-3 py-2 bg-white dark:bg-base-800 hover:bg-slate-100 dark:hover:bg-base-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-base-700 transition-all flex items-center gap-1.5 cursor-pointer"
                            title="พิมพ์ใบบันทึกประวัติเครื่องมือ หรือบันทึก PDF สำหรับแบ็คอัพเอกสาร"
                        >
                            <DocumentTextIcon className="h-4 w-4 text-slate-500" />
                            <span>{isPrintMode ? 'ดูไทม์ไลน์' : '🖨️ พิมพ์รายงาน'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-base-800 transition-all cursor-pointer"
                            title="ปิดหน้าต่าง"
                        >
                            <XCircleIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* TOAST MESSAGE */}
                {toastMessage && (
                    <div className="mx-6 mt-4 p-3.5 bg-emerald-500 text-white rounded-xl flex items-center justify-between text-xs font-black shadow-md shadow-emerald-500/20 animate-fade-in">
                        <span>{toastMessage}</span>
                        <button onClick={() => setToastMessage(null)} className="text-white hover:underline">✕</button>
                    </div>
                )}

                {/* MODAL BODY (SCROLLABLE) */}
                <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
                    {/* STATS OVERVIEW CARDS */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3.5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200/80 dark:border-base-800 space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">ประวัติทั้งหมด</span>
                            <span className="text-2xl font-black text-slate-800 dark:text-white">{stats.total} <span className="text-xs font-medium text-slate-400">รายการ</span></span>
                        </div>
                        <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/30 rounded-2xl border border-rose-200/60 dark:border-rose-900/40 space-y-1">
                            <span className="text-[10px] font-black text-rose-700 dark:text-rose-300 uppercase tracking-wider block">เคสแจ้งซ่อม / ชำรุด</span>
                            <span className="text-2xl font-black text-rose-700 dark:text-rose-400">{stats.breakdownCount} <span className="text-xs font-medium text-rose-500">ครั้ง</span></span>
                        </div>
                        <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 space-y-1">
                            <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">การสอบเทียบ & PM</span>
                            <span className="text-2xl font-black text-emerald-800 dark:text-emerald-400">{stats.pmCalCount} <span className="text-xs font-medium text-emerald-600">รอบ</span></span>
                        </div>
                        <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200/60 dark:border-amber-900/40 space-y-1">
                            <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider block">ค่าใช้จ่ายซ่อม/อะไหล่สะสม</span>
                            <span className="text-2xl font-black text-amber-800 dark:text-amber-400">{stats.totalCost.toLocaleString()} <span className="text-xs font-medium text-amber-600">บาท</span></span>
                        </div>
                    </div>

                    {/* COLLAPSIBLE ADD NEW EVENT FORM */}
                    {isAddFormOpen && (
                        <div className="p-5 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-3xl border-2 border-indigo-200 dark:border-indigo-900/60 space-y-4 animate-fade-in shadow-sm">
                            <div className="flex items-center justify-between pb-2 border-b border-indigo-100 dark:border-indigo-900/40">
                                <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-black text-sm">
                                    <PlusIcon className="h-4 w-4" />
                                    <span>บันทึกประวัติการซ่อมบำรุง / แจ้งซ่อม / สอบเทียบ เพิ่มเติม</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-bold">ข้อมูลจะถูกจัดเก็บเข้าแฟ้มประวัติเครื่องมือนี้อย่างถาวร</span>
                            </div>

                            <form onSubmit={handleCreateHistory} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase block mb-1">ประเภทรายการ *</label>
                                        <select
                                            value={formType}
                                            onChange={e => setFormType(e.target.value as EquipmentHistoryType)}
                                            className="w-full p-2.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold"
                                        >
                                            <option value="repair">🛠️ ซ่อมบำรุง / เปลี่ยนอะไหล่ (Repair & Parts)</option>
                                            <option value="breakdown">🚨 แจ้งซ่อม / ชำรุด (Breakdown Incident)</option>
                                            <option value="calibration">🎯 ผลการสอบเทียบ (Calibration Record)</option>
                                            <option value="pm">🔄 การบำรุงรักษาเชิงป้องกัน (PM Record)</option>
                                            <option value="inspection">🔍 ตรวจเช็คสภาพ / ทดสอบ (Inspection)</option>
                                            <option value="note">📝 บันทึกทั่วไป (General Log / Note)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase block mb-1">วันที่ทำรายการ / วันที่พบปัญหา *</label>
                                        <input
                                            type="date"
                                            required
                                            value={formDate}
                                            onChange={e => setFormDate(e.target.value)}
                                            className="w-full p-2.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase block mb-1">ผลการดำเนินการ (Result) *</label>
                                        <select
                                            value={formResult}
                                            onChange={e => setFormResult(e.target.value as any)}
                                            className="w-full p-2.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold"
                                        >
                                            <option value="Resolved">✅ ซ่อมเสร็จสมบูรณ์ / คืนสภาพพร้อมใช้ (Resolved)</option>
                                            <option value="Pass">🎯 สอบเทียบ/ตรวจผ่านเกณฑ์ (Pass)</option>
                                            <option value="In Progress">⏳ กำลังดำเนินการซ่อม/สั่งอะไหล่ (In Progress)</option>
                                            <option value="Action Required">⚠️ ต้องติดตามผล / รอทดสอบซ้ำ (Action Required)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase block mb-1">
                                            หัวข้อเหตุการณ์ / อาการที่พบ (Title / Symptom) *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="เช่น เปลี่ยนหลอดไฟ Halogen, สายพานขาด, สอบเทียบประจำปีผ่านเกณฑ์"
                                            value={formTitle}
                                            onChange={e => setFormTitle(e.target.value)}
                                            className="w-full p-2.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase block mb-1">
                                            อะไหล่หรือชิ้นส่วนที่เปลี่ยน (Parts Replaced)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="เช่น หลอดไฟ IR Source, O-ring, หัวเซนเซอร์, ฟิลเตอร์กรองอากาศ"
                                            value={formPartsReplaced}
                                            onChange={e => setFormPartsReplaced(e.target.value)}
                                            className="w-full p-2.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase block mb-1">
                                        รายละเอียดสิ่งที่ทำ / วิธีการแก้ไข (Detailed Description & Actions Taken)
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="ระบุรายละเอียดงานซ่อม ตรวจสอบ หรือการสอบเทียบ เช่น ถอดทำความสะอาดระบบแกนเลื่อน ปรับตั้ง Alignment และทดสอบอ่านค่าเปรียบเทียบ..."
                                        value={formDescription}
                                        onChange={e => setFormDescription(e.target.value)}
                                        className="w-full p-2.5 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-700 rounded-xl text-xs"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">ช่าง / ผู้ดำเนินการ</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น วิศวกร Bruker, ช่างสมศักดิ์"
                                            value={formTechnician}
                                            onChange={e => setFormTechnician(e.target.value)}
                                            className="w-full p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">บริษัท / Vender</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น Bruker Thailand Ltd."
                                            value={formVendor}
                                            onChange={e => setFormVendor(e.target.value)}
                                            className="w-full p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">เลขที่เอกสารอ้างอิง</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น PR-69-0012, QT-8891, CERT-99"
                                            value={formDocRef}
                                            onChange={e => setFormDocRef(e.target.value)}
                                            className="w-full p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">ค่าใช้จ่าย (บาท)</label>
                                        <input
                                            type="number"
                                            placeholder="เช่น 15000"
                                            value={formCost}
                                            onChange={e => setFormCost(e.target.value)}
                                            className="w-full p-2 bg-white dark:bg-base-900 border rounded-lg text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddFormOpen(false)}
                                        className="px-4 py-2 bg-white dark:bg-base-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-base-700"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-600/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {isSaving ? 'กำลังบันทึก...' : '💾 บันทึกลงประวัติเครื่องมือ'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* PRINT / BACKUP REPORT VIEW */}
                    {isPrintMode ? (
                        <div className="bg-white dark:bg-base-950 p-6 md:p-8 rounded-3xl border border-slate-300 dark:border-base-800 space-y-6 print:border-none print:p-0">
                            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                                <div>
                                    <span className="text-[11px] font-black tracking-widest uppercase text-slate-500">LABORATORY EQUIPMENT SERVICE & MAINTENANCE RECORD</span>
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                                        ใบบันทึกประวัติและผลการซ่อมบำรุงเครื่องมือวิทยาศาสตร์
                                    </h2>
                                    <p className="text-xs text-slate-500">ศูนย์วิจัยและพัฒนา PCRD Lab • เอกสารประกอบระบบคุณภาพ ISO / GMP</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-sm font-mono font-black text-slate-800 dark:text-slate-200 px-3 py-1 bg-slate-100 dark:bg-base-800 rounded-lg">
                                        {equipment.equipmentNo}
                                    </span>
                                    <p className="text-[10px] text-slate-400 mt-1">พิมพ์เมื่อ: {new Date().toLocaleDateString('th-TH')}</p>
                                </div>
                            </div>

                            {/* Equipment Info Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-base-900 rounded-2xl text-xs">
                                <div><span className="text-slate-400 block text-[10px] uppercase font-bold">ชื่อเครื่องมือ:</span> <strong>{equipment.equipmentName}</strong></div>
                                <div><span className="text-slate-400 block text-[10px] uppercase font-bold">ผู้ดูแล (Custodian):</span> <strong>{equipment.owner}</strong></div>
                                <div><span className="text-slate-400 block text-[10px] uppercase font-bold">สถานที่ติดตั้ง:</span> <strong>{equipment.location || equipment.department}</strong></div>
                                <div><span className="text-slate-400 block text-[10px] uppercase font-bold">สถานะปัจจุบัน:</span> <strong className={isBroken ? 'text-rose-600' : 'text-emerald-600'}>{isBroken ? '🚨 อยู่ระหว่างแจ้งซ่อม' : '🟢 พร้อมใช้งานปกติ'}</strong></div>
                            </div>

                            {/* Printable Table */}
                            <table className="w-full text-left text-xs border-collapse border border-slate-300">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                                        <th className="p-2 border-r border-slate-300 w-24">วันที่</th>
                                        <th className="p-2 border-r border-slate-300 w-32">ประเภท</th>
                                        <th className="p-2 border-r border-slate-300">รายละเอียดเหตุการณ์ / การซ่อมบำรุง / อะไหล่</th>
                                        <th className="p-2 border-r border-slate-300 w-32">ผู้ดำเนินการ / ช่าง</th>
                                        <th className="p-2 border-r border-slate-300 w-24 text-right">ค่าใช้จ่าย</th>
                                        <th className="p-2 w-28 text-center">ผลลัพธ์</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unifiedHistory.map((item, idx) => (
                                        <tr key={item.id || idx} className="border-b border-slate-200">
                                            <td className="p-2 border-r border-slate-200 font-mono text-[11px]">{item.date}</td>
                                            <td className="p-2 border-r border-slate-200 font-bold text-[11px]">{item.type}</td>
                                            <td className="p-2 border-r border-slate-200">
                                                <div className="font-bold text-slate-800">{item.title}</div>
                                                <div className="text-[11px] text-slate-600">{item.description}</div>
                                                {item.partsReplaced && <div className="text-[10px] text-amber-700 font-semibold mt-0.5">อะไหล่: {item.partsReplaced}</div>}
                                                {item.docRef && <div className="text-[10px] text-slate-400">อ้างอิง: {item.docRef}</div>}
                                            </td>
                                            <td className="p-2 border-r border-slate-200 text-[11px]">{item.technician}</td>
                                            <td className="p-2 border-r border-slate-200 text-right font-mono text-[11px]">{item.cost ? `${item.cost.toLocaleString()} ฿` : '-'}</td>
                                            <td className="p-2 text-center font-bold text-[11px] text-emerald-700">{item.result}</td>
                                        </tr>
                                    ))}
                                    {unifiedHistory.length === 0 && (
                                        <tr><td colSpan={6} className="p-6 text-center text-slate-400">ไม่มีประวัติบันทึก</td></tr>
                                    )}
                                </tbody>
                            </table>

                            <div className="flex justify-between items-center pt-8 border-t border-slate-200 text-xs text-slate-500">
                                <div>ลงชื่อ ..................................................... ผู้บันทึกประวัติ</div>
                                <div>ลงชื่อ ..................................................... หัวหน้าห้องปฏิบัติการ</div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 print:hidden">
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5"
                                >
                                    <span>🖨️ สั่งพิมพ์หน้านี้ (Print / Save as PDF)</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* CATEGORY TABS & SEARCH BAR (แยกเคสชัดเจนตามที่ขอ) */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-base-800">
                                {/* Case Tabs */}
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedTab('all')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            selectedTab === 'all'
                                                ? 'bg-indigo-600 text-white shadow-xs font-black'
                                                : 'bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                        }`}
                                    >
                                        ทั้งหมด ({unifiedHistory.length})
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedTab('breakdown')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            selectedTab === 'breakdown'
                                                ? 'bg-rose-600 text-white shadow-xs font-black'
                                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                                        }`}
                                    >
                                        🚨 แจ้งซ่อม/เบรกดาวน์ ({stats.breakdownCount})
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedTab('repair')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            selectedTab === 'repair'
                                                ? 'bg-amber-600 text-white shadow-xs font-black'
                                                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                                        }`}
                                    >
                                        🛠️ ซ่อมบำรุง & อะไหล่ ({stats.repairCount})
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedTab('pm_cal')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            selectedTab === 'pm_cal'
                                                ? 'bg-emerald-600 text-white shadow-xs font-black'
                                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100'
                                        }`}
                                    >
                                        🎯 สอบเทียบ & PM ({stats.pmCalCount})
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedTab('note')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            selectedTab === 'note'
                                                ? 'bg-slate-700 text-white shadow-xs font-black'
                                                : 'bg-slate-100 dark:bg-base-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                        }`}
                                    >
                                        📝 บันทึกทั่วไป ({unifiedHistory.filter(i => i.type === 'note' || i.type === 'inspection').length})
                                    </button>
                                </div>

                                {/* Filter Search & View Density Mode */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <div className="relative w-full sm:w-60">
                                        <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="ค้นหาในประวัติเครื่องนี้..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="flex items-center bg-slate-100 dark:bg-base-800 p-0.5 rounded-xl border border-slate-200 dark:border-base-700 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setViewDensity('detailed')}
                                            className={`px-2.5 py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${viewDensity === 'detailed' ? 'bg-white dark:bg-base-900 text-indigo-600 dark:text-indigo-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                                        >
                                            การ์ดละเอียด
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setViewDensity('compact')}
                                            className={`px-2.5 py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${viewDensity === 'compact' ? 'bg-white dark:bg-base-900 text-indigo-600 dark:text-indigo-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                                        >
                                            ตารางสรุป
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* COMPACT TABLE VIEW */}
                            {viewDensity === 'compact' && filteredItems.length > 0 && (
                                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-base-800">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-100 dark:bg-base-800/80 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-base-700">
                                            <tr>
                                                <th className="py-2.5 px-3 w-16 text-center">เคส</th>
                                                <th className="py-2.5 px-3 w-28">วันที่</th>
                                                <th className="py-2.5 px-3 w-36">ประเภท</th>
                                                <th className="py-2.5 px-3">รายละเอียด / อาการ / การแก้ไข</th>
                                                <th className="py-2.5 px-3 w-36">ผู้ดำเนินการ</th>
                                                <th className="py-2.5 px-3 w-24 text-right">ค่าใช้จ่าย</th>
                                                <th className="py-2.5 px-3 w-24 text-center">สถานะ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-base-800/50">
                                            {filteredItems.map((item, idx) => {
                                                const typeBadge = getTypeBadge(item.type);
                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-base-800/40 transition-colors">
                                                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                                                            #{filteredItems.length - idx}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-mono font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                                            {item.date || '-'}
                                                        </td>
                                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${typeBadge.bg}`}>
                                                                {item.type}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            <div className="font-bold text-slate-900 dark:text-white">{item.title}</div>
                                                            {item.description && <div className="text-[11px] text-slate-500 line-clamp-1">{item.description}</div>}
                                                            {item.partsReplaced && <div className="text-[10px] text-amber-600 font-bold">⚙️ อะไหล่: {item.partsReplaced}</div>}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                                            {item.technician}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                                            {item.cost ? `${item.cost.toLocaleString()} ฿` : '-'}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                                item.result === 'Resolved' || item.result === 'Pass'
                                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                            }`}>
                                                                {item.result}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* TIMELINE CARDS LIST (DETAILED MODE) */}
                            {viewDensity === 'detailed' && (
                            <div className="space-y-4">
                                {filteredItems.map((item, idx) => {
                                    const typeBadge = getTypeBadge(item.type);

                                    return (
                                        <div
                                            key={item.id}
                                            className={`p-4 md:p-5 rounded-2xl border transition-all ${
                                                item.source === 'active_breakdown'
                                                    ? 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-400 dark:border-rose-900 ring-2 ring-rose-500/30 shadow-sm'
                                                    : item.type === 'breakdown'
                                                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                                                        : item.type === 'calibration' || item.type === 'pm'
                                                            ? 'bg-emerald-50/30 dark:bg-emerald-950/15 border-emerald-200/60 dark:border-emerald-900/40'
                                                            : 'bg-slate-50/60 dark:bg-base-950/30 border-slate-200/90 dark:border-base-800'
                                            }`}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60 dark:border-base-800/60">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                                                        เคส #{filteredItems.length - idx}
                                                    </span>

                                                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black border ${typeBadge.bg}`}>
                                                        {typeBadge.label}
                                                    </span>

                                                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                                        <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                                                        {item.date || 'ไม่ระบุวันที่'}
                                                    </span>

                                                    {item.result && (
                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                                            item.result === 'Resolved' || item.result === 'Pass'
                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                : item.result === 'In Progress'
                                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                                        }`}>
                                                            ผลลัพธ์: {item.result}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 text-xs">
                                                    {item.cost ? (
                                                        <span className="font-mono font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 text-[11px] bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/50">
                                                            <CurrencyDollarIcon className="h-3.5 w-3.5" />
                                                            {item.cost.toLocaleString()} ฿
                                                        </span>
                                                    ) : null}

                                                    {item.source === 'custom_history' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteCustomHistory(item.id)}
                                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                                                            title="ลบประวัตินี้"
                                                        >
                                                            <TrashIcon className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Body */}
                                            <div className="pt-3 space-y-2">
                                                <h4 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                                                    {item.title}
                                                </h4>

                                                {item.description && (
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                        {item.description}
                                                    </p>
                                                )}

                                                {item.symptom && item.symptom !== item.title && (
                                                    <div className="text-xs bg-rose-50/50 dark:bg-rose-950/20 p-2.5 rounded-xl border border-rose-200/50 dark:border-rose-900/40 text-rose-800 dark:text-rose-200">
                                                        <span className="font-bold">🚨 อาการเสียที่พบ:</span> {item.symptom}
                                                    </div>
                                                )}

                                                {item.rootCause && (
                                                    <div className="text-xs bg-slate-100/70 dark:bg-base-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-base-800 text-slate-700 dark:text-slate-300">
                                                        <span className="font-bold">🔍 สาเหตุความผิดปกติ:</span> {item.rootCause}
                                                    </div>
                                                )}

                                                {/* Replaced Parts Callout */}
                                                {item.partsReplaced && (
                                                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs font-bold text-amber-900 dark:text-amber-200">
                                                        <span>⚙️ อะไหล่ที่เปลี่ยน:</span>
                                                        <span className="font-black underline">{item.partsReplaced}</span>
                                                    </div>
                                                )}

                                                {/* Sub action logs if from breakdown */}
                                                {item.actionLogs && item.actionLogs.length > 0 && (
                                                    <div className="pt-2">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                                                            ไทม์ไลน์ขั้นตอนที่ทำไปแล้ว ({item.actionLogs.length} รายการ):
                                                        </span>
                                                        <div className="space-y-1 pl-2 border-l-2 border-slate-200 dark:border-base-700">
                                                            {item.actionLogs.map((log, lIdx) => (
                                                                <div key={log.id || lIdx} className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                                                    <span className="font-mono text-[10px] text-slate-400 font-bold">{log.date}</span>
                                                                    <span>•</span>
                                                                    <span>{log.action}</span>
                                                                    {log.actor && <span className="text-[10px] text-slate-400 italic">({log.actor})</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Meta Footer */}
                                                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200/40 dark:border-base-800/50 flex-wrap gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span>👤 ดำเนินการโดย: <strong>{item.technician}</strong></span>
                                                        {item.vendor && item.vendor !== item.technician && (
                                                            <span>({item.vendor})</span>
                                                        )}
                                                    </div>

                                                    {item.docRef && (
                                                        <span className="font-mono font-bold text-slate-500 bg-slate-100 dark:bg-base-800 px-2 py-0.5 rounded-md">
                                                            📄 {item.docRef}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredItems.length === 0 && (
                                    <div className="py-12 text-center space-y-2 bg-slate-50 dark:bg-base-950/30 rounded-3xl border border-dashed border-slate-200 dark:border-base-800">
                                        <DocumentTextIcon className="h-8 w-8 text-slate-300 mx-auto" />
                                        <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                                            ยังไม่มีประวัติในหมวดนี้
                                        </h4>
                                        <p className="text-xs text-slate-400">
                                            กดปุ่ม "+ เพิ่มบันทึกประวัติใหม่" ด้านบนเพื่อเริ่มบันทึกประวัติเครื่องมือนี้
                                        </p>
                                    </div>
                                )}
                            </div>
                            )}
                        </>
                    )}
                </div>

                {/* MODAL FOOTER */}
                <div className="p-4 bg-slate-50 dark:bg-base-950/60 border-t border-slate-200 dark:border-base-800 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>ระบบบันทึกประวัติเครื่องมืออัตโนมัติ (Lab Asset Logbook & Backup System)</span>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-200 dark:bg-base-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 rounded-xl font-bold transition-all cursor-pointer"
                    >
                        ปิดหน้าต่าง
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EquipmentHistoryModal;
