
import { firestore } from './firebase';
import type { Tester, CategorizedTask, AssignedTask, DailySchedule, RawTask, AssignedPrepareTask, TestMapping, ShiftReport, Equipment, DistillationLog } from '../types';
import { TaskCategory } from '../types';

// Export firestore for use in components
export { firestore };

const getCollection = (collectionName: string) => firestore.collection(collectionName);

const safeGet = async (query: any) => {
    try {
        return await query.get();
    } catch (error: any) {
        if (error.code === 'unavailable' || error.message?.includes('offline')) {
            try {
                return await query.get({ source: 'cache' });
            } catch (cacheError) {
                throw error;
            }
        }
        throw error;
    }
};

// --- Equipment Management ---
export const getEquipments = async (): Promise<Equipment[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(getCollection('equipments'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as Equipment);
};

export const saveEquipment = async (equipment: Omit<Equipment, 'id'> & { id?: string }): Promise<void> => {
    const { id, ...data } = equipment;
    if (id) {
        await getCollection('equipments').doc(id).set(data);
    } else {
        await getCollection('equipments').add(data);
    }
};

export const deleteEquipment = async (id: string): Promise<void> => {
    await getCollection('equipments').doc(id).delete();
};

// --- Tester Management ---
export const getTesters = async (): Promise<Tester[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('analysts'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as Tester);
};

export const addTester = async (name: string): Promise<Tester> => {
    const docRef = await getCollection('analysts').add({ name });
    return { id: docRef.id, name };
};

export const updateTester = async (id: string, updates: Partial<Tester>): Promise<void> => {
    await getCollection('analysts').doc(id).update(updates);
};

export const deleteTester = async (id: string): Promise<void> => {
    await getCollection('analysts').doc(id).delete();
};

// --- Test Mapping Management ---
export const getTestMappings = async (): Promise<TestMapping[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(getCollection('testMappings'));
    const mappings = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as TestMapping);
    return mappings.sort((a, b) => {
        const orderA = a.order ?? Infinity;
        const orderB = b.order ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
        return (a.headerGroup || '').localeCompare(b.headerGroup || '');
    });
};

export const addTestMapping = async (mapping: Omit<TestMapping, 'id'>): Promise<TestMapping> => {
    const docRef = await getCollection('testMappings').add(mapping);
    return { id: docRef.id, ...mapping };
};

export const updateTestMapping = async (id: string, updates: Partial<TestMapping>): Promise<void> => {
    await getCollection('testMappings').doc(id).update(updates);
};

export const deleteTestMapping = async (id: string): Promise<void> => {
    await getCollection('testMappings').doc(id).delete();
};

// --- Categorized Task Management ---
export const getCategorizedTasks = async (): Promise<CategorizedTask[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('categorizedTasks'));
    return snapshot.docs.map((doc: any) => ({ ...doc.data(), docId: doc.id }) as CategorizedTask);
};

export const addCategorizedTask = async (task: Omit<CategorizedTask, 'docId'>): Promise<void> => {
    await getCollection('categorizedTasks').add(task);
};

export const updateCategorizedTask = async (docId: string, updates: Partial<CategorizedTask>): Promise<void> => {
    await getCollection('categorizedTasks').doc(docId).update(updates);
};

export const deleteCategorizedTask = async (docId: string): Promise<void> => {
    await getCollection('categorizedTasks').doc(docId).delete();
};

// --- Daily Schedule Management ---
export const getDailySchedule = async (date: string): Promise<DailySchedule | null> => {
    if (!firestore) return null;
    const doc = await safeGet(getCollection('dailySchedules').doc(date));
    return doc.exists ? ({ id: doc.id, ...doc.data() } as DailySchedule) : null;
};

export const saveDailySchedule = async (date: string, schedule: Omit<DailySchedule, 'id'>): Promise<void> => {
    await getCollection('dailySchedules').doc(date).set(schedule);
};

export const getExistingScheduleDates = async (): Promise<string[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(getCollection('dailySchedules'));
    return snapshot.docs.map((doc: any) => doc.id);
};

