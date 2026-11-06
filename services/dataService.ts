
import { firestore } from './firebase';
import type { Tester, CategorizedTask, AssignedTask, DailySchedule, RawTask, AssignedPrepareTask, TestMapping, ShiftReport, Equipment, DistillationLog, Booking, ProficiencyTest, ProficiencyRecord, SupportRequest, Walkthrough, BorrowRecord } from '../types';
import { TaskCategory } from '../types';
import { normalizeMonth, isToleranceString, inferEquipmentSetGroup } from '../utils/monthUtils';
import { MASTER_EQUIPMENTS, MASTER_EQUIPMENT_OWNERS } from './masterEquipments';

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

const safeSetItem = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch (error: any) {
        console.warn(`localStorage Quota Exceeded for key "${key}":`, error);
        try {
            if (value.startsWith('[') && value.endsWith(']')) {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length > 100) {
                    const trimmed = parsed.slice(0, 100);
                    localStorage.setItem(key, JSON.stringify(trimmed));
                    console.log(`Successfully saved a trimmed version (100 items) for key "${key}"`);
                    return;
                }
            }
        } catch (trimError) {
            console.error("Failed to trim data for fallback storage:", trimError);
        }
        console.error(`Unable to save backup for key "${key}". Proceeding in-memory without breaking the application.`);
    }
};

