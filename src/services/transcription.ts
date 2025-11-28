import { spawn } from 'child_process';
import path from 'path';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionMetadata {
  engine: string;
  model: string;
  vad_filter?: boolean;
  compute_type?: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  duration: number; // Duration in seconds (processing time)
  language?: string;
  metadata?: TranscriptionMetadata;
}

export interface TranscriptionOptions {
  engine?: 'faster-whisper' | 'openai-whisper';
  model?: string;
  language?: string;
  vad_filter?: boolean;
  compute_type?: 'auto' | 'float16' | 'int8' | 'int8_float16';
  device?: 'auto' | 'cpu' | 'cuda';
}

const DEFAULT_OPTIONS: TranscriptionOptions = {
  engine: 'faster-whisper',
  model: 'base',
  vad_filter: true,
  compute_type: 'auto',
  device: 'auto',
};

export async function transcribeFile(
  filePath: string, 
  options: TranscriptionOptions | string = {}
): Promise<TranscriptionResult> {
  // Handle legacy string parameter (model name only)
  if (typeof options === 'string') {
    options = { model: options };
  }

  // Merge with defaults
  const opts: TranscriptionOptions = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const pythonScript = path.join(process.cwd(), 'scripts', 'transcribe.py');
    
    // Check environment for python command, default to python3
    const pythonCommand = process.env.PYTHON_CMD || 'python3';
    
    // Pass options as JSON
    const optionsJson = JSON.stringify({
      engine: opts.engine,
      model: opts.model,
      language: opts.language,
      vad_filter: opts.vad_filter,
      compute_type: opts.compute_type,
      device: opts.device,
    });
    
    const pythonProcess = spawn(pythonCommand, [pythonScript, filePath, optionsJson]);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Transcription failed with code ${code}: ${stderrData}`));
        return;
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      try {
        const result = JSON.parse(stdoutData);
        
        if (result.error) {
          reject(new Error(result.error));
          return;
        }
        
        resolve({
          ...result,
          duration
        });
      } catch (e) {
        reject(new Error(`Failed to parse transcription output: ${e}`));
      }
    });
  });
}
