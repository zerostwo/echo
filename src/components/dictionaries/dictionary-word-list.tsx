"use client"

import { removeWordsFromDictionary } from "@/actions/dictionary-actions"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

export function DictionaryWordList({ dictionary }: { dictionary: any }) {
  async function onRemove(wordId: string) {
    try {
      await removeWordsFromDictionary(dictionary.id, [wordId])
      toast.success("Word removed")
    } catch (error) {
      toast.error("Failed to remove word")
    }
  }

  if (dictionary.words.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-lg">
        No words in this dictionary yet.
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Word</TableHead>
            <TableHead>Translation</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dictionary.words.map((dw: any) => (
            <TableRow key={dw.word.id}>
              <TableCell className="font-medium">{dw.word.text}</TableCell>
              <TableCell>{dw.word.translation}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(dw.word.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
