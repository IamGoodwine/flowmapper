import jsPDF from "jspdf";
import JSZip from "jszip";
import type { Screen, Connection, Section } from "./types";
import type { ThemeTokens } from "./ThemeContext";

// ── SVG Export ──────────────────────────────────────────────────────────────

export function exportSVG(
  svgEl: SVGSVGElement,
  _screens: Screen[],
  _connections: Connection[],
  _sections: Section[],
  _theme: ThemeTokens,
  _showReasons: boolean
): void {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(URL.createObjectURL(blob), "flowmapper-diagram.svg");
}

// ── PDF Export ───────────────────────────────────────────────────────────────

export async function exportPDF(
  svgEl: SVGSVGElement,
  _screens: Screen[],
  _connections: Connection[],
  _sections: Section[],
  _theme: ThemeTokens,
  _showReasons: boolean
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");

  // Wrap svg in a temporary div so html2canvas can render it
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "-9999px";
  wrapper.style.left = "-9999px";
  document.body.appendChild(wrapper);

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const bbox = svgEl.getBBox();
  clone.setAttribute("width", String(bbox.width || svgEl.clientWidth));
  clone.setAttribute("height", String(bbox.height || svgEl.clientHeight));
  wrapper.appendChild(clone);

  try {
    const canvas = await html2canvas(wrapper, { backgroundColor: null, scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save("flowmapper-diagram.pdf");
  } finally {
    document.body.removeChild(wrapper);
  }
}

// ── ZIP Export ────────────────────────────────────────────────────────────────

export function exportProjectZip(
  screens: Screen[],
  connections: Connection[],
  sections: Section[]
): void {
  const zip = new JSZip();
  const diagram = { screens, connections, sections };
  zip.file("diagram.json", JSON.stringify(diagram, null, 2));
  zip.file(
    "README.txt",
    "FlowMapper project export.\nImport diagram.json back into FlowMapper to restore your diagram.\n"
  );
  zip.generateAsync({ type: "blob" }).then((blob) => {
    triggerDownload(URL.createObjectURL(blob), "flowmapper-project.zip");
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
