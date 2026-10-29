import React, { useState, useMemo } from 'react';
import type { Equipment, EquipmentSubComponent, TrackingWorkflowStatus } from '../types';
import { 
    batchImportEquipments, INITIAL_EQUIPMENTS, 
    normalizeEquipmentNo, STANDARD_EQUIPMENT_OWNERS, getStandardOwner, sortEquipmentsNaturally 
} from '../services/dataService';
import { 
    UploadIcon, DownloadIcon, CheckCircleIcon, AlertTriangleIcon, 
    SearchIcon, SparklesIcon, CalendarIcon, ChevronDownIcon, ClockIcon 
} from './common/Icons';
import { normalizeMonth, formatMonthName, MONTH_KEYS, MONTH_INFO_MAP, isToleranceString } from '../utils/monthUtils';

declare const XLSX: any;

interface ImportTabProps {
    onTasksUpdated: () => void;
}

export const ImportTab: React.FC<ImportTabProps> = ({ onTasksUpdated }) => {
    const [fileName, setFileName] = useState('');
    const [importedEquipments, setImportedEquipments] = useState<Equipment[]>(INITIAL_EQUIPMENTS);
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
    const [selectedView, setSelectedView] = useState<'optimizedPlan' | 'hierarchyTable' | 'timelineGrid'>('optimizedPlan');
    const [activeMonthFilter, setActiveMonthFilter] = useState<string>('all');

    // Advanced 2-Row Multi-Header Excel Parser with Smart Date Conversion and Merged Cell Forward-Fill
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                // cellDates: true automatically parses Excel date serials to JavaScript Date objects
                const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Read as 2D array of rows (matrix)
                const sheetMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });

                if (!sheetMatrix || sheetMatrix.length === 0) {
                    setStatusMessage({ text: 'ไฟล์ว่างเปล่าหรือไม่พบข้อมูลในชีทแรก', isError: true });
                    return;
                }

                // Locate the starting row of data (find row that contains real equipment code or equipment name)
                let headerRow1Idx = 0;
                let headerRow2Idx = 1;
                let dataStartRowIdx = 2;

                for (let r = 0; r < Math.min(sheetMatrix.length, 15); r++) {
                    const row = sheetMatrix[r];
                    if (!row) continue;
                    const nonEmptyCount = row.filter((c: any) => String(c).trim() !== '').length;
                    // Skip single-cell title banners (e.g. "PCRD Equipment Master Plan")
                    if (nonEmptyCount <= 1) continue;

                    const rowText = row.map((c: any) => String(c).toLowerCase()).join(' ');
                    // Match actual equipment code/name patterns, NOT just a title containing "pdf"
                    const hasEquipPattern = /(pds-\d+|pdf\s*1?-?\s*\d+|\b1-\d{3}\b|ftir|lumos|melt\s*flow|analytical\s*balance|density\s*meter|universal\s*testing)/i.test(rowText);
                    if (hasEquipPattern) {
                        dataStartRowIdx = r;
                        headerRow2Idx = Math.max(0, r - 1);
                        headerRow1Idx = Math.max(0, r - 2);
                        break;
                    }
                }

                // Forward-fill merged groups from Row 1 across columns
                const row1 = sheetMatrix[headerRow1Idx] || [];
                const row2 = sheetMatrix[headerRow2Idx] || [];
                const maxCols = Math.max(row1.length, row2.length, 30);

                let currentSection = '';
                const colSections: string[] = [];
                for (let c = 0; c < maxCols; c++) {
                    const val1 = String(row1[c] || '').toLowerCase().trim();
                    if (val1.includes('pm') || val1.includes('บำรุงรักษา') || val1.includes('preventive')) {
                        currentSection = 'pm';
                    } else if (val1.includes('cal') || val1.includes('สอบเทียบ') || val1.includes('calibration')) {
                        currentSection = 'cal';
                    } else if (val1 && !val1.includes('pm') && !val1.includes('cal')) {
                        currentSection = '';
                    }
                    colSections[c] = currentSection;
                }

                // Column indices - initialized to -1 for auto-detection
                let colEquipNo = -1;
                let colEquipName = -1;
                let colOwner = -1;
                let colPMFreq = -1;
                let colPMLast = -1;
                let colPMNext = -1;
                let colPMBy = -1;
                let colPMItems = -1;
                let colCalFreq = -1;
                let colCalLast = -1;
                let colCalNext = -1;
                let colCalBy = -1;
                let colCalItems = -1;
                let colTolerance = -1;
                let colQuotation = -1;
                let colPR = -1;
                let colSchedule = -1;
                let colCertRecv = -1;
                let colCertHandover = -1;
                let colResult = -1;

                for (let c = 0; c < maxCols; c++) {
                    const sec = colSections[c];
                    const r1 = String(row1[c] || '').toLowerCase().trim();
                    const r2 = String(row2[c] || '').toLowerCase().trim();
                    const combined = `${sec} ${r1} ${r2}`.replace(/[^a-z0-9ก-๙]/g, '');

                    // Equipment No.: MUST NOT be just "ลำดับ" or "No."
                    if (combined.includes('equipmentno') || combined.includes('equipmentnumber') || combined.includes('รหัสเครื่อง') || combined.includes('รหัสอุปกรณ์') || combined.includes('รหัสเครื่องมือ') || combined.includes('equipmentcode') || combined.includes('machineno') || combined.includes('pdfno') || combined.includes('pdsno')) {
                        colEquipNo = c;
                    } else if (combined.includes('equipmentname') || combined.includes('ชื่อเครื่อง') || combined.includes('ชื่ออุปกรณ์') || combined.includes('รายการเครื่องมือ') || combined.includes('machinename') || combined.includes('รายการเครื่อง')) {
                        colEquipName = c;
                    } else if (
                        combined.includes('พนักงานที่ดูแล') || combined.includes('ผู้ดูแล') || 
                        combined.includes('ผู้รับผิดชอบ') || combined.includes('พนักงานผู้รับผิดชอบ') || 
                        combined.includes('เจ้าหน้าที่ดูแล') || combined.includes('owner') || 
                        combined.includes('custodian') || combined.includes('pic') || 
                        combined.includes('analyst') || combined.includes('staff') || 
                        combined.includes('ชื่อผู้รับผิดชอบ') || combined.includes('ชื่อผู้ดูแล') ||
                        combined.includes('ชื่อ-สกุล') || combined.includes('ผู้ปฏิบัติงาน') || 
                        combined.includes('ผู้ทดสอบ') || combined.includes('tester') || 
                        combined.includes('operator') || combined.includes('responsible')
                    ) {
                        colOwner = c;
                    } else if (sec === 'pm' || combined.includes('pm')) {
                        if (combined.includes('freq') || combined.includes('ความถี่') || combined.includes('ครั้งปี')) colPMFreq = c;
                        else if (combined.includes('last') || combined.includes('เดือน') || combined.includes('แผน') || combined.includes('month')) {
                            if (colPMLast === -1) colPMLast = c;
                            else colPMNext = c;
                        } else if (combined.includes('next')) colPMNext = c;
                        else if (combined.includes('ผู้ทำ') || combined.includes('โดย') || combined.includes('by') || combined.includes('ผู้ดำเนินการ')) colPMBy = c;
                        else if (combined.includes('รายการ') || combined.includes('item') || combined.includes('บำรุงรักษา')) colPMItems = c;
                    } else if (sec === 'cal' || combined.includes('cal') || combined.includes('สอบเทียบ')) {
                        if (combined.includes('freq') || combined.includes('ความถี่') || combined.includes('ครั้งปี')) colCalFreq = c;
                        else if (combined.includes('last') || combined.includes('เดือน') || combined.includes('แผน') || combined.includes('month')) {
                            if (colCalLast === -1) colCalLast = c;
                            else colCalNext = c;
                        } else if (combined.includes('next')) colCalNext = c;
                        else if (combined.includes('ผู้ทำ') || combined.includes('โดย') || combined.includes('by') || combined.includes('ผู้ดำเนินการ')) colCalBy = c;
                        else if (combined.includes('เกณฑ์') || combined.includes('tolerance') || combined.includes('ยอมรับ')) colTolerance = c;
                        else if (combined.includes('รายการ') || combined.includes('item') || combined.includes('พารามิเตอร์')) colCalItems = c;
                    } else if (combined.includes('tolerance') || combined.includes('เกณฑ์')) {
                        colTolerance = c;
                    } else if (combined.includes('quotation') || combined.includes('quatation') || combined.includes('ใบเสนอราคา')) {
                        colQuotation = c;
                    } else if (combined.includes('pr') || combined.includes('ใบขอซื้อ')) {
                        colPR = c;
                    } else if (combined.includes('นัดหมาย') || combined.includes('schedule') || combined.includes('วันนัด')) {
                        colSchedule = c;
                    } else if (combined.includes('ใบcert') || (combined.includes('cert') && combined.includes('vender'))) {
                        colCertRecv = c;
                    } else if (combined.includes('ส่งมอบ') || combined.includes('ส่งมอบใบcert')) {
                        colCertHandover = c;
                    } else if (combined.includes('สรุปผล') || combined.includes('ผลการcal') || combined.includes('ผล')) {
                        colResult = c;
                    }
                }

                // Sample data rows to identify columns if not found via header text
                for (let c = 0; c < Math.min(maxCols, 15); c++) {
                    const sampleCells: string[] = [];
                    for (let r = dataStartRowIdx; r < Math.min(sheetMatrix.length, dataStartRowIdx + 8); r++) {
                        if (sheetMatrix[r]) sampleCells.push(String(sheetMatrix[r][c] || '').trim());
                    }
                    const joined = sampleCells.join(' ');

                    if (colEquipNo === -1 && /(pds-\d+|pdf\s*1?-?\s*\d+|\b1-\d{1,3}\b)/i.test(joined)) {
                        colEquipNo = c;
                    }
                    if (colEquipName === -1 && /(ftir|lumos|melt|balance|meter|microscope|oven|furnace|viscometer|calorimeter|เครื่อง|ชุด)/i.test(joined)) {
                        colEquipName = c;
                    }
                    if (colOwner === -1 && /(pornthak|channarong|wiparat|somchai|narongsak|kanyarat|พรทัก|ชาญณรงค์|วิภา|สมชาย|ณรงค์ศักดิ์|กัญญารัตน์)/i.test(joined)) {
                        colOwner = c;
                    }
                }

                // Intelligent fallbacks
                if (colEquipNo === -1) colEquipNo = 0;
                if (colEquipName === -1) colEquipName = colEquipNo === 0 ? 1 : 0;
                if (colOwner === -1) colOwner = (colEquipName !== 2 && colEquipNo !== 2) ? 2 : 3;
                if (colPMFreq === -1) colPMFreq = 3;
                if (colPMLast === -1) colPMLast = 4;
                if (colPMBy === -1) colPMBy = 5;
                if (colCalFreq === -1) colCalFreq = 6;
                if (colCalLast === -1) colCalLast = 7;
                if (colCalBy === -1) colCalBy = 8;
                if (colTolerance === -1) colTolerance = 9;

                // Parse records and maintain Primary/Sub hierarchy
                const parsedList: Equipment[] = [];
                let currentPrimary: Equipment | null = null;

                for (let r = dataStartRowIdx; r < sheetMatrix.length; r++) {
                    const row = sheetMatrix[r];
                    if (!row || row.every((c: any) => String(c).trim() === '')) continue;

                    let rawEquipNo = String(row[colEquipNo] || '').trim();
                    let equipName = String(row[colEquipName] || '').trim();
                    let rawOwner = String(row[colOwner] || '').trim();

                    // Standardize equipment number (normalizes "PDF 1-001" -> "PDS-1001", and rejects junk header text)
                    let equipNo = normalizeEquipmentNo(rawEquipNo);

                    // If equipNo was missing/unmatched, try to deduce from equipment name
                    if (!equipNo && equipName) {
                        const nameLower = equipName.toLowerCase();
                        if (nameLower.includes('ftir') || nameLower.includes('tensor')) equipNo = 'PDS-1001';
                        else if (nameLower.includes('lumos')) equipNo = 'PDS-1002';
                        else if (nameLower.includes('microscope') || nameLower.includes('optical')) equipNo = 'PDS-1003';
                        else if (nameLower.includes('melt') || nameLower.includes('mfi')) equipNo = 'PDS-1004';
                        else if (nameLower.includes('balance') || nameLower.includes('ชั่ง')) equipNo = 'PDS-1005';
                        else if (nameLower.includes('density') || nameLower.includes('หนาแน่น')) equipNo = 'PDS-1006';
                        else if (nameLower.includes('universal') || nameLower.includes('utm')) equipNo = 'PDS-1007';
                        else if (nameLower.includes('oven') || nameLower.includes('ตู้อบ')) equipNo = 'PDS-1008';
                        else if (nameLower.includes('ph') || nameLower.includes('conductivity')) equipNo = 'PDS-1009';
                        else if (nameLower.includes('moisture') || nameLower.includes('ความชื้น')) equipNo = 'PDS-1010';
                        else if (nameLower.includes('viscometer') || nameLower.includes('ความหนืด')) equipNo = 'PDS-1011';
                        else if (nameLower.includes('dsc') || nameLower.includes('calorimeter')) equipNo = 'PDS-1012';
                        else if (nameLower.includes('color') || nameLower.includes('spectro')) equipNo = 'PDS-1013';
                        else if (nameLower.includes('furnace') || nameLower.includes('เตาเผา')) equipNo = 'PDS-1014';
                    }

                    // Skip phantom rows where equipment number is invalid or literally "PDF" or header labels
                    if (!equipNo) {
                        // If it has equipment name and currentPrimary, it might be an indented sub-equipment
                        if (currentPrimary && (equipName || row[colCalItems] || row[colPMItems])) {
                            equipNo = '';
                        } else {
                            continue;
                        }
                    }

                    // Clean owner string and translate Thai names
                    let owner = rawOwner;
                    if (/พรทัก/i.test(owner)) owner = 'PORNTHAK';
                    else if (/ชาญณรงค์/i.test(owner)) owner = 'Channarong';
                    else if (/กัญญารัตน์/i.test(owner)) owner = 'Kanyarat';
                    else if (/วิภา/i.test(owner)) owner = 'Wiparat';
                    else if (/สมชาย/i.test(owner)) owner = 'Somchai';
                    else if (/ณรงค์ศักดิ์/i.test(owner)) owner = 'Narongsak';

                    const ownerUpper = owner.toUpperCase().replace(/\s+/g, '');
                    if (ownerUpper === 'PDF' || ownerUpper === 'EQUIPMENTNO' || owner.includes('พนักงาน') || owner.includes('ผู้รับผิดชอบ') || owner.includes('สถานะ') || owner.includes('Vender') || owner.includes('ลำดับ')) {
                        owner = '';
                    }

                    const pmFreq = String(row[colPMFreq] || '1').trim();
                    const rawPMLast = String(row[colPMLast] || '').trim();
                    const rawPMNext = colPMNext !== -1 ? String(row[colPMNext] || '').trim() : '';
                    let pmLast = normalizeMonth(rawPMLast);
                    if (!pmLast) {
                        pmLast = (rawPMLast === '-' || !rawPMLast || /^\d+(\.\d+)?$/.test(rawPMLast.replace(/,/g, ''))) ? (rawPMLast === '-' ? '-' : 'Nov') : rawPMLast;
                    }
                    const pmNext = normalizeMonth(rawPMNext) || pmLast;
                    const pmBy = String(row[colPMBy] || 'Vender').trim();
                    const pmItems = colPMItems !== -1 ? String(row[colPMItems] || '').trim() : 'ตามรายการ Vender';

                    const calFreq = String(row[colCalFreq] || '1').trim();
                    let rawCalLast = String(row[colCalLast] || '').trim();
                    const rawCalNext = colCalNext !== -1 ? String(row[colCalNext] || '').trim() : '';
                    let tolerance = colTolerance !== -1 ? String(row[colTolerance] || '').trim() : '';

                    // If rawCalLast contains tolerance string (e.g. ± 5 um), move it to tolerance
                    if (isToleranceString(rawCalLast)) {
                        if (!tolerance || tolerance === 'Pass/Fail') tolerance = rawCalLast;
                        rawCalLast = '';
                    }

                    let calLast = normalizeMonth(rawCalLast);
                    if (!calLast) {
                        calLast = (rawCalLast === '-' || !rawCalLast || /^\d+(\.\d+)?$/.test(rawCalLast.replace(/,/g, ''))) ? (rawCalLast === '-' ? '-' : 'Nov') : rawCalLast;
                    }
                    const calNext = normalizeMonth(rawCalNext) || calLast;
                    const calBy = String(row[colCalBy] || 'Vender').trim();
                    const calItems = colCalItems !== -1 ? String(row[colCalItems] || '').trim() : 'ตามรายการ Vender';

                    // Workflow Status
                    const quotationRequested = colQuotation !== -1 ? !!String(row[colQuotation] || '').trim() : false;
                    const prIssued = colPR !== -1 ? !!String(row[colPR] || '').trim() : false;
                    const vendorScheduled = colSchedule !== -1 ? !!String(row[colSchedule] || '').trim() : false;
                    const certReceived = colCertRecv !== -1 ? !!String(row[colCertRecv] || '').trim() : false;
                    const certDelivered = colCertHandover !== -1 ? !!String(row[colCertHandover] || '').trim() : false;
                    const resultRaw = colResult !== -1 ? String(row[colResult] || '').trim().toLowerCase() : '';
                    const result = resultRaw.includes('pass') ? 'Pass' :
                        resultRaw.includes('fail') ? 'Fail' :
                        resultRaw.includes('action') ? 'Action Required' : 'Pending';

                    const trackingStatus: TrackingWorkflowStatus = {
                        quotationRequested,
                        prIssued,
                        vendorScheduled,
                        certReceived,
                        certDelivered,
                        result: result as any
                    };

                    // Check if Sub-Equipment: Has '/' OR has sub-item under currentPrimary
                    const isSub = equipNo.includes('/') || (!equipNo && currentPrimary && (calItems || pmItems || equipName));

                    if (isSub) {
                        const finalSubNo = equipNo || (currentPrimary ? `${currentPrimary.equipmentNo}/0${(currentPrimary.subEquipments?.length || 0) + 1}` : `SUB-${r}`);
                        const subStdOwner = getStandardOwner(finalSubNo, equipName || calItems) || currentPrimary?.owner || 'PORNTHAK';
                        const subOwner = (owner && owner !== 'PORNTHAK') ? owner : (subStdOwner || currentPrimary?.owner || 'PORNTHAK');

                        const sub: EquipmentSubComponent = {
                            id: `sub_${r}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            equipmentNo: finalSubNo,
                            equipmentName: equipName || calItems || 'อุปกรณ์พ่วง/อุปกรณ์เสริม',
                            owner: subOwner,
                            pm: { freqYear: pmFreq, lastPM: pmLast, nextPM: pmNext, pmBy, items: pmItems, tolerance },
                            cal: { freqYear: calFreq, lastCal: calLast, nextCal: calNext, calBy, items: calItems, tolerance },
                            trackingStatus
                        };

                        if (currentPrimary) {
                            currentPrimary.subEquipments = currentPrimary.subEquipments || [];
                            currentPrimary.subEquipments.push(sub);
                        }
                    } else if (equipNo) {
                        // PRIMARY EQUIPMENT
                        const stdOwner = getStandardOwner(equipNo, equipName);
                        const resolvedOwner = (owner && owner !== 'PORNTHAK') ? owner : (stdOwner || owner || 'PORNTHAK');

                        currentPrimary = {
                            id: `eq_${r}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            equipmentNo: equipNo,
                            equipmentName: equipName || equipNo,
                            name: equipName || equipNo,
                            owner: resolvedOwner,
                            status: 'ready',
                            pm: { freqYear: pmFreq, lastPM: pmLast, nextPM: pmNext, pmBy, items: pmItems, tolerance },
                            cal: { freqYear: calFreq, lastCal: calLast, nextCal: calNext, calBy, items: calItems, tolerance },
                            trackingStatus,
                            subEquipments: []
                        };
                        parsedList.push(currentPrimary);
                    }
                }

                if (parsedList.length > 0) {
                    const sorted = sortEquipmentsNaturally(parsedList);
                    setImportedEquipments(sorted);
                    const ownersList = Array.from(new Set(sorted.map(e => e.owner))).join(', ');
                    setStatusMessage({
                        text: `นำเข้าไฟล์ "${file.name}" สำเร็จ! จัดโครงสร้างเป็น ${sorted.length} เครื่องหลัก (รหัส ${sorted[0]?.equipmentNo} ถึง ${sorted[sorted.length - 1]?.equipmentNo}) พร้อมผู้รับผิดชอบตามไฟล์ (${ownersList}) เรียบร้อยแล้ว`
                    });
                } else {
                    setStatusMessage({ text: 'ไม่พบแถวข้อมูลเครื่องมือในไฟล์ กรุณาตรวจสอบว่ามีรหัสเครื่องในคอลัมน์แรก', isError: true });
                }
            } catch (err: any) {
                console.error('Failed to parse Excel', err);
                setStatusMessage({ text: 'เกิดข้อผิดพลาดในการอ่านไฟล์: ' + (err.message || ''), isError: true });
            }
        };
        reader.readAsBinaryString(file);
    };

    // Save imported to database
    const handleCommitImport = async () => {
        if (importedEquipments.length === 0) return;
        setIsSaving(true);
        try {
            await batchImportEquipments(importedEquipments);
            setStatusMessage({ text: `บันทึกข้อมูลเครื่องมือ ${importedEquipments.length} เครื่องหลักลงในระบบเรียบร้อยแล้ว!` });
            onTasksUpdated();
        } catch (err: any) {
            setStatusMessage({ text: 'เกิดข้อผิดพลาดในการบันทึก: ' + err.message, isError: true });
        } finally {
            setIsSaving(false);
        }
    };

    // Export Master to Excel
    const handleExportExcel = () => {
        const rowsToExport: any[] = [];
        importedEquipments.forEach(eq => {
            rowsToExport.push({
                'Equipment no.': eq.equipmentNo,
                'Equipment name': eq.equipmentName,
                'พนักงานที่ดูแล': eq.owner,
                'Freq/year (PM)': eq.pm?.freqYear || '1',
                'Last PM': eq.pm?.lastPM || '',
                'Next PM': eq.pm?.nextPM || '',
                'PM by': eq.pm?.pmBy || 'Vender',
                'Freq/year (Cal)': eq.cal?.freqYear || '1',
                'Last Cal': eq.cal?.lastCal || '',
                'Next Cal': eq.cal?.nextCal || '',
                'Cal by': eq.cal?.calBy || 'Vender',
                'รายการที่ทำ PM': eq.pm?.items || '',
                'รายการที่ทำ Cal': eq.cal?.items || '',
                'Tolerance': eq.pm?.tolerance || eq.cal?.tolerance || '',
                'ขอใบ Quatation': eq.trackingStatus?.quotationRequested ? 'Yes' : 'No',
                'แจ้งออก PR': eq.trackingStatus?.prIssued ? 'Yes' : 'No',
                'นัดหมาย Vender เข้ามา': eq.trackingStatus?.vendorScheduled ? 'Yes' : 'No',
                'ใบ Cert จาก Vender': eq.trackingStatus?.certReceived ? 'Yes' : 'No',
                'ส่งมอบใบ Cert ให้พนักงานที่ดูแล': eq.trackingStatus?.certDelivered ? 'Yes' : 'No',
                'สรุปผลการ Cal': eq.trackingStatus?.result || 'Pending'
            });

            (eq.subEquipments || []).forEach(sub => {
                rowsToExport.push({
                    'Equipment no.': sub.equipmentNo,
                    'Equipment name': sub.equipmentName,
                    'พนักงานที่ดูแล': sub.owner,
                    'Freq/year (PM)': sub.pm?.freqYear || '-',
                    'Last PM': sub.pm?.lastPM || '',
                    'Next PM': sub.pm?.nextPM || '',
                    'PM by': sub.pm?.pmBy || '-',
                    'Freq/year (Cal)': sub.cal?.freqYear || '1',
                    'Last Cal': sub.cal?.lastCal || '',
                    'Next Cal': sub.cal?.nextCal || '',
                    'Cal by': sub.cal?.calBy || 'Vender',
                    'รายการที่ทำ PM': sub.pm?.items || '',
                    'รายการที่ทำ Cal': sub.cal?.items || '',
                    'Tolerance': sub.pm?.tolerance || sub.cal?.tolerance || '',
                    'ขอใบ Quatation': sub.trackingStatus?.quotationRequested ? 'Yes' : 'No',
                    'แจ้งออก PR': sub.trackingStatus?.prIssued ? 'Yes' : 'No',
                    'นัดหมาย Vender เข้ามา': sub.trackingStatus?.vendorScheduled ? 'Yes' : 'No',
                    'ใบ Cert จาก Vender': sub.trackingStatus?.certReceived ? 'Yes' : 'No',
                    'ส่งมอบใบ Cert ให้พนักงานที่ดูแล': sub.trackingStatus?.certDelivered ? 'Yes' : 'No',
                    'สรุปผลการ Cal': sub.trackingStatus?.result || 'Pending'
                });
            });
        });

        const worksheet = XLSX.utils.json_to_sheet(rowsToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'แผนPM_Cal_Master');
        XLSX.writeFile(workbook, 'รายชื่อเครื่องมือ_แผนPM_Cal_จัดระเบียบใหม่.xlsx');
    };

    // Calculate Summary Insights
    const insights = useMemo(() => {
        let totalSubs = 0;
        let vendorItems = 0;
        let ownerItems = 0;
        const byMonth: Record<string, { pmCount: number; calCount: number; machines: string[] }> = {};

        const tally = (eqNo: string, name: string, pm: any, cal: any) => {
            const rawPMMonth = pm?.lastPM || pm?.nextPM;
            const rawCalMonth = cal?.lastCal || cal?.nextCal;
            const pmMonth = normalizeMonth(rawPMMonth);
            const calMonth = normalizeMonth(rawCalMonth);

            if (pm?.pmBy === 'Vender' || cal?.calBy === 'Vender') vendorItems++;
            if (pm?.pmBy === 'Owner' || cal?.calBy === 'Owner') ownerItems++;

            if (pmMonth && pmMonth !== '-') {
                if (!byMonth[pmMonth]) byMonth[pmMonth] = { pmCount: 0, calCount: 0, machines: [] };
                byMonth[pmMonth].pmCount++;
                byMonth[pmMonth].machines.push(`${eqNo} (PM)`);
            }
            if (calMonth && calMonth !== '-') {
                if (!byMonth[calMonth]) byMonth[calMonth] = { pmCount: 0, calCount: 0, machines: [] };
                byMonth[calMonth].calCount++;
                byMonth[calMonth].machines.push(`${eqNo} (Cal)`);
            }
        };

        importedEquipments.forEach(eq => {
            tally(eq.equipmentNo, eq.equipmentName, eq.pm, eq.cal);
            (eq.subEquipments || []).forEach(sub => {
                totalSubs++;
                tally(sub.equipmentNo, sub.equipmentName, sub.pm, sub.cal);
            });
        });

        return {
            totalPrimary: importedEquipments.length,
            totalSubs,
            totalAll: importedEquipments.length + totalSubs,
            vendorItems,
            ownerItems,
            byMonth
        };
    }, [importedEquipments]);

    return (
        <div className="space-y-6 animate-fade-in w-full">
            {/* Header */}
            <div className="bg-white dark:bg-base-900 p-6 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary-600 bg-primary-50 dark:bg-primary-950/40 px-2.5 py-1 rounded-full">
                            Smart Excel Importer & Planner
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                            รองรับหัวตาราง 2 ชั้น และแปลงชื่อเดือน 1-12 ให้อัตโนมัติ
                        </span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                        นำเข้าไฟล์ Excel และจัดปรับแผน PM & Calibration ให้เข้าใจง่าย
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                        อ่านไฟล์ตารางเครื่องมือ แยกเครื่องหลัก/เครื่องพ่วงย่อย จัดตารางรายเดือน และวางแผนงบประมาณ/Vendor ให้อัตโนมัติ
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={handleExportExcel}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-base-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-xs flex items-center gap-2 transition-all"
                    >
                        <DownloadIcon className="h-4 w-4" />
                        <span>ดาวน์โหลดไฟล์จัดระเบียบแล้ว (.xlsx)</span>
                    </button>

                    <button
                        onClick={handleCommitImport}
                        disabled={isSaving || importedEquipments.length === 0}
                        className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold rounded-2xl text-xs shadow-lg shadow-primary-500/25 flex items-center gap-2 transition-all active:scale-95"
                    >
                        <CheckCircleIcon className="h-4 w-4" />
                        <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลเข้าสู่ระบบ'}</span>
                    </button>
                </div>
            </div>

            {/* MONTH RECOGNITION GUIDE & EXPLANATION BANNER */}
            <div className="bg-blue-50/70 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200/80 dark:border-blue-900/40 flex items-start gap-3 text-xs">
                <span className="text-xl">💡</span>
                <div className="space-y-1">
                    <h4 className="font-black text-blue-900 dark:text-blue-200">
                        ระบบแปลงรอบเดือนอัตโนมัติ (Smart Month Translation):
                    </h4>
                    <p className="text-blue-800 dark:text-blue-300 text-[11px] leading-relaxed">
                        ในไฟล์ Excel หากระบุเป็นตัวเลขเดือน (เช่น <strong>4</strong> = เม.ย., <strong>5</strong> = พ.ค., <strong>3</strong> = มี.ค., <strong>2</strong> = ก.พ., <strong>11</strong> = พ.ย.) หรือชื่อย่อภาษาไทย/อังกฤษ ระบบจะแปลงให้อยู่ในรูปแบบสากลที่ชัดเจน เช่น <strong>เมษายน (Apr) - เดือน 4</strong> และเชื่อมโยงเข้ากับปฏิทินรายเดือน 12 เดือนโดยตรง ไม่สับสนกับค่าความถี่
                    </p>
                </div>
            </div>

            {/* Upload Dropzone */}
            <div className="bg-white dark:bg-base-900 rounded-3xl border-2 border-dashed border-primary-300 dark:border-base-700 p-8 text-center space-y-4 hover:border-primary-500 transition-colors">
                <div className="w-16 h-16 mx-auto bg-primary-50 dark:bg-primary-950/50 text-primary-600 rounded-3xl flex items-center justify-center shadow-inner">
                    <UploadIcon className="h-8 w-8" />
                </div>
                
                <div className="space-y-1 max-w-lg mx-auto">
                    <h3 className="font-black text-base text-slate-800 dark:text-white">
                        {fileName ? `ไฟล์ที่เลือก: ${fileName}` : 'เลือกไฟล์ Excel รายชื่อเครื่องมือ แผนPM_Cal'}
                    </h3>
                    <p className="text-xs text-slate-400">
                        ลากไฟล์มาวางที่นี่ หรือคลิกปุ่มเพื่อเลือกไฟล์จากเครื่อง (.xlsx, .xls) ระบบจะตรวจจับหัวตาราง 2 ชั้น และแยกเครื่องหลัก/เครื่องพ่วงให้อัตโนมัติ
                    </p>
                </div>

                <div>
                    <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-primary-500/25 transition-all active:scale-95">
                        <UploadIcon className="h-4 w-4" />
                        <span>เลือกไฟล์จากคอมพิวเตอร์</span>
                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                    </label>
                </div>
            </div>

            {/* Status Feedback */}
            {statusMessage && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-bold ${
                    statusMessage.isError 
                        ? 'bg-rose-50 text-rose-800 border border-rose-200' 
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                    {statusMessage.isError ? <AlertTriangleIcon className="h-5 w-5 shrink-0" /> : <CheckCircleIcon className="h-5 w-5 shrink-0" />}
                    <span>{statusMessage.text}</span>
                </div>
            )}

            {/* INSIGHTS CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-base-900 p-5 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">เครื่องมือหลัก (Primary)</span>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">{insights.totalPrimary} เครื่อง</h3>
                    <span className="text-[10px] text-emerald-600 font-bold">แสดงในหน้ารายการหลัก</span>
                </div>

                <div className="bg-white dark:bg-base-900 p-5 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">เครื่องพ่วงย่อย (Sub-units)</span>
                    <h3 className="text-2xl font-black text-indigo-600">{insights.totalSubs} ชิ้น</h3>
                    <span className="text-[10px] text-slate-400 font-bold">ผูกภายใต้เครื่องหลัก</span>
                </div>

                <div className="bg-white dark:bg-base-900 p-5 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">งานจ้าง Vendor</span>
                    <h3 className="text-2xl font-black text-blue-600">{insights.vendorItems} รายการ</h3>
                    <span className="text-[10px] text-slate-400 font-bold">ต้องเตรียม PR / นัดคิว</span>
                </div>

                <div className="bg-white dark:bg-base-900 p-5 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">งาน Owner ดูแลเอง</span>
                    <h3 className="text-2xl font-black text-amber-600">{insights.ownerItems} รายการ</h3>
                    <span className="text-[10px] text-slate-400 font-bold">ทำความสะอาด / ตรวจสอบภายใน</span>
                </div>
            </div>

            {/* VIEW SELECTOR */}
            <div className="flex border-b border-slate-200 dark:border-base-800 gap-4 text-xs font-black">
                <button
                    onClick={() => setSelectedView('optimizedPlan')}
                    className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
                        selectedView === 'optimizedPlan'
                            ? 'border-primary-600 text-primary-600'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                >
                    <SparklesIcon className="h-4 w-4" />
                    <span>แผนจัดกลุ่มและข้อเสนอแนะ (Smart Plan & Timeline)</span>
                </button>
                <button
                    onClick={() => setSelectedView('hierarchyTable')}
                    className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
                        selectedView === 'hierarchyTable'
                            ? 'border-primary-600 text-primary-600'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                >
                    <span>โครงสร้างเครื่องหลัก + เครื่องพ่วงย่อย ({importedEquipments.length} เครื่อง)</span>
                </button>
            </div>

            {/* VIEW 1: OPTIMIZED PLAN & TIMELINE BREAKDOWN */}
            {selectedView === 'optimizedPlan' && (
                <div className="space-y-6">
                    {/* Suggestions Section */}
                    <div className="bg-gradient-to-r from-indigo-900 to-primary-900 text-white rounded-3xl p-6 shadow-xl space-y-4">
                        <div className="flex items-center gap-2">
                            <SparklesIcon className="h-5 w-5 text-amber-300" />
                            <h3 className="text-base font-black">
                                ข้อเสนอแนะจากผู้เชี่ยวชาญในการจัดปรับแผน (Expert Recommendations)
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="bg-white/10 p-4 rounded-2xl space-y-1.5 backdrop-blur-md">
                                <span className="font-black text-amber-300 block">1. การรวมรอบเครื่องพ่วงย่อย (Batching):</span>
                                <p className="leading-relaxed">
                                    เครื่อง <strong>PDS-1004 (Melt Flow Index)</strong> มีตุ้มน้ำหนักถึง 5 ชิ้น และลูกสูบ 1 ชิ้น ควรกำหนดให้ Vendor เข้ามา Cal พร้อมกันในเดือน <strong>Jan</strong> เพียงรอบเดียว เพื่อประหยัดค่าเดินทางและเปิด PR เพียงใบเดียว
                                </p>
                            </div>

                            <div className="bg-white/10 p-4 rounded-2xl space-y-1.5 backdrop-blur-md">
                                <span className="font-black text-amber-300 block">2. ลด Downtime ของแล็บ:</span>
                                <p className="leading-relaxed">
                                    เครื่อง FTIR Tensor37 และ LUMOS อยู่ในเดือน <strong>Nov</strong> เหมือนกัน ควรจัดทำ PM และ Cal ไปพร้อมกันเพื่อลดเวลาหยุดการทำงานของเครื่องมือ (Downtime)
                                </p>
                            </div>

                            <div className="bg-white/10 p-4 rounded-2xl space-y-1.5 backdrop-blur-md">
                                <span className="font-black text-amber-300 block">3. แผนล่วงหน้าก่อนถึง Due Date:</span>
                                <p className="leading-relaxed">
                                    สำหรับเครื่องที่จะทำในเดือน <strong>Nov</strong> ควรเปิดใบขอ Quotation ตั้งแต่เดือน <strong>Sep-Oct</strong> เพื่อให้ทันออก PR และนัดหมายช่าง
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Schedule breakdown (จัดกลุ่มตามเดือน) */}
                    <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                    🗓️ แผนการดำเนินงานจำแนกตามเดือน (Workload Distribution)
                                </h3>
                                <p className="text-xs text-slate-400 font-medium">
                                    กระจายเครื่องมือตามเดือนที่กำหนด พร้อมระบุชื่อเดือนเต็มและตัวเลขเดือน เพื่อให้จัดซื้อและพนักงานเห็นภาระงานล่วงหน้า
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">กรองเดือน:</span>
                                <select
                                    value={activeMonthFilter}
                                    onChange={e => setActiveMonthFilter(e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold"
                                >
                                    <option value="all">ทุกเดือน (All Months)</option>
                                    {Object.keys(insights.byMonth).map(m => (
                                        <option key={m} value={m}>{formatMonthName(m, 'full')}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                            {(Object.entries(insights.byMonth) as [string, { pmCount: number; calCount: number; machines: string[] }][])
                                .filter(([month]) => activeMonthFilter === 'all' || activeMonthFilter === month)
                                .map(([month, data]) => (
                                    <div key={month} className="p-4 rounded-2xl bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-800 space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-base-800 pb-2">
                                            <span className="text-sm font-black text-primary-600 dark:text-primary-400">
                                                📅 {formatMonthName(month, 'full')}
                                            </span>
                                            <div className="flex gap-1.5 text-[10px] font-bold">
                                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
                                                    PM: {data.pmCount}
                                                </span>
                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">
                                                    Cal: {data.calCount}
                                                </span>
                                            </div>
                                        </div>

                                        <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                                            {data.machines.slice(0, 6).map((mText, idx) => (
                                                <li key={idx} className="flex items-center gap-1.5 truncate">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                                                    <span className="truncate">{mText}</span>
                                                </li>
                                            ))}
                                            {data.machines.length > 6 && (
                                                <li className="text-[10px] text-slate-400 font-bold pl-3">
                                                    + อีก {data.machines.length - 6} รายการ
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW 2: HIERARCHY TABLE (เครื่องหลัก + เครื่องพ่วงย่อย) */}
            {selectedView === 'hierarchyTable' && (
                <div className="bg-white dark:bg-base-900 rounded-3xl border border-base-200 dark:border-base-800 shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 dark:bg-base-950/80 border-b border-base-200 text-xs font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>รายการเครื่องมือหลัก และเครื่องพ่วงย่อยทั้งหมด</span>
                        <span>{importedEquipments.length} เครื่องหลัก</span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-base-800">
                        {importedEquipments.map((eq, idx) => (
                            <div key={`${eq.id || 'eq'}_${idx}`} className="p-4 space-y-3">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <span className="font-black text-xs px-2.5 py-1 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 rounded-lg border border-primary-200/50 font-mono">
                                            {eq.equipmentNo}
                                        </span>
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                                            {eq.equipmentName}
                                        </h4>
                                        <span className="text-xs text-slate-500 font-bold">
                                            👤 {eq.owner}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 text-xs font-bold">
                                        {eq.pm?.lastPM && <span className="text-indigo-600">PM: {formatMonthName(eq.pm.lastPM, 'badge')} ({eq.pm.pmBy || 'Vender'})</span>}
                                        {eq.cal?.lastCal && <span className="text-emerald-600">Cal: {formatMonthName(eq.cal.lastCal, 'badge')} ({eq.cal.calBy || 'Vender'})</span>}
                                    </div>
                                </div>

                                {/* Sub-Equipments list */}
                                {eq.subEquipments && eq.subEquipments.length > 0 && (
                                    <div className="pl-6 border-l-2 border-primary-300 dark:border-base-700 space-y-2">
                                        <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">
                                            เครื่องพ่วงย่อย ({eq.subEquipments.length} ชิ้น):
                                        </span>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {eq.subEquipments.map((sub, sIdx) => (
                                                <div key={sIdx} className="bg-slate-50 dark:bg-base-950/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-base-800 flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-indigo-600 text-[11px]">{sub.equipmentNo}</span>
                                                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{sub.equipmentName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                                                        {sub.cal?.lastCal && <span className="text-emerald-600">{formatMonthName(sub.cal.lastCal, 'badge')}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImportTab;
