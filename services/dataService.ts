
import { firestore } from './firebase';
import type { Tester, CategorizedTask, AssignedTask, DailySchedule, RawTask, AssignedPrepareTask, TestMapping, ShiftReport, Equipment, DistillationLog, Booking, ProficiencyTest, ProficiencyRecord, SupportRequest, Walkthrough, BorrowRecord } from '../types';
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

// --- Duplicate Prevention Service ---
export const getAllExistingRequestIds = async (): Promise<Set<string>> => {
    if (!firestore) return new Set();
    
    const existingIds = new Set<string>();

    try {
        // 1. Check Pool (Categorized Tasks)
        const poolSnapshot = await getCollection('categorizedTasks').select('id').get();
        poolSnapshot.forEach((doc: any) => {
            const data = doc.data();
            if (data.id) existingIds.add(String(data.id).trim().toUpperCase());
        });

        // 2. Check Assigned Tasks (Testing)
        const assignedSnapshot = await getCollection('assignedTasks').select('requestId').get();
        assignedSnapshot.forEach((doc: any) => {
            const data = doc.data();
            if (data.requestId) existingIds.add(String(data.requestId).trim().toUpperCase());
        });

        // 3. Check Assigned Tasks (Preparation)
        const prepSnapshot = await getCollection('assignedPrepareTasks').select('requestId').get();
        prepSnapshot.forEach((doc: any) => {
            const data = doc.data();
            if (data.requestId) existingIds.add(String(data.requestId).trim().toUpperCase());
        });

    } catch (error) {
        console.error("Error fetching existing IDs for duplicate check:", error);
    }

    return existingIds;
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

export const batchImportEquipments = async (equipments: Omit<Equipment, 'id'>[]): Promise<void> => {
    const batch = firestore.batch();
    const collection = getCollection('equipments');
    
    // 1. Delete all existing
    const snapshot = await collection.get();
    snapshot.forEach((doc: any) => batch.delete(doc.ref));
    
    // 2. Add new
    equipments.forEach(eq => {
        const docRef = collection.doc();
        batch.set(docRef, eq);
    });
    
    await batch.commit();
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

// Helper: Smart Finder for Tasks in Pool
const findTaskInPool = (originalTasks: RawTask[], targetItem: RawTask, itemIndex: number, originalIndices?: number[]) => {
    let foundIndex = -1;

    // 1. Best: Match by Unique ID (_id)
    if (targetItem._id) {
        foundIndex = originalTasks.findIndex(t => t._id === targetItem._id);
    }

    // 2. Good: Match by content if ID fails (e.g. ID regenerated or lost) AND status matches 'Awaiting Preparation'
    if (foundIndex === -1) {
        // Normalize strings for comparison
        const tSample = String(targetItem['Sample Name'] || '').trim();
        const tDesc = String(targetItem.Description || '').trim();
        const tVar = String(targetItem.Variant || '').trim();

        foundIndex = originalTasks.findIndex(t => 
            t.preparationStatus === 'Awaiting Preparation' &&
            String(t['Sample Name'] || '').trim() === tSample &&
            String(t.Description || '').trim() === tDesc &&
            String(t.Variant || '').trim() === tVar
        );
    }

    // 3. Fallback: Use original index if preserved (Risky if array shifted, use as last resort)
    if (foundIndex === -1 && originalIndices && originalIndices[itemIndex] !== undefined) {
        const idx = originalIndices[itemIndex];
        // Only accept if content also vaguely matches to prevent overwriting wrong item
        if (originalTasks[idx] && String(originalTasks[idx].Description).trim() === String(targetItem.Description).trim()) {
            foundIndex = idx;
        }
    }

    return foundIndex;
};

export const markItemAsPrepared = async (prepTask: AssignedPrepareTask, itemIndex: number) => {
    const updatedPrepTasks = [...prepTask.tasks];
    const targetItem = updatedPrepTasks[itemIndex];
    if (!targetItem) return;
    
    targetItem.preparationStatus = 'Prepared';
    delete targetItem.isReturned;
    delete targetItem.returnReason;
    delete targetItem.returnedBy;

    // 1. Update Prep Document (Assistant View)
    await getCollection('assignedPrepareTasks').doc(prepTask.id).update({ tasks: updatedPrepTasks });

    // 2. Update Pool Document (Planner View - Unlocks assignment)
    if (prepTask.category !== TaskCategory.Manual) {
        try {
            const originalDoc = await getCollection('categorizedTasks').doc(prepTask.originalDocId).get();
            if (originalDoc.exists) {
                const data = originalDoc.data() as CategorizedTask;
                const originalTasks = [...data.tasks];
                
                // Smart Match
                const foundIndex = findTaskInPool(originalTasks, targetItem, itemIndex, prepTask.originalIndices);

                if (foundIndex !== -1) {
                    const { isReturned, returnReason, returnedBy, ...rest } = originalTasks[foundIndex];
                    // IMPORTANT: 'Ready for Testing' effectively unlocks it in TasksTab
                    originalTasks[foundIndex] = { ...rest, preparationStatus: 'Ready for Testing' } as RawTask;
                    await getCollection('categorizedTasks').doc(prepTask.originalDocId).update({ tasks: originalTasks });
                } else {
                    console.warn("Could not find corresponding task in pool to unlock:", targetItem);
                }
            }
        } catch (e) { console.error("Error updating pool status:", e); }
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
                
                // Smart Match
                const foundIndex = findTaskInPool(originalTasks, targetItem, itemIndex, prepTask.originalIndices);

                if (foundIndex !== -1) {
                    // Revert to 'Awaiting Preparation' (Locks it in TasksTab)
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
export const forceRecallTask = async (taskId: string, reason?: string, returnedBy?: string, date?: string, shift?: string) => {
    const batch = firestore.batch();
    let foundInAssigned = false;
    let foundInPrep = false;

    // Helper to clean task object and remove undefined fields
    const createCleanTask = (original: RawTask, rReason?: string, rBy?: string) => {
        const t = { ...original };
        delete t.status;
        delete t.preparationStatus;
        delete t.notOkReason;
        if (rReason) {
            t.isReturned = true;
            t.returnReason = rReason;
            t.returnedBy = rBy || "Staff";
        } else {
            // Planner silent recall: remove all return-related flags
            delete t.isReturned;
            delete t.returnReason;
            delete t.returnedBy;
        }
        return t;
    };

    // 1. Try AssignedTasks (Testing)
    const assignedSnapshot = await getCollection('assignedTasks').get();
    for (const doc of assignedSnapshot.docs) {
        const data = doc.data() as AssignedTask;
        const task = data.tasks.find(t => t._id === taskId);
        
        if (task) {
            foundInAssigned = true;
            const remaining = data.tasks.filter(t => t._id !== taskId);
            if (remaining.length === 0) batch.delete(doc.ref);
            else batch.update(doc.ref, { tasks: remaining });

            const cleanTask = createCleanTask(task, reason, returnedBy);
            const poolDocRef = getCollection('categorizedTasks').doc();
            batch.set(poolDocRef, {
                id: data.requestId,
                category: data.category,
                tasks: [cleanTask],
                // Only mark as returned pool if there is a reason (Staff rejection)
                isReturnedPool: !!reason,
                returnedDate: date || new Date().toISOString().split('T')[0],
                shift: shift || 'day',
                returnedBy: returnedBy || 'System',
                createdAt: new Date().toISOString()
            });
            break;
        }
    }

    // 2. If not in Assigned, Try AssignedPrepareTasks
    if (!foundInAssigned) {
        const prepareSnapshot = await getCollection('assignedPrepareTasks').get();
        for (const doc of prepareSnapshot.docs) {
            const data = doc.data() as AssignedPrepareTask;
            const task = data.tasks.find(t => t._id === taskId);

            if (task) {
                foundInPrep = true;
                const remaining = data.tasks.filter(t => t._id !== taskId);
                if (remaining.length === 0) batch.delete(doc.ref);
                else batch.update(doc.ref, { tasks: remaining });

                if (data.originalDocId) {
                    const poolDocRef = getCollection('categorizedTasks').doc(data.originalDocId);
                    const poolDoc = await safeGet(poolDocRef);
                    
                    if (poolDoc.exists) {
                        const poolData = poolDoc.data() as CategorizedTask;
                        const updatedTasks = [...poolData.tasks];
                        const poolTaskIndex = updatedTasks.findIndex(t => t._id === taskId);
                        
                        if (poolTaskIndex !== -1) {
                            const t = updatedTasks[poolTaskIndex];
                            const cleanedTaskInPool = createCleanTask(t, reason, returnedBy);
                            updatedTasks[poolTaskIndex] = cleanedTaskInPool;

                            batch.update(poolDocRef, { 
                                tasks: updatedTasks,
                                isReturnedPool: !!reason, // Only mark if reason exists
                                returnedDate: date || new Date().toISOString().split('T')[0],
                                shift: shift || 'day'
                            });
                        } else {
                            const cleanTask = createCleanTask(task, reason, returnedBy);
                            const newPoolRef = getCollection('categorizedTasks').doc();
                            batch.set(newPoolRef, {
                                id: data.requestId,
                                category: data.category,
                                tasks: [cleanTask],
                                isReturnedPool: !!reason,
                                returnedDate: date || new Date().toISOString().split('T')[0],
                                shift: shift || 'day',
                                isPrep: true
                            });
                        }
                    } else {
                        const cleanTask = createCleanTask(task, reason, returnedBy);
                        const newPoolRef = getCollection('categorizedTasks').doc();
                        batch.set(newPoolRef, {
                            id: data.requestId,
                            category: data.category,
                            tasks: [cleanTask],
                            isReturnedPool: !!reason,
                            returnedDate: date || new Date().toISOString().split('T')[0],
                            shift: shift || 'day',
                            isPrep: true
                        });
                    }
                }
                break;
            }
        }
    }

    // 3. Fallback: If found nowhere
    if (!foundInAssigned && !foundInPrep) {
        const poolSnapshot = await getCollection('categorizedTasks').get();
        poolSnapshot.forEach((doc: any) => {
            const data = doc.data() as CategorizedTask;
            const taskIdx = data.tasks.findIndex(t => t._id === taskId);
            if (taskIdx !== -1) {
                const updated = [...data.tasks];
                const t = updated[taskIdx];
                const cleaned = createCleanTask(t, reason, returnedBy);
                updated[taskIdx] = cleaned;

                batch.update(doc.ref, { 
                    tasks: updated,
                    isReturnedPool: !!reason, 
                    returnedDate: date || new Date().toISOString().split('T')[0],
                    shift: shift || 'day',
                    returnedBy: returnedBy || 'Staff'
                });
            }
        });
    }

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
    const collections = ['categorizedTasks', 'assignedTasks', 'assignedPrepareTasks', 'shiftReports', 'bookings'];
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

// --- Booking System Logic ---
export const getBookings = async (date: string): Promise<Booking[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(getCollection('bookings').where('date', '==', date));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Booking));
};

export const getBookingsRange = async (startDate: string, endDate: string): Promise<Booking[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(
        getCollection('bookings')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
    );
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Booking));
};

export const addBooking = async (booking: Omit<Booking, 'id'>): Promise<Booking> => {
    const docRef = await getCollection('bookings').add(booking);
    return { id: docRef.id, ...booking };
};

export const updateBooking = async (id: string, updates: Partial<Booking>): Promise<void> => {
    await getCollection('bookings').doc(id).update(updates);
};

export const deleteBooking = async (id: string): Promise<void> => {
    await getCollection('bookings').doc(id).delete();
};

// --- Environment Monitoring Logic ---
import type { LabRoom, EnvironmentLog } from '../types';

export const getLabRooms = async (): Promise<LabRoom[]> => {
    if (!firestore) return [];
    const snapshot = await safeGet(getCollection('labRooms'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as LabRoom));
};

export const addLabRoom = async (room: Omit<LabRoom, 'id'>): Promise<LabRoom> => {
    const docRef = await getCollection('labRooms').add(room);
    return { id: docRef.id, ...room };
};

export const updateLabRoom = async (id: string, updates: Partial<LabRoom>): Promise<void> => {
    await getCollection('labRooms').doc(id).update(updates);
};

export const deleteLabRoom = async (id: string): Promise<void> => {
    await getCollection('labRooms').doc(id).delete();
};

export const getEnvironmentLogs = async (roomId?: string, startDate?: string, endDate?: string): Promise<EnvironmentLog[]> => {
    if (!firestore) return [];
    let query: any = getCollection('environmentLogs').orderBy('timestamp', 'desc');
    
    if (roomId) {
        query = query.where('roomId', '==', roomId);
    }
    
    // Note: Firestore requires composite indexes for multiple fields filtering/sorting
    // For simplicity in this environment, we might filter dates client-side if index issues arise,
    // but let's try standard query first. If startDate/endDate are provided, we filter.
    
    const snapshot = await safeGet(query);
    let logs = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as EnvironmentLog));

    if (startDate) {
        logs = logs.filter((log: EnvironmentLog) => log.timestamp >= startDate);
    }
    if (endDate) {
        logs = logs.filter((log: EnvironmentLog) => log.timestamp <= endDate);
    }
    
    return logs;
};

