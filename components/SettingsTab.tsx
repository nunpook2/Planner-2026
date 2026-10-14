import React, { useState, useEffect } from 'react';
import type { Tester, AppSettings } from '../types';
import { 
    addTester, deleteTester, updateTester, runCleanup, clearAllTaskData, saveAppSettings 
} from '../services/dataService';
import { TrashIcon, PencilIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, CogIcon } from './common/Icons';

const ConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    confirmColor?: string;
    isProcessing?: boolean;
}> = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmColor = "bg-primary-600", isProcessing }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-md m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-base-900 dark:text-base-100">{title}</h3>
                <div className="text-base-600 dark:text-base-300">{message}</div>
                <div className="flex justify-end gap-3 pt-4">
                    <button 
                        onClick={onClose} 
                        disabled={isProcessing}
                        className="px-5 py-2 text-sm font-semibold text-base-600 hover:bg-base-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm} 
                        disabled={isProcessing}
                        className={`px-5 py-2 text-sm font-bold text-white rounded-lg shadow-md hover:shadow-lg hover:opacity-95 transition-all disabled:opacity-50 ${confirmColor}`}
                    >
                        {isProcessing ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
    return (
        <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl text-white font-medium flex items-center gap-3 animate-slide-in-up z-[70] ${isError ? 'bg-red-500' : 'bg-emerald-500'}`}>
            {isError ? <AlertTriangleIcon className="h-5 w-5"/> : <CheckCircleIcon className="h-5 w-5"/>}
            {message}
        </div>
    );
};

const TesterManager: React.FC<{ testers: Tester[]; onRefreshTesters: () => void; setNotification: (n: any) => void }> = ({ testers, onRefreshTesters, setNotification }) => {
    const [newTesterName, setNewTesterName] = useState('');
    const [selectedTeam, setSelectedTeam] = useState<'testers_3_3' | 'assistants_4_2'>('testers_3_3');
    const [requiresProficiencyCheck, setRequiresProficiencyCheck] = useState(false);
    const [editingTesterId, setEditingTesterId] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');
    const [tempRequiresProficiency, setTempRequiresProficiency] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const handleAdd = async () => {
        if (!newTesterName.trim()) return;
        try {
            const t = await addTester(newTesterName);
            await updateTester(t.id, { team: selectedTeam, requiresProficiencyCheck: selectedTeam === 'assistants_4_2' ? requiresProficiencyCheck : false });
            setNewTesterName('');
            setRequiresProficiencyCheck(false);
            onRefreshTesters();
            setNotification({ message: "Personnel added successfully." });
        } catch (e) { setNotification({ message: "Failed to add personnel.", isError: true }); }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteTester(deleteId);
            onRefreshTesters();
            setNotification({ message: "Personnel removed." });
        } catch (e) { setNotification({ message: "Failed to remove personnel.", isError: true }); }
        setDeleteId(null);
    };

    const startEdit = (t: Tester) => { setEditingTesterId(t.id); setTempName(t.name); setTempRequiresProficiency(t.requiresProficiencyCheck || false); };
    const saveEdit = async (id: string) => { await updateTester(id, { name: tempName, requiresProficiencyCheck: tempRequiresProficiency }); setEditingTesterId(null); onRefreshTesters(); };

    const teamList = (team: 'testers_3_3' | 'assistants_4_2') => testers.filter(t => t.team === team);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ConfirmationModal 
                isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete}
                title="Remove Personnel" message="Are you sure you want to remove this person? This cannot be undone."
                confirmText="Remove" confirmColor="bg-red-600"
            />
            <div className="bg-white dark:bg-base-800 p-6 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 h-fit">
                <h3 className="font-bold text-lg text-base-900 dark:text-base-100 mb-4">Add Personnel</h3>
                <div className="space-y-4">
                    <div>
                         <label className="text-xs font-bold text-base-400 uppercase">Full Name</label>
                         <input type="text" value={newTesterName} onChange={e => setNewTesterName(e.target.value)} className="w-full p-3 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all dark:text-white" placeholder="e.g. John Doe"/>
                    </div>
                    <div>
                         <label className="text-xs font-bold text-base-400 uppercase">Team</label>
                         <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value as any)} className="w-full p-3 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all dark:text-white">
                            <option value="testers_3_3">Testers (3 days / 3 nights)</option>
                            <option value="assistants_4_2">Assistants (4 days / 2 off)</option>
                        </select>
                    </div>
                    {selectedTeam === 'assistants_4_2' && (
                        <div className="flex items-center gap-2 mt-2">
                            <input type="checkbox" id="requiresProficiency" checked={requiresProficiencyCheck} onChange={e => setRequiresProficiencyCheck(e.target.checked)} className="w-4 h-4 text-primary-600 rounded border-base-300 focus:ring-primary-500" />
                            <label htmlFor="requiresProficiency" className="text-sm font-medium text-base-700 dark:text-base-300">New Employee (Requires Proficiency Evaluation)</label>
                        </div>
                    )}
                    <button onClick={handleAdd} disabled={!newTesterName.trim()} className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">Add Person</button>
                </div>
            </div>
            <div className="space-y-6">
                {[ { title: "Testers", data: teamList('testers_3_3') }, { title: "Assistants", data: teamList('assistants_4_2') } ].map(group => (
                    <div key={group.title} className="bg-white dark:bg-base-800 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 overflow-hidden">
                        <div className="bg-base-50 dark:bg-base-700/50 px-5 py-3 border-b border-base-200 dark:border-base-700"><h4 className="font-bold text-base-700 dark:text-base-200">{group.title}</h4></div>
                        <ul className="divide-y divide-base-100 dark:divide-base-700">
                            {group.data.map(t => (
                                <li key={t.id} className="p-3 flex justify-between items-center hover:bg-base-50 dark:hover:bg-base-700/50 transition-colors">
                                    {editingTesterId === t.id ? (
                                        <div className="flex items-center gap-2 flex-grow mr-2">
                                            <input type="text" value={tempName} onChange={e=>setTempName(e.target.value)} className="flex-grow p-2 text-sm border rounded-lg dark:bg-base-900 dark:border-base-600 dark:text-white"/>
                                            {t.team === 'assistants_4_2' && (
                                                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                                                    <input type="checkbox" checked={tempRequiresProficiency} onChange={e => setTempRequiresProficiency(e.target.checked)} />
                                                    Eval
                                                </label>
                                            )}
                                            <button onClick={()=>saveEdit(t.id)} className="text-emerald-500 hover:bg-emerald-50 p-1 rounded"><CheckCircleIcon/></button>
                                            <button onClick={()=>setEditingTesterId(null)} className="text-red-500 hover:bg-red-50 p-1 rounded"><XCircleIcon/></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-base-100 dark:bg-base-700 flex items-center justify-center text-xs font-bold text-base-500 dark:text-base-400">{t.name.substring(0,2).toUpperCase()}</div>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-base-700 dark:text-base-200">{t.name}</span>
                                                {t.team === 'assistants_4_2' && t.requiresProficiencyCheck && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">Requires Evaluation</span>}
                                            </div>
                                        </div>
                                    )}
                                    {!editingTesterId && (
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => startEdit(t)} className="p-2 text-base-400 hover:text-primary-600"><PencilIcon/></button>
                                            <button onClick={() => setDeleteId(t.id)} className="p-2 text-base-400 hover:text-red-600"><TrashIcon/></button>
                                        </div>
                                    )}
                                </li>
                            ))}
                            {group.data.length === 0 && <li className="p-4 text-center text-sm text-base-400 italic">No personnel added.</li>}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

const UISettingsPanel: React.FC<{ appSettings?: AppSettings | null; onSettingsUpdated?: () => void; setNotification: (n: any) => void }> = ({ appSettings, onSettingsUpdated, setNotification }) => {
    const defaultLabels: Record<string, string> = {
        quality: 'Quality Center',
        import: 'Import Data',
        equipment: 'Equipment',
        proficiency: 'Proficiency',
        roster: 'Roster & Shifts',
        schedule: 'Shift Tracking',
        dashboard: 'Shift Summary',
        settings: 'Settings'
    };

    const [labels, setLabels] = useState<Record<string, string>>({
        ...defaultLabels,
        ...(appSettings?.tabLabels || {})
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveAppSettings({ tabLabels: labels });
            setNotification({ message: 'Sidebar menu labels updated successfully.' });
            if (onSettingsUpdated) onSettingsUpdated();
        } catch (e: any) {
            setNotification({ message: e.message || 'Failed to save settings.', isError: true });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-xl overflow-hidden p-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <CogIcon className="h-6 w-6 text-primary-500" />
                <div>
                    <h3 className="text-xl font-black text-base-900 dark:text-base-100 uppercase tracking-tight">Sidebar Navigation Names</h3>
                    <p className="text-sm font-bold text-base-500 mt-1">Customize the display names for the left navigation tabs.</p>
                </div>
            </div>

            <div className="space-y-4">
                {Object.entries(defaultLabels).map(([key, defaultLabel]) => (
                    <div key={key} className="flex items-center gap-4">
                        <label className="w-48 text-[12px] font-black uppercase tracking-widest text-base-500 text-right shrink-0">{defaultLabel}</label>
                        <input
                            type="text"
                            value={labels[key] || ''}
                            onChange={e => setLabels(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={defaultLabel}
                            className="w-full bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-xl px-4 py-2 font-bold text-sm focus:border-primary-500 focus:bg-white dark:focus:bg-base-900 outline-none transition-all"
                        />
                    </div>
                ))}
            </div>

            <div className="mt-8 pt-6 border-t border-t-base-100 dark:border-t-base-800 flex justify-end">
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
};

export const SettingsTab: React.FC<{ testers: Tester[]; onRefreshTesters: () => void; onTasksUpdated: () => void; appSettings?: AppSettings | null; onSettingsUpdated?: () => void; }> = (props) => {
    const [activeSubTab, setActiveSubTab] = useState<'team' | 'ui' | 'danger'>(() => {
        try {
            const saved = localStorage.getItem('settings_active_subtab');
            if (saved && ['team', 'ui', 'danger'].includes(saved)) {
                return saved as any;
            }
        } catch (e) {}
        return 'ui';
    });
    const [notification, setNotification] = useState<{ message: string; isError?: boolean } | null>(null);
    const [showCleanupModal, setShowCleanupModal] = useState(false);
    const [showWipeModal, setShowWipeModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const tabs = [
        { id: 'team', label: 'Team Management' },
        { id: 'ui', label: 'UI Settings' },
        { id: 'danger', label: 'Danger Zone', danger: true }
    ];

    const handleCleanupConfirm = async () => { setIsProcessing(true); try { const res = await runCleanup(); setNotification({ message: `Deleted ${res.deleted} empty tasks.` }); props.onTasksUpdated(); } catch (e: any) { setNotification({ message: e.message, isError: true }); } finally { setIsProcessing(false); setShowCleanupModal(false); } };
    const handleWipeConfirm = async () => { setIsProcessing(true); try { await clearAllTaskData(); setNotification({ message: "All data wiped successfully." }); props.onTasksUpdated(); } catch (e: any) { setNotification({ message: e.message, isError: true }); } finally { setIsProcessing(false); setShowWipeModal(false); } };

    return (
        <div className="space-y-8 animate-slide-in-up w-full">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            <ConfirmationModal isOpen={showCleanupModal} onClose={() => setShowCleanupModal(false)} onConfirm={handleCleanupConfirm} title="Cleanup Empty Tasks" message="This will remove request containers that have no items. This is safe to run properly." confirmText="Run Cleanup" isProcessing={isProcessing}/>
            <ConfirmationModal isOpen={showWipeModal} onClose={() => setShowWipeModal(false)} onConfirm={handleWipeConfirm} title="Wipe All Data" message={<span className="text-red-600 font-bold">WARNING: This will permanently delete ALL tasks, assignments, and history. This cannot be undone.</span>} confirmText="Wipe Everything" confirmColor="bg-red-600" isProcessing={isProcessing}/>

            <div><h2 className="text-2xl font-bold text-base-900 dark:text-base-100">Settings</h2><p className="text-base-500">Configure your workspace</p></div>
            <div className="flex p-1 bg-base-100 dark:bg-base-800 rounded-xl w-fit border border-base-200 dark:border-base-700 overflow-x-auto max-w-full">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => {
                        setActiveSubTab(tab.id as any);
                        try {
                            localStorage.setItem('settings_active_subtab', tab.id);
                        } catch (e) {}
                    }} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap ${activeSubTab === tab.id ? 'bg-white dark:bg-base-700 text-base-900 dark:text-white shadow-sm ring-1 ring-black/5' : `text-base-500 hover:text-base-700 dark:hover:text-base-300 ${tab.danger ? 'hover:text-red-600' : ''}`}`}>{tab.label}</button>
                ))}
            </div>

            <div className="min-h-[400px]">
                {activeSubTab === 'team' && <TesterManager testers={props.testers} onRefreshTesters={props.onRefreshTesters} setNotification={setNotification} />}
                {activeSubTab === 'ui' && <UISettingsPanel appSettings={props.appSettings} onSettingsUpdated={props.onSettingsUpdated} setNotification={setNotification} />}
                {activeSubTab === 'danger' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-8">
                        <div className="bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-full flex items-center justify-center mb-4"><CheckCircleIcon className="h-6 w-6"/></div>
                            <h3 className="font-bold text-lg text-base-900 dark:text-base-100 mb-2">Cleanup Empty Tasks</h3>
                            <p className="text-sm text-base-500 mb-6 flex-grow">Removes empty request shells. Safe to run.</p>
                            <button onClick={() => setShowCleanupModal(true)} className="px-6 py-2.5 bg-white dark:bg-base-700 text-base-700 dark:text-base-200 border border-base-300 dark:border-base-600 rounded-xl font-bold hover:bg-base-50 dark:hover:bg-base-600 transition-all w-full">Run Cleanup</button>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-4"><TrashIcon className="h-6 w-6"/></div>
                            <h3 className="font-bold text-lg text-red-900 dark:text-red-400 mb-2">Wipe All Data</h3>
                            <p className="text-sm text-red-700 dark:text-red-300 mb-6 flex-grow"><strong>Warning:</strong> Permanently deletes all data.</p>
                            <button onClick={() => setShowWipeModal(true)} className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg transition-all w-full">Wipe Everything</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsTab;
