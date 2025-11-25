'use client';

import { Button } from "@/components/ui/button";
import { toggleUserStatus, deleteUser } from '@/actions/admin-actions';
import { toast } from "sonner";

interface UserActionsProps {
    userId: string;
    isActive: boolean;
}

export function UserActions({ userId, isActive }: UserActionsProps) {
    
    async function handleToggle() {
        const res = await toggleUserStatus(userId, !isActive);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success(isActive ? "User disabled" : "User enabled");
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;
        
        const res = await deleteUser(userId);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success("User deleted");
        }
    }

    return (
        <>
            <Button 
                size="sm" 
                variant="ghost" 
                className="text-xs"
                onClick={handleToggle}
            >
                {isActive ? 'Disable' : 'Enable'}
            </Button>

            <Button 
                size="sm" 
                variant="ghost" 
                className="text-xs text-destructive hover:text-destructive"
                onClick={handleDelete}
            >
                Delete
            </Button>
        </>
    );
}

