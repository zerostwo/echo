#! /opt/miniforge3/envs/deeplisten/bin/python
import sys
import json
import whisper
import warnings
import os

# Filter warnings
warnings.filterwarnings("ignore")

def transcribe(file_path, model_name="turbo"):
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}), file=sys.stderr)
        sys.exit(1)

    try:
        model = whisper.load_model(model_name)
        # Enable word_timestamps to get precise timing
        result = model.transcribe(file_path, word_timestamps=True)
        
        segments = []
        for s in result["segments"]:
            text = s["text"].strip()
            if not text:
                continue
            
            # Use word-level timestamps to trim silence if available
            start = s["start"]
            end = s["end"]
            
            if "words" in s and s["words"]:
                # First word start and last word end
                start = s["words"][0]["start"]
                end = s["words"][-1]["end"]
            
            # Sanitize timestamps to prevent NaN/Infinity
            try:
                start = float(start)
                if start != start: start = 0.0 # NaN check
                if start == float('inf') or start == float('-inf'): start = 0.0
                
                end = float(end)
                if end != end: end = 0.0 # NaN check
                if end == float('inf') or end == float('-inf'): end = 0.0
            except:
                start = 0.0
                end = 0.0
            
            segments.append({
                "start": start,
                "end": end,
                "text": text
            })

        # Output relevant data
        output = {
            "text": result["text"],
            "segments": segments
        }
        print(json.dumps(output))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python transcribe.py <file_path> [model]")
        sys.exit(1)
    
    file_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "base"
    transcribe(file_path, model)