// --- Assigned Task Management ---
export const getAssignedTasks = async (): Promise<AssignedTask[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('assignedTasks'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as AssignedTask);
};

export const addAssignedTask = async (task: Omit<AssignedTask, 'id'>): Promise<void> => {
    await getCollection('assignedTasks').add(task);
};

export const updateAssignedTask = async (id: string, updates: Partial<AssignedTask>): Promise<void> => {
    await getCollection('assignedTasks').doc(id).update(updates);
};

export const deleteAssignedTask = async (id: string): Promise<void> => {
    await getCollection('assignedTasks').doc(id).delete();
};

// --- Quality History (Resolution Log) ---
export const logResolutionEntries = async (entries: any[]): Promise<void> => {
    if (!firestore || entries.length === 0) return;
    const batch = firestore.batch();
    const collection = getCollection('resolutionHistory');
    entries.forEach(entry => {
        batch.set(collection.doc(), {
            ...entry,
            timestamp: new Date().toISOString()
        });
    });
    await batch.commit();
};

export const getResolutionHistory = async (): Promise<any[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(getCollection('resolutionHistory').orderBy('timestamp', 'desc'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
};

// --- Prepare Task Management ---
export const getAssignedPrepareTasks = async (): Promise<AssignedPrepareTask[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('assignedPrepareTasks'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as AssignedPrepareTask);
};

export const updateAssignedPrepareTask = async (id: string, updates: Partial<AssignedPrepareTask>): Promise<void> => {
    await getCollection('assignedPrepareTasks').doc(id).update(updates);
};

export const deleteAssignedPrepareTask = async (id: string): Promise<void> => {
    await getCollection('assignedPrepareTasks').doc(id).delete();
};

export const assignItemsToPrepare = async (
    originalTask: CategorizedTask,
    indicesToAssign: number[],
    assistant: Tester,
    date: string,
    shift: 'day' | 'night'
) => {
    const itemsToAssign = indicesToAssign.map(index => {
         let item = { ...originalTask.tasks[index] } as RawTask;
         const { status, notOkReason, isReturned, returnReason, returnedBy, preparationStatus: oldPrep, ...cleanItem } = item;
         const freshItem = { ...cleanItem } as RawTask;
         if (originalTask.category === TaskCategory.Manual) {
             freshItem._id = Math.random().toString(36).substring(2) + Date.now().toString(36);
         }
         freshItem.preparationStatus = 'Awaiting Preparation';
         return freshItem;
    });
    
    const prepareTaskPayload: Omit<AssignedPrepareTask, 'id'> = {
        requestId: originalTask.id,
        tasks: itemsToAssign,
        category: originalTask.category,
        assistantId: assistant.id,
        assistantName: assistant.name,
        assignedDate: date,
        shift: shift,
        originalDocId: originalTask.docId!,
        originalIndices: indicesToAssign
    };
    await getCollection('assignedPrepareTasks').add(prepareTaskPayload);

    if (originalTask.category !== TaskCategory.Manual) {
        const updatedTasks = originalTask.tasks.map((task, index) => {
            if (indicesToAssign.includes(index)) {
                const { isReturned, returnReason, returnedBy, ...rest } = task;
                return { ...rest, preparationStatus: 'Awaiting Preparation' } as RawTask;
            }
            return task;
        });
        await updateCategorizedTask(originalTask.docId!, { tasks: updatedTasks });
    }
};

export const markItemAsPrepared = async (prepTask: AssignedPrepareTask, itemIndex: number) => {
    const updatedPrepTasks = [...prepTask.tasks];
    const targetItem = updatedPrepTasks[itemIndex];
    if (!targetItem) return;
    
    targetItem.preparationStatus = 'Prepared';
    delete targetItem.isReturned;
    delete targetItem.returnReason;
    delete targetItem.returnedBy;

    await getCollection('assignedPrepareTasks').doc(prepTask.id).update({ tasks: updatedPrepTasks });

    if (prepTask.category !== TaskCategory.Manual) {
        try {
            const originalDoc = await getCollection('categorizedTasks').doc(prepTask.originalDocId).get();
            if (originalDoc.exists) {
                const data = originalDoc.data() as CategorizedTask;
                const originalTasks = [...data.tasks];
                let foundIndex = -1;
                if (targetItem._id) foundIndex = originalTasks.findIndex(t => t._id === targetItem._id);
                if (foundIndex === -1 && prepTask.originalIndices && prepTask.originalIndices[itemIndex] !== undefined) {
                    const idx = prepTask.originalIndices[itemIndex];
                    if (originalTasks[idx]) foundIndex = idx;
                }
                if (foundIndex !== -1) {
                    const { isReturned, returnReason, returnedBy, ...rest } = originalTasks[foundIndex];
                    originalTasks[foundIndex] = { ...rest, preparationStatus: 'Ready for Testing' } as RawTask;
                    await getCollection('categorizedTasks').doc(prepTask.originalDocId).update({ tasks: originalTasks });
                }
            }
        } catch (e) { console.error(e); }
    }
};

export const resetItemPreparation = async (prepTask: AssignedPrepareTask, itemIndex: number) => {
    const updatedPrepTasks = [...prepTask.tasks];
    const targetItem = updatedPrepTasks[itemIndex];
    if (!targetItem) return;
    
    targetItem.preparationStatus = 'Awaiting Preparation';
    await getCollection('assignedPrepareTasks').doc(prepTask.id).update({ tasks: updatedPrepTasks });

    if (prepTask.category !== TaskCategory.Manual) {
        try {
            const originalDoc = await getCollection('categorizedTasks').doc(prepTask.originalDocId).get();
            if (originalDoc.exists) {
                const data = originalDoc.data() as CategorizedTask;
                const originalTasks = [...data.tasks];
                let foundIndex = -1;
                if (targetItem._id) foundIndex = originalTasks.findIndex(t => t._id === targetItem._id);
                if (foundIndex === -1 && prepTask.originalIndices && prepTask.originalIndices[itemIndex] !== undefined) {
                    const idx = prepTask.originalIndices[itemIndex];
                    if (originalTasks[idx]) foundIndex = idx;
                }
                if (foundIndex !== -1) {
                    originalTasks[foundIndex] = { ...originalTasks[foundIndex], preparationStatus: 'Awaiting Preparation' } as RawTask;
                    await getCollection('categorizedTasks').doc(prepTask.originalDocId).update({ tasks: originalTasks });
                }
            }
        } catch (e) { console.error(e); }
    }
};

// Deprecated in favor of direct updates or forceRecallTask, but updated here for safety
export const unassignTaskToPool = async (categorizedTask: CategorizedTask): Promise<void> => {
    const { docId, ...cleanBase } = categorizedTask;
    const cleanTasks = cleanBase.tasks.map(t => {
        const { status, notOkReason, returnReason, returnedBy, isReturned, preparationStatus, ...rest } = t;
        return rest as RawTask;
    });
    
    if (docId) {
        // If it exists, update it to clean state instead of creating a duplicate
        await getCollection('categorizedTasks').doc(docId).update({ 
            tasks: cleanTasks, 
            returnReason: null, 
            returnedBy: null, 
            isReturnedPool: false 
        });
    } else {
        const payload = { ...cleanBase, tasks: cleanTasks, returnReason: null, returnedBy: null, isReturnedPool: false };
        await getCollection('categorizedTasks').add(payload);
    }
};

// FORCE RECALL: Pulls a task back from an assignment and makes it available in the pool
// Enhanced to support return reason and reporting metadata
export const forceRecallTask = async (taskId: string, reason?: string, returnedBy?: string, date?: string, shift?: string) => {
    const batch = firestore.batch();
    let isPrepReturn = false;
    
    // 1. Find and remove from Assigned Tasks (Analyst)
    const assignedSnapshot = await getCollection('assignedTasks').get();
    assignedSnapshot.forEach((doc: any) => {
        const data = doc.data() as AssignedTask;
        const taskIdx = data.tasks.findIndex(t => t._id === taskId);
        if (taskIdx !== -1) {
            const remaining = data.tasks.filter(t => t._id !== taskId);
            if (remaining.length === 0) batch.delete(doc.ref);
            else batch.update(doc.ref, { tasks: remaining });
        }
    });

    // 2. Find and remove from Prepare Tasks (Assistant)
    const prepareSnapshot = await getCollection('assignedPrepareTasks').get();
    prepareSnapshot.forEach((doc: any) => {
        const data = doc.data() as AssignedPrepareTask;
        const taskIdx = data.tasks.findIndex(t => t._id === taskId);
        if (taskIdx !== -1) {
            isPrepReturn = true;
            const remaining = data.tasks.filter(t => t._id !== taskId);
            if (remaining.length === 0) batch.delete(doc.ref);
            else batch.update(doc.ref, { tasks: remaining });
        }
    });

    // 3. Clean up status in the deployment pool and add return metadata for Dashboard
    const poolSnapshot = await getCollection('categorizedTasks').get();
    poolSnapshot.forEach((doc: any) => {
        const data = doc.data() as CategorizedTask;
        const taskIdx = data.tasks.findIndex(t => t._id === taskId);
        if (taskIdx !== -1) {
            const updated = [...data.tasks];
            const { status, notOkReason, preparationStatus, isReturned, returnReason, returnedBy: oldBy, ...cleanTask } = updated[taskIdx];
            
            // Setting preparationStatus to null ensures it is unlocked for testing assign in the grid
            const finalTask = {
                ...cleanTask,
                isReturned: reason ? true : false,
                returnReason: reason || null,
                returnedBy: returnedBy || null,
                preparationStatus: null,
                status: null
            };
            
            updated[taskIdx] = finalTask as RawTask;
            
            // Mark the document for Dashboard tracking
            batch.update(doc.ref, { 
                tasks: updated,
                isReturnedPool: true,
                returnedDate: date || new Date().toISOString().split('T')[0],
                shift: shift || 'day',
                returnedBy: returnedBy || 'Staff',
                isPrep: isPrepReturn
            });
        }
    });

    await batch.commit();
};

export const getShiftReport = async (date: string, shift: 'day' | 'night'): Promise<ShiftReport | null> => {
    if (!firestore) return null;
    const docId = `${date}_${shift}`;
    const doc = await safeGet(getCollection('shiftReports').doc(docId));
    return doc.exists ? ({ id: doc.id, ...doc.data() } as ShiftReport) : null;
};

export const saveShiftReport = async (report: ShiftReport): Promise<void> => {
    const docId = `${report.date}_${report.shift}`;
    await getCollection('shiftReports').doc(docId).set(report);
};

export const runCleanup = async () => {
    if (!firestore) throw new Error("Database not initialized");
    const catSnapshot = await getCollection('categorizedTasks').get();
    const refsToDelete: any[] = [];
    catSnapshot.forEach((doc: any) => {
        const data = doc.data() as CategorizedTask;
        if (!data.tasks || data.tasks.length === 0) refsToDelete.push(doc.ref);
    });
    if (refsToDelete.length > 0) {
        const batch = firestore.batch();
        refsToDelete.forEach(ref => batch.delete(ref));
        await batch.commit();
    }
    return { deleted: refsToDelete.length };
};

export const clearAllTaskData = async () => {
    if (!firestore) throw new Error("Database not initialized");
    const collections = ['categorizedTasks', 'assignedTasks', 'assignedPrepareTasks', 'shiftReports'];
    for (const colName of collections) {
        const snapshot = await getCollection(colName).get();
        const batch = firestore.batch();
        snapshot.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
    }
};

// --- Distillation Logic ---
export const getDistillationLogs = async (): Promise<DistillationLog[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(getCollection('distillationLogs').orderBy('createdAt', 'desc'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as DistillationLog));
};

export const addDistillationLog = async (log: Omit<DistillationLog, 'id' | 'createdAt'>): Promise<void> => {
    await getCollection('distillationLogs').add({
        ...log,
        createdAt: new Date().toISOString()
    });
};

export const updateDistillationLog = async (id: string, updates: Partial<DistillationLog>): Promise<void> => {
    await getCollection('distillationLogs').doc(id).update(updates);
};

export const deleteDistillationLog = async (id: string): Promise<void> => {
    await getCollection('distillationLogs').doc(id).delete();
};
