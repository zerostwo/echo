'use client';

import { HeaderPortal } from "@/components/header-portal";
import { EmptyTrashButton } from "./empty-trash-button";

export function TrashHeaderActions() {
  return (
    <HeaderPortal>
      <EmptyTrashButton />
    </HeaderPortal>
  );
}

