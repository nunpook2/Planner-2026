import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Tester, Walkthrough } from '../types';
import { 
    getWalkthroughs, saveWalkthrough, deleteWalkthrough, acknowledgeWalkthrough 
} from '../services/dataService';
import { 
    CheckCircleIcon, ClockIcon, SearchIcon, PlusIcon, 
    TrashIcon, PencilIcon, SparklesIcon, BeakerIcon,
    XCircleIcon, UserGroupIcon, ArrowUpTrayIcon,
    DocumentTextIcon, ClipboardListIcon, CalendarIcon
} from './common/Icons';
import { 
    getStaffProfile, isValidStaffName, DEFAULT_LAB_STAFF, 
    isStaffAcknowledged, REAL_LAB_ROSTER 
} from '../utils/staffUtils';

interface WalkthroughTabProps {
    testers: Tester[];
    onWalkthroughUpdated?: () => void;
}

const DEFAULT_WALKTHROUGHS: Walkthrough[] = [
    {
        id: 'wt-01',
        title: '🧪 วิธีการทดสอบใหม่: การทดสอบจุดวาบไฟ Flash Point (ASTM D93) ด้วยเครื่อง Pensky-Martens อัตโนมัติ',
        content: `ทีมงานห้องปฏิบัติการโปรดทราบ มีการปรับปรุงวิธีทดสอบจุดวาบไฟเป็นเครื่องอัตโนมัติรุ่นใหม่ PDS-1014 ให้เจ้าหน้าที่ผู้รับผิดชอบเครื่องและนักวิเคราะห์ทุกท่านอ่านทำความเข้าใจคู่มือ SOP-QC-084 และลงลายมือชื่อรับทราบ\n\nขั้นตอนสำคัญ:\n1. ตรวจสอบระดับน้ำมันนำความร้อนและระบบระบายอากาศ\n2. ตั้งค่า Heating Rate 5.5°C/min ตามมาตรฐาน ASTM D93 Procedure A\n3. ทวนสอบค่าด้วยสารมาตรฐาน Certified Reference Material (CRM) ทุกสัปดาห์\n4. บันทึกผลในสมุดบันทึกและส่งรายงานผล`,
        createdBy: 'คุณพรทักข์ (PORNTHAK) - ผู้จัดการ Lab',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        targetTesters: ['PORNTHAK', 'CHANNACH', 'METEECHA', 'THAWAPHO', 'SANCHAIK', 'Boy2', 'Pong'],
        acknowledgements: {
            'PORNTHAK': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 86400000).toISOString() },
            'CHANNACH': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 40000000).toISOString() }
        },
        isCompleted: false
    },
    {
        id: 'wt-02',
        title: '🎯 กิจกรรมใหม่: แคมเปญ Cross-Check เปรียบเทียบผลระหว่างเครื่องมือ (Inter-Equipment Correlation)',
        content: `ขอเชิญเจ้าหน้าที่ผู้ดูแลเครื่องมือทุกท่านเข้าร่วมกิจกรรมทดสอบเปรียบเทียบผลระหว่างเครื่องมือ (Cross-Check) ประจำไตรมาส โดยจะมีการแจกตัวอย่าง Blind Sample เพื่อทดสอบค่าความหนืด (Viscosity) และความถ่วงจำเพาะ\n\nกำหนดการ:\n• รับตัวอย่างทดสอบ: วันจันทร์ เวลา 09:00 น.\n• บันทึกผลการทดสอบ: ภายในวันพุธ 16:00 น.\n• ประเมินค่า Z-score และวิเคราะห์ความคลาดเคลื่อน: วันศุกร์`,
        createdBy: 'คุณชาญณรงค์ (CHANNACH) - หัวหน้างาน QC',
        createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
        targetTesters: ['PORNTHAK', 'CHANNACH', 'METEECHA', 'THAWAPHO', 'SANCHAIK'],
        acknowledgements: {
            'PORNTHAK': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
            'CHANNACH': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
            'METEECHA': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 2 * 86400000).toISOString() }
        },
        isCompleted: false
    },
    {
        id: 'wt-03',
        title: '⚡ มาตรการใหม่: แนวทางจัดเก็บและส่งมอบใบรับรองการสอบเทียบ (Calibration Certificate Handover)',
        content: `ตั้งแต่วันนี้เป็นต้นไป เมื่อได้รับใบ Certificate จาก Vendor ในขั้นตอนที่ 4 ให้สแกนไฟล์ PDF แนบเข้าระบบทันที และส่งมอบเอกสารฉบับจริงให้แก่ผู้ดูแลเครื่องภายใน 48 ชั่วโมง พร้อมตรวจเช็คผลการสอบเทียบว่าผ่านเกณฑ์ยอมรับ (Tolerance) หรือไม่`,
        createdBy: 'ทีมควบคุมคุณภาพ (Quality Assurance Team)',
        createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
        targetTesters: ['PORNTHAK', 'CHANNACH', 'METEECHA', 'THAWAPHO', 'SANCHAIK', 'WIRAWATW', 'Boy2', 'Pong'],
        acknowledgements: {
            'PORNTHAK': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 5 * 86400000).toISOString() },
            'CHANNACH': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 5 * 86400000).toISOString() },
            'METEECHA': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 4 * 86400000).toISOString() },
            'THAWAPHO': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 4 * 86400000).toISOString() },
            'SANCHAIK': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
            'WIRAWATW': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
            'Boy2': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
            'Pong': { acknowledged: true, acknowledgedAt: new Date(Date.now() - 2 * 86400000).toISOString() }
        },
        isCompleted: true
    }
];

