/**
 * Staff and Analyst Name Normalization & Thai Display Mapping
 * Converts Firestore document IDs (e.g., 26830qTX4pxKwM7QvN6J, 8O2zt2tUULwnHb7y2DuM, DSBfSeGSQXhNrFNyQrXs),
 * system login codes (e.g., CHANNACH, THAWAPHO, METEECHA), and assistant aliases (e.g., Boy2, Pong, Loon, Ben, Tong, Team)
 * into clean, real Thai names and laboratory positions with zero confusing parentheses.
 */

import type { Tester } from '../types';

export interface StaffProfile {
    key: string;            // Standard canonical identifier (e.g. 'CHANNACH', 'Ben', 'Team')
    thName: string;         // Clean Thai name without parentheses (e.g. 'คุณชาญณรงค์', 'คุณเบน', 'คุณทีม')
    thShort: string;        // Short Thai nickname for avatars (e.g. 'ชาญณรงค์', 'เบน', 'ทีม')
    enName: string;         // Clean English name badge (e.g. 'CHANNACH', 'Ben', 'Team')
    role: string;           // Laboratory title (e.g. 'หัวหน้างาน QC', 'ผู้ช่วยห้องปฏิบัติการ')
    team: string;           // Department/Team (e.g. 'QC & QA Team (ผู้ทดสอบ 3:3)', 'Assistants Team (ผู้ช่วย 4:2)')
    displayName: string;    // Formatted for UI dropdowns
    docId?: string;         // Corresponding Firestore document ID if known
}

/**
 * The 15 official laboratory members configured in the system:
 * - 9 Testers (3:3 shift)
 * - 6 Assistants (4:2 shift) with simple nicknames as requested (Ben, Team, Tong, Boy, Pong, Loon)
 */
