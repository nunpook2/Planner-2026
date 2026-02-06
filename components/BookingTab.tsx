
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Tester, Booking } from '../types';
import { getBookings, getBookingsRange, addBooking, deleteBooking, updateBooking } from '../services/dataService';
import { 
    CalendarIcon, PlusIcon, TrashIcon, UserCircleIcon, 
    ClockIcon, ChevronDownIcon, CheckCircleIcon, XCircleIcon, 
    UserGroupIcon, RefreshIcon, PencilIcon 
} from './common/Icons';

interface BookingTabProps {
    testers: Tester[];
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08:00 to 18:00
const HOUR_WIDTH = 160; // Increased width for better visibility
const ROW_HEIGHT = 100;  // Increased height to fit details

// --- Helper Functions ---
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const calculateEndTime = (start: string, duration: number) => {
    const [h, m] = start.split(':').map(Number);
    const totalMinutes = h * 60 + m + duration;
    const newH = Math.floor(totalMinutes / 60);
    const newM = totalMinutes % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    return `${h}:${m}`;
};

// --- Components ---

const BookingModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (booking: Omit<Booking, 'id'>) => void;
    testers: Tester[];
    initialDate: string;
    initialTesterId?: string;
    initialStartTime?: string;
    editingBooking: Booking | null;
    existingBookings: Booking[];
}> = ({ isOpen, onClose, onSave, testers, initialDate, initialTesterId, initialStartTime, editingBooking, existingBookings }) => {
    const [resourceId, setResourceId] = useState(initialTesterId || '');
    const [customerName, setCustomerName] = useState('');
    const [description, setDescription] = useState('');
    const [startTime, setStartTime] = useState(initialStartTime || '09:00');
    const [duration, setDuration] = useState('60'); // Minutes
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (editingBooking) {
                setResourceId(editingBooking.resourceId);
                setCustomerName(editingBooking.customerName);
                setDescription(editingBooking.description);
                setStartTime(editingBooking.startTime);
                setDuration(editingBooking.durationMinutes.toString());
            } else {
                setResourceId(initialTesterId || (testers.length > 0 ? testers[0].id : ''));
                setCustomerName('');
                setDescription('');
                setStartTime(initialStartTime || '09:00');
                setDuration('60');
            }
            setError(null);
        }
    }, [isOpen, initialTesterId, initialStartTime, testers, editingBooking]);

    const handleSubmit = () => {
        if (!resourceId || !customerName || !startTime) {
            setError("Please fill in all required fields.");
            return;
        }

        // Conflict Detection (Simple)
        const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
        const endMinutes = startMinutes + parseInt(duration);
        
        const hasConflict = existingBookings.some(b => {
            if (editingBooking && b.id === editingBooking.id) return false; // Ignore self when editing
            if (b.resourceId !== resourceId) return false;
            const targetDate = editingBooking ? editingBooking.date : initialDate; // Use editing date or initial
            if (b.date !== targetDate) return false;

            const bStart = parseInt(b.startTime.split(':')[0]) * 60 + parseInt(b.startTime.split(':')[1]);
            const bEnd = bStart + b.durationMinutes;
            return (startMinutes < bEnd && endMinutes > bStart);
        });

        if (hasConflict) {
            setError("This time slot overlaps with an existing booking.");
            return;
        }

        const tester = testers.find(t => t.id === resourceId);
        onSave({
            resourceId,
            resourceName: tester?.name || 'Unknown',
            date: editingBooking ? editingBooking.date : initialDate, // Preserve date on edit
            startTime,
            durationMinutes: parseInt(duration),
            customerName,
            description
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg border border-white/20 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-base-100 dark:border-base-800 bg-indigo-50/50 dark:bg-indigo-900/20 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-indigo-900 dark:text-indigo-100 tracking-tighter uppercase">{editingBooking ? 'Edit Reservation' : 'New Reservation'}</h3>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1">Special Customer Booking</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-800 rounded-xl transition-colors"><XCircleIcon className="h-6 w-6 text-indigo-400"/></button>
                </div>
                
                <div className="p-8 space-y-5">
                    {error && <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>{error}</div>}
                    
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-base-400 uppercase tracking-widest ml-1">Staff Member</label>
                        <select value={resourceId} onChange={e => setResourceId(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white focus:border-indigo-500 transition-all">
                            {testers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.team === 'assistants_4_2' ? 'Assistant' : 'Tester'})</option>)}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-base-400 uppercase tracking-widest ml-1">Customer Name</label>
                        <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Who is booking?" className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white focus:border-indigo-500 transition-all" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-base-400 uppercase tracking-widest ml-1">Start Time</label>
                            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white focus:border-indigo-500 transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-base-400 uppercase tracking-widest ml-1">Duration</label>
                            <select value={duration} onChange={e => setDuration(e.target.value)} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white focus:border-indigo-500 transition-all">
                                <option value="30">30 Mins</option>
                                <option value="60">1 Hour</option>
                                <option value="90">1.5 Hours</option>
                                <option value="120">2 Hours</option>
                                <option value="180">3 Hours</option>
                                <option value="240">4 Hours</option>
                                <option value="480">Full Day (8h)</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-base-400 uppercase tracking-widest ml-1">Task Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What needs to be done?" rows={3} className="w-full p-4 bg-base-50 dark:bg-base-800 border-2 border-base-100 dark:border-base-700 rounded-2xl outline-none font-bold text-sm dark:text-white focus:border-indigo-500 transition-all resize-none" />
                    </div>
                </div>

                <div className="p-8 border-t border-base-100 dark:border-base-800 flex gap-3 bg-base-50/30">
                    <button onClick={handleSubmit} className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 uppercase text-[11px] tracking-widest transition-all">{editingBooking ? 'Update Booking' : 'Confirm Booking'}</button>
                    <button onClick={onClose} className="px-8 py-4 text-[11px] font-black text-base-400 uppercase tracking-widest hover:text-base-800">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const MonthView: React.FC<{
    currentDate: Date;
    bookings: Booking[];
    onDayClick: (date: string) => void;
    onMonthChange: (direction: 'prev' | 'next') => void;
}> = ({ currentDate, bookings, onDayClick, onMonthChange }) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const renderDays = () => {
        const days = [];
        // Empty slots for start of month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-32 md:h-44 bg-base-50/30 dark:bg-base-900/30 rounded-[1.8rem]"></div>);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayBookings = bookings.filter(b => b.date === dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            days.push(
                <div 
                    key={d} 
                    onClick={() => onDayClick(dateStr)}
                    className={`h-auto min-h-[160px] p-3 rounded-[1.8rem] border transition-all duration-300 cursor-pointer group flex flex-col relative overflow-hidden
                        ${isToday 
                            ? 'bg-white dark:bg-zinc-800 border-amber-400 shadow-lg ring-1 ring-amber-400 z-10' 
                            : 'bg-white dark:bg-base-800 border-base-100 dark:border-base-700 hover:border-amber-300 hover:shadow-xl hover:-translate-y-1'
                        }
                    `}
                >
                    <div className="flex justify-between items-center mb-3 shrink-0 px-1">
                        <span className={`text-xl font-black tracking-tight ${isToday ? 'text-amber-500' : 'text-base-300 dark:text-base-600'}`}>{d}</span>
                        {dayBookings.length > 0 && (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${isToday ? 'bg-amber-500 text-white shadow-md' : 'bg-base-100 dark:bg-base-700 text-base-500 dark:text-base-400'}`}>
                                {dayBookings.length}
                            </span>
                        )}
                    </div>
                    
                    <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2">
                        {dayBookings.map((b, i) => (
                            <div 
                                key={i} 
                                className="relative flex flex-col p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border-l-[4px] border-l-amber-400 border-y border-r border-slate-200 dark:border-zinc-700 shadow-sm hover:shadow-md hover:translate-x-0.5 transition-all duration-200 group/card"
                            >
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <div className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 flex items-center gap-1.5 shadow-sm">
                                        <ClockIcon className="h-3.5 w-3.5 text-amber-500" />
                                        <span className="font-mono text-[10px] font-black text-slate-700 dark:text-slate-200 tracking-tight">
                                            {formatTime(b.startTime)} - {calculateEndTime(b.startTime, b.durationMinutes)}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="pl-0.5">
                                    <span className="block truncate text-[12px] font-black text-slate-800 dark:text-white leading-tight">
                                        {b.customerName}
                                    </span>
                                    {b.description && (
                                        <span className="block truncate text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                                            {b.description}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return days;
    };

    return (
        <div className="flex flex-col h-full bg-white/50 dark:bg-base-900/50 rounded-[2.5rem] border border-base-200 dark:border-base-800 shadow-xl overflow-hidden p-6">
            <div className="flex justify-between items-center mb-6 px-2">
                <button onClick={() => onMonthChange('prev')} className="p-2 hover:bg-white rounded-xl shadow-sm text-base-500 transition-all border border-transparent hover:border-base-200"><ChevronDownIcon className="h-5 w-5 rotate-90" /></button>
                <h3 className="text-xl font-black text-base-900 dark:text-white uppercase tracking-tight">{monthName}</h3>
                <button onClick={() => onMonthChange('next')} className="p-2 hover:bg-white rounded-xl shadow-sm text-base-500 transition-all border border-transparent hover:border-base-200"><ChevronDownIcon className="h-5 w-5 -rotate-90" /></button>
            </div>
            
            <div className="grid grid-cols-7 text-center mb-3">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <span key={day} className="text-[11px] font-black text-base-400 uppercase tracking-widest">{day}</span>
                ))}
            </div>
            
            <div className="grid grid-cols-7 gap-3 overflow-y-auto custom-scrollbar flex-grow p-1">
                {renderDays()}
            </div>
        </div>
    );
};

const BookingTab: React.FC<BookingTabProps> = ({ testers }) => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
    const [monthViewDate, setMonthViewDate] = useState(new Date()); 
    
    const [bookings, setBookings] = useState<Booking[]>([]); 
    const [monthBookings, setMonthBookings] = useState<Booking[]>([]); 
    
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalConfig, setModalConfig] = useState<{ testerId?: string, startTime?: string }>({});
    const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    useEffect(() => {
        setMonthViewDate(new Date(selectedDate));
    }, []);

    const fetchDayBookings = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getBookings(selectedDate);
            setBookings(data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [selectedDate]);

    const fetchMonthBookings = useCallback(async () => {
        setLoading(true);
        try {
            const year = monthViewDate.getFullYear();
            const month = monthViewDate.getMonth();
            const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${getDaysInMonth(year, month)}`;
            const data = await getBookingsRange(startDate, endDate);
            setMonthBookings(data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [monthViewDate]);

    useEffect(() => {
        if (viewMode === 'day') fetchDayBookings();
        else fetchMonthBookings();
    }, [fetchDayBookings, fetchMonthBookings, viewMode]);

    const handleSaveBooking = async (bookingData: Omit<Booking, 'id'>) => {
        try {
            if (editingBooking) {
                await updateBooking(editingBooking.id, bookingData);
            } else {
                await addBooking(bookingData);
            }
            if (viewMode === 'day') fetchDayBookings(); else fetchMonthBookings();
        } catch (e) { console.error(e); }
    };

    const handleDeleteBooking = async (id: string) => {
        try {
            await deleteBooking(id);
            setDeleteConfirmId(null);
            fetchDayBookings(); 
        } catch (e) { console.error(e); }
    };

    const openModal = (testerId?: string, startTime?: string) => {
        setEditingBooking(null);
        setModalConfig({ testerId, startTime });
        setIsModalOpen(true);
    };

    const handleEditBooking = (booking: Booking) => {
        setEditingBooking(booking);
        setModalConfig({ testerId: booking.resourceId, startTime: booking.startTime });
        setIsModalOpen(true);
    };

    const handleMonthChange = (direction: 'prev' | 'next') => {
        const newDate = new Date(monthViewDate);
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        setMonthViewDate(newDate);
    };

    const handleDayClickFromMonth = (dateStr: string) => {
        setSelectedDate(dateStr);
        setViewMode('day');
    };

    // Calculate position and width for a booking block
    const getBlockStyle = (startTime: string, durationMinutes: number) => {
        const [h, m] = startTime.split(':').map(Number);
        const startMinute = (h - 8) * 60 + m; // Minutes from 08:00
        const pixelsPerMinute = HOUR_WIDTH / 60;
        
        const left = startMinute * pixelsPerMinute;
        const width = durationMinutes * pixelsPerMinute;
        
        return { left: `${left}px`, width: `${width}px` };
    };

    const formatTime = (time: string) => {
        const [h, m] = time.split(':');
        return `${h}:${m}`;
    };

    const calculateEndTime = (start: string, duration: number) => {
        const [h, m] = start.split(':').map(Number);
        const totalMinutes = h * 60 + m + duration;
        const newH = Math.floor(totalMinutes / 60);
        const newM = totalMinutes % 60;
        return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    };

    // Group testers by team
    const analysts = useMemo(() => testers.filter(t => t.team !== 'assistants_4_2').sort((a, b) => a.name.localeCompare(b.name)), [testers]);
    const assistants = useMemo(() => testers.filter(t => t.team === 'assistants_4_2').sort((a, b) => a.name.localeCompare(b.name)), [testers]);

    const renderTesterRow = (tester: Tester, index: number) => (
        <div key={tester.id} className={`flex border-b border-slate-200 dark:border-base-700 hover:bg-indigo-50/10 transition-colors group/row ${index % 2 === 0 ? 'bg-white dark:bg-base-900' : 'bg-slate-50/50 dark:bg-base-800/20'}`} style={{ height: `${ROW_HEIGHT}px` }}>
            {/* Tester Info Column (Sticky Left) */}
            <div className="w-56 shrink-0 p-4 border-r-2 border-slate-200 dark:border-base-700 bg-white dark:bg-base-900 sticky left-0 z-30 flex items-center gap-4 shadow-[4px_0_15px_-5px_rgba(0,0,0,0.05)]">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white shadow-md ${tester.team === 'assistants_4_2' ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                    {tester.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                    <span className="block text-[13px] font-black text-slate-800 dark:text-base-100 truncate">{tester.name}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tester.team === 'assistants_4_2' ? 'Assistant' : 'Analyst'}</span>
                </div>
            </div>

            {/* Timeline Grid Cells */}
            <div className="relative flex-grow h-full">
                {/* Grid Lines */}
                {HOURS.map((_, i) => (
                    <div 
                        key={i} 
                        className="absolute top-0 bottom-0 border-l border-slate-200 dark:border-base-700/50 hover:bg-indigo-500/5 transition-colors cursor-pointer group-hover/row:border-slate-300" 
                        style={{ left: `${i * HOUR_WIDTH}px`, width: `${HOUR_WIDTH}px` }}
                        onClick={() => openModal(tester.id, `${String(i + 8).padStart(2, '0')}:00`)}
                        title={`Click to book ${tester.name} at ${String(i + 8).padStart(2, '0')}:00`}
                    ></div>
                ))}

                {/* Bookings */}
                {bookings.filter(b => b.resourceId === tester.id).map(booking => {
                    const style = getBlockStyle(booking.startTime, booking.durationMinutes);
                    const isConfirmingDelete = deleteConfirmId === booking.id;
                    const isAssistant = tester.team === 'assistants_4_2';
                    const iconColor = isAssistant ? 'text-amber-500' : 'text-indigo-500';
                    
                    return (
                        <div 
                            key={booking.id}
                            className={`absolute top-2 bottom-2 rounded-xl p-3 shadow-md flex flex-col justify-between transition-all overflow-hidden cursor-default group/block z-20 hover:z-30 hover:shadow-xl hover:scale-[1.02] border-l-[6px] border-t border-b border-r
                                ${isConfirmingDelete 
                                    ? 'bg-red-600 text-white animate-pulse border-red-700' 
                                    : 'bg-slate-100 dark:bg-zinc-800 border-l-amber-400 border-y-slate-200 border-r-slate-200 dark:border-zinc-700 text-slate-900 shadow-sm'
                                }
                            `}
                            style={style}
                            title={`${booking.customerName} - ${booking.description} (${formatTime(booking.startTime)} - ${calculateEndTime(booking.startTime, booking.durationMinutes)})`}
                        >
                            <div className="flex justify-between items-start">
                                <span className={`text-[14px] font-black uppercase tracking-tight leading-none truncate pr-2 ${isConfirmingDelete ? 'text-white' : 'text-slate-800 dark:text-white'}`}>{booking.customerName}</span>
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover/block:opacity-100 transition-opacity">
                                    {!isConfirmingDelete && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleEditBooking(booking); }}
                                            className="p-1 rounded-full bg-white hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 transition-colors shadow-sm"
                                            title="Edit Booking"
                                        >
                                            <PencilIcon className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isConfirmingDelete) handleDeleteBooking(booking.id);
                                            else setDeleteConfirmId(booking.id);
                                        }}
                                        className={`p-1 rounded-full shadow-sm transition-colors ${isConfirmingDelete ? 'bg-white/20 text-white hover:bg-white/40 opacity-100' : 'bg-white hover:bg-red-100 text-slate-400 hover:text-red-500'}`}
                                        title="Delete Booking"
                                    >
                                        {isConfirmingDelete ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <TrashIcon className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                            </div>
                            
                            {booking.description && (
                                <div className={`text-[11px] font-medium truncate leading-tight ${isConfirmingDelete ? 'text-white/80' : 'text-slate-500'}`}>
                                    {booking.description}
                                </div>
                            )}

                            <div className={`flex items-center gap-1.5 mt-auto pt-1 border-t ${isConfirmingDelete ? 'border-white/20 text-white/90' : 'border-slate-200 dark:border-zinc-700 text-slate-500'}`}>
                                <ClockIcon className={`h-3 w-3 ${isConfirmingDelete ? 'text-white' : 'text-amber-500'}`} />
                                <span className="text-[10px] font-bold">{formatTime(booking.startTime)} - {calculateEndTime(booking.startTime, booking.durationMinutes)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const renderSectionHeader = (title: string, colorClass: string, bgClass: string) => (
        <div className="flex sticky left-0 z-30">
            <div className={`w-56 shrink-0 p-3 border-r-2 border-slate-200 dark:border-base-700 ${bgClass} flex items-center justify-center`}>
                <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${colorClass}`}>{title}</span>
            </div>
            <div className={`flex-grow h-10 ${bgClass} border-b border-slate-200 dark:border-base-700 opacity-50`}></div>
        </div>
    );

    return (
        <div className="h-full flex flex-col space-y-6 p-6 animate-fade-in bg-base-50/20 dark:bg-transparent overflow-hidden">
            <BookingModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={handleSaveBooking} 
                testers={testers} 
                initialDate={selectedDate}
                initialTesterId={modalConfig.testerId}
                initialStartTime={modalConfig.startTime}
                editingBooking={editingBooking}
                existingBookings={viewMode === 'day' ? bookings : monthBookings.filter(b => b.date === (editingBooking ? editingBooking.date : selectedDate))}
            />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 bg-white/60 dark:bg-base-900/60 p-4 rounded-[2rem] border border-white dark:border-base-800 shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg text-white"><ClockIcon className="h-6 w-6" /></div>
                    <div>
                        <h2 className="text-2xl font-black text-base-955 dark:text-base-50 tracking-tighter uppercase leading-none">Special Booking</h2>
                        <p className="text-base-400 font-bold uppercase tracking-[0.3em] text-[10px] mt-1">Customer Reservation Timeline</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex bg-white dark:bg-base-800 p-1 rounded-2xl border-2 border-base-100 dark:border-base-700 shadow-inner">
                        <button 
                            onClick={() => setViewMode('day')}
                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-indigo-600 text-white shadow-md' : 'text-base-400 hover:text-indigo-600'}`}
                        >
                            Day View
                        </button>
                        <button 
                            onClick={() => setViewMode('month')}
                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-base-400 hover:text-indigo-600'}`}
                        >
                            Month View
                        </button>
                    </div>

                    {viewMode === 'day' && (
                        <div className="relative group px-4 py-2 bg-white dark:bg-base-800 rounded-2xl border-2 border-base-100 dark:border-base-700 shadow-inner flex items-center gap-3 animate-fade-in">
                            <CalendarIcon className="h-5 w-5 text-indigo-600" />
                            <input 
                                type="date" 
                                value={selectedDate} 
                                onChange={e => setSelectedDate(e.target.value)} 
                                className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer dark:text-white outline-none"
                            />
                        </div>
                    )}

                    <button onClick={viewMode === 'day' ? fetchDayBookings : fetchMonthBookings} className="p-3 bg-white dark:bg-base-800 rounded-xl border border-base-200 dark:border-base-700 text-base-400 hover:text-indigo-600 shadow-sm transition-all"><RefreshIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
                    
                    {viewMode === 'day' && (
                        <button onClick={() => openModal()} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all active:scale-95 border-b-4 border-indigo-800 animate-fade-in">
                            <PlusIcon className="h-4 w-4" /> New Booking
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            {viewMode === 'day' ? (
                <div className="flex-grow bg-white dark:bg-base-900 rounded-[2.5rem] border border-base-200 dark:border-base-800 shadow-xl overflow-auto flex flex-col relative animate-fade-in">
                    <div className="relative min-w-full">
                        {/* Time Header (Sticky Top) */}
                        <div className="sticky top-0 z-40 flex border-b-2 border-slate-200 dark:border-base-700 bg-white dark:bg-base-900 shadow-md">
                            <div className="w-56 shrink-0 p-4 border-r-2 border-slate-200 dark:border-base-700 flex items-center justify-center bg-slate-50 dark:bg-base-800 sticky left-0 z-50">
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Resource Name</span>
                            </div>
                            <div className="flex-grow relative h-14 bg-slate-50 dark:bg-base-800">
                                {HOURS.map((hour, i) => (
                                    <div key={hour} className="absolute bottom-0 top-0 border-l border-slate-200 dark:border-base-700 flex items-center pl-3" style={{ left: `${i * HOUR_WIDTH}px`, width: `${HOUR_WIDTH}px` }}>
                                        <span className="text-[12px] font-bold text-slate-400">{String(hour).padStart(2, '0')}:00</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Resource Rows - Grouped */}
                        <div style={{ minWidth: `${HOURS.length * HOUR_WIDTH + 224}px` }}>
                            {analysts.length > 0 && renderSectionHeader("Analysts", "text-indigo-600", "bg-indigo-50/50")}
                            {analysts.map((tester, index) => renderTesterRow(tester, index))}
                            
                            {assistants.length > 0 && renderSectionHeader("Assistants", "text-amber-600", "bg-amber-50/50")}
                            {assistants.map((tester, index) => renderTesterRow(tester, index))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-grow animate-fade-in">
                    <MonthView 
                        currentDate={monthViewDate} 
                        bookings={monthBookings} 
                        onDayClick={handleDayClickFromMonth}
                        onMonthChange={handleMonthChange}
                    />
                </div>
            )}
        </div>
    );
};

export default BookingTab;
