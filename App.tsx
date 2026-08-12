
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ImportTab from './components/ImportTab';
import TasksTab from './components/TasksTab';
import RosterTab from './components/RosterTab';
import ScheduleTab from './components/ScheduleTab';
import DashboardTab from './components/DashboardTab';
import SettingsTab from './components/SettingsTab';
import EquipmentTab from './components/EquipmentTab';
import QualityDashboard from './components/QualityDashboard';
import BookingTab from './components/BookingTab'; // Import the new Booking Tab
import ProficiencyTab from './components/ProficiencyTab';
import RequestsTab from './components/RequestsTab';
import WalkthroughTab from './components/WalkthroughTab';
import { BorrowTab } from './components/BorrowTab';
import { getTesters, getAssignedTasks, getAppSettings, getSupportRequests, getWalkthroughs, getEquipments, getProficiencyRecords, getBorrowRecords } from './services/dataService';
import type { Tester, AssignedTask, AppSettings } from './types';
import { TaskStatus } from './types';
// Import RefreshIcon from common icons to fix the 'Cannot find name' error
import { DatabaseIcon, UploadIcon, ClipboardListIcon, CalendarIcon, CogIcon, BeakerIcon, AlertTriangleIcon, RefreshIcon, UserCircleIcon, DocumentTextIcon, ChatBubbleLeftIcon, BoxIcon } from './components/common/Icons'; // Added UserCircleIcon for Booking

const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in">
        <div className="relative">
            <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-white dark:bg-base-900 rounded-full"></div>
            </div>
        </div>
        <span className="mt-4 text-lg font-black text-base-400 tracking-[0.2em] uppercase">Initializing...</span>
    </div>
);

