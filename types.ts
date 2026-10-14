
export enum TaskCategory {
    PoCat = 'pocat',
    Urgent = 'urgent',
    Normal = 'normal',
    Manual = 'manual',
    Other = 'other',
}

export enum TaskStatus {
    Pending = 'Pending',
    Done = 'Done',
    NotOK = 'Not OK',
}

export interface RawTask {
    [key: string]: any; 
    _id?: string; 
    status?: TaskStatus;
    notOkReason?: string | null;
    preparationStatus?: 'Awaiting Preparation' | 'Ready for Testing' | 'Prepared' | null;
    isReturned?: boolean;
    returnReason?: string | null;
    returnedBy?: string | null;
    plannerNote?: string | null; 
    isOverPlan?: boolean;
}

export interface Tester {
    id: string;
    name: string;
    team?: 'testers_3_3' | 'assistants_4_2' | null;
    requiresProficiencyCheck?: boolean;
}

export interface CategorizedTask {
    id: string; 
    docId?: string; 
    tasks: RawTask[];
    category: TaskCategory;
    manualGroup?: string | null; 
    originalDocId?: string; 
    originalIndices?: number[]; 
    returnReason?: string | null;
    returnedBy?: string | null;
    isReturnedPool?: boolean; 
    order?: number; 
    createdAt?: string; 
    shift?: 'day' | 'night'; 
    returnedDate?: string;
    isPrep?: boolean;
}

export interface EquipmentHistory {
    id: string;
    date: string;
    description: string;
    partsReplaced?: string;
    technician: string;
}

export interface MaintenanceItem {
    id: string;
    name: string; // e.g., "Internal Cal", "External Cal", "Filter PM"
    type: 'PM' | 'Cal';
    dueDate: string; // YYYY-MM-DD
    cycleMonths?: number; // e.g., 6, 12
    provider?: string; // e.g., "External Lab A", "Internal"
    
    // Service Appointment Logic
    status: 'pending' | 'scheduled' | 'done';
    serviceDate?: string; // Confirm date technician is coming
    technicianName?: string;
}

export interface EquipmentComponent {
    name: string;
    code?: string; // Added for Component Code
    serialNo?: string;
    model?: string;
    type: 'Component';
    calDueDate?: string; // Legacy/Quick View
    
    // Detailed Excel Props
    pmBy?: string;
    pmFreq?: string;
    calBy?: string;
    calFreq?: string;
    pmMonth?: string;
    calMonth?: string;
    vendor?: string;
    vendorTel?: string;
}

export interface StageEvidenceRecord {
    stageId: number;
    title: string;
    date?: string;
    statusLabel?: string;
    details?: string;
    docNo?: string;
    vendorOrPerson?: string;
    proofFileOrRef?: string;
    updatedAt?: string;
}

export interface TrackingWorkflowStatus {
    // 1. ขอใบ Quotation จาก Vendor
    quotationRequested: boolean;
    quotationDate?: string;
    quotationStatus?: 'not_requested' | 'requested_waiting' | 'received' | 'rejected' | string;
    quotationNo?: string;
    quotationAmount?: string;
    quotationNote?: string;
    quotationProof?: string;

    // 2. แจ้งออก PR / PO
    prIssued: boolean;
    prNo?: string;
    prStatus?: 'pending' | 'pr_submitted' | 'po_approved' | 'rejected' | string;
    prDate?: string;
    poNo?: string;
    prNote?: string;
    prProof?: string;

    // 3. นัดหมาย Vendor เข้ามา (Appointment Status & Date)
    vendorScheduled: boolean;
    scheduledDate?: string;          // วันที่นัดหมาย เช่น "2026-10-25"
    scheduledTime?: string;          // ช่วงเวลานัด เช่น "09:00 - 12:00"
    appointmentStatus?: 'pending_contact' | 'waiting_confirmation' | 'confirmed' | 'postponed' | 'completed' | string;
    vendorName?: string;             // บริษัท Vendor
    technicianName?: string;         // ชื่อช่าง
    vendorContact?: string;          // เบอร์โทรช่าง/บริษัท
    appointmentNote?: string;        // หมายเหตุการนัด