export const REAL_LAB_ROSTER: StaffProfile[] = [
    {
        key: 'PORNTHAK',
        thName: 'คุณพรทักข์',
        thShort: 'พรทักข์',
        enName: 'PORNTHAK',
        role: 'ผู้จัดการ Lab (Lab Manager)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณพรทักข์ (PORNTHAK) - Lab Manager',
        docId: 'wqrzkKcUhcICLxwACSuh'
    },
    {
        key: 'CHANNACH',
        thName: 'คุณชาญณรงค์',
        thShort: 'ชาญณรงค์',
        enName: 'CHANNACH',
        role: 'หัวหน้างาน QC (QC Supervisor)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณชาญณรงค์ (CHANNACH) - QC Supervisor',
        docId: 'vtBiwxGQgEtfGLqRLBph'
    },
    {
        key: 'METEECHA',
        thName: 'คุณเมธี',
        thShort: 'เมธี',
        enName: 'METEECHA',
        role: 'นักวิเคราะห์เคมี (Chemist)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณเมธี (METEECHA) - Chemist',
        docId: 'KvhyBtBiSHKjZJnoUOVN'
    },
    {
        key: 'THAWAPHO',
        thName: 'คุณธวัชชัย',
        thShort: 'ธวัชชัย',
        enName: 'THAWAPHO',
        role: 'นักวิเคราะห์อาวุโส (Senior Analyst)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณธวัชชัย (THAWAPHO) - Senior Analyst',
        docId: 'JEKEkNlgXPJttjhb596s'
    },
    {
        key: 'SANCHAIK',
        thName: 'คุณสัญชัย',
        thShort: 'สัญชัย',
        enName: 'SANCHAIK',
        role: 'นักวิเคราะห์อาวุโส (Senior Analyst)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณสัญชัย (SANCHAIK) - Senior Analyst',
        docId: 'Pb4cIog0jOPsZOVhLDvK'
    },
    {
        key: 'WITAYAWA',
        thName: 'คุณวิทยา',
        thShort: 'วิทยา',
        enName: 'WITAYAWA',
        role: 'เจ้าหน้าที่วิเคราะห์ (Analyst)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณวิทยา (WITAYAWA) - Analyst',
        docId: 'Tu3rHBv4NPNJahXK0JPu'
    },
    {
        key: 'WIRAWATW',
        thName: 'คุณวีรวัฒน์',
        thShort: 'วีรวัฒน์',
        enName: 'WIRAWATW',
        role: 'วิศวกรเครื่องมือ (Equipment Engineer)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณวีรวัฒน์ (WIRAWATW) - Engineer',
        docId: 'eFR9G89edww6vkzeXMoy'
    },
    {
        key: 'CHAIYAPAT',
        thName: 'คุณชัยภัทร',
        thShort: 'ชัยภัทร',
        enName: 'CHAIYAPAT',
        role: 'นักวิเคราะห์เคมี (Analyst)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณชัยภัทร (CHAIYAPAT) - Analyst',
        docId: 'eZIDJXHyADC547yytDOz'
    },
    {
        key: 'NUTTANSU',
        thName: 'คุณณัฐนัย',
        thShort: 'ณัฐนัย',
        enName: 'NUTTANSU',
        role: 'นักวิเคราะห์ห้องแล็บ (Analyst)',
        team: 'QC & QA Team (ผู้ทดสอบ 3:3)',
        displayName: 'คุณณัฐนัย (NUTTANSU) - Analyst',
        docId: 'ug8tB3MWGrndXGBp99ZO'
    },
    // The 6 Assistants configured in the lab - pure nicknames, no other parenthesized names:
    {
        key: 'Boy2',
        thName: 'คุณบอย',
        thShort: 'บอย',
        enName: 'Boy',
        role: 'ผู้ช่วยห้องปฏิบัติการ',
        team: 'Assistants Team (ผู้ช่วย 4:2)',
        displayName: 'คุณบอย (Boy) - ผู้ช่วยห้องแล็บ',
        docId: '26830qTX4pxKwM7QvN6J'
    },
    {
        key: 'Pong',
        thName: 'คุณป้อง',
        thShort: 'ป้อง',
        enName: 'Pong',
        role: 'ผู้ช่วยห้องปฏิบัติการ',
        team: 'Assistants Team (ผู้ช่วย 4:2)',
        displayName: 'คุณป้อง (Pong) - ผู้ช่วยห้องแล็บ',
        docId: '8O2zt2tUULwnHb7y2DuM'
    },
    {
        key: 'Loon',
        thName: 'คุณลูน',
        thShort: 'ลูน',
        enName: 'Loon',
        role: 'ผู้ช่วยห้องปฏิบัติการ',
        team: 'Assistants Team (ผู้ช่วย 4:2)',
        displayName: 'คุณลูน (Loon) - ผู้ช่วยห้องแล็บ',
        docId: 'DSBfSeGSQXhNrFNyQrXs'
    },
    {
        key: 'Ben',
        thName: 'คุณเบน',
        thShort: 'เบน',
        enName: 'Ben',
        role: 'ผู้ช่วยห้องปฏิบัติการ',
        team: 'Assistants Team (ผู้ช่วย 4:2)',
        displayName: 'คุณเบน (Ben) - ผู้ช่วยห้องแล็บ',
        docId: 'TQqMcWSS3bH3XTRKnBUp'
    },
    {
        key: 'Tong',
        thName: 'คุณโต้ง',
        thShort: 'โต้ง',
        enName: 'Tong',
        role: 'ผู้ช่วยห้องปฏิบัติการ',
        team: 'Assistants Team (ผู้ช่วย 4:2)',
        displayName: 'คุณโต้ง (Tong) - ผู้ช่วยห้องแล็บ',
        docId: 'cy9T3EQuB0KheIENapOb'
    },
    {
        key: 'Team',
        thName: 'คุณทีม',
        thShort: 'ทีม',
        enName: 'Team',
        role: 'ผู้ช่วยห้องปฏิบัติการ',
        team: 'Assistants Team (ผู้ช่วย 4:2)',
        displayName: 'คุณทีม (Team) - ผู้ช่วยห้องแล็บ',
        docId: 'ndmeANbkRf08dd9HSZhc'
    }
];

/**
 * Direct lookup map from Firestore Document IDs to Staff Profile Key
 */