export const addEnvironmentLog = async (log: Omit<EnvironmentLog, 'id'>): Promise<EnvironmentLog> => {
    const docRef = await getCollection('environmentLogs').add(log);
    return { id: docRef.id, ...log };
};

export const deleteEnvironmentLog = async (id: string): Promise<void> => {
    await getCollection('environmentLogs').doc(id).delete();
};

export const getChemicalPrices = async (): Promise<Record<string, number>> => {
    try {
        const docSnap = await getCollection('settings').doc('chemicalPrices').get();
        if (docSnap.exists) {
            return docSnap.data() as Record<string, number>;
        }
        return {};
    } catch (error) {
        console.error("Error fetching chemical prices:", error);
        return {};
    }
};

export const saveChemicalPrices = async (prices: Record<string, number>): Promise<void> => {
    try {
        await getCollection('settings').doc('chemicalPrices').set(prices, { merge: true });
    } catch (error) {
        console.error("Error saving chemical prices:", error);
    }
};

// --- Proficiency Testing System ---
export const getProficiencyTests = async (): Promise<ProficiencyTest[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('proficiencyTests').orderBy('order', 'asc'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as ProficiencyTest);
};

export const saveProficiencyTest = async (test: Omit<ProficiencyTest, 'id'>, id?: string): Promise<void> => {
    if (id) {
        await getCollection('proficiencyTests').doc(id).update(test);
    } else {
        await getCollection('proficiencyTests').add(test);
    }
};

