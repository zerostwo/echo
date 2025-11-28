#! /usr/bin/env python
# -*- coding: utf-8 -*-
"""
Transcription script supporting both OpenAI Whisper and Faster-Whisper.
Includes sentence segmentation based on punctuation and short sentence merging.
"""
import sys
import json
import warnings
import os
import re
from typing import List, Dict, Any, Optional

# Filter warnings
warnings.filterwarnings("ignore")

# Strong punctuation marks for sentence boundaries
STRONG_PUNCTUATION_EN = {'.', '?', '!', '?!', '!?'}
STRONG_PUNCTUATION_CN = {'。', '！', '？', '！？', '？！'}
ALL_STRONG_PUNCTUATION = STRONG_PUNCTUATION_EN | STRONG_PUNCTUATION_CN

# Regex pattern for sentence-ending punctuation
SENTENCE_END_PATTERN = re.compile(r'[.?!。！？]+$')
# Pattern to detect strong punctuation anywhere in text
STRONG_PUNCT_PATTERN = re.compile(r'([.?!。！？][?!？！]?)')


def is_sentence_end(text: str) -> bool:
    """Check if text ends with strong punctuation."""
    text = text.strip()
    return bool(SENTENCE_END_PATTERN.search(text))


def count_words(text: str) -> int:
    """Count words in text (handles both English and Chinese)."""
    # For English: split by whitespace
    # For Chinese: count each character as a word
    text = text.strip()
    if not text:
        return 0
    
    # Simple heuristic: if mostly ASCII, count by spaces; otherwise count chars
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    if ascii_chars > len(text) * 0.5:
        # Mostly English
        return len(text.split())
    else:
        # Mostly Chinese or mixed - count non-space characters
        return len([c for c in text if not c.isspace()])