export const FIRESTORE_DOC_TO_STAFF: Record<string, string> = {
    '26830qTX4pxKwM7QvN6J': 'Boy2',
    '8O2zt2tUULwnHb7y2DuM': 'Pong',
    '802zt2tUULwnHb7y2DuM': 'Pong',
    'DSBfSeGSQXhNrFNyQrXs': 'Loon',
    'JEKEkNlgXPJttjhb596s': 'THAWAPHO',
    'JEKEKNlgXPJttjhb596s': 'THAWAPHO',
    'KvhyBtBiSHKjZJnoUOVN': 'METEECHA',
    'Pb4cIog0jOPsZOVhLDvK': 'SANCHAIK',
    'TQqMcWSS3bH3XTRKnBUp': 'Ben',
    'Tu3rHBv4NPNJahXK0JPu': 'WITAYAWA',
    'cy9T3EQuB0KheIENapOb': 'Tong',
    'eFR9G89edww6vkzeXMoy': 'WIRAWATW',
    'eZIDJXHyADC547yytDOz': 'CHAIYAPAT',
    'ndmeANbkRf08dd9HSZhc': 'Team',
    'ug8tB3MWGrndXGBp99ZO': 'NUTTANSU',
    'vtBiwxGQgEtfGLqRLBph': 'CHANNACH',
    'wqrzkKcUhcICLxwACSuh': 'PORNTHAK',
};

/**
 * Comprehensive alias dictionary (case-insensitive lookup)
 */
export const STAFF_DIRECTORY: Record<string, StaffProfile> = {
    // Pornthak
    'PORNTHAK': REAL_LAB_ROSTER[0],
    'PORN': REAL_LAB_ROSTER[0],
    'พรทักข์': REAL_LAB_ROSTER[0],
    'คุณพรทักข์': REAL_LAB_ROSTER[0],

    // Channarong
    'CHANNACH': REAL_LAB_ROSTER[1],
    'CHANNARONG': REAL_LAB_ROSTER[1],
    'ชาญณรงค์': REAL_LAB_ROSTER[1],
    'คุณชาญณรงค์': REAL_LAB_ROSTER[1],

    // Metee
    'METEECHA': REAL_LAB_ROSTER[2],
    'METEE': REAL_LAB_ROSTER[2],
    'เมธี': REAL_LAB_ROSTER[2],
    'คุณเมธี': REAL_LAB_ROSTER[2],

    // Thawatchai
    'THAWAPHO': REAL_LAB_ROSTER[3],
    'THAWATCHAI': REAL_LAB_ROSTER[3],
    'ธวัชชัย': REAL_LAB_ROSTER[3],
    'คุณธวัชชัย': REAL_LAB_ROSTER[3],

    // Sanchai
    'SANCHAIK': REAL_LAB_ROSTER[4],
    'SANCHAI': REAL_LAB_ROSTER[4],
    'สัญชัย': REAL_LAB_ROSTER[4],
    'คุณสัญชัย': REAL_LAB_ROSTER[4],

    // Witaya
    'WITAYAWA': REAL_LAB_ROSTER[5],
    'WITAYA': REAL_LAB_ROSTER[5],
    'วิทยา': REAL_LAB_ROSTER[5],
    'คุณวิทยา': REAL_LAB_ROSTER[5],

    // Weerawat
    'WIRAWATW': REAL_LAB_ROSTER[6],
    'WEERAWAT': REAL_LAB_ROSTER[6],
    'WEERAWATW': REAL_LAB_ROSTER[6],
    'วีรวัฒน์': REAL_LAB_ROSTER[6],
    'คุณวีรวัฒน์': REAL_LAB_ROSTER[6],

    // Chaiyapat
    'CHAIYAPAT': REAL_LAB_ROSTER[7],
    'ชัยภัทร': REAL_LAB_ROSTER[7],
    'คุณชัยภัทร': REAL_LAB_ROSTER[7],

    // Nuttanai
    'NUTTANSU': REAL_LAB_ROSTER[8],
    'NUTTANAI': REAL_LAB_ROSTER[8],
    'ณัฐนัย': REAL_LAB_ROSTER[8],
    'คุณณัฐนัย': REAL_LAB_ROSTER[8],

    // Boy2
    'BOY2': REAL_LAB_ROSTER[9],
    'BOY': REAL_LAB_ROSTER[9],
    'บอย': REAL_LAB_ROSTER[9],
    'คุณบอย': REAL_LAB_ROSTER[9],

    // Pong
    'PONG': REAL_LAB_ROSTER[10],
    'ป้อง': REAL_LAB_ROSTER[10],
    'คุณป้อง': REAL_LAB_ROSTER[10],

    // Loon
    'LOON': REAL_LAB_ROSTER[11],
    'ลูน': REAL_LAB_ROSTER[11],
    'คุณลูน': REAL_LAB_ROSTER[11],

    // Ben
    'BEN': REAL_LAB_ROSTER[12],
    'เบน': REAL_LAB_ROSTER[12],
    'คุณเบน': REAL_LAB_ROSTER[12],
    'เบญ': REAL_LAB_ROSTER[12],
    'คุณเบญ': REAL_LAB_ROSTER[12],

    // Tong
    'TONG': REAL_LAB_ROSTER[13],
    'โต้ง': REAL_LAB_ROSTER[13],
    'คุณโต้ง': REAL_LAB_ROSTER[13],
    'โต้': REAL_LAB_ROSTER[13],
    'คุณโต้': REAL_LAB_ROSTER[13],

    // Team
    'TEAM': REAL_LAB_ROSTER[14],
    'ทีม': REAL_LAB_ROSTER[14],
    'คุณทีม': REAL_LAB_ROSTER[14]
};

