
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

export interface Equipment {
    id: string;
    code?: string; // Equipment Code for linking
    name: string;
    group: string; 
    type?: 'Primary' | 'Accessory' | 'Component'; // New Type Logic
    status: 'ready' | 'issue' | 'maintenance';
    actionStatus: 'none' | 'notified' | 'ordered' | 'repairing';
    details: string; // Model / Serial No can go here for Primary
    serialNo?: string;
    model?: string;
    
    // Detailed Excel Props (Primary)
    pmBy?: string;
    pmFreq?: string;
    calBy?: string;
    calFreq?: string;
    pmMonth?: string;
    calMonth?: string;
    vendor?: string;
    vendorTel?: string;
    
    // Hierarchy
    components?: EquipmentComponent[]; // List of sub-components

    methods?: string[]; 
    lastUpdated: string;
    updatedBy: string;
    history?: EquipmentHistory[];
    
    // Updated Logic: Multiple Maintenance Items
    maintenanceItems?: MaintenanceItem[];

    // Legacy Fields (kept for compatibility or simple view)
    custodian?: string; 
    custodianName?: string;
    contactInfo?: string; 
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

export interface ShiftReport {
    id: string; 
    date: string;
    shift: 'day' | 'night';
    instruments: { name: string; status: 'normal' | 'abnormal' }[];
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