export const deleteProficiencyTest = async (id: string): Promise<void> => {
    await getCollection('proficiencyTests').doc(id).delete();
};

export const getProficiencyRecords = async (): Promise<ProficiencyRecord[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('proficiencyRecords'));
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as ProficiencyRecord);
};

export const saveProficiencyRecord = async (record: Omit<ProficiencyRecord, 'id'>, id: string): Promise<void> => {
    // Remove undefined values to prevent Firestore errors
    const cleanedRecord = Object.fromEntries(Object.entries(record).filter(([_, v]) => v !== undefined));
    await getCollection('proficiencyRecords').doc(id).set({ ...cleanedRecord, id });
};

export const deleteProficiencyRecord = async (id: string): Promise<void> => {
    await getCollection('proficiencyRecords').doc(id).delete();
};

export const getSupportRequests = async (): Promise<SupportRequest[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('supportRequests').orderBy('createdAt', 'desc'));
    return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
    })) as SupportRequest[];
};

export const saveSupportRequest = async (request: SupportRequest): Promise<void> => {
    if (!firestore) throw new Error("Database not initialized");
    const collection = getCollection('supportRequests');
    
    // Remove undefined values to prevent Firestore errors
    const cleanedRequest = Object.fromEntries(Object.entries(request).filter(([_, v]) => v !== undefined));

    if (cleanedRequest.id) {
        await collection.doc(cleanedRequest.id as string).update(cleanedRequest);
    } else {
        await collection.add({
            ...cleanedRequest,
            createdAt: cleanedRequest.createdAt || new Date().toISOString()
        });
    }
};

