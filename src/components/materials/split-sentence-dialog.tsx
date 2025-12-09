
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useState, useRef, useEffect } from "react"
import { Loader2 } from "lucide-react"

interface SplitSentenceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string
  onSplit: (index: number) => Promise<void>
}

export function SplitSentenceDialog({ open, onOpenChange, content, onSplit }: SplitSentenceDialogProps) {
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [cursorPos, setCursorPos] = useState<number | null>(null)

  // Reset cursor pos when dialog opens
  useEffect(() => {
    if (open) {
      setCursorPos(null)
    }
  }, [open])

  const handleSplit = async () => {
    if (cursorPos === null) return
    setLoading(true)
    try {
      await onSplit(cursorPos)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split Sentence</DialogTitle>
          <DialogDescription>
            Click to place your cursor where you want to split the sentence.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            ref={textareaRef}
            value={content}
            className="min-h-[100px] font-mono text-base cursor-text"
            onSelect={(e) => setCursorPos(e.currentTarget.selectionStart)}
            readOnly
          />
          <div className="mt-2 text-sm text-muted-foreground">
            Split position: {cursorPos !== null ? cursorPos : "None"}
          </div>
          {cursorPos !== null && cursorPos > 0 && cursorPos < content.length && (
             <div className="mt-2 p-2 bg-muted rounded text-sm grid gap-2">
                <div>
                    <span className="font-semibold text-xs uppercase text-muted-foreground block mb-1">Part 1</span>
                    <div className="p-2 bg-background rounded border">{content.substring(0, cursorPos)}</div>
                </div>
                <div>
                    <span className="font-semibold text-xs uppercase text-muted-foreground block mb-1">Part 2</span>
                    <div className="p-2 bg-background rounded border">{content.substring(cursorPos)}</div>
                </div>
             </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSplit} disabled={loading || cursorPos === null || cursorPos === 0 || cursorPos === content.length}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
