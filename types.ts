
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
}

export interface Tester {
    id: string;
    name: string;
    team?: 'testers_3_3' | 'assistants_4_2' | null;
}

export interface CategorizedTask {
    id: string; 
    docId?: string; 
    tasks: RawTask[];
    category: TaskCategory;
    originalDocId?: string; 
    originalIndices?: number[]; 
    returnReason?: string | null;
    returnedBy?: string | null;
    isReturnedPool?: boolean; 
    order?: number; 
    createdAt?: string; 
    shift?: 'day' | 'night'; 
}

export interface Equipment {
    id: string;
    name: string;
    group: string; // Grouping field (e.g., DSC, ICP, HPLC)
    status: 'ready' | 'issue' | 'maintenance';
    actionStatus: 'none' | 'notified' | 'ordered' | 'repairing';
    details: string;
    methods?: string[]; 
    lastUpdated: string;
    updatedBy: string;
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
