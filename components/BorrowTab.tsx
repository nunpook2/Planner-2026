import React, { useState, useEffect, useRef } from 'react';
import { 
    getBorrowRecords, 
    saveBorrowRecord, 
    deleteBorrowRecord, 
    getEquipments, 
    getTesters,
    getAppSettings,
    saveAppSettings
} from '../services/dataService';
import type { BorrowRecord, Equipment, Tester, AppSettings, HighValueAsset } from '../types';
import { 
    PlusIcon, 
    PencilIcon, 
    TrashIcon, 
    CheckCircleIcon, 
    XCircleIcon, 
    RefreshIcon, 
    ClockIcon, 
    SearchIcon,
    CalendarIcon,
    UserCircleIcon,
    AlertTriangleIcon,
    InformationCircleIcon,
    ChevronDownIcon,
    CameraIcon
} from './common/Icons';

interface BorrowTabProps {
    testers: Tester[];
    appSettings?: AppSettings | null;
    onBorrowUpdated?: () => void;
    isIsolatedView?: boolean;
    onExitIsolated?: () => void;
}

export const BorrowTab: React.FC<BorrowTabProps> = ({ 
    testers: initialTesters, 
    appSettings: propAppSettings,
    onBorrowUpdated,
    isIsolatedView = false,
    onExitIsolated
}) => {
    const [records, setRecords] = useState<BorrowRecord[]>([]);
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [testers, setTesters] = useState<Tester[]>(initialTesters);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(propAppSettings || null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const activeHighValueAssets = appSettings?.highValueAssets?.filter(asset => asset.isActive) || [];
    
    // Collapsible Monitor Dashboard
    const [showMonitorDashboard, setShowMonitorDashboard] = useState(false);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'internal' | 'external'>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'borrowed' | 'returned' | 'overdue'>('all');

    // Modals
    const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Steps for Modals
    const [borrowStep, setBorrowStep] = useState(1);
    const [returnStep, setReturnStep] = useState(1);

    // Editing / Selected States
    const [editingRecord, setEditingRecord] = useState<Partial<BorrowRecord> | null>(null);
    const [selectedRecordForReturn, setSelectedRecordForReturn] = useState<BorrowRecord | null>(null);
    const [recordToDelete, setRecordToDelete] = useState<BorrowRecord | null>(null);
    
    // Return form state
    const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
    const [returnNotes, setReturnNotes] = useState('');
    const [returnPhotoUrl, setReturnPhotoUrl] = useState<string>('');
    const [returnedBy, setReturnedBy] = useState('');
    const [returnReceiverName, setReturnReceiverName] = useState('');
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

    const isInitializedRef = useRef(false);

    // Initial draft restore on mount
    useEffect(() => {
        // Restore borrow draft
        const savedIsOpen = localStorage.getItem('borrow_draft_is_open');
        if (savedIsOpen === 'true') {
            const savedRecord = localStorage.getItem('borrow_draft_editing_record');
            const savedStep = localStorage.getItem('borrow_draft_step');
            if (savedRecord) {
                try {
                    const parsedRecord = JSON.parse(savedRecord);
                    setEditingRecord(parsedRecord);
                    setIsBorrowModalOpen(true);
                    if (savedStep) {
                        setBorrowStep(Number(savedStep));
                    }
                } catch (e) {
                    console.error("Failed to parse borrow draft", e);
                }
            }
        }

        // Restore return draft
        const savedReturnIsOpen = localStorage.getItem('return_draft_is_open');
        if (savedReturnIsOpen === 'true') {
            const savedRecord = localStorage.getItem('return_draft_record');
            const savedStep = localStorage.getItem('return_draft_step');
            const savedDate = localStorage.getItem('return_draft_date');
            const savedNotes = localStorage.getItem('return_draft_notes');
            const savedPhoto = localStorage.getItem('return_draft_photo');
            const savedBy = localStorage.getItem('return_draft_returned_by');
            const savedReceiver = localStorage.getItem('return_draft_receiver');

            if (savedRecord) {
                try {
                    const parsedRecord = JSON.parse(savedRecord);
                    setSelectedRecordForReturn(parsedRecord);
                    setIsReturnModalOpen(true);
                    if (savedStep) setReturnStep(Number(savedStep));
                    if (savedDate) setReturnDate(savedDate);
                    if (savedNotes) setReturnNotes(savedNotes);
                    if (savedPhoto) setReturnPhotoUrl(savedPhoto);
                    if (savedBy) setReturnedBy(savedBy);
                    if (savedReceiver) setReturnReceiverName(savedReceiver);
                } catch (e) {
                    console.error("Failed to parse return draft", e);
                }
            }
        }

        isInitializedRef.current = true;
    }, []);

    // Auto-save borrow draft
    useEffect(() => {
        if (!isInitializedRef.current) return;
        if (isBorrowModalOpen && editingRecord) {
            localStorage.setItem('borrow_draft_is_open', 'true');
            localStorage.setItem('borrow_draft_editing_record', JSON.stringify(editingRecord));
            localStorage.setItem('borrow_draft_step', String(borrowStep));
        } else {
            localStorage.removeItem('borrow_draft_is_open');
            localStorage.removeItem('borrow_draft_editing_record');
            localStorage.removeItem('borrow_draft_step');
        }
    }, [isBorrowModalOpen, editingRecord, borrowStep]);

    // Auto-save return draft
    useEffect(() => {
        if (!isInitializedRef.current) return;
        if (isReturnModalOpen && selectedRecordForReturn) {
            localStorage.setItem('return_draft_is_open', 'true');
            localStorage.setItem('return_draft_record', JSON.stringify(selectedRecordForReturn));
            localStorage.setItem('return_draft_step', String(returnStep));
            localStorage.setItem('return_draft_date', returnDate);
            localStorage.setItem('return_draft_notes', returnNotes);
            localStorage.setItem('return_draft_photo', returnPhotoUrl);
            localStorage.setItem('return_draft_returned_by', returnedBy);
            localStorage.setItem('return_draft_receiver', returnReceiverName);
        } else {
            localStorage.removeItem('return_draft_is_open');
            localStorage.removeItem('return_draft_record');
            localStorage.removeItem('return_draft_step');
            localStorage.removeItem('return_draft_date');
            localStorage.removeItem('return_draft_notes');
            localStorage.removeItem('return_draft_photo');
            localStorage.removeItem('return_draft_returned_by');
            localStorage.removeItem('return_draft_receiver');
        }
    }, [isReturnModalOpen, selectedRecordForReturn, returnStep, returnDate, returnNotes, returnPhotoUrl, returnedBy, returnReceiverName]);

    // Collapsible & Scanner States
    const [expandedRecordIds, setExpandedRecordIds] = useState<Record<string, boolean>>({});
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scannerSearchQuery, setScannerSearchQuery] = useState('');
    const [scanFeedback, setScanFeedback] = useState<{ message: string; isSuccess: boolean } | null>(null);
    const [scannerStream, setScannerStream] = useState<MediaStream | null>(null);

    // Image compression/scaling utility to prevent localstorage quota overflow
    const handleCompressAndSetPhoto = (file: File, type: 'borrow' | 'return') => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 600;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7); // 70% quality jpeg is compact and crisp
                    if (type === 'borrow') {
                        setEditingRecord(prev => prev ? { ...prev, borrowPhotoUrl: compressedBase64 } : null);
                    } else if (type === 'return') {
                        setReturnPhotoUrl(compressedBase64);
                    }
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const [notification, setNotification] = useState<{ message: string; isError?: boolean } | null>(null);

    // Fetch all required data
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [fetchedRecords, fetchedEquips, fetchedTesters, fetchedSettings] = await Promise.all([
                getBorrowRecords().catch(() => []),
                getEquipments().catch(() => []),
                getTesters().catch(() => []),
                getAppSettings().catch(() => null)
            ]);
            setRecords(fetchedRecords);
            setEquipments(fetchedEquips);
            if (fetchedTesters.length > 0) {
                setTesters(fetchedTesters);
            }
            if (fetchedSettings) {
                setAppSettings(fetchedSettings);
            }
        } catch (error) {
            console.error("Error fetching borrow data:", error);
            showNotification("เกิดข้อผิดพลาดในการโหลดข้อมูล", true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const showNotification = (message: string, isError = false) => {
        setNotification({ message, isError });
        setTimeout(() => setNotification(null), 4000);
    };

    // Camera and Scan Processing
    useEffect(() => {
        let activeStream: MediaStream | null = null;
        if (isScannerOpen) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    activeStream = stream;
                    setScannerStream(stream);
                    const videoElement = document.getElementById('scanner-video') as HTMLVideoElement;
                    if (videoElement) {
                        videoElement.srcObject = stream;
                        videoElement.play().catch(err => console.error("Video play error", err));
                    }
                })
                .catch(err => {
                    console.warn("Camera access failed or denied:", err);
                });
        }
        return () => {
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
            setScannerStream(null);
        };
    }, [isScannerOpen]);

    const handleProcessScannedCode = (scannedCode: string) => {
        if (!scannedCode) return;
        
        setScanFeedback({
            message: `🎯 ตรวจพบรหัสสแกน: "${scannedCode}"`,
            isSuccess: true
        });
        
        // Check if there is an active (unreturned) borrow record for this equipment
        const activeBorrow = records.find(r => 
            !r.actualReturnDate && 
            r.equipmentName.toLowerCase().trim() === scannedCode.toLowerCase().trim()
        );

        setTimeout(() => {
            setScanFeedback(null);
            setIsScannerOpen(false);
            setScannerSearchQuery('');
            
            if (activeBorrow) {
                // Device is borrowed -> Open return modal
                setSelectedRecordForReturn(activeBorrow);
                setReturnDate(new Date().toISOString().split('T')[0]);
                setReturnNotes('');
                setReturnPhotoUrl('');
                setReturnedBy(activeBorrow.borrowerName);
                setReturnReceiverName('');
                setIsReturnModalOpen(true);
                showNotification(`พบเครื่องมือ "${scannedCode}" มีประวัติค้างยืม ระบบเปิดหน้าต่างคืนอุปกรณ์ให้อัตโนมัติ`);
            } else {
                // Device is available -> Open borrow modal pre-filled
                const today = new Date();
                const timeStr = today.toTimeString().split(' ')[0].substring(0, 5);
                const dateStr = today.toISOString().split('T')[0];
                
                const defaultReturnDate = new Date();
                defaultReturnDate.setDate(today.getDate() + 3);
                const defaultReturnStr = defaultReturnDate.toISOString().split('T')[0];

                setEditingRecord({
                    equipmentId: 'other',
                    equipmentName: scannedCode,
                    borrowerName: '',
                    borrowerType: 'internal',
                    borrowerPhone: '',
                    borrowDate: dateStr,
                    borrowTime: timeStr,
                    expectedReturnDate: defaultReturnStr,
                    guarantorName: '',
                    notes: '',
                    borrowPhotoUrl: '',
                    returnPhotoUrl: ''
                });
                setIsBorrowModalOpen(true);
                showNotification(`เครื่องมือ "${scannedCode}" พร้อมใช้งาน ระบบเปิดหน้าต่างบันทึกยืมเครื่องมือให้อัตโนมัติ`);
            }
        }, 1200);
    };

    // Toggle expand-collapse state for individual records
    const toggleRecordExpand = (id: string) => {
        setExpandedRecordIds(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleExpandAll = () => {
        const nextState: Record<string, boolean> = {};
        filteredRecords.forEach(r => {
            if (r.id) nextState[r.id] = true;
        });
        setExpandedRecordIds(nextState);
    };

    const handleCollapseAll = () => {
        setExpandedRecordIds({});
    };

    // Calculate dynamic status for a record
    const getRecordStatus = (record: BorrowRecord): 'borrowed' | 'returned' | 'overdue' => {
        if (record.actualReturnDate) return 'returned';
        if (record.isConsumable) return 'borrowed';
        if (record.isHighValue && record.assetId) {
            const asset = activeHighValueAssets.find(a => a.id === record.assetId);
            if (asset?.isConsumable) return 'borrowed';
        }
        const today = new Date().toISOString().split('T')[0];
        if (record.expectedReturnDate && record.expectedReturnDate < today) return 'overdue';
        return 'borrowed';
    };

    // Auto-update statuses based on current date
    const processedRecords = records.map(record => ({
        ...record,
        status: getRecordStatus(record)
    }));

    // Filter records
    const filteredRecords = processedRecords.filter(r => {
        const matchesSearch = 
            r.equipmentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.borrowerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.borrowerPhone.includes(searchQuery) ||
            (r.guarantorName && r.guarantorName.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesType = filterType === 'all' || r.borrowerType === filterType;
        const matchesStatus = filterStatus === 'all' || r.status === filterStatus;

        return matchesSearch && matchesType && matchesStatus;
    });

    // Counts
    const borrowedCount = processedRecords.filter(r => r.status === 'borrowed').length;
    const returnedCount = processedRecords.filter(r => r.status === 'returned').length;
    const overdueCount = processedRecords.filter(r => r.status === 'overdue').length;

    // Helper handlers to close modals with confirmation warn if they have dirty/unsaved fields
    const handleCloseBorrowModal = () => {
        const hasFilledData = !!editingRecord?.equipmentName?.trim() || 
                              !!editingRecord?.borrowerName?.trim() || 
                              !!editingRecord?.borrowPhotoUrl;
        
        if (hasFilledData) {
            const confirmClose = window.confirm("คุณมีข้อมูลที่กรอกไว้และรูปภาพก่อนยืม ต้องการยกเลิกและปิดหน้านี้ใช่หรือไม่? (ข้อมูลร่างจะถูกลบ)");
            if (!confirmClose) return;
        }
        
        setIsBorrowModalOpen(false);
        setEditingRecord(null);
    };

    const handleCloseReturnModal = () => {
        const hasFilledData = !!returnedBy?.trim() || 
                              !!returnNotes?.trim() || 
                              !!returnPhotoUrl;
        
        if (hasFilledData) {
            const confirmClose = window.confirm("คุณมีข้อมูลตรวจนับหรือรูปภาพสภาพส่งคืนที่ระบุไว้ ต้องการยกเลิกและปิดใช่หรือไม่?");
            if (!confirmClose) return;
        }
        
        setIsReturnModalOpen(false);
        setSelectedRecordForReturn(null);
    };

    // Open Modal for New Borrow
    const handleOpenNewBorrow = () => {
        const today = new Date();
        const timeStr = today.toTimeString().split(' ')[0].substring(0, 5); // HH:mm
        const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Default expected return is in 3 days
        const defaultReturnDate = new Date();
        defaultReturnDate.setDate(today.getDate() + 3);
        const defaultReturnStr = defaultReturnDate.toISOString().split('T')[0];

        setBorrowStep(1);
        setEditingRecord({
            equipmentId: 'other',
            equipmentName: '',
            borrowerName: '',
            borrowerType: 'internal',
            borrowerPhone: '',
            borrowDate: dateStr,
            borrowTime: timeStr,
            expectedReturnDate: defaultReturnStr,
            guarantorName: '',
            notes: '',
            borrowPhotoUrl: '',
            returnPhotoUrl: '',
            isHighValue: false,
            assetId: ''
        });
        setIsBorrowModalOpen(true);
    };

    // Open Modal for Edit
    const handleOpenEdit = (record: BorrowRecord) => {
        setBorrowStep(1);
        setEditingRecord({ ...record });
        setIsBorrowModalOpen(true);
    };

    // Save Borrow Record
    const handleSaveBorrow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRecord) return;

        // Calculate validations for current steps
        const isStep1Valid = !!editingRecord.equipmentName?.trim();
        const isStep2Valid = !!editingRecord.borrowerName?.trim() && 
                             !!editingRecord.borrowerPhone?.trim() && 
                             (editingRecord.borrowerType !== 'external' || !!editingRecord.guarantorName?.trim());

        // Handle step progression on form submit (e.g. when pressing Enter in input fields)
        if (borrowStep === 1) {
            if (isStep1Valid) {
                setBorrowStep(2);
            } else {
                showNotification("กรุณาระบุอุปกรณ์ที่ยืม", true);
            }
            return;
        }

        if (borrowStep === 2) {
            if (isStep2Valid) {
                setBorrowStep(3);
            } else {
                showNotification("กรุณากรอกข้อมูลผู้ยืมและเบอร์โทรศัพท์ให้ครบถ้วน", true);
            }
            return;
        }

        // Guard to ensure we do not submit unless we are strictly on Step 3
        if (borrowStep !== 3) {
            return;
        }

        // We are on Step 3: validate everything before final save
        if (!isStep1Valid) {
            showNotification("กรุณาระบุอุปกรณ์ที่ยืม", true);
            setBorrowStep(1);
            return;
        }
        if (!isStep2Valid) {
            showNotification("กรุณากรอกข้อมูลผู้ยืมให้ครบถ้วน", true);
            setBorrowStep(2);
            return;
        }

        setIsSubmitting(true);
        try {
            const selectedAsset = editingRecord.isHighValue && editingRecord.assetId 
                ? activeHighValueAssets.find(a => a.id === editingRecord.assetId)
                : null;
            const isConsumable = selectedAsset?.isConsumable || false;

            const recordToSave: BorrowRecord = {
                id: editingRecord.id,
                equipmentId: 'other',
                equipmentName: editingRecord.equipmentName.trim(),
                borrowerName: editingRecord.borrowerName.trim(),
                borrowerType: editingRecord.borrowerType || 'internal',
                borrowerPhone: editingRecord.borrowerPhone.trim(),
                borrowDate: editingRecord.borrowDate || new Date().toISOString().split('T')[0],
                borrowTime: editingRecord.borrowTime || '08:00',
                expectedReturnDate: isConsumable ? '' : (editingRecord.expectedReturnDate || new Date().toISOString().split('T')[0]),
                actualReturnDate: editingRecord.actualReturnDate || '',
                guarantorName: editingRecord.borrowerType === 'external' ? editingRecord.guarantorName?.trim() : '',
                status: editingRecord.status || 'borrowed',
                notes: editingRecord.notes?.trim() || '',
                borrowPhotoUrl: editingRecord.borrowPhotoUrl || '',
                returnPhotoUrl: editingRecord.returnPhotoUrl || '',
                createdAt: editingRecord.createdAt || new Date().toISOString(),
                returnedBy: editingRecord.returnedBy || '',
                returnReceiverName: editingRecord.returnReceiverName || '',
                isHighValue: editingRecord.isHighValue || false,
                assetId: editingRecord.assetId || '',
                isConsumable: isConsumable
            };

            if (!editingRecord.id && recordToSave.isHighValue && recordToSave.assetId) {
                const currentSettings = await getAppSettings();
                if (currentSettings && currentSettings.highValueAssets) {
                    const targetAsset = currentSettings.highValueAssets.find((a: HighValueAsset) => a.id === recordToSave.assetId);
                    if (targetAsset && targetAsset.isConsumable && targetAsset.trackQuantity) {
                        const updatedAssets = currentSettings.highValueAssets.map((asset: HighValueAsset) => {
                            if (asset.id === recordToSave.assetId) {
                                const currentQty = asset.initialQuantity ?? 1;
                                return {
                                    ...asset,
                                    initialQuantity: Math.max(0, currentQty - 1)
                                };
                            }
                            return asset;
                        });
                        await saveAppSettings({ ...currentSettings, highValueAssets: updatedAssets });
                        setAppSettings({ ...currentSettings, highValueAssets: updatedAssets });
                    }
                }
            }

            await saveBorrowRecord(recordToSave);
            showNotification(editingRecord.id ? "แก้ไขบันทึกการยืมเรียบร้อย" : "บันทึกการยืมอุปกรณ์สำเร็จ");
            setIsBorrowModalOpen(false);
            setEditingRecord(null);
            fetchData();
            onBorrowUpdated?.();
        } catch (error) {
            console.error("Error saving borrow record:", error);
            showNotification("บันทึกข้อมูลไม่สำเร็จ", true);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Open Return Confirmation Modal
    const handleOpenReturn = (record: BorrowRecord) => {
        setReturnStep(1);
        setSelectedRecordForReturn(record);
        setReturnDate(new Date().toISOString().split('T')[0]);
        setReturnNotes('');
        setReturnPhotoUrl('');
        setReturnedBy(record.borrowerName || ''); // Pre-populate with borrower's name as a helper
        setReturnReceiverName(record.guarantorName || ''); // Pre-populate with guarantor name if available
        setIsReturnModalOpen(true);
    };

    // Confirm Return
    const handleConfirmReturn = async () => {
        if (!selectedRecordForReturn) return;
        
        // Guard to ensure we do not submit unless we are strictly on Step 2
        if (returnStep !== 2) {
            return;
        }
        
        if (!returnedBy.trim()) {
            showNotification("กรุณาระบุชื่อผู้ส่งคืนอุปกรณ์", true);
            return;
        }

        if (selectedRecordForReturn.borrowerType === 'external' && !returnReceiverName.trim()) {
            showNotification("ผู้ยืมภายนอกต้องมีพนักงานภายในเป็นผู้รับคืน/ตรวจรับสภาพเสมอ", true);
            return;
        }

        setIsSubmitting(true);
        try {
            const updatedRecord: BorrowRecord = {
                ...selectedRecordForReturn,
                actualReturnDate: returnDate,
                status: 'returned',
                returnPhotoUrl: returnPhotoUrl || '',
                returnedBy: returnedBy.trim(),
                returnReceiverName: returnReceiverName.trim(),
                notes: returnNotes.trim() 
                    ? (selectedRecordForReturn.notes ? `${selectedRecordForReturn.notes}\n[ส่งคืน: ${returnNotes.trim()}]` : `[ส่งคืน: ${returnNotes.trim()}]`)
                    : selectedRecordForReturn.notes
            };

            await saveBorrowRecord(updatedRecord);
            showNotification("บันทึกการคืนอุปกรณ์สำเร็จ");
            setIsReturnModalOpen(false);
            setSelectedRecordForReturn(null);
            fetchData();
            onBorrowUpdated?.();
        } catch (error) {
            console.error("Error confirming return:", error);
            showNotification("บันทึกการคืนไม่สำเร็จ", true);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete Record
    const handleOpenDelete = (record: BorrowRecord) => {
        setRecordToDelete(record);
        setIsDeleteModalOpen(true);
    };

    const handleDeleteRecord = async () => {
        if (!recordToDelete || !recordToDelete.id) return;
        setIsSubmitting(true);
        try {
            await deleteBorrowRecord(recordToDelete.id);
            showNotification("ลบประวัติการยืมเรียบร้อยแล้ว");
            setIsDeleteModalOpen(false);
            setRecordToDelete(null);
            fetchData();
            onBorrowUpdated?.();
        } catch (error) {
            console.error("Error deleting record:", error);
            showNotification("ลบไม่สำเร็จ", true);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderRecordCard = (record: BorrowRecord) => {
        const isExpanded = expandedRecordIds[record.id!] || false;
        const isOverdue = record.status === 'overdue';
        const isReturned = record.status === 'returned';

        return (
            <div 
                key={record.id}
                className={`bg-white dark:bg-base-900 border rounded-2xl overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md ${
                    isExpanded 
                        ? 'ring-2 ring-primary-500/25 border-primary-500/50 dark:border-primary-500/50' 
                        : isOverdue 
                            ? 'border-rose-200 dark:border-rose-950/60 bg-rose-50/5 dark:bg-rose-950/5 hover:border-rose-350' 
                            : 'border-slate-200 dark:border-base-800 hover:border-slate-300 dark:hover:border-base-700'
                }`}
            >
                {/* Header Row - Clickable to toggle expand */}
                <div 
                    onClick={() => toggleRecordExpand(record.id!)}
                    className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer select-none active:bg-slate-50 dark:active:bg-base-950/20"
                >
                    <div className="flex items-center gap-3.5 min-w-0">
                        {/* Status Icon Indicator */}
                        <div className={`p-2.5 rounded-xl shrink-0 ${
                            isReturned 
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400' 
                                : isOverdue 
                                    ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 animate-pulse' 
                                    : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                        }`}>
                            {isReturned ? (
                                <CheckCircleIcon className="h-5 w-5" />
                            ) : isOverdue ? (
                                <AlertTriangleIcon className="h-5 w-5 animate-bounce" />
                            ) : (
                                <ClockIcon className="h-5 w-5" />
                            )}
                        </div>

                        {/* Name & Quick Metadata */}
                        <div className="min-w-0 space-y-1">
                            <h3 className="text-sm font-black text-slate-800 dark:text-white leading-tight truncate flex items-center gap-1.5">
                                {record.isHighValue && <span className="text-xs">💎</span>}
                                <span>{record.equipmentName}</span>
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                <span>👤 ผู้ยืม: <strong className="text-slate-700 dark:text-slate-200 font-bold">{record.borrowerName}</strong></span>
                                <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${
                                    record.borrowerType === 'internal' 
                                        ? 'bg-blue-100/70 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' 
                                        : 'bg-indigo-100/70 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300'
                                }`}>
                                    {record.borrowerType === 'internal' ? 'ภายใน' : 'ภายนอก'}
                                </span>
                                <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
                                <span>📞 {record.borrowerPhone}</span>
                            </div>
                        </div>
                    </div>

                    {/* Status Pill Badge & Toggle Chevron */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="hidden md:flex flex-col items-end text-[10px] font-bold text-slate-400 uppercase mr-1">
                            <span>{isReturned ? 'คืนเครื่องมือแล้วเมื่อ' : record.isConsumable ? 'สถานะการเบิก' : 'กำหนดส่งคืน'}</span>
                            <span className={`text-[11px] font-black mt-0.5 ${
                                isReturned 
                                    ? 'text-emerald-600 dark:text-emerald-400' 
                                    : isOverdue 
                                        ? 'text-rose-600 dark:text-rose-400' 
                                        : record.isConsumable
                                            ? 'text-indigo-600 dark:text-indigo-400'
                                            : 'text-slate-600 dark:text-slate-300'
                            }`}>
                                {isReturned 
                                    ? new Date(record.actualReturnDate!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                                    : record.isConsumable
                                        ? 'ใช้หมดไป (ไม่ต้องคืน) ♻️'
                                        : new Date(record.expectedReturnDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                                }
                            </span>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            isReturned 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' 
                                : isOverdue 
                                    ? 'bg-rose-100 text-rose-850 dark:bg-rose-900/30 dark:text-rose-300 animate-pulse' 
                                    : record.isConsumable
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        }`}>
                            {isReturned ? 'คืนแล้ว' : isOverdue ? 'เลยกำหนด ⚠️' : record.isConsumable ? 'เบิกใช้งาน ♻️' : 'กำลังยืม'}
                        </span>

                        <div className="p-1 text-slate-400 dark:text-slate-500 rounded-lg hover:bg-slate-50 dark:hover:bg-base-800 transition-all">
                            <ChevronDownIcon className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-primary-500' : ''}`} />
                        </div>
                    </div>
                </div>

                {/* Expanded Panel Details */}
                {isExpanded && (
                    <div className="px-5 pb-5 border-t border-slate-100 dark:border-base-800 bg-slate-50/40 dark:bg-base-950/15 animate-fade-in text-xs">
                        
                        {/* Overdue alert banner if item is overdue */}
                        {isOverdue && (
                            <div className="mt-4 mb-1 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 rounded-xl flex items-center gap-2 font-black text-xs leading-relaxed">
                                <AlertTriangleIcon className="h-5 w-5 shrink-0 text-rose-500" />
                                <span>แจ้งเตือนค้างส่งคืนเครื่องมือทดสอบเลยกำหนด! กรุณาโทรติดต่อ {record.borrowerPhone} เพื่อรีบเร่งรัดติดตามการส่งคืนเครื่องมือโดยด่วน</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
                            
                            {/* Card Column 1 */}
                            <div className="space-y-3 bg-white dark:bg-base-900/40 p-4 rounded-xl border border-slate-100 dark:border-base-850">
                                <h4 className="font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-base-800 pb-1 flex items-center gap-1">
                                    👤 ข้อมูลรายละเอียดผู้ยืม
                                </h4>
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold block uppercase leading-none">ชื่อผู้ทำเรื่องยืม</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 mt-1 block">{record.borrowerName}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold block uppercase leading-none">ประเภทสังกัด</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 mt-1 block">
                                            {record.borrowerType === 'internal' ? 'พนักงาน/เจ้าหน้าที่ภายในห้องปฏิบัติการ' : 'บุคคลภายนอก/หน่วยงานภายนอก'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold block uppercase leading-none">ช่องทางการติดต่อ (เบอร์โทร)</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 mt-1 block">{record.borrowerPhone}</span>
                                    </div>
                                    {record.borrowerType === 'external' && (
                                        <div>
                                            <span className="text-[10px] text-indigo-500 font-black block uppercase leading-none">พนักงานภายในผู้รับรองการยืม</span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block">👤 {record.guarantorName || 'ไม่ระบุผู้รับรอง (กรุณาแก้ไข)'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card Column 2 */}
                            <div className="space-y-3 bg-white dark:bg-base-900/40 p-4 rounded-xl border border-slate-100 dark:border-base-850">
                                <h4 className="font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-base-800 pb-1 flex items-center gap-1">
                                    📅 กำหนดการและประวัติส่งคืน
                                </h4>
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold block uppercase leading-none">วันที่และเวลาที่ยืมอุปกรณ์</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 mt-1 block">
                                            {new Date(record.borrowDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ({record.borrowTime} น.)
                                        </span>
                                    </div>
                                    {record.isConsumable ? (
                                        <div>
                                            <span className="text-[10px] text-indigo-500 font-bold block uppercase leading-none">ชนิดทรัพย์สินมูลค่าสูง</span>
                                            <span className="font-black text-indigo-700 dark:text-indigo-400 mt-1 block">
                                                ♻️ สิ้นเปลือง (ใช้แล้วหมดไป ไม่ต้องส่งคืน)
                                            </span>
                                        </div>
                                    ) : (
                                        <div>
                                            <span className="text-[10px] text-slate-400 font-bold block uppercase leading-none">กำหนดส่งคืนอุปกรณ์ทดสอบ</span>
                                            <span className="font-black text-slate-800 dark:text-slate-200 mt-1 block">
                                                {new Date(record.expectedReturnDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </span>
                                        </div>
                                    )}
                                    
                                    <div className="pt-2 border-t border-slate-100 dark:border-base-800">
                                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black block uppercase leading-none">สถานะปัจจุบัน</span>
                                        {isReturned ? (
                                            <div className="space-y-1 mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                <p className="font-black text-emerald-700 dark:text-emerald-400">✓ ส่งคืนเครื่องมือสำเร็จ</p>
                                                <p className="text-[10px]">ส่งคืนเมื่อ: {new Date(record.actualReturnDate!).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                                <p className="text-[10px]">ผู้นำอุปกรณ์มาคืน: <strong>{record.returnedBy || record.borrowerName}</strong></p>
                                                {record.returnReceiverName && (
                                                    <p className="text-[10px]">เจ้าหน้าที่ผู้ตรวจรับคืน: <strong>{record.returnReceiverName}</strong></p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-1.5">
                                                <p className={`font-black uppercase tracking-wide ${isOverdue ? 'text-rose-600 animate-pulse' : 'text-amber-600'}`}>
                                                    {isOverdue ? '⚠️ ค้างคืนเลยกำหนดส่ง' : '⌛ อยู่ในระหว่างการยืมใช้งาน'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Card Column 3 */}
                            <div className="space-y-3 bg-white dark:bg-base-900/40 p-4 rounded-xl border border-slate-100 dark:border-base-850">
                                <h4 className="font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-base-800 pb-1 flex items-center gap-1">
                                    📸 หลักฐานและรูปสภาพเครื่องมือ
                                </h4>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <span className="text-[9px] text-slate-400 font-black block uppercase leading-none mb-1">สภาพก่อนยืม</span>
                                        {record.borrowPhotoUrl ? (
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveLightboxImage(record.borrowPhotoUrl || null);
                                                }}
                                                className="relative rounded-lg overflow-hidden border border-slate-150 dark:border-base-800 bg-slate-900/5 dark:bg-base-950/40 h-20 flex items-center justify-center group cursor-zoom-in"
                                            >
                                                <img 
                                                    src={record.borrowPhotoUrl} 
                                                    alt="Borrow condition" 
                                                    className="h-full w-full object-contain group-hover:scale-105 transition-all duration-200"
                                                    referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                    <span className="text-[9px] bg-black/70 text-white font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                                        🔍 คลิกขยาย
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-20 bg-slate-100/70 dark:bg-base-950/40 rounded-lg flex flex-col items-center justify-center border border-dashed border-slate-200 text-[10px] text-slate-400 font-bold uppercase">
                                                ไม่มีภาพถ่าย
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-slate-400 font-black block uppercase leading-none mb-1">สภาพหลังคืน</span>
                                        {record.returnPhotoUrl ? (
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveLightboxImage(record.returnPhotoUrl || null);
                                                }}
                                                className="relative rounded-lg overflow-hidden border border-slate-150 dark:border-base-800 bg-slate-900/5 dark:bg-base-950/40 h-20 flex items-center justify-center group cursor-zoom-in"
                                            >
                                                <img 
                                                    src={record.returnPhotoUrl} 
                                                    alt="Return condition" 
                                                    className="h-full w-full object-contain group-hover:scale-105 transition-all duration-200"
                                                    referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                    <span className="text-[9px] bg-black/70 text-white font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                                        🔍 คลิกขยาย
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-20 bg-slate-100/70 dark:bg-base-950/40 rounded-lg flex flex-col items-center justify-center border border-dashed border-slate-200 text-[10px] text-slate-400 font-bold uppercase">
                                                ไม่มีภาพถ่าย
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Note / Remarks Row */}
                        {record.notes && (
                            <div className="mt-4 p-3 bg-white dark:bg-base-900/40 border border-slate-150 dark:border-base-850 rounded-xl">
                                <span className="text-[10px] text-slate-400 font-black block uppercase">📝 หมายเหตุเพิ่มเติมประกอบรายการ</span>
                                <p className="text-slate-600 dark:text-slate-300 font-semibold mt-1 whitespace-pre-line text-[11px] leading-relaxed">
                                    {record.notes}
                                </p>
                            </div>
                        )}

                        {/* Action footer inside collapsible drawer */}
                        <div className="mt-4 pt-3.5 border-t border-slate-150 dark:border-base-800 flex justify-between items-center">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDelete(record);
                                }}
                                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-650 hover:text-white text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-900/60 rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs"
                                title="ลบประวัติการยืม-คืนเครื่องมือนี้"
                            >
                                <TrashIcon className="h-4 w-4" />
                                <span>ลบรายการ</span>
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEdit(record);
                                    }}
                                    className="px-4 py-1.5 border border-slate-200 hover:border-slate-300 dark:border-base-700 dark:hover:border-base-600 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-100/60 dark:hover:bg-base-800 transition-all flex items-center gap-1.5 text-xs"
                                >
                                    <PencilIcon className="h-3.5 w-3.5" />
                                    <span>แก้ไขข้อมูลยืม</span>
                                </button>

                                {!isReturned && !record.isConsumable && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenReturn(record);
                                        }}
                                        className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black shadow-sm transition-all flex items-center gap-1.5 hover:translate-y-[-1px] active:translate-y-[0px] text-xs"
                                    >
                                        <CheckCircleIcon className="h-3.5 w-3.5" />
                                        <span>ส่งคืนอุปกรณ์</span>
                                    </button>
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto px-4 md:px-6 py-6 animate-fade-in" id="borrow-tab-container">
            
            {/* NOTIFICATION */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border animate-bounce ${
                    notification.isError 
                        ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200' 
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200'
                }`}>
                    {notification.isError ? <XCircleIcon className="h-5 w-5 shrink-0" /> : <CheckCircleIcon className="h-5 w-5 shrink-0" />}
                    <span className="text-sm font-black">{notification.message}</span>
                </div>
            )}

            {/* HEADER & OVERDUE ALERT BANNER */}
            {isIsolatedView ? (
                <div className="p-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-[2rem] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-indigo-500/20">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase rounded-full tracking-wider border border-amber-500/25 animate-pulse">
                                🔌 ระบบเครื่องมือยืม-คืนด้วยตนเอง (Self-Service Terminal)
                            </span>
                        </div>
                        <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white">
                            บริการ ยืม-คืน เครื่องมือวิทยาศาสตร์
                        </h2>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-xl font-medium">
                            โปรดสแกนคิวอาร์โค้ดบนอุปกรณ์ หรือทำการค้นหาชื่ออุปกรณ์ด้านล่าง เพื่อบันทึกทำรายการยืมหรือส่งคืนโดยตรง
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => setIsScannerOpen(true)}
                            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs shadow-lg transition-all uppercase tracking-wider hover:translate-y-[-1px] active:translate-y-[0px]"
                        >
                            <CameraIcon className="h-4 w-4" />
                            <span>📷 เปิดกล้องสแกน QR</span>
                        </button>
                        
                        <button
                            type="button"
                            onClick={handleOpenNewBorrow}
                            className="flex items-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-xs shadow-md transition-all uppercase tracking-wider border border-slate-700 hover:translate-y-[-1px] active:translate-y-[0px]"
                        >
                            <PlusIcon className="h-4 w-4" />
                            <span>✍️ บันทึกยืมใหม่</span>
                        </button>
                        
                        {onExitIsolated && (
                            <button
                                type="button"
                                onClick={onExitIsolated}
                                className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl font-bold text-xs transition-all border border-slate-800"
                                title="สำหรับเจ้าหน้าที่ / ดูระบบทั้งหมด"
                            >
                                🔒 ออกจากหน้านี้
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                            📋 บันทึกการยืม-คืน อุปกรณ์ทดสอบ
                        </h2>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                            จัดการ ติดตาม และตรวจสอบประวัติการยืม-คืนเครื่องมือทดสอบทั้งจากหน่วยงานภายในและภายนอก
                        </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            onClick={() => setShowMonitorDashboard(!showMonitorDashboard)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs shadow-sm transition-all border ${
                                showMonitorDashboard 
                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-400' 
                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-base-800 dark:text-slate-300 dark:hover:bg-base-750 border-slate-200 dark:border-base-700'
                            }`}
                        >
                            <span>📊 {showMonitorDashboard ? 'ซ่อนแดชบอร์ดติดตาม' : 'แสดงแดชบอร์ดติดตาม'}</span>
                        </button>
                        <button
                            onClick={fetchData}
                            className="p-2.5 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:bg-base-800 dark:text-slate-300 dark:hover:text-white dark:hover:bg-base-700 rounded-xl transition-all border border-slate-200 dark:border-base-700 shadow-sm"
                            title="รีเฟรชข้อมูล"
                        >
                            <RefreshIcon className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setIsScannerOpen(true)}
                            className="flex items-center gap-2 px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md transition-all uppercase tracking-wide hover:translate-y-[-1px] active:translate-y-[0px]"
                            title="เปิดกล้องสแกน QR Code อุปกรณ์"
                        >
                            <CameraIcon className="h-4 w-4" />
                            <span>สแกน QR Code</span>
                        </button>
                        <button
                            onClick={handleOpenNewBorrow}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-black text-xs shadow-md transition-all uppercase tracking-wide hover:translate-y-[-1px] active:translate-y-[0px]"
                        >
                            <PlusIcon className="h-4 w-4" />
                            <span>ยืมอุปกรณ์ใหม่</span>
                        </button>
                    </div>
                </div>
            )}

            {/* WARNING BANNER FOR OVERDUE ITEMS */}
            {(!isIsolatedView && showMonitorDashboard && overdueCount > 0) && (
                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm animate-fade-in">
                    <AlertTriangleIcon className="h-6 w-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                    <div className="flex-1">
                        <h4 className="text-sm font-black text-rose-800 dark:text-rose-300">
                            ตรวจพบรายการค้างคืนอุปกรณ์เลยกำหนด! ({overdueCount} รายการ)
                        </h4>
                        <p className="text-xs text-rose-700/85 dark:text-rose-400/80 mt-0.5 font-semibold">
                            กรุณาติดต่อผู้ยืมเครื่องมือตามรายชื่อด้านล่างที่ขึ้นสถานะสีแดง เพื่อเร่งติดตามส่งคืนอุปกรณ์ห้องปฏิบัติการกลับเข้าหน่วยงานโดยด่วน
                        </p>
                    </div>
                </div>
            )}

            {/* QUICK OVERVIEW STAT CARDS */}
            {(!isIsolatedView && showMonitorDashboard) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in">
                    <div className="bg-white dark:bg-base-900 border border-slate-200 dark:border-base-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                        <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block">กำลังยืมใช้งาน</span>
                            <span className="text-xl md:text-2xl font-black text-amber-600 dark:text-amber-500">{borrowedCount} <span className="text-xs text-slate-400 font-bold">เครื่องมือ</span></span>
                        </div>
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-600 rounded-xl">
                            <ClockIcon className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-base-900 border border-slate-200 dark:border-base-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                        <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block">เลยกำหนดส่งคืน ⚠️</span>
                            <span className="text-xl md:text-2xl font-black text-rose-600 dark:text-rose-500">{overdueCount} <span className="text-xs text-slate-400 font-bold">เครื่องมือ</span></span>
                        </div>
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 rounded-xl">
                            <AlertTriangleIcon className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-base-900 border border-slate-200 dark:border-base-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                        <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block">ส่งคืนเสร็จสิ้นแล้ว</span>
                            <span className="text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-500">{returnedCount} <span className="text-xs text-slate-400 font-bold">เครื่องมือ</span></span>
                        </div>
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-xl">
                            <CheckCircleIcon className="h-6 w-6" />
                        </div>
                    </div>
                </div>
            )}

            {/* FILTERS & SEARCH */}
            <div className="bg-slate-50 dark:bg-base-900/60 p-4 rounded-2xl border border-slate-200 dark:border-base-800 flex flex-col md:flex-row gap-4 justify-between items-center">
                {/* Search */}
                <div className="relative w-full md:max-w-sm">
                    <input
                        type="text"
                        placeholder="ค้นหาชื่ออุปกรณ์, ผู้ยืม, หรือเบอร์โทร..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-4 pr-4 py-2 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-750 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-black"
                        >
                            ล้าง
                        </button>
                    )}
                </div>

                {/* Filter segments */}
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    {/* Borrower Type Filter */}
                    <div className="flex bg-slate-100 dark:bg-base-800 p-1 rounded-xl border border-slate-200/60 dark:border-base-700/60 shrink-0">
                        <button
                            onClick={() => setFilterType('all')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                filterType === 'all' ? 'bg-white dark:bg-base-750 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                            }`}
                        >
                            ทั้งหมด
                        </button>
                        <button
                            onClick={() => setFilterType('internal')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                filterType === 'internal' ? 'bg-white dark:bg-base-750 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                            }`}
                        >
                            ภายในหน่วยงาน
                        </button>
                        <button
                            onClick={() => setFilterType('external')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                filterType === 'external' ? 'bg-white dark:bg-base-750 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                            }`}
                        >
                            ภายนอกหน่วยงาน
                        </button>
                    </div>

                    {/* Status Filter */}
                    <div className="flex bg-slate-100 dark:bg-base-800 p-1 rounded-xl border border-slate-200/60 dark:border-base-700/60 shrink-0">
                        <button
                            onClick={() => setFilterStatus('all')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                filterStatus === 'all' ? 'bg-white dark:bg-base-750 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                            }`}
                        >
                            ทุกสถานะ
                        </button>
                        <button
                            onClick={() => setFilterStatus('borrowed')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                filterStatus === 'borrowed' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                            }`}
                        >
                            กำลังยืม ({borrowedCount})
                        </button>
                        <button
                            onClick={() => setFilterStatus('overdue')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                filterStatus === 'overdue' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                            }`}
                        >
                            เลยกำหนด ({overdueCount})
                        </button>
                        <button
                            onClick={() => setFilterStatus('returned')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                filterStatus === 'returned' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                            }`}
                        >
                            คืนแล้ว ({returnedCount})
                        </button>
                    </div>
                </div>
            </div>

            {/* DATA CONTAINER */}
            {isLoading ? (
                <div className="py-24 text-center flex flex-col items-center justify-center gap-3 bg-white dark:bg-base-900 border border-slate-200 dark:border-base-800 rounded-3xl shadow-sm">
                    <RefreshIcon className="h-10 w-10 text-primary-600 animate-spin" />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">กำลังดึงข้อมูลประวัติการยืม-คืน...</p>
                </div>
            ) : filteredRecords.length === 0 ? (
                <div className="bg-white dark:bg-base-900 border border-slate-200 dark:border-base-800 rounded-3xl p-16 text-center shadow-sm space-y-4">
                    <div className="inline-block p-4.5 bg-slate-100 dark:bg-base-800 text-slate-400 rounded-2xl">
                        <InformationCircleIcon className="h-10 w-10" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-slate-800 dark:text-white uppercase">
                            ไม่พบข้อมูลรายการยืม-คืนเครื่องมือ
                        </h3>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-medium">
                            {searchQuery ? 'ไม่พบบันทึกที่ตรงกับการค้นหาของคุณ ลองเปลี่ยนคีย์เวิร์ดคำค้น' : 'ยังไม่มีบันทึกข้อมูลยืมหรือส่งคืนในระบบ สามารถคลิกปุ่มด้านบนขวาเพื่อทำรายการใหม่'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4" id="borrow-records-accordion">
                    {/* ACCORDION CONTROL UTILITY HEADER */}
                    <div className="flex justify-between items-center bg-slate-50/50 dark:bg-base-900/20 px-3 py-2 rounded-2xl text-xs border border-slate-100 dark:border-base-850">
                        <div className="text-slate-400 font-bold">
                            📦 แสดงทั้งหมด {filteredRecords.length} รายการ (ในแท็บที่เลือก)
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExpandAll}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 dark:hover:bg-base-750 text-slate-600 dark:text-slate-300 rounded-lg font-black transition-all text-[11px]"
                            >
                                ขยายข้อมูลทั้งหมด
                            </button>
                            <button
                                onClick={handleCollapseAll}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 dark:hover:bg-base-750 text-slate-600 dark:text-slate-300 rounded-lg font-black transition-all text-[11px]"
                            >
                                ย่อข้อมูลทั้งหมด
                            </button>
                        </div>
                    </div>

                    {/* RENDER DYNAMIC CATEGORIZED ACCORDION CARDS */}
                    <div className="space-y-8">
                        {/* 1. High-Value Cabinet Assets */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-base-800">
                                <span className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    💎 รายการอุปกรณ์มูลค่าสูงในตู้ควบคุม ({filteredRecords.filter(r => r.isHighValue).length})
                                </span>
                                <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/25 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                                    ตู้อุปกรณ์มูลค่าสูง (Cabinet)
                                </span>
                            </div>
                            
                            {filteredRecords.filter(r => r.isHighValue).length === 0 ? (
                                <div className="text-center py-8 text-slate-400 dark:text-slate-500 font-semibold border border-dashed border-slate-200 dark:border-base-800 rounded-2xl bg-slate-50/20 dark:bg-base-950/5">
                                    ไม่มีรายการยืมเครื่องมือในหมวดตู้อุปกรณ์มูลค่าสูงในขณะนี้
                                </div>
                            ) : (
                                <div className="space-y-3.5">
                                    {filteredRecords.filter(r => r.isHighValue).map(renderRecordCard)}
                                </div>
                            )}
                        </div>

                        {/* 2. General/Other Assets */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-base-800">
                                <span className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    🔧 รายการอุปกรณ์ทั่วไป/เครื่องมืออื่นๆ ({filteredRecords.filter(r => !r.isHighValue).length})
                                </span>
                                <span className="px-2.5 py-0.5 bg-slate-50 dark:bg-base-850 text-slate-500 dark:text-slate-400 text-[10px] font-black rounded-lg border border-slate-200/60 dark:border-base-800">
                                    อุปกรณ์ภายนอกทั่วไป (General)
                                </span>
                            </div>

                            {filteredRecords.filter(r => !r.isHighValue).length === 0 ? (
                                <div className="text-center py-8 text-slate-400 dark:text-slate-500 font-semibold border border-dashed border-slate-200 dark:border-base-800 rounded-2xl bg-slate-50/20 dark:bg-base-950/5">
                                    ไม่มีรายการยืมเครื่องมือในหมวดอุปกรณ์ทั่วไปในขณะนี้
                                </div>
                            ) : (
                                <div className="space-y-3.5">
                                    {filteredRecords.filter(r => !r.isHighValue).map(renderRecordCard)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: NEW / EDIT BORROW FORM --- */}
            {isBorrowModalOpen && editingRecord && (() => {
                const isStep1Valid = !!editingRecord.equipmentName?.trim();
                const isStep2Valid = !!editingRecord.borrowerName?.trim() && 
                                     !!editingRecord.borrowerPhone?.trim() && 
                                     (editingRecord.borrowerType !== 'external' || !!editingRecord.guarantorName?.trim());

                return (
                    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                        <div className="relative bg-white dark:bg-base-900 rounded-[2.5rem] border border-slate-200 dark:border-base-800 shadow-2xl max-w-xl w-full overflow-hidden transition-all duration-300">
                            
                            {/* Title Bar with Modern Stepper Header */}
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-base-850 bg-slate-50/50 dark:bg-base-950/20">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                        {editingRecord.id ? "📝 แก้ไขข้อมูลยืมอุปกรณ์" : "📦 บันทึกยืมเครื่องมือใหม่"}
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={handleCloseBorrowModal}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-all rounded-full hover:bg-slate-100 dark:hover:bg-base-800"
                                    >
                                        <XCircleIcon className="h-5 w-5" />
                                    </button>
                                </div>
                                
                                {/* Stepper progress */}
                                <div className="relative flex items-center justify-between w-full max-w-xs mx-auto mt-4 mb-2">
                                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 dark:bg-base-800"></div>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-indigo-600 transition-all duration-300" style={{ width: `${((borrowStep - 1) / 2) * 100}%` }}></div>
                                    
                                    <button 
                                        type="button" 
                                        onClick={() => isStep1Valid && setBorrowStep(1)}
                                        className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full border-2 font-bold text-xs transition-all ${
                                            borrowStep >= 1 ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-base-800 border-slate-300 dark:border-base-700 text-slate-500'
                                        }`}
                                    >
                                        {borrowStep > 1 ? '✓' : '1'}
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => isStep1Valid && setBorrowStep(2)}
                                        disabled={!isStep1Valid}
                                        className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full border-2 font-bold text-xs transition-all ${
                                            borrowStep >= 2 ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-base-800 border-slate-300 dark:border-base-700 text-slate-500'
                                        }`}
                                    >
                                        {borrowStep > 2 ? '✓' : '2'}
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => isStep1Valid && isStep2Valid && setBorrowStep(3)}
                                        disabled={!isStep1Valid || !isStep2Valid}
                                        className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full border-2 font-bold text-xs transition-all ${
                                            borrowStep >= 3 ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-base-800 border-slate-300 dark:border-base-700 text-slate-500'
                                        }`}
                                    >
                                        3
                                    </button>
                                </div>
                                <div className="flex justify-between w-full max-w-xs mx-auto text-xs font-black uppercase text-slate-500 dark:text-slate-400 px-1 mt-1">
                                    <span className={borrowStep === 1 ? "text-indigo-600 dark:text-indigo-400 font-extrabold" : ""}>เครื่องมือที่ยืม</span>
                                    <span className={borrowStep === 2 ? "text-indigo-600 dark:text-indigo-400 font-extrabold" : ""}>ข้อมูลผู้ยืม</span>
                                    <span className={borrowStep === 3 ? "text-indigo-600 dark:text-indigo-400 font-extrabold" : ""}>วันเวลา & สภาพ</span>
                                </div>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleSaveBorrow} className="p-6">
                                
                                {/* Step 1: Equipment Details */}
                                {borrowStep === 1 && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="bg-indigo-50/40 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 p-4 rounded-2xl flex items-start gap-3">
                                            <InformationCircleIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                                            <div className="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed font-medium">
                                                ระบุชื่อเครื่องมืออุปกรณ์ที่ต้องการทำรายการยืม และประเภทผู้รับบริการด้านล่าง
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                📦 ประเภทอุปกรณ์หลัก / แหล่งจัดเก็บ <span className="text-rose-500">*</span>
                                            </label>
                                            <div className="grid grid-cols-2 bg-slate-100 dark:bg-base-950 p-1.5 rounded-2xl border border-slate-200/60 dark:border-base-800">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingRecord({ ...editingRecord, isHighValue: true, equipmentName: '', assetId: '' })}
                                                    className={`py-3 rounded-xl text-xs font-black transition-all ${
                                                        editingRecord.isHighValue 
                                                            ? 'bg-white dark:bg-base-700 text-indigo-600 dark:text-indigo-400 shadow-md' 
                                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    💎 ตู้อุปกรณ์มูลค่าสูง
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingRecord({ ...editingRecord, isHighValue: false, equipmentName: '', assetId: '' })}
                                                    className={`py-3 rounded-xl text-xs font-black transition-all ${
                                                        !editingRecord.isHighValue 
                                                            ? 'bg-white dark:bg-base-700 text-indigo-600 dark:text-indigo-400 shadow-md' 
                                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    🔧 อุปกรณ์อื่นๆ ทั่วไป
                                                </button>
                                            </div>
                                        </div>

                                        {editingRecord.isHighValue ? (
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                    💎 เลือกอุปกรณ์มูลค่าสูงในตู้ควบคุม <span className="text-rose-500">*</span>
                                                </label>
                                                <select
                                                    value={editingRecord.assetId || ''}
                                                    onChange={(e) => {
                                                        const selectedId = e.target.value;
                                                        const asset = activeHighValueAssets.find(a => a.id === selectedId);
                                                        if (asset) {
                                                            setEditingRecord({ 
                                                                ...editingRecord, 
                                                                assetId: selectedId, 
                                                                equipmentName: `${asset.name} (${asset.code})` 
                                                            });
                                                        } else {
                                                            setEditingRecord({ 
                                                                ...editingRecord, 
                                                                assetId: '', 
                                                                equipmentName: '' 
                                                            });
                                                        }
                                                    }}
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                                                    required
                                                >
                                                    <option value="">-- กรุณาเลือกอุปกรณ์มูลค่าสูง --</option>
                                                    {activeHighValueAssets.map(asset => (
                                                        <option key={asset.id} value={asset.id}>
                                                            {asset.name} [{asset.code}] ({asset.cabinet})
                                                        </option>
                                                    ))}
                                                </select>
                                                {activeHighValueAssets.length === 0 && (
                                                    <p className="text-[10px] text-rose-500 font-bold">
                                                        * ไม่มีรายการอุปกรณ์มูลค่าสูงเปิดใช้งานอยู่ในระบบหน้าตั้งค่า
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                    🛠️ พิมพ์ชื่ออุปกรณ์ทั่วไปที่ต้องการยืม <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="ระบุชื่อเครื่องมืออุปกรณ์ทั่วไป..."
                                                    value={editingRecord.equipmentName || ''}
                                                    onChange={(e) => setEditingRecord({ ...editingRecord, equipmentName: e.target.value })}
                                                    className="w-full px-4 py-3.5 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                                                    required
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                🏢 สังกัด / ประเภทผู้ยืม
                                            </label>
                                            <div className="grid grid-cols-2 bg-slate-100 dark:bg-base-950 p-1.5 rounded-2xl border border-slate-200/60 dark:border-base-800">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingRecord({ ...editingRecord, borrowerType: 'internal' })}
                                                    className={`py-3 rounded-xl text-xs font-black transition-all ${
                                                        editingRecord.borrowerType === 'internal' 
                                                            ? 'bg-white dark:bg-base-700 text-slate-800 dark:text-white shadow-md' 
                                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    ภายในหน่วยงาน
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingRecord({ ...editingRecord, borrowerType: 'external' })}
                                                    className={`py-3 rounded-xl text-xs font-black transition-all ${
                                                        editingRecord.borrowerType === 'external' 
                                                            ? 'bg-white dark:bg-base-700 text-slate-800 dark:text-white shadow-md' 
                                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    ภายนอกหน่วยงาน ⚠️
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Step 2: Borrower Details */}
                                {borrowStep === 2 && (
                                    <div className="space-y-4 animate-fade-in">
                                        {editingRecord.borrowerType === 'internal' ? (
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                    👤 ชื่อผู้ยืม (พนักงานภายใน) <span className="text-rose-500">*</span>
                                                </label>
                                                <select
                                                    value={testers.some(t => t.name === editingRecord.borrowerName) ? editingRecord.borrowerName : (editingRecord.borrowerName ? 'custom' : '')}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === 'custom') {
                                                            setEditingRecord({ ...editingRecord, borrowerName: '' });
                                                        } else {
                                                            setEditingRecord({ ...editingRecord, borrowerName: val });
                                                        }
                                                    }}
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                                                >
                                                    <option value="">-- เลือกพนักงานในระบบ --</option>
                                                    {testers.map(t => (
                                                        <option key={t.id} value={t.name}>{t.name}</option>
                                                    ))}
                                                    <option value="custom">✍️ พิมพ์ชื่อระบุเอง...</option>
                                                </select>
                                                
                                                {/* Show manual override if they choose "custom" */}
                                                {!testers.some(t => t.name === editingRecord.borrowerName) && (
                                                    <input
                                                        type="text"
                                                        placeholder="พิมพ์ชื่อพนักงานระบุเอง..."
                                                        value={editingRecord.borrowerName || ''}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, borrowerName: e.target.value })}
                                                        className="w-full mt-2 px-4 py-3 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                                                        required
                                                    />
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                    👤 ชื่อ-นามสกุล ผู้ยืม (บุคคลภายนอก) <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="ระบุชื่อ-นามสกุล หรือหน่วยงานภายนอก..."
                                                    value={editingRecord.borrowerName || ''}
                                                    onChange={(e) => setEditingRecord({ ...editingRecord, borrowerName: e.target.value })}
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                                                    required
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                📞 เบอร์โทรติดต่อ <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="tel"
                                                placeholder="ระบุเบอร์โทรศัพท์สำหรับติดต่อ..."
                                                value={editingRecord.borrowerPhone || ''}
                                                onChange={(e) => setEditingRecord({ ...editingRecord, borrowerPhone: e.target.value })}
                                                className="w-full px-4 py-3 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                                                required
                                            />
                                        </div>

                                        {/* Internal Guarantor - ONLY visible/required if EXTERNAL borrower */}
                                        {editingRecord.borrowerType === 'external' && (
                                            <div className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2 animate-fade-in">
                                                <label className="text-[11px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider block flex items-center gap-1.5">
                                                    🛡️ พนักงานภายในผู้ดูแล / ผู้รับรองสิทธิ์ <span className="text-rose-500">*</span>
                                                </label>
                                                
                                                <select
                                                    value={testers.some(t => t.name === editingRecord.guarantorName) ? editingRecord.guarantorName : (editingRecord.guarantorName ? 'custom' : '')}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === 'custom') {
                                                            setEditingRecord({ ...editingRecord, guarantorName: '' });
                                                        } else {
                                                            setEditingRecord({ ...editingRecord, guarantorName: val });
                                                        }
                                                    }}
                                                    className="w-full px-4 py-3 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-white"
                                                    required
                                                >
                                                    <option value="">-- เลือกพนักงานภายในผู้พาเข้า/ผู้รับรอง --</option>
                                                    {testers.map(t => (
                                                        <option key={t.id} value={t.name}>{t.name}</option>
                                                    ))}
                                                    <option value="custom">✍️ พิมพ์ชื่อระบุเอง...</option>
                                                </select>

                                                {(!testers.some(t => t.name === editingRecord.guarantorName) || editingRecord.guarantorName === '') && (
                                                    <input
                                                        type="text"
                                                        placeholder="พิมพ์ชื่อพนักงานระบุเอง..."
                                                        value={editingRecord.guarantorName || ''}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, guarantorName: e.target.value })}
                                                        className="w-full mt-2 px-4 py-3 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-white"
                                                        required
                                                    />
                                                )}

                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-relaxed">
                                                    * พนักงานในหน่วยงานจะต้องลงชื่อกำกับดูแลและติดตามคืนอุปกรณ์เสมอ
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Dates & Photo upload */}
                                {borrowStep === 3 && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="bg-slate-50 dark:bg-base-950/40 p-4 rounded-2xl border border-slate-200/50 dark:border-base-800/80 space-y-3">
                                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">📅 แผนวันเวลารายการยืม</span>
                                            
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 block">วันที่ยืม</label>
                                                    <input
                                                        type="date"
                                                        value={editingRecord.borrowDate || ''}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, borrowDate: e.target.value })}
                                                        className="w-full px-3 py-2.5 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 block">เวลายืม</label>
                                                    <input
                                                        type="time"
                                                        value={editingRecord.borrowTime || ''}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, borrowTime: e.target.value })}
                                                        className="w-full px-3 py-2.5 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </div>
                                            </div>

                                            {editingRecord.isHighValue && editingRecord.assetId && activeHighValueAssets.find(a => a.id === editingRecord.assetId)?.isConsumable ? (
                                                <div className="pt-2.5 border-t border-slate-200/50 dark:border-base-800 text-center py-2 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl px-2">
                                                    <p className="text-xs font-black text-indigo-700 dark:text-indigo-400 flex items-center justify-center gap-1">
                                                        ♻️ ทรัพย์สินใช้สิ้นเปลือง (ไม่ต้องกำหนดส่งคืน)
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                                                        เบิกแล้วของหมดไป สต็อกจะปรับลดให้อัตโนมัติ
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-1 pt-2.5 border-t border-slate-200/50 dark:border-base-800">
                                                    <label className="text-[10px] font-bold text-slate-400 block">🏁 วันกำหนดส่งคืน</label>
                                                    <input
                                                        type="date"
                                                        value={editingRecord.expectedReturnDate || ''}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, expectedReturnDate: e.target.value })}
                                                        className="w-full px-3 py-2.5 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                📸 ภาพสภาพเครื่องมือก่อนยืม (ถ้ามี)
                                            </label>
                                            {editingRecord.borrowPhotoUrl ? (
                                                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-base-700 bg-slate-50 dark:bg-base-950/20 h-40 flex items-center justify-center">
                                                    <img 
                                                        src={editingRecord.borrowPhotoUrl} 
                                                        alt="Borrow condition" 
                                                        className="h-full w-full object-cover"
                                                        referrerPolicy="no-referrer"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingRecord({ ...editingRecord, borrowPhotoUrl: '' })}
                                                        className="absolute top-2 right-2 px-3 py-1.5 bg-rose-600/95 hover:bg-rose-700 text-white text-[10px] font-black rounded-lg shadow-md transition-all active:scale-95"
                                                    >
                                                        ลบรูปภาพ
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center w-full">
                                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 dark:border-base-800 border-dashed rounded-2xl cursor-pointer bg-slate-50 dark:bg-base-950/20 hover:bg-slate-100 dark:hover:bg-base-850 transition-all p-4 text-center">
                                                        <div className="flex flex-col items-center justify-center pt-1 pb-2">
                                                            <CameraIcon className="w-8 h-8 mb-2 text-indigo-500 animate-pulse" />
                                                            <p className="text-xs font-black text-indigo-600 dark:text-indigo-400">คลิกเพื่อถ่ายภาพ / อัพโหลด</p>
                                                            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-semibold">รองรับไฟล์ภาพ JPEG, PNG (ขนาดถูกบีบอัด)</p>
                                                        </div>
                                                        <input 
                                                            type="file" 
                                                            accept="image/*" 
                                                            capture="environment"
                                                            className="hidden" 
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) handleCompressAndSetPhoto(file, 'borrow');
                                                            }}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                📝 หมายเหตุเพิ่มเติม
                                            </label>
                                            <textarea
                                                placeholder="ระบุวัตถุประสงค์ หรือหมายเหตุสภาพเพิ่มเติม..."
                                                rows={2}
                                                value={editingRecord.notes || ''}
                                                onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-base-800 border border-slate-200 dark:border-base-750 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Footer Bar */}
                                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-base-850 flex items-center justify-between">
                                    <div>
                                        {borrowStep > 1 && (
                                            <button
                                                key="borrow-back-btn"
                                                type="button"
                                                onClick={() => setBorrowStep(prev => prev - 1)}
                                                className="px-5 py-3 border border-slate-200 dark:border-base-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-base-850 rounded-xl text-xs font-black transition-all"
                                            >
                                                ← ย้อนกลับ
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            key="borrow-cancel-btn"
                                            type="button"
                                            onClick={handleCloseBorrowModal}
                                            className="px-4 py-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-black transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        {borrowStep < 3 ? (
                                            <button
                                                key="borrow-next-btn"
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (borrowStep === 1 && isStep1Valid) setBorrowStep(2);
                                                    else if (borrowStep === 2 && isStep2Valid) setBorrowStep(3);
                                                }}
                                                disabled={(borrowStep === 1 && !isStep1Valid) || (borrowStep === 2 && !isStep2Valid)}
                                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all uppercase tracking-wide"
                                            >
                                                ถัดไป →
                                            </button>
                                        ) : (
                                            <button
                                                key="borrow-submit-btn"
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2"
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <RefreshIcon className="h-4 w-4 animate-spin" />
                                                        <span>กำลังบันทึก...</span>
                                                    </>
                                                ) : (
                                                    <span>บันทึกรายการยืม ✓</span>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* --- MODAL: CONFIRM RETURN --- */}
            {isReturnModalOpen && selectedRecordForReturn && (() => {
                const isOverdue = selectedRecordForReturn.expectedReturnDate < new Date().toISOString().split('T')[0];
                const isReturnStep1Valid = !!returnedBy && 
                                           (selectedRecordForReturn.borrowerType !== 'external' || !!returnReceiverName);

                return (
                    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                        <div className="relative bg-white dark:bg-base-900 rounded-[2.5rem] border border-slate-200 dark:border-base-800 shadow-2xl max-w-xl w-full overflow-hidden transition-all duration-300">
                            
                            {/* Title Bar with Step Indicator */}
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-base-850 bg-slate-50/50 dark:bg-base-950/20">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                        🟢 บันทึกการส่งคืนเครื่องมือ
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={handleCloseReturnModal}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-all rounded-full hover:bg-slate-100 dark:hover:bg-base-800"
                                    >
                                        <XCircleIcon className="h-5 w-5" />
                                    </button>
                                </div>
                                
                                {/* Stepper progress */}
                                <div className="relative flex items-center justify-between w-full max-w-xs mx-auto mt-4 mb-2">
                                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 dark:bg-base-800"></div>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-600 transition-all duration-300" style={{ width: `${((returnStep - 1) / 1) * 100}%` }}></div>
                                    
                                    <button 
                                        type="button" 
                                        onClick={() => setReturnStep(1)}
                                        className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full border-2 font-bold text-xs transition-all ${
                                            returnStep >= 1 ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-base-800 border-slate-300 dark:border-base-700 text-slate-500'
                                        }`}
                                    >
                                        {returnStep > 1 ? '✓' : '1'}
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => isReturnStep1Valid && setReturnStep(2)}
                                        disabled={!isReturnStep1Valid}
                                        className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full border-2 font-bold text-xs transition-all ${
                                            returnStep >= 2 ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-base-800 border-slate-300 dark:border-base-700 text-slate-500'
                                        }`}
                                    >
                                        2
                                    </button>
                                </div>
                                <div className="flex justify-between w-full max-w-xs mx-auto text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 px-1 mt-1">
                                    <span className={returnStep === 1 ? "text-emerald-600 dark:text-emerald-400 font-extrabold" : ""}>ข้อมูลผู้ส่งคืน</span>
                                    <span className={returnStep === 2 ? "text-emerald-600 dark:text-emerald-400 font-extrabold" : ""}>ตรวจรับสภาพ & คืนจริง</span>
                                </div>
                            </div>

                            <div className="p-6">
                                
                                {/* Step 1: Returnee details & Original Borrow summary card */}
                                {returnStep === 1 && (
                                    <div className="space-y-4 animate-fade-in">
                                        
                                        {/* Original Borrow Information Card */}
                                        <div className="p-4 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200/60 dark:border-base-800/80 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider">📦 ข้อมูลรายการยืมเดิม</span>
                                                {isOverdue && (
                                                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-full animate-pulse">
                                                        ⚠️ เกินกำหนดคืน
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="space-y-1 pt-1">
                                                <p className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                                                    🛠️ {selectedRecordForReturn.equipmentName}
                                                </p>
                                                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                    👤 ผู้ยืม: {selectedRecordForReturn.borrowerName} ({selectedRecordForReturn.borrowerType === 'internal' ? 'พนักงานภายใน' : 'บุคคลภายนอก'})
                                                </p>
                                                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                    📅 วันที่ยืม: {selectedRecordForReturn.borrowDate} | กำหนดคืน: {selectedRecordForReturn.expectedReturnDate}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Who Returned the Equipment */}
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                👤 ชื่อผู้ส่งคืนอุปกรณ์จริง <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="ระบุชื่อคนที่นำอุปกรณ์มาคืนจริง..."
                                                value={returnedBy}
                                                onChange={(e) => setReturnedBy(e.target.value)}
                                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                                                required
                                            />
                                        </div>

                                        {/* Employee who accepted/checked the return */}
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                👮 พนักงานภายในผู้รับคืน {selectedRecordForReturn.borrowerType === 'external' && <span className="text-rose-500">*</span>}
                                            </label>
                                            <select
                                                value={testers.some(t => t.name === returnReceiverName) ? returnReceiverName : (returnReceiverName ? 'custom' : '')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'custom') {
                                                        setReturnReceiverName('');
                                                    } else {
                                                        setReturnReceiverName(val);
                                                    }
                                                }}
                                                className="w-full px-4 py-3 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                                                required={selectedRecordForReturn.borrowerType === 'external'}
                                            >
                                                <option value="">-- เลือกเจ้าหน้าที่ผู้ตรวจสอบในระบบ --</option>
                                                {testers.map(t => (
                                                    <option key={t.id} value={t.name}>{t.name}</option>
                                                ))}
                                                <option value="custom">✍️ พิมพ์ชื่อระบุเอง...</option>
                                            </select>
                                            
                                            {(!testers.some(t => t.name === returnReceiverName) || returnReceiverName === '') && (
                                                <input
                                                    type="text"
                                                    placeholder="พิมพ์ชื่อพนักงานระบุเอง..."
                                                    value={returnReceiverName}
                                                    onChange={(e) => setReturnReceiverName(e.target.value)}
                                                    className="w-full mt-2 px-4 py-3 bg-white dark:bg-base-800 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                                                    required={selectedRecordForReturn.borrowerType === 'external'}
                                                />
                                            )}
                                            
                                            {selectedRecordForReturn.borrowerType === 'external' ? (
                                                <span className="text-[10px] text-amber-600 dark:text-amber-500 font-bold block leading-relaxed">
                                                    ⚠️ เนื่องจากยืมโดยหน่วยงานภายนอก ต้องมีเจ้าหน้าที่พนักงานลงชื่อดูแลรับเครื่องคืนและตรวจสอบสภาพเสมอ
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-relaxed">
                                                    * อ้างอิงรายชื่อเพื่อเชื่อมโยงกับฐานข้อมูลพนักงานประจำแล็บ
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Step 2: Return details & condition photo */}
                                {returnStep === 2 && (
                                    <div className="space-y-4 animate-fade-in">
                                        
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                📅 วันที่รับคืนจริง
                                            </label>
                                            <input
                                                type="date"
                                                value={returnDate}
                                                onChange={(e) => setReturnDate(e.target.value)}
                                                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>

                                        {/* Return Photo Upload */}
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                📸 ภาพถ่ายตรวจรับสภาพตอนส่งคืน (ถ้ามี)
                                            </label>
                                            {returnPhotoUrl ? (
                                                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-base-700 bg-slate-50 dark:bg-base-950/20 h-40 flex items-center justify-center">
                                                    <img 
                                                        src={returnPhotoUrl} 
                                                        alt="Return condition" 
                                                        className="h-full w-full object-cover"
                                                        referrerPolicy="no-referrer"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setReturnPhotoUrl('')}
                                                        className="absolute top-2 right-2 px-3 py-1.5 bg-rose-600/95 hover:bg-rose-700 text-white text-[10px] font-black rounded-lg shadow-md transition-all active:scale-95"
                                                    >
                                                        ลบรูปภาพ
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center w-full">
                                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 dark:border-base-800 border-dashed rounded-2xl cursor-pointer bg-slate-50 dark:bg-base-950/20 hover:bg-slate-100 dark:hover:bg-base-850 transition-all p-4 text-center">
                                                        <div className="flex flex-col items-center justify-center pt-1 pb-2">
                                                            <CameraIcon className="w-8 h-8 mb-2 text-emerald-500 animate-pulse" />
                                                            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">คลิกเพื่อถ่ายภาพสภาพรับคืน</p>
                                                            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-semibold">รองรับไฟล์ภาพ JPEG, PNG (ขนาดถูกบีบอัด)</p>
                                                        </div>
                                                        <input 
                                                            type="file" 
                                                            accept="image/*" 
                                                            capture="environment"
                                                            className="hidden" 
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) handleCompressAndSetPhoto(file, 'return');
                                                            }}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                                                📝 บันทึกข้อความการตรวจสอบส่งคืน
                                            </label>
                                            <textarea
                                                placeholder="เช่น ตรวจสอบเครื่องมืออยู่ในสภาพสมบูรณ์เรียบร้อย, อุปกรณ์อยู่ครบถ้วน..."
                                                rows={2.5}
                                                value={returnNotes}
                                                onChange={(e) => setReturnNotes(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-base-850 border border-slate-200 dark:border-base-750 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Footer buttons block */}
                                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-base-850 flex items-center justify-between">
                                    <div>
                                        {returnStep > 1 && (
                                            <button
                                                key="return-back-btn"
                                                type="button"
                                                onClick={() => setReturnStep(prev => prev - 1)}
                                                className="px-5 py-3 border border-slate-200 dark:border-base-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-base-850 rounded-xl text-xs font-black transition-all"
                                            >
                                                ← ย้อนกลับ
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            key="return-cancel-btn"
                                            type="button"
                                            onClick={handleCloseReturnModal}
                                            className="px-4 py-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-black transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        {returnStep < 2 ? (
                                            <button
                                                key="return-next-btn"
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (isReturnStep1Valid) setReturnStep(2);
                                                }}
                                                disabled={!isReturnStep1Valid}
                                                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all uppercase tracking-wide"
                                            >
                                                ถัดไป →
                                            </button>
                                        ) : (
                                            <button
                                                key="return-submit-btn"
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleConfirmReturn();
                                                }}
                                                disabled={isSubmitting}
                                                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2"
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <RefreshIcon className="h-4 w-4 animate-spin" />
                                                        <span>กำลังบันทึก...</span>
                                                    </>
                                                ) : (
                                                    <span>ยืนยันการรับคืน ✓</span>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* --- MODAL: CONFIRM DELETE --- */}
            {isDeleteModalOpen && recordToDelete && (
                <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="relative bg-white dark:bg-base-900 rounded-3xl border border-slate-200 dark:border-base-800 shadow-2xl max-w-sm w-full overflow-hidden p-6 text-center space-y-4">
                        <div className="inline-block p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-full">
                            <TrashIcon className="h-8 w-8" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase">
                                ยืนยันการลบประวัติการยืม?
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                                คุณกำลังจะลบประวัติการยืมเครื่องมือ <strong>"{recordToDelete.equipmentName}"</strong> โดยคุณ {recordToDelete.borrowerName} ข้อมูลนี้จะหายไปจากระบบอย่างถาวรและไม่สามารถกู้คืนได้
                            </p>
                        </div>

                        <div className="pt-2 flex justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsDeleteModalOpen(false);
                                    setRecordToDelete(null);
                                }}
                                className="px-5 py-2.5 border border-slate-200 dark:border-base-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-base-800 rounded-xl text-xs font-black transition-all"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteRecord}
                                disabled={isSubmitting}
                                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md transition-all"
                            >
                                {isSubmitting ? "กำลังลบ..." : "ยืนยันการลบ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LIGHTBOX IMAGE EXPAND ZOOM MODAL --- */}
            {activeLightboxImage && (
                <div 
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 transition-all duration-300"
                    onClick={() => setActiveLightboxImage(null)}
                >
                    {/* Close button */}
                    <button 
                        className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-full transition-all focus:outline-none"
                        onClick={() => setActiveLightboxImage(null)}
                        title="ปิดหน้าต่างขยายภาพ"
                    >
                        <XCircleIcon className="h-7 w-7" />
                    </button>
                    
                    {/* Image Container */}
                    <div className="relative max-w-4xl max-h-[85vh] flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
                        <img 
                            src={activeLightboxImage} 
                            alt="Full Screen View" 
                            className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                            referrerPolicy="no-referrer"
                        />
                        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white/70 text-[11px] font-bold tracking-wider uppercase px-4 py-1.5 bg-black/40 backdrop-blur-sm rounded-full whitespace-nowrap">
                            💡 คลิกนอกกรอบรูปเพื่อปิดหน้าต่างขยาย
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: QR CODE SCANNER OVERLAY --- */}
            {isScannerOpen && (
                <div className="fixed inset-0 z-[80] overflow-y-auto flex items-center justify-center p-4 bg-slate-900/85 backdrop-blur-md animate-fade-in">
                    <div className="relative bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden p-6 text-center space-y-5">
                        
                        {/* Header bar */}
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-left">
                            <div className="flex items-center gap-2 text-white">
                                <div className="p-1.5 bg-primary-600/25 text-primary-400 rounded-lg">
                                    <CameraIcon className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                                        สแกนคิวอาร์โค้ด (Scan QR)
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-semibold">
                                        ส่องกล้องไปที่ QR Code ของระบบเครื่องมือ
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsScannerOpen(false)}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                            >
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Scanner Stream Area */}
                        <div className="relative aspect-square w-full max-w-[280px] mx-auto rounded-2xl overflow-hidden border-2 border-primary-500/50 bg-black flex items-center justify-center">
                            
                            {/* Scanning Animation laser line */}
                            <div className="absolute inset-x-0 h-0.5 bg-primary-500 shadow-[0_0_8px_#3b82f6] top-0 animate-scan-laser z-20"></div>

                            {/* Framing Corners */}
                            <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-primary-500 rounded-tl-md z-10"></div>
                            <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-primary-500 rounded-tr-md z-10"></div>
                            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-primary-500 rounded-bl-md z-10"></div>
                            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-primary-500 rounded-br-md z-10"></div>

                            {/* Video Viewport */}
                            <video 
                                id="scanner-video"
                                className="w-full h-full object-cover"
                                playsInline
                                muted
                                autoPlay
                            />

                            {/* Help Text overlay inside stream */}
                            <div className="absolute bottom-3 inset-x-0 text-center z-10">
                                <span className="bg-black/70 backdrop-blur-sm text-white/90 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                                    จัดตำแหน่ง QR ให้อยู่ในกรอบ
                                </span>
                            </div>
                        </div>

                        {/* Feedback / Instructions */}
                        <div className="space-y-2">
                            {scanFeedback ? (
                                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black flex items-center justify-center gap-2 animate-pulse">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                    <span>{scanFeedback.message}</span>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                                    💡 คุณสามารถใช้กล้องสแกน QR Code ของระบบเครื่องมือเพื่อตรวจจับสถานะและนำเข้าหน้าทำรายการยืม-คืนโดยอัตโนมัติทันที
                                </p>
                            )}
                        </div>

                        {/* Action Close */}
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setIsScannerOpen(false)}
                                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-black transition-all border border-slate-700"
                            >
                                ยกเลิก / ปิดกล้องสแกน
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Laser Line Scan Animation */}
            <style>{`
                @keyframes laser {
                    0% { top: 0%; }
                    50% { top: 100%; }
                    100% { top: 0%; }
                }
                .animate-scan-laser {
                    animation: laser 2.5s infinite linear;
                }
            `}</style>

        </div>
    );
};
