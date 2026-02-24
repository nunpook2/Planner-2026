
import React, { useState, useEffect, useMemo } from 'react';
import type { Equipment, EquipmentHistory, Tester, MaintenanceItem, EquipmentComponent } from '../types';
import { getEquipments, saveEquipment, deleteEquipment, batchImportEquipments } from '../services/dataService';
import { 
    PlusIcon, TrashIcon, PencilIcon, CheckCircleIcon, 
    AlertTriangleIcon, CogIcon, RefreshIcon, XCircleIcon,
    BeakerIcon, UserCircleIcon, SearchIcon, ClockIcon,
    CalendarIcon, ClipboardListIcon, UserGroupIcon, SparklesIcon,
    UploadIcon, DownloadIcon, BoxIcon, ChevronDownIcon, ArrowUturnLeftIcon
} from './common/Icons';

declare const XLSX: any;

// --- SHARED UTILS ---
const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const getStatusColor = (dueDate: string, status: string) => {
    if (status === 'done') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'scheduled') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(dueDate);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'bg-red-100 text-red-700 border-red-200 animate-pulse'; // Overdue
    if (diffDays <= 30) return 'bg-amber-100 text-amber-700 border-amber-200'; // Due Soon
    return 'bg-base-100 text-base-600 border-base-200'; // OK
};

const normalizeKeys = (obj: any) => {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
        newObj[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = obj[key];
    });
    return newObj;
};

