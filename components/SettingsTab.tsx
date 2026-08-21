
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Tester, TestMapping, AppSettings, HighValueAsset } from '../types';
import { 
    addTester, deleteTester, updateTester, runCleanup, clearAllTaskData, getTestMappings, addTestMapping, updateTestMapping, deleteTestMapping, saveAppSettings 
} from '../services/dataService';
import { TrashIcon, UploadIcon, PencilIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, PlusIcon, DragHandleIcon, CogIcon } from './common/Icons';

declare const XLSX: any;

// --- SHARED UI COMPONENTS ---

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
                        className={`px-5 py-2 text-sm font-bold text-white rounded-lg shadow-md hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 ${confirmColor}`}
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

// --- SUB-COMPONENTS ---

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

const GroupOrderManager: React.FC<{ onTasksUpdated: () => void; setNotification: (n: any) => void }> = ({ onTasksUpdated, setNotification }) => {
    const [mappings, setMappings] = useState<TestMapping[]>([]);
    const [groups, setGroups] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const draggedGroupIndex = useRef<number | null>(null);
    const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const f = await getTestMappings();
            setMappings(f);
            const u = Array.from(new Set(f.map(m => m.headerGroup).filter(Boolean)));
            const groupMinOrders: Record<string, number> = {};
            f.forEach(m => { if (m.headerGroup) { const c = groupMinOrders[m.headerGroup] ?? Infinity; const mOrder = m.order ?? Infinity; if (mOrder < c) groupMinOrders[m.headerGroup] = mOrder; } });
            setGroups(u.sort((a, b) => (groupMinOrders[a] ?? Infinity) - (groupMinOrders[b] ?? Infinity)));
        } catch (e) {}
    }, []);
    
    useEffect(() => { fetchData() }, [fetchData]);

    const handleDrop = (e: React.DragEvent, t: number) => {
        e.preventDefault(); setDragOverGroupIndex(null);
        const s = draggedGroupIndex.current; draggedGroupIndex.current = null;
        if (s === null || s === t) return;
        setGroups(p => { const r = [...p]; const [rm] = r.splice(s, 1); r.splice(t, 0, rm); return r; });
    };

    const handleSaveOrder = async () => {
        setIsSaving(true);
        try {
            const ups = [];
            const map = new Map<string, number>(groups.map((g, i) => [g, i]));
            for (const m of mappings) {
                 if (m.headerGroup && map.has(m.headerGroup)) {
                     const idx = map.get(m.headerGroup);
                     if (idx !== undefined && m.id) ups.push(updateTestMapping(m.id, { order: idx * 10000 }));
                 }
            }
            await Promise.all(ups);
            await fetchData();
            onTasksUpdated();
            setNotification({ message: "Column order updated!" });
        } catch (e) { setNotification({ message: "Failed to update order.", isError: true }); } finally { setIsSaving(false); }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-base-800 p-6 rounded-2xl shadow-sm border border-base-200 dark:border-base-700">
                <h3 className="font-bold text-lg text-base-900 dark:text-base-100 mb-2">Column Group Order</h3>
                <p className="text-sm text-base-500 mb-6">Drag and drop to reorder grid columns.</p>
                <div className="space-y-2">
                    {groups.map((group, index) => (
                        <div key={group} draggable onDragStart={e => { draggedGroupIndex.current = index; e.dataTransfer.effectAllowed = 'move'; }} onDragOver={e => { e.preventDefault(); if(index !== draggedGroupIndex.current) setDragOverGroupIndex(index); }} onDrop={e => handleDrop(e, index)} onDragLeave={()=>setDragOverGroupIndex(null)} className={`p-4 bg-base-50 dark:bg-base-900 rounded-xl border border-base-200 dark:border-base-700 cursor-move flex items-center justify-between hover:border-primary-300 dark:hover:border-primary-500 transition-all ${dragOverGroupIndex === index ? 'border-primary-500 ring-2 ring-primary-100 dark:ring-primary-900' : ''}`}>
                            <div className="flex items-center gap-4">
                                <span className="w-8 h-8 rounded-full bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 flex items-center justify-center font-mono text-xs text-base-400">{index + 1}</span>
                                <span className="font-bold text-base-700 dark:text-base-200">{group}</span>
                            </div>
                            <div className="text-base-400"><DragHandleIcon className="h-5 w-5"/></div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end pt-6 mt-6 border-t border-base-100 dark:border-base-700">
                    <button onClick={handleSaveOrder} disabled={isSaving} className="px-6 py-2 bg-primary-600 text-white font-bold rounded-lg shadow-md hover:bg-primary-700 disabled:opacity-50">{isSaving ? 'Saving...' : 'Save New Order'}</button>
                </div>
            </div>
        </div>
    );
};

// New Mapping Editor Modal
const MappingEditModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    mapping: Partial<TestMapping>;
    onSave: (m: Partial<TestMapping>) => void;
}> = ({ isOpen, onClose, mapping, onSave }) => {
    const [data, setData] = useState(mapping);
    useEffect(() => setData(mapping), [mapping]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[70] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-base-900 dark:text-base-100">{mapping.id ? 'Edit Mapping' : 'Add New Mapping'}</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Group</label>
                        <input type="text" value={data.headerGroup || ''} onChange={e => setData({...data, headerGroup: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g. Density"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Sub-Header</label>
                        <input type="text" value={data.headerSub || ''} onChange={e => setData({...data, headerSub: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g. 100"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Description</label>
                        <input type="text" value={data.description || ''} onChange={e => setData({...data, description: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Variant</label>
                        <input type="text" value={data.variant || ''} onChange={e => setData({...data, variant: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"/>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-base-600 hover:bg-base-100 rounded-lg">Cancel</button>
                    <button onClick={() => onSave(data)} className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg shadow-md hover:bg-primary-700">Save</button>
                </div>
            </div>
        </div>
    );
};

const MappingManager: React.FC<{ setNotification: (n: any) => void }> = ({ setNotification }) => {
    const [mappings, setMappings] = useState<TestMapping[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentMapping, setCurrentMapping] = useState<Partial<TestMapping>>({});

    const draggedMappingIndex = useRef<number | null>(null);
    const [dragOverMappingIndex, setDragOverMappingIndex] = useState<number | null>(null);

    const fetchData = useCallback(async () => { try { setMappings(await getTestMappings()); } catch(e){} }, []);
    useEffect(() => { fetchData(); }, [fetchData]);

    const handleUpload = async () => {
        if (!file) return;
        setIsProcessing(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const wb = XLSX.read(e.target?.result, { type: 'binary' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                if (rawData.length === 0) throw new Error("File is empty");

                let headerRowIndex = 0;
                let maxMatchCount = 0;
                const targetKeywords = ['description', 'variant', 'group', 'header', 'category', 'test name'];

                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i];
                    let matchCount = 0;
                    row.forEach((cell: any) => {
                        if (cell && typeof cell === 'string') {
                            const val = cell.toLowerCase();
                            if (targetKeywords.some(kw => val.includes(kw))) matchCount++;
                        }
                    });
                    if (matchCount > maxMatchCount) {
                        maxMatchCount = matchCount;
                        headerRowIndex = i;
                    }
                }

                const headerRow = rawData[headerRowIndex];
                const colMap: Record<string, number> = {};
                
                headerRow.forEach((cell: any, index: number) => {
                    if (typeof cell === 'string') {
                        const cleanHeader = cell.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (['description', 'desc', 'testname'].includes(cleanHeader)) colMap['desc'] = index;
                        if (['variant', 'var', 'method', 'condition'].includes(cleanHeader)) colMap['variant'] = index;
                        if (['headergroup', 'headergroup', 'group', 'testgroup', 'category'].includes(cleanHeader)) colMap['group'] = index;
                        if (['headersub', 'headersub', 'sub', 'subheader', 'column'].includes(cleanHeader)) colMap['sub'] = index;
                        if (['order', 'sort', 'sequence'].includes(cleanHeader)) colMap['order'] = index;
                    }
                });

                const currentMappings = await getTestMappings();
                let updatedCount = 0;
                let addedCount = 0;

                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    const getValue = (key: string) => (colMap[key] !== undefined && row[colMap[key]] !== undefined) ? String(row[colMap[key]]).trim() : '';
                    
                    const desc = getValue('desc');
                    const variant = getValue('variant');
                    const headerGroup = getValue('group') || 'Other';
                    const headerSub = getValue('sub') || 'Misc';
                    const order = Number(getValue('order')) || 0;

                    if (!desc && !variant) continue;

                    const existingMatch = currentMappings.find(
                        m => m.description.trim() === desc && m.variant.trim() === variant
                    );

                    if (existingMatch) {
                        await updateTestMapping(existingMatch.id, { headerGroup, headerSub, order });
                        updatedCount++;
                    } else {
                        await addTestMapping({ description: desc, variant: variant, headerGroup, headerSub, order });
                        addedCount++;
                    }
                }
                
                await fetchData();
                setNotification({ message: `Import Complete: Added ${addedCount}, Updated ${updatedCount}` });
            } catch (err) {
                console.error(err);
                setNotification({ message: "Failed to import mappings.", isError: true });
            } finally {
                setIsProcessing(false);
                setFile(null);
            }
        };
        reader.readAsBinaryString(file);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        await deleteTestMapping(deleteId);
        fetchData();
        setNotification({ message: "Mapping deleted" });
        setDeleteId(null);
    };

    const openAddModal = () => { setCurrentMapping({}); setIsEditModalOpen(true); };
    const openEditModal = (m: TestMapping) => { setCurrentMapping(m); setIsEditModalOpen(true); };

    const handleSaveMapping = async (m: Partial<TestMapping>) => {
        if (!m.headerGroup || !m.headerSub) { setNotification({ message: "Group and Sub-Header are required", isError: true }); return; }
        try {
            if (m.id) { await updateTestMapping(m.id, m); setNotification({ message: "Mapping updated" }); } 
            else { await addTestMapping({ ...m, order: mappings.length } as any); setNotification({ message: "New mapping added" }); }
            setIsEditModalOpen(false); fetchData();
        } catch(e) { setNotification({ message: "Failed to save mapping", isError: true }); }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => { draggedMappingIndex.current = index; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); if (draggedMappingIndex.current === index) return; setDragOverMappingIndex(index); };
    const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault(); setDragOverMappingIndex(null);
        const sourceIndex = draggedMappingIndex.current; draggedMappingIndex.current = null;
        if (sourceIndex === null || sourceIndex === targetIndex) return;
        const newMappings = [...mappings];
        const [movedItem] = newMappings.splice(sourceIndex, 1);
        newMappings.splice(targetIndex, 0, movedItem);
        setMappings(newMappings);
        try { const updates = newMappings.map((m, idx) => updateTestMapping(m.id, { order: idx })); await Promise.all(updates); setNotification({ message: "Order updated" }); } catch (err) { setNotification({ message: "Failed to update order", isError: true }); fetchData(); }
    };

    return (
        <div className="space-y-6">
            <ConfirmationModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} title="Delete Mapping" message="Are you sure?" confirmText="Delete" confirmColor="bg-red-600"/>
            <MappingEditModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} mapping={currentMapping} onSave={handleSaveMapping} />
            
            <div className="bg-white dark:bg-base-800 p-6 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div><h3 className="font-bold text-lg text-base-900 dark:text-base-100">Test Mappings</h3><p className="text-sm text-base-500">Manage Excel to Grid logic. Drag to reorder.</p></div>
                <div className="flex gap-2 items-center flex-wrap justify-end">
                    <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm dark:text-base-300 w-48" disabled={isProcessing}/>
                    <button onClick={handleUpload} disabled={!file || isProcessing} className="px-4 py-2 bg-base-100 dark:bg-base-700 text-base-700 dark:text-base-200 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2 hover:bg-base-200 dark:hover:bg-base-600">
                        {isProcessing ? <span className="animate-spin h-4 w-4 border-2 border-base-500 border-t-transparent rounded-full"></span> : <UploadIcon className="h-4 w-4"/>} Import Excel
                    </button>
                    <button onClick={openAddModal} className="px-4 py-2 bg-primary-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-primary-700 shadow-md"><PlusIcon className="h-4 w-4"/> Add Mapping</button>
                </div>
            </div>
            
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 overflow-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-base-50 dark:bg-base-700 sticky top-0 border-b dark:border-base-600 z-10">
                        <tr><th className="p-3 font-semibold dark:text-base-200 w-12 text-center"></th><th className="p-3 font-semibold dark:text-base-200">Group</th><th className="p-3 font-semibold dark:text-base-200">Sub-Header</th><th className="p-3 font-semibold dark:text-base-200">Description</th><th className="p-3 font-semibold dark:text-base-200">Variant</th><th className="p-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-base-100 dark:divide-base-700">
                        {mappings.map((m, index) => (
                            <tr key={m.id} draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={(e) => handleDragOver(e, index)} onDrop={(e) => handleDrop(e, index)} onDragEnd={() => setDragOverMappingIndex(null)} className={`hover:bg-base-50 dark:hover:bg-base-700/50 group cursor-move transition-colors ${dragOverMappingIndex === index ? 'border-t-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                                <td className="p-2 text-center text-base-400"><DragHandleIcon className="h-4 w-4 mx-auto"/></td>
                                <td className="p-3 font-bold text-primary-700 dark:text-primary-400">{m.headerGroup}</td>
                                <td className="p-3 font-medium dark:text-base-300">{m.headerSub}</td>
                                <td className="p-3 text-base-500 dark:text-base-400 truncate max-w-[200px]">{m.description || <span className="text-base-300 italic">*Any*</span>}</td>
                                <td className="p-3 text-base-500 dark:text-base-400 truncate max-w-[200px]">{m.variant || <span className="text-base-300 italic">*Any*</span>}</td>
                                <td className="p-3 text-right"><div className="flex justify-end gap-1"><button onClick={() => openEditModal(m)} className="p-2 text-base-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><PencilIcon className="h-4 w-4"/></button><button onClick={() => setDeleteId(m.id)} className="p-2 text-base-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><TrashIcon className="h-4 w-4"/></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const defaultLabels: Record<string, string> = {
    quality: 'Quality Center',
    import: 'Import Data',
    tasks: 'Assign Tasks',
    booking: 'Special Booking',
    requests: 'Support Requests',
    schedule: 'Shift Tracking',
    dashboard: 'Shift Summary',
    equipment: 'Equipment',
    proficiency: 'Proficiency',
    roster: 'Roster & Shifts',
    settings: 'Settings'
};

const UISettingsPanel: React.FC<{ 
    appSettings?: AppSettings | null; 
    onSettingsUpdated?: () => void; 
    setNotification: (n: any) => void;
}> = ({ appSettings, onSettingsUpdated, setNotification }) => {
    const [labels, setLabels] = useState<Record<string, string>>({ ...defaultLabels });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (appSettings?.tabLabels) {
            setLabels({ ...defaultLabels, ...appSettings.tabLabels });
        }
    }, [appSettings]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveAppSettings({
                ...appSettings,
                tabLabels: labels
            });
            setNotification({ message: 'Menu names updated securely.' });
            if (onSettingsUpdated) onSettingsUpdated();
        } catch (e: any) {
            setNotification({ message: e.message, isError: true });
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

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-4 rounded-2xl flex gap-3 items-start mb-6">
                <AlertTriangleIcon className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-900 dark:text-amber-200 font-medium">
                    <strong>Precautions (ข้อควรระวัง):</strong> Changing these names will update the menu for <span className="font-bold underline">all users</span> in the system. Use clear and easily understandable names to prevent confusion for other lab members.
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

// --- QR CODE GENERATOR FOR EQUIPMENTS & FUTURE ACTIVITIES ---
const QRCodeManager: React.FC = () => {
    const currentBaseUrl = window.location.origin + window.location.pathname;
    const borrowUrl = `${currentBaseUrl}?tab=borrow`;
    
    const [customText, setCustomText] = useState(borrowUrl);
    const [qrSize, setQrSize] = useState('250');
    const [qrTitle, setQrTitle] = useState('แสกนเพื่อ ยืม-คืน อุปกรณ์');
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(customText)}`;
    
    const presetLinks = [
        { label: 'ยืม-คืน อุปกรณ์ (Borrow & Return)', url: borrowUrl, title: 'แสกนเพื่อ ยืม-คืน อุปกรณ์' },
        { label: 'หน้าแรกระบบ Planner (Home)', url: currentBaseUrl, title: 'ระบบจัดการ Planner V2' },
        { label: 'ตารางเวร (Shift Tracking)', url: `${currentBaseUrl}?tab=schedule`, title: 'แสกนเพื่อดูตารางเวร' },
        { label: 'ลงทะเบียนจองเครื่องมือ (Booking)', url: `${currentBaseUrl}?tab=booking`, title: 'แสนกนเพื่อจองเครื่องมือ' },
    ];

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
            <head>
                <title>Print QR Code - ${qrTitle}</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        background: white;
                        color: #1e293b;
                    }
                    .container {
                        text-align: center;
                        border: 3px solid #e2e8f0;
                        padding: 40px;
                        border-radius: 24px;
                        max-width: 400px;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
                    }
                    h1 {
                        font-size: 24px;
                        font-weight: 800;
                        margin-bottom: 20px;
                    }
                    img {
                        border: 1px solid #cbd5e1;
                        padding: 10px;
                        border-radius: 12px;
                        background: #fff;
                    }
                    p {
                        font-size: 14px;
                        color: #64748b;
                        margin-top: 20px;
                        font-weight: 500;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>${qrTitle}</h1>
                    <img src="${qrUrl}" width="${qrSize}" height="${qrSize}" alt="QR Code" />
                    <p>สแกนผ่านโทรศัพท์มือถือเพื่อเข้าใช้งานฟังก์ชันโดยตรง</p>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() { window.close(); }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-xl overflow-hidden p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary-100 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 rounded-xl">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-xl font-black text-base-900 dark:text-base-100 uppercase tracking-tight">QR Code Generator (สร้างรหัสคิวอาร์)</h3>
                    <p className="text-sm font-bold text-base-500 mt-1">สร้างคิวอาร์โค้ดสำหรับติดตังตามจุด เพื่อสแกนเปิดการยืม-คืนได้อย่างรวดเร็ว หรือสร้างสำหรับกิจกรรมอื่นๆ ในอนาคต</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                {/* Inputs & Config */}
                <div className="md:col-span-3 space-y-4">
                    <div className="bg-base-50 dark:bg-base-800 p-4 rounded-2xl border border-base-100 dark:border-base-700">
                        <span className="text-[10px] font-black uppercase text-primary-600 dark:text-primary-400 block mb-2">ลิงก์สำเร็จรูป (Presets)</span>
                        <div className="flex flex-col gap-2">
                            {presetLinks.map((preset, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                        setCustomText(preset.url);
                                        setQrTitle(preset.title);
                                    }}
                                    className="text-left px-3.5 py-2.5 bg-white dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl text-xs font-bold hover:border-primary-500 dark:hover:border-primary-500 transition-all flex items-center justify-between group"
                                >
                                    <span className="text-slate-700 dark:text-slate-200">{preset.label}</span>
                                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] group-hover:text-primary-500">{preset.url}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-base-400 uppercase tracking-wider block">
                            ข้อความ / ลิงก์ปลายทาง (Target URL / Text)
                        </label>
                        <input
                            type="text"
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                            placeholder="ใส่ข้อความหรือลิงก์ปลายทาง..."
                            className="w-full bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-xl px-4 py-2.5 font-bold text-xs focus:border-primary-500 outline-none transition-all dark:text-white"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-base-400 uppercase tracking-wider block">
                            หัวข้อ/ชื่อคิวอาร์ (QR Title)
                        </label>
                        <input
                            type="text"
                            value={qrTitle}
                            onChange={(e) => setQrTitle(e.target.value)}
                            placeholder="ระบุชื่อสำหรับแสดงตอนปริ้นท์..."
                            className="w-full bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-xl px-4 py-2.5 font-bold text-xs focus:border-primary-500 outline-none transition-all dark:text-white"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-base-400 uppercase tracking-wider block">
                                ขนาดพิกเซล (Size px)
                            </label>
                            <select
                                value={qrSize}
                                onChange={(e) => setQrSize(e.target.value)}
                                className="w-full bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-xl px-3 py-2.5 font-bold text-xs focus:border-primary-500 outline-none transition-all dark:text-white"
                            >
                                <option value="150">150 x 150</option>
                                <option value="200">200 x 200</option>
                                <option value="250">250 x 250</option>
                                <option value="300">300 x 300</option>
                                <option value="400">400 x 400</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* QR Code Preview Box */}
                <div className="md:col-span-2 flex flex-col items-center justify-center p-6 bg-base-50 dark:bg-base-800 rounded-3xl border border-base-100 dark:border-base-700 text-center space-y-4">
                    <span className="text-[10px] font-black uppercase text-base-400 block tracking-widest">QR Code Preview</span>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-base-200/60 inline-block">
                        <img 
                            src={qrUrl} 
                            alt="QR Code" 
                            width={qrSize} 
                            height={qrSize} 
                            referrerPolicy="no-referrer"
                            className="max-w-full h-auto"
                        />
                    </div>
                    
                    <div className="w-full space-y-2">
                        <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 truncate px-2">{qrTitle}</h4>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handlePrint}
                                className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                <span>สั่งพิมพ์คิวอาร์ (Print)</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const compressImage = (base64Str: string, maxWidth = 500, maxHeight = 500): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => {
            resolve(base64Str);
        };
    });
};

const HighValueAssetsManager: React.FC<{
    appSettings?: AppSettings | null;
    onSettingsUpdated?: () => void;
    setNotification: (n: any) => void;
}> = ({ appSettings, onSettingsUpdated, setNotification }) => {
    const [assets, setAssets] = useState<HighValueAsset[]>([]);
    const [editingAsset, setEditingAsset] = useState<Partial<HighValueAsset> | null>(null);
    const [assetToDelete, setAssetToDelete] = useState<HighValueAsset | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (appSettings?.highValueAssets) {
            setAssets(appSettings.highValueAssets);
        } else {
            setAssets([]);
        }
    }, [appSettings]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAsset?.name || !editingAsset?.code) {
            setNotification({ message: 'โปรดระบุชื่อและรหัสอุปกรณ์', isError: true });
            return;
        }

        setIsSaving(true);
        try {
            let updatedAssets = [...assets];
            if (editingAsset.id) {
                updatedAssets = updatedAssets.map(a => a.id === editingAsset.id ? { 
                    ...a, 
                    ...editingAsset,
                    trackQuantity: editingAsset.trackQuantity ?? false,
                    initialQuantity: editingAsset.initialQuantity ?? 1,
                    isConsumable: editingAsset.isConsumable ?? false
                } as HighValueAsset : a);
            } else {
                const newAsset: HighValueAsset = {
                    id: 'hva_' + Date.now(),
                    name: editingAsset.name,
                    code: editingAsset.code,
                    cabinet: editingAsset.cabinet || 'ตู้เก็บหลัก',
                    photo: editingAsset.photo || '',
                    isActive: editingAsset.isActive !== false,
                    trackQuantity: editingAsset.trackQuantity ?? false,
                    initialQuantity: editingAsset.initialQuantity ?? 1,
                    isConsumable: editingAsset.isConsumable ?? false
                };
                updatedAssets.push(newAsset);
            }

            await saveAppSettings({ ...appSettings, highValueAssets: updatedAssets });
            setNotification({ message: 'บันทึกอุปกรณ์มูลค่าสูงเรียบร้อยแล้ว' });
            setIsFormOpen(false);
            setEditingAsset(null);
            if (onSettingsUpdated) onSettingsUpdated();
        } catch (error) {
            setNotification({ message: 'ไม่สามารถบันทึกข้อมูลได้', isError: true });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const target = assets.find(a => a.id === id);
        if (target) {
            setAssetToDelete(target);
        }
    };

    const confirmDelete = async () => {
        if (!assetToDelete) return;
        try {
            const updatedAssets = assets.filter(a => a.id !== assetToDelete.id);
            await saveAppSettings({ ...appSettings, highValueAssets: updatedAssets });
            setNotification({ message: 'ลบอุปกรณ์เรียบร้อยแล้ว' });
            setAssetToDelete(null);
            if (onSettingsUpdated) onSettingsUpdated();
        } catch (error) {
            setNotification({ message: 'ลบไม่สำเร็จ', isError: true });
        }
    };

    const handleToggleActive = async (asset: HighValueAsset) => {
        try {
            const updatedAssets = assets.map(a => a.id === asset.id ? { ...a, isActive: !a.isActive } : a);
            await saveAppSettings({ ...appSettings, highValueAssets: updatedAssets });
            setNotification({ message: asset.isActive ? 'ปิดการใช้งานอุปกรณ์ชิ้นนี้แล้ว' : 'เปิดการใช้งานอุปกรณ์ชิ้นนี้แล้ว' });
            if (onSettingsUpdated) onSettingsUpdated();
        } catch (error) {
            setNotification({ message: 'อัปเดตไม่สำเร็จ', isError: true });
        }
    };

    const handleFileChange = (file: File) => {
        if (!file.type.startsWith('image/')) {
            setNotification({ message: 'กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น', isError: true });
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (e.target?.result) {
                const rawBase64 = e.target.result as string;
                try {
                    const compressed = await compressImage(rawBase64);
                    setEditingAsset(prev => ({ ...prev, photo: compressed }));
                } catch (err) {
                    setEditingAsset(prev => ({ ...prev, photo: rawBase64 }));
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileChange(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-base-800 p-6 rounded-2xl border border-base-200 dark:border-base-700 shadow-sm">
                <div>
                    <h3 className="font-bold text-lg text-base-900 dark:text-base-100">รายการอุปกรณ์มูลค่าสูง (High-Value Equipment List)</h3>
                    <p className="text-sm text-base-500">จัดการอุปกรณ์มูลค่าสูงที่จัดเก็บแยกพิเศษ เพื่อให้พนักงานทำการตรวจสอบสภาพทุกวันในระหว่างสลับกะ</p>
                </div>
                <button
                    onClick={() => {
                        setEditingAsset({ isActive: true, cabinet: '', name: '', code: '', photo: '' });
                        setIsFormOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-bold rounded-xl shadow-md hover:bg-primary-700 transition-all text-sm shrink-0"
                >
                    <PlusIcon className="w-5 h-5" />
                    <span>เพิ่มอุปกรณ์ใหม่</span>
                </button>
            </div>

            {isFormOpen && (
                <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto" onClick={() => setIsFormOpen(false)}>
                    <div className="bg-white dark:bg-base-800 rounded-3xl shadow-2xl p-6 w-full max-w-lg border border-base-200 dark:border-base-700 animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-base-900 dark:text-base-100 mb-4">{editingAsset?.id ? 'แก้ไขข้อมูลอุปกรณ์' : 'เพิ่มอุปกรณ์มูลค่าสูง'}</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-base-400 uppercase tracking-wider">ชื่ออุปกรณ์ (Equipment Name)</label>
                                <input
                                    type="text"
                                    required
                                    value={editingAsset?.name || ''}
                                    onChange={e => setEditingAsset(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full p-3 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
                                    placeholder="เช่น HPLC - Agilent 1260"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-base-400 uppercase tracking-wider">รหัสครุภัณฑ์ (Asset ID / Serial)</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingAsset?.code || ''}
                                        onChange={e => setEditingAsset(prev => ({ ...prev, code: e.target.value }))}
                                        className="w-full p-3 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
                                        placeholder="เช่น HPLC-001"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-base-400 uppercase tracking-wider">สถานที่จัดเก็บ / ตู้เก็บพิเศษ</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingAsset?.cabinet || ''}
                                        onChange={e => setEditingAsset(prev => ({ ...prev, cabinet: e.target.value }))}
                                        className="w-full p-3 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
                                        placeholder="เช่น ตู้กระจกนิรภัย A2"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-base-400 uppercase tracking-wider block mb-1">ภาพถ่ายอุปกรณ์ (Equipment Image)</label>
                                <div 
                                    onDragEnter={handleDrag}
                                    onDragOver={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={() => {
                                        if (!editingAsset?.photo) {
                                            fileInputRef.current?.click();
                                        }
                                    }}
                                    className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${dragActive ? 'border-primary-500 bg-primary-50/10' : 'border-base-200 dark:border-base-700 hover:border-base-300 bg-base-50/20 dark:bg-base-900/10'}`}
                                >
                                    {editingAsset?.photo ? (
                                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                            <img src={editingAsset.photo} alt="Upload preview" className="h-32 mx-auto object-contain rounded-xl shadow-md border border-base-200" referrerPolicy="no-referrer" />
                                            <button 
                                                type="button" 
                                                onClick={() => setEditingAsset(prev => ({ ...prev, photo: '' }))} 
                                                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-xs font-bold transition-all"
                                            >
                                                ลบรูปภาพ
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <div className="p-3 bg-base-100 dark:bg-base-700 rounded-full text-base-500">
                                                <UploadIcon className="h-6 w-6" />
                                            </div>
                                            <div className="text-sm">
                                                <span className="font-bold text-primary-600 hover:text-primary-500">คลิกเพื่อเลือกไฟล์</span>
                                                <span className="text-base-400 dark:text-base-500"> หรือ ลากและวางไฟล์ลงที่นี่</span>
                                            </div>
                                            <p className="text-xs text-base-400 dark:text-base-500">PNG, JPG, WEBP ขนาดไม่เกิน 5MB</p>
                                        </div>
                                    )}
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={e => e.target.files && e.target.files[0] && handleFileChange(e.target.files[0])} 
                                        onClick={e => e.stopPropagation()}
                                    />
                                </div>
                            </div>

                            {/* Quantity Tracking Options */}
                            <div className="bg-base-50 dark:bg-base-900/50 p-4 rounded-2xl border border-base-200 dark:border-base-700 space-y-3">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="trackQuantity"
                                        checked={editingAsset?.trackQuantity || false}
                                        onChange={e => setEditingAsset(prev => ({ 
                                            ...prev, 
                                            trackQuantity: e.target.checked,
                                            // Pre-fill initial values if checked
                                            initialQuantity: prev?.initialQuantity || 1,
                                            isConsumable: prev?.isConsumable || false
                                        }))}
                                        className="w-4 h-4 text-primary-600 rounded border-base-300 focus:ring-primary-500"
                                    />
                                    <label htmlFor="trackQuantity" className="text-sm font-bold text-base-800 dark:text-base-200 flex items-center gap-1.5 cursor-pointer">
                                        เปิดใช้งานการนับจำนวน (Track Quantity)
                                    </label>
                                </div>

                                {editingAsset?.trackQuantity && (
                                    <div className="pl-6 space-y-3 pt-1 border-l-2 border-primary-500/30 animate-fade-in">
                                        <div>
                                            <label className="text-xs font-bold text-base-500 uppercase tracking-wider block mb-1">จำนวนเริ่มต้นที่มีอยู่จริง (Original/Baseline Qty)</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    required
                                                    value={editingAsset?.initialQuantity || 1}
                                                    onChange={e => setEditingAsset(prev => ({ ...prev, initialQuantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                    className="w-32 p-2 bg-white dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white text-sm font-bold"
                                                    placeholder="1"
                                                />
                                                <span className="text-xs text-base-400">ชิ้น/อัน</span>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2 pt-1">
                                            <input
                                                type="checkbox"
                                                id="isConsumable"
                                                checked={editingAsset?.isConsumable || false}
                                                onChange={e => setEditingAsset(prev => ({ ...prev, isConsumable: e.target.checked }))}
                                                className="w-4 h-4 mt-0.5 text-primary-600 rounded border-base-300 focus:ring-primary-500"
                                            />
                                            <div className="flex flex-col">
                                                <label htmlFor="isConsumable" className="text-xs font-bold text-base-800 dark:text-base-200 cursor-pointer">
                                                    เป็นของใช้สิ้นเปลือง (Consumable)
                                                </label>
                                                <p className="text-[11px] text-base-400 mt-0.5 leading-relaxed">
                                                    หากติ๊กไว้: จำนวนที่ลดลงหรือหายไปจะ **ไม่ถือว่าผิดปกติ** (จะไม่เตือนตัวแดง) เหมาะสำหรับถุงมือ เข็มฉีดยา ฟิลเตอร์ เป็นต้น
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="assetActive"
                                    checked={editingAsset?.isActive !== false}
                                    onChange={e => setEditingAsset(prev => ({ ...prev, isActive: e.target.checked }))}
                                    className="w-4 h-4 text-primary-600 rounded border-base-300 focus:ring-primary-500"
                                />
                                <label htmlFor="assetActive" className="text-sm font-bold text-base-700 dark:text-base-300">เปิดใช้งาน (แสดงในการตรวจสอบรายวัน)</label>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-base-100 dark:border-base-700">
                                <button
                                    type="button"
                                    onClick={() => setIsFormOpen(false)}
                                    className="px-5 py-2.5 text-sm font-semibold text-base-600 hover:bg-base-100 dark:hover:bg-base-700 rounded-xl transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl shadow-md hover:bg-primary-700 disabled:opacity-50 transition-all text-sm"
                                >
                                    {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {assets.map(asset => (
                    <div key={asset.id} className={`bg-white dark:bg-base-800 rounded-2xl border transition-all overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md ${asset.isActive ? 'border-base-200 dark:border-base-700' : 'border-base-100 dark:border-base-800 opacity-60'}`}>
                        <div className="relative h-44 bg-base-100 dark:bg-base-900 flex items-center justify-center overflow-hidden">
                            {asset.photo ? (
                                <img src={asset.photo} alt={asset.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="flex flex-col items-center justify-center text-base-400 p-4 text-center">
                                    <div className="p-4 bg-white dark:bg-base-800 rounded-full shadow-inner mb-2 text-primary-500">
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v13.5m4.5-13.5v13.5m-1.5-10.5h3.75c.621 0 1.125.504 1.125 1.125V11.25a1.125 1.125 0 01-1.125 1.125H9.75M10.5 15h7.5a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0018 4.5H6a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 006 19.5h1.5m1.5-3.75V19.5" />
                                        </svg>
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider">{asset.code}</span>
                                </div>
                            )}
                            <div className="absolute top-3 right-3 flex gap-1.5">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md ${asset.isActive ? 'bg-emerald-500 text-white' : 'bg-base-400 text-white'}`}>
                                    {asset.isActive ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'}
                                </span>
                            </div>
                        </div>

                        <div className="p-5 flex-grow flex flex-col justify-between">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-primary-600 uppercase tracking-wider block">{asset.code}</span>
                                <h4 className="font-bold text-base-900 dark:text-base-100 line-clamp-2 min-h-[3rem]">{asset.name}</h4>
                                <div className="flex items-center gap-1.5 text-xs text-base-500 mt-2 bg-base-50 dark:bg-base-900 px-3 py-2 rounded-xl border border-base-100 dark:border-base-700 w-fit">
                                    <svg className="w-3.5 h-3.5 text-base-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    <span className="font-bold">ตู้จัดเก็บ:</span>
                                    <span className="font-medium text-base-700 dark:text-base-300">{asset.cabinet}</span>
                                </div>
                                {asset.trackQuantity && (
                                    <div className="flex items-center gap-1.5 text-xs text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/20 px-3 py-1.5 rounded-xl border border-primary-100 dark:border-primary-900/30 w-fit mt-1.5">
                                        <span className="font-bold">จำนวน: {asset.initialQuantity} ชิ้น</span>
                                        {asset.isConsumable ? (
                                            <span className="text-[10px] font-black bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                                ของใช้สิ้นเปลือง
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-black bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                                ตรวจสอบถ้วนหน้า
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center mt-6 pt-4 border-t border-base-100 dark:border-base-700">
                                <button
                                    onClick={() => handleToggleActive(asset)}
                                    className={`text-xs font-bold transition-colors ${asset.isActive ? 'text-base-400 hover:text-base-600' : 'text-primary-600 hover:text-primary-700'}`}
                                >
                                    {asset.isActive ? 'ปิดชั่วคราว' : 'เปิดใช้งาน'}
                                </button>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            setEditingAsset(asset);
                                            setIsFormOpen(true);
                                        }}
                                        className="p-2 text-base-400 hover:text-primary-600 hover:bg-base-50 dark:hover:bg-base-700 rounded-lg transition-all"
                                        title="แก้ไข"
                                    >
                                        <PencilIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(asset.id)}
                                        className="p-2 text-base-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                                        title="ลบ"
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {assets.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-white dark:bg-base-800 rounded-2xl border border-dashed border-base-200">
                        <span className="text-sm text-base-400 italic">ไม่มีอุปกรณ์มูลค่าสูงในระบบ กดปุ่ม "เพิ่มอุปกรณ์ใหม่" เพื่อเริ่มต้น</span>
                    </div>
                )}
            </div>

            <ConfirmationModal 
                isOpen={!!assetToDelete} 
                onClose={() => setAssetToDelete(null)} 
                onConfirm={confirmDelete} 
                title="ยืนยันการลบอุปกรณ์มูลค่าสูง" 
                message={
                    <div className="space-y-2">
                        <p className="text-sm text-base-600 dark:text-base-300">คุณต้องการลบอุปกรณ์ชิ้นนี้ใช่หรือไม่?</p>
                        <p className="font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-3 rounded-xl border border-red-200 dark:border-red-900/30 text-xs">
                            {assetToDelete?.name} ({assetToDelete?.code})
                        </p>
                        <p className="text-[11px] text-base-400">การลบข้อมูลนี้จะลบอุปกรณ์ออกจากรายการถาวร และจะไม่แสดงในรายการตรวจสอบของกะใหม่อีกต่อไป</p>
                    </div>
                } 
                confirmText="ยืนยันการลบ" 
                confirmColor="bg-red-600" 
            />
        </div>
    );
};

const SettingsTab: React.FC<{ testers: Tester[]; onRefreshTesters: () => void; onTasksUpdated: () => void; appSettings?: AppSettings | null; onSettingsUpdated?: () => void; }> = (props) => {
    const [activeSubTab, setActiveSubTab] = useState<'team' | 'mappings' | 'columns' | 'ui' | 'highValueAssets' | 'qrcode' | 'danger'>(() => {
        try {
            const saved = localStorage.getItem('settings_active_subtab');
            if (saved && ['team', 'mappings', 'columns', 'ui', 'highValueAssets', 'qrcode', 'danger'].includes(saved)) {
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
        { id: 'mappings', label: 'Test Mappings' },
        { id: 'columns', label: 'Column Order' },
        { id: 'ui', label: 'UI Settings' },
        { id: 'highValueAssets', label: 'High-Value Assets' },
        { id: 'qrcode', label: 'QR Code' },
        { id: 'danger', label: 'Danger Zone', danger: true }
    ];

    const handleCleanupConfirm = async () => { setIsProcessing(true); try { const res = await runCleanup(); setNotification({ message: `Deleted ${res.deleted} empty tasks.` }); props.onTasksUpdated(); } catch (e: any) { setNotification({ message: e.message, isError: true }); } finally { setIsProcessing(false); setShowCleanupModal(false); } };
    const handleWipeConfirm = async () => { setIsProcessing(true); try { await clearAllTaskData(); setNotification({ message: "All data wiped successfully." }); props.onTasksUpdated(); } catch (e: any) { setNotification({ message: e.message, isError: true }); } finally { setIsProcessing(false); setShowWipeModal(false); } };

    return (
        <div className="space-y-8 animate-slide-in-up">
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
                {activeSubTab === 'mappings' && <MappingManager setNotification={setNotification} />}
                {activeSubTab === 'columns' && <GroupOrderManager onTasksUpdated={props.onTasksUpdated} setNotification={setNotification} />}
                {activeSubTab === 'ui' && <UISettingsPanel appSettings={props.appSettings} onSettingsUpdated={props.onSettingsUpdated} setNotification={setNotification} />}
                {activeSubTab === 'highValueAssets' && <HighValueAssetsManager appSettings={props.appSettings} onSettingsUpdated={props.onSettingsUpdated} setNotification={setNotification} />}
                {activeSubTab === 'qrcode' && <QRCodeManager />}
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
