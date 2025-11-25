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

def get_word_data(word, sd, lemma):
    # 1. Always try lemma reverse lookup first to find the base form
    stems = lemma.get(word, reverse=True)
    stem = word
    if stems:
        # Use the first stem found
        stem = stems[0]
    
    # 2. Query with the stem (or original word if no stem)
    data = sd.query(stem)
    
    # 3. If not found with stem, and stem was different from word, try original word?
    # The requirement emphasizes using the prototype. 
    # But if prototype is not in dictionary (weird case), maybe fallback?
    # Let's stick to the requirement: "restored by lemma... then use this prototype to query"
    
    if data:
        data['lemma'] = stem
        # Ensure the returned data indicates the actual word found (which is the lemma)
        # data['word'] usually contains the word from DB
    else:
        # Fallback: if lemma lookup failed to find a dict entry, try the word itself
        # This handles cases where lemma.get returns something that isn't in the dict,
        # or if the word itself is the main entry and lemma logic missed it (unlikely if lemma DB is good).
        # But for robustness:
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