const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
    return (
        <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl text-white font-medium flex items-center gap-3 animate-slide-in-up z-[250] ${isError ? 'bg-red-500' : 'bg-emerald-500'}`}>
            {isError ? <AlertTriangleIcon className="h-5 w-5"/> : <CheckCircleIcon className="h-5 w-5"/>}
            {message}
        </div>
    );
};

const ImportConfirmModal: React.FC<{
    isOpen: boolean;
    count: number;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ isOpen, count, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-sm flex items-center justify-center z-[250] animate-fade-in">
            <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-sm m-4 space-y-6 text-center border border-white/20" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <UploadIcon className="h-8 w-8" />
                </div>
                <div>
                    <h3 className="text-xl font-black text-base-900 dark:text-white">Import Assets?</h3>
                    <p className="text-sm font-bold text-base-500 mt-2">
                        Found <span className="text-indigo-600 font-black">{count}</span> records to import.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <button onClick={onConfirm} className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all uppercase text-[10px] tracking-widest">Confirm Import</button>
                    <button onClick={onCancel} className="w-full py-3 bg-transparent text-base-400 font-black rounded-xl hover:bg-base-50 dark:hover:bg-base-800 transition-all uppercase text-[10px] tracking-widest">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const MaintenanceFields: React.FC<{ data: any, onChange: (field: string, value: string) => void }> = ({ data, onChange }) => (
    <div className="grid grid-cols-2 gap-3 p-4 bg-base-50 dark:bg-base-800 rounded-2xl border border-base-200 dark:border-base-700 mt-2">
        <div className="col-span-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest border-b border-base-200 dark:border-base-600 pb-1 mb-1">PM Schedule</div>
        <input type="text" placeholder="PM By" value={data.pmBy || ''} onChange={e => onChange('pmBy', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 dark:bg-base-900 dark:border-base-600 dark:text-white" />
        <input type="text" placeholder="Freq (e.g. 1Y)" value={data.pmFreq || ''} onChange={e => onChange('pmFreq', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 dark:bg-base-900 dark:border-base-600 dark:text-white" />
        <input type="text" placeholder="PM Month" value={data.pmMonth || ''} onChange={e => onChange('pmMonth', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 col-span-2 dark:bg-base-900 dark:border-base-600 dark:text-white" />

        <div className="col-span-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest border-b border-base-200 dark:border-base-600 pb-1 mb-1 mt-2">Calibration Schedule</div>
        <input type="text" placeholder="Cal By" value={data.calBy || ''} onChange={e => onChange('calBy', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 dark:bg-base-900 dark:border-base-600 dark:text-white" />
        <input type="text" placeholder="Freq (e.g. 6M)" value={data.calFreq || ''} onChange={e => onChange('calFreq', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 dark:bg-base-900 dark:border-base-600 dark:text-white" />
        <input type="text" placeholder="Cal Month" value={data.calMonth || ''} onChange={e => onChange('calMonth', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 col-span-2 dark:bg-base-900 dark:border-base-600 dark:text-white" />

        <div className="col-span-2 text-[10px] font-black text-amber-500 uppercase tracking-widest border-b border-base-200 dark:border-base-600 pb-1 mb-1 mt-2">Vendor Information</div>
        <input type="text" placeholder="Vendor Name" value={data.vendor || ''} onChange={e => onChange('vendor', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 col-span-2 dark:bg-base-900 dark:border-base-600 dark:text-white" />
        <input type="text" placeholder="Contact Tel/Email" value={data.vendorTel || ''} onChange={e => onChange('vendorTel', e.target.value)} className="p-2 text-xs border rounded-lg outline-none focus:border-indigo-500 col-span-2 dark:bg-base-900 dark:border-base-600 dark:text-white" />
    </div>
);

// --- FULL PAGE DETAIL VIEW (INLINE EDITING) ---
const AssetDetailView: React.FC<{
    equip: Equipment;
    onBack: () => void;
    onDelete: () => void;
    onHistory: () => void;
    onSave: (updatedEquip: Equipment) => Promise<void>;
}> = ({ equip, onBack, onDelete, onHistory, onSave }) => {
    // editingId: 'primary' or index number for components
    const [editingId, setEditingId] = useState<'primary' | number | null>(null);
    const [tempData, setTempData] = useState<any>({});

    const startEdit = (id: 'primary' | number, data: any) => {
        setEditingId(id);
        setTempData({ ...data });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setTempData({});
    };

    const handleSaveRow = async () => {
        let newEquip = { ...equip };
        if (editingId === 'primary') {
            newEquip = { ...newEquip, ...tempData };
        } else if (typeof editingId === 'number') {
            const newComps = [...(newEquip.components || [])];
            newComps[editingId] = { ...newComps[editingId], ...tempData };
            newEquip.components = newComps;
        }
        await onSave(newEquip);
        setEditingId(null);
        setTempData({});
    };

    const handleChange = (field: string, value: string) => {
        setTempData((prev: any) => ({ ...prev, [field]: value }));
    };

    // Shared Input Style
    const inputClass = "w-full bg-white dark:bg-base-900 border border-indigo-300 dark:border-indigo-700 rounded px-2 py-1 text-[11px] font-bold text-indigo-900 dark:text-white mb-1 focus:ring-2 focus:ring-indigo-500 outline-none";

    return (
        <div className="h-full flex flex-col bg-white/50 dark:bg-base-900/50 backdrop-blur-xl animate-fade-in relative">
            {/* Header */}
            <div className="px-8 py-6 flex items-center justify-between shrink-0 bg-white dark:bg-base-900 border-b border-base-200 dark:border-base-800 sticky top-0 z-30 shadow-sm">
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className="p-3 rounded-2xl bg-base-100 dark:bg-base-800 text-base-500 hover:bg-indigo-600 hover:text-white transition-all shadow-sm group">
                        <ArrowUturnLeftIcon className="h-5 w-5 group-hover:-translate-x-1 transition-transform"/>
                    </button>
                    <div>
                        <h2 className="text-3xl font-black text-base-900 dark:text-base-100 tracking-tighter uppercase leading-none">{equip.name}</h2>
                        <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800">{equip.code}</span>
                            <span className="text-[11px] font-bold text-base-400 uppercase tracking-widest border-l pl-3 border-base-300">{equip.group}</span>
                            {equip.custodianName && (
                                <span className="text-[11px] font-bold text-base-500 flex items-center gap-1 border-l pl-3 border-base-300">
                                    <UserCircleIcon className="h-3 w-3"/> {equip.custodianName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={onHistory} className="px-6 py-3 bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-700 text-base-600 dark:text-base-300 font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-base-50 dark:hover:bg-base-700 transition-all">History Log</button>
                    <button onClick={onDelete} className="p-3 bg-white dark:bg-base-800 border-2 border-red-100 dark:border-red-900/30 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all"><TrashIcon className="h-5 w-5"/></button>
                </div>
            </div>

            {/* List Content */}
            <div className="flex-grow overflow-hidden p-8 flex flex-col">
                <div className="bg-white dark:bg-base-900 rounded-[2.5rem] border border-base-200 dark:border-base-800 shadow-sm overflow-hidden flex flex-col h-full">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-base-50 dark:bg-base-800 border-b border-base-200 dark:border-base-700 text-[10px] font-black text-base-400 uppercase tracking-widest sticky top-0 z-10">
                        <div className="col-span-3">Item Name / Code</div>
                        <div className="col-span-2">Model / Serial</div>
                        <div className="col-span-2">PM Schedule</div>
                        <div className="col-span-2">Cal Schedule</div>
                        <div className="col-span-2">Vendor Info</div>
                        <div className="col-span-1 text-center">Edit</div>
                    </div>
                    
                    {/* Rows */}
                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {/* Primary Unit */}
                        <div className={`grid grid-cols-12 gap-4 px-6 py-5 border-b border-base-100 dark:border-base-800 items-start ${editingId === 'primary' ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : 'bg-indigo-50/30 dark:bg-indigo-900/10'}`}>
                            {editingId === 'primary' ? (
                                <>
                                    <div className="col-span-3 pr-2">
                                        <input type="text" value={tempData.name || ''} onChange={e => handleChange('name', e.target.value)} className={inputClass} placeholder="Name" />
                                        <input type="text" value={tempData.code || ''} onChange={e => handleChange('code', e.target.value)} className={inputClass} placeholder="Code" />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="text" value={tempData.model || ''} onChange={e => handleChange('model', e.target.value)} className={inputClass} placeholder="Model" />
                                        <input type="text" value={tempData.serialNo || ''} onChange={e => handleChange('serialNo', e.target.value)} className={inputClass} placeholder="Serial No" />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="text" value={tempData.pmBy || ''} onChange={e => handleChange('pmBy', e.target.value)} className={inputClass} placeholder="PM By" />
                                        <div className="flex gap-1">
                                            <input type="text" value={tempData.pmFreq || ''} onChange={e => handleChange('pmFreq', e.target.value)} className={inputClass} placeholder="Freq" />
                                            <input type="text" value={tempData.pmMonth || ''} onChange={e => handleChange('pmMonth', e.target.value)} className={inputClass} placeholder="Month" />
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <input type="text" value={tempData.calBy || ''} onChange={e => handleChange('calBy', e.target.value)} className={inputClass} placeholder="Cal By" />
                                        <div className="flex gap-1">
                                            <input type="text" value={tempData.calFreq || ''} onChange={e => handleChange('calFreq', e.target.value)} className={inputClass} placeholder="Freq" />
                                            <input type="text" value={tempData.calMonth || ''} onChange={e => handleChange('calMonth', e.target.value)} className={inputClass} placeholder="Month" />
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <input type="text" value={tempData.vendor || ''} onChange={e => handleChange('vendor', e.target.value)} className={inputClass} placeholder="Vendor" />
                                        <input type="text" value={tempData.vendorTel || ''} onChange={e => handleChange('vendorTel', e.target.value)} className={inputClass} placeholder="Contact" />
                                    </div>
                                    <div className="col-span-1 text-center flex justify-center gap-2 pt-2">
                                        <button onClick={handleSaveRow} className="text-emerald-500 hover:text-emerald-700 transition-transform hover:scale-110"><CheckCircleIcon className="h-6 w-6"/></button>
                                        <button onClick={cancelEdit} className="text-red-400 hover:text-red-600 transition-transform hover:scale-110"><XCircleIcon className="h-6 w-6"/></button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="col-span-3 pr-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></span>
                                            <span className="text-sm font-black uppercase text-indigo-900 dark:text-indigo-200 truncate">{equip.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 pl-4">
                                            <span className="text-[10px] font-bold bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 text-base-500 px-1.5 py-0.5 rounded">{equip.code || '-'}</span>
                                            <span className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">PRIMARY</span>
                                        </div>
                                    </div>
                                    <div className="col-span-2 text-xs font-bold text-base-600 dark:text-base-300">
                                        <div className="truncate">{equip.model || '-'}</div>
                                        <div className="truncate text-[10px] font-medium text-base-400 mt-0.5">{equip.serialNo || '-'}</div>
                                    </div>
                                    <div className="col-span-2">
                                        <div className="text-[11px] font-bold text-base-700 dark:text-base-200">{equip.pmBy || '-'} <span className="text-base-400 font-normal">{equip.pmFreq ? `(${equip.pmFreq})` : ''}</span></div>
                                        <div className="text-[10px] text-base-400 mt-0.5">Month: <span className="font-bold text-indigo-600">{equip.pmMonth || '-'}</span></div>
                                    </div>
                                    <div className="col-span-2">
                                        <div className="text-[11px] font-bold text-base-700 dark:text-base-200">{equip.calBy || '-'} <span className="text-base-400 font-normal">{equip.calFreq ? `(${equip.calFreq})` : ''}</span></div>
                                        <div className="text-[10px] text-base-400 mt-0.5">Month: <span className="font-bold text-emerald-600">{equip.calMonth || '-'}</span></div>
                                    </div>
                                    <div className="col-span-2">
                                        <div className="text-[11px] font-bold text-base-800 dark:text-base-200 truncate">{equip.vendor || '-'}</div>
                                        <div className="text-[10px] text-base-400 truncate mt-0.5">{equip.vendorTel || '-'}</div>
                                    </div>
                                    <div className="col-span-1 text-center flex justify-center">
                                        <button onClick={() => startEdit('primary', equip)} className="p-2 bg-white dark:bg-base-800 rounded-xl border border-indigo-100 dark:border-indigo-900/30 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all shadow-sm">
                                            <PencilIcon className="h-4 w-4"/>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Components */}
                        {equip.components && equip.components.length > 0 ? equip.components.map((comp, idx) => (
                            <div key={idx} className={`grid grid-cols-12 gap-4 px-6 py-4 border-b border-base-100 dark:border-base-800 items-start transition-colors ${editingId === idx ? 'bg-base-50 dark:bg-base-800' : 'hover:bg-base-50 dark:hover:bg-base-800/50'}`}>
                                {editingId === idx ? (
                                    <>
                                        <div className="col-span-3 pr-2 pl-4 border-l-2 border-indigo-500 ml-4">
                                            <input type="text" value={tempData.name || ''} onChange={e => handleChange('name', e.target.value)} className={inputClass} placeholder="Name" />
                                            <input type="text" value={tempData.code || ''} onChange={e => handleChange('code', e.target.value)} className={inputClass} placeholder="Code" />
                                        </div>
                                        <div className="col-span-2">
                                            <input type="text" value={tempData.model || ''} onChange={e => handleChange('model', e.target.value)} className={inputClass} placeholder="Model" />
                                            <input type="text" value={tempData.serialNo || ''} onChange={e => handleChange('serialNo', e.target.value)} className={inputClass} placeholder="Serial No" />
                                        </div>
                                        <div className="col-span-2">
                                            <input type="text" value={tempData.pmBy || ''} onChange={e => handleChange('pmBy', e.target.value)} className={inputClass} placeholder="PM By" />
                                            <div className="flex gap-1">
                                                <input type="text" value={tempData.pmFreq || ''} onChange={e => handleChange('pmFreq', e.target.value)} className={inputClass} placeholder="Freq" />
                                                <input type="text" value={tempData.pmMonth || ''} onChange={e => handleChange('pmMonth', e.target.value)} className={inputClass} placeholder="Month" />
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <input type="text" value={tempData.calBy || ''} onChange={e => handleChange('calBy', e.target.value)} className={inputClass} placeholder="Cal By" />
                                            <div className="flex gap-1">
                                                <input type="text" value={tempData.calFreq || ''} onChange={e => handleChange('calFreq', e.target.value)} className={inputClass} placeholder="Freq" />
                                                <input type="text" value={tempData.calMonth || ''} onChange={e => handleChange('calMonth', e.target.value)} className={inputClass} placeholder="Month" />
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <input type="text" value={tempData.vendor || ''} onChange={e => handleChange('vendor', e.target.value)} className={inputClass} placeholder="Vendor" />
                                            <input type="text" value={tempData.vendorTel || ''} onChange={e => handleChange('vendorTel', e.target.value)} className={inputClass} placeholder="Contact" />
                                        </div>
                                        <div className="col-span-1 text-center flex justify-center gap-2 pt-2">
                                            <button onClick={handleSaveRow} className="text-emerald-500 hover:text-emerald-700 transition-transform hover:scale-110"><CheckCircleIcon className="h-6 w-6"/></button>
                                            <button onClick={cancelEdit} className="text-red-400 hover:text-red-600 transition-transform hover:scale-110"><XCircleIcon className="h-6 w-6"/></button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="col-span-3 pr-2 pl-4 border-l-2 border-base-100 dark:border-base-800 ml-4">
                                            <div className="text-xs font-bold uppercase text-base-700 dark:text-base-300 truncate">{comp.name}</div>
                                            <div className="text-[10px] font-medium text-base-400 mt-0.5">{comp.code || '-'}</div>
                                        </div>
                                        <div className="col-span-2 text-xs font-bold text-base-600 dark:text-base-300">
                                            <div className="truncate">{comp.model || '-'}</div>
                                            <div className="truncate text-[10px] font-medium text-base-400 mt-0.5">{comp.serialNo || '-'}</div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="text-[11px] font-bold text-base-700 dark:text-base-200">{comp.pmBy || '-'} <span className="text-base-400 font-normal">{comp.pmFreq ? `(${comp.pmFreq})` : ''}</span></div>
                                            <div className="text-[10px] text-base-400 mt-0.5">Month: <span className="font-bold text-indigo-600">{comp.pmMonth || '-'}</span></div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="text-[11px] font-bold text-base-700 dark:text-base-200">{comp.calBy || '-'} <span className="text-base-400 font-normal">{comp.calFreq ? `(${comp.calFreq})` : ''}</span></div>
                                            <div className="text-[10px] text-base-400 mt-0.5">Month: <span className="font-bold text-emerald-600">{comp.calMonth || '-'}</span></div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="text-[11px] font-bold text-base-800 dark:text-base-200 truncate">{comp.vendor || '-'}</div>
                                            <div className="text-[10px] text-base-400 truncate mt-0.5">{comp.vendorTel || '-'}</div>
                                        </div>
                                        <div className="col-span-1 text-center flex justify-center">
                                            <button onClick={() => startEdit(idx, comp)} className="p-2 bg-white dark:bg-base-800 rounded-xl border border-base-200 dark:border-base-700 text-base-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">
                                                <PencilIcon className="h-4 w-4"/>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )) : (
                            <div className="p-8 text-center text-base-300 text-xs font-bold uppercase tracking-widest italic">No attached components</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// 2. MINI CARD (Small Box for Grid View)
const MiniAssetCard: React.FC<{
    equip: Equipment;
    onClick: () => void;
}> = ({ equip, onClick }) => {
    const isPrimary = equip.type === 'Primary';
    
    return (
        <div 
            onClick={onClick}
            className={`
                cursor-pointer p-4 rounded-2xl border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group relative overflow-hidden h-32 flex flex-col justify-between
                ${isPrimary 
                    ? 'bg-white dark:bg-base-800 border-indigo-100 dark:border-indigo-900/30 hover:border-indigo-300 dark:hover:border-indigo-600' 
                    : 'bg-white dark:bg-base-800 border-emerald-100 dark:border-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-600'}
            `}
        >
            <div className={`absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full opacity-10 transition-transform group-hover:scale-150 ${isPrimary ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
            
            <div>
                <div className="flex justify-between items-start">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${isPrimary ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300'}`}>
                        {equip.code}
                    </span>
                </div>
                <h4 className="font-black text-sm text-base-900 dark:text-base-100 mt-3 leading-tight uppercase line-clamp-2" title={equip.name}>
                    {equip.name}
                </h4>
            </div>
            
            <div className="flex justify-between items-end">
                <span className="text-[9px] font-bold text-base-400 uppercase tracking-wider">{equip.group}</span>
                {equip.maintenanceItems && equip.maintenanceItems.length > 0 && (
                    <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    </div>
                )}
            </div>
        </div>
    );
};

// 3. MONTHLY PLAN VIEW (Table)
const MonthlyPlanView: React.FC<{ equipments: Equipment[] }> = ({ equipments }) => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    const monthlyTasks = useMemo(() => {
        const [year, month] = selectedDate.split('-').map(Number);
        const tasks: any[] = [];

        equipments.forEach(eq => {
            (eq.maintenanceItems || []).forEach(item => {
                const itemDate = new Date(item.dueDate);
                if (itemDate.getFullYear() === year && itemDate.getMonth() + 1 === month) {
                    tasks.push({
                        equipment: eq,
                        task: item
                    });
                }
            });
        });
        return tasks.sort((a, b) => new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime());
    }, [equipments, selectedDate]);

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex items-center gap-4 bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm shrink-0">
                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><CalendarIcon className="h-6 w-6"/></div>
                <div>
                    <h3 className="text-lg font-black text-base-900 dark:text-white uppercase tracking-tight">Monthly Planner</h3>
                    <p className="text-xs text-base-500 font-bold">Maintenance & Calibration Schedule</p>
                </div>
                <div className="ml-auto">
                    <input 
                        type="month" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)} 
                        className="p-3 bg-base-50 border-2 border-base-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-all text-base-700"
                    />
                </div>
            </div>

            <div className="flex-grow bg-white dark:bg-base-900 rounded-[2.5rem] border border-base-200 dark:border-base-700 shadow-xl overflow-hidden flex flex-col">
                <div className="overflow-y-auto custom-scrollbar flex-grow p-2">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-base-50 dark:bg-base-800 z-10 text-[10px] font-black uppercase tracking-widest text-base-400">
                            <tr>
                                <th className="p-5 rounded-tl-2xl">Due Date</th>
                                <th className="p-5">Equipment</th>
                                <th className="p-5">Code</th>
                                <th className="p-5">Task</th>
                                <th className="p-5">Provider</th>
                                <th className="p-5 text-center rounded-tr-2xl">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-base-100">
                            {monthlyTasks.length > 0 ? monthlyTasks.map((t, idx) => (
                                <tr key={idx} className="hover:bg-base-50 transition-colors group">
                                    <td className="p-5 font-bold text-indigo-600 text-sm">{t.task.dueDate}</td>
                                    <td className="p-5 font-bold text-base-800">{t.equipment.name}</td>
                                    <td className="p-5 text-xs font-mono text-base-500">{t.equipment.code}</td>
                                    <td className="p-5">
                                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${t.task.type === 'PM' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {t.task.type}: {t.task.name}
                                        </span>
                                    </td>
                                    <td className="p-5 text-xs font-bold text-base-500">{t.task.provider}</td>
                                    <td className="p-5 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${getStatusColor(t.task.dueDate, t.task.status)}`}>
                                            {t.task.status}
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center text-base-300 font-bold uppercase tracking-widest">No tasks scheduled for {selectedDate}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// 4. CUSTODIAN LIST VIEW
const CustodianListView: React.FC<{ equipments: Equipment[]; testers: Tester[] }> = ({ equipments, testers }) => {
    // Filter testers to exclude assistants if needed, assuming 'assistants_4_2' are not custodians usually
    const custodians = testers.filter(t => t.team !== 'assistants_4_2');

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {custodians.map(tester => {
                    const assignedEquip = equipments.filter(e => e.custodian === tester.id);
                    return (
                        <div key={tester.id} className="bg-white dark:bg-base-900 rounded-[2rem] border border-base-200 dark:border-base-800 shadow-sm overflow-hidden flex flex-col h-[400px]">
                            <div className="p-5 bg-base-50 dark:bg-base-800 border-b border-base-200 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black shadow-lg">
                                    {getInitials(tester.name)}
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-base-900 dark:text-white leading-none">{tester.name}</h3>
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Custodian</span>
                                </div>
                                <span className="ml-auto bg-white px-3 py-1 rounded-full text-xs font-black shadow-sm border">{assignedEquip.length}</span>
                            </div>
                            <div className="flex-grow overflow-y-auto p-4 space-y-2 bg-slate-50/50">
                                {assignedEquip.length > 0 ? assignedEquip.map(eq => (
                                    <div key={eq.id} className="p-3 bg-white rounded-xl border border-base-100 shadow-sm flex justify-between items-center group hover:border-indigo-200 transition-all">
                                        <div>
                                            <div className="text-[10px] font-black text-base-400 uppercase tracking-widest">{eq.code}</div>
                                            <div className="font-bold text-xs text-base-800 line-clamp-1">{eq.name}</div>
                                        </div>
                                        <div className={`w-2 h-2 rounded-full ${eq.type === 'Primary' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
                                    </div>
                                )) : (
                                    <div className="h-full flex items-center justify-center text-base-300 text-xs font-bold uppercase italic">No assignments</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

interface EquipmentTabProps {
    testers: Tester[];
}

const EquipmentTab: React.FC<EquipmentTabProps> = ({ testers }) => {
    const [activeTab, setActiveTab] = useState<'main' | 'custodian' | 'monthly'>('main');
    const [viewMode, setViewMode] = useState<'grid' | 'detail'>('grid');
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; isError?: boolean } | null>(null);
    
    // Search/Filter
    const [searchTerm, setSearchTerm] = useState('');

    // Modal States
    const [selectedEquip, setSelectedEquip] = useState<Equipment | null>(null);
    
    // CRUD Modal States
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [editingEquip, setEditingEquip] = useState<Partial<Equipment>>({});
    const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);
    const [tempMaintenanceItem, setTempMaintenanceItem] = useState<Partial<MaintenanceItem>>({ type: 'PM', status: 'pending' });
    const [tempComponent, setTempComponent] = useState<Partial<EquipmentComponent>>({ type: 'Component' });
    const [newHistoryEntry, setNewHistoryEntry] = useState<Partial<EquipmentHistory>>({ date: new Date().toISOString().split('T')[0], description: '', partsReplaced: '', technician: 'External' });
    const [importConfirmState, setImportConfirmState] = useState<{ isOpen: boolean; count: number; data: any[] }>({ isOpen: false, count: 0, data: [] });
    const [expandedCompIndex, setExpandedCompIndex] = useState<number | null>(null);

    // Helpers
    const onlyTesters = useMemo(() => testers.filter(t => t.team !== 'assistants_4_2'), [testers]);
    const groups = useMemo(() => Array.from(new Set(equipments.map(e => e.group).filter(Boolean))).sort(), [equipments]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await getEquipments();
            setEquipments(data);
            if (selectedEquip) {
                const refreshed = data.find(e => e.id === selectedEquip.id);
                if (refreshed) setSelectedEquip(refreshed);
            }
        } catch (e) { console.error(e); } 
        finally { setIsLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    // Filter Logic
    const filteredEquipments = useMemo(() => {
        return equipments.filter(e => {
            const term = searchTerm.toLowerCase();
            return !searchTerm || 
                e.name.toLowerCase().includes(term) || 
                (e.code && e.code.toLowerCase().includes(term));
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [equipments, searchTerm]);

    const primaryItems = filteredEquipments.filter(e => e.type === 'Primary');
    const accessoryItems = filteredEquipments.filter(e => e.type !== 'Primary');

    // --- HANDLERS ---
    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEquip.name || !editingEquip.group) return;
        let custodianName = editingEquip.custodianName;
        if (editingEquip.custodian) {
            const tester = testers.find(t => t.id === editingEquip.custodian);
            if (tester) custodianName = tester.name;
        }
        const payload: any = {
            ...editingEquip,
            group: editingEquip.group?.toUpperCase(),
            custodianName: custodianName ?? null,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'Admin'
        };
        if (!payload.maintenanceItems) payload.maintenanceItems = [];
        if (!payload.components) payload.components = [];
        Object.keys(payload).forEach(key => { if (payload[key] === undefined) payload[key] = null; });
        await saveEquipment(payload);
        setIsConfigModalOpen(false);
        fetchData();
        setNotification({ message: "Equipment updated successfully." });
    };

    const handleDeleteConfirm = async () => {
        if (targetDeleteId) {
            await deleteEquipment(targetDeleteId);
            setTargetDeleteId(null);
            setIsDeleteModalOpen(false);
            setViewMode('grid');
            setSelectedEquip(null);
            fetchData();
            setNotification({ message: "Equipment deleted." });
        }
    };

    const openAddNew = () => {
        setEditingEquip({ status: 'ready', actionStatus: 'none', group: '', history: [], maintenanceItems: [], type: 'Primary' });
        setIsConfigModalOpen(true);
    };

    // Maintenance Item Handlers
    const handleAddMaintenanceItem = () => {
        if (!tempMaintenanceItem.name || !tempMaintenanceItem.dueDate) return;
        const newItem: MaintenanceItem = {
            id: Math.random().toString(36).substring(7),
            name: tempMaintenanceItem.name,
            type: tempMaintenanceItem.type || 'PM',
            dueDate: tempMaintenanceItem.dueDate,
            status: tempMaintenanceItem.status || 'pending',
            provider: tempMaintenanceItem.provider || 'Internal',
            cycleMonths: tempMaintenanceItem.cycleMonths,
            serviceDate: tempMaintenanceItem.serviceDate,
            technicianName: tempMaintenanceItem.technicianName
        };
        const currentItems = editingEquip.maintenanceItems || [];
        setEditingEquip({ ...editingEquip, maintenanceItems: [...currentItems, newItem] });
        setTempMaintenanceItem({ type: 'PM', status: 'pending', name: '', provider: '', dueDate: '' });
    };
    const handleRemoveMaintenanceItem = (id: string) => {
        const currentItems = editingEquip.maintenanceItems || [];
        setEditingEquip({ ...editingEquip, maintenanceItems: currentItems.filter(i => i.id !== id) });
    };

    // Component Handlers
    const handleAddComponent = () => {
        if (!tempComponent.name) return;
        const newComp: EquipmentComponent = { name: tempComponent.name, code: tempComponent.code, serialNo: tempComponent.serialNo, model: tempComponent.model, calDueDate: tempComponent.calDueDate, type: 'Component' };
        const currentComps = editingEquip.components || [];
        setEditingEquip({ ...editingEquip, components: [...currentComps, newComp] });
        setTempComponent({ type: 'Component', name: '', code: '', serialNo: '', model: '', calDueDate: '' });
    };
    const handleRemoveComponent = (idx: number) => {
        const currentComps = editingEquip.components || [];
        setEditingEquip({ ...editingEquip, components: currentComps.filter((_, i) => i !== idx) });
    };

    const handleUpdateComponent = (idx: number, field: string, value: string) => {
        const currentComps = [...(editingEquip.components || [])];
        if (currentComps[idx]) {
            currentComps[idx] = { ...currentComps[idx], [field]: value };
            setEditingEquip({ ...editingEquip, components: currentComps });
        }
    };

    // History Handlers
    const handleAddHistory = async () => {
        if (!selectedEquip || !newHistoryEntry.description) return;
        const entry: EquipmentHistory = { id: Math.random().toString(36).substring(7), date: newHistoryEntry.date || new Date().toISOString().split('T')[0], description: newHistoryEntry.description, partsReplaced: newHistoryEntry.partsReplaced, technician: newHistoryEntry.technician || 'Service' };
        const updatedHistory = [entry, ...(selectedEquip.history || [])];
        await saveEquipment({ ...selectedEquip, history: updatedHistory });
        setSelectedEquip({ ...selectedEquip, history: updatedHistory });
        setNewHistoryEntry({ date: new Date().toISOString().split('T')[0], description: '', partsReplaced: '', technician: 'External' });
        fetchData();
    };

    // Import Logic
    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = evt.target?.result;
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(ws);
                if (jsonData.length === 0) { setNotification({ message: "File appears to be empty.", isError: true }); return; }
                setIsLoading(true);
                const primaryMap = new Map<string, any>();
                const potentialComponents: any[] = [];
                
                jsonData.forEach((rawRow: any) => {
                    const row = normalizeKeys(rawRow);
                    const typeRaw = row['equipmenttype'] || row['type'] || 'accessory';
                    const type = typeRaw.toLowerCase();
                    const code = row['equipmentcode'] || row['assetcode'] || row['code'] || row['id'];
                    const name = row['equipmentname'] || row['equipmetname'] || row['assetname'] || row['name'] || 'Unknown Asset';
                    const group = row['group'] || row['category'] || 'General';
                    const model = row['model'] || '';
                    const serial = row['serialno'] || row['serial'] || '';
                    
                    const details = {
                        pmBy: row['pmby'],
                        pmFreq: row['pmfreq'],
                        calBy: row['calby'],
                        calFreq: row['calfreq'],
                        pmMonth: row['monthpm'] || row['เดือนpm'],
                        calMonth: row['monthcal'] || row['เดือนcal'],
                        vendor: row['vendor'] || row['ผู้ขาย'],
                        vendorTel: row['vendortel']
                    };

                    if (type === 'primary') {
                        if (code && !primaryMap.has(code)) {
                            primaryMap.set(code, { 
                                name, code, group, type: 'Primary', 
                                status: 'ready', actionStatus: 'none', 
                                details: [model, serial].filter(Boolean).join(' / '), model, serialNo: serial, 
                                components: [], maintenanceItems: [], history: [], 
                                lastUpdated: new Date().toISOString(), updatedBy: 'Import',
                                ...details 
                            });
                        }
                    } else { 
                        potentialComponents.push({ row, type, code, name, group, model, serial, details }); 
                    }
                });
                
                const accessories: any[] = [];
                potentialComponents.forEach((item) => {
                    const { type, code, name, group, model, serial, details } = item;
                    let isLinked = false;
                    if (code && code.includes('/')) {
                        const baseCode = code.split('/')[0];
                        if (primaryMap.has(baseCode)) {
                            primaryMap.get(baseCode).components.push({ 
                                name: name, code: code, model: model, serialNo: serial, type: 'Component',
                                ...details
                            });
                            isLinked = true;
                        }
                    }
                    if (!isLinked) { 
                        accessories.push({ 
                            name: name + (type === 'component' ? ' (Orphaned Component)' : ''), 
                            code, group, type: 'Accessory', 
                            status: 'ready', actionStatus: 'none', 
                            details: [model, serial].filter(Boolean).join(' / '), model, serialNo: serial, 
                            components: [], maintenanceItems: [], history: [], 
                            lastUpdated: new Date().toISOString(), updatedBy: 'Import',
                            ...details
                        }); 
                    }
                });
                const allDocs = [...Array.from(primaryMap.values()), ...accessories];
                if (allDocs.length === 0) { setNotification({ message: "No valid records.", isError: true }); setIsLoading(false); return; }
                setImportConfirmState({ isOpen: true, count: allDocs.length, data: allDocs });
                setIsLoading(false);
            } catch (error) { console.error(error); setNotification({ message: "Error processing file.", isError: true }); setIsLoading(false); }
        };
        reader.readAsArrayBuffer(file);
    };
    const confirmImport = async () => {
        setIsLoading(true);
        try { await batchImportEquipments(importConfirmState.data); await fetchData(); setNotification({ message: `Imported ${importConfirmState.count} assets.` }); } catch (e) { setNotification({ message: "Import failed.", isError: true }); } finally { setIsLoading(false); setImportConfirmState({ isOpen: false, count: 0, data: [] }); }
    };

    if (viewMode === 'detail' && selectedEquip) {
        return (
            <AssetDetailView 
                equip={selectedEquip}
                onBack={() => { setViewMode('grid'); setSelectedEquip(null); }}
                onDelete={() => { setTargetDeleteId(selectedEquip.id); setIsDeleteModalOpen(true); }}
                onHistory={() => setIsHistoryModalOpen(true)}
                onSave={async (updated) => {
                    await saveEquipment(updated);
                    await fetchData();
                }}
            />
        );
    }

    return (
        <div className="h-full flex flex-col space-y-6 p-6 animate-fade-in bg-base-50/20 dark:bg-transparent overflow-hidden font-sans">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            
            <ImportConfirmModal isOpen={importConfirmState.isOpen} count={importConfirmState.count} onConfirm={confirmImport} onCancel={() => setImportConfirmState({ isOpen: false, count: 0, data: [] })} />

            {/* TOP BAR: Title & Search & Import & Add */}
            <div className="flex flex-col xl:flex-row justify-between items-end xl:items-center gap-6 shrink-0">
                <div>
                    <h2 className="text-4xl font-black text-base-900 dark:text-base-100 tracking-tighter uppercase leading-none italic">Asset Plan</h2>
                    <p className="text-base-400 font-black uppercase tracking-[0.4em] text-[10px] mt-2">Inventory & Calibration Control</p>
                </div>
                <div className="flex items-center gap-3 w-full xl:w-auto">
                    <div className="relative group flex-grow xl:w-64">
                        <input type="text" placeholder="Search Asset..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white dark:bg-base-900 border-2 border-base-100 dark:border-base-800 rounded-2xl outline-none font-bold text-sm focus:border-indigo-500 transition-all shadow-sm"/>
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base-400"><SearchIcon className="h-4 w-4"/></div>
                    </div>
                    
                    {/* Import Button */}
                    <div className="relative">
                        <input type="file" id="excel-upload" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
                        <label htmlFor="excel-upload" className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-700 text-base-600 dark:text-base-300 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-sm hover:bg-base-50 transition-all cursor-pointer">
                            <UploadIcon className="h-4 w-4"/>
                        </label>
                    </div>

                    <button onClick={openAddNew} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700 transition-all active:scale-95 border-b-4 border-indigo-800 shrink-0">
                        <PlusIcon className="h-4 w-4"/> Add Asset
                    </button>
                </div>
            </div>

            {/* NAVIGATION TABS (PAGE 1, 2, 3) */}
            <div className="flex p-1.5 bg-white dark:bg-base-900 rounded-[1.5rem] border border-base-100 dark:border-base-800 w-fit shadow-sm self-start">
                {[
                    { id: 'main', label: 'All Assets', icon: <BoxIcon className="h-4 w-4"/> },
                    { id: 'custodian', label: 'Custodian Map', icon: <UserGroupIcon className="h-4 w-4"/> },
                    { id: 'monthly', label: 'Monthly Plan', icon: <CalendarIcon className="h-4 w-4"/> }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-base-400 hover:text-base-800'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-grow overflow-hidden relative">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center"><RefreshIcon className="h-10 w-10 animate-spin text-indigo-200" /></div>
                ) : (
                    <>
                        {/* PAGE 1: MAIN ASSETS (Grid of Small Boxes) */}
                        {activeTab === 'main' && (
                            <div className="h-full overflow-y-auto custom-scrollbar pb-10 pr-2 space-y-10 animate-fade-in">
                                {/* Primary Section */}
                                {primaryItems.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-3 mb-4 pl-2 sticky top-0 bg-base-50/95 z-10 py-2 backdrop-blur-sm">
                                            <div className="w-2 h-8 bg-indigo-500 rounded-full"></div>
                                            <h3 className="text-xl font-black text-indigo-900 dark:text-indigo-100 uppercase tracking-tighter">Primary Units</h3>
                                            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-bold">{primaryItems.length}</span>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                            {primaryItems.map(item => (
                                                <MiniAssetCard 
                                                    key={item.id} 
                                                    equip={item} 
                                                    onClick={() => { setSelectedEquip(item); setViewMode('detail'); }} 
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Accessory Section */}
                                {accessoryItems.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-3 mb-4 pl-2 sticky top-0 bg-base-50/95 z-10 py-2 backdrop-blur-sm">
                                            <div className="w-2 h-8 bg-emerald-500 rounded-full"></div>
                                            <h3 className="text-xl font-black text-emerald-900 dark:text-emerald-100 uppercase tracking-tighter">Accessories</h3>
                                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-bold">{accessoryItems.length}</span>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                            {accessoryItems.map(item => (
                                                <MiniAssetCard 
                                                    key={item.id} 
                                                    equip={item} 
                                                    onClick={() => { setSelectedEquip(item); setViewMode('detail'); }} 
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {primaryItems.length === 0 && accessoryItems.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center py-20">
                                        <CogIcon className="h-24 w-24 mb-4 text-base-300"/>
                                        <span className="text-xl font-black uppercase tracking-[0.3em]">No Assets</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PAGE 2: CUSTODIAN MAP */}
                        {activeTab === 'custodian' && (
                            <CustodianListView equipments={equipments} testers={onlyTesters} />
                        )}

                        {/* PAGE 3: MONTHLY PLAN */}
                        {activeTab === 'monthly' && (
                            <MonthlyPlanView equipments={equipments} />
                        )}
                    </>
                )}
            </div>

            {/* CONFIG MODAL (Edit/Add) */}
            {isConfigModalOpen && (
                <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[210] p-4 animate-fade-in" onClick={() => setIsConfigModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-8 py-6 border-b border-base-100 dark:border-base-800 bg-base-50/50 flex justify-between items-center shrink-0">
                            <div><h3 className="text-xl font-black text-base-900 dark:text-white uppercase tracking-tighter">Machine Config</h3></div>
                            <button onClick={() => setIsConfigModalOpen(false)} className="p-2 hover:bg-base-100 rounded-xl transition-all"><XCircleIcon className="h-6 w-6 text-base-400"/></button>
                        </div>
                        <form onSubmit={handleSaveConfig} className="flex flex-col flex-grow overflow-hidden">
                            <div className="flex flex-grow overflow-hidden">
                                {/* Left: Basic Info */}
                                <div className="w-1/3 p-8 border-r border-base-100 dark:border-base-800 space-y-6 overflow-y-auto custom-scrollbar bg-base-50/30">
                                    <div className="space-y-1"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-1">Asset Name</label><input required type="text" value={editingEquip.name || ''} onChange={e => setEditingEquip({...editingEquip, name: e.target.value})} className="w-full p-3 bg-white border-2 border-base-100 rounded-xl outline-none font-bold text-sm focus:border-indigo-500 dark:bg-base-900 dark:border-base-700 dark:text-white" placeholder="e.g. HPLC-01"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-1">Equipment Code</label><input type="text" value={editingEquip.code || ''} onChange={e => setEditingEquip({...editingEquip, code: e.target.value})} className="w-full p-3 bg-white border-2 border-base-100 rounded-xl outline-none font-bold text-sm focus:border-indigo-500 dark:bg-base-900 dark:border-base-700 dark:text-white" placeholder="e.g. EQ-001"/></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-1">Model</label><input type="text" value={editingEquip.model || ''} onChange={e => setEditingEquip({...editingEquip, model: e.target.value})} className="w-full p-3 bg-white border-2 border-base-100 rounded-xl outline-none font-bold text-sm focus:border-indigo-500 dark:bg-base-900 dark:border-base-700 dark:text-white"/></div>
                                        <div className="space-y-1"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-1">Serial No.</label><input type="text" value={editingEquip.serialNo || ''} onChange={e => setEditingEquip({...editingEquip, serialNo: e.target.value})} className="w-full p-3 bg-white border-2 border-base-100 rounded-xl outline-none font-bold text-sm focus:border-indigo-500 dark:bg-base-900 dark:border-base-700 dark:text-white"/></div>
                                    </div>
                                    <div className="space-y-1"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-1">Type</label><select value={editingEquip.type || 'Accessory'} onChange={e => setEditingEquip({...editingEquip, type: e.target.value as any})} className="w-full p-3 bg-white border-2 border-base-100 rounded-xl outline-none font-bold text-sm focus:border-indigo-500 dark:bg-base-900 dark:border-base-700 dark:text-white"><option value="Primary">Primary</option><option value="Accessory">Accessory</option></select></div>
                                    <div className="space-y-1"><label className="text-[9px] font-black text-base-400 uppercase tracking-widest ml-1">Group</label><input required list="groups" type="text" value={editingEquip.group || ''} onChange={e => setEditingEquip({...editingEquip, group: e.target.value})} className="w-full p-3 bg-white border-2 border-base-100 rounded-xl outline-none font-bold text-sm focus:border-indigo-500 dark:bg-base-900 dark:border-base-700 dark:text-white"/><datalist id="groups">{groups.map(g => <option key={g} value={g}/>)}</datalist></div>
                                    <div className="space-y-1"><label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Custodian</label><select value={editingEquip.custodian || ''} onChange={e => setEditingEquip({...editingEquip, custodian: e.target.value})} className="w-full p-3 bg-white border-2 border-indigo-100 rounded-xl outline-none font-bold text-sm text-indigo-900 dark:bg-base-900 dark:border-indigo-900 dark:text-indigo-300"><option value="">-- Select --</option>{onlyTesters.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                                </div>
                                {/* Right: Components & Maintenance */}
                                <div className="w-2/3 p-8 flex flex-col overflow-y-auto custom-scrollbar bg-white dark:bg-base-900 space-y-8">
                                    {/* Primary Maintenance Fields */}
                                    <div>
                                        <h4 className="text-[12px] font-black text-base-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2"><CogIcon className="h-4 w-4 text-indigo-500"/> Main Unit Maintenance</h4>
                                        <MaintenanceFields data={editingEquip} onChange={(field, val) => setEditingEquip({ ...editingEquip, [field]: val })} />
                                    </div>

                                    {/* Components Section */}
                                    {editingEquip.type === 'Primary' && (
                                        <div>
                                            <h4 className="text-[12px] font-black text-base-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2 mt-4"><CogIcon className="h-4 w-4 text-emerald-500"/> Components</h4>
                                            
                                            {/* Add Component Form */}
                                            <div className="bg-base-50 dark:bg-base-800 p-4 rounded-2xl border border-base-200 dark:border-base-700 mb-4 grid grid-cols-12 gap-3">
                                                <div className="col-span-4"><input type="text" placeholder="Name" value={tempComponent.name || ''} onChange={e => setTempComponent({...tempComponent, name: e.target.value})} className="w-full p-2 text-xs font-bold rounded-lg border border-base-200 outline-none dark:bg-base-900 dark:border-base-600 dark:text-white"/></div>
                                                <div className="col-span-3"><input type="text" placeholder="Code" value={tempComponent.code || ''} onChange={e => setTempComponent({...tempComponent, code: e.target.value})} className="w-full p-2 text-xs font-bold rounded-lg border border-base-200 outline-none dark:bg-base-900 dark:border-base-600 dark:text-white"/></div>
                                                <div className="col-span-4"><input type="text" placeholder="Serial No" value={tempComponent.serialNo || ''} onChange={e => setTempComponent({...tempComponent, serialNo: e.target.value})} className="w-full p-2 text-xs font-bold rounded-lg border border-base-200 outline-none dark:bg-base-900 dark:border-base-600 dark:text-white"/></div>
                                                <div className="col-span-1"><button type="button" onClick={handleAddComponent} className="w-full h-full bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700"><PlusIcon className="h-4 w-4"/></button></div>
                                            </div>

                                            {/* Components List */}
                                            <div className="space-y-3">
                                                {(editingEquip.components || []).map((comp, idx) => (
                                                    <div key={idx} className="border border-base-100 rounded-xl hover:bg-base-50 dark:border-base-700 dark:hover:bg-base-800 transition-colors overflow-hidden">
                                                        <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpandedCompIndex(expandedCompIndex === idx ? null : idx)}>
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black text-base-800 dark:text-base-200">{comp.name}</span>
                                                                <span className="text-[10px] text-base-400">{comp.code} {comp.serialNo ? `/ ${comp.serialNo}` : ''}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{expandedCompIndex === idx ? 'Hide Details' : 'Edit Details'}</span>
                                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveComponent(idx); }} className="text-red-400 hover:text-red-600 p-2"><TrashIcon className="h-4 w-4"/></button>
                                                            </div>
                                                        </div>
                                                        {expandedCompIndex === idx && (
                                                            <div className="p-3 bg-white dark:bg-base-900 border-t border-base-100 dark:border-base-700 animate-fade-in">
                                                                <MaintenanceFields data={comp} onChange={(f, v) => handleUpdateComponent(idx, f, v)} />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Legacy Task Schedule (Optional) */}
                                    <div>
                                        <h4 className="text-[12px] font-black text-base-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2 mt-4"><ClockIcon className="h-4 w-4 text-indigo-500"/> Ad-Hoc Tasks</h4>
                                        <div className="bg-base-50 dark:bg-base-800 p-4 rounded-2xl border border-base-200 dark:border-base-700 mb-4 grid grid-cols-12 gap-3">
                                            <div className="col-span-3"><input type="text" placeholder="Task" value={tempMaintenanceItem.name || ''} onChange={e => setTempMaintenanceItem({...tempMaintenanceItem, name: e.target.value})} className="w-full p-2 text-xs font-bold rounded-lg border border-base-200 outline-none dark:bg-base-900 dark:border-base-600 dark:text-white"/></div>
                                            <div className="col-span-2"><select value={tempMaintenanceItem.type} onChange={e => setTempMaintenanceItem({...tempMaintenanceItem, type: e.target.value as any})} className="w-full p-2 text-xs font-bold rounded-lg border border-base-200 outline-none dark:bg-base-900 dark:border-base-600 dark:text-white"><option value="PM">PM</option><option value="Cal">Cal</option></select></div>
                                            <div className="col-span-3"><input type="date" value={tempMaintenanceItem.dueDate || ''} onChange={e => setTempMaintenanceItem({...tempMaintenanceItem, dueDate: e.target.value})} className="w-full p-2 text-xs font-bold rounded-lg border border-base-200 outline-none dark:bg-base-900 dark:border-base-600 dark:text-white"/></div>
                                            <div className="col-span-3"><input type="text" placeholder="Provider" value={tempMaintenanceItem.provider || ''} onChange={e => setTempMaintenanceItem({...tempMaintenanceItem, provider: e.target.value})} className="w-full p-2 text-xs font-bold rounded-lg border border-base-200 outline-none dark:bg-base-900 dark:border-base-600 dark:text-white"/></div>
                                            <div className="col-span-1"><button type="button" onClick={handleAddMaintenanceItem} className="w-full h-full bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700"><PlusIcon className="h-4 w-4"/></button></div>
                                        </div>
                                        <div className="space-y-2">{(editingEquip.maintenanceItems || []).map((item, idx) => (<div key={idx} className="flex items-center justify-between p-3 border border-base-100 rounded-xl hover:bg-base-50 transition-colors"><div className="flex flex-col"><div className="flex items-center gap-2"><span className={`text-[9px] font-black uppercase px-1.5 rounded ${item.type === 'PM' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{item.type}</span><span className="text-xs font-black text-base-800">{item.name}</span></div><span className="text-[10px] text-base-400 mt-0.5 font-bold">Due: {item.dueDate} • {item.provider}</span></div><button type="button" onClick={() => handleRemoveMaintenanceItem(item.id)} className="text-red-400 hover:text-red-600 p-2"><TrashIcon className="h-4 w-4"/></button></div>))}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-base-100 dark:border-base-800 bg-base-50/50 flex gap-4 shrink-0"><button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 uppercase text-[11px] tracking-widest transition-all">Save Changes</button><button type="button" onClick={() => setIsConfigModalOpen(false)} className="px-8 py-4 text-[11px] font-black text-base-400 uppercase tracking-widest hover:text-base-800">Cancel</button></div>
                        </form>
                    </div>
                </div>
            )}

            {/* HISTORY MODAL & DELETE CONFIRM (REUSED) */}
            {isHistoryModalOpen && selectedEquip && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-md flex items-center justify-center z-[220] p-4 animate-fade-in" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-base-100 dark:border-base-800 flex justify-between items-center bg-base-50/50">
                            <div><h3 className="text-lg font-black text-base-900 dark:text-white uppercase tracking-tight">Log</h3><p className="text-xs font-bold text-indigo-600">{selectedEquip.name}</p></div>
                            <button onClick={() => setIsHistoryModalOpen(false)}><XCircleIcon className="h-6 w-6 text-base-400 hover:text-base-600"/></button>
                        </div>
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-6">
                            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 space-y-3">
                                <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">New Entry</h4>
                                <div className="grid grid-cols-2 gap-3"><input type="date" value={newHistoryEntry.date} onChange={e => setNewHistoryEntry({...newHistoryEntry, date: e.target.value})} className="w-full p-2 bg-white rounded-lg text-xs font-bold border border-indigo-100 outline-none"/><input type="text" placeholder="Technician" value={newHistoryEntry.technician} onChange={e => setNewHistoryEntry({...newHistoryEntry, technician: e.target.value})} className="w-full p-2 bg-white rounded-lg text-xs font-bold border border-indigo-100 outline-none"/></div>
                                <textarea placeholder="Description" value={newHistoryEntry.description} onChange={e => setNewHistoryEntry({...newHistoryEntry, description: e.target.value})} className="w-full p-2 bg-white rounded-lg text-xs font-medium border border-indigo-100 outline-none h-16 resize-none"/>
                                <input type="text" placeholder="Parts" value={newHistoryEntry.partsReplaced} onChange={e => setNewHistoryEntry({...newHistoryEntry, partsReplaced: e.target.value})} className="w-full p-2 bg-white rounded-lg text-xs font-medium border border-indigo-100 outline-none"/>
                                <button onClick={handleAddHistory} disabled={!newHistoryEntry.description} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-md hover:bg-indigo-700 disabled:opacity-50">Add Record</button>
                            </div>
                            <div className="space-y-4">{(selectedEquip.history || []).map(log => (<div key={log.id} className="relative pl-6 border-l-2 border-base-200 pb-2 last:pb-0"><div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-base-300"></div><div className="text-[10px] font-black text-base-400 uppercase tracking-widest mb-1">{log.date} • {log.technician}</div><p className="text-sm font-bold text-base-800 leading-snug">{log.description}</p>{log.partsReplaced && <div className="mt-1 text-xs text-amber-600 font-medium">Replaced: {log.partsReplaced}</div>}</div>))}</div>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-base-900/90 backdrop-blur-md flex items-center justify-center z-[250] p-4" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2rem] p-8 shadow-2xl max-w-sm text-center space-y-4">
                        <AlertTriangleIcon className="h-12 w-12 text-red-500 mx-auto"/>
                        <h3 className="text-xl font-black text-base-900 dark:text-white">Delete Asset?</h3>
                        <div className="flex gap-2 justify-center pt-2"><button onClick={handleDeleteConfirm} className="px-6 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700">Confirm</button><button onClick={() => setIsDeleteModalOpen(false)} className="px-6 py-3 bg-base-100 text-base-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-base-200">Cancel</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EquipmentTab;
