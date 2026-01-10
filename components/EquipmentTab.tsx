
import React, { useState, useEffect, useMemo } from 'react';
import type { Equipment, EquipmentHistory } from '../types';
import { getEquipments, saveEquipment, deleteEquipment } from '../services/dataService';
import { 
    PlusIcon, TrashIcon, PencilIcon, CheckCircleIcon, 
    AlertTriangleIcon, CogIcon, RefreshIcon, XCircleIcon,
    ChatBubbleLeftEllipsisIcon, BeakerIcon, ChevronDownIcon,
    ClipboardListIcon, CalendarIcon
} from './common/Icons';

const EquipmentTab: React.FC = () => {
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleteHistoryModalOpen, setIsDeleteHistoryModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    
    const [editingEquip, setEditingEquip] = useState<Partial<Equipment> | null>(null);
    const [selectedEquip, setSelectedEquip] = useState<Equipment | null>(null);
    const [methodsInput, setMethodsInput] = useState('');
    const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);
    const [historyToDelete, setHistoryToDelete] = useState<{ equip: Equipment, entryId: string } | null>(null);

    // Maintenance History Form State
    const [newHistory, setNewHistory] = useState<Partial<EquipmentHistory>>({
        date: new Date().toISOString().split('T')[0],
        description: '',
        partsReplaced: '',
        technician: 'Admin'
    });
    const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);

    // Filter States
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await getEquipments();
            setEquipments(data);
            // If detail modal is open, refresh the selected equipment object
            if (selectedEquip) {
                const updated = data.find(e => e.id === selectedEquip.id);
                if (updated) setSelectedEquip(updated);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const groups = useMemo(() => {
        const g = new Set<string>();
        equipments.forEach(e => { if (e.group) g.add(e.group); });
        return Array.from(g).sort();
    }, [equipments]);

    const filteredEquipments = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return equipments.filter(e => {
            const matchesStatus = filterStatus === 'all' || e.status === filterStatus;
            const matchesSearch = !searchTerm || 
                                 (e.name || '').toLowerCase().includes(lowerSearch) || 
                                 (e.group || '').toLowerCase().includes(lowerSearch) ||
                                 (e.methods || []).some(m => m.toLowerCase().includes(lowerSearch));
            return matchesStatus && matchesSearch;
        }).sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.name || '').localeCompare(b.name || ''));
    }, [equipments, filterStatus, searchTerm]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEquip?.name || !editingEquip?.group) return;
        const methodsArray = methodsInput.split(',').map(m => m.trim()).filter(m => m !== '');
        const payload: Omit<Equipment, 'id'> & { id?: string } = {
            id: editingEquip.id,
            name: editingEquip.name,
            group: editingEquip.group.toUpperCase(),
            status: editingEquip.status || 'ready',
            actionStatus: editingEquip.actionStatus || 'none',
            details: editingEquip.details || '',
            methods: methodsArray,
            history: editingEquip.history || [],
            lastUpdated: new Date().toISOString(),
            updatedBy: 'Admin'
        };
        await saveEquipment(payload);
        setIsModalOpen(false);
        fetchData();
    };

    const handleAddOrEditHistory = async () => {
        const activeEquip = selectedEquip || (editingEquip as Equipment);
        if (!activeEquip || !newHistory.description) return;
        
        let updatedHistory: EquipmentHistory[];
        
        if (editingHistoryId) {
            updatedHistory = (activeEquip.history || []).map(h => 
                h.id === editingHistoryId 
                ? { ...h, date: newHistory.date!, description: newHistory.description!, partsReplaced: newHistory.partsReplaced, technician: newHistory.technician! } 
                : h
            );
        } else {
            const historyEntry: EquipmentHistory = {
                id: Math.random().toString(36).substring(2, 9),
                date: newHistory.date || new Date().toISOString().split('T')[0],
                description: newHistory.description,
                partsReplaced: newHistory.partsReplaced,
                technician: newHistory.technician || 'Admin'
            };
            updatedHistory = [historyEntry, ...(activeEquip.history || [])];
        }

        const updatedEquip = { ...activeEquip, history: updatedHistory };
        await saveEquipment(updatedEquip as Equipment);
        setIsHistoryModalOpen(false);
        setEditingHistoryId(null);
        setNewHistory({
            date: new Date().toISOString().split('T')[0],
            description: '',
            partsReplaced: '',
            technician: 'Admin'
        });
        fetchData();
    };

    const handleEditStart = (e: React.MouseEvent, equip: Equipment) => {
        e.stopPropagation();
        setEditingEquip(equip);
        setMethodsInput(equip.methods?.join(', ') || '');
        setIsModalOpen(true);
    };

    const handleOpenHistoryForm = (e: React.MouseEvent | React.FocusEvent, equip: Equipment) => {
        if ('stopPropagation' in e) e.stopPropagation();
        setEditingHistoryId(null);
        setNewHistory({
            date: new Date().toISOString().split('T')[0],
            description: '',
            partsReplaced: '',
            technician: 'Admin'
        });
        setIsHistoryModalOpen(true);
    };

    const handleEditHistoryEntry = (e: React.MouseEvent, entry: EquipmentHistory) => {
        e.stopPropagation();
        setEditingHistoryId(entry.id);
        setNewHistory({
            date: entry.date,
            description: entry.description,
            partsReplaced: entry.partsReplaced || '',
            technician: entry.technician
        });
        setIsHistoryModalOpen(true);
    };

    const confirmDeleteHistory = async () => {
        if (!historyToDelete) return;
        const { equip, entryId } = historyToDelete;
        const updatedHistory = (equip.history || []).filter(h => h.id !== entryId);
        const updatedEquip = { ...equip, history: updatedHistory };
        await saveEquipment(updatedEquip);
        setHistoryToDelete(null);
        setIsDeleteHistoryModalOpen(false);
        fetchData();
    };

    const handleAddNewStart = () => {
        setEditingEquip({ status: 'ready', actionStatus: 'none', group: '', history: [] });
        setMethodsInput('');
        setIsModalOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (targetDeleteId) {
            await deleteEquipment(targetDeleteId);
            setTargetDeleteId(null);
            setIsDeleteModalOpen(false);
            setIsModalOpen(false);
            setIsDetailModalOpen(false);
            fetchData();
        }
    };

    const initiateDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setTargetDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const getStatusStyles = (status: Equipment['status']) => {
        switch (status) {
            case 'ready': return { bg: 'bg-emerald-500', lightBg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-700 dark:text-emerald-400' };
            case 'issue': return { bg: 'bg-red-600', lightBg: 'bg-red-50 dark:bg-red-950/20', text: 'text-red-700 dark:text-red-400' };
            case 'maintenance': return { bg: 'bg-amber-500', lightBg: 'bg-amber-50 dark:bg-amber-955/20', text: 'text-amber-700 dark:text-amber-400' };
            default: return { bg: 'bg-base-200', lightBg: 'bg-base-50', text: 'text-base-500' };
        }
    };

    const handleOpenDetails = (equip: Equipment) => {
        setSelectedEquip(equip);
        setIsDetailModalOpen(true);
    };

    return (
        <div className="h-full flex flex-col space-y-4 p-6 animate-fade-in bg-base-50/30 dark:bg-transparent overflow-hidden">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
                <div>
                    <h2 className="text-3xl font-black text-base-955 dark:text-base-50 tracking-tighter uppercase leading-none">Inventory</h2>
                    <p className="text-base-400 font-bold uppercase tracking-[0.2em] text-[9px]">Laboratory Asset Management</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-grow lg:flex-none lg:w-64">
                        <input 
                            type="text" 
                            placeholder="Quick find..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-base-900 border-2 border-base-100 dark:border-base-800 rounded-2xl outline-none font-bold text-xs focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all shadow-sm"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-base-300"><CogIcon className="h-4 w-4" /></div>
                    </div>
                    <button 
                        onClick={handleAddNewStart}
                        className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:brightness-110 active:scale-95 transition-all"
                    >
                        <PlusIcon className="h-4 w-4" /> Add Asset
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-4 bg-white/60 dark:bg-base-900/60 backdrop-blur-md p-3 rounded-[1.8rem] border border-white dark:border-base-800 shadow-sm shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-3 pl-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">Condition Status:</span>
                    <div className="flex gap-1.5">
                        {['all', 'ready', 'issue', 'maintenance'].map(s => (
                            <button 
                                key={s} 
                                onClick={() => setFilterStatus(s)} 
                                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === s ? 'bg-primary-600 text-white shadow-lg scale-105' : 'bg-white dark:bg-base-800 text-base-500 border border-base-100 dark:border-base-700 hover:border-primary-300'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Asset Grid */}
            {isLoading ? (
                <div className="flex-grow flex items-center justify-center"><RefreshIcon className="h-10 w-10 animate-spin text-primary-200" /></div>
            ) : (
                <div className="flex-grow overflow-y-auto pr-1 custom-scrollbar pb-10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5">
                        {filteredEquipments.map(equip => {
                            const style = getStatusStyles(equip.status);
                            return (
                                <div 
                                    key={equip.id} 
                                    onClick={() => handleOpenDetails(equip)}
                                    className="bg-white dark:bg-base-900 rounded-[2.2rem] border-2 border-base-100 dark:border-base-800 hover:border-primary-500 hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden flex flex-col group active:scale-95"
                                >
                                    <div className={`h-2 w-full ${style.bg}`}></div>
                                    <div className="p-6 flex flex-col space-y-4">
                                        <div className="flex justify-between items-start">
                                            <span className="text-[22px] font-black uppercase tracking-tighter leading-none text-base-955 dark:text-base-50 group-hover:text-primary-600 transition-colors">
                                                {equip.group}
                                            </span>
                                        </div>
                                        <div>
                                            <h3 className="text-[14px] font-black text-base-400 dark:text-base-500 uppercase tracking-widest truncate">
                                                {equip.name}
                                            </h3>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 mt-auto border-t border-base-50 dark:border-base-800">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>{equip.status}</span>
                                            <ChevronDownIcon className="h-5 w-5 text-base-300 -rotate-90 group-hover:text-primary-500 transition-all" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* DETAIL MODAL - WIDE & COMPREHENSIVE */}
            {isDetailModalOpen && selectedEquip && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[105] p-4 animate-fade-in" onClick={() => setIsDetailModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-white/20 flex flex-col animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-8 border-b-4 border-base-50 dark:border-base-800 bg-base-50/50 dark:bg-base-800/30 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-6">
                                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-xl ${getStatusStyles(selectedEquip.status).bg}`}>
                                    <CogIcon className="h-8 w-8 text-white" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-4xl font-black text-base-955 dark:text-white tracking-tighter uppercase leading-none">{selectedEquip.group}</h3>
                                        <span className={`px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-md ${getStatusStyles(selectedEquip.status).bg}`}>
                                            {selectedEquip.status}
                                        </span>
                                    </div>
                                    <p className="text-sm font-black text-base-400 uppercase tracking-[0.3em] mt-2">Asset Identifier: <span className="text-primary-600">{selectedEquip.name}</span></p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={(e) => handleEditStart(e, selectedEquip)} className="p-4 bg-white dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl text-base-500 hover:text-primary-600 shadow-sm transition-all" title="Edit Properties"><PencilIcon className="h-6 w-6"/></button>
                                <button onClick={(e) => initiateDelete(e, selectedEquip.id)} className="p-4 bg-white dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl text-base-500 hover:text-red-600 shadow-sm transition-all" title="Delete Asset"><TrashIcon className="h-6 w-6"/></button>
                                <button onClick={() => setIsDetailModalOpen(false)} className="p-4 bg-white dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl text-base-500 hover:bg-base-50 transition-all ml-4"><XCircleIcon className="h-6 w-6"/></button>
                            </div>
                        </div>

                        {/* Modal Body - Scrollable */}
                        <div className="flex-grow overflow-y-auto p-10 space-y-12 custom-scrollbar">
                            {/* Grid Layout for Content */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                                {/* Left Side: Details & Capabilities */}
                                <div className="lg:col-span-1 space-y-10">
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-6 bg-primary-600 rounded-full"></div>
                                            <h4 className="text-xs font-black uppercase tracking-[0.4em] text-base-400">Capabilities</h4>
                                        </div>
                                        <div className="flex flex-wrap gap-2.5">
                                            {selectedEquip.methods && selectedEquip.methods.length > 0 ? (
                                                selectedEquip.methods.map((m, i) => (
                                                    <span key={i} className="px-4 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-xl text-[14px] font-black border border-primary-100 dark:border-primary-800 shadow-sm">
                                                        {m}
                                                    </span>
                                                ))
                                            ) : (
                                                <p className="text-sm italic text-base-300">No capabilities defined.</p>
                                            )}
                                        </div>
                                    </section>

                                    <section className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                                            <h4 className="text-xs font-black uppercase tracking-[0.4em] text-base-400">Operational Intelligence</h4>
                                        </div>
                                        <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-8 rounded-[2.5rem] border-2 border-indigo-100 dark:border-indigo-800 shadow-inner">
                                            <p className="text-[18px] font-black text-indigo-955 dark:text-indigo-100 leading-relaxed italic">
                                                {selectedEquip.details || "Ready for deployment. No special instructions recorded."}
                                            </p>
                                        </div>
                                    </section>
                                    
                                    <div className="pt-6 border-t border-base-100 dark:border-base-800 opacity-50">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-base-400">
                                            <RefreshIcon className="h-4 w-4" /> 
                                            Sync: {new Date(selectedEquip.lastUpdated).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: History Log */}
                                <div className="lg:col-span-2 space-y-4">
                                    <div className="flex justify-between items-center border-b-2 border-base-100 dark:border-base-800 pb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-6 bg-emerald-600 rounded-full"></div>
                                            <h4 className="text-xs font-black uppercase tracking-[0.4em] text-base-400">Maintenance Asset Log</h4>
                                        </div>
                                        <button 
                                            onClick={() => handleOpenHistoryForm({}, selectedEquip)}
                                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg hover:brightness-110 transition-all flex items-center gap-2"
                                        >
                                            <PlusIcon className="h-4 w-4" /> Log Record
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {selectedEquip.history && selectedEquip.history.length > 0 ? (
                                            selectedEquip.history.map((log) => (
                                                <div key={log.id} className="p-8 bg-white dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-[2.5rem] shadow-md hover:border-primary-400 transition-all group/log relative">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
                                                                <CalendarIcon className="h-5 w-5 text-indigo-600" />
                                                            </div>
                                                            <span className="text-[18px] font-black text-indigo-800 dark:text-indigo-400 tracking-tight">{log.date}</span>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-[11px] font-black text-base-500 bg-base-100 dark:bg-base-800 px-4 py-2 rounded-xl uppercase tracking-widest border border-base-200 dark:border-base-700">{log.technician}</span>
                                                            <div className="flex gap-2">
                                                                <button onClick={(e) => handleEditHistoryEntry(e, log)} className="p-2.5 text-base-300 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all" title="Edit Log"><PencilIcon className="h-5 w-5"/></button>
                                                                <button onClick={(e) => { e.stopPropagation(); setHistoryToDelete({ equip: selectedEquip, entryId: log.id }); setIsDeleteHistoryModalOpen(true); }} className="p-2.5 text-base-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Delete Log"><TrashIcon className="h-5 w-5"/></button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-[18px] font-bold text-base-900 dark:text-base-100 leading-snug mb-6 pl-1">
                                                        {log.description}
                                                    </p>
                                                    {log.partsReplaced && (
                                                        <div className="flex gap-4 items-center bg-amber-50 dark:bg-amber-900/20 p-5 rounded-[1.8rem] border border-amber-100 dark:border-amber-800/50">
                                                            <CogIcon className="h-6 w-6 text-amber-600" />
                                                            <span className="text-[14px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-[0.1em]">Replaced Components: <span className="text-amber-955 dark:text-amber-50 underline decoration-2 decoration-amber-300 underline-offset-4 ml-2">{log.partsReplaced}</span></span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="py-24 text-center bg-base-50/30 dark:bg-base-800/20 rounded-[3rem] border-4 border-dashed border-base-100 dark:border-base-800">
                                                <CogIcon className="h-16 w-16 text-base-200 mx-auto mb-6" />
                                                <p className="text-[15px] font-black uppercase tracking-[0.3em] text-base-300">Clean History - No events recorded.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal - Asset Config */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[120] p-4 animate-fade-in" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20" onClick={e => e.stopPropagation()}>
                        <form onSubmit={handleSave}>
                            <div className="p-8 border-b border-base-100 dark:border-base-800 bg-base-50/50 dark:bg-base-800/30 flex justify-between items-center">
                                <div>
                                    <h3 className="text-2xl font-black text-base-955 dark:text-white tracking-tighter">Registry</h3>
                                    <p className="text-[9px] font-bold text-base-400 uppercase tracking-widest mt-1">Instrument Configuration</p>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-base-100 dark:hover:bg-base-800 rounded-xl"><XCircleIcon className="h-6 w-6 text-base-300"/></button>
                            </div>

                            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Equipment Name</label>
                                        <input required list="group-options" type="text" value={editingEquip?.group || ''} onChange={e => setEditingEquip({...editingEquip, group: e.target.value.toUpperCase()})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-xs focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 dark:text-white transition-all" placeholder="E.G. HPLC"/>
                                        <datalist id="group-options">{groups.map(g => <option key={g} value={g} />)}</datalist>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Asset ID / Name</label>
                                        <input required type="text" value={editingEquip?.name || ''} onChange={e => setEditingEquip({...editingEquip, name: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-xs focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 dark:text-white transition-all" placeholder="E.G. AGILENT-01"/>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Health Status</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {(['ready', 'issue', 'maintenance'] as const).map(s => (
                                            <button key={s} type="button" onClick={() => setEditingEquip({...editingEquip, status: s})} className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${editingEquip?.status === s ? `${getStatusStyles(s).bg} text-white border-transparent shadow-lg` : 'bg-white dark:bg-base-800 text-base-400 border-base-100 dark:border-base-800'}`}>{s}</button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Capabilities (Comma separated)</label>
                                    <input type="text" value={methodsInput} onChange={e => setMethodsInput(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-bold text-xs dark:text-white" placeholder="Method A, Method B..."/>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Operational Instructions</label>
                                    <textarea value={editingEquip?.details || ''} onChange={e => setEditingEquip({...editingEquip, details: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-bold text-sm dark:text-white h-32 resize-none" placeholder="Enter special instructions for analysts..."/>
                                </div>
                            </div>

                            <div className="p-8 border-t border-base-100 dark:border-base-800 flex gap-3 bg-base-50/30">
                                <button type="submit" className="flex-1 py-4 bg-primary-600 text-white font-black rounded-2xl shadow-lg hover:brightness-110 uppercase text-[10px] tracking-widest transition-all">Update Asset</button>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-4 text-[10px] font-black text-base-400 uppercase tracking-widest">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* History Entry Modal */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[130] p-4 animate-fade-in" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-base-100 dark:border-base-800 bg-indigo-50/50 dark:bg-indigo-900/20 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-indigo-900 dark:text-indigo-100 tracking-tighter">
                                    {editingHistoryId ? 'Edit Maintenance Log' : 'Log Maintenance'}
                                </h3>
                                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-1">Record repair or parts replacement</p>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-base-100 dark:hover:bg-base-800 rounded-xl"><XCircleIcon className="h-6 w-6 text-base-300"/></button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Service Date</label>
                                <div className="relative">
                                    <input type="date" value={newHistory.date} onChange={e => setNewHistory({...newHistory, date: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[15px] dark:text-white shadow-inner transition-all" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Technician / Inspector</label>
                                <input type="text" value={newHistory.technician} onChange={e => setNewHistory({...newHistory, technician: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[15px] dark:text-white shadow-inner transition-all" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Service Description</label>
                                <textarea required value={newHistory.description} onChange={e => setNewHistory({...newHistory, description: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[16px] dark:text-white h-32 resize-none shadow-inner transition-all" placeholder="What was done?" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Parts Replaced (Optional)</label>
                                <input type="text" value={newHistory.partsReplaced} onChange={e => setNewHistory({...newHistory, partsReplaced: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[15px] dark:text-white shadow-inner transition-all" placeholder="e.g. Filter, Lamp, Tubing" />
                            </div>
                        </div>

                        <div className="p-8 border-t border-base-100 dark:border-base-800 flex gap-3 bg-base-50/30">
                            <button onClick={handleAddOrEditHistory} className="flex-1 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:brightness-110 uppercase text-[11px] tracking-widest transition-all">
                                {editingHistoryId ? 'Update Record' : 'Commit Log'}
                            </button>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="px-6 py-5 text-[11px] font-black text-base-400 uppercase tracking-widest">Discard</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Asset Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-base-900/95 backdrop-blur-2xl flex items-center justify-center z-[150] p-4 animate-fade-in" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-sm:max-w-[320px] max-w-sm overflow-hidden p-10 text-center space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto text-red-600"><AlertTriangleIcon className="h-8 w-8" /></div>
                        <div>
                            <h3 className="text-xl font-black text-base-955 dark:text-white uppercase">Wipe Asset?</h3>
                            <p className="text-base-400 mt-2 text-xs font-bold leading-relaxed">This record and all its maintenance history will be permanently erased.</p>
                        </div>
                        <div className="flex flex-col gap-2 pt-2">
                            <button onClick={handleDeleteConfirm} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl hover:bg-red-700 uppercase text-[10px] tracking-widest">Confirm Deletion</button>
                            <button onClick={() => setIsDeleteModalOpen(false)} className="w-full py-3 text-[10px] font-black text-base-400 uppercase tracking-widest">Keep It</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Individual Log Entry Delete Confirmation Modal */}
            {isDeleteHistoryModalOpen && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[150] p-4 animate-fade-in" onClick={() => setIsDeleteHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden p-10 text-center space-y-8 border border-white/20" onClick={e => e.stopPropagation()}>
                        <div className="w-20 h-20 bg-orange-50 dark:bg-orange-900/20 rounded-[2rem] flex items-center justify-center mx-auto text-orange-600 shadow-inner">
                            <TrashIcon className="h-10 w-10" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter leading-none">Delete Log Entry?</h3>
                            <p className="text-base-500 mt-4 text-[14px] font-bold leading-relaxed">Are you sure you want to remove this maintenance record? This action cannot be reversed.</p>
                        </div>
                        <div className="flex flex-col gap-3 pt-4">
                            <button onClick={confirmDeleteHistory} className="w-full py-5 bg-orange-600 text-white font-black rounded-2xl shadow-xl hover:bg-orange-700 uppercase text-[11px] tracking-widest border-b-4 border-orange-800">Confirm Deletion</button>
                            <button onClick={() => setIsDeleteHistoryModalOpen(false)} className="w-full py-3 text-[11px] font-black text-base-400 uppercase tracking-widest">Discard Action</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EquipmentTab;
