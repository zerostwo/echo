import { spawn } from 'child_process';
import path from 'path';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  duration: number; // Duration in seconds
}

export async function transcribeFile(filePath: string, model: string = 'base'): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const pythonScript = path.join(process.cwd(), 'scripts', 'transcribe.py');
    
    // Check environment for python command, default to python3
    const pythonCommand = process.env.PYTHON_CMD || 'python3';
    
    const pythonProcess = spawn(pythonCommand, [pythonScript, filePath, model]);

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