export const deleteSupportRequest = async (id: string): Promise<void> => {
    await getCollection('supportRequests').doc(id).delete();
};

export const getAppSettings = async (): Promise<any> => {
    if (!firestore) return null;
    const docRef = getCollection('system').doc('appSettings');
    const doc = await safeGet(docRef);
    return doc.exists ? doc.data() : null;
};

export const saveAppSettings = async (settings: any): Promise<void> => {
    if (!firestore) return;
    const docRef = getCollection('system').doc('appSettings');
    await docRef.set(settings, { merge: true });
};

// --- Method Walkthrough System ---
export const getWalkthroughs = async (): Promise<Walkthrough[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('walkthroughs').orderBy('createdAt', 'desc'));
    return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
    })) as Walkthrough[];
};

export const saveWalkthrough = async (walkthrough: Omit<Walkthrough, 'id'>, id?: string): Promise<void> => {
    if (!firestore) throw new Error("Database not initialized");
    const collection = getCollection('walkthroughs');
    
    // Clean fields
    const cleaned = Object.fromEntries(Object.entries(walkthrough).filter(([_, v]) => v !== undefined));
    
    if (id) {
        await collection.doc(id).update(cleaned);
    } else {
        await collection.add({
            ...cleaned,
            createdAt: walkthrough.createdAt || new Date().toISOString()
        });
    }
};

