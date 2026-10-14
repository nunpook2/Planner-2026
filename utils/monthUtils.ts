/**
 * Month Normalization & Management Utilities
 * Handles all month formats (1-12, Thai names, English names, dates)
 * and provides timeline calculation for PM & Calibration preparation lead-time.
 */

export interface MonthInfo {
    index: number;         // 1..12
    key: string;           // 'Jan', 'Feb', ...
    enShort: string;       // 'Jan'
    enFull: string;        // 'January'
    thShort: string;       // 'ม.ค.'
    thFull: string;        // 'มีนาคม'
    label: string;         // 'เดือน 1: ม.ค. (Jan)'
    fullDisplay: string;   // 'มกราคม (Jan) - เดือน 1'
}

export const MONTH_KEYS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const;

export type MonthKey = typeof MONTH_KEYS[number];

export const MONTH_INFO_MAP: Record<string, MonthInfo> = {
    Jan: { index: 1, key: 'Jan', enShort: 'Jan', enFull: 'January', thShort: 'ม.ค.', thFull: 'มกราคม', label: 'เดือน 1: ม.ค. (Jan)', fullDisplay: 'มกราคม (Jan) - เดือน 1' },
    Feb: { index: 2, key: 'Feb', enShort: 'Feb', enFull: 'February', thShort: 'ก.พ.', thFull: 'กุมภาพันธ์', label: 'เดือน 2: ก.พ. (Feb)', fullDisplay: 'กุมภาพันธ์ (Feb) - เดือน 2' },
    Mar: { index: 3, key: 'Mar', enShort: 'Mar', enFull: 'March', thShort: 'มี.ค.', thFull: 'มีนาคม', label: 'เดือน 3: มี.ค. (Mar)', fullDisplay: 'มีนาคม (Mar) - เดือน 3' },
    Apr: { index: 4, key: 'Apr', enShort: 'Apr', enFull: 'April', thShort: 'เม.ย.', thFull: 'เมษายน', label: 'เดือน 4: เม.ย. (Apr)', fullDisplay: 'เมษายน (Apr) - เดือน 4' },
    May: { index: 5, key: 'May', enShort: 'May', enFull: 'May', thShort: 'พ.ค.', thFull: 'พฤษภาคม', label: 'เดือน 5: พ.ค. (May)', fullDisplay: 'พฤษภาคม (May) - เดือน 5' },
    Jun: { index: 6, key: 'Jun', enShort: 'Jun', enFull: 'June', thShort: 'มิ.ย.', thFull: 'มิถุนายน', label: 'เดือน 6: มิ.ย. (Jun)', fullDisplay: 'มิถุนายน (Jun) - เดือน 6' },
    Jul: { index: 7, key: 'Jul', enShort: 'Jul', enFull: 'July', thShort: 'ก.ค.', thFull: 'กรกฎาคม', label: 'เดือน 7: ก.ค. (Jul)', fullDisplay: 'กรกฎาคม (Jul) - เดือน 7' },
    Aug: { index: 8, key: 'Aug', enShort: 'Aug', enFull: 'August', thShort: 'ส.ค.', thFull: 'สิงหาคม', label: 'เดือน 8: ส.ค. (Aug)', fullDisplay: 'สิงหาคม (Aug) - เดือน 8' },
    Sep: { index: 9, key: 'Sep', enShort: 'Sep', enFull: 'September', thShort: 'ก.ย.', thFull: 'กันยายน', label: 'เดือน 9: ก.ย. (Sep)', fullDisplay: 'กันยายน (Sep) - เดือน 9' },
    Oct: { index: 10, key: 'Oct', enShort: 'Oct', enFull: 'October', thShort: 'ต.ค.', thFull: 'ตุลาคม', label: 'เดือน 10: ต.ค. (Oct)', fullDisplay: 'ตุลาคม (Oct) - เดือน 10' },
    Nov: { index: 11, key: 'Nov', enShort: 'Nov', enFull: 'November', thShort: 'พ.ย.', thFull: 'พฤศจิกายน', label: 'เดือน 11: พ.ย. (Nov)', fullDisplay: 'พฤศจิกายน (Nov) - เดือน 11' },
    Dec: { index: 12, key: 'Dec', enShort: 'Dec', enFull: 'December', thShort: 'ธ.ค.', thFull: 'ธันวาคม', label: 'เดือน 12: ธ.ค. (Dec)', fullDisplay: 'ธันวาคม (Dec) - เดือน 12' },
};

