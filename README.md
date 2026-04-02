# FlowMapper — Sorgente completo

Esportazione completa del progetto FlowMapper.

## Struttura

```
src/
  app/
    App.tsx                     # Componente principale
    components/
      flowmapper/              # Core FlowMapper
        types.ts               # Tipi e costanti
        layout.ts              # Algoritmo layout automatico
        smart-layout.ts        # Layout intelligente
        export-utils.ts        # Export SVG/PDF/ZIP
        undo-redo.ts           # Sistema undo/redo
        ThemeContext.tsx        # Temi e dark mode
        DiagramNode.tsx        # Nodi schermata/decisione
        DiagramEdge.tsx        # Connessioni/frecce
        DiagramSection.tsx     # Sezioni FigJam-style
        Sidebar.tsx            # Sidebar con CTA modali (tutorial + URL input)
        ToolbarMenus.tsx       # Menu e toolbar
        FlowDocReader.tsx      # Import da flow-documentation
        FlowDocHelp.tsx        # Guida con prompt AI (3 varianti)
        MakePageScanner.tsx    # Flow Builder da URL
        FlowValidator.tsx      # Validatore diagrammi
        FlowTemplates.tsx      # Template predefiniti
        LogicFlowBuilder.tsx   # Builder logico
        JsonImportExport.tsx   # Import/Export JSON
        NodePalette.tsx        # Palette nodi
        AlignTools.tsx         # Strumenti allineamento
        ScreenPreviewModal.tsx # Anteprima schermate
        LoadingOverlay.tsx     # Overlay caricamento
        mock-data.ts           # Dati di esempio
        figma-api.ts           # Integrazione Figma API
      ui/                      # Componenti UI (shadcn)
  styles/                      # CSS e temi
```

## Statistiche diagramma corrente

- Schermate: 0
- Connessioni: 0
- Sezioni: 0

## Setup

```bash
npm install
npm run dev
```

## Dipendenze principali

- React 18 + TypeScript
- Tailwind CSS v4
- jsPDF (export PDF)
- JSZip (export ZIP)
- Lucide React (icone)

Esportato il: 01 aprile 2026 alle ore 19:24