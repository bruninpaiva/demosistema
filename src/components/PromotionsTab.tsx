import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Filter, Download, Trash2, History, FileSpreadsheet, X, Check, Search, Undo2, ListX, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ---------- Header normalization ----------
function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const FIELD_KEYS = {
  DATA: "DATA STATUS/LANCAMENTO",
  LINHA: "LINHA",
  TIPO: "TIPO",
  GENERO: "GENERO",
  FAIXA: "FAIXA ETARIA",
  MARCA: "MARCA",
  COLECAO: "COLECAO",
  STATUS: "STATUS",
  SALDO: "SALDO",
  CODIGO: "CODIGO AUXILIAR",
  DESCRICAO: "DESCRICAO",
  PRECO: "PRECO DE VENDA",
} as const;

const HEADER_ALIASES: Record<string, string> = {
  "DATA STATUS/LANCAMENTO": FIELD_KEYS.DATA,
  "DATA STATUS / LANCAMENTO": FIELD_KEYS.DATA,
  "DATA STATUS LANCAMENTO": FIELD_KEYS.DATA,
  "DATA LANCAMENTO": FIELD_KEYS.DATA,
  "DATA DE LANCAMENTO": FIELD_KEYS.DATA,
  "LINHA": FIELD_KEYS.LINHA,
  "TIPO": FIELD_KEYS.TIPO,
  "GENERO": FIELD_KEYS.GENERO,
  "GÊNERO": FIELD_KEYS.GENERO,
  "FAIXA ETARIA": FIELD_KEYS.FAIXA,
  "FAIXA ETÁRIA": FIELD_KEYS.FAIXA,
  "FAIXA": FIELD_KEYS.FAIXA,
  "IDADE": FIELD_KEYS.FAIXA,
  "MARCA": FIELD_KEYS.MARCA,
  "COLECAO": FIELD_KEYS.COLECAO,
  "COLEÇÃO": FIELD_KEYS.COLECAO,
  "STATUS": FIELD_KEYS.STATUS,
  "SALDO": FIELD_KEYS.SALDO,
  "SALDO ESTOQUE": FIELD_KEYS.SALDO,
  "ESTOQUE": FIELD_KEYS.SALDO,
  "CODIGO AUXILIAR": FIELD_KEYS.CODIGO,
  "CÓDIGO AUXILIAR": FIELD_KEYS.CODIGO,
  "COD AUXILIAR": FIELD_KEYS.CODIGO,
  "COD. AUXILIAR": FIELD_KEYS.CODIGO,
  "DESCRICAO": FIELD_KEYS.DESCRICAO,
  "DESCRIÇÃO": FIELD_KEYS.DESCRICAO,
  "DESCRICAO PRODUTO": FIELD_KEYS.DESCRICAO,
  "DESCRIÇÃO PRODUTO": FIELD_KEYS.DESCRICAO,
  "DESCRICAO DO PRODUTO": FIELD_KEYS.DESCRICAO,
  "DESCRIÇÃO DO PRODUTO": FIELD_KEYS.DESCRICAO,
  "PRECO DE VENDA": FIELD_KEYS.PRECO,
  "PREÇO DE VENDA": FIELD_KEYS.PRECO,
  "PRECO VENDA": FIELD_KEYS.PRECO,
  "PREÇO VENDA": FIELD_KEYS.PRECO,
  "VALOR DE VENDA": FIELD_KEYS.PRECO,
};

type Row = Record<string, string>;