/**
 * Checks if input appears to be a tolerance or measurement unit string rather than a month
 */
export function isToleranceString(val: any): boolean {
    if (!val) return false;
    const s = String(val).trim().toLowerCase();
    return s.includes('±') || s.includes('+/-') || s.includes('um') || s.includes('µm') || s.includes('μm') ||
           s.includes('mm') || s.includes('cm') || s.includes('°c') || s.includes('%') || 
           s.includes('pass') || s.includes('fail') || s.includes('iso') || s.includes('astm') ||
           s.includes('เกณฑ์') || s.includes('tolerance') || s.includes('mg') || s.includes('g/cm') ||
           s.includes('class') || s.includes('delta') || s.includes('δe');
}

/**
 * Normalizes any month input (number, float, Thai text, English text, date string, Excel serial date)
 * into standard key 'Jan'..'Dec'.
 * Returns '' if the input cannot be determined as a valid month.
 */
export function normalizeMonth(input: any): string {
    if (!input && input !== 0) return '';
    const raw = String(input).trim();
    if (!raw || raw === '-' || raw.toLowerCase() === 'n/a' || raw === '—') return '';

    // If it's obviously a tolerance string (e.g. "± 5 um"), do NOT treat it as a month!
    if (isToleranceString(raw)) return '';

    // Direct match with standard month keys
    if (MONTH_INFO_MAP[raw]) return raw;

    // Remove any thousands separators
    const cleanNumStr = raw.replace(/,/g, '');
    const floatVal = parseFloat(cleanNumStr);

    // 1. Check small integer/float month numbers (1..12 or '1.0'..'12.0')
    if (!isNaN(floatVal)) {
        const roundedInt = Math.round(floatVal);
        if (roundedInt >= 1 && roundedInt <= 12 && Math.abs(floatVal - roundedInt) < 0.15) {
            return MONTH_KEYS[roundedInt - 1];
        }

        // 2. Check Excel serial dates (e.g. 1000..90000 covers 1903..2146, 45231 = Nov 2023, 45597 = Nov 2024)
        if (floatVal >= 1000 && floatVal <= 90000) {
            try {
                // Excel counts from 1899-12-30 (25569 days to 1970-01-01)
                const jsDate = new Date(Math.round((floatVal - 25569) * 86400 * 1000));
                if (!isNaN(jsDate.getTime())) {
                    const monthIdx = jsDate.getUTCMonth(); // 0..11
                    return MONTH_KEYS[monthIdx];
                }
            } catch (e) {
                // continue
            }
        }

        // 3. Check Unix timestamp in milliseconds (> 1000000000000)
        if (floatVal > 1000000000000) {
            try {
                const jsDate = new Date(floatVal);
                if (!isNaN(jsDate.getTime())) {
                    return MONTH_KEYS[jsDate.getUTCMonth()];
                }
            } catch (e) {
                // continue
            }
        }
    }

    const lower = raw.toLowerCase();

    // 4. Check Thai month prefix pattern e.g. "เดือน 11", "เดือน1", "ด.11"
    const thaiMonthNumMatch = lower.match(/(?:เดือน|ด\.)\s*(\d{1,2})/);
    if (thaiMonthNumMatch) {
        const m = parseInt(thaiMonthNumMatch[1], 10);
        if (m >= 1 && m <= 12) return MONTH_KEYS[m - 1];
    }

    // 5. Check Thai short or full names
    if (lower.includes('ม.ค') || lower.includes('มกรา')) return 'Jan';
    if (lower.includes('ก.พ') || lower.includes('กุมภา')) return 'Feb';
    if (lower.includes('มี.ค') || lower.includes('มีนา')) return 'Mar';
    if (lower.includes('เม.ย') || lower.includes('เมษา')) return 'Apr';
    if (lower.includes('พ.ค') || lower.includes('พฤษภา')) return 'May';
    if (lower.includes('มิ.ย') || lower.includes('มิถุนา')) return 'Jun';
    if (lower.includes('ก.ค') || lower.includes('กรกฎา')) return 'Jul';
    if (lower.includes('ส.ค') || lower.includes('สิงหา')) return 'Aug';
    if (lower.includes('ก.ย') || lower.includes('กันยา')) return 'Sep';
    if (lower.includes('ต.ค') || lower.includes('ตุลา')) return 'Oct';
    if (lower.includes('พ.ย') || lower.includes('พฤศจิกา')) return 'Nov';
    if (lower.includes('ธ.ค') || lower.includes('ธันวา')) return 'Dec';

    // 6. Check English month names
    if (lower.includes('jan')) return 'Jan';
    if (lower.includes('feb')) return 'Feb';
    if (lower.includes('mar')) return 'Mar';
    if (lower.includes('apr')) return 'Apr';
    if (lower.includes('may')) return 'May';
    if (lower.includes('jun')) return 'Jun';
    if (lower.includes('jul')) return 'Jul';
    if (lower.includes('aug')) return 'Aug';
    if (lower.includes('sep')) return 'Sep';
    if (lower.includes('oct')) return 'Oct';
    if (lower.includes('nov')) return 'Nov';
    if (lower.includes('dec')) return 'Dec';

    // 7. Check dates with delimiters (e.g. 2026-11-15, 15/11/2026, 11/2026, 11/2567, 2026/11)
    const slashParts = cleanNumStr.split(/[/.-]/).map(p => p.trim()).filter(Boolean);
    if (slashParts.length === 2) {
        // e.g. 11/2026 or 2026/11 or 11/2567 or 2567/11
        const p0 = parseInt(slashParts[0], 10);
        const p1 = parseInt(slashParts[1], 10);
        if (p0 >= 1 && p0 <= 12 && (p1 > 1900 || p1 > 2500 || p1 < 100)) return MONTH_KEYS[p0 - 1];
        if (p1 >= 1 && p1 <= 12 && (p0 > 1900 || p0 > 2500 || p0 < 100)) return MONTH_KEYS[p1 - 1];
    } else if (slashParts.length >= 3) {
        const p0 = parseInt(slashParts[0], 10);
        const p1 = parseInt(slashParts[1], 10);
        const p2 = parseInt(slashParts[2], 10);
        // YYYY-MM-DD -> part[1] is month
        if (p0 > 1000 && p1 >= 1 && p1 <= 12) {
            return MONTH_KEYS[p1 - 1];
        }
        // DD/MM/YYYY -> part[1] is month
        if (p2 > 1000 && p1 >= 1 && p1 <= 12) {
            return MONTH_KEYS[p1 - 1];
        }
    }

    // Do NOT return unparsed numbers as month keys!
    return '';
}

