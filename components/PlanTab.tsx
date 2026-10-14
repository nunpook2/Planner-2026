import React, { useState, useMemo } from 'react';
import type { Equipment, TrackingWorkflowStatus } from '../types';
import { 
    CalendarIcon, ChevronDownIcon, ClockIcon, CheckCircleIcon, 
    AlertTriangleIcon, SearchIcon, SparklesIcon, PencilIcon, BoxIcon 
} from './common/Icons';
import { 
    MONTH_KEYS, MONTH_INFO_MAP, normalizeMonth, 
    formatMonthName, getPreparationTimeline 
} from '../utils/monthUtils';
import { saveEquipment } from '../services/dataService';

interface PlanTabProps {
    equipments: Equipment[];
    onEquipmentUpdated: () => void;
}

export const PlanTab: React.FC<PlanTabProps> = ({ equipments, onEquipmentUpdated }) => {
    // Current real-world month (or default to current month in Thai context)
    const currentRealMonthKey = useMemo(() => {
        const monthIdx = new Date().getMonth(); // 0..11
        return MONTH_KEYS[monthIdx];
    }, []);

    const [selectedMonth, setSelectedMonth] = useState<string>('Nov'); // Default to Nov for high-impact demo or all
    const [selectedType, setSelectedType] = useState<'all' | 'pm' | 'cal'>('all');
    const [selectedAssignee, setSelectedAssignee] = useState<'all' | 'Vender' | 'Owner'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showOnlyPendingPrep, setShowOnlyPendingPrep] = useState(false);

    // Modal state for quick viewing/updating machine from plan
    const [selectedTaskDetail, setSelectedTaskDetail] = useState<{
        equipmentId: string;
        isSub: boolean;
        subId?: string;
        equipmentNo: string;
        equipmentName: string;
        owner: string;
        type: 'PM' | 'Cal';
        assignee: string;
        month: string;
        items: string;
        tolerance: string;
        trackingStatus: TrackingWorkflowStatus;
    } | null>(null);

    // Aggregate monthly scheduled tasks
    const monthlyData = useMemo(() => {
        const result: Record<string, Array<{
            id: string;
            equipmentId: string;
            isSub: boolean;
            subId?: string;
            equipmentNo: string;
            equipmentName: string;
            owner: string;
            type: 'PM' | 'Cal';
            assignee: string;
            month: string;
            items: string;
            tolerance: string;
            trackingStatus: TrackingWorkflowStatus;
        }>> = {};

        MONTH_KEYS.forEach(m => { result[m] = []; });

        const processItem = (
            eqId: string,
            eqNo: string, 
            name: string, 
            owner: string, 
            pm: any, 
            cal: any, 
            tracking: TrackingWorkflowStatus, 
            isSub: boolean, 
            subId?: string
        ) => {
            const status = tracking || {
                quotationRequested: false, prIssued: false, vendorScheduled: false,
                certReceived: false, certDelivered: false, result: 'Pending'
            };

            // Check PM Month
            const rawPMMonth = pm?.lastPM || pm?.nextPM;
            const normPMMonth = normalizeMonth(rawPMMonth);
            if (normPMMonth && result[normPMMonth]) {
                result[normPMMonth].push({
                    id: isSub ? `${subId}-pm` : `${eqId}-pm`,
                    equipmentId: eqId,
                    isSub,
                    subId,
                    equipmentNo: eqNo,
                    equipmentName: name,
                    owner: owner || 'PORNTHAK',
                    type: 'PM',
                    assignee: pm?.pmBy || 'Vender',
                    month: normPMMonth,
                    items: pm?.items || '',
                    tolerance: pm?.tolerance || '',
                    trackingStatus: status
                });
            }

            // Check Cal Month
            const rawCalMonth = cal?.lastCal || cal?.nextCal;
            const normCalMonth = normalizeMonth(rawCalMonth);
            if (normCalMonth && result[normCalMonth]) {
                result[normCalMonth].push({
                    id: isSub ? `${subId}-cal` : `${eqId}-cal`,
                    equipmentId: eqId,
                    isSub,
                    subId,
                    equipmentNo: eqNo,
                    equipmentName: name,
                    owner: owner || 'PORNTHAK',
                    type: 'Cal',
                    assignee: cal?.calBy || 'Vender',
                    month: normCalMonth,
                    items: cal?.items || '',
                    tolerance: cal?.tolerance || '',
                    trackingStatus: status
                });
            }
        };

        (equipments || []).forEach(eq => {
            if (!eq) return;
            const eqNo = String(eq.equipmentNo || eq.code || eq.name || '');
            const eqName = String(eq.equipmentName || eq.name || '');
            processItem(eq.id, eqNo, eqName, eq.owner, eq.pm, eq.cal, eq.trackingStatus, false);

            (eq.subEquipments || []).forEach(sub => {
                if (!sub) return;
                processItem(eq.id, sub.equipmentNo, sub.equipmentName, sub.owner || eq.owner, sub.pm, sub.cal, sub.trackingStatus, true, sub.id);
            });
        });

        return result;
    }, [equipments]);

    // Fast toggle for a step directly from PlanTab
    const handleQuickStepToggle = async (
        task: typeof monthlyData['Nov'][0], 
        stepKey: keyof TrackingWorkflowStatus
    ) => {
        const curVal = !!task.trackingStatus[stepKey];
        const nextStatus = { ...task.trackingStatus, [stepKey]: !curVal };

        const targetParent = equipments.find(e => e.id === task.equipmentId);
        if (!targetParent) return;

        if (!task.isSub) {
            await saveEquipment({ ...targetParent, trackingStatus: nextStatus });
        } else if (task.subId) {
            const updatedSubs = (targetParent.subEquipments || []).map(s => 
                s.id === task.subId ? { ...s, trackingStatus: nextStatus } : s
            );
            await saveEquipment({ ...targetParent, subEquipments: updatedSubs });
        }
        onEquipmentUpdated();
    };

    // Lead time timeline for current selected month
    const timelineInfo = useMemo(() => {
        if (selectedMonth === 'all') return null;
        return getPreparationTimeline(selectedMonth);
    }, [selectedMonth]);

    // Active month items filtered
    const activeTasks = useMemo(() => {
        let list: typeof monthlyData['Nov'] = [];
        if (selectedMonth === 'all') {
            MONTH_KEYS.forEach(m => {
                list = list.concat(monthlyData[m] || []);
            });
        } else {
            list = monthlyData[selectedMonth] || [];
        }

        // Apply filters
        return list.filter(task => {
            if (selectedType !== 'all' && task.type.toLowerCase() !== selectedType) return false;
            if (selectedAssignee !== 'all' && task.assignee.toLowerCase() !== selectedAssignee.toLowerCase()) return false;
            if (showOnlyPendingPrep) {
                // Must be Vendor task and pending either Quotation or PR
                if (task.assignee === 'Vender' && task.trackingStatus.quotationRequested && task.trackingStatus.prIssued) {
                    return false;
                }
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const match = task.equipmentNo.toLowerCase().includes(q) ||
                    task.equipmentName.toLowerCase().includes(q) ||
                    task.owner.toLowerCase().includes(q) ||
                    task.items.toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });
    }, [monthlyData, selectedMonth, selectedType, selectedAssignee, showOnlyPendingPrep, searchQuery]);

    // Split tasks into Vendor vs Owner
    const vendorTasks = useMemo(() => activeTasks.filter(t => t.assignee === 'Vender'), [activeTasks]);
    const ownerTasks = useMemo(() => activeTasks.filter(t => t.assignee === 'Owner'), [activeTasks]);

    // Preparation statistics for the selected month
    const prepStats = useMemo(() => {
        const totalVendor = vendorTasks.length;
        const quoteDone = vendorTasks.filter(t => t.trackingStatus.quotationRequested).length;
        const prDone = vendorTasks.filter(t => t.trackingStatus.prIssued).length;
        const schedDone = vendorTasks.filter(t => t.trackingStatus.vendorScheduled).length;
        const certDone = vendorTasks.filter(t => t.trackingStatus.certReceived).length;

        return {
            totalVendor,
            quoteDone,
            quotePending: totalVendor - quoteDone,
            prDone,
            prPending: totalVendor - prDone,
            schedDone,
            schedPending: totalVendor - schedDone,
            certDone
        };
    }, [vendorTasks]);

    return (
        <div className="space-y-6 animate-fade-in w-full">
            {/* Header Section */}
            <div className="bg-white dark:bg-base-900 p-6 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary-600 bg-primary-50 dark:bg-primary-950/40 px-2.5 py-1 rounded-full">
                            Annual Master Timeline & Lead-time Cockpit
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                            ปฏิทิน 12 เดือน & ระบบเตือนเตรียมตัวล่วงหน้า
                        </span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        แผนปฏิบัติการ PM & Calibration ประจำปี (รายเดือน)
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                        เลือกดูแต่ละเดือนได้ทันที รู้ล่วงหน้าว่าต้องเตรียมขอ Quotation, ออก PR, หรือนัด Vendor เดือนไหน แยกชัดเจนระหว่าง Vendor และ Owner
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setSelectedMonth('Nov')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            selectedMonth === 'Nov' 
                                ? 'bg-primary-600 text-white shadow-md' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-white'
                        }`}
                    >
                        🎯 เดือน 11 (พ.ย. / Nov)
                    </button>
                    <button
                        onClick={() => setSelectedMonth('Jan')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            selectedMonth === 'Jan' 
                                ? 'bg-primary-600 text-white shadow-md' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-white'
                        }`}
                    >
                        🗓️ เดือน 1 (ม.ค. / Jan)
                    </button>
                    <button
                        onClick={() => setSelectedMonth('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            selectedMonth === 'all' 
                                ? 'bg-primary-600 text-white shadow-md' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-white'
                        }`}
                    >
                        แสดงทุกเดือน (All Months)
                    </button>
                </div>
            </div>

            {/* MONTH SELECTOR BAR (12 MONTHS BUTTONS WITH THAI NAMES & BADGES) */}
            <div className="bg-white dark:bg-base-900 p-3 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max">
                    {MONTH_KEYS.map(mKey => {
                        const info = MONTH_INFO_MAP[mKey];
                        const count = (monthlyData[mKey] || []).length;
                        const isSelected = selectedMonth === mKey;
                        const isRealCurrent = currentRealMonthKey === mKey;
                        const hasVendorWork = (monthlyData[mKey] || []).some(t => t.assignee === 'Vender');

                        return (
                            <button
                                key={mKey}
                                onClick={() => setSelectedMonth(mKey)}
                                className={`
                                    flex flex-col items-center justify-center p-2.5 px-3.5 rounded-2xl transition-all duration-200 relative min-w-[84px]
                                    ${isSelected
                                        ? 'bg-gradient-to-b from-primary-600 to-indigo-700 text-white shadow-lg shadow-primary-500/30 scale-105 z-10'
                                        : 'bg-slate-50 dark:bg-base-950/40 hover:bg-slate-100 dark:hover:bg-base-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-base-800'
                                    }
                                `}
                            >
                                {isRealCurrent && (
                                    <span className={`absolute -top-1.5 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase ${
                                        isSelected ? 'bg-amber-400 text-amber-950' : 'bg-amber-500 text-white'
                                    }`}>
                                        Now
                                    </span>
                                )}
                                <span className={`text-[10px] font-black uppercase tracking-wider ${isSelected ? 'text-primary-100' : 'text-slate-400'}`}>
                                    เดือน {info.index}
                                </span>
                                <span className="text-xs font-black mt-0.5">
                                    {info.thShort}
                                </span>
                                <span className={`text-[10px] font-medium ${isSelected ? 'text-primary-200' : 'text-slate-400'}`}>
                                    {info.key}
                                </span>
                                
                                <span className={`mt-1 text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                                    isSelected 
                                        ? 'bg-white/20 text-white' 
                                        : count > 0 ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300' : 'text-slate-300'
                                }`}>
                                    {count} งาน
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* LEAD-TIME ROADMAP & ADVANCE PREPARATION BANNER */}
            {timelineInfo && (
                <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-primary-950 text-white p-6 rounded-3xl shadow-xl space-y-5 border border-indigo-700/40">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md text-amber-300">
                                <ClockIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full">
                                        ระบบแจ้งเตือนการเตรียมตัวล่วงหน้า (Lead Time Roadmap)
                                    </span>
                                    <span className="text-xs text-indigo-200 font-bold">
                                        สำหรับรอบงานเดือน {timelineInfo.target.thFull} ({timelineInfo.target.key} - เดือน {timelineInfo.target.index})
                                    </span>
                                </div>
                                <h3 className="text-xl font-black mt-1">
                                    📅 แผนเตรียมความพร้อมเพื่อไม่ให้งานหลุดกำหนดการ (Due Date)
                                </h3>
                            </div>
                        </div>

                        {/* Summary prep badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="bg-white/10 px-3 py-2 rounded-xl backdrop-blur-sm text-center">
                                <span className="text-[10px] text-indigo-200 block font-bold">งาน Vendor ทั้งหมด</span>
                                <span className="text-base font-black text-white">{prepStats.totalVendor} รายการ</span>
                            </div>
                            <div className={`px-3 py-2 rounded-xl backdrop-blur-sm text-center ${prepStats.quotePending > 0 ? 'bg-rose-500/20 border border-rose-400/40' : 'bg-emerald-500/20'}`}>
                                <span className="text-[10px] text-indigo-200 block font-bold">รอขอ Quotation</span>
                                <span className={`text-base font-black ${prepStats.quotePending > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                                    {prepStats.quotePending} รายการ
                                </span>
                            </div>
                            <div className={`px-3 py-2 rounded-xl backdrop-blur-sm text-center ${prepStats.prPending > 0 ? 'bg-amber-500/20 border border-amber-400/40' : 'bg-emerald-500/20'}`}>
                                <span className="text-[10px] text-indigo-200 block font-bold">รอออกใบ PR</span>
                                <span className={`text-base font-black ${prepStats.prPending > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                                    {prepStats.prPending} รายการ
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Step-by-Step Roadmap Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {timelineInfo.steps.map((st) => (
                            <div key={st.step} className="bg-white/5 border border-white/10 hover:border-white/20 p-4 rounded-2xl space-y-2 backdrop-blur-sm transition-all">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200">
                                        สเต็ปที่ {st.step}
                                    </span>
                                    <span className="text-[10px] font-bold text-amber-300">
                                        ⏱️ {st.timeframe}
                                    </span>
                                </div>
                                <h4 className="font-bold text-sm text-white">
                                    {st.name}
                                </h4>
                                <div className="bg-white/10 px-2.5 py-1 rounded-lg text-[11px] font-black text-amber-300">
                                    🗓️ ต้องเริ่มใน: {st.suggestedMonth.thFull} ({st.suggestedMonth.key})
                                </div>
                                <p className="text-[11px] text-indigo-200 leading-relaxed">
                                    {st.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FILTER & SEARCH CONTROLS */}
            <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <SearchIcon className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัสเครื่อง, ชื่อเครื่อง, ผู้ดูแล..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary-500 dark:text-white"
                        />
                    </div>

                    <select
                        value={selectedType}
                        onChange={e => setSelectedType(e.target.value as any)}
                        className="px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                    >
                        <option value="all">ทั้งงาน PM และ Calibration</option>
                        <option value="pm">เฉพาะงาน PM</option>
                        <option value="cal">เฉพาะงาน Calibration</option>
                    </select>

                    <select
                        value={selectedAssignee}
                        onChange={e => setSelectedAssignee(e.target.value as any)}
                        className="px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                    >
                        <option value="all">ผู้รับผิดชอบ (ทั้งหมด)</option>
                        <option value="Vender">🏢 เฉพาะ Vendor (ภายนอก)</option>
                        <option value="Owner">🛠️ เฉพาะ Owner (ทำเองภายใน)</option>
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowOnlyPendingPrep(prev => !prev)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                            showOnlyPendingPrep
                                ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300'
                                : 'bg-slate-50 dark:bg-base-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-base-700'
                        }`}
                    >
                        <AlertTriangleIcon className="h-3.5 w-3.5" />
                        <span>เฉพาะงานที่ยังไม่เสร็จ (Pending Prep)</span>
                    </button>
                </div>
            </div>

            {/* SECTION 1: VENDOR TASKS (REQUIRES QUOTATION, PR, SCHEDULING) */}
            {(selectedAssignee === 'all' || selectedAssignee === 'Vender') && (
                <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm overflow-hidden">
                    <div className="p-4 md:px-6 bg-slate-50 dark:bg-base-950/70 border-b border-base-200 dark:border-base-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="p-2 bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 rounded-xl text-sm">
                                🏢
                            </span>
                            <div>
                                <h3 className="font-black text-slate-900 dark:text-white text-base">
                                    งานที่ต้องจ้าง Vendor / ผู้แทนจำหน่าย ({vendorTasks.length} รายการ)
                                </h3>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    ต้องดำเนินการขอใบเสนอราคา ออกใบ PR และนัดหมายวันเข้าหน้างานล่วงหน้า
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-blue-950/40 rounded-lg">
                                รอบเดือน: {selectedMonth === 'all' ? 'ทุกเดือน' : formatMonthName(selectedMonth, 'badge')}
                            </span>
                        </div>
                    </div>

                    {vendorTasks.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-base-800">
                            {vendorTasks.map((task, idx) => (
                                <div key={`${task.id || 'task'}_${idx}`} className="p-4 md:px-6 hover:bg-slate-50/70 dark:hover:bg-base-800/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3.5 flex-1">
                                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 mt-0.5 ${
                                            task.type === 'PM' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        }`}>
                                            {task.type}
                                        </span>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                                                    task.isSub ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50' : 'bg-slate-100 text-slate-800 dark:bg-base-800 dark:text-white'
                                                }`}>
                                                    {task.equipmentNo}
                                                </span>
                                                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                                                    {task.equipmentName}
                                                </h4>
                                                {task.isSub && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-indigo-50 text-indigo-600 rounded">
                                                        เครื่องพ่วงย่อย
                                                    </span>
                                                )}
                                                <span className="text-[10px] font-bold text-slate-500">
                                                    👤 {task.owner}
                                                </span>
                                            </div>

                                            {task.items && (
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-xl">
                                                    {task.items}
                                                </p>
                                            )}

                                            {task.tolerance && (
                                                <span className="text-[10px] font-bold text-slate-400 block">
                                                    เกณฑ์ยอมรับ (Tolerance): {task.tolerance}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Workflow Pipeline for this Vendor Item */}
                                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                                        {/* Step 1: Quotation */}
                                        <button
                                            onClick={() => handleQuickStepToggle(task, 'quotationRequested')}
                                            className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all ${
                                                task.trackingStatus.quotationRequested
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300/40'
                                                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                            }`}
                                            title="คลิกเพื่อสลับสถานะขอใบเสนอราคา"
                                        >
                                            {task.trackingStatus.quotationRequested ? '✓ ขอใบเสนอราคาแล้ว' : '⚠️ รอขอ Quotation'}
                                        </button>

                                        {/* Step 2: PR */}
                                        <button
                                            onClick={() => handleQuickStepToggle(task, 'prIssued')}
                                            className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all ${
                                                task.trackingStatus.prIssued
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300/40'
                                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                            }`}
                                            title="คลิกเพื่อสลับสถานะออก PR"
                                        >
                                            {task.trackingStatus.prIssued ? '✓ ออก PR แล้ว' : '⏳ รอออก PR'}
                                        </button>

                                        {/* Step 3: Schedule */}
                                        <button
                                            onClick={() => handleQuickStepToggle(task, 'vendorScheduled')}
                                            className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all ${
                                                task.trackingStatus.vendorScheduled
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300/40'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                            }`}
                                            title="คลิกเพื่อสลับสถานะนัดหมายช่าง"
                                        >
                                            {task.trackingStatus.vendorScheduled ? '✓ นัดคิวแล้ว' : 'รอนัดช่าง'}
                                        </button>

                                        {/* Final Result Badge */}
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                                            task.trackingStatus.result === 'Pass' 
                                                ? 'bg-emerald-500 text-white' 
                                                : 'bg-slate-100 dark:bg-base-800 text-slate-400'
                                        }`}>
                                            {task.trackingStatus.result || 'Pending'}
                                        </span>

                                        <button
                                            onClick={() => setSelectedTaskDetail(task)}
                                            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg transition-colors"
                                            title="ดูรายละเอียด / แก้ไขขั้นตอน"
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center text-xs text-slate-400 italic">
                            ไม่มีงานของ Vendor ในรอบเดือนที่เลือก
                        </div>
                    )}
                </div>
            )}

            {/* SECTION 2: OWNER TASKS (INTERNAL MAINTENANCE) */}
            {(selectedAssignee === 'all' || selectedAssignee === 'Owner') && (
                <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm overflow-hidden">
                    <div className="p-4 md:px-6 bg-slate-50 dark:bg-base-950/70 border-b border-base-200 dark:border-base-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="p-2 bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded-xl text-sm">
                                🛠️
                            </span>
                            <div>
                                <h3 className="font-black text-slate-900 dark:text-white text-base">
                                    งานที่พนักงานดูแลทำเองภายใน (Owner Task) ({ownerTasks.length} รายการ)
                                </h3>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    การบำรุงรักษาและสอบเทียบโดยเจ้าของเครื่อง (ไม่ต้องเปิด PR หรือจ้างภายนอก)
                                </p>
                            </div>
                        </div>

                        <span className="text-xs font-bold px-2.5 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950/40 rounded-lg">
                            ภายในองค์กร (Internal)
                        </span>
                    </div>

                    {ownerTasks.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-base-800">
                            {ownerTasks.map((task, idx) => (
                                <div key={`${task.id || 'task'}_${idx}`} className="p-4 md:px-6 hover:bg-slate-50/70 dark:hover:bg-base-800/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3.5 flex-1">
                                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 mt-0.5 ${
                                            task.type === 'PM' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                        }`}>
                                            {task.type}
                                        </span>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono font-black text-xs px-2 py-0.5 bg-slate-100 dark:bg-base-800 text-slate-800 dark:text-white rounded-lg">
                                                    {task.equipmentNo}
                                                </span>
                                                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                                                    {task.equipmentName}
                                                </h4>
                                                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                                                    👤 ผู้ดูแล: {task.owner}
                                                </span>
                                            </div>

                                            {task.items && (
                                                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                                    {task.items}
                                                </p>
                                            )}

                                            {task.tolerance && (
                                                <span className="text-[10px] font-bold text-slate-400 block">
                                                    เกณฑ์ยอมรับ: {task.tolerance}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 rounded-xl">
                                            ทำเองโดยเจ้าของเครื่อง
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center text-xs text-slate-400 italic">
                            ไม่มีงานที่ Owner ต้องทำเองในรอบเดือนนี้
                        </div>
                    )}
                </div>
            )}

            {/* DETAIL & QUICK UPDATE MODAL */}
            {selectedTaskDetail && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedTaskDetail(null)}>
                    <div className="relative my-auto bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-2xl max-w-lg w-full overflow-hidden space-y-4 p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-base-200 dark:border-base-800 pb-3">
                            <div>
                                <span className="text-[10px] font-black text-primary-600 uppercase tracking-wider">
                                    อัปเดตสเต็ปการดำเนินงาน
                                </span>
                                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>{selectedTaskDetail.equipmentNo}</span>
                                    <span className="text-xs text-slate-500 font-bold">({selectedTaskDetail.equipmentName})</span>
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedTaskDetail(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-3 bg-slate-50 dark:bg-base-950/50 rounded-2xl space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">รอบเดือนที่กำหนด:</span>
                                    <span className="font-black text-primary-600">{formatMonthName(selectedTaskDetail.month, 'full')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">ประเภทงาน:</span>
                                    <span className="font-bold">{selectedTaskDetail.type} โดย {selectedTaskDetail.assignee}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">พนักงานผู้ดูแล:</span>
                                    <span className="font-bold">{selectedTaskDetail.owner}</span>
                                </div>
                            </div>

                            {/* 6 Step Interactive Checkboxes */}
                            <div className="space-y-2 pt-2">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                                    สถานะการติดตาม 6 ขั้นตอน:
                                </label>
                                
                                {[
                                    { key: 'quotationRequested', label: '1. ขอใบเสนอราคา (Quotation) จาก Vendor' },
                                    { key: 'prIssued', label: '2. แจ้งออกใบ PR ในระบบแล้ว' },
                                    { key: 'vendorScheduled', label: '3. นัดหมายช่าง/Vendor เข้าหน้างานแล้ว' },
                                    { key: 'certReceived', label: '4. ได้รับใบ Certificate แล้ว' },
                                    { key: 'certDelivered', label: '5. ส่งมอบใบ Cert ให้พนักงานผู้ดูแลแล้ว' },
                                ].map((step) => {
                                    const val = !!(selectedTaskDetail.trackingStatus as any)[step.key];
                                    return (
                                        <button
                                            key={step.key}
                                            type="button"
                                            onClick={async () => {
                                                const updated = {
                                                    ...selectedTaskDetail.trackingStatus,
                                                    [step.key]: !val
                                                };
                                                setSelectedTaskDetail({
                                                    ...selectedTaskDetail,
                                                    trackingStatus: updated
                                                });
                                                await handleQuickStepToggle(selectedTaskDetail as any, step.key as any);
                                            }}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl border text-left font-bold transition-all ${
                                                val 
                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' 
                                                    : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-base-950 dark:text-slate-400'
                                            }`}
                                        >
                                            <span>{step.label}</span>
                                            <span className="text-xs">{val ? '✓ สำเร็จ' : 'รอทำ'}</span>
                                        </button>
                                    );
                                })}

                                {/* Result selector */}
                                <div className="pt-2">
                                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                        6. ผลการสอบเทียบ (Result):
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['Pass', 'Fail', 'Pending'] as const).map(res => (
                                            <button
                                                key={res}
                                                type="button"
                                                onClick={async () => {
                                                    const updated = {
                                                        ...selectedTaskDetail.trackingStatus,
                                                        result: res
                                                    };
                                                    setSelectedTaskDetail({
                                                        ...selectedTaskDetail,
                                                        trackingStatus: updated
                                                    });
                                                    const target = equipments.find(e => e.id === selectedTaskDetail.equipmentId);
                                                    if (target) {
                                                        if (!selectedTaskDetail.isSub) {
                                                            await saveEquipment({ ...target, trackingStatus: updated });
                                                        } else if (selectedTaskDetail.subId) {
                                                            const updSubs = (target.subEquipments || []).map(s => 
                                                                s.id === selectedTaskDetail.subId ? { ...s, trackingStatus: updated } : s
                                                            );
                                                            await saveEquipment({ ...target, subEquipments: updSubs });
                                                        }
                                                        onEquipmentUpdated();
                                                    }
                                                }}
                                                className={`py-2 rounded-xl text-xs font-black transition-all ${
                                                    selectedTaskDetail.trackingStatus.result === res
                                                        ? res === 'Pass' ? 'bg-emerald-600 text-white' : res === 'Fail' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white'
                                                        : 'bg-slate-100 text-slate-600 dark:bg-base-800'
                                                }`}
                                            >
                                                {res === 'Pass' ? '✓ ผ่าน (Pass)' : res === 'Fail' ? '✗ ไม่ผ่าน' : '⏳ รอผล'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-base-200 dark:border-base-800 flex justify-end">
                            <button
                                onClick={() => setSelectedTaskDetail(null)}
                                className="px-5 py-2 bg-primary-600 text-white rounded-xl font-bold text-xs shadow-md"
                            >
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlanTab;