    // 4. ใบ Cert / Service Report จาก Vendor
    certReceived: boolean;
    certReceivedDate?: string;
    certNo?: string;
    certStatus?: 'waiting' | 'received' | 'revision_needed' | string;
    certNote?: string;
    certProof?: string;

    // 5. ส่งมอบใบ Cert ให้พนักงานที่ดูแล
    certDelivered: boolean;
    certDeliveredDate?: string;
    recipientName?: string;          // ผู้รับมอบ
    deliveryNote?: string;

    // 6. สรุปผลการ Cal / PM
    result: 'Pass' | 'Fail' | 'Action Required' | 'Pending' | '';
    resultNote?: string;
    calStickerAffixed?: boolean;     // ติดสติกเกอร์แล้ว
    completedDate?: string;

    // บันทึกหลักฐานเพิ่มเติม
    evidences?: StageEvidenceRecord[];
}

export interface PMDetails {
    freqYear?: string | number; // e.g. 1
    lastPM?: string;            // e.g. "Nov", "Jan"
    nextPM?: string;            // e.g. "Nov 2026"
    pmBy?: 'Vender' | 'Owner' | string;
    items?: string;             // รายการที่ทำ PM
    tolerance?: string;         // Tolerance e.g. "Pass/Fail"
}

export interface CalDetails {
    freqYear?: string | number; // e.g. 1
    lastCal?: string;           // e.g. "Nov", "Jan"
    nextCal?: string;           // e.g. "Nov"
    calBy?: 'Vender' | 'Owner' | string;
    items?: string;             // รายการที่สอบเทียบ
    tolerance?: string;         // e.g. "± 5°C", "±0.5%"
}

export interface EquipmentSubComponent {
    id: string;
    equipmentNo: string;        // รหัสเครื่องพ่วงย่อย เช่น "PDS-1001/02", "PDS-1004/01"
    equipmentName: string;      // ชื่อเครื่องพ่วงย่อย เช่น "Specae-Heater (BC2)", "Weight 400 g"
    owner: string;              // พนักงานที่ดูแล เช่น "PORNTHAK", "Channarong"
    pm?: PMDetails;
    cal?: CalDetails;
    trackingStatus: TrackingWorkflowStatus;
    notes?: string;
}

export interface Equipment {
    id: string;
    equipmentNo: string;        // รหัสเครื่องหลัก เช่น "PDS-1001", "PDS-1002" (ไม่มี '/')
    equipmentName: string;      // ชื่อเครื่องมือ เช่น "FTIR Tensor37", "Melt Flow Index"
    owner: string;              // พนักงานที่ดูแล เช่น "PORNTHAK", "Channarong"
    department?: string;
    location?: string;
    pm?: PMDetails;
    cal?: CalDetails;
    trackingStatus: TrackingWorkflowStatus;
    subEquipments?: EquipmentSubComponent[]; // รายการเครื่องพ่วงย่อยที่มี /
    
    // Legacy & compatibility props
    code?: string;
    name: string;
    group?: string; 
    type?: 'Primary' | 'Accessory' | 'Component';
    status?: 'ready' | 'issue' | 'maintenance';
    actionStatus?: 'none' | 'notified' | 'ordered' | 'repairing';
    details?: string;
    serialNo?: string;
    model?: string;
    
    pmBy?: string;
    pmFreq?: string;
    calBy?: string;
    calFreq?: string;
    pmMonth?: string;
    calMonth?: string;
    vendor?: string;
    vendorTel?: string;
    
    components?: EquipmentComponent[];
    methods?: string[]; 
    lastUpdated?: string;
    updatedBy?: string;
    history?: EquipmentHistory[];
    maintenanceItems?: MaintenanceItem[];
    custodian?: string; 
    custodianName?: string;
    contactInfo?: string; 

    // Executive Breakdown & Out-of-Order Tracking
    breakdownStatus?: {
        isBroken: boolean;
        currentIncident?: BreakdownRecord;
        history?: BreakdownRecord[];
    };
}

