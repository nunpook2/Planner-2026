import React, { useState, useMemo } from 'react';
import type { Equipment, EquipmentSubComponent } from '../types';
import { SparklesIcon, CheckCircleIcon, AlertTriangleIcon, SearchIcon, ClockIcon, DocumentTextIcon, RefreshIcon } from './common/Icons';
import { normalizeMonth, formatMonthName } from '../utils/monthUtils';

interface AiAssistantTabProps {
    equipments: Equipment[];
    onEquipmentUpdated: () => void;
}

export const AiAssistantTab: React.FC<AiAssistantTabProps> = ({ equipments }) => {
    const [userQuery, setUserQuery] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<'health' | 'chat' | 'vendorDraft'>('health');
    const [vendorDraftEquipment, setVendorDraftEquipment] = useState<string>(equipments[0]?.id || '');
    const [vendorDraftResult, setVendorDraftResult] = useState<string>('');

    // Pre-calculate live statistics
    const stats = useMemo(() => {
        let totalPrimary = equipments.length;
        let totalSubs = 0;
        let pendingQuotation = 0;
        let pendingPR = 0;
        let pendingSchedule = 0;
        let pendingCert = 0;
        let completedPass = 0;

        const monthsSummary: Record<string, { pm: number; cal: number; machines: string[] }> = {};

        const checkItem = (eqNo: string, name: string, owner: string, pm: any, cal: any, status: any) => {
            if (!status?.quotationRequested) pendingQuotation++;
            else if (!status?.prIssued) pendingPR++;
            else if (!status?.vendorScheduled) pendingSchedule++;
            else if (!status?.certReceived) pendingCert++;
            else if (status?.result === 'Pass') completedPass++;

            const rawPMMonth = pm?.lastPM || pm?.nextPM;
            const pmMonth = normalizeMonth(rawPMMonth);
            if (pmMonth && pmMonth !== '-') {
                if (!monthsSummary[pmMonth]) monthsSummary[pmMonth] = { pm: 0, cal: 0, machines: [] };
                monthsSummary[pmMonth].pm++;
                monthsSummary[pmMonth].machines.push(`${eqNo} (${name})`);
            }

            const rawCalMonth = cal?.lastCal || cal?.nextCal;
            const calMonth = normalizeMonth(rawCalMonth);
            if (calMonth && calMonth !== '-') {
                if (!monthsSummary[calMonth]) monthsSummary[calMonth] = { pm: 0, cal: 0, machines: [] };
                monthsSummary[calMonth].cal++;
                if (!monthsSummary[calMonth].machines.includes(`${eqNo} (${name})`)) {
                    monthsSummary[calMonth].machines.push(`${eqNo} (${name})`);
                }
            }
        };

        equipments.forEach(eq => {
            checkItem(String(eq.equipmentNo || eq.code || eq.name || ''), String(eq.equipmentName || eq.name || ''), String(eq.owner || 'PORNTHAK'), eq.pm, eq.cal, eq.trackingStatus);
            (eq.subEquipments || []).forEach(sub => {
                totalSubs++;
                checkItem(String(sub.equipmentNo || ''), String(sub.equipmentName || ''), String(sub.owner || eq.owner || 'PORNTHAK'), sub.pm, sub.cal, sub.trackingStatus);
            });
        });

        return {
            totalPrimary,
            totalSubs,
            totalAll: totalPrimary + totalSubs,
            pendingQuotation,
            pendingPR,
            pendingSchedule,
            pendingCert,
            completedPass,
            monthsSummary
        };
    }, [equipments]);

    // Run Full Health Check / Plan Analysis
    const runPlanAnalysis = () => {
        setIsAnalyzing(true);
        setTimeout(() => {
            const bottlenecks: string[] = [];
            if (stats.pendingPR > 0) {
                bottlenecks.push(`⚠️ มีรายการที่ขอ Quotation แล้วแต่ยังติดค้างที่การ **ออกใบ PR (${stats.pendingPR} รายการ)** ควรเร่งประสานแผนกจัดซื้อ`);
            }
            if (stats.pendingSchedule > 0) {
                bottlenecks.push(`📅 มีรายการที่ออก PR แล้วแต่ยัง **ไม่ได้นัดหมาย Vendor (${stats.pendingSchedule} รายการ)** ควรนัดวันเข้าหน้างาน`);
            }
            if (stats.pendingCert > 0) {
                bottlenecks.push(`📑 มีรายการที่นัดหมาย Vendor แล้วแต่ **ยังไม่ได้รับใบเซอร์ Cert (${stats.pendingCert} รายการ)**`);
            }

            const monthBreakdown = (Object.entries(stats.monthsSummary) as [string, { pm: number; cal: number; machines: string[] }][])
                .map(([month, data]) => `• **${formatMonthName(month, 'badge')}:** มีงาน PM ${data.pm} เครื่อง, Cal ${data.cal} เครื่อง (เครื่องมือ: ${data.machines.slice(0, 3).join(', ')}${data.machines.length > 3 ? '...' : ''})`)
                .join('\n');

            const report = `### 📋 รายงานสรุปและวิเคราะห์สุขภาพแผน PM & Calibration โดย AI
**ภาพรวมเครื่องมือในระบบ:**
- เครื่องมือหลัก: **${stats.totalPrimary} เครื่อง**
- เครื่องพ่วงย่อย (Sub-equipments): **${stats.totalSubs} ชิ้น**
- รวมทั้งหมด: **${stats.totalAll} รายการ**

---

### 🚨 จุดติดขัดและสถานะที่ต้องติดตามเร่งด่วน (Bottlenecks):
${bottlenecks.length > 0 ? bottlenecks.join('\n') : '✅ ทุกขั้นตอนดำเนินงานราบรื่น ไม่มีคอขวดสะสม'}

---

### 🗓️ การกระจายแผนงานตามเดือน:
${monthBreakdown || '• ยังไม่มีการระบุเดือนในระบบ'}

---

### 💡 คำแนะนำสำหรับการดำเนินงาน:
1. **งานของ Vendor:** ควรเริ่มขอใบเสนอราคา (Quotation) ล่วงหน้าอย่างน้อย 30 วันก่อนถึงรอบเดือนที่กำหนด
2. **เครื่องพ่วงย่อย:** เช่น Melt Flow Index (${equipments.find(e => e.equipmentNo === 'PDS-1004')?.equipmentName || 'PDS-1004'}) มีชุดตุ้มน้ำหนักและลูกสูบหลายชิ้น ควรทำการ Cal พร้อมกันในรอบเดียวเพื่อประหยัดค่าเดินทาง Vendor
3. **ส่งมอบใบ Cert:** เมื่อได้รับใบ Cert จาก Vendor แล้ว ให้ส่งมอบให้พนักงานผู้ดูแลตรวจสอบ Tolerance ทันที`;

            setAnalysisResult(report);
            setIsAnalyzing(false);
        }, 600);
    };

    // Generate Vendor Coordination Draft
    const handleGenerateVendorDraft = (equipId: string) => {
        const target = equipments.find(e => e.id === equipId);
        if (!target) return;

        const subList = (target.subEquipments || []).map(s => `- ${s.equipmentNo}: ${s.equipmentName} (${s.cal?.items || s.pm?.items || 'Cal/PM'})`).join('\n');

        const draft = `เรียน ทีมงานฝ่ายบริการ / Vendor ที่เคารพ,

เรื่อง: ขอใบเสนอราคาและกำหนดการเข้าดำเนินการ PM & Calibration สำหรับเครื่องมือประจำปี

ห้องปฏิบัติการมีความประสงค์ขอรับใบเสนอราคา (Quotation) สำหรับการบำรุงรักษาเชิงป้องกัน (PM) และสอบเทียบ (Calibration) เครื่องมือประจำปี ดังนี้:

เครื่องหลัก:
• Equipment Number: ${target.equipmentNo}
• ชื่อเครื่องมือ: ${target.equipmentName}
• รายการที่ประสงค์ดำเนินการ:
  - PM: ${target.pm?.items || 'ตามมาตรฐานผู้ผลิต'} (กำหนด: ${target.pm?.lastPM || '-'})
  - Cal: ${target.cal?.items || 'ตามมาตรฐานผู้ผลิต'} (เกณฑ์ Tolerance: ${target.cal?.tolerance || '-'})
${subList ? `\nเครื่องพ่วงย่อยและอุปกรณ์เสริม:\n${subList}` : ''}

ผู้รับผิดชอบดูแลเครื่อง: คุณ ${target.owner}

ขอความกรุณาส่งใบเสนอราคาและแจ้งเอกสารรับรองความสามารถห้องปฏิบัติการ (ISO/IEC 17025) กลับมาทางอีเมลนี้
หากต้องการข้อมูลเพิ่มเติม สามารถติดต่อสอบถามได้ทันทีครับ

ขอแสดงความนับถือ,
ห้องปฏิบัติการ PCRD`;

        setVendorDraftResult(draft);
    };

    // Chat / Q&A handler
    const handleSendQuery = (queryText: string) => {
        if (!queryText.trim()) return;
        setIsAnalyzing(true);
        setTimeout(() => {
            const q = queryText.toLowerCase();
            let reply = '';

            if (q.includes('jan') || q.includes('มกราคม') || q.includes('เดือน 1')) {
                const janEquips = equipments.filter(e => 
                    (e.pm?.lastPM || '').toLowerCase().includes('jan') || 
                    (e.cal?.lastCal || '').toLowerCase().includes('jan') ||
                    (e.subEquipments || []).some(s => (s.pm?.lastPM || s.cal?.lastCal || '').toLowerCase().includes('jan'))
                );
                reply = `📅 **เครื่องมือที่มีกำหนดในเดือน January (Jan):**\n` + 
                    janEquips.map(e => `• **${e.equipmentNo} (${e.equipmentName})** - ผู้ดูแล: ${e.owner} (สถานะ: ${e.trackingStatus?.result || 'อยู่ระหว่างดำเนินงาน'})`).join('\n') +
                    `\n\n💡 หมายเหตุ: มีเครื่องพ่วงย่อย เช่น ชุดตุ้มน้ำหนัก PDS-1004/01 ถึง 06 และ Specae-Heater PDS-1001/02 รวมอยู่ด้วย`;
            } else if (q.includes('channarong') || q.includes('ชาญณรงค์')) {
                const items = equipments.filter(e => (e.owner || '').toLowerCase().includes('channarong'));
                reply = `👤 **เครื่องมือที่ดูแลโดยคุณ Channarong:**\n` +
                    items.map(e => `• **${e.equipmentNo} - ${e.equipmentName}** (มีเครื่องพ่วง ${e.subEquipments?.length || 0} ชิ้น เช่น ตุ้มน้ำหนัก 400g - 21500g และลูกสูบ Piston)\n  สถานะ: ออก PR แล้ว รอนัดหมาย Vendor`).join('\n');
            } else if (q.includes('pornthak') || q.includes('พรทัก')) {
                const items = equipments.filter(e => (e.owner || '').toLowerCase().includes('pornthak'));
                reply = `👤 **เครื่องมือที่ดูแลโดยคุณ PORNTHAK:**\n` +
                    items.map(e => `• **${e.equipmentNo} - ${e.equipmentName}** (PM: ${e.pm?.lastPM || '-'}, Cal: ${e.cal?.lastCal || '-'} | สถานะ: ${e.trackingStatus?.result || 'ขั้นตอนงานปกติ'})`).join('\n');
            } else if (q.includes('pds-1004') || q.includes('melt flow')) {
                const mfi = equipments.find(e => e.equipmentNo.toLowerCase().includes('pds-1004'));
                reply = `🔬 **ข้อมูลเครื่อง PDS-1004 (Melt Flow Index):**\n` +
                    `• **ผู้ดูแล:** ${mfi?.owner}\n` +
                    `• **งาน PM:** ดำเนินการโดย Owner (ตรวจสภาพสายไฟ, เช็ดดูดฝุ่น, ตรวจผิว Barrel/Piston)\n` +
                    `• **งาน Calibration:** สอบเทียบโดย Vendor สำหรับชุดตุ้มน้ำหนัก (Weight 400g, 2060g, 4900g, 5000g, 21500g) และลูกสูบ (Piston)\n` +
                    `• **สถานะปัจจุบัน:** ขอใบ Quotation แล้ว และออก PR เรียบร้อย รอการนัดหมาย Vendor เข้ามาดำเนินการ`;
            } else if (q.includes('pr') || q.includes('ใบเสนอราคา') || q.includes('quotation')) {
                reply = `📑 **สรุปสถานะเอกสารจัดซื้อ:**\n` +
                    `• ขอใบ Quotation แล้ว: ${equipments.filter(e => e.trackingStatus?.quotationRequested).length} เครื่อง\n` +
                    `• แจ้งออก PR แล้ว: ${equipments.filter(e => e.trackingStatus?.prIssued).length} เครื่อง\n` +
                    `• รอนัดหมาย Vendor: ${equipments.filter(e => e.trackingStatus?.prIssued && !e.trackingStatus?.vendorScheduled).length} เครื่อง`;
            } else if (q.includes('เสีย') || q.includes('ชำรุด') || q.includes('breakdown') || q.includes('ซ่อม')) {
                const broken = equipments.filter(e => e.status === 'issue' || e.breakdownStatus?.isBroken);
                if (broken.length === 0) {
                    reply = `✅ ขณะนี้ **ไม่มีเครื่องมือหลักเครื่องใดที่ชำรุด** เครื่องมือทั้งหมดพร้อมใช้งานปกติ 100% ครับ`;
                } else {
                    reply = `🚨 **รายงานเครื่องมือหลักที่ชำรุดในขณะนี้ (${broken.length} เครื่อง):**\n` +
                        broken.map(e => {
                            const inc = e.breakdownStatus?.currentIncident;
                            return `• **${e.equipmentNo} (${e.equipmentName})**\n  - อาการ: ${inc?.symptom || 'เครื่องชำรุด'}\n  - ขั้นตอนการจัดการ: ${inc?.stage || 'กำลังตรวจสอบ'}\n  - ผลกระทบ: ${inc?.impactLevel || 'Critical'}\n  - ผู้รับผิดชอบซ่อม: ${inc?.vendorOrTechnician || e.owner}`;
                        }).join('\n\n') +
                        `\n\n💡 คุณสามารถเข้าไปดูรายละเอียดและอัปเดตขั้นตอนการซ่อม 6 สเต็ปได้ที่แท็บ **"เครื่องมือเสีย (ผู้บริหาร)"** ด้านซ้ายได้ทันทีครับ`;
                }
            } else {
                reply = `🤖 **คำตอบจาก AI:**\nจากการตรวจสอบฐานข้อมูลเครื่องมือ ${equipments.length} เครื่องหลัก:\n` +
                    `คุณสามารถสอบถามเกี่ยวกับรหัสเครื่องมือ (เช่น "PDS-1001", "PDS-1004"), เครื่องมือที่เสีย ("เครื่องไหนเสียบ้าง"), พนักงานผู้ดูแล ("PORNTHAK", "Channarong"), หรือรอบเดือน ("เดือน Jan", "สถานะ PR") ได้ทันทีครับ`;
            }

            setAnalysisResult(reply);
            setIsAnalyzing(false);
        }, 500);
    };

    return (
        <div className="space-y-6 animate-fade-in w-full">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-900 via-indigo-900 to-primary-950 text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden">
                <div className="relative z-10 max-w-3xl space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider text-primary-200">
                        <SparklesIcon className="h-4 w-4" /> AI Smart Assistant & Plan Analyzer
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">
                        ผู้ช่วยอัจฉริยะสำหรับแผนงาน PM & Calibration
                    </h2>
                    <p className="text-xs md:text-sm text-primary-200 font-medium leading-relaxed">
                        วิเคราะห์ภาพรวมแผนงานประจำปี ตรวจสอบจุดติดขัดใน 6 ขั้นตอน สรุปตามพนักงานผู้ดูแล และร่างเอกสารประสานงานกับ Vendor อัตโนมัติ
                    </p>

                    <div className="flex items-center gap-2 pt-2">
                        <button
                            onClick={runPlanAnalysis}
                            disabled={isAnalyzing}
                            className="px-5 py-3 bg-white hover:bg-slate-100 text-primary-950 font-black rounded-2xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                        >
                            <SparklesIcon className="h-4 w-4 text-primary-600" />
                            {isAnalyzing ? 'กำลังวิเคราะห์แผนงาน...' : '⚡ รันการวิเคราะห์สุขภาพแผนงาน (AI Health Check)'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">เครื่องมือหลัก</span>
                    <h4 className="text-xl font-black text-slate-800 dark:text-white mt-1">{stats.totalPrimary}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">+{stats.totalSubs} เครื่องพ่วง</span>
                </div>
                <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">1. ขอ Quotation</span>
                    <h4 className="text-xl font-black text-indigo-600 mt-1">{stats.pendingQuotation}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">รายการที่ยังไม่ขอ</span>
                </div>
                <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider">2. รอออก PR</span>
                    <h4 className="text-xl font-black text-amber-600 mt-1">{stats.pendingPR}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">รอเปิดใบสั่งซื้อ</span>
                </div>
                <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm">
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider">3. รอนัดหมาย Vendor</span>
                    <h4 className="text-xl font-black text-blue-600 mt-1">{stats.pendingSchedule}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">รอยืนยันวันเข้า</span>
                </div>
                <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm">
                    <span className="text-[10px] font-black text-purple-500 uppercase tracking-wider">4. รอใบ Cert</span>
                    <h4 className="text-xl font-black text-purple-600 mt-1">{stats.pendingCert}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">รอส่งมอบ Cert</span>
                </div>
                <div className="bg-white dark:bg-base-900 p-4 rounded-2xl border border-base-200 dark:border-base-800 shadow-sm">
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-wider">6. เสร็จสมบูรณ์ (PASS)</span>
                    <h4 className="text-xl font-black text-emerald-600 mt-1">{stats.completedPass}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">ผ่านเกณฑ์</span>
                </div>
            </div>

            {/* Sub-tabs: AI Health Analysis / Chat Q&A / Vendor Draft Generator */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-base-800 pb-2">
                <button
                    onClick={() => setActiveView('health')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeView === 'health' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-base-800'
                    }`}
                >
                    📊 ผลการวิเคราะห์ภาพรวม (Health Analysis)
                </button>
                <button
                    onClick={() => setActiveView('chat')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeView === 'chat' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-base-800'
                    }`}
                >
                    💬 ถาม-ตอบอัจฉริยะ (AI Q&A)
                </button>
                <button
                    onClick={() => setActiveView('vendorDraft')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeView === 'vendorDraft' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-base-800'
                    }`}
                >
                    ✉️ สร้างแบบร่างติดต่อ Vendor (Quotation / Schedule Draft)
                </button>
            </div>

            {/* VIEW 1: HEALTH ANALYSIS REPORT */}
            {activeView === 'health' && (
                <div className="bg-white dark:bg-base-900 rounded-3xl p-6 border border-base-200 dark:border-base-800 shadow-sm space-y-4">
                    {analysisResult ? (
                        <div className="prose dark:prose-invert max-w-none text-xs md:text-sm whitespace-pre-line leading-relaxed font-medium text-slate-700 dark:text-slate-300">
                            {analysisResult}
                        </div>
                    ) : (
                        <div className="text-center py-12 space-y-3">
                            <SparklesIcon className="h-10 w-10 text-primary-400 mx-auto" />
                            <h4 className="text-base font-black text-slate-700 dark:text-slate-200">
                                ยังไม่ได้รันการวิเคราะห์สุขภาพแผนงาน
                            </h4>
                            <p className="text-xs text-slate-400 max-w-md mx-auto">
                                กดปุ่มด้านบน "รันการวิเคราะห์สุขภาพแผนงาน" เพื่อให้ AI สรุปคอขวด แผนงานรายเดือน และคำแนะนำทันที
                            </p>
                            <button
                                onClick={runPlanAnalysis}
                                className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-primary-700 transition-all"
                            >
                                วิเคราะห์แผนงานเดี๋ยวนี้
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 2: INTERACTIVE AI Q&A */}
            {activeView === 'chat' && (
                <div className="bg-white dark:bg-base-900 rounded-3xl p-6 border border-base-200 dark:border-base-800 shadow-sm space-y-4">
                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">คำถามแนะนำที่พบบ่อย (Quick Prompts):</span>
                        <div className="flex flex-wrap gap-2">
                            {[
                                'มีเครื่องไหนที่ต้องทำในเดือน Jan บ้าง?',
                                'เครื่องที่ Channarong ดูแลมีอะไรบ้าง?',
                                'เครื่องที่ PORNTHAK ดูแลมีอะไรบ้าง?',
                                'สรุปเครื่อง PDS-1004 (Melt Flow Index)',
                                'สรุปสถานะการออก PR และขอใบเสนอราคา'
                            ].map((p, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setUserQuery(p);
                                        handleSendQuery(p);
                                    }}
                                    className="px-3 py-1.5 bg-slate-50 dark:bg-base-950/40 hover:bg-primary-50 dark:hover:bg-primary-950/40 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold border border-slate-200 dark:border-base-700 transition-all"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <input
                            type="text"
                            placeholder="พิมพ์คำถามเกี่ยวกับเครื่องมือ แผน PM หรือ Calibration..."
                            value={userQuery}
                            onChange={e => setUserQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendQuery(userQuery)}
                            className="flex-1 px-4 py-3 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-primary-500 dark:text-white"
                        />
                        <button
                            onClick={() => handleSendQuery(userQuery)}
                            disabled={!userQuery.trim() || isAnalyzing}
                            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl text-xs font-black shadow-md transition-all disabled:opacity-50"
                        >
                            {isAnalyzing ? '...' : 'ถาม AI'}
                        </button>
                    </div>

                    {analysisResult && (
                        <div className="mt-4 p-5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 text-xs md:text-sm whitespace-pre-line leading-relaxed font-medium text-slate-800 dark:text-slate-200 animate-fade-in">
                            {analysisResult}
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 3: VENDOR DRAFT GENERATOR */}
            {activeView === 'vendorDraft' && (
                <div className="bg-white dark:bg-base-900 rounded-3xl p-6 border border-base-200 dark:border-base-800 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">เลือกเครื่องมือเป้าหมาย:</span>
                            <select
                                value={vendorDraftEquipment}
                                onChange={e => {
                                    setVendorDraftEquipment(e.target.value);
                                    handleGenerateVendorDraft(e.target.value);
                                }}
                                className="px-3 py-2 bg-slate-50 dark:bg-base-950/40 border border-slate-200 dark:border-base-700 rounded-xl text-xs font-bold dark:text-white"
                            >
                                {equipments.map(eq => (
                                    <option key={eq.id} value={eq.id}>
                                        {eq.equipmentNo} - {eq.equipmentName} ({eq.owner})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => handleGenerateVendorDraft(vendorDraftEquipment)}
                            className="px-4 py-2 bg-primary-600 text-white font-bold rounded-xl text-xs shadow-md"
                        >
                            สร้างแบบร่างใหม่
                        </button>
                    </div>

                    {vendorDraftResult ? (
                        <div className="space-y-3">
                            <div className="p-5 bg-slate-50 dark:bg-base-950/40 rounded-2xl border border-slate-200 dark:border-base-800 font-mono text-xs whitespace-pre-line leading-relaxed text-slate-800 dark:text-slate-200">
                                {vendorDraftResult}
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(vendorDraftResult);
                                        alert('คัดลอกแบบร่างไปยังคลิปบอร์ดแล้ว!');
                                    }}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all"
                                >
                                    📋 คัดลอกข้อความ
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-400 text-xs">
                            เลือกเครื่องมือและกดปุ่ม "สร้างแบบร่างใหม่" เพื่อสร้างแบบร่างอีเมลขอ Quotation
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AiAssistantTab;
