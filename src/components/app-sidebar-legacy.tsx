'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Library, Mic2, Settings, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { signOut } from 'next-auth/react';
import { FolderNav } from './folder-nav';

interface SidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role: string;
    };
    folders: any[];
}

export function AppSidebar({ user, folders }: SidebarProps) {
    const pathname = usePathname();
    
    const routes = [
        {
            label: 'Dashboard',
            icon: LayoutDashboard,
            href: '/dashboard',
            color: "text-sky-500",
        },
        {
            label: 'Materials',
            icon: Library,
            href: '/materials',
            color: "text-violet-500",
        },
        {
            label: 'Vocabulary',
            icon: Mic2, 
            href: '/vocab',
            color: "text-pink-700",
        },
    ];

    if (user.role === 'ADMIN') {
        routes.push({
            label: 'Admin',
            icon: Settings, 
            href: '/admin/users',
            color: "text-orange-700",
        });
    }

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-gray-900 text-white">
            <div className="px-3 py-2 flex-1 overflow-y-auto">
                <Link href="/dashboard" className="flex items-center pl-3 mb-14">
                    <div className="relative w-8 h-8 mr-4">
                        <div className="absolute bg-white rounded-full inset-0 flex items-center justify-center font-bold text-black">D</div>
                    </div>
                    <h1 className="text-2xl font-bold">
                        Echo
                    </h1>
                </Link>
                <div className="space-y-1 mb-8">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname === route.href || (route.href !== '/dashboard' && pathname.startsWith(route.href) && !pathname.includes('folderId')) ? "text-white bg-white/10" : "text-zinc-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>

                {/* Folders Section */}
                <FolderNav folders={folders} />
            </div>
            <div className="px-3 py-2 border-t border-gray-800 mt-auto">
                 <div className="flex items-center p-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-white font-bold mr-3">
                        {user.name?.[0] || user.email?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                        <p className="text-xs text-zinc-400 truncate">{user.email}</p>
                    </div>
                 </div>
                 <Button 
                    variant="ghost" 
                    className="w-full justify-start text-zinc-400 hover:text-white hover:bg-white/10"
                    onClick={() => signOut()}
                 >
                    <LogOut className="h-5 w-5 mr-3" />
                    Logout
                 </Button>
            </div>
        </div>
    );
}
