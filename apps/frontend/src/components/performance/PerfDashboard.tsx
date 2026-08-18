import React, { useRef, useState } from 'react';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel } from 'docx';
import { usePerformanceTest } from './usePerformanceTest';
import { Play, Square, FolderInput, Activity, Clock, FileWarning, BarChart, Download } from 'lucide-react';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const formatMs = (value: number) => `${value.toFixed(1)} ms`;
const formatSeconds = (value: number) => `${(value / 1000).toFixed(2)} sec`;

const exportWordReport = async (summary: any, results: any[]) => {
  const summaryRows = [
    ['Metric', 'Value'],
    ['Total Sequential Time', formatSeconds(summary.totalTimeMs)],
    ['Median Latency (p50)', formatMs(summary.latencies.median)],
    ['Throughput', `${summary.throughput.toFixed(2)} req/s`],
    ['Error Rate', `${summary.errorRate.toFixed(1)}%`],
    ['p90', formatMs(summary.latencies.p90)],
    ['p95', formatMs(summary.latencies.p95)],
    ['p99', formatMs(summary.latencies.p99)],
    ['Average', formatMs(summary.latencies.avg)],
    ['Maximum', formatMs(summary.latencies.max)],
  ];

  const checkpointRows = [
    ['Checkpoint', 'Median Time'],
    ['Input Discovery', formatMs(summary.checkpointMedians.discovery)],
    ['File Loading', formatMs(summary.checkpointMedians.loading)],
    ['Request Prep', formatMs(summary.checkpointMedians.preparation)],
    ['Request Execution', formatMs(summary.checkpointMedians.execution)],
    ['Response Parsing', formatMs(summary.checkpointMedians.response)],
    ['Output Processing', formatMs(summary.checkpointMedians.output)],
    ['End-to-End Total', formatMs(summary.checkpointMedians.e2e)],
  ];

  const fileRows = [
    ['File', 'Status', 'Execution (ms)', 'Size (MB)', 'Error'],
    ...results.map(result => [
      result.filename,
      result.success ? 'Success' : 'Failed',
      result.checkpoints.execution.toFixed(1),
      result.sizeMb.toFixed(2),
      result.errorMsg || 'None'
    ])
  ];

  const tableCells = (row: string[]) => row.map(cell => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 20 })] })],
    shading: {
      fill: row[0] === 'Metric' || row[0] === 'Checkpoint' || row[0] === 'File' ? 'D9EAF7' : 'FFFFFF'
    },
    width: { size: 100 / row.length, type: 'pct' }
  }));

  const heading = (text: string, level: HeadingLevel) => new Paragraph({
    text,
    heading: level,
    spacing: { before: 180, after: 120 }
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: '22pt' },
          paragraph: { spacing: { after: 120 } }
        }
      }
    },
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: 'center',
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({ text: 'GLM-OCR', bold: true, size: 32, color: '2F75B5' }),
          ]
        }),
        new Paragraph({
          alignment: 'center',
          spacing: { before: 0, after: 220 },
          children: [
            new TextRun({ text: 'Performance Benchmark Report', bold: true, size: 28, color: '1F1F1F' }),
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Sequential benchmark run summary generated on ${new Date().toLocaleDateString()}.`, italic: true, color: '5B5B5B' })
          ]
        }),
        heading('Execution Summary', HeadingLevel.HEADING_1),
        new Table({ rows: summaryRows.map(row => new TableRow({ children: tableCells(row) })) }),
        heading('Processing Duration Breakdown', HeadingLevel.HEADING_1),
        new Table({ rows: checkpointRows.map(row => new TableRow({ children: tableCells(row) })) }),
        heading('Processed Files', HeadingLevel.HEADING_1),
        new Table({ rows: fileRows.map(row => new TableRow({ children: tableCells(row) })) }),
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, 'glm_ocr_performance_benchmark.docx');
};

const exportExcelSummary = (summary: any, results: any[]) => {
  const rows: string[][] = [
    ['Performance Benchmark Summary'],
    ['Metric', 'Value'],
    ['Total Sequential Time (sec)', (summary.totalTimeMs / 1000).toFixed(2)],
    ['Median Latency (p50) (ms)', summary.latencies.median.toFixed(1)],
    ['Throughput (req/s)', summary.throughput.toFixed(2)],
    ['Error Rate (%)', summary.errorRate.toFixed(1)],
    ['p90 (ms)', summary.latencies.p90.toFixed(1)],
    ['p95 (ms)', summary.latencies.p95.toFixed(1)],
    ['p99 (ms)', summary.latencies.p99.toFixed(1)],
    ['Average (ms)', summary.latencies.avg.toFixed(1)],
    ['Maximum (ms)', summary.latencies.max.toFixed(1)],
    [],
    ['Checkpoint', 'Median Time (ms)'],
    ['Input Discovery', summary.checkpointMedians.discovery.toFixed(1)],
    ['File Loading', summary.checkpointMedians.loading.toFixed(1)],
    ['Request Prep', summary.checkpointMedians.preparation.toFixed(1)],
    ['Request Execution', summary.checkpointMedians.execution.toFixed(1)],
    ['Response Parsing', summary.checkpointMedians.response.toFixed(1)],
    ['Output Processing', summary.checkpointMedians.output.toFixed(1)],
    ['End-to-End Total', summary.checkpointMedians.e2e.toFixed(1)],
    [],
    ['File', 'Status', 'Execution (ms)', 'Size (MB)', 'Error'],
    ...results.map(result => [
      result.filename,
      result.success ? 'Success' : 'Failed',
      result.checkpoints.execution.toFixed(1),
      result.sizeMb.toFixed(2),
      result.errorMsg || 'None'
    ])
  ];

  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'glm_ocr_performance_benchmark_summary.csv');
};

export const PerfDashboard = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [discoveryTime, setDiscoveryTime] = useState(0);
  
  const {
    isRunning,
    progress,
    currentFile,
    results,
    summary,
    startTest,
    stopTest
  } = usePerformanceTest();

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const start = performance.now();
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      setDiscoveryTime(performance.now() - start);
    }
  };

  const onStart = () => {
    if (selectedFiles.length > 0) {
      startTest(selectedFiles, discoveryTime);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] text-gray-200 p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 flex items-center gap-3">
            <Activity className="w-8 h-8 text-purple-400" />
            Performance Benchmark
          </h1>
          <p className="text-gray-400 mt-2">End-to-end sequential latency analysis for GLM-OCR</p>
        </div>
      </div>

      <div className="bg-[#2a2a3c] rounded-xl p-6 shadow-xl border border-white/5 mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FolderInput className="w-5 h-5 text-blue-400" />
          Test Configuration
        </h2>
        
        <div className="flex items-center gap-6">
          <div className="relative group">
            <input
              type="file"
              // @ts-ignore - webkitdirectory is non-standard but supported
              webkitdirectory=""
              directory=""
              multiple
              ref={fileInputRef}
              onChange={handleFolderSelect}
              className="hidden"
              disabled={isRunning}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
              className="px-6 py-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg border border-blue-500/30 transition-all font-medium flex items-center gap-2 disabled:opacity-50"
            >
              Select Input Folder
            </button>
          </div>
          
          <div className="flex-1">
            {selectedFiles.length > 0 ? (
              <p className="text-gray-300">
                <span className="font-bold text-white">{selectedFiles.length}</span> files discovered. Ready to test.
              </p>
            ) : (
              <p className="text-gray-500 italic">No folder selected</p>
            )}
          </div>
          
          <div>
            {!isRunning ? (
              <button
                onClick={onStart}
                disabled={selectedFiles.length === 0}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg shadow-lg shadow-purple-500/20 transition-all font-bold flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
              >
                <Play className="w-5 h-5" />
                Run Benchmark
              </button>
            ) : (
              <button
                onClick={stopTest}
                className="px-8 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-all font-bold flex items-center gap-2"
              >
                <Square className="w-5 h-5" />
                Stop Execution
              </button>
            )}
          </div>
        </div>
      </div>

      {isRunning && (
        <div className="bg-[#2a2a3c] rounded-xl p-6 shadow-xl border border-purple-500/20 mb-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2 text-purple-300">
            <Activity className="w-5 h-5 animate-pulse" />
            Processing Sequential Queue
          </h2>
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Processing: <span className="text-white font-medium">{currentFile}</span></span>
            <span>{results.length} / {selectedFiles.filter(f => !f.name.startsWith('.') && !f.name.endsWith('.txt') && !f.name.endsWith('.md') && !f.name.endsWith('.json') && !f.name.endsWith('.csv')).length}</span>
          </div>
          <div className="w-full bg-black/30 rounded-full h-3">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-bold border-b border-white/10 pb-2 flex items-center gap-2">
              <BarChart className="w-6 h-6 text-pink-400" />
              Execution Summary
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => exportWordReport(summary, results)}
                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg border border-blue-500/30 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export Word
              </button>
              <button
                onClick={() => exportExcelSummary(summary, results)}
                className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg border border-emerald-500/30 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#252536] p-6 rounded-xl border border-white/5 shadow-lg">
              <p className="text-gray-400 text-sm font-medium mb-1">Total Sequential Time</p>
              <p className="text-3xl font-bold text-white">{(summary.totalTimeMs / 1000).toFixed(2)} <span className="text-lg text-gray-500">sec</span></p>
            </div>
            <div className="bg-[#252536] p-6 rounded-xl border border-white/5 shadow-lg">
              <p className="text-gray-400 text-sm font-medium mb-1">Median Latency (p50)</p>
              <p className="text-3xl font-bold text-blue-400">{summary.latencies.median.toFixed(0)} <span className="text-lg text-blue-400/50">ms</span></p>
            </div>
            <div className="bg-[#252536] p-6 rounded-xl border border-white/5 shadow-lg">
              <p className="text-gray-400 text-sm font-medium mb-1">Throughput</p>
              <p className="text-3xl font-bold text-green-400">{summary.throughput.toFixed(2)} <span className="text-lg text-green-400/50">req/s</span></p>
            </div>
            <div className="bg-[#252536] p-6 rounded-xl border border-white/5 shadow-lg relative overflow-hidden">
              <p className="text-gray-400 text-sm font-medium mb-1">Error Rate</p>
              <p className={`text-3xl font-bold ${summary.errorRate > 0 ? 'text-red-400' : 'text-gray-300'}`}>
                {summary.errorRate.toFixed(1)}%
              </p>
              {summary.errorRate > 0 && <FileWarning className="absolute -bottom-4 -right-4 w-24 h-24 text-red-500/10" />}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-[#252536] p-6 rounded-xl border border-white/5 shadow-lg">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-gray-300">
                <BarChart className="w-5 h-5 text-blue-400" />
                Percentile Statistics
              </h3>
              <div className="space-y-4">
                {[
                  { label: 'Median (p50)', value: summary.latencies.p50 },
                  { label: 'p90', value: summary.latencies.p90 },
                  { label: 'p95', value: summary.latencies.p95 },
                  { label: 'Tail Latency (p99)', value: summary.latencies.p99 },
                  { label: 'Extreme Tail (p99.9)', value: summary.latencies.p99_9 },
                  { label: 'Average', value: summary.latencies.avg },
                  { label: 'Maximum', value: summary.latencies.max },
                ].map(stat => (
                  <div key={stat.label} className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-gray-400">{stat.label}</span>
                    <span className="font-mono text-gray-200">{stat.value.toFixed(0)} ms</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#252536] p-6 rounded-xl border border-white/5 shadow-lg">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-gray-300">
                <Clock className="w-5 h-5 text-pink-400" />
                Median Checkpoints
              </h3>
              <div className="space-y-4">
                {[
                  { label: 'Input Discovery', value: summary.checkpointMedians.discovery },
                  { label: 'File Loading', value: summary.checkpointMedians.loading },
                  { label: 'Request Prep', value: summary.checkpointMedians.preparation },
                  { label: 'Request Execution', value: summary.checkpointMedians.execution },
                  { label: 'Response Parsing', value: summary.checkpointMedians.response },
                  { label: 'Output Processing', value: summary.checkpointMedians.output },
                  { label: 'End-to-End Total', value: summary.checkpointMedians.e2e, highlight: true },
                ].map(stat => (
                  <div key={stat.label} className={`flex justify-between items-center border-b pb-2 ${stat.highlight ? 'border-pink-500/30' : 'border-white/5'}`}>
                    <span className={stat.highlight ? 'text-pink-300 font-medium' : 'text-gray-400'}>{stat.label}</span>
                    <span className={`font-mono ${stat.highlight ? 'text-pink-400 font-bold' : 'text-gray-200'}`}>{stat.value.toFixed(1)} ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
