import React, { useState, useEffect, useCallback } from 'react';
import EquipmentTab from './components/EquipmentTab';
import BreakdownTab from './components/BreakdownTab';
import WorkflowTab from './components/WorkflowTab';
import PlanTab from './components/PlanTab';
import WalkthroughTab from './components/WalkthroughTab';
import ProficiencyTab from './components/ProficiencyTab';
import AiAssistantTab from './components/AiAssistantTab';
import ImportTab from './components/ImportTab';
import SettingsTab from './components/SettingsTab';
import { getEquipments, getTesters, getAppSettings, getWalkthroughs } from './services/dataService';
import type { Equipment, Tester, AppSettings, Walkthrough } from './types';
import { 
    CogIcon, BeakerIcon, RefreshIcon, AlertTriangleIcon, 
    CalendarIcon, UploadIcon, SparklesIcon, DocumentTextIcon, UserGroupIcon
} from './components/common/Icons';

const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in py-32">
        <div className="relative">
            <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-white dark:bg-base-900 rounded-full"></div>
            </div>
        </div>
        <span className="mt-4 text-xs font-black text-slate-400 tracking-[0.2em] uppercase">Loading System...</span>
    </div>
);

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'equipment' | 'breakdown' | 'workflow' | 'plan' | 'walkthrough' | 'proficiency' | 'ai' | 'import' | 'settings'>('equipment');
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [testers, setTesters] = useState<Tester[]>([]);
    const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const triggerRefresh = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fetchedEquips, fetchedTesters, fetchedSettings, fetchedWalkthroughs] = await Promise.all([
                getEquipments(),
                getTesters().catch(() => []),
                getAppSettings().catch(() => null),
                getWalkthroughs().catch(() => [])
            ]);
            setEquipments(fetchedEquips);
            setTesters(fetchedTesters);
            if (fetchedSettings) setAppSettings(fetchedSettings);
            if (fetchedWalkthroughs) setWalkthroughs(fetchedWalkthroughs);
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    useEffect(() => {
        if (refreshKey > 0) {
            fetchAllData();
        }
    }, [refreshKey, fetchAllData]);

    // Calculate bottlenecks for badge
    const bottleneckCount = React.useMemo(() => {
        let count = 0;
        equipments.forEach(eq => {
            if (eq.trackingStatus && !eq.trackingStatus.result) {
                if (eq.trackingStatus.quotationRequested && !eq.trackingStatus.prIssued) count++;
            }
        });
        return count;
    }, [equipments]);

    // Calculate broken primary equipments for executive badge
    const brokenCount = React.useMemo(() => {
        return equipments.filter(eq => {
            const isPrimary = eq.equipmentNo && !eq.equipmentNo.includes('/');
            return isPrimary && (eq.status === 'issue' || eq.breakdownStatus?.isBroken);
        }).length;
    }, [equipments]);

    // Calculate pending walkthrough announcements
    const pendingWalkthroughCount = React.useMemo(() => {
        return walkthroughs.filter(w => !w.isCompleted).length;
    }, [walkthroughs]);

    const renderContent = () => {
        switch (activeTab) {
            case 'equipment':
                return <EquipmentTab equipments={equipments} testers={testers} onEquipmentUpdated={triggerRefresh} />;
            case 'breakdown':
                return <BreakdownTab equipments={equipments} onEquipmentUpdated={triggerRefresh} />;
            case 'workflow':
                return <WorkflowTab equipments={equipments} onEquipmentUpdated={triggerRefresh} />;
            case 'plan':
                return <PlanTab equipments={equipments} onEquipmentUpdated={triggerRefresh} />;
            case 'walkthrough':
                return <WalkthroughTab testers={testers} onWalkthroughUpdated={triggerRefresh} />;
            case 'proficiency':
                return <ProficiencyTab testers={testers} />;
            case 'ai':
                return <AiAssistantTab equipments={equipments} onEquipmentUpdated={triggerRefresh} />;
            case 'import':
                return <ImportTab onTasksUpdated={triggerRefresh} />;
            case 'settings':
                return (
                    <SettingsTab 
                        testers={testers} 
                        onRefreshTesters={triggerRefresh} 
                        onTasksUpdated={triggerRefresh} 
                        appSettings={appSettings} 
                        onSettingsUpdated={triggerRefresh} 
                    />
                );
            default:
                return <EquipmentTab testers={testers} onEquipmentUpdated={triggerRefresh} />;
        }
    };

    const NavButton = ({ 
        tab, 
        label, 
        subtitle, 
        icon, 
        badge,
        badgeColor = 'bg-rose-500'
    }: { 
        tab: typeof activeTab; 
        label: string; 
        subtitle: string; 
        icon: React.ReactNode; 
        badge?: number;
        badgeColor?: string;
    }) => {
        const isActive = activeTab === tab;
        return (
            <button
                onClick={() => setActiveTab(tab)}
                className={`
                    group relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150 w-full text-left cursor-pointer
                    ${isActive
                        ? 'bg-primary-50/90 dark:bg-primary-950/60 text-primary-900 dark:text-primary-100 font-extrabold shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-base-800/70 hover:text-slate-900 dark:hover:text-white font-medium'
                    }
                `}
            >
                {/* Active indicator bar */}
                {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary-600 rounded-r-full" />
                )}
                <div className={`shrink-0 p-2 rounded-lg transition-colors ${
                    isActive 
                        ? 'bg-primary-600 text-white shadow-xs' 
                        : 'bg-slate-100 dark:bg-base-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200/80 dark:group-hover:bg-base-700 group-hover:text-primary-600'
                }`}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-bold leading-snug">{label}</span>
                        {badge !== undefined && badge > 0 && (
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black text-white shrink-0 ${badgeColor}`}>
                                {badge}
                            </span>
                        )}
                    </div>
                    <span className={`block truncate text-[10px] leading-tight mt-0.5 ${
                        isActive ? 'text-primary-700/80 dark:text-primary-300/80 font-semibold' : 'text-slate-400 dark:text-slate-500'
                    }`}>
                        {subtitle}
                    </span>
                </div>
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50/70 dark:bg-base-955 font-sans text-slate-900 dark:text-slate-100 flex flex-col">
            {/* Top header - Modern, Compact & Crisp */}
            <header className="sticky top-0 z-40 bg-white/90 dark:bg-base-900/90 backdrop-blur-xl border-b border-slate-200/90 dark:border-base-800 shadow-2xs">
                <div className="w-full px-4 lg:px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-primary-600 to-indigo-700 p-2 rounded-xl shadow-md shadow-primary-500/20 text-white shrink-0">
                            <BeakerIcon className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
                                    Laboratory Equipment PM & Calibration Management
                                </h1>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-primary-100 text-primary-800 dark:bg-primary-950 dark:text-primary-300 rounded-md">
                                    ระบบมาตรฐาน Lab
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold tracking-wide mt-0.5">
                                ทะเบียนเครื่องมือ 161 รายการ • แผน PM/Cal ประจำปี • ติดตามงาน 6 สเต็ป • แจ้งซ่อมบำรุง
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isLoading && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 rounded-full text-xs font-bold animate-pulse">
                                <RefreshIcon className="h-3 w-3 animate-spin" />
                                <span className="text-[11px] font-bold">กำลังซิงค์...</span>
                            </div>
                        )}
                        <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-base-800 px-3 py-1 rounded-xl border border-slate-200 dark:border-base-700 hidden sm:inline-block">
                            📊 {equipments.length} เครื่องหลักในระบบ
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Layout - Full-Height Seamless Docked Architecture */}
            <div className="flex-1 w-full flex flex-col lg:flex-row">
                {/* Modern Full-Height Left Sidebar */}
                <aside className="lg:w-72 shrink-0 bg-white dark:bg-base-900 border-r border-slate-200/90 dark:border-base-800 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] flex flex-col justify-between overflow-y-auto scrollbar-thin z-20">
                    <nav className="p-3.5 space-y-4">
                        {/* Group 1: ปฏิบัติการ & แผนงาน PM */}
                        <div className="space-y-1">
                            <span className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                                ปฏิบัติการ & แผนงาน (Operations)
                            </span>
                            <NavButton
                                tab="equipment"
                                label="ทะเบียนเครื่องมือ (Master)"
                                subtitle="รายชื่อ 70 เครื่องหลัก (161 รวมพ่วง)"
                                icon={<BeakerIcon className="h-4 w-4" />}
                            />
                            <NavButton
                                tab="breakdown"
                                label="แจ้งเครื่องเสีย & ซ่อม"
                                subtitle="บันทึกชำรุด 6 ขั้นตอนซ่อม"
                                icon={<AlertTriangleIcon className="h-4 w-4 text-rose-500" />}
                                badge={brokenCount}
                                badgeColor="bg-rose-500"
                            />
                            <NavButton
                                tab="workflow"
                                label="กระดานติดตาม 6 สเต็ป"
                                subtitle="สถานะ Quotation/PR/Cal คัมบัง"
                                icon={<RefreshIcon className="h-4 w-4 text-indigo-500" />}
                                badge={bottleneckCount}
                                badgeColor="bg-amber-500"
                            />
                            <NavButton
                                tab="plan"
                                label="ปฏิทินแผนงาน 12 เดือน"
                                subtitle="กำหนดการและเตรียมตัวล่วงหน้า"
                                icon={<CalendarIcon className="h-4 w-4 text-emerald-500" />}
                            />
                        </div>

                        {/* Group 2: บุคลากร & คุณภาพ Lab */}
                        <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-base-800/80">
                            <span className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                                คุณภาพ & บุคลากร (Quality & Team)
                            </span>
                            <NavButton
                                tab="walkthrough"
                                label="Walkthrough กิจกรรมใหม่"
                                subtitle="ประกาศแจ้งทีมงานเพื่อทราบ & รับทราบ"
                                icon={<DocumentTextIcon className="h-4 w-4 text-violet-600" />}
                                badge={pendingWalkthroughCount}
                                badgeColor="bg-violet-600"
                            />
                            <NavButton
                                tab="proficiency"
                                label="การเรียน & ประเมินพนักงาน"
                                subtitle="หลักสูตรฝึกอบรม & ประเมินผล Lab"
                                icon={<UserGroupIcon className="h-4 w-4 text-teal-600" />}
                            />
                        </div>

                        {/* Group 3: เครื่องมือ & ข้อมูลระบบ */}
                        <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-base-800/80">
                            <span className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                                ระบบ & ข้อมูล (System & Tools)
                            </span>
                            <NavButton
                                tab="ai"
                                label="ผู้ช่วย AI อัจฉริยะ"
                                subtitle="วิเคราะห์ข้อมูล & แนะนำงาน"
                                icon={<SparklesIcon className="h-4 w-4 text-amber-500" />}
                            />
                            <NavButton
                                tab="import"
                                label="นำเข้า / ส่งออก Excel"
                                subtitle="Master TSV & สำรองข้อมูล"
                                icon={<UploadIcon className="h-4 w-4 text-slate-500" />}
                            />
                            <NavButton
                                tab="settings"
                                label="ตั้งค่าระบบ & ผู้ดูแล"
                                subtitle="กำหนดสิทธิ์ & รายชื่อ Lab"
                                icon={<CogIcon className="h-4 w-4 text-slate-500" />}
                            />
                        </div>
                    </nav>

                    {/* Integrated Sidebar Footer - Professional System Status */}
                    <div className="p-3.5 border-t border-slate-100 dark:border-base-800 bg-slate-50/50 dark:bg-base-950/40 m-2 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                ระบบเชื่อมต่อพร้อมใช้งาน
                            </span>
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                                161 EQ
                            </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium leading-relaxed">
                            ระบบบริหารงานสอบเทียบและบำรุงรักษาตามมาตรฐาน ISO/IEC 17025
                        </div>
                    </div>
                </aside>

                {/* Content view with generous padding */}
                <main className="flex-1 min-w-0 p-3 sm:px-4 lg:px-6 py-4">
                    {isLoading && equipments.length === 0 ? <LoadingSpinner /> : renderContent()}
                </main>
            </div>
        </div>
    );
};

export default App;