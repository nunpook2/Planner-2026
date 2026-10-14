
import { firestore } from './firebase';
import type { Tester, CategorizedTask, AssignedTask, DailySchedule, RawTask, AssignedPrepareTask, TestMapping, ShiftReport, Equipment, DistillationLog, Booking, ProficiencyTest, ProficiencyRecord, SupportRequest, Walkthrough, BorrowRecord } from '../types';
import { TaskCategory } from '../types';
import { normalizeMonth, isToleranceString } from '../utils/monthUtils';

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

export const INITIAL_EQUIPMENTS: Equipment[] = [
    {
        id: 'eq-pdf-1-001',
        equipmentNo: 'PDF 1-001',
        equipmentName: 'Analytical Balance (เครื่องชั่งละเอียด 4 ตำแหน่ง)',
        name: 'Analytical Balance (เครื่องชั่งละเอียด 4 ตำแหน่ง)',
        code: 'PDF 1-001',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Balance Room (ห้องชั่งน้ำหนัก)',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Nov',
            nextPM: 'Nov',
            pmBy: 'Vender',
            items: '1. ทำความสะอาด Chamber และจานชั่ง 2. ตรวจสอบระดับน้ำฟองอากาศ 3. ตรวจสอบระบบไฟฟ้าและ Linear response',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Nov',
            nextCal: 'Nov',
            calBy: 'Vender (มว.)',
            items: 'สอบเทียบมวลมาตรฐาน Class E2 (ช่วงการชั่ง 1g ถึง 200g)',
            tolerance: '± 0.1 mg'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-09-25',
            prIssued: true,
            prNo: 'PR-69-10088',
            vendorScheduled: true,
            scheduledDate: '2026-11-05',
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-002',
        equipmentNo: 'PDF 1-002',
        equipmentName: 'Density Meter (เครื่องวัดความหนาแน่นอัตโนมัติ)',
        name: 'Density Meter (เครื่องวัดความหนาแน่นอัตโนมัติ)',
        code: 'PDF 1-002',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Physical Lab Room 1',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Mar',
            nextPM: 'Mar',
            pmBy: 'Vender',
            items: '1. เปลี่ยนซีลชุดท่อสูบสาร 2. ล้าง U-Tube Sensor 3. ตรวจสอบระบบ Peltier ควบคุมอุณหภูมิ',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Mar',
            nextCal: 'Mar',
            calBy: 'Vender',
            items: 'สอบเทียบความหนาแน่นด้วยสารมาตรฐาน Ultra-pure Water และ Dry Air ที่ 20°C',
            tolerance: '± 0.0001 g/cm³'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-02-10',
            prIssued: true,
            prNo: 'PR-69-02119',
            vendorScheduled: true,
            scheduledDate: '2026-03-14',
            certReceived: true,
            certReceivedDate: '2026-03-20',
            certDelivered: true,
            certDeliveredDate: '2026-03-22',
            result: 'Pass',
            resultNote: 'ความหนาแน่นผ่านเกณฑ์มาตรฐาน ± 0.0001 g/cm³'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-003',
        equipmentNo: 'PDF 1-003',
        equipmentName: 'Universal Testing Machine (เครื่องทดสอบแรงดึง UTM)',
        name: 'Universal Testing Machine (เครื่องทดสอบแรงดึง UTM)',
        code: 'PDF 1-003',
        owner: 'Channarong',
        department: 'PCRD Lab',
        location: 'Mechanical Testing Hall',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Jun',
            nextPM: 'Jun',
            pmBy: 'Vender',
            items: '1. หล่อลื่น Ball Screw แกนขับเคลื่อน 2. ตรวจสอบ Safety Limit Switch 3. ตรวจเช็คสายพานมอเตอร์',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Jun',
            nextCal: 'Jun',
            calBy: 'Vender',
            items: 'สอบเทียบ Load Cell 50 kN ตาม ISO 7500-1 และความเร็ว Crosshead Speed',
            tolerance: '± 0.5% (Class 0.5)'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-05-12',
            prIssued: true,
            prNo: 'PR-69-05244',
            vendorScheduled: true,
            scheduledDate: '2026-06-18',
            certReceived: true,
            certReceivedDate: '2026-06-25',
            certDelivered: true,
            certDeliveredDate: '2026-06-28',
            result: 'Pass',
            resultNote: 'Load Cell Calibrated Pass (Class 0.5)'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-004',
        equipmentNo: 'PDF 1-004',
        equipmentName: 'Precision Hot Air Oven (ตู้อบความร้อนควบคุมอุณหภูมิ)',
        name: 'Precision Hot Air Oven (ตู้อบความร้อนควบคุมอุณหภูมิ)',
        code: 'PDF 1-004',
        owner: 'Channarong',
        department: 'PCRD Lab',
        location: 'Thermal Analysis Room',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Feb',
            nextPM: 'Feb',
            pmBy: 'Owner',
            items: '1. ทำความสะอาดพัดลมกระจายลมร้อน 2. ตรวจเช็คขอบยางซีลประตู 3. ทดสอบระบบตัดไฟเตือน Over-temperature',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Feb',
            nextCal: 'Feb',
            calBy: 'Vender',
            items: 'สอบเทียบการกระจายอุณหภูมิ 9 จุด (9-Point Thermal Uniformity ที่ 105°C และ 150°C)',
            tolerance: '± 2.0 °C'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-01-10',
            prIssued: true,
            prNo: 'PR-69-01140',
            vendorScheduled: true,
            scheduledDate: '2026-02-12',
            certReceived: true,
            certReceivedDate: '2026-02-18',
            certDelivered: true,
            certDeliveredDate: '2026-02-20',
            result: 'Pass',
            resultNote: 'การกระจายอุณหภูมิผ่านเกณฑ์ ± 2.0 °C'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-005',
        equipmentNo: 'PDF 1-005',
        equipmentName: 'pH / Conductivity Meter (เครื่องวัดค่ากรดด่างและการนำไฟฟ้า)',
        name: 'pH / Conductivity Meter (เครื่องวัดค่ากรดด่างและการนำไฟฟ้า)',
        code: 'PDF 1-005',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Chemical Prep Room',
        status: 'ready',
        pm: {
            freqYear: 2,
            lastPM: 'Apr',
            nextPM: 'Oct',
            pmBy: 'Owner',
            items: '1. ตรวจสอบระดับ Electrolyte 2. ทำความสะอาด Junction 3. ตรวจสอบสายนำสัญญาณ BNC',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Apr',
            nextCal: 'Apr',
            calBy: 'Vender',
            items: 'สอบเทียบสารละลายบัฟเฟอร์มาตรฐาน pH 4.01, 7.00, 10.01 และ Conductivity Standard 1413 µS/cm',
            tolerance: 'pH ± 0.02 / Cond ± 1%'
        },
        trackingStatus: {
            quotationRequested: false,
            prIssued: false,
            vendorScheduled: false,
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-006',
        equipmentNo: 'PDF 1-006',
        equipmentName: 'Moisture Analyzer (เครื่องวิเคราะห์ความชื้นอัตโนมัติ)',
        name: 'Moisture Analyzer (เครื่องวิเคราะห์ความชื้นอัตโนมัติ)',
        code: 'PDF 1-006',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Physical Lab Room 1',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'May',
            nextPM: 'May',
            pmBy: 'Vender',
            items: '1. ทำความสะอาดชุดทำความร้อน Halogen Lamp 2. ตรวจเช็ค Temperature sensor 3. ตรวจสอบแผงควบคุมระบบสัมผัส',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'May',
            nextCal: 'May',
            calBy: 'Vender',
            items: 'สอบเทียบระบบชั่งน้ำหนัก (Weight Calibration) และระบบควบคุมอุณหภูมิที่ 100°C, 160°C',
            tolerance: '± 0.05% / ± 1.5°C'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-04-05',
            prIssued: true,
            prNo: 'PR-69-04188',
            vendorScheduled: true,
            scheduledDate: '2026-05-15',
            certReceived: true,
            certReceivedDate: '2026-05-22',
            certDelivered: true,
            certDeliveredDate: '2026-05-25',
            result: 'Pass',
            resultNote: 'ผลการสอบเทียบผ่านเกณฑ์มาตรฐาน'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-007',
        equipmentNo: 'PDF 1-007',
        equipmentName: 'Brookfield Viscometer (เครื่องวัดความหนืดของไหล)',
        name: 'Brookfield Viscometer (เครื่องวัดความหนืดของไหล)',
        code: 'PDF 1-007',
        owner: 'Channarong',
        department: 'PCRD Lab',
        location: 'Rheology Lab',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Jul',
            nextPM: 'Jul',
            pmBy: 'Vender',
            items: '1. ตรวจสอบความเที่ยงตรงของแกนหมุน Spindle 2. หล่อลื่น Bearing 3. ตรวจสอบ Auto-zero calibration',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Jul',
            nextCal: 'Jul',
            calBy: 'Vender',
            items: 'สอบเทียบด้วยน้ำมันมาตรฐานความหนืด Certified Viscosity Standard Fluids (100 cP, 1000 cP)',
            tolerance: '± 1.0% Full Scale'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-06-02',
            prIssued: true,
            prNo: 'PR-69-06312',
            vendorScheduled: true,
            scheduledDate: '2026-07-10',
            certReceived: true,
            certReceivedDate: '2026-07-18',
            certDelivered: true,
            certDeliveredDate: '2026-07-20',
            result: 'Pass',
            resultNote: 'ความหนืดผ่านเกณฑ์มาตรฐาน ± 1.0% FS'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-008',
        equipmentNo: 'PDF 1-008',
        equipmentName: 'DSC - Differential Scanning Calorimeter (เครื่องวิเคราะห์สมบัติทางความร้อน)',
        name: 'DSC - Differential Scanning Calorimeter',
        code: 'PDF 1-008',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Thermal Analysis Suite',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Aug',
            nextPM: 'Aug',
            pmBy: 'Vender',
            items: '1. ทำความสะอาด Furnace Chamber 2. ตรวจสอบก๊าซหล่อเย็น N2 Purge flow 3. ตรวจสอบสัญญาณ Thermocouple Baseline',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Aug',
            nextCal: 'Aug',
            calBy: 'Vender',
            items: 'สอบเทียบ Temperature & Heat of Fusion ด้วย Indium และ Zinc Reference Standards',
            tolerance: 'Temp ± 0.5 °C / Enthalpy ± 1.0%'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-07-05',
            prIssued: true,
            prNo: 'PR-69-07421',
            vendorScheduled: true,
            scheduledDate: '2026-08-14',
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-009',
        equipmentNo: 'PDF 1-009',
        equipmentName: 'Color Spectrophotometer (เครื่องวัดสีและเฉดสีตัวอย่าง)',
        name: 'Color Spectrophotometer',
        code: 'PDF 1-009',
        owner: 'Channarong',
        department: 'PCRD Lab',
        location: 'Optical Inspection Lab',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Sep',
            nextPM: 'Sep',
            pmBy: 'Owner',
            items: '1. ทำความสะอาด Integrating Sphere 2. ตรวจเช็ค White Tile มาตรฐาน 3. ตรวจสอบความเข้มแสง Xenon Flash Lamp',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Sep',
            nextCal: 'Sep',
            calBy: 'Vender',
            items: 'สอบเทียบค่าสีมาตรฐาน CIE L*a*b* และการทำซ้ำ (Repeatability) ด้วยแผ่นมาตรฐานมาตรฐาน',
            tolerance: 'ΔE*ab ≤ 0.2'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-08-10',
            prIssued: true,
            prNo: 'PR-69-08190',
            vendorScheduled: false,
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: []
    },
    {
        id: 'eq-pdf-1-010',
        equipmentNo: 'PDF 1-010',
        equipmentName: 'Muffle Furnace 1100°C (เตาเผาอุณหภูมิสูงความแม่นยำสูง)',
        name: 'Muffle Furnace 1100°C',
        code: 'PDF 1-010',
        owner: 'Channarong',
        department: 'PCRD Lab',
        location: 'Furnace Room',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Oct',
            nextPM: 'Oct',
            pmBy: 'Owner',
            items: '1. ตรวจสอบขดลวดความร้อน Heating Elements 2. ตรวจเช็คฉนวนกันความร้อน Ceramic Fiber 3. ตรวจสอบระบบเตือน Overheat',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Oct',
            nextCal: 'Oct',
            calBy: 'Vender',
            items: 'สอบเทียบความสม่ำเสมอของอุณหภูมิ (Temperature Uniformity) ที่ 500°C, 900°C',
            tolerance: '± 5.0 °C'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-09-01',
            prIssued: true,
            prNo: 'PR-69-09022',
            vendorScheduled: false,
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: []
    },
    {
        id: 'eq-pds-1001',
        equipmentNo: 'PDS-1001',
        equipmentName: 'FTIR Tensor37 (เครื่องฟูเรียร์ทรานส์ฟอร์มอินฟราเรดสเปกโตรมิเตอร์)',
        name: 'FTIR Tensor37',
        code: 'PDS-1001',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Spectroscopy Room A',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Nov',
            nextPM: 'Nov',
            pmBy: 'Vender',
            items: '1. ตรวจสอบ Laser Alignment 2. เปลี่ยน Desiccant Indicator 3. ตรวจสอบ Beam Splitter',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Nov',
            nextCal: 'Nov',
            calBy: 'Vender',
            items: 'Wavenumber Accuracy & Repeatability ด้วย Polystyrene Film Standard',
            tolerance: '± 1.0 cm⁻¹'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-10-01',
            prIssued: true,
            prNo: 'PR-69-10042',
            vendorScheduled: true,
            scheduledDate: '2026-11-12',
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: [
            {
                id: 'sub-pds-1001-02',
                equipmentNo: 'PDS-1001/02',
                equipmentName: 'Specae-Heater (BC2)',
                owner: 'PORNTHAK',
                pm: {
                    freqYear: 1,
                    lastPM: 'Jan',
                    nextPM: 'Jan',
                    pmBy: 'Vender',
                    items: '1. check สภาพเครื่อง ไม่แตกชำรุด 2. check สภาพสายไฟไม่ขาดชำรุด',
                    tolerance: 'Pass/Fail'
                },
                cal: {
                    freqYear: 1,
                    lastCal: 'Jan',
                    nextCal: 'Jan',
                    calBy: 'Vender',
                    items: 'Temp 3 จุด (100°C, 150°C, 200°C)',
                    tolerance: '± 5°C'
                },
                trackingStatus: {
                    quotationRequested: true,
                    quotationDate: '2026-09-20',
                    prIssued: true,
                    prNo: 'PR-69-09881',
                    vendorScheduled: false,
                    certReceived: false,
                    certDelivered: false,
                    result: 'Pending'
                }
            }
        ]
    },
    {
        id: 'eq-pds-1002',
        equipmentNo: 'PDS-1002',
        equipmentName: 'LUMOS (FTIR Microscope กล้องจุลทรรศน์อินฟราเรด)',
        name: 'LUMOS',
        code: 'PDS-1002',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Spectroscopy Room B',
        pm: {
            freqYear: 1,
            lastPM: 'Nov',
            nextPM: 'Nov',
            pmBy: 'Vender',
            items: '1. ตรวจสอบ Laser Alignment 2. ตรวจสอบ Infrared Detector 3. ทำความสะอาด Stage & Optical Path',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Nov',
            nextCal: 'Nov',
            calBy: 'Vender',
            items: 'Wavenumber Accuracy & Repeatability Calibration ด้วย Polystyrene Standard',
            tolerance: '± 1.0 cm⁻¹'
        },
        trackingStatus: {
            quotationRequested: false,
            prIssued: false,
            vendorScheduled: false,
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        status: 'issue',
        breakdownStatus: {
            isBroken: true,
            currentIncident: {
                id: 'inc-pds-1002-1',
                equipmentId: 'eq-pds-1002',
                equipmentNo: 'PDS-1002',
                equipmentName: 'LUMOS',
                reportedDate: '2026-10-09',
                reportedBy: 'PORNTHAK',
                symptom: 'ระบบเลเซอร์วัดตำแหน่งแกน Z Error ทำให้ไม่สามารถ Focus ได้',
                rootCause: 'Optical sensor alignment เสื่อมสภาพจากการใช้งานต่อเนื่อง',
                impactLevel: 'Critical',
                stage: 'pr_repair',
                vendorOrTechnician: 'Bruker Service Engineer',
                quotationNo: 'QT-2026-8891',
                repairPrNo: 'PR-69-10902',
                costEstimate: 45000,
                targetResolutionDate: '2026-10-25',
                resolutionNote: 'รออนุมัติ PR เพื่อเบิกอะไหล่ Sensor จากต่างประเทศ',
                actionLogs: [
                    { id: 'log-1', date: '2026-10-09', action: 'รับแจ้งอาการเสีย: เลเซอร์แกน Z error ไม่สามารถ Focus ชิ้นงานได้', actor: 'PORNTHAK', stage: 'reported' },
                    { id: 'log-2', date: '2026-10-10', action: 'วิศวกร Bruker ตรวจสอบหน้างาน พบ Optical sensor เสื่อมสภาพ ต้องสั่งอะไหล่ชุดใหม่', actor: 'Bruker Engineer', stage: 'investigating' },
                    { id: 'log-3', date: '2026-10-11', action: 'ขอและได้รับใบเสนอราคา QT-2026-8891 (45,000 บาท)', actor: 'PORNTHAK', stage: 'quotation_repair' },
                    { id: 'log-4', date: '2026-10-12', action: 'เปิดใบขอซื้อ PR-69-10902 ส่งฝ่ายจัดซื้อและผู้บริหารอนุมัติ', actor: 'PORNTHAK', stage: 'pr_repair' }
                ]
            },
            history: []
        },
        subEquipments: []
    },
    {
        id: 'eq-pds-1003',
        equipmentNo: 'PDS-1003',
        equipmentName: 'Optical Microscope (กล้องจุลทรรศน์แบบใช้แสง)',
        name: 'Optical Microscope',
        code: 'PDS-1003',
        owner: 'PORNTHAK',
        department: 'PCRD Lab',
        location: 'Microscopy Suite',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Apr',
            nextPM: 'Apr',
            pmBy: 'Vender',
            items: '1. ทำความสะอาดเลนส์และกระจกสะท้อน 2. หล่อลื่นแกนปรับโฟกัส Fine/Coarse 3. ตรวจสอบระบบหลอดไฟส่องสว่าง',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: 1,
            lastCal: 'Apr',
            nextCal: 'Apr',
            calBy: 'Vender',
            items: 'สอบเทียบความถูกต้องของสเกลวัดขนาด (Stage Micrometer Calibration)',
            tolerance: '± 5 µm'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-03-10',
            prIssued: true,
            prNo: 'PR-69-03412',
            vendorScheduled: true,
            scheduledDate: '2026-04-18',
            certReceived: true,
            certReceivedDate: '2026-04-25',
            certDelivered: true,
            certDeliveredDate: '2026-04-28',
            result: 'Pass',
            resultNote: 'ผลสอบเทียบผ่านเกณฑ์มาตรฐาน ± 5 µm'
        },
        subEquipments: []
    },
    {
        id: 'eq-pds-1004',
        equipmentNo: 'PDS-1004',
        equipmentName: 'Melt Flow Index',
        name: 'Melt Flow Index',
        code: 'PDS-1004',
        owner: 'Channarong',
        department: 'PCRD Lab',
        location: 'Polymer Testing Lab',
        status: 'ready',
        pm: {
            freqYear: 1,
            lastPM: 'Jan',
            nextPM: 'Jan',
            pmBy: 'Owner',
            items: '1.ตรวจสอบสภาพสายไฟ 2.เช็ด ดูดฝุ่น ทำความสะอาดภายในและภายนอกเครื่อง 3.ตรวจสอบสายลมเข้าเครื่อง 4.ตรวจสภาพผิวใน Barrel , Piston',
            tolerance: 'Pass/Fail'
        },
        cal: {
            freqYear: '-',
            lastCal: '-',
            nextCal: '-',
            calBy: '-',
            items: '-',
            tolerance: '-'
        },
        trackingStatus: {
            quotationRequested: true,
            quotationDate: '2026-09-15',
            prIssued: true,
            prNo: 'PR-69-09311',
            vendorScheduled: false,
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: [
            {
                id: 'sub-pds-1004-01',
                equipmentNo: 'PDS-1004/01',
                equipmentName: 'Weight 400 g',
                owner: 'Channarong',
                cal: { freqYear: 1, lastCal: 'Jan', nextCal: 'Jan', calBy: 'Vender', items: 'Weight', tolerance: '±0.5%' },
                trackingStatus: { quotationRequested: true, prIssued: true, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' }
            },
            {
                id: 'sub-pds-1004-02',
                equipmentNo: 'PDS-1004/02',
                equipmentName: 'Weight 2060 g',
                owner: 'Channarong',
                cal: { freqYear: 1, lastCal: 'Jan', nextCal: 'Jan', calBy: 'Vender', items: 'Weight', tolerance: '±0.5%' },
                trackingStatus: { quotationRequested: true, prIssued: true, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' }
            },
            {
                id: 'sub-pds-1004-03',
                equipmentNo: 'PDS-1004/03',
                equipmentName: 'Weight 4900 g',
                owner: 'Channarong',
                cal: { freqYear: 1, lastCal: 'Jan', nextCal: 'Jan', calBy: 'Vender', items: 'Weight', tolerance: '±0.5%' },
                trackingStatus: { quotationRequested: true, prIssued: true, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' }
            },
            {
                id: 'sub-pds-1004-04',
                equipmentNo: 'PDS-1004/04',
                equipmentName: 'Weight 5000 g',
                owner: 'Channarong',
                cal: { freqYear: 1, lastCal: 'Jan', nextCal: 'Jan', calBy: 'Vender', items: 'Weight', tolerance: '±0.5%' },
                trackingStatus: { quotationRequested: true, prIssued: true, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' }
            },
            {
                id: 'sub-pds-1004-05',
                equipmentNo: 'PDS-1004/05',
                equipmentName: 'Weight 21500 g',
                owner: 'Channarong',
                cal: { freqYear: 1, lastCal: 'Jan', nextCal: 'Jan', calBy: 'Vender', items: 'Weight', tolerance: '±0.5%' },
                trackingStatus: { quotationRequested: true, prIssued: true, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' }
            },
            {
                id: 'sub-pds-1004-06',
                equipmentNo: 'PDS-1004/06',
                equipmentName: 'Piston',
                owner: 'Channarong',
                cal: {
                    freqYear: 1,
                    lastCal: 'Jan',
                    nextCal: 'Jan',
                    calBy: 'Vender',
                    items: 'เส้นผ่านศูนย์กลางหัวลูกสูบ (Head Diameter) & ความยาวของหัวลูกสูบ (Head Length)',
                    tolerance: '9.474 mm ±0.007 mm / 6.35 mm ±0.10 mm (ISO 1133)'
                },
                trackingStatus: { quotationRequested: true, prIssued: true, vendorScheduled: false, certReceived: false, certDelivered: false, result: 'Pending' }
            }
        ]
    }
];

const sanitizePmDetails = (pm: any, raw?: any) => {
    let rawLastPM = pm?.lastPM || raw?.pmMonth || '';
    let tolerance = pm?.tolerance || raw?.pmTolerance || 'Pass/Fail';
    if (isToleranceString(rawLastPM)) {
        if (!tolerance || tolerance === 'Pass/Fail') tolerance = String(rawLastPM);
        rawLastPM = '';
    }
    let lastPM = normalizeMonth(rawLastPM);
    let nextPM = normalizeMonth(pm?.nextPM || rawLastPM) || lastPM;
    
    // Check if explicitly no PM
    const isNoPM = String(rawLastPM).trim() === '-' || String(pm?.freqYear).trim() === '-' || pm?.freqYear === 0;

    return {
        freqYear: isNoPM ? '-' : (pm?.freqYear ?? raw?.pmFreq ?? 1),
        lastPM: isNoPM ? '-' : (lastPM || 'Nov'),
        nextPM: isNoPM ? '-' : (nextPM || lastPM || 'Nov'),
        pmBy: pm?.pmBy || raw?.pmBy || 'Vender',
        items: pm?.items || raw?.pmItems || 'ตามรายการ Vender',
        tolerance: tolerance || 'Pass/Fail'
    };
};

const sanitizeCalDetails = (cal: any, raw?: any) => {
    let rawLastCal = cal?.lastCal || raw?.calMonth || '';
    let tolerance = cal?.tolerance || raw?.tolerance || '';

    // If lastCal contains tolerance (e.g. ± 5 um), heal and move it into tolerance
    if (isToleranceString(rawLastCal)) {
        if (!tolerance || tolerance === 'Pass/Fail' || tolerance === '-') {
            tolerance = String(rawLastCal);
        }
        rawLastCal = '';
    }

    let lastCal = normalizeMonth(rawLastCal);
    let nextCal = normalizeMonth(cal?.nextCal || rawLastCal) || lastCal;

    // Check if explicitly no Cal
    const isNoCal = String(rawLastCal).trim() === '-' || String(cal?.freqYear).trim() === '-' || cal?.freqYear === 0;

    return {
        freqYear: isNoCal ? '-' : (cal?.freqYear ?? raw?.calFreq ?? 1),
        lastCal: isNoCal ? '-' : (lastCal || 'Nov'),
        nextCal: isNoCal ? '-' : (nextCal || lastCal || 'Nov'),
        calBy: cal?.calBy || raw?.calBy || 'Vender',
        items: cal?.items || raw?.calItems || 'ตามรายการ Vender',
        tolerance: tolerance || 'Pass/Fail'
    };
};

const normalizeEquipment = (raw: any): Equipment => {
    return {
        ...raw,
        id: raw.id || 'eq_' + Math.random().toString(36).substr(2, 9),
        equipmentNo: String(raw.equipmentNo || raw.code || raw.name || 'EQ-UNKNOWN'),
        equipmentName: String(raw.equipmentName || raw.name || 'Unnamed Equipment'),
        name: String(raw.equipmentName || raw.name || 'Unnamed Equipment'),
        owner: String(raw.owner || raw.custodian || raw.custodianName || 'PORNTHAK'),
        department: raw.department || 'PCRD Lab',
        location: raw.location || '',
        status: raw.status || 'ready',
        pm: sanitizePmDetails(raw.pm, raw),
        cal: sanitizeCalDetails(raw.cal, raw),
        trackingStatus: raw.trackingStatus || {
            quotationRequested: false,
            prIssued: false,
            vendorScheduled: false,
            certReceived: false,
            certDelivered: false,
            result: 'Pending'
        },
        subEquipments: (raw.subEquipments || []).map((s: any) => ({
            ...s,
            id: s.id || 'sub_' + Math.random().toString(36).substr(2, 9),
            equipmentNo: String(s.equipmentNo || s.code || 'SUB-EQ'),
            equipmentName: String(s.equipmentName || s.name || 'Sub-Equipment'),
            owner: String(s.owner || raw.owner || 'PORNTHAK'),
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
        }))
    };
};

// --- Equipment Management ---
export const getEquipments = async (): Promise<Equipment[]> => {
    let rawList: any[] = [];
    if (!firestore) {
        const backup = localStorage.getItem('backup_equipments');
        if (backup) {
            try {
                const parsed = JSON.parse(backup);
                if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
            } catch (e) {}
        }
        if (rawList.length === 0) rawList = INITIAL_EQUIPMENTS;
    } else {
        try {
            const snapshot = await safeGet(getCollection('equipments'));
            const list = snapshot.docs.map((doc: any) => {
                const data = doc.data();
                return {
                    ...data,
                    id: doc.id || data.id
                };
            });
            if (list.length > 0) {
                rawList = list;
            } else {
                const backup = localStorage.getItem('backup_equipments');
                if (backup) {
                    try {
                        const parsed = JSON.parse(backup);
                        if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
                    } catch (e) {}
                }
                if (rawList.length === 0) rawList = INITIAL_EQUIPMENTS;
            }
        } catch (err) {
            (window as any).firestoreQuotaExceeded = true;
            console.error("getEquipments error, loading backup:", err);
            const backup = localStorage.getItem('backup_equipments');
            if (backup) {
                try {
                    const parsed = JSON.parse(backup);
                    if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
                } catch (e) {}
            }
            if (rawList.length === 0) rawList = INITIAL_EQUIPMENTS;
        }
    }

    // Merge any missing standard master equipments (e.g. PDF 1-001 series) into list
    const existingEqNos = new Set(rawList.map(e => String(e.equipmentNo || e.code || '').trim()));
    INITIAL_EQUIPMENTS.forEach(initEq => {
        if (!existingEqNos.has(initEq.equipmentNo)) {
            rawList.push(initEq);
            existingEqNos.add(initEq.equipmentNo);
        }
    });

    // Normalize and strictly DEDUPLICATE by ID and Equipment Number
    const normalized = rawList.map(normalizeEquipment);
    const seenIds = new Set<string>();
    const seenEqNos = new Map<string, Equipment>();
    const uniqueList: Equipment[] = [];

    for (let i = 0; i < normalized.length; i++) {
        const eq = { ...normalized[i] };
        const eqNo = String(eq.equipmentNo || '').trim();

        // If duplicate primary equipment number, merge subEquipments
        if (eqNo && !eqNo.includes('/') && seenEqNos.has(eqNo)) {
            const existing = seenEqNos.get(eqNo)!;
            if (eq.subEquipments && eq.subEquipments.length > 0) {
                const existingSubNos = new Set((existing.subEquipments || []).map(s => s.equipmentNo));
                const newSubs = eq.subEquipments.filter(s => !existingSubNos.has(s.equipmentNo));
                existing.subEquipments = [...(existing.subEquipments || []), ...newSubs];
            }
            continue;
        }

        // Guarantee strictly unique ID
        if (!eq.id || seenIds.has(eq.id)) {
            eq.id = `eq_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        }
        seenIds.add(eq.id);

        if (eqNo && !eqNo.includes('/')) {
            seenEqNos.set(eqNo, eq);
        }

        // Guarantee sub-equipments have unique IDs
        if (eq.subEquipments) {
            const seenSubIds = new Set<string>();
            eq.subEquipments = eq.subEquipments.map((sub, sIdx) => {
                let subId = sub.id;
                if (!subId || seenSubIds.has(subId)) {
                    subId = `sub_${sIdx}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                }
                seenSubIds.add(subId);
                return { ...sub, id: subId };
            });
        }

        uniqueList.push(eq);
    }

    // Sort naturally (e.g. PDF 1-001 ... PDF 1-005, PDS-1001 ... PDS-1004)
    uniqueList.sort((a, b) => {
        const noA = String(a.equipmentNo || '').trim();
        const noB = String(b.equipmentNo || '').trim();
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
    });

    safeSetItem('backup_equipments', JSON.stringify(uniqueList));
    return uniqueList;
};

export const saveEquipment = async (equipment: Omit<Equipment, 'id'> & { id?: string }): Promise<void> => {
    try {
        const backupStr = localStorage.getItem('backup_equipments') || '[]';
        let list = JSON.parse(backupStr) as Equipment[];
        if (equipment.id) {
            list = list.map(e => e.id === equipment.id ? { ...e, ...equipment } : e);
        } else {
            list.push({ ...equipment, id: 'eq_local_' + Math.random().toString(36).substr(2, 9) } as Equipment);
        }
        safeSetItem('backup_equipments', JSON.stringify(list));
    } catch (e) {
        console.error("Error backing up equipment:", e);
    }

    const { id, ...data } = equipment;
    const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
    if (id && !String(id).startsWith('eq_local_')) {
        await getCollection('equipments').doc(id).set(cleanData);
    } else {
        await getCollection('equipments').add(cleanData);
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