export const WalkthroughTab: React.FC<WalkthroughTabProps> = ({ testers, onWalkthroughUpdated }) => {
    const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
    
    // View mode: 'sheet' (Master-detail Dossier Sheet) or 'matrix' (Team Pending Checklist Table)
    const [viewMode, setViewMode] = useState<'sheet' | 'matrix'>('sheet');
    
    // Currently selected walkthrough in sheet mode
    const [selectedWalkthroughId, setSelectedWalkthroughId] = useState<string>('');
    
    // Active staff actor for quick acknowledge
    const [selectedTesterForAck, setSelectedTesterForAck] = useState<string>('PORNTHAK');
    
    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Partial<Walkthrough> | null>(null);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // List of clean, normalized lab staff identifiers
    const staffNames = useMemo(() => {
        const list: string[] = [];
        const seen = new Set<string>();

        // 1. Always prioritize official real lab staff roster
        REAL_LAB_ROSTER.forEach(s => {
            if (!seen.has(s.key)) {
                seen.add(s.key);
                list.push(s.key);
            }
        });

        // 2. Add extra testers if any from backend database
        (testers || []).forEach(t => {
            const prof = getStaffProfile(t.name || t.id, testers);
            if (!seen.has(prof.key)) {
                seen.add(prof.key);
                list.push(prof.key);
            }
        });

        return list;
    }, [testers]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getWalkthroughs();
            if (data && data.length > 0) {
                setWalkthroughs(data);
                localStorage.setItem('backup_walkthroughs', JSON.stringify(data));
            } else {
                const saved = localStorage.getItem('backup_walkthroughs');
                if (saved) {
                    setWalkthroughs(JSON.parse(saved));
                } else {
                    setWalkthroughs(DEFAULT_WALKTHROUGHS);
                    localStorage.setItem('backup_walkthroughs', JSON.stringify(DEFAULT_WALKTHROUGHS));
                }
            }
        } catch (err) {
            console.warn('Failed to load from Firestore, using fallback:', err);
            const saved = localStorage.getItem('backup_walkthroughs');
            if (saved) {
                setWalkthroughs(JSON.parse(saved));
            } else {
                setWalkthroughs(DEFAULT_WALKTHROUGHS);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Ensure a default selected item is present
    useEffect(() => {
        if (walkthroughs.length > 0 && !selectedWalkthroughId) {
            setSelectedWalkthroughId(walkthroughs[0].id || '');
        }
    }, [walkthroughs, selectedWalkthroughId]);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    // Acknowledge Walkthrough action
    const handleAcknowledge = async (walkthroughId: string, staffIdentifier: string) => {
        const prof = getStaffProfile(staffIdentifier, testers);
        try {
            await acknowledgeWalkthrough(walkthroughId, staffIdentifier);
            if (prof.docId && prof.docId !== staffIdentifier) {
                await acknowledgeWalkthrough(walkthroughId, prof.docId).catch(() => {});
            }
        } catch (err) {
            console.warn('Acknowledge API failed, fallback to local state:', err);
        }

        const now = new Date().toISOString();
        setWalkthroughs(prev => prev.map(wt => {
            if (wt.id !== walkthroughId) return wt;
            const updatedAcks = { ...(wt.acknowledgements || {}) };
            
            // Mark both raw identifier and canonical profiles as acknowledged
            updatedAcks[staffIdentifier] = { acknowledged: true, acknowledgedAt: now };
            updatedAcks[prof.key] = { acknowledged: true, acknowledgedAt: now };
            if (prof.docId) updatedAcks[prof.docId] = { acknowledged: true, acknowledgedAt: now };
            if (prof.enName) updatedAcks[prof.enName] = { acknowledged: true, acknowledgedAt: now };

            const isAllDone = (wt.targetTesters || []).every(t => isStaffAcknowledged(t, updatedAcks, testers));
            return {
                ...wt,
                acknowledgements: updatedAcks,
                isCompleted: isAllDone
            };
        }));

        showToast(`✓ บันทึกการลงนามรับทราบของ ${prof.thName} เรียบร้อยแล้ว`);
        await loadData();
        if (onWalkthroughUpdated) onWalkthroughUpdated();
    };

    // Save or Edit Walkthrough
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingItem?.title || !editingItem?.content) {
            showToast('⚠️ กรุณากรอกหัวข้อและรายละเอียด');
            return;
        }

        const creatorProf = getStaffProfile(editingItem.createdBy || selectedTesterForAck, testers);
        const newRecord: Omit<Walkthrough, 'id'> = {
            title: editingItem.title.trim(),
            content: editingItem.content.trim(),
            createdBy: `${creatorProf.thName} (${creatorProf.role})`,
            createdAt: editingItem.createdAt || new Date().toISOString(),
            targetTesters: editingItem.targetTesters && editingItem.targetTesters.length > 0 
                ? editingItem.targetTesters 
                : staffNames.slice(0, 8),
            acknowledgements: editingItem.acknowledgements || {},
            isCompleted: false,
            imageUrl: editingItem.imageUrl || undefined
        };

        try {
            await saveWalkthrough(newRecord, editingItem.id);
            showToast(editingItem.id ? '✓ บันทึกการแก้ไขเอกสารเรียบร้อยแล้ว' : '✓ สร้างเอกสาร Walkthrough ใหม่เรียบร้อยแล้ว');
            setIsCreateModalOpen(false);
            setEditingItem(null);
            await loadData();
            if (onWalkthroughUpdated) onWalkthroughUpdated();
        } catch (err) {
            console.error('Error saving walkthrough:', err);
            showToast('⚠️ เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        }
    };

    // Delete Walkthrough
    const handleDelete = async (id: string) => {
        if (!confirm('ยืนยันการลบเอกสารประกาศ Walkthrough นี้หรือไม่?')) return;
        try {
            await deleteWalkthrough(id);
            showToast('✓ ลบเอกสารเรียบร้อยแล้ว');
            if (selectedWalkthroughId === id) {
                const remaining = walkthroughs.filter(w => w.id !== id);
                setSelectedWalkthroughId(remaining[0]?.id || '');
            }
            await loadData();
            if (onWalkthroughUpdated) onWalkthroughUpdated();
        } catch (err) {
            console.error('Error deleting walkthrough:', err);
            showToast('⚠️ เกิดข้อผิดพลาดในการลบข้อมูล');
        }
    };

    // Image Upload to Base64
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('⚠️ ขนาดไฟล์รูปภาพต้องไม่เกิน 2MB');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setEditingItem(prev => ({ ...prev, imageUrl: reader.result as string }));
            showToast('✓ แนบไฟล์รูปภาพสำเร็จ');
        };
        reader.readAsDataURL(file);
    };

    // Filtered walkthroughs for list navigation
    const filteredWalkthroughs = useMemo(() => {
        return walkthroughs.filter(wt => {
            const targets = (wt.targetTesters || []).filter(isValidStaffName);
            const acks = wt.acknowledgements || {};
            const isDone = wt.isCompleted || (targets.length > 0 && targets.every(t => isStaffAcknowledged(t, acks, testers)));

            if (filterStatus === 'pending' && isDone) return false;
            if (filterStatus === 'completed' && !isDone) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchTitle = wt.title.toLowerCase().includes(q);
                const matchContent = wt.content.toLowerCase().includes(q);
                const matchCreator = wt.createdBy.toLowerCase().includes(q);
                if (!matchTitle && !matchContent && !matchCreator) return false;
            }
            return true;
        });
    }, [walkthroughs, filterStatus, searchQuery, testers]);

    // Active selected walkthrough
    const activeWalkthrough = useMemo(() => {
        return walkthroughs.find(w => w.id === selectedWalkthroughId) || filteredWalkthroughs[0] || walkthroughs[0] || null;
    }, [walkthroughs, selectedWalkthroughId, filteredWalkthroughs]);

    // Overall stats
    const stats = useMemo(() => {
        const total = walkthroughs.length;
        let completed = 0;
        let totalPendingAcks = 0;
        const staffPendingCounts: Record<string, number> = {};
        
        walkthroughs.forEach(wt => {
            const targets = (wt.targetTesters || []).filter(isValidStaffName);
            const acks = wt.acknowledgements || {};
            const isDone = wt.isCompleted || (targets.length > 0 && targets.every(t => isStaffAcknowledged(t, acks, testers)));
            if (isDone) completed++;

            targets.forEach(staff => {
                if (!isStaffAcknowledged(staff, acks, testers)) {
                    totalPendingAcks++;
                    const prof = getStaffProfile(staff, testers);
                    staffPendingCounts[prof.key] = (staffPendingCounts[prof.key] || 0) + 1;
                }
            });
        });

        const pending = total - completed;
        const pendingRanking = Object.entries(staffPendingCounts)
            .sort((a, b) => b[1] - a[1]);

        return { 
            total, 
            completed, 
            pending, 
            totalPendingAcks, 
            pendingRanking,
            hasPending: totalPendingAcks > 0
        };
    }, [walkthroughs, testers]);

    // Team Matrix analysis (Who is pending which walkthrough)
    const teamMatrix = useMemo(() => {
        return staffNames.map(staff => {
            const prof = getStaffProfile(staff, testers);
            // Match both canonical key and raw variations
            const assigned = walkthroughs.filter(w => {
                const targets = (w.targetTesters || []).map(t => getStaffProfile(t, testers).key);
                return targets.includes(prof.key);
            });
            const acknowledged = assigned.filter(w => {
                return isStaffAcknowledged(prof.key, w.acknowledgements || {}, testers);
            });
            const pendingList = assigned.filter(w => !acknowledged.includes(w));
            const percent = assigned.length > 0 ? Math.round((acknowledged.length / assigned.length) * 100) : 100;
            return {
                key: prof.key,
                profile: prof,
                totalAssigned: assigned.length,
                ackCount: acknowledged.length,
                pendingCount: pendingList.length,
                pendingItems: pendingList,
                isClean: pendingList.length === 0,
                percent
            };
        }).sort((a, b) => b.pendingCount - a.pendingCount);
    }, [staffNames, walkthroughs, testers]);

    return (
        <div className="space-y-3.5 animate-fade-in w-full text-slate-900 dark:text-slate-100">
            {/* TOP EXECUTIVE BAR & VIEW CONTROLLER */}
            <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-slate-200 dark:border-base-800 shadow-2xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-black uppercase tracking-wider text-violet-700 bg-violet-50 dark:bg-violet-950 px-2 py-0.5 rounded-md border border-violet-200">
                                📢 กิจกรรมใหม่ & การทดสอบใหม่ (Lab Walkthrough)
                            </span>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                📑 {stats.total} เอกสารประกาศ
                            </span>
                            {stats.hasPending && (
                                <span className="text-xs font-extrabold text-amber-900 bg-amber-100 dark:bg-amber-950 dark:text-amber-200 px-2.5 py-0.5 rounded-lg border border-amber-300">
                                    ⚠️ รวมค้างรับทราบ {stats.totalPendingAcks} คน-รายการ
                                </span>
                            )}
                        </div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                            ระบบเอกสาร Walkthrough กิจกรรมใหม่ & มาตรฐานวิธีการทดสอบห้องแล็บ
                        </h2>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                            จัดแสดงเป็นสัดเป็นส่วนแบบใบงาน (Dossier Sheet) ตรวจสอบขั้นตอนการปฏิบัติงาน และติดตามรายชื่อผู้ที่ยังค้างรับทราบได้อย่างแม่นยำ
                        </p>
                    </div>

                    {/* Quick Actor Selector & Create Button */}
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-base-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-base-700">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">👤 ลงนามในนาม:</span>
                            <select
                                value={selectedTesterForAck}
                                onChange={e => setSelectedTesterForAck(e.target.value)}
                                className="bg-white dark:bg-base-900 text-xs font-extrabold text-slate-900 dark:text-white px-2.5 py-1 rounded-md border border-slate-300 dark:border-base-700 outline-none cursor-pointer max-w-xs truncate"
                            >
                                {staffNames.map(name => {
                                    const prof = getStaffProfile(name, testers);
                                    return (
                                        <option key={name} value={name}>
                                            {prof.thName} ({prof.enName}) - {prof.role}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                const creatorProf = getStaffProfile(selectedTesterForAck, testers);
                                setEditingItem({
                                    title: '',
                                    content: '',
                                    createdBy: `${creatorProf.thName} (${creatorProf.role})`,
                                    targetTesters: staffNames.slice(0, 8),
                                    acknowledgements: {}
                                });
                                setIsCreateModalOpen(true);
                            }}
                            className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-violet-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                            <PlusIcon className="h-3.5 w-3.5" />
                            <span>+ สร้าง Walkthrough ใหม่</span>
                        </button>
                    </div>
                </div>

                {/* Sub-bar: View Mode Toggles & Summary Metrics */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-base-800">
                    {/* View Switcher: Dossier Sheet vs Team Pending Matrix */}
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-base-800 p-1 rounded-xl border border-slate-200 dark:border-base-700">
                        <button
                            onClick={() => setViewMode('sheet')}
                            className={`px-3.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                                viewMode === 'sheet'
                                    ? 'bg-white dark:bg-base-700 text-violet-700 dark:text-violet-300 shadow-2xs font-black'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                            }`}
                        >
                            <DocumentTextIcon className="h-3.5 w-3.5" />
                            <span>📑 ใบงาน Walkthrough (อ่าน & ลงนามทีละเรื่อง)</span>
                        </button>
                        <button
                            onClick={() => setViewMode('matrix')}
                            className={`px-3.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                                viewMode === 'matrix'
                                    ? 'bg-white dark:bg-base-700 text-violet-700 dark:text-violet-300 shadow-2xs font-black'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                            }`}
                        >
                            <ClipboardListIcon className="h-3.5 w-3.5" />
                            <span>📊 ตารางเช็คค้างรายบุคคล (ใครค้างเรื่องไหนบ้าง)</span>
                            {stats.hasPending && (
                                <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-amber-500 text-white">
                                    {stats.totalPendingAcks}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Quick Attention Callout */}
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 flex-wrap">
                        <span>🎯 ผู้ค้างรับทราบสูงสุด:</span>
                        {stats.pendingRanking.slice(0, 3).map(([key, count]) => {
                            const prof = getStaffProfile(key, testers);
                            return (
                                <span 
                                    key={key} 
                                    onClick={() => {
                                        setSelectedTesterForAck(key);
                                        setViewMode('matrix');
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900 border border-amber-200 text-amber-900 dark:text-amber-200 cursor-pointer font-bold text-[11px] transition-colors"
                                    title="คลิกเพื่อดูรายการที่ค้าง"
                                >
                                    {prof.thName} ({count} เรื่อง)
                                </span>
                            );
                        })}
                        {stats.pendingRanking.length === 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                ✓ ไม่มีผู้ค้างรับทราบ ทุกคนรับทราบครบถ้วน 100%
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* VIEW MODE 1: MASTER-DETAIL DOSSIER SHEET (เป็นสัดส่วน ดูง่าย ไม่กระจายยาว) */}
            {viewMode === 'sheet' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
                    {/* LEFT PANEL: Document Selector List (เลือกหัวข้อ Walkthrough) */}
                    <div className="lg:col-span-4 bg-white dark:bg-base-900 rounded-2xl border border-slate-200 dark:border-base-800 shadow-2xs overflow-hidden flex flex-col">
                        {/* Search and Filters */}
                        <div className="p-3 border-b border-slate-100 dark:border-base-800 space-y-2">
                            <div className="relative">
                                <SearchIcon className="h-4 w-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อการทดสอบ, กิจกรรม, SOP..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-base-950 border border-slate-200 dark:border-base-700 rounded-xl font-medium outline-none"
                                />
                            </div>

                            {/* Status Pills */}
                            <div className="flex items-center gap-1 text-[11px] font-extrabold">
                                <button
                                    onClick={() => setFilterStatus('all')}
                                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                        filterStatus === 'all' 
                                            ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900' 
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400'
                                    }`}
                                >
                                    ทั้งหมด ({stats.total})
                                </button>
                                <button
                                    onClick={() => setFilterStatus('pending')}
                                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                        filterStatus === 'pending' 
                                            ? 'bg-amber-500 text-white' 
                                            : 'text-amber-800 hover:bg-amber-50 dark:text-amber-300'
                                    }`}
                                >
                                    ค้างรับทราบ ({stats.pending})
                                </button>
                                <button
                                    onClick={() => setFilterStatus('completed')}
                                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                        filterStatus === 'completed' 
                                            ? 'bg-emerald-600 text-white' 
                                            : 'text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300'
                                    }`}
                                >
                                    ครบ 100% ({stats.completed})
                                </button>
                            </div>
                        </div>

                        {/* List items */}
                        <div className="divide-y divide-slate-100 dark:divide-base-800 max-h-[640px] overflow-y-auto">
                            {filteredWalkthroughs.length === 0 ? (
                                <div className="p-8 text-center text-slate-500 font-bold text-xs space-y-1">
                                    <span>📭 ไม่พบเอกสารที่ตรงกับเงื่อนไข</span>
                                </div>
                            ) : (
                                filteredWalkthroughs.map((item, idx) => {
                                    const targets = (item.targetTesters || []).filter(isValidStaffName);
                                    const acks = item.acknowledgements || {};
                                    const ackCount = targets.filter(t => isStaffAcknowledged(t, acks, testers)).length;
                                    const isDone = item.isCompleted || (ackCount >= targets.length && targets.length > 0);
                                    const isSelected = activeWalkthrough?.id === item.id;
                                    const hasMyAck = isStaffAcknowledged(selectedTesterForAck, acks, testers);
                                    const isTargetMe = targets.some(t => getStaffProfile(t, testers).key === getStaffProfile(selectedTesterForAck, testers).key);

                                    return (
                                        <div
                                            key={item.id || idx}
                                            onClick={() => setSelectedWalkthroughId(item.id || '')}
                                            className={`p-3 transition-all cursor-pointer border-l-4 ${
                                                isSelected 
                                                    ? 'bg-violet-50/70 dark:bg-violet-950/30 border-violet-600 shadow-2xs' 
                                                    : 'hover:bg-slate-50/80 dark:hover:bg-base-800/50 border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[10px] font-mono font-black text-slate-500 bg-slate-100 dark:bg-base-800 px-1.5 py-0.5 rounded">
                                                            #{idx + 1}
                                                        </span>
                                                        {isDone ? (
                                                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                                                                ครบ 100%
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                                                                รับทราบ {ackCount}/{targets.length}
                                                            </span>
                                                        )}
                                                        {isTargetMe && (
                                                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${hasMyAck ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-800'}`}>
                                                                {hasMyAck ? 'คุณเซ็นแล้ว' : 'คุณยังค้างเซ็น!'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="text-xs font-black text-slate-900 dark:text-white line-clamp-2 leading-snug">
                                                        {item.title}
                                                    </h4>
                                                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 pt-0.5">
                                                        <span className="truncate">โดย: {item.createdBy}</span>
                                                        <span className="shrink-0 font-bold">{Math.round((ackCount / (targets.length || 1)) * 100)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* RIGHT PANEL: The Active Walkthrough Dossier Sheet (ใบงานฉบับเต็ม เป็นสเต็ปสเต็ป) */}
                    <div className="lg:col-span-8 bg-white dark:bg-base-900 rounded-2xl border border-slate-200 dark:border-base-800 shadow-2xs overflow-hidden">
                        {activeWalkthrough ? (
                            <div className="space-y-4">
                                {/* Dossier Header Banner */}
                                <div className="p-4 sm:p-5 bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 text-white rounded-t-2xl space-y-2.5">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-black bg-white/20 text-white backdrop-blur-xs">
                                                DOC: {activeWalkthrough.id || 'WT-DOC'}
                                            </span>
                                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black bg-amber-400 text-slate-950">
                                                LAB STANDARD WALKTHROUGH
                                            </span>
                                        </div>

                                        {/* Edit & Delete Action Buttons */}
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => {
                                                    setEditingItem(activeWalkthrough);
                                                    setIsCreateModalOpen(true);
                                                }}
                                                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors"
                                                title="แก้ไขเนื้อหาเอกสาร"
                                            >
                                                <PencilIcon className="h-3 w-3" />
                                                <span>แก้ไขเอกสาร</span>
                                            </button>
                                            <button
                                                onClick={() => activeWalkthrough.id && handleDelete(activeWalkthrough.id)}
                                                className="p-1 text-white/70 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                                                title="ลบเอกสารประกาศ"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <h3 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">
                                        {activeWalkthrough.title}
                                    </h3>

                                    <div className="flex items-center justify-between gap-3 flex-wrap text-xs font-medium text-violet-200 pt-1 border-t border-white/15">
                                        <span>📢 ผู้รับผิดชอบ/ผู้ประกาศ: <strong className="text-white font-bold">{activeWalkthrough.createdBy}</strong></span>
                                        <span>📅 ประกาศเมื่อ: <strong className="text-white font-bold">{new Date(activeWalkthrough.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></span>
                                    </div>
                                </div>

                                {/* Step-by-Step Document Body */}
                                <div className="p-4 sm:p-6 space-y-5">
                                    {/* STEP 1: SUMMARY & PROGRESS STATUS */}
                                    <div className="p-3.5 bg-violet-50/60 dark:bg-violet-950/25 rounded-xl border border-violet-200 dark:border-violet-800/60 space-y-2">
                                        <div className="flex items-center justify-between text-xs font-black">
                                            <span className="text-violet-900 dark:text-violet-200 uppercase tracking-wider flex items-center gap-1.5">
                                                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[11px]">1</span>
                                                <span>สถานะการรับทราบภาพรวม (Acknowledgement Progress)</span>
                                            </span>
                                            {(() => {
                                                const targets = (activeWalkthrough.targetTesters || []).filter(isValidStaffName);
                                                const acks = activeWalkthrough.acknowledgements || {};
                                                const ackCount = targets.filter(t => isStaffAcknowledged(t, acks, testers)).length;
                                                const total = targets.length || 1;
                                                const percent = Math.round((ackCount / total) * 100);
                                                return (
                                                    <span className="font-mono text-sm font-extrabold text-violet-700 dark:text-violet-300">
                                                        {ackCount} จาก {total} คน ({percent}%)
                                                    </span>
                                                );
                                            })()}
                                        </div>

                                        {/* Progress line */}
                                        {(() => {
                                            const targets = (activeWalkthrough.targetTesters || []).filter(isValidStaffName);
                                            const acks = activeWalkthrough.acknowledgements || {};
                                            const ackCount = targets.filter(t => isStaffAcknowledged(t, acks, testers)).length;
                                            const total = targets.length || 1;
                                            const percent = Math.round((ackCount / total) * 100);
                                            const isDone = percent === 100;
                                            return (
                                                <div className="h-2.5 bg-slate-200 dark:bg-base-800 rounded-full overflow-hidden border border-slate-300 dark:border-base-700">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-700 ${isDone ? 'bg-emerald-500' : 'bg-violet-600'}`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* STEP 2: OPERATIONAL PROCEDURE / SOP CONTENT */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                                            <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-[11px]">2</span>
                                            <span>ข้อกำหนดและขั้นตอนการปฏิบัติงาน (Operational Details & Guidelines)</span>
                                        </div>
                                        <div className="p-4 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-medium leading-relaxed whitespace-pre-line shadow-inner">
                                            {activeWalkthrough.content}
                                        </div>
                                    </div>

                                    {/* STEP 3: ATTACHMENTS & SCHEMATICS */}
                                    {activeWalkthrough.imageUrl && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                                                <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-[11px]">3</span>
                                                <span>เอกสารแนบ / แผนภาพขั้นตอน (Attached Diagram)</span>
                                            </div>
                                            <div className="p-3 bg-white dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 flex items-center gap-4">
                                                <img 
                                                    src={activeWalkthrough.imageUrl} 
                                                    alt="เอกสารแนบ" 
                                                    className="h-20 w-28 object-cover rounded-lg border border-slate-300 shadow-xs cursor-pointer hover:opacity-90 transition-opacity" 
                                                    onClick={() => setViewingImage(activeWalkthrough.imageUrl || null)}
                                                />
                                                <div className="space-y-1">
                                                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">แผนภาพ SOP / รูปภาพเครื่องมือประกอบคำอธิบาย</h5>
                                                    <p className="text-[11px] text-slate-500 font-medium">คลิกที่รูปภาพเพื่อเปิดดูขนาดเต็มความละเอียดสูง</p>
                                                    <button 
                                                        onClick={() => setViewingImage(activeWalkthrough.imageUrl || null)}
                                                        className="text-xs font-extrabold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer flex items-center gap-1"
                                                    >
                                                        <span>🔍 ดูรูปภาพขนาดเต็ม</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* STEP 4: TEAM SIGN-OFF & PENDING TRACKER */}
                                    <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-base-800">
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                                                <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-[11px]">4</span>
                                                <span>บัญชีรายชื่อการลงนามรับทราบ (Acknowledgement Register)</span>
                                            </div>

                                            {/* Quick Sign-off for active actor */}
                                            {(() => {
                                                const acks = activeWalkthrough.acknowledgements || {};
                                                const hasMyAck = isStaffAcknowledged(selectedTesterForAck, acks, testers);
                                                const actorProf = getStaffProfile(selectedTesterForAck, testers);

                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAcknowledge(activeWalkthrough.id || '', selectedTesterForAck)}
                                                        className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                                                            hasMyAck
                                                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300'
                                                                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/25 active:scale-95'
                                                        }`}
                                                    >
                                                        {hasMyAck ? (
                                                            <>
                                                                <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                                                                <span>{actorProf.thName} ลงนามรับทราบแล้ว ✓</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <SparklesIcon className="h-4 w-4" />
                                                                <span>คลิกเพื่อลงนามรับทราบ ({actorProf.thName})</span>
                                                            </>
                                                        )}
                                                    </button>
                                                );
                                            })()}
                                        </div>

                                        {/* Two-Column Structured Section: Pending vs Acknowledged */}
                                        {(() => {
                                            const targets = (activeWalkthrough.targetTesters || []).filter(isValidStaffName);
                                            const acks = activeWalkthrough.acknowledgements || {};
                                            const pendingList = targets.filter(t => !isStaffAcknowledged(t, acks, testers));
                                            const ackList = targets.filter(t => isStaffAcknowledged(t, acks, testers));

                                            return (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                                                    {/* LEFT COLUMN: PENDING LIST */}
                                                    <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/50 space-y-2">
                                                        <div className="flex items-center justify-between text-xs font-black text-amber-950 dark:text-amber-200">
                                                            <span className="flex items-center gap-1">
                                                                <span>⏳ ผู้ที่ยังค้างรับทราบ</span>
                                                                <span className="px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900 text-[11px] font-black">
                                                                    {pendingList.length} คน
                                                                </span>
                                                            </span>
                                                            <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold">
                                                                (ต้องแจ้งเตือนให้ลงนาม)
                                                            </span>
                                                        </div>

                                                        {pendingList.length === 0 ? (
                                                            <div className="p-4 text-center text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-base-900 rounded-lg border border-emerald-200 flex flex-col items-center gap-1">
                                                                <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                                                                <span>ทุกคนในกลุ่มเป้าหมายลงนามรับทราบครบถ้วนแล้ว 100%!</span>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                                                {pendingList.map(staff => {
                                                                    const prof = getStaffProfile(staff, testers);
                                                                    return (
                                                                        <div 
                                                                            key={staff} 
                                                                            className="flex items-center justify-between p-2.5 bg-white dark:bg-base-900 rounded-xl border border-amber-200/90 dark:border-amber-900/60 shadow-2xs hover:border-amber-400 transition-colors"
                                                                        >
                                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200 flex items-center justify-center font-black text-xs shrink-0 border border-amber-300">
                                                                                    {prof.thShort.charAt(0)}
                                                                                </div>
                                                                                <div className="min-w-0">
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        <span className="font-black text-slate-900 dark:text-white text-xs">{prof.thName}</span>
                                                                                        <span className="text-[10px] font-bold text-violet-700 bg-violet-50 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 px-1.5 py-0.2 rounded font-mono">
                                                                                            {prof.enName}
                                                                                        </span>
                                                                                    </div>
                                                                                    <span className="text-[10px] text-amber-900 dark:text-amber-300 font-semibold block truncate">
                                                                                        {prof.role}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleAcknowledge(activeWalkthrough.id || '', staff)}
                                                                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg font-black text-[11px] cursor-pointer shrink-0 ml-2 shadow-2xs transition-all flex items-center gap-1"
                                                                                title={`บันทึกรับทราบแทน ${prof.thName}`}
                                                                            >
                                                                                <span>+ เซ็นแทน</span>
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* RIGHT COLUMN: ACKNOWLEDGED LIST */}
                                                    <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                                                        <div className="flex items-center justify-between text-xs font-black text-emerald-950 dark:text-emerald-200">
                                                            <span className="flex items-center gap-1">
                                                                <span>✅ ผู้ที่ลงนามรับทราบแล้ว</span>
                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-[11px] font-black">
                                                                    {ackList.length} คน
                                                                </span>
                                                            </span>
                                                            <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold">
                                                                (บันทึกเวลาเป็นหลักฐาน)
                                                            </span>
                                                        </div>

                                                        {ackList.length === 0 ? (
                                                            <div className="p-4 text-center text-xs font-bold text-slate-500 bg-white dark:bg-base-900 rounded-lg border border-slate-200">
                                                                ยังไม่มีผู้ลงนามรับทราบในเอกสารนี้
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                                                {ackList.map(staff => {
                                                                    const prof = getStaffProfile(staff, testers);
                                                                    const ackInfo = acks[staff] || acks[prof.key] || (prof.docId ? acks[prof.docId] : null);
                                                                    const time = ackInfo?.acknowledgedAt;
                                                                    return (
                                                                        <div 
                                                                            key={staff} 
                                                                            className="flex items-center justify-between p-2.5 bg-white dark:bg-base-900 rounded-xl border border-emerald-200/90 dark:border-emerald-900/60 shadow-2xs"
                                                                        >
                                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-black text-xs shrink-0 border border-emerald-300">
                                                                                    ✓
                                                                                </div>
                                                                                <div className="min-w-0">
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        <span className="font-black text-slate-900 dark:text-white text-xs">{prof.thName}</span>
                                                                                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 dark:bg-base-800 px-1.5 py-0.2 rounded font-mono">
                                                                                            {prof.enName}
                                                                                        </span>
                                                                                    </div>
                                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block truncate">
                                                                                        {prof.role}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="text-right shrink-0 ml-2">
                                                                                <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded block">
                                                                                    รับทราบแล้ว
                                                                                </span>
                                                                                {time && (
                                                                                    <span className="text-[9px] text-slate-400 block mt-0.5">
                                                                                        {new Date(time).toLocaleDateString('th-TH', { 
                                                                                            day: 'numeric', 
                                                                                            month: 'short', 
                                                                                            hour: '2-digit', 
                                                                                            minute: '2-digit' 
                                                                                        })}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-16 text-center text-slate-500 font-bold space-y-2">
                                <span className="text-4xl">📄</span>
                                <h4 className="text-sm font-black text-slate-700 dark:text-slate-200">กรุณาเลือกเอกสาร Walkthrough จากแถบซ้ายมือ</h4>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* VIEW MODE 2: TEAM PENDING MATRIX (ตารางสรุปค้างรับทราบรายบุคคล ใครค้างเรื่องไหนบ้าง) */}
            {viewMode === 'matrix' && (
                <div className="bg-white dark:bg-base-900 rounded-2xl border border-slate-200 dark:border-base-800 shadow-2xs overflow-hidden space-y-3 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-base-800">
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                <ClipboardListIcon className="h-4 w-4 text-violet-600" />
                                <span>ตารางตรวจสอบสถานะการค้างรับทราบรายบุคคล (Team Walkthrough Acknowledgement Matrix)</span>
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
                                ดูภาพรวมว่าพนักงานแล็บแต่ละท่านผ่านการ Walkthrough เรื่องใดแล้วบ้าง และยังค้างเรื่องใดที่ต้องแจ้งเพื่อทราบ
                            </p>
                        </div>
                        <span className="text-xs font-extrabold text-slate-700 bg-slate-100 dark:bg-base-800 px-3 py-1 rounded-xl border border-slate-200">
                            👥 ตรวจสอบ {teamMatrix.length} เจ้าหน้าที่
                        </span>
                    </div>

                    {/* Matrix Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-base-800">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-base-950 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-base-800 font-black">
                                    <th className="py-2.5 px-3">ชื่อเจ้าหน้าที่ / ตำแหน่งงาน</th>
                                    <th className="py-2.5 px-3">ทีม / แผนก</th>
                                    <th className="py-2.5 px-3">สถานะภาพรวม</th>
                                    <th className="py-2.5 px-3">ความคืบหน้า (%)</th>
                                    <th className="py-2.5 px-3">รายการ Walkthrough ที่ยังค้างอยู่ (Pending List)</th>
                                    <th className="py-2.5 px-3 text-right">ดำเนินการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-base-800 font-medium">
                                {teamMatrix.map((staffRow) => {
                                    const prof = staffRow.profile;
                                    return (
                                        <tr key={staffRow.key} className="hover:bg-slate-50/70 dark:hover:bg-base-800/40 transition-colors">
                                            <td className="py-3 px-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                                        staffRow.isClean 
                                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300' 
                                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                                                    }`}>
                                                        {prof.thShort.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-extrabold text-slate-900 dark:text-white text-xs block">{prof.thName}</span>
                                                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-base-800 px-1 py-0.2 rounded font-bold">
                                                                {prof.enName}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 font-semibold block">{prof.role} • รับผิดชอบ {staffRow.totalAssigned} เรื่อง</span>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="py-3 px-3">
                                                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                                    {prof.team}
                                                </span>
                                            </td>

                                            <td className="py-3 px-3">
                                                {staffRow.isClean ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                                                        <CheckCircleIcon className="h-3 w-3" /> ครบทุกเรื่อง (Clean)
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                                        <ClockIcon className="h-3 w-3" /> ค้าง {staffRow.pendingCount} เรื่อง
                                                    </span>
                                                )}
                                            </td>

                                            <td className="py-3 px-3">
                                                <div className="w-28 space-y-1">
                                                    <div className="flex justify-between text-[10px] font-bold">
                                                        <span>{staffRow.ackCount}/{staffRow.totalAssigned}</span>
                                                        <span>{staffRow.percent}%</span>
                                                    </div>
                                                    <div className="h-1.5 bg-slate-200 dark:bg-base-800 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${staffRow.isClean ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                            style={{ width: `${staffRow.percent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="py-3 px-3">
                                                {staffRow.isClean ? (
                                                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">✓ ได้รับการ Walkthrough ครบทุกหัวข้อแล้ว</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5 max-w-md">
                                                        {staffRow.pendingItems.map(pItem => (
                                                            <div 
                                                                key={pItem.id}
                                                                onClick={() => {
                                                                    setSelectedWalkthroughId(pItem.id || '');
                                                                    setViewMode('sheet');
                                                                }}
                                                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors max-w-[200px] truncate"
                                                                title={`คลิกเพื่อเปิดดูเรื่อง: ${pItem.title}`}
                                                            >
                                                                ⚠️ {pItem.title}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="py-3 px-3 text-right">
                                                {!staffRow.isClean ? (
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTesterForAck(staffRow.key);
                                                            setSelectedWalkthroughId(staffRow.pendingItems[0]?.id || '');
                                                            setViewMode('sheet');
                                                        }}
                                                        className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-lg text-[11px] transition-all cursor-pointer shadow-xs"
                                                    >
                                                        เปิดตรวจ & เซ็น ❯
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-400 text-xs font-bold">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL: CREATE OR EDIT WALKTHROUGH */}
            {isCreateModalOpen && editingItem && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-base-800 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-base-800">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                    {editingItem.id ? 'แก้ไขเอกสาร Walkthrough' : 'สร้างเอกสาร Walkthrough กิจกรรม/การทดสอบใหม่'}
                                </h3>
                                <p className="text-xs text-slate-500 font-semibold">
                                    ออกประกาศขั้นตอน SOP หรือแจ้งเวียนกิจกรรมใหม่ พร้อมกำหนดรายชื่อผู้รับผิดชอบ
                                </p>
                            </div>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-base-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4 text-xs font-semibold">
                            {/* Title */}
                            <div>
                                <label className="block mb-1 text-slate-700 dark:text-slate-300">1. หัวข้อกิจกรรม หรือชื่อการทดสอบใหม่ (Topic Title):</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="เช่น การทดสอบจุดวาบไฟ Flash Point ด้วยเครื่อง Pensky-Martens อัตโนมัติ"
                                    value={editingItem.title || ''}
                                    onChange={e => setEditingItem(prev => ({ ...prev, title: e.target.value }))}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border border-slate-300 dark:border-base-700 rounded-xl font-bold text-xs"
                                />
                            </div>

                            {/* Creator Name */}
                            <div>
                                <label className="block mb-1 text-slate-700 dark:text-slate-300">2. ผู้ประกาศ / ผู้รับผิดชอบ (Created by):</label>
                                <select
                                    value={editingItem.createdBy || selectedTesterForAck}
                                    onChange={e => setEditingItem(prev => ({ ...prev, createdBy: e.target.value }))}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border border-slate-300 dark:border-base-700 rounded-xl font-bold text-xs outline-none cursor-pointer"
                                >
                                    {staffNames.map(staff => {
                                        const prof = getStaffProfile(staff, testers);
                                        return (
                                            <option key={staff} value={staff}>
                                                {prof.thName} ({prof.enName}) - {prof.role}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {/* Content */}
                            <div>
                                <label className="block mb-1 text-slate-700 dark:text-slate-300">3. รายละเอียดขั้นตอนการทดสอบ / ข้อกำหนดที่ทีมงานต้องปฏิบัติ:</label>
                                <textarea
                                    required
                                    rows={5}
                                    placeholder="ระบุข้อกำหนด ขั้นตอนที่ 1, 2, 3 เกณฑ์ยอมรับ หรือจุดที่ต้องระมัดระวังเป็นพิเศษ..."
                                    value={editingItem.content || ''}
                                    onChange={e => setEditingItem(prev => ({ ...prev, content: e.target.value }))}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-base-950 border border-slate-300 dark:border-base-700 rounded-xl font-medium text-xs leading-relaxed"
                                />
                            </div>

                            {/* Target Testers Checkbox list */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-slate-700 dark:text-slate-300">4. ทีมงานเป้าหมายที่ต้องลงนามรับทราบ:</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditingItem(prev => ({ ...prev, targetTesters: [...staffNames] }))}
                                            className="text-[10px] text-violet-600 hover:underline cursor-pointer"
                                        >
                                            เลือกทุกคน
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingItem(prev => ({ ...prev, targetTesters: [] }))}
                                            className="text-[10px] text-slate-500 hover:underline cursor-pointer"
                                        >
                                            ยกเลิกทั้งหมด
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-base-950 rounded-xl border border-slate-200 dark:border-base-800 max-h-48 overflow-y-auto">
                                    {staffNames.map(staff => {
                                        const prof = getStaffProfile(staff, testers);
                                        const isChecked = (editingItem.targetTesters || []).includes(staff);
                                        return (
                                            <label key={staff} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-base-900 cursor-pointer font-bold text-xs border border-transparent hover:border-slate-200">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={e => {
                                                        const current = editingItem.targetTesters || [];
                                                        if (e.target.checked) {
                                                            setEditingItem(prev => ({ ...prev, targetTesters: [...current, staff] }));
                                                        } else {
                                                            setEditingItem(prev => ({ ...prev, targetTesters: current.filter(s => s !== staff) }));
                                                        }
                                                    }}
                                                    className="rounded text-violet-600 h-4 w-4"
                                                />
                                                <div className="min-w-0">
                                                    <span className="text-slate-900 dark:text-white font-extrabold">{prof.thName}</span>
                                                    <span className="text-[10px] text-slate-500 ml-1.5">({prof.enName} • {prof.role})</span>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Image Attachment */}
                            <div>
                                <label className="block mb-1 text-slate-700 dark:text-slate-300">5. แนบรูปภาพ SOP / เครื่องมือ / แผนผัง (ถ้ามี):</label>
                                <div className="flex items-center gap-3">
                                    <label className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 rounded-xl cursor-pointer flex items-center gap-2 border border-slate-300 dark:border-base-700 transition-colors">
                                        <ArrowUpTrayIcon className="h-4 w-4 text-slate-600" />
                                        <span>เลือกไฟล์รูปภาพ (PNG, JPG)</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            className="hidden"
                                        />
                                    </label>
                                    {editingItem.imageUrl && (
                                        <div className="flex items-center gap-2">
                                            <img src={editingItem.imageUrl} alt="preview" className="h-9 w-9 object-cover rounded-lg border border-slate-200" />
                                            <button
                                                type="button"
                                                onClick={() => setEditingItem(prev => ({ ...prev, imageUrl: undefined }))}
                                                className="text-rose-500 text-[11px] hover:underline"
                                            >
                                                ลบรูป
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-base-800">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black shadow-md shadow-violet-500/25"
                                >
                                    {editingItem.id ? 'บันทึกการแก้ไข' : 'ยืนยันการประกาศ'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* FULLSCREEN IMAGE VIEWER MODAL */}
            {viewingImage && (
                <div 
                    className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in"
                    onClick={() => setViewingImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-base-900 rounded-2xl p-2 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setViewingImage(null)}
                            className="absolute top-4 right-4 p-1.5 bg-black/60 hover:bg-black text-white rounded-full transition-colors z-10"
                        >
                            <XCircleIcon className="h-6 w-6" />
                        </button>
                        <img 
                            src={viewingImage} 
                            alt="รูปภาพขนาดเต็ม" 
                            className="max-h-[85vh] w-auto object-contain rounded-xl"
                        />
                    </div>
                </div>
            )}

            {/* TOAST NOTIFICATION */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-3 rounded-2xl shadow-xl border border-slate-700 dark:border-slate-200 text-xs font-black animate-slide-up flex items-center gap-2">
                    <SparklesIcon className="h-4 w-4 text-violet-400 dark:text-violet-600" />
                    <span>{toastMessage}</span>
                </div>
            )}
        </div>
    );
};

export default WalkthroughTab;