export type BreakdownStage = 
    | 'reported'           // 1. รับแจ้งอาการเสีย (Issue Reported)
    | 'investigating'      // 2. ตรวจสอบ/วิเคราะห์สาเหตุ (Inspection / Diagnostics)
    | 'quotation_repair'   // 3. ขอใบเสนอราคาซ่อม/อะไหล่ (Quotation / Parts Sourcing)
    | 'pr_repair'          // 4. ออกใบ PR ซ่อม/อนุมัติงบ (PR / PO Approval)
    | 'repairing'          // 5. กำลังดำเนินการซ่อม (Repair in Progress)
    | 'repaired_verified'  // 6. ซ่อมเสร็จ/ตรวจรับพร้อมใช้งาน (Resolved & Verified)
    ;

export interface BreakdownActionLog {
    id: string;
    date: string;
    action: string;
    actor?: string;
    stage?: BreakdownStage;
}

export interface BreakdownRecord {
    id: string;
    equipmentId: string;
    equipmentNo: string;
    equipmentName: string;
    reportedDate: string;           // วันที่แจ้งเสีย YYYY-MM-DD
    reportedBy: string;             // ผู้แจ้ง
    symptom: string;                // อาการเสีย
    rootCause?: string;             // สาเหตุที่พบ
    impactLevel: 'Critical' | 'Moderate' | 'Low'; // ระดับผลกระทบต่องานแล็บ
    stage: BreakdownStage;          // สเต็ป 1-6
    vendorOrTechnician?: string;    // ผู้ดำเนินการซ่อม
    quotationNo?: string;           // เลขที่ใบเสนอราคา
    repairPrNo?: string;            // เลขที่ PR ซ่อม
    costEstimate?: number;          // ค่าใช้จ่ายโดยประมาณ
    targetResolutionDate?: string;  // กำหนดเสร็จที่คาดการณ์
    resolvedDate?: string;          // วันที่ซ่อมเสร็จจริง
    resolutionNote?: string;        // สรุปผลการซ่อม/ตรวจรับ
    actionLogs?: BreakdownActionLog[]; // ประวัติรายละเอียดว่าทำอะไรไปกับเครื่องนี้แล้วบ้าง
}

export interface DailySchedule {
    id?: string; 
    dayShiftTesters: string[];
    nightShiftTesters: string[];
    dayShiftAssistants: string[];
    nightShiftAssistants: string[];
}

export interface TestMapping {
    id: string;
    description: string;
    variant: string;
    headerGroup: string;
    headerSub: string;
    order?: number;
}

export interface HighValueCheck {
    assetId: string;
    assetName: string;
    assetCode: string;
    isPresent: boolean;
    status: 'normal' | 'abnormal';
    note?: string;
    trackQuantity?: boolean;
    initialQuantity?: number;
    currentQuantity?: number;
    isConsumable?: boolean;
}

export interface ShiftReport {
    id: string; 
    date: string;
    shift: 'day' | 'night';
    instruments: { name: string; status: 'normal' | 'abnormal' }[];
    highValueChecks?: HighValueCheck[];
    infrastructureNote?: string; 
    wasteLevel: 'low' | 'medium' | 'high';
    cleanliness: 'good' | 'bad';
    cleanlinessNote: string;
    cleanlinessImage?: string; 
}

export interface GroupedTask {
    id: string;
    tasks: RawTask[];
}

export interface AssignedTask {
    id: string;
    requestId: string;
    tasks: RawTask[];
    category: TaskCategory;
    testerId: string;
    testerName: string;
    assignedDate: string;
    shift: 'day' | 'night';
    status: TaskStatus;
}

export interface AssignedPrepareTask {
    id: string;
    requestId: string;
    tasks: RawTask[];
    category: TaskCategory;
    assistantId: string;
    assistantName: string;
    assignedDate: string;
    shift: 'day' | 'night';
    originalDocId: string;
    originalIndices: number[];
}

// --- Distillation Tracking ---
export interface DistillationLog {
    id?: string;
    chemicalName: string;
    inputAmount: number;
    outputAmount: number;
    yieldPercent: number;
    date: string;
    recorderName: string;
    notes?: string;
    createdAt: string;
}

