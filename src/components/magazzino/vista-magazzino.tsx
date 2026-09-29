"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Search, Columns3, X, ArrowUp, ArrowDown, ArrowUpDown, Undo2, RotateCcw, TriangleAlert } from "lucide-react";
import type { RigaMagazzino, ColonnaOrdinabile } from "@/db/queries";
import { aggiornaCampiSkuInline } from "@/app/magazzino/actions";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import {
  CAMPI_EDITABILI_INLINE,
  type CampoEditabileInline,
  type ValoreCampoInline,
  type VoceModificaInline,
} from "@/lib/campi-inline";
import { CellTesto, CellSelect, CellMisura } from "@/components/magazzino/editable-cell";
import { campiMancanti, ETICHETTA_CAMPO_MANCANTE, SPIEGAZIONE_CAMPO_MANCANTE } from "@/lib/campi-mancanti-pubblicazione";

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

// Chiave localStorage per ricordare le colonne scelte da questo utente su
// questo Mac - preferenza personale di visualizzazione, non un dato del
// Magazzino: non sincronizzata, non salvata nel database.
const CHIAVE_COLONNE = "posterclub.magazzino.colonneVisibili.v1";

type ColonnaId =
  | "artista"
  | "opera"
  | "misura"
  | "supporto"
  | "anno"
  | "tipo"
  | "condizione"
  | "proprieta"
  | "disponibile"
  | "numeroFoto"
  | "valoreCarico"
  | "prezzoEbay"
  | "prezzoCatawiki"
  | "riservaCatawiki"
  | "tag"
  | "note"
  | "stato"
  | "creato"
  | "aggiornato"
  | "datiMancanti";

// Etichette leggibili dei campi editabili inline - usate sia nella barra di
// modifica in blocco sia nella descrizione
