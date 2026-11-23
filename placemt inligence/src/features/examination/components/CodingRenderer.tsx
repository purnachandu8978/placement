import React from 'react';
import { RotateCcw, Code2 } from 'lucide-react';
import type { ExaminationQuestion, RunCodeResult } from '../../../services/examinationService';
import { ConsoleTabs } from './ConsoleTabs';

interface CodingRendererProps {
  question: ExaminationQuestion;
  code: string;
  language: string;
  supportedLanguages: string[];
  customInput: string;
  runResult: RunCodeResult | null;
  isRunning: boolean;
  onCodeChange: (code: string) => void;
  onLanguageChange: (lang: string) => void;
  onCustomInputChange: (val: string) => void;
  onResetCode: () => void;
  onRunClick: () => void;
}

export const CodingRenderer: React.FC<CodingRendererProps> = ({
  question,
  code,
  language,
  supportedLanguages,
  customInput,
  runResult,
  isRunning,
  onCodeChange,
  onLanguageChange,
  onCustomInputChange,
  onResetCode,
  onRunClick,
}) => {
  const lineCount = Math.max(code.split('\n').length, 18);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden text-slate-800 bg-slate-50">
      {/* Left Column: Problem Statement & Specs */}
      <div className="w-full lg:w-1/2 flex flex-col border-r border-slate-200 bg-white overflow-y-auto p-6 space-y-5">
        {/* Title & Badges */}
        <div className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              Coding Problem
            </span>
            {question.difficulty && (
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-md capitalize border ${
                  question.difficulty === 'hard'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : question.difficulty === 'medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {question.difficulty}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {question.title || 'Algorithmic Problem'}
          </h2>
          <div className="text-xs text-slate-500 font-mono mt-1">
            Points: <span className="text-emerald-700 font-bold">+{question.points || 20}</span>
          </div>
        </div>

        {/* Problem Statement */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Problem Description</h3>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line font-normal">
            {question.problem_statement || question.question || 'No description provided.'}
          </p>
        </div>

        {/* Input & Output Format */}
        {(question.input_format || question.output_format) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {question.input_format && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <h4 className="text-xs font-bold text-blue-700">Input Format</h4>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{question.input_format}</p>
              </div>
            )}
            {question.output_format && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <h4 className="text-xs font-bold text-emerald-700">Output Format</h4>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{question.output_format}</p>
              </div>
            )}
          </div>
        )}

        {/* Constraints */}
        {question.constraints && question.constraints.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Constraints</h3>
            <ul className="list-disc list-inside space-y-1 text-xs text-slate-700 font-mono bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              {question.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sample Test Cases */}
        {question.sample_inputs && question.sample_inputs.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Sample Test Cases</h3>
            {question.sample_inputs.map((inp, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2 text-xs">
                <span className="font-bold text-slate-700">Sample #{idx + 1}</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-[11px] font-bold text-blue-700 block mb-1">Input</span>
                    <pre className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-800 overflow-x-auto whitespace-pre-wrap shadow-2xs">
                      {inp}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-emerald-700 block mb-1">Expected Output</span>
                    <pre className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-800 overflow-x-auto whitespace-pre-wrap shadow-2xs">
                      {question.sample_outputs?.[idx] || ''}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Column: Code Editor & Console Tabs */}
      <div className="w-full lg:w-1/2 flex flex-col h-full bg-white border-l border-slate-200">
        {/* Editor Controls Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50 text-xs">
          <div className="flex items-center space-x-2">
            <Code2 className="w-4 h-4 text-blue-600" />
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 rounded-md px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-blue-500 font-mono shadow-2xs cursor-pointer"
            >
              {(question.supported_languages || supportedLanguages || ['python', 'javascript', 'java', 'cpp']).map(
                (lang) => (
                  <option key={lang} value={lang}>
                    {lang.toUpperCase()}
                  </option>
                )
              )}
            </select>
          </div>

          <button
            onClick={onResetCode}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Reset to starter boilerplate"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Boilerplate</span>
          </button>
        </div>

        {/* Code Editor Surface */}
        <div className="flex-1 flex overflow-hidden bg-slate-900 text-slate-100 font-mono text-xs">
          {/* Line Numbers */}
          <div className="w-12 bg-slate-950 text-slate-500 text-right pr-3 pt-3 select-none border-r border-slate-800 font-mono">
            {lineNumbers.map((num) => (
              <div key={num} className="leading-6 h-6">
                {num}
              </div>
            ))}
          </div>

          {/* Textarea Code Input */}
          <textarea
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="flex-1 bg-slate-900 text-slate-100 p-3 focus:outline-none resize-none font-mono text-xs leading-6 selection:bg-blue-600 selection:text-white"
            placeholder="// Write your code solution here..."
          />
        </div>

        {/* Bottom Dock: Custom Input & Output Console */}
        <ConsoleTabs
          customInput={customInput}
          onCustomInputChange={onCustomInputChange}
          runResult={runResult}
          isRunning={isRunning}
          onRunClick={onRunClick}
        />
      </div>
    </div>
  );
};
