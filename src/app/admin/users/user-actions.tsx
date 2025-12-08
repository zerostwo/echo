'use client';

import { Button } from "@/components/ui/button";
import { toggleUserStatus, deleteUser, updateUserRole } from '@/actions/admin-actions';
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

interface UserActionsProps {
    userId: string;
    isActive: boolean;
    role: string;
}

export function UserActions({ userId, isActive, role }: UserActionsProps) {
    
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

    async function handleRoleChange(newRole: string) {
        const res = await updateUserRole(userId, newRole);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success(`Role updated to ${newRole}`);
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(userId)}>
                    Copy ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup value={role} onValueChange={handleRoleChange}>
                            <DropdownMenuRadioItem value="USER">User</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="ADMIN">Admin</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="PRO">Pro (Future)</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={handleToggle}>
                    {isActive ? 'Disable User' : 'Enable User'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
                    Delete User
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