function parseFile(file: File): Promise<{ headers: string[]; rows: Row[]; headerMap: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        const data = reader.result as ArrayBuffer;
        const wb = XLSX.read(data, { type: "array", raw: true, cellDates: false, cellText: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
        if (!json.length) {
          resolve({ headers: [], rows: [], headerMap: {} });
          return;
        }
        const headers = Object.keys(json[0]);
        const headerMap: Record<string, string> = {};
        for (const h of headers) {
          const key = HEADER_ALIASES[norm(h)];
          if (key) headerMap[key] = h;
        }
        resolve({ headers, rows: json, headerMap });
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseBRDate(v: string): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10) - 1;
    let y = parseInt(m1[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) {
    const dt = new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function parseNum(v: string): number | null {
  if (v == null || v === "") return null;
  const s = String(v).replace(/\./g, "").replace(",", ".").trim();
  const n = Number(s);
  return isNaN(n) ? null : n;
}

type SaldoOp = ">" | "<" | "=" | ">=" | "<=";

const MULTI_FIELDS: Array<{ key: string; label: string }> = [
  { key: FIELD_KEYS.LINHA, label: "Linha" },
  { key: FIELD_KEYS.FAIXA, label: "Faixa etária" },
  { key: FIELD_KEYS.GENERO, label: "Gênero" },
  { key: FIELD_KEYS.STATUS, label: "Status" },
  { key: FIELD_KEYS.TIPO, label: "Tipo" },
  { key: FIELD_KEYS.MARCA, label: "Marca" },
  { key: FIELD_KEYS.COLECAO, label: "Coleção" },
];

export default function PromotionsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);

  const [years, setYears] = useState<Set<string>>(new Set());
  const [multi, setMulti] = useState<Record<string, Set<string>>>({});
  const [saldoOp, setSaldoOp] = useState<SaldoOp>(">=");
  const [saldoVal, setSaldoVal] = useState<string>("");

  const [discount, setDiscount] = useState<string>("50");
  const [outName, setOutName] = useState<string>("");

  const [history, setHistory] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Manual exclusion — keyed by CODIGO AUXILIAR string
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [lastBulkExcluded, setLastBulkExcluded] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const [view, setView] = useState<"produtos" | "codigos" | "csv">("produtos");
  const [tableQ, setTableQ] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const loadHistory = async () => {
    const { data } = await (supabase as any)
      .from("promo_exports")
      .select("id,created_at,file_name,discount,product_count,filters,csv_content")
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory(data ?? []);
  };
  useEffect(() => { loadHistory(); }, []);

  // Row test with option to skip one filter dimension (for cascading option lists)
  const rowPasses = (r: Row, skip?: "years" | "saldo" | string): boolean => {
    const dateCol = headerMap[FIELD_KEYS.DATA];
    if (skip !== "years" && dateCol && years.size > 0) {
      const d = parseBRDate(String(r[dateCol] ?? ""));
      if (!d) return false;
      if (!years.has(String(d.getFullYear()))) return false;
    }
    for (const f of MULTI_FIELDS) {
      if (skip === f.key) continue;
      const sel = multi[f.key];
      if (!sel || sel.size === 0) continue;
      const col = headerMap[f.key];
      if (!col) return false;
      const v = String(r[col] ?? "").trim();
      if (!sel.has(v)) return false;
    }
    const saldoCol = headerMap[FIELD_KEYS.SALDO];
    const saldoNum = saldoVal.trim() === "" ? null : parseNum(saldoVal);
    if (skip !== "saldo" && saldoCol && saldoNum != null) {
      const n = parseNum(String(r[saldoCol] ?? ""));
      if (n == null) return false;
      switch (saldoOp) {
        case ">": if (!(n > saldoNum)) return false; break;
        case "<": if (!(n < saldoNum)) return false; break;
        case "=": if (!(n === saldoNum)) return false; break;
        case ">=": if (!(n >= saldoNum)) return false; break;
        case "<=": if (!(n <= saldoNum)) return false; break;
      }
    }
    return true;
  };

  const distinct = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of MULTI_FIELDS) {
      const col = headerMap[f.key];
      if (!col) { out[f.key] = []; continue; }
      const set = new Set<string>();
      for (const r of rows) {
        if (!rowPasses(r, f.key)) continue;
        const v = String(r[col] ?? "").trim();
        if (v) set.add(v);
      }
      out[f.key] = Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, headerMap, years, multi, saldoOp, saldoVal]);

  const availableYears = useMemo(() => {
    const col = headerMap[FIELD_KEYS.DATA];
    if (!col) return [];
    const set = new Set<string>();
    for (const r of rows) {
      if (!rowPasses(r, "years")) continue;
      const d = parseBRDate(String(r[col] ?? ""));
      if (d) set.add(String(d.getFullYear()));
    }
    return Array.from(set).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, headerMap, years, multi, saldoOp, saldoVal]);

  const filtered = useMemo(() => {
    if (!rows.length) return [];
    const dateCol = headerMap[FIELD_KEYS.DATA];
    const saldoCol = headerMap[FIELD_KEYS.SALDO];
    const saldoNum = saldoVal.trim() === "" ? null : parseNum(saldoVal);

    return rows.filter((r) => {
      if (dateCol && years.size > 0) {
        const d = parseBRDate(String(r[dateCol] ?? ""));
        if (!d) return false;
        if (!years.has(String(d.getFullYear()))) return false;
      }
      for (const f of MULTI_FIELDS) {
        const sel = multi[f.key];
        if (!sel || sel.size === 0) continue;
        const col = headerMap[f.key];
        if (!col) return false;
        const v = String(r[col] ?? "").trim();
        if (!sel.has(v)) return false;
      }
      if (saldoCol && saldoNum != null) {
        const n = parseNum(String(r[saldoCol] ?? ""));
        if (n == null) return false;
        switch (saldoOp) {
          case ">": if (!(n > saldoNum)) return false; break;
          case "<": if (!(n < saldoNum)) return false; break;
          case "=": if (!(n === saldoNum)) return false; break;
          case ">=": if (!(n >= saldoNum)) return false; break;
          case "<=": if (!(n <= saldoNum)) return false; break;
        }
      }
      return true;
    });
  }, [rows, headerMap, years, multi, saldoOp, saldoVal]);

  const codigoCol = headerMap[FIELD_KEYS.CODIGO];

  const exportable = useMemo(() => {
    if (!codigoCol) return filtered;
    return filtered.filter((r) => !excluded.has(String(r[codigoCol] ?? "").trim()));
  }, [filtered, excluded, codigoCol]);

  const removedInFilterCount = filtered.length - exportable.length;

  const suggestedName = useMemo(() => {
    const parts: string[] = ["PROMO"];
    if (discount) parts.push(String(discount));
    const linhas = multi[FIELD_KEYS.LINHA];
    if (linhas && linhas.size > 0) {
      parts.push(Array.from(linhas).slice(0, 3).map((s) => norm(s).replace(/[^A-Z0-9]+/g, "")).join("_"));
    }
    if (years.size > 0) parts.push(Array.from(years).sort().join("-"));
    return parts.filter(Boolean).join("_") + ".csv";
  }, [discount, multi, years]);

  const finalName = (outName.trim() || suggestedName).replace(/\.csv$/i, "") + ".csv";

  const handleFile = async (f: File) => {
    setParsing(true);
    try {
      const { rows: r, headerMap: hm } = await parseFile(f);
      setRows(r);
      setHeaderMap(hm);
      setFileName(f.name);
      setMulti({});
      setYears(new Set());
      setSaldoVal("");
      setExcluded(new Set());
      setSelected(new Set());
      setLastBulkExcluded(null);
      const missing = ["CODIGO"].filter((k) => !hm[(FIELD_KEYS as any)[k]]);
      if (missing.length) toast.warning(`Coluna "CODIGO AUXILIAR" não encontrada — verifique o arquivo.`);
      else toast.success(`${r.length.toLocaleString("pt-BR")} linhas importadas.`);
    } catch (e: any) {
      toast.error("Erro ao ler arquivo: " + (e?.message ?? String(e)));
    } finally {
      setParsing(false);
    }
  };

  const toggleMulti = (key: string, val: string) => {
    setMulti((prev) => {
      const next = { ...prev };
      const s = new Set(next[key] ?? []);
      if (s.has(val)) s.delete(val); else s.add(val);
      next[key] = s;
      return next;
    });
  };

  const buildCsv = (): string => {
    if (!codigoCol) return "";
    const d = String(parseInt(discount, 10) || 0);
    const lines: string[] = [];
    for (const r of exportable) {
      const cod = String(r[codigoCol] ?? "").trim();
      if (!cod) continue;
      lines.push(`${cod};${d}`);
    }
    return lines.join("\r\n") + "\r\n";
  };

  const downloadCsv = (name: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filtersSummary = () => {
    const out: any = {};
    if (years.size > 0) out.anos = Array.from(years).sort();
    for (const f of MULTI_FIELDS) {
      const s = multi[f.key];
      if (s && s.size) out[f.label] = Array.from(s);
    }
    if (saldoVal.trim() !== "") out.saldo = `${saldoOp} ${saldoVal}`;
    if (removedInFilterCount > 0) out.removidos_manualmente = removedInFilterCount;
    return out;
  };

  const generate = async () => {
    if (!exportable.length) { toast.error("Nenhum produto para exportar."); return; }
    const disc = parseInt(discount, 10);
    if (!disc || disc <= 0 || disc > 100) { toast.error("Informe um desconto válido (1-100)."); return; }
    const csv = buildCsv();
    if (!csv.trim()) { toast.error("Não foi possível gerar o CSV — CODIGO AUXILIAR ausente."); return; }
    downloadCsv(finalName, csv);
    const { error } = await (supabase as any).from("promo_exports").insert({
      file_name: finalName,
      discount: disc,
      product_count: exportable.length,
      filters: filtersSummary(),
      csv_content: csv,
    });
    if (error) toast.error("CSV baixado, mas falhou ao salvar histórico.");
    else { toast.success("Arquivo gerado e salvo no histórico."); loadHistory(); }
  };

  const removeHistory = async (id: string) => {
    if (!confirm("Excluir esta promoção do histórico?")) return;
    const { error } = await (supabase as any).from("promo_exports").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir.");
    else loadHistory();
  };

  const clearAll = () => {
    setRows([]); setHeaderMap({}); setFileName(""); setMulti({});
    setYears(new Set()); setSaldoVal(""); setOutName("");
    setExcluded(new Set()); setSelected(new Set()); setLastBulkExcluded(null);
  };

  // Exclusion actions
  const excludeCode = (code: string) => {
    setExcluded((prev) => { const n = new Set(prev); n.add(code); return n; });
  };
  const restoreCode = (code: string) => {
    setExcluded((prev) => { const n = new Set(prev); n.delete(code); return n; });
  };
  const excludeSelected = () => {
    if (selected.size === 0) return;
    setExcluded((prev) => {
      const n = new Set(prev);
      for (const c of selected) n.add(c);
      return n;
    });
    toast.success(`${selected.size} produto(s) removidos da promoção.`);
    setSelected(new Set());
  };
  const restoreAll = () => {
    if (excluded.size === 0) return;
    if (!confirm("Restaurar todos os produtos excluídos?")) return;
    setExcluded(new Set());
    setLastBulkExcluded(null);
    toast.success("Todas as exclusões foram desfeitas.");
  };
  const undoBulk = () => {
    if (!lastBulkExcluded) return;
    setExcluded((prev) => {
      const n = new Set(prev);
      for (const c of lastBulkExcluded) n.delete(c);
      return n;
    });
    toast.success(`${lastBulkExcluded.length} exclusão(ões) em massa desfeita(s).`);
    setLastBulkExcluded(null);
  };

  const applyBulk = (raw: string) => {
    const tokens = raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) { toast.error("Cole ao menos um código."); return; }
    if (!codigoCol) { toast.error("CODIGO AUXILIAR ausente."); return; }
    // Set of codes present in current filtered list
    const inFilter = new Set<string>();
    for (const r of filtered) {
      const c = String(r[codigoCol] ?? "").trim();
      if (c) inFilter.add(c);
    }
    const found: string[] = [];
    const notFound: string[] = [];
    const seen = new Set<string>();
    for (const t of tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (inFilter.has(t)) found.push(t);
      else notFound.push(t);
    }
    if (found.length === 0) {
      toast.error("Nenhum código encontrado na lista atual.");
      return;
    }
    setExcluded((prev) => {
      const n = new Set(prev);
      for (const c of found) n.add(c);
      return n;
    });
    setLastBulkExcluded(found);
    setBulkOpen(false);
    if (notFound.length === 0) {
      toast.success(`✔ ${found.length} códigos encontrados e removidos.`);
    } else {
      toast.success(`✔ ${found.length} removidos. ⚠ ${notFound.length} não encontrados.`);
      // show detail in a persistent toast
      toast.message("Códigos não encontrados", {
        description: notFound.slice(0, 20).join(", ") + (notFound.length > 20 ? "…" : ""),
        duration: 10000,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gerador de Promoções</h2>
        <p className="text-sm text-muted-foreground">
          Importe a Posição de Estoque, aplique filtros, refine manualmente e gere o CSV.
        </p>
      </div>

      {/* Step 1 — Import */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand">
          <Upload size={18} /> 1. Importar posição de estoque
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={parsing}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
          >
            <FileSpreadsheet size={18} /> {parsing ? "Lendo…" : "Escolher arquivo"}
          </button>
          {fileName && (
            <>
              <span className="text-sm">
                <b>{fileName}</b> — {rows.length.toLocaleString("pt-BR")} linhas
              </span>
              <button onClick={clearAll} className="text-sm text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
                <X size={14} /> Limpar
              </button>
            </>
          )}
        </div>
      </section>

      {rows.length > 0 && (
        <>
          {/* Stats */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Produtos importados" value={rows.length} />
              <Stat label="Após filtros" value={filtered.length} />
              <Stat label="Removidos manualmente" value={removedInFilterCount} tone={removedInFilterCount > 0 ? "warn" : "muted"} />
              <Stat label="Serão exportados" value={exportable.length} tone="brand" />
            </div>
          </section>

          {/* Step 2 — Filters */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand">
              <Filter size={18} /> 2. Filtros
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border p-3">
                <div className="mb-2 text-sm font-semibold">Ano (Data status/lançamento)</div>
                {availableYears.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Nenhum ano detectado na coluna de data.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableYears.map((y) => {
                      const active = years.has(y);
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            const next = new Set(years);
                            if (active) next.delete(y); else next.add(y);
                            setYears(next);
                          }}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                            active ? "border-brand bg-brand text-white" : "border-input bg-background hover:bg-muted"
                          }`}
                        >
                          {y}
                        </button>
                      );
                    })}
                    {years.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setYears(new Set())}
                        className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="mb-2 text-sm font-semibold">Saldo</div>
                <div className="flex gap-2">
                  <select
                    value={saldoOp}
                    onChange={(e) => setSaldoOp(e.target.value as SaldoOp)}
                    className="rounded-lg border border-input bg-background px-2 py-2 text-sm"
                  >
                    <option value=">">maior que</option>
                    <option value=">=">maior ou igual</option>
                    <option value="=">igual</option>
                    <option value="<=">menor ou igual</option>
                    <option value="<">menor que</option>
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={saldoVal}
                    onChange={(e) => setSaldoVal(e.target.value)}
                    placeholder="ex: 0"
                    className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Deixe em branco para ignorar.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {MULTI_FIELDS.map((f) => (
                <MultiSelect
                  key={f.key}
                  label={f.label}
                  values={distinct[f.key] ?? []}
                  selected={multi[f.key] ?? new Set()}
                  onToggle={(v) => toggleMulti(f.key, v)}
                  onClear={() => setMulti((p) => ({ ...p, [f.key]: new Set() }))}
                  disabled={!headerMap[f.key]}
                />
              ))}
            </div>
          </section>

          {/* Preview + manual exclusion */}
          <PreviewSection
            filtered={filtered}
            headerMap={headerMap}
            discount={parseInt(discount, 10) || 0}
            excluded={excluded}
            selected={selected}
            setSelected={setSelected}
            onExcludeCode={excludeCode}
            onRestoreCode={restoreCode}
            onExcludeSelected={excludeSelected}
            onRestoreAll={restoreAll}
            onOpenBulk={() => setBulkOpen(true)}
            onUndoBulk={undoBulk}
            canUndoBulk={!!lastBulkExcluded && lastBulkExcluded.length > 0}
            years={years}
            multi={multi}
            saldoOp={saldoOp}
            saldoVal={saldoVal}
            view={view}
            setView={setView}
            tableQ={tableQ}
            setTableQ={setTableQ}
            sortKey={sortKey}
            setSortKey={setSortKey}
            sortDir={sortDir}
            setSortDir={setSortDir}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
          />

          {/* Step 3 — Export */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand">
              <Download size={18} /> 3. Desconto e exportação
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm">
                <span className="text-muted-foreground">Desconto (%)</span>
                <input
                  type="number"
                  min={1} max={100}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-lg font-bold"
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="text-muted-foreground">Nome do arquivo</span>
                <input
                  type="text"
                  value={outName}
                  placeholder={suggestedName}
                  onChange={(e) => setOutName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 rounded-xl bg-muted p-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Serão exportados</div>
                  <div className="text-3xl font-black text-brand">{exportable.length.toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Desconto</div>
                  <div className="text-3xl font-black">{parseInt(discount, 10) || 0}%</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Arquivo</div>
                  <div className="mt-1 truncate text-sm font-semibold" title={finalName}>{finalName}</div>
                </div>
              </div>
            </div>

            <button
              onClick={generate}
              disabled={!exportable.length}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-base font-bold text-brand-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download size={18} /> Gerar CSV
            </button>
          </section>
        </>
      )}

      {/* History */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand">
          <History size={18} /> Histórico
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma promoção gerada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Data</th>
                  <th className="p-2">Arquivo</th>
                  <th className="p-2 text-right">Produtos</th>
                  <th className="p-2 text-right">%</th>
                  <th className="p-2">Filtros</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-border align-top">
                    <td className="p-2 whitespace-nowrap">{new Date(h.created_at).toLocaleString("pt-BR")}</td>
                    <td className="p-2 font-medium">{h.file_name}</td>
                    <td className="p-2 text-right">{Number(h.product_count).toLocaleString("pt-BR")}</td>
                    <td className="p-2 text-right">{h.discount}%</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {Object.entries(h.filters ?? {}).map(([k, v]) => (
                        <div key={k}><b>{k}:</b> {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}</div>
                      ))}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => downloadCsv(h.file_name, h.csv_content)}
                        className="mr-2 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        <Download size={14} /> Baixar
                      </button>
                      <button
                        onClick={() => removeHistory(h.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {bulkOpen && (
        <BulkExcludeModal
          onClose={() => setBulkOpen(false)}
          onApply={applyBulk}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "brand" | "warn" | "muted" }) {
  const cls =
    tone === "brand" ? "text-brand" :
    tone === "warn" ? "text-amber-600" :
    "text-foreground";
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-3xl font-black ${cls}`}>{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function BulkExcludeModal({ onClose, onApply }: { onClose: () => void; onApply: (raw: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xl font-bold">Excluir por lista de códigos</h3>
            <p className="text-sm text-muted-foreground">
              Cole os CODIGO AUXILIAR separados por quebra de linha, vírgula, ponto e vírgula ou espaço.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X size={20} /></button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          autoFocus
          placeholder={"001110891250918\n001110891250920\n001110891250921\n\nou 001110891250918;001110891250920;..."}
          className="w-full rounded-lg border border-input bg-background p-3 font-mono text-sm"
        />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            onClick={() => onApply(text)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-foreground hover:opacity-90"
          >
            <ListX size={16} /> Remover da promoção
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Multi-select ----------
function MultiSelect({
  label, values, selected, onToggle, onClear, disabled,
}: {
  label: string; values: string[]; selected: Set<string>;
  onToggle: (v: string) => void; onClear: () => void; disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => (q ? values.filter((v) => norm(v).includes(norm(q))) : values),
    [q, values]
  );

  return (
    <div className={`rounded-xl border border-border p-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{label}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {selected.size > 0 && (
            <button onClick={onClear} className="hover:text-destructive inline-flex items-center gap-0.5">
              <X size={12} /> limpar
            </button>
          )}
          <span>{selected.size}/{values.length}</span>
        </div>
      </div>
      {disabled ? (
        <p className="text-xs text-muted-foreground">Coluna não encontrada no arquivo.</p>
      ) : (
        <>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-lg border border-input bg-background pl-7 pr-2 py-1.5 text-xs"
            />
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground">Sem valores.</div>
            )}
            {filtered.map((v) => {
              const on = selected.has(v);
              return (
                <button
                  key={v}
                  onClick={() => onToggle(v)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
                    on ? "bg-brand/10 text-brand" : "hover:bg-muted"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "bg-brand border-brand text-brand-foreground" : "border-input"}`}>
                    {on && <Check size={12} />}
                  </span>
                  <span className="truncate">{v}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Preview ----------
function PreviewSection(props: {
  filtered: Row[];
  headerMap: Record<string, string>;
  discount: number;
  excluded: Set<string>;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onExcludeCode: (c: string) => void;
  onRestoreCode: (c: string) => void;
  onExcludeSelected: () => void;
  onRestoreAll: () => void;
  onOpenBulk: () => void;
  onUndoBulk: () => void;
  canUndoBulk: boolean;
  years: Set<string>;
  multi: Record<string, Set<string>>;
  saldoOp: SaldoOp;
  saldoVal: string;
  view: "produtos" | "codigos" | "csv";
  setView: (v: "produtos" | "codigos" | "csv") => void;
  tableQ: string;
  setTableQ: (v: string) => void;
  sortKey: string;
  setSortKey: (v: string) => void;
  sortDir: "asc" | "desc";
  setSortDir: (v: "asc" | "desc") => void;
  page: number;
  setPage: (v: number) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
}) {
  const {
    filtered, headerMap, discount, excluded, selected, setSelected,
    onExcludeCode, onRestoreCode, onExcludeSelected, onRestoreAll, onOpenBulk, onUndoBulk, canUndoBulk,
    years, multi, saldoOp, saldoVal,
    view, setView, tableQ, setTableQ, sortKey, setSortKey, sortDir, setSortDir,
    page, setPage, pageSize, setPageSize,
  } = props;

  const codigoCol = headerMap[FIELD_KEYS.CODIGO];

  const cols: Array<{ key: string; label: string; num?: boolean }> = [
    { key: FIELD_KEYS.CODIGO, label: "Código Auxiliar" },
    { key: FIELD_KEYS.DESCRICAO, label: "Descrição" },
    { key: FIELD_KEYS.LINHA, label: "Linha" },
    { key: FIELD_KEYS.TIPO, label: "Tipo" },
    { key: FIELD_KEYS.GENERO, label: "Gênero" },
    { key: FIELD_KEYS.DATA, label: "Data Status/Lanç." },
    { key: FIELD_KEYS.SALDO, label: "Saldo", num: true },
    { key: FIELD_KEYS.PRECO, label: "Preço Venda", num: true },
  ];
  const visibleCols = cols.filter((c) => headerMap[c.key]);

  const searched = useMemo(() => {
    if (!tableQ.trim()) return filtered;
    const q = norm(tableQ);
    return filtered.filter((r) =>
      visibleCols.some((c) => norm(String(r[headerMap[c.key]] ?? "")).includes(q))
    );
  }, [filtered, tableQ, headerMap, visibleCols]);

  const sorted = useMemo(() => {
    if (!sortKey) return searched;
    const col = headerMap[sortKey];
    if (!col) return searched;
    const isNum = cols.find((c) => c.key === sortKey)?.num;
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...searched];
    arr.sort((a, b) => {
      const va = String(a[col] ?? "");
      const vb = String(b[col] ?? "");
      if (isNum) {
        const na = parseNum(va) ?? -Infinity;
        const nb = parseNum(vb) ?? -Infinity;
        return (na - nb) * dir;
      }
      if (sortKey === FIELD_KEYS.DATA) {
        const da = parseBRDate(va)?.getTime() ?? 0;
        const db = parseBRDate(vb)?.getTime() ?? 0;
        return (da - db) * dir;
      }
      return va.localeCompare(vb, "pt-BR") * dir;
    });
    return arr;
  }, [searched, sortKey, sortDir, headerMap]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((curPage - 1) * pageSize, curPage * pageSize);

  useEffect(() => { setPage(1); }, [filtered.length, tableQ, sortKey, sortDir, pageSize]);

  // Codes and CSV only reflect exportable (not excluded)
  const exportableCodes = useMemo(() => {
    if (!codigoCol) return [] as string[];
    const out: string[] = [];
    for (const r of filtered) {
      const c = String(r[codigoCol] ?? "").trim();
      if (c && !excluded.has(c)) out.push(c);
    }
    return out;
  }, [filtered, codigoCol, excluded]);

  const csvPreviewLines = useMemo(() => {
    const d = String(discount || 0);
    return exportableCodes.slice(0, 50).map((c) => `${c};${d}`);
  }, [exportableCodes, discount]);

  const clickSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const chipList = (label: string, values: string[]) =>
    values.length ? (
      <div className="text-xs"><span className="text-muted-foreground">{label}:</span>{" "}
        <span className="font-medium">{values.join(", ")}</span>
      </div>
    ) : null;

  // Codes visible on current page (not excluded) — for select-all-on-page
  const pageSelectableCodes = useMemo(() => {
    if (!codigoCol) return [] as string[];
    const arr: string[] = [];
    for (const r of pageRows) {
      const c = String(r[codigoCol] ?? "").trim();
      if (c && !excluded.has(c)) arr.push(c);
    }
    return arr;
  }, [pageRows, codigoCol, excluded]);

  const allPageSelected = pageSelectableCodes.length > 0 && pageSelectableCodes.every((c) => selected.has(c));

  const toggleSelect = (code: string) => {
    const n = new Set(selected);
    if (n.has(code)) n.delete(code); else n.add(code);
    setSelected(n);
  };
  const toggleSelectPage = () => {
    const n = new Set(selected);
    if (allPageSelected) pageSelectableCodes.forEach((c) => n.delete(c));
    else pageSelectableCodes.forEach((c) => n.add(c));
    setSelected(n);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-brand">2.5 Conferência e exclusão manual</div>
        <div className="flex-1 min-w-[240px] space-y-0.5">
          {chipList("Anos", Array.from(years).sort())}
          {MULTI_FIELDS.map((f) => {
            const s = multi[f.key];
            return s && s.size ? <div key={f.key}>{chipList(f.label, Array.from(s))}</div> : null;
          })}
          {saldoVal.trim() !== "" && (
            <div className="text-xs">
              <span className="text-muted-foreground">Saldo:</span>{" "}
              <span className="font-medium">{saldoOp} {saldoVal}</span>
            </div>
          )}
          <div className="text-xs">
            <span className="text-muted-foreground">Desconto:</span>{" "}
            <span className="font-medium">{discount}%</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-2 border-b border-border">
        {([
          ["produtos", `Produtos (${filtered.length.toLocaleString("pt-BR")})`],
          ["codigos", `Códigos exportáveis (${exportableCodes.length.toLocaleString("pt-BR")})`],
          ["csv", "Prévia do CSV"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
              view === k ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {view === "produtos" && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" />
              <input
                value={tableQ}
                onChange={(e) => setTableQ(e.target.value)}
                placeholder="Pesquisar (código, descrição, etc.)…"
                className="w-full rounded-lg border border-input bg-background pl-7 pr-2 py-1.5 text-sm"
              />
            </div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
            >
              {[25, 50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>{n}/pág</option>
              ))}
            </select>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={onExcludeSelected}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-40"
            >
              <Trash2 size={14} /> Remover da promoção ({selected.size})
            </button>
            <button
              onClick={onOpenBulk}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              <ListX size={14} /> Excluir por lista de códigos
            </button>
            {canUndoBulk && (
              <button
                onClick={onUndoBulk}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                <Undo2 size={14} /> Desfazer exclusão em massa
              </button>
            )}
            <button
              onClick={onRestoreAll}
              disabled={excluded.size === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40"
            >
              <RotateCcw size={14} /> Restaurar Todos ({excluded.size})
            </button>
          </div>

          <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left uppercase">
                <tr>
                  <th className="p-2 w-8">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                      aria-label="Selecionar página"
                    />
                  </th>
                  <th className="p-2 w-8"></th>
                  {visibleCols.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => clickSort(c.key)}
                      className="cursor-pointer p-2 whitespace-nowrap select-none hover:bg-muted-foreground/10"
                    >
                      {c.label}
                      {sortKey === c.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </th>
                  ))}
                  <th className="p-2 w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr><td colSpan={visibleCols.length + 3} className="p-4 text-center text-muted-foreground">Nenhum produto.</td></tr>
                )}
                {pageRows.map((r, i) => {
                  const code = codigoCol ? String(r[codigoCol] ?? "").trim() : "";
                  const isExcluded = code && excluded.has(code);
                  const isSelected = code ? selected.has(code) : false;
                  return (
                    <tr
                      key={i}
                      className={`border-t border-border ${
                        isExcluded ? "bg-red-50 text-muted-foreground line-through" : "hover:bg-muted/40"
                      }`}
                    >
                      <td className="p-2">
                        {!isExcluded && code && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(code)}
                            aria-label={`Selecionar ${code}`}
                          />
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{(curPage - 1) * pageSize + i + 1}</td>
                      {visibleCols.map((c) => (
                        <td key={c.key} className={`p-2 ${c.num ? "text-right tabular-nums" : ""}`}>
                          {String(r[headerMap[c.key]] ?? "")}
                        </td>
                      ))}
                      <td className="p-2 no-underline">
                        {isExcluded ? (
                          <button
                            onClick={() => onRestoreCode(code)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground no-underline hover:bg-muted"
                          >
                            <RotateCcw size={11} /> Restaurar
                          </button>
                        ) : code ? (
                          <button
                            onClick={() => onExcludeCode(code)}
                            className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
                          >
                            <X size={11} /> Excluir
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="text-muted-foreground">
              Mostrando {pageRows.length ? ((curPage - 1) * pageSize + 1).toLocaleString("pt-BR") : 0}
              –{((curPage - 1) * pageSize + pageRows.length).toLocaleString("pt-BR")} de {sorted.length.toLocaleString("pt-BR")}
              {excluded.size > 0 && (
                <> · <span className="text-amber-600 font-semibold">{excluded.size.toLocaleString("pt-BR")} excluídos</span></>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={curPage <= 1} className="rounded border border-input px-2 py-1 disabled:opacity-40">«</button>
              <button onClick={() => setPage(curPage - 1)} disabled={curPage <= 1} className="rounded border border-input px-2 py-1 disabled:opacity-40">‹</button>
              <span className="px-2">Pág {curPage} / {totalPages}</span>
              <button onClick={() => setPage(curPage + 1)} disabled={curPage >= totalPages} className="rounded border border-input px-2 py-1 disabled:opacity-40">›</button>
              <button onClick={() => setPage(totalPages)} disabled={curPage >= totalPages} className="rounded border border-input px-2 py-1 disabled:opacity-40">»</button>
            </div>
          </div>
        </>
      )}

      {view === "codigos" && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Total de códigos que serão exportados: <b className="text-foreground">{exportableCodes.length.toLocaleString("pt-BR")}</b>
          </div>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
            {exportableCodes.length === 0 ? (
              <div className="text-muted-foreground">Nenhum código.</div>
            ) : (
              exportableCodes.map((c, i) => <div key={i}>{c}</div>)
            )}
          </div>
        </div>
      )}

      {view === "csv" && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Prévia do arquivo CSV — separador <code>;</code>, sem cabeçalho, UTF-8.
          </div>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
            {csvPreviewLines.length === 0 ? (
              <div className="text-muted-foreground">Nada para exportar.</div>
            ) : (
              <>
                {csvPreviewLines.map((l, i) => <div key={i}>{l}</div>)}
                {exportableCodes.length > csvPreviewLines.length && (
                  <div className="mt-2 text-muted-foreground">
                    … e mais {(exportableCodes.length - csvPreviewLines.length).toLocaleString("pt-BR")} registros
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
