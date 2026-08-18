import { useState, useCallback, useRef } from 'react';
import { uploadTask, getTaskStatus } from '@/libs/api';

export interface PerfCheckpoints {
  discovery: number;
  loading: number;
  preparation: number;
  execution: number;
  response: number;
  output: number;
  e2e: number;
}

export interface PerfResult {
  seq: number;
  filename: string;
  sizeMb: number;
  success: boolean;
  errorMsg?: string;
  checkpoints: PerfCheckpoints;
}

export interface PerfSummary {
  totalFiles: number;
  totalProcessed: number;
  totalTimeMs: number;
  successCount: number;
  failCount: number;
  errorRate: number;
  throughput: number;
  latencies: {
    min: number;
    median: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    p99_9: number;
    max: number;
    avg: number;
  };
  checkpointMedians: PerfCheckpoints;
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const calculatePercentile = (data: number[], p: number) => {
  if (!data.length) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const k = (sorted.length - 1) * (p / 100.0);
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sorted[k];
  const d0 = sorted[f] * (c - k);
  const d1 = sorted[c] * (k - f);
  return d0 + d1;
};

export const usePerformanceTest = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string>('');
  const [results, setResults] = useState<PerfResult[]>([]);
  const [summary, setSummary] = useState<PerfSummary | null>(null);
  
  const abortController = useRef<AbortController | null>(null);

  const startTest = useCallback(async (files: File[], discoveryTimeMs: number) => {
    setIsRunning(true);
    setResults([]);
    setSummary(null);
    setProgress(0);
    
    abortController.current = new AbortController();
    const abortSignal = abortController.current.signal;
    
    const startTime = performance.now();
    const testResults: PerfResult[] = [];
    
    // Ignore dotfiles and standard text files that shouldn't be processed by OCR
    const validFiles = files.filter(f => !f.name.startsWith('.') && !f.name.endsWith('.txt') && !f.name.endsWith('.md') && !f.name.endsWith('.json') && !f.name.endsWith('.csv'));
    
    for (let i = 0; i < validFiles.length; i++) {
      if (abortSignal.aborted) break;
      
      const file = validFiles[i];
      setCurrentFile(file.name);
      
      const fileStartTime = performance.now();
      const checkpoints: PerfCheckpoints = {
        discovery: discoveryTimeMs / validFiles.length,
        loading: 0,
        preparation: 0,
        execution: 0,
        response: 0,
        output: 0,
        e2e: 0
      };
      
      // Loading
      const loadStart = performance.now();
      const sizeMb = file.size / (1024 * 1024);
      checkpoints.loading = performance.now() - loadStart;
      
      // Preparation
      const prepStart = performance.now();
      let success = false;
      let errorMsg = '';
      checkpoints.preparation = performance.now() - prepStart;
      
      // Execution
      const execStart = performance.now();
      try {
        const uploadRes = await uploadTask({ file });
        const taskId = uploadRes.task_id;
        
        while (true) {
          if (abortSignal.aborted) throw new Error('Aborted by user');
          const statusRes = await getTaskStatus(taskId);
          if (statusRes.status === 'completed') {
            success = true;
            break;
          } else if (statusRes.status === 'failed') {
            errorMsg = statusRes.error_message || 'Task failed';
            break;
          }
          await delay(1000);
        }
      } catch (err: any) {
        errorMsg = err.message || 'Error occurred';
      }
      checkpoints.execution = performance.now() - execStart;
      
      // Response Processing
      const respStart = performance.now();
      await delay(1); // Simulate some minimal processing
      checkpoints.response = performance.now() - respStart;
      
      // Output Processing
      const outStart = performance.now();
      checkpoints.e2e = performance.now() - fileStartTime;
      checkpoints.output = performance.now() - outStart;
      
      const result: PerfResult = {
        seq: i + 1,
        filename: file.name,
        sizeMb,
        success,
        errorMsg,
        checkpoints
      };
      
      testResults.push(result);
      setResults(prev => [...prev, result]);
      setProgress(((i + 1) / validFiles.length) * 100);
    }
    
    const totalTimeMs = performance.now() - startTime;
    
    // Calculate summary
    const latencies = testResults.map(r => r.checkpoints.execution);
    const successCount = testResults.filter(r => r.success).length;
    const failCount = testResults.length - successCount;
    
    const getMedian = (key: keyof PerfCheckpoints) => 
      calculatePercentile(testResults.map(r => r.checkpoints[key]), 50);

    if (testResults.length > 0) {
      setSummary({
        totalFiles: validFiles.length,
        totalProcessed: testResults.length,
        totalTimeMs,
        successCount,
        failCount,
        errorRate: (failCount / testResults.length) * 100,
        throughput: testResults.length / (totalTimeMs / 1000),
        latencies: {
          min: Math.min(...latencies),
          max: Math.max(...latencies),
          avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          median: calculatePercentile(latencies, 50),
          p50: calculatePercentile(latencies, 50),
          p90: calculatePercentile(latencies, 90),
          p95: calculatePercentile(latencies, 95),
          p99: calculatePercentile(latencies, 99),
          p99_9: calculatePercentile(latencies, 99.9)
        },
        checkpointMedians: {
          discovery: getMedian('discovery'),
          loading: getMedian('loading'),
          preparation: getMedian('preparation'),
          execution: getMedian('execution'),
          response: getMedian('response'),
          output: getMedian('output'),
          e2e: getMedian('e2e')
        }
      });
    }

    setIsRunning(false);
  }, []);

  const stopTest = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
    }
  }, []);

  return {
    isRunning,
    progress,
    currentFile,
    results,
    summary,
    startTest,
    stopTest
  };
};
