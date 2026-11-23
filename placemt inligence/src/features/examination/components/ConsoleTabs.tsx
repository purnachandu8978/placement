import React, { useState } from 'react';
import { Play, Terminal, Edit3, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { RunCodeResult } from '../../../services/examinationService';

interface ConsoleTabsProps {
  customInput: string;
  onCustomInputChange: (val: string) => void;
  runResult: RunCodeResult | null;
  isRunning: boolean;
  onRunClick: () => void;
}

export const ConsoleTabs: React.FC<ConsoleTabsProps> = ({
  customInput,
  onCustomInputChange,
  runResult,
  isRunning,
  onRunClick,
}) => {
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
      case 'accepted':
        return (
          <span className="flex items-center space-x-1 text-emerald-700 font-bold">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Success</span>
          </span>
        );
      case 'compilation_error':
        return (
          <span className="flex items-center space-x-1 text-rose-700 font-bold">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Compilation Error</span>
          </span>
        );
      case 'time_limit_exceeded':
        return (
          <span className="flex items-center space-x-1 text-amber-700 font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Time Limit Exceeded</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 text-rose-700 font-bold">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span className="capitalize">{status.replace('_', ' ')}</span>
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-56 bg-white border-t border-slate-200 text-slate-800">
      {/* Console Header / Tabs */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setActiveTab('input')}
            className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === 'input'
                ? 'bg-white text-blue-700 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
            <span>Custom Stdin</span>
          </button>

          <button
            onClick={() => setActiveTab('output')}
            className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === 'output'
                ? 'bg-white text-blue-700 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-blue-600" />
            <span>Output Console</span>
            {runResult && (
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse ml-0.5" />
            )}
          </button>
        </div>

        {/* Run Code Button & Execution Status */}
        <div className="flex items-center space-x-3">
          {runResult && (
            <div className="hidden sm:flex items-center space-x-2 text-xs font-mono">
              {getStatusBadge(runResult.status)}
              {runResult.time_ms > 0 && (
                <span className="text-slate-500 text-[11px]">({runResult.time_ms} ms)</span>
              )}
            </div>
          )}

          <button
            onClick={() => {
              setActiveTab('output');
              onRunClick();
            }}
            disabled={isRunning}
            className="flex items-center space-x-1.5 px-3.5 py-1 rounded-md text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Running...' : 'Run Code'}</span>
          </button>
        </div>
      </div>

      {/* Console Tab Content */}
      <div className="flex-1 overflow-auto p-3 font-mono text-xs bg-slate-50/50">
        {activeTab === 'input' ? (
          <div className="h-full flex flex-col">
            <textarea
              value={customInput}
              onChange={(e) => onCustomInputChange(e.target.value)}
              placeholder="Enter custom standard input (stdin) for your program here..."
              className="w-full h-full bg-white text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 resize-none font-mono text-xs leading-relaxed shadow-2xs"
            />
          </div>
        ) : (
          <div className="h-full">
            {isRunning ? (
              <div className="flex items-center justify-center h-full text-slate-500 space-x-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="font-sans font-medium text-xs">Executing code in isolated execution sandbox...</span>
              </div>
            ) : runResult ? (
              <div className="space-y-3">
                {runResult.compile_output && (
                  <div>
                    <span className="text-rose-700 font-bold block mb-1">Compilation Output:</span>
                    <pre className="bg-rose-50 border border-rose-200 text-rose-900 p-2.5 rounded-lg whitespace-pre-wrap">
                      {runResult.compile_output}
                    </pre>
                  </div>
                )}

                {runResult.stderr && (
                  <div>
                    <span className="text-rose-700 font-bold block mb-1">Standard Error (stderr):</span>
                    <pre className="bg-rose-50 border border-rose-200 text-rose-900 p-2.5 rounded-lg whitespace-pre-wrap">
                      {runResult.stderr}
                    </pre>
                  </div>
                )}

                {runResult.stdout ? (
                  <div>
                    <span className="text-slate-700 font-bold block mb-1">Standard Output (stdout):</span>
                    <pre className="bg-white border border-slate-200 text-slate-900 p-2.5 rounded-lg whitespace-pre-wrap shadow-2xs">
                      {runResult.stdout}
                    </pre>
                  </div>
                ) : (
                  !runResult.compile_output &&
                  !runResult.stderr && (
                    <div className="text-slate-500 italic p-2 font-sans text-xs">
                      Program executed successfully with no stdout output.
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 font-sans text-xs">
                Click &quot;Run Code&quot; to test your solution against custom input.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