// --- Duplicate Prevention Service ---
export const getAllExistingRequestIds = async (): Promise<Set<string>> => {
    if (!firestore) return new Set();
    
    const existingIds = new Set<string>();

    try {
        const poolSnapshot = await getCollection('categorizedTasks').select('id').get();
        poolSnapshot.forEach((doc: any) => {
            const data = doc.data();
            if (data.id) existingIds.add(String(data.id).trim().toUpperCase());
        });

        const assignedSnapshot = await getCollection('assignedTasks').select('requestId').get();
        assignedSnapshot.forEach((doc: any) => {
            const data = doc.data();
            if (data.requestId) existingIds.add(String(data.requestId).trim().toUpperCase());
        });

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

export const STANDARD_EQUIPMENT_OWNERS: Record<string, string> = {
    ...MASTER_EQUIPMENT_OWNERS
};

// Map equipment numbers and machine names to standard designated responsible persons from master data
export const getStandardOwner = (eqNo: string, eqName?: string): string => {
    const cleanNo = normalizeEquipmentNo(eqNo);
    if (cleanNo && STANDARD_EQUIPMENT_OWNERS[cleanNo]) {
        return STANDARD_EQUIPMENT_OWNERS[cleanNo];
    }
    if (cleanNo && cleanNo.includes('/')) {
        const parentNo = cleanNo.split('/')[0];
        if (STANDARD_EQUIPMENT_OWNERS[parentNo]) {
            return STANDARD_EQUIPMENT_OWNERS[parentNo];
        }
    }
    if (cleanNo && cleanNo.includes('-')) {
        const parts = cleanNo.split('-');
        if (parts.length >= 3) {
            const baseNo = `${parts[0]}-${parts[1]}`;
            if (STANDARD_EQUIPMENT_OWNERS[baseNo]) {
                return STANDARD_EQUIPMENT_OWNERS[baseNo];
            }
        }
    }

    const nameLower = String(eqName || '').toLowerCase();
    if (nameLower.includes('ftir') || nameLower.includes('tensor') || nameLower.includes('lumos')) return 'PORNTHAK';
    if (nameLower.includes('microscope') || nameLower.includes('optical') || nameLower.includes('opticla')) return 'PORNTHAK';
    if (nameLower.includes('melt') || nameLower.includes('mfi')) return 'Channarong';
    if (nameLower.includes('balance') || nameLower.includes('ชั่ง')) return 'Weerawat';
    if (nameLower.includes('density') || nameLower.includes('ความหนาแน่น')) return 'Pornthawit';
    if (nameLower.includes('universal') || nameLower.includes('utm') || nameLower.includes('tensile')) return 'Channarong';
    if (nameLower.includes('oven') || nameLower.includes('ตู้อบ')) return 'Thawatchai';
    if (nameLower.includes('ph') || nameLower.includes('conductivity')) return 'Weerawat';
    if (nameLower.includes('moisture') || nameLower.includes('ความชื้น')) return 'Pornthawit';
    if (nameLower.includes('dsc') || nameLower.includes('calorimeter')) return 'THAWAPHO';
    if (nameLower.includes('spectro') || nameLower.includes('วัดสี')) return 'Mark';

    return 'PORNTHAK';
};

// Standardize equipment code (e.g. "PDF 1-001" -> "PDS-1001", "PDF 1-029-01" -> "PDS-1029-01", rejects bare "PDF" or header labels)
export const normalizeEquipmentNo = (eqNo: string): string => {
    if (!eqNo) return '';
    const raw = String(eqNo || '').trim();
    if (!raw) return '';

    const upperNoSpaces = raw.toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
    const junkTokens = [
        'PDF', 'PDS', 'EQUIPMENTNO', 'EQUIPMENT', 'EQUIPMENTNAME', 
        'NO', 'NO.', 'ITEM', 'ITEMNO', 'ITEMNO.', 'ลำดับ', 'ลำดับที่', 
        'รหัสเครื่อง', 'รหัสเครื่องมือ', 'เครื่องมือ', 'เครื่อง', 'ชื่อเครื่อง', 
        'CODE', 'ID', 'DOCNO', 'PDFNO', 'PDSNO'
    ];
    if (junkTokens.includes(upperNoSpaces)) {
        return '';
    }

    // 1. Exact standard formats: PDS-XXXX, PDS-XXXX/YY, PDS-XXXX-YY (e.g. PDS-1001, PDS-1001/02, PDS-1029-01, PDS-1048-01, PDS-1009/1)
    const exactMatch = raw.match(/^PDS-(\d{4})(?:([/-])(\d{1,2}))?$/i);
    if (exactMatch) {
        const main = exactMatch[1];
        const sep = exactMatch[2];
        const sub = exactMatch[3];
        if (!sep) return `PDS-${main}`;
        const subPadded = sub.length === 1 && sep === '/' ? `0${sub}` : sub;
        return `PDS-${main}${sep}${subPadded}`;
    }

    // 2. Sub-equipment with slash from raw inputs (e.g. "PDF 1-001/01", "1-001/02", "PDF 1-009/1", "PDS-1004/03")
    const subMatch = raw.match(/(?:PDS|PDF)?\s*[-_]?\s*(?:1\s*[-_]\s*0*|10)?(\d{1,4})\s*\/\s*0*(\d+)/i);
    if (subMatch) {
        let mainNum = parseInt(subMatch[1], 10);
        let subNum = parseInt(subMatch[2], 10);
        if (mainNum < 1000) mainNum += 1000;
        const subPadded = subNum < 10 ? `0${subNum}` : `${subNum}`;
        return `PDS-${mainNum}/${subPadded}`;
    }

    // 3. Equipment with sub-dash e.g. "PDF 1-029-01" or "PDS 1-029-01"
    const dashSubMatch = raw.match(/(?:PDS|PDF)?\s*[-_]?\s*(?:1\s*[-_]\s*0*|10)?(\d{1,4})\s*-\s*0*(\d{1,2})/i);
    if (dashSubMatch) {
        let mainNum = parseInt(dashSubMatch[1], 10);
        let subNum = parseInt(dashSubMatch[2], 10);
        if (mainNum < 1000) mainNum += 1000;
        const subPadded = subNum < 10 ? `0${subNum}` : `${subNum}`;
        return `PDS-${mainNum}-${subPadded}`;
    }

    // 4. Primary equipment e.g. "PDF 1-001", "PDF1-001", "1-001", "PDS 1001"
    const priMatch = raw.match(/(?:PDS|PDF)?\s*[-_]?\s*(?:1\s*[-_]\s*0*|10)?(\d{1,4})/i);
    if (priMatch) {
        let num = parseInt(priMatch[1], 10);
        if (!isNaN(num) && num > 0) {
            if (num < 1000) num += 1000;
            if (num >= 1001 && num <= 1099) {
                return `PDS-${num}`;
            }
        }
    }

    return '';
};

// Sort equipments in clean natural numerical order (PDS-1001 ... PDS-1048-01, with sub-equipments properly nested)
export const sortEquipmentsNaturally = (list: Equipment[]): Equipment[] => {
    return [...list].sort((a, b) => {
        const noA = String(a.equipmentNo || a.code || '').trim();
        const noB = String(b.equipmentNo || b.code || '').trim();

        const parseCode = (str: string) => {
            const match = str.match(/PDS-(\d{4})(?:([/-])(\d+))?/i);
            if (!match) return { main: 99999, isSub: false, sep: '', sub: 0, raw: str };
            return {
                main: parseInt(match[1], 10),
                isSub: !!match[2],
                sep: match[2] || '',
                sub: match[3] ? parseInt(match[3], 10) : 0,
                raw: str
            };
        };

        const pA = parseCode(noA);
        const pB = parseCode(noB);

        if (pA.main !== pB.main) return pA.main - pB.main;
        if (!pA.isSub && pB.isSub) return -1;
        if (pA.isSub && !pB.isSub) return 1;
        if (pA.isSub && pB.isSub) {
            if (pA.sub !== pB.sub) return pA.sub - pB.sub;
        }
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
    });
};

export const INITIAL_EQUIPMENTS: Equipment[] = MASTER_EQUIPMENTS;

const getDeterministicEquipId = (eqNo: string, fallbackId?: string): string => {
    const clean = normalizeEquipmentNo(eqNo);
    if (clean) {
        return 'eq_' + clean.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
    return fallbackId || 'eq_' + Math.random().toString(36).substr(2, 9);
};

const getDeterministicSubId = (subNo: string, fallbackId?: string): string => {
    const clean = normalizeEquipmentNo(subNo);
    if (clean) {
        return 'sub_' + clean.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
    return fallbackId || 'sub_' + Math.random().toString(36).substr(2, 9);
};

const sanitizePmDetails = (pm: any, raw?: any) => {
    const explicitLast = (pm?.lastPM !== undefined && String(pm.lastPM).trim() !== '')
        ? pm.lastPM
        : (pm?.nextPM !== undefined ? pm.nextPM : (raw?.pmMonth ?? ''));
    let rawLastPM = String(explicitLast ?? '').trim();
    let tolerance = pm?.tolerance || raw?.pmTolerance || 'Pass/Fail';
    if (isToleranceString(rawLastPM)) {
        if (!tolerance || tolerance === 'Pass/Fail') tolerance = String(rawLastPM);
        rawLastPM = '';
    }

    const lowerPM = rawLastPM.toLowerCase();
    // Explicitly check if PM is cancelled / set to None
    // Note: Do NOT check nextPM === '-' because MASTER_EQUIPMENTS can have a valid lastPM alongside nextPM: '-'
    const isNoPM = !rawLastPM || rawLastPM === '-' || lowerPM === 'none' || lowerPM === 'ไม่มี' || lowerPM === 'n/a' ||
                   String(pm?.lastPM ?? '').trim() === '-' ||
                   String(pm?.freqYear ?? '').trim() === '-' || pm?.freqYear === 0;

    if (isNoPM) {
        return {
            freqYear: '-',
            lastPM: '-',
            nextPM: '-',
            pmBy: pm?.pmBy || raw?.pmBy || 'Vender',
            items: pm?.items || raw?.pmItems || 'ตามรายการ Vender',
            tolerance: tolerance || 'Pass/Fail',
            ...(pm?.intervalYears ? { intervalYears: Number(pm.intervalYears) } : {}),
            ...(pm?.baseYear ? { baseYear: Number(pm.baseYear) } : {})
        };
    }

    let lastPM = normalizeMonth(rawLastPM);
    let nextPM = normalizeMonth(pm?.nextPM || rawLastPM) || lastPM;

    return {
        freqYear: pm?.freqYear ?? raw?.pmFreq ?? 1,
        lastPM: lastPM || '-',
        nextPM: nextPM || lastPM || '-',
        pmBy: pm?.pmBy || raw?.pmBy || 'Vender',
        items: pm?.items || raw?.pmItems || 'ตามรายการ Vender',
        tolerance: tolerance || 'Pass/Fail',
        ...(pm?.intervalYears ? { intervalYears: Number(pm.intervalYears) } : {}),
        ...(pm?.baseYear ? { baseYear: Number(pm.baseYear) } : {})
    };
};

const sanitizeCalDetails = (cal: any, raw?: any) => {
    const explicitLast = (cal?.lastCal !== undefined && String(cal.lastCal).trim() !== '')
        ? cal.lastCal
        : (cal?.nextCal !== undefined ? cal.nextCal : (raw?.calMonth ?? ''));
    let rawLastCal = String(explicitLast ?? '').trim();
    let tolerance = cal?.tolerance || raw?.tolerance || '';

    // If lastCal contains tolerance (e.g. ± 5 um), heal and move it into tolerance
    if (isToleranceString(rawLastCal)) {
        if (!tolerance || tolerance === 'Pass/Fail' || tolerance === '-') {
            tolerance = String(rawLastCal);
        }
        rawLastCal = '';
    }

    const lowerCal = rawLastCal.toLowerCase();
    // Explicitly check if Cal is cancelled / set to None
    // Note: Do NOT check nextCal === '-' because MASTER_EQUIPMENTS has 49 items with a valid lastCal alongside nextCal: '-'
    const isNoCal = !rawLastCal || rawLastCal === '-' || lowerCal === 'none' || lowerCal === 'ไม่มี' || lowerCal === 'n/a' ||
                    String(cal?.lastCal ?? '').trim() === '-' ||
                    String(cal?.freqYear ?? '').trim() === '-' || cal?.freqYear === 0;

    if (isNoCal) {
        return {
            freqYear: '-',
            lastCal: '-',
            nextCal: '-',
            calBy: cal?.calBy || raw?.calBy || 'Vender',
            items: cal?.items || raw?.calItems || 'ตามรายการ Vender',
            tolerance: tolerance || 'Pass/Fail',
            ...(cal?.intervalYears ? { intervalYears: Number(cal.intervalYears) } : {}),
            ...(cal?.baseYear ? { baseYear: Number(cal.baseYear) } : {})
        };
    }

    let lastCal = normalizeMonth(rawLastCal);
    let nextCal = normalizeMonth(cal?.nextCal || rawLastCal) || lastCal;

    return {
        freqYear: cal?.freqYear ?? raw?.calFreq ?? 1,
        lastCal: lastCal || '-',
        nextCal: nextCal || lastCal || '-',
        calBy: cal?.calBy || raw?.calBy || 'Vender',
        items: cal?.items || raw?.calItems || 'ตามรายการ Vender',
        tolerance: tolerance || 'Pass/Fail',
        ...(cal?.intervalYears ? { intervalYears: Number(cal.intervalYears) } : {}),
        ...(cal?.baseYear ? { baseYear: Number(cal.baseYear) } : {})
    };
};

const normalizeEquipment = (raw: any): Equipment => {
    const rawNo = String(raw.equipmentNo || raw.code || raw.name || '').trim();
    const cleanNo = normalizeEquipmentNo(rawNo);
    const equipName = String(raw.equipmentName || raw.name || 'Unnamed Equipment');
    const stdOwner = cleanNo ? getStandardOwner(cleanNo, equipName) : getStandardOwner('', equipName);
    const rawOwner = String(raw.owner || raw.custodian || raw.custodianName || '').trim();

    let owner = rawOwner;
    const rawUpper = rawOwner.toUpperCase();
    if (!rawOwner || rawUpper === 'PDF' || rawUpper === 'EQUIPMENTNO' || rawOwner.includes('ลำดับ') || rawUpper === 'PORNTHAK') {
        owner = stdOwner;
    }

    const sanitizedPM = sanitizePmDetails(raw.pm, raw);
    const sanitizedCal = sanitizeCalDetails(raw.cal, raw);
    const primarySetGroup = raw.setGroup || inferEquipmentSetGroup(equipName, raw.setGroup);

    return {
        ...raw,
        id: getDeterministicEquipId(cleanNo || rawNo, raw.id),
        equipmentNo: cleanNo || rawNo,
        equipmentName: equipName,
        name: equipName,
        owner,
        department: raw.department || 'PCRD Lab',
        location: raw.location || '',
        status: raw.status || 'ready',
        pmMonth: sanitizedPM.lastPM,
        calMonth: sanitizedCal.lastCal,
        pm: sanitizedPM,
        cal: sanitizedCal,
        ...(primarySetGroup ? { setGroup: primarySetGroup } : {}),
        trackingStatus: raw.trackingStatus || {
            quotationRequested: false,
            prIssued: false,
            vendorScheduled: false,
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        history: Array.isArray(raw.history) ? raw.history : [],
        subEquipments: (raw.subEquipments || [])
            .filter((s: any) => {
                const sRaw = String(s.equipmentNo || s.code || '').trim();
                const sClean = normalizeEquipmentNo(sRaw);
                const sUpper = sRaw.toUpperCase();
                return sClean !== '' && sUpper !== 'PDF' && !sUpper.includes('ลำดับ');
            })
            .map((s: any, sIdx: number) => {
                const subRawNo = String(s.equipmentNo || s.code || '').trim();
                const subCleanNo = normalizeEquipmentNo(subRawNo) || (cleanNo ? `${cleanNo}/0${sIdx + 1}` : 'SUB-EQ');
                const subName = String(s.equipmentName || s.name || 'Sub-Equipment');
                const subStdOwner = getStandardOwner(subCleanNo, subName) || owner;
                const subRawOwner = String(s.owner || '').trim();
                let subOwner = subRawOwner;
                const subUpper = subRawOwner.toUpperCase();
                if (!subRawOwner || subUpper === 'PDF' || subUpper === 'EQUIPMENTNO' || subUpper === 'PORNTHAK') {
                    subOwner = subStdOwner;
                }
                const subSetGroup = s.setGroup || inferEquipmentSetGroup(subName, s.setGroup);

                return {
                    ...s,
                    id: getDeterministicSubId(subCleanNo, s.id),
                    equipmentNo: subCleanNo,
                    equipmentName: subName,
                    owner: subOwner,
                    ...(subSetGroup ? { setGroup: subSetGroup } : {}),
                    pm: s.pm ? sanitizePmDetails(s.pm) : undefined,
                    cal: s.cal ? sanitizeCalDetails(s.cal) : undefined,
                    trackingStatus: s.trackingStatus || {
                        quotationRequested: false,
                        prIssued: false,
                        vendorScheduled: false,
                        certReceived: false,
                        certDelivered: false,
                        result: 'Pending'
                    }
                };
            })
    };
};

export const CURRENT_MASTER_VERSION = 'v2026_11_master_162_restored_v5';

const hasActiveTrackingProgress = (st: any): boolean => {
    if (!st) return false;
    return Boolean(
        st.quotationRequested ||
        st.prIssued ||
        st.vendorScheduled ||
        st.certReceived ||
        st.certDelivered ||
        (st.result && st.result !== 'Pending') ||
        st.appointmentDate ||
        st.prNo ||
        st.vendorName
    );
};

// --- Equipment Management ---
export const getEquipments = async (): Promise<Equipment[]> => {
    const clientVersion = localStorage.getItem('master_version_key');
    if (clientVersion !== CURRENT_MASTER_VERSION) {
        localStorage.removeItem('backup_equipments');
        localStorage.removeItem('deleted_equipment_nos');
        localStorage.setItem('master_version_key', CURRENT_MASTER_VERSION);
    }

    // 1. Start with all 70 Master Equipments (+ 92 Sub-Equipments = 162 items) as canonical baseline
    const mergedMap = new Map<string, any>();
    MASTER_EQUIPMENTS.forEach(item => {
        const cleanNo = normalizeEquipmentNo(item.equipmentNo);
        if (cleanNo) {
            mergedMap.set(cleanNo, JSON.parse(JSON.stringify(item)));
        }
    });

    // Track deleted equipment numbers
    const deletedSet = new Set<string>();
    try {
        const deletedRaw = localStorage.getItem('deleted_equipment_nos');
        if (deletedRaw) {
            const parsedDel = JSON.parse(deletedRaw);
            if (Array.isArray(parsedDel)) parsedDel.forEach(no => deletedSet.add(String(no)));
        }
    } catch (e) {}

    // 2. Overlay localStorage backup (for offline / immediate local state)
    const backup = localStorage.getItem('backup_equipments');
    if (backup) {
        try {
            const localList = JSON.parse(backup);
            if (Array.isArray(localList)) {
                localList.forEach((localEq: any) => {
                    if (!localEq) return;
                    const cleanNo = normalizeEquipmentNo(localEq.equipmentNo || localEq.code || '');
                    if (!cleanNo) return;
                    if (localEq.isDeleted) {
                        deletedSet.add(cleanNo);
                        mergedMap.delete(cleanNo);
                        return;
                    }
                    const existing = mergedMap.get(cleanNo);
                    mergedMap.set(cleanNo, existing ? { ...existing, ...localEq } : localEq);
                });
            }
        } catch (e) {}
    }

    // 3. Overlay Firestore documents (Cloud shared state across Dev & Deployed URLs)
    if (firestore) {
        try {
            const snapshot = await safeGet(getCollection('equipments'));
            const serverDocs = snapshot.docs.map((doc: any) => ({
                ...doc.data(),
                id: doc.id || doc.data()?.id
            }));

            serverDocs.forEach((serverEq: any) => {
                if (!serverEq) return;
                const cleanNo = normalizeEquipmentNo(serverEq.equipmentNo || serverEq.code || '');
                if (!cleanNo || cleanNo.includes('/')) return;

                const isCurrentVersionDoc = serverEq.syncVersion === CURRENT_MASTER_VERSION;

                if (isCurrentVersionDoc && serverEq.isDeleted) {
                    deletedSet.add(cleanNo);
                    mergedMap.delete(cleanNo);
                    return;
                }

                const currentInMap = mergedMap.get(cleanNo);
                if (!currentInMap) {
                    if (isCurrentVersionDoc) {
                        mergedMap.set(cleanNo, serverEq);
                    }
                } else if (isCurrentVersionDoc) {
                    const localTime = currentInMap.lastUpdated ? new Date(currentInMap.lastUpdated).getTime() : 0;
                    const serverTime = serverEq.lastUpdated ? new Date(serverEq.lastUpdated).getTime() : 0;

                    if (serverTime >= localTime || !currentInMap.lastUpdated) {
                        mergedMap.set(cleanNo, { ...currentInMap, ...serverEq });
                    }
                } else {
                    // Legacy Firestore document (before CURRENT_MASTER_VERSION):
                    // Never allow legacy docs to wipe out PM/Cal months or subEquipments list,
                    // but DO preserve any active 6-step trackingStatus, breakdownStatus, or history!
                    const mergedLegacy = { ...currentInMap };
                    if (hasActiveTrackingProgress(serverEq.trackingStatus) && !hasActiveTrackingProgress(mergedLegacy.trackingStatus)) {
                        mergedLegacy.trackingStatus = serverEq.trackingStatus;
                    }
                    if (serverEq.breakdownStatus && (serverEq.breakdownStatus.isBroken || (serverEq.breakdownStatus.history && serverEq.breakdownStatus.history.length > 0))) {
                        mergedLegacy.breakdownStatus = serverEq.breakdownStatus;
                        if (serverEq.status) mergedLegacy.status = serverEq.status;
                    }
                    if (Array.isArray(serverEq.history) && serverEq.history.length > 0 && (!mergedLegacy.history || mergedLegacy.history.length === 0)) {
                        mergedLegacy.history = serverEq.history;
                    }
                    if (Array.isArray(serverEq.subEquipments) && Array.isArray(mergedLegacy.subEquipments)) {
                        const serverSubMap = new Map<string, any>();
                        serverEq.subEquipments.forEach((s: any) => {
                            const sNo = normalizeEquipmentNo(s?.equipmentNo || '');
                            if (sNo) serverSubMap.set(sNo, s);
                        });
                        mergedLegacy.subEquipments = mergedLegacy.subEquipments.map((mSub: any) => {
                            const mSubNo = normalizeEquipmentNo(mSub?.equipmentNo || '');
                            const sSub = serverSubMap.get(mSubNo);
                            if (sSub && hasActiveTrackingProgress(sSub.trackingStatus) && !hasActiveTrackingProgress(mSub.trackingStatus)) {
                                return { ...mSub, trackingStatus: sSub.trackingStatus };
                            }
                            return mSub;
                        });
                    }
                    mergedMap.set(cleanNo, mergedLegacy);
                }
            });
        } catch (err) {
            (window as any).firestoreQuotaExceeded = true;
            console.warn("getEquipments firestore read fallback to local:", err);
        }
    }

    // Remove any explicitly deleted items
    deletedSet.forEach(no => mergedMap.delete(no));

    const rawList = Array.from(mergedMap.values());

    // Filter out phantom items (like "PDF" or header labels)
    const validRaw = rawList.filter(r => {
        if (!r || r.isDeleted) return false;
        const no = String(r.equipmentNo || r.code || '').trim();
        const clean = normalizeEquipmentNo(no);
        if (!clean) return false;
        return true;
    });

    // Normalize and strictly DEDUPLICATE by ID and Equipment Number
    const normalized = validRaw.map(normalizeEquipment);
    const seenIds = new Set<string>();
    const seenEqNos = new Map<string, Equipment>();
    const uniqueList: Equipment[] = [];

    for (let i = 0; i < normalized.length; i++) {
        const eq = { ...normalized[i] };
        const eqNo = String(eq.equipmentNo || '').trim();

        if (!eqNo || eqNo.toUpperCase() === 'PDF') continue;

        if (!eqNo.includes('/') && seenEqNos.has(eqNo)) {
            const existing = seenEqNos.get(eqNo)!;
            if (eq.subEquipments && eq.subEquipments.length > 0) {
                const existingSubNos = new Set((existing.subEquipments || []).map(s => s.equipmentNo));
                const newSubs = eq.subEquipments.filter(s => !existingSubNos.has(s.equipmentNo));
                existing.subEquipments = [...(existing.subEquipments || []), ...newSubs];
            }
            continue;
        }

        eq.id = getDeterministicEquipId(eqNo, eq.id);
        seenIds.add(eq.id);

        if (!eqNo.includes('/')) {
            seenEqNos.set(eqNo, eq);
        }

        if (eq.subEquipments) {
            const seenSubIds = new Set<string>();
            eq.subEquipments = eq.subEquipments
                .filter(sub => {
                    const sNo = normalizeEquipmentNo(String(sub.equipmentNo || ''));
                    return sNo !== '';
                })
                .map((sub, sIdx) => {
                    const sNo = normalizeEquipmentNo(String(sub.equipmentNo || '')) || `${eqNo}/0${sIdx + 1}`;
                    let subId = getDeterministicSubId(sNo, sub.id);
                    if (seenSubIds.has(subId)) {
                        subId = `${subId}_${sIdx}`;
                    }
                    seenSubIds.add(subId);
                    return { ...sub, equipmentNo: sNo, id: subId };
                });
        }

        uniqueList.push(eq);
    }

    // Reconcile owners to ensure every instrument matches its designated laboratory owner if unset
    uniqueList.forEach(eq => {
        const clean = normalizeEquipmentNo(eq.equipmentNo);
        if (clean) eq.equipmentNo = clean;
        const stdOwner = getStandardOwner(clean, eq.equipmentName);
        if (stdOwner) {
            if (!eq.owner || eq.owner === 'PDF' || eq.owner === 'EQ-UNKNOWN') {
                eq.owner = stdOwner;
            }
        }
        if (eq.subEquipments) {
            eq.subEquipments.forEach((s, sIdx) => {
                const sClean = normalizeEquipmentNo(s.equipmentNo) || `${clean}/0${sIdx + 1}`;
                s.equipmentNo = sClean;
                const sStdOwner = getStandardOwner(sClean, s.equipmentName) || eq.owner;
                if (sStdOwner && (!s.owner || s.owner === 'PDF')) {
                    s.owner = sStdOwner;
                }
            });
        }
    });

    const sortedList = sortEquipmentsNaturally(uniqueList);
    safeSetItem('backup_equipments', JSON.stringify(sortedList));
    return sortedList;
};

// Reconcile and auto-align all equipment numbers and responsible owners with master standards
export const reconcileEquipmentStandards = async (): Promise<Equipment[]> => {
    let list = await getEquipments();
    if (list.length <= 25) {
        list = JSON.parse(JSON.stringify(MASTER_EQUIPMENTS));
    }
    const nowIso = new Date().toISOString();
    const cleanList = list
        .filter(eq => {
            const clean = normalizeEquipmentNo(eq.equipmentNo);
            return clean !== '' && clean.toUpperCase() !== 'PDF';
        })
        .map(eq => {
            const cleanNo = normalizeEquipmentNo(eq.equipmentNo) || eq.equipmentNo;
            const targetOwner = getStandardOwner(cleanNo, eq.equipmentName) || eq.owner || 'PORNTHAK';
            const cleanSubs = (eq.subEquipments || [])
                .filter(s => {
                    const sc = normalizeEquipmentNo(s.equipmentNo);
                    return sc !== '' && sc.toUpperCase() !== 'PDF';
                })
                .map((sub, sIdx) => {
                    const subCleanNo = normalizeEquipmentNo(sub.equipmentNo) || `${cleanNo}/0${sIdx + 1}`;
                    return {
                        ...sub,
                        id: getDeterministicSubId(subCleanNo, sub.id),
                        equipmentNo: subCleanNo,
                        owner: getStandardOwner(subCleanNo, sub.equipmentName) || targetOwner
                    };
                });
            return {
                ...eq,
                id: getDeterministicEquipId(cleanNo, eq.id),
                equipmentNo: cleanNo,
                owner: targetOwner,
                subEquipments: cleanSubs,
                syncVersion: CURRENT_MASTER_VERSION,
                lastUpdated: nowIso
            };
        });

    const sorted = sortEquipmentsNaturally(cleanList);
    safeSetItem('backup_equipments', JSON.stringify(sorted));

    if (firestore) {
        try {
            const batch = firestore.batch();
            const col = getCollection('equipments');
            sorted.forEach(eq => {
                batch.set(col.doc(eq.id), JSON.parse(JSON.stringify(eq)), { merge: true });
            });
            await batch.commit();
        } catch (e) {
            console.warn("Firestore reconcile commit error:", e);
        }
    }

    return sorted;
};

// Explicitly reset the system 100% to the exact data from the uploaded Master Plan file
export const resetToMasterEquipments = async (): Promise<Equipment[]> => {
    localStorage.removeItem('backup_equipments');
    localStorage.removeItem('deleted_equipment_nos');
    localStorage.setItem('master_version_key', CURRENT_MASTER_VERSION);
    const nowIso = new Date().toISOString();
    const freshList: Equipment[] = JSON.parse(JSON.stringify(MASTER_EQUIPMENTS)).map((eq: any) => ({
        ...normalizeEquipment(eq),
        syncVersion: CURRENT_MASTER_VERSION,
        lastUpdated: nowIso
    }));
    const sorted = sortEquipmentsNaturally(freshList);
    safeSetItem('backup_equipments', JSON.stringify(sorted));

    if (firestore) {
        try {
            const batch = firestore.batch();
            const col = getCollection('equipments');
            sorted.forEach(eq => {
                batch.set(col.doc(eq.id), JSON.parse(JSON.stringify(eq)));
            });
            await batch.commit();
        } catch (e) {
            console.warn("Firestore reset commit error:", e);
        }
    }

    return sorted;
};

export const saveEquipment = async (equipment: Omit<Equipment, 'id'> & { id?: string }): Promise<void> => {
    const cleanEqNo = normalizeEquipmentNo(equipment.equipmentNo || '');
    const deterministicId = getDeterministicEquipId(cleanEqNo || equipment.equipmentNo || '', equipment.id);
    const nowIso = new Date().toISOString();

    const stampedEquipment: any = {
        ...(equipment as Equipment),
        id: deterministicId,
        equipmentNo: cleanEqNo || equipment.equipmentNo,
        syncVersion: CURRENT_MASTER_VERSION,
        lastUpdated: nowIso
    };

    try {
        const backupStr = localStorage.getItem('backup_equipments') || '[]';
        let list = JSON.parse(backupStr) as Equipment[];
        const targetEqNo = stampedEquipment.equipmentNo ? String(stampedEquipment.equipmentNo).trim() : '';
        
        const existingIdx = list.findIndex(e => 
            String(e.id) === deterministicId || 
            (targetEqNo && normalizeEquipmentNo(e.equipmentNo || '') === targetEqNo)
        );

        if (existingIdx >= 0) {
            list[existingIdx] = { 
                ...list[existingIdx], 
                ...stampedEquipment
            };
        } else {
            list.push(stampedEquipment);
        }
        safeSetItem('backup_equipments', JSON.stringify(list));
    } catch (e) {
        console.error("Error backing up equipment:", e);
    }

    // Deep clean all undefined values at any level to prevent Firestore setDoc crashes
    const cleanData = JSON.parse(JSON.stringify(stampedEquipment));

    if (firestore) {
        try {
            const writePromise = getCollection('equipments').doc(deterministicId).set(cleanData, { merge: true });
            
            // Timeout after 3500ms so Firestore never freezes the application UI
            await Promise.race([
                writePromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 3500))
            ]);
        } catch (err) {
            console.warn("Firestore saveEquipment warning, data preserved in local backup:", err);
        }
    }
};

export const deleteEquipment = async (id: string): Promise<void> => {
    try {
        const backupStr = localStorage.getItem('backup_equipments') || '[]';
        let list = JSON.parse(backupStr) as Equipment[];
        list = list.filter(e => e.id !== id);
        safeSetItem('backup_equipments', JSON.stringify(list));
    } catch (e) {
        console.error("Error deleting equipment from backup:", e);
    }
    await getCollection('equipments').doc(id).delete();
};

export const batchImportEquipments = async (equipments: Omit<Equipment, 'id'>[]): Promise<void> => {
    // Generate clean unique IDs
    const seen = new Set<string>();
    const cleanList = equipments.map((eq, i) => {
        let id = (eq as any).id;
        if (!id || seen.has(id)) {
            id = `eq_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        }
        seen.add(id);
        return {
            ...eq,
            id
        };
    });

    try {
        safeSetItem('backup_equipments', JSON.stringify(cleanList));
    } catch (e) {}

    if (!firestore) return;

    try {
        const collection = getCollection('equipments');
        const snapshot = await collection.get();
        
        // Chunk deletes in batches of max 300
        const batchSize = 300;
        const deleteDocs = snapshot.docs;
        for (let i = 0; i < deleteDocs.length; i += batchSize) {
            const b = firestore.batch();
            deleteDocs.slice(i, i + batchSize).forEach((d: any) => b.delete(d.ref));
            await b.commit();
        }

        // Chunk sets in batches of max 300
        for (let i = 0; i < cleanList.length; i += batchSize) {
            const b = firestore.batch();
            cleanList.slice(i, i + batchSize).forEach(item => {
                const docRef = collection.doc(item.id);
                b.set(docRef, item);
            });
            await b.commit();
        }
    } catch (err) {
        console.warn("Firestore batch error, backup saved locally", err);
    }
};

// --- Tester Management ---
export const getTesters = async (): Promise<Tester[]> => {
    if (!firestore) {
        const backup = localStorage.getItem('backup_testers');
        return backup ? JSON.parse(backup) : [];
    }
    try {
        const snapshot = await safeGet(getCollection('analysts'));
        const list = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as Tester);
        safeSetItem('backup_testers', JSON.stringify(list));
        return list;
    } catch (err) {
        (window as any).firestoreQuotaExceeded = true;
        console.error("getTesters error, loading backup:", err);
        const backup = localStorage.getItem('backup_testers');
        return backup ? JSON.parse(backup) : [];
    }
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
    if (!firestore) {
        const backup = localStorage.getItem('backup_assignedTasks');
        return backup ? JSON.parse(backup) : [];
    }
    try {
        const snapshot = await safeGet(getCollection('assignedTasks'));
        const list = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as AssignedTask);
        safeSetItem('backup_assignedTasks', JSON.stringify(list));
        return list;
    } catch (err) {
        (window as any).firestoreQuotaExceeded = true;
        console.error("getAssignedTasks error, loading backup:", err);
        const backup = localStorage.getItem('backup_assignedTasks');
        return backup ? JSON.parse(backup) : [];
    }
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

// --- Distillation Logic & Initial Seed Records ---
const DEFAULT_DISTILLATION_LOGS: DistillationLog[] = [
    {
        id: 'dist_seed_1',
        chemicalName: 'Ethanol',
        inputAmount: 5000,
        outputAmount: 4800,
        yieldPercent: 96.0,
        date: '2026-10-24',
        recorderName: 'เบน',
        notes: 'กลั่นรีไซเคิลรอบเช้า นำกลับมาใช้ล้างเครื่องแก้วและเตรียมตัวอย่าง',
        createdAt: '2026-10-24T10:30:00.000Z'
    },
    {
        id: 'dist_seed_2',
        chemicalName: 'Methanol',
        inputAmount: 4000,
        outputAmount: 3880,
        yieldPercent: 97.0,
        date: '2026-10-22',
        recorderName: 'โต้',
        notes: 'กลั่นบริสุทธิ์ HPLC grade สำหรับ Mobile Phase',
        createdAt: '2026-10-22T14:15:00.000Z'
    },
    {
        id: 'dist_seed_3',
        chemicalName: 'Hexane',
        inputAmount: 6000,
        outputAmount: 5640,
        yieldPercent: 94.0,
        date: '2026-10-18',
        recorderName: 'ทีม',
        notes: 'กลั่นคืนสารจากแล็บ Fat Extraction ตรวจสอบความบริสุทธิ์ผ่านเกณฑ์',
        createdAt: '2026-10-18T11:00:00.000Z'
    },
    {
        id: 'dist_seed_4',
        chemicalName: 'Acetone',
        inputAmount: 3500,
        outputAmount: 3360,
        yieldPercent: 96.0,
        date: '2026-10-15',
        recorderName: 'กิตติศักดิ์',
        notes: 'กลั่นรีไซเคิลตัวทำละลายล้างคราบไขมันในแล็บ',
        createdAt: '2026-10-15T16:20:00.000Z'
    },
    {
        id: 'dist_seed_5',
        chemicalName: 'Acetonitrile',
        inputAmount: 2500,
        outputAmount: 2420,
        yieldPercent: 96.8,
        date: '2026-10-10',
        recorderName: 'ชัยกร',
        notes: 'กลั่นสารรีไซเคิลเกรดวิเคราะห์ ค่า UV absorbance ผ่านเกณฑ์สเปก',
        createdAt: '2026-10-10T13:45:00.000Z'
    },
    {
        id: 'dist_seed_6',
        chemicalName: 'Isopropanol',
        inputAmount: 3000,
        outputAmount: 2850,
        yieldPercent: 95.0,
        date: '2026-10-05',
        recorderName: 'เบน',
        notes: 'กลั่นสารฆ่าเชื้อและทำความสะอาดตู้ดูดควัน Clean bench',
        createdAt: '2026-10-05T09:30:00.000Z'
    }
];

export const getDistillationLogs = async (): Promise<DistillationLog[]> => {
    // 1. Try Firestore first
    if (firestore) {
        try {
            const snapshot = await safeGet(getCollection('distillationLogs').orderBy('createdAt', 'desc'));
            const logs = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as DistillationLog));
            if (logs.length > 0) {
                safeSetItem('backup_distillationLogs', JSON.stringify(logs));
                return logs;
            }
        } catch (err) {
            console.warn("getDistillationLogs firestore error, falling back to local storage:", err);
        }
    }

    // 2. Fallback to localStorage backup
    const backupStr = localStorage.getItem('backup_distillationLogs');
    if (backupStr) {
        try {
            const parsed = JSON.parse(backupStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        } catch (e) {
            console.error("Error parsing backup_distillationLogs:", e);
        }
    }

    // 3. Fallback to initial realistic seed logs
    safeSetItem('backup_distillationLogs', JSON.stringify(DEFAULT_DISTILLATION_LOGS));
    
    // Seed to Firestore in background if online
    if (firestore) {
        try {
            const batch = firestore.batch();
            const col = getCollection('distillationLogs');
            DEFAULT_DISTILLATION_LOGS.forEach(log => {
                const docRef = col.doc(log.id || ('dist_' + Math.random().toString(36).substring(2, 9)));
                batch.set(docRef, log);
            });
            batch.commit().catch(e => console.warn("Firestore seed distillation commit error:", e));
        } catch (e) {
            // Ignore background seed error
        }
    }

    return DEFAULT_DISTILLATION_LOGS;
};

export const addDistillationLog = async (log: Omit<DistillationLog, 'id' | 'createdAt'>): Promise<DistillationLog> => {
    const createdAt = new Date().toISOString();
    const newId = 'dist_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const newRecord: DistillationLog = {
        ...log,
        id: newId,
        createdAt
    };

    // Save to local backup first for instant responsiveness
    try {
        const backupStr = localStorage.getItem('backup_distillationLogs');
        const currentList: DistillationLog[] = backupStr ? JSON.parse(backupStr) : [...DEFAULT_DISTILLATION_LOGS];
        const updatedList = [newRecord, ...currentList];
        safeSetItem('backup_distillationLogs', JSON.stringify(updatedList));
    } catch (e) {
        console.error("Error saving distillation log to local backup:", e);
    }

    // Also persist to Firestore if available
    if (firestore) {
        try {
            const docRef = await getCollection('distillationLogs').add({
                ...log,
                createdAt
            });
            newRecord.id = docRef.id;
        } catch (e) {
            console.warn("Could not save distillation log to firestore:", e);
        }
    }

    return newRecord;
};

export const updateDistillationLog = async (id: string, updates: Partial<DistillationLog>): Promise<void> => {
    // Update local backup
    try {
        const backupStr = localStorage.getItem('backup_distillationLogs');
        if (backupStr) {
            const currentList: DistillationLog[] = JSON.parse(backupStr);
            const updatedList = currentList.map(item => item.id === id ? { ...item, ...updates } : item);
            safeSetItem('backup_distillationLogs', JSON.stringify(updatedList));
        }
    } catch (e) {
        console.error("Error updating local backup_distillationLogs:", e);
    }

    if (firestore && !id.startsWith('dist_seed_') && !id.startsWith('dist_')) {
        try {
            await getCollection('distillationLogs').doc(id).update(updates);
        } catch (e) {
            console.warn("Could not update distillation log on firestore:", e);
        }
    }
};

export const deleteDistillationLog = async (id: string): Promise<void> => {
    // Remove from local backup
    try {
        const backupStr = localStorage.getItem('backup_distillationLogs');
        if (backupStr) {
            const currentList: DistillationLog[] = JSON.parse(backupStr);
            const updatedList = currentList.filter(item => item.id !== id);
            safeSetItem('backup_distillationLogs', JSON.stringify(updatedList));
        }
    } catch (e) {
        console.error("Error deleting from local backup_distillationLogs:", e);
    }

    if (firestore && !id.startsWith('dist_seed_') && !id.startsWith('dist_')) {
        try {
            await getCollection('distillationLogs').doc(id).delete();
        } catch (e) {
            console.warn("Could not delete distillation log on firestore:", e);
        }
    }
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

const DEFAULT_CHEMICAL_PRICES: Record<string, number> = {
    'Ethanol': 350,       // ฿/Liter
    'Methanol': 280,      // ฿/Liter
    'Hexane': 420,        // ฿/Liter
    'Acetone': 320,       // ฿/Liter
    'Acetonitrile': 1450, // ฿/Liter
    'Isopropanol': 380,   // ฿/Liter
    'Xylene': 490,        // ฿/Liter
    'Toluene': 460        // ฿/Liter
};

export const getChemicalPrices = async (): Promise<Record<string, number>> => {
    let prices: Record<string, number> = { ...DEFAULT_CHEMICAL_PRICES };
    
    // Check local storage backup
    const backupStr = localStorage.getItem('backup_chemicalPrices');
    if (backupStr) {
        try {
            const parsed = JSON.parse(backupStr);
            prices = { ...prices, ...parsed };
        } catch (e) {
            console.error("Error parsing backup_chemicalPrices:", e);
        }
    }

    if (firestore) {
        try {
            const docSnap = await getCollection('settings').doc('chemicalPrices').get();
            if (docSnap.exists) {
                const firestorePrices = docSnap.data() as Record<string, number>;
                prices = { ...prices, ...firestorePrices };
                safeSetItem('backup_chemicalPrices', JSON.stringify(prices));
            }
        } catch (error) {
            console.warn("Error fetching chemical prices from firestore:", error);
        }
    }

    return prices;
};

export const saveChemicalPrices = async (prices: Record<string, number>): Promise<void> => {
    // Save to local backup
    try {
        safeSetItem('backup_chemicalPrices', JSON.stringify(prices));
    } catch (e) {
        console.error("Error saving backup_chemicalPrices:", e);
    }

    if (firestore) {
        try {
            await getCollection('settings').doc('chemicalPrices').set(prices, { merge: true });
        } catch (error) {
            console.warn("Error saving chemical prices to firestore:", error);
        }
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
    if (!firestore) {
        const backup = localStorage.getItem('backup_supportRequests');
        return backup ? JSON.parse(backup) : [];
    }
    try {
        const snapshot = await safeGet(getCollection('supportRequests').orderBy('createdAt', 'desc'));
        const list = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        })) as SupportRequest[];
        safeSetItem('backup_supportRequests', JSON.stringify(list));
        return list;
    } catch (err) {
        (window as any).firestoreQuotaExceeded = true;
        console.error("getSupportRequests error, loading backup:", err);
        const backup = localStorage.getItem('backup_supportRequests');
        return backup ? JSON.parse(backup) : [];
    }
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

const DEFAULT_HIGH_VALUE_ASSETS = [
    { id: 'hva_1', name: 'HPLC - เครื่องโครมาโทกราฟีของเหลวประสิทธิภาพสูง', code: 'HPLC-01', cabinet: 'ตู้ควบคุมอุณหภูมิ A1', isActive: true },
    { id: 'hva_2', name: 'GC-MS - เครื่องแก๊สโครมาโทกราฟี-แมสสเปกโทรมิเตอร์', code: 'GCMS-02', cabinet: 'ตู้ควบคุมความดัน B3', isActive: true },
    { id: 'hva_3', name: 'ICP-OES - เครื่องวิเคราะห์โลหะหนักความละเอียดสูง', code: 'ICP-03', cabinet: 'ห้องเครื่องมือพิเศษ', isActive: true },
    { id: 'hva_4', name: 'FTIR Spectrometer - เครื่องอินฟราเรดสเปกโทรมิเตอร์', code: 'FTIR-04', cabinet: 'ตู้ดูดความชื้น C2', isActive: true },
    { id: 'hva_5', name: 'Analytical Balance 4-Decimal - เครื่องชั่งวิเคราะห์ 4 ตำแหน่ง', code: 'BAL-05', cabinet: 'ตู้กันสั่นสะเทือน D1', isActive: true },
    { id: 'hva_6', name: 'Portable Density Meter - เครื่องวัดความหนาแน่นพกพาสูง', code: 'PDM-06', cabinet: 'ตู้เซฟเก็บอุปกรณ์รหัส E5', isActive: true },
    { id: 'hva_7', name: 'Refractometer Automatic - เครื่องวัดดัชนีหักเหแสงอัตโนมัติ', code: 'REF-07', cabinet: 'ตู้กระจกนิรภัยพิเศษ F2', isActive: true }
];

export const getAppSettings = async (): Promise<any> => {
    if (!firestore) {
        const backup = localStorage.getItem('backup_appSettings');
        return backup ? JSON.parse(backup) : { highValueAssets: DEFAULT_HIGH_VALUE_ASSETS, highValueAssetsInitialized: true };
    }
    const docRef = getCollection('system').doc('appSettings');
    try {
        const doc = await safeGet(docRef);
        if (doc.exists) {
            const data = doc.data();
            if (data.highValueAssets === undefined) {
                data.highValueAssets = DEFAULT_HIGH_VALUE_ASSETS;
                data.highValueAssetsInitialized = true;
                await docRef.set({ highValueAssets: DEFAULT_HIGH_VALUE_ASSETS, highValueAssetsInitialized: true }, { merge: true });
            }
            safeSetItem('backup_appSettings', JSON.stringify(data));
            return data;
        } else {
            const initial = { highValueAssets: DEFAULT_HIGH_VALUE_ASSETS, highValueAssetsInitialized: true };
            await docRef.set(initial);
            safeSetItem('backup_appSettings', JSON.stringify(initial));
            return initial;
        }
    } catch (err: any) {
        (window as any).firestoreQuotaExceeded = true;
        console.error("getAppSettings error, loading backup:", err);
        const backup = localStorage.getItem('backup_appSettings');
        if (backup) {
            try {
                return JSON.parse(backup);
            } catch (e) {
                return { highValueAssets: DEFAULT_HIGH_VALUE_ASSETS, highValueAssetsInitialized: true };
            }
        }
        return { highValueAssets: DEFAULT_HIGH_VALUE_ASSETS, highValueAssetsInitialized: true };
    }
};

export const saveAppSettings = async (settings: any): Promise<void> => {
    // Save to backup first so local state is updated immediately
    try {
        const existingBackupStr = localStorage.getItem('backup_appSettings');
        let existingBackup = existingBackupStr ? JSON.parse(existingBackupStr) : {};
        const updatedBackup = { ...existingBackup, ...settings, highValueAssetsInitialized: true };
        safeSetItem('backup_appSettings', JSON.stringify(updatedBackup));
    } catch (e) {
        console.error("Error writing backup_appSettings to localStorage:", e);
    }

    if (!firestore) return;
    const docRef = getCollection('system').doc('appSettings');
    await docRef.set({ ...settings, highValueAssetsInitialized: true }, { merge: true });
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
    if (!firestore) {
        const backup = localStorage.getItem('backup_borrowRecords');
        return backup ? JSON.parse(backup) : [];
    }
    try {
        const snapshot = await safeGet(getCollection('borrowRecords').orderBy('createdAt', 'desc'));
        const records = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        })) as BorrowRecord[];
        safeSetItem('backup_borrowRecords', JSON.stringify(records));
        return records;
    } catch (err) {
        (window as any).firestoreQuotaExceeded = true;
        console.error("getBorrowRecords error, loading backup:", err);
        const backup = localStorage.getItem('backup_borrowRecords');
        return backup ? JSON.parse(backup) : [];
    }
};

export const saveBorrowRecord = async (record: BorrowRecord): Promise<void> => {
    // Save to backup first so local state is updated immediately
    try {
        const existingBackupStr = localStorage.getItem('backup_borrowRecords') || '[]';
        let existingBackup = JSON.parse(existingBackupStr) as BorrowRecord[];
        if (record.id) {
            existingBackup = existingBackup.map(r => r.id === record.id ? { ...r, ...record } : r);
        } else {
            const newRecord = { ...record, id: 'local_' + Math.random().toString(36).substring(2, 11), createdAt: record.createdAt || new Date().toISOString() };
            existingBackup.unshift(newRecord);
        }
        safeSetItem('backup_borrowRecords', JSON.stringify(existingBackup));
    } catch (e) {
        console.error("Error writing backup_borrowRecords to localStorage:", e);
    }

    if (!firestore) throw new Error("Database not initialized");
    const collection = getCollection('borrowRecords');
    
    // Clean fields
    const cleaned = Object.fromEntries(Object.entries(record).filter(([_, v]) => v !== undefined));
    
    if (cleaned.id && !String(cleaned.id).startsWith('local_')) {
        await collection.doc(cleaned.id as string).update(cleaned);
    } else {
        await collection.add({
            ...cleaned,
            createdAt: cleaned.createdAt || new Date().toISOString()
        });
    }
};

export const deleteBorrowRecord = async (id: string): Promise<void> => {
    try {
        const existingBackupStr = localStorage.getItem('backup_borrowRecords') || '[]';
        let existingBackup = JSON.parse(existingBackupStr) as BorrowRecord[];
        existingBackup = existingBackup.filter(r => r.id !== id);
        safeSetItem('backup_borrowRecords', JSON.stringify(existingBackup));
    } catch (e) {
        console.error("Error removing borrow record from local backup:", e);
    }

    if (!firestore) throw new Error("Database not initialized");
    await getCollection('borrowRecords').doc(id).delete();
};

