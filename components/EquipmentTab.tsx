
import React, { useState, useEffect, useMemo } from 'react';
import type { Equipment } from '../types';
import { getEquipments, saveEquipment, deleteEquipment } from '../services/dataService';
import { 
    PlusIcon, TrashIcon, PencilIcon, CheckCircleIcon, 
    AlertTriangleIcon, CogIcon, RefreshIcon, XCircleIcon,
    ChatBubbleLeftEllipsisIcon, BeakerIcon, UserGroupIcon
} from './common/Icons';

const EquipmentTab: React.FC = () => {
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [editingEquip, setEditingEquip] = useState<Partial<Equipment> | null>(null);
    const [methodsInput, setMethodsInput] = useState('');
    const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);

    // Filter States
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterGroup, setFilterGroup] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await getEquipments();
            setEquipments(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Derived Data
    const groups = useMemo(() => {
        const g = new Set<string>();
        equipments.forEach(e => { if (e.group) g.add(e.group); });
        return Array.from(g).sort();
    }, [equipments]);

    const filteredEquipments = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return equipments.filter(e => {
            const matchesStatus = filterStatus === 'all' || e.status === filterStatus;
            const matchesGroup = filterGroup === 'all' || e.group === filterGroup;
            const matchesSearch = !searchTerm || 
                                 (e.name || '').toLowerCase().includes(lowerSearch) || 
                                 (e.group || '').toLowerCase().includes(lowerSearch) ||
                                 (e.methods || []).some(m => m.toLowerCase().includes(lowerSearch));
            return matchesStatus && matchesGroup && matchesSearch;
        }).sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.name || '').localeCompare(b.name || ''));
    }, [equipments, filterStatus, filterGroup, searchTerm]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEquip?.name || !editingEquip?.group) return;

        const methodsArray = methodsInput
            .split(',')
            .map(m => m.trim())
            .filter(m => m !== '');

        const payload: Omit<Equipment, 'id'> & { id?: string } = {
            id: editingEquip.id,
            name: editingEquip.name,
            group: editingEquip.group.toUpperCase(), // Normalize group names
            status: editingEquip.status || 'ready',
            actionStatus: 'none',
            details: editingEquip.details || '',
            methods: methodsArray,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'Admin'
        };

        await saveEquipment(payload);
        setIsModalOpen(false);
        fetchData();
    };

    const handleEditStart = (equip: Equipment) => {
        setEditingEquip(equip);
        setMethodsInput(equip.methods?.join(', ') || '');
        setIsModalOpen(true);
    };

    const handleAddNewStart = () => {
        setEditingEquip({ status: 'ready', actionStatus: 'none', group: filterGroup !== 'all' ? filterGroup : '' });
        setMethodsInput('');
        setIsModalOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (targetDeleteId) {
            await deleteEquipment(targetDeleteId);
            setTargetDeleteId(null);
            setIsDeleteModalOpen(false);
            setIsModalOpen(false);
            fetchData();
        }
    };

    const initiateDelete = (id: string) => {
        setTargetDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const getStatusStyles = (status: Equipment['status']) => {
        switch (status) {
            case 'ready': return {
                bg: 'bg-emerald-500',
                lightBg: 'bg-emerald-50 dark:bg-emerald-950/20',
                text: 'text-white',
                border: 'border-emerald-100 dark:border-emerald-900/30',
                accent: 'text-emerald-600 dark:text-emerald-400'
            };
            case 'issue': return {
                bg: 'bg-red-600',
                lightBg: 'bg-red-50 dark:bg-red-950/20',
                text: 'text-white',
                border: 'border-red-100 dark:border-red-900/30',
                accent: 'text-red-600 dark:text-red-400'
            };
            case 'maintenance': return {
                bg: 'bg-amber-500',
                lightBg: 'bg-amber-50 dark:bg-amber-955/20',
                text: 'text-white',
                border: 'border-amber-100 dark:border-amber-900/30',
                accent: 'text-amber-600 dark:text-amber-400'
            };
            default: return {
                bg: 'bg-base-200',
                lightBg: 'bg-base-50',
                text: 'text-base-500',
                border: 'border-base-100',
                accent: 'text-base-400'
            };
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6 p-10 animate-slide-in-up bg-base-50/30 dark:bg-transparent">
            {/* Header & Main Actions */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="space-y-1">
                    <h2 className="text-4xl font-black text-base-955 dark:text-base-50 tracking-tighter uppercase leading-none">Inventory Control</h2>
                    <p className="text-base-400 font-bold uppercase tracking-[0.2em] text-[10px]">Monitoring Laboratory Assets & Operational Reliability</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-grow lg:flex-none lg:w-80">
                        <input 
                            type="text" 
                            placeholder="Search asset, group or method..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-base-900 border-2 border-base-100 dark:border-base-800 rounded-2xl outline-none font-bold text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all shadow-sm"
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-base-300">
                            <CogIcon className="h-5 w-5" />
                        </div>
                    </div>
                    <button 
                        onClick={handleAddNewStart}
                        className="flex items-center gap-3 px-8 py-4 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[12px] shadow-2xl shadow-primary-500/30 hover:brightness-110 active:scale-95 transition-all border-b-4 border-primary-800"
                    >
                        <PlusIcon className="h-5 w-5" /> Add Asset
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-4 bg-white/60 dark:bg-base-900/60 backdrop-blur-md p-4 rounded-[2rem] border border-white dark:border-base-800 shadow-xl overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-3 pr-4 border-r border-base-200 dark:border-base-800">
                    <span className="text-[10px] font-black uppercase tracking-widest text-base-400">Status:</span>
                    <div className="flex gap-1.5">
                        {['all', 'ready', 'issue', 'maintenance'].map(s => (
                            <button 
                                key={s} 
                                onClick={() => setFilterStatus(s)}
                                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === s ? 'bg-primary-600 text-white shadow-lg' : 'bg-white dark:bg-base-800 text-base-500 border border-base-100 dark:border-base-700 hover:border-primary-400'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3 pl-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-base-400">Group:</span>
                    <div className="flex gap-1.5">
                        <button 
                            onClick={() => setFilterGroup('all')}
                            className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterGroup === 'all' ? 'bg-primary-600 text-white shadow-lg' : 'bg-white dark:bg-base-800 text-base-500 border border-base-100 dark:border-base-700 hover:border-primary-400'}`}
                        >
                            All Groups
                        </button>
                        {groups.map(g => (
                            <button 
                                key={g} 
                                onClick={() => setFilterGroup(g)}
                                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterGroup === g ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-base-800 text-base-500 border border-base-100 dark:border-base-700 hover:border-primary-400'}`}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Asset Grid */}
            {isLoading ? (
                <div className="flex-grow flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <RefreshIcon className="h-12 w-12 animate-spin text-primary-200" />
                        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-base-300">Syncing Assets...</span>
                    </div>
                </div>
            ) : (
                <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar pb-20 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
                        {filteredEquipments.map(equip => {
                            const style = getStatusStyles(equip.status);
                            return (
                                <div key={equip.id} className="bg-white dark:bg-base-900 rounded-[3rem] border-2 border-base-100 dark:border-base-800 shadow-xl hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] transition-all relative group overflow-hidden flex flex-col h-full hover:-translate-y-2">
                                    {/* Header / Status Banner */}
                                    <div className={`${style.bg} px-8 py-4 flex justify-between items-center relative overflow-hidden shrink-0`}>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-xl"></div>
                                        <div className="flex flex-col z-10">
                                            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/60 leading-none mb-1">Status</span>
                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white z-10 leading-none">{equip.status}</span>
                                        </div>
                                        <div className="flex gap-2 z-10">
                                            <button onClick={() => handleEditStart(equip)} className="p-2 bg-white/20 hover:bg-white/40 rounded-xl transition-all text-white"><PencilIcon className="h-4 w-4"/></button>
                                            <button onClick={() => initiateDelete(equip.id)} className="p-2 bg-white/20 hover:bg-red-500 rounded-xl transition-all text-white"><TrashIcon className="h-4 w-4"/></button>
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div className="p-8 flex-grow flex flex-col space-y-6">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-indigo-100 dark:border-indigo-800/50">
                                                    {equip.group || 'UNGROUPED'}
                                                </div>
                                            </div>
                                            <h3 className="text-3xl font-black text-base-950 dark:text-white tracking-tighter leading-tight uppercase min-h-[4rem] line-clamp-2">
                                                {equip.name || 'UNNAMED ASSET'}
                                            </h3>
                                        </div>

                                        {/* Capabilities / Methods Registry */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <BeakerIcon className="h-4 w-4 text-primary-500" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-400">Supported Methods</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {equip.methods && equip.methods.length > 0 ? (
                                                    equip.methods.map((method, mIdx) => (
                                                        <span key={mIdx} className="px-3 py-1.5 bg-primary-50 dark:bg-primary-955/50 border border-primary-100 dark:border-primary-800 rounded-xl text-[11px] font-black text-primary-700 dark:text-primary-400 shadow-sm uppercase tracking-tighter">
                                                            {method}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-[10px] font-bold text-base-300 italic">No methods registered</span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Operational Note Box */}
                                        <div className={`flex-grow p-7 rounded-[2.5rem] relative transition-all border-2 ${equip.details ? 'bg-base-50 dark:bg-base-800/80 border-base-100 dark:border-base-700 shadow-inner' : 'bg-base-50/30 dark:bg-base-800/30 border-dashed border-base-200 dark:border-base-800'}`}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <ChatBubbleLeftEllipsisIcon className={`h-4 w-4 ${equip.details ? 'text-primary-500' : 'text-base-300'}`} />
                                                <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${equip.details ? 'text-primary-600 dark:text-primary-400' : 'text-base-300'}`}>
                                                    Operational Note
                                                </span>
                                            </div>
                                            <p className={`text-[16px] leading-relaxed font-black transition-all ${equip.details ? 'text-base-900 dark:text-white' : 'text-base-300 italic font-bold'}`}>
                                                {equip.details ? `${equip.details}` : "No special instructions registered."}
                                            </p>
                                        </div>

                                        {/* Footer Info */}
                                        <div className="pt-4 border-t border-base-100 dark:border-base-800 flex justify-between items-end">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-base-300 uppercase tracking-widest">Last Integrity Check</span>
                                                <span className="text-[13px] font-black text-base-800 dark:text-base-300">
                                                    {new Date(equip.lastUpdated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <div className="bg-base-100 dark:bg-base-800 p-2.5 rounded-xl">
                                                <CogIcon className="h-5 w-5 text-base-300" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filteredEquipments.length === 0 && !isLoading && (
                        <div className="py-40 text-center flex flex-col items-center gap-6 animate-fade-in">
                            <div className="p-8 bg-base-100 dark:bg-base-800 rounded-full">
                                <CogIcon className="h-16 w-16 text-base-200" />
                            </div>
                            <div className="space-y-2">
                                <p className="text-2xl font-black uppercase tracking-[0.4em] text-base-200">No Assets Found</p>
                                <p className="text-xs font-bold text-base-300 uppercase tracking-widest">Adjust filters or search term to locate your asset.</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Edit / Add Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-xl flex items-center justify-center z-[110] p-4 animate-fade-in" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden border border-white/20" onClick={e => e.stopPropagation()}>
                        <form onSubmit={handleSave}>
                            <div className="p-10 border-b border-base-100 dark:border-base-800 flex justify-between items-center bg-base-50/50 dark:bg-base-800/30">
                                <div>
                                    <h3 className="text-3xl font-black text-base-950 dark:text-white tracking-tighter leading-none">Asset Registry</h3>
                                    <p className="text-[10px] font-bold text-base-400 uppercase tracking-widest mt-2">Configure System Metadata & Capability</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {editingEquip?.id && (
                                        <button 
                                            type="button" 
                                            onClick={() => initiateDelete(editingEquip.id!)} 
                                            className="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl transition-all shadow-sm"
                                            title="Delete Asset"
                                        >
                                            <TrashIcon className="h-5 w-5"/>
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-base-100 dark:hover:bg-base-800 rounded-2xl transition-all"><XCircleIcon className="h-7 w-7 text-base-300"/></button>
                                </div>
                            </div>

                            <div className="p-10 space-y-8 overflow-y-auto max-h-[60vh] custom-scrollbar">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.3em] ml-4 block">Asset Group</label>
                                        <input 
                                            required
                                            list="group-options"
                                            type="text" 
                                            value={editingEquip?.group || ''} 
                                            onChange={e => setEditingEquip({...editingEquip, group: e.target.value.toUpperCase()})}
                                            className="w-full p-6 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[2rem] outline-none font-black text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 dark:text-white transition-all uppercase"
                                            placeholder="e.g. DSC"
                                        />
                                        <datalist id="group-options">
                                            {groups.map(g => <option key={g} value={g} />)}
                                        </datalist>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.3em] ml-4 block">Instrument Identifier</label>
                                        <input 
                                            required
                                            type="text" 
                                            value={editingEquip?.name || ''} 
                                            onChange={e => setEditingEquip({...editingEquip, name: e.target.value})}
                                            className="w-full p-6 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[2rem] outline-none font-black text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 dark:text-white transition-all uppercase"
                                            placeholder="e.g. Q2000-A"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.3em] ml-4 block">Operation Health Status</label>
                                    <div className="grid grid-cols-3 gap-4">
                                        {(['ready', 'issue', 'maintenance'] as const).map(s => {
                                            const st = getStatusStyles(s);
                                            const isActive = editingEquip?.status === s;
                                            return (
                                                <button 
                                                    key={s}
                                                    type="button"
                                                    onClick={() => setEditingEquip({...editingEquip, status: s})}
                                                    className={`py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.2em] border-2 transition-all flex flex-col items-center gap-2 ${isActive ? `${st.bg} ${st.text} border-transparent shadow-xl` : 'bg-white dark:bg-base-800 border-base-100 dark:border-base-700 text-base-400 hover:border-primary-400'}`}
                                                >
                                                    {s === 'ready' && <CheckCircleIcon className="h-5 w-5"/>}
                                                    {s === 'issue' && <AlertTriangleIcon className="h-5 w-5"/>}
                                                    {s === 'maintenance' && <CogIcon className="h-5 w-5"/>}
                                                    {s}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.3em] ml-4 block">Method Registry</label>
                                    <input 
                                        type="text" 
                                        value={methodsInput} 
                                        onChange={e => setMethodsInput(e.target.value)}
                                        className="w-full p-6 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[2rem] outline-none font-bold text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 dark:text-white transition-all"
                                        placeholder="DSC, TGA, Melting Point... (Comma separated)"
                                    />
                                    <p className="text-[9px] font-bold text-base-400 ml-6 uppercase tracking-widest italic opacity-60">Delimit methods using commas.</p>
                                </div>

                                <div className="space-y-3 pb-4">
                                    <label className="text-[10px] font-black text-base-400 uppercase tracking-[0.3em] ml-4 block">Operational Remark</label>
                                    <textarea 
                                        value={editingEquip?.details || ''} 
                                        onChange={e => setEditingEquip({...editingEquip, details: e.target.value})}
                                        className="w-full p-6 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-[2.5rem] outline-none font-bold text-sm dark:text-white h-48 resize-none focus:ring-4 focus:ring-primary-500/10 transition-all"
                                        placeholder="Document system anomalies, service history, or specific calibration requirements..."
                                    />
                                </div>
                            </div>

                            <div className="p-10 border-t border-base-100 dark:border-base-800 flex gap-4 bg-base-50/30">
                                <button type="submit" className="flex-1 py-5 bg-primary-600 text-white font-black rounded-[2rem] shadow-2xl hover:brightness-110 uppercase tracking-[0.2em] text-[12px] border-b-4 border-primary-800 transition-all">Commit Configuration</button>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-5 text-[12px] font-black text-base-400 uppercase tracking-widest hover:text-base-800 transition-colors">Abort</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-base-900/95 backdrop-blur-2xl flex items-center justify-center z-[120] p-4 animate-fade-in" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[3.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-red-200 dark:border-red-900/30 p-12 text-center space-y-8" onClick={e => e.stopPropagation()}>
                        <div className="w-24 h-24 bg-red-50 dark:bg-red-900/20 rounded-[2.5rem] flex items-center justify-center mx-auto text-red-600 shadow-inner">
                            <AlertTriangleIcon className="h-12 w-12" />
                        </div>
                        <div>
                            <h3 className="text-3xl font-black text-base-955 dark:text-white tracking-tighter uppercase leading-none">Wipe Asset Record?</h3>
                            <p className="text-base-500 mt-6 font-bold leading-relaxed text-sm">Permanent deletion of this instrument metadata will occur. Historical operational context will be unrecoverable.</p>
                        </div>
                        <div className="flex flex-col gap-3 pt-4">
                            <button 
                                onClick={handleDeleteConfirm} 
                                className="w-full py-5 bg-red-600 text-white font-black rounded-[1.8rem] shadow-2xl hover:bg-red-700 transition-all uppercase tracking-[0.2em] text-[12px] border-b-4 border-red-800"
                            >
                                Confirm Permanent Deletion
                            </button>
                            <button 
                                onClick={() => setIsDeleteModalOpen(false)} 
                                className="w-full py-4 text-[11px] font-black text-base-400 hover:text-base-800 dark:hover:text-white uppercase tracking-widest transition-colors"
                            >
                                Preserve Record
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EquipmentTab;