/**
 * Returns user-friendly month display label
 */
export function formatMonthName(keyOrRaw: string | number, style: 'short' | 'full' | 'badge' = 'full'): string {
    if (!keyOrRaw && keyOrRaw !== 0) return '-';
    const rawStr = String(keyOrRaw).trim();
    if (!rawStr || rawStr === '-' || rawStr === '—' || rawStr.toLowerCase() === 'n/a') return '-';
    
    // Normalize into standard month key
    const norm = normalizeMonth(rawStr);
    const info = MONTH_INFO_MAP[norm];
    if (!info) {
        // If it's a tolerance or unparsed number, never show raw number
        if (isToleranceString(rawStr) || /^\d+(\.\d+)?$/.test(rawStr.replace(/,/g, ''))) return '-';
        return rawStr;
    }

    switch (style) {
        case 'short':
            return `${info.thShort} (${info.key})`;
        case 'badge':
            return `เดือน ${info.index} (${info.thShort})`;
        case 'full':
        default:
            return `${info.thFull} (${info.key}) - เดือน ${info.index}`;
    }
}

/**
 * Formats maintenance/calibration frequency into clear, professional Thai display
 */
export function formatFrequency(freq: any): string {
    if (!freq && freq !== 0) return '-';
    const raw = String(freq).trim();
    if (!raw || raw === '-' || raw === '—') return '-';

    const num = parseFloat(raw);
    if (!isNaN(num)) {
        if (num === 1) return '1 ครั้ง/ปี';
        if (num === 2) return '2 ครั้ง/ปี (ทุก 6 เดือน)';
        if (num === 3) return '3 ครั้ง/ปี (ทุก 4 เดือน)';
        if (num === 4) return '4 ครั้ง/ปี (ทุกไตรมาส)';
        if (num === 12) return '12 ครั้ง/ปี (ทุกเดือน)';
        if (num === 0.5) return 'ทุก 2 ปี (0.5 ครั้ง/ปี)';
        return `${num} ครั้ง/ปี`;
    }

    // If it's already a descriptive Thai or English text
    if (raw.toLowerCase().includes('year') || raw.toLowerCase().includes('ปี')) {
        return raw;
    }

    return raw;
}

