"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { eliminaSku } from "@/app/magazzino/actions";

export function EliminaSkuButton({
  skuId,
  skuCode,
}: {
  skuId: number;
  skuCode: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 /> Elimina sku
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminare {skuCode}?</DialogTitle>
          <DialogDescription>
            Azione irreversibile: vengono cancellati lo sku, le foto in
            galleria (i file restano su Shopify CDN) e tutto il registro
            movimenti collegato. Non e&apos; possibile annullare.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annulla</Button>
          </DialogClose>
          <form action={eliminaSku}>
            <input type="hidden" name="id" value={skuId} />
            <Button type="submit" variant="destructive">
              Elimina definitivamente
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