def split_on_punctuation(words: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """
    Split word list into sentences based on strong punctuation.
    Each word dict should have: word, start, end
    """
    if not words:
        return []
    
    sentences = []
    current_sentence = []
    
    for word_info in words:
        word_text = word_info.get('word', '').strip()
        current_sentence.append(word_info)
        
        # Check if this word ends with strong punctuation
        if is_sentence_end(word_text):
            sentences.append(current_sentence)
            current_sentence = []
    
    # Don't forget remaining words
    if current_sentence:
        sentences.append(current_sentence)
    
    return sentences


def merge_short_sentences(sentences: List[List[Dict[str, Any]]], 
                          min_words: int = 3,
                          max_gap: float = 1.0) -> List[List[Dict[str, Any]]]:
    """
    Merge short sentences with adjacent ones if they are too short
    and have small time gaps.
    
    Args:
        sentences: List of sentence word lists
        min_words: Minimum word count for a standalone sentence
        max_gap: Maximum time gap (seconds) to allow merging
    """
    if len(sentences) <= 1:
        return sentences
    
    merged = []
    i = 0
    
    while i < len(sentences):
        current = sentences[i]
        current_word_count = sum(count_words(w.get('word', '')) for w in current)
        
        # If sentence is too short, try to merge
        if current_word_count < min_words and i + 1 < len(sentences):
            next_sentence = sentences[i + 1]
            
            # Calculate time gap
            current_end = current[-1].get('end', 0) if current else 0
            next_start = next_sentence[0].get('start', 0) if next_sentence else 0
            gap = next_start - current_end
            
            # Merge if gap is small
            if gap <= max_gap:
                # Merge current into next
                merged_sentence = current + next_sentence
                sentences[i + 1] = merged_sentence
                i += 1
                continue
        
        # Also check if previous merge candidate exists
        if merged and current_word_count < min_words:
            prev = merged[-1]
            prev_end = prev[-1].get('end', 0) if prev else 0
            current_start = current[0].get('start', 0) if current else 0
            gap = current_start - prev_end
            
            if gap <= max_gap:
                # Merge with previous
                merged[-1] = prev + current
                i += 1
                continue
        
        merged.append(current)
        i += 1
    
    return merged


def words_to_segments(sentence_words: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Convert word groups to segment format with start, end, text."""
    segments = []
    
    for words in sentence_words:
        if not words:
            continue
        
        text = ' '.join(w.get('word', '').strip() for w in words)
        # Clean up extra spaces around punctuation
        text = re.sub(r'\s+([.,!?;:。，！？；：])', r'\1', text)
        text = text.strip()
        
        if not text:
            continue
        
        start = words[0].get('start', 0)
        end = words[-1].get('end', 0)
        
        # Sanitize timestamps
        try:
            start = float(start)
            if start != start:  # NaN check
                start = 0.0
            if start == float('inf') or start == float('-inf'):
                start = 0.0
        except:
            start = 0.0
        
        try:
            end = float(end)
            if end != end:  # NaN check
                end = 0.0
            if end == float('inf') or end == float('-inf'):
                end = 0.0
        except:
            end = 0.0
        
        segments.append({
            'start': start,
            'end': end,
            'text': text
        })
    
    return segments


def process_segments_with_sentence_split(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Process raw segments from Whisper by splitting on strong punctuation
    and merging short sentences.
    
    This function handles the case where word-level timestamps are not available.
    """
    all_words = []
    
    for seg in segments:
        text = seg.get('text', '').strip()
        if not text:
            continue
        
        # If we have word-level timestamps, use them
        if 'words' in seg and seg['words']:
            for w in seg['words']:
                all_words.append({
                    'word': w.get('word', '').strip(),
                    'start': w.get('start', seg.get('start', 0)),
                    'end': w.get('end', seg.get('end', 0))
                })
        else:
            # No word timestamps, treat each segment as potential multi-sentence
            # Split text on punctuation
            parts = STRONG_PUNCT_PATTERN.split(text)
            
            if len(parts) <= 1:
                # Single sentence or no strong punctuation
                all_words.append({
                    'word': text,
                    'start': seg.get('start', 0),
                    'end': seg.get('end', 0)
                })
            else:
                # Multiple parts - distribute timing proportionally
                duration = seg.get('end', 0) - seg.get('start', 0)
                total_len = sum(len(p) for p in parts if p.strip())
                current_time = seg.get('start', 0)
                
                current_text = ""
                for part in parts:
                    if not part:
                        continue
                    
                    if STRONG_PUNCT_PATTERN.match(part):
                        # This is punctuation, append to current text
                        current_text += part
                        if current_text.strip():
                            part_duration = (len(current_text) / max(total_len, 1)) * duration
                            all_words.append({
                                'word': current_text.strip(),
                                'start': current_time,
                                'end': current_time + part_duration
                            })
                            current_time += part_duration
                            current_text = ""
                    else:
                        current_text = part
                
                # Handle remaining text
                if current_text.strip():
                    all_words.append({
                        'word': current_text.strip(),
                        'start': current_time,
                        'end': seg.get('end', 0)
                    })
    
    # Split into sentences
    sentence_groups = split_on_punctuation(all_words)
    
    # Merge short sentences
    merged_groups = merge_short_sentences(sentence_groups, min_words=3, max_gap=1.0)
    
    # Convert to segments
    return words_to_segments(merged_groups)


def transcribe_openai_whisper(file_path: str, model_name: str = "base", 
                               language: Optional[str] = None) -> Dict[str, Any]:
    """Transcribe using OpenAI Whisper."""
    import whisper
    
    model = whisper.load_model(model_name)
    
    transcribe_options = {
        'word_timestamps': True,
    }
    if language:
        transcribe_options['language'] = language
    
    result = model.transcribe(file_path, **transcribe_options)
    
    # Collect all words with timestamps
    all_words = []
    for seg in result.get('segments', []):
        if 'words' in seg and seg['words']:
            for w in seg['words']:
                all_words.append({
                    'word': w.get('word', '').strip(),
                    'start': w.get('start', seg.get('start', 0)),
                    'end': w.get('end', seg.get('end', 0))
                })
        else:
            # Fallback to segment-level
            all_words.append({
                'word': seg.get('text', '').strip(),
                'start': seg.get('start', 0),
                'end': seg.get('end', 0)
            })
    
    # Apply sentence splitting and merging
    sentence_groups = split_on_punctuation(all_words)
    merged_groups = merge_short_sentences(sentence_groups, min_words=3, max_gap=1.0)
    segments = words_to_segments(merged_groups)
    
    return {
        'text': result.get('text', ''),
        'segments': segments,
        'language': result.get('language', 'en')
    }


def transcribe_faster_whisper(file_path: str, model_name: str = "base",
                               language: Optional[str] = None,
                               vad_filter: bool = True,
                               compute_type: str = "auto",
                               device: str = "auto") -> Dict[str, Any]:
    """Transcribe using Faster-Whisper with VAD filter support."""
    from faster_whisper import WhisperModel
    
    # Get model download directory from environment
    model_dir = os.environ.get('WHISPER_MODEL_DIR')
    
    # Auto-detect device
    if device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"
    
    # Auto-detect compute type
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    
    model_kwargs = {
        'device': device,
        'compute_type': compute_type
    }
    if model_dir:
        model_kwargs['download_root'] = model_dir
    
    model = WhisperModel(model_name, **model_kwargs)
    
    transcribe_options = {
        'word_timestamps': True,
        'vad_filter': vad_filter,
    }
    
    if vad_filter:
        # VAD parameters for better silence filtering
        transcribe_options['vad_parameters'] = {
            'min_silence_duration_ms': 500,  # Minimum silence to split
            'speech_pad_ms': 200,  # Padding around speech
        }
    
    if language:
        transcribe_options['language'] = language
    
    segments_iter, info = model.transcribe(file_path, **transcribe_options)
    
    # Collect all words with timestamps
    all_words = []
    raw_segments = []
    
    for seg in segments_iter:
        raw_segments.append({
            'start': seg.start,
            'end': seg.end,
            'text': seg.text
        })
        
        if seg.words:
            for w in seg.words:
                all_words.append({
                    'word': w.word.strip(),
                    'start': w.start,
                    'end': w.end
                })
        else:
            # Fallback to segment-level
            all_words.append({
                'word': seg.text.strip(),
                'start': seg.start,
                'end': seg.end
            })
    
    # Apply sentence splitting and merging
    sentence_groups = split_on_punctuation(all_words)
    merged_groups = merge_short_sentences(sentence_groups, min_words=3, max_gap=1.0)
    segments = words_to_segments(merged_groups)
    
    # Build full text
    full_text = ' '.join(seg['text'] for seg in segments)
    
    return {
        'text': full_text,
        'segments': segments,
        'language': info.language if info else 'en'
    }


def transcribe(file_path: str, 
               engine: str = "faster-whisper",
               model_name: str = "base",
               language: Optional[str] = None,
               vad_filter: bool = True,
               compute_type: str = "auto",
               device: str = "auto") -> Dict[str, Any]:
    """
    Main transcription function supporting multiple engines.
    
    Args:
        file_path: Path to audio/video file
        engine: "faster-whisper" or "openai-whisper"
        model_name: Whisper model name (tiny, base, small, medium, large, turbo)
        language: Optional language code (e.g., 'en', 'zh')
        vad_filter: Enable VAD filter (faster-whisper only)
        compute_type: Computation precision (auto, float16, int8, int8_float16)
        device: Device to use (auto, cpu, cuda)
    
    Returns:
        Dict with text, segments, and language
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    if engine == "faster-whisper":
        return transcribe_faster_whisper(
            file_path, 
            model_name=model_name,
            language=language,
            vad_filter=vad_filter,
            compute_type=compute_type,
            device=device
        )
    elif engine == "openai-whisper":
        return transcribe_openai_whisper(
            file_path,
            model_name=model_name,
            language=language
        )
    else:
        raise ValueError(f"Unknown engine: {engine}. Use 'faster-whisper' or 'openai-whisper'")


def main():
    if len(sys.argv) < 2:
        print("Usage: python transcribe.py <file_path> [options_json]")
        print("  options_json: JSON string with engine, model, language, vad_filter, compute_type, device")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    # Parse options
    options = {}
    if len(sys.argv) > 2:
        try:
            options = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            # Legacy: treat as model name
            options = {'model': sys.argv[2]}
    
    engine = options.get('engine', 'faster-whisper')
    model = options.get('model', 'base')
    language = options.get('language')
    vad_filter = options.get('vad_filter', True)
    compute_type = options.get('compute_type', 'auto')
    device = options.get('device', 'auto')
    
    try:
        result = transcribe(
            file_path,
            engine=engine,
            model_name=model,
            language=language,
            vad_filter=vad_filter,
            compute_type=compute_type,
            device=device
        )
        
        # Add transcription metadata
        result['metadata'] = {
            'engine': engine,
            'model': model,
            'vad_filter': vad_filter if engine == 'faster-whisper' else None,
            'compute_type': compute_type if engine == 'faster-whisper' else None,
        }
        
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