/**
 * Calculates preparation milestones based on target maintenance month (e.g., Nov)
 */
export function getPreparationTimeline(targetMonthKey: string) {
    const norm = normalizeMonth(targetMonthKey);
    const info = MONTH_INFO_MAP[norm];
    if (!info) return null;

    const targetIdx = info.index; // 1..12

    // Helper to get month info by offset
    const getMonthByOffset = (offset: number): MonthInfo => {
        let idx = (targetIdx - 1 + offset) % 12;
        if (idx < 0) idx += 12;
        return MONTH_INFO_MAP[MONTH_KEYS[idx]];
    };

    const quoteMonth = getMonthByOffset(-2); // 2 months prior
    const prMonth = getMonthByOffset(-1);    // 1 month prior
    const scheduleMonth = getMonthByOffset(-1); // 2-3 weeks prior
    const actionMonth = info;

    return {
        target: info,
        steps: [
            {
                step: 1,
                name: 'ขอใบเสนอราคา (Quotation)',
                suggestedMonth: quoteMonth,
                desc: `ควรขอใบเสนอราคาจาก Vendor ในเดือน ${quoteMonth.thShort} (${quoteMonth.key}) ล่วงหน้า 2 เดือน`,
                timeframe: 'ล่วงหน้า 60 วัน'
            },
            {
                step: 2,
                name: 'ออกใบสั่งซื้อ (PR)',
                suggestedMonth: prMonth,
                desc: `ควรแจ้งออก PR ในเดือน ${prMonth.thShort} (${prMonth.key}) เพื่อรออนุมัติงบประมาณ`,
                timeframe: 'ล่วงหน้า 30-45 วัน'
            },
            {
                step: 3,
                name: 'นัดหมาย Vendor เข้าหน้างาน',
                suggestedMonth: scheduleMonth,
                desc: `ควรล็อคคิวและส่งรายชื่อช่างเข้าพื้นที่ล่วงหน้า 1-2 สัปดาห์`,
                timeframe: 'ล่วงหน้า 14 วัน'
            },
            {
                step: 4,
                name: 'เข้าดำเนินการ PM / Cal',
                suggestedMonth: actionMonth,
                desc: `Vendor หรือ ผู้ดูแล เข้าปฏิบัติการในเดือน ${actionMonth.thFull} (${actionMonth.key})`,
                timeframe: 'เดือนที่กำหนด'
            }
        ]
    };
}
