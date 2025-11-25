'use client';
import { Button } from "@/components/ui/button";

export function AnkiExportButton({ words }: { words: any[] }) {
    const handleExport = () => {
        // Generate CSV
        const csvContent = "data:text/csv;charset=utf-8," 
            + words.map(w => {
                const text = w.word.text;
                const example = w.word.occurrences[0]?.sentence.content.replace(/"/g, '""') || "";
                return `${text},"${example}"`;
            }).join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "vocabulary.csv");
        document.body.appendChild(link);
        link.click();
    };

    return (
        <Button onClick={handleExport} variant="outline">Export to Anki (CSV)</Button>
    )
}