// --- Environment Monitoring ---
export interface LabRoom {
    id: string;
    name: string;
    monitorTimeSlots: string[]; // e.g. ["09:00", "13:00"]
    description?: string;
}

export interface EnvironmentLog {
    id: string;
    roomId: string;
    roomName: string;
    temperature: number;
    humidity: number;
    timestamp: string; // ISO string
    recorderName: string;
    note?: string;
}

// --- Proficiency Testing System ---
export interface ProficiencyTest {
    id: string;
    title: string;
    description: string;
    type: ('written' | 'practical' | 'reading')[] | string;
    order: number;
}

export interface ProficiencyRecord {
    id: string; // usually `${assistantId}_${testId}`
    assistantId: string;
    testId: string;
    status: 'pending' | 'passed' | 'failed';
    evidenceImage?: string; // base64 string
    evidences?: Record<string, string>; // Map of test type to base64 string
    evaluatedBy?: string;
    evaluatedAt?: string;
}

// --- Special Booking System ---
export interface Booking {
    id: string;
    resourceId: string; // Tester ID
    resourceName: string;
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm (e.g., "09:00")
    durationMinutes: number;
    customerName: string;
    description: string;
    contactInfo?: string;
    createdBy?: string;
    isProjectTime?: boolean;
    plannerApproved?: boolean;
    isOverQuota?: boolean;
}

// --- Support / Helpdesk System ---
export type SupportRequestStatus = 'pending' | 'acknowledged' | 'in_progress' | 'done';

export interface SupportRequest {
    id?: string;
    title: string;
    description: string;
    requesterName: string;
    assigneeId?: string | null;
    status: SupportRequestStatus;
    createdAt: string;
    updatedAt: string;
    resolvedAt?: string | null;
}

// --- App Settings ---
export interface HighValueAsset {
    id: string;
    name: string;
    code: string;
    cabinet: string;
    photo?: string; // base64 string
    isActive: boolean;
    trackQuantity?: boolean;
    initialQuantity?: number;
    isConsumable?: boolean;
}

export interface HighValueAssetImportRecord {
    id: string;
    assetId: string;
    assetName: string;
    assetCode: string;
    quantity: number;
    importDate: string; // YYYY-MM-DD
    note?: string;
    createdAt: string;
}

export interface AppSettings {
    tabLabels?: Record<string, string>;
    highValueAssets?: HighValueAsset[];
    highValueAssetImports?: HighValueAssetImportRecord[];
}

// --- Method Walkthrough System ---
export interface WalkthroughAcknowledgement {
    acknowledged: boolean;
    acknowledgedAt?: string;
}

export interface Walkthrough {
    id?: string;
    title: string;
    content: string;
    createdAt: string;
    createdBy: string;
    targetTesters: string[]; // List of tester ids
    acknowledgements: Record<string, WalkthroughAcknowledgement>; // testerId -> acknowledgment details
    isCompleted?: boolean; // True when all target testers have acknowledged
    imageUrl?: string; // Optional attached image (Base64 or URL)
}

// --- Equipment Borrow & Return Record System ---
export interface BorrowRecord {
    id?: string;
    equipmentName: string; // Name of equipment (typed manually, not linked to Lab equipment)
    borrowerName: string; // Borrower name
    borrowerType: 'internal' | 'external';
    borrowerPhone: string;
    borrowDate: string; // YYYY-MM-DD
    borrowTime: string; // HH:mm
    expectedReturnDate: string; // YYYY-MM-DD
    actualReturnDate?: string; // YYYY-MM-DD or empty
    guarantorName?: string; // Internal staff name who vouches (required if borrowerType is 'external')
    status: 'borrowed' | 'returned' | 'overdue';
    createdAt: string;
    notes?: string;
    borrowPhotoUrl?: string; // Photo taken during borrow (Base64)
    returnPhotoUrl?: string; // Photo taken during return (Base64)
    returnedBy?: string; // Name of person who returned it
    returnReceiverName?: string; // Name of internal employee who accepted the return
    isHighValue?: boolean; // True if it's a high-value asset from settings
    assetId?: string; // High value asset reference ID if applicable
    isConsumable?: boolean; // True if it's a consumable asset
}