export const deleteWalkthrough = async (id: string): Promise<void> => {
    if (!firestore) throw new Error("Database not initialized");
    await getCollection('walkthroughs').doc(id).delete();
};

export const acknowledgeWalkthrough = async (walkthroughId: string, testerId: string): Promise<void> => {
    if (!firestore) throw new Error("Database not initialized");
    const docRef = getCollection('walkthroughs').doc(walkthroughId);
    const doc = await docRef.get();
    if (!doc.exists) return;
    
    const data = doc.data() as Walkthrough;
    const acknowledgements = { ...data.acknowledgements };
    acknowledgements[testerId] = {
        acknowledged: true,
        acknowledgedAt: new Date().toISOString()
    };
    
    // Check if fully completed
    const isCompleted = data.targetTesters.every(tid => acknowledgements[tid]?.acknowledged);
    
    await docRef.update({
        acknowledgements,
        isCompleted
    });
};

// --- Equipment Borrow & Return Record System ---
export const getBorrowRecords = async (): Promise<BorrowRecord[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await safeGet(getCollection('borrowRecords').orderBy('createdAt', 'desc'));
    return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
    })) as BorrowRecord[];
};

export const saveBorrowRecord = async (record: BorrowRecord): Promise<void> => {
    if (!firestore) throw new Error("Database not initialized");
    const collection = getCollection('borrowRecords');
    
    // Clean fields
    const cleaned = Object.fromEntries(Object.entries(record).filter(([_, v]) => v !== undefined));
    
    if (cleaned.id) {
        await collection.doc(cleaned.id as string).update(cleaned);
    } else {
        await collection.add({
            ...cleaned,
            createdAt: cleaned.createdAt || new Date().toISOString()
        });
    }
};

export const deleteBorrowRecord = async (id: string): Promise<void> => {
    if (!firestore) throw new Error("Database not initialized");
    await getCollection('borrowRecords').doc(id).delete();
};

