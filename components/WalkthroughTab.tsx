import React, { useState, useEffect, useMemo } from 'react';
import { Tester, Walkthrough } from '../types';
import { getWalkthroughs, saveWalkthrough, deleteWalkthrough, acknowledgeWalkthrough } from '../services/dataService';
import { CheckCircleIcon, XCircleIcon, PlusIcon, TrashIcon, DocumentTextIcon, RefreshIcon, BeakerIcon, ChevronDownIcon } from './common/Icons';

const compressImage = (base64Str: string, maxWidth = 1024, maxHeight = 1024): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
                if (width > height) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                } else {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Compress as JPEG with 0.7 quality
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => {
            resolve(base64Str);
        };
    });
};

interface WalkthroughTabProps {
    testers: Tester[];
}

const WalkthroughTab: React.FC<WalkthroughTabProps> = ({ testers }) => {
    const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string, isError?: boolean } | null>(null);

    // Filter sub-tabs: 'pending' (ยังไม่ครบ) or 'completed' (รับทราบครบถ้วนแล้ว)
    const [selectedSubTab, setSelectedSubTab] = useState<'pending' | 'completed'>('pending');

    // Modal view state (controls display of selected walkthrough details)
    const [activeWalkthrough, setActiveWalkthrough] = useState<Walkthrough | null>(null);

    // Delete confirmation state (walkthroughId being confirmed)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Form states
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
    const [imageUrl, setImageUrl] = useState('');
    const [imageType, setImageType] = useState<'upload' | 'url'>('upload');
    const [isUploading, setIsUploading] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);

    // Zoomed image modal state
    const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

    // Load data
    const fetchWalkthroughs = async () => {
        setIsLoading(true);
        try {
            const data = await getWalkthroughs();
            setWalkthroughs(data);
        } catch (error) {
            console.error("Error fetching walkthroughs:", error);
            setNotification({ message: "Failed to load walkthroughs.", isError: true });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchWalkthroughs();
    }, []);

    // Handle image file browse and conversion to Base64 with high-efficiency canvas compression
    const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const rawBase64 = reader.result as string;
            try {
                // Compress image on the fly to maximize speed, save space, and avoid Firestore 1MB document limit
                const compressed = await compressImage(rawBase64);
                setImageUrl(compressed);
                setNotification({ message: "อัปโหลดและปรับขนาดรูปภาพเพื่อประหยัดพื้นที่จัดเก็บสำเร็จ!" });
            } catch (err) {
                console.error("Compression failed, falling back to raw upload:", err);
                setImageUrl(rawBase64);
                setNotification({ message: "อัปโหลดรูปภาพสำเร็จ" });
            } finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => {
            setNotification({ message: "ไม่สามารถอ่านไฟล์รูปภาพได้", isError: true });
            setIsUploading(false);
        };
        reader.readAsDataURL(file);
    };

    // Handle create new walkthrough
    const handleCreateWalkthrough = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            setNotification({ message: "กรุณากรอกทั้งหัวข้อและรายละเอียดให้ครบถ้วน", isError: true });
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (selectedTargets.length === 0) {
            setNotification({ message: "กรุณาเลือกผู้ปฏิบัติงานอย่างน้อย 1 คนเพื่อลงชื่อรับทราบ", isError: true });
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        try {
            const initialAck: Record<string, { acknowledged: boolean }> = {};
            selectedTargets.forEach(tid => {
                initialAck[tid] = { acknowledged: false };
            });

            await saveWalkthrough({
                title: title.trim(),
                content: content.trim(),
                createdAt: new Date().toISOString(),
                createdBy: 'Planner / Administrator',
                targetTesters: selectedTargets,
                acknowledgements: initialAck,
                isCompleted: false,
                imageUrl: imageUrl ? imageUrl.trim() : undefined
            });

            // Reset form
            setTitle('');
            setContent('');
            setSelectedTargets([]);
            setImageUrl('');
            setShowCreateForm(false);
            setNotification({ message: "บันทึกและเผยแพร่ใบงาน walkthrough สำเร็จ!" });
            window.scrollTo({ top: 0, behavior: 'smooth' });
            fetchWalkthroughs();
        } catch (error) {
            console.error("Error creating walkthrough:", error);
            setNotification({ message: "เกิดข้อผิดพลาดในการบันทึกใบงาน", isError: true });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Handle individual shift member sign off
    const handleAcknowledgeForTester = async (walkthroughId: string, testerId: string, testerName: string) => {
        try {
            await acknowledgeWalkthrough(walkthroughId, testerId);
            setNotification({ message: `✍️ ลงนามรับทราบให้คุณ ${testerName} สำเร็จ!` });
            
            // Re-fetch all walkthroughs to update progress
            const updatedData = await getWalkthroughs();
            setWalkthroughs(updatedData);

            // Update the active walkthrough in modal state to show instantly
            const matched = updatedData.find(w => w.id === walkthroughId);
            if (matched) {
                setActiveWalkthrough(matched);
            }
        } catch (error) {
            console.error("Error acknowledging walkthrough:", error);
            setNotification({ message: `ไม่สามารถลงนามให้กับคุณ ${testerName} ได้`, isError: true });
        }
    };

    // Handle delete walkthrough
    const handleDeleteWalkthrough = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent modal trigger
        try {
            await deleteWalkthrough(id);
            setNotification({ message: "ลบเอกสารแจ้งเตือน walkthrough เรียบร้อยแล้ว" });
            setConfirmDeleteId(null);
            fetchWalkthroughs();
            if (activeWalkthrough?.id === id) {
                setActiveWalkthrough(null);
            }
        } catch (error) {
            console.error("Error deleting walkthrough:", error);
            setNotification({ message: "เกิดข้อผิดพลาดในการลบเอกสาร", isError: true });
        }
    };

    // Target personnel selection helpers
    const handleSelectAll = () => {
        setSelectedTargets(testers.map(t => t.id));
    };

    const handleSelectTestersOnly = () => {
        setSelectedTargets(testers.filter(t => t.team === 'testers_3_3').map(t => t.id));
    };

    const handleSelectAssistantsOnly = () => {
        setSelectedTargets(testers.filter(t => t.team === 'assistants_4_2').map(t => t.id));
    };

    const handleClearTargets = () => {
        setSelectedTargets([]);
    };

    const toggleTarget = (id: string) => {
        setSelectedTargets(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    // Separation of walkthroughs based on completion status
    const pendingWalkthroughs = useMemo(() => {
        return walkthroughs.filter(w => !w.isCompleted);
    }, [walkthroughs]);

    const completedWalkthroughs = useMemo(() => {
        return walkthroughs.filter(w => w.isCompleted);
    }, [walkthroughs]);

    // Active displayed list
    const displayedWalkthroughs = selectedSubTab === 'pending' ? pendingWalkthroughs : completedWalkthroughs;

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto pb-24" id="walkthrough-tab-container">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-base-800 pb-5">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                        <span className="p-1.5 bg-primary-100 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300 rounded-lg">📢</span>
                        <span>Method & Policy Walkthrough</span>
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mt-1">
                        จัดการขั้นตอนการปฏิบัติงานที่ปรับปรุงใหม่ สื่อสารนโยบายห้องปฏิบัติการ และลงนามรับทราบกะงาน
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            setShowCreateForm(!showCreateForm);
                            if (!showCreateForm) {
                                // reset form
                                setTitle('');
                                setContent('');
                                setImageUrl('');
                                setSelectedTargets([]);
                            }
                        }}
                        className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 ${
                            showCreateForm 
                                ? 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-base-800 dark:text-white' 
                                : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-primary-500/15'
                        }`}
                    >
                        {showCreateForm ? 'แสดงรายการใบงาน' : <><PlusIcon className="h-4 w-4" /> สร้างใบงานใหม่</>}
                    </button>
                </div>
            </div>

            {/* Notification */}
            {notification && (
                <div className={`p-4 rounded-2xl flex items-center justify-between border shadow-sm animate-fade-in ${
                    notification.isError 
                        ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-300' 
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300'
                }`}>
                    <span className="text-sm font-bold flex items-center gap-2">
                        {notification.isError ? '⚠️' : '✅'} {notification.message}
                    </span>
                    <button onClick={() => setNotification(null)} className="p-1 hover:opacity-60 transition-opacity">
                        <XCircleIcon className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Content Section */}
            {showCreateForm ? (
                /* CREATE FORM */
                <div className="bg-white dark:bg-base-900 rounded-[2rem] border border-slate-300 dark:border-base-850 shadow-xl p-6 md:p-8 space-y-6 animate-slide-in-up">
                    <div className="border-b border-slate-200 dark:border-base-800 pb-4">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                            สร้างใบแจ้งการปรับปรุงขั้นตอนงานใหม่ (New Walkthrough)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                            ระบุรายละเอียดการปรับปรุงขั้นตอน พร้อมแนบรูปภาพ และเลือกรายชื่อเจ้าหน้าที่ที่เกี่ยวข้องในแต่ละกะเพื่อเซ็นรับทราบ
                        </p>
                    </div>

                    <form onSubmit={handleCreateWalkthrough} className="space-y-6">
                        <div className="grid grid-cols-1 gap-6">
                            {/* Title */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                                    หัวข้อใบงาน / เรื่องที่แจ้ง (Title) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="เช่น อัปเดตมาตรฐานการตรวจสอบ PE 2.16 หรือ กฎระเบียบความปลอดภัยห้องแล็บใหม่"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-base-955 rounded-2xl border border-slate-300 dark:border-base-800 focus:ring-2 focus:ring-primary-500 font-bold text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
                                />
                            </div>

                            {/* Details */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                                    รายละเอียดการปรับปรุงและคำสั่งปฏิบัติงาน (Modification Details) <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    required
                                    rows={6}
                                    placeholder="กรอกรายละเอียดการเปลี่ยนแปลง สาเหตุที่ปรับปรุง หรืออธิบายขั้นตอนการปฏิบัติงานแบบใหม่..."
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-base-955 rounded-2xl border border-slate-300 dark:border-base-800 focus:ring-2 focus:ring-primary-500 font-medium text-sm text-slate-900 dark:text-white placeholder:text-slate-400 leading-relaxed"
                                />
                            </div>

                            {/* IMAGE ATTACHMENT SECTION */}
                            <div className="space-y-3 bg-slate-50 dark:bg-base-955/40 p-5 rounded-2xl border border-slate-200 dark:border-base-850">
                                <div className="flex justify-between items-center border-b border-slate-200 dark:border-base-800 pb-2">
                                    <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
                                        <span>🖼️ แนบรูปภาพประกอบสื่อสาร (Optional Image)</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { setImageType('upload'); setImageUrl(''); }}
                                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${imageType === 'upload' ? 'bg-primary-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-slate-300'}`}
                                        >
                                            Upload File
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setImageType('url'); setImageUrl(''); }}
                                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${imageType === 'url' ? 'bg-primary-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-slate-300'}`}
                                        >
                                            Paste Link / URL
                                        </button>
                                    </div>
                                </div>

                                {imageType === 'upload' ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-center w-full">
                                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-white hover:bg-slate-50 dark:bg-base-900 dark:border-base-800 dark:hover:bg-base-850 transition-all">
                                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                    <span className="text-2xl mb-1">📤</span>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">คลิกเพื่อเลือกไฟล์รูปภาพเพื่ออัปโหลด</p>
                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">JPEG, PNG หรือ GIF (ไม่เกิน 1.5MB)</p>
                                                </div>
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    className="hidden" 
                                                    onChange={handleImageFileChange} 
                                                />
                                            </label>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="วาง URL ลิงก์รูปภาพของคุณที่นี่ (เช่น https://example.com/image.png)"
                                            value={imageUrl}
                                            onChange={(e) => setImageUrl(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-base-900 rounded-xl border border-slate-300 dark:border-base-800 font-semibold text-xs text-slate-900 dark:text-white"
                                        />
                                    </div>
                                )}

                                {/* Image Preview */}
                                {imageUrl && (
                                    <div className="pt-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">ตัวอย่างภาพประกอบที่แนบ (Image Preview - คลิกเพื่อขยายใหญ่):</p>
                                        <div className="relative inline-block max-w-xs rounded-xl overflow-hidden border border-slate-300 shadow-sm group cursor-zoom-in">
                                            <img 
                                                src={imageUrl} 
                                                alt="Attached preview" 
                                                className="max-h-40 object-cover rounded-xl transition-all duration-200 group-hover:brightness-95"
                                                referrerPolicy="no-referrer"
                                                onClick={() => setZoomedImageUrl(imageUrl)}
                                                onError={() => {
                                                    setNotification({ message: "ไม่สามารถโหลดรูปภาพจากลิงก์ที่ระบุได้ กรุณาตรวจสอบความถูกต้องของ URL", isError: true });
                                                    setImageUrl('');
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setImageUrl('')}
                                                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full shadow hover:bg-red-700"
                                            >
                                                <XCircleIcon className="h-4.5 w-4.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Target personnel */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 dark:border-base-800 pb-2">
                                    <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                                        ผู้ปฏิบัติงานที่ต้องเซ็นรับทราบ (Target Signees) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={handleSelectAll} className="px-2.5 py-1 bg-slate-100 dark:bg-base-800 text-slate-800 dark:text-slate-200 rounded text-[10px] font-black uppercase hover:bg-slate-200 border border-slate-200 dark:border-base-750">Select All</button>
                                        <button type="button" onClick={handleSelectTestersOnly} className="px-2.5 py-1 bg-slate-100 dark:bg-base-800 text-slate-800 dark:text-slate-200 rounded text-[10px] font-black uppercase hover:bg-slate-200 border border-slate-200 dark:border-base-750">Testers Only</button>
                                        <button type="button" onClick={handleSelectAssistantsOnly} className="px-2.5 py-1 bg-slate-100 dark:bg-base-800 text-slate-800 dark:text-slate-200 rounded text-[10px] font-black uppercase hover:bg-slate-200 border border-slate-200 dark:border-base-750">Assistants Only</button>
                                        <button type="button" onClick={handleClearTargets} className="px-2.5 py-1 bg-red-50 text-red-700 rounded text-[10px] font-black uppercase hover:bg-red-100 border border-red-100">Clear</button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-base-955 p-4 rounded-2xl border border-slate-200 dark:border-base-850 max-h-60 overflow-y-auto">
                                    {testers.map(t => {
                                        const isChecked = selectedTargets.includes(t.id);
                                        return (
                                            <div
                                                key={t.id}
                                                onClick={() => toggleTarget(t.id)}
                                                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer select-none transition-all ${
                                                    isChecked 
                                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-950 dark:bg-indigo-900/30 dark:border-indigo-800/40 dark:text-indigo-200 shadow-sm font-bold' 
                                                        : 'bg-white border-slate-300 text-slate-800 dark:bg-base-900 dark:border-base-800 dark:text-slate-300 hover:bg-slate-100 font-medium'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {}} // handled by click
                                                    className="h-4 w-4 rounded text-primary-600 cursor-pointer pointer-events-none"
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black truncate text-slate-900 dark:text-white">{t.name}</p>
                                                    <p className="text-[9px] font-black opacity-60 uppercase">{t.team === 'assistants_4_2' ? 'Assistant' : 'Tester'}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Real-time Validation Warning Panel to clarify why publish is locked/unclickable */}
                        {(!title.trim() || !content.trim() || selectedTargets.length === 0) && (
                            <div className="p-4 bg-amber-50/80 dark:bg-amber-955/40 border border-amber-200 dark:border-base-800 rounded-2xl text-xs font-bold space-y-1 text-amber-900 dark:text-amber-300 animate-fade-in">
                                <p className="font-black text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                                    <span>⚠️ สิ่งที่ยังขาดก่อนเผยแพร่ (Form Incomplete):</span>
                                </p>
                                <ul className="list-disc list-inside pl-1 space-y-0.5 text-slate-700 dark:text-slate-300 font-medium">
                                    {!title.trim() && <li>กรุณาระบุ <strong>หัวข้อเรื่อง / ใบงาน</strong> ที่ด้านบน</li>}
                                    {!content.trim() && <li>กรุณาระบุ <strong>รายละเอียดการปฏิบัติงาน</strong> ที่ด้านบน</li>}
                                    {selectedTargets.length === 0 && <li>กรุณาเลือก <strong>ผู้ปฏิบัติงาน</strong> ที่เกี่ยวข้องในตารางผู้รับทราบด้านบนอย่างน้อย 1 คน</li>}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-5 border-t border-slate-200 dark:border-base-800">
                            <button
                                type="button"
                                onClick={() => setShowCreateForm(false)}
                                className="px-6 py-3 bg-slate-100 dark:bg-base-800 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isUploading}
                                className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:from-primary-700 hover:to-primary-800 shadow-lg shadow-primary-500/20 disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
                            >
                                {isUploading ? 'Processing Image...' : 'Publish Walkthrough'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                /* WALKTHROUGHS LIST & MAIN DASHBOARD */
                <div className="space-y-6">
                    {/* STATS PANELS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-white dark:bg-base-900 p-5 rounded-[1.5rem] border border-slate-300 dark:border-base-800 shadow-sm flex items-center gap-4">
                            <div className="p-3.5 bg-slate-100 dark:bg-base-800 text-slate-700 dark:text-slate-300 rounded-2xl">
                                <DocumentTextIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">ใบงานทั้งหมดในระบบ</p>
                                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{walkthroughs.length}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-base-900 p-5 rounded-[1.5rem] border border-slate-300 dark:border-base-800 shadow-sm flex items-center gap-4">
                            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-2xl">
                                <CheckCircleIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">ดำเนินการเสร็จสิ้น (ครบถ้วน)</p>
                                <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{completedWalkthroughs.length}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-base-900 p-5 rounded-[1.5rem] border border-slate-300 dark:border-base-800 shadow-sm flex items-center gap-4">
                            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 rounded-2xl">
                                <BeakerIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">รอดำเนินการลงนาม (Pending)</p>
                                <p className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">{pendingWalkthroughs.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* SECTION SEGMENTATION / TAB NAVIGATION */}
                    <div className="flex bg-slate-100 dark:bg-base-955 p-1.5 rounded-2xl gap-2 max-w-xl">
                        <button
                            onClick={() => setSelectedSubTab('pending')}
                            className={`flex-1 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                selectedSubTab === 'pending'
                                    ? 'bg-amber-500 text-white shadow-md'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-base-900/40'
                            }`}
                        >
                            <span>📂 ใบงานรอดำเนินการ (Pending)</span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                selectedSubTab === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-slate-300'
                            }`}>
                                {pendingWalkthroughs.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setSelectedSubTab('completed')}
                            className={`flex-1 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                selectedSubTab === 'completed'
                                    ? 'bg-emerald-600 text-white shadow-md'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-base-900/40'
                            }`}
                        >
                            <span>📜 ประวัติเซ็นครบถ้วน (Completed)</span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                selectedSubTab === 'completed' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-base-800 dark:text-slate-300'
                            }`}>
                                {completedWalkthroughs.length}
                            </span>
                        </button>
                    </div>

                    {/* MAIN LIST OF WALKTHROUGHS */}
                    {isLoading ? (
                        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                            <RefreshIcon className="h-10 w-10 text-primary-600 animate-spin" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">กำลังดึงข้อมูลใบงาน...</p>
                        </div>
                    ) : displayedWalkthroughs.length === 0 ? (
                        <div className="bg-white dark:bg-base-900 rounded-[2rem] border border-slate-300 dark:border-base-800 p-16 text-center space-y-4 shadow-sm">
                            <div className="inline-block p-4 bg-slate-100 dark:bg-base-800 text-slate-400 rounded-full">
                                <DocumentTextIcon className="h-12 w-12" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-800 dark:text-white uppercase">
                                    ไม่มีรายการใบงานในหมวดหมู่นี้
                                </h3>
                                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-medium">
                                    {selectedSubTab === 'pending' 
                                        ? 'ดีเยี่ยม! ไม่มีใบงานที่ค้างเซ็นรับทราบในขณะนี้ เจ้าหน้าที่ทุกคนลงนามครบถ้วนทั้งหมดแล้ว' 
                                        : 'ยังไม่มีประวัติใบงานที่ลงนามเสร็จสมบูรณ์ สามารถตรวจสอบใบงานที่รอเซ็นได้ในหมวดก่อนหน้า'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3.5">
                            {displayedWalkthroughs.map(w => {
                                const totalTarget = w.targetTesters.length;
                                const signedCount = Object.values(w.acknowledgements || {}).filter(a => a.acknowledged).length;
                                const isAllSigned = w.isCompleted;

                                return (
                                    <div
                                        key={w.id}
                                        onClick={() => setActiveWalkthrough(w)}
                                        className={`bg-white dark:bg-base-900 rounded-2xl border-y border-r p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer hover:shadow-lg transition-all border-slate-300 dark:border-base-800 hover:border-indigo-500 group relative ${
                                            isAllSigned 
                                                ? 'border-l-8 border-l-emerald-500 bg-emerald-50/5 dark:bg-emerald-955/5 hover:bg-emerald-50/15 dark:hover:bg-emerald-955/10' 
                                                : 'border-l-8 border-l-amber-500 bg-amber-50/10 dark:bg-amber-955/5 hover:bg-amber-50/20 dark:hover:bg-amber-955/10'
                                        }`}
                                    >
                                        {/* Left Side: Topic & Meta */}
                                        <div className="flex items-start gap-4 min-w-0 flex-1">
                                            <div className={`p-3 rounded-xl shrink-0 ${
                                                isAllSigned 
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-955/30' 
                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-955/30'
                                            }`}>
                                                <DocumentTextIcon className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0 space-y-1">
                                                <h4 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
                                                    {w.title}
                                                </h4>
                                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">
                                                    <span>ผู้สร้าง: {w.createdBy}</span>
                                                    <span className="opacity-40">•</span>
                                                    <span>วันที่แจ้ง: {new Date(w.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                    {w.imageUrl && (
                                                        <>
                                                            <span className="opacity-40">•</span>
                                                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">🖼️ มีรูปภาพแนบ</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Side: Signature Progress & Delete buttons */}
                                        <div className="flex items-center gap-4 shrink-0 w-full md:w-auto justify-between md:justify-end">
                                            {/* Progress Status Badge */}
                                            <div className="flex items-center gap-3.5 bg-white dark:bg-base-955 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-base-800 shadow-xs">
                                                <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white ${
                                                    isAllSigned 
                                                        ? 'bg-emerald-600 border border-emerald-500 shadow-sm shadow-emerald-500/10' 
                                                        : 'bg-amber-500 border border-amber-400 shadow-sm shadow-amber-500/10'
                                                }`}>
                                                    {isAllSigned ? '🏆 เซ็นครบถ้วนแล้ว' : `⏳ รอลงนาม (${signedCount}/${totalTarget})`}
                                                </span>
                                                <div className="text-right shrink-0 leading-none">
                                                    <span className="text-xs font-black text-slate-400 block uppercase mb-0.5">รับทราบ</span>
                                                    <span className="text-sm font-black text-slate-950 dark:text-white">
                                                        {signedCount} <span className="text-slate-400 text-xs font-bold">/ {totalTarget} คน</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Delete action */}
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                {confirmDeleteId === w.id ? (
                                                    <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-955/40 p-1.5 rounded-xl border border-red-200 animate-fade-in">
                                                        <span className="text-[9px] font-black uppercase text-red-700 dark:text-red-400 px-1.5 leading-none">ลบเอกสารนี้?</span>
                                                        <button
                                                            onClick={(e) => handleDeleteWalkthrough(w.id!, e)}
                                                            className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[8px] font-black uppercase tracking-wider shadow-xs transition-all"
                                                        >
                                                            ยืนยัน
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-[8px] font-bold uppercase tracking-wider transition-all"
                                                        >
                                                            ยกเลิก
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmDeleteId(w.id!);
                                                        }}
                                                        className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-all border border-slate-200 dark:bg-base-800 dark:border-base-750"
                                                        title="Delete Notice"
                                                    >
                                                        <TrashIcon className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* DETAIL MODAL OVERLAY (เด้งหน้าต่างแสดงรายละเอียด) */}
            {activeWalkthrough && (
                <div 
                    className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
                    onClick={() => setActiveWalkthrough(null)}
                >
                    <div 
                        className="bg-white dark:bg-base-900 w-full max-w-6xl max-h-[92vh] h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-300 dark:border-base-800 animate-scale-up"
                        onClick={(e) => e.stopPropagation()} // stop close on dialog body click
                    >
                        {/* Modal Header */}
                        <div className="px-6 py-5 bg-slate-50 dark:bg-base-955 border-b border-slate-200 dark:border-base-800 flex items-center justify-between">
                            <div className="min-w-0 pr-4">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mb-1.5 ${
                                    activeWalkthrough.isCompleted 
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40' 
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40'
                                }`}>
                                    {activeWalkthrough.isCompleted ? 'เสร็จสิ้นครบถ้วน' : 'กำลังดำเนินการรับทราบ'}
                                </span>
                                <h3 className="text-base font-black text-slate-900 dark:text-white uppercase leading-snug">
                                    {activeWalkthrough.title}
                                </h3>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold mt-1">
                                    <span>แจ้งโดย: {activeWalkthrough.createdBy}</span>
                                    <span>•</span>
                                    <span>สร้าง: {new Date(activeWalkthrough.createdAt).toLocaleString('th-TH')}</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => setActiveWalkthrough(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-base-800 rounded-full transition-all shrink-0"
                            >
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 md:p-8 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-5 gap-6">
                            {/* Left Content (3 Columns) */}
                            <div className="md:col-span-3 space-y-5">
                                {/* Instructions */}
                                <div className="space-y-1.5">
                                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        📄 รายละเอียดและวิธีปฏิบัติ (Instructions)
                                    </h4>
                                    <div className="bg-slate-50 dark:bg-base-955 p-5 rounded-2xl border border-slate-200 dark:border-base-850 text-slate-900 dark:text-slate-100 font-semibold text-sm leading-relaxed whitespace-pre-wrap select-text max-h-[50vh] overflow-y-auto shadow-inner">
                                        {activeWalkthrough.content}
                                    </div>
                                </div>

                                {/* Attached Image display */}
                                {activeWalkthrough.imageUrl && (
                                    <div className="space-y-2">
                                        <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            🖼️ ภาพสื่อสารประกอบขั้นตอนงาน (Attached Media - คลิกขยายดูรูปภาพขนาดใหญ่ได้)
                                        </h4>
                                        <div 
                                            onClick={() => setZoomedImageUrl(activeWalkthrough.imageUrl || null)}
                                            className="border border-slate-300 dark:border-base-850 rounded-2xl overflow-hidden shadow-xs bg-slate-50 dark:bg-base-955 flex justify-center max-h-96 relative group cursor-zoom-in"
                                        >
                                            <img 
                                                src={activeWalkthrough.imageUrl} 
                                                alt="Policy details attached" 
                                                className="object-contain max-h-96 w-full group-hover:scale-102 transition-transform duration-300"
                                                referrerPolicy="no-referrer"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                <span className="px-4 py-2 bg-white/95 text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider shadow-md animate-fade-in">🔍 คลิกขยายรูปภาพ (Zoom Image)</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Content / Signee Status (2 Columns) */}
                            <div className="md:col-span-2 space-y-4 border-t md:border-t-0 md:border-l border-slate-200 dark:border-base-800 pt-5 md:pt-0 md:pl-6">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        ✍️ การเซ็นลงชื่อรับทราบ (Acknowledgement Status)
                                    </h4>
                                    
                                    {/* Progress indicator */}
                                    <div className="mt-2.5 bg-slate-100 dark:bg-base-850 p-3 rounded-xl border border-slate-200 dark:border-base-800 flex items-center justify-between">
                                        <div className="w-full mr-3">
                                            <div className="flex justify-between text-[10px] font-black text-indigo-700 dark:text-indigo-400 mb-1">
                                                <span>อัตราส่วนการเซ็น</span>
                                                <span>
                                                    {Math.round((Object.values(activeWalkthrough.acknowledgements || {}).filter(a => a.acknowledged).length / activeWalkthrough.targetTesters.length) * 100)}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-200 dark:bg-base-800 rounded-full h-2">
                                                <div 
                                                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${(Object.values(activeWalkthrough.acknowledgements || {}).filter(a => a.acknowledged).length / activeWalkthrough.targetTesters.length) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                        <span className="text-xs font-black text-slate-800 dark:text-white whitespace-nowrap">
                                            {Object.values(activeWalkthrough.acknowledgements || {}).filter(a => a.acknowledged).length} / {activeWalkthrough.targetTesters.length}
                                        </span>
                                    </div>
                                </div>

                                {/* List of target personnel with direct sign action */}
                                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                                    {activeWalkthrough.targetTesters.map(tid => {
                                        const tester = testers.find(t => t.id === tid);
                                        const ack = activeWalkthrough.acknowledgements?.[tid];
                                        const hasSigned = !!ack?.acknowledged;

                                        return (
                                            <div
                                                key={tid}
                                                className={`p-3 rounded-xl flex items-center justify-between gap-3 border transition-all ${
                                                    hasSigned 
                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300' 
                                                        : 'bg-white border-slate-300 text-slate-800 dark:bg-base-900 dark:border-base-800 dark:text-slate-300 shadow-xs'
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{tester ? tester.name : tid}</p>
                                                    <p className="text-[9px] font-black opacity-60 uppercase">
                                                        {tester?.team === 'assistants_4_2' ? 'Assistant' : 'Tester'}
                                                    </p>
                                                    {hasSigned && ack.acknowledgedAt && (
                                                        <p className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                                                            เซ็นแล้วเมื่อ: {new Date(ack.acknowledgedAt).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="shrink-0">
                                                    {hasSigned ? (
                                                        <span className="flex items-center gap-1 py-1 px-2.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full text-[9px] font-black uppercase">
                                                            <CheckCircleIcon className="h-3 w-3" /> รับทราบแล้ว
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleAcknowledgeForTester(activeWalkthrough.id!, tid, tester?.name || tid)}
                                                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center gap-1 active:scale-95"
                                                        >
                                                            ✍️ เซ็นรับทราบ
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-base-955 border-t border-slate-200 dark:border-base-800 flex justify-end gap-3">
                            {/* Planner/Admin Inline delete option inside modal as well */}
                            <div className="mr-auto">
                                {confirmDeleteId === activeWalkthrough.id ? (
                                    <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-955/40 p-1.5 rounded-xl border border-red-200 animate-fade-in">
                                        <span className="text-[9px] font-black uppercase text-red-700 dark:text-red-400 px-1 px-1.5">ต้องการลบใบงานนี้หรือไม่?</span>
                                        <button
                                            onClick={(e) => handleDeleteWalkthrough(activeWalkthrough.id!, e)}
                                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider shadow-xs transition-all"
                                        >
                                            ยืนยันลบ
                                        </button>
                                        <button
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmDeleteId(activeWalkthrough.id!)}
                                        className="px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-red-100"
                                    >
                                        <TrashIcon className="h-3.5 w-3.5" /> ลบใบงานนี้
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={() => setActiveWalkthrough(null)}
                                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-base-800 dark:text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all"
                            >
                                ปิดหน้าต่าง (Close)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ZOOMED IMAGE OVERLAY MODAL */}
            {zoomedImageUrl && (
                <div 
                    className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in"
                    onClick={() => setZoomedImageUrl(null)}
                >
                    {/* Top control bar */}
                    <div className="w-full max-w-5xl flex justify-between items-center mb-4 text-white">
                        <p className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                            <span>🖼️ ภาพประกอบขั้นตอนงานฉบับเต็ม (Full Size Image)</span>
                        </p>
                        <button 
                            onClick={() => setZoomedImageUrl(null)}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-sm"
                        >
                            <XCircleIcon className="h-4.5 w-4.5" /> ปิดรูปภาพ (Close)
                        </button>
                    </div>

                    {/* Image Box */}
                    <div 
                        className="relative max-w-5xl max-h-[80vh] bg-base-950/30 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center shadow-2xl animate-scale-up"
                        onClick={(e) => e.stopPropagation()} // don't close when clicking the image itself
                    >
                        <img 
                            src={zoomedImageUrl} 
                            alt="Expanded preview" 
                            className="object-contain max-h-[80vh] max-w-full rounded-2xl select-none animate-[scale-up_0.2s_ease-out]"
                            referrerPolicy="no-referrer"
                        />
                    </div>
                    
                    <p className="text-white/50 text-[10px] font-medium tracking-wide mt-3 uppercase">
                        คลิกบริเวณใดก็ได้ด้านนอกเพื่อปิดรูปภาพ
                    </p>
                </div>
            )}
        </div>
    );
};

export default WalkthroughTab;
