import React, { useState, useEffect, useMemo } from 'react';
import { Tester, ProficiencyTest, ProficiencyRecord } from '../types';
import { getProficiencyTests, saveProficiencyTest, deleteProficiencyTest, getProficiencyRecords, saveProficiencyRecord, deleteProficiencyRecord } from '../services/dataService';
import { CheckCircleIcon, XCircleIcon, PlusIcon, TrashIcon, PencilIcon, DocumentTextIcon, BeakerIcon, ArrowUpTrayIcon } from './common/Icons';

interface ProficiencyTabProps {
    testers: Tester[];
}

const ProficiencyTab: React.FC<ProficiencyTabProps> = ({ testers }) => {
    const [tests, setTests] = useState<ProficiencyTest[]>([]);
    const [records, setRecords] = useState<ProficiencyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeView, setActiveView] = useState<'overview' | 'manage'>('overview');
    
    // Manage Tests State
    const [editingTest, setEditingTest] = useState<Partial<ProficiencyTest> | null>(null);
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [testToDelete, setTestToDelete] = useState<string | null>(null);
    const [viewingImage, setViewingImage] = useState<string | null>(null);

    // Record State
    const [selectedAssistant, setSelectedAssistant] = useState<Tester | null>(null);
    const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);

    const assistants = useMemo(() => testers.filter(t => t.team === 'assistants_4_2' && t.requiresProficiencyCheck), [testers]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [t, r] = await Promise.all([getProficiencyTests(), getProficiencyRecords()]);
            setTests(t);
            setRecords(r);
        } catch (error) {
            console.error("Error fetching proficiency data:", error);
            setNotification({ message: "Failed to load data.", isError: true });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveTest = async () => {
        const currentTypes = Array.isArray(editingTest?.type) ? editingTest.type : (editingTest?.type ? [editingTest.type] : []);
        if (!editingTest?.title || currentTypes.length === 0) {
            setNotification({ message: "Title and at least one Type are required.", isError: true });
            return;
        }
        try {
            await saveProficiencyTest({
                title: editingTest.title,
                description: editingTest.description || '',
                type: currentTypes as ('written' | 'practical' | 'reading')[],
                order: editingTest.order || tests.length
            }, editingTest.id);
            setIsTestModalOpen(false);
            setEditingTest(null);
            fetchData();
            setNotification({ message: "Test saved successfully." });
        } catch (error) {
            console.error("Error saving test:", error);
            setNotification({ message: "Failed to save test.", isError: true });
        }
    };

    const handleDeleteTest = async () => {
        if (!testToDelete) return;
        try {
            await deleteProficiencyTest(testToDelete);
            setTestToDelete(null);
            fetchData();
            setNotification({ message: "Test deleted successfully." });
        } catch (error) {
            console.error("Error deleting test:", error);
            setNotification({ message: "Failed to delete test.", isError: true });
        }
    };

    const handleSaveRecord = async (testId: string, testTypes: string[], typeToUpdate: string, evidenceImage: string | null) => {
        if (!selectedAssistant) return;
        
        const existingRecord = records.find(r => r.testId === testId && r.assistantId === selectedAssistant.id);
        const recordId = existingRecord?.id || `${selectedAssistant.id}_${testId}`;
        
        try {
            let newEvidences = existingRecord?.evidences || {};
            if (existingRecord?.evidenceImage && !existingRecord.evidences) {
                // Migrate legacy
                newEvidences = { [testTypes[0] || 'written']: existingRecord.evidenceImage };
            }
            
            if (evidenceImage === null) {
                // Revoke specific type
                const { [typeToUpdate]: _, ...rest } = newEvidences;
                newEvidences = rest;
            } else {
                newEvidences = { ...newEvidences, [typeToUpdate]: evidenceImage };
            }
            
            const isPassed = testTypes.every(t => newEvidences[t]);
            
            if (Object.keys(newEvidences).length === 0) {
                await deleteProficiencyRecord(recordId);
            } else {
                await saveProficiencyRecord({
                    assistantId: selectedAssistant.id,
                    testId,
                    status: isPassed ? 'passed' : 'pending',
                    evidences: newEvidences,
                    evaluatedBy: 'Admin', // In a real app, this would be the logged-in user
                    evaluatedAt: new Date().toISOString()
                }, recordId);
            }
            fetchData();
        } catch (error) {
            console.error("Error saving record:", error);
            setNotification({ message: "Failed to save record.", isError: true });
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, testId: string, testTypes: string[], typeToUpdate: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                const MAX_WIDTH = 1000;
                const MAX_HEIGHT = 1000;
                
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                
                if (dataUrl.length > 800 * 1024) {
                    setNotification({ message: "Image is too large even after compression. Please use a smaller image.", isError: true });
                    return;
                }
                
                handleSaveRecord(testId, testTypes, typeToUpdate, dataUrl);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
        
        // Reset input so the same file can be selected again if needed
        e.target.value = '';
    };

    const getAssistantProgress = (assistantId: string) => {
        if (tests.length === 0) return { passed: 0, total: 0, percent: 0 };
        const passedCount = tests.filter(t => {
            const r = records.find(rec => rec.testId === t.id && rec.assistantId === assistantId);
            return r?.status === 'passed';
        }).length;
        return {
            passed: passedCount,
            total: tests.length,
            percent: Math.round((passedCount / tests.length) * 100)
        };
    };

    if (isLoading) {
        return <div className="p-8 text-center text-base-500 font-medium animate-pulse">Loading Proficiency Data...</div>;
    }

    return (
        <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-base-900 p-6 rounded-[2rem] shadow-sm border border-base-200 dark:border-base-800">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Proficiency Testing</h1>
                    <p className="text-sm font-medium text-base-500 mt-1">Manage certification and training for Lab Assistants.</p>
                </div>
                <div className="flex gap-2 bg-base-100 dark:bg-base-800 p-1.5 rounded-2xl">
                    <button onClick={() => setActiveView('overview')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeView === 'overview' ? 'bg-white dark:bg-base-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-base-500 hover:text-base-900 dark:hover:text-base-100'}`}>Overview</button>
                    <button onClick={() => setActiveView('manage')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeView === 'manage' ? 'bg-white dark:bg-base-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-base-500 hover:text-base-900 dark:hover:text-base-100'}`}>Manage Tests</button>
                </div>
            </div>

            {activeView === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {assistants.map(assistant => {
                        const progress = getAssistantProgress(assistant.id);
                        const isCertified = progress.percent === 100;
                        return (
                            <div key={assistant.id} onClick={() => { setSelectedAssistant(assistant); setIsRecordModalOpen(true); }} className="bg-white dark:bg-base-900 rounded-[2rem] p-6 shadow-sm border border-base-200 dark:border-base-800 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
                                {isCertified && <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-bl-[3rem] flex items-center justify-center"><CheckCircleIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /></div>}
                                <div className="flex items-center gap-4 mb-6">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black ${isCertified ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
                                        {assistant.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white">{assistant.name}</h3>
                                        <p className="text-xs font-bold text-base-500 uppercase tracking-widest">{isCertified ? 'Certified' : 'In Training'}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm font-bold">
                                        <span className="text-base-500">Progress</span>
                                        <span className={isCertified ? 'text-emerald-600' : 'text-indigo-600'}>{progress.passed} / {progress.total} Tests</span>
                                    </div>
                                    <div className="h-3 bg-base-100 dark:bg-base-800 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${isCertified ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress.percent}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {activeView === 'manage' && (
                <div className="bg-white dark:bg-base-900 rounded-[2rem] shadow-sm border border-base-200 dark:border-base-800 overflow-hidden">
                    <div className="p-6 border-b border-base-200 dark:border-base-800 flex justify-between items-center">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">Test Templates</h2>
                        <button onClick={() => { setEditingTest({ type: ['written'] }); setIsTestModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm">
                            <PlusIcon className="w-4 h-4" /> Add Test
                        </button>
                    </div>
                    <div className="divide-y divide-base-200 dark:divide-base-800">
                        {tests.map(test => {
                            const testTypes = Array.isArray(test.type) ? test.type : (test.type ? [test.type] : []);
                            return (
                            <div key={test.id} className="p-6 flex items-center justify-between hover:bg-base-50 dark:hover:bg-base-800/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400`}>
                                        <DocumentTextIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-bold text-slate-900 dark:text-white">{test.title}</h3>
                                            <div className="flex gap-1">
                                                {testTypes.includes('written') && <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">ข้อเขียน</span>}
                                                {testTypes.includes('practical') && <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">ปฏิบัติ</span>}
                                                {testTypes.includes('reading') && <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">การอ่าน</span>}
                                            </div>
                                        </div>
                                        <p className="text-sm text-base-500">{test.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => { setEditingTest(test); setIsTestModalOpen(true); }} className="p-2 text-base-400 hover:text-indigo-600 transition-colors"><PencilIcon className="w-5 h-5" /></button>
                                    <button onClick={() => setTestToDelete(test.id)} className="p-2 text-base-400 hover:text-rose-600 transition-colors"><TrashIcon className="w-5 h-5" /></button>
                                </div>
                            </div>
                        )})}
                        {tests.length === 0 && <div className="p-12 text-center text-base-500 font-medium">No tests defined yet.</div>}
                    </div>
                </div>
            )}

            {/* Test Template Modal */}
            {isTestModalOpen && editingTest && (
                <div className="fixed inset-0 bg-base-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsTestModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2rem] p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">{editingTest.id ? 'Edit Test' : 'New Test'}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-base-500 uppercase tracking-widest mb-2">Test Title</label>
                                <input type="text" value={editingTest.title || ''} onChange={e => setEditingTest({...editingTest, title: e.target.value})} className="w-full bg-base-50 dark:bg-base-950 border border-base-200 dark:border-base-800 rounded-xl px-4 py-3 font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500" placeholder="e.g., Basic Lab Safety" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-base-500 uppercase tracking-widest mb-2">Description</label>
                                <textarea value={editingTest.description || ''} onChange={e => setEditingTest({...editingTest, description: e.target.value})} className="w-full bg-base-50 dark:bg-base-950 border border-base-200 dark:border-base-800 rounded-xl px-4 py-3 font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none" rows={3} placeholder="Test details..." />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-base-500 uppercase tracking-widest mb-2">Type (Select all that apply)</label>
                                <div className="flex gap-2">
                                    {['written', 'practical', 'reading'].map(t => {
                                        const currentTypes = Array.isArray(editingTest.type) ? editingTest.type : (editingTest.type ? [editingTest.type] : []);
                                        const isSelected = currentTypes.includes(t);
                                        const toggleType = () => {
                                            if (isSelected) setEditingTest({...editingTest, type: currentTypes.filter(x => x !== t)});
                                            else setEditingTest({...editingTest, type: [...currentTypes, t]});
                                        };
                                        const colors = t === 'written' ? 'bg-blue-100 text-blue-700 border-blue-500 dark:bg-blue-900/30 dark:text-blue-400' : 
                                                       t === 'practical' ? 'bg-orange-100 text-orange-700 border-orange-500 dark:bg-orange-900/30 dark:text-orange-400' : 
                                                       'bg-emerald-100 text-emerald-700 border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400';
                                        
                                        return (
                                            <button key={t} onClick={toggleType} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all capitalize ${isSelected ? `${colors} border-2` : 'bg-base-50 dark:bg-base-950 border-2 border-transparent text-base-500'}`}>
                                                {t === 'written' ? 'ข้อเขียน' : t === 'practical' ? 'ปฏิบัติ' : 'การอ่าน'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-8">
                            <button onClick={() => setIsTestModalOpen(false)} className="px-6 py-3 font-bold text-base-500 hover:text-base-900 dark:hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleSaveTest} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30">Save Test</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assistant Record Modal */}
            {isRecordModalOpen && selectedAssistant && (
                <div className="fixed inset-0 bg-base-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsRecordModalOpen(false)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2rem] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-base-200 dark:border-base-800 flex items-center gap-4 shrink-0">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center text-xl font-black">
                                {selectedAssistant.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white">{selectedAssistant.name}</h2>
                                <p className="text-sm font-medium text-base-500">Proficiency Checklist</p>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            {tests.map(test => {
                                const record = records.find(r => r.testId === test.id && r.assistantId === selectedAssistant.id);
                                const isPassed = record?.status === 'passed';
                                const testTypes = Array.isArray(test.type) ? test.type : (test.type ? [test.type] : []);
                                
                                return (
                                    <div key={test.id} className={`p-5 rounded-2xl border-2 transition-all ${isPassed ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800/50' : 'bg-white dark:bg-base-900 border-base-200 dark:border-base-800'}`}>
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className={`mt-1 shrink-0 ${isPassed ? 'text-emerald-500' : 'text-base-300 dark:text-base-700'}`}>
                                                    {isPassed ? <CheckCircleIcon className="w-6 h-6" /> : <div className="w-6 h-6 rounded-full border-2 border-current"></div>}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-base font-bold text-slate-900 dark:text-white">{test.title}</h3>
                                                        <div className="flex gap-1">
                                                            {testTypes.map(t => (
                                                                <span key={t} className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-base-100 text-base-700 dark:bg-base-800 dark:text-base-300 ${t === 'written' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : t === 'practical' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>{t === 'written' ? 'ข้อเขียน' : t === 'practical' ? 'ปฏิบัติ' : 'การอ่าน'}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-base-500 mt-1">{test.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2 shrink-0 min-w-[200px]">
                                                {testTypes.map(t => {
                                                    let evidence = null;
                                                    if (record?.evidences) {
                                                        evidence = record.evidences[t] || null;
                                                    } else if (testTypes.length === 1) {
                                                        evidence = record?.evidenceImage || null;
                                                    }
                                                    const isUploaded = !!evidence;
                                                    
                                                    return (
                                                        <div key={t} className="flex items-center justify-between gap-4 bg-base-50 dark:bg-base-800/50 p-2 rounded-lg">
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-base-500">{t === 'written' ? 'ข้อเขียน' : t === 'practical' ? 'ปฏิบัติ' : 'การอ่าน'}</span>
                                                            {isUploaded ? (
                                                                <div className="flex items-center gap-2">
                                                                    <button onClick={() => setViewingImage(evidence)} className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1">
                                                                        <DocumentTextIcon className="w-3 h-3" /> View
                                                                    </button>
                                                                    <button onClick={() => handleSaveRecord(test.id, testTypes, t, null)} className="text-[10px] font-bold text-rose-500 hover:underline">Revoke</button>
                                                                </div>
                                                            ) : (
                                                                <label className="cursor-pointer flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 font-bold rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-[10px]">
                                                                    <ArrowUpTrayIcon className="w-3 h-3" /> Upload
                                                                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleImageUpload(e, test.id, testTypes, t)} />
                                                                </label>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {isPassed && (
                                                    <div className="text-right mt-1">
                                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Passed</span>
                                                        {record?.evaluatedAt && <div className="text-[10px] text-base-400">{new Date(record.evaluatedAt).toLocaleDateString()}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {tests.length === 0 && <div className="text-center text-base-500 py-8">No tests available. Please add tests in the Manage Tests view.</div>}
                        </div>
                        <div className="p-6 border-t border-base-200 dark:border-base-800 flex justify-end shrink-0">
                            <button onClick={() => setIsRecordModalOpen(false)} className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl hover:opacity-90 transition-opacity">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {testToDelete && (
                <div className="fixed inset-0 bg-base-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in" onClick={() => setTestToDelete(null)}>
                    <div className="bg-white dark:bg-base-900 rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <TrashIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Delete Test?</h3>
                        <p className="text-sm font-medium text-base-500 mb-8">This action cannot be undone. All associated records will also be affected.</p>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setTestToDelete(null)} className="px-6 py-2.5 font-bold text-base-500 hover:text-base-900 dark:hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleDeleteTest} className="px-6 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-500/30">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification */}
            {notification && (
                <div className="fixed bottom-8 right-8 z-[200] animate-slide-up">
                    <div className={`px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ${notification.isError ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
                        {notification.isError ? <XCircleIcon className="w-5 h-5" /> : <CheckCircleIcon className="w-5 h-5" />}
                        {notification.message}
                        <button onClick={() => setNotification(null)} className="ml-4 opacity-70 hover:opacity-100"><XCircleIcon className="w-4 h-4" /></button>
                    </div>
                </div>
            )}

            {/* Image Viewer Modal */}
            {viewingImage && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 animate-fade-in" onClick={() => setViewingImage(null)}>
                    <img src={viewingImage} alt="Evidence" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                    <button onClick={() => setViewingImage(null)} className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 p-2 rounded-full transition-all">
                        <XCircleIcon className="w-10 h-10" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProficiencyTab;
