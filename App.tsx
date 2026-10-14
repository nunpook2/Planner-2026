import React, { useState, useEffect, useCallback } from 'react';
import EquipmentTab from './components/EquipmentTab';
import BreakdownTab from './components/BreakdownTab';
import WorkflowTab from './components/WorkflowTab';
import PlanTab from './components/PlanTab';
import AiAssistantTab from './components/AiAssistantTab';
import ImportTab from './components/ImportTab';
import SettingsTab from './components/SettingsTab';
import { getEquipments, getTesters, getAppSettings } from './services/dataService';
import type { Equipment, Tester, AppSettings } from './types';
import { 
    CogIcon, BeakerIcon, RefreshIcon, AlertTriangleIcon, 
    CalendarIcon, UploadIcon, SparklesIcon
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
    const [activeTab, setActiveTab] = useState<'equipment' | 'breakdown' | 'workflow' | 'plan' | 'ai' | 'import' | 'settings'>('equipment');
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [testers, setTesters] = useState<Tester[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const triggerRefresh = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fetchedEquips, fetchedTesters, fetchedSettings] = await Promise.all([
                getEquipments(),
                getTesters().catch(() => []),
                getAppSettings().catch(() => null)
            ]);
            setEquipments(fetchedEquips);
            setTesters(fetchedTesters);
            if (fetchedSettings) setAppSettings(fetchedSettings);
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

    const renderContent = () => {
        switch (activeTab) {
            case 'equipment':
                return <EquipmentTab testers={testers} onEquipmentUpdated={triggerRefresh} />;
            case 'breakdown':
                return <BreakdownTab equipments={equipments} onEquipmentUpdated={triggerRefresh} />;
            case 'workflow':
                return <WorkflowTab equipments={equipments} onEquipmentUpdated={triggerRefresh} />;
            case 'plan':
                return <PlanTab equipments={equipments} onEquipmentUpdated={triggerRefresh} />;
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

    const NavButton = ({ tab, label, icon, badge }: { tab: typeof activeTab; label: string; icon: React.ReactNode; badge?: number }) => {
        const isActive = activeTab === tab;
        return (
            <button
                onClick={() => setActiveTab(tab)}
                className={`
                    relative flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 w-full text-left font-bold text-xs
                    ${isActive
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25 ring-2 ring-primary-500/20'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-base-800 hover:text-primary-600'
                    }
                `}
            >
                <div className="shrink-0">{icon}</div>
                <span className="flex-1 truncate">{label}</span>
                {badge !== undefined && badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-sm">
                        {badge}
                    </span>
                )}
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50/60 dark:bg-base-955 font-sans text-slate-800 dark:text-slate-200 flex flex-col">
            {/* Top header */}
            <header className="sticky top-0 z-40 bg-white/70 dark:bg-base-900/70 backdrop-blur-xl border-b border-slate-200/80 dark:border-base-800">
                <div className="w-full px-4 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        <div className="bg-gradient-to-br from-primary-600 to-indigo-700 p-2.5 rounded-2xl shadow-lg shadow-primary-500/20 text-white">
                            <BeakerIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none">
                                    Equipment PM & Calibration Management System
                                </h1>
                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 rounded-md">
                                    AI-Powered
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                ระบบบริหารจัดการและติดตามแผน PM & Calibration เครื่องมือห้องปฏิบัติการ
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isLoading && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary-50 dark:bg-primary-950/40 text-primary-600 rounded-full text-xs font-bold animate-pulse">
                                <RefreshIcon className="h-3.5 w-3.5 animate-spin" />
                                <span className="text-[10px] uppercase tracking-wider">Syncing Data</span>
                            </div>
                        )}
                        <span className="text-xs font-bold text-slate-500 hidden sm:inline-block">
                            📊 {equipments.length} เครื่องหลักในระบบ
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Layout - Full Width Edge to Edge */}
            <div className="flex-1 w-full px-3 sm:px-4 lg:px-6 py-4">
                <div className="flex flex-col lg:flex-row gap-5">
                    {/* Sidebar navigation */}
                    <aside className="lg:w-64 shrink-0">
                        <nav className="bg-white/80 dark:bg-base-900/80 backdrop-blur-md rounded-3xl p-3 border border-slate-200/80 dark:border-base-800 shadow-sm space-y-1.5 sticky top-20">
                            <NavButton
                                tab="equipment"
                                label="รายชื่อเครื่องมือ & แผน"
                                icon={<BeakerIcon className="h-4 w-4" />}
                            />
                            <NavButton
                                tab="breakdown"
                                label="เครื่องมือ"
                                icon={<AlertTriangleIcon className="h-4 w-4 text-rose-500" />}
                                badge={brokenCount}
                            />
                            <NavButton
                                tab="workflow"
                                label="กระดานติดตาม 6 ขั้นตอน"
                                icon={<RefreshIcon className="h-4 w-4" />}
                                badge={bottleneckCount}
                            />
                            <NavButton
                                tab="plan"
                                label="แผนประจำปี (รายเดือน)"
                                icon={<CalendarIcon className="h-4 w-4" />}
                            />
                            <NavButton
                                tab="ai"
                                label="ผู้ช่วย AI อัจฉริยะ"
                                icon={<SparklesIcon className="h-4 w-4 text-amber-400" />}
                            />
                            <div className="h-px bg-slate-100 dark:bg-base-800 my-2" />
                            <NavButton
                                tab="import"
                                label="นำเข้า / ส่งออก Excel"
                                icon={<UploadIcon className="h-4 w-4" />}
                            />
                            <NavButton
                                tab="settings"
                                label="ตั้งค่าระบบ & ผู้ดูแล"
                                icon={<CogIcon className="h-4 w-4" />}
                            />
                        </nav>
                    </aside>

                    {/* Content view */}
                    <main className="flex-1 min-w-0">
                        {isLoading && equipments.length === 0 ? <LoadingSpinner /> : renderContent()}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default App;