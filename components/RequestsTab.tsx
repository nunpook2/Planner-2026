import React, { useState, useEffect, useMemo } from 'react';
import { getSupportRequests, saveSupportRequest, deleteSupportRequest } from '../services/dataService';
import type { Tester, SupportRequest, SupportRequestStatus } from '../types';
import { PlusIcon, TrashIcon, CheckCircleIcon, XCircleIcon, ClockIcon, InformationCircleIcon, ChatBubbleLeftIcon, UserCircleIcon, BeakerIcon } from './common/Icons';

interface RequestsTabProps {
    testers: Tester[];
}

const SUPPORT_STATUS_MAP: Record<SupportRequestStatus, { label: string, color: string, icon: React.FC<any> }> = {
    pending: { label: 'รอดำเนินการ', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', icon: ClockIcon },
    acknowledged: { label: 'รับเรื่องแล้ว', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400', icon: InformationCircleIcon },
    in_progress: { label: 'กำลังดำเนินการ', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400', icon: BeakerIcon },
    done: { label: 'ปิดงาน', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircleIcon }
};

const RequestsTab: React.FC<RequestsTabProps> = ({ testers }) => {
    const [requests, setRequests] = useState<SupportRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRequest, setEditingRequest] = useState<Partial<SupportRequest> | null>(null);
    const [requestToDelete, setRequestToDelete] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<SupportRequestStatus>('pending');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await getSupportRequests();
            setRequests(data);
        } catch (error) {
            console.error("Error fetching support requests:", error);
            setNotification({ message: "Failed to load requests.", isError: true });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // refresh every minute
        return () => clearInterval(interval);
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRequest?.title || !editingRequest?.requesterName) {
            setNotification({ message: 'Please fill all required fields.', isError: true });
            return;
        }

        try {
            const requestToSave: SupportRequest = {
                title: editingRequest.title,
                description: editingRequest.description || '',
                requesterName: editingRequest.requesterName,
                assigneeId: editingRequest.assigneeId || null,
                status: editingRequest.status || 'pending',
                createdAt: editingRequest.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                resolvedAt: editingRequest.status === 'done' ? (editingRequest.resolvedAt || new Date().toISOString()) : null,
                id: editingRequest.id,
            };

            await saveSupportRequest(requestToSave);
            setNotification({ message: 'Request saved successfully.' });
            setIsModalOpen(false);
            setEditingRequest(null);
            fetchData();
        } catch (error) {
            console.error("Error saving request:", error);
            setNotification({ message: "Failed to save request.", isError: true });
        }
    };

    const handleStatusChange = async (req: SupportRequest, newStatus: SupportRequestStatus) => {
        try {
            const updated: SupportRequest = {
                ...req,
                status: newStatus,
                updatedAt: new Date().toISOString(),
                resolvedAt: newStatus === 'done' ? new Date().toISOString() : (newStatus === req.status ? req.resolvedAt : null)
            };
            await saveSupportRequest(updated);
            setNotification({ message: `Status updated to ${SUPPORT_STATUS_MAP[newStatus].label}.` });
            fetchData();
        } catch (error) {
            console.error("Error updating status:", error);
            setNotification({ message: "Failed to update status.", isError: true });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteSupportRequest(id);
            setNotification({ message: 'Request deleted successfully.' });
            setRequestToDelete(null);
            fetchData();
        } catch (error) {
             console.error("Error deleting request:", error);
             setNotification({ message: "Failed to delete request.", isError: true });
        }
    };

    const exportToCSV = () => {
        const headers = ["ID", "Title", "Description", "Requester", "Assignee", "Status", "Created At", "Resolved At"];
        const rows = requests.map(req => {
            const assignee = testers.find(t => t.id === req.assigneeId)?.name || '';
            const statusLabel = SUPPORT_STATUS_MAP[req.status]?.label || req.status;
            return [
                req.id || '',
                `"${(req.title || '').replace(/"/g, '""')}"`,
                `"${(req.description || '').replace(/"/g, '""')}"`,
                `"${(req.requesterName || '').replace(/"/g, '""')}"`,
                `"${(assignee || '').replace(/"/g, '""')}"`,
                statusLabel,
                req.createdAt || '',
                req.resolvedAt || ''
            ].join(',');
        });
        
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `support_requests_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setNotification({ message: 'Exported data to CSV.' });
    };

    // Calculate leaderboard
    const leaderboard = useMemo(() => {
        const counts: Record<string, number> = {};
        requests.filter(r => r.status === 'done' && r.assigneeId).forEach(r => {
            counts[r.assigneeId!] = (counts[r.assigneeId!] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([id, count]) => ({ tester: testers.find(t => t.id === id), count }))
            .filter(item => item.tester)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // top 5
    }, [requests, testers]);

    if (isLoading && requests.length === 0) {
        return <div className="p-8 text-center text-base-500 font-medium animate-pulse">Loading Requests...</div>;
    }

    return (
        <div className="p-4 lg:p-8 max-w-[1600px] w-full mx-auto space-y-8 animate-fade-in">
            
            {/* Header & Leaderboard Area */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 bg-white dark:bg-base-900 p-6 lg:px-8 lg:py-6 rounded-[2rem] border border-slate-200/80 dark:border-base-800/60 shadow-xl shadow-slate-200/40 dark:shadow-none relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-indigo-100/60 via-purple-50/30 to-transparent dark:from-indigo-900/20 dark:via-transparent -z-10 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

                <div>
                    <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 tracking-tighter">Support Requests</h2>
                    <p className="text-sm font-semibold text-slate-500 dark:text-base-400 mt-1 uppercase tracking-widest">ศูนย์แจ้งปัญหาและร้องขอความช่วยเหลือ</p>
                </div>

                {/* Avatar Group Leaderboard */}
                <div className="flex-1 flex gap-5 overflow-x-auto no-scrollbar pb-2 xl:pb-0 items-center xl:justify-center w-full xl:w-auto">
                    {leaderboard.length > 0 && (
                        <>
                            <div className="flex items-center gap-3 pr-5 border-r-2 border-slate-100 dark:border-base-800">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 leading-tight">HEROES</h3>
                                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Top Solvers</p>
                                </div>
                            </div>
                            <div className="flex -space-x-3 hover:space-x-2 transition-all duration-300 py-2">
                                {leaderboard.map((item, index) => {
                                    const initials = item.tester?.name?.substring(0, 2).toUpperCase() || 'NA';
                                    const colors = [
                                        'bg-gradient-to-b from-amber-300 to-orange-500 text-white border-white dark:border-base-900',
                                        'bg-gradient-to-b from-slate-300 to-slate-500 text-white border-white dark:border-base-900',
                                        'bg-gradient-to-b from-orange-300 to-rose-500 text-white border-white dark:border-base-900',
                                        'bg-gradient-to-b from-indigo-300 to-indigo-500 text-white border-white dark:border-base-900',
                                        'bg-gradient-to-b from-emerald-300 to-teal-500 text-white border-white dark:border-base-900',
                                    ];
                                    const colorClass = colors[index] || colors[4];
                                    return (
                                        <div 
                                            key={item.tester?.id} 
                                            className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xs font-black tracking-wider border-[3px] shadow-md ${colorClass} hover:z-10 hover:scale-110 transition-transform cursor-pointer group`}
                                            title={`${item.tester?.name}: ${item.count} tasks solved`}
                                        >
                                            {initials}
                                            <div className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 bg-white dark:bg-base-800 rounded-full flex items-center justify-center text-[10px] text-slate-800 dark:text-base-200 font-bold border-2 border-white dark:border-base-900 shadow-sm">
                                                {item.count}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto shrink-0">
                    <button
                        onClick={exportToCSV}
                        className="px-6 py-3.5 bg-white dark:bg-base-900 border-2 border-slate-200 dark:border-base-700 hover:border-slate-800 hover:text-slate-900 text-slate-700 dark:text-base-300 font-black tracking-widest text-sm rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0 uppercase"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
                        </svg>
                        Export CSV
                    </button>
                    <button 
                        onClick={() => { setEditingRequest({ status: 'pending' }); setIsModalOpen(true); }}
                        className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-sm tracking-widest uppercase rounded-2xl shadow-xl shadow-indigo-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0"
                    >
                        <PlusIcon className="w-5 h-5" /> สร้างรายการใหม่
                    </button>
                </div>
            </div>

            {/* Main Area: Requests List */}
            <div className="space-y-6">

                {requests.length === 0 ? (
                    <div className="bg-white dark:bg-base-900 p-16 rounded-[2rem] text-center border border-slate-200/60 dark:border-base-800 flex flex-col items-center justify-center text-slate-400">
                        <div className="w-24 h-24 bg-slate-50 dark:bg-base-800 rounded-full flex items-center justify-center mb-6">
                            <ChatBubbleLeftIcon className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="font-black text-2xl text-slate-700 dark:text-slate-300 mb-2">ไม่มีรายการแจ้งปัญหา</p>
                        <p className="text-base font-medium">ศูนย์ช่วยเหลือเคลียร์หมดแล้ว เยี่ยมไปเลย!</p>
                    </div>
                ) : (
                    <>
                        {/* Tab Navigation */}
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 pt-2 items-center">
                            {(['pending', 'acknowledged', 'in_progress', 'done'] as SupportRequestStatus[]).map(s => {
                                const count = requests.filter(r => r.status === s).length;
                                const isSelected = activeTab === s;
                                const StatusIcon = SUPPORT_STATUS_MAP[s].icon;
                                
                                const gradients: Record<SupportRequestStatus, string> = {
                                    pending: 'from-amber-500 to-orange-500 shadow-orange-500/30 border-transparent text-white',
                                    acknowledged: 'from-sky-500 to-blue-500 shadow-blue-500/30 border-transparent text-white',
                                    in_progress: 'from-indigo-500 to-violet-500 shadow-indigo-500/30 border-transparent text-white',
                                    done: 'from-emerald-500 to-teal-500 shadow-emerald-500/30 border-transparent text-white'
                                };
                                const unselectedColors: Record<SupportRequestStatus, string> = {
                                    pending: 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-400 dark:hover:bg-amber-900/40',
                                    acknowledged: 'text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/20 dark:border-sky-800/50 dark:text-sky-400 dark:hover:bg-sky-900/40',
                                    in_progress: 'text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:text-indigo-400 dark:hover:bg-indigo-900/40',
                                    done: 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/50 dark:text-emerald-400 dark:hover:bg-emerald-900/40',
                                };
                                const bgGradient = gradients[s];
                                const unselColor = unselectedColors[s];
                                
                                return (
                                    <button 
                                        key={s} 
                                        onClick={() => setActiveTab(s)} 
                                        className={`px-6 py-3.5 rounded-2xl text-[13px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-3 border-2 shadow-sm hover:-translate-y-0.5 active:translate-y-0 ${isSelected ? `bg-gradient-to-r ${bgGradient} shadow-lg` : unselColor}`}
                                    >
                                        <StatusIcon className="w-5 h-5" />
                                        {SUPPORT_STATUS_MAP[s].label}
                                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] ${isSelected ? 'bg-white/30 text-white' : 'bg-white/80 dark:bg-black/20'}`}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* List Area */}
                        <div className="flex flex-col gap-4">
                            {(() => {
                                const filteredRequests = requests.filter(r => r.status === activeTab);
                                
                                if (filteredRequests.length === 0) {
                                    return (
                                        <div className="p-16 text-center border-2 border-dashed border-slate-200 dark:border-base-800 bg-white/50 dark:bg-base-900/50 rounded-[2rem] text-slate-400 flex flex-col items-center justify-center gap-4">
                                            <InformationCircleIcon className="w-16 h-16 opacity-20" />
                                            <div className="font-bold text-lg text-slate-500 dark:text-base-500">ไม่มีรายการในหมวดหมู่นี้</div>
                                        </div>
                                    );
                                }

                                return filteredRequests.map(req => {
                                    const statusInfo = SUPPORT_STATUS_MAP[req.status];
                                    const StatusIcon = statusInfo.icon;
                                    const isUnassigned = !req.assigneeId;
                                    let assigneeName = 'รอการตอบรับ';
                                    if (req.assigneeId) {
                                        const t = testers.find(x => x.id === req.assigneeId);
                                        if (t) assigneeName = t.name;
                                    }
                                    
                                    return (
                                        <div key={req.id} className={`group bg-white dark:bg-base-900 border transition-all shadow-sm hover:shadow-xl flex flex-col lg:flex-row items-start lg:items-center p-5 gap-5 lg:gap-8 rounded-[1.5rem] ${req.status === 'done' ? 'border-slate-100 dark:border-base-800/50 opacity-70 hover:opacity-100' : 'border-slate-200/80 dark:border-base-800 hover:border-indigo-300 dark:hover:border-indigo-700/50'}`}>
                                            
                                            {/* Status Badge */}
                                            <div className="w-full lg:w-44 shrink-0">
                                                <span className={`inline-flex px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest items-center gap-2 w-fit ${statusInfo.color}`}>
                                                    <StatusIcon className="w-4 h-4" />
                                                    {statusInfo.label}
                                                </span>
                                            </div>

                                            {/* Title & Desc */}
                                            <div className="flex-1 min-w-0 w-full pl-2 lg:pl-0 border-l-[3px] border-indigo-100 dark:border-base-800 lg:border-l-0 ml-2 lg:ml-0">
                                                <h3 className="text-[18px] font-black text-slate-900 dark:text-white mb-1.5 leading-snug">{req.title}</h3>
                                                {req.description ? (
                                                    <p className="text-[15px] font-medium text-slate-600 dark:text-base-300 line-clamp-1">{req.description}</p>
                                                ) : (
                                                    <p className="text-[15px] font-medium text-slate-400 dark:text-base-500 italic opacity-60">ไม่มีรายละเอียดเพิ่มเติม</p>
                                                )}
                                            </div>

                                            {/* Users Info */}
                                            <div className="flex flex-row lg:flex-col gap-4 lg:gap-4 w-full lg:w-72 shrink-0 bg-slate-50/50 dark:bg-base-800/30 p-4 lg:p-0 lg:bg-transparent rounded-2xl lg:rounded-none">
                                                <div className="flex items-center gap-3 flex-1 lg:flex-auto">
                                                    <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-extrabold text-[11px] uppercase shrink-0 border border-indigo-200 dark:border-indigo-700/50 shadow-sm">
                                                        {req.requesterName.substring(0,2)}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] uppercase tracking-widest font-black text-indigo-600 dark:text-indigo-400 mb-0.5">ผู้แจ้ง (Requester)</span>
                                                        <span className="text-slate-900 dark:text-white truncate font-black text-[15px]">{req.requesterName}</span>
                                                    </div>
                                                </div>
                                                <div className={`flex items-center gap-3 flex-1 lg:flex-auto ${isUnassigned && req.status !== 'done' ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-[11px] uppercase shrink-0 border shadow-sm ${isUnassigned && req.status !== 'done' ? 'bg-rose-100 border-rose-200 text-rose-700 dark:bg-rose-900/50 dark:border-rose-800 dark:text-rose-400' : 'bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-900/50 dark:border-emerald-800 dark:text-emerald-400'}`}>
                                                        {isUnassigned ? '?' : assigneeName.substring(0,2)}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className={`text-[10px] uppercase tracking-widest font-black mb-0.5 ${isUnassigned && req.status !== 'done' ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>ผู้รับเรื่อง (Assignee)</span>
                                                        <span className={`truncate font-black text-[15px] ${isUnassigned ? 'italic opacity-80' : ''}`}>{assigneeName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Date */}
                                            <div className="hidden xl:flex items-center gap-2 w-32 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                <div className="p-2 rounded-lg bg-slate-50 dark:bg-base-800">
                                                    <ClockIcon className="w-4 h-4" />
                                                </div>
                                                <span className="leading-tight bg-slate-50 dark:bg-base-800 px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-base-400">{new Date(req.createdAt).toLocaleString('th-TH', { Math: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(' ', '\n')}</span>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 w-full lg:w-auto mt-2 lg:mt-0 justify-end shrink-0 transition-opacity items-center">
                                                {req.status !== 'done' && (
                                                    <div className="relative">
                                                        <select 
                                                            className="flex-1 w-full lg:w-48 bg-white dark:bg-base-900 hover:bg-slate-50 dark:hover:bg-base-800 border-2 border-slate-300 dark:border-base-600 outline-none text-[14px] font-black tracking-wide rounded-xl pl-4 pr-10 py-3 cursor-pointer focus:border-indigo-600 focus:ring-0 transition-colors text-slate-900 dark:text-white appearance-none shadow-sm"
                                                            value={req.status}
                                                            onChange={(e) => handleStatusChange(req, e.target.value as SupportRequestStatus)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900" value="pending">รอ / Pending</option>
                                                            <option className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900" value="acknowledged">รับเรื่อง / Ack</option>
                                                            <option className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900" value="in_progress">กำลังทำ / In Prog.</option>
                                                            <option className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900" value="done">ปิดงาน / Done</option>
                                                        </select>
                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 dark:text-slate-400">
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex gap-2 ml-auto">
                                                    <button onClick={() => { setEditingRequest(req); setIsModalOpen(true); }} className="p-2.5 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 rounded-xl transition-all hover:scale-105 active:scale-95" title="Edit Request">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                                        </svg>
                                                    </button>
                                                    <button onClick={() => req.id && setRequestToDelete(req.id)} className="p-2.5 text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 rounded-xl transition-all hover:scale-105 active:scale-95" title="Delete Request">
                                                        <TrashIcon className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </>
                )}
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-8 py-6 border-b border-base-200 dark:border-base-800 flex justify-between items-center bg-base-50/50 dark:bg-base-800/20">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{editingRequest?.id ? 'แก้ไขรายการ' : 'แจ้งเรื่องใหม่'}</h3>
                                <p className="text-xs font-bold text-base-500 uppercase tracking-widest mt-1">Support Request</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-base-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-white dark:bg-base-800 p-2 rounded-full shadow-sm border border-base-200 dark:border-base-700"><XCircleIcon className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="p-8 overflow-y-auto no-scrollbar">
                            <form id="support-form" onSubmit={handleSave} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-2 ml-1">เรื่อง / ปัญหา / สิ่งที่ต้องการ <span className="text-rose-500">*</span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <InformationCircleIcon className="w-5 h-5 text-indigo-500" />
                                        </div>
                                        <input 
                                            type="text" 
                                            required 
                                            className="w-full bg-white dark:bg-base-900 border-2 border-slate-300 dark:border-base-600 rounded-xl pl-12 pr-4 py-3.5 text-base font-bold text-slate-900 dark:text-white focus:border-indigo-600 focus:ring-0 shadow-sm transition-colors placeholder:text-slate-400"
                                            placeholder="เช่น กระดาษกรองหมด, เครื่องชั่งเสีย..."
                                            value={editingRequest?.title || ''}
                                            onChange={e => setEditingRequest({...editingRequest, title: e.target.value})}
                                        />
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-2 ml-1">รายละเอียดและข้อมูลเพิ่มเติม</label>
                                    <div className="relative">
                                        <textarea 
                                            className="w-full bg-white dark:bg-base-900 border-2 border-slate-300 dark:border-base-600 rounded-xl px-4 py-3.5 text-[15px] font-medium text-slate-900 dark:text-white focus:border-indigo-600 focus:ring-0 shadow-sm transition-colors placeholder:text-slate-400 min-h-[120px] resize-none"
                                            placeholder="ระบุรายละเอียดย่อย หรือตำแหน่งของจุดที่มีปัญหา ฯลฯ"
                                            value={editingRequest?.description || ''}
                                            onChange={e => setEditingRequest({...editingRequest, description: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800/50">
                                    <div>
                                        <label className="block text-[11px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-2 ml-1">ชื่อผู้แจ้ง <span className="text-rose-500">*</span></label>
                                        <select 
                                            required 
                                            className="w-full bg-white dark:bg-base-900 border-2 border-slate-300 dark:border-base-600 focus:border-indigo-600 rounded-xl px-4 py-3 text-[15px] font-bold text-slate-900 dark:text-white transition-colors cursor-pointer shadow-sm max-h-[48px]"
                                            value={editingRequest?.requesterName || ''}
                                            onChange={e => setEditingRequest({...editingRequest, requesterName: e.target.value})}
                                        >
                                            <option value="" className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900">-- เลือกชื่อผู้แจ้ง --</option>
                                            {testers.map(t => (
                                                <option key={t.id} value={t.name} className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900">{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-[11px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-2 ml-1">มอบหมายให้ (Assignee)</label>
                                        <select 
                                            className="w-full bg-white dark:bg-base-900 border-2 border-slate-300 dark:border-base-600 focus:border-indigo-600 rounded-xl px-4 py-3 text-[15px] font-bold text-slate-900 dark:text-white transition-colors cursor-pointer shadow-sm max-h-[48px]"
                                            value={editingRequest?.assigneeId || ''}
                                            onChange={e => setEditingRequest({...editingRequest, assigneeId: e.target.value || null})}
                                        >
                                            <option value="" className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900">-- ยังไม่มีผู้รับผิดชอบ --</option>
                                            {testers.map(t => (
                                                <option key={t.id} value={t.id} className="font-bold text-slate-900 dark:text-white bg-white dark:bg-base-900">{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                
                                {editingRequest?.id && (
                                    <div>
                                        <label className="block text-[10px] font-black text-base-500 uppercase tracking-widest mb-1.5 ml-1">สถานะ</label>
                                        <div className="flex gap-2">
                                            {(['pending', 'acknowledged', 'in_progress', 'done'] as SupportRequestStatus[]).map(s => {
                                                const sel = editingRequest.status === s;
                                                return (
                                                    <button 
                                                        key={s} 
                                                        type="button" 
                                                        onClick={() => setEditingRequest({...editingRequest, status: s})}
                                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sel ? 'bg-indigo-600 text-white shadow-md' : 'bg-base-100 text-base-500 hover:bg-base-200'}`}
                                                    >
                                                        {SUPPORT_STATUS_MAP[s].label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                        
                        <div className="p-6 bg-base-50 dark:bg-base-800/50 border-t border-base-200 dark:border-base-800 flex justify-end gap-3 shrink-0">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 font-bold text-base-500 hover:text-base-900 dark:hover:text-white transition-colors">Cancel</button>
                            <button type="submit" form="support-form" className="px-8 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30">Save Request</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {requestToDelete && (
                <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in" onClick={() => setRequestToDelete(null)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2rem] w-full max-w-sm shadow-2xl p-8 text-center" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <TrashIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">ยืนยันการลบ?</h3>
                        <p className="text-sm font-medium text-base-500 mb-8">คุณแน่ใจหรือไม่ว่าต้องการลบรายการแจ้งปัญหานี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setRequestToDelete(null)} className="px-6 py-2.5 font-bold text-base-500 hover:text-base-900 dark:hover:text-white transition-colors">ยกเลิก</button>
                            <button onClick={() => handleDelete(requestToDelete)} className="px-6 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-500/30">ลบรายการ</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification */}
            {notification && (
                <div className="fixed bottom-8 right-8 z-[200] animate-slide-up">
                    <div className={`px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ${notification.isError ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
                        {notification.isError ? <XCircleIcon className="w-5 h-5" /> : <CheckCircleIcon className="w-5 h-5" />}
                        {notification.message}
                        <button onClick={() => setNotification(null)} className="ml-4 opacity-70 hover:opacity-100"><XCircleIcon className="w-4 h-4" /></button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RequestsTab;