const ErrorModal = ({ children, onRetry }: { children?: React.ReactNode; onRetry: () => void; }) => (
    <div className="fixed inset-0 bg-base-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" aria-modal="true" role="dialog">
        <div className="bg-white dark:bg-base-800 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-lg m-4 space-y-6 transform transition-all animate-slide-in-up border border-base-200 dark:border-base-700">
            <div className="flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shadow-inner">
                    <AlertTriangleIcon className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="text-2xl font-black text-base-900 dark:text-base-100 uppercase tracking-tighter">Connection Lost</h2>
            </div>
            <div className="text-base-600 dark:text-base-300 text-center leading-relaxed px-4 font-medium">
                {children}
            </div>
            <div className="pt-2 flex justify-center">
                <button 
                    onClick={onRetry} 
                    className="px-10 py-4 bg-primary-600 text-white font-black rounded-2xl hover:bg-primary-700 shadow-xl shadow-primary-500/20 transition-all uppercase tracking-widest text-xs active:scale-95"
                >
                    Restore Session
                </button>
            </div>
        </div>
    </div>
);

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState('import');
    const [testers, setTesters] = useState<Tester[]>([]);
    const [notOkCount, setNotOkCount] = useState(0);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [pendingWalkthroughsCount, setPendingWalkthroughsCount] = useState(0);
    const [issueEquipmentCount, setIssueEquipmentCount] = useState(0);
    const [overdueBorrowCount, setOverdueBorrowCount] = useState(0);
    const [pendingProficiencyCount, setPendingProficiencyCount] = useState(0);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true); // Flag to control full-page loading
    const [error, setError] = useState<React.ReactNode | null>(null);
    const [taskRefreshKey, setTaskRefreshKey] = useState(0);
    
    const [globalSelectedDate, setGlobalSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [globalSelectedShift, setGlobalSelectedShift] = useState<'day' | 'night'>('day');
    const [isIsolatedView, setIsIsolatedView] = useState(false);

    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const isTabBorrow = params.get('tab') === 'borrow';
            setIsIsolatedView(activeTab === 'borrow' && isTabBorrow);
        } catch (e) {
            console.error("Failed to parse URL query params", e);
        }
    }, [activeTab]);

    const triggerTaskRefresh = useCallback(() => {
        setTaskRefreshKey(prevKey => prevKey + 1);
    }, []);

    const fetchCoreData = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setIsInitialLoad(true);
        setIsLoading(true);
        setError(null);
        try {
            const [
                fetchedTesters, 
                allAssigned, 
                settings,
                fetchedRequests,
                fetchedWalkthroughs,
                fetchedEquipments,
                fetchedProficiencyRecords,
                fetchedBorrowRecords
            ] = await Promise.all([
                getTesters(),
                getAssignedTasks(),
                getAppSettings(),
                getSupportRequests().catch(() => []),
                getWalkthroughs().catch(() => []),
                getEquipments().catch(() => []),
                getProficiencyRecords().catch(() => []),
                getBorrowRecords().catch(() => [])
            ]);
            setTesters(fetchedTesters);
            if (settings) {
                setAppSettings(settings);
            }
            
            let count = 0;
            allAssigned.forEach(doc => {
                count += (doc.tasks || []).filter(t => t.status === TaskStatus.NotOK).length;
            });
            setNotOkCount(count);

            // Calculate pending support requests (status is other than 'done')
            const pendingRequests = fetchedRequests.filter(r => r.status !== 'done').length;
            setPendingRequestsCount(pendingRequests);

            // Calculate pending walkthroughs (not completed)
            const pendingWalkthroughs = fetchedWalkthroughs.filter(w => !w.isCompleted).length;
            setPendingWalkthroughsCount(pendingWalkthroughs);

            // Calculate equipment issues or maintenance
            const issueEquipments = fetchedEquipments.filter(e => e.status === 'issue' || e.status === 'maintenance').length;
            setIssueEquipmentCount(issueEquipments);

            // Calculate pending proficiency records (status is 'pending')
            const pendingProficiency = fetchedProficiencyRecords.filter(r => r.status === 'pending').length;
            setPendingProficiencyCount(pendingProficiency);

            // Calculate overdue borrow records
            const todayStr = new Date().toISOString().split('T')[0];
            const overdueBorrows = fetchedBorrowRecords.filter(r => !r.actualReturnDate && r.expectedReturnDate < todayStr).length;
            setOverdueBorrowCount(overdueBorrows);

        } catch (error: any) {
            console.error("Error fetching data: ", error);
            setError("An unexpected error occurred. Please check your network connection.");
        } finally {
            setIsLoading(false);
            setIsInitialLoad(false);
        }
    }, []);

    useEffect(() => {
        // Initial load
        fetchCoreData();
        
        // Detect tab query parameter to auto-switch tab (e.g., from QR code scans)
        try {
            const params = new URLSearchParams(window.location.search);
            const tabParam = params.get('tab');
            if (tabParam) {
                setActiveTab(tabParam);
            }
        } catch (e) {
            console.error("Failed to parse URL query params", e);
        }
    }, [fetchCoreData]);

    // Handle background refreshes without unmounting the whole tab area
    useEffect(() => {
        if (taskRefreshKey > 0) {
            fetchCoreData(true);
        }
    }, [taskRefreshKey, fetchCoreData]);

    const renderTabContent = () => {
        if (error) return null;

        switch (activeTab) {
            case 'quality': return <QualityDashboard onResolve={triggerTaskRefresh} testers={testers} />;
            case 'import': return <ImportTab onTasksUpdated={triggerTaskRefresh} />;
            case 'tasks': return (
                <TasksTab 
                    testers={testers} 
                    onTasksUpdated={triggerTaskRefresh}
                    refreshKey={taskRefreshKey} 
                    selectedDate={globalSelectedDate}
                    onDateChange={setGlobalSelectedDate}
                    selectedShift={globalSelectedShift}
                    onShiftChange={setGlobalSelectedShift}
                />
            );
            case 'booking': return <BookingTab testers={testers} />; // New Booking Tab
            case 'requests': return <RequestsTab testers={testers} onRequestsUpdated={triggerTaskRefresh} />;
            case 'equipment': return <EquipmentTab testers={testers} onEquipmentUpdated={triggerTaskRefresh} />;
            case 'roster': return (
                <RosterTab 
                    testers={testers} 
                    onTestersUpdate={fetchCoreData} 
                    selectedDate={globalSelectedDate}
                    onDateChange={setGlobalSelectedDate}
                />
            );
            case 'schedule': return (
                <ScheduleTab 
                    testers={testers} 
                    onTasksUpdated={triggerTaskRefresh} 
                    selectedDate={globalSelectedDate}
                    onDateChange={setGlobalSelectedDate}
                    selectedShift={globalSelectedShift}
                    onShiftChange={setGlobalSelectedShift}
                />
            );
            case 'dashboard': return (
                <DashboardTab 
                    testers={testers} 
                    selectedDate={globalSelectedDate}
                    onDateChange={setGlobalSelectedDate}
                    selectedShift={globalSelectedShift}
                    onShiftChange={setGlobalSelectedShift}
                    appSettings={appSettings}
                />
            );
            case 'proficiency': return <ProficiencyTab testers={testers} />;
            case 'borrow': return (
                <BorrowTab 
                    testers={testers} 
                    onBorrowUpdated={triggerTaskRefresh} 
                    isIsolatedView={isIsolatedView}
                    onExitIsolated={() => {
                        setIsIsolatedView(false);
                        try {
                            const url = new URL(window.location.href);
                            url.searchParams.delete('tab');
                            window.history.replaceState({}, '', url.toString());
                        } catch (e) {
                            console.error("Failed to clear tab params on exit", e);
                        }
                        setActiveTab('dashboard');
                    }}
                />
            );
            case 'walkthrough': return <WalkthroughTab testers={testers} onWalkthroughsUpdated={triggerTaskRefresh} />;
            case 'settings': return <SettingsTab testers={testers} onRefreshTesters={() => fetchCoreData(true)} onTasksUpdated={triggerTaskRefresh} appSettings={appSettings} onSettingsUpdated={() => fetchCoreData(true)} />;
            default: return <ImportTab onTasksUpdated={triggerTaskRefresh} />;
        }
    };
    
    const TabButton = ({ tabName, label, icon, badge }: { tabName: string; label: string; icon: React.ReactNode; badge?: number }) => {
        const isActive = activeTab === tabName;
        const displayLabel = appSettings?.tabLabels?.[tabName] || label;
        
        return (
            <button
                onClick={() => setActiveTab(tabName)}
                className={`
                    relative group flex flex-col lg:flex-row items-center lg:justify-start gap-4 px-5 py-3.5 rounded-2xl transition-all duration-300 w-full overflow-hidden
                    ${isActive
                        ? 'bg-gradient-to-r from-primary-500/15 via-primary-500/5 to-transparent text-primary-800 dark:text-primary-300 shadow-sm border border-primary-500/20'
                        : 'text-base-600 dark:text-base-300 hover:text-primary-600 dark:hover:text-primary-300 hover:bg-white dark:hover:bg-base-800 hover:shadow-sm border border-transparent hover:border-base-200 dark:hover:border-base-700'
                    }
                `}>
                {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-gradient-to-b from-primary-500 to-primary-700 rounded-r-lg shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                )}
                
                <div className={`
                    p-2.5 flex items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0 relative
                    ${isActive 
                        ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-500/40 scale-110 ring-2 ring-primary-500/20' 
                        : 'bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 text-base-500 dark:text-base-400 group-hover:scale-110 group-hover:bg-primary-50 dark:group-hover:bg-primary-500/20 group-hover:text-primary-600 dark:group-hover:text-primary-400 shadow-sm'
                    }
                `}>
                    {icon}
                    {badge !== undefined && badge > 0 && (
                        <div className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 bg-red-500 text-white text-[11px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-base-900 shadow-md animate-pulse-subtle">
                            {badge > 99 ? '99+' : badge}
                        </div>
                    )}
                </div>
                <span className={`font-bold hidden lg:block transition-all duration-300 ${isActive ? 'translate-x-1 text-[15px] text-primary-800 dark:text-primary-300' : 'text-[15px] text-base-600 dark:text-base-400 group-hover:text-primary-600 dark:group-hover:text-primary-400'}`}>{displayLabel}</span>
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-base-50/50 dark:bg-base-955 font-sans text-base-800 dark:text-base-200 flex flex-col">
            {error ? <ErrorModal onRetry={() => fetchCoreData()}>{error}</ErrorModal> : null}
            
            {!isIsolatedView && (
                <header className="sticky top-0 z-40 bg-white/40 dark:bg-base-900/40 backdrop-blur-xl border-b border-white dark:border-base-800">
                    <div className="w-[98%] mx-auto px-6 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-2 rounded-xl shadow-xl shadow-primary-500/30">
                                <BeakerIcon className="h-5 w-5 text-white"/>
                            </div>
                            <div>
                                <h1 className="text-xl font-black tracking-tighter text-base-900 dark:text-white leading-none">
                                    Planner V2
                                </h1>
                                <p className="text-[9px] text-base-400 font-black uppercase tracking-[0.3em] mt-1">Lab Intelligence System</p>
                            </div>
                        </div>
                        {isLoading && !isInitialLoad && (
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-full animate-fade-in">
                                <RefreshIcon className="h-3.5 w-3.5 animate-spin" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Syncing...</span>
                            </div>
                        )}
                    </div>
                </header>
            )}
            
            <div className={`flex-1 ${isIsolatedView ? 'w-full max-w-5xl mx-auto py-2 md:py-6 px-3' : 'w-[98%] mx-auto px-2 py-4'}`}>
                <div className="flex flex-col lg:flex-row gap-6 h-full">
                    {!isIsolatedView && (
                        <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-20 self-start bg-white/30 dark:bg-base-900/30 backdrop-blur-md rounded-[2.5rem] p-4 border border-white dark:border-base-800 shadow-sm">
                            <nav className="space-y-1">
                                <TabButton tabName="quality" label="Quality Center" icon={<AlertTriangleIcon className="h-5 w-5"/>} badge={notOkCount} />
                                <div className="h-px bg-gradient-to-r from-transparent via-base-200 dark:via-base-800 to-transparent my-3 mx-4"></div>
                                <TabButton tabName="import" label="Import Data" icon={<UploadIcon className="h-5 w-5"/>} />
                                <TabButton tabName="tasks" label="Assign Tasks" icon={<ClipboardListIcon className="h-5 w-5"/>} />
                                <TabButton tabName="booking" label="Special Booking" icon={<UserCircleIcon className="h-5 w-5"/>} />
                                <div className="h-px bg-gradient-to-r from-transparent via-base-200 dark:via-base-800 to-transparent my-3 mx-4"></div>
                                <TabButton tabName="requests" label="Support Requests" icon={<ChatBubbleLeftIcon className="h-5 w-5"/>} badge={pendingRequestsCount} />
                                <TabButton tabName="schedule" label="Shift Tracking" icon={<CalendarIcon className="h-5 w-5"/>} />
                                <TabButton tabName="dashboard" label="Shift Summary" icon={<BeakerIcon className="h-5 w-5"/>} />
                                <TabButton tabName="equipment" label="Equipment" icon={<CogIcon className="h-5 w-5"/>} badge={issueEquipmentCount} />
                                <TabButton tabName="borrow" label="ยืม-คืน อุปกรณ์" icon={<BoxIcon className="h-5 w-5"/>} badge={overdueBorrowCount} />
                                <div className="h-px bg-gradient-to-r from-transparent via-base-200 dark:via-base-800 to-transparent my-3 mx-4"></div>
                                <TabButton tabName="proficiency" label="Proficiency" icon={<DocumentTextIcon className="h-5 w-5"/>} badge={pendingProficiencyCount} />
                                <TabButton tabName="walkthrough" label="Method Walkthrough" icon={<DocumentTextIcon className="h-5 w-5"/>} badge={pendingWalkthroughsCount} />
                                <TabButton tabName="roster" label="Roster & Shifts" icon={<DatabaseIcon className="h-5 w-5"/>} />
                                <TabButton tabName="settings" label="Settings" icon={<CogIcon className="h-5 w-5"/>} />
                            </nav>
                        </aside>
                    )}

                    {!isIsolatedView && (
                        <div className="lg:hidden fixed bottom-6 left-6 right-6 bg-white/80 dark:bg-base-900/80 backdrop-blur-2xl border border-white dark:border-base-800 rounded-[2.5rem] p-3 z-50 flex justify-around shadow-2xl">
                            <TabButton tabName="quality" label="" icon={<AlertTriangleIcon className="h-5 w-5"/>} badge={notOkCount} />
                            <TabButton tabName="import" label="" icon={<UploadIcon className="h-5 w-5"/>} />
                            <TabButton tabName="tasks" label="" icon={<ClipboardListIcon className="h-5 w-5"/>} />
                            <TabButton tabName="schedule" label="" icon={<CalendarIcon className="h-5 w-5"/>} />
                            <TabButton tabName="booking" label="" icon={<UserCircleIcon className="h-5 w-5"/>} />
                            <TabButton tabName="walkthrough" label="" icon={<DocumentTextIcon className="h-5 w-5"/>} badge={pendingWalkthroughsCount} />
                        </div>
                    )}

                    <main className="flex-1 min-w-0">
                        <div className={`${isIsolatedView ? 'bg-white/80 dark:bg-base-900/80 rounded-[2rem]' : 'bg-white/60 dark:bg-base-900/60 rounded-[3rem] min-h-[calc(100vh-8rem)]'} border border-white dark:border-base-800 p-1 h-full shadow-2xl overflow-hidden relative`}>
                           {isInitialLoad ? <LoadingSpinner /> : renderTabContent()}
                       </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default App;