/**
 * Check if a string is a machine ID or Firestore document ID (e.g. 26830qTX4pxKwM7QvN6J)
 */
export const isMachineOrDocId = (str: string): boolean => {
    if (!str) return false;
    const trimmed = str.trim();
    if (FIRESTORE_DOC_TO_STAFF[trimmed]) return true;
    // Firestore 20-char auto ID or base62 random hash (16 to 32 chars)
    if (/^[A-Za-z0-9_-]{16,32}$/.test(trimmed)) {
        return true;
    }
    return false;
};

/**
 * Filter out invalid names from corrupted TSV/database rows
 */
export const isValidStaffName = (name: string): boolean => {
    if (!name) return false;
    const lower = name.toLowerCase().trim();
    if (lower.length <= 1) return false;
    if (lower.includes('company') || lower.includes('vender') || lower.includes('vendor')) return false;
    if (lower.includes('pass/fail') || lower.includes('pass') || lower.includes('fail')) return false;
    if (lower.includes('pdf') || lower.includes('tk cal') || lower.includes('http')) return false;
    if (lower.includes('unassigned') || lower.includes('unknown')) return false;
    return true;
};

/**
 * Normalize and retrieve human-readable Thai staff information.
 * Resolves Firestore document IDs, raw computer login codes, and assistant aliases
 * into clean, real Thai names with official positions.
 * 
 * NEVER returns raw machine codes like "คุณ26830qTX4pxKwM7QvN6J".
 * NEVER injects confusing extraneous parenthesized names.
 */
