'use client';
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateQuota } from "@/actions/admin-actions";
import { useState } from "react";
import { toast } from "sonner";

export function UserQuotaDialog({ userId, currentQuotaGB }: any) {
    const [open, setOpen] = useState(false);
    const [quota, setQuota] = useState(currentQuotaGB);

    const handleSave = async () => {
        await updateQuota(userId, Number(quota));
        toast.success("Quota updated");
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline">Edit Quota</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Update Quota (GB)</DialogTitle>
                </DialogHeader>
                <div className="flex gap-4 py-4">
                    <Input type="number" value={quota} onChange={e => setQuota(e.target.value)} />
                    <Button onClick={handleSave}>Save</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

