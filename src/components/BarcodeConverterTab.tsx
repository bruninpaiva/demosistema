import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FileUp, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const BARCODE_REGEX = /\b\d{8,14}\b/g;

async function extractCodesFromPdf(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const codes: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it: any) => it.str).join("\n");
    const pageCodes = pageText.match(BARCODE_REGEX) ?? [];

    // PDFs desse fornecedor às vezes repetem a lista inteira da página duas vezes
    // (camada de texto + render da imagem). Se a página dividir em duas metades
    // idênticas, ficamos só com a primeira.
    if (pageCodes.length > 0 && pageCodes.length % 2 === 0) {
      const half = pageCodes.length / 2;
      const first = pageCodes.slice(0, half);
      const second = pageCodes.slice(half);
      if (first.join(",") === second.join(",")) {
        codes.push(...first);
        continue;
      }
    }
    codes.push(...pageCodes);
  }

  return codes;
}

function downloadCsv(filename: string, lines: string[]) {
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type FileResult = { name: string; codes: string[] };

export default function BarcodeConverterTab() {
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);

  const allCodes = results.flatMap((r) => r.codes);

  const quantities = allCodes.reduce<Map<string, number>>((map, code) => {
    map.set(code, (map.get(code) ?? 0) + 1);
    return map;
  }, new Map());

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const newResults: FileResult[] = [];
      for (const file of Array.from(fileList)) {
        const codes = await extractCodesFromPdf(file);
        newResults.push({ name: file.name, codes });
      }
      setResults((prev) => [...prev, ...newResults]);
      const total = newResults.reduce((s, r) => s + r.codes.length, 0);
      toast.success(`${total} código(s) extraído(s)`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível ler o PDF. Confira se o arquivo não está corrompido.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => setResults([]);

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="mb-1 text-lg font-bold">Conversor de código de barras</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Selecione um ou mais PDFs com os códigos de barra escaneados. Os códigos são extraídos
          direto no navegador — nada é enviado para nenhum servidor.
        </p>
        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background px-6 py-8 text-muted-foreground hover:border-brand hover:text-brand">
          <FileUp size={22} />
          <span className="font-semibold">{busy ? "Lendo PDF..." : "Clique para selecionar o(s) PDF(s)"}</span>
          <input
            type="file"
            accept="application/pdf"
            multiple
            disabled={busy}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {results.length > 0 && (
        <div className="mb-6 rounded-2xl bg-card p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{allCodes.length} código(s) — {quantities.size} único(s)</p>
              <p className="text-sm text-muted-foreground">
                {results.map((r) => r.name).join(", ")}
              </p>
            </div>
            <button
              onClick={clear}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={16} /> Limpar
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => downloadCsv("codigos.csv", allCodes)}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-bold text-brand-foreground"
            >
              <Download size={18} /> CSV — código por linha
            </button>
            <button
              onClick={() =>
                downloadCsv(
                  "codigos_com_quantidade.csv",
                  Array.from(quantities.entries()).map(([code, qtd]) => `${code};${qtd}`),
                )
              }
              className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 font-bold"
            >
              <Download size={18} /> CSV — código;quantidade
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
