import { useState } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import questionnaireData from '../templates/questionnaire.json';

type FormState = Record<string, Record<string, any>>;

export default function FormWizard({ onComplete }: { onComplete: (data: FormState) => void }) {
    const [currentStep, setCurrentStep] = useState(0);
    const sections = questionnaireData.sections;
    const section = sections[currentStep];

    // Initialize form state with defaults
    const [formData, setFormData] = useState<FormState>(() => {
        const initial: FormState = {};
        sections.forEach(sec => {
            initial[sec.id] = {};
            sec.questions.forEach(q => {
                if (q.default !== undefined) {
                    initial[sec.id][q.id] = q.default;
                } else if (q.type === 'boolean') {
                    initial[sec.id][q.id] = false;
                } else if (q.type === 'array' || q.type === 'array_text') {
                    initial[sec.id][q.id] = [];
                } else {
                    initial[sec.id][q.id] = '';
                }
            });
        });
        return initial;
    });

    const handleChange = (sectionId: string, questionId: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [sectionId]: {
                ...prev[sectionId],
                [questionId]: value
            }
        }));
    };

    const nextStep = () => {
        if (currentStep < sections.length - 1) {
            setCurrentStep(curr => curr + 1);
        } else {
            onComplete(formData);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) setCurrentStep(curr => curr - 1);
    };

    const renderField = (q: any) => {
        const value = formData[section.id]?.[q.id];

        switch (q.type) {
            case 'text':
            case 'number':
                return (
                    <input
                        type={q.type}
                        className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow outline-none"
                        value={value}
                        onChange={(e) => handleChange(section.id, q.id, q.type === 'number' ? Number(e.target.value) : e.target.value)}
                        required={q.required}
                    />
                );
            case 'select':
                return (
                    <select
                        className="w-full mt-1 px-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        value={value}
                        onChange={(e) => handleChange(section.id, q.id, e.target.value)}
                        required={q.required}
                    >
                        <option value="" disabled>Wybierz opcję...</option>
                        {q.options.map((opt: string) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                );
            case 'textarea':
                return (
                    <textarea
                        className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none min-h-[100px]"
                        value={value}
                        onChange={(e) => handleChange(section.id, q.id, e.target.value)}
                        required={q.required}
                    />
                );
            case 'boolean':
                return (
                    <label className="flex items-center space-x-3 mt-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="w-5 h-5 text-primary-600 rounded border-slate-300 focus:ring-primary-500"
                            checked={value}
                            onChange={(e) => handleChange(section.id, q.id, e.target.checked)}
                        />
                        <span className="text-sm font-medium text-slate-700">{q.label}</span>
                    </label>
                );
            case 'array_text':
                return (
                    <input
                        type="text"
                        className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="Comma separated values..."
                        value={Array.isArray(value) ? value.join(', ') : value}
                        onChange={(e) => {
                            const arr = e.target.value.split(',').map(s => s.trim()).filter(s => s !== '');
                            handleChange(section.id, q.id, arr);
                        }}
                    />
                );
            case 'array':
                const arrayValue = Array.isArray(value) ? value : [];
                return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-2">
                        <p className="text-sm text-slate-600 mb-4 font-medium">
                            Zdefiniuj elementy dla tej struktury za pomocą wizualnego kreatora:
                        </p>

                        <div className="space-y-4 mb-4">
                            {arrayValue.map((item: any, idx: number) => (
                                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const copy = [...arrayValue];
                                            copy.splice(idx, 1);
                                            handleChange(section.id, q.id, copy);
                                        }}
                                        className="absolute top-3 right-3 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                        title="Usuń element"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                    </button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {q.item_schema ? Object.entries(q.item_schema).map(([key, type]) => (
                                            <div key={key} className={`${type === 'boolean' ? 'flex items-center space-x-2 pt-6' : ''} ${type === 'textarea' ? 'md:col-span-2' : ''}`}>
                                                {type === 'boolean' ? (
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 text-primary-600 rounded"
                                                            checked={!!item[key]}
                                                            onChange={(e) => {
                                                                const copy = [...arrayValue];
                                                                copy[idx] = { ...copy[idx], [key]: e.target.checked };
                                                                handleChange(section.id, q.id, copy);
                                                            }}
                                                        />
                                                        <span className="text-xs font-semibold text-slate-700 capitalize">{key.replace(/_/g, ' ')}</span>
                                                    </label>
                                                ) : type === 'textarea' ? (
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</label>
                                                        <textarea
                                                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none min-h-[120px]"
                                                            value={item[key] || ''}
                                                            onChange={(e) => {
                                                                const copy = [...arrayValue];
                                                                copy[idx] = { ...copy[idx], [key]: e.target.value };
                                                                handleChange(section.id, q.id, copy);
                                                            }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                                                            value={item[key] || ''}
                                                            onChange={(e) => {
                                                                const copy = [...arrayValue];
                                                                copy[idx] = { ...copy[idx], [key]: e.target.value };
                                                                handleChange(section.id, q.id, copy);
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )) : (
                                            <textarea
                                                className="w-full text-xs font-mono border rounded p-2 min-h-[100px]"
                                                value={JSON.stringify(item, null, 2)}
                                                onChange={(e) => {
                                                    try {
                                                        const copy = [...arrayValue];
                                                        copy[idx] = JSON.parse(e.target.value);
                                                        handleChange(section.id, q.id, copy);
                                                    } catch { }
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}

                            {arrayValue.length === 0 && (
                                <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                                    Brak elementów na liście.
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                const newItem: any = {};
                                if (q.item_schema) {
                                    Object.entries(q.item_schema).forEach(([key, type]) => {
                                        newItem[key] = type === 'boolean' ? false : '';
                                    });
                                }
                                handleChange(section.id, q.id, [...arrayValue, newItem]);
                            }}
                            className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                        >
                            <svg className="-ml-1 mr-2 h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Dodaj element
                        </button>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Progress */}
            <div className="mb-8 flex space-x-2">
                {sections.map((sec, idx) => (
                    <div key={sec.id} className="flex-1 h-2 rounded-full overflow-hidden bg-slate-100">
                        <div
                            className={`h-full transition-all duration-300 ${idx <= currentStep ? 'bg-primary-500' : 'bg-transparent'}`}
                        />
                    </div>
                ))}
            </div>

            <div className="flex items-center space-x-2 mb-6">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-bold text-sm">
                    {currentStep + 1}
                </div>
                <h3 className="text-xl font-bold text-slate-800">{section.title}</h3>
            </div>

            <form className="flex-1 space-y-6" onSubmit={(e) => { e.preventDefault(); nextStep(); }}>
                {section.questions.map(q => (
                    <div key={q.id}>
                        {q.type !== 'boolean' && (
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                {q.label} {q.required && <span className="text-red-500">*</span>}
                            </label>
                        )}
                        {renderField(q)}
                    </div>
                ))}

                <div className="pt-8 mt-auto flex justify-between border-t border-slate-100">
                    <button
                        type="button"
                        onClick={prevStep}
                        disabled={currentStep === 0}
                        className={`px-5 py-2.5 rounded-xl font-medium flex items-center transition-colors ${currentStep === 0
                            ? 'text-slate-300 bg-slate-50 cursor-not-allowed'
                            : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                            }`}
                    >
                        <ChevronLeft size={18} className="mr-1" />
                        Wstecz
                    </button>

                    <button
                        type="submit"
                        className="px-6 py-2.5 rounded-xl font-medium flex items-center bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow transition-all"
                    >
                        {currentStep === sections.length - 1 ? (
                            <>
                                Zatwierdź i generuj
                                <CheckCircle2 size={18} className="ml-2" />
                            </>
                        ) : (
                            <>
                                Dalej
                                <ChevronRight size={18} className="ml-1" />
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