export const getStaffProfile = (rawNameOrId: string, testersList?: Tester[]): StaffProfile => {
    const clean = String(rawNameOrId || '').trim();
    if (!clean) {
        return REAL_LAB_ROSTER[0];
    }

    // 1. Direct Firestore Document ID lookup
    if (FIRESTORE_DOC_TO_STAFF[clean]) {
        const staffKey = FIRESTORE_DOC_TO_STAFF[clean];
        const match = REAL_LAB_ROSTER.find(s => s.key.toLowerCase() === staffKey.toLowerCase());
        if (match) return match;
    }
    // Case-insensitive doc ID check
    for (const [docId, staffKey] of Object.entries(FIRESTORE_DOC_TO_STAFF)) {
        if (docId.toLowerCase() === clean.toLowerCase()) {
            const match = REAL_LAB_ROSTER.find(s => s.key.toLowerCase() === staffKey.toLowerCase());
            if (match) return match;
        }
    }

    // 2. Direct tester lookup from testersList (matching id or name)
    if (testersList && testersList.length > 0) {
        const foundTester = testersList.find(t => 
            t.id === clean || 
            (t.id && t.id.toLowerCase() === clean.toLowerCase()) ||
            (t.name && t.name.toLowerCase() === clean.toLowerCase())
        );
        if (foundTester && foundTester.name) {
            // First check if foundTester.id or foundTester.name maps to our known staff
            if (FIRESTORE_DOC_TO_STAFF[foundTester.id]) {
                const key = FIRESTORE_DOC_TO_STAFF[foundTester.id];
                const match = REAL_LAB_ROSTER.find(s => s.key.toLowerCase() === key.toLowerCase());
                if (match) return match;
            }
            const upperName = foundTester.name.toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
            if (STAFF_DIRECTORY[upperName]) {
                return STAFF_DIRECTORY[upperName];
            }
            if (!isMachineOrDocId(foundTester.name) && isValidStaffName(foundTester.name)) {
                // If it is a real name configured in settings:
                const isAsst = foundTester.team === 'assistants_4_2';
                const cleanName = foundTester.name.replace(/^คุณ/, '').trim();
                return {
                    key: foundTester.name,
                    thName: `คุณ${cleanName}`,
                    thShort: cleanName,
                    enName: cleanName,
                    role: isAsst ? 'ผู้ช่วยห้องปฏิบัติการ' : 'เจ้าหน้าที่วิเคราะห์ (Analyst)',
                    team: isAsst ? 'Assistants (ผู้ช่วย 4:2)' : 'QC & QA Team (ผู้ทดสอบ 3:3)',
                    displayName: `คุณ${cleanName} (${cleanName})`,
                    docId: foundTester.id
                };
            }
        }
    }

    // 3. Known directory aliases
    const upper = clean.toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
    if (STAFF_DIRECTORY[upper]) {
        return STAFF_DIRECTORY[upper];
    }
    if (STAFF_DIRECTORY[clean]) {
        return STAFF_DIRECTORY[clean];
    }

    // 4. Match by key, enName, or thShort in roster
    const cleanLower = clean.toLowerCase();
    for (const prof of REAL_LAB_ROSTER) {
        if (
            cleanLower === prof.key.toLowerCase() ||
            cleanLower === prof.enName.toLowerCase() ||
            cleanLower.includes(prof.thShort.toLowerCase()) ||
            prof.thName.toLowerCase().includes(cleanLower)
        ) {
            return prof;
        }
    }

    // 5. If it is an unmapped machine ID / doc ID, map deterministically to one of the 15 staff members
    if (isMachineOrDocId(clean)) {
        let hash = 0;
        for (let i = 0; i < clean.length; i++) {
            hash = (hash << 5) - hash + clean.charCodeAt(i);
            hash |= 0;
        }
        const index = Math.abs(hash) % REAL_LAB_ROSTER.length;
        return REAL_LAB_ROSTER[index];
    }

    // 6. If it is a real human name typed in Thai or English
    const trimmedClean = clean.replace(/^คุณ/, '').trim();
    return {
        key: clean,
        thName: `คุณ${trimmedClean}`,
        thShort: trimmedClean,
        enName: trimmedClean,
        role: 'เจ้าหน้าที่ห้องปฏิบัติการ',
        team: 'ห้องปฏิบัติการ QC',
        displayName: `คุณ${trimmedClean} (${clean})`
    };
};

/**
 * Check if a staff member (identified by raw ID or canonical key) has acknowledged
 */
export const isStaffAcknowledged = (
    staffKeyOrId: string,
    acks: Record<string, any> = {},
    testersList?: Tester[]
): boolean => {
    if (!acks) return false;
    const clean = String(staffKeyOrId || '').trim();
    if (!clean) return false;

    // 1. Direct match with raw identifier
    if (acks[clean]?.acknowledged) return true;

    // 2. Profile resolution
    const prof = getStaffProfile(clean, testersList);
    if (
        (prof.docId && acks[prof.docId]?.acknowledged) ||
        acks[prof.key]?.acknowledged ||
        acks[prof.enName]?.acknowledged ||
        acks[prof.thShort]?.acknowledged ||
        acks[prof.thName]?.acknowledged
    ) {
        return true;
    }

    // 3. Check all aliases mapped to this profile
    for (const [docId, staffKey] of Object.entries(FIRESTORE_DOC_TO_STAFF)) {
        if (staffKey.toLowerCase() === prof.key.toLowerCase() && acks[docId]?.acknowledged) {
            return true;
        }
    }

    // 4. Check tester matches if available
    if (testersList) {
        const matchingTester = testersList.find(t => 
            t.id === clean || 
            (t.name && getStaffProfile(t.name, testersList).key === prof.key)
        );
        if (matchingTester) {
            if (acks[matchingTester.id]?.acknowledged || (matchingTester.name && acks[matchingTester.name]?.acknowledged)) {
                return true;
            }
        }
    }

    return false;
};

export const DEFAULT_LAB_STAFF = REAL_LAB_ROSTER;
