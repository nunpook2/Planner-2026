
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
                                 (e.group || '').toLowerCase().includes(lowerSearch);
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
        setNewHistory({ date: new Date().toISOString().split('T')[0], description: '', partsReplaced: '', technician: 'Admin' });
        fetchData();
    };

    const handleEditStart = (e: React.MouseEvent, equip: Equipment) => {
        e.stopPropagation();
        setEditingEquip(equip);
        setMethodsInput(equip.methods?.join(', ') || '');
        setIsModalOpen(true);
    };

    const handleOpenHistoryForm = (e: any, equip: Equipment) => {
        if (e.stopPropagation) e.stopPropagation();
        setEditingHistoryId(null);
        setNewHistory({ date: new Date().toISOString().split('T')[0], description: '', partsReplaced: '', technician: 'Admin' });
        setIsHistoryModalOpen(true);
    };

    const handleEditHistoryEntry = (e: React.MouseEvent, entry: EquipmentHistory) => {
        e.stopPropagation();
        setEditingHistoryId(entry.id);
        setNewHistory({ date: entry.date, description: entry.description, partsReplaced: entry.partsReplaced || '', technician: entry.technician });
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

    const getStatusTheme = (status: Equipment['status']) => {
        switch (status) {
            case 'ready': return { color: 'emerald', ring: 'border-emerald-500 shadow-emerald-500/30', glow: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', orbBg: 'bg-emerald-50 dark:bg-emerald-950/20' };
            case 'issue': return { color: 'red', ring: 'border-red-500 shadow-red-500/30', glow: 'bg-red-500', text: 'text-red-600 dark:text-red-400', orbBg: 'bg-red-50 dark:bg-red-950/20' };
            case 'maintenance': return { color: 'amber', ring: 'border-amber-500 shadow-amber-500/30', glow: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', orbBg: 'bg-amber-50 dark:bg-amber-955/20' };
            default: return { color: 'base', ring: 'border-base-300', glow: 'bg-base-300', text: 'text-base-400', orbBg: 'bg-base-50' };
        }
    };

    const handleOpenDetails = (equip: Equipment) => {
        setSelectedEquip(equip);
        setIsDetailModalOpen(true);
    };

    const getOrbFontClass = (text: string) => {
        const len = text.length;
        if (len <= 4) return 'text-[28px] md:text-[32px]';
        if (len <= 7) return 'text-[20px] md:text-[24px]';
        if (len <= 10) return 'text-[16px] md:text-[18px]';
        if (len <= 15) return 'text-[13px] md:text-[14px] leading-[1.1]';
        return 'text-[10px] md:text-[11px] leading-tight';
    };

    return (
        <div className="h-full flex flex-col space-y-6 p-6 animate-fade-in bg-base-50/20 dark:bg-transparent overflow-hidden">
            <style>{`
                @keyframes orb-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                    70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
                .orb-pulse-ready { animation: orb-pulse 3s infinite; }
                .orb-pulse-maintenance { animation: orb-pulse 3s infinite; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
                .orb-pulse-issue { animation: orb-pulse 1.5s infinite; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
            `}</style>

            {/* Header Area */}
            <div className="flex flex-col lg:flex-row justify-between items-end lg:items-center gap-4 shrink-0">
                <div>
                    <h2 className="text-4xl font-black text-base-955 dark:text-base-50 tracking-tighter uppercase leading-none">Fleet Control</h2>
                    <p className="text-base-400 font-black uppercase tracking-[0.4em] text-[10px] mt-2">Instrument Intelligence & Asset Logistics</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-grow lg:w-72 group">
                        <input 
                            type="text" 
                            placeholder="Locate asset..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-base-900 border-2 border-base-100 dark:border-base-800 rounded-[2rem] outline-none font-black text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all shadow-xl shadow-base-200/50 dark:shadow-none"
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-base-300 group-focus-within:text-primary-500 transition-colors"><BeakerIcon className="h-5 w-5" /></div>
                    </div>
                    <button 
                        onClick={handleAddNewStart}
                        className="flex items-center gap-3 px-8 py-4 bg-primary-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] shadow-2xl hover:bg-primary-700 hover:scale-105 active:scale-95 transition-all border-b-4 border-primary-800"
                    >
                        <PlusIcon className="h-5 w-5" /> Deploy New Asset
                    </button>
                </div>
            </div>

            {/* Filter Pill Bar */}
            <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-base-900/50 backdrop-blur-md rounded-[2.5rem] border border-white dark:border-base-800 shadow-sm shrink-0 w-fit">
                {['all', 'ready', 'issue', 'maintenance'].map(s => (
                    <button 
                        key={s} 
                        onClick={() => setFilterStatus(s)} 
                        className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === s ? 'bg-primary-600 text-white shadow-lg' : 'text-base-500 hover:bg-white dark:hover:bg-base-800'}`}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Scientific Orb Grid */}
            {isLoading ? (
                <div className="flex-grow flex items-center justify-center"><RefreshIcon className="h-14 w-14 animate-spin text-primary-200" /></div>
            ) : (
                <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar pb-10">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-x-6 gap-y-10 py-6">
                        {filteredEquipments.map(equip => {
                            const theme = getStatusTheme(equip.status);
                            return (
                                <div 
                                    key={equip.id} 
                                    onClick={() => handleOpenDetails(equip)}
                                    className="flex flex-col items-center group cursor-pointer animate-fade-in"
                                >
                                    {/* The Orb */}
                                    <div className={`relative w-32 h-32 md:w-36 md:h-36 rounded-full border-4 ${theme.ring} flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-active:scale-95 shadow-lg ${equip.status === 'ready' ? 'orb-pulse-ready' : equip.status === 'maintenance' ? 'orb-pulse-maintenance' : 'orb-pulse-issue'} bg-white dark:bg-base-900`}>
                                        <div className={`absolute inset-1 rounded-full ${theme.orbBg} backdrop-blur-sm flex items-center justify-center overflow-hidden p-3`}>
                                            <span className={`${getOrbFontClass(equip.group)} font-black text-base-955 dark:text-white tracking-tighter text-center uppercase break-words`}>
                                                {equip.group}
                                            </span>
                                        </div>
                                        <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full border-4 border-white dark:border-base-900 ${theme.glow} shadow-lg`}></div>
                                    </div>
                                    <div className="mt-5 text-center space-y-1">
                                        <h3 className="text-[14px] font-black text-base-950 dark:text-base-50 uppercase tracking-tighter group-hover:text-primary-600 transition-colors px-2">
                                            {equip.name}
                                        </h3>
                                        <div className="flex items-center justify-center gap-1.5">
                                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${theme.text}`}>{equip.status}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div 
                            onClick={handleAddNewStart}
                            className="flex flex-col items-center group cursor-pointer opacity-40 hover:opacity-100 transition-all"
                        >
                            <div className="w-32 h-32 md:w-36 md:h-36 rounded-full border-4 border-dashed border-base-200 dark:border-base-700 flex items-center justify-center group-hover:border-primary-500 group-hover:bg-primary-50/10">
                                <PlusIcon className="h-10 w-10 text-base-300 group-hover:text-primary-500" />
                            </div>
                            <span className="mt-4 text-[10px] font-black text-base-300 uppercase tracking-widest group-hover:text-primary-500">Initialize</span>
                        </div>
                    </div>
                </div>
            )}

            {/* DETAIL MODAL */}
            {isDetailModalOpen && selectedEquip && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[105] p-4 animate-fade-in" onClick={() => setIsDetailModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-white/20 flex flex-col animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-8 border-b-4 border-base-50 dark:border-base-800 bg-base-50/50 dark:bg-base-800/30 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-6">
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl border-4 ${getStatusTheme(selectedEquip.status).ring} bg-white dark:bg-base-900 overflow-hidden p-2`}>
                                    <span className={`${getOrbFontClass(selectedEquip.group)} font-black text-base-955 dark:text-white uppercase text-center`}>{selectedEquip.group}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-4xl font-black text-base-955 dark:text-white tracking-tighter uppercase leading-none">{selectedEquip.group}</h3>
                                        <span className={`px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-md ${getStatusTheme(selectedEquip.status).glow}`}>
                                            {selectedEquip.status}
                                        </span>
                                    </div>
                                    <p className="text-sm font-black text-base-400 uppercase tracking-[0.3em] mt-2">Asset Identifier: <span className="text-primary-600">{selectedEquip.name}</span></p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={(e) => handleEditStart(e, selectedEquip)} className="p-4 bg-white dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl text-base-500 hover:text-primary-600 shadow-sm transition-all"><PencilIcon className="h-6 w-6"/></button>
                                <button onClick={(e) => initiateDelete(e, selectedEquip.id)} className="p-4 bg-white dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl text-base-500 hover:text-red-600 shadow-sm transition-all"><TrashIcon className="h-6 w-6"/></button>
                                <button onClick={() => setIsDetailModalOpen(false)} className="p-4 bg-white dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl text-base-500 hover:bg-base-50 transition-all ml-4"><XCircleIcon className="h-6 w-6"/></button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-grow overflow-y-auto p-10 space-y-12 custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                                <div className="lg:col-span-1 space-y-10">
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-3"><div className="w-1.5 h-6 bg-primary-600 rounded-full"></div><h4 className="text-xs font-black uppercase tracking-[0.4em] text-base-400">Capabilities</h4></div>
                                        <div className="flex flex-wrap gap-2.5">
                                            {selectedEquip.methods && selectedEquip.methods.length > 0 ? selectedEquip.methods.map((m, i) => (
                                                <span key={i} className="px-4 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-xl text-[14px] font-black border border-primary-100 dark:border-primary-800 shadow-sm">{m}</span>
                                            )) : <p className="text-sm italic text-base-300">No capabilities defined.</p>}
                                        </div>
                                    </section>
                                    
                                    {/* OPERATIONAL INTELLIGENCE - IMPROVED LIST VIEW */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-3"><div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div><h4 className="text-xs font-black uppercase tracking-[0.4em] text-base-400">Operational Intelligence</h4></div>
                                        <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-8 rounded-[2.5rem] border-2 border-indigo-100 dark:border-indigo-800 shadow-inner overflow-hidden">
                                            <div className="space-y-4">
                                                {selectedEquip.details ? (
                                                    selectedEquip.details.split('\n').filter(line => line.trim() !== '').map((item, idx) => (
                                                        <div key={idx} className="flex gap-4 items-start">
                                                            <div className="mt-2.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0 shadow-md shadow-indigo-400"></div>
                                                            <p className="text-[18px] font-black text-indigo-955 dark:text-indigo-100 leading-relaxed italic whitespace-pre-wrap">
                                                                {item.trim()}
                                                            </p>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-sm italic text-base-300">No instructions recorded.</p>
                                                )}
                                            </div>
                                        </div>
                                    </section>
                                </div>
                                <div className="lg:col-span-2 space-y-4">
                                    <div className="flex justify-between items-center border-b-2 border-base-100 dark:border-base-800 pb-4">
                                        <div className="flex items-center gap-3"><div className="w-1.5 h-6 bg-emerald-600 rounded-full"></div><h4 className="text-xs font-black uppercase tracking-[0.4em] text-base-400">Maintenance Asset Log</h4></div>
                                        <button onClick={() => handleOpenHistoryForm({}, selectedEquip)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg hover:brightness-110 transition-all flex items-center gap-2"><PlusIcon className="h-4 w-4" /> Log Record</button>
                                    </div>
                                    <div className="space-y-4">
                                        {selectedEquip.history && selectedEquip.history.length > 0 ? selectedEquip.history.map((log) => (
                                            <div key={log.id} className="p-8 bg-white dark:bg-base-955 border-2 border-base-100 dark:border-base-800 rounded-[2.5rem] shadow-md hover:border-primary-400 transition-all relative group/log">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-3"><div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl"><CalendarIcon className="h-5 w-5 text-indigo-600" /></div><span className="text-[18px] font-black text-indigo-800 dark:text-indigo-400 tracking-tight">{log.date}</span></div>
                                                    <div className="flex items-center gap-4"><span className="text-[11px] font-black text-base-500 bg-base-100 dark:bg-base-800 px-4 py-2 rounded-xl uppercase tracking-widest">{log.technician}</span>
                                                        <div className="flex gap-2">
                                                            <button onClick={(e) => handleEditHistoryEntry(e, log)} className="p-2.5 text-base-300 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"><PencilIcon className="h-5 w-5"/></button>
                                                            <button onClick={(e) => { e.stopPropagation(); setHistoryToDelete({ equip: selectedEquip, entryId: log.id }); setIsDeleteHistoryModalOpen(true); }} className="p-2.5 text-base-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><TrashIcon className="h-5 w-5"/></button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-[18px] font-bold text-base-900 dark:text-base-100 leading-snug mb-6 pl-1">{log.description}</p>
                                                {log.partsReplaced && <div className="flex gap-4 items-center bg-amber-50 dark:bg-amber-900/20 p-5 rounded-[1.8rem] border border-amber-100 dark:border-amber-800/50"><CogIcon className="h-6 w-6 text-amber-600" /><span className="text-[14px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-[0.1em]">Replaced: <span className="text-amber-955 dark:text-amber-50 underline decoration-2 decoration-amber-300 underline-offset-4 ml-2">{log.partsReplaced}</span></span></div>}
                                            </div>
                                        )) : <div className="py-24 text-center bg-base-50/30 dark:bg-base-800/20 rounded-[3rem] border-4 border-dashed border-base-100 dark:border-base-800"><CogIcon className="h-16 w-16 text-base-200 mx-auto mb-6" /><p className="text-[15px] font-black uppercase tracking-[0.3em] text-base-300">Clean History - No events recorded.</p></div>}
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
                                <div><h3 className="text-2xl font-black text-base-955 dark:text-white tracking-tighter">Registry</h3><p className="text-[9px] font-bold text-base-400 uppercase tracking-widest mt-1">Instrument Configuration</p></div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-base-100 dark:hover:bg-base-800 rounded-xl"><XCircleIcon className="h-6 w-6 text-base-300"/></button>
                            </div>
                            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Equipment Group</label><input required list="group-options" type="text" value={editingEquip?.group || ''} onChange={e => setEditingEquip({...editingEquip, group: e.target.value.toUpperCase()})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-xs dark:text-white transition-all" placeholder="E.G. HPLC"/><datalist id="group-options">{groups.map(g => <option key={g} value={g} />)}</datalist></div>
                                    <div className="space-y-2"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Asset ID / Name</label><input required type="text" value={editingEquip?.name || ''} onChange={e => setEditingEquip({...editingEquip, name: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-xs dark:text-white transition-all" placeholder="E.G. AGILENT-01"/></div>
                                </div>
                                <div className="space-y-2"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Health Status</label><div className="grid grid-cols-3 gap-3">{(['ready', 'issue', 'maintenance'] as const).map(s => (<button key={s} type="button" onClick={() => setEditingEquip({...editingEquip, status: s})} className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${editingEquip?.status === s ? `bg-${getStatusTheme(s).color}-500 text-white border-transparent shadow-lg` : 'bg-white dark:bg-base-800 text-base-400 border-base-100 dark:border-base-800'}`}>{s}</button>))}</div></div>
                                <div className="space-y-2"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Capabilities</label><input type="text" value={methodsInput} onChange={e => setMethodsInput(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-bold text-xs dark:text-white" placeholder="Method A, Method B..."/></div>
                                <div className="space-y-2"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-3">Operational Instructions</label><textarea value={editingEquip?.details || ''} onChange={e => setEditingEquip({...editingEquip, details: e.target.value})} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-bold text-sm dark:text-white h-32 resize-none" placeholder="Enter instructions..."/></div>
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
                            <div><h3 className="text-xl font-black text-indigo-900 dark:text-indigo-100 tracking-tighter">{editingHistoryId ? 'Edit Maintenance Log' : 'Log Maintenance'}</h3><p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-1">Record repair or parts replacement</p></div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-base-100 dark:hover:bg-base-800 rounded-xl"><XCircleIcon className="h-6 w-6 text-base-300"/></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2"><label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Service Date</label><input type="date" value={newHistory.date} onChange={e => setNewHistory({...newHistory, date: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[15px] dark:text-white transition-all" /></div>
                            <div className="space-y-2"><label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Technician</label><input type="text" value={newHistory.technician} onChange={e => setNewHistory({...newHistory, technician: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[15px] dark:text-white transition-all" /></div>
                            <div className="space-y-2"><label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Description</label><textarea required value={newHistory.description} onChange={e => setNewHistory({...newHistory, description: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[16px] dark:text-white h-32 resize-none transition-all" placeholder="What was done?" /></div>
                            <div className="space-y-2"><label className="text-[10px] font-black text-base-400 uppercase tracking-[0.2em] ml-3">Parts Replaced</label><input type="text" value={newHistory.partsReplaced} onChange={e => setNewHistory({...newHistory, partsReplaced: e.target.value})} className="w-full p-5 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[1.5rem] outline-none font-black text-[15px] dark:text-white transition-all" placeholder="e.g. Filter, Lamp" /></div>
                        </div>
                        <div className="p-8 border-t border-base-100 dark:border-base-800 flex gap-3 bg-base-50/30">
                            <button onClick={handleAddOrEditHistory} className="flex-1 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:brightness-110 uppercase text-[11px] tracking-widest transition-all">{editingHistoryId ? 'Update Record' : 'Commit Log'}</button>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="px-6 py-5 text-[11px] font-black text-base-400 uppercase tracking-widest">Discard</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Individual Log Entry Delete Confirmation */}
            {isDeleteHistoryModalOpen && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[150] p-4 animate-fade-in" onClick={() => setIsDeleteHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden p-10 text-center space-y-8 border border-white/20" onClick={e => e.stopPropagation()}>
                        <div className="w-20 h-20 bg-orange-50 dark:bg-orange-900/20 rounded-[2rem] flex items-center justify-center mx-auto text-orange-600 shadow-inner"><TrashIcon className="h-10 w-10" /></div>
                        <div><h3 className="text-2xl font-black text-base-955 dark:text-white uppercase tracking-tighter leading-none">Delete Log Entry?</h3><p className="text-base-500 mt-4 text-[14px] font-bold leading-relaxed">Are you sure? This action cannot be reversed.</p></div>
                        <div className="flex flex-col gap-3 pt-4"><button onClick={confirmDeleteHistory} className="w-full py-5 bg-orange-600 text-white font-black rounded-2xl shadow-xl hover:bg-orange-700 uppercase text-[11px] tracking-widest border-b-4 border-orange-800">Confirm Deletion</button><button onClick={() => setIsDeleteHistoryModalOpen(false)} className="w-full py-3 text-[11px] font-black text-base-400 uppercase tracking-widest">Discard Action</button></div>
                    </div>
                </div>
            )}

            {/* Global Asset Delete Confirmation */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-base-900/95 backdrop-blur-2xl flex items-center justify-center z-[150] p-4 animate-fade-in" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-sm:max-w-[320px] max-w-sm overflow-hidden p-10 text-center space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto text-red-600"><AlertTriangleIcon className="h-8 w-8" /></div>
                        <div><h3 className="text-xl font-black text-base-955 dark:text-white uppercase">Wipe Asset?</h3><p className="text-base-400 mt-2 text-xs font-bold leading-relaxed">This record and all history will be permanently erased.</p></div>
                        <div className="flex flex-col gap-2 pt-2"><button onClick={handleDeleteConfirm} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl hover:bg-red-700 uppercase text-[10px] tracking-widest">Confirm Deletion</button><button onClick={() => setIsDeleteModalOpen(false)} className="w-full py-3 text-[10px] font-black text-base-400 uppercase tracking-widest">Keep It</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EquipmentTab;
