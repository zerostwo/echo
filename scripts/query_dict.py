#! /usr/bin/env python
# -*- coding: utf-8 -*-
import sys
import json
import os
import sqlite3

# Add script directory to path to import stardict
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)

from stardict import StarDict, LemmaDB

# Paths
STARDICT_DB = os.path.join(script_dir, '../data/stardict.db')
LEMMA_TXT = os.path.join(script_dir, '../data/lemma.en.txt')

# Words that should keep their original form (not be lemmatized)
# These are common function words where lemma reverse lookup produces incorrect results
NO_LEMMATIZE = frozenset([
    'an', 'the', 'some', 'any', 'this', 'that', 'these', 'those',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'i', 'me', 'you', 'he', 'him', 'she', 'we', 'us', 'they', 'them',
    'who', 'whom', 'whose', 'which', 'what', 'where', 'when', 'why', 'how',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing', 'done',
    'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    'a', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'but', 'or', 'and', 'if', 'than', 'so', 'just', 'only', 'also',
])

def get_word_data(word, sd, lemma):
    # 1. Skip lemma reverse lookup for words in NO_LEMMATIZE list
    # These words often have incorrect lemma mappings (e.g., an -> a -> some)
    stem = word
    if word not in NO_LEMMATIZE:
        stems = lemma.get(word, reverse=True)
        if stems:
            # Use the first stem found
            stem = stems[0]
    
    # 2. Query with the stem (or original word if no stem)
    data = sd.query(stem)
    
    # 3. If not found with stem, and stem was different from word, try original word
    if data:
        data['lemma'] = stem
    else:
        # Fallback: if lemma lookup failed to find a dict entry, try the word itself
        if stem != word:
             data = sd.query(word)
             if data:
                 data['lemma'] = word 

    return data

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No words provided"}))
        return

    words = sys.argv[1:]
    
    # Check files exist
    if not os.path.exists(STARDICT_DB):
         print(json.dumps({"error": f"Database not found at {STARDICT_DB}"}))
         return
    
    try:
        sd = StarDict(STARDICT_DB, verbose=False)
        lemma = LemmaDB()
        if os.path.exists(LEMMA_TXT):
            lemma.load(LEMMA_TXT)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return

    results = {}
    for word in words:
        data = get_word_data(word, sd, lemma)
        if data:
            results[word] = data
        else:
            results[word] = None

    print(json.dumps(results, ensure_ascii=False))

if __name__ == '__main__':
    main()